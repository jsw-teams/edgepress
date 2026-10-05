import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {renderBlocks} from '../src/page-blocks.js';
import consentManager from '../plugins/consent/index.js';
import {extendConsentPolicy} from '../src/consent-csp.js';
import {resolveEmbed,sanitizeEmbed} from '../src/oembed.js';
import {readDocuments} from '../src/content.js';
import {generateBuiltinRoutes} from '../src/generators.js';
import {createExtensions} from '../src/plugin-api.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
test('posts use the same consent-controlled oEmbed blocks as Pages',async()=>{
 const config=await loadConfig(root);await loadLanguagePacks(config);const service='https://ishare.example';config.browserPlugins.services=[{id:'ishare',provider:'oembed',backendUrl:service,enabled:true,name:'ishare',purpose:'Load the shared post.',dataCategories:'Requested media and IP address.',recipient:'ishare',retention:'Until deletion.',privacyUrl:service+'/privacy/'}];
 const document=(await readDocuments(config)).find(item=>item.kind==='posts'&&item.locale==='en');assert.ok(document);const post={...document,html:'<p>A seaside field note.</p>',embeds:[{integration:'ishare',url:service+'/s/'+'a'.repeat(32),title:'Seaside post'}]};
 const routes=await generateBuiltinRoutes({posts:[post],pages:[]},config,await createExtensions(config));const page=routes.find(route=>route.path===post.path+'index.html');assert.ok(page);assert.match(page.body,/A seaside field note/);assert.match(page.body,/data-edgepress-oembed="ishare"/);assert.doesNotMatch(page.body,/<iframe/);
});
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

