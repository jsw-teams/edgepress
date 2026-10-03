import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {extendConsentPolicy,injectConsentPolicy,contentPermissions,validateServiceCsp,serializeConsentHeaders} from '../src/consent-csp.js';

test('CSP is generated without source headers and removes disabled service permissions',()=>{
  const services=[{provider:'external-widget',backendUrl:'https://comments.example',moduleUrl:'https://comments.example/widget.js'},{provider:'cloudflare-web-analytics'},{enabled:false,provider:'oembed',backendUrl:'https://disabled.example',embedOrigins:['https://disabled-media.example']}];
  const config={browserPlugins:{services,consent:{enabled:true}}};
  const headers=extendConsentPolicy('',config);
  assert.match(headers,/Content-Security-Policy: default-src 'self'/);
  assert.match(headers,/script-src 'self' https:\/\/comments.example https:\/\/static.cloudflareinsights.com/);
  assert.match(headers,/connect-src 'self' https:\/\/comments.example https:\/\/cloudflareinsights.com/);
  assert.doesNotMatch(headers,/disabled/);
  assert.doesNotMatch(headers,/unsafe-eval/);
  services[0].enabled=false;services[1].enabled=false;
  assert.doesNotMatch(extendConsentPolicy('',config),/comments.example|cloudflareinsights/);
  const custom={csp:{'connect-src':['https://api.example','https://*.media.example']}};
  assert.doesNotThrow(()=>validateServiceCsp(custom));
  for(const csp of [{'script-src':["'unsafe-inline'"]},{'connect-src':['https://user:pass@example.com']},{'default-src':['https://example.com']},{'connect-src':['https://example.com; script-src *']}])assert.throws(()=>validateServiceCsp({csp}));
});

test('global source policy and content media survive generation without granting inert embeds permission',()=>{
  const config={browserPlugins:{services:[]},contentCsp:contentPermissions([{body:'<img src="https://pictures.example/image.webp"><video src="https://video.example/movie.mp4"></video><template><img src="https://disabled.example/a"></template>'}])};
  const headers=extendConsentPolicy("/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https://uploads.example; frame-ancestors 'none'",config);
  const html=injectConsentPolicy('<html><head><title>Site</title></head><body></body></html>',headers);
  assert.match(html,/http-equiv="Content-Security-Policy"/);assert.match(html,/https:\/\/uploads.example/);assert.match(html,/https:\/\/pictures.example/);assert.match(html,/https:\/\/video.example/);
  assert.doesNotMatch(html,/frame-ancestors|disabled.example/);assert.match(headers,/frame-ancestors 'none'/);
  const json=JSON.stringify({example:'<html><head></head><body><img src="https://metadata.example/a"></body></html>'});
  assert.equal(injectConsentPolicy(json,headers),json);assert.deepEqual(contentPermissions([{body:json,contentType:'application/json'}]),{});
});

test('HTML CSP enforces configured origins on static platforms without custom response headers',async()=>{
  const headers=extendConsentPolicy('',{browserPlugins:{services:[{provider:'external-api',backendUrl:'https://allowed.example'}]}});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  try{const context=await browser.newContext();let allowed=0,blocked=0;
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='https://allowed.example'){allowed++;return route.fulfill({body:'OK',headers:{'Access-Control-Allow-Origin':'*'}});}if(url.origin==='https://blocked.example'){blocked++;return route.fulfill({body:'BAD'});}return route.fulfill({contentType:'text/html',body:injectConsentPolicy('<html><head></head><body></body></html>',headers)});});
    const page=await context.newPage();await page.goto('https://site.example/');
    const result=await page.evaluate(async()=>{let rejected=false;await fetch('https://allowed.example/api');try{await fetch('https://blocked.example/api');}catch{rejected=true;}return rejected;});
    assert.equal(result,true);assert.equal(allowed,1);assert.equal(blocked,0);await context.close();
  }finally{await browser.close();}
});

test('large CSP policies obey the 2000-character header limit without intersecting allowed origin lists',async()=>{
  const origins=Array.from({length:24},(_,i)=>'https://media-'+i+'.provider.example');
  const source=extendConsentPolicy('',{browserPlugins:{services:[{provider:'oembed',backendUrl:'https://allowed.example',embedOrigins:origins}]}});
  assert.ok(source.split('\n').some(line=>line.length>2000));
  const serialized=serializeConsentHeaders(source),policies=serialized.split('\n').filter(line=>/^\s*Content-Security-Policy:/.test(line)).map(line=>line.replace(/^\s*Content-Security-Policy:\s*/,''));
  assert.ok(policies.length>1);assert.ok(serialized.split('\n').every(line=>line.length<=2000));
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  try{const context=await browser.newContext();let blocked=0,frames=0;
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='https://site.example')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':policies.join(', ')},body:'<html><head></head><body></body></html>'});if(url.origin==='https://blocked.example')blocked++;if(url.pathname==='/embed')frames++;return route.fulfill({contentType:url.pathname==='/embed'?'text/html':'text/plain',body:'OK',headers:{'Access-Control-Allow-Origin':'*'}});});
    const page=await context.newPage();await page.goto('https://site.example/');
    const result=await page.evaluate(async origins=>{for(const origin of origins)await fetch(origin+'/api');let rejected=false;try{await fetch('https://blocked.example/api');}catch{rejected=true;}return rejected;},['https://allowed.example',...origins]);
    assert.equal(result,true);assert.equal(blocked,0);
    await page.evaluate(origin=>{const frame=document.createElement('iframe');frame.src=origin+'/embed';document.body.append(frame);},origins[0]);await page.frameLocator('iframe').locator('body').waitFor();assert.equal(frames,1);
    assert.equal(await page.evaluate(()=>new Promise((resolve,reject)=>{const worker=new Worker(URL.createObjectURL(new Blob(['postMessage(42)'],{type:'text/javascript'})));worker.onmessage=event=>{worker.terminate();resolve(event.data);};worker.onerror=()=>reject(new Error('Configured blob Worker was blocked'));})),42);
    await context.close();
  }finally{await browser.close();}
});
