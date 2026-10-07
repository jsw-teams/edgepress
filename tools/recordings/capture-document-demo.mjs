import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { recordingContext, record, closeRecording, preparePage } from './desktop-recording.mjs';
import { pointAt } from './vm-desktop.mjs';

const workspace = resolve(import.meta.dirname, '../../..');
const site = resolve(workspace, 'web/js.gripe');
const fixtureRoot = resolve(process.env.DOCUMENT_VIEWER_ROOT || resolve(workspace, 'document-viewer'));
const { pdfFixture, wordFixture, legacyPpt, slidesFixture } = await import(pathToFileURL(resolve(fixtureRoot, 'tests/fixtures.mjs')));
const require = createRequire(resolve(site, 'package.json'));
const engine = createRequire(require.resolve('edgepress/package.json'));
const { loadConfig } = await import(pathToFileURL(engine.resolve('edgepress/src/config.js')));
const { loadLanguagePacks } = await import(pathToFileURL(engine.resolve('edgepress/src/i18n.js')));
const { collectAssets, rewriteAssetLinks } = await import(pathToFileURL(engine.resolve('edgepress/src/assets.js')));
const { createExtensions } = await import(pathToFileURL(engine.resolve('edgepress/src/plugin-api.js')));
const { renderBlocks } = await import(pathToFileURL(engine.resolve('edgepress/src/page-blocks.js')));
const { renderLayout } = await import(pathToFileURL(engine.resolve('edgepress/src/theme.js')));
const { utils, write } = createRequire(engine.resolve('@jsw-teams/document-viewer'))('xlsx');
const workbook = utils.book_new();
utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Quarter', 'Revenue', 'Costs'], ['Q1', 120000, 75000], ['Q2', 145000, 82000], ['Q3', 159000, 91000]]), 'Summary');
utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Team', 'People'], ['Editorial', 4], ['Engineering', 6]]), 'Details');
const files = new Map([['report.docx', await wordFixture()], ['report.pdf', pdfFixture()], ['report.ppt', legacyPpt()], ['report.pptx', await slidesFixture()], ['report.xlsx', write(workbook, { type: 'buffer', bookType: 'xlsx' })]]);
const documents = resolve(site, 'content/assets/documents/doc-views');
await mkdir(documents, { recursive: true });
for (const [name, bytes] of files) await writeFile(resolve(documents, name), bytes);
const config = await loadConfig(site);
await loadLanguagePacks(config);
const bundle = await collectAssets(config, { documentViewer: true });
const extensions = await createExtensions(config);
const assets = new Map(bundle.assets.map(asset => ['/' + asset.path, asset]));
const artifact = resolve(workspace, 'edgepress/tools/.recordings');
const output = resolve(site, 'content/assets/images/previews');
await mkdir(output, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const entries = [];
try {
  for (const locale of ['en', 'zh-SG', 'zh-TW']) {
    const rows = [...files.keys()].map(name => ({ columns: 1, cells: [[{ type: 'document', title: name, src: '/documents/doc-views/' + name }]] }));
    const body = '<h1>doc-views</h1>' + await renderBlocks(rows, { config, locale });
    const html = rewriteAssetLinks(await renderLayout(config, extensions, { title: 'doc-views', locale, urlPath: '/document-demo/' }, body), bundle.urlMap);
    const context = await recordingContext(browser, { locale }, artifact);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', () => errors.push('Unexpected download'));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, new URL(config.site.url).origin);
      if (url.pathname === '/document-demo/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname.startsWith('/documents/doc-views/')) return route.fulfill({ contentType: 'application/octet-stream', body: files.get(url.pathname.split('/').pop()) });
      const asset = assets.get(url.pathname);
      if (!asset) return route.fulfill({ status: 404, body: '' });
      const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
      return route.fulfill({ contentType: types[extname(url.pathname)] || 'application/octet-stream', body: asset.content || await readFile(asset.source) });
    });
    await preparePage(page);
    await page.goto(config.site.url + '/document-demo/');
    await page.locator('.privacy-reject').click();
    const first = page.locator('.document-block').first();
    await first.locator('.document-viewer button').first().click();
    await first.frameLocator('iframe').getByText('Word preview 中文', { exact: true }).waitFor();
    await first.scrollIntoViewIfNeeded();
    await record(page, 'doc-views-' + locale.toLowerCase(), async () => {
      await pause(2500);
      await pointAt(page, first.locator('.document-viewer button').nth(1));
      await first.locator('.document-viewer button').nth(1).click();
      for (const index of [1, 2, 3, 4]) {
        const block = page.locator('.document-block').nth(index);
        const preview = block.locator('.document-viewer button').first();
        await pointAt(page, preview); await pause(300); await preview.click();
        await block.locator('iframe').waitFor();
        const frame = block.frameLocator('iframe');
        if (index === 1) await frame.getByText('Document preview page one', { exact: true }).waitFor();
        if (index === 2) await frame.getByText('First slide: 中文', { exact: true }).waitFor();
        if (index === 3) await frame.getByText('PowerPoint preview 中文', { exact: true }).waitFor();
        if (index === 4) await frame.getByText('Revenue', { exact: true }).waitFor();
        await block.scrollIntoViewIfNeeded(); await pause(2200);
        if ([1, 2].includes(index)) {
          const next = block.locator('.document-viewer-controls button').last();
          await pointAt(page, next); await next.click();
          await frame.getByText(index === 1 ? 'Document preview page two' : 'Second slide', { exact: true }).waitFor();
          await pause(2200);
        }
        if (index === 4) { await pointAt(page, block.locator('select')); await block.locator('select').selectOption('Details'); await frame.getByText('Engineering', { exact: true }).waitFor(); await pause(2200); }
        const close = block.locator('.document-viewer button').nth(1);
        await pointAt(page, close); await close.click(); await pause(400);
      }
    });
    assert.deepEqual(errors, []);
    entries.push(...(await closeRecording(context, { artifact, output })).map(entry => ({ ...entry, source: 'edgepress/tools/recordings/capture-document-demo.mjs' })));
  }
} finally { await browser.close(); }
await writeFile(resolve(artifact, 'document-demo.json'), JSON.stringify(entries, null, 2) + '\n');
