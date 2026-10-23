import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createPage } from '../src/page-scaffold.js';
import { startPageEditor } from '../src/page-editor.js';

async function sandbox(run) {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-pages-create-'));
  try { return await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('createPage scaffolds valid localized JSON Pages without overwriting existing files', async () => {
  await sandbox(async root => {
    await mkdir(resolve(root, 'schemas'), { recursive: true });
    await writeFile(resolve(root, 'schemas/pages.schema.json'), '{}');
    const created = await createPage(root, { title: 'About This Site', locales: ['en', 'zh-CN'] });
    assert.equal(created.path, 'about-this-site/en.json');
    assert.equal(created.page.title, 'About This Site');
    assert.equal(created.page.lang, 'en');
    assert.equal(created.page.$schema, '../../../schemas/pages.schema.json');
    assert.equal(created.page.blocks[0].cells[0][0].type, 'hero');
    assert.deepEqual(JSON.parse(await readFile(created.file, 'utf8')), created.page);
    await assert.rejects(createPage(root, { title: 'About This Site' }), /already exists/);
    const translated = await createPage(root, {
      title: '关于我们', slug: 'about-this-site', lang: 'zh-cn', locales: ['en', 'zh-CN']
    });
    assert.equal(translated.path, 'about-this-site/zh-cn.json');
    assert.equal(translated.page.lang, 'zh-CN');
    assert.notEqual(created.file, translated.file);
    await assert.rejects(createPage(root, { title: 'No', slug: '../oops' }), /slug/);
    await assert.rejects(createPage(root, { title: 'No', slug: 'OOPS' }), /slug/);
    await assert.rejects(createPage(root, { title: 'No', lang: 'fr', locales: ['en'] }), /locale/);
    const existing = resolve(root, 'content/pages/legacy/en.md');
    await mkdir(resolve(root, 'content/pages/legacy'));
    await writeFile(existing, '# legacy');
    await assert.rejects(createPage(root, { title: 'Legacy' }), /already exists/);
    assert.equal(await readFile(existing, 'utf8'), '# legacy');
  });
});

test('createPage refuses to use a symlink as a page folder', async () => {
  await sandbox(async root => {
    const target = resolve(root, 'unrelated');
    await mkdir(resolve(root, 'content/pages'), { recursive: true });
    await mkdir(target);
    await symlink(target, resolve(root, 'content/pages/linked'), 'dir');
    await assert.rejects(createPage(root, { title: 'linked' }), /Unsafe/);
  });
});

test('public editor catalog covers every supported Pages type and reusable website components', async () => {
  const source = JSON.parse(await readFile('src/page-block-catalog.json', 'utf8'));
  const schema = JSON.parse(await readFile('schemas/pages.schema.json', 'utf8'));
  const types = schema.definitions.element.properties.type.enum;
  assert.equal(types.length, 30);
  assert.deepEqual(Object.keys(source.blocks).sort(), [...types].sort());
  for (const [key, definition] of Object.entries(source.blocks)) {
    assert.equal(definition.template.type, key);
    assert.ok(definition.label && definition.category);
  }
  for (const type of ['link-directory', 'privacy-controller', 'media-text', 'feature-grid', 'media-viewer', 'local-tool']) {
    assert.ok(source.blocks[type], type + ' must be supported for web and other site consumers');
  }
  for (const type of ['captcha', 'oembed', 'service', 'ad-slot', 'local-tool']) {
    assert.equal(source.blocks[type].requiresSetup, true);
  }
});

test('page API creates a page and enforces local-origin, duplicate and path restrictions', async () => {
  await sandbox(async root => {
    const editor = await startPageEditor({ root, port: 0, locales: ['en', 'zh-CN'] });
    try {
      const request = (body, origin) => fetch(editor.url + 'api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify(body)
      });
      assert.equal((await request({ title: 'Test' })).status, 403);
      const origin = editor.url.slice(0, -1);
      assert.equal((await request({ title: 'Test', lang: 'fr' }, origin)).status, 400);
      assert.equal((await request({ title: 'Test', slug: '../../no' }, origin)).status, 400);
      const created = await request({ title: 'New Page', slug: 'my-new-page', lang: 'en' }, origin);
      assert.equal(created.status, 201);
      const data = await created.json();
      assert.equal(data.path, 'my-new-page/en.json');
      assert.equal((await request({ title: 'New Page', slug: 'my-new-page' }, origin)).status, 409);
      const onDisk = JSON.parse(await readFile(resolve(root, 'content/pages/my-new-page/en.json'), 'utf8'));
      assert.equal(onDisk.title, 'New Page');
      const registry = await (await fetch(editor.url + 'api/block-catalog')).json();
      assert.equal(Object.keys(registry.blocks).length, 30);
    } finally { await editor.close(); }
  });
});

test('browser creates a Page and adds a specialized shared block without editing JSON', { timeout: 45000 }, async () => {
  await sandbox(async root => {
    const editor = await startPageEditor({ root, port: 0, locales: ['en', 'zh-CN'] });
    const browser = await chromium.launch({ args: ['--disable-extensions'] });
    try {
      const page = await browser.newPage();
      await page.goto(editor.url);
      await page.locator('#new-page').click();
      await page.locator('#create-title').fill('Site Information');
      await page.locator('#create-slug').fill('site-info');
      await page.locator('#create-lang').selectOption('en');
      await page.getByRole('button', { name: '创建并编辑' }).click();
      await page.waitForFunction(() => document.querySelector('#page-path')?.textContent?.includes('site-info/en.json'));
      await page.waitForFunction(() => [...document.querySelectorAll('#canvas .canvas-cell select option')].some(option => option.value === 'privacy-controller'));
      const selector = page.locator('#canvas .canvas-cell select').first();
      await selector.selectOption('privacy-controller');
      await page.locator('#canvas .canvas-cell button').filter({ hasText: '添加' }).first().click();
      await page.locator('#save').click();
      await page.locator('#status.saved').waitFor();
      const saved = JSON.parse(await readFile(resolve(root, 'content/pages/site-info/en.json'), 'utf8'));
      assert.equal(saved.title, 'Site Information');
      assert.equal(saved.blocks[0].cells[0][1].type, 'privacy-controller');
      assert.equal(saved.blocks[0].cells[0][1].contactLabel, '联系方式');
      assert.equal(saved.blocks[0].cells[0][0].type, 'hero');
    } finally { await browser.close(); await editor.close(); }
  });
});
