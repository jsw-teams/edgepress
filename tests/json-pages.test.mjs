import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getLanguageService, TextDocument} from 'vscode-json-languageservice';
import {loadConfig} from '../src/config.js';
import {parseDocumentSource, readDocuments} from '../src/content.js';

const page = {title:'JSON page', lang:'en', homepage:true, blocks:[{columns:2,cells:[[{type:'heading',level:2,text:'Left'},{type:'text',text:'Text with "quotes"\nand 中文'}],[{type:'text',text:'Right'}]]}]};

test('shipped Pages resolve their local schema and validate through the VS Code service', async () => {
  const service=getLanguageService({schemaRequestService:uri=>{
    const url=new URL(uri);assert.equal(url.protocol,'file:');return readFile(url,'utf8');
  },workspaceContext:{resolveRelativePath:(relative,resource)=>new URL(relative,resource).href}});
  const files=await readdir('content/pages',{recursive:true});
  assert.ok(files.filter(file=>file.endsWith('.json')).length);
  for(const file of files.filter(file=>file.endsWith('.json'))){
    const absolute=resolve('content/pages',file),text=await readFile(absolute,'utf8');
    assert.ok(JSON.parse(text).$schema,file+' must link its schema');
    const document=TextDocument.create(pathToFileURL(absolute).href,'json',1,text);
    assert.deepEqual(await service.doValidation(document,service.parseJSONDocument(document)),[],file);
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
    assert.equal(document.path, '');assert.equal(document.locale, 'en');
    assert.deepEqual(document.blocks, page.blocks);assert.equal(document.markdown, '');
    await writeFile(resolve(root, 'pages/home/en.md'), '---\nblocks: []\n---\n');
    await assert.rejects(readDocuments(config), /Duplicate language/);
    await rm(resolve(root, 'pages/home/en.md'));
    await writeFile(file, JSON.stringify({...page, lang:'zh-CN'}));
    await assert.rejects(readDocuments(config), /lang must match/);
    await writeFile(file, '{broken');
    await assert.rejects(readDocuments(config), /Invalid page JSON.*en\.json/);
    assert.throws(() => parseDocumentSource('[]', file), /must be an object/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('VS Code JSON service validates rows, cells and elements and provides their nested outline and folding', async () => {
  const schema = JSON.parse(await readFile('schemas/pages.schema.json', 'utf8'));
  const service = getLanguageService({});
  const text = JSON.stringify(page, null, 2);
  const document = TextDocument.create('file:///page.json', 'json', 1, text);
  const parsed = service.parseJSONDocument(document);
  assert.deepEqual(await service.doValidation(document, parsed, undefined, schema), []);
  const outline = service.findDocumentSymbols2(document, parsed);
  const blocks = outline.find(symbol => symbol.name === 'blocks');
  const cells = blocks.children[0].children.find(symbol => symbol.name === 'cells');
  assert.equal(cells.children.length, 2);
  assert.equal(cells.children[0].children.length, 2);
  const folds = service.getFoldingRanges(document);
  for (const symbol of [blocks, cells, cells.children[0], cells.children[0].children[0]]) assert.ok(folds.some(range => range.startLine === symbol.range.start.line && range.endLine >= symbol.range.end.line - 1), symbol.name+' folds independently');
  const broken = structuredClone(page);broken.blocks[0].cells.pop();
  const invalid = TextDocument.create('file:///invalid.json', 'json', 1, JSON.stringify(broken, null, 2));
  assert.ok((await service.doValidation(invalid, service.parseJSONDocument(invalid), undefined, schema)).length);
});
