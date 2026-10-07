import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,realpath,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {chromium} from 'playwright';
import {readPostRevision} from '../src/revisions.js';
import {changedPassages,renderRevisionCards} from '../src/revision-cards.js';
import {revisionImageFile} from '../src/revision-images.js';
import {collectImageDimensions} from '../src/image-dimensions.js';
import {writeAssets} from '../src/assets.js';
import {buildSite} from '../src/build.js';
const exec=promisify(execFile);
const source=(body,extra='')=>`---\ntitle: Article\n${extra}---\n${body}\n`;
test('builder restores actual old/new images, detects same-path pixel changes, and fingerprints only recent snapshots',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'edgepress-image-history-')),assetsRoot=join(folder,'content/assets'),postRoot=join(folder,'content/posts/2000-01-01-scene'),file=join(postRoot,'en.md');
 t.after(async()=>{const parent=await realpath(tmpdir()),target=await realpath(folder),path=relative(parent,target);assert.ok(!isAbsolute(path)&&!path.startsWith('..'));await rm(target,{recursive:true,force:true});});
 await mkdir(assetsRoot,{recursive:true});await mkdir(postRoot,{recursive:true});const git=args=>exec('git',args,{cwd:folder});await git(['init','-q']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);
 const svg=color=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="'+color+'"/></svg>');
 const commit=async()=>{await git(['add','.']);await git(['commit','-qm','update']);};
 const old=svg('red'),now=svg('blue');await writeFile(join(assetsRoot,'old.svg'),old);await writeFile(file,source('Previous wording.\n\n![Scene](/old.svg)'));await commit();
 await rm(join(assetsRoot,'old.svg'));await writeFile(join(assetsRoot,'new.svg'),now);await writeFile(file,source('Clearer wording.\n\n![Scene](/new.svg)'));await commit();
 let current=await readFile(file,'utf8'),revision=await readPostRevision(file,current,true,assetsRoot);assert.equal(revision.revisionAssets.length,2);assert.ok(revision.revisionAssets.some(asset=>asset.content.equals(old)));assert.ok(revision.revisionAssets.some(asset=>asset.content.equals(now)));
 const labels={postChanges:'Recent changes',postChangeBefore:'Previously',postChangeAfter:'Now',postChangeAdded:'Added',postChangeRemoved:'Removed'},html=await renderRevisionCards(revision.changes,key=>labels[key],revision.revisionImages);assert.match(html,/Previous wording/);assert.match(html,/Clearer wording/);assert.equal((html.match(/<img /g)||[]).length,2);assert.doesNotMatch(html,/src="\/(?:old|new)\.svg"/);assert.match(html,/loading="lazy"/);
 const output=join(folder,'output');await writeAssets({assets:revision.revisionAssets,existingHeaders:''},output);for(const asset of revision.revisionAssets)assert.deepEqual(await readFile(join(output,asset.path)),asset.content);assert.match(await readFile(join(output,'_headers'),'utf8'),/max-age=31536000, immutable/);const dimensions=await collectImageDimensions(revision.revisionAssets);assert.equal(dimensions.size,2);
 await mkdir(join(folder,'languages/base'),{recursive:true});await writeFile(join(folder,'languages/base/en.json'),'{}');await writeFile(join(folder,'config.yml'),'site:\n  title: Revision fixture\n  url: https://revision.example\n  language: en\nplugins:\n  consent:\n    enabled: false\n    proposedDate: 2026-10-06\n    expiresDays: 180\n');await cp(new URL('../themes/default',import.meta.url),join(folder,'themes/default'),{recursive:true});
 await buildSite(folder);const published=await readFile(join(folder,'dist/2000/01/scene/index.html'),'utf8');assert.match(published,/Most recent changes/);assert.match(published,/<img[^>]*src="\/edgepress\/revisions\/image\.[a-f0-9]{16}\.svg"[^>]*width="120"[^>]*height="80"/);for(const asset of revision.revisionAssets)assert.deepEqual(await readFile(join(folder,'dist',asset.path)),asset.content);
 await writeFile(join(assetsRoot,'new.svg'),svg('green'));await commit();revision=await readPostRevision(file,current,true,assetsRoot);assert.equal(revision.revisionAssets.length,2);assert.equal(revision.revisionImages.before['/new.svg']===revision.revisionImages.after['/new.svg'],false);assert.doesNotMatch(revision.changes,/Previous wording/);
 await writeFile(file,source('Clearer wording.','image: /new.svg\n'));await commit();await writeFile(file,source('Clearer wording.','image: /old.svg\n'));await commit();revision=await readPostRevision(file,await readFile(file,'utf8'),true,assetsRoot);assert.match(revision.changes,/-!\[Cover\]\(\/new.svg\)/);assert.match(revision.changes,/\+!\[Cover\]\(\/old.svg\)/);assert.equal(revision.revisionAssets.length,1,'Missing bytes retain description without a broken request');
 for(const href of ['https://outside.invalid/photo.png','//outside.invalid/a.png','/../en.md','/%2e%2e/secret.png','/a\\b.png'])assert.equal(revisionImageFile(href,assetsRoot),null);
});
test('article updates show safe readable before/after passages rather than Git patch data',async()=>{
 const patch='@@ -1,3 +1,3 @@\n unchanged\n-Previous **explanation**\n+Updated **explanation** <script>bad()</script>\n unchanged\n@@ -9 +9,2 @@\n+An added [link](javascript:alert(1))\n';
 assert.equal(changedPassages(patch).length,2);
 const labels={postChanges:'Recent changes',postChangeBefore:'Previously',postChangeAfter:'Now',postChangeAdded:'Added',postChangeRemoved:'Removed'};
 const html=await renderRevisionCards(patch,key=>labels[key]);
 assert.match(html,/Previously/);assert.match(html,/Now/);assert.match(html,/<strong>explanation<\/strong>/);assert.match(html,/Added/);
 assert.doesNotMatch(html,/@@|diff --git|unchanged|<script|javascript:|bad\(\)/);
 assert.equal(await renderRevisionCards('@@ -1 +1 @@\n unchanged',key=>labels[key]),'');
 assert.doesNotMatch(await renderRevisionCards('-# Old heading\n+# New heading',key=>labels[key]),/<h[1-6][ >]/);
 const pictures=await renderRevisionCards('-![Old cover](/removed.svg)\n+![New cover](/new.webp)',key=>labels[key]);assert.match(pictures,/Old cover/);assert.match(pictures,/New cover/);assert.doesNotMatch(pictures,/<img|removed.svg|new.webp/);
});
test('revision cards wrap on narrow screens, follow each theme and support keyboard disclosure',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const labels={postChanges:'What changed',postChangeBefore:'Previously',postChangeAfter:'Now',postChangeAdded:'Added',postChangeRemoved:'Removed'};
 const html=await renderRevisionCards('-Images open directly in the page.\n+Click a picture to open the **full-size viewer**. Close it to return to your reading position.\n unchanged\n+The player adapts to your website colors.',key=>labels[key]);
 try{for(const theme of ['default','folio','signal','atelier'])for(const width of [320,1000])for(const mode of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:700},colorScheme:mode}),page=await context.newPage();
  const css=await readFile(new URL('../themes/'+theme+'/assets/style.css',import.meta.url),'utf8');
  await page.setContent('<!doctype html><html lang="en" data-theme="'+mode+'"><head><title>Article update preview</title><style>'+css+'</style></head><body><main><article class="post"><header><h1>Small improvements, explained.</h1></header>'+html+'</article></main></body></html>');
  await page.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('details').getAttribute('open'),'');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+' '+mode+' '+width);
  await page.evaluate(()=>document.documentElement.style.setProperty('--accent','#7242b4'));const color=await page.locator('.post-change-after').first().evaluate(node=>getComputedStyle(node).borderInlineStartColor);assert.equal(color,'rgb(114, 66, 180)');
  if(process.env.EDGEPRESS_CAPTURE && theme==='default' && width===1000 && mode==='light'){await mkdir('content/assets/images/previews',{recursive:true});await page.locator('main').screenshot({path:'content/assets/images/previews/edgepress-revisions-en.png'});}
  await context.close();
 }}finally{await browser.close();}
});
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
   await page.addScriptTag({content:script});values.push(await page.locator('time').allTextContents());
   assert.equal(await page.locator('time').last().getAttribute('title'),'2026-10-03');
   await context.close();
  }
  assert.match(values[0][0],/October 3/);assert.match(values[1][0],/October 2/);
  assert.equal(values[0][1],values[1][1]);assert.match(values[0][1],/October 3/);
 }finally{await browser.close();}
});
