import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { hostname } from 'node:os';
import { mapLimit } from './concurrency.js';
import { loadConfig } from './config.js';
import { readDocuments, sortPostsNewest } from './content.js';
import { plainText } from './markdown.js';
import { createExtensions } from './plugin-api.js';
import { collectAssets, rewriteAssetLinks, writeAssets } from './assets.js';
import { loadLanguagePacks } from './i18n.js';
import { generateBuiltinRoutes } from './generators.js';

const RENDER_CACHE_VERSION = 3;
const MARKDOWN_SECURITY_POLICY_VERSION = 4;

async function readCache(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed.version === RENDER_CACHE_VERSION && parsed.rendered && typeof parsed.rendered === 'object'
      ? parsed.rendered
      : {};
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function markdownRuntimeVersion(root) {
  const lockPath = resolve(root, 'package-lock.json');
  const rendererSource = await readFile(new URL('./markdown.js', import.meta.url));
  const implementation = createHash('sha256').update(rendererSource).digest('hex');
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    const marked = lock.packages?.['node_modules/marked']?.version;
    const sanitizer = lock.packages?.['node_modules/sanitize-html']?.version;
    if (typeof marked === 'string' && typeof sanitizer === 'string') return implementation + ':' + marked + ':' + sanitizer;
    throw new Error('package-lock.json is missing the Markdown renderer or sanitizer version');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return implementation + ':unlocked';
  }
}

function routeSegments(routePath) {
  if (typeof routePath !== 'string' || !routePath.trim()) throw new Error('Generated routes need a non-empty path');
  const source = routePath.trim().replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(source) || /[?#\0]/.test(source)) {
    throw new Error('Invalid generated route path: ' + routePath);
  }
  const isDirectory = source.endsWith('/');
  const clean = source.replace(/^\/+|\/+$/g, '');
  if (!clean) return ['index.html'];
  const parts = clean.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.includes('%') || part.includes(':') || /[\x00-\x1f\x7f]/.test(part)) {
      throw new Error('Invalid generated route path: ' + routePath);
    }
    let decoded;
    try { decoded = decodeURIComponent(part); }
    catch { throw new Error('Invalid generated route path encoding: ' + routePath); }
    if (decoded === '.' || decoded === '..' || /[\\/\x00-\x1f\x7f]/.test(decoded)) {
      throw new Error('Invalid generated route path: ' + routePath);
    }
  }
  return isDirectory ? [...parts, 'index.html'] : parts;
}

function routeFile(output, routePath) {
  const parts = routeSegments(routePath);
  const result = resolve(output, ...parts);
  if (!result.startsWith(output + sep)) throw new Error('Generated route escapes output directory: ' + routePath);
  return result;
}

function publishedByLocalDate(document, now) {
  if (document.kind !== 'posts') return true;
  const publishDay = Date.UTC(document.date.getUTCFullYear(), document.date.getUTCMonth(), document.date.getUTCDate());
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return publishDay <= currentDay;
}

function validateRoutes(routes, output, assetBundle) {
  if (!Array.isArray(routes)) throw new Error('routes:created filters must return an array');
  const seen = new Set(['_headers']);
  for (const asset of assetBundle.assets) seen.add(asset.path.toLowerCase());
  for (const route of routes) {
    if (!route || typeof route.body !== 'string' || typeof route.path !== 'string') {
      throw new Error('Each route must contain string path and body properties');
    }
    if (route.contentType !== undefined && typeof route.contentType !== 'string') {
      throw new Error('Route contentType must be a string when provided: ' + route.path);
    }
    const file = routeFile(output, route.path);
    const relativePath = relative(output, file).split(sep).join('/').toLowerCase();
    if (seen.has(relativePath)) throw new Error('Duplicate generated route: ' + route.path);
    seen.add(relativePath);
  }
}

async function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

export async function acquireBuildLock(directory) {
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, 'build.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }));
      } catch (error) {
        await handle.close();
        await rm(lockPath, { force: true });
        throw error;
      }
      return async () => {
        await handle.close();
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous;
      try { previous = JSON.parse(await readFile(lockPath, 'utf8')); }
      catch {
        let info;
        try { info = await stat(lockPath); }
        catch (statError) {
          if (statError.code === 'ENOENT') continue;
          throw statError;
        }
        if (Date.now() - info.mtimeMs < 10_000) throw new Error('Another build is already starting for this project');
        throw new Error('Another build may be running; inspect and remove ' + lockPath + ' if it is stale');
      }
      if (previous.host !== hostname() || !Number.isInteger(previous.pid) || await processIsAlive(previous.pid)) {
        throw new Error('Another build is already running for this project');
      }
      await rm(lockPath, { force: true });
    }
  }
  throw new Error('Unable to acquire the project build lock');
}

