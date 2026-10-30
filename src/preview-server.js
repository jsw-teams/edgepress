import { request, createServer } from 'node:http';
import { startPageEditor } from './page-editor.js';

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

// Local tooling only. Wrangler continues to serve the site's actual static routes.
export async function startPreviewServer({ upstreamPort, ...options }) {
  return startPageEditor({
    ...options,
    basePath: '/__edgepress/',
    fallback(req, res) {
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
  });
}
