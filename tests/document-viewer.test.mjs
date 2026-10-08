import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { createExtensions } from '../src/plugin-api.js';
import { renderBlocks } from '../src/page-blocks.js';
import { renderMarkdown, plainText } from '../src/markdown.js';
import { parseDocument, renderDocument } from '../src/document.js';
import { collectAssets, rewriteAssetLinks } from '../src/assets.js';
import { renderLayout } from '../src/theme.js';
import { contentPermissions } from '../src/consent-csp.js';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

async function configuration() {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  return config;
}

test('articles and Pages share inline document previews, escaping, no download links and inert code examples', async () => {
  const config = await configuration();
  const renderer = (await createExtensions(config)).renderer('.md');
  const context = { config, locale: 'en' };
  const source = '!document[Annual report](/documents/report.docx)';
  const post = await renderer.render('Before\n' + source + '\nAfter', { config, document: { locale: 'en' } });
  const text = await renderBlocks([{ columns: 1, cells: [[{ type: 'text', text: source }]] }], context);
  const block = await renderBlocks([{ columns: 1, cells: [[{ type: 'document', title: 'Annual report', src: '/documents/report.docx' }]] }], context);
  for (const html of [post, text, block]) {
    assert.match(html, /data-edgepress-document/);
    assert.match(html, /data-document-format="docx"/);
    assert.doesNotMatch(html, /Download original|<a\b/);
    assert.match(html, /data-document-mount/);
    assert.doesNotMatch(html, /<iframe|<p>\s*<figure/);
  }
  for (const example of ['`' + source + '`', '```md\n' + source + '\n```', '\\' + source]) {
    assert.doesNotMatch(await renderer.render(example, { config, document: { locale: 'en' } }), /data-edgepress-document/);
  }
  assert.match(plainText(source), /Annual report/);
  assert.doesNotMatch(plainText(source), /!document|report\.docx/);
  assert.match(renderDocument({ title: '<script>title</script>', src: '/report.pdf' }, context), /&lt;script&gt;/);
  assert.throws(() => renderDocument({ title: 'Unsafe', src: 'javascript:alert(1)', format: 'pdf' }, context));
  assert.throws(() => renderDocument({ title: 'Invalid format', src: '/report.exe' }, context), /Unsupported/);
  assert.throws(() => renderDocument({ title: 'Unknown field', src: '/report.pdf', scripts: true }, context), /Unsupported document field/);
  assert.equal(parseDocument('!document[Shared](https://files.example/download/123){format=pdf service=documents}').format, 'pdf');
  assert.throws(() => parseDocument('!document[Title](/a.pdf){script=evil}'));
  assert.doesNotMatch(await renderMarkdown(source), /data-edgepress-document/);
});

test('remote direct-file URLs require a registered enabled consent service and cannot expand origin permissions', async () => {
  const config = await configuration();
  const context = { config, locale: 'en' };
  const block = { title: 'Shared', src: 'https://files.example/download/123', format: 'xlsx', service: 'documents' };
  assert.throws(() => renderDocument(block, context), /registered external-api/);
  config.browserPlugins.services = [{ id: 'documents', enabled: true, provider: 'external-api', backendUrl: 'https://files.example', purpose: 'Read shared documents' }];
  assert.match(renderDocument(block, context), /data-document-service="documents"/);
  assert.throws(() => renderDocument({ ...block, src: 'https://unapproved.example/report.xlsx' }, context), /registered service origin/);
  assert.throws(() => renderDocument({ ...block, previewSrc: 'https://unapproved.example/report.xlsx' }, context), /registered service origin/);
  config.browserPlugins.services[0].enabled = false;
  assert.doesNotMatch(renderDocument(block, context), /data-edgepress-document/);
  assert.deepEqual(contentPermissions([{ body: '<template><figure data-edgepress-document></figure></template>' }]), {});
  assert.deepEqual(contentPermissions([{ body: '<figure data-edgepress-document></figure>' }]), { 'script-src': ["'wasm-unsafe-eval'"], 'font-src': ['blob:'] });
});

