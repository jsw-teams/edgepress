import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

test('recording blocks reject foreign GIFs and unbounded durations',async()=>{
 const config={site:{},i18n:{defaultLocale:'en',translationsByLocale:{en:{demoPlay:'Watch',demoPause:'Pause',demoReplay:'Replay',demoError:'Unavailable'}}}};
 const block={type:'media-text',mediaType:'image',src:'/poster.webp',animationSrc:'/demo.gif',animationDuration:2000,alt:'Publish a post',title:'Publishing',text:'One story.'};
 const render=override=>renderBlocks([{columns:1,cells:[[{...block,...override}]]}],{config,locale:'en',site:{posts:[]}});
 assert.match(await render({}),/data-project-demo/);
 for(const animationSrc of ['https://foreign.example/demo.gif','//foreign.example/demo.gif','/movie.mp4'])await assert.rejects(render({animationSrc}));
 for(const animationDuration of [0,999,120001,2000.5])await assert.rejects(render({animationDuration}));
});

test('recordings wait for a click, pause visibly and replay cached bytes without broken blob URLs',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),errors=[];let downloads=0;
 try{
  const context=await browser.newContext(),page=await context.newPage(),gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.hostname,'demo.test');if(url.pathname==='/demo.js')return route.fulfill({contentType:'text/javascript',body:await readFile('static/edgepress/project-demo.js')});if(url.pathname==='/demo.gif'){downloads++;return route.fulfill({contentType:'image/gif',body:gif});}return route.fulfill({contentType:'text/html',body:'<html><body><div data-project-demo data-animation="/demo.gif" data-duration="2000" data-play="Watch" data-pause="Pause" data-replay="Replay" data-error="Unavailable"><img alt="Demo" src="data:image/gif;base64,'+gif.toString('base64')+'"><canvas hidden></canvas><button aria-label="Watch: Demo">Watch</button><span role="status"></span></div><script src="/demo.js"></script></body></html>'});});
  await page.goto('https://demo.test/');assert.equal(downloads,0);await page.getByRole('button',{name:'Watch: Demo'}).click();await page.getByRole('button',{name:'Pause: Demo'}).waitFor();assert.equal(downloads,1);await page.getByRole('button',{name:'Pause: Demo'}).click();assert.equal(await page.locator('canvas').isVisible(),true);await page.getByRole('button',{name:'Replay: Demo'}).click();await page.getByRole('button',{name:'Pause: Demo'}).waitFor();assert.equal(downloads,1);assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
