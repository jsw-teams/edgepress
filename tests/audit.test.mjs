import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { markdownFeatureCoverage } from '../src/page-check.js';
import { checkCompatibility } from '../src/maintenance.js';
import { auditBrowser, deviceProfiles } from '../src/browser-audit.js';

const project = fileURLToPath(new URL('../', import.meta.url));
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-audit-test-'));
  for (const directory of ['content/pages/home', 'static', 'src', 'languages/base', 'themes/fixture/assets', 'themes/fixture/layouts'])
    await mkdir(resolve(root, directory), { recursive: true });
  await writeFile(resolve(root, 'edgepress.config.mjs'), 'export default {paths:{theme:"themes/fixture"},i18n:{defaultLocale:"en",languagePacks:[]}};');
  await writeFile(resolve(root, 'config.yml'), 'site:\n  title: Audit fixture\n  url: https://audit.example.org\n  navigation:\n    - key: front\n      url: "@home"\n      labels: {en: Home}\n    - key: notes\n      url: "@archives"\n      labels: {en: Notes}\nplugins:\n  consent:\n    enabled: false\n    proposedDate: 2026-10-02\n    effectiveDate: 2026-10-02\n');
  await writeFile(resolve(root, 'languages/base/en.json'), await readFile(resolve(project, 'languages/base/en.json')));
  await writeFile(resolve(root, 'project-compatibility.json'), await readFile(resolve(project, 'project-compatibility.json')));
  await writeFile(resolve(root, 'wrangler.jsonc'), JSON.stringify({ main: 'src/index.js', compatibility_date: '2026-10-01', assets: { directory: 'dist', binding: 'ASSETS' } }));
  await writeFile(resolve(root, 'src/index.js'), 'export default {fetch(){return new Response("OK")}};');
  await writeFile(resolve(root, 'content/pages/home/en.md'), '---\ntitle: Audit fixture\nlang: en\nhomepage: true\nblocks:\n  - columns: 1\n    cells:\n      - - type: hero\n          title: Audit fixture\n          text: A site with no articles.\n---\n');
  await writeFile(resolve(root, 'themes/fixture/layouts/layout.html'), '<html lang="{{site.language}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{page.title}}</title><meta name="description" content="{{page.description}}"><link rel="canonical" href="{{page.canonical}}"><link rel="stylesheet" href="{{site.stylesheet}}"><script type="application/ld+json">{{{page.jsonLd}}}</script></head><body><a class="skip-link" href="#main">Skip to content</a><header><nav aria-label="Main navigation">{{{site.primaryNavigationHtml}}}</nav></header><main id="main" tabindex="-1">{{{page.content}}}</main><footer>Fixture footer</footer></body></html>');
  await writeFile(resolve(root, 'themes/fixture/assets/style.css'), 'body{margin:0;min-height:100vh;display:flex;flex-direction:column;font:16px system-ui}main{flex:1;max-width:100%;padding:16px}nav{display:flex;gap:20px}nav a{min-height:44px}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid blue;outline-offset:2px}.skip-link{position:absolute;top:-100px}.skip-link:focus{top:0}');
  return root;
}
async function cleanup(root) {
  assert.equal(dirname(root).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert.ok(basename(root).startsWith('edgepress-audit-test-'));
  await rm(root, { recursive: true, force: true });
}

test('Markdown self-check covers the renderer without any published article', async () => {
  const report = await markdownFeatureCoverage();
  assert.equal(report.status, 'pass');
  assert.equal(report.checks, 26);
  assert.equal(report.passed, report.checks);
  assert.match(report.documents[0].path, /not published/);
});

test('doctor reads Wrangler main and reports missing, unsafe or incompatible entries', async () => {
  const root = await fixture();
  try {
    assert.equal((await checkCompatibility({ root })).status, 'pass');
    const configFile = resolve(root, 'wrangler.jsonc');
    const config = JSON.parse(await readFile(configFile, 'utf8'));
    await writeFile(configFile, JSON.stringify({...config,main:undefined}));
    assert.equal((await checkCompatibility({root})).status,'pass','Assets-only hosting requires no Worker entry');
    for (const entry of [12, 'src/missing.js', project + '/src/worker.js']) {
      await writeFile(configFile, JSON.stringify({ ...config, main: entry }));
      const report = await checkCompatibility({ root });
      assert.equal(report.status, 'fail');
      assert.ok(report.issues.some(issue => issue.severity === 'error'));
    }
    await writeFile(configFile, JSON.stringify(config));
    await writeFile(resolve(root, 'src/index.js'), 'import fs from "node:fs";');
    assert.match((await checkCompatibility({ root })).issues[0].message, /Node.js built-in/);
  } finally { await cleanup(root); }
});

test('check and doctor work on a page-only project with no posts directory', { timeout: 180000 }, async () => {
  const root = await fixture();
  try {
    for (const command of ['doctor', 'check']) {
      const result = spawnSync(process.execPath, [resolve(project, 'src/cli.js'), command], { cwd: root, encoding: 'utf8', timeout: 150000 });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.doesNotMatch(result.stderr + result.stdout, /syntax guide post was not generated|ENOENT/);
    }
    await assert.rejects(access(resolve(root, 'content/posts')), { code: 'ENOENT' });
    await assert.rejects(access(resolve(root, 'dist/markdown-syntax-guide')), { code: 'ENOENT' });
  } finally { await cleanup(root); }
});

test('ordinary articles need no special tutorial slug to pass the audit', { timeout: 180000 }, async () => {
  const root = await fixture();
  try {
    await mkdir(resolve(root, 'content/posts/note'), { recursive: true });
    await writeFile(resolve(root, 'content/posts/note/en.md'), '---\ntitle: My first note\nlang: en\ndate: 2026-10-02\nslug: note\n---\nAn ordinary **Markdown** article.\n');
    const result = spawnSync(process.execPath, [resolve(project, 'src/cli.js'), 'check'], { cwd: root, encoding: 'utf8', timeout: 150000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(await readFile(resolve(root, 'dist/2026/10/note/index.html'), 'utf8'), /My first note/);
  } finally { await cleanup(root); }
});

async function installedBrowser() {
  const candidates = [process.env.EDGEPRESS_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', chromium.executablePath()];
  for (const path of candidates.filter(Boolean)) { try { await access(path); return path; } catch {} }
}

test('device/AX/keyboard simulations pass accessible pages and catch inaccessible ones', { timeout: 120000 }, async t => {
  const executablePath = await installedBrowser();
  if (!executablePath) { t.skip('No installed Chromium browser; browser simulation was not performed.'); return; }
  const good = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}a:focus-visible,.scroller:focus-visible{outline:3px solid blue}.skip{position:absolute;top:-100px}.skip:focus{top:0}.scroller{max-width:100%;overflow:auto}.wide{width:1000px;height:50px}</style></head><body><a class="skip" href="#main">Skip to main</a><nav aria-label="Navigation"><a href="#section">Read more</a></nav><main id="main" tabindex="-1"><h1>Accessible fixture</h1><h2 id="section">Section</h2><div class="scroller" role="region" aria-label="Scroll one"><div class="wide">Wide content one</div></div><div class="scroller" role="region" aria-label="Scroll two"><div class="wide">Wide content two</div></div></main></body></html>';
  const bad = good.replace('aria-label="Navigation"', '').replace('</main>', '<button></button></main>').replace('outline:3px solid blue', 'outline:none');
  const trap = good.replace('</main>', '<a href="#section">Unreachable link</a></main>').replace('</body>', '<script>document.addEventListener("keydown",event=>{if(event.key==="Tab"&&!event.shiftKey&&document.activeElement.textContent==="Read more"){event.preventDefault();document.querySelector(".skip").focus();}})</script></body>');
  const smooth=good.replace('body{margin:0}','html{scroll-behavior:smooth}button:focus-visible{outline:3px solid blue}body{margin:0}').replace('</main>','<div style="height:2200px"></div><button>After the fold</button></main>');
  const server = createServer((request, response) => { response.setHeader('content-type', 'text/html'); response.end(request.url === '/bad' ? bad : request.url === '/trap' ? trap : request.url==='/smooth'?smooth:good); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio', '--disable-notifications'] });
  try {
    const page = await browser.newPage();
    const session = await page.context().newCDPSession(page);
    const send = (method, params) => session.send(method, params);
    await send('Accessibility.enable');
    for (const device of deviceProfiles) for (const colorScheme of ['light', 'dark']) {
      const profile = { ...device, colorScheme };
      await send('Emulation.setDeviceMetricsOverride', { width: device.width, height: device.height, deviceScaleFactor: device.deviceScaleFactor, mobile: device.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: device.touch, maxTouchPoints: 5 });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: colorScheme }] });
      await page.goto('http://127.0.0.1:' + server.address().port + '/');
      const report = await auditBrowser(send, profile);
      assert.equal(report.status, 'pass', JSON.stringify(report.checks.filter(item => !item.passed)));
    }
    await page.goto('http://127.0.0.1:' + server.address().port + '/bad');
    const report = await auditBrowser(send, { ...deviceProfiles[2], colorScheme: 'dark' });
    assert.equal(report.status, 'fail');
    assert.ok(report.checks.some(item => item.group === 'semantics' && !item.passed));
    assert.ok(report.checks.some(item => item.group === 'keyboard' && !item.passed));
    await page.goto('http://127.0.0.1:' + server.address().port + '/trap');
    const trapped = await auditBrowser(send, { ...deviceProfiles[2], colorScheme: 'dark' });
    assert.equal(trapped.status, 'fail');
    assert.ok(trapped.checks.some(item => item.name === 'Native page wrap does not skip tabbable controls' && !item.passed));
    await page.goto('http://127.0.0.1:'+server.address().port+'/smooth');
    const scrolled=await auditBrowser(send,{...deviceProfiles[2],colorScheme:'dark'});
    assert.equal(scrolled.status,'pass',JSON.stringify(scrolled.checks.filter(item=>!item.passed)));
    assert.ok(scrolled.trace.some(item=>item.name==='After the fold'));

  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});


test('clean clears generated cache even when there is no reports directory',async()=>{
 const root=await fixture();
 try{
  await mkdir(resolve(root,'.edgepress/stale'),{recursive:true});await writeFile(resolve(root,'.edgepress/stale/output'),'cached');
  const result=spawnSync(process.execPath,[resolve(project,'src/cli.js'),'clean'],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);await assert.rejects(access(resolve(root,'.edgepress/stale')),error=>error.code==='ENOENT');
 }finally{await cleanup(root);}
});
