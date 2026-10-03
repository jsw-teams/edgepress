import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import consentManager from '../plugins/consent/index.js';
import {choiceSnapshot,readChoice} from '../static/edgepress/plugins/consent/choices.js';
const root=fileURLToPath(new URL('../',import.meta.url));

test('saved formal choices survive the provider rename, while an actual endpoint change requires consent',()=>{
 const original=Object.fromEntries(['localStorage','sessionStorage','document','location'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const values=new Map();const store={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const privacy={controller:{name:'Publisher',contact:'mail@example.com'},policyUrl:'/privacy/',consent:{enabled:true,proposedDate:'2026-10-03',effectiveDate:'2026-10-03',expiresDays:180},integrations:[{id:'github-comments',provider:'commentnest',backendUrl:'https://website.example',category:'comments',name:'CommentNest',purpose:'Read comments'}]};
 const previous=structuredClone(privacy);previous.integrations[0].provider='github-comments';previous.integrations[0].name='GitHub comments';delete previous.integrations[0].backendUrl;
 const saved={proposedDate:'2026-10-03',effectiveDate:'2026-10-03',expiresAt:Date.now()+86400000,allowed:['github-comments'],fingerprint:JSON.stringify(previous)};
 const config={privacy,siteOrigin:'https://website.example/',choiceFingerprint:'current-fingerprint',choiceSnapshot:choiceSnapshot(privacy)};
 try {
  Object.assign(globalThis,{localStorage:store,sessionStorage:store,document:{cookie:''},location:{protocol:'https:'}});values.set('edgepress-privacy-selection',JSON.stringify(saved));
  assert.deepEqual(readChoice(config).allowed,['github-comments']);assert.equal(JSON.parse(values.get('edgepress-privacy-selection')).fingerprint,'current-fingerprint');
  values.set('edgepress-privacy-selection',JSON.stringify(saved));const changed=structuredClone(config);changed.privacy.integrations[0].backendUrl='https://new-service.example';changed.choiceSnapshot=choiceSnapshot(changed.privacy);changed.choiceFingerprint='different-fingerprint';assert.equal(readChoice(changed),null);
 }finally{for(const [name,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
test('privacy choices survive refresh, pages, locales, cosmetic rebuilds and blocked localStorage; withdrawal stays off',async()=>{
 const config=await loadConfig(root),origin=new URL(config.site.url).origin;
 const integration={id:'discussion',provider:'commentnest',backendUrl:'https://comments.example.com',category:'comments',name:'Discussion',purpose:'Read discussions.',dataCategories:'Identity and comments.',recipient:'GitHub',retention:'Until removed.',privacyUrl:'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'};
 config.browserPlugins.comments={enabled:true,services:[integration]};
 let filter;consentManager({registerFilter:(_name,fn)=>{filter=fn;}});
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try {for(const blocked of [false,true]) {
 const context=await browser.newContext();
 if(blocked)await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage denied');}});});
 let loads=0,cosmetic=false,policyChanged=false;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.fulfill({status:404,body:''});
  if(url.pathname.endsWith('/commentnest.js'))return route.fulfill({contentType:'text/javascript',body:'export function load(){fetch("/integration-probe");}'});
  if(url.pathname==='/integration-probe'){loads++;return route.fulfill({body:'ok'});}
  if(url.pathname.startsWith('/edgepress/')) {
   try{return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'image/svg+xml',body:await readFile(resolve(root,'static',url.pathname.slice(1)))});}catch{return route.fulfill({status:404,body:''});}
  }
  const current=structuredClone(config);
  if(cosmetic)current.browserPlugins.comments.services[0].name='Localized new presentation';
  if(policyChanged)current.browserPlugins.consent.effectiveDate='2026-10-04';
  const html=filter('<!doctype html><html><body><main>Article</main></body></html>',{config:current,page:{locale:url.pathname.includes('translated')?'zh-CN':'en'}});
  return route.fulfill({contentType:'text/html',body:html});
 });
 const page=await context.newPage();await page.goto(origin+'/article/');await page.locator('.privacy-panel').waitFor({state:'visible'});assert.equal(loads,0);
 await page.locator('input[value=discussion]').check();await page.locator('.privacy-save').click();await page.waitForFunction(()=>document.querySelector('.privacy-panel').hidden);await page.waitForTimeout(50);assert.equal(loads,1);
 for(const path of ['/article/','/translated/article/','/another/']) {await page.goto(origin+path);await page.locator('.privacy-settings-button').waitFor();await page.waitForTimeout(50);assert.ok(await page.locator('.privacy-panel').isHidden());assert.ok(await page.locator('input[value=discussion]').isChecked());}
 assert.equal(loads,4);
 cosmetic=true;await page.reload();await page.locator('.privacy-settings-button').waitFor();await page.waitForTimeout(50);assert.ok(await page.locator('.privacy-panel').isHidden());assert.equal(loads,5);
 await page.locator('.privacy-settings-button').click();await page.locator('input[value=discussion]').uncheck();await Promise.all([page.waitForEvent('load'),page.locator('.privacy-save').click()]);await page.locator('.privacy-settings-button').waitFor();await page.waitForTimeout(50);assert.equal(loads,5);assert.ok(await page.locator('.privacy-panel').isHidden());
 await page.reload();await page.locator('.privacy-settings-button').waitFor();assert.ok(await page.locator('.privacy-panel').isHidden());assert.ok(!await page.locator('input[value=discussion]').isChecked());
 policyChanged=true;await page.reload();await page.locator('.privacy-panel').waitFor({state:'visible'});assert.ok(!await page.locator('input[value=discussion]').isChecked());assert.equal(loads,5);
 await context.close();
 }}finally{await browser.close();}
});
