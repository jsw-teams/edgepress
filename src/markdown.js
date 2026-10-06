import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const allowedTags = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
  'br', 'caption', 'cite', 'code', 'data', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'kbd', 'li', 'main',
  'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'rtc', 'ruby', 's',
  'samp', 'section', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup', 'button',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'track', 'tr', 'u', 'ul',
  'var', 'video', 'wbr'
];

const sanitizeOptions = {
  allowedTags,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    button: ['type', 'data-oembed-load'],
    code: ['class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'data-original'],
    figure: ['class', 'data-edgepress-oembed', 'data-oembed-url', 'data-oembed-width', 'data-oembed-height', 'data-oembed-inline'],
    div: ['class', 'data-oembed-status', 'data-oembed-placeholder', 'aria-hidden'],
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
    img: (_tagName,attributes)=>{if(attributes['data-original']){try{attributes['data-original']=safeVideoHref(attributes['data-original']);}catch{delete attributes['data-original'];}}return {tagName:'img',attribs:attributes};},
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

function inlineEmbedMarkup(embed) {
  const url = escapeHtml(embed.url);
  const service = escapeHtml(embed.service);
  const label = escapeHtml(embed.label || embed.service);
  const width = Number.isFinite(embed.width) && embed.width > 0 ? Math.min(4096, embed.width) : 640;
  const height = Number.isFinite(embed.height) && embed.height > 0 ? Math.min(4096, embed.height) : 480;
  return '<figure class="edgepress-oembed edgepress-oembed-inline" data-edgepress-oembed="' + service + '" data-oembed-url="' + url +
    '" data-oembed-inline="true" data-oembed-width="' + width + '" data-oembed-height="' + height + '">' +
    '<figcaption>' + label + '</figcaption><p data-oembed-notice role="status">' + escapeHtml(embed.notice || 'Media is ready when you allow this service.') + '</p>' +
    '<button type="button" data-oembed-load>' + escapeHtml(embed.loadLabel || 'Load media') + '</button>' +
    '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(embed.openLabel || 'Open source') + '</a>' +
    '<div data-oembed-status><div class="oembed-placeholder" data-oembed-placeholder aria-hidden="true"></div></div></figure>';
}

function markdownRenderer(options) {
  const renderer = new marked.Renderer();
  const renderImage = renderer.image.bind(renderer);
  renderer.image = (token) => {
    const inlineEmbed = options.embedResolver?.(token.href, token.text, token.title);
    if (inlineEmbed) return inlineEmbedMarkup(inlineEmbed);
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
    if(options.imageResolver){const href=options.imageResolver(token.href);if(!href)return '<span>'+escapeHtml(token.text||'')+'</span>';return renderImage({...token,href});}
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
  return sanitizeHtml(html, options.imageResolver?{...sanitizeOptions,transformTags:{...sanitizeOptions.transformTags,img:(_tag,attributes)=>{
    const src=options.imageResolver(attributes.src);
    return src?{tagName:'img',attribs:{src,alt:attributes.alt||'',loading:'lazy'}}:{tagName:'span',attribs:{},text:attributes.alt||''};
  }}}:sanitizeOptions);
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
