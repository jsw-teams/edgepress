import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { auditBrowser } from './browser-audit.js';

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

async function connect(url) {
  const socket = new WebSocket(url);
  await withTimeout(new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  }), 10000, 'Browser protocol connection timed out');
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
    if (message.method) for (const listener of listeners) listener(message);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('Browser protocol connection closed'));
    pending.clear();
    for (const listener of listeners) listener({ method: 'connection.closed' });
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      const response = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      return withTimeout(response, 60000, 'Browser command timed out: ' + method).finally(() => pending.delete(id));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { socket.close(); }
  };
}

/** One software-rendered browser, with independently isolated page workers. */
export async function startHeadlessBrowser(executable, profile) {
  const port = await freePort();
  const child = spawn(executable, [
    '--headless=new', '--mute-audio', '--disable-notifications', '--disable-extensions',
    '--disable-sync', '--disable-back-forward-cache', '--disable-features=msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-gpu', '--disable-accelerated-video-decode', '--disable-accelerated-video-encode',
    '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port,
    '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  let startupError;
  child.once('error', error => { startupError = error; });
  let connection;
  const close = async () => {
    if (child.exitCode === null && !startupError) {
      const exited = new Promise(done => child.once('exit', done));
      try {
        if (connection) await withTimeout(connection.send('Browser.close'), 5000, 'Browser close command timed out');
        else child.kill();
        await withTimeout(exited, 5000, 'Browser exit timed out');
      } catch {
        if (child.exitCode === null) {
          if (process.platform === 'win32') {
            await new Promise(done => {
              const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
              killer.once('error', () => { child.kill(); done(); }); killer.once('exit', done);
            });
          } else child.kill('SIGKILL');
          await withTimeout(exited, 5000, 'Browser did not exit');
        }
      }
    }
    connection?.close();
  };
  try {
    let endpoint;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error('Headless browser exited during startup');
      try { endpoint = (await (await fetch('http://127.0.0.1:' + port + '/json/version')).json()).webSocketDebuggerUrl; } catch {}
      if (endpoint) break;
      await new Promise(done => setTimeout(done, 100));
    }
    if (!endpoint) throw new Error('Headless browser did not expose its protocol endpoint');
    connection = await connect(endpoint);
    let initialTargets = (await connection.send('Target.getTargets')).targetInfos.filter(target => target.type === 'page');
    return {
      close,
      async createSession() {
        const { browserContextId } = await connection.send('Target.createBrowserContext', { disposeOnDetach: true });
        try {
          const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank', browserContextId });
          const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
          const unusedTargets = initialTargets;
          initialTargets = [];
          for (const target of unusedTargets) await connection.send('Target.closeTarget', { targetId: target.targetId });
          return await createPageSession(connection, sessionId, () => connection.send('Target.disposeBrowserContext', { browserContextId }));
        } catch (error) {
          await connection.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
          throw error;
        }
      }
    };
  } catch (error) { await close(); throw error; }
}

async function createPageSession(connection, sessionId, dispose) {
  const send = (method, params) => connection.send(method, params, sessionId);
  const loaded = new Set();
  let waiting;
  const unsubscribe = connection.subscribe(message => {
    if (message.method === 'connection.closed' || (message.method === 'Target.detachedFromTarget' && message.params.sessionId === sessionId)) {
      waiting?.reject(new Error('Audit page connection closed'));
      return;
    }
    if (message.sessionId !== sessionId || message.method !== 'Page.lifecycleEvent' || message.params.name !== 'load') return;
    loaded.add(message.params.loaderId);
    if (waiting?.loaderId === message.params.loaderId) waiting.resolve();
  });
  await send('Page.enable');
  await send('Page.setLifecycleEventsEnabled', { enabled: true });
  await send('Runtime.enable');
  await send('Accessibility.enable');
  const navigate = async url => {
    loaded.clear();
    const result = await send('Page.navigate', { url });
    if (result.errorText) throw new Error('Could not load audit page: ' + result.errorText);
    if (result.loaderId && !loaded.has(result.loaderId)) {
      try {
        await withTimeout(new Promise((resolve, reject) => { waiting = { loaderId: result.loaderId, resolve, reject }; }), 20000, 'Audit page load timed out: ' + url);
      } finally { waiting = null; }
    }
    const rendered = await send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))', awaitPromise: true
    });
    if (rendered.exceptionDetails) throw new Error('Audit page did not finish rendering');
  };
  const close = async () => { waiting?.reject(new Error('Audit page closed')); unsubscribe(); await dispose(); };
  const setViewport = async (viewport) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.deviceScaleFactor || 1,
      mobile: viewport.mobile ?? viewport.name === 'mobile',
      screenWidth: viewport.width, screenHeight: viewport.height
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.touch ?? viewport.name === 'mobile', maxTouchPoints: 5 });
    await send('Emulation.setEmulatedMedia', { features: viewport.colorScheme
      ? [{ name: 'prefers-color-scheme', value: viewport.colorScheme }] : [] });
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
  return {setViewport, navigate, screenshot, metrics, printToPdf, close, audit: profile => auditBrowser(send, profile)};
}
