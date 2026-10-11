import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';

export function registerDataSaverTests(siteRoot, options = {}) {
const root = dirname(resolve(siteRoot));
const selected = [basename(resolve(siteRoot))];
const { chromium } = createRequire(resolve(siteRoot, 'package.json'))('playwright');

const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };

for (const site of selected) test(site + ' remains readable and themed without JavaScript or third-party requests',async()=>{
  const require = createRequire(resolve(root,site,'package.json'));
  const config = require('yaml').parse(await readFile(resolve(root,site,'config.yml'),'utf8'));
  const directory = resolve(root,site,'dist');
  const htmlFiles=async folder=>{
    for(const entry of await readdir(folder,{withFileTypes:true})){
      const file=resolve(folder,entry.name);
      if(entry.isDirectory())await htmlFiles(file);
      else if(entry.name.endsWith('.html'))assert((await readFile(file)).subarray(0,1024).includes(Buffer.from('<meta charset="utf-8">')),file);
    }
  };
  await htmlFiles(directory);
  const browser = await chromium.launch({headless:true,args:['--disable-extensions']});
  try {
    for (const [width,colorScheme] of [[390,'dark'],[1280,'light']]) {
      const context = await browser.newContext({javaScriptEnabled:false,viewport:{width,height:844},colorScheme});
      const requests = [];
      await context.route('**/*',async route=>{
        const url = new URL(route.request().url());
        requests.push(url.href);
        assert.equal(url.origin,config.site.url,'No-JS must not enable optional services');
        const file = resolve(directory,url.pathname.slice(1)+(url.pathname.endsWith('/')?'index.html':''));
        if (!file.startsWith(directory+sep)) return route.abort();
        try { return await route.fulfill({contentType:types[extname(file)] || 'text/html; charset=utf-8',body:await readFile(file)}); }
        catch { return route.fulfill({status:404,body:''}); }
      });
      const page = await context.newPage();
      const paths = options.noJsPaths || ['/'];
      for (const path of paths) {
        await page.goto(config.site.url+path);
        assert.equal(await page.locator('main').count(),1);
        assert.equal(await page.locator('main').isVisible(),true);
        assert((await page.locator('main').innerText()).trim().length > 10);
        assert.equal(await page.locator('body>header,.site-shell>header').isVisible(),true);
        assert.equal(await page.locator('body>footer,.site-shell>footer').isVisible(),true);
        assert.equal(await page.locator('[data-data-wait]').isVisible(),false);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.notEqual(await page.locator('body').evaluate(element=>getComputedStyle(element).fontFamily),'"Times New Roman"');
        assert(!requests.some(url=>/\.js(?:\?|$)|\/api(?:\?|$)/.test(url)),requests.join('\n'));
        if (process.env.DATA_SAVER_SCREENSHOTS) {
          await mkdir(process.env.DATA_SAVER_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.DATA_SAVER_SCREENSHOTS,site+'-nojs-'+width+(path.includes('/2026/')?'-article':'-home')+'.png'),fullPage:true});
        }
      }
      await context.close();
    }
  }finally{await browser.close();}
});

