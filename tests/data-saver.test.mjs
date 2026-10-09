import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { createExtensions } from '../src/plugin-api.js';
import { collectAssets, rewriteAssetLinks } from '../src/assets.js';
import { renderLayout } from '../src/theme.js';
import { configureDataSaver, dataSaverHtml } from '../src/data-saver.js';
import { chromium, firefox } from 'playwright';

test('data-saving variants are opt-in and require safe theme-owned assets', async () => {
  const config = await loadConfig(process.cwd());
  assert.equal(config.site.dataSaver.enabled, false);
  assert.equal(dataSaverHtml('<html><head></head><body>Text</body></html>', config), '<html><head></head><body>Text</body></html>');
  config.site.dataSaver.enabled = true;
  await configureDataSaver(config);
  assert.equal(config.dataSaverTheme.stylesheet, 'data-saver-theme.css');
  assert.deepEqual(config.dataSaverTheme.scripts, []);
  const directory = await mkdtemp(resolve(tmpdir(), 'edgepress-data-'));
  try {
    await mkdir(resolve(directory, 'assets'));
    config.resolvedPaths.theme = directory;
    for (const variant of [undefined, { stylesheet: '../outside.css', scripts: [] }, { stylesheet: 'light.css', scripts: ['https://outside.test/app.js'] }, { stylesheet: 'light.css', scripts: [], unknown: true }]) {
      await writeFile(resolve(directory, 'theme.json'), JSON.stringify({ dataSaver: variant }));
      await assert.rejects(configureDataSaver(config));
    }
    for (const setting of ['enabled: yes', 'mode: invalid', 'detectSlowConnection: 1', 'respectBrowserPreference: null', 'unknown: true']) {
      await writeFile(resolve(directory, 'config.yml'), 'site:\n  dataSaver:\n    ' + setting + '\n');
      await assert.rejects(loadConfig(directory), /site.dataSaver/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('text mode defers actual requests, preserves external prompts and loads only requested pictures', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  config.site.dataSaver = { enabled: true, mode: 'auto', detectSlowConnection: true, respectBrowserPreference: true };
  config.site.externalLinks = { enabled: true, trustedOrigins: [] };
  await configureDataSaver(config);
  const extensions = await createExtensions(config);
  const assets = await collectAssets(config, { documentViewer: true });
  const files = new Map(assets.assets.map(item => ['/' + item.path, item.content]));
  let html;
  const image = await readFile('content/assets/edgepress/favicon/favicon-16.png');
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.png') ? 'image/png' : 'text/html';
    const content = path === '/' ? html : path.endsWith('.png') ? image : files.get(path);
    response.writeHead(content ? 200 : 404, { 'Content-Type': type }).end(content || '');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  config.site.url = origin;
  const body = '<section class="post-content"><h1>Readable text</h1><p>Keep this paragraph.</p><a href="https://news.example.test/story">Outside</a><picture><source srcset="/one.png 1x"><img src="/one.png" alt="First image" width="1" height="1"></picture><img src="/two.png" alt="Second image"><video src="/large.mp4" poster="/poster.png" preload="auto"></video><section data-edgepress-document data-document-src="/large.pdf" data-document-title="Document"><div data-document-mount></div></section></section>';
  html = dataSaverHtml(rewriteAssetLinks(await renderLayout(config, extensions, { locale: 'en', title: 'Text', urlPath: '/' }, body), assets.urlMap), config, assets.urlMap);
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const hints of [{ saveData: true, effectiveType: '4g' }, { saveData: false, effectiveType: '2g' }]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      await context.addInitScript(hints => Object.defineProperty(navigator, 'connection', { get: () => hints }), hints);
      const page = await context.newPage();
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      await page.goto(origin);
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'text');
      assert.match(await page.locator('main').innerText(), /Keep this paragraph/);
      assert(!requests.some(url => /one\.png|two\.png|poster\.png|large\.(?:pdf|mp4)|woff|\/style\.|document-viewer.*\.js|image-viewer.*\.js/.test(url)));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (await page.locator('.privacy-close').isVisible()) await page.locator('.privacy-close').click();
      await page.getByText('Outside', { exact: true }).click();
      assert.equal(await page.locator('.edgepress-external-url').textContent(), 'https://news.example.test/story');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Outside');
      await page.getByRole('button', { name: 'Load this media: First image', exact: true }).click();
      await page.locator('main img[src="/one.png"]').evaluate(element => element.decode());
      assert(requests.some(url => url.endsWith('/one.png')));
      assert(!requests.some(url => /two\.png|poster\.png|large\.(?:pdf|mp4)|woff|\/style\.|document-viewer.*\.js/.test(url)));
      await page.getByRole('button', { name: 'Load this media: Second image', exact: true }).click();
      await page.locator('main img[src="/two.png"]').evaluate(element => element.decode());
      assert(!requests.some(url => /large\.(?:pdf|mp4)|woff|\/style\./.test(url)));
      await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Full view', exact: true }).click()]);
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'full');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Full view');
      assert(requests.some(url => /\/style\./.test(url)));
      await context.close();
    }
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const page = await noScript.newPage();
    await page.goto(origin);
    assert.equal(await page.locator('main img').count(), 2);
    assert.equal(await page.locator('main a').getAttribute('href'), 'https://news.example.test/story');
    await noScript.close();
    const initial = html;
    for (const scenario of [
      { browserPreference: false, slow: true, hints: { saveData: true, effectiveType: '4g' }, expected: 'full' },
      { browserPreference: true, slow: false, hints: { saveData: false, effectiveType: '2g' }, expected: 'full' },
      { browserPreference: false, slow: false, hints: { saveData: true, effectiveType: '2g' }, expected: 'full' },
      { browserPreference: true, slow: true, hints: null, expected: 'full' },
      { browserPreference: true, slow: true, hints: { saveData: true, effectiveType: '2g' }, stored: 'full', expected: 'full' },
      { browserPreference: false, slow: false, hints: null, stored: 'text', expected: 'text' }
    ]) {
      html = initial.replace('"detectSlowConnection":true', '"detectSlowConnection":' + scenario.slow).replace('"respectBrowserPreference":true', '"respectBrowserPreference":' + scenario.browserPreference);
      const context = await browser.newContext();
      await context.addInitScript(scenario => {
        Object.defineProperty(navigator, 'connection', { get: () => scenario.hints });
        if (scenario.stored) localStorage.setItem('edgepress-data-mode', scenario.stored);
      }, scenario);
      const page = await context.newPage();
      await page.goto(origin);
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), scenario.expected);
      await context.close();
    }
    html = initial;
    const blocked = await browser.newContext({ forcedColors: 'active' });
    await blocked.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    const fallback = await blocked.newPage();
    await fallback.goto(origin + '/?data-mode=text');
    assert.equal(await fallback.getAttribute('html', 'data-edgepress-data-mode'), 'text');
    await fallback.getByRole('button', { name: 'Full view', exact: true }).focus();
    await Promise.all([fallback.waitForNavigation(), fallback.keyboard.press('Enter')]);
    assert.equal(new URL(fallback.url()).searchParams.get('data-mode'), 'full');
    assert.equal(await fallback.evaluate(() => document.activeElement.textContent), 'Full view');
    await blocked.close();
    const alternate = await firefox.launch({ headless: true });
    try {
      const page = await alternate.newPage();
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      await page.goto(origin + '/?data-mode=text');
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'text');
      assert(!requests.some(url => /one\.png|two\.png|poster\.png|large\.(?:pdf|mp4)|woff|\/style\./.test(url)), JSON.stringify(requests));
      await page.getByRole('button', { name: 'Load this media: Second image', exact: true }).click();
      await page.locator('main img[src="/two.png"]').evaluate(element => element.decode());
    } finally { await alternate.close(); }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('theme variants stay small and translated text is escaped without activating inline media', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  config.site.dataSaver.enabled = true;
  await configureDataSaver(config);
  const result = dataSaverHtml('<html lang="zh-CN"><head></head><body><p>正文</p><img src="/picture.png" alt="&lt;script&gt;"></body></html>', config);
  assert.match(result, /仅文字/);
  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /<template data-edgepress-data-html>&lt;img/);
  for (const theme of ['default', 'folio']) {
    const stylesheet = await readFile('themes/' + theme + '/assets/data-saver-theme.css', 'utf8');
    assert(Buffer.byteLength(stylesheet) < 2048);
    assert.doesNotMatch(stylesheet, /@import|@font-face|url\(/);
  }
});
