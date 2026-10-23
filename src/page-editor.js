import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import { resolve, relative, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPage } from './page-scaffold.js';

const editorRoot = dirname(fileURLToPath(import.meta.url));
const maxDocumentBytes = 2 * 1024 * 1024;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = source => createHash('sha256').update(source).digest('hex');
const inside = (root, file) => file !== root && !relative(root, file).startsWith('..' + sep) && relative(root, file) !== '..' && !relative(root, file).startsWith(sep);

async function listPages(contentRoot) {
  const found = [];
  async function scan(folder, prefix = '') {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await scan(resolve(folder, entry.name), prefix + entry.name + '/');
      else if (entry.isFile() && entry.name.endsWith('.json') && prefix) found.push(prefix + entry.name);
    }
  }
  await scan(contentRoot);
  return found.sort((a, b) => a.localeCompare(b));
}

async function safePageFile(contentRoot, path) {
  if (typeof path !== 'string' || path.includes('\\') || path.includes('..') || path.startsWith('/') || !path.endsWith('.json')) {
    throw new Error('Invalid page path');
  }
  if (!(await listPages(contentRoot)).includes(path)) throw new Error('Page does not exist');
  const folder = await realpath(contentRoot);
  const file = resolve(contentRoot, path);
  const actual = await realpath(file);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || !inside(folder, actual)) throw new Error('Unsafe page file');
  // The directory scanner rejects linked directories, even when the final file is regular.
  return file;
}

function validatePage(page, original, typeNames) {
  if (!isObject(page)) throw new Error('Page must be an object');
  if (page.lang !== original.lang || page.$schema !== original.$schema) throw new Error('The page language and schema cannot be changed here');
  if (typeof page.title !== 'string' || !page.title.trim() || page.title.length > 500) throw new Error('Page title is required');
  if (page.homepage !== undefined && typeof page.homepage !== 'boolean') throw new Error('homepage must be a boolean');
  if (!Array.isArray(page.blocks) || !page.blocks.length || page.blocks.length > 100) throw new Error('Page must contain 1–100 rows');
  function validateElements(elements, location, depth) {
    if (!Array.isArray(elements) || !elements.length || elements.length > 100) throw new Error(location + ' needs 1–100 elements');
    if (depth > 12) throw new Error('Nested elements are too deep');
    for (const [index, element] of elements.entries()) {
      if (!isObject(element) || !typeNames.has(element.type)) throw new Error(location + '[' + index + '] has an invalid element type');
      if (element.blocks !== undefined) validateElements(element.blocks, location + '[' + index + '].blocks', depth + 1);
    }
  }
  for (const [index, row] of page.blocks.entries()) {
    if (!isObject(row) || Object.keys(row).some(key => !['columns', 'cells'].includes(key))) throw new Error('Invalid row at ' + index);
    if (!Number.isInteger(row.columns) || row.columns < 1 || row.columns > 4 || !Array.isArray(row.cells) || row.cells.length !== row.columns) throw new Error('Row ' + (index + 1) + ' must have 1–4 matching columns and cells');
    for (const [cell, elements] of row.cells.entries()) validateElements(elements, 'Row ' + (index + 1) + ', column ' + (cell + 1), 0);
  }
}

function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

