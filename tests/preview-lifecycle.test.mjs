import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stop as stopEsbuild } from 'esbuild';

test('preview starts and rebuilds without audit browsers or PDF work', { timeout: 30000 }, async () => {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'edgepress-light-preview-'));
  const originalCwd = process.cwd();
  const executables = [];
  const originalSpawn = childProcess.spawn;
  const spy = mock.method(childProcess, 'spawn', (executable, ...args) => {
    executables.push(executable);
    assert.ok(executable === process.execPath || executable === 'taskkill' || /^(?:esbuild|git)(?:\.exe)?$/.test(basename(executable)), 'Preview must not launch an audit browser: ' + executable);
    return originalSpawn(executable, ...args);
  });
  syncBuiltinESMExports();
  let preview;
  try {
    for (const folder of ['content/pages/home', 'languages/base', 'themes/fixture/assets', 'themes/fixture/layouts', 'node_modules/wrangler/bin']) await mkdir(resolve(root, folder), { recursive: true });
    await cp(resolve(project, 'languages/base/en.json'), resolve(root, 'languages/base/en.json'));
    await writeFile(resolve(root, 'edgepress.config.mjs'), 'export default {paths:{theme:"themes/fixture"},i18n:{defaultLocale:"en",languagePacks:[]}};');
    await writeFile(resolve(root, 'config.yml'), 'site:\n  title: Fast preview\n  url: https://preview.example.org\nplugins:\n  consent:\n    enabled: false\n    proposedDate: 2026-10-02\n');
    await writeFile(resolve(root, 'themes/fixture/layouts/layout.html'), '<html lang="en"><head><title>{{page.title}}</title></head><body><main>{{{page.content}}}</main></body></html>');
    await writeFile(resolve(root, 'themes/fixture/assets/style.css'), 'body{font:16px system-ui}');
    const file = resolve(root, 'content/pages/home/en.json');
    const page = { title: 'Initial', lang: 'en', homepage: true, blocks: [{ columns: 1, cells: [[{ type: 'text', text: 'Preview fixture' }]] }] };
    await writeFile(file, JSON.stringify(page));
    // Keep the test independent of Wrangler startup/network access. Exercise the
    // real builder, source watcher, editor gateway and process lifecycle.
    await writeFile(resolve(root, 'node_modules/wrangler/bin/wrangler.js'), `
      const {createServer} = require('node:http');
      const {readFile} = require('node:fs/promises');
      const {resolve} = require('node:path');
      createServer(async(req,res)=>{
        try {res.end(await readFile(resolve('dist',req.url==='/'?'index.html':'__edgepress_preview.json')));}
        catch {res.writeHead(503);res.end();}
      }).listen(Number(process.argv[process.argv.indexOf('--port')+1]),'127.0.0.1');
    `);
    process.chdir(root);
    const { startPreview } = await import('../src/preview.js');
    const { availablePreviewPort } = await import('../src/preview-server.js');
    const port = await availablePreviewPort();
    preview = await startPreview(['--port', String(port)]);
    async function waitForTitle(title) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const response = await fetch(preview.url);
        if (response.ok && (await response.text()).includes('<h1>' + title + '</h1>')) return;
        await new Promise(done => setTimeout(done, 100));
      }
      assert.fail('Preview did not show ' + title);
    }
    await waitForTitle('Initial');
    const payload = await (await fetch(preview.editorUrl + 'api/page?path=home%2Fen.json')).json();
    payload.page.title = 'Saved';
    const response = await fetch(preview.editorUrl + 'api/page?path=home%2Fen.json', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: new URL(preview.url).origin }, body: JSON.stringify(payload)
    });
    assert.equal(response.status, 200);
    await waitForTitle('Saved');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).title, 'Saved');
    await assert.rejects(access(resolve(root, 'tools/reports/page-check.pdf')), { code: 'ENOENT' });
    assert.equal(executables.filter(executable => executable === process.execPath).length, 2, 'Only the initial preview and rebuild launch a child runtime');
    const url = preview.url;
    await preview.close(); preview = null;
    await assert.rejects(fetch(url));
  } finally {
    await preview?.close();
    spy.mock.restore(); syncBuiltinESMExports();
    process.chdir(originalCwd);
    stopEsbuild();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
