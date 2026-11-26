// Zero-dependency safe JavaScript minifier and local ESM static-import bundler.
import * as posix from 'node:path/posix';

const REGEX_PREV_KEYWORDS = new Set([
  'return', 'case', 'throw', 'in', 'of', 'typeof', 'void', 'delete', 'new', 'yield', 'await', 'else', 'do'
]);

const REGEX_PREV_PUNCT = new Set([
  '(', '[', '{', ',', ';', ':', '=', '!', '?', '&', '|', '^', '~', '+', '-', '*', '%', '<', '>'
]);

function isIdentChar(ch) {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

// Conservative JS whitespace/comment minifier: preserves strings, template literals,
// regex literals, legal /*! ... */ comments, newlines where ASI could apply, and public identifiers.
export function minifyJs(source) {
  const input = String(source ?? '');
  const out = [];
  let i = 0;
  let lastToken = '';
  let lastWord = '';
  let pendingSpace = false;
  let pendingNewline = false;

  const canStartRegex = () => {
    if (!lastToken) return true;
    if (REGEX_PREV_PUNCT.has(lastToken)) return true;
    if (lastWord && REGEX_PREV_KEYWORDS.has(lastWord)) return true;
    return false;
  };

  const emitGap = (nextChar) => {
    if (!out.length) { pendingSpace = false; pendingNewline = false; return; }
    const prev = out[out.length - 1];
    const prevChar = prev[prev.length - 1];
    if (pendingNewline) {
      // Keep newline whenever omitting it could break ASI or merge tokens
      const safeToDrop =
        prevChar === '\n' || prevChar === ';' || prevChar === '{' || prevChar === ',' ||
        nextChar === '}' || nextChar === ';';
      if (!safeToDrop) {
        out.push('\n');
        pendingSpace = false;
        pendingNewline = false;
        return;
      }
    }
    if (pendingSpace) {
      const needSpace =
        (isIdentChar(prevChar) && isIdentChar(nextChar)) ||
        (prevChar === '+' && nextChar === '+') ||
        (prevChar === '-' && nextChar === '-') ||
        (prevChar === '/' && nextChar === '/') ||
        (prevChar === '/' && nextChar === '*');
      if (needSpace) out.push(' ');
    }
    pendingSpace = false;
    pendingNewline = false;
  };

  const readTemplate = () => {
    let token = '`';
    i += 1;
    while (i < input.length) {
      const ch = input[i];
      token += ch;
      if (ch === '\\' && i + 1 < input.length) { token += input[++i]; i += 1; continue; }
      if (ch === '`') { i += 1; break; }
      if (ch === '$' && input[i + 1] === '{') {
        token += '{';
        i += 2;
        let depth = 1;
        while (i < input.length && depth > 0) {
          const c = input[i];
          if (c === '"' || c === "'") {
            const q = c;
            token += c;
            i += 1;
            while (i < input.length) {
              token += input[i];
              if (input[i] === '\\' && i + 1 < input.length) { token += input[++i]; i += 1; continue; }
              if (input[i] === q) { i += 1; break; }
              i += 1;
            }
            continue;
          }
          if (c === '`') { token += readTemplate(); continue; }
          if (c === '{') depth += 1;
          else if (c === '}') depth -= 1;
          token += c;
          i += 1;
        }
        continue;
      }
      i += 1;
    }
    return token;
  };

  while (i < input.length) {
    const ch = input[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v') {
      pendingSpace = true;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      pendingNewline = true;
      pendingSpace = true;
      i += 1;
      continue;
    }

    // Comments
    if (ch === '/' && input[i + 1] === '/') {
      const nl = input.indexOf('\n', i + 2);
      i = nl < 0 ? input.length : nl;
      pendingNewline = true;
      pendingSpace = true;
      continue;
    }
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      const comment = end < 0 ? input.slice(i) : input.slice(i, end + 2);
      if (comment.startsWith('/*!')) {
        if (out.length && out[out.length - 1] !== '\n') out.push('\n');
        out.push(comment, '\n');
        pendingSpace = false;
        pendingNewline = false;
      } else {
        pendingSpace = true;
        if (comment.includes('\n')) pendingNewline = true;
      }
      i = end < 0 ? input.length : end + 2;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      emitGap(ch);
      const quote = ch;
      let str = ch;
      i += 1;
      while (i < input.length) {
        const c = input[i];
        str += c;
        if (c === '\\' && i + 1 < input.length) { str += input[++i]; i += 1; continue; }
        if (c === quote) { i += 1; break; }
        i += 1;
      }
      out.push(str);
      lastToken = str;
      lastWord = '';
      continue;
    }

    // Template literal
    if (ch === '`') {
      emitGap('`');
      const tpl = readTemplate();
      out.push(tpl);
      lastToken = tpl;
      lastWord = '';
      continue;
    }

    // Regex literal
    if (ch === '/' && canStartRegex()) {
      emitGap('/');
      let reg = '/';
      i += 1;
      let inClass = false;
      while (i < input.length) {
        const c = input[i];
        reg += c;
        if (c === '\\' && i + 1 < input.length) { reg += input[++i]; i += 1; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i += 1; break; }
        i += 1;
      }
      while (i < input.length && /[a-z]/i.test(input[i])) reg += input[i++];
      out.push(reg);
      lastToken = reg;
      lastWord = '';
      continue;
    }

    // Identifier / number
    if (isIdentChar(ch)) {
      emitGap(ch);
      const start = i;
      while (i < input.length && isIdentChar(input[i])) i += 1;
      const word = input.slice(start, i);
      out.push(word);
      lastToken = word;
      lastWord = word;
      continue;
    }

    // Punctuation
    emitGap(ch);
    out.push(ch);
    lastToken = ch;
    lastWord = '';
    i += 1;
  }

  return out.join('').trim();
}

