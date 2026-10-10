import { parseDocument } from 'htmlparser2';
import { localizedUrl, translate } from './i18n.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as posix from 'node:path/posix';
import postcss from 'postcss';
import { transform, transformSync } from 'esbuild';

const essentialStyles = /\/edgepress\/(?:external-links|data-saver|data-saver-layout)\.[a-f0-9]{16}\.css$/;
const optionalScripts = /\/edgepress\/(?:image-viewer|media-viewer|document-viewer|project-demo|webmcp|oembed|code-copy|post-toc)\.[a-f0-9]{16}\.js$/;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export async function configureDataSaver(config) {
  if (!config.site.dataSaver?.enabled) return;
  const theme = JSON.parse(await readFile(resolve(config.resolvedPaths.theme, 'theme.json'), 'utf8'));
  const variant = theme.dataSaver;
  if (!variant || typeof variant !== 'object' || Array.isArray(variant) || typeof variant.stylesheet !== 'string' || !Array.isArray(variant.scripts) || variant.layoutStyles !== undefined && !Array.isArray(variant.layoutStyles) || Object.keys(variant).some(key => !['stylesheet', 'scripts', 'layoutStyles'].includes(key))) throw new Error('This theme must opt in with theme.json dataSaver: { stylesheet, scripts, layoutStyles? }');
  for (const [file, extension] of [[variant.stylesheet, 'css'], ...variant.scripts.map(file => [file, 'js'])]) {
    if (typeof file !== 'string' || !new RegExp('^[a-zA-Z0-9][a-zA-Z0-9_./-]*\\.' + extension + '$').test(file) || file.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Invalid data-saving theme asset');
    await readFile(resolve(config.resolvedPaths.theme, 'assets', file));
  }
  for (const file of variant.layoutStyles || []) {
    if (typeof file !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*\.css$/.test(file) || file.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Invalid data-saving layout stylesheet');
  }
  config.dataSaverTheme = variant;
}

export async function dataSaverLayout(config, items) {
  if (!config.site.dataSaver?.enabled || !config.dataSaverTheme?.layoutStyles?.length) return null;
  const assets = new Map(items.map(item => [item.path, item]));
  const compile = (path, parents = new Set()) => {
    if (parents.has(path)) throw new Error('Circular data-saving layout import: ' + path);
    if (/^edgepress\/fonts(?:\/|\.css$)/.test(path)) return postcss.root();
    const asset = assets.get(path);
    if (!asset?.content) throw new Error('Missing data-saving layout stylesheet: ' + path);
    const normalized = transformSync(asset.content.toString('utf8'), { loader: 'css', minify: true, legalComments: 'inline' }).code;
    const tree = postcss.parse(normalized, { from: path });
    const chain = new Set([...parents, path]);
    tree.walkAtRules(rule => {
      if (rule.name.toLowerCase() === 'font-face') rule.remove();
      else if (rule.name.toLowerCase() === 'import') {
        const match = rule.params.match(/^(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*$/);
        if (!match || /^(?:[a-z]+:|\/\/)/i.test(match[2])) { rule.remove(); return; }
        const source = match[2].split(/[?#]/, 1)[0];
        const target = source.startsWith('/') ? source.slice(1) : posix.normalize(posix.join(posix.dirname(path), source));
        if (target.startsWith('../') || !target.endsWith('.css')) throw new Error('Invalid data-saving layout import');
        rule.replaceWith(...compile(target, chain).nodes);
      }
    });
    tree.walkDecls(declaration => {
      if (/url\s*\(/i.test(declaration.value)) declaration.remove();
    });
    return tree;
  };
  const css = config.dataSaverTheme.layoutStyles.map(file => compile(file).toString()).join('\n');
  const result = await transform(css, { loader: 'css', minify: true, legalComments: 'inline' });
  return { path: 'edgepress/data-saver-layout.css', content: Buffer.from(result.code), sourceName: 'Data-saving theme layout' };
}

function featureFor(source) {
  if (/oembed/.test(source)) return 'embed';
  if (/document-viewer/.test(source)) return 'document';
  if (/image-viewer/.test(source)) return 'image';
  if (/media-viewer/.test(source)) return 'gallery';
  if (/project-demo/.test(source)) return 'demo';
  return 'full';
}

function mediaLabel(node) {
  const attributes = node.attribs || {};
  const label = attributes.alt || attributes.title || attributes['data-document-title'];
  if (label) return label;
  for (const child of node.children || []) {
    if (['template', 'noscript'].includes(child.name)) continue;
    const nested = mediaLabel(child);
    if (nested) return nested;
  }
  return '';
}

export function dataSaverHtml(html, config, manifest = {}) {
  if (!/<html\b/i.test(html)) return html;
  if (!config.site.dataSaver?.enabled) {
    if (config.site.dataSaver?.debug) return html;
    const language = html.match(/<html\b[^>]*\blang=["']([^"']+)/i)?.[1] || config.i18n.defaultLocale;
    const settings = JSON.stringify({ enabled: false, notFoundUrl: localizedUrl(config, language, '404.html') }).replace(/</g, '\\u003c');
    const source = escape(manifest['/edgepress/data-saver.js'] || '/edgepress/data-saver.js');
    return html.replace(/(<meta\b[^>]*charset[^>]*>|<head\b[^>]*>)/i, '$1<script id="edgepress-data-saver-config" type="application/json">' + settings + '</script><script src="' + source + '"></script>');
  }
  const document = parseDocument(html, { withStartIndices: true, withEndIndices: true });
  const patches = [];
  let head;
  let body;
  let locale = config.i18n.defaultLocale;
  const preloadStyles = new Set();
  const visit = node => {
    const name = node.name;
    const attributes = node.attribs || {};
    if (name === 'html') locale = attributes.lang || locale;
    if (name === 'head') head = node;
    if (name === 'body') body = node;
    if (['template', 'noscript', 'svg'].includes(name)) return;
    const original = html.slice(node.startIndex, node.endIndex + 1);
    let resource = '';
    if (name === 'link' && (['preload', 'modulepreload', 'prefetch', 'preconnect', 'dns-prefetch'].includes(attributes.rel) || attributes.rel === 'stylesheet' && !essentialStyles.test(attributes.href))) resource = 'style';
    if (name === 'script' && attributes.src && (optionalScripts.test(attributes.src) || attributes['data-data-optional'] !== undefined)) resource = 'script';
    if (resource) {
      if (name === 'link' && attributes.rel === 'stylesheet' && attributes.href?.startsWith('/') && !attributes.href.startsWith('//')) preloadStyles.add(attributes.href);
      patches.push({ start: node.startIndex, end: node.endIndex + 1, text: '<template data-edgepress-data-resource="' + resource + '" data-data-feature="' + featureFor(attributes.src || attributes.href || '') + '">' + original + '</template><noscript>' + original + '</noscript>' });
      return;
    }
    if (['img', 'picture', 'video', 'audio', 'iframe'].includes(name) || attributes['data-edgepress-document'] !== undefined || attributes['data-edgepress-media-viewer'] !== undefined || attributes['data-project-demo'] !== undefined) {
      const label = mediaLabel(node);
      const tag = name === 'img' || name === 'picture' ? 'span' : 'div';
      const feature = attributes['data-edgepress-document'] !== undefined ? 'document' : attributes['data-edgepress-media-viewer'] !== undefined ? 'gallery' : attributes['data-project-demo'] !== undefined ? 'demo' : name === 'img' || name === 'picture' ? 'image' : 'media';
      const classes = attributes.class || '';
      const pictureImage = name === 'picture' ? node.children?.find(child => child.name === 'img')?.attribs : null;
      const decorative = feature === 'image' && (attributes.alt === '' || pictureImage?.alt === '' || attributes['aria-hidden'] === 'true' || ['none', 'presentation'].includes(attributes.role) || /(?:^|\s)(?:navigation-icon|icon-library|brand-mark)(?:\s|$)/.test(classes));
      const brand = feature === 'image' && /(?:^|\s)brand-wordmark(?:\s|$)/.test(classes);
      patches.push({ start: node.startIndex, end: node.endIndex + 1, text: '<' + tag + ' class="edgepress-data-placeholder' + (brand ? ' edgepress-data-brand' : '') + '" data-edgepress-data-media data-data-feature="' + feature + '"' + (decorative ? ' data-data-decorative' : '') + (brand ? ' data-data-brand' : '') + '><span data-data-description>' + escape(label) + '</span><template data-edgepress-data-html>' + escape(original) + '</template><noscript>' + original + '</noscript></' + tag + '>' });
      return;
    }
    for (const child of node.children || []) visit(child);
  };
  visit(document);
  if (!head || !body) return html;
  const keys = ['load', 'loading', 'slowTitle', 'slowNotice', 'switchText', 'keepFull', 'returnFull', 'textNotice', 'missingDescription'];
  const labels = Object.fromEntries(keys.map(key => [key, translate(config, locale, 'dataSaver' + key[0].toUpperCase() + key.slice(1))]));
  const settings = JSON.stringify({ ...config.site.dataSaver, labels, preloadStyles: [...preloadStyles], notFoundUrl: localizedUrl(config, locale, '404.html') }).replace(/</g, '\\u003c');
  const asset = path => escape(manifest[path] || path);
  const variant = config.dataSaverTheme;
  if (!variant) throw new Error('Missing data-saving theme variant');
  const bootstrap = '<script id="edgepress-data-saver-config" type="application/json">' + settings + '</script><script src="' + asset('/edgepress/data-saver.js') + '"></script>' + (variant.layoutStyles?.length ? '<link rel="stylesheet" href="' + asset('/edgepress/data-saver-layout.css') + '">' : '') + '<link rel="stylesheet" href="' + asset('/edgepress/data-saver.css') + '"><link rel="stylesheet" href="' + asset('/' + variant.stylesheet) + '">' + variant.scripts.map(file => '<script defer src="' + asset('/' + file) + '"></script>').join('');
  const charset = head.children?.find(node => node.name === 'meta' && node.attribs?.charset);
  const headPosition = charset ? charset.endIndex + 1 : html.indexOf('>', head.startIndex) + 1;
  patches.push({ start: headPosition, end: headPosition, text: bootstrap });
  const waiting = '<div class="edgepress-data-wait" data-data-wait hidden><p role="status">' + escape(labels.loading) + '</p><aside class="edgepress-data-offer" data-data-offer aria-labelledby="edgepress-data-offer-title" hidden><h2 id="edgepress-data-offer-title">' + escape(labels.slowTitle) + '</h2><p>' + escape(labels.slowNotice) + '</p><div><button type="button" data-data-mode="text">' + escape(labels.switchText) + '</button><button type="button" data-data-dismiss>' + escape(labels.keepFull) + '</button></div></aside></div>';
  const bodyPosition = html.indexOf('>', body.startIndex) + 1;
  patches.push({ start: bodyPosition, end: bodyPosition, text: waiting });
  const controls = '<aside class="edgepress-data-return" data-data-return hidden><span>' + escape(labels.textNotice) + '</span><button type="button" data-data-mode="full">' + escape(labels.returnFull) + '</button></aside>';
  patches.push({ start: body.endIndex - 6, end: body.endIndex - 6, text: controls });
  patches.sort((first, second) => second.start - first.start);
  for (const patch of patches) html = html.slice(0, patch.start) + patch.text + html.slice(patch.end);
  return html;
}
