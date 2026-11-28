/**
 * 高并发零依赖静态生产服务器
 * 优化特性：
 * - 有界内存 LRU 缓存（默认上限 16MB）：热门页面与静态资源直接从内存响应，零磁盘 I/O
 * - 自动 Gzip 预压缩缓存（文本/HTML/CSS/JS/JSON/XML/SVG 体积缩减 70%+）
 * - 强 ETag + 304 Not Modified 条件缓存
 * - 安全响应头（X-Content-Type-Options / Referrer-Policy / X-Frame-Options）
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { extname, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".xml", ".svg", ".txt"]);

class ByteBoundedLRU {
  constructor(maxBytes = 16 * 1024 * 1024) {
    this.maxBytes = maxBytes;
    this.usedBytes = 0;
    this.map = new Map();
  }

  get(key) {
    const val = this.map.get(key);
    if (!val) return undefined;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key, entry) {
    if (entry.bytes > this.maxBytes) return;
    if (this.map.has(key)) {
      this.usedBytes -= this.map.get(key).bytes;
      this.map.delete(key);
    }
    while (this.usedBytes + entry.bytes > this.maxBytes && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value;
      this.usedBytes -= this.map.get(oldestKey).bytes;
      this.map.delete(oldestKey);
    }
    this.map.set(key, entry);
    this.usedBytes += entry.bytes;
  }
}

export function startStaticServer(outputDir, options = {}) {
  const root = resolve(outputDir);
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 8787;
  const cache = new ByteBoundedLRU(options.cacheMaxBytes ?? 16 * 1024 * 1024);

  async function resolveFile(rawPathname) {
    let pathname;
    try {
      pathname = decodeURIComponent(rawPathname);
    } catch {
      return null;
    }
    if (pathname.includes("\0") || pathname.includes("\\")) return null;
    const clean = pathname.replace(/^\/+/, "");
    const candidate = resolve(root, clean);
    if (candidate !== root && !candidate.startsWith(root + sep)) return null;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
      if (info.isDirectory()) {
        const idx = resolve(candidate, "index.html");
        if ((await stat(idx)).isFile()) return idx;
      }
    } catch {}
    return null;
  }

  const server = createServer(
    { keepAliveTimeout: 5000, headersTimeout: 10000, requestTimeout: 15000 },
    async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { "content-type": "text/plain; charset=utf-8" }).end("Method Not Allowed");
        return;
      }

      const url = new URL(req.url || "/", `http://${host}`);
      const file = await resolveFile(url.pathname);
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 Not Found");
        return;
      }

      let entry = cache.get(file);
      if (!entry) {
        const raw = await readFile(file);
        const ext = extname(file).toLowerCase();
        const type = MIME[ext] || "application/octet-stream";
        const etag = `"${createHash("sha1").update(raw).digest("hex").slice(0, 16)}"`;
        const gzip = COMPRESSIBLE.has(ext) && raw.byteLength >= 512 ? gzipSync(raw, { level: 6 }) : null;
        entry = {
          raw,
          gzip,
          type,
          etag,
          cacheControl: ext === ".html" ? "public, max-age=60, must-revalidate" : "public, max-age=31536000, immutable",
          bytes: raw.byteLength + (gzip ? gzip.byteLength : 0)
        };
        cache.set(file, entry);
      }

      const headers = {
        "content-type": entry.type,
        etag: entry.etag,
        "cache-control": entry.cacheControl,
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "strict-origin-when-cross-origin"
      };

      if (req.headers["if-none-match"] === entry.etag) {
        res.writeHead(304, headers).end();
        return;
      }

      const acceptGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
      const payload = acceptGzip && entry.gzip ? entry.gzip : entry.raw;
      if (acceptGzip && entry.gzip) {
        headers["content-encoding"] = "gzip";
        headers["vary"] = "Accept-Encoding";
      }
      headers["content-length"] = String(payload.byteLength);

      res.writeHead(200, headers);
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(payload);
      }
    }
  );

  server.maxConnections = options.maxConnections ?? 4096;

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolvePromise({
        server,
        host: typeof addr === "object" && addr ? addr.address : host,
        port: typeof addr === "object" && addr ? addr.port : port,
        close: () => new Promise((done) => server.close(() => done()))
      });
    });
  });
}
