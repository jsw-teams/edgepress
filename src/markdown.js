import sanitizeHtml from './lib/html-sanitize.js';
import { lexMarkdown, parseMarkdownAsync, parseMarkdownSync, containsMarkdownVideo } from './lib/markdown-parser.js';
import { decodeHtmlEntities } from './lib/html-parser.js';

const allowedTags = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
  'br', 'caption', 'cite', 'code', 'data', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'kbd', 'li', 'main',
  'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'rtc', 'ruby', 's',
  'samp', 'section', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup', 'button',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'track', 'tr', 'u', 'ul',
  'template', 'var', 'video', 'wbr'
];

function safeVideoHref(value) {
  const href = String(value ?? '').trim();
  if (!href || /[\x00-\x20\\]/.test(href) || href.startsWith('//')) {
    throw new Error('Markdown video sources must be safe relative paths or HTTP(S) URLs');
  }
  if (href.startsWith('/')) return href;
  let url;
  try { url = new URL(href, 'https://edgepress.invalid'); }
  catch { throw new Error('Markdown video sources must be safe relative paths or HTTP(S) URLs'); }
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Markdown video sources must be safe relative paths or HTTP(S) URLs');
  }
  return href;
}

const sanitizeOptions = {
  allowedTags,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    button: ['type', 'data-oembed-load', 'data-service-consent-settings'],
    code: ['class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'data-original'],
    figure: ['class', 'data-edgepress-oembed', 'data-oembed-url', 'data-oembed-width', 'data-oembed-height', 'data-oembed-disabled', 'data-oembed-unavailable', 'data-edgepress-document', 'data-document-src', 'data-document-title', 'data-document-format', 'data-document-preview', 'data-document-service'],
    div: ['class', 'data-oembed-status', 'data-oembed-placeholder', 'aria-hidden', 'data-document-mount'],
    p: ['data-oembed-notice', 'class', 'role'],
    template: ['data-oembed-data'],
    li: ['value'],
    ol: ['start'],
    source: ['src', 'type'],
    span: ['class', 'role', 'aria-label'],
    td: ['align', 'colspan', 'rowspan'],
    th: ['align', 'colspan', 'rowspan'],
    track: ['kind', 'src', 'srclang', 'label', 'default'],
    video: ['data-edgepress-video', 'aria-label', 'controls', 'playsinline', 'poster', 'preload', 'width', 'height']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  nonTextTags: ['script', 'style', 'textarea', 'option', 'xmp'],
  transformTags: {
    img: (_tagName, attributes) => {
      if (attributes['data-original']) {
        try { attributes['data-original'] = safeVideoHref(attributes['data-original']); }
        catch { delete attributes['data-original']; }
      }
      return { tagName: 'img', attribs: attributes };
    },
    a: (_tagName, attributes) => ({
      tagName: 'a',
      attribs: { ...attributes, rel: 'noopener noreferrer' }
    })
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function hasMarkdownVideo(source) {
  return containsMarkdownVideo(String(source || ''));
}

export async function renderMarkdown(source, options = {}) {
  let html = await parseMarkdownAsync(String(source ?? ''), options);
  // GFM task markers become named static status icons. They remain readable to
  // assistive technology without exposing disabled, unlabeled form controls.
  html = html.replace(/<input\b([^>]*)>/gi, (_match, attributes) => {
    const checked = /\bchecked(?:\s|=|$)/i.test(attributes);
    const label = checked ? (options.taskLabels?.complete || 'Task complete') :
      (options.taskLabels?.incomplete || 'Task incomplete');
    const safeLabel = escapeHtml(label);
    return '<span class="markdown-task-status" role="img" aria-label="' +
      safeLabel + '">' + (checked ? '✓' : '□') + '</span>';
  });
  return sanitizeHtml(html, options.imageResolver ? {
    ...sanitizeOptions,
    transformTags: {
      ...sanitizeOptions.transformTags,
      img: (_tag, attributes) => {
        const src = options.imageResolver(attributes.src);
        return src ? { tagName: 'img', attribs: { src, alt: attributes.alt || '', loading: 'lazy' } } : { tagName: 'span', attribs: {}, text: attributes.alt || '' };
      }
    }
  } : sanitizeOptions);
}

export async function renderMarkdownExcerpt(source, options = {}) {
  const markdown = String(source ?? '');
  const { tokens } = lexMarkdown(markdown, options);
  const paragraph = tokens.find((token) => token.type === 'paragraph');
  if (!paragraph) return '<p>' + escapeHtml(plainText(markdown).slice(0, 220)) + '</p>';
  return renderMarkdown(paragraph.raw, { ...options, allowImages: false, allowVideo: false });
}

export function plainText(source) {
  const html = parseMarkdownSync(String(source ?? ''));
  return decodeHtmlEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|textarea|option|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<img\b([^>]*)>/gi, (_match, attributes) => {
        const alt = attributes.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        return alt ? ' ' + (alt[1] ?? alt[2] ?? alt[3]) + ' ' : ' ';
      })
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}
