import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import consentManager from '../plugins/consent/index.js';
import { generateBuiltinRoutes } from '../src/generators.js';

const root = fileURLToPath(new URL('../', import.meta.url));
test('GitHub identity UI, safe text, keyboard focus and layouts across themes/locales/devices', async t => {
  let browser;
  try { browser = await chromium.launch({headless:true, ...(process.platform === 'win32' ? {channel:'msedge'} : {}), args:['--mute-audio','--disable-notifications']}); }
  catch(error) { t.skip('Headless browser unavailable: '+error.message.split('\n')[0]); return; }
  try {
    let cases = 0;
    for (const theme of ['default','atelier','signal']) {
      const config = await loadConfig(root);
      config.browserPlugins.comments={enabled:true,services:[{id:'github-comments',provider:'github-comments',name:'GitHub comments',purpose:'Read and write discussions.',dataCategories:'Identity and comments.',recipient:'GitHub',retention:'Until removed.',privacyUrl:'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'}]};
      await loadLanguagePacks(config);
      config.resolvedPaths.theme = config.realPaths.theme = resolve(root,'themes',theme);
      config.site.url = 'https://comments.invalid';
      const locales = ['en','zh-CN'];
      const posts = locales.map(locale => ({locale,title:'Comment fixture',date:new Date('2026-10-02'),
        path:(locale === 'en' ? '' : locale+'/')+'comment-test/',bundlePath:'comment-test',tags:[],author:'Author',
        description:'Comment fixture',markdown:'Readable text.',html:'<p>Readable text.</p>'}));
      let consentFilter;
      consentManager({registerFilter:(_key,handler)=>{consentFilter=handler;}});
      const routes = await generateBuiltinRoutes({posts,pages:[]},config,{filter:async(_key,value,context)=>consentFilter(value,context)});
      const css = await readFile(resolve(root,'themes',theme,'assets/style.css'),'utf8');
      for (const locale of locales) for(const width of [390,820,1440]) for(const mode of ['light','dark']) {
        const context = await browser.newContext({viewport:{width,height:900},colorScheme:mode});
        let loggedIn=true, posted=null, failure=null, threadReset=false, apiCalls=0, deleted=0, uploaded=0;
        await context.route('**/*',async route => {
          const url=new URL(route.request().url());
          if(url.origin !== config.site.url)return route.abort();
          if (url.pathname.startsWith('/api/comments')) apiCalls++;
          const fulfill=data=>route.fulfill({json:data});
          if(url.pathname === '/api/comments/session')return fulfill({user:loggedIn?{id:17,login:'RealReader'}:null,csrf:loggedIn?'csrf':null});
          if(url.pathname === '/api/comments/logout'){loggedIn=false;return fulfill({ok:true});}
          if(url.pathname.startsWith('/api/comments/avatar/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1EAAAAASUVORK5CYII=','base64')});
          if(url.pathname === '/api/comments/media/' && route.request().method()==='POST'){
            assert.equal(route.request().headers()['x-comments-csrf'],'csrf');uploaded++;
            return fulfill({url:config.site.url+'/api/comments/media/'+'a'.repeat(24)+'/'+'b'.repeat(24)+'/12345678-1234-1234-1234-123456789012.png',receipt:'fixture-receipt'});
          }
          if(url.pathname === '/api/comments') {
            if(route.request().method()==='DELETE') {
              assert.deepEqual(route.request().postDataJSON(),{thread:'comment-test',commentId:'123'});
              assert.equal(route.request().headers()['x-comments-csrf'],'csrf');
              if(failure)return route.fulfill({status:failure.status,json:{error:failure.code}});
              deleted++;return fulfill({ok:true,id:'123'});
            }
            if(route.request().method() === 'POST') {
              posted=route.request().postDataJSON();
              assert.equal(route.request().headers()['x-comments-csrf'],'csrf');
              assert.ok(!Object.hasOwn(posted,'name'));
              if (failure) return route.fulfill({status:failure.status,json:{error:failure.code}});
              return fulfill({comment:{id:'123',author:'RealReader',authorId:17,body:posted.body,attachments:(posted.attachments||[]).map(item=>item.url),createdAt:'2026-10-02T12:00:00Z'}});
            }
            return fulfill({comments:[],closed:false,threadReset});
          }
          if(url.pathname === '/style.css')return route.fulfill({contentType:'text/css',body:css});
          const generated=routes.find(r=>'/'+r.path.replace(/index\.html$/,'') === url.pathname);
          if(generated)return route.fulfill({contentType:'text/html',body:generated.body});
          if(/^\/edgepress\/[a-z0-9_./-]+$/i.test(url.pathname) && !url.pathname.includes('..')) {
            try { let body;
              try { body=await readFile(resolve(root,'static',url.pathname.slice(1))); } catch {body=await readFile(resolve(root,'content/assets',url.pathname.slice(1)));}
              return route.fulfill({body,contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'image/png'}); }catch{}
          }
          return route.fulfill({status:404,body:''});
        });
        const page=await context.newPage();
        await page.goto(config.site.url+(locale === 'en'?'':'/'+locale)+'/comment-test/');
        await page.locator('[data-consent-ui]').waitFor();
        assert.equal(apiCalls,0,'Unselected comments must not request API or session');
        assert.equal(await page.locator('script[src$="/comments.js"]').count(),0);
        await page.locator('.privacy-service-toggle input[value=github-comments]').check();
        await page.locator('.privacy-save').click();
        await page.locator('[data-comments-form]').waitFor({state:'visible'});
        assert.equal(await page.locator('[data-comments-identity]').textContent(),'@RealReader');
        assert.equal(await page.locator('input[name=name]').count(),0);
        const textarea=page.locator('[name=body]');
        await textarea.fill('<img src=x onerror=alert(1)>');
        await textarea.focus();
        await page.keyboard.press('Tab');
        assert.ok(await page.locator('[data-comments-stickers-toggle]').evaluate(node=>node===document.activeElement));
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>document.activeElement?.type),'file');
        assert.ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2));
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>document.activeElement?.type),'submit');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(()=>document.activeElement?.type),'file');
        await page.keyboard.press('Shift+Tab');
        assert.ok(await page.locator('[data-comments-stickers-toggle]').evaluate(node=>node===document.activeElement));
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(()=>document.activeElement?.name),'body');
        await page.locator('[data-comments-form] button[type=submit]').click();
        await page.locator('.comment-item').waitFor();
        assert.equal(await page.locator('.comment-body img').count(),0);
        assert.equal(await page.locator('.comment-item .comment-avatar img').count(),1);
        assert.equal(await page.locator('.comment-body').textContent(),'<img src=x onerror=alert(1)>');
        assert.equal(await page.locator('.comment-meta a').getAttribute('href'),'https://github.com/RealReader');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+'/'+locale+'/'+width+'/'+mode);
        const cdp=await context.newCDPSession(page);
        const ax=await cdp.send('Accessibility.getFullAXTree');
        assert.ok(ax.nodes.some(n=>!n.ignored && n.role?.value === 'textbox' && n.name?.value));
        assert.ok(ax.nodes.some(n=>!n.ignored && n.role?.value === 'button' && n.name?.value));
        if (theme === 'default' && locale === 'en' && width === 390 && mode === 'light') {
          const remove=page.locator('[data-comments-delete]');
          await textarea.fill('An unrelated draft');
          await remove.click();assert.equal(deleted,0);
          await page.locator('.comment-actions button').last().click();assert.equal(deleted,0);
          await remove.click();failure={status:502,code:'comments_backend_error'};
          await remove.click();await page.locator('[data-comments-status][data-state=error]').waitFor();
          assert.equal(await page.locator('.comment-item').count(),1);assert.equal(deleted,0);
          failure=null;await remove.click();await remove.click();
          await page.locator('.comment-item').waitFor({state:'detached'});assert.equal(deleted,1);assert.equal(await textarea.inputValue(),'An unrelated draft');
          assert.equal(await page.locator('.comment-sticker').count(),0,'Gallery is not loaded until opened');
          await page.locator('[data-comments-stickers-toggle]').click();await page.locator('.comment-sticker').first().waitFor();
          assert.equal(await page.locator('.comment-sticker').count(),12);
          await page.locator('[data-comments-sticker-packs] button').last().click();
          await page.locator('.comment-sticker').first().click();await page.locator('.comment-attachment-preview').waitFor();assert.equal(uploaded,1);
          await page.locator('.comment-sticker').first().focus();await page.keyboard.press('Escape');
          assert.ok(await page.locator('[data-comments-stickers]').isHidden());
          await textarea.fill('');await page.locator('[data-comments-form] button[type=submit]').click();await page.locator('.comment-item').waitFor();
          assert.equal(posted.attachments.length,1);assert.equal(posted.body,'');assert.equal(await page.locator('.comment-attachment-image').count(),1);
          const draftKey='reporelay-draft:comment-test';
          const status=page.locator('[data-comments-status]');
          const button=page.locator('[data-comments-form] button[type=submit]');
          assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),draftKey),null);
          for (const code of ['comments_credentials_unavailable','comments_permission_denied','comments_rate_limited']) {
            failure={status:503,code};
            await textarea.fill('Keep my draft through '+code);
            await button.click();
            await page.locator('[data-comments-form]').waitFor({state:'hidden'});
            assert.ok(await page.locator('[data-comments-signin]').isHidden());
            assert.equal(await textarea.inputValue(),'Keep my draft through '+code);
            const messageKey=code === 'comments_rate_limited' ? 'commentsRateLimited' : 'commentsServiceUnavailable';
            assert.equal(await status.textContent(),await page.locator('[data-edgepress-comments]').evaluate((node,key)=>node.dataset[key],messageKey));
            failure=null;
            await page.reload();
            await page.locator('[data-comments-form]').waitFor({state:'visible'});
            assert.equal(await textarea.inputValue(),'Keep my draft through '+code);
          }
          failure={status:401,code:'login_required'};
          await button.click();
          await page.locator('[data-comments-signin]').waitFor({state:'visible'});
          assert.ok(await page.locator('[data-comments-form]').isHidden());
          assert.equal(await textarea.inputValue(),'Keep my draft through comments_rate_limited');
          loggedIn=false;
          await page.reload();
          await page.locator('[data-comments-signin]').waitFor({state:'visible'});
          assert.equal(await textarea.inputValue(),'Keep my draft through comments_rate_limited');
          failure=null; loggedIn=true; threadReset=true;
          await page.reload();
          await page.locator('[data-comments-form]').waitFor({state:'visible'});
          assert.equal(await status.textContent(),await page.locator('[data-edgepress-comments]').evaluate(node=>node.dataset.commentsThreadReset));
          assert.equal(await page.locator('.comment-item').count(),0);
          await button.click();
          await page.locator('.comment-item').waitFor();
          assert.equal(await textarea.inputValue(),'');
          assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),draftKey),null);
        }
        await page.locator('[data-comments-logout]').click();
        await page.locator('[data-comments-signin]').waitFor({state:'visible'});
        assert.ok(await page.locator('[data-comments-form]').isHidden());
        assert.match(await page.locator('[data-comments-login]').getAttribute('href'),/^\/api\/comments\/login\?return=/);
        await context.close(); cases++;
      }
    }
    assert.equal(cases,36);
  } finally { await browser.close(); }
});
