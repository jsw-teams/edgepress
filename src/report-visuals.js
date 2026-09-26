import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolutePath(rel);
}

function isAbsolutePath(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith(sep) || value.startsWith('/');
}

async function browserPath() {
  const candidates = [];
  if (process.env.EDGEPRESS_BROWSER) candidates.push(process.env.EDGEPRESS_BROWSER);
  const programFiles = process.env['PROGRAMFILES'];
  const programFilesX86 = process.env['PROGRAMFILES(X86)'];
  const localAppData = process.env['LOCALAPPDATA'];
  if (programFilesX86) candidates.push(resolve(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'));
  if (programFiles) {
    candidates.push(resolve(programFiles, 'Microsoft/Edge/Application/msedge.exe'));
    candidates.push(resolve(programFiles, 'Google/Chrome/Application/chrome.exe'));
  }
  if (localAppData) candidates.push(resolve(localAppData, 'Microsoft/Edge/Application/msedge.exe'));
  candidates.push('/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { await access(candidate); return candidate; } catch { /* Try the next installed browser. */ }
  }
  return null;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}

async function startHeadlessBrowser(executable, profile) {
  const port = await freePort();
  const child = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    '--remote-debugging-port=' + port, '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  try {
    let targets = [];
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        if (targets.some((target) => target.type === 'page')) break;
      } catch { /* Wait for the headless browser endpoint. */ }
      if (child.exitCode !== null) throw new Error('Headless browser exited during startup');
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('Headless browser did not expose a page target');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    let messageId = 0;
    const pending = new Map();
    const eventWaiters = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const callbacks = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) callbacks.reject(new Error(message.error.message));
        else callbacks.resolve(message.result);
      }
      if (message.method && eventWaiters.has(message.method)) {
        const waiters = eventWaiters.get(message.method);
        eventWaiters.delete(message.method);
        for (const resolveEvent of waiters) resolveEvent(message.params);
      }
    });
    const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
      const id = ++messageId;
      pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const waitFor = (method) => new Promise((resolveEvent) => {
      const waiters = eventWaiters.get(method) || [];
      waiters.push(resolveEvent);
      eventWaiters.set(method, waiters);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    const setViewport = async (viewport) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === 'mobile',
        screenWidth: viewport.width, screenHeight: viewport.height
      });
    };
    const navigate = async (url) => {
      const loaded = waitFor('Page.loadEventFired');
      const result = await send('Page.navigate', { url });
      if (result.errorText) throw new Error('Could not load screenshot page: ' + result.errorText);
      await withTimeout(loaded, 20000, 'Screenshot page load timed out');
      await send('Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 150)))', awaitPromise: true });
    };
    const screenshot = async ({ hideConsent = false, clipSelector = '' } = {}) => {
      let previousDisplay;
      if (hideConsent) {
        const hidden = await send('Runtime.evaluate', {
          expression: '(() => { const node = document.querySelector("[data-consent-ui]"); if (!node) return null; const old = node.style.display; node.style.display = "none"; return old; })()',
          returnByValue: true
        });
        previousDisplay = hidden.result.value;
      }
      try {
        let clip;
        if (clipSelector) {
          const measured = await send('Runtime.evaluate', {
            expression: '(() => { const node = document.querySelector("' + clipSelector + '"); if (!node) return null; const rect = node.getBoundingClientRect(); return JSON.stringify({x:Math.max(0,rect.left),y:Math.max(0,rect.top),width:Math.min(window.innerWidth,rect.right)-Math.max(0,rect.left),height:Math.min(window.innerHeight,rect.bottom)-Math.max(0,rect.top)}); })()',
            returnByValue: true
          });
          if (!measured.result.value) return null;
          const rect = JSON.parse(measured.result.value);
          if (rect.width <= 0 || rect.height <= 0) return null;
          clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 };
        }
        const result = await send('Page.captureScreenshot', {
          format: 'png', fromSurface: true, captureBeyondViewport: false, ...(clip ? { clip } : {})
        });
        return Buffer.from(result.data, 'base64');
      } finally {
        if (hideConsent && previousDisplay !== undefined && previousDisplay !== null) {
          await send('Runtime.evaluate', {
            expression: '(() => { const node = document.querySelector("[data-consent-ui]"); if (node) node.style.display = ' + JSON.stringify(previousDisplay) + '; })()'
          });
        }
      }
    };
    const metrics = async () => {
      const result = await send('Runtime.evaluate', {
        expression: '(() => { const manager = document.querySelector("[data-consent-ui]"); const oldDisplay = manager?.style.display; if (manager) manager.style.display = "none"; const pageDocumentWidth = Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth || 0); if (manager) manager.style.display = oldDisplay; const panel = manager?.querySelector(".privacy-panel"); const rect = manager?.getBoundingClientRect(); const panelRect = panel?.getBoundingClientRect(); const buttons = [...(panel?.querySelectorAll("button") || [])]; const buttonsFit = !panelRect || buttons.every(button => { const r = button.getBoundingClientRect(); return r.left >= panelRect.left - 1 && r.right <= panelRect.right + 1; }); const consentInnerNoOverflow = !panel || (panel.scrollWidth <= panel.clientWidth + 1 && buttonsFit); const consentWithinViewport = !rect || (rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1); const accept = panel?.querySelector(".privacy-accept"); const reject = panel?.querySelector(".privacy-reject"); const ar = accept?.getBoundingClientRect(); const rr = reject?.getBoundingClientRect(); const consentActionsBalanced = Boolean(accept && reject && Math.abs(ar.width-rr.width)<1 && Math.abs(ar.height-rr.height)<1 && getComputedStyle(accept).backgroundColor===getComputedStyle(reject).backgroundColor); const switches = [...(panel?.querySelectorAll(".privacy-service-toggle input") || [])]; const consentOptInDefault = switches.every(input => !input.checked); const serviceCards = [...(panel?.querySelectorAll(".privacy-service-setting") || [])]; const consentServiceDisclosures = serviceCards.length===0 || serviceCards.every(card => card.querySelectorAll(".privacy-service-disclosures dt").length>=4); const consentDetails = Boolean(panel?.querySelector(".privacy-details>summary")); return JSON.stringify({viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,pageDocumentWidth,consentExists:Boolean(manager),consentWithinViewport,consentInnerNoOverflow,consentActionsBalanced,consentOptInDefault,consentServiceDisclosures,consentDetails,consentWidth:rect?.width || 0,consentHeight:rect?.height || 0}); })()',
        returnByValue: true
      });
      return JSON.parse(result.result.value);
    };
    const printToPdf = async () => {
      let result;
      try {
        result = await send('Page.printToPDF', {
          printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
          generateTaggedPDF: true, generateDocumentOutline: true
        });
      } catch {
        result = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
      }
      return Buffer.from(result.data, 'base64');
    };
    const close = async () => {
      try { socket.close(); } catch { /* Browser is shutting down. */ }
      if (child.exitCode === null) {
        child.kill();
        await new Promise((resolveExit) => child.once('exit', resolveExit));
      }
    };
    return { setViewport, navigate, screenshot, metrics, printToPdf, close };
  } catch (error) {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolveExit) => child.once('exit', resolveExit));
    }
    throw error;
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function reportHtml(report, screenshots) {
  const documents = report.documents || [];
  const reportReading = report.visualEvidence?.reportAccessibility || { status: 'pending', checks: 0, passed: 0 };
  const consentChecks = report.consentUi?.checks || 0;
  const consentPassed = report.consentUi?.passed || 0;
  const consentErrors = Math.max(0, consentChecks - consentPassed);
  const consentScore = consentChecks ? Math.floor(consentPassed / consentChecks * 100) + '%' : '—';
  const typeLabel = (type) => ({ post: 'Posts', page: 'Pages', homepage: 'Homepages', system: 'System routes', consent: 'Consent interface' })[type] || type;
  const statusTable = '<table><caption>Audit results</caption><thead><tr><th scope="col">Audit</th><th scope="col">Status</th>' +
    '<th scope="col">Score</th><th scope="col">Checks</th><th scope="col">Errors</th><th scope="col">Warnings</th></tr></thead><tbody>' +
    '<tr><th scope="row">Accessibility</th><td>' + escapeHtml(report.accessibility.status) + '</td><td>' + report.accessibility.score +
    '%</td><td>' + report.accessibility.checks + '</td><td>' + report.accessibility.errors + '</td><td>' + report.accessibility.warnings + '</td></tr>' +
    '<tr><th scope="row">Agent friendliness</th><td>' + escapeHtml(report.agentFriendliness.status) + '</td><td>' + report.agentFriendliness.score +
    '%</td><td>' + report.agentFriendliness.checks + '</td><td>' + report.agentFriendliness.errors + '</td><td>' + report.agentFriendliness.warnings + '</td></tr>' +
    '<tr><th scope="row">Markdown rendering</th><td>' + escapeHtml(report.markdownRendering?.status || 'not run') + '</td><td>—</td><td>' +
    (report.markdownRendering?.checks || 0) + '</td><td>' + ((report.markdownRendering?.checks || 0) - (report.markdownRendering?.passed || 0)) + '</td><td>0</td></tr>' +
    '<tr><th scope="row">Consent interface</th><td>' + escapeHtml(report.consentUi?.status || 'not checked') + '</td><td>' + consentScore +
    '</td><td>' + consentChecks + '</td><td>' + consentErrors + '</td><td>0</td></tr>' +
    '<tr><th scope="row">Report reading structure</th><td>' + escapeHtml(reportReading.status) + '</td><td>' +
    Math.floor(reportReading.passed / Math.max(1, reportReading.checks) * 100) + '%</td><td>' + reportReading.checks +
    '</td><td>' + (reportReading.checks - reportReading.passed) + '</td><td>0</td></tr>' +
    '</tbody></table>';
  const summary = '<table><caption>Reviewed content</caption><thead><tr><th scope="col">Content type</th><th scope="col">Documents</th></tr></thead><tbody>' +
    ['post', 'page', 'homepage', 'system'].map((type) => '<tr><th scope="row">' + typeLabel(type) + '</th><td>' +
      documents.filter((item) => item.type === type).length + '</td></tr>').join('') + '</tbody></table>';
  const documentSections = ['post', 'page', 'homepage'].map((type) => {
    const items = documents.filter((item) => item.type === type);
    if (!items.length) return '';
    return '<section><h3>' + typeLabel(type) + ' reviewed</h3><table><caption>' + typeLabel(type) + ' accessibility and agent-friendliness status</caption>' +
      '<thead><tr><th scope="col">Title</th><th scope="col">Generated route</th><th scope="col">Status</th></tr></thead><tbody>' +
      items.map((item) => '<tr><th scope="row">' + escapeHtml(item.title) + '</th><td><code>' + escapeHtml(item.path) + '</code></td><td>' +
        escapeHtml(item.status) + '</td></tr>').join('') + '</tbody></table></section>';
  }).join('');
  const findings = report.issues.length
    ? '<ul>' + report.issues.map((item) => '<li><strong>' + escapeHtml(item.severity + ' · ' + item.category) +
      '</strong> ' + escapeHtml(item.page) + ' — ' + escapeHtml(item.message) + '</li>').join('') + '</ul>'
    : '<p>No findings.</p>';
  const screenshotGroups = ['post', 'page', 'homepage', 'system', 'consent'].map((type) => {
    const items = screenshots.filter((item) => item.type === type);
    if (!items.length) return '';
    return '<section><h3>' + typeLabel(type) + ' screenshots</h3>' + items.map((item) => {
      const dimensions = item.capture === 'consent'
        ? 'Consent component ' + Math.round(item.consentWidth || 0) + ' by ' + Math.round(item.consentHeight || 0) + ' CSS pixels; within viewport: ' + Boolean(item.consentWithinViewport)
        : item.viewportWidth + ' CSS pixels wide; page content width ' + item.documentWidth + ' CSS pixels with consent hidden';
      const alt = 'Screenshot of ' + (item.title || item.page) + ' at the ' + item.viewport + ' viewport, ' +
        item.width + ' by ' + item.height + ' pixels; ' + dimensions + '.';
      return '<h4>' + escapeHtml(item.title || item.page) + ' · ' + escapeHtml(item.viewport) + '</h4><figure><img src="./page-check-screenshots/' +
        escapeHtml(item.file) + '" alt="' + escapeHtml(alt) + '"><figcaption><strong>' + escapeHtml(item.title || item.page) +
        '</strong><br><code>' + escapeHtml(item.page) + '</code> · ' + escapeHtml(item.viewport) + ' viewport · ' +
        escapeHtml(dimensions) + '</figcaption></figure>';
    }).join('') + '</section>';
  }).join('');
  const markdownDetails = (report.markdownRendering?.documents || []).map((document) => '<section><h3>' + escapeHtml(document.path) +
    '</h4><ul>' + document.checks.map((item) => '<li>' + (item.passed ? 'Pass' : 'Fail') + ' — ' + escapeHtml(item.feature) + '</li>').join('') + '</ul></section>').join('');
  const consentDetails = [...(report.consentUi?.results || []), ...(report.consentUi?.visualChecks || [])]
    .map((item) => '<li>' + (item.passed ? 'Pass' : 'Fail') + ' — ' + escapeHtml(item.name ||
      (item.page + ' at ' + item.viewport + ' viewport')) + '</li>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>EdgePress accessibility and content report</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}html{scroll-behavior:smooth}body{font:12px/1.55 Arial,sans-serif;color:#202520;background:#fff;margin:0 auto;padding:16px;max-width:1100px}header,main,footer{display:block}h1{font-size:25px;line-height:1.2}h2{font-size:19px;margin:26px 0 8px}h3{font-size:15px;margin:20px 0 8px}h4{font-size:12px;margin:16px 0 6px}p{margin:6px 0}a{color:#174c35;text-decoration:underline;text-underline-offset:2px}a:focus-visible{outline:3px solid #9a481e;outline-offset:3px}.skip-link{position:absolute;left:-10000px;top:auto}.skip-link:focus{left:16px;top:16px;padding:8px;background:#fff;border:2px solid #174c35;z-index:2}.report-nav ul{display:flex;gap:18px;flex-wrap:wrap;padding-left:20px}table{width:100%;border-collapse:collapse;margin:10px 0 20px;table-layout:fixed}caption{text-align:left;font-weight:bold;padding:0 0 6px}th,td{padding:7px;border:1px solid #879188;text-align:left;vertical-align:top;overflow-wrap:anywhere}thead th{background:#e9eee9}tbody th{background:#f5f6f3}li{margin:4px 0;overflow-wrap:anywhere}code{overflow-wrap:anywhere}.status{font-weight:bold;text-transform:uppercase}.appendix{break-before:page}figure{margin:0 0 20px;break-inside:avoid}figure img{display:block;max-width:100%;max-height:220mm;width:auto;height:auto;margin:0 auto;border:1px solid #879188;object-fit:contain}figcaption{font-size:10px;color:#39443b;margin-top:5px}section{break-inside:auto}footer{border-top:1px solid #879188;margin-top:24px;padding-top:10px}@media(max-width:600px){body{padding:12px}.report-nav ul{display:block}table{font-size:11px}th,td{padding:5px}}@media print{body{max-width:none;padding:0}.report-nav{display:none}a{color:#202520}.appendix{break-before:page}h2,h3,h4{break-after:avoid}figure{break-inside:avoid}}</style></head>' +
    '<body><a class="skip-link" href="#main">Skip to report</a><header><h1>EdgePress accessibility and content report</h1><p>Generated ' +
    escapeHtml(report.generatedAt) + ' · Overall status: <span class="status">' + escapeHtml(report.status) + '</span>.</p>' +
    '<nav class="report-nav" aria-label="Report sections"><ul><li><a href="#summary">Summary</a></li><li><a href="#content">Content reviewed</a></li>' +
    '<li><a href="#findings">Findings</a></li><li><a href="#markdown">Markdown rendering</a></li><li><a href="#consent">Consent interface</a></li><li><a href="#evidence">Screenshots</a></li><li><a href="#scope">Scope</a></li></ul></nav></header>' +
    '<main id="main"><section id="summary"><h2>Audit summary</h2>' + statusTable + summary + '<p>Generated HTML documents: ' + report.pages +
    ' · HTML bytes: ' + report.metrics.htmlBytes + ' · Stylesheet references: ' + report.metrics.stylesheets +
    ' · Script references: ' + report.metrics.scripts + '.</p></section>' +
    '<section id="content"><h2>Content reviewed</h2><p>Every generated post and customizable page is listed with its generated route and audit status. Posts are checked alongside pages.</p>' +
    documentSections + '</section><section id="findings"><h2>Findings</h2>' + findings + '</section>' +
    '<section id="markdown"><h2>Markdown rendering verification</h2><p>' + escapeHtml(String(report.markdownRendering?.passed || 0)) + ' of ' +
    escapeHtml(String(report.markdownRendering?.checks || 0)) + ' syntax checks passed across the tutorial post locales.</p>' + markdownDetails + '</section>' +
    '<section id="consent"><h2>Consent interface checks</h2><p>Consent component checks run separately from page-content layout checks.</p>' +
    (consentDetails ? '<ul>' + consentDetails + '</ul>' : '<p>No consent UI checks were run.</p>') + '</section>' +
    '<section id="evidence" class="appendix"><h2>Responsive and consent screenshots</h2><p>Page screenshots use a 390 by 844 CSS pixel mobile viewport and hide the consent component while measuring page content. Separate consent screenshots crop the component at desktop and mobile sizes.</p>' +
    screenshotGroups + '</section><section id="scope"><h2>Scope and limits</h2><ul>' + report.scope.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') +
    '</ul></section></main><footer><p>EdgePress local PDF report. Screenshot details are included as evidence and may be small when printed.</p></footer></body></html>';
}

function checkReportReadingStructure(html) {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed });
  check('document language', /<html\b[^>]*\blang="[^"]+"/i.test(html));
  check('document title', /<title>[^<]+<\/title>/i.test(html));
  check('skip link and main landmark', /class="skip-link"[^>]*href="#main"/i.test(html) && /<main\b[^>]*id="main"/i.test(html));
  check('one report title', [...html.matchAll(/<h1\b/gi)].length === 1);
  check('labeled report navigation', /<nav\b[^>]*aria-label="[^"]+"/i.test(html));
  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  let previous = 0;
  let skipped = false;
  for (const level of headings) {
    if (previous && level > previous + 1) skipped = true;
    previous = level;
  }
  check('sequential heading levels', !skipped);
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)];
  check('described screenshot images', images.length > 0 && images.every((item) => /\balt="[^"]+"/i.test(item[1])));
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  check('named report links', links.every((item) => /\baria-label="[^"]+"/i.test(item[1]) || item[2].replace(/<[^>]*>/g, '').trim()));
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  check('captioned tables with scoped headers', tables.length > 0 && tables.every((item) =>
    /<caption>[^<]+<\/caption>/i.test(item[1]) && /<thead\b/i.test(item[1]) &&
    [...item[1].matchAll(/<th\b([^>]*)>/gi)].length > 0 && [...item[1].matchAll(/<th\b([^>]*)>/gi)]
      .every((header) => /\bscope="(?:col|row)"/i.test(header[1]))));
  const ids = [...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
  check('unique in-page section targets', new Set(ids).size === ids.length);
  check('visible keyboard focus', /:focus-visible\s*\{[^}]*outline/i.test(html));
  return { status: checks.every((item) => item.passed) ? 'pass' : 'fail', checks: checks.length,
    passed: checks.filter((item) => item.passed).length, results: checks };
}

async function startReportServer(output, evidenceDirectory, htmlPath) {
  const outputRoot = await realpath(output);
  const evidenceRoot = await realpath(evidenceDirectory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/report.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(await readFile(htmlPath));
        return;
      }
      let base;
      let relativePath;
      if (pathname.startsWith('/evidence/') || pathname.startsWith('/page-check-screenshots/')) {
        base = evidenceRoot;
        relativePath = pathname.startsWith('/evidence/')
          ? pathname.slice('/evidence/'.length)
          : pathname.slice('/page-check-screenshots/'.length);
      } else {
        base = outputRoot;
        relativePath = pathname.startsWith('/site/') ? pathname.slice('/site/'.length) : pathname.replace(/^\/+/, '');
      }
      let target = resolve(base, relativePath);
      if (!inside(base, target)) {
        response.writeHead(400);
        response.end();
        return;
      }
      let info;
      try { info = await lstat(target); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (!extname(target)) {
          const fileCandidate = target + '.html';
          try { info = await lstat(fileCandidate); target = fileCandidate; }
          catch { target = resolve(target, 'index.html'); info = await lstat(target); }
        } else throw error;
      }
      if (info.isSymbolicLink() || !info.isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      const realTarget = await realpath(target);
      if (!inside(base, realTarget)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(realTarget));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return { server, port: server.address().port };
}

function siteAddress(relativeFile) {
  return '/site/' + relativeFile.split('/').map(encodeURIComponent).join('/');
}

export async function addVisualEvidence(config, report) {
  const root = resolve(config.root, 'tools');
  const directoryInfo = await lstat(root);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) throw new Error('Report directory must be a real directory');
  const browser = await browserPath();
  if (!browser) {
    return { status: 'unavailable', reason: 'Install Microsoft Edge, Chrome, or Chromium to capture page screenshots and PDF evidence.' };
  }

  const stamp = createHash('sha256').update(report.generatedAt).digest('hex').slice(0, 8);
  const profile = await mkdtemp(resolve(tmpdir(), 'edgepress-report-' + process.pid + '-' + stamp + '-'));
  const evidenceDirectory = resolve(profile, 'page-check-screenshots');
  const htmlPath = resolve(profile, 'report.html');
  const pdfPath = resolve(root, 'page-check.pdf');
  let reportServer;
  let browserSession;
  try {
    await mkdir(evidenceDirectory, { recursive: true });
    const evidenceInfo = await lstat(evidenceDirectory);
    if (evidenceInfo.isSymbolicLink() || !evidenceInfo.isDirectory()) throw new Error('Temporary screenshot directory must be a real directory');
    const documents = new Map((report.documents || []).map((item) => [item.path, item]));
    const candidates = new Set((report.documents || [])
      .filter((item) => ['post', 'page', 'homepage'].includes(item.type))
      .map((item) => item.path));
    for (const locale of config.i18n.locales) {
      const prefix = locale === config.i18n.defaultLocale ? '' : locale + '/';
      candidates.add(prefix + 'index.html');
      candidates.add(prefix + 'privacy-policy/index.html');
    }
    for (const issue of report.issues) {
      if (issue.page && issue.page.toLowerCase().endsWith('.html')) candidates.add(issue.page);
    }

    const available = [];
    for (const relativeFile of candidates) {
      const target = resolve(config.resolvedPaths.output, relativeFile);
      try {
        const info = await lstat(target);
        if (info.isFile() && !info.isSymbolicLink()) available.push(relativeFile);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    const screenshots = [];
    const desktop = { name: 'desktop', width: 1440, height: 1100 };
    const mobile = { name: 'mobile', width: 390, height: 844 };
    const homePaths = new Set(config.i18n.locales.map((locale) => locale === config.i18n.defaultLocale ? 'index.html' : locale + '/index.html'));
    const privacyPaths = new Set(config.i18n.locales.map((locale) =>
      (locale === config.i18n.defaultLocale ? '' : locale + '/') + 'privacy-policy/index.html'));
    for (const relativeFile of available) {
      const document = documents.get(relativeFile) || { type: 'system', title: relativeFile };
      const viewports = homePaths.has(relativeFile) || privacyPaths.has(relativeFile) || document.type === 'post'
        ? [desktop, mobile] : [mobile];
      for (const viewport of viewports) {
        const digest = createHash('sha256').update(relativeFile + ':' + viewport.name).digest('hex').slice(0, 10);
        const file = 'page-' + digest + '.png';
        const target = resolve(evidenceDirectory, file);
        screenshots.push({ page: relativeFile, type: document.type, capture: 'page', title: document.title, viewport: viewport.name, width: viewport.width,
          height: viewport.height, file, target,
          label: relativeFile + ' · ' + viewport.name + ' (' + viewport.width + '×' + viewport.height + ')' });
      }
    }
    if (config.browserPlugins.consent.enabled) {
      const availableSet = new Set(available);
      for (const relativeFile of new Set([...homePaths, ...privacyPaths])) {
        if (!availableSet.has(relativeFile)) continue;
        for (const viewport of [desktop, mobile]) {
          const digest = createHash('sha256').update('consent:' + relativeFile + ':' + viewport.name).digest('hex').slice(0, 10);
          const file = 'consent-' + digest + '.png';
          screenshots.push({ page: relativeFile, type: 'consent', capture: 'consent', title: 'Privacy choices',
            viewport: viewport.name, width: viewport.width, height: viewport.height, file,
            target: resolve(evidenceDirectory, file), label: 'Privacy choices · ' + relativeFile + ' · ' + viewport.name +
              ' (' + viewport.width + '×' + viewport.height + ')' });
        }
      }
    }
    reportServer = await startReportServer(config.resolvedPaths.output, evidenceDirectory, htmlPath);
    browserSession = await startHeadlessBrowser(browser, profile);
    for (const screenshot of screenshots) {
      const viewport = screenshot.viewport === 'mobile' ? mobile : desktop;
      await browserSession.setViewport(viewport);
      await browserSession.navigate('http://127.0.0.1:' + reportServer.port + siteAddress(screenshot.page));
      const dimensions = await browserSession.metrics();
      if (screenshot.capture === 'consent') {
        report.consentUi.visualChecks ||= [];
        const checks = [
          ['component stays inside the viewport', dimensions.consentExists && dimensions.consentWithinViewport],
          ['component content stays inside its own box', dimensions.consentExists && dimensions.consentInnerNoOverflow],
          ['accept and reject actions have equal visual weight', dimensions.consentExists && dimensions.consentActionsBalanced],
          ['optional services begin unchecked', dimensions.consentExists && dimensions.consentOptInDefault],
          ['expanded service details disclose all configured fields', dimensions.consentExists && dimensions.consentServiceDisclosures && dimensions.consentDetails]
        ];
        report.consentUi.visualChecks.push(...checks.map(([name, passed]) => ({ page: screenshot.page, viewport: viewport.name,
          name, passed, consentWidth: dimensions.consentWidth, consentHeight: dimensions.consentHeight })));
        const withinViewport = dimensions.consentExists && dimensions.consentWithinViewport;
        const noInnerOverflow = dimensions.consentExists && dimensions.consentInnerNoOverflow;
        if (!dimensions.consentExists) {
          report.issues.push({ severity: 'error', category: 'consent-ui', page: screenshot.page,
            message: 'The consent manager did not appear in the browser.' });
        } else if (!withinViewport || !noInnerOverflow) {
          report.issues.push({ severity: 'error', category: 'consent-ui', page: screenshot.page,
            message: 'Consent UI exceeded its viewport or its own content box at the ' + viewport.name + ' size.' });
        }
      }
      const image = screenshot.capture === 'consent'
        ? await browserSession.screenshot({ clipSelector: '[data-consent-ui]' })
        : await browserSession.screenshot({ hideConsent: config.browserPlugins.consent.enabled });
      if (!image) {
        report.issues.push({ severity: 'error', category: screenshot.capture === 'consent' ? 'consent-ui' : 'visual-evidence',
          page: screenshot.page, message: 'The requested screenshot area was not present in the browser.' });
        continue;
      }
      await writeFile(screenshot.target, image);
      const imageInfo = await lstat(screenshot.target);
      if (!imageInfo.isFile() || imageInfo.size < 1000) throw new Error('Headless browser produced an empty screenshot');
      screenshot.viewportWidth = dimensions.viewportWidth;
      screenshot.documentWidth = dimensions.pageDocumentWidth;
      screenshot.consentWidth = dimensions.consentWidth;
      screenshot.consentHeight = dimensions.consentHeight;
      screenshot.consentWithinViewport = dimensions.consentWithinViewport;
      if (viewport.name === 'mobile' && dimensions.viewportWidth !== viewport.width) {
        report.issues.push({ severity: 'error', category: 'responsive-layout', page: screenshot.page,
          message: 'Mobile viewport measured ' + dimensions.viewportWidth + ' CSS pixels instead of ' + viewport.width + '.' });
      } else if (screenshot.capture === 'page' && viewport.name === 'mobile' && dimensions.pageDocumentWidth > dimensions.viewportWidth) {
        report.issues.push({ severity: 'error', category: 'responsive-layout', page: screenshot.page,
          message: 'Page content width is ' + dimensions.pageDocumentWidth + ' CSS pixels for a ' + dimensions.viewportWidth + ' pixel viewport; consent UI is measured separately.' });
      }
    }
    if (report.consentUi?.visualChecks) {
      const visualChecks = report.consentUi.visualChecks;
      report.consentUi.checks += visualChecks.length;
      report.consentUi.passed += visualChecks.filter((item) => item.passed).length;
      report.consentUi.status = report.consentUi.passed === report.consentUi.checks ? 'pass' : 'fail';
    }
    report.errors = report.issues.filter((item) => item.severity === 'error').length;
    report.warnings = report.issues.filter((item) => item.severity === 'warning').length;
    report.status = report.errors ? 'fail' : report.warnings ? 'warning' : 'pass';
    for (const document of report.documents || []) {
      const findings = report.issues.filter((item) => item.page === document.path);
      if (findings.some((item) => item.severity === 'error')) document.status = 'fail';
      else if (findings.length) document.status = 'warning';
    }
    report.visualEvidence = { status: 'complete', pdf: 'tools/page-check.pdf', screenshots: screenshots.filter((item) => item.viewportWidth).map((item) => ({
      page: item.page, type: item.type, capture: item.capture, title: item.title, viewport: item.viewport, width: item.width, height: item.height,
      viewportWidth: item.viewportWidth, documentWidth: item.documentWidth,
      consentWidth: item.consentWidth, consentHeight: item.consentHeight, consentWithinViewport: item.consentWithinViewport,
      label: item.label
    })) };
    const initialHtml = reportHtml(report, screenshots);
    const reportAccessibility = checkReportReadingStructure(initialHtml);
    report.visualEvidence.reportAccessibility = reportAccessibility;
    for (const check of reportAccessibility.results.filter((item) => !item.passed)) {
      report.issues.push({ severity: 'error', category: 'report-accessibility', page: 'tools/page-check.pdf',
        message: 'Report reading requirement failed: ' + check.name + '.' });
    }
    report.errors = report.issues.filter((item) => item.severity === 'error').length;
    report.warnings = report.issues.filter((item) => item.severity === 'warning').length;
    report.status = report.errors ? 'fail' : report.warnings ? 'warning' : 'pass';
    const finalHtml = reportHtml(report, screenshots);
    const finalReading = checkReportReadingStructure(finalHtml);
    report.visualEvidence.reportAccessibility = finalReading;
    if (finalReading.status !== 'pass') throw new Error('The generated accessibility report failed its reading-order checks.');
    await writeFile(htmlPath, finalHtml, 'utf8');
    await browserSession.setViewport({ name: 'desktop', width: 1200, height: 900 });
    await browserSession.navigate('http://127.0.0.1:' + reportServer.port + '/report.html');
    const pdf = await browserSession.printToPdf();
    if (pdf.length < 1000) throw new Error('Headless browser produced an empty PDF');
    await writeFile(pdfPath, pdf);
    return report.visualEvidence;
  } finally {
    if (browserSession) await browserSession.close();
    if (reportServer) await new Promise((resolveClose) => reportServer.server.close(resolveClose));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}
