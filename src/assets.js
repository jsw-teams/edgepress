import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import * as posix from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { mapLimit } from './concurrency.js';
import { extendConsentPolicy, serializeConsentHeaders } from './consent-csp.js';
import { imageViewerAssets, mediaViewerAssets } from './media-assets.js';
import { builtinDocumentViewerAssets } from './lib/viewers.js';
import { collectImageDimensions } from './image-dimensions.js';
import { collectVideoMetadata } from './video-metadata.js';
import { dataSaverLayout } from './data-saver.js';
import { minifyCss } from './lib/css-tools.js';
import { minifyJs, bundleLocalEsm } from './lib/js-tools.js';

async function loadDocumentViewerAssets(prefix) {
  try {
    const pkg = await import('@jsw-teams/document-viewer/assets');
    if (typeof pkg.documentViewerAssets === 'function') return await pkg.documentViewerAssets(prefix);
  } catch {}
  return builtinDocumentViewerAssets(prefix);
}

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
  return extension === '.css' || extension === '.js' || extension === '.mjs';
}

function referencedPaths(path, content, known) {
  if (!isCodeAsset(path)) return [];
  const text = content.toString('utf8');
  const expression = ['.js', '.mjs'].includes(extname(path).toLowerCase())
    ? /\b(?:from\s*|import\s*(?:\(\s*)?|new\s+URL\s*\(\s*)['"]([^'"]+)['"]/g
    : /(?:@import\s*(?:url\()?\s*|url\(\s*)['"]?([^'")\s;]+)['"]?\s*\)?/gi;
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

  if (extension === '.js' || extension === '.mjs') {
    const expression = /(\b(?:from\s*|import\s*(?:\(\s*)?|new\s+URL\s*\(\s*))(['"])([^'"]+)\2/g;
    return text.replace(expression, (match, prefix, quote, specifier) => {
      const rewritten = rewriteSpecifier(specifier);
      return rewritten === null ? match : prefix + quote + rewritten + quote;
    });
  }

  const expression = /((?:@import\s*(?:url\()?\s*|url\(\s*))(['"]?)([^)'"\s;]+)(['"]?\s*\)?)/gi;
  return text.replace(expression, (match, prefix, quote, specifier, suffix) => {
    const rewritten = rewriteSpecifier(specifier);
    return rewritten === null ? match : prefix + quote + rewritten + suffix;
  });
}

function parseUnicodeRange(rangeSpec) {
  const ranges = [];
  for (const part of rangeSpec.split(',')) {
    const trimmed = part.trim().toUpperCase();
    if (!trimmed.startsWith('U+')) continue;
    const body = trimmed.slice(2);
    if (body.includes('-')) {
      const [lo, hi] = body.split('-');
      const start = parseInt(lo, 16);
      const end = parseInt(hi, 16);
      if (Number.isFinite(start) && Number.isFinite(end)) ranges.push([start, end]);
    } else if (body.includes('?')) {
      const start = parseInt(body.replace(/\?/g, '0'), 16);
      const end = parseInt(body.replace(/\?/g, 'F'), 16);
      if (Number.isFinite(start) && Number.isFinite(end)) ranges.push([start, end]);
    } else {
      const point = parseInt(body, 16);
      if (Number.isFinite(point)) ranges.push([point, point]);
    }
  }
  return ranges;
}

function matchesAnyCodePoint(ranges, codePoints) {
  if (!ranges.length) return true;
  for (const [lo, hi] of ranges) {
    if (hi - lo <= 64) {
      for (let cp = lo; cp <= hi; cp += 1) if (codePoints.has(cp)) return true;
    } else {
      for (const cp of codePoints) if (cp >= lo && cp <= hi) return true;
    }
  }
  return false;
}

// Prune unused WOFF2 font subsets from a build bundle based on the characters and locales
// actually used on the site. Cuts deployment file count and upload size by 60–95%.
export function pruneUnusedFonts(bundle, routes, config) {
  const facesOut = bundle.urlMap['/edgepress/fonts/faces.css'];
  const fontsOut = bundle.urlMap['/edgepress/fonts.css'];
  if (!facesOut || !fontsOut) return bundle;
  const facesAsset = bundle.assets.find(asset => '/' + asset.path === facesOut);
  const fontsAsset = bundle.assets.find(asset => '/' + asset.path === fontsOut);
  if (!facesAsset?.content || !fontsAsset?.content) return bundle;

  const codePoints = new Set();
  for (let cp = 0x20; cp <= 0x7e; cp += 1) codePoints.add(cp);
  for (const route of routes) {
    if (typeof route.body !== 'string') continue;
    for (const ch of route.body) codePoints.add(ch.codePointAt(0));
  }
  const locales = (config.i18n?.locales || []).map(l => l.toLowerCase());
  const needsTrad = locales.some(l => /^zh-(?:tw|hk|mo|hant)/.test(l));
  const needsSimp = locales.some(l => /^zh-(?:cn|sg|hans)/.test(l)) || (!needsTrad && [...codePoints].some(cp => cp >= 0x4e00 && cp <= 0x9fff));

  const facesCss = facesAsset.content.toString('utf8');
  const keptBlocks = [];
  const keptWoff2 = new Set();

  const faceRe = /@font-face\s*\{[^}]*\}/gi;
  let match;
  let foundAny = false;
  while ((match = faceRe.exec(facesCss)) !== null) {
    foundAny = true;
    const block = match[0];
    const family = block.match(/font-family\s*:\s*['"]?([^'";}]+)/i)?.[1]?.trim() || '';
    if (family === 'Noto Sans TC Variable' && !needsTrad) continue;
    if (family === 'Noto Sans SC Variable' && !needsSimp) continue;
    const rangeStr = block.match(/unicode-range\s*:\s*([^;}]+)/i)?.[1] || '';
    const ranges = parseUnicodeRange(rangeStr);
    if (!matchesAnyCodePoint(ranges, codePoints)) continue;
    keptBlocks.push(block);
    for (const urlMatch of block.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi)) {
      const target = urlMatch[1].replace(/^\//, '');
      keptWoff2.add(target);
    }
  }
  if (!foundAny) return bundle;

  const newFacesContent = Buffer.from(keptBlocks.join(''), 'utf8');
  const newFacesDigest = createHash('sha256').update(newFacesContent).digest('hex').slice(0, 16);
  const newFacesPath = 'edgepress/fonts/faces.' + newFacesDigest + '.css';

  const oldFacesRel = facesOut.slice(1);
  const fontsCss = fontsAsset.content.toString('utf8').replaceAll(oldFacesRel, newFacesPath).replaceAll(posix.basename(oldFacesRel), posix.basename(newFacesPath));
  const newFontsContent = Buffer.from(fontsCss, 'utf8');
  const newFontsDigest = createHash('sha256').update(newFontsContent).update('\n').update(newFacesDigest).digest('hex').slice(0, 16);
  const newFontsPath = 'edgepress/fonts.' + newFontsDigest + '.css';

  bundle.assets = bundle.assets.filter(asset => {
    if (asset.path.startsWith('edgepress/fonts/') && asset.path.endsWith('.woff2')) {
      return keptWoff2.has(asset.path);
    }
    return true;
  });
  facesAsset.path = newFacesPath;
  facesAsset.content = newFacesContent;
  fontsAsset.path = newFontsPath;
  fontsAsset.content = newFontsContent;
  bundle.urlMap['/edgepress/fonts/faces.css'] = '/' + newFacesPath;
  bundle.urlMap['/edgepress/fonts.css'] = '/' + newFontsPath;
  config.assetManifest = bundle.urlMap;
  return bundle;
}

export async function collectAssets(config, { documentViewer = false, mediaViewer = false, imageViewer = true } = {}) {
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
  const runtimeRoot = fileURLToPath(new URL('../static/edgepress/', import.meta.url));
  const supplied = new Set(sources.map(item => item.path));
  if (documentViewer) {
    for (const item of await loadDocumentViewerAssets('edgepress/document-viewer')) {
      if (!supplied.has(item.path)) sources.push(item);
    }
  }
  if (imageViewer) {
    for (const item of await imageViewerAssets()) {
      if (!supplied.has(item.path)) sources.push(item);
    }
  }
  if (mediaViewer) {
    for (const item of await mediaViewerAssets()) {
      if (!supplied.has(item.path)) sources.push(item);
    }
  }
  for (const source of await walk(runtimeRoot)) {
    const path = 'edgepress/' + relative(runtimeRoot, source).split(sep).join('/');
    if (!supplied.has(path)) sources.push({ source, path, sourceName: 'EdgePress runtime' });
  }
  // Built-in navigation and page icons live with the package's content assets,
  // not its browser scripts. Include only this library, not example-site media.
  const iconsRoot = fileURLToPath(new URL('../content/assets/edgepress/icons/', import.meta.url));
  for (const source of await walk(iconsRoot)) {
    const path = 'edgepress/icons/' + relative(iconsRoot, source).split(sep).join('/');
    if (!supplied.has(path)) sources.push({ source, path, sourceName: 'EdgePress icons' });
  }

  const headers = [];
  const assetSources = [];
  for (const item of sources) {
    if (item.path.toLowerCase() === '_headers') headers.push(item);
    else assetSources.push(item);
  }
  const [headerContents, items] = await Promise.all([
    mapLimit(headers, config.concurrency, async (item) => (await readFile(item.source)).toString('utf8')),
    mapLimit(assetSources, config.concurrency, async (item) => {
      if (!isCodeAsset(item.path)) return { ...item, content: null };
      const source = item.content ?? await readFile(item.source);
      const rawText = source.toString('utf8');
      const code = item.path.endsWith('.css') ? minifyCss(rawText) : minifyJs(rawText);
      return { ...item, content: Buffer.from(code, 'utf8') };
    })
  ]);
  const coreEntries = ['edgepress/plugins/consent/manager.js', 'edgepress/external-links.js'];
  const sourceByPath = new Map(items.map(item => [item.path, item]));
  const bundleControl = (entry) => {
    const item = sourceByPath.get(entry);
    if (!item) return;
    item.content = Buffer.from(bundleLocalEsm(entry, sourceByPath), 'utf8');
  };
  for (const entry of coreEntries) bundleControl(entry);
  if (config.site.dataSaver?.enabled) {
    const candidates = [...coreEntries, 'edgepress/language-select.js', 'edgepress/local-time.js', 'edgepress/navigation-select.js', 'edgepress/services-consent.js'];
    const scripts = candidates.filter(path => {
      const source = sourceByPath.get(path)?.source;
      return source && relative(runtimeRoot, source).split(sep).join('/') === path.slice('edgepress/'.length);
    });
    if (scripts.length) {
      const entry = 'edgepress/data-saver-controls.js';
      const item = { path: entry, content: Buffer.from(scripts.map(path => 'import "/' + path + '";').join('\n')), sourceName: 'Data-saving core controls' };
      sourceByPath.set(entry, item);
      items.push(item);
      bundleControl(entry);
      config.dataSaverCore = { path: '/' + entry, scripts: scripts.map(path => '/' + path) };
    }
  }
  const layout = await dataSaverLayout(config, items);
  if (layout) items.push(layout);
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
  return {
    assets,
    urlMap,
    imageDimensions: await collectImageDimensions(assets),
    videoMetadata: await collectVideoMetadata(assets),
    existingHeaders: extendConsentPolicy(headerContents.join('\n\n'), config)
  };
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
  // Unicode fonts contain hundreds of subsets. Static hosts accept 100 header
  // rules, so group a directory only when every WOFF2 file in it is hashed.
  const fontsByDirectory = new Map();
  for (const asset of bundle.assets.filter(asset => asset.path.endsWith('.woff2'))) {
    const directory = posix.dirname(asset.path);
    if (!fontsByDirectory.has(directory)) fontsByDirectory.set(directory, []);
    fontsByDirectory.get(directory).push(asset.path);
  }
  const fontDirectories = new Set([...fontsByDirectory].filter(([, paths]) =>
    paths.length > 1 && paths.every(path => /\.[a-f0-9]{16}\.woff2$/.test(path))
  ).map(([directory]) => directory));
  const immutableRules = bundle.assets
    .filter((asset) => /\.[a-f0-9]{16}\.(?:css|m?js|json|png|jpe?g|webp|avif|svg|gif|mp4|webm|woff2?)$/i.test(asset.path))
    .filter(asset => !asset.path.endsWith('.woff2') || !fontDirectories.has(posix.dirname(asset.path)))
    .map((asset) => '/' + asset.path + '\n  Cache-Control: public, max-age=31536000, immutable');
  for (const directory of fontDirectories) immutableRules.push('/' + (directory === '.' ? '' : directory + '/') + '*.woff2\n  Cache-Control: public, max-age=31536000, immutable');
  const documentDirectories = new Set(bundle.assets.map(asset => asset.path.match(/^(.*\/pdf-assets\.[a-f0-9]{16})\//)?.[1]).filter(Boolean));
  for (const directory of documentDirectories) immutableRules.push('/' + directory + '/*\n  Cache-Control: public, max-age=31536000, immutable');
  const mediaRules = await Promise.all(bundle.assets.filter(asset => /\.(mp4|webm)$/i.test(asset.path)).map(async asset => {
    const { size } = await stat(resolve(output, ...asset.path.split('/')));
    return '/' + asset.path + '\n  Content-Length: ' + size + '\n  Accept-Ranges: bytes';
  }));
  if (immutableRules.length + mediaRules.length > 85) {
    const immutablePath = /\.[a-f0-9]{16}\.(?:css|m?js|json|png|jpe?g|webp|avif|svg|gif|mp4|webm|woff2?)$/i;
    const patterns = new Map();
    for (const asset of bundle.assets.filter(asset => immutablePath.test(asset.path))) {
      const directory = posix.dirname(asset.path);
      const prefix = directory === '.' ? '' : directory + '/';
      const suffix = posix.extname(asset.path);
      const matching = bundle.assets.filter(candidate => candidate.path.startsWith(prefix) && candidate.path.endsWith(suffix));
      if (matching.length > 1 && matching.every(candidate => immutablePath.test(candidate.path))) {
        patterns.set('/' + prefix + '*' + suffix, matching.map(candidate => '/' + candidate.path));
      }
    }
    for (const [pattern, paths] of [...patterns].sort((first, second) => second[1].length - first[1].length)) {
      const exact = immutableRules.filter(rule => paths.includes(rule.split('\n')[0]));
      if (exact.length < 2) continue;
      for (const rule of exact) immutableRules.splice(immutableRules.indexOf(rule), 1);
      immutableRules.push(pattern + '\n  Cache-Control: public, max-age=31536000, immutable');
    }
  }
  const headers = [bundle.existingHeaders.trim(), securityRules, ...immutableRules, ...mediaRules].filter(Boolean).join('\n\n') + '\n';
  const count = headers.split(/\r?\n/).filter(line => line && !/^\s|^#/.test(line)).length;
  if (count > 100) throw new Error('Static header rules exceed 100 after safe cache grouping; reduce custom rules or per-file media headers.');
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
