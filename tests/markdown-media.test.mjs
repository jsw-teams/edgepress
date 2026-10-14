import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { chromium } from 'playwright';
import { renderMarkdown, renderMarkdownExcerpt, plainText, hasMarkdownVideo } from '../src/markdown.js';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { collectAssets, rewriteAssetLinks } from '../src/assets.js';
import { renderLayout } from '../src/theme.js';
import { configureDataSaver, dataSaverHtml } from '../src/data-saver.js';

test('CJK bold with closing punctuation renders beside following prose without rewriting code or URLs', async () => {
  for (const source of ['前文**结果（XXX）**后文', '**（XXX）**后文', '前文**（XXX）** 后文', '前文**result (XXX)**后文', '前文**说明。**后文']) {
    assert.match(await renderMarkdown(source), /<strong>/);
    assert.doesNotMatch(plainText(source), /\*\*/);
    assert.match(await renderMarkdownExcerpt(source), /<strong>/);
  }
  assert.match(await renderMarkdown('**外层 *内部*（测试）**后文'), /<strong>外层 <em>内部<\/em>（测试）<\/strong>后文/);
  assert.match(await renderMarkdown('`**（XXX）**`'), /<code>\*\*（XXX）\*\*<\/code>/);
  assert.doesNotMatch(await renderMarkdown('\\**（XXX）**'), /<strong>/);
  assert.match(await renderMarkdown('a**punctuation!**b'), /a\*\*punctuation!\*\*b/);
  assert.doesNotMatch(await renderMarkdown('**（XXX） **后文'), /<strong>/);
  assert.match(decodeURIComponent(await renderMarkdown('[link](https://example.com/**（XXX）**)')), /href="https:\/\/example.com\/\*\*（XXX）\*\*"/);
});

test('Markdown videos request the shared engine, including reference links, while code examples remain inert', async () => {
  assert.equal(hasMarkdownVideo('![Recording](/recording.mp4)'), true);
  assert.equal(hasMarkdownVideo('![Recording][clip]\n\n[clip]: /recording.mp4'), true);
  assert.equal(hasMarkdownVideo('`![Recording](/recording.mp4)`'), false);
  assert.equal(hasMarkdownVideo('```md\n![Recording](/recording.mp4)\n```'), false);
  const html = await renderMarkdown('![Recording](/recording.mp4 "A caption")');
  assert.match(html, /data-edgepress-video/);
  assert.match(html, /preload="none"/);
  await assert.rejects(renderMarkdown('![Unsafe](javascript:bad.mp4)'), /safe relative/);
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  const layout = await renderLayout(config, { filter: async (_key, value) => value }, { title: 'Recording', locale: 'en', urlPath: '/recording/' }, '<main>' + html + '</main>');
  assert.match(layout, /src="\/edgepress\/media-viewer.js"/);
  const bundle = await collectAssets(config, { mediaViewer: hasMarkdownVideo('![Recording](/recording.mp4)') });
  assert.match(bundle.urlMap['/edgepress/media-player-lib.js'], /\.[a-f0-9]{16}\.js$/);
  config.site.dataSaver.enabled = true;
  await configureDataSaver(config);
  const gated = dataSaverHtml(rewriteAssetLinks(layout, bundle.urlMap), config, bundle.urlMap);
  assert.match(gated, /data-edgepress-data-media data-data-feature="gallery"/);
  assert.match(gated, /data-data-feature="gallery"[^>]*>.*?media-viewer\.[a-f0-9]{16}\.js/s);
  assert.match(gated, /data-data-description>Recording/);
});

test('inline local files use the shared player, wait for Play, seek, pause out of view and mount after text-view demand', { timeout: 60000 }, async () => {
  const config = await loadConfig(process.cwd());
  config.site.url = 'https://site.example';
  await loadLanguagePacks(config);
  const bundle = await collectAssets(config, { mediaViewer: true });
  const assets = new Map(bundle.assets.map(asset => ['/' + asset.path, asset]));
  const bytes = await readFile(new URL('./fixtures/recording.mp4', import.meta.url));
  const body = await renderMarkdown('前文**结果（XXX）**后文\n\n![Silent recording](/recording.mp4 "Recording")');
  const script = '<script type="module" src="/edgepress/media-viewer.js"></script>';
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const width of [320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      const page = await context.newPage();
      const requests = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const html = rewriteAssetLinks('<!doctype html><html lang="en"><head><style>body{margin:0}figure{margin:0}video{width:100%}</style><link rel="stylesheet" href="/edgepress/media-viewer.css"></head><body><main>' + body + '<div style="height:1600px"></div></main>' + script + '</body></html>', bundle.urlMap);
      await page.route('https://site.example/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        requests.push(path);
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
        if (path === '/recording.mp4') {
          const range = request.headers().range?.match(/bytes=(\d+)-(\d*)/);
          const start = range ? Number(range[1]) : 0;
          const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
          return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) }, body: bytes.subarray(start, end + 1) });
        }
        const asset = assets.get(path);
        return asset ? route.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream', body: asset.content || await readFile(asset.source) }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto('https://site.example/');
      const player = page.locator('.markdown-video .media-player');
      await player.waitFor();
      assert.equal(requests.includes('/recording.mp4'), false);
      await player.locator('video').evaluate(video => { video.muted = true; });
      await player.locator('.plyr__control--overlaid').click();
      await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
      const video = player.locator('video');
      const duration = await video.evaluate(video => video.duration);
      await video.evaluate(video => { video.pause(); });
      await player.locator('input[data-plyr="seek"]').evaluate(input => { input.value = '50'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForFunction(duration => Math.abs(document.querySelector('video').currentTime - duration / 2) < 0.3, duration);
      await player.locator('[data-plyr="play"]').last().click();
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForFunction(() => document.querySelector('video').paused);
      assert.ok(await video.evaluate(video => video.currentTime > 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await context.close();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('https://site.example/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: rewriteAssetLinks('<html><head></head><body><main><div id="target"></div></main>' + script + '</body></html>', bundle.urlMap) });
      const asset = assets.get(path);
      return asset ? route.fulfill({ contentType: extname(path) === '.css' ? 'text/css' : 'text/javascript', body: asset.content || await readFile(asset.source) }) : route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://site.example/');
    assert.equal(await page.locator('.media-player').count(), 0);
    await page.evaluate(body => { document.getElementById('target').innerHTML = body; document.dispatchEvent(new Event('edgepress:data-media')); }, body);
    await page.locator('.media-player').waitFor();
    await context.close();
  } finally { await browser.close(); }
});
