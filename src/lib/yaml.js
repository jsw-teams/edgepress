// Zero-dependency YAML 1.2 parser & serializer for EdgePress config and front matter.

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i += 1; continue; }
      if (quote === "'" && ch === "'" && line[i + 1] === "'") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line.trimEnd();
}

function parseDoubleQuoted(text) {
  let out = '';
  for (let i = 1; i < text.length - 1; i += 1) {
    const ch = text[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = text[++i];
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case '\\': out += '\\'; break;
      case '"': out += '"'; break;
      case '/': out += '/'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '0': out += '\0'; break;
      case 'x': {
        const hex = text.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error('Invalid \\x escape in YAML string');
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2;
        break;
      }
      case 'u': {
        const hex = text.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('Invalid \\u escape in YAML string');
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
        break;
      }
      case 'U': {
        const hex = text.slice(i + 1, i + 9);
        if (!/^[0-9a-fA-F]{8}$/.test(hex)) throw new Error('Invalid \\U escape in YAML string');
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 8;
        break;
      }
      default:
        out += next ?? '';
    }
  }
  return out;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) throw new Error('Unterminated double-quoted string in YAML');
    return parseDoubleQuoted(s);
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) throw new Error('Unterminated single-quoted string in YAML');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s === 'null' || s === 'Null' || s === 'NULL' || s === '~') return null;
  if (s === 'true' || s === 'True' || s === 'TRUE') return true;
  if (s === 'false' || s === 'False' || s === 'FALSE') return false;
  if (/^-?(?:0|[1-9][0-9]*)$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^-?(?:0|[1-9][0-9]*)\.[0-9]+(?:[eE][+-]?[0-9]+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  return s;
}

function findUnquotedColon(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i += 1; continue; }
      if (quote === "'" && ch === "'" && text[i + 1] === "'") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '{') { depth += 1; continue; }
    if (ch === ']' || ch === '}') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && ch === ':' && (i + 1 === text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) {
      return i;
    }
  }
  return -1;
}

function splitFlow(text) {
  const parts = [];
  let start = 0;
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i += 1; continue; }
      if (quote === "'" && ch === "'" && text[i + 1] === "'") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '{') { depth += 1; continue; }
    if (ch === ']' || ch === '}') { depth -= 1; continue; }
    if (depth === 0 && ch === ',') {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0 || quote) throw new Error('Unclosed flow collection in YAML');
  parts.push(text.slice(start));
  return parts;
}

function parseFlow(text, ctx) {
  const s = text.trim();
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) throw new Error('Unclosed flow sequence in YAML');
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    const items = splitFlow(inner);
    const out = [];
    for (let i = 0; i < items.length; i += 1) {
      const part = items[i].trim();
      if (!part && i === items.length - 1) continue;
      out.push(parseFlow(part, ctx));
    }
    return out;
  }
  if (s.startsWith('{')) {
    if (!s.endsWith('}')) throw new Error('Unclosed flow mapping in YAML');
    const inner = s.slice(1, -1).trim();
    if (!inner) return {};
    const out = {};
    const items = splitFlow(inner);
    for (let i = 0; i < items.length; i += 1) {
      const part = items[i].trim();
      if (!part && i === items.length - 1) continue;
      const colon = findUnquotedColon(part);
      if (colon < 0) throw new Error('Invalid flow mapping entry in YAML: ' + part);
      const key = String(parseScalar(part.slice(0, colon)));
      if (ctx.uniqueKeys && Object.prototype.hasOwnProperty.call(out, key)) {
        throw new Error('Duplicate YAML key: ' + key);
      }
      const val = part.slice(colon + 1).trim();
      out[key] = val ? parseFlow(val, ctx) : null;
    }
    return out;
  }
  if (s.startsWith('*')) return resolveAlias(s.slice(1), ctx);
  const anchorMatch = s.match(/^&([A-Za-z0-9_-]+)\s+([\s\S]+)$/);
  if (anchorMatch) {
    const val = parseFlow(anchorMatch[2], ctx);
    ctx.anchors.set(anchorMatch[1], val);
    return val;
  }
  return parseScalar(s);
}

