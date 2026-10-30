import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createServer} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {startHeadlessBrowser} from '../src/headless-browser.js';

test('one software browser isolates parallel workers and handles repeated navigation without fixed waits', {timeout:30000}, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'edgepress-browser-test-'));
  const observed = [];
  const server = createServer((req, res) => {
    if (req.url.startsWith('/state/')) {
      observed.push(req.url.slice('/state/'.length));
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui}a:focus-visible{outline:3px solid blue}@media(prefers-color-scheme:dark){body{background:#111;color:#fff}}</style></head><body><a href="#main">Skip to content</a><nav aria-label="Main"><a href="#section">Read more</a></nav><main id="main" tabindex="-1"><h1>Test page</h1><h2 id="section">Section</h2></main><script>if(location.search==="?write")localStorage.setItem("worker","first");const probe=document.createElement("img");probe.hidden=true;probe.alt="";probe.src="/state/"+(localStorage.getItem("worker")||"isolated");document.body.append(probe);</script></body></html>');
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const launches = [];
  const originalSpawn = childProcess.spawn;
  const spy = mock.method(childProcess, 'spawn', (executable, args, options) => {
    launches.push({executable, args});
    return originalSpawn(executable, args, options);
  });
  syncBuiltinESMExports();
  let browser;
  try {
    browser = await startHeadlessBrowser(chromium.executablePath(), profile);
    const workers = await Promise.all([browser.createSession(), browser.createSession()]);
    const viewport = {width:390,height:844,mobile:true,touch:true,deviceScaleFactor:3,colorScheme:'dark'};
    await Promise.all(workers.map(worker => worker.setViewport(viewport)));
    await workers[0].navigate(url + '?write');
    await workers[1].navigate(url);
    assert.deepEqual(observed, ['first', 'isolated'], 'Worker storage must be isolated');
    await Promise.all(workers.map(async worker => {
      const pdf = await worker.printToPdf();
      assert.ok(pdf.length > 1000);
      const report = await worker.audit(viewport);
      assert.equal(report.status, 'pass', JSON.stringify(report.checks.filter(check => !check.passed)));
    }));
    // One worker writes storage; another worker must not see that state.
    await workers[0].navigate(url + '?write');
    await workers[1].navigate(url);
    const screenshots = await Promise.all(workers.map(worker => worker.screenshot()));
    assert.ok(screenshots.every(image => image.length > 1000));
    assert.equal(launches.filter(launch => launch.executable === chromium.executablePath()).length, 1);
    const args = launches[0].args;
    assert.ok(args.includes('--disable-gpu') && args.includes('--disable-extensions'));
    assert.ok(args.includes('--disable-back-forward-cache'));
    await Promise.all(workers.map(worker => worker.close()));
    await browser.close(); browser = null;
  } finally {
    await browser?.close();
    spy.mock.restore(); syncBuiltinESMExports();
    await new Promise(done => server.close(done));
    await rm(profile, {recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
