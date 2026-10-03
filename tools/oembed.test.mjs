import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import {renderBlocks} from '../src/page-blocks.js';
import consentManager from '../plugins/consent/index.js';
import {extendConsentPolicy} from '../src/consent-csp.js';
const root=fileURLToPath(new URL('../',import.meta.url));
test('oEmbed pages validate origins, need consent and a click, and strip unsafe vendor HTML',async()=>{
  const config=await loadConfig(root),origin=new URL(config.site.url).origin,service='https://share.js.gripe';
  config.browserPlugins.services=[{id:'ishare',provider:'oembed',backendUrl:service,enabled:true,name:'ishare',purpose:'Load shared images and videos.',dataCategories:'IP address and requested media.',recipient:'ishare',retention:'Until publisher deletion.',privacyUrl:service+'/privacy.html'}];
  const rows=[{columns:1,cells:[[{type:'oembed',integration:'ishare',url:service+'/s/'+'a'.repeat(32),title:'Shared image'}]]}];
  const blocks=await renderBlocks(rows,{config,locale:'en'});assert.match(blocks,/data-edgepress-oembed/);assert.doesNotMatch(blocks,/<iframe/);
  await assert.rejects(renderBlocks([{columns:1,cells:[[{type:'oembed',integration:'ishare',url:'https://evil.example/a'}]]}],{config,locale:'en'}),/origin/);
  const policy=extendConsentPolicy('/*\n  Content-Security-Policy: default-src \'self\'; connect-src \'none\'',config);assert.match(policy,/frame-src 'self' https:\/\/share.js.gripe/);assert.match(policy,/img-src 'self' https:\/\/share.js.gripe/);
  let filter;consentManager({registerFilter:(_name,fn)=>{filter=fn;}});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  try{
    const context=await browser.newContext();let calls=0,frames=0;
    await context.route('**/*',async route=>{const url=new URL(route.request().url());
      if(url.origin===service){if(url.pathname==='/api'){calls++;assert.equal(route.request().headers()['x-service-action'],'oembed');assert.equal(decodeURIComponent(route.request().headers()['x-service-resource']),service+'/s/'+'a'.repeat(32));return route.fulfill({contentType:'application/json',body:JSON.stringify({version:'1.0',type:'rich',title:'Image',width:640,height:480,html:'<iframe src="'+service+'/embed/'+'a'.repeat(32)+'" onload="window.bad=true" style="position:fixed"></iframe>'})});}frames++;return route.fulfill({contentType:'text/html',body:'Author / source'});}
      if(url.origin!==origin)throw Error('Unexpected external request '+url.href);
      if(url.pathname.startsWith('/edgepress/')){try{return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'image/svg+xml',body:await readFile(resolve(root,'static',url.pathname.slice(1)))});}catch{return route.fulfill({status:404,body:''});}}
      return route.fulfill({contentType:'text/html',body:filter('<!doctype html><html><body><main>'+blocks+'</main><script type="module" src="/edgepress/oembed.js"></script></body></html>',{config,page:{locale:'en'}})});
    });
    const page=await context.newPage();await page.goto(origin+'/embedding/');await page.locator('.privacy-panel').waitFor({state:'visible'});assert.equal(calls,0);
    await page.locator('input[value=ishare]').check();await page.locator('.privacy-save').click();await page.waitForFunction(()=>document.querySelector('.privacy-panel').hidden);assert.equal(calls,0);assert.equal(frames,0);
    await page.locator('[data-oembed-load]').click();await page.locator('[data-oembed-status] iframe').waitFor();assert.equal(calls,1);assert.equal(await page.locator('iframe').getAttribute('onload'),null);assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts allow-same-origin allow-presentation');
    await page.reload();await page.locator('[data-oembed-load]').waitFor();assert.equal(calls,1);
    const sanitized=await page.evaluate(async()=>{const {trustedEmbed}=await import('/edgepress/oembed.js');for(const html of ['<iframe src="https://evil.example/a"></iframe>','<script>alert(1)</script>','<iframe src="https://share.js.gripe/embed/a"></iframe><img src="https://evil.example/a">']){try{trustedEmbed({version:'1.0',type:'rich',width:640,height:480,html},'https://share.js.gripe',document);return false;}catch{}}return true;});assert.equal(sanitized,true);
    await context.close();
  }finally{await browser.close();}
});
