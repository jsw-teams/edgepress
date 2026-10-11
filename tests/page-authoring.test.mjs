import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderBlocks} from '../src/page-blocks.js';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';

async function context(){const config=await loadConfig(process.cwd());await loadLanguagePacks(config);return {config,locale:'en',site:{posts:[],pages:[]}};}

test('the published JSON example parses and renders with the same ordered containment',async()=>{
  const guide=JSON.parse(await readFile('content/pages/page-authoring/en.json','utf8'));
  const example=guide.blocks.flatMap(row=>row.cells.flat()).find(block=>block.type==='code'&&block.language==='json').code;
  const page=JSON.parse(example);
  const equivalent=[{columns:2,cells:[[{type:'heading',level:2,text:'About this project'},{type:'text',text:'A small tool for everyday writing.'}],[{type:'link-list',title:'Read more',items:[{label:'Project',url:'/[launge]/project-introduction/'}]}]]}];
  assert.deepEqual(page.blocks,equivalent);
  assert.equal(await renderBlocks(page.blocks,await context()),await renderBlocks(equivalent,await context()));
});

test('a missing cell identifies the row and actual column/cell counts',async()=>{
  await assert.rejects(renderBlocks([{columns:1,cells:[[{type:'text',text:'First'}]]},{columns:2,cells:[[{type:'text',text:'Second'}]]}],await context()),/blocks\[1\] \(row 2\).*columns: 2; cells: 1/);
});

test('nested invalid content identifies its row, cell and element without weakening validation',async()=>{
  const rows=[{columns:2,cells:[[{type:'text',text:'Safe'}],[{type:'section',title:'Links',blocks:[{type:'link-list',title:'Unsafe',items:[{label:'Bad',url:'javascript:alert(1)'}]}]}]]}];
  await assert.rejects(renderBlocks(rows,await context()),/blocks\[0\].*cells\[1\].*elements\[0\].*elements\[0\].*safe site path/);
  assert.match(await renderBlocks([{columns:1,cells:[[{type:'text',text:'<script>alert(1)</script>'}]]}],await context()),/&lt;script&gt;/);
});
