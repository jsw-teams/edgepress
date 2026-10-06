import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {renderBlocks} from '../src/page-blocks.js';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {renderLayout} from '../src/theme.js';

test('the complete theme initializes and includes the recording runtime',async()=>{
 const config=await loadConfig(process.cwd());await loadLanguagePacks(config);
 const html=await renderLayout(config,{filter:async(_key,value)=>value},{title:'Demo',locale:'en',urlPath:'/demo/'},'<main data-project-demo></main>');
 assert.match(html,/src="\/edgepress\/project-demo\.js"/);
});

test('a progressive recording begins playback before the entire response arrives',async()=>{
 const bytes=await readFile('tools/fixtures/recording.mp4'),runtime=await readFile('static/edgepress/project-demo.js');let completed=false;
 const server=createServer((request,response)=>{
  if(request.url==='/demo.js'){response.setHeader('Content-Type','text/javascript');response.end(runtime);return;}
  if(request.url==='/recording.mp4'){
   response.setHeader('Content-Type','video/mp4');response.setHeader('Content-Length',bytes.length);response.write(bytes.subarray(0,Math.floor(bytes.length*.9)));
   const tail=setTimeout(()=>{completed=true;response.end(bytes.subarray(Math.floor(bytes.length*.9)));},3000);response.on('close',()=>clearTimeout(tail));return;
  }
  response.setHeader('Content-Type','text/html');response.end('<html><body><div data-project-demo data-animation="/recording.mp4" data-play="Play" data-resume="Continue" data-pause="Pause" data-replay="Replay" data-loading="Loading" data-error="Unavailable"><div class="project-demo-media" style="width:320px;height:180px"><video muted playsinline preload="none" aria-label="Demo"></video></div><button>Play</button><span role="status"></span></div><script src="/demo.js"></script></body></html>');
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Play: Demo'}).click();await page.waitForFunction(()=>document.querySelector('video').currentTime>.2);assert.equal(completed,false,'First playback must not wait for the full file');}
 finally{await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
});

test('recording blocks accept local streaming media and reject foreign or GIF sources',async()=>{
 const config={site:{},i18n:{defaultLocale:'en',translationsByLocale:{en:{demoPlay:'Play',demoResume:'Continue',demoPause:'Pause',demoReplay:'Replay',demoLoading:'Loading',demoError:'Unavailable'}}}};
 const block={type:'media-text',mediaType:'image',src:'/poster.webp',animationSrc:'/demo.mp4',alt:'Publish a post',title:'Publishing',text:'One story.'};
 const render=override=>renderBlocks([{columns:1,cells:[[{...block,...override}]]}],{config,locale:'en',site:{posts:[]}});
 assert.match(await render({}),/<video muted playsinline preload="none"/);assert.match(await render({animationSrc:'/demo.webm'}),/data-project-demo/);
 for(const animationSrc of ['https://foreign.example/demo.mp4','//foreign.example/demo.mp4','/demo.gif','/file.txt'])await assert.rejects(render({animationSrc}));
});

test('manual recordings support seeking and preserve the playhead without automatic playback',async()=>{
 // Twelve-second silent test-pattern fixture, generated with FFmpeg and faststart.
 const bytes=await readFile('tools/fixtures/recording.mp4'),browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:600,height:600}}),page=await context.newPage(),errors=[];let downloads=0;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.hostname,'demo.test');
   if(url.pathname==='/demo.js')return route.fulfill({contentType:'text/javascript',body:await readFile('static/edgepress/project-demo.js')});
   if(url.pathname==='/demo.mp4'){downloads++;return route.fulfill({contentType:'video/mp4',headers:{'Accept-Ranges':'bytes'},body:bytes});}
   return route.fulfill({contentType:'text/html',body:'<html><style>body{margin:0}.spacer{height:2500px}.project-demo-media{position:relative;width:400px;height:225px}.project-demo-media img,.project-demo-media video{position:absolute;width:100%;height:100%}[hidden]{display:none!important}</style><body><div class="spacer"></div><div data-project-demo data-animation="/demo.mp4" data-play="Play" data-resume="Continue" data-pause="Pause" data-replay="Replay" data-loading="Loading" data-error="Unavailable"><div class="project-demo-media"><img alt="Demo" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><video hidden muted playsinline preload="none" aria-label="Demo"></video></div><button aria-label="Play: Demo">Play</button><input data-demo-seek type="range" min="0" max="1" value="0" step="0.1" disabled aria-label="Demo progress"><span data-demo-time></span><span role="status"></span></div><div class="spacer"></div><script src="/demo.js"></script></body></html>'});
  });
  await page.goto('https://demo.test/');await page.waitForTimeout(300);assert.equal(downloads,0,'Far-away recordings must not load');
  await page.locator('[data-project-demo]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('video').duration===12);assert.equal(await page.locator('video').evaluate(v=>v.paused),true);assert.equal(await page.locator('video').evaluate(v=>v.currentTime),0);await page.getByRole('button',{name:'Play: Demo'}).click();await page.waitForFunction(()=>document.querySelector('video').currentTime>.4);assert.ok(downloads>0);assert.equal(await page.locator('video').evaluate(v=>v.currentSrc), 'https://demo.test/demo.mp4');
  await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>document.querySelector('video').paused);const paused=await page.locator('video').evaluate(v=>v.currentTime);await page.waitForTimeout(400);assert.equal(await page.locator('video').evaluate(v=>v.currentTime),paused);
  await page.locator('[data-project-demo]').scrollIntoViewIfNeeded();await page.waitForTimeout(200);assert.equal(await page.locator('video').evaluate(v=>v.currentTime),paused);await page.getByRole('button',{name:'Continue: Demo'}).click();await page.waitForFunction(at=>document.querySelector('video').currentTime>at+.3,paused);
  await page.getByRole('button',{name:'Pause: Demo'}).click();const chosen=await page.locator('video').evaluate(v=>v.currentTime);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);await page.locator('[data-project-demo]').scrollIntoViewIfNeeded();await page.waitForTimeout(350);assert.equal(await page.locator('video').evaluate(v=>v.currentTime),chosen);assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
  await page.getByRole('button',{name:'Continue: Demo'}).click();await page.waitForFunction(at=>document.querySelector('video').currentTime>at+.3,chosen);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));const before=await page.locator('video').evaluate(v=>v.currentTime);await page.waitForTimeout(100);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));await page.waitForTimeout(200);assert.equal(await page.locator('video').evaluate(v=>v.currentTime),before);const seek=page.getByRole('slider',{name:'Demo progress'});await seek.fill('6');await seek.dispatchEvent('input');await page.waitForFunction(()=>document.querySelector('video').currentTime===6);assert.equal(await page.locator('video').evaluate(v=>v.paused),true);assert.equal(await page.locator('[data-demo-time]').textContent(),'0:06 / 0:12');await seek.focus();await seek.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('video').currentTime>6);await page.getByRole('button',{name:'Continue: Demo'}).click();
  await page.locator('video').evaluate(v=>v.currentTime=11.8);await page.waitForFunction(()=>document.querySelector('video').ended);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);await page.locator('[data-project-demo]').scrollIntoViewIfNeeded();assert.equal(await page.locator('video').evaluate(v=>v.currentTime),12);await page.getByRole('button',{name:'Replay: Demo'}).click();await page.waitForFunction(()=>document.querySelector('video').currentTime>.1&&document.querySelector('video').currentTime<1);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
