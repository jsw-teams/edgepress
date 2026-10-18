import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRssRoute, absoluteContentUrls } from '../src/rss.js';

const config = {
  site: { url: 'https://example.test', title: 'A & B', description: 'News <analysis>', author: { name: 'Editor' } },
  i18n: { defaultLocale: 'en', locales: ['en', 'zh-CN'] },
  markdown: { gfm: true, breaks: false }
};

function post(overrides = {}) {
  return {
    title: 'Title & <tag>', author: 'Writer', locale: 'en', path: '2026/10/scene/',
    date: new Date('2026-10-15T09:00:00Z'), updated: new Date('2026-10-17T10:00:00Z'),
    category: 'science', tags: ['AI', 'science'],
    description: 'Summary & details',
    markdown: '## Introduction\n\nLong **article** text with [local link](/notes/?a=1&b=2), a ![figure](/images/scene.webp) and <script>unsafe()</script>.\n\nA second paragraph.',
    ...overrides
  };
}

test('RSS 2.0 gives AI readers a stable canonical item, full safe HTML, and correct update metadata', async () => {
  const route = await generateRssRoute([post()], config, 'en');
  assert.equal(route.path, 'rss.xml');
  assert.equal(route.contentType, 'application/rss+xml; charset=utf-8');
  assert.match(route.body, /<rss version="2\.0" /);
  assert.match(route.body, /<atom:link href="https:\/\/example\.test\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.match(route.body, /<title>Title &amp; &lt;tag&gt;<\/title>/);
  assert.match(route.body, /<guid isPermaLink="true">https:\/\/example\.test\/2026\/10\/scene\/<\/guid>/);
  assert.match(route.body, /<dc:creator>Writer<\/dc:creator>/);
  assert.match(route.body, /<dc:date>2026-10-17T10:00:00\.000Z<\/dc:date>/);
  assert.match(route.body, /<pubDate>Thu, 15 Oct 2026 09:00:00 GMT<\/pubDate>/);
  assert.match(route.body, /<lastBuildDate>Sat, 17 Oct 2026 10:00:00 GMT<\/lastBuildDate>/);
  assert.match(route.body, /<content:encoded>[\s\S]*Introduction[\s\S]*second paragraph[\s\S]*<\/content:encoded>/i);
  assert.match(route.body, /https:\/\/example\.test\/images\/scene\.webp/);
  assert.match(route.body, /https:\/\/example\.test\/notes\/\?a=1&amp;amp;b=2/);
  assert.doesNotMatch(route.body, /unsafe\(\)|<script|<iframe/);
  assert.equal((route.body.match(/<category>/g) || []).length, 2);
});

test('RSS locale paths, item limit, empty feeds and special characters', async () => {
  const localized = await generateRssRoute([post({ title: '中文 & 新闻', locale: 'zh-CN', path: 'zh-CN/中文/' })], config, 'zh-CN');
  assert.equal(localized.path, 'zh-CN/rss.xml');
  assert.match(localized.body, /<language>zh-CN<\/language>/);
  assert.match(localized.body, /<dc:language>zh-CN<\/dc:language>/);
  assert.match(localized.body, /%E4%B8%AD%E6%96%87/);
  assert.match(localized.body, /中文 &amp; 新闻/);
  const empty = await generateRssRoute([], config, 'en');
  assert.doesNotMatch(empty.body, /<item>/);
  const limited = await generateRssRoute(Array.from({ length: 22 }, (_, i) => post({ title: String(i) })), config, 'en');
  assert.equal((limited.body.match(/<item>/g) || []).length, 20);
  assert.match(absoluteContentUrls('<a href="../x?a=1&amp;b=2">X</a>', 'https://example.test/section/article/'),
    /href="https:\/\/example\.test\/section\/x\?a=1&amp;b=2"/);
});
