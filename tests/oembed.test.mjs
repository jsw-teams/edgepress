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
 const document=(await readDocuments(config)).find(item=>item.kind==='posts'&&item.locale==='en');assert.ok(document);const extensions=await createExtensions(config);const post={...document,html:await extensions.renderer('.md').render('A seaside field note.\n\n!embed[ishare]('+service+'/s/'+'a'.repeat(32)+')',{config,document})};
 const routes=await generateBuiltinRoutes({posts:[post],pages:[]},config,await createExtensions(config));const page=routes.find(route=>route.path===post.path+'index.html');assert.ok(page);assert.match(page.body,/A seaside field note/);assert.match(page.body,/data-edgepress-oembed="ishare"/);assert.doesNotMatch(page.body,/<iframe/);
});
test('Markdown embed syntax keeps the post body as the source of truth',async()=>{
 const config=await loadConfig(root);await loadLanguagePacks(config);config.browserPlugins.services=[{id:'ishare',provider:'oembed',backendUrl:'https://ishare.example',sourceOrigins:['https://ishare.example'],enabled:true,name:'ishare'}];
 const extensions=await createExtensions(config),renderer=extensions.renderer('.md');
 const html=await renderer.render('Before\n\n!embed[ishare](https://ishare.example/s/'+'a'.repeat(32)+')\n\nAfter',{config,document:{locale:'en'}});
 assert.match(html,/data-edgepress-oembed="ishare"/);assert.match(html,/data-oembed-placeholder/);assert.doesNotMatch(html,/<iframe/);
 const ordinary=await renderer.render('![A photo](https://ishare.example/photo.jpg)',{config,document:{locale:'en'}});assert.match(ordinary,/<img/);assert.doesNotMatch(ordinary,/data-edgepress-oembed/);
});
test('oEmbed automatically loads visible content after consent and on return, and strips unsafe vendor HTML',async()=>{
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
      if(url.origin===service){if(url.pathname==='/api'){calls++;assert.equal(route.request().headers()['x-service-action'],'oembed');assert.equal(decodeURIComponent(route.request().headers()['x-service-resource']),service+'/s/'+'a'.repeat(32));return route.fulfill({contentType:'application/json',body:JSON.stringify({version:'1.0',type:'rich',title:'Image',width:640,height:480,html:'<iframe src="'+service+'/embed/'+'a'.repeat(32)+'" onload="window.bad=true" style="position:fixed"></iframe>'})});}frames++;return route.fulfill({contentType:'text/html',body:'Author / source<script>window.addEventListener("message",event=>{if(event.origin==="'+origin+'"&&event.data.type==="edgepress:embed-theme")window.hostTheme=event.data.colors;});window.parent.postMessage({type:"edgepress:embed-ready"},"'+origin+'");window.parent.postMessage({type:"edgepress:embed-size",height:555},"'+origin+'");</script>'});}
      if(url.origin!==origin)throw Error('Unexpected external request '+url.href);
      if(url.pathname.startsWith('/edgepress/')){try{return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'image/svg+xml',body:await readFile(resolve(root,'static',url.pathname.slice(1)))});}catch{return route.fulfill({status:404,body:''});}}
      return route.fulfill({contentType:'text/html',body:filter('<!doctype html><html style="--accent:#7242b4"><body><main>'+blocks+'</main><script type="module" src="/edgepress/oembed.js"></script></body></html>',{config,page:{locale:'en'}})});
    });
    const page=await context.newPage();await page.goto(origin+'/embedding/');await page.locator('.privacy-panel').waitFor({state:'visible'});assert.equal(calls,0);
    await page.locator('input[value=ishare]').check();assert.equal(calls,0);await page.locator('.privacy-save').click();
    await page.locator('[data-oembed-status] iframe').waitFor();assert.equal(calls,1);assert.equal(await page.locator('[data-oembed-load]').count(),0);assert.equal(await page.locator('iframe').getAttribute('onload'),null);assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts allow-same-origin allow-presentation');
    await page.reload();await page.locator('[data-oembed-status] iframe').waitFor();assert.equal(calls,2);
    await page.waitForFunction(()=>document.querySelector('iframe').style.height==='555px');const child=page.frames().find(frame=>frame.url().startsWith(service));await child.waitForFunction(()=>window.hostTheme?.['--accent']==='#7242b4');
    await page.evaluate(service=>window.dispatchEvent(new MessageEvent('message',{origin:service,source:window,data:{type:'edgepress:embed-size',height:3000}})),service);assert.equal(await page.locator('iframe').evaluate(frame=>frame.style.height),'555px');
    const sanitized=await page.evaluate(async()=>{const {trustedEmbed}=await import('/edgepress/oembed.js');for(const html of ['<iframe src="https://evil.example/a"></iframe>','<script>alert(1)</script>','<iframe src="https://share.js.gripe/embed/a"></iframe><img src="https://evil.example/a">']){try{trustedEmbed({version:'1.0',type:'rich',width:640,height:480,html},'https://share.js.gripe',document);return false;}catch{}}return true;});assert.equal(sanitized,true);
    if(!await page.locator('.privacy-panel').isVisible()){await page.locator('.privacy-settings-button').focus();await page.keyboard.press('Enter');}await page.locator('.privacy-panel').waitFor({state:'visible'});await page.locator('input[value=ishare]').uncheck();await Promise.all([page.waitForEvent('load'),page.locator('.privacy-save').click()]);await page.locator('[data-oembed-load]').waitFor();assert.equal(calls,2);assert.equal(await page.locator('iframe').count(),0);
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
      if(url.origin==='https://www.tiktok.com'){vendor++;return route.fulfill({contentType:'text/javascript',body:'globalThis.tiktokRuns=(globalThis.tiktokRuns||0)+1;document.querySelectorAll("blockquote.tiktok-embed").forEach(block=>block.dataset.tiktokRendered="true");'});}
      if(url.origin==='https://platform.x.com'){vendor++;return route.fulfill({contentType:'text/javascript',body:'globalThis.twttr={widgets:{load(root){const block=root.querySelector(".twitter-tweet");if(block)block.dataset.rendered="true"}}};'});}
      assert.equal(url.origin,origin,'No unconfigured origin is contacted');
      if(url.pathname.startsWith('/edgepress/')){try{return route.fulfill({body:await readFile(resolve(root,'static',url.pathname.slice(1))),contentType:url.pathname.endsWith('.js')?'text/javascript':'image/svg+xml'});}catch{return route.fulfill({status:404,body:''});}}
      return route.fulfill({contentType:'text/html',body:filter('<!doctype html><html><head><style>*{box-sizing:border-box}.page-row{display:grid;grid-template-columns:1fr}.page-cell{min-width:0}body{margin:8px}</style></head><body><main>'+blocks+'</main><script type="module" src="/edgepress/oembed.js"></script></body></html>',{config,page:{locale:'en'}})});
    });
    const page=await context.newPage();await page.goto(origin+'/mixed/');await page.locator('.privacy-panel').waitFor({state:'visible'});assert.equal(vendor,0);assert.match(await page.locator('[data-edgepress-oembed=youtube] [data-oembed-notice]').innerText(),/YouTube.*unloaded/i);
    await page.locator('input[value=youtube]').check();await page.locator('input[value=x-posts]').check();await page.locator('input[value=custom-video-fixture]').check();assert.equal(vendor,0);await page.locator('.privacy-save').click();
    for(const root of await page.locator('[data-edgepress-oembed]').all()){await root.scrollIntoViewIfNeeded();await page.waitForFunction(node=>node.dataset.loaded==='true',await root.elementHandle());}
    await page.locator('iframe').scrollIntoViewIfNeeded();await page.frameLocator('iframe').getByText('Player',{exact:true}).waitFor();await page.locator('.twitter-tweet[data-rendered=true]').waitFor();await page.locator('blockquote[data-tiktok-rendered=true]').nth(1).waitFor();assert.ok(vendor>=3&&vendor<=4);assert.equal(await page.evaluate(()=>window.tiktokRuns),2);assert.equal(await page.evaluate(()=>!!window.bad),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.reload();for(const root of await page.locator('[data-edgepress-oembed]').all()){await root.scrollIntoViewIfNeeded();await page.waitForFunction(node=>node.dataset.loaded==='true',await root.elementHandle());}await page.locator('blockquote[data-tiktok-rendered=true]').nth(1).waitFor();await page.locator('iframe').scrollIntoViewIfNeeded();await page.frameLocator('iframe').getByText('Player',{exact:true}).waitFor();assert.ok(vendor>=6&&vendor<=8);assert.equal(await page.evaluate(()=>window.tiktokRuns),2);await context.close();
    youtube.enabled=false;x.enabled=false;assert.equal(await renderBlocks([{columns:1,cells:[[{type:'oembed',integration:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'}]]}],{config,locale:'en'}).then(html=>html.includes('data-edgepress-oembed')),false);
    assert.match(await renderBlocks([{columns:1,cells:[[{type:'oembed',integration:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'}]]}],{config,locale:'en'}),/disabled|turned off/i);
    assert.equal(extendConsentPolicy('/*\n  Content-Security-Policy: default-src \'self\'',config).includes('youtube'),false);
  }finally{if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
});
