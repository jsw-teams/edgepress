import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const allowedTags = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
  'br', 'caption', 'cite', 'code', 'data', 'dd', 'del', 'details', 'dfn',
  'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'kbd', 'li', 'main',
  'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'rtc', 'ruby', 's',
  'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul',
  'var', 'wbr'
];

const sanitizeOptions = {
  allowedTags,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    code: ['class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    li: ['value'],
    ol: ['start'],
    span: ['class', 'role', 'aria-label'],
    td: ['align', 'colspan', 'rowspan'],
    th: ['align', 'colspan', 'rowspan']
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

export async function renderMarkdown(source, options = {}) {
  let html = await marked.parse(source, {
    gfm: options.gfm !== false,
    breaks: options.breaks === true
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
