import { request, createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { startPageEditor } from './page-editor.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.pdf': 'application/pdf'
};

export function previewOptions(args) {
  const forwarded = [];
  let port = 8787;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (/^--(?:port|ip|local-protocol)(?:=|$)/.test(argument)) {
      const [name, inline] = argument.split('=');
      const value = inline ?? args[++index];
      if (name === '--port') {
        if (!/^\d{1,5}$/.test(value || '') || Number(value) < 1 || Number(value) > 65535) throw new Error('Preview port must be 1–65535');
        port = Number(value);
      } else if (name === '--ip' && value !== '127.0.0.1') throw new Error('Preview binds only to 127.0.0.1');
      else if (name === '--local-protocol' && value !== 'http') throw new Error('Local preview uses HTTP on loopback');
    } else forwarded.push(argument);
  }
  return { port, forwarded };
}

export async function availablePreviewPort() {
  const probe = createServer();
  await new Promise((done, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', done); });
  const port = probe.address().port;
  await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
  return port;
}

async function resolveStaticFile(outputDir, rawPathname) {
  let pathname;
  try { pathname = decodeURIComponent(rawPathname); } catch { return null; }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const clean = pathname.replace(/^\/+/, '');
  const candidate = resolve(outputDir, clean);
  if (candidate !== outputDir && !candidate.startsWith(outputDir + sep)) return null;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return { file: candidate, redirect: null };
    if (info.isDirectory()) {
      if (pathname !== '/' && !pathname.endsWith('/')) return { file: null, redirect: pathname + '/' };
      const idx = resolve(candidate, 'index.html');
      const idxInfo = await stat(idx);
      if (idxInfo.isFile()) return { file: idx, redirect: null };
    }
  } catch {}
  if (!pathname.endsWith('/') && !extname(pathname)) {
    try {
      const htmlFile = candidate + '.html';
      if ((await stat(htmlFile)).isFile()) return { file: htmlFile, redirect: null };
    } catch {}
  }
  return null;
}

function createStaticFallback(outputDir, locales = ['en']) {
  const outputRoot = resolve(outputDir);
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method not allowed');
      return;
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const resolved = await resolveStaticFile(outputRoot, url.pathname);
    if (resolved?.redirect) {
      res.writeHead(308, { Location: resolved.redirect + url.search }).end();
      return;
    }
    if (resolved?.file) {
      try {
        const body = await readFile(resolved.file);
        const type = MIME_TYPES[extname(resolved.file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': String(body.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      } catch {}
    }
    const firstSegment = url.pathname.replace(/^\/+/, '').split('/')[0];
    const matchedLocale = locales.find(l => l.toLowerCase() === firstSegment.toLowerCase());
    const notFoundCandidates = [
      ...(matchedLocale ? [resolve(outputRoot, matchedLocale, '404.html')] : []),
      resolve(outputRoot, '404.html')
    ];
    for (const file of notFoundCandidates) {
      try {
        const body = await readFile(file);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      } catch {}
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Not found');
  };
}

// Local tooling only. Serves generated static files directly with zero external dependencies,
// or proxies to an upstream port when explicitly supplied.
export async function startPreviewServer({ upstreamPort, outputDir, ...options }) {
  const fallback = upstreamPort
    ? (req, res) => {
        const upstream = request({
          hostname: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method,
          headers: { ...req.headers, host: '127.0.0.1:' + upstreamPort }
        }, response => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
          response.once('error', () => res.destroy());
        });
        upstream.once('error', () => {
          if (res.headersSent) return res.destroy();
          res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '1' });
          res.end('Local preview is rebuilding. Please reload shortly.');
        });
        req.once('aborted', () => upstream.destroy());
        res.once('close', () => upstream.destroy());
        req.pipe(upstream);
      }
    : createStaticFallback(outputDir || resolve(options.root || process.cwd(), 'dist'), options.locales);

  return startPageEditor({
    ...options,
    basePath: '/__edgepress/',
    fallback
  });
}
