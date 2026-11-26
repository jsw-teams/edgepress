// Zero-dependency CSS minifier and data-saving layout compiler.
import * as posix from 'node:path/posix';

export function decodeCssEscapes(value) {
  return String(value ?? '').replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\r\n\f0-9a-fA-F])/g, (_m, hex, ch) => {
    if (ch !== undefined) return ch;
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) return '\ufffd';
    return String.fromCodePoint(code);
  });
}

export function minifyCss(source) {
  const input = String(source ?? '');
  let out = '';
  let i = 0;
  let quote = null;
  let parenDepth = 0;
  let pendingSpace = false;

  const isPunct = (ch) => ch === '{' || ch === '}' || ch === ';' || ch === ':' || ch === ',' || ch === '>' || ch === '~';

  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) { out += input[++i]; }
      else if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      const comment = end < 0 ? input.slice(i) : input.slice(i, end + 2);
      if (comment.startsWith('/*!')) {
        if (pendingSpace && out && !isPunct(out[out.length - 1])) out += ' ';
        out += comment;
        pendingSpace = false;
      }
      i = end < 0 ? input.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (pendingSpace && out && !/[\s{;:,(]/.test(out[out.length - 1])) out += ' ';
      pendingSpace = false;
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      pendingSpace = true;
      i += 1;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (ch === ';' && out.endsWith(';')) { i += 1; continue; }
    if (ch === '}' && out.endsWith(';')) out = out.slice(0, -1);

    if (pendingSpace && out.length) {
      const prev = out[out.length - 1];
      const keepSpace =
        (parenDepth > 0 && (ch === '+' || ch === '-' || prev === '+' || prev === '-' || ch === '*' || prev === '*')) ||
        (ch === '(' && /\b(?:and|or|not)$/i.test(out)) ||
        (!isPunct(prev) && !isPunct(ch) && prev !== '(' && ch !== ')' && ch !== '{') ||
        (prev === ':' && ch === ' ') ||
        (prev === ')' && /[A-Za-z0-9.#*_-]/.test(ch));
      if (keepSpace) out += ' ';
    }
    pendingSpace = false;
    out += ch;
    i += 1;
  }
  return out.trim();
}

function findMatchingBrace(css, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) return css.length - 1;
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length - 1;
}

function findStatementEnd(css, start) {
  let quote = null;
  for (let i = start; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ';') return i;
  }
  return css.length - 1;
}

function stripUrlDeclarations(body) {
  const parts = [];
  let start = 0;
  let quote = null;
  let depth = 0;
  for (let i = 0; i <= body.length; i += 1) {
    const ch = i < body.length ? body[i] : ';';
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') { depth += 1; continue; }
    if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && ch === ';') {
      const decl = body.slice(start, i).trim();
      start = i + 1;
      if (!decl) continue;
      const decoded = decodeCssEscapes(decl);
      if (/\burl\s*\(/i.test(decoded)) continue;
      parts.push(decl);
    }
  }
  return parts.join(';');
}

export function compileFontlessCss(path, assetsMap, parents = new Set()) {
  if (parents.has(path)) throw new Error('Circular data-saving layout import: ' + path);
  if (/^edgepress\/fonts(?:\/|\.css$)/.test(path)) return '';
  const asset = assetsMap.get(path);
  if (!asset?.content) throw new Error('Missing data-saving layout stylesheet: ' + path);
  const css = minifyCss(asset.content.toString('utf8'));
  const chain = new Set([...parents, path]);

  function transformBlock(input) {
    let out = '';
    let i = 0;
    while (i < input.length) {
      while (i < input.length && /\s/.test(input[i])) i += 1;
      if (i >= input.length) break;
      if (input.startsWith('/*', i)) {
        const end = input.indexOf('*/', i + 2);
        const comment = end < 0 ? input.slice(i) : input.slice(i, end + 2);
        if (comment.startsWith('/*!')) out += comment;
        i = end < 0 ? input.length : end + 2;
        continue;
      }
      if (input[i] === '@') {
        const nameMatch = input.slice(i + 1).match(/^([a-zA-Z0-9_-]+)/);
        const ruleName = (nameMatch?.[1] || '').toLowerCase();
        // Find next ';' or '{' outside quotes
        let j = i + 1;
        let quote = null;
        while (j < input.length) {
          const ch = input[j];
          if (quote) {
            if (ch === '\\') { j += 2; continue; }
            if (ch === quote) quote = null;
            j += 1;
            continue;
          }
          if (ch === '"' || ch === "'") { quote = ch; j += 1; continue; }
          if (ch === ';' || ch === '{') break;
          j += 1;
        }
        if (input[j] === ';') {
          const params = input.slice(i + 1 + ruleName.length, j).trim();
          if (ruleName === 'import') {
            const match = params.match(/^(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*$/);
            if (match && !/^(?:[a-z]+:|\/\/)/i.test(match[2])) {
              const source = match[2].split(/[?#]/, 1)[0];
              const target = source.startsWith('/') ? source.slice(1) : posix.normalize(posix.join(posix.dirname(path), source));
              if (target.startsWith('../') || !target.endsWith('.css')) throw new Error('Invalid data-saving layout import');
              out += compileFontlessCss(target, assetsMap, chain);
            }
          } else {
            out += input.slice(i, j + 1);
          }
          i = j + 1;
          continue;
        }
        if (input[j] === '{') {
          const close = findMatchingBrace(input, j);
          if (ruleName === 'font-face') {
            i = close + 1;
            continue;
          }
          const header = input.slice(i, j + 1);
          const inner = input.slice(j + 1, close);
          if (['media', 'supports', 'layer', 'container', 'document'].includes(ruleName)) {
            const cleaned = transformBlock(inner);
            if (cleaned.trim()) out += header + cleaned + '}';
          } else {
            out += header + inner + '}';
          }
          i = close + 1;
          continue;
        }
        i = findStatementEnd(input, i) + 1;
        continue;
      }

      // Regular selector { declarations }
      let open = i;
      let quote = null;
      while (open < input.length) {
        const ch = input[open];
        if (quote) {
          if (ch === '\\') { open += 2; continue; }
          if (ch === quote) quote = null;
          open += 1;
          continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; open += 1; continue; }
        if (ch === '{') break;
        open += 1;
      }
      if (open >= input.length) break;
      const selector = input.slice(i, open).trim();
      const close = findMatchingBrace(input, open);
      const body = input.slice(open + 1, close);
      const cleaned = stripUrlDeclarations(body);
      if (cleaned) out += selector + '{' + cleaned + '}';
      i = close + 1;
    }
    return out;
  }

  return transformBlock(css);
}
