import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {renderLayout} from '../src/theme.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const extensions={filter:async(_key,value)=>value};
test('navigation and footer keep external URLs and new-tab targets, including dropdown choices',async()=>{
 const config=await fixture('default');
 config.site.navigation[0].children.push({key:'share',url:'https://share.js.gripe',target:'_blank',labels:{en:'ishare'}});
 config.site.footerNavigation=[{key:'share',url:'https://share.js.gripe',target:'_blank',labels:{en:'ishare'}}];
 const html=await renderLayout(config,extensions,{locale:'zh-CN',urlPath:'/zh-CN/'},'<h1>Fixture</h1>');
 assert.match(html,/<option value="https:\/\/share.js.gripe" data-target="_blank">ishare/);
 assert.match(html,/<a href="https:\/\/share.js.gripe" target="_blank" rel="noopener noreferrer">ishare<\/a>/);
 assert.doesNotMatch(html,/\/zh-CN\/https:/);
});
async function fixture(theme){
 const config=await loadConfig(root);
 await loadLanguagePacks(config);
 config.site.url='https://navigation.invalid';
 config.site.navigation=[{key:'projects',url:'/projects/',labels:{en:'Projects'},children:[{key:'edgepress',url:'/edgepress/',labels:{en:'EdgePress'}}]}];
 config.resolvedPaths.theme=config.realPaths.theme=resolve(root,'themes',theme);
 return config;
}
test('navigation uses a disabled display placeholder and preserves actual parent/child links',async()=>{
 const config=await fixture('default');
 const html=await renderLayout(config,extensions,{locale:'en',title:'Fixture',urlPath:'/edgepress/guide/'},'<h1>Fixture</h1>');
 assert.match(html,/<option value="" selected disabled hidden>Projects<\/option>/);
 assert.match(html,/<option value="\/projects\/">Projects<\/option>/);
 assert.match(html,/<option value="\/edgepress\/">EdgePress<\/option>/);
 assert.match(html,/<noscript><a href="\/projects\/">Projects<\/a><a href="\/edgepress\/">EdgePress<\/a><\/noscript>/);
});
test('keyboard parent selection, child selection, return navigation and no-JS links across themes/locales',async t=>{
 let browser;
 try{browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{}),args:['--mute-audio','--disable-notifications']});}
 catch(error){t.skip('Headless browser unavailable: '+error.message.split('\n')[0]);return;}
 try{
  let cases=0;
  const themes=(await readdir(resolve(root,'themes'),{withFileTypes:true})).filter(item=>item.isDirectory()).map(item=>item.name);
  for(const theme of themes){
   const config=await fixture(theme);
   for(const locale of config.i18n.locales) for(const width of [390,1440]) for(const colorScheme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:900},colorScheme});
    const prefix=locale===config.i18n.defaultLocale?'/':'/'+locale+'/';
    await context.route('**/*',async route=>{
     const url=new URL(route.request().url());
     if(url.origin!==config.site.url)return route.abort();
     if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:await readFile(resolve(root,'themes',theme,'assets/style.css'),'utf8')});
     if(/^\/edgepress\/[a-z0-9./-]+\.(js|png)$/i.test(url.pathname)&&!url.pathname.includes('..')){
      try{return route.fulfill({body:await readFile(resolve(root,'static',url.pathname.slice(1))),contentType:url.pathname.endsWith('.js')?'text/javascript':'image/png'});}catch{return route.fulfill({status:404,body:''});}
     }
     return route.fulfill({contentType:'text/html',body:await renderLayout(config,extensions,{locale,title:'Fixture',urlPath:url.pathname},'<h1>Fixture</h1>')});
    });
    const page=await context.newPage();
    await page.goto(config.site.url+prefix+'archives/');
    const selector=page.locator('[data-navigation-select]').first();
    await selector.waitFor({state:'visible'});
    assert.equal(await selector.inputValue(),'');
    await selector.focus();
    assert.ok(await selector.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth)>=2));
    await Promise.all([page.waitForURL(config.site.url+prefix+'projects/'),page.keyboard.press('ArrowDown')]);
    await Promise.all([page.waitForURL(config.site.url+prefix+'edgepress/'),selector.selectOption(prefix+'edgepress/')]);
    assert.equal(await selector.inputValue(),'');
    await Promise.all([page.waitForURL(config.site.url+prefix+'projects/'),selector.selectOption(prefix+'projects/')]);
    await page.goBack();
    assert.equal(await selector.inputValue(),'');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await context.close();cases++;
   }
   const context=await browser.newContext({javaScriptEnabled:false});
   await context.route('**/*',async route=>{
    if(route.request().resourceType()!=='document')return route.abort();
    return route.fulfill({contentType:'text/html',body:await renderLayout(config,extensions,{locale:'en',title:'Fixture',urlPath:'/'},'<h1>Fixture</h1>')});
   });
   const page=await context.newPage();await page.goto(config.site.url);
   assert.ok(await page.locator('noscript a[href="/projects/"]').isVisible());
   assert.ok(await page.locator('noscript a[href="/edgepress/"]').isVisible());
   await context.close();
  }
  assert.ok(cases>=themes.length*8);
 }finally{await browser.close();}
});
