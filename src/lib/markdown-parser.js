// Zero-dependency CommonMark + GFM Markdown renderer for EdgePress.
import { parseEmbed } from '../embed.js';
import { parseDocument } from '../document.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

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

function normalizeRefLabel(label) {
  return String(label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function unescapeBackslash(text) {
  return text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}

function extractLinkDefinitions(lines) {
  const defs = new Map();
  const kept = [];
  let inFence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) inFence = { char: fence[1][0], len: fence[1].length };
      else if (fence[1][0] === inFence.char && fence[1].length >= inFence.len && !line.slice(fence[0].length).trim()) inFence = null;
      kept.push(line);
      continue;
    }
    if (inFence) { kept.push(line); continue; }
    const def = line.match(/^ {0,3}\[([^\]]+)\]:[ \t]*(\S+)(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/);
    if (def) {
      const label = normalizeRefLabel(def[1]);
      let url = def[2];
      if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
      const title = def[3] ?? def[4] ?? def[5] ?? '';
      if (!defs.has(label)) defs.set(label, { href: unescapeBackslash(url), title: unescapeBackslash(title) });
      continue;
    }
    kept.push(line);
  }
  return { defs, lines: kept };
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return null;
  const cells = splitTableRow(trimmed);
  if (!cells.length) return null;
  const aligns = [];
  for (const cell of cells) {
    const t = cell.trim();
    if (!/^:?-{1,}:?$/.test(t)) return null;
    if (t.startsWith(':') && t.endsWith(':')) aligns.push('center');
    else if (t.endsWith(':')) aligns.push('right');
    else if (t.startsWith(':')) aligns.push('left');
    else aligns.push('');
  }
  return aligns;
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { current += '|'; i += 1; continue; }
    if (ch === '`') { inCode = !inCode; current += ch; continue; }
    if (ch === '|' && !inCode) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isThematicBreak(line) {
  return /^ {0,3}(?:(\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/.test(line);
}

function isSetextUnderline(line) {
  const m = line.match(/^ {0,3}(=+|-+)[ \t]*$/);
  return m ? (m[1][0] === '=' ? 1 : 2) : 0;
}

function isBlockStart(line, nextLine) {
  if (!line.trim()) return true;
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) return true;
  if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
  if (isThematicBreak(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  if (/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/.test(line)) return true;
  if (/^ {0,3}!(?:embed|document)\[/.test(line)) return true;
  if (nextLine !== undefined && line.includes('|') && isTableSeparator(nextLine)) return true;
  return false;
}

function parseLinkDestination(str, start) {
  // Expects str[start] === '('
  let i = start + 1;
  while (i < str.length && (str[i] === ' ' || str[i] === '\t')) i += 1;
  let href = '';
  if (str[i] === '<') {
    i += 1;
    const hStart = i;
    while (i < str.length && str[i] !== '>' && str[i] !== '\n') i += 1;
    if (str[i] !== '>') return null;
    href = str.slice(hStart, i);
    i += 1;
  } else {
    let depth = 0;
    const hStart = i;
    while (i < str.length) {
      const ch = str[i];
      if (ch === '\\' && i + 1 < str.length) { i += 2; continue; }
      if (ch === '(') { depth += 1; i += 1; continue; }
      if (ch === ')') {
        if (depth === 0) break;
        depth -= 1;
        i += 1;
        continue;
      }
      if (/\s/.test(ch)) break;
      i += 1;
    }
    href = str.slice(hStart, i);
  }
  while (i < str.length && /\s/.test(str[i])) i += 1;
  let title = '';
  if (str[i] === '"' || str[i] === "'" || str[i] === '(') {
    const close = str[i] === '(' ? ')' : str[i];
    i += 1;
    const tStart = i;
    while (i < str.length && str[i] !== close) {
      if (str[i] === '\\' && i + 1 < str.length) i += 2;
      else i += 1;
    }
    if (str[i] !== close) return null;
    title = str.slice(tStart, i);
    i += 1;
    while (i < str.length && /\s/.test(str[i])) i += 1;
  }
  if (str[i] !== ')') return null;
  return { href: unescapeBackslash(href), title: unescapeBackslash(title), end: i + 1 };
}

function findMatchingBracket(str, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '\\') { i += 1; continue; }
    if (ch === '`') {
      let len = 0;
      while (str[i + len] === '`') len += 1;
      const close = str.indexOf('`'.repeat(len), i + len);
      if (close >= 0) { i = close + len - 1; continue; }
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function renderInline(text, defs, options) {
  const gfm = options.gfm !== false;
  const breaks = options.breaks === true;
  let out = '';
  let i = 0;
  const s = String(text ?? '');

  const emitImage = (alt, rawHref, title) => {
    const mimeType = videoMimeType(rawHref);
    if (mimeType) {
      const description = String(alt ?? '').trim();
      if (!description) throw new Error('Markdown videos need descriptive alternative text');
      const href = escapeAttr(safeVideoHref(rawHref));
      if (options.allowVideo === false) return '<span>' + escapeHtml(description) + '</span>';
      const caption = title ? '<figcaption>' + escapeHtml(title) + '</figcaption>' : '';
      return '<figure class="markdown-video"><video data-edgepress-video controls playsinline preload="none" aria-label="' +
        escapeAttr(description) + '"><source src="' + href + '" type="' + mimeType + '"><a href="' + href + '">' +
        escapeHtml(description) + '</a></video>' + caption + '</figure>';
    }
    if (options.allowImages === false) return '<span>' + escapeHtml(alt || '') + '</span>';
    let href = rawHref;
    if (options.imageResolver) {
      href = options.imageResolver(href);
      if (!href) return '<span>' + escapeHtml(alt || '') + '</span>';
    }
    const titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
    return '<img src="' + escapeAttr(href) + '" alt="' + escapeAttr(alt || '') + '"' + titleAttr + '>';
  };

  const emitLink = (labelHtml, rawHref, title) => {
    const href = options.linkResolver ? options.linkResolver(rawHref) : rawHref;
    const titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
    return '<a href="' + escapeAttr(href) + '"' + titleAttr + '>' + labelHtml + '</a>';
  };

  while (i < s.length) {
    // Hard line breaks
    if (s[i] === '\\' && s[i + 1] === '\n') {
      out += '<br>\n';
      i += 2;
      continue;
    }
    if (s[i] === ' ' && s[i + 1] === ' ') {
      const m = s.slice(i).match(/^ {2,}\n/);
      if (m) {
        out += '<br>\n';
        i += m[0].length;
        continue;
      }
    }
    if (s[i] === '\n') {
      out += breaks ? '<br>\n' : '\n';
      i += 1;
      continue;
    }

    // Backslash escape
    if (s[i] === '\\' && i + 1 < s.length && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(s[i + 1])) {
      out += escapeHtml(s[i + 1]);
      i += 2;
      continue;
    }

    // Inline code span
    if (s[i] === '`') {
      let ticks = 0;
      while (s[i + ticks] === '`') ticks += 1;
      let j = i + ticks;
      let close = -1;
      while (j < s.length) {
        if (s[j] === '`') {
          let count = 0;
          while (s[j + count] === '`') count += 1;
          if (count === ticks) { close = j; break; }
          j += count;
          continue;
        }
        j += 1;
      }
      if (close >= 0) {
        let code = s.slice(i + ticks, close).replace(/\n/g, ' ');
        if (code.length >= 2 && code.startsWith(' ') && code.endsWith(' ') && /[^ ]/.test(code)) {
          code = code.slice(1, -1);
        }
        out += '<code>' + escapeHtml(code) + '</code>';
        i = close + ticks;
        continue;
      }
      out += '`'.repeat(ticks);
      i += ticks;
      continue;
    }

    // Autolink <https://...> or <email@example.com> or raw HTML tag
    if (s[i] === '<') {
      const autoUrl = s.slice(i).match(/^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/);
      if (autoUrl) {
        out += emitLink(escapeHtml(autoUrl[1]), autoUrl[1], '');
        i += autoUrl[0].length;
        continue;
      }
      const autoMail = s.slice(i).match(/^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)>/);
      if (autoMail) {
        out += emitLink(escapeHtml(autoMail[1]), 'mailto:' + autoMail[1], '');
        i += autoMail[0].length;
        continue;
      }
      // HTML comment or tag pass-through (sanitizer handles security afterward)
      const htmlComment = s.slice(i).match(/^<!--[\s\S]*?-->/);
      if (htmlComment) { out += htmlComment[0]; i += htmlComment[0].length; continue; }
      const htmlTag = s.slice(i).match(/^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*)?\/?>/);
      if (htmlTag) { out += htmlTag[0]; i += htmlTag[0].length; continue; }
      out += '&lt;';
      i += 1;
      continue;
    }

    // HTML entity pass-through
    if (s[i] === '&') {
      const ent = s.slice(i).match(/^&(?:#x[\da-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/);
      if (ent) { out += ent[0]; i += ent[0].length; continue; }
      out += '&amp;';
      i += 1;
      continue;
    }

    // Image ![alt](...) or ![alt][ref]
    if (s[i] === '!' && s[i + 1] === '[') {
      const closeBracket = findMatchingBracket(s, i + 1);
      if (closeBracket > 0) {
        const alt = s.slice(i + 2, closeBracket);
        if (s[closeBracket + 1] === '(') {
          const dest = parseLinkDestination(s, closeBracket + 1);
          if (dest) {
            out += emitImage(alt, dest.href, dest.title);
            i = dest.end;
            continue;
          }
        } else if (s[closeBracket + 1] === '[') {
          const closeRef = findMatchingBracket(s, closeBracket + 1);
          if (closeRef > 0) {
            const refKey = normalizeRefLabel(s.slice(closeBracket + 2, closeRef) || alt);
            const def = defs.get(refKey);
            if (def) {
              out += emitImage(alt, def.href, def.title);
              i = closeRef + 1;
              continue;
            }
          }
        } else {
          const def = defs.get(normalizeRefLabel(alt));
          if (def) {
            out += emitImage(alt, def.href, def.title);
            i = closeBracket + 1;
            continue;
          }
        }
      }
    }

    // Link [text](...) or [text][ref]
    if (s[i] === '[') {
      const closeBracket = findMatchingBracket(s, i);
      if (closeBracket > 0) {
        const label = s.slice(i + 1, closeBracket);
        if (s[closeBracket + 1] === '(') {
          const dest = parseLinkDestination(s, closeBracket + 1);
          if (dest) {
            out += emitLink(renderInline(label, defs, options), dest.href, dest.title);
            i = dest.end;
            continue;
          }
        } else if (s[closeBracket + 1] === '[') {
          const closeRef = findMatchingBracket(s, closeBracket + 1);
          if (closeRef > 0) {
            const refKey = normalizeRefLabel(s.slice(closeBracket + 2, closeRef) || label);
            const def = defs.get(refKey);
            if (def) {
              out += emitLink(renderInline(label, defs, options), def.href, def.title);
              i = closeRef + 1;
              continue;
            }
          }
        } else {
          const def = defs.get(normalizeRefLabel(label));
          if (def) {
            out += emitLink(renderInline(label, defs, options), def.href, def.title);
            i = closeBracket + 1;
            continue;
          }
        }
      }
    }

    // GFM Strikethrough ~~text~~
    if (gfm && s[i] === '~' && s[i + 1] === '~' && s[i + 2] !== '~') {
      const close = s.indexOf('~~', i + 2);
      if (close > i + 2 && !/^\s/.test(s[i + 2]) && !/\s$/.test(s.slice(i + 2, close))) {
        out += '<del>' + renderInline(s.slice(i + 2, close), defs, options) + '</del>';
        i = close + 2;
        continue;
      }
    }

    // Strong + Emphasis (*** / ___)
    if ((s[i] === '*' && s[i + 1] === '*' && s[i + 2] === '*') || (s[i] === '_' && s[i + 1] === '_' && s[i + 2] === '_')) {
      const mark = s.slice(i, i + 3);
      const close = s.indexOf(mark, i + 3);
      if (close > i + 3 && !/\s/.test(s[i + 3])) {
        out += '<em><strong>' + renderInline(s.slice(i + 3, close), defs, options) + '</strong></em>';
        i = close + 3;
        continue;
      }
    }

    // Strong (** / __), including CJK punctuation boundaries
    if ((s[i] === '*' && s[i + 1] === '*') || (s[i] === '_' && s[i + 1] === '_')) {
      const ch = s[i];
      const prev = s[i - 1] || '';
      const intrawordUnderscore = ch === '_' && /[A-Za-z0-9]/.test(prev);
      if (!intrawordUnderscore && s[i + 2] && !/\s/.test(s[i + 2])) {
        let close = -1;
        let search = i + 2;
        while ((search = s.indexOf(ch + ch, search)) >= 0) {
          if (s[search - 1] === '\\') { search += 2; continue; }
          if (s[search + 2] === ch) { search += 1; continue; }
          const inner = s.slice(i + 2, search);
          if (!inner || /\s$/.test(inner)) { search += 2; continue; }
          if (ch === '_' && /[A-Za-z0-9]/.test(s[search + 2] || '')) { search += 2; continue; }
          close = search;
          break;
        }
        if (close > i + 2) {
          out += '<strong>' + renderInline(s.slice(i + 2, close), defs, options) + '</strong>';
          i = close + 2;
          continue;
        }
      }
    }

    // Emphasis (* / _)
    if (s[i] === '*' || s[i] === '_') {
      const ch = s[i];
      const prev = s[i - 1] || '';
      const intrawordUnderscore = ch === '_' && /[A-Za-z0-9]/.test(prev);
      if (!intrawordUnderscore && s[i + 1] && !/\s/.test(s[i + 1]) && s[i + 1] !== ch) {
        let close = -1;
        for (let k = i + 1; k < s.length; k += 1) {
          if (s[k] === '\\') { k += 1; continue; }
          if (s[k] === '`') {
            let ticks = 0;
            while (s[k + ticks] === '`') ticks += 1;
            const c = s.indexOf('`'.repeat(ticks), k + ticks);
            if (c >= 0) { k = c + ticks - 1; continue; }
          }
          if (s[k] === ch) {
            if (s[k + 1] === ch) { k += 1; continue; }
            if (/\s/.test(s[k - 1])) continue;
            if (ch === '_' && /[A-Za-z0-9]/.test(s[k + 1] || '')) continue;
            close = k;
            break;
          }
        }
        if (close > i + 1) {
          out += '<em>' + renderInline(s.slice(i + 1, close), defs, options) + '</em>';
          i = close + 1;
          continue;
        }
      }
    }

    // GFM bare autolinks: https://... or www....
    if (gfm && (i === 0 || /[\s(*_~[]/.test(s[i - 1]))) {
      const urlMatch = s.slice(i).match(/^(?:https?:\/\/|www\.)[^\s<]+/);
      if (urlMatch) {
        let raw = urlMatch[0];
        while (/[?!.,:*_~]$/.test(raw)) raw = raw.slice(0, -1);
        if (raw.endsWith(')') && (raw.match(/\)/g) || []).length > (raw.match(/\(/g) || []).length) {
          raw = raw.slice(0, -1);
        }
        const href = raw.startsWith('www.') ? 'http://' + raw : raw;
        out += emitLink(escapeHtml(raw), href, '');
        i += raw.length;
        continue;
      }
    }

    out += s[i] === '>' ? '&gt;' : s[i];
    i += 1;
  }
  return out;
}

function parseBlocks(lines, defs, options) {
  const tokens = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    // Custom !embed[...]
    if (/^ {0,3}!embed\[/i.test(line)) {
      const embed = parseEmbed(line + '\n');
      if (embed) {
        tokens.push({ type: 'embed', ...embed });
        i += 1;
        continue;
      }
    }

    // Custom !document[...]
    if (/^ {0,3}!document\[/i.test(line)) {
      const doc = parseDocument(line + '\n');
      if (doc) {
        tokens.push({ type: 'document', ...doc });
        i += 1;
        continue;
      }
    }

    // ATX Heading
    const atx = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/);
    if (atx && (atx[2] !== undefined || line.trim() === atx[1])) {
      tokens.push({ type: 'heading', depth: atx[1].length, text: (atx[2] || '').replace(/[ \t]+#+[ \t]*$/, '').trim() });
      i += 1;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([^`]*)$/);
    if (fence) {
      const fenceChar = fence[1][0];
      const fenceLen = fence[1].length;
      const lang = fence[2].trim().split(/\s+/)[0] || '';
      const codeLines = [];
      i += 1;
      while (i < lines.length) {
        const close = lines[i].match(new RegExp('^ {0,3}' + fenceChar + '{' + fenceLen + ',}[ \\t]*$'));
        if (close) { i += 1; break; }
        codeLines.push(lines[i]);
        i += 1;
      }
      tokens.push({ type: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    // Indented code block (4 spaces or tab)
    if (/^(?: {4}|\t)/.test(line)) {
      const codeLines = [];
      while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]) || !lines[i].trim())) {
        codeLines.push(lines[i].replace(/^(?: {4}|\t)/, ''));
        i += 1;
      }
      while (codeLines.length && !codeLines[codeLines.length - 1].trim()) codeLines.pop();
      tokens.push({ type: 'code', lang: '', text: codeLines.join('\n') });
      continue;
    }

    // Thematic break
    if (isThematicBreak(line)) {
      tokens.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Blockquote
    if (/^ {0,3}>/.test(line)) {
      const quoteLines = [];
      while (i < lines.length) {
        if (/^ {0,3}>/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^ {0,3}> ?/, ''));
          i += 1;
        } else if (lines[i].trim() && quoteLines.length && quoteLines[quoteLines.length - 1].trim() && !isBlockStart(lines[i], lines[i + 1])) {
          quoteLines.push(lines[i]);
          i += 1;
        } else break;
      }
      tokens.push({ type: 'blockquote', tokens: parseBlocks(quoteLines, defs, options) });
      continue;
    }

    // GFM Table
    if (options.gfm !== false && line.includes('|') && i + 1 < lines.length) {
      const aligns = isTableSeparator(lines[i + 1]);
      if (aligns) {
        const header = splitTableRow(line);
        if (header.length === aligns.length) {
          const rows = [];
          i += 2;
          while (i < lines.length && lines[i].trim() && lines[i].includes('|') && !isBlockStart(lines[i])) {
            const cells = splitTableRow(lines[i]);
            while (cells.length < aligns.length) cells.push('');
            rows.push(cells.slice(0, aligns.length));
            i += 1;
          }
          tokens.push({ type: 'table', header, aligns, rows });
          continue;
        }
      }
    }

    // List (unordered or ordered)
    const listMatch = line.match(/^( {0,3})([-+*]|(\d{1,9})([.)]))[ \t]+(.*)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[3]);
      const startNum = ordered ? Number(listMatch[3]) : 1;
      const delim = ordered ? listMatch[4] : listMatch[2];
      const items = [];
      let loose = false;

      while (i < lines.length) {
        const cur = lines[i];
        const m = cur.match(/^( {0,3})([-+*]|(\d{1,9})([.)]))[ \t]+(.*)$/);
        if (!m) break;
        const curOrdered = Boolean(m[3]);
        const curDelim = curOrdered ? m[4] : m[2];
        if (curOrdered !== ordered || curDelim !== delim) break;
        if (isThematicBreak(cur)) break;

        const contentIndent = m[1].length + m[2].length + 1;
        const itemLines = [m[5]];
        i += 1;
        let sawBlank = false;
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            sawBlank = true;
            itemLines.push('');
            i += 1;
            continue;
          }
          const leadingSpaces = next.match(/^ */)[0].length;
          if (leadingSpaces >= contentIndent || next.startsWith('\t')) {
            if (sawBlank) loose = true;
            sawBlank = false;
            itemLines.push(next.startsWith('\t') ? next.slice(1) : next.slice(contentIndent));
            i += 1;
            continue;
          }
          // Same-level next item or block start ends this item
          if (sawBlank) break;
          if (isBlockStart(next, lines[i + 1])) break;
          itemLines.push(next.trimStart());
          i += 1;
        }
        while (itemLines.length && !itemLines[itemLines.length - 1].trim()) itemLines.pop();
        if (sawBlank && i < lines.length) {
          const peek = lines[i].match(/^( {0,3})([-+*]|(\d{1,9})([.)]))[ \t]+/);
          if (peek && Boolean(peek[3]) === ordered && (peek[4] || peek[2]) === delim) loose = true;
        }
        items.push(itemLines);
      }
      tokens.push({ type: 'list', ordered, start: startNum, loose, items: items.map(linesOfItem => parseListItem(linesOfItem, defs, options)) });
      continue;
    }

    // Raw HTML block (simple top-level block tags / comments)
    if (/^ {0,3}<(?:!--|\/?(?:address|article|aside|details|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|script|section|style|summary|table|tbody|td|tfoot|th|thead|tr|ul|video|template|iframe)\b)/i.test(line)) {
      const htmlLines = [line];
      i += 1;
      while (i < lines.length && lines[i].trim()) {
        htmlLines.push(lines[i]);
        i += 1;
      }
      tokens.push({ type: 'html', text: htmlLines.join('\n') });
      continue;
    }

    // Paragraph (or Setext heading)
    const paraLines = [line];
    i += 1;
    let setextLevel = 0;
    while (i < lines.length && lines[i].trim()) {
      const level = isSetextUnderline(lines[i]);
      if (level) { setextLevel = level; i += 1; break; }
      if (isBlockStart(lines[i], lines[i + 1])) break;
      paraLines.push(lines[i]);
      i += 1;
    }
    const rawText = paraLines.join('\n');
    if (setextLevel) {
      tokens.push({ type: 'heading', depth: setextLevel, text: rawText.trim() });
    } else {
      tokens.push({ type: 'paragraph', raw: rawText, text: rawText });
    }
  }
  return tokens;
}

function parseListItem(itemLines, defs, options) {
  let task = null;
  const copy = [...itemLines];
  if (options.gfm !== false && copy.length) {
    const taskMatch = copy[0].match(/^\[([ xX])\][ \t]+(.*)$/);
    if (taskMatch) {
      task = taskMatch[1].toLowerCase() === 'x';
      copy[0] = taskMatch[2];
    }
  }
  return { task, tokens: parseBlocks(copy, defs, options) };
}

async function renderTokens(tokens, defs, options, tight = false) {
  const parts = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        parts.push('<h' + token.depth + '>' + renderInline(token.text, defs, options) + '</h' + token.depth + '>');
        break;
      case 'hr':
        parts.push('<hr>');
        break;
      case 'code': {
        const cls = token.lang ? ' class="language-' + escapeAttr(token.lang) + '"' : '';
        parts.push('<pre><code' + cls + '>' + escapeHtml(token.text) + '\n</code></pre>');
        break;
      }
      case 'html':
        parts.push(token.text);
        break;
      case 'blockquote':
        parts.push('<blockquote>\n' + await renderTokens(token.tokens, defs, options, false) + '\n</blockquote>');
        break;
      case 'table': {
        const ths = token.header.map((cell, idx) => {
          const align = token.aligns[idx] ? ' align="' + token.aligns[idx] + '"' : '';
          return '<th' + align + '>' + renderInline(cell, defs, options) + '</th>';
        }).join('');
        const trs = token.rows.map(row => '<tr>' + row.map((cell, idx) => {
          const align = token.aligns[idx] ? ' align="' + token.aligns[idx] + '"' : '';
          return '<td' + align + '>' + renderInline(cell, defs, options) + '</td>';
        }).join('') + '</tr>').join('\n');
        parts.push('<table>\n<thead>\n<tr>' + ths + '</tr>\n</thead>\n<tbody>\n' + trs + '\n</tbody>\n</table>');
        break;
      }
      case 'list': {
        const tag = token.ordered ? 'ol' : 'ul';
        const startAttr = token.ordered && token.start !== 1 ? ' start="' + token.start + '"' : '';
        const renderedItems = [];
        for (const item of token.items) {
          let inner = await renderTokens(item.tokens, defs, options, !token.loose);
          if (item.task !== null) {
            const box = '<input' + (item.task ? ' checked=""' : '') + ' disabled="" type="checkbox"> ';
            if (inner.startsWith('<p>')) inner = '<p>' + box + inner.slice(3);
            else inner = box + inner;
          }
          renderedItems.push('<li>' + inner + '</li>');
        }
        parts.push('<' + tag + startAttr + '>\n' + renderedItems.join('\n') + '\n</' + tag + '>');
        break;
      }
      case 'paragraph': {
        const html = renderInline(token.text, defs, options);
        parts.push(tight ? html : '<p>' + html + '</p>');
        break;
      }
      case 'embed':
        if (options.embedRenderer) parts.push(await options.embedRenderer(token));
        break;
      case 'document':
        parts.push(options.documentRenderer ? options.documentRenderer(token) : '<p>' + escapeHtml(token.title) + '</p>');
        break;
    }
  }
  return parts.join('\n');
}

export function lexMarkdown(source, options = {}) {
  const rawLines = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const { defs, lines } = extractLinkDefinitions(rawLines);
  const tokens = parseBlocks(lines, defs, options);
  return { tokens, defs };
}

export async function parseMarkdownAsync(source, options = {}) {
  const { tokens, defs } = lexMarkdown(source, options);
  return renderTokens(tokens, defs, options, false);
}

export function parseMarkdownSync(source, options = {}) {
  const { tokens, defs } = lexMarkdown(source, options);
  // Sync rendering (used for plainText)
  const renderSync = (list, tight = false) => list.map(token => {
    if (token.type === 'heading') return '<h' + token.depth + '>' + renderInline(token.text, defs, options) + '</h' + token.depth + '>';
    if (token.type === 'paragraph') return tight ? renderInline(token.text, defs, options) : '<p>' + renderInline(token.text, defs, options) + '</p>';
    if (token.type === 'code') return '<pre><code>' + escapeHtml(token.text) + '</code></pre>';
    if (token.type === 'blockquote') return '<blockquote>' + renderSync(token.tokens) + '</blockquote>';
    if (token.type === 'list') return '<ul>' + token.items.map(it => '<li>' + renderSync(it.tokens, !token.loose) + '</li>').join('') + '</ul>';
    if (token.type === 'table') return '<table><tr>' + token.header.map(c => '<th>' + renderInline(c, defs, options) + '</th>').join('') + '</tr>' + token.rows.map(r => '<tr>' + r.map(c => '<td>' + renderInline(c, defs, options) + '</td>').join('') + '</tr>').join('') + '</table>';
    if (token.type === 'html') return token.text;
    if (token.type === 'document') return '<p>' + escapeHtml(token.title) + '</p>';
    return '';
  }).join('\n');
  return renderSync(tokens, false);
}

export function containsMarkdownVideo(source) {
  const { tokens, defs } = lexMarkdown(source);
  const pattern = /!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))|!\[[^\]]*\]\[([^\]]*)\]/g;
  const checkText = (txt) => {
    for (const m of String(txt || '').matchAll(pattern)) {
      const href = m[1] || m[2] || defs.get(normalizeRefLabel(m[3]))?.href || '';
      if (videoMimeType(href)) return true;
    }
    return false;
  };
  const walk = (list) => {
    for (const token of list) {
      if (token.text && checkText(token.text)) return true;
      if (token.tokens && walk(token.tokens)) return true;
      if (token.items && token.items.some(item => walk(item.tokens))) return true;
      if (token.header && token.header.some(checkText)) return true;
      if (token.rows && token.rows.some(row => row.some(checkText))) return true;
    }
    return false;
  };
  return walk(tokens);
}
