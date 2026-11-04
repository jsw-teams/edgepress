import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startPageEditor } from '../src/page-editor.js';
import {containers, moveElement, resizeRow} from '../src/page-editor-model.js';

const sample = {
  $schema: '../../../schemas/pages.schema.json',
  title: 'Hello', lang: 'en', homepage: true,
  description: 'Example', customSetting: { untouched: ['a', 'b'] },
  blocks: [{ columns: 2, cells: [
    [{ type: 'heading', level: 2, text: 'First' }],
    [{ type: 'section', title: 'Other', blocks: [{ type: 'text', text: 'Nested' }], custom: 7 }]
  ] }]
};

async function withEditor(run) {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-visual-editor-'));
  const dir = resolve(root, 'content/pages/home');
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, 'en.json');
  await writeFile(file, JSON.stringify(sample, null, 2) + '\n');
  const editor = await startPageEditor({ root, port: 0 });
  try { await run({ root, file, ...editor }); }
  finally { await editor.close(); await rm(root, { recursive: true, force: true }); }
}

test('local visual editor serves a content-safe interface and lists JSON Pages', async () => {
  await withEditor(async ({ url }) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await response.text(), /可视化 Pages 编辑器/);
    const pages = await (await fetch(url + 'api/pages')).json();
    assert.deepEqual(pages.pages, ['home/en.json']);
    const script = await fetch(url + 'editor.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  });
});

test('editor preserves unknown metadata and nested elements, detects external changes, and rejects unsafe writes', async () => {
  await withEditor(async ({ url, file, root }) => {
    const path = 'api/page?path=home%2Fen.json';
    const original = await (await fetch(url + path)).json();
    assert.deepEqual(original.page, sample);
    const payload = { page: structuredClone(original.page), revision: original.revision };
    payload.page.title = 'Edited';
    payload.page.blocks[0].cells[0][0].text = 'Updated';
    const update = () => fetch(url + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: url.slice(0, -1) }, body: JSON.stringify(payload) });
    let response = await update();
    assert.equal(response.status, 200, await response.text());
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.title, 'Edited');
    assert.equal(saved.blocks[0].cells[0][0].text, 'Updated');
    assert.deepEqual(saved.customSetting, sample.customSetting);
    assert.deepEqual(saved.blocks[0].cells[1][0], sample.blocks[0].cells[1][0]);
    response = await update();
    assert.equal(response.status, 409);
    const current = await (await fetch(url + path)).json();
    current.page.blocks[0].columns = 1;
    response = await fetch(url + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: url.slice(0, -1) }, body: JSON.stringify(current) });
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).blocks[0].columns, 2);
    response = await fetch(url + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) });
    assert.equal(response.status, 403);
    assert.equal((await fetch(url + 'api/page?path=..%2F..%2Fsecret.json')).status, 400);
    assert.equal((await fetch(url + 'api/page?path=home%2Fmissing.json')).status, 400);
    const outside = await mkdtemp(join(tmpdir(), 'edgepress-visual-outside-'));
    try {
      await writeFile(resolve(outside, 'en.json'), JSON.stringify(sample));
      await symlink(outside, resolve(root, 'content/pages/linked'), 'dir');
      const list = await (await fetch(url + 'api/pages')).json();
      assert.deepEqual(list.pages, ['home/en.json']);
      assert.equal((await fetch(url + 'api/page?path=linked%2Fen.json')).status, 400);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});

test('visual browser controls edit, preview and save a page without hand-writing JSON', { timeout: 45000 }, async () => {
  await withEditor(async ({ url, file }) => {
    const browser = await chromium.launch({ args: ['--disable-extensions'] });
    try {
      const page = await browser.newPage();
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('#page-name')?.textContent === 'Hello');
      await page.locator('.page-settings summary').click();
      await page.locator('#title').fill('Visual title');
      await page.locator('.canvas-row').first().locator('select').first().selectOption('1');
      await page.locator('#add-row').click();
      assert.equal(await page.locator('.canvas-row').count(), 2);
      await page.locator('.canvas-row').last().locator('.pick').click();
      await page.locator('#fields textarea[aria-label="text"]').fill('Typed in the visual editor');
      await page.locator('#save').click();
      await page.locator('#status.saved').waitFor();
      const result = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(result.title, 'Visual title');
      assert.equal(result.blocks[0].columns, 1);
      assert.equal(result.blocks[0].cells[0].length, 2);
      assert.equal(result.blocks[0].cells[0][1].custom, 7);
      assert.equal(result.blocks[1].cells[0][0].text, 'Typed in the visual editor');
      assert.deepEqual(result.customSetting, sample.customSetting);
    } finally { await browser.close(); }
  });
});

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');

