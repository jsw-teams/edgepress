import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {collectAssets, writeAssets, rewriteAssetLinks} from '../src/assets.js';
import {renderLayout} from '../src/theme.js';

const root = fileURLToPath(new URL('../', import.meta.url));
test('mutable fonts and font metadata never receive a directory-wide immutable policy', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'edgepress-font-cache-'));
  try {
    await writeAssets({existingHeaders: '', assets: ['fonts/regular.0123456789abcdef.woff2', 'fonts/bold.abcdef0123456789.woff2', 'fonts/custom.woff2', 'fonts/provenance.json'].map(path => ({path, content: Buffer.from('fixture')}))}, temporary);
    const headers = await readFile(resolve(temporary, '_headers'), 'utf8');
    assert.doesNotMatch(headers, /\/fonts\/\*/);
    assert.doesNotMatch(headers, /\/(?:fonts\/custom\.woff2|fonts\/provenance\.json)\n\s+Cache-Control:/);
    assert.match(headers, /\/fonts\/regular\.0123456789abcdef\.woff2\n\s+Cache-Control: public, max-age=31536000, immutable/);
  } finally { await rm(temporary, {recursive: true, force: true}); }
});
test('bundled fonts retain provenance, integrity and immutable CSS dependency graphs', async () => {
  const config = await loadConfig(root), bundle = await collectAssets(config);
  const faces = bundle.assets.find(asset => '/' + asset.path === bundle.urlMap['/edgepress/fonts/faces.css']);
  const css = bundle.assets.find(asset => '/' + asset.path === bundle.urlMap['/edgepress/fonts.css']).content.toString();
  assert.match(css, /fonts\/faces\.[a-f0-9]{16}\.css/);
  assert.match(faces.content.toString(), /unicode-range:/);
  assert.doesNotMatch(css + faces.content.toString(), /https?:|local\(/);
  const provenance = JSON.parse(await readFile(resolve(root, 'static/edgepress/fonts/provenance.json')));
  for (const family of provenance) {
    assert.equal(family.metadata.license.type, 'OFL-1.1');
    assert.match(await readFile(resolve(root, 'static/edgepress/fonts', family.license), 'utf8'), /SIL Open Font License/);
    for (const asset of family.files) {
      const bytes = await readFile(resolve(root, 'static/edgepress/fonts', asset.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      assert.ok(asset.file.includes('.' + asset.sha256.slice(0, 16) + '.woff2'));
      assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    }
  }
  const temporary = await mkdtemp(resolve(tmpdir(), 'edgepress-font-headers-'));
  try {
    await writeAssets(bundle, temporary);
    const headers = await readFile(resolve(temporary, '_headers'), 'utf8');
    assert.ok(headers.includes('/edgepress/fonts/*.woff2\n  Cache-Control: public, max-age=31536000, immutable'));
    assert.ok(headers.split('\n').filter(line => line && !/^\s/.test(line)).length <= 100);
  } finally { await rm(temporary, {recursive: true, force: true}); }
});

test('English, simplified and traditional text use downloaded fonts without OS glyphs', async () => {
  const config = await loadConfig(root); await loadLanguagePacks(config);
  config.i18n.locales = ['en']; // Isolate Latin loading from the Chinese language menu label.
  config.site.title = config.site.header.brandLabel = 'Font fixture';
  config.site.footer = 'Local fonts';
  config.site.navigation = []; config.site.footerNavigation = [];
  const bundle = await collectAssets(config), assets = new Map(bundle.assets.map(asset => ['/' + asset.path, asset]));
  const body = '<div class="post-content"><p id="sample">EdgePress café Ελληνικά Привет</p><p id="serif" style="font-family:var(--edgepress-font-serif)">Readable stories</p><p id="notice" class="image-lightbox-status">Unavailable</p></div>';
  const html = rewriteAssetLinks(await renderLayout(config, {filter: async (_name, value) => value}, {title: 'Font coverage', locale: 'en'}, body), bundle.urlMap);
  const browser = await chromium.launch({headless: true, ...(process.platform === 'win32' ? {channel: 'msedge'} : {})});
  try {
    const context = await browser.newContext(), page = await context.newPage(), requested = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); assert.equal(url.origin, 'https://fonts.example');
      if (url.pathname === '/') return route.fulfill({contentType: 'text/html', body: html});
      const asset = assets.get(url.pathname);
      if (!asset) return route.fulfill({status: 404, body: ''});
      if (url.pathname.endsWith('.woff2')) requested.push(url.pathname);
      return route.fulfill({contentType: {'.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'}[extname(url.pathname)] || 'application/octet-stream', body: asset.content || await readFile(asset.source)});
    });
    await page.goto('https://fonts.example/');
    await page.evaluate(() => document.fonts.ready);
    const client = await context.newCDPSession(page); await client.send('DOM.enable'); await client.send('CSS.enable');
    async function renderedFonts(selector) {
      const {root: document} = await client.send('DOM.getDocument');
      const {nodeId} = await client.send('DOM.querySelector', {nodeId: document.nodeId, selector});
      const {fonts} = await client.send('CSS.getPlatformFontsForNode', {nodeId});
      assert.ok(fonts.length, 'No rendered glyphs: ' + selector);
      assert.ok(fonts.every(font => font.isCustomFont), 'Used OS font: ' + JSON.stringify(fonts));
      return fonts;
    }
    await renderedFonts('#sample'); await renderedFonts('#serif'); await renderedFonts('#notice');
    assert.ok(!requested.some(path => /noto-sans-(?:sc|tc)-/.test(path)), 'English page downloaded CJK fonts');
    for (const [lang, text, family] of [['zh-CN', '写文建站海边的下午你好世界龘', 'Noto Sans SC'], ['zh-TW', '寫文建站多媒體檢視器讓分享更簡單臺灣', 'Noto Sans TC']]) {
      await page.evaluate(({lang, text}) => {
        document.documentElement.lang = lang;
        document.querySelector('#sample').textContent = text;
        document.querySelector('#serif').textContent = text;
        document.querySelector('#notice').textContent = text;
        document.querySelector('#sample').style.fontFamily = 'var(--edgepress-font-sans)';
      }, {lang, text});
      await page.evaluate(() => document.fonts.ready);
      for (const selector of ['#sample', '#serif', '#notice']) assert.ok((await renderedFonts(selector)).some(font => font.familyName.startsWith(family)));
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
