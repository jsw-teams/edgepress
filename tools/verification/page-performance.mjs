import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const directory = resolve(process.env.PERFORMANCE_DIST || 'dist');
const require = createRequire(resolve(root,'package.json'));
const { chromium } = require('playwright');
const types = {'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server = createServer(async (request,response) => {
  const address = new URL(request.url,'http://localhost');
  if (address.pathname === '/api') return response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({user:null,isAdmin:false,items:[],next:null,loginAvailable:true}));
  const file = resolve(directory,decodeURIComponent(address.pathname).slice(1)+(address.pathname.endsWith('/')?'index.html':''));
  if (!file.startsWith(directory+sep)) return response.writeHead(404).end();
  try {
    const body = await readFile(file);
    const type = types[extname(file)] || 'text/html; charset=utf-8';
    const compressed = /^(?:text\/|application\/json|image\/svg)/.test(type);
    response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store',...(compressed?{'Content-Encoding':'gzip'}:{})}).end(compressed?gzipSync(body):body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
const browser = await chromium.launch({headless:true,args:['--disable-extensions']});
const paths = JSON.parse(process.env.PERFORMANCE_PATHS || '["/"]');
const results = [];
try {
  for (const path of paths) for (const mode of ['full','text']) {
    const context = await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
    await context.addInitScript(mode=>{
      localStorage.setItem('edgepress-data-mode',mode);
      window.pagePaint = {largestContentfulPaint:0,lcpElement:''};
      new PerformanceObserver(list=>{
        const entry = list.getEntries().at(-1);
        window.pagePaint = {largestContentfulPaint:entry.startTime,lcpElement:entry.element?.tagName || ''};
      }).observe({type:'largest-contentful-paint',buffered:true});
    },mode);
    await context.route(url=>url.origin !== origin,route=>route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled',{cacheDisabled:true});
    await session.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:100*1024,uploadThroughput:100*1024});
    let transferredBytes = 0;
    let completedRequests = 0;
    session.on('Network.loadingFinished',event=>{transferredBytes+=event.encodedDataLength;completedRequests++;});
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.edgepressDataReady==='true',null,{timeout:15000});
    await page.locator('main').waitFor({state:'visible'});
    const contentReadyMs = await page.evaluate(()=>performance.now());
    assert((await page.locator('main').innerText()).trim().length>10);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.waitForTimeout(1200);
    const paint = await page.evaluate(()=>({...window.pagePaint,firstContentfulPaint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}));
    const measurement = {site:basename(root),path,mode,bandwidthKBs:100,latencyMs:150,contentReadyMs:Math.round(contentReadyMs),...paint,completedRequests,transferredBytes,errors};
    results.push(measurement);
    assert.deepEqual(errors,[]);
    if (process.env.PERFORMANCE_OUTPUT) {
      await mkdir(process.env.PERFORMANCE_OUTPUT,{recursive:true});
      const name = basename(root)+'-'+(path==='/'?'home':path.includes('/2026/')?'article':'zh-SG')+'-'+mode;
      await page.screenshot({path:resolve(process.env.PERFORMANCE_OUTPUT,name+'.png'),fullPage:true});
    }
    await context.close();
  }
  console.log(JSON.stringify(results,null,2));
  if (process.env.PERFORMANCE_OUTPUT) await writeFile(resolve(process.env.PERFORMANCE_OUTPUT,basename(root)+'-performance.json'),JSON.stringify(results,null,2)+'\n');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
