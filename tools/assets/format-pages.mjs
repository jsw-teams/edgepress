import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, parseDocument } from 'yaml';

// YAML flow collections expose the actual page → row → cell → element tree.
function collection(value, indent, role = '') {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every(item => item === null || typeof item !== 'object')) return '[' + value.map(item => JSON.stringify(item)).join(', ') + ']';
    const comments = { page: '页面 / page（行 / rows）', cells: '行 / row（单元格 / cells），个数等于 columns', cell: '单元格 / cell（元素 / elements），按顺序显示' };
    const comment = comments[role] ? ' # ' + comments[role] : '';
    const children = value.map(item => pad + '  ' + collection(item, indent + 2, role === 'cells' ? 'cell' : '')).join(',\n');
    return '[' + comment + '\n' + children + '\n' + pad + ']';
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return '{\n' + entries.map(([key, item]) => pad + '  ' + (/^[a-zA-Z][\w-]*$/.test(key) ? key : JSON.stringify(key)) + ': ' + collection(item, indent + 2, key === 'cells' ? 'cells' : '')).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(value);
}

export function formatPageSource(source) {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(source);
  if (!match) return source;
  const doc = parseDocument(match[2]);
  if (doc.errors.length) throw doc.errors[0];
  const data = doc.toJS();
  if (!Array.isArray(data.blocks)) return source;
  const pairIndex = doc.contents.items.findIndex(pair => pair.key.value === 'blocks');
  const pair = doc.contents.items[pairIndex];
  const next = doc.contents.items[pairIndex + 1];
  const start = match[2].lastIndexOf('\n', pair.key.range[0]) + 1;
  const end = next ? match[2].lastIndexOf('\n', next.key.range[0]) + 1 : match[2].length;
  const frontMatter = match[2].slice(0, start) + 'blocks: ' + collection(data.blocks, 0, 'page') + (next ? '\n' : '') + match[2].slice(end);
  assert.deepEqual(parse(frontMatter), data, 'Page formatting must preserve every field and element order');
  return match[1] + frontMatter + match[3] + source.slice(match[0].length);
}

export async function formatPages(siteRoot, { write = false } = {}) {
  const changes = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.md')) {
        const before = await readFile(path, 'utf8'), after = formatPageSource(before);
        if (before !== after) {
          changes.push(path);
          if (write) await writeFile(path, after);
        }
      }
    }
  }
  await visit(resolve(siteRoot, 'content/pages'));
  return changes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write')) throw new Error('Usage: format-pages.mjs [--write], from a site root');
  const changes = await formatPages(process.cwd(), { write: args.includes('--write') });
  console.log(`${args.includes('--write') ? 'Formatted' : 'Would format'} ${changes.length} Pages documents without changing their values.`);
}
