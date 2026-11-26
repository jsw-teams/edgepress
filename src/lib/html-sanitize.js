// Zero-dependency strict allowlist HTML sanitizer.
import { decodeHtmlEntities, parseDocument } from './html-parser.js';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const URL_ATTRS = new Set(['href', 'src', 'poster', 'cite', 'action', 'formaction', 'data-original']);

function escapeText(value) {
  return String(value ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function isSafeUrl(raw, allowedSchemes, allowProtocolRelative) {
  const cleaned = decodeHtmlEntities(raw).replace(/[\x00-\x20\u007f-\u009f]+/g, '').trim();
  if (!cleaned) return true;
  if (cleaned.startsWith('//')) return allowProtocolRelative === true;
  if (cleaned.startsWith('/') || cleaned.startsWith('#') || cleaned.startsWith('?') || cleaned.startsWith('./') || cleaned.startsWith('../')) return true;
  const schemeMatch = cleaned.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) return true;
  return allowedSchemes.has(schemeMatch[1].toLowerCase());
}

function attrAllowed(name, list) {
  if (!list) return false;
  for (const pattern of list) {
    if (pattern === name) return true;
    if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) return true;
  }
  return false;
}

export default function sanitizeHtml(dirty, options = {}) {
  const allowedTags = new Set((options.allowedTags || []).map(t => t.toLowerCase()));
  const allowedAttributes = options.allowedAttributes || {};
  const allowedSchemes = new Set((options.allowedSchemes || ['http', 'https', 'mailto', 'tel']).map(s => s.toLowerCase()));
  const allowProtocolRelative = options.allowProtocolRelative === true;
  const nonTextTags = new Set((options.nonTextTags || ['script', 'style', 'textarea', 'option', 'xmp']).map(t => t.toLowerCase()));
  const transformTags = options.transformTags || {};
  const exclusiveFilter = typeof options.exclusiveFilter === 'function' ? options.exclusiveFilter : null;

  const doc = parseDocument(String(dirty ?? ''));

  function textContent(node) {
    if (node.type === 'text') return node.data;
    if (!node.children) return '';
    return node.children.map(textContent).join('');
  }

  function renderNode(node) {
    if (node.type === 'text') return escapeText(decodeHtmlEntities(node.data));
    if (node.type === 'comment' || node.type === 'directive') return '';
    if (node.type !== 'tag') return (node.children || []).map(renderNode).join('');

    let tagName = node.name.toLowerCase();
    let attribs = { ...node.attribs };

    if (nonTextTags.has(tagName) && !allowedTags.has(tagName)) return '';

    if (allowedTags.has(tagName)) {
      const allowedList = [...(allowedAttributes['*'] || []), ...(allowedAttributes[tagName] || [])];
      const filtered = Object.create(null);
      for (const [key, val] of Object.entries(attribs)) {
        const attrName = key.toLowerCase();
        if (attrName.startsWith('on')) continue;
        if (!attrAllowed(attrName, allowedList)) continue;
        if (URL_ATTRS.has(attrName) && !isSafeUrl(val, allowedSchemes, allowProtocolRelative)) continue;
        filtered[attrName] = val;
      }
      attribs = filtered;

      if (typeof transformTags[tagName] === 'function') {
        const transformed = transformTags[tagName](tagName, attribs);
        if (transformed) {
          tagName = transformed.tagName.toLowerCase();
          attribs = transformed.attribs || {};
          if (transformed.text !== undefined) {
            const inner = escapeText(transformed.text);
            const attrsStr = serializeAttribs(attribs, allowedAttributes[tagName], allowedAttributes['*'], allowedSchemes, allowProtocolRelative);
            return VOID_TAGS.has(tagName) ? '<' + tagName + attrsStr + '>' : '<' + tagName + attrsStr + '>' + inner + '</' + tagName + '>';
          }
        }
      }

      if (exclusiveFilter && exclusiveFilter({ tag: tagName, attribs, text: textContent(node).trim() })) {
        return '';
      }

      const attrsStr = serializeAttribs(attribs, allowedAttributes[tagName], allowedAttributes['*'], allowedSchemes, allowProtocolRelative);
      if (VOID_TAGS.has(tagName)) return '<' + tagName + attrsStr + '>';
      const inner = (node.children || []).map(renderNode).join('');
      return '<' + tagName + attrsStr + '>' + inner + '</' + tagName + '>';
    }

    // Disallowed non-blacklisted tag: keep inner sanitized content
    return (node.children || []).map(renderNode).join('');
  }

  return doc.children.map(renderNode).join('');
}

function serializeAttribs(attribs, tagList, globalList, allowedSchemes, allowProtocolRelative) {
  const allowedList = [...(globalList || []), ...(tagList || [])];
  let out = '';
  for (const [key, val] of Object.entries(attribs)) {
    const attrName = key.toLowerCase();
    if (attrName.startsWith('on')) continue;
    if (!attrAllowed(attrName, allowedList)) continue;
    if (URL_ATTRS.has(attrName) && !isSafeUrl(val, allowedSchemes, allowProtocolRelative)) continue;
    if (val === '' && ['controls', 'playsinline', 'default', 'hidden', 'disabled', 'open', 'checked'].includes(attrName)) {
      out += ' ' + attrName;
    } else {
      out += ' ' + attrName + '="' + escapeAttr(val) + '"';
    }
  }
  return out;
}
