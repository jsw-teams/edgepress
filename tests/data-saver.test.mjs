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
import { configureDataSaver, dataSaverHtml, dataSaverLayout } from '../src/data-saver.js';
import { chromium, firefox } from 'playwright';

test('data-saving variants are opt-in and require safe theme-owned assets', async () => {
  const config = await loadConfig(process.cwd());
  assert.equal(config.site.dataSaver.enabled, false);
  assert.match(dataSaverHtml('<html><head></head><body>Text</body></html>', config), /"enabled":false/);
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
    for (const setting of ['enabled: yes', 'debug: yes', 'mode: invalid', 'detectSlowConnection: 1', 'respectBrowserPreference: null', 'promptAfterMs: 99', 'promptAfterMs: 60001', 'promptAfterMs: 500.5', 'unknown: true']) {
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
  const chart = '<figure><img src="/chart.png" alt="Sales grew from 10 to 15 units in September; the increase is 50%."><figcaption>Chart context and original source.</figcaption></figure>';
  html = dataSaverHtml(rewriteAssetLinks(await renderLayout(config, extensions, { locale: 'en', title: 'Text', urlPath: '/' }, body + chart), assets.urlMap), config, assets.urlMap);
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const hints of [{ saveData: true, effectiveType: '4g' }]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      await context.addInitScript(hints => Object.defineProperty(navigator, 'connection', { get: () => hints }), hints);
      const page = await context.newPage();
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      await page.goto(origin);
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'text');
      assert.match(await page.locator('main').innerText(), /Keep this paragraph/);
      assert.match(await page.locator('main').innerText(), /First image/);
      assert.equal(await page.locator('[data-data-description]').filter({ hasText: 'First image' }).isVisible(), true);
      assert.match(await page.locator('main').innerText(), /Sales grew from 10 to 15 units/);
      assert.equal(await page.locator('figcaption').innerText(), 'Chart context and original source.');
      assert(!requests.some(url => /chart\.png/.test(url)));
      assert.doesNotMatch(await page.locator('body').innerText(), /<img|<source|<video/);
      assert.equal(await page.locator('.edgepress-data-controls').count(), 0);
      assert.equal(await page.locator('header button[data-data-mode]').count(), 0);
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
      await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Show the full page', exact: true }).click()]);
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'full');
      await page.waitForFunction(() => document.activeElement.tagName === 'MAIN');
      assert.equal(await page.locator('[data-data-return]').isVisible(), false);
      assert(requests.some(url => /\/style\./.test(url)));
      await context.close();
    }
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const page = await noScript.newPage();
    await page.goto(origin);
    assert.equal(await page.locator('main img').count(), 3);
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
      if (scenario.expected === 'full') await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
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
    await fallback.getByRole('button', { name: 'Show the full page', exact: true }).focus();
    await Promise.all([fallback.waitForNavigation(), fallback.keyboard.press('Enter')]);
    assert.equal(new URL(fallback.url()).searchParams.get('data-mode'), 'full');
    await fallback.waitForFunction(() => document.activeElement.tagName === 'MAIN');
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

