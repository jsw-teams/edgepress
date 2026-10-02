import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlocks } from '../src/page-blocks.js';
import { postsForLocale } from '../src/content.js';
import { categorySlug, categoryFilter, readingMinutes, safeAvatar, authorForPost } from '../src/post-details.js';

const config = {
  site: { archive: { categories: ['博客', '未分类'] } },
  markdown: { gfm: true, breaks: false },
  i18n: { defaultLocale: 'en', translationsByLocale: { en: { noPosts: 'No posts', allPosts: 'All posts' } } }
};
function post(id, locale, category, day = 1) {
  return { bundlePath: id, locale, category, tags: ['edgepress'], title: id + '-' + locale, path: locale + '/' + id + '/',
    date: new Date('2026-09-' + String(day).padStart(2, '0') + 'T00:00:00Z'), description: '**Formatted** excerpt', author: '' };
}
function render(block, posts, locale = 'en') {
  return renderBlocks([{ columns: 1, cells: [[{ type: 'post-list', title: 'Project articles', ...block }]] }],
    { config, locale, site: { posts } });
}

test('categories select translations, sort before limiting, and ignore tags', async () => {
  const posts = [post('old', 'en', 'edgepress'), post('new', 'en', 'EdgePress', 3),
    post('new', 'zh-SG', 'edgepress', 3), post('other', 'zh-SG', 'blog', 4)];
  const html = await render({ category: 'edgepress', count: 1 }, posts, 'zh-SG');
  assert.match(html, /new-zh-SG/);
  assert.doesNotMatch(html, /new-en|other-zh-SG|old-en/);
  assert.match(html, /href="\/zh-SG\/categories\/edgepress\/"/);
  assert.match(html, /<strong>Formatted<\/strong>/);
});

test('journal accepts Chinese aliases and missing categories, excluding project articles', async () => {
  const html = await render({ categories: ['博客', '未分類'] }, [post('blog', 'en', 'blog'), post('new', 'en'), post('project', 'en', 'edgepress')]);
  assert.match(html, /blog-en/);
  assert.match(html, /new-en/);
  assert.doesNotMatch(html, /project-en/);
  assert.deepEqual(categoryFilter(['博客', 'BLOG', '未分类']), ['blog', 'uncategorized']);
  assert.equal(categorySlug('技术'), 'category-6280-672f');
});

test('empty results, validation, and archive-matched homepage pagination', async () => {
  assert.match(await render({ category: 'edgepress' }, []), /No posts/);
  for (const tag of ['edgepress', '', null]) await assert.rejects(render({ tag }, []), /no longer supported/);
  await assert.rejects(render({ category: 'edgepress', paginate: true }, []), /same categories/);
  await assert.rejects(render({ count: 13 }, []), /1 to 12/);
  await assert.rejects(render({ category: 'blog', categories: ['blog'] }, []), /not both/);
  assert.match(await render({ type: 'latest-posts', paginate: true, categories: ['博客', '未分类'] }, [post('blog','en','blog')]), /blog-en/);
});

test('author defaults and avatar validation preserve safe paths without script URLs', () => {
  assert.deepEqual(authorForPost({ author: 'Guest', authorAvatar: '/guest.png' }, { site: { author: { name: 'Site', avatar: '/site.png' } } }), { name: 'Guest', avatar: '/guest.png' });
  assert.equal(safeAvatar('https://example.org/avatar.png'), 'https://example.org/avatar.png');
  for (const src of ['javascript:alert(1)', '//elsewhere/avatar.png', 'http://example.org/a.png', '/bad\\a.png', 'https://user:pass@example.org/a.png']) assert.throws(() => safeAvatar(src), /safe site path/);
});

test('reading estimates count Chinese characters and English words together', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('word '.repeat(201)), 2);
  assert.equal(readingMinutes('文'.repeat(301)), 2);
  assert.equal(readingMinutes('文'.repeat(150)+' word'.repeat(100)), 1);
});

test('fallback language selection stays stable when neither requested nor default language exists', () => {
  const simplified = post('only-Chinese', 'zh-SG', 'blog');
  const traditional = post('only-Chinese', 'zh-TW', 'blog');
  assert.equal(postsForLocale([traditional, simplified], 'en', 'en')[0].locale, 'zh-SG');
  assert.equal(postsForLocale([simplified, traditional], 'en', 'en')[0].locale, 'zh-SG');
  assert.equal(postsForLocale([simplified, traditional], 'zh-TW', 'en')[0].locale, 'zh-TW');
});

test('post-list places pinned articles before the count limit while latest-posts keep date order', async () => {
  const old = {...post('old-pin','en','edgepress',1),pinned:true};
  const recent = post('recent','en','edgepress',8);
  const translated = {...post('old-pin','zh-TW','edgepress',1),pinned:true};
  const posts=[recent,old,translated];
  const featured=await render({category:'edgepress',count:1},posts,'zh-TW');
  assert.match(featured,/old-pin-zh-TW/);
  assert.match(featured,/post-pinned/);
  assert.doesNotMatch(featured,/recent-en|old-pin-en/);
  const latest=await render({type:'latest-posts',category:'edgepress',count:1},posts);
  assert.match(latest,/recent-en/);
  assert.doesNotMatch(latest,/old-pin-en/);
  assert.equal(posts[0],recent,'Sorting must not mutate the source used by archives and feeds');
});
