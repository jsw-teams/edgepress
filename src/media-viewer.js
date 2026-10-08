import { documentUrl } from '@jsw-teams/document-viewer';
import { translate, translateValue } from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function renderMediaViewer(block, { config, locale }) {
  for (const key of Object.keys(block)) if (!['type', 'title', 'items', 'service'].includes(key)) throw new Error('Unsupported media-viewer field: ' + key);
  if (typeof block.title !== 'string' || !block.title.trim() || block.title.length > 500) throw new Error('media-viewer needs a descriptive title');
  if (!Array.isArray(block.items) || !block.items.length || block.items.length > 50) throw new Error('media-viewer needs 1 to 50 items');
  const base = config.site?.url || 'https://media.invalid';
  const origin = new URL(base).origin;
  const resources = [];
  const source = (value, directive) => {
    const url = documentUrl(value, base);
    resources.push({ origin: url.origin, directive });
    return escape(value);
  };
  const items = block.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('media-viewer items must be objects');
    const fields = item.type === 'image' ? ['type', 'src', 'originalSrc', 'alt'] : ['type', 'src', 'label', 'poster', 'format', 'duration', 'captions', 'captionLanguage', 'silent'];
    for (const key of Object.keys(item)) if (!fields.includes(key)) throw new Error('Unsupported media-viewer item field: ' + key);
    if (item.type === 'image') {
      if (typeof item.alt !== 'string' || !item.alt.trim() || item.alt.length > 2000) throw new Error('media-viewer images need meaningful alt text');
      return '<figure><img data-media src="' + source(item.src, 'img-src') + '"' + (item.originalSrc ? ' data-original="' + source(item.originalSrc, 'img-src') + '"' : '') + ' alt="' + escape(item.alt) + '" decoding="async"></figure>';
    }
    if (item.type !== 'video') throw new Error('media-viewer supports image and video items');
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 2000) throw new Error('media-viewer videos need a descriptive label');
    if (item.silent !== undefined && typeof item.silent !== 'boolean') throw new Error('media-viewer silent must be boolean');
    if (!item.captions && item.silent !== true) throw new Error('media-viewer videos need captions, or silent: true for a genuinely silent clip');
    if (item.captions && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(item.captionLanguage || '')) throw new Error('media-viewer captions need captionLanguage');
    const format = item.format || (/\.m3u8(?:[?#]|$)/i.test(item.src) ? 'hls' : 'native');
    if (!['native', 'hls'].includes(format)) throw new Error('media-viewer video format must be native or hls');
    if (item.duration !== undefined && (!Number.isFinite(item.duration) || item.duration <= 0 || item.duration > 86400)) throw new Error('media-viewer duration must be seconds from 0 to 86400');
    const src = source(item.src, 'media-src');
    if (format === 'hls') resources.push({ origin: documentUrl(item.src, base).origin, directive: 'connect-src' });
    return '<figure><video playsinline preload="none" data-source="' + src + '" data-type="' + format + '" aria-label="' + escape(item.label) + '"' + (item.poster ? ' poster="' + source(item.poster, 'img-src') + '"' : '') + (item.duration ? ' data-duration="' + item.duration + '"' : '') + '>' + (item.captions ? '<track kind="captions" src="' + source(item.captions, 'media-src') + '" srclang="' + escape(item.captionLanguage) + '" label="' + escape(item.captionLanguage) + '">' : '') + '</video></figure>';
  });
  let service = null;
  if (block.service || resources.some(resource => resource.origin !== origin)) {
    service = config.browserPlugins?.services?.find(item => item.id === block.service);
    if (service?.provider !== 'external-api') throw new Error('Remote media-viewer items need a registered external-api consent service');
    for (const resource of resources) if (resource.origin !== origin && !service.csp?.[resource.directive]?.includes(resource.origin)) throw new Error('Media URL must use its registered service CSP origin for ' + resource.directive);
  }
  const consent = service ? '<p>' + escape(translateValue(config, locale, service.purpose)) + '</p><button type="button" data-service-consent-settings>' + escape(translate(config, locale, 'privacySettings')) + '</button>' : '';
  if (service?.enabled === false) return '<figure><figcaption>' + escape(block.title) + '</figcaption><p>' + escape(translate(config, locale, 'documentViewerError')) + '</p></figure>';
  return '<figure class="media-viewer-block" data-edgepress-media-viewer' + (service ? ' data-media-service="' + escape(service.id) + '"' : '') + '><figcaption>' + escape(block.title) + '</figcaption>' + consent + '<div class="media-gallery"><div class="gallery-stage" tabindex="0"></div>' + items.map(item => '<template>' + item + '</template>').join('') + '<div class="gallery-navigation" hidden><button type="button" data-previous></button><span class="gallery-count" role="status" aria-live="polite"></span><button type="button" data-next></button></div></div><noscript><p>' + escape(translate(config, locale, 'documentViewerError')) + '</p></noscript></figure>';
}
