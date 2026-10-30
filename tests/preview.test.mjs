import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { previewOptions, startPreviewServer } from '../src/preview-server.js';

test('preview accepts its short-command options and keeps the listener on loopback', () => {
  assert.deepEqual(previewOptions([]), { port: 8787, forwarded: [] });
  assert.deepEqual(previewOptions(['--port=8790', '--ip', '127.0.0.1', '--log-level', 'error']), { port: 8790, forwarded: ['--log-level', 'error'] });
  for (const args of [['--port'], ['--port=0'], ['--port=65536'], ['--ip=0.0.0.0'], ['--local-protocol=https']]) assert.throws(() => previewOptions(args));
});

test('preview and editor share one origin, save Pages in the browser and preserve website routes', { timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-preview-'));
  const file = resolve(root, 'content/pages/home/en.json');
  await mkdir(resolve(root, 'content/pages/home'), { recursive: true });
  await writeFile(file, JSON.stringify({ title: 'Preview home', lang: 'en', homepage: true, custom: { keep: true }, blocks: [{ columns: 1, cells: [[{ type: 'text', text: 'Original' }]] }] }));
  const website = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Static-Fixture', 'preserved');
    res.end('<h1>' + JSON.parse(pageSource).title + '</h1><a href="/__edgepress/">Edit Pages</a>');
  });
  let pageSource = await readFile(file, 'utf8');
  await new Promise(done => website.listen(0, '127.0.0.1', done));
  const preview = await startPreviewServer({ root, port: 0, upstreamPort: website.address().port });
  const origin = new URL(preview.url).origin;
  const browser = await chromium.launch({ args: ['--disable-extensions'] });
  try {
    assert.equal((await fetch(origin + '/?test=1')).headers.get('x-static-fixture'), 'preserved');
    assert.equal((await fetch(origin + '/__edgepress', { redirect: 'manual' })).headers.get('location'), '/__edgepress/');
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('link', { name: 'Edit Pages' }).click();
    await page.waitForFunction(() => document.querySelector('#page-name')?.textContent === 'Preview home');
    await page.locator('#title').fill('Saved in preview');
    await page.locator('#save').click();
    await page.locator('#status.saved').waitFor();
    pageSource = await readFile(file, 'utf8');
    assert.deepEqual(JSON.parse(pageSource).custom, { keep: true });
    await page.getByRole('link', { name: '返回网站预览' }).click();
    await page.getByRole('heading', { name: 'Saved in preview' }).waitFor();
    await page.goto(preview.url);
    await page.locator('#new-page').click();
    await page.locator('#create-title').fill('Created in preview');
    await page.locator('#create-slug').fill('created');
    await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#page-name')?.textContent === 'Created in preview');
    assert.equal(JSON.parse(await readFile(resolve(root, 'content/pages/created/en.json'), 'utf8')).title, 'Created in preview');
    assert.deepEqual(errors, []);
    const path = preview.url + 'api/page?path=home%2Fen.json';
    const payload = await (await fetch(path)).json();
    payload.page.title = 'Revision changes';
    assert.equal((await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://outside.example' }, body: JSON.stringify(payload) })).status, 403);
    const localWrite = () => fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(payload) });
    assert.equal((await localWrite()).status, 200);
    assert.equal((await localWrite()).status, 409);
    const rejectedHost = await new Promise((done, reject) => {
      const req = request(origin + '/__edgepress/api/pages', { headers: { Host: 'outside.example' } }, res => { res.resume(); done(res.statusCode); });
      req.once('error', reject); req.end();
    });
    assert.equal(rejectedHost, 403);
    await new Promise(done => website.close(done));
    assert.equal((await fetch(origin)).status, 503);
    assert.equal((await fetch(preview.url)).status, 200, 'Editor remains available while the preview rebuilds');
  } finally {
    await browser.close();
    await preview.close();
    if (website.listening) await new Promise(done => website.close(done));
    await rm(root, { recursive: true, force: true });
  }
});
