import { documentFormat, documentUrl } from '@jsw-teams/document-viewer';
import { translate, translateValue } from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function parseDocument(source) {
  const match = String(source).match(/^ {0,3}!document\[([^\]\r\n]+)\]\(([^\s<>]+)\)(?:\{([^}\r\n]*)\})?[\t ]*(?:\r?\n|$)/i);
  if (!match) return null;
  const attributes = {};
  for (const field of (match[3] || '').trim().split(/\s+/).filter(Boolean)) {
    const parts = field.match(/^(format|service)=([a-z0-9_-]+)$/i);
    if (!parts || Object.hasOwn(attributes, parts[1])) throw new Error('Document syntax accepts format=pdf and service=registered-id');
    attributes[parts[1]] = parts[2];
  }
  return { raw: match[0], title: match[1], src: match[2], ...attributes };
}

export function renderDocument(block, { config, locale }) {
  const allowed = new Set(['type', 'src', 'title', 'format', 'service', 'previewSrc', 'caption', 'raw', 'tokens']);
  for (const key of Object.keys(block)) if (!allowed.has(key)) throw new Error('Unsupported document field: ' + key);
  const title = String(block.title || '').trim();
  if (!title || title.length > 500) throw new Error('Documents need a descriptive title of 1 to 500 characters');
  const base = config.site?.url || 'https://document.invalid';
  const source = documentUrl(block.src, base);
  const preview = documentUrl(block.previewSrc || block.src, base);
  const format = documentFormat(preview.href, block.format);
  if (!format) throw new Error('Unsupported document format; use format for extensionless URLs');
  let service = null;
  const origins = [...new Set([source.origin, preview.origin].filter(origin => origin !== new URL(base).origin))];
  if (block.service || origins.length) {
    service = config.browserPlugins?.services?.find(item => item.id === block.service || (!block.service && item.provider === 'external-api' && item.backendUrl && origins.every(origin => origin === new URL(item.backendUrl).origin)));
    if (!service || service.provider !== 'external-api') throw new Error('Remote documents need a registered external-api consent service');
    const permitted = new Set([new URL(service.backendUrl).origin, ...(service.csp?.['connect-src'] || [])]);
    if (origins.some(origin => !permitted.has(origin))) throw new Error('Document URL must use its registered service origin');
  }
  const unavailable = escape(translate(config, locale, 'documentViewerError'));
  if (service?.enabled === false) return '<figure class="document-block"><figcaption>' + escape(title) + '</figcaption><p>' + unavailable + '</p></figure>';
  const caption = block.caption ? '<p>' + escape(block.caption) + '</p>' : '';
  const consent = service ? '<p>' + escape(translateValue(config, locale, service.purpose)) + '</p><button type="button" data-service-consent-settings>' + escape(translate(config, locale, 'privacySettings')) + '</button>' : '';
  return '<figure class="document-block" data-edgepress-document data-document-src="' + escape(block.src) + '" data-document-title="' + escape(title) + '" data-document-format="' + format + '"' +
    (block.previewSrc ? ' data-document-preview="' + escape(block.previewSrc) + '"' : '') +
    (service ? ' data-document-service="' + escape(service.id) + '"' : '') + '><figcaption>' + escape(title) + '</figcaption>' + consent +
    '<div data-document-mount><p>' + escape(translate(config, locale, 'documentViewerLoading')) + '</p></div><noscript><p>' + unavailable + '</p></noscript>' + caption + '</figure>';
}