async function requestBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new Error('Expected application/json');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxDocumentBytes) throw new Error('Page exceeds 2 MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Starts a loopback-only editor. Never deploy this server. */
export async function startPageEditor({ root = process.cwd(), port = 4178, locales = ['en', 'zh-CN'], defaultLocale = 'en' } = {}) {
  const contentRoot = resolve(root, 'content/pages');
  const typeSchema = JSON.parse(await readFile(resolve(editorRoot, '../schemas/pages.schema.json'), 'utf8'));
  const typeNames = new Set(typeSchema.definitions.element.properties.type.enum);
  const catalog = JSON.parse(await readFile(resolve(editorRoot, 'page-block-catalog.json'), 'utf8'));
  if (typeNames.size !== Object.keys(catalog.blocks).length || [...typeNames].some(type => !catalog.blocks[type]?.template || catalog.blocks[type].template.type !== type)) {
    throw new Error('The visual editor block catalog is out of sync with the Pages schema');
  }
  const staticFiles = new Map([
    ['/', { file: 'page-editor.html', type: 'text/html; charset=utf-8' }],
    ['/editor.js', { file: 'page-editor-client.js', type: 'text/javascript; charset=utf-8' }],
    ['/editor.css', { file: 'page-editor.css', type: 'text/css; charset=utf-8' }]
  ]);
  // Serialize writes so two browser tabs cannot commit the same revision.
  let pendingWrite = Promise.resolve();
  let serverPort = null;
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== '127.0.0.1:' + serverPort) return respond(res, 403, { error: 'Localhost only' });
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      res.setHeader('X-Frame-Options', 'DENY');
      const url = new URL(req.url, 'http://127.0.0.1:' + serverPort);
      if (req.method === 'GET' && staticFiles.has(url.pathname)) {
        const item = staticFiles.get(url.pathname);
        res.writeHead(200, { 'Content-Type': item.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        const bytes = await readFile(resolve(editorRoot, item.file));
        // The optional editor extension shares the same module scope as the original
        // editor to reuse its loaded page and revision state without a second copy.
        if (url.pathname === '/editor.js') {
          const extension = await readFile(resolve(editorRoot, 'page-editor-extension.js'));
          return res.end(Buffer.concat([bytes, Buffer.from('\n'), extension]));
        }
        return res.end(bytes);
      }
      if (req.method === 'GET' && url.pathname === '/api/block-catalog') {
        return respond(res, 200, catalog);
      }
      if (req.method === 'GET' && url.pathname === '/api/locales') {
        return respond(res, 200, { locales, defaultLocale });
      }
      if (req.method === 'POST' && url.pathname === '/api/pages') {
        if (req.headers.origin !== 'http://127.0.0.1:' + serverPort) return respond(res, 403, { error: 'Invalid editor origin' });
        const body = await requestBody(req);
        const result = await (pendingWrite = pendingWrite.catch(() => {}).then(async () => {
          if (!isObject(body) || Object.keys(body).some(key => !['title', 'slug', 'lang'].includes(key))) throw new Error('Invalid new page parameters');
          return createPage(root, { title: body.title, slug: body.slug, lang: body.lang, locales, defaultLocale });
        }));
        return respond(res, 201, { path: result.path, revision: revision(result.source), page: result.page });
      }
      if (req.method === 'GET' && url.pathname === '/api/pages') {
        const paths = await listPages(contentRoot);
        return respond(res, 200, { pages: paths });
      }
      if (req.method === 'GET' && url.pathname === '/api/page') {
        const file = await safePageFile(contentRoot, url.searchParams.get('path'));
        const source = await readFile(file, 'utf8');
        if (Buffer.byteLength(source) > maxDocumentBytes) throw new Error('Page exceeds 2 MB');
        return respond(res, 200, { page: JSON.parse(source), revision: revision(source) });
      }
      if (req.method === 'PUT' && url.pathname === '/api/page') {
        if (req.headers.origin !== 'http://127.0.0.1:' + serverPort) return respond(res, 403, { error: 'Invalid editor origin' });
        const body = await requestBody(req);
        const result = await (pendingWrite = pendingWrite.catch(() => {}).then(async () => {
          const file = await safePageFile(contentRoot, url.searchParams.get('path'));
          const originalSource = await readFile(file, 'utf8');
          if (!isObject(body) || typeof body.revision !== 'string' || body.revision !== revision(originalSource)) {
            return { status: 409, data: { error: 'This page has changed on disk. Reload before saving.' } };
          }
          const original = JSON.parse(originalSource);
          validatePage(body.page, original, typeNames);
          const nextSource = JSON.stringify(body.page, null, 2) + '\n';
          if (Buffer.byteLength(nextSource) > maxDocumentBytes) throw new Error('Page exceeds 2 MB');
          const temp = resolve(dirname(file), '.' + basename(file) + '.' + randomBytes(8).toString('hex') + '.tmp');
          let created = false;
          try {
            const fd = await open(temp, 'wx', 0o600);
            created = true;
            try { await fd.writeFile(nextSource, 'utf8'); await fd.sync(); }
            finally { await fd.close(); }
            await rename(temp, file);
          } finally { if (created) await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
          return { status: 200, data: { revision: revision(nextSource) } };
        }));
        return respond(res, result.status, result.data);
      }
      return respond(res, 404, { error: 'Not found' });
    } catch (error) {
      const badInput = error instanceof SyntaxError || /Invalid|must|exceeds|needs|required|Unsafe|does not exist|cannot be changed|too deep|Expected|Unsupported|slug|title|locale/.test(error.message);
      const conflict = /already exists/.test(error.message);
      return respond(res, conflict ? 409 : badInput ? 400 : 500, { error: conflict || badInput ? error.message : 'Editor request failed' });
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  serverPort = server.address().port;
  return { server, url: 'http://127.0.0.1:' + serverPort + '/', close: () => new Promise((ok, fail) => server.close(error => error ? fail(error) : ok())) };
}
