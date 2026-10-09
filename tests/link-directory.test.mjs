import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { renderBlocks } from '../src/page-blocks.js';
import { renderLayout } from '../src/theme.js';
import { collectAssets } from '../src/assets.js';

const configForTests = async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  return config;
};
const rowsFor = items => [{ columns: 1, cells: [[{ type: 'link-directory', title: 'Independent sites', items }]] }];
const contextFor = config => ({ config, locale: 'en', isHomepage: false, site: { posts: [], pages: [] } });

test('link-directory renders data-driven rows and safely escapes URLs and descriptions', async () => {
  const config = await configForTests();
  const items = [
    { title: 'Journal & notes', text: 'Stories with <code> examples', url: 'https://notes.example.org/posts/?ref=a&b=c' },
    { title: 'Local guide', text: 'How to submit', url: '/contact/' }
  ];
  const html = await renderBlocks(rowsFor(items), contextFor(config));
  assert.match(html, /class="link-directory-section"/);
  assert.match(html, /<ol class="link-directory-items">/);
  assert.equal((html.match(/class="link-directory-entry"/g) || []).length, items.length);
  assert.match(html, /notes\.example\.org/);
  assert.match(html, /Journal &amp; notes/);
  assert.match(html, /&lt;code&gt;/);
  assert.match(html, /ref=a&amp;b=c/);
  assert.match(html, /href="\/contact\/"/);
  assert.doesNotMatch(html, /<img|feature-card|<script/i);
  for (const bad of ['javascript:alert(1)', '//host.example/evil', 'https://name:password@host.example']) {
    await assert.rejects(renderBlocks(rowsFor([{ title: 'Bad', url: bad }]), contextFor(config)), /safe site path|HTTP/);
  }
});

test('link-directory uses the shared conditional stylesheet, including hash rewriting', async () => {
  const config = await configForTests();
  const rows = rowsFor([{ title: 'Example', url: 'https://example.org/' }]);
  const content = await renderBlocks(rows, contextFor(config));
  const extensions = { filter: async (_name, html) => html };
  const html = await renderLayout(config, extensions, { title: 'Links', locale: 'en', urlPath: '/links/' }, '<main>' + content + '</main>');
  assert.match(html, /href="\/edgepress\/link-directory\.css"/);
  const empty = await renderLayout(config, extensions, { title: 'Empty', locale: 'en', urlPath: '/empty/' }, '<main><p>No directory</p></main>');
  assert.doesNotMatch(empty, /link-directory\.css/);
  const bundle = await collectAssets(config);
  const stylesheet = bundle.urlMap['/edgepress/link-directory.css'];
  assert.match(stylesheet, /\/edgepress\/link-directory\.[a-f0-9]{16}\.css/);
});
