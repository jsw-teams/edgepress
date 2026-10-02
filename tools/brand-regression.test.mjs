import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { generateBuiltinRoutes } from '../src/generators.js';
import { renderIcon } from '../src/icons.js';
import { renderBlocks } from '../src/page-blocks.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const extensions = { filter: async (_name, value) => value };
async function configForTest() {
  const config = await loadConfig(root);
  await loadLanguagePacks(config);
  config.pagination.perPage = 1;
  config.site.url = 'https://fixture.example.org';
  config.site.seo.image = '/edgepress/brand/og-image.png';
  return config;
}
async function fixtureRoutes() {
  const config = await configForTest();
  const posts = Array.from({ length: 32 }, (_, index) => ({
    locale: 'en', title: 'Entry ' + index, date: new Date(Date.UTC(2026, 0, index + 1)),
    path: 'entries/' + index + '/', bundlePath: 'posts/entry-' + index, tags: [], description: 'A readable summary.',
    markdown: 'A readable summary.', html: '<p>A readable summary.</p>'
  }));
  return generateBuiltinRoutes({ posts, pages: [] }, config, extensions);
}

test('journal routes exclude project categories while article profiles and tags remain visible', async () => {
  const config = await configForTest();
  config.site.archive.categories = ['博客', '未分类'];
  config.site.author = { name: 'Site author', avatar: '/images/authors/default.png' };
  config.site.navigation = [{ key: 'projects', url: '/projects/', labels: { en: 'Projects', 'zh-CN': '项目' },
    children: [{ key: 'edgepress', url: '/edgepress/', labels: { en: 'EdgePress' } }] }];
  const posts = ['blog', undefined, 'edgepress'].map((category, index) => ({
    locale: 'en', category, title: 'Entry ' + index, date: new Date('2026-10-02'),
    path: 'entries/' + index + '/', bundlePath: 'entry-' + index, tags: ['<unsafe>', 'edgepress'],
    author: index === 0 ? 'Guest <author>' : '', authorAvatar: index === 0 ? '/images/authors/guest.png' : '',
    description: 'Readable summary', markdown: 'word '.repeat(201), html: '<p>Readable text</p>'
  }));
  const routes = await generateBuiltinRoutes({ posts, pages: [] }, config, extensions);
  const get = path => routes.find(route => route.path === path)?.body;
  assert.equal(routes.filter(route => /^archives\/(?:page\/\d+\/)?index.html$/.test(route.path)).length, 2);
  for (const route of routes.filter(route => /^archives\//.test(route.path))) assert.doesNotMatch(route.body, /href="\/entries\/2\/"/);
  assert.match(get('categories/edgepress/index.html'), /href="\/entries\/2\/"/);
  assert.ok(routes.every(route => !route.path.includes('tags/')));
  const article = get('entries/0/index.html');
  assert.match(article, /Guest &lt;author&gt;/);
  assert.match(article, /class="author-avatar" src="\/images\/authors\/guest.png" width="40" height="40" alt=""/);
  assert.match(article, /data-reading-minutes="2"/);
  assert.match(article, /class="post-tag">&lt;unsafe&gt;<\/span>/);
  assert.doesNotMatch(article, /rel="tag"|<script>unsafe/);
  assert.match(get('entries/1/index.html'), /Site author/);
  assert.match(get('zh-CN/archives/index.html'), /value="\/zh-CN\/edgepress\/"/);
  assert.match(article, /data-navigation-select aria-label="Projects"/);
  assert.match(article, /<noscript><a href="\/projects\/">Projects<\/a><a href="\/edgepress\/">EdgePress<\/a><\/noscript>/);
  assert.match(article, /src="\/edgepress\/navigation-select.js"/);
});

test('library icon paths accept only known names and safe CSS classes', () => {
  assert.match(renderIcon('book-open', 'toc-icon compact'), /class="toc-icon compact icon-library"/);
  assert.match(renderIcon('book-open'), /src="\/edgepress\/icons\/book-open\.svg"[^>]*alt="" aria-hidden="true"/);
  for (const name of ['../search', '__proto__', 'home?x', null]) assert.throws(() => renderIcon(name));
  assert.throws(() => renderIcon('home', 'icon" onerror="alert(1)'));
  assert.doesNotMatch(renderIcon('home'), /<svg|<use/);
});

test('native archives have numbered pages, gaps and correct first/last navigation', async () => {
  const routes = await fixtureRoutes();
  const get = (path) => routes.find((route) => route.path === path)?.body;
  const middle = get('archives/page/14/index.html');
  assert.ok(middle);
  assert.match(middle, /class="post-list archive-post-list"/);
  assert.match(middle, /aria-current="page">14<\/span>/);
  assert.match(middle, /href="\/archives\/" aria-label="Page 1"/);
  assert.match(middle, /href="\/archives\/page\/32\/" aria-label="Page 32"/);
  assert.equal((middle.match(/class="pagination-ellipsis"/g) || []).length, 2);
  assert.match(middle, /rel="prev" href="\/archives\/page\/13\/"/);
  assert.match(middle, /rel="next" href="\/archives\/page\/15\/"/);
  assert.doesNotMatch(get('archives/index.html'), /rel="prev"/);
  assert.doesNotMatch(get('archives/page/32/index.html'), /rel="next"/);
});

test('post lists omit redundant language codes and label fallback languages by name', async () => {
  const routes = await fixtureRoutes();
  const same = routes.find((route) => route.path === 'archives/index.html').body;
  const fallback = routes.find((route) => route.path === 'zh-CN/archives/index.html').body;
  assert.doesNotMatch(same, /class="post-language"/);
  assert.match(fallback, /class="post-language" lang="en">English<\/span>/);
  assert.doesNotMatch(fallback, />en<\/span>|>zh-CN<\/span>/);
  assert.match(fallback, /aria-label="第 2 页"/);
  assert.match(fallback, /<article class="post-card" lang="en">/);
});

test('homepage artwork supports a typed WebP source and rejects unsafe URLs', async () => {
  const config = await configForTest();
  const hero = { type: 'hero', title: 'Hello', bannerSrc: '/home.png', bannerAlt: 'Friendly bears',
    bannerWidth: 1536, bannerHeight: 1024, bannerWebpSrcset: [{ src: '/home.webp', width: 1536 }] };
  const render = (value) => renderBlocks([{ columns: 1, cells: [[value]] }], { config, locale: 'en', site: { posts: [], pages: [] }, isHomepage: true });
  assert.match(await render(hero), /<picture class="hero-banner-picture"><source type="image\/webp"/);
  await assert.rejects(render({ ...hero, bannerWebpSrcset: [{ src: 'javascript:alert(1)', width: 1536 }] }));
  await assert.rejects(render({ ...hero, bannerWidth: 0 }));
});

test('share metadata resolves local images against the configured site URL', async () => {
  const routes = await fixtureRoutes();
  assert.match(routes.find((route) => route.path === 'index.html').body,
    /property="og:image" content="https:\/\/fixture\.example\.org\/edgepress\/brand\/og-image\.png"/);
});
