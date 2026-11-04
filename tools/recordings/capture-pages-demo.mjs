// Real Pages editing in the private VM, served by the standalone CLI.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {workbench} from './demo-workbench.mjs';
import {recordingContext,record,closeRecording} from './desktop-recording.mjs';
import {activate,pointAt} from './vm-desktop.mjs';

const root=resolve(import.meta.dirname,'../..');
const artifact=resolve(root,'tools/.recordings/pages-native');
const output=resolve(root,'content/assets/images/previews');
await mkdir(artifact,{recursive:true});await mkdir(output,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const context=await recordingContext(browser,{locale:'zh-CN'},artifact);
const pause=ms=>new Promise(done=>setTimeout(done,ms));
let bench;
try{
 bench=await workbench({artifact,packageRoot:root,locale:'zh-CN',context});
 const page=await context.newPage(),errors=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 async function click(locator){await pointAt(page,locator);await pause(350);await locator.click();await pause(650);}
 async function type(locator,text){await pointAt(page,locator);await locator.fill('');await locator.pressSequentially(text,{delay:55});await pause(700);}
 const row=index=>page.locator('.canvas-row').nth(index);
 const cell=(r,c)=>row(r).locator('.canvas-cell').nth(c);
 const field=name=>page.locator('#fields').getByRole('textbox',{name,exact:true}).first();
 async function add(r,c,type){const target=cell(r,c);await pointAt(page,target.getByRole('combobox',{name:'选择要添加的元素类型'}));await target.getByRole('combobox').selectOption(type);await pause(600);await click(target.getByRole('button',{name:'＋ 添加',exact:true}));}
 await record(page,'edgepress-pages-editor',async({omitWait})=>{
  await bench.generate();await pause(1500);
  await bench.startServer({omitWait,command:'edgepress s'});
  await activate('Chromium');await page.goto(bench.previewUrl+'/');
  await click(page.getByRole('link',{name:'编辑 Pages',exact:true}));
  assert.equal(new URL(page.url()).pathname,'/__edgepress/');
  await page.locator('#status.saved').waitFor();await pause(1400);
  await click(page.getByRole('button',{name:'＋ 新建页面',exact:true}));
  await type(page.locator('#create-title'),'周末工作室');
  await type(page.locator('#create-slug'),'weekend-studio');
  await click(page.getByRole('button',{name:'创建并编辑',exact:true}));
  await page.locator('#page-name').filter({hasText:'周末工作室'}).waitFor();
  await click(row(0).locator('.pick').first());
  await type(field('title'),'从灵感开始');
  await type(field('text'),'把喜欢的事，做成一个小小的网站。');
  await click(page.getByRole('button',{name:'＋ 行',exact:true}));
  await pointAt(page,row(1).getByRole('combobox',{name:'第 2 行的栏数'}));
  await row(1).getByRole('combobox',{name:'第 2 行的栏数'}).selectOption('2');await pause(1000);
  await click(cell(1,0).locator('.pick').first());
  await type(field('text'),'记录灵感，分享每一次小小的进展。');
  await add(1,0,'heading');await type(field('text'),'关于工作室');
  await click(cell(1,0).locator('.element').last().getByRole('button',{name:'↑',exact:true}));
  await click(cell(1,1).locator('.pick').first());
  await type(field('text'),'写作、摄影与网页设计，从这里开始。');
  await add(1,1,'notice');await type(field('title'),'每周更新');
  await type(field('text'),'每个周末，发布一个新的小作品。');
  await click(page.getByRole('button',{name:'＋ 行',exact:true}));
  await add(2,0,'feature-grid');await type(field('title'),'我们在做什么');
  await click(cell(2,0).locator('.element').first().getByRole('button',{name:'×',exact:true}));
  await click(cell(2,0).locator('.pick').first());
  const item=page.locator('#fields .array-item').first();
  await type(item.getByRole('textbox',{name:'title',exact:true}),'记录与分享');
  await type(item.getByRole('textbox',{name:'text',exact:true}),'用文章与页面整理创作，让每一个想法都有自己的位置。');
  await click(page.getByRole('button',{name:'保存更改',exact:true}));
  await page.locator('#status.saved').waitFor();await pause(1800);
  const saved=JSON.parse(await readFile(resolve(bench.root,'content/pages/weekend-studio/zh-cn.json'),'utf8'));
  assert.equal(saved.blocks[1].columns,2);
  assert.deepEqual(saved.blocks[1].cells[0].map(block=>block.type),['heading','text']);
  assert.equal(saved.blocks[2].cells[0][0].items[0].title,'记录与分享');
  let rebuilt=false;
  for(let attempt=0;attempt<60;attempt++){
   const response=await fetch(bench.previewUrl+'/weekend-studio/');
   if(response.ok&&(await response.text()).includes('记录与分享')){rebuilt=true;break;}
   await pause(500);
  }
  assert.ok(rebuilt,'Saving must rebuild the real themed page');
  await click(page.getByRole('link',{name:'返回网站预览',exact:true}));
  await page.goto(bench.previewUrl+'/weekend-studio/');
  await page.getByRole('heading',{name:'周末工作室',level:1,exact:true}).waitFor();
  await pause(2500);
  await pointAt(page,page.getByRole('heading',{name:'我们在做什么',exact:true}));await pause(2200);
  await page.getByRole('heading',{name:'周末工作室',level:1,exact:true}).scrollIntoViewIfNeeded();await pause(3500);
 },{foreground:()=>bench.activateTerminal()});
 assert.deepEqual(errors,[]);
 const entries=await closeRecording(context,{artifact,output,source:'tools/recordings/capture-pages-demo.mjs',kind:'FFmpeg recording of the private X11 desktop; real edgepress g and edgepress s, Pages creation, two-column layout, element insertion, reordering, nested fields, save and themed preview; preview startup wait shortened'});
 await writeFile(resolve(artifact,'result.json'),JSON.stringify(entries,null,2)+'\n');
}finally{await bench?.dispose();await context.close().catch(()=>{});await browser.close();}
