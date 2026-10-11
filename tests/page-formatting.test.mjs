import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {parseDocumentSource} from '../src/content.js';
import {formatPageSource, formatPages} from '../tools/assets/format-pages.mjs';

test('JSON conversion preserves nested elements, metadata, multiline text and punctuation', () => {
  const source = '---\ntitle: "A: page"\nblocks:\n  - columns: 2\n    cells:\n      - - type: section\n          blocks:\n            - type: text\n              text: |\n                Quote: "Hello"\n                # literal text 中文 []{}\n      - - type: text\n          text: Second cell\ndraft: false\n---\n\n';
  const result = formatPageSource(source);
  assert.deepEqual(JSON.parse(result), parseDocumentSource(source, 'page.md').metadata);
  assert.equal(formatPageSource(result, {file: 'page.json'}), result);
  assert.throws(() => formatPageSource(source + 'Do not discard this body'), /body content/);
});

test('migration preflights duplicate locale files and only deletes Markdown after writing its equivalent JSON', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-page-json-'));
  try {
    const folder = resolve(root, 'content/pages/home');
    await mkdir(folder, {recursive: true});
    const source = '---\nlang: en\nhomepage: true\nblocks: [{columns: 1, cells: [[{type: text, text: Hello}]]}]\n---\n';
    await writeFile(resolve(folder, 'en.md'), source);
    assert.equal((await formatPages(root)).length, 1);
    assert.equal(await readFile(resolve(folder, 'en.md'), 'utf8'), source);
    await writeFile(resolve(folder, 'en.json'), '{}');
    await assert.rejects(formatPages(root, {write: true}), /Duplicate/);
    assert.equal(await readFile(resolve(folder, 'en.md'), 'utf8'), source);
    await rm(resolve(folder, 'en.json'));
    await formatPages(root, {write: true});
    await assert.rejects(access(resolve(folder, 'en.md')));
    const {$schema, ...page} = JSON.parse(await readFile(resolve(folder, 'en.json'), 'utf8'));
    assert.match($schema, /schemas\/pages\.schema\.json$/);
    assert.deepEqual(page, parseDocumentSource(source, 'en.md').metadata);
    assert.deepEqual(await formatPages(root), []);
  } finally { await rm(root, {recursive: true, force: true}); }
});