for (const site of selected) test(site + ' exposes progress and manual text switching on actual pages over cold weak connections', {timeout:180000}, async () => {
  const directory = resolve(root,site,'dist');
  const server = createServer(async (request,response) => {
    const address = new URL(request.url,'http://localhost');
    if (address.pathname === '/api') return response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({user:null,isAdmin:false,items:[],next:null,loginAvailable:true}));
    const file = resolve(directory,decodeURIComponent(address.pathname).replace(/^\//,'') + (address.pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(directory + sep)) return response.writeHead(404).end();
    try {
      const body=await readFile(file),type=types[extname(file)] || 'text/html; charset=utf-8';
      const compressed=/^(?:text\/|application\/json|image\/svg)/.test(type);
      response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store',...(compressed?{'Content-Encoding':'gzip'}:{})}).end(compressed?gzipSync(body):body);
    }
    catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true,args:['--disable-extensions']});
  const measurements = [];
  try {
    const paths = options.coldPaths || ['/'];
    const profiles = [{bandwidthKBs:100,latencyMs:150},{bandwidthKBs:50,latencyMs:2000}];
    for (const profile of profiles) for (const path of paths) {
      const context = await browser.newContext({viewport:{width:390,height:844},colorScheme:path.includes('zh-TW') ? 'light' : 'dark'});
      await context.addInitScript(() => Object.defineProperty(navigator,'connection',{get:() => ({saveData:true,effectiveType:'2g'})}));
      await context.addInitScript(() => {
        window.paintMeasurements = {largestContentfulPaint:0,lcpElement:''};
        new PerformanceObserver(list=>{
          const entry = list.getEntries().at(-1);
          window.paintMeasurements = {largestContentfulPaint:entry.startTime,lcpElement:entry.element?.tagName || ''};
        }).observe({type:'largest-contentful-paint',buffered:true});
      });
      await context.route(url => url.origin !== origin,route => route.abort());
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.setCacheDisabled',{cacheDisabled:true});
      await session.send('Network.emulateNetworkConditions',{offline:false,latency:profile.latencyMs,downloadThroughput:profile.bandwidthKBs*1024,uploadThroughput:profile.bandwidthKBs*1024});
      let transferred = 0;
      session.on('Network.loadingFinished',event => { transferred += event.encodedDataLength; });
      const requests = [];
      let navigations = 0;
      let textRequestStart = 0;
      page.on('request',request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          navigations++;
          if (navigations === 2) textRequestStart = requests.length;
        }
        requests.push(request.url());
      });
      const started = performance.now();
      await page.goto(origin + path,{waitUntil:'commit'});
      const button = page.locator('[data-data-mode=text]');
      await button.waitFor({state:'visible'});
      const offeredAfterMs = Math.round(performance.now()-started);
      assert(offeredAfterMs < 5000,site + path + ' entry too late: ' + offeredAfterMs);
      assert.equal(await page.getAttribute('html','data-edgepress-data-mode'),'full');
      assert.equal(await page.locator('[data-data-progress]').isVisible(),true);
      const bounds = await page.locator('[data-data-offer]').boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
      if (process.env.DATA_SAVER_SCREENSHOTS) {
        await mkdir(process.env.DATA_SAVER_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:resolve(process.env.DATA_SAVER_SCREENSHOTS,site + '-' + (path === '/' ? 'home' : path.includes('zh-SG') ? 'article-zh-SG' : path.includes('zh-TW') ? 'article-zh-TW' : 'article-en') + '-100KB-waiting.png')});
      }
      await button.focus();
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.keyboard.press('Enter')]);
      await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
      await page.locator('main').waitFor({state:'visible'});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const readableAfterMs = Math.round(performance.now()-started);
      assert(readableAfterMs < 10000,site + path + ' text too late: ' + readableAfterMs);
      assert.equal(await page.getAttribute('html','data-edgepress-data-mode'),'text');
      assert.equal(await page.locator('body>header,.site-shell>header').isVisible(),true);
      assert.equal(await page.locator('body>footer,.site-shell>footer').isVisible(),true);
      assert((await page.locator('main').innerText()).trim().length > 10);
      assert(!requests.slice(textRequestStart).some(url => /\.(?:woff2?|webp|jpe?g|mp4|pdf)(?:\?|$)|(?:document-viewer|image-viewer|gallery-runtime)\.[a-f0-9]+\.js/.test(url)),requests.join('\n'));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const paint = await page.evaluate(()=>({...window.paintMeasurements,firstContentfulPaint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0}));
      measurements.push({site,path,...profile,textEncoding:'gzip',offeredAfterMs,readableAfterMs,...paint,transferredBytes:transferred});
      if (process.env.DATA_SAVER_SCREENSHOTS) await page.screenshot({path:resolve(process.env.DATA_SAVER_SCREENSHOTS,site + '-' + (path === '/' ? 'home' : path.includes('zh-SG') ? 'article-zh-SG' : path.includes('zh-TW') ? 'article-zh-TW' : 'article-en') + '-100KB-text.png'),fullPage:true});
      await context.close();
    }
    console.log(JSON.stringify(measurements));
    if (process.env.DATA_SAVER_SCREENSHOTS) await writeFile(resolve(process.env.DATA_SAVER_SCREENSHOTS,site + '-100KB.json'),JSON.stringify(measurements,null,2));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const site of selected) test(site + ' keeps a localized loading choice stable and disables its debug entry', async () => {
  const require = createRequire(resolve(root,site,'package.json'));
  const config = require('yaml').parse(await readFile(resolve(root,site,'config.yml'),'utf8'));
  assert.equal(config.site.dataSaver.debug,false);
  const locales = options.locales || [config.site.language];
  const browser = await chromium.launch({headless:true,args:['--disable-extensions']});
  try {
    for (const locale of locales) {
      const context = await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'});
      let releaseStyles;
      const released = new Promise(resolve => { releaseStyles = resolve; });
      await context.route('**/*', async route => {
        const address = new URL(route.request().url());
        assert.equal(address.origin,config.site.url);
        if (address.pathname === '/api') return route.fulfill({contentType:'application/json',body:JSON.stringify({user:null,isAdmin:false,items:[],next:null,loginAvailable:true})});
        const file = resolve(root,site,'dist',decodeURIComponent(address.pathname).replace(/^\//,'') + (address.pathname.endsWith('/') ? 'index.html' : ''));
        assert(file.startsWith(resolve(root,site,'dist') + sep));
        try {
          if (/\/style\.[a-f0-9]{16}\.css$/.test(address.pathname)) await released;
          const buffer = await readFile(file);
          const body = extname(file) === '.html' ? buffer.toString('utf8').replace(/"promptAfterMs":\d+/, '"promptAfterMs":300') : buffer;
          return route.fulfill({contentType:types[extname(file)] || 'text/html; charset=utf-8',body});
        } catch (error) { if (error.code !== 'ENOENT') throw error; return route.fulfill({status:404}); }
      });
      const page = await context.newPage();
      const prefix = locale === config.site.language ? '' : '/' + locale;
      const path = prefix + '/';
      await page.goto(config.site.url + path,{waitUntil:'domcontentloaded'});
      await page.locator('[data-data-offer]').waitFor({state:'visible'});
      assert.equal(await page.locator('main').isVisible(),false);
      const offer = page.locator('[data-data-offer]');
      if (locale.startsWith('zh')) assert.match(await offer.innerText(),/文字省流版/);
      if (locale === 'zh-TW') assert.match(await page.locator('[data-data-wait]').innerText(),/正在準備頁面|頁面樣式|首屏圖片/);
      assert.equal(await page.locator('[data-data-progress]').isVisible(),true);
      await page.locator('[data-data-mode=text]').focus();
      releaseStyles();
      await page.waitForTimeout(500);
      assert.equal(await offer.isVisible(),true);
      assert.equal(await page.locator('main').isVisible(),false);
      const bounds = await offer.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
      if (process.env.DATA_SAVER_SCREENSHOTS) {
        await mkdir(process.env.DATA_SAVER_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:resolve(process.env.DATA_SAVER_SCREENSHOTS,site + '-' + locale + '-waiting.png')});
      }
      await Promise.all([page.waitForNavigation(),page.keyboard.press('Enter')]);
      assert.equal(await page.getAttribute('html','data-edgepress-data-mode'),'text');
      await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
      assert.equal(await page.locator('[data-data-wait]').isVisible(),false);
      await page.locator('main').waitFor({state:'visible'});
      assert.equal(await page.locator('main').isVisible(),true);
      assert.equal(await page.locator('body>header,.site-shell>header').isVisible(),true);
      assert.equal(await page.locator('body>footer,.site-shell>footer').isVisible(),true);
      await page.goto(config.site.url + path + '?data-save');
      await page.waitForURL(config.site.url + prefix + '/404.html');
      await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
      await page.locator('main').waitFor({state:'visible'});
      assert.match(await page.locator('main').innerText(),/404/);
      await context.close();
    }
  } finally { await browser.close(); }
});


for (const site of selected) test(site + ' has explicitly chosen theme-owned text view, localized controls and retained external prompts', async () => {
  const require = createRequire(resolve(root, site, 'package.json'));
  const { parse } = require('yaml');
  const config = parse(await readFile(resolve(root, site, 'config.yml'), 'utf8'));
  assert.deepEqual(config.site.dataSaver, { enabled: true, debug: false, mode: 'auto', detectSlowConnection: true, respectBrowserPreference: false });
  assert.equal(config.site.externalLinks.enabled, true);
  const locales = options.locales || [config.site.language];
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const locale of locales) for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme, reducedMotion: 'reduce' });
      await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true, effectiveType: '4g' }) }));
      await context.addInitScript(() => localStorage.setItem('edgepress-data-mode','text'));
      const requests = [], errors = [];
      context.on('request', request => requests.push(request.url()));
      const origin = config.site.url;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, origin, 'Text view must not request third-party services');
        if (url.pathname === '/api') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: null, isAdmin: false, items: [], next: null }) });
        const path = decodeURIComponent(url.pathname).replace(/^\//, '') + (url.pathname.endsWith('/') ? 'index.html' : '');
        const file = resolve(root, site, 'dist', path);
        assert(file.startsWith(resolve(root, site, 'dist') + sep));
        try { await route.fulfill({ contentType: types[extname(file)] || 'text/html; charset=utf-8', body: await readFile(file) }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; await route.fulfill({ status: 404 }); }
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const path = locale === config.site.language ? '/' : '/' + locale + '/';
      await page.goto(origin + path);
      await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
      await page.locator('main').waitFor({state:'visible'});
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'text');
      assert.equal(await page.locator('main').count(), 1);
      await page.waitForFunction(() => document.querySelector('main').innerText.trim().length > 10);
      assert((await page.locator('main').innerText()).trim().length > 10);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(!requests.some(url => /\.(?:woff2?|webp|jpe?g|mp4|pdf)(?:\?|$)|\/style\.[a-f0-9]+\.css|(?:document-viewer|image-viewer|gallery-runtime)\.[a-f0-9]+\.js/.test(url)), requests.join('\n'));
      const controls = page.locator('[data-data-return]');
      assert.equal(await page.locator('.edgepress-data-controls').count(), 0);
      assert.equal(await controls.locator('button').count(), 1);
      assert.equal(await controls.locator('button').getAttribute('data-data-mode'), 'full');
      if (locale.startsWith('zh')) assert.match(await controls.innerText(), /文字省流版/);
      assert.equal(await page.locator('[data-data-offer]').isVisible(), false);
      assert.doesNotMatch(await page.locator('body').innerText(), /<img\b|<picture\b|<source\b/);
      assert.equal(await page.locator('body>header, .site-shell>header').count(), 1);
      assert.equal(await page.locator('body>footer, .site-shell>footer').count(), 1);
      assert(await page.locator('body>header, .site-shell>header').isVisible());
      assert(await page.locator('body>footer, .site-shell>footer').isVisible());
      for (const button of await controls.locator('button').all()) assert((await button.boundingBox()).height >= 44);
      if (await page.locator('.privacy-close').isVisible()) await page.locator('.privacy-close').click();
      await page.evaluate(() => {
        const link = document.createElement('a'); link.href = 'https://outside.example.test/story?source=test'; link.textContent = 'External test'; document.querySelector('main').append(link);
      });
      await page.getByRole('link', { name: 'External test', exact: true }).click();
      assert.equal(await page.locator('.edgepress-external-url').textContent(), 'https://outside.example.test/story?source=test');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'External test');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

