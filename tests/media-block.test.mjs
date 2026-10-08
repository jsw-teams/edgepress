import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { collectAssets, rewriteAssetLinks } from '../src/assets.js';
import { renderBlocks } from '../src/page-blocks.js';
import { renderMediaViewer } from '../src/media-viewer.js';
import { choiceSnapshot } from '../static/edgepress/plugins/consent/choices.js';

const block = { type: 'media-viewer', title: 'Local attachments', items: [
  { type: 'image', src: '/first.svg', originalSrc: '/original.svg', alt: 'First attachment' },
  { type: 'image', src: '/second.svg', alt: 'Second attachment' },
  { type: 'video', src: '/recording.mp4', label: 'Silent test recording', poster: '/poster.svg', silent: true, duration: 5 }
] };

async function configuration() {
  const config = await loadConfig(process.cwd());
  config.site.url = 'https://site.example';
  await loadLanguagePacks(config);
  return config;
}

test('Pages media blocks validate content, escape labels and keep every resource inert', async () => {
  const config = await configuration();
  const context = { config, locale: 'en' };
  const html = await renderBlocks([{ columns: 1, cells: [[block]] }], context);
  assert.match(html, /data-edgepress-media-viewer/);
  assert.equal((html.match(/<template>/g) || []).length, 3);
  assert.doesNotMatch(html, /<video[^>]*(?:\scontrols|\sautoplay|\ssrc=)/);
  assert.match(renderMediaViewer({ ...block, title: '<script>bad</script>' }, context), /&lt;script&gt;/);
  for (const item of [{ type: 'image', src: 'javascript:alert(1)', alt: 'Unsafe' }, { type: 'image', src: '/first.svg', alt: '' }, { type: 'video', src: '/recording.mp4', label: 'No captions' }]) assert.throws(() => renderMediaViewer({ ...block, items: [item] }, context));
  const remote = { ...block, service: 'media', items: [{ type: 'image', src: 'https://files.example/first.svg', alt: 'Consented image' }] };
  assert.throws(() => renderMediaViewer(remote, context), /registered external-api/);
  config.browserPlugins.services = [{ id: 'media', provider: 'external-api', backendUrl: 'https://files.example', enabled: true, purpose: 'Preview selected media', csp: { 'img-src': ['https://files.example'] } }];
  assert.match(renderMediaViewer(remote, context), /data-media-service="media"/);
  assert.throws(() => renderMediaViewer({ ...remote, items: [{ ...remote.items[0], originalSrc: 'https://unapproved.example/original.svg' }] }, context), /CSP origin/);
  config.browserPlugins.services[0].enabled = false;
  assert.doesNotMatch(renderMediaViewer(remote, context), /data-edgepress-media-viewer|<template>/);
});

test('media blocks reuse hashed local components, select only one attachment and wait for play and consent', { timeout: 60000 }, async () => {
  const config = await configuration();
  const bundle = await collectAssets(config, { mediaViewer: true });
  const assets = new Map(bundle.assets.map(asset => ['/' + asset.path, asset]));
  for (const name of ['media-viewer.js', 'media-gallery-lib.js', 'media-player-lib.js', 'media-player.css']) assert.match(bundle.urlMap['/edgepress/' + name], /\.[a-f0-9]{16}\.(?:js|css)$/);
  const remote = renderMediaViewer({ ...block, service: 'media', items: [{ type: 'image', src: 'https://files.example/remote.svg', alt: 'Consented image' }] }, { config: { ...config, browserPlugins: { services: [{ id: 'media', provider: 'external-api', backendUrl: 'https://files.example', purpose: 'Preview', csp: { 'img-src': ['https://files.example'] } }] } }, locale: 'en' });
  const settings = { privacy: { consent: { expiresDays: 30 }, integrations: [{ id: 'media', provider: 'external-api', backendUrl: 'https://files.example', enabled: true }] } };
  settings.choiceFingerprint = settings.choiceSnapshot = choiceSnapshot(settings.privacy);
  const html = rewriteAssetLinks('<!doctype html><html lang="en"><head><title>Media block</title><link rel="stylesheet" href="/edgepress/media-viewer.css"><link rel="stylesheet" href="/edgepress/image-viewer.css"></head><body><main>' + renderMediaViewer(block, { config, locale: 'en' }) + remote + '</main><script id="edgepress-privacy-config" type="application/json">' + JSON.stringify(settings) + '</script><script type="module" src="/edgepress/media-viewer.js"></script></body></html>', bundle.urlMap);
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const width of [320, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const requests = [];
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
        if (url.pathname.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="teal"/></svg>' });
        if (url.pathname === '/recording.mp4') return route.fulfill({ contentType: 'video/mp4', body: await readFile(new URL('./fixtures/recording.mp4', import.meta.url)) });
        const asset = assets.get(url.pathname);
        const types = { '.js': 'text/javascript', '.css': 'text/css' };
        return asset ? route.fulfill({ contentType: types[extname(url.pathname)] || 'application/octet-stream', body: asset.content || await readFile(asset.source) }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto('https://site.example/');
      const local = page.locator('[data-edgepress-media-viewer]').first();
      await local.locator('.gallery-stage').getByRole('button').waitFor();
      assert.ok(requests.includes('/first.svg'));
      assert.ok(!requests.includes('/second.svg') && !requests.includes('/original.svg') && !requests.includes('/remote.svg'));
      assert.ok(!requests.some(path => /media-player-lib|recording\.mp4/.test(path)));
      await local.locator('.gallery-stage').getByRole('button').click();
      await page.locator('.image-lightbox img').waitFor();
      assert.ok(requests.includes('/original.svg'));
      await page.keyboard.press('Escape');
      await local.locator('[data-next]').click();
      await local.locator('.gallery-stage img').waitFor();
      await local.locator('[data-next]').click();
      await local.locator('.plyr').waitFor();
      assert.ok(!requests.includes('/recording.mp4'));
      await local.locator('.plyr__control--overlaid').click();
      await page.waitForFunction(() => !!document.querySelector('video[src]'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(async choiceUrl => {
        const { makeChoice, persistChoice } = await import(choiceUrl);
        const settings = JSON.parse(document.getElementById('edgepress-privacy-config').textContent);
        persistChoice(makeChoice(settings, ['media']));
        document.dispatchEvent(new CustomEvent('edgepress:service-ready', { detail: { id: 'media' } }));
      }, bundle.urlMap['/edgepress/plugins/consent/choices.js']);
      await page.locator('[data-media-service] .gallery-stage img').waitFor();
      assert.ok(requests.includes('/remote.svg'));
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); dispatchEvent(new Event('storage')); });
      assert.equal(await page.locator('[data-media-service] .gallery-stage img').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
