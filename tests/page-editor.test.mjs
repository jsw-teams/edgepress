import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startPageEditor } from '../src/page-editor.js';

const sample = {
  $schema: '../../../schemas/pages.schema.json',
  title: 'Hello', lang: 'en', homepage: true,
  description: 'Example', customSetting: { untouched: ['a', 'b'] },
  blocks: [{ columns: 2, cells: [
    [{ type: 'heading', level: 2, text: 'First' }],
    [{ type: 'section', title: 'Other', blocks: [{ type: 'text', text: 'Nested' }], custom: 7 }]
  ] }]
};

async function withEditor(run) {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-visual-editor-'));
  const dir = resolve(root, 'content/pages/home');
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, 'en.json');
  await writeFile(file, JSON.stringify(sample, null, 2) + '\n');
  const editor = await startPageEditor({ root, port: 0 });
  try { await run({ root, file, ...editor }); }
  finally { await editor.close(); await rm(root, { recursive: true, force: true }); }
}

test('local visual editor serves a content-safe interface and lists JSON Pages', async () => {
  await withEditor(async ({ url }) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await response.text(), /可视化 Pages 编辑器/);
    const pages = await (await fetch(url + 'api/pages')).json();
    assert.deepEqual(pages.pages, ['home/en.json']);
    const script = await fetch(url + 'editor.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  });
});

test('editor preserves unknown metadata and nested elements, detects external changes, and rejects unsafe writes', async () => {
  await withEditor(async ({ url, file, root }) => {
    const path = 'api/page?path=home%2Fen.json';
    const original = await (await fetch(url + path)).json();
    assert.deepEqual(original.page, sample);
    const payload = { page: structuredClone(original.page), revision: original.revision };
    payload.page.title = 'Edited';
    payload.page.blocks[0].cells[0][0].text = 'Updated';
    const update = () => fetch(url + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: url.slice(0, -1) }, body: JSON.stringify(payload) });
    let response = await update();
    assert.equal(response.status, 200, await response.text());
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.title, 'Edited');
    assert.equal(saved.blocks[0].cells[0][0].text, 'Updated');
    assert.deepEqual(saved.customSetting, sample.customSetting);
    assert.deepEqual(saved.blocks[0].cells[1][0], sample.blocks[0].cells[1][0]);
    response = await update();
    assert.equal(response.status, 409);
    const current = await (await fetch(url + path)).json();
    current.page.blocks[0].columns = 1;
    response = await fetch(url + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: url.slice(0, -1) }, body: JSON.stringify(current) });
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).blocks[0].columns, 2);
    response = await fetch(url + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) });
    assert.equal(response.status, 403);
    assert.equal((await fetch(url + 'api/page?path=..%2F..%2Fsecret.json')).status, 400);
    assert.equal((await fetch(url + 'api/page?path=home%2Fmissing.json')).status, 400);
    const outside = await mkdtemp(join(tmpdir(), 'edgepress-visual-outside-'));
    try {
      await writeFile(resolve(outside, 'en.json'), JSON.stringify(sample));
      await symlink(outside, resolve(root, 'content/pages/linked'), 'dir');
      const list = await (await fetch(url + 'api/pages')).json();
      assert.deepEqual(list.pages, ['home/en.json']);
      assert.equal((await fetch(url + 'api/page?path=linked%2Fen.json')).status, 400);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});

test('visual browser controls edit, preview and save a page without hand-writing JSON', { timeout: 45000 }, async () => {
  await withEditor(async ({ url, file }) => {
    const browser = await chromium.launch({ args: ['--disable-extensions'] });
    try {
      const page = await browser.newPage();
      await page.goto(url);
      await page.locator('#page-name').getByText('Hello').waitFor();
      await page.locator('#title').fill('Visual title');
      await page.locator('#add-row').click();
      assert.equal(await page.locator('.canvas-row').count(), 2);
      await page.locator('.canvas-row').last().locator('.pick').click();
      await page.locator('#fields textarea[aria-label="text"]').fill('Typed in the visual editor');
      await page.locator('#save').click();
      await page.locator('#status.saved').waitFor();
      const result = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(result.title, 'Visual title');
      assert.equal(result.blocks[1].cells[0][0].text, 'Typed in the visual editor');
      assert.deepEqual(result.customSetting, sample.customSetting);
    } finally { await browser.close(); }
  });
});
