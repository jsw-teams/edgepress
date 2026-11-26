// Zero-dependency HTML tokenizer and lightweight DOM parser with exact source indices.

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'xmp']);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '©', hellip: '…', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’'
};

export function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function parseAttributes(source, start, end) {
  const attribs = Object.create(null);
  let i = start;
  while (i < end) {
    while (i < end && /[\s/]/.test(source[i])) i += 1;
    if (i >= end) break;
    const nameStart = i;
    while (i < end && !/[\s=/>]/.test(source[i])) i += 1;
    const name = source.slice(nameStart, i).toLowerCase();
    if (!name) { i += 1; continue; }
    while (i < end && /\s/.test(source[i])) i += 1;
    let value = '';
    if (i < end && source[i] === '=') {
      i += 1;
      while (i < end && /\s/.test(source[i])) i += 1;
      if (i < end && (source[i] === '"' || source[i] === "'")) {
        const quote = source[i++];
        const valStart = i;
        while (i < end && source[i] !== quote) i += 1;
        value = decodeHtmlEntities(source.slice(valStart, i));
        if (i < end) i += 1;
      } else {
        const valStart = i;
        while (i < end && !/[\s>]/.test(source[i])) i += 1;
        value = decodeHtmlEntities(source.slice(valStart, i));
      }
    }
    if (!(name in attribs)) attribs[name] = value;
  }
  return attribs;
}

function findTagEnd(html, start) {
  let quote = null;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

export function parseDocument(html) {
  const source = String(html ?? '');
  const root = { type: 'root', name: 'root', children: [], startIndex: 0, endIndex: Math.max(0, source.length - 1) };
  const stack = [root];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      if (i < source.length) {
        stack[stack.length - 1].children.push({ type: 'text', data: source.slice(i), startIndex: i, endIndex: source.length - 1 });
      }
      break;
    }
    if (lt > i) {
      stack[stack.length - 1].children.push({ type: 'text', data: source.slice(i, lt), startIndex: i, endIndex: lt - 1 });
    }
    // Comment
    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt + 4);
      const end = close < 0 ? source.length - 1 : close + 2;
      stack[stack.length - 1].children.push({ type: 'comment', data: source.slice(lt + 4, close < 0 ? source.length : close), startIndex: lt, endIndex: end });
      i = end + 1;
      continue;
    }
    // Doctype / declaration / PI
    if (source[lt + 1] === '!' || source[lt + 1] === '?') {
      const end = source.indexOf('>', lt + 2);
      const stop = end < 0 ? source.length - 1 : end;
      stack[stack.length - 1].children.push({ type: 'directive', data: source.slice(lt + 1, stop), startIndex: lt, endIndex: stop });
      i = stop + 1;
      continue;
    }
    // Closing tag
    if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt + 2);
      const stop = end < 0 ? source.length - 1 : end;
      const name = source.slice(lt + 2, stop).trim().toLowerCase();
      for (let s = stack.length - 1; s >= 1; s -= 1) {
        if (stack[s].name === name) {
          for (let k = stack.length - 1; k >= s; k -= 1) {
            stack[k].endIndex = k === s ? stop : lt - 1;
            stack.pop();
          }
          break;
        }
      }
      i = stop + 1;
      continue;
    }
    // Opening tag
    const nameMatch = source.slice(lt + 1, lt + 64).match(/^([A-Za-z][A-Za-z0-9:-]*)/);
    if (!nameMatch) {
      stack[stack.length - 1].children.push({ type: 'text', data: '<', startIndex: lt, endIndex: lt });
      i = lt + 1;
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    const gt = findTagEnd(source, lt + 1 + nameMatch[1].length);
    if (gt < 0) {
      stack[stack.length - 1].children.push({ type: 'text', data: source.slice(lt), startIndex: lt, endIndex: source.length - 1 });
      break;
    }
    const selfClosing = source[gt - 1] === '/';
    const attribs = parseAttributes(source, lt + 1 + nameMatch[1].length, selfClosing ? gt - 1 : gt);
    const node = { type: 'tag', name, attribs, children: [], startIndex: lt, endIndex: gt };
    stack[stack.length - 1].children.push(node);

    if (RAW_TEXT_TAGS.has(name) && !selfClosing) {
      const closePattern = new RegExp('</' + name + '\\s*>', 'i');
      const rest = source.slice(gt + 1);
      const closeMatch = rest.match(closePattern);
      if (closeMatch) {
        const innerEnd = gt + 1 + closeMatch.index;
        if (innerEnd > gt + 1) {
          node.children.push({ type: 'text', data: source.slice(gt + 1, innerEnd), startIndex: gt + 1, endIndex: innerEnd - 1 });
        }
        node.endIndex = innerEnd + closeMatch[0].length - 1;
        i = node.endIndex + 1;
      } else {
        if (gt + 1 < source.length) {
          node.children.push({ type: 'text', data: source.slice(gt + 1), startIndex: gt + 1, endIndex: source.length - 1 });
        }
        node.endIndex = source.length - 1;
        i = source.length;
      }
      continue;
    }

    if (!VOID_TAGS.has(name) && !selfClosing) {
      stack.push(node);
    }
    i = gt + 1;
  }

  while (stack.length > 1) {
    stack.pop().endIndex = Math.max(0, source.length - 1);
  }
  return root;
}
