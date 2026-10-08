import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { collectAssets, rewriteAssetLinks } from '../src/assets.js';
import { createExtensions } from '../src/plugin-api.js';
import { renderLayout } from '../src/theme.js';

const runtime = await readFile(new URL('../static/edgepress/webmcp.js', import.meta.url), 'utf8');
const fixture = '<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><title>工具測試</title></head><body><nav><a href="/guide/">Guide</a><a href="https://external.example/">External</a><a href="/secret/?token=private">Private</a></nav><main><h1>Preview</h1><p>Visible article</p><p hidden>Hidden secret</p><a href="/report.pdf" download>Download</a></main></body></html>';

test('native WebMCP is bundled and fingerprinted by the layout', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  const assets = await collectAssets(config);
  const html = rewriteAssetLinks(await renderLayout(config, await createExtensions(config), { title: 'Example', locale: 'en', urlPath: '/' }, '<h1>Example</h1>'), assets.urlMap);
  assert.match(html, /type="module" src="\/edgepress\/webmcp\.[a-f0-9]{16}\.js/);
  assert.doesNotMatch(html, /\.webmcp\/bridge\.js/);
});

test('native browser API registers and executes the page reader without a bridge', async testContext => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions', '--enable-experimental-web-platform-features'] });
  try {
    const page = await browser.newPage();
    await page.route('https://site.example/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await page.goto('https://site.example/');
    if (!await page.evaluate(() => typeof document.modelContext?.getTools === 'function')) {
      testContext.skip('The bundled browser does not expose the experimental native API');
      return;
    }
    await page.addScriptTag({ type: 'module', content: runtime });
    await page.waitForFunction(async () => (await document.modelContext.getTools()).some(tool => tool.name === 'edgepress_read_page'));
    const result = await page.evaluate(async argumentsValue => {
      const tool = (await document.modelContext.getTools()).find(item => item.name === 'edgepress_read_page');
      return document.modelContext.executeTool(tool, argumentsValue);
    }, Number(browser.version().split('.')[0]) >= 155 ? {} : '{}');
    assert.equal(JSON.parse(result).title, '工具測試');
    assert.equal(JSON.parse(result).documents.length, 0);
  } finally { await browser.close(); }
});

test('unsupported browsers and sandbox frames stay silent without requests or permission changes', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(fixture);
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.srcdoc = '<!doctype html><html><body>Isolated document</body></html>';
      document.body.append(frame);
    });
    await page.evaluate(() => Object.defineProperty(document, 'modelContext', { value: undefined }));
    await page.addScriptTag({ type: 'module', content: runtime });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-same-origin');
  } finally { await browser.close(); }
});

test('page-specific WebMCP tools preserve navigation bounds, document controls and consent gates', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    const page = await browser.newPage();
    await page.route('https://site.example/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await page.goto('https://site.example/');
    await page.evaluate(() => {
      window.tools = {};
      Object.defineProperty(document, 'modelContext', { value: { registerTool(tool, { signal }) {
        window.tools[tool.name] = tool;
        signal.addEventListener('abort', () => delete window.tools[tool.name]);
      } } });
    });
    await page.addScriptTag({ type: 'module', content: runtime });
    await page.waitForFunction(() => window.tools.edgepress_read_page);
    const snapshot = await page.evaluate(async () => JSON.parse(await window.tools.edgepress_read_page.execute({})));
    assert.equal(snapshot.language, 'zh-TW');
    assert.equal(snapshot.text.includes('Hidden secret'), false);
    assert.deepEqual(snapshot.links, [{ id: '1', title: 'Guide', url: 'https://site.example/guide/' }]);
    assert.equal(await page.evaluate(() => Boolean(window.tools.edgepress_control_document)), false);
    await page.evaluate(async () => {
      try { await window.tools.edgepress_open_page.execute({ link: 'https://external.example/' }); throw new Error('Allowed arbitrary URL'); }
      catch (error) { if (error.message !== 'Unknown page link') throw error; }
      document.querySelector('nav a').href = 'https://external.example/';
      try { await window.tools.edgepress_open_page.execute({ link: '1' }); throw new Error('Allowed changed URL'); }
      catch (error) { if (error.message !== 'Page link changed') throw error; }
    });
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    assert.equal(await page.evaluate(() => Object.keys(window.tools).length), 0);

    await page.goto('https://site.example/');
    await page.evaluate(() => {
      const block = document.createElement('figure');
      block.dataset.edgepressDocument = '';
      block.dataset.documentTitle = 'Shared document';
      block.dataset.documentFormat = 'pdf';
      block.innerHTML = '<div class="document-viewer-toolbar"><button>Open</button><button hidden>Close</button></div><div class="document-viewer-viewport" hidden></div>';
      window.clicks = 0;
      block.querySelector('button').addEventListener('click', () => window.clicks++);
      document.querySelector('main').append(block);
      window.tools = {};
      Object.defineProperty(document, 'modelContext', { value: { registerTool(tool) { window.tools[tool.name] = tool; } } });
    });
    await page.addScriptTag({ type: 'module', content: runtime });
    await page.waitForFunction(() => window.tools.edgepress_control_document);
    const requested = await page.evaluate(async () => JSON.parse(await window.tools.edgepress_control_document.execute({ document: '1', action: 'open' })));
    assert.equal(requested.state.open, false);
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await page.evaluate(() => window.clicks), 1);
    await page.evaluate(async () => {
      for (const action of ['close', 'next_page', 'worksheet', 'download', '__proto__']) {
        try { await window.tools.edgepress_control_document.execute({ document: '1', action }); throw new Error('Allowed unavailable control'); }
        catch (error) { if (error.message !== 'Document control is unavailable') throw error; }
      }
    });
  } finally { await browser.close(); }
});
