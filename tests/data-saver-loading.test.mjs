import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { configureDataSaver, dataSaverHtml } from '../src/data-saver.js';

test('slow loading choices remain stable after late completion, preload only full styles and guard the debug entry', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  config.site.dataSaver = { enabled:true, debug:false, mode:'auto', detectSlowConnection:true, respectBrowserPreference:true, promptAfterMs:150 };
  await configureDataSaver(config);
  const runtime = await readFile('static/edgepress/data-saver.js');
  const css = await readFile('static/edgepress/data-saver.css');
  const image = await readFile('content/assets/edgepress/favicon/favicon-16.png');
  const source = '<html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/full.css"></head><body><header><nav><a href="/second/">第二頁</a></nav></header><main><h1>繁體 简体 Article</h1><img src="/slow.png" loading="lazy" width="100" height="100" alt="有意义的图像"></main><footer>頁腳 Footer</footer></body></html>';
  const html = dataSaverHtml(source, config);
  for (const engine of [chromium,firefox]) {
    const browser = await engine.launch({ headless:true, ...(engine === chromium ? {args:['--disable-extensions']} : {}) });
    try {
      for (const colorScheme of ['light','dark']) {
        const context = await browser.newContext({viewport:{width:320,height:700},colorScheme,reducedMotion:'reduce'});
        let current = html;
        const requests = [];
        let finishImage;
        const released = new Promise(resolve => { finishImage = resolve; });
        await context.route('**/*', async route => {
          const path = new URL(route.request().url()).pathname;
          requests.push(path);
          if (path.endsWith('.js')) return route.fulfill({contentType:'text/javascript',body:runtime});
          if (path === '/full.css') return route.fulfill({contentType:'text/css',body:'body{margin:0}main,header,footer{padding:1rem}'});
          if (path.endsWith('.css')) return route.fulfill({contentType:'text/css',body:css});
          if (path === '/slow.png') { await released; return route.fulfill({contentType:'image/png',body:image}); }
          return route.fulfill({contentType:'text/html',body:path.endsWith('404.html') ? '<main><h1>404</h1></main>' : current});
        });
        const page = await context.newPage();
        await page.goto('https://example.test/zh-CN/',{waitUntil:'domcontentloaded'});
        await page.locator('[data-data-offer]').waitFor({state:'visible'});
        assert.equal(await page.locator('main').isVisible(),false);
        assert.match(await page.locator('[data-data-wait]').innerText(),/正在准备页面/);
        assert(await page.locator('link[rel=preload][as=style][href="https://example.test/full.css"]').count());
        await page.locator('[data-data-mode=text]').focus();
        finishImage();
        await page.waitForTimeout(350);
        assert.equal(await page.locator('[data-data-offer]').isVisible(),true);
        assert.equal(await page.locator('main').isVisible(),false);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.dataMode),'text');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const bounds = await page.locator('[data-data-offer]').boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= 320);
        if (process.env.DATA_SAVER_SCREENSHOTS && engine === chromium) await page.screenshot({path:process.env.DATA_SAVER_SCREENSHOTS + '/waiting-' + colorScheme + '.png'});
        await Promise.all([page.waitForNavigation(),page.keyboard.press('Enter')]);
        assert.equal(await page.getAttribute('html','data-edgepress-data-mode'),'text');
        await page.waitForFunction(() => document.activeElement.tagName === 'MAIN');
        assert.equal(await page.locator('[data-data-wait]').isVisible(),false);
        assert.match(await page.locator('main').innerText(),/繁體 简体 Article/);
        assert.match(await page.locator('footer').innerText(),/頁腳 Footer/);
        assert.match(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily),/Microsoft JhengHei/);
        await page.goto('https://example.test/zh-CN/?data-save');
        await page.waitForURL('**/zh-CN/404.html');
        assert.equal(await page.locator('h1').innerText(),'404');
        config.site.dataSaver.debug = true;
        current = dataSaverHtml(source,config);
        requests.length = 0;
        await page.goto('https://example.test/zh-CN/?data-save');
        assert.equal(await page.getAttribute('html','data-edgepress-data-mode'),'text');
        assert(!requests.includes('/full.css'));
        assert(!requests.includes('/slow.png'));
        assert.equal(await page.locator('link[rel=preload]').count(),0);
        await page.goto('https://example.test/zh-CN/?data-save=invalid');
        await page.waitForURL('**/zh-CN/404.html');
        await page.goto('https://example.test/zh-CN/?code=oauth&state=example');
        assert.equal(new URL(page.url()).searchParams.get('code'),'oauth');
        config.site.dataSaver.debug = false;
        await context.close();
      }
    } finally { await browser.close(); }
  }
});