// Lightweight local ESM bundler for EdgePress core control scripts.
// Inlines static local ES module imports while preserving dynamic import() specifiers as external.
export function bundleLocalEsm(entryPath, sourceByPath) {
  const visited = new Set();
  const order = [];
  const moduleInfo = new Map();

  function resolveTarget(specifier, importer) {
    const clean = specifier.split(/[?#]/, 1)[0];
    if (/^(?:[a-z]+:|\/\/)/i.test(clean)) return null;
    const target = clean.startsWith('/')
      ? clean.slice(1)
      : posix.normalize(posix.join(posix.dirname(importer), clean));
    return sourceByPath.has(target) ? target : null;
  }

  function analyze(modPath) {
    if (visited.has(modPath)) return;
    visited.add(modPath);
    const item = sourceByPath.get(modPath);
    if (!item?.content) return;
    const raw = item.content.toString('utf8');
    const imports = [];
    // Parse static import statements at top level
    const importRe = /(?:^|\n)[ \t]*import\s+(?:(?:\*\s+as\s+([A-Za-z_$][\w$]*)|\{([^}]*)\}|([A-Za-z_$][\w$]*))\s+from\s+)?(['"])([^'"]+)\4\s*;?/g;
    let stripped = raw.replace(importRe, (full, nsName, namedList, defaultName, _q, specifier) => {
      const target = resolveTarget(specifier, modPath);
      if (!target) return full;
      imports.push({ target, nsName, namedList, defaultName });
      return '';
    });
    for (const imp of imports) analyze(imp.target);
    moduleInfo.set(modPath, { raw, stripped, imports });
    order.push(modPath);
  }

  analyze(entryPath);

  const chunks = [];
  for (const modPath of order) {
    const info = moduleInfo.get(modPath);
    if (!info) continue;
    let code = info.stripped;
    // Rewrite remaining dynamic import('...') relative paths to absolute '/...'
    code = code.replace(/(\b(?:import\s*\(\s*|new\s+URL\s*\(\s*))(['"])([^'"]+)\2/g, (match, prefix, quote, specifier) => {
      const target = resolveTarget(specifier, modPath);
      if (!target) return match;
      return prefix + quote + '/' + target + quote;
    });

    if (modPath !== entryPath) {
      // Collect exported identifiers so entry/sibling modules can import them from this IIFE
      const exportsList = [];
      code = code
        .replace(/\bexport\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/g, (_m, asyncKw, name) => {
          exportsList.push(name);
          return (asyncKw || '') + 'function ' + name;
        })
        .replace(/\bexport\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_m, decl, name) => {
          exportsList.push(name);
          return decl + ' ' + name;
        })
        .replace(/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, (_m, name) => {
          exportsList.push(name);
          return 'class ' + name;
        })
        .replace(/\bexport\s*\{([^}]+)\}\s*;?/g, (_m, names) => {
          for (const part of names.split(',')) {
            const t = part.trim();
            if (!t) continue;
            const [local, alias] = t.split(/\s+as\s+/);
            exportsList.push((alias || local).trim() + ':' + local.trim());
          }
          return '';
        });

      const id = '__ep_mod_' + order.indexOf(modPath);
      const importDecls = info.imports.map((imp) => {
        const depId = '__ep_mod_' + order.indexOf(imp.target);
        if (imp.namedList) {
          const bindings = imp.namedList.split(',').map(p => p.trim()).filter(Boolean)
            .map(p => p.replace(/\s+as\s+/, ':')).join(',');
          return 'const {' + bindings + '}=' + depId + ';';
        }
        if (imp.nsName) return 'const ' + imp.nsName + '=' + depId + ';';
        if (imp.defaultName) return 'const ' + imp.defaultName + '=' + depId + '.default;';
        return '';
      }).join('');
      const ret = exportsList.length ? 'return {' + exportsList.join(',') + '};' : '';
      chunks.push('const ' + id + '=(()=>{' + importDecls + '\n' + code + '\n' + ret + '})();');
    } else {
      const importDecls = info.imports.map((imp) => {
        const depId = '__ep_mod_' + order.indexOf(imp.target);
        if (imp.namedList) {
          const bindings = imp.namedList.split(',').map(p => p.trim()).filter(Boolean)
            .map(p => p.replace(/\s+as\s+/, ':')).join(',');
          return 'const {' + bindings + '}=' + depId + ';';
        }
        if (imp.nsName) return 'const ' + imp.nsName + '=' + depId + ';';
        if (imp.defaultName) return 'const ' + imp.defaultName + '=' + depId + '.default;';
        return '';
      }).join('');
      chunks.push(importDecls + '\n' + code);
    }
  }
  return minifyJs(chunks.join('\n'));
}
