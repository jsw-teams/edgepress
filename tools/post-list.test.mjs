import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlocks } from '../src/page-blocks.js';
import { tagSlug } from '../src/content.js';

const config = {
  markdown: { gfm: true, breaks: false },
  i18n: { defaultLocale: 'en', translationsByLocale: { en: { noPosts: 'No posts', allPosts: 'All posts' } } }
};
function post(id, locale, tags, day = 1) {
  return { bundlePath: id, locale, tags, title: id + '-' + locale, path: locale + '/' + id + '/',
    date: new Date('2026-09-' + String(day).padStart(2, '0') + 'T00:00:00Z'), description: '**Formatted** excerpt', author: '' };
}
function render(block, posts, locale = 'en') {
  return renderBlocks([{ columns: 1, cells: [[{ type: 'post-list', title: 'Project articles', ...block }]] }],
    { config, locale, site: { posts } });
}

test('project lists filter case-insensitively, select translations, and sort before limiting', async () => {
  const posts = [post('old', 'en', ['edgepress']), post('new', 'en', ['EdgePress'], 3),
    post('new', 'zh-SG', ['edgepress'], 3), post('other', 'zh-SG', ['video'], 4)];
  const html = await render({ tag: 'edgepress', count: 1 }, posts, 'zh-SG');
  assert.match(html, /new-zh-SG/);
  assert.doesNotMatch(html, /new-en|other-zh-SG|old-en/);
  assert.match(html, /href="\/zh-SG\/tags\/edgepress\/"/);
  assert.match(html, /<strong>Formatted<\/strong>/);
});

test('non-ASCII tag links use the same archive paths as the generator', async () => {
  const html = await render({ tag: '技术', count: 1 }, [post('one', 'en', ['技术']), post('two', 'en', ['技术'], 2)]);
  assert.equal(tagSlug('技术'), 'tag-6280-672f');
  assert.match(html, /href="\/tags\/tag-6280-672f\/"/);
});

test('empty results and unfiltered lists keep existing behavior', async () => {
  const posts = [post('one', 'en', ['video'])];
  assert.match(await render({ tag: 'edgepress' }, posts), /No posts/);
  assert.doesNotMatch(await render({ tag: 'edgepress' }, posts), /post-list-more/);
  assert.match(await render({}, posts), /one-en/);
  assert.match(await render({ type: 'latest-posts' }, posts), /one-en/);
});

test('invalid tags and filtered homepage pagination are rejected', async () => {
  for (const tag of ['', '   ', [], null]) await assert.rejects(render({ tag }, []), /post-list.tag/);
  await assert.rejects(render({ tag: 'edgepress', paginate: true }, []), /tag archive/);
  await assert.rejects(render({ count: 13 }, []), /1 to 12/);
});