test('document modules and Worker references are fingerprinted together, with no proprietary runtime', { timeout: 60000 }, async () => {
  const config = await configuration();
  const bundle = await collectAssets(config, { documentViewer: true });
  const paths = new Set(bundle.assets.map(asset => '/' + asset.path));
  for (const source of ['/edgepress/document-viewer/index.js', '/edgepress/document-viewer/pdf.worker.js', '/edgepress/document-viewer/ppt.worker.js', '/edgepress/document-viewer/styles.css']) {
    assert.match(bundle.urlMap[source], /\.[a-f0-9]{16}\.(?:js|css)$/);
    assert.ok(paths.has(bundle.urlMap[source]));
  }
  const scripts = bundle.assets.filter(asset => asset.content && asset.path.startsWith('edgepress/document-viewer/') && asset.path.endsWith('.js')).map(asset => asset.content.toString()).join('\n');
  assert.match(scripts, /new URL\(["']\.\.\/pdf\.worker\.[a-f0-9]{16}\.js/);
  assert.match(scripts, /new Worker\(new URL\(["']\.\.\/ppt\.worker\.[a-f0-9]{16}\.js/);
  assert.doesNotMatch(scripts, /vendor-ppt|ppt-native\.wasm|Flyfish Viewer/);
  const content = renderDocument({ title: 'PDF', src: '/report.pdf' }, { config, locale: 'en' });
  const html = rewriteAssetLinks(await renderLayout(config, { filter: async (_name, value) => value }, { title: 'PDF', locale: 'en', urlPath: '/documents/' }, content), bundle.urlMap);
  assert.match(html, /document-viewer\.[a-f0-9]{16}\.js/);
  assert.match(html, /styles\.[a-f0-9]{16}\.css/);
  assert.match(html, /edgepress-document-viewer-config/);
});

test('hashed EdgePress viewer previews shared URLs inline only after current consent', { timeout: 60000 }, async () => {
  const config = await configuration();
  config.site.url = 'https://site.example/';
  config.browserPlugins.services = [{ id: 'documents', enabled: true, provider: 'external-api', backendUrl: 'https://files.example',
    name: 'Shared documents', purpose: 'Read a selected shared document.', dataCategories: 'IP address and selected URL.',
    recipient: 'File owner', retention: 'No viewer storage', privacyUrl: 'https://files.example/privacy/' }];
  const bundle = await collectAssets(config, { documentViewer: true });
  const extensions = await createExtensions(config);
  const content = renderDocument({ title: 'Shared worksheet', src: 'https://files.example/download/123', format: 'xlsx', service: 'documents' }, { config, locale: 'en' });
  const html = rewriteAssetLinks(await renderLayout(config, extensions, { title: 'Shared document', locale: 'en', urlPath: '/documents/' }, content), bundle.urlMap);
  const assets = new Map(bundle.assets.map(asset => ['/' + asset.path, asset]));
  const require = createRequire(import.meta.url);
  const { utils, write } = createRequire(require.resolve('@jsw-teams/document-viewer'))('xlsx');
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Shared preview is inline']]), 'Shared');
  const bytes = write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 850 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.documentTools = {};
      Object.defineProperty(document, 'modelContext', { value: { registerTool(tool) { window.documentTools[tool.name] = tool; } } });
    });
    const errors = [];
    let loads = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', () => errors.push('Unexpected browser download'));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://files.example') {
        assert.equal(url.pathname, '/download/123');
        loads++;
        return route.fulfill({ contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': 'https://site.example', 'Content-Disposition': 'inline' }, body: bytes });
      }
      if (url.pathname === '/documents/') return route.fulfill({ contentType: 'text/html', body: html });
      const asset = assets.get(url.pathname);
      if (!asset) return route.fulfill({ status: 404, body: '' });
      const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      return route.fulfill({ contentType: types[extname(url.pathname)] || 'application/octet-stream', body: asset.content || await readFile(asset.source) });
    });
    await page.goto('https://site.example/documents/');
    await page.getByRole('button', { name: 'Preview document', exact: true }).waitFor();
    assert.equal(loads, 0);
    await page.evaluate(() => document.querySelector('.document-viewer button').click());
    assert.equal(loads, 0);
    assert.equal(await page.locator('iframe').count(), 0);
    await page.waitForFunction(() => window.documentTools.edgepress_control_document);
    await page.evaluate(() => window.documentTools.edgepress_control_document.execute({ document: '1', action: 'open' }));
    assert.equal(loads, 0);
    assert.equal(await page.locator('iframe').count(), 0);
    await page.evaluate(async choiceUrl => {
      const { makeChoice } = await import(choiceUrl);
      const settings = JSON.parse(document.getElementById('edgepress-privacy-config').textContent);
      localStorage.setItem('edgepress-privacy-selection', JSON.stringify(makeChoice(settings, ['documents'])));
      document.querySelector('[data-consent-ui]')?.remove();
      document.querySelector('.document-viewer button').click();
    }, bundle.urlMap['/edgepress/plugins/consent/choices.js']);
    await page.frameLocator('iframe').getByText('Shared preview is inline', { exact: true }).waitFor();
    assert.equal(loads, 1);
    await page.evaluate(() => { localStorage.removeItem('edgepress-privacy-selection'); dispatchEvent(new Event('storage')); });
    assert.equal(await page.locator('iframe').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});
