import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { postTemplate } from '../src/post-template.js';
import { readDocuments } from '../src/content.js';
import { renderMarkdown } from '../src/markdown.js';
import { renderIcon } from '../src/icons.js';
import { parse, stringify } from 'yaml';

test('new post metadata round-trips quotes and Markdown titles, with one page title', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-writing-'));
  try {
    const content = resolve(root, 'content');
    await mkdir(resolve(content, 'posts/2026-10-02-writing'), { recursive: true });
    const title = '中文 "title": **Markdown** <script>';
    const source = postTemplate(title, '2026-10-02', 'zh-CN', '在这里写正文。');
    await writeFile(resolve(content, 'posts/2026-10-02-writing/zh-cn.md'), source);
    const config = { resolvedPaths: { content }, i18n: { defaultLocale: 'zh-CN', locales: ['zh-CN'] }, concurrency: 1, permalink: '/:year/:month/:slug/' };
    const [post] = await readDocuments(config, 'posts');
    assert.equal(post.title, title);
    assert.equal(post.locale, 'zh-CN');
    assert.equal(post.date.toISOString().slice(0, 10), '2026-10-02');
    assert.equal(post.markdown, '在这里写正文。');
    assert.equal(post.category, 'uncategorized');
    assert.doesNotMatch(await renderMarkdown(post.markdown), /<h1/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('article authors accept a profile object and unsafe avatar URLs fail at content loading', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-profile-'));
  try {
    const content = resolve(root, 'content');
    const file = resolve(content, 'posts/profile/en.md');
    await mkdir(resolve(content, 'posts/profile'), { recursive: true });
    const config = { resolvedPaths: { content }, i18n: { locales: ['en'], defaultLocale: 'en' }, concurrency: 1, permalink: '/:slug/' };
    const metadata = { title: 'Profile', date: '2026-10-02', author: { name: 'Guest', avatar: '/images/guest.png' }, category: '博客', tags: ['notes'] };
    await writeFile(file, '---\n' + stringify(metadata) + '---\nText');
    const [post] = await readDocuments(config);
    assert.equal(post.author, 'Guest');
    assert.equal(post.authorAvatar, '/images/guest.png');
    assert.equal(post.category, 'blog');
    metadata.author.avatar = 'javascript:alert(1)';
    await writeFile(file, '---\n' + stringify(metadata) + '---\nText');
    await assert.rejects(readDocuments(config), /author avatar/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI creates a localized post and refuses to overwrite it', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-cli-writing-'));
  try {
    await writeFile(resolve(root, 'edgepress.config.mjs'), 'export default {i18n:{defaultLocale:"zh-CN",languagePacks:[]}};');
    const settings = parse(await readFile(resolve('config.yml'), 'utf8'));
    settings.plugins.consent.services = [];
    await writeFile(resolve(root, 'config.yml'), stringify(settings));
    await mkdir(resolve(root, 'languages/base'), { recursive: true });
    await writeFile(resolve(root, 'languages/base/zh-CN.json'), JSON.stringify({ postStarter: '在这里写正文。', postCreated: '已创建 {file}', postNextSteps: '用 Markdown 写正文。', postPreview: 'npm run dev' }));
    const cli = resolve('src/cli.js');
    const first = spawnSync(process.execPath, [cli, 'new', '我的第一篇文章'], { cwd: root, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /已创建/);
    const match = first.stdout.match(/content[^\r\n]+\.md/);
    const file = resolve(root, match[0]);
    const before = await readFile(file, 'utf8');
    assert.match(before, /在这里写正文。/);
    assert.doesNotMatch(before, /# 我的第一篇文章/);
    const second = spawnSync(process.execPath, [cli, 'new', '我的第一篇文章'], { cwd: root, encoding: 'utf8' });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /already exists/);
    assert.equal(await readFile(file, 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bitmap icon paths reject traversal and preserve safe caller classes', () => {
  assert.match(renderIcon('book-open', 'icon nav_icon'), /class="icon nav_icon icon-library"/);
  assert.match(renderIcon('book-open'), /alt="" aria-hidden="true"/);
  for (const name of ['../home', 'home.png', '__proto__', 'HOME', '" onerror="x']) assert.throws(() => renderIcon(name));
  for (const value of ['icon" onerror="x', 'icon<svg', '', undefined + '"']) assert.throws(() => renderIcon('home', value));
});