for (const site of selected) test(site + ' preserves separate page shells, meaningful article cards and responsive full/text layouts', async () => {
  const require = createRequire(resolve(root, site, 'package.json'));
  const { parse } = require('yaml');
  const config = parse(await readFile(resolve(root, site, 'config.yml'), 'utf8'));
  const paths = options.paths || ['/'];
  const locales = options.locales || [config.site.language];
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  const evidence = [];
  try {
    for (const width of [320, 1280]) for (const colorScheme of ['light', 'dark']) for (const locale of locales) {
      const prefix = locale === config.site.language ? '' : '/' + locale;
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, config.site.url);
        if (url.pathname === '/api') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: null, isAdmin: false, items: [], next: null, loginAvailable: true }) });
        const file = resolve(root, site, 'dist', decodeURIComponent(url.pathname).replace(/^\//, '') + (url.pathname.endsWith('/') ? 'index.html' : ''));
        assert(file.startsWith(resolve(root, site, 'dist') + sep));
        try { await route.fulfill({ contentType: types[extname(file)] || 'text/html; charset=utf-8', body: await readFile(file) }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; await route.fulfill({ status: 404 }); }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const suffix of paths) {
        const path = prefix + suffix;
        const snapshots = {};
        for (const mode of ['full', 'text']) {
          await page.goto(config.site.url + path + '?data-mode=' + mode);
          await page.waitForFunction(() => document.documentElement.dataset.edgepressDataReady === 'true');
          await page.locator('main').waitFor({state:'visible'});
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          snapshots[mode] = await page.evaluate(() => {
            const header = document.querySelector('body>header, .site-shell>header');
            const footer = document.querySelector('body>footer, .site-shell>footer');
            const main = document.querySelector('main');
            const readable = main.cloneNode(true);
            readable.querySelectorAll('[data-edgepress-data-media], template, noscript, script, button, input').forEach(element => element.remove());
            const cardTitles = [...main.querySelectorAll('.post-card h2, .post-card h3')].map(element => element.textContent.trim());
            return {
              heading: main.querySelector('h1')?.textContent.trim(),
              prose: readable.textContent.replace(/\s+/g, ' ').trim(),
              headings: main.querySelectorAll('h1').length,
              mainCount: document.querySelectorAll('main').length,
              headerCount: document.querySelectorAll('body>header, .site-shell>header').length,
              footerCount: document.querySelectorAll('body>footer, .site-shell>footer').length,
              nav: [...header.querySelectorAll('a')].map(link => [link.textContent.trim(), link.getAttribute('href')]),
              footerLinks: [...footer.querySelectorAll('a')].map(link => link.getAttribute('href')),
              footerCopy: footer.querySelector('p')?.textContent.trim(),
              mainWidth: main.getBoundingClientRect().width,
              headerHeight: header.getBoundingClientRect().height,
              footerAfterMain: footer.getBoundingClientRect().top >= main.getBoundingClientRect().bottom - 1,
              overflow: document.documentElement.scrollWidth > innerWidth,
              rawMarkup: /<img\b|<picture\b|<source\b/.test(document.body.innerText),
              cards: cardTitles,
              cardLinks: [...main.querySelectorAll('.post-card h2 a, .post-card h3 a')].map(link => link.getAttribute('href')),
              cardMetadata: [...main.querySelectorAll('.post-card .meta')].map(element => element.textContent.trim()),
              captions: [...main.querySelectorAll('figcaption')].map(element => element.textContent.trim()),
              postListLayout: [...main.querySelectorAll('.post-list')].map(element => getComputedStyle(element).display),
              embedPlaceholders: [...main.querySelectorAll('[data-oembed-placeholder]')].map(element => element.getBoundingClientRect().height),
              embedNotices: [...main.querySelectorAll('[data-oembed-notice]')].map(element => element.textContent.trim()),
              embedLinks: [...main.querySelectorAll('.edgepress-oembed figcaption a')].map(element => element.getAttribute('href'))
            };
          });
          const snapshot = snapshots[mode];
          assert.equal(snapshot.mainCount, 1, path + ' main');
          assert.equal(snapshot.headerCount, 1, path + ' header');
          assert.equal(snapshot.footerCount, 1, path + ' footer');
          assert.equal(snapshot.headings, 1, path + ' h1');
          assert.equal(snapshot.overflow, false, path + ' ' + mode + ' overflow');
          assert.equal(snapshot.rawMarkup, false, path + ' raw HTML');
          assert.equal(snapshot.footerAfterMain, true, path + ' footer outside main');
          assert(snapshot.headerHeight < 300, path + ' navigation must not consume the screen');
          assert(snapshot.postListLayout.every(layout => layout === 'grid'));
          if (mode === 'text') assert(snapshot.embedPlaceholders.every(height => height === 0), path + ' text view has no empty player rectangle');
          if (suffix.includes('/2026/10/')) assert(snapshot.embedPlaceholders.every(height => height === 0), path + ' full embed entry is compact before consent');
          if (process.env.DATA_SAVER_SCREENSHOTS && (suffix === '/' || suffix === '/about/' || suffix === '/guide/' || suffix.includes('/2026/10/'))) {
            await page.waitForTimeout(350);
            if (await page.locator('.privacy-close').isVisible()) await page.locator('.privacy-close').click();
            if (mode === 'full') {
              const height = await page.evaluate(() => document.documentElement.scrollHeight);
              for (let offset = 0; offset < height; offset += 700) {
                await page.evaluate(offset => scrollTo({ top: offset, behavior: 'instant' }), offset);
                await page.waitForTimeout(80);
              }
              await page.waitForFunction(() => [...document.images].filter(image => image.getBoundingClientRect().width > 0).every(image => image.complete));
              const broken = await page.evaluate(() => [...document.images].filter(image => image.getBoundingClientRect().width > 0 && image.naturalWidth === 0).map(image => image.currentSrc));
              assert.deepEqual(broken, [], path + ' full view image evidence');
            }
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
            await mkdir(process.env.DATA_SAVER_SCREENSHOTS, { recursive: true });
            const filename = site + '-' + (prefix ? locale + '-' : '') + (suffix.replaceAll('/', '') || 'home') + '-' + width + '-' + colorScheme + '-' + mode + '.png';
            await page.screenshot({ path: resolve(process.env.DATA_SAVER_SCREENSHOTS, filename), fullPage: true });
          }
        }
        const full = snapshots.full, text = snapshots.text;
        assert.equal(text.heading, full.heading, path + ' must remain the same page');
        if (options.compareProse !== false) assert.equal(text.prose, full.prose, path + ' no prose lost when pictures are removed');
        assert.deepEqual(text.footerLinks, full.footerLinks);
        assert.equal(text.footerCopy, full.footerCopy);
        assert.deepEqual(text.nav.map(link => link[1]), full.nav.map(link => link[1]));
        assert.deepEqual(text.cards, full.cards, path + ' real article titles');
        assert.deepEqual(text.cardLinks, full.cardLinks);
        assert.deepEqual(text.cardMetadata, full.cardMetadata);
        assert.deepEqual(text.captions, full.captions, path + ' image context and attribution');
        assert.deepEqual(text.embedNotices, full.embedNotices, path + ' retained consent notices');
        assert.deepEqual(text.embedLinks, full.embedLinks, path + ' retained video source links');
        assert(Math.abs(full.mainWidth - text.mainWidth) < 2, path + ' shared content width');
        evidence.push({ site, path, width, colorScheme, locale, ...text });
        if (suffix === '/about/' || suffix === '/guide/') {
          await page.locator('body>header a.brand, .site-shell>header a.brand').click();
          assert.equal(new URL(page.url()).pathname, prefix + '/');
          assert.equal(await page.locator('main').count(), 1);
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    if (process.env.DATA_SAVER_SCREENSHOTS) await writeFile(resolve(process.env.DATA_SAVER_SCREENSHOTS, site + '-layout.json'), JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
});

}
