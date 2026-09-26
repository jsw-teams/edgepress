import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const allowedTags = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
  'br', 'caption', 'cite', 'code', 'data', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'kbd', 'li', 'main',
  'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'rtc', 'ruby', 's',
  'samp', 'section', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'track', 'tr', 'u', 'ul',
  'var', 'video', 'wbr'
];

const sanitizeOptions = {
  allowedTags,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    code: ['class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    li: ['value'],
    ol: ['start'],
    source: ['src', 'type'],
    span: ['class', 'role', 'aria-label'],
    td: ['align', 'colspan', 'rowspan'],
    th: ['align', 'colspan', 'rowspan'],
    track: ['kind', 'src', 'srclang', 'label', 'default'],
    video: ['aria-label', 'controls', 'playsinline', 'poster', 'preload', 'width', 'height']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  nonTextTags: ['script', 'style', 'textarea', 'option', 'xmp'],
  transformTags: {
    a: (_tagName, attributes) => ({
      tagName: 'a',
      attribs: { ...attributes, rel: 'noopener noreferrer' }
    })
  }
};

function videoMimeType(href) {
  const path = String(href ?? '').split(/[?#]/, 1)[0].toLowerCase();
  const extension = path.match(/\.(mp4|webm|ogv|ogg)$/)?.[1];
  return ({ mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg' })[extension] || '';
}

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function markdownRenderer(options) {
  const renderer = new marked.Renderer();
  const renderImage = renderer.image.bind(renderer);
  renderer.image = (token) => {
    const mimeType = videoMimeType(token.href);
    if (mimeType) {
      const description = String(token.text ?? '').trim();
      if (!description) throw new Error('Markdown videos need descriptive alternative text');
      const href = escapeHtml(safeVideoHref(token.href));
      if (options.allowVideo === false) return '<span>' + escapeHtml(description) + '</span>';
      const caption = token.title ? '<figcaption>' + escapeHtml(token.title) + '</figcaption>' : '';
      return '<figure class="markdown-video"><video controls playsinline preload="none" aria-label="' +
        escapeHtml(description) + '"><source src="' + href + '" type="' + mimeType + '"><a href="' + href + '">' +
        escapeHtml(description) + '</a></video>' + caption + '</figure>';
    }
    if (options.allowImages === false) return '<span>' + escapeHtml(token.text || '') + '</span>';
    return renderImage(token);
  };
  return renderer;
}

export async function renderMarkdown(source, options = {}) {
  let html = await marked.parse(source, {
    gfm: options.gfm !== false,
    breaks: options.breaks === true,
    renderer: markdownRenderer(options)
  });
  // GFM task markers become named static status icons. They remain readable to
  // assistive technology without exposing disabled, unlabeled form controls.
  html = html.replace(/<input\b([^>]*)>/gi, (_match, attributes) => {
    const checked = /\bchecked(?:\s|=|$)/i.test(attributes);
    const label = checked ? (options.taskLabels?.complete || 'Task complete') :
      (options.taskLabels?.incomplete || 'Task incomplete');
    const safeLabel = String(label).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    return '<span class="markdown-task-status" role="img" aria-label="' +
      safeLabel + '">' + (checked ? '✓' : '□') + '</span>';
  });
  return sanitizeHtml(html, sanitizeOptions);
}

export async function renderMarkdownExcerpt(source, options = {}) {
  const markdown = String(source ?? '');
  const tokens = marked.lexer(markdown, { gfm: options.gfm !== false });
  const paragraph = tokens.find((token) => token.type === 'paragraph');
  if (!paragraph) return '<p>' + escapeHtml(plainText(markdown).slice(0, 220)) + '</p>';
  return renderMarkdown(paragraph.raw, { ...options, allowImages: false, allowVideo: false });
}

export function plainText(source) {
  const html = marked.parse(String(source ?? ''), { gfm: true });
  const namedEntities = {
    amp: '&', apos: "'", copy: '©', gt: '>', hellip: '…', ldquo: '“', lsquo: '‘',
    lt: '<', mdash: '—', nbsp: ' ', ndash: '–', quot: '"', rdquo: '”', rsquo: '’'
  };
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|textarea|option|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<img\b([^>]*)>/gi, (_match, attributes) => {
      const alt = attributes.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      return alt ? ' ' + (alt[1] ?? alt[2] ?? alt[3]) + ' ' : ' ';
    })
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : match;
      }
      return namedEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