test('full mode restores preloaded styles before revealing a stable keyboard-accessible page', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  config.site.dataSaver = { enabled: true, mode: 'full', detectSlowConnection: false, respectBrowserPreference: false };
  await configureDataSaver(config);
  const script = await readFile('static/edgepress/data-saver.js');
  const stylesheet = await readFile('static/edgepress/data-saver.css');
  const html = dataSaverHtml('<html lang="en"><head><link rel="preload" as="style" href="/full.css"><link rel="stylesheet" href="/full.css"></head><body><main><h1>Stable page</h1><p>Readable content</p></main></body></html>', config);
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/full.css') {
      setTimeout(() => response.writeHead(200, { 'Content-Type': 'text/css' }).end('main{padding:100px 20px}'), 150);
      return;
    }
    if (path.endsWith('.js')) response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(script);
    else if (path.endsWith('.css')) response.writeHead(200, { 'Content-Type': 'text/css' }).end(stylesheet);
    else response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.layoutShift = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.layoutShift += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?data-mode=full');
    await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
    assert.equal(await page.locator('main').evaluate(element => getComputedStyle(element).paddingTop), '100px');
    assert.equal(await page.locator('link[rel="stylesheet"][href="/full.css"]').count(), 1);
    await page.waitForTimeout(100);
    assert(await page.evaluate(() => window.layoutShift <= 0.01));
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
  assert.match(result, /文字省流版/);
  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /<template data-edgepress-data-html>&lt;img/);
  const unlabelled = dataSaverHtml('<html lang="en"><head></head><body><img src="/chart.png"><img src="/decoration.png" alt=""></body></html>', config);
  assert.equal((unlabelled.match(/data-data-decorative/g) || []).length, 1, 'Missing alt is not permission to discard information');
  for (const theme of ['default', 'folio']) {
    const stylesheet = await readFile('themes/' + theme + '/assets/data-saver-theme.css', 'utf8');
    assert(Buffer.byteLength(stylesheet) < 2048);
    assert.doesNotMatch(stylesheet, /@import|@font-face|url\(/);
  }
});
test('shared text layout retains themed landmarks and resolves local imports without font or media requests', async () => {
  const config = { site: { dataSaver: { enabled: true } }, dataSaverTheme: { layoutStyles: ['style.css'] } };
  const items = [
    { path: 'style.css', content: Buffer.from('@import "/edgepress/fonts.css";@import "parts/cards.css";@import "https://external.test/full.css";body{display:flex;flex-direction:column;color:var(--ink)}main{flex:1}nav{display:flex}footer{border-top:1px solid var(--line)}.hero{background:u\\72l("/hero.png");padding:2rem}') },
    { path: 'parts/cards.css', content: Buffer.from('@font-face{font-family:Heavy;src:url("/heavy.woff2")}.post-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.card{--cover:url("/cover.png");color:CanvasText}') }
  ];
  const result = await dataSaverLayout(config, items);
  assert.equal(result.path, 'edgepress/data-saver-layout.css');
  const css = result.content.toString();
  assert.match(css, /nav\{display:flex\}/);
  assert.match(css, /footer\{border-top/);
  assert.match(css, /grid-template-columns/);
  assert.doesNotMatch(css, /@import|@font-face|url\(|hero\.png|heavy\.woff2|external\.test/);
  await assert.rejects(dataSaverLayout(config, [{ path: 'style.css', content: Buffer.from('@import "style.css";') }]), /Circular/);
  await assert.rejects(dataSaverLayout(config, [{ path: 'style.css', content: Buffer.from('@import "missing.css";') }]), /Missing/);
  config.site.dataSaver.enabled = false;
  assert.equal(await dataSaverLayout(config, items), null);
});

test('only a delayed first screen offers text view, without an automatic switch or permanent selector', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  config.site.dataSaver = { enabled: true, mode: 'auto', detectSlowConnection: true, respectBrowserPreference: true, promptAfterMs: 300 };
  await configureDataSaver(config);
  const script = await readFile('static/edgepress/data-saver.js');
  const stylesheet = await readFile('static/edgepress/data-saver.css');
  const image = await readFile('content/assets/edgepress/favicon/favicon-16.png');
  let delay = 0;
  const html = dataSaverHtml('<html lang="en"><head><link rel="stylesheet" href="/full.css"></head><body><header><nav><a href="/second/">Second page</a></nav></header><main><h1>Separate page</h1><img src="/slow.png" width="200" height="100" alt="Delayed image"><a href="/third/">Third page</a></main><footer>Original footer</footer></body></html>', config);
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/slow.png') { setTimeout(() => response.writeHead(200, { 'Content-Type': 'image/png' }).end(image), delay); return; }
    const content = path.endsWith('.js') ? script : path === '/full.css' ? 'body{margin:0}header,footer{padding:1rem}main{padding:2rem}' : path.endsWith('.css') ? stylesheet : html;
    response.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html' }).end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    const fast = await browser.newPage();
    await fast.addInitScript(() => Object.defineProperty(navigator, 'connection', { get: () => ({ effectiveType: '2g', saveData: false }) }));
    await fast.goto(origin);
    await fast.waitForTimeout(650);
    assert.equal(await fast.getAttribute('html', 'data-edgepress-data-mode'), 'full');
    assert.equal(await fast.locator('[data-data-offer]').isVisible(), false);
    assert.equal(await fast.locator('[data-data-return]').isVisible(), false);
    delay = 1800;
    const slow = await browser.newPage();
    await slow.goto(origin, { waitUntil: 'domcontentloaded' });
    const offer = slow.locator('[data-data-offer]');
    await offer.waitFor({ state: 'visible' });
    assert.equal(await slow.getAttribute('html', 'data-edgepress-data-mode'), 'full');
    assert.equal(await slow.locator('header').count(), 1);
    assert.equal(await slow.locator('footer').count(), 1);
    await offer.getByRole('button', { name: 'Keep waiting' }).focus();
    await slow.keyboard.press('Escape');
    assert.equal(await offer.isVisible(), false);
    assert.equal(await slow.evaluate(() => document.activeElement.tagName), 'MAIN');
    const choose = await browser.newPage();
    await choose.goto(origin, { waitUntil: 'domcontentloaded' });
    await choose.getByRole('button', { name: 'Use text view', exact: true }).waitFor();
    await choose.getByRole('button', { name: 'Use text view', exact: true }).focus();
    await Promise.all([choose.waitForNavigation(), choose.keyboard.press('Enter')]);
    assert.equal(await choose.getAttribute('html', 'data-edgepress-data-mode'), 'text');
    await choose.waitForFunction(() => document.activeElement.tagName === 'MAIN');
    assert.equal(await choose.locator('header nav a').textContent(), 'Second page');
    assert.equal(await choose.locator('footer').textContent(), 'Original footer');
    assert.doesNotMatch(await choose.locator('body').innerText(), /<img/);
    const disabled = await browser.newPage();
    await disabled.route('**/edgepress/data-saver.js', route => route.fulfill({ contentType: 'text/javascript', body: script }));
    await disabled.route(origin + '/', route => route.fulfill({ contentType: 'text/html', body: html.replace('"detectSlowConnection":true', '"detectSlowConnection":false') }));
    await disabled.goto(origin, { waitUntil: 'domcontentloaded' });
    await disabled.waitForTimeout(500);
    assert.equal(await disabled.locator('[data-data-offer]').isVisible(), false);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
