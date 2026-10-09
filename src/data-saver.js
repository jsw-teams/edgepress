import { parseDocument } from 'htmlparser2';
import { translate } from './i18n.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const essentialStyles = /\/edgepress\/(?:external-links|data-saver)\.[a-f0-9]{16}\.css$/;
const optionalScripts = /\/edgepress\/(?:image-viewer|media-viewer|document-viewer|project-demo|webmcp|oembed|services-consent|code-copy|post-toc)\.[a-f0-9]{16}\.js$/;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export async function configureDataSaver(config) {
  if (!config.site.dataSaver?.enabled) return;
  const theme = JSON.parse(await readFile(resolve(config.resolvedPaths.theme, 'theme.json'), 'utf8'));
  const variant = theme.dataSaver;
  if (!variant || typeof variant !== 'object' || Array.isArray(variant) || typeof variant.stylesheet !== 'string' || !Array.isArray(variant.scripts) || Object.keys(variant).some(key => !['stylesheet', 'scripts'].includes(key))) throw new Error('This theme must opt in with theme.json dataSaver: { stylesheet, scripts }');
  for (const [file, extension] of [[variant.stylesheet, 'css'], ...variant.scripts.map(file => [file, 'js'])]) {
    if (typeof file !== 'string' || !new RegExp('^[a-zA-Z0-9][a-zA-Z0-9_./-]*\\.' + extension + '$').test(file) || file.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Invalid data-saving theme asset');
    await readFile(resolve(config.resolvedPaths.theme, 'assets', file));
  }
  config.dataSaverTheme = variant;
}

function featureFor(source) {
  if (/document-viewer/.test(source)) return 'document';
  if (/image-viewer/.test(source)) return 'image';
  if (/media-viewer/.test(source)) return 'gallery';
  if (/project-demo/.test(source)) return 'demo';
  return 'full';
}

export function dataSaverHtml(html, config, manifest = {}) {
  if (!config.site.dataSaver?.enabled || !/<html\b/i.test(html)) return html;
  const document = parseDocument(html, { withStartIndices: true, withEndIndices: true });
  const patches = [];
  let head;
  let body;
  let locale = config.i18n.defaultLocale;
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
      patches.push({ start: node.startIndex, end: node.endIndex + 1, text: '<template data-edgepress-data-resource="' + resource + '" data-data-feature="' + featureFor(attributes.src || attributes.href || '') + '">' + original + '</template><noscript>' + original + '</noscript>' });
      return;
    }
    if (['img', 'picture', 'video', 'audio', 'iframe'].includes(name) || attributes['data-edgepress-document'] !== undefined || attributes['data-edgepress-media-viewer'] !== undefined || attributes['data-project-demo'] !== undefined) {
      const label = attributes.alt || attributes.title || attributes['data-document-title'] || node.children?.find(child => child.name === 'img')?.attribs?.alt || '';
      const tag = name === 'img' || name === 'picture' ? 'span' : 'div';
      const feature = attributes['data-edgepress-document'] !== undefined ? 'document' : attributes['data-edgepress-media-viewer'] !== undefined ? 'gallery' : attributes['data-project-demo'] !== undefined ? 'demo' : name === 'img' || name === 'picture' ? 'image' : 'media';
      patches.push({ start: node.startIndex, end: node.endIndex + 1, text: '<' + tag + ' class="edgepress-data-placeholder" data-edgepress-data-media data-data-feature="' + feature + '"><span data-data-description>' + escape(label) + '</span><template data-edgepress-data-html>' + escape(original) + '</template><noscript>' + original + '</noscript></' + tag + '>' });
      return;
    }
    for (const child of node.children || []) visit(child);
  };
  visit(document);
  if (!head || !body) return html;
  const keys = ['title', 'auto', 'text', 'full', 'notice', 'load'];
  const labels = Object.fromEntries(keys.map(key => [key, translate(config, locale, 'dataSaver' + key[0].toUpperCase() + key.slice(1))]));
  const settings = JSON.stringify({ ...config.site.dataSaver, labels }).replace(/</g, '\\u003c');
  const asset = path => escape(manifest[path] || path);
  const variant = config.dataSaverTheme;
  if (!variant) throw new Error('Missing data-saving theme variant');
  const bootstrap = '<script id="edgepress-data-saver-config" type="application/json">' + settings + '</script><script src="' + asset('/edgepress/data-saver.js') + '"></script><link rel="stylesheet" href="' + asset('/edgepress/data-saver.css') + '"><link rel="stylesheet" href="' + asset('/' + variant.stylesheet) + '">' + variant.scripts.map(file => '<script defer src="' + asset('/' + file) + '"></script>').join('');
  const charset = head.children?.find(node => node.name === 'meta' && node.attribs?.charset);
  const headPosition = charset ? charset.endIndex + 1 : html.indexOf('>', head.startIndex) + 1;
  patches.push({ start: headPosition, end: headPosition, text: bootstrap });
  const controls = '<aside class="edgepress-data-controls" aria-label="' + escape(labels.title) + '" hidden><span>' + escape(labels.title) + '</span><div role="group" aria-label="' + escape(labels.title) + '">' + ['auto', 'text', 'full'].map(mode => '<button type="button" data-data-mode="' + mode + '" aria-pressed="false">' + escape(labels[mode]) + '</button>').join('') + '</div><p data-data-notice hidden>' + escape(labels.notice) + '</p></aside>';
  patches.push({ start: html.indexOf('>', body.startIndex) + 1, end: html.indexOf('>', body.startIndex) + 1, text: controls });
  patches.sort((first, second) => second.start - first.start);
  for (const patch of patches) html = html.slice(0, patch.start) + patch.text + html.slice(patch.end);
  return html;
}
