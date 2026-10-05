import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import * as posix from 'node:path/posix';
import {fileURLToPath} from 'node:url';
import { mapLimit } from './concurrency.js';
import {extendConsentPolicy,serializeConsentHeaders} from './consent-csp.js';
import {imageViewerAssets} from './media-assets.js';

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function isCodeAsset(path) {
  const extension = extname(path).toLowerCase();
  return extension === '.css' || extension === '.js';
}

function referencedPaths(path, content, known) {
  if (!isCodeAsset(path)) return [];
  const text = content.toString('utf8');
  const expression = extname(path).toLowerCase() === '.js'
    ? /\b(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g
    : /(?:@import\s+(?:url\()?\s*|url\(\s*)['"]?([^'")\s;]+)['"]?\s*\)?/gi;
  const refs = [];
  for (const match of text.matchAll(expression)) {
    const specifier = match[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(specifier)) continue;
    const clean = specifier.split(/[?#]/, 1)[0];
    const target = clean.startsWith('/')
      ? clean.slice(1)
      : posix.normalize(posix.join(posix.dirname(path), clean));
    if (known.has(target) && isCodeAsset(target)) refs.push(target);
  }
  return [...new Set(refs)];
}

function rewriteCodeReferences(item, text, outputByOriginal) {
  const extension = extname(item.path).toLowerCase();
  const rewriteSpecifier = (specifier) => {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(specifier)) return null;
    const splitAt = specifier.search(/[?#]/);
    const clean = splitAt < 0 ? specifier : specifier.slice(0, splitAt);
    const tail = splitAt < 0 ? '' : specifier.slice(splitAt);
    const target = clean.startsWith('/')
      ? clean.slice(1)
      : posix.normalize(posix.join(posix.dirname(item.path), clean));
    const outputTarget = outputByOriginal.get(target);
    if (!outputTarget) return null;
    let rewritten;
    if (clean.startsWith('/')) rewritten = '/' + outputTarget;
    else {
      rewritten = posix.relative(posix.dirname(item.outputPath), outputTarget);
      if (!rewritten.startsWith('.')) rewritten = './' + rewritten;
    }
    return rewritten + tail;
  };

  if (extension === '.js') {
    const expression = /(\b(?:from\s*|import\s*(?:\(\s*)?))(['"])([^'"]+)\2/g;
    return text.replace(expression, (match, prefix, quote, specifier) => {
      const rewritten = rewriteSpecifier(specifier);
      return rewritten === null ? match : prefix + quote + rewritten + quote;
    });
  }

  const expression = /((?:@import\s+(?:url\()?\s*|url\(\s*))(['"]?)([^)'"\s;]+)(['"]?\s*\)?)/gi;
  return text.replace(expression, (match, prefix, quote, specifier, suffix) => {
    const rewritten = rewriteSpecifier(specifier);
    return rewritten === null ? match : prefix + quote + rewritten + suffix;
  });
}

export async function collectAssets(config) {
  const sources = [];
  const directories = [
    { root: config.resolvedPaths.static, name: 'static' },
    { root: resolve(config.resolvedPaths.content, 'assets'), name: 'content/assets' },
    { root: resolve(config.resolvedPaths.theme, 'assets'), name: 'theme assets' }
  ];
  for (const { root, name } of directories) {
    for (const source of await walk(root)) {
      const path = relative(root, source).split(sep).join('/');
      if (path.split('/').includes('.gitkeep')) continue;
      sources.push({ source, path, sourceName: name });
    }
  }
  // Library consumers do not need to copy framework runtime source into their
  // repositories. Project-owned overrides keep precedence for existing sites.
  const runtimeRoot=fileURLToPath(new URL('../static/edgepress/',import.meta.url));
  const supplied=new Set(sources.map(item=>item.path));
  for(const item of await imageViewerAssets())if(!supplied.has(item.path))sources.push(item);
  for(const source of await walk(runtimeRoot)) {
    const path='edgepress/'+relative(runtimeRoot,source).split(sep).join('/');
    if(!supplied.has(path))sources.push({source,path,sourceName:'EdgePress runtime'});
  }
  // Built-in navigation and page icons live with the package's content assets,
  // not its browser scripts. Include only this library, not example-site media.
  const iconsRoot=fileURLToPath(new URL('../content/assets/edgepress/icons/',import.meta.url));
  for(const source of await walk(iconsRoot)) {
    const path='edgepress/icons/'+relative(iconsRoot,source).split(sep).join('/');
    if(!supplied.has(path))sources.push({source,path,sourceName:'EdgePress icons'});
  }

  const headers = [];
  const assetSources = [];
  for (const item of sources) {
    if (item.path.toLowerCase() === '_headers') headers.push(item);
    else assetSources.push(item);
  }
  const [headerContents, items] = await Promise.all([
    mapLimit(headers, config.concurrency, async (item) => (await readFile(item.source)).toString('utf8')),
    mapLimit(assetSources, config.concurrency, async (item) => ({
      ...item,
      content: isCodeAsset(item.path) ? item.content??await readFile(item.source) : null
    }))
  ]);
  const originals = new Map();
  for (const item of items) {
    const normalized = item.path.toLowerCase();
    const previousSource = originals.get(normalized);
    if (previousSource) {
      throw new Error(previousSource + ' and ' + item.sourceName + ' assets have the same output path: ' + item.path);
    }
    originals.set(normalized, item.sourceName);
  }
  const byOriginal = new Map(items.map((item) => [item.path, item]));
  const dependencies = new Map();
  for (const item of items) dependencies.set(item.path, referencedPaths(item.path, item.content, byOriginal));

  const outputByOriginal = new Map();
  for (const item of items) {
    if (!isCodeAsset(item.path)) outputByOriginal.set(item.path, item.path);
    else {
      const reachable = new Set();
      const visit = (path) => {
        for (const dependency of dependencies.get(path) ?? []) {
          if (reachable.has(dependency)) continue;
          reachable.add(dependency);
          visit(dependency);
        }
      };
      visit(item.path);
      const sourceDigests = [...reachable].sort().map((path) =>
        path + ':' + createHash('sha256').update(byOriginal.get(path).content).digest('hex')
      ).join('\n');
      const digest = createHash('sha256')
        .update(item.content)
        .update('\n')
        .update(sourceDigests)
        .digest('hex')
        .slice(0, 16);
      const extension = extname(item.path).toLowerCase();
      outputByOriginal.set(item.path, item.path.slice(0, -extname(item.path).length) + '.' + digest + extension);
    }
  }

  const assets = items.map((item) => {
    const outputPath = outputByOriginal.get(item.path);
    if (!isCodeAsset(item.path)) return { path: outputPath, source: item.source };
    const content = Buffer.from(rewriteCodeReferences(
      { ...item, outputPath }, item.content.toString('utf8'), outputByOriginal
    ), 'utf8');
    return { path: outputPath, content };
  });
  const urlMap = Object.create(null);
  for (const item of items) urlMap['/' + item.path] = '/' + outputByOriginal.get(item.path);
  config.assetManifest = urlMap;
  return { assets, urlMap, existingHeaders: extendConsentPolicy(headerContents.join('\n\n'),config) };
}

export async function writeAssets(bundle, output, concurrency = 8) {
  await mapLimit(bundle.assets, concurrency, async (asset) => {
    const target = resolve(output, ...asset.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    if (asset.source) await copyFile(asset.source, target);
    else await writeFile(target, asset.content);
  });
  // Cloudflare already revalidates unversioned assets by default. A broad cache
  // rule would be concatenated with exact immutable rules instead of overridden.
  const securityRules = '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin';
  const immutableRules = bundle.assets
    .filter((asset) => /\.[a-f0-9]{16}\.(?:css|js|json|png|jpe?g|webp|avif|svg|gif|woff2?)$/i.test(asset.path))
    .map((asset) => '/' + asset.path + '\n  Cache-Control: public, max-age=31536000, immutable');
  const headers = [bundle.existingHeaders.trim(), securityRules, ...immutableRules].filter(Boolean).join('\n\n') + '\n';
  await writeFile(resolve(output, '_headers'), serializeConsentHeaders(headers), 'utf8');
}

export function rewriteAssetLinks(html, urlMap) {
  return html.replace(/(\b(?:src|href)\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, value) => {
    const suffixAt = value.search(/[?#]/);
    const sourcePath = suffixAt < 0 ? value : value.slice(0, suffixAt);
    const suffix = suffixAt < 0 ? '' : value.slice(suffixAt);
    const replacement = urlMap[sourcePath];
    return replacement ? prefix + quote + replacement + suffix + quote : match;
  });
}
