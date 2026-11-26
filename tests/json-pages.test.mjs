import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, readdir, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {loadConfig} from '../src/config.js';
import {parseDocumentSource, readDocuments} from '../src/content.js';
import {renderBlocks} from '../src/page-blocks.js';

const page = {title:'JSON page', lang:'en', homepage:true, blocks:[{columns:2,cells:[[{type:'heading',level:2,text:'Left'},{type:'text',text:'Text with "quotes"\nand 中文'}],[{type:'text',text:'Right'}]]}]};

test('shipped Pages resolve their local schema and render valid structured blocks', async () => {
  const config = await loadConfig(process.cwd());
  const files = await readdir('content/pages', {recursive: true});
  const jsonFiles = files.filter(file => file.endsWith('.json'));
  assert.ok(jsonFiles.length);
  for (const file of jsonFiles) {
    const absolute = resolve('content/pages', file);
    const text = await readFile(absolute, 'utf8');
    const data = JSON.parse(text);
    assert.ok(data.$schema, file + ' must link its schema');
    const schemaPath = resolve(dirname(absolute), data.$schema);
    await access(schemaPath);
    const parsed = parseDocumentSource(text, absolute);
    assert.ok(Array.isArray(parsed.metadata.blocks), file + ' blocks must be an array');
    await renderBlocks(parsed.metadata.blocks, {config, locale: parsed.metadata.lang || 'en', site: {posts: [], pages: []}});
  }
});

test('JSON and legacy YAML Pages use the same locale, routes, blocks and validation', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-json-content-'));
  try {
    const config = await loadConfig(process.cwd());
    config.resolvedPaths.content = root;
    await mkdir(resolve(root, 'pages/home'), {recursive: true});
    const file = resolve(root, 'pages/home/en.json');
    await writeFile(file, JSON.stringify(page));
    const [document] = await readDocuments(config);
    assert.equal(document.path, ''); assert.equal(document.locale, 'en');
    assert.deepEqual(document.blocks, page.blocks); assert.equal(document.markdown, '');
    await writeFile(resolve(root, 'pages/home/en.md'), '---\nblocks: []\n---\n');
    await assert.rejects(readDocuments(config), /Duplicate language/);
    await rm(resolve(root, 'pages/home/en.md'));
    await writeFile(file, JSON.stringify({...page, lang:'zh-CN'}));
    await assert.rejects(readDocuments(config), /lang must match/);
    await writeFile(file, '{broken');
    await assert.rejects(readDocuments(config), /Invalid page JSON.*en\.json/);
    assert.throws(() => parseDocumentSource('[]', file), /must be an object/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('page block validation rejects mismatched column and cell counts', async () => {
  const schema = JSON.parse(await readFile('schemas/pages.schema.json', 'utf8'));
  assert.equal(schema.type, 'object');
  const config = await loadConfig(process.cwd());
  await renderBlocks(page.blocks, {config, locale: 'en', site: {posts: [], pages: []}});
  const broken = structuredClone(page);
  broken.blocks[0].cells.pop();
  await assert.rejects(renderBlocks(broken.blocks, {config, locale: 'en', site: {posts: [], pages: []}}), /cell/);
});