function resolveAlias(name, ctx) {
  ctx.aliasCount += 1;
  if (ctx.aliasCount > ctx.maxAliasCount) throw new Error('YAML alias count exceeds limit');
  if (!ctx.anchors.has(name)) throw new Error('Unknown YAML alias: *' + name);
  return structuredClone(ctx.anchors.get(name));
}

function indentOf(line) {
  let n = 0;
  while (n < line.length && line[n] === ' ') n += 1;
  if (line[n] === '\t') throw new Error('Tabs are not allowed for YAML indentation');
  return n;
}

export function parse(source, options = {}) {
  const ctx = {
    uniqueKeys: options.uniqueKeys === true,
    maxAliasCount: options.maxAliasCount ?? 25,
    aliasCount: 0,
    anchors: new Map()
  };
  const rawLines = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = rawLines.map((raw, index) => ({
    raw,
    clean: stripComment(raw),
    indent: raw.trim() ? indentOf(raw) : -1,
    index
  }));

  let pos = 0;
  function skipBlank() {
    while (pos < lines.length) {
      const t = lines[pos].clean.trim();
      if (!t || t === '---' || t === '...') pos += 1;
      else break;
    }
  }

  function readBlockScalar(header, parentIndent) {
    const style = header[0]; // '|' or '>'
    const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
    const explicitIndent = header.match(/[1-9]/)?.[0];
    const collected = [];
    let blockIndent = explicitIndent ? parentIndent + Number(explicitIndent) : null;
    while (pos < lines.length) {
      const raw = lines[pos].raw;
      if (raw.trim() === '') {
        collected.push('');
        pos += 1;
        continue;
      }
      const ind = indentOf(raw);
      if (ind <= parentIndent) break;
      if (blockIndent === null) blockIndent = ind;
      if (ind < blockIndent) break;
      collected.push(raw.slice(blockIndent));
      pos += 1;
    }
    let trailing = 0;
    while (collected.length && collected[collected.length - 1] === '') {
      collected.pop();
      trailing += 1;
    }
    let result;
    if (style === '|') {
      result = collected.join('\n');
    } else {
      result = '';
      for (let i = 0; i < collected.length; i += 1) {
        const line = collected[i];
        if (i === 0) { result = line; continue; }
        if (line === '' || collected[i - 1] === '' || /^\s/.test(line) || /^\s/.test(collected[i - 1])) {
          result += '\n' + line;
        } else {
          result += ' ' + line;
        }
      }
    }
    if (chomp === 'strip') return result;
    if (chomp === 'keep') return result + '\n'.repeat(trailing + (collected.length ? 1 : 0));
    return collected.length ? result + '\n' : '';
  }

  function readContinuationLines(firstText, minIndent) {
    let text = firstText;
    // Handle multi-line flow collections or plain scalars
    let quote = null;
    let flowDepth = 0;
    const scan = (str, isStart = false) => {
      for (let i = 0; i < str.length; i += 1) {
        const ch = str[i];
        if (quote) {
          if (quote === '"' && ch === '\\') { i += 1; continue; }
          if (quote === "'" && ch === "'" && str[i + 1] === "'") { i += 1; continue; }
          if (ch === quote) quote = null;
          continue;
        }
        if ((ch === '"' || ch === "'") && ((isStart && i === 0) || flowDepth > 0)) quote = ch;
        else if (ch === '[' || ch === '{') { if (isStart && i === 0 || flowDepth > 0) flowDepth += 1; }
        else if (ch === ']' || ch === '}') { if (flowDepth > 0) flowDepth -= 1; }
      }
    };
    scan(text, true);
    while (pos < lines.length) {
      const next = lines[pos];
      const trimmed = next.clean.trim();
      if (!trimmed) {
        if (flowDepth > 0 || quote) { pos += 1; continue; }
        // Peek ahead for multi-line plain scalar continuation
        let look = pos + 1;
        while (look < lines.length && !lines[look].clean.trim()) look += 1;
        if (look < lines.length && lines[look].indent > minIndent &&
            !lines[look].clean.trim().startsWith('- ') &&
            lines[look].clean.trim() !== '-' &&
            findUnquotedColon(lines[look].clean.trim()) < 0) {
          text += '\n';
          pos = look;
          continue;
        }
        break;
      }
      if (flowDepth > 0 || quote) {
        text += ' ' + trimmed;
        scan(trimmed);
        pos += 1;
        continue;
      }
      if (next.indent > minIndent && !trimmed.startsWith('- ') && trimmed !== '-' && findUnquotedColon(trimmed) < 0) {
        text += ' ' + trimmed;
        pos += 1;
        continue;
      }
      break;
    }
    return text;
  }

  function parseValue(inlineText, parentIndent) {
    const trimmed = inlineText.trim();
    if (!trimmed) {
      skipBlank();
      if (pos >= lines.length || lines[pos].indent <= parentIndent) {
        // Sequence directly indented at same level as key (standard YAML allows seq at parentIndent)
        if (pos < lines.length && lines[pos].indent === parentIndent) {
          const t = lines[pos].clean.trim();
          if (t === '-' || t.startsWith('- ')) return parseBlock(parentIndent);
        }
        return null;
      }
      return parseBlock(lines[pos].indent);
    }
    const anchorOnly = trimmed.match(/^&([A-Za-z0-9_-]+)$/);
    if (anchorOnly) {
      const val = parseValue('', parentIndent);
      ctx.anchors.set(anchorOnly[1], val);
      return val;
    }
    const anchorInline = trimmed.match(/^&([A-Za-z0-9_-]+)\s+([\s\S]+)$/);
    if (anchorInline) {
      const val = parseValue(anchorInline[2], parentIndent);
      ctx.anchors.set(anchorInline[1], val);
      return val;
    }
    if (/^[|>][+-]?[1-9]?[+-]?$/.test(trimmed)) {
      return readBlockScalar(trimmed, parentIndent);
    }
    if (trimmed.startsWith('*')) {
      return resolveAlias(trimmed.slice(1), ctx);
    }
    const full = readContinuationLines(trimmed, parentIndent);
    if (full.startsWith('[') || full.startsWith('{')) return parseFlow(full, ctx);
    return parseScalar(full);
  }

  function parseSequence(baseIndent) {
    const list = [];
    while (pos < lines.length) {
      skipBlank();
      if (pos >= lines.length) break;
      const line = lines[pos];
      if (line.indent < baseIndent) break;
      if (line.indent > baseIndent) throw new Error('Unexpected indentation in YAML sequence at line ' + (line.index + 1));
      const trimmed = line.clean.trim();
      if (trimmed !== '-' && !trimmed.startsWith('- ')) break;
      pos += 1;
      const rest = trimmed.length > 1 ? trimmed.slice(2) : '';
      const restTrim = rest.trim();
      if (!restTrim) {
        skipBlank();
        if (pos >= lines.length || lines[pos].indent <= baseIndent) {
          list.push(null);
        } else {
          list.push(parseBlock(lines[pos].indent));
        }
        continue;
      }
      // Nested sequence right after '- - ...'
      if (restTrim === '-' || restTrim.startsWith('- ')) {
        const subIndent = baseIndent + 2 + (rest.length - rest.trimStart().length);
        lines.splice(pos, 0, { raw: ' '.repeat(subIndent) + restTrim, clean: ' '.repeat(subIndent) + restTrim, indent: subIndent, index: line.index });
        list.push(parseSequence(subIndent));
        continue;
      }
      // Inline mapping item starting right after '- ':
      const colon = findUnquotedColon(restTrim);
      if (colon >= 0 && !restTrim.startsWith('{') && !restTrim.startsWith('[') && !restTrim.startsWith('"') && !restTrim.startsWith("'")) {
        const itemIndent = baseIndent + 2 + (rest.length - rest.trimStart().length);
        const obj = {};
        const key = String(parseScalar(restTrim.slice(0, colon)));
        const valText = restTrim.slice(colon + 1);
        obj[key] = parseValue(valText, itemIndent);
        // Continue reading sibling keys at itemIndent
        while (pos < lines.length) {
          skipBlank();
          if (pos >= lines.length || lines[pos].indent < itemIndent) break;
          if (lines[pos].indent > itemIndent) throw new Error('Unexpected indentation in YAML mapping item at line ' + (lines[pos].index + 1));
          const sub = lines[pos].clean.trim();
          const subColon = findUnquotedColon(sub);
          if (subColon < 0) break;
          pos += 1;
          const subKey = String(parseScalar(sub.slice(0, subColon)));
          if (ctx.uniqueKeys && Object.prototype.hasOwnProperty.call(obj, subKey)) {
            throw new Error('Duplicate YAML key: ' + subKey);
          }
          obj[subKey] = parseValue(sub.slice(subColon + 1), itemIndent);
        }
        list.push(obj);
        continue;
      }
      list.push(parseValue(restTrim, baseIndent));
    }
    return list;
  }

  function parseMapping(baseIndent) {
    const obj = {};
    while (pos < lines.length) {
      skipBlank();
      if (pos >= lines.length) break;
      const line = lines[pos];
      if (line.indent < baseIndent) break;
      if (line.indent > baseIndent) throw new Error('Unexpected indentation in YAML mapping at line ' + (line.index + 1));
      const trimmed = line.clean.trim();
      if (trimmed === '-' || trimmed.startsWith('- ')) break;
      const colon = findUnquotedColon(trimmed);
      if (colon < 0) throw new Error('Invalid YAML mapping entry at line ' + (line.index + 1) + ': ' + trimmed);
      pos += 1;
      const key = String(parseScalar(trimmed.slice(0, colon)));
      if (ctx.uniqueKeys && Object.prototype.hasOwnProperty.call(obj, key)) {
        throw new Error('Duplicate YAML key: ' + key);
      }
      obj[key] = parseValue(trimmed.slice(colon + 1), baseIndent);
    }
    return obj;
  }

  function parseBlock(baseIndent) {
    skipBlank();
    if (pos >= lines.length) return null;
    const trimmed = lines[pos].clean.trim();
    if (trimmed === '-' || trimmed.startsWith('- ')) return parseSequence(baseIndent);
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      pos += 1;
      return parseFlow(readContinuationLines(trimmed, baseIndent), ctx);
    }
    if (findUnquotedColon(trimmed) >= 0) return parseMapping(baseIndent);
    pos += 1;
    return parseValue(trimmed, baseIndent);
  }

  skipBlank();
  if (pos >= lines.length) return null;
  return parseBlock(lines[pos].indent);
}

function formatScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const s = String(value);
  if (!s || /^[\s#\-?:,\[\]{}&*!|>'"%@`]|[\s:]$|[:#]\s|\n|\r/.test(s) ||
      /^(?:true|false|null|~|yes|no|on|off|-?\d+(?:\.\d+)?)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

export function stringify(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined || typeof value !== 'object') {
    return formatScalar(value) + '\n';
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]\n';
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const inner = stringify(item, indent + 2);
        return pad + '- ' + inner.slice(indent + 2);
      }
      return pad + '- ' + formatScalar(item) + '\n';
    }).join('');
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (!entries.length) return '{}\n';
  return entries.map(([key, val]) => {
    const safeKey = /^[A-Za-z0-9_.-]+$/.test(key) ? key : JSON.stringify(key);
    if (val && typeof val === 'object') {
      if (Array.isArray(val) && !val.length) return pad + safeKey + ': []\n';
      if (!Array.isArray(val) && !Object.keys(val).length) return pad + safeKey + ': {}\n';
      return pad + safeKey + ':\n' + stringify(val, indent + 2);
    }
    return pad + safeKey + ': ' + formatScalar(val) + '\n';
  }).join('');
}
