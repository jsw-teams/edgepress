// Capture real guest terminal/editor/browser interactions, never host input or drawn terminal frames.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {workbench} from './demo-workbench.mjs';
import {recordingContext,record,closeRecording} from './desktop-recording.mjs';
import {activate,pointAt} from './vm-desktop.mjs';

const root=resolve(import.meta.dirname,'../..'),artifact=resolve(root,'tools/.recordings/cli-native');
const output=resolve(root,'content/assets/images/previews');
await mkdir(artifact,{recursive:true});await mkdir(output,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
const context=await recordingContext(browser,{locale:'en'},artifact);
let bench;
try{
 bench=await workbench({artifact,packageRoot:root,locale:'en',context});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await record(page,'edgepress-cli-local',async({omitWait})=>{
  await bench.activateTerminal();await bench.newPost();
  await bench.editPost('## A working local site\n\nThis article was created in the real CLI and saved in Geany.\n\nThe local preview runs with **npm run deploy:local**.');
  await bench.activateTerminal();await bench.startServer({omitWait,command:'npm run deploy:local --'});
  await activate('Chromium');await page.goto('https://edgepress-demo.test/');
  const link=page.getByRole('link',{name:bench.title,exact:true}).first();
  await link.waitFor();await pointAt(page,link);await link.click();
  await page.getByRole('heading',{name:'A working local site',exact:true}).waitFor();
  await new Promise(done=>setTimeout(done,2400));
 },{foreground:()=>bench.activateTerminal()});
 assert.deepEqual(errors,[]);
 const entries=await closeRecording(context,{artifact,output,source:'tools/recordings/capture-cli-demo.mjs'});
 await writeFile(resolve(artifact,'result.json'),JSON.stringify(entries,null,2)+'\n');
}finally{await bench?.dispose();await browser.close();}
