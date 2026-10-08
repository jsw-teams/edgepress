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
const documents = resolve(process.env.DOCUMENT_DEMO_ROOT || resolve(site, 'content/assets/documents/doc-views'));
const require = createRequire(resolve(site, 'package.json'));
const engine = createRequire(require.resolve('edgepress/package.json'));
const { loadConfig } = await import(pathToFileURL(engine.resolve('edgepress/src/config.js')));
const { loadLanguagePacks } = await import(pathToFileURL(engine.resolve('edgepress/src/i18n.js')));
const { collectAssets, rewriteAssetLinks } = await import(pathToFileURL(engine.resolve('edgepress/src/assets.js')));
const { createExtensions } = await import(pathToFileURL(engine.resolve('edgepress/src/plugin-api.js')));
const { renderBlocks } = await import(pathToFileURL(engine.resolve('edgepress/src/page-blocks.js')));
const { renderLayout } = await import(pathToFileURL(engine.resolve('edgepress/src/theme.js')));
const names = ['sample-document-medium.docx', 'sample-document-medium.doc', 'sample-document-5-pages.pdf', 'sample-document.ppt', 'sample-presentation-10-slides.pptx', 'sample-spreadsheet-100-rows.xlsx', 'sample-spreadsheet-100-rows.xls'];
const files = new Map(await Promise.all(names.map(async name => [name, await readFile(resolve(documents, name))])));
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
  for (const locale of (process.env.RECORDING_LOCALES || 'en,zh-SG,zh-TW').split(',')) {
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
    await first.frameLocator('iframe').getByText('Sample Business Document', { exact: true }).waitFor();
    await first.scrollIntoViewIfNeeded();
    await record(page, 'doc-views-' + locale.toLowerCase(), async () => {
      await pause(2500);
      const expand = first.locator('.document-viewer-expand');
      await pointAt(page, expand); await expand.click(); await pause(1800);
      await pointAt(page, expand); await expand.click(); await pause(600);
      const zoom = first.getByRole('button', { name: locale === 'en' ? 'Zoom in' : '放大', exact: true });
      await pointAt(page, zoom); await zoom.click(); await pause(1000);
      await first.getByRole('button', { name: locale === 'en' ? 'Fit width' : locale === 'zh-SG' ? '适合宽度' : '符合寬度', exact: true }).click(); await pause(600);
      await pointAt(page, first.locator('.document-viewer button').nth(1));
      await first.locator('.document-viewer button').nth(1).click();
      for (const index of [1, 2, 3, 4, 5, 6]) {
        const block = page.locator('.document-block').nth(index);
        await block.locator('iframe').waitFor();
        const frame = block.frameLocator('iframe');
        if (index === 1) await frame.locator('body').filter({ hasText: 'Sample Business Document' }).waitFor();
        if (index === 2) {
          await frame.getByText('Sample Business Document', { exact: true }).waitFor();
          const painted = await frame.locator('.pdf-page img').first().evaluate(image => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.getContext('2d').drawImage(image, 0, 0);
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let ink = 0;
            for (let offset = 0; offset < pixels.length; offset += 4) if (pixels[offset] < 128 && pixels[offset + 3]) ink++;
            return { ink, width: canvas.width, height: canvas.height };
          });
          console.log('PDF canvas: ' + JSON.stringify(painted));
          assert.ok(painted.ink > 100, 'The recorded PDF must paint visible content');
        }
        if ([3, 4].includes(index)) await frame.getByText('Sample Presentation', { exact: true }).waitFor();
        if ([5, 6].includes(index)) await frame.getByText('Order ID', { exact: true }).waitFor();
        await block.scrollIntoViewIfNeeded(); await pause(2200);
        if (index === 2) {
          for (let number = 2; number <= 8; number++) {
            const section = frame.locator('[data-document-page="' + number + '"]');
            await section.scrollIntoViewIfNeeded();
            await section.locator('.pdf-page[aria-busy="false"] img').waitFor();
            await pause(1600);
          }
        }
        if (index === 3) {
          const title = frame.locator('foreignObject').getByText('Sample Presentation', { exact: true });
          assert.ok(await title.evaluate(element => element.getBoundingClientRect().height > 16), 'PPT title must be visibly readable');
          await frame.locator('[data-document-page="2"]').scrollIntoViewIfNeeded();
          await frame.getByText('Agenda', { exact: true }).waitFor();
          await pause(2200);
        }
        if (index === 5) {
          const address = block.locator('.document-viewer-formula input');
          await pointAt(page, address); await address.fill('A90'); await address.press('Enter');
          const cell = frame.locator('[data-row="89"][data-column="0"]');
          await cell.waitFor(); await pointAt(page, cell); await cell.click(); await pause(1800);
          const summary = block.getByRole('tab', { name: 'Summary', exact: true });
          await pointAt(page, summary); await summary.click(); await frame.getByText('595500', { exact: true }).waitFor(); await pause(2200);
        }
        const close = block.locator('.document-viewer button').nth(1);
        await pointAt(page, close); await close.click(); await pause(400);
      }
    });
    assert.deepEqual(errors, []);
    entries.push(...(await closeRecording(context, { artifact, output })).map(entry => ({ ...entry, kind: 'FFmpeg recording of actual Chromium in an isolated WSL2 desktop; automatically opened operator-supplied Office and eight-page PDF samples; no original-download links', source: 'edgepress/tools/recordings/capture-document-demo.mjs' })));
  }
} finally { await browser.close(); }
await writeFile(resolve(artifact, 'document-demo.json'), JSON.stringify(entries, null, 2) + '\n');