test('third-party metadata is cached, mixed Pages cells wait for consent, and YouTube/X/TikTok render repeatedly on demand',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'edgepress-oembed-'));
  const config=await loadConfig(root),origin=new URL(config.site.url).origin;
  const youtube=config.browserPlugins.services.find(s=>s.id==='youtube'),x=config.browserPlugins.services.find(s=>s.id==='x-posts'),tiktok={...structuredClone(youtube),id:'custom-video-fixture',name:'Custom video fixture',backendUrl:'https://www.tiktok.com',oembedEndpoint:'https://www.tiktok.com/oembed',sourceOrigins:['https://www.tiktok.com'],embedOrigins:['https://www.tiktok.com'],embedScripts:['https://www.tiktok.com/embed.js']};
  await loadLanguagePacks(config);config.browserPlugins.services=[youtube,x,tiktok];config.resolvedPaths.cache=directory;
  const data={version:'1.0',type:'video',width:640,height:360,title:'Video',html:'<iframe src="https://www.youtube.com/embed/jNQXAC9IVRw" onload="window.bad=true"></iframe><script>window.bad=true</script>'};
  let lookups=0;const fetcher=async()=>{lookups++;return new Response(JSON.stringify(data));};
  let browser;
  try{
    await resolveEmbed(youtube,'https://www.youtube.com/watch?v=jNQXAC9IVRw',config,fetcher);
    assert.equal((await resolveEmbed(youtube,'https://www.youtube.com/watch?v=jNQXAC9IVRw',config,fetcher)).type,'video');assert.equal(lookups,1);
    const tweet={version:'1.0',type:'rich',width:550,height:null,html:'<blockquote class="twitter-tweet"><p>Shared text</p><a href="https://x.com/user/status/123">Original</a></blockquote><script src="https://evil.example/a.js"></script>'};
    const oldFetch=globalThis.fetch;globalThis.fetch=async address=>new Response(JSON.stringify(String(address).includes('tiktok')?{version:'1.0',type:'rich',width:325,height:700,html:'<blockquote class="tiktok-embed" data-video-id="123"><section>Video</section></blockquote>'}:tweet));
    let blocks;try{blocks=await renderBlocks([{columns:2,cells:[[{type:'text',heading:'Context',text:'Text beside media'},{type:'oembed',integration:'x-posts',url:'https://x.com/user/status/123'},{type:'oembed',integration:'custom-video-fixture',url:'https://www.tiktok.com/@user/video/123'},{type:'oembed',integration:'custom-video-fixture',url:'https://www.tiktok.com/@user/video/124'}],[{type:'oembed',integration:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',caption:'Video description'}]]}],{config,locale:'en'});}finally{globalThis.fetch=oldFetch;}
    assert.match(blocks,/data-oembed-data/);assert.doesNotMatch(blocks,/<iframe|<script/);assert.match(blocks,/Video description/);
    assert.doesNotMatch(sanitizeEmbed(data,youtube).html,/onload|script/);
    let filter;consentManager({registerFilter:(_n,fn)=>filter=fn});
    browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});const context=await browser.newContext({viewport:{width:390,height:844}});let vendor=0;
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://www.youtube.com'){assert.equal(route.request().headers().referer,origin+'/');vendor++;return route.fulfill({contentType:'text/html',body:'Player'});}
      if(url.origin==='https://www.tiktok.com'){vendor++;return route.fulfill({contentType:'text/javascript',body:'document.querySelectorAll("blockquote.tiktok-embed").forEach(block=>block.dataset.tiktokRendered="true");'});}
      if(url.origin==='https://platform.x.com'){vendor++;return route.fulfill({contentType:'text/javascript',body:'globalThis.twttr={widgets:{load(root){root.querySelector("blockquote").dataset.rendered="true"}}};'});}
      assert.equal(url.origin,origin,'No unconfigured origin is contacted');
      if(url.pathname.startsWith('/edgepress/')){try{return route.fulfill({body:await readFile(resolve(root,'static',url.pathname.slice(1))),contentType:url.pathname.endsWith('.js')?'text/javascript':'image/svg+xml'});}catch{return route.fulfill({status:404,body:''});}}
      return route.fulfill({contentType:'text/html',body:filter('<!doctype html><html><head><style>*{box-sizing:border-box}.page-row{display:grid;grid-template-columns:1fr}.page-cell{min-width:0}body{margin:8px}</style></head><body><main>'+blocks+'</main><script type="module" src="/edgepress/oembed.js"></script></body></html>',{config,page:{locale:'en'}})});
    });
    const page=await context.newPage();await page.goto(origin+'/mixed/');await page.locator('.privacy-panel').waitFor({state:'visible'});assert.equal(vendor,0);assert.match(await page.locator('[data-edgepress-oembed=youtube] [data-oembed-notice]').innerText(),/YouTube.*unloaded/i);
    await page.locator('input[value=youtube]').check();await page.locator('input[value=x-posts]').check();await page.locator('input[value=custom-video-fixture]').check();await page.locator('.privacy-save').click();assert.equal(vendor,0);
    await page.locator('[data-edgepress-oembed=youtube] [data-oembed-load]').click();await page.locator('iframe').waitFor();await page.waitForFunction(()=>document.querySelector('[data-edgepress-oembed=youtube] [data-oembed-notice]').textContent.includes('loaded'));
    await page.locator('[data-edgepress-oembed=x-posts] [data-oembed-load]').click();await page.locator('blockquote[data-rendered=true]').waitFor();assert.equal(vendor,2);assert.equal(await page.evaluate(()=>!!window.bad),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('[data-edgepress-oembed=custom-video-fixture] [data-oembed-load]').nth(0).click();await page.locator('blockquote[data-tiktok-rendered=true]').nth(0).waitFor();await page.locator('[data-edgepress-oembed=custom-video-fixture] [data-oembed-load]').click();await page.locator('blockquote[data-tiktok-rendered=true]').nth(1).waitFor();assert.equal(vendor,4);
    await page.reload();assert.equal(vendor,4);await context.close();
    youtube.enabled=false;x.enabled=false;assert.equal(await renderBlocks([{columns:1,cells:[[{type:'oembed',integration:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'}]]}],{config,locale:'en'}).then(html=>html.includes('data-edgepress-oembed')),false);
    assert.match(await renderBlocks([{columns:1,cells:[[{type:'oembed',integration:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'}]]}],{config,locale:'en'}),/disabled|turned off/i);
    assert.equal(extendConsentPolicy('/*\n  Content-Security-Policy: default-src \'self\'',config).includes('youtube'),false);
  }finally{if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
});