test('editor moves original nested objects without cycles or destructive column merges',()=>{
  const page=structuredClone(sample),heading=page.blocks[0].cells[0][0],section=page.blocks[0].cells[1][0];
  moveElement(page,heading,section.blocks,0);
  assert.equal(section.blocks[0],heading);
  assert.equal(section.custom,7);
  const before=JSON.stringify(page);
  assert.throws(()=>moveElement(page,section,section.blocks,0),/自己的子分区/);
  assert.equal(JSON.stringify(page),before);
  moveElement(page,heading,page.blocks[0].cells[0],0);
  resizeRow(page.blocks[0],1);
  assert.equal(page.blocks[0].cells[0][1],section);
  assert.deepEqual(section.blocks,[{type:'text',text:'Nested'}]);
  assert.equal(containers(page).length,2);
});

test('local image API validates bytes and origin, preserves originals, and refuses linked or escaped paths',async()=>{
  await withEditor(async({url,root})=>{
    const origin=new URL(url).origin;
    const upload=(bytes,name='picture.png',headers={})=>fetch(url+'api/images',{method:'POST',headers:{Origin:origin,'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name),...headers},body:bytes});
    assert.equal((await upload(png,'a.png',{Origin:'https://elsewhere.test'})).status,403);
    assert.equal((await upload(Buffer.from('<svg onload="alert(1)"></svg>'),'x.png')).status,400);
    assert.equal((await upload(Buffer.alloc(10*1024*1024+1),'large.png')).status,413);
    const response=await upload(png,'../../小图片.png');assert.equal(response.status,201);
    const image=await response.json();assert.match(image.path,/^\/uploads\/小图片\.[a-f0-9]{16}\.png$/);
    assert.deepEqual([image.width,image.height],[1,1]);
    const duplicate=await upload(png,'小图片.png');assert.equal((await duplicate.json()).path,image.path);
    const fetched=await fetch(url+'api/image?path='+encodeURIComponent(image.path));assert.equal(fetched.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),png);
    assert.equal((await (await fetch(url+'api/images?q='+encodeURIComponent('小图片'))).json()).total,1);
    assert.equal((await fetch(url+'api/image?path='+encodeURIComponent('/../config.yml'))).status,400);
    const outside=await mkdtemp(join(tmpdir(),'edgepress-images-outside-'));
    try{
      await writeFile(resolve(outside,'secret.png'),png);
      await symlink(outside,resolve(root,'content/assets/linked'),'dir');
      assert.equal((await (await fetch(url+'api/images?q=secret')).json()).total,0);
      assert.equal((await fetch(url+'api/image?path='+encodeURIComponent('/linked/secret.png'))).status,400);
      const uploads=resolve(root,'content/assets/uploads');await rm(uploads,{recursive:true});await symlink(outside,uploads,'dir');
      assert.equal((await upload(png)).status,400);
      await assert.rejects(readFile(resolve(outside,'picture.png')),/ENOENT/);
    }finally{await rm(outside,{recursive:true,force:true});}
  });
});

test('browser moves across columns and nested sections, undoes, uploads and reuses pictures, and saves the exact hierarchy',{timeout:60000},async()=>{
  await withEditor(async({url,file,root})=>{
    const pageSource=structuredClone(sample);pageSource.blocks[0].cells[0].push({type:'text',text:'Keep this column'});
    await writeFile(file,JSON.stringify(pageSource));
    const browser=await chromium.launch({args:['--disable-extensions','--disable-gpu']});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url);await page.locator('#status.saved').waitFor();
      await page.locator('.canvas-cell').first().locator('.pick').first().click();
      await page.locator('.relationship summary').click();
      await page.getByRole('combobox',{name:'目标容器'}).selectOption({label:'第 1 行 › 栏 2 › Other'});
      await page.getByRole('button',{name:'移动到这里',exact:true}).click();
      assert.equal(await page.locator('.nested-elements [data-type=heading]').count(),1);
      await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await page.locator('.nested-elements [data-type=heading]').count(),0);
      await page.getByRole('button',{name:'重做',exact:true}).click();
      // A real HTML drag moves the nested heading back into the first column.
      await page.locator('.nested-elements [data-type=heading] .element-grip').dragTo(page.locator('.canvas-cell').first().locator(':scope > .drop-zone'));
      assert.equal(await page.locator('.nested-elements [data-type=heading]').count(),0);
      await page.locator('.canvas-cell').first().getByRole('button',{name:'图片',exact:true}).click();
      await page.locator('#image-upload').setInputFiles({name:'studio.png',mimeType:'image/png',buffer:png});
      await page.locator('.image-dialog').waitFor({state:'detached'});
      await page.locator('#fields [aria-label=alt]').fill('Uploaded studio');
      await page.waitForFunction(()=>document.querySelector('.canvas-cell img')?.naturalWidth===1);
      await page.locator('.canvas-cell').first().getByRole('button',{name:'图片',exact:true}).click();
      await page.locator('.image-dialog').getByRole('button',{name:/studio\.[a-f0-9]+\.png/}).click();
      await page.locator('#save').click();await page.locator('#status.saved').waitFor();
      const saved=JSON.parse(await readFile(file,'utf8'));
      assert.deepEqual(saved.customSetting,sample.customSetting);
      assert.deepEqual(saved.blocks[0].cells[0].map(block=>block.type),['text','heading','image','image']);
      assert.deepEqual(saved.blocks[0].cells[1][0],sample.blocks[0].cells[1][0]);
      assert.equal(saved.blocks[0].cells[0][2].src,saved.blocks[0].cells[0][3].src);
      assert.deepEqual([saved.blocks[0].cells[0][3].width,saved.blocks[0].cells[0][3].height],[1,1]);
      assert.deepEqual(await readFile(resolve(root,'content/assets'+saved.blocks[0].cells[0][2].src)),png);
      // Selection and ordinary typing do not replace the full canvas or create history per character.
      const heading=page.locator('[data-type=heading] .pick');await heading.click();
      const handle=await page.locator('.canvas-row').elementHandle();
      await page.locator('#fields [aria-label=text]').fill('A revised heading');
      assert.equal(await handle.evaluate(node=>node.isConnected),true);
      await page.locator('.nested-elements [data-type=text] .pick').click();
      await page.locator('.relationship summary').click();
      await page.getByRole('combobox',{name:'目标容器'}).selectOption({label:'第 1 行 › 栏 1'});
      await page.getByRole('button',{name:'移动到这里',exact:true}).click();
      await page.locator('#save').click();await page.locator('#status.error').waitFor();
      assert.match(await page.locator('#status').innerText(),/Other 为空/);
      assert.deepEqual(JSON.parse(await readFile(file,'utf8')),saved,'Invalid draft must not replace the saved page');
      await page.getByRole('button',{name:'撤销',exact:true}).click();
      await page.locator('.canvas-cell').first().locator(':scope > .cell-actions select').selectOption('feature-grid');
      await page.locator('.canvas-cell').first().locator(':scope > .cell-actions').getByRole('button',{name:'＋ 添加',exact:true}).click();
      assert.equal(await page.locator('#fields .array-item').count(),1,JSON.stringify({status:await page.locator('#status').innerText(),fields:await page.locator('#fields').innerText(),errors}));
      await page.locator('#fields .array-item').getByRole('button',{name:'移除',exact:true}).click();
      await page.locator('#fields').getByRole('button',{name:'＋ 添加项目',exact:true}).click();
      assert.equal(await page.locator('#fields .array-item [aria-label=title]').count(),1,'An empty card list must retain its object fields');
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  });
});
