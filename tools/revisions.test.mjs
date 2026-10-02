import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {chromium} from 'playwright';
import {readPostRevision} from '../src/revisions.js';
const exec=promisify(execFile);
const source=(body,extra='')=>`---\ntitle: Article\n${extra}---\n${body}\n`;
test('actual content history excludes metadata and hides the diff by default',async t=>{
 const prefix=join(tmpdir(),'edgepress-history-');const folder=await mkdtemp(prefix);
 t.after(async()=>{const parent=await realpath(tmpdir()), target=await realpath(folder), path=relative(parent,target);assert.ok(!isAbsolute(path)&&!path.startsWith('..')&&target.startsWith(prefix));await rm(target,{recursive:true,force:true});});
 const git=args=>exec('git',args,{cwd:folder});const file=join(folder,'en.md');
 await git(['init','-q']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);
 const commit=async text=>{await writeFile(file,text);await git(['add','en.md']);await git(['commit','-qm','update']);};
 await commit(source('Original content'));assert.deepEqual(await readPostRevision(file,source('Original content'),true),{updated:null,changes:''});
 await commit(source('Changed content <script>danger</script>'));
 await commit(source('Changed content <script>danger</script>','pinned: true\n'));
 const current=await readFile(file,'utf8');const hidden=await readPostRevision(file,current);
 assert.ok(hidden.updated instanceof Date);assert.equal(hidden.changes,'');
 const visible=await readPostRevision(file,current,true);
 assert.equal(visible.updated.toISOString(),hidden.updated.toISOString());
 assert.match(visible.changes,/-Original content/);assert.match(visible.changes,/\+Changed content/);assert.doesNotMatch(visible.changes,/pinned:|diff --git|before\.md|after\.md/);
 await writeFile(file,source('Working content'));
 assert.match((await readPostRevision(file,source('Working content'),true)).changes,/\+Working content/);
 assert.deepEqual(await readPostRevision(join(folder,'untracked.md'),source('Never published'),true),{updated:null,changes:''});
});
test('reader timezone changes timestamps while preserving date-only publication dates',async()=>{
 const script=await readFile(new URL('../static/edgepress/local-time.js',import.meta.url),'utf8');
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{
  const values=[];
  for(const timeZone of ['Asia/Tokyo','America/Los_Angeles']) {
   const context=await browser.newContext({timezoneId:timeZone});const page=await context.newPage();
   await page.setContent('<time data-local-time data-time-locale="en" datetime="2026-10-03T00:30:00Z"></time><time data-local-time data-time-locale="en" data-date-only="true" datetime="2026-10-03T00:00:00Z"></time>');
   await page.addScriptTag({content:script});values.push(await page.locator('time').allTextContents());await context.close();
  }
  assert.match(values[0][0],/October 3/);assert.match(values[1][0],/October 2/);
  assert.equal(values[0][1],values[1][1]);assert.match(values[0][1],/October 3/);
 }finally{await browser.close();}
});
