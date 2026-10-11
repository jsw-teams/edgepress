import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { formatPageSource } from '../tools/assets/format-pages.mjs';

test('bracket formatting preserves nested Pages, metadata, multiline text and body, and is idempotent', () => {
  const source = '---\ntitle: "A: page"\n# Preserve metadata notes\nblocks:\n  - columns: 2\n    cells:\n      - - type: section\n          blocks:\n            - type: text\n              text: |\n                Quote: "Hello"\n                # literal text\n      - []\ndraft: false\n---\n\n';
  const result = formatPageSource(source);
  assert.match(result, /blocks: \[ #/);
  assert.match(result, /cells: \[ #/);
  assert.match(result, /# Preserve metadata notes/);
  assert.deepEqual(parse(result.split('---')[1]), parse(source.split('---')[1]));
  assert.equal(formatPageSource(result), result);
  assert.ok(result.endsWith('---\n\n'));
});

test('non-Pages Markdown and scalar punctuation remain unchanged in meaning', () => {
  assert.equal(formatPageSource('---\ntitle: Post\n---\nArticle'), '---\ntitle: Post\n---\nArticle');
  const source = '---\nblocks:\n  - columns: 1\n    cells:\n      - - type: text\n          paragraphs: ["[]{}:, #", "中文", "a\\nb"]\n---\n';
  const result = formatPageSource(source);
  assert.deepEqual(parse(result.split('---')[1]), parse(source.split('---')[1]));
});
