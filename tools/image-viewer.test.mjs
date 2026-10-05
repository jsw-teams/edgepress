import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {collectAssets,rewriteAssetLinks} from '../src/assets.js';
import {renderLayout} from '../src/theme.js';
import {renderBlocks} from '../src/page-blocks.js';
import {renderMarkdown} from '../src/markdown.js';
import {contentPermissions} from '../src/consent-csp.js';

test('content originals are validated and participate in CSP without permitting inert embeds',async()=>{
 const config=await loadConfig(fileURLToPath(new URL('../',import.meta.url))),context={config,locale:'en'};
 const html=await renderBlocks([{columns:1,cells:[[{type:'image',src:'https://preview.example/p.png',originalSrc:'https://original.example/p.png',alt:'Picture'}]]}],context);assert.match(html,/data-original="https:\/\/original.example\/p.png"/);
 await assert.rejects(renderBlocks([{columns:1,cells:[[{type:'image',src:'/image.png',originalSrc:'javascript:alert(1)',alt:'Picture'}]]}],context));
 const markdown=await renderMarkdown('<img src="/p.png" data-original="javascript:alert(1)" alt="Picture">');assert.doesNotMatch(markdown,/javascript|data-original/);
 const permissions=contentPermissions([{body:html+'<template><img data-original="https://blocked.example/p.png"></template>'}]);assert.deepEqual(permissions['img-src'],['https://preview.example','https://original.example']);
});

test('article and Pages images open the shared viewer; originals wait for clicks and blocked services remain untouched',async()=>{
 const config=await loadConfig(fileURLToPath(new URL('../',import.meta.url)));await loadLanguagePacks(config);const bundle=await collectAssets(config),assets=new Map(bundle.assets.map(item=>['/'+item.path,item]));
 assert.match(bundle.urlMap['/edgepress/image-viewer-lib.js'],/\.[a-f0-9]{16}\.js$/);assert.doesNotMatch(assets.get(bundle.urlMap['/edgepress/image-viewer-lib.js']).content.toString(),/hls\.js|cdn\.plyr|cloudflarestream/);
 const body='<article><div class="post-content"><p>Keep the article visible.</p><img src="/preview.svg" data-original="https://pictures.example/original.svg" alt="Article picture"><a href="/other-page/"><img src="/preview.svg" alt="Navigation picture"></a><div data-edgepress-oembed="blocked"><img src="/preview.svg" data-original="https://pictures.example/blocked.svg" alt="Blocked picture"></div></div><figure class="image-block"><img src="/preview.svg" alt="Pages picture"></figure></article>';
 const html=rewriteAssetLinks(await renderLayout(config,{filter:async(_name,value)=>value},{title:'Images',locale:'zh-CN',urlPath:'/images/'},body),bundle.urlMap),svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#388b65"/></svg>';
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{for(const width of [320,1280]){const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[];let originals=0;
  page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='pictures.example'){assert.notEqual(url.pathname,'/blocked.svg');originals++;return route.fulfill({contentType:'image/svg+xml',body:svg});}
   if(url.pathname==='/images/')return route.fulfill({contentType:'text/html',body:html});if(url.pathname==='/preview.svg')return route.fulfill({contentType:'image/svg+xml',body:svg});const asset=assets.get(url.pathname);if(!asset)return route.fulfill({status:404,body:''});const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};return route.fulfill({contentType:types[extname(url.pathname)]||'text/plain',body:asset.content||await readFile(asset.source)});
  });await page.goto('https://site.example/images/');await page.getByRole('button',{name:'放大图片: Article picture'}).waitFor();assert.equal(originals,0);assert.equal(await page.locator('[alt="Navigation picture"]').getAttribute('role'),null);assert.equal(await page.locator('[alt="Blocked picture"]').getAttribute('role'),null);
  await page.getByRole('button',{name:'放大图片: Article picture'}).click();await page.locator('.image-lightbox[open]').waitFor();await page.waitForFunction(()=>document.querySelector('.image-lightbox-photo').naturalWidth>0);assert.equal(originals,1);await page.getByRole('button',{name:'关闭图片',exact:true}).click();await page.locator('.image-lightbox').waitFor({state:'detached'});assert.equal(await page.locator('[alt="Article picture"]').evaluate(image=>image===document.activeElement),true);
  await page.getByRole('button',{name:'放大图片: Pages picture'}).click();await page.locator('.image-lightbox[open]').waitFor();await page.keyboard.press('Escape');await page.locator('.image-lightbox').waitFor({state:'detached'});assert.equal(originals,1);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await context.close();
 }}finally{await browser.close();}
});