async function commitOutput(stage, output) {
  const backup = output + '.backup-' + randomUUID();
  let movedPrevious = false;
  try {
    try {
      const info = await lstat(output);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('Build output must be a real directory: ' + output);
      }
      await rename(output, backup);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(stage, output);
  } catch (error) {
    if (movedPrevious) {
      try { await rename(backup, output); }
      catch (restoreError) {
        throw new Error('Build commit failed and the previous output could not be restored from ' + backup + ': ' + restoreError.message, { cause: error });
      }
    }
    throw error;
  }
  if (movedPrevious) {
    try { await rm(backup, { recursive: true, force: true }); }
    catch (error) { console.warn('Built the new site, but could not remove the previous output at ' + backup + ': ' + error.message); }
  }
}

async function writeRoutes(routes, stage, assetBundle, extensions, site, config) {
  await mapLimit(routes, config.concurrency, async (route) => {
    const file = routeFile(stage, route.path);
    await mkdir(dirname(file), { recursive: true });
    let body = await extensions.filter('route:body', route.body, { route, site, config });
    if (typeof body !== 'string') throw new Error('route:body filters must return a string for ' + route.path);
    body = rewriteAssetLinks(body, assetBundle.urlMap);
    await writeFile(file, body, 'utf8');
  });
}

export async function buildSite(root = process.cwd(), options = {}) {
  const started = Date.now();
  const config = await loadConfig(root);
  if (options.preview === true) {
    config.preview = true;
    config.previewBuildId = randomUUID();
  }
  const releaseLock = await acquireBuildLock(config.resolvedPaths.cache);
  const output = config.resolvedPaths.output;
  const stage = resolve(dirname(output), '.' + output.split(/[\\/]/).pop() + '.stage-' + randomUUID());

  try {
    await loadLanguagePacks(config);
    const extensions = await createExtensions(config);
    const assetBundle = await collectAssets(config);
    const sourceDocuments = await readDocuments(config);
    const loadedDocuments = await extensions.filter('content:loaded', sourceDocuments, { config });
    if (!Array.isArray(loadedDocuments)) throw new Error('content:loaded filters must return an array');

    const cacheFile = resolve(config.resolvedPaths.cache, 'render-cache.json');
    const oldCache = await readCache(cacheFile);
    const nextCache = Object.create(null);
    const runtimeVersion = await markdownRuntimeVersion(config.root);
    const renderer = extensions.renderer('.md');
    if (!renderer) throw new Error('No renderer is registered for Markdown files');

    const documents = await mapLimit(loadedDocuments, config.concurrency, async (document) => {
      if (document.kind === 'pages') {
        return { ...document, html: '' };
      }
      const signature = createHash('sha256')
        .update(document.markdown + '\n' + JSON.stringify(config.markdown) + '\n' + document.locale + '\n' +
          MARKDOWN_SECURITY_POLICY_VERSION + '\n' + runtimeVersion)
        .digest('hex');
      let html = renderer.cacheable ? oldCache[signature] : undefined;
      if (html === undefined) html = await renderer.render(document.markdown, { config, document });
      if (typeof html !== 'string') throw new Error('Markdown renderers must return HTML strings for ' + document.file);
      if (renderer.cacheable) nextCache[signature] = html;
      const rendered = { ...document, html };
      rendered.description = rendered.description || plainText(rendered.markdown).slice(0, 180);
      return rendered;
    });

    const now = new Date();
    const visible = documents.filter((document) => !document.draft && publishedByLocalDate(document, now));
    let site = {
      config,
      posts: sortPostsNewest(visible.filter((document) => document.kind === 'posts')),
      pages: visible.filter((document) => document.kind === 'pages')
    };
    site = await extensions.filter('content:rendered', site, { config });
    if (!site || !Array.isArray(site.posts) || !Array.isArray(site.pages)) {
      throw new Error('content:rendered filters must return a site object with posts and pages arrays');
    }

    let routes = await generateBuiltinRoutes(site, config, extensions);
    for (const generator of extensions.generators.values()) {
      const generated = await generator({
        site,
        config,
        renderLayout: (page, body) => import('./theme.js').then((module) => module.renderLayout(config, extensions, page, body))
      });
      if (generated == null) continue;
      routes.push(...(Array.isArray(generated) ? generated : [generated]));
    }
    routes = await extensions.filter('routes:created', routes, { site, config });
    validateRoutes(routes, output, assetBundle);

    await mkdir(dirname(output), { recursive: true });
    await mkdir(stage, { recursive: false });
    await writeAssets(assetBundle, stage, config.concurrency);
    await writeRoutes(routes, stage, assetBundle, extensions, site, config);
    await commitOutput(stage, output);

    const cacheTemporary = cacheFile + '.tmp-' + randomUUID();
    try {
      await writeFile(cacheTemporary, JSON.stringify({ version: RENDER_CACHE_VERSION, rendered: nextCache }), 'utf8');
      await rename(cacheTemporary, cacheFile);
    } catch (error) {
      await rm(cacheTemporary, { force: true }).catch(() => {});
      console.warn('Built the new site, but could not update the render cache: ' + error.message);
    }

    console.log('Built ' + routes.length + ' routes from ' + documents.length + ' documents in ' + (Date.now() - started) + 'ms');
    return { routes: routes.length, documents: documents.length, output };
  } catch (error) {
    await rm(stage, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await releaseLock();
  }
}
