import assert from 'node:assert/strict';
import {readFile, readdir, writeFile, unlink} from 'node:fs/promises';
import {dirname, extname, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseDocumentSource} from '../../src/content.js';

const bundledSchema = fileURLToPath(new URL('../../schemas/pages.schema.json', import.meta.url));

export function formatPageSource(source, {file = 'page.md', schema} = {}) {
  const {metadata, markdown} = parseDocumentSource(source, file);
  if (!Array.isArray(metadata.blocks)) return source;
  if (markdown.trim()) throw new Error('Cannot convert a page with Markdown body content: ' + file);
  const result = {...(schema ? {$schema: schema} : {}), ...metadata};
  if (schema) result.$schema = schema;
  const output = JSON.stringify(result, null, 2) + '\n';
  assert.deepEqual(JSON.parse(output), result, 'JSON conversion must preserve all page values');
  return output;
}

export async function formatPages(siteRoot, {write = false, schemaPath = bundledSchema} = {}) {
  const root = resolve(siteRoot, 'content/pages'), files = [], plans = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && ['.md', '.json'].includes(extname(entry.name))) files.push(file);
    }
  }
  await visit(root);
  // Preflight the entire site before applying any conversion or deleting a source.
  const identities = new Set();
  for (const file of files) {
    const identity = file.slice(0, -extname(file).length).toLowerCase();
    if (identities.has(identity)) throw new Error('Duplicate page language file: ' + file);
    identities.add(identity);
    const target = file.slice(0, -extname(file).length) + '.json';
    assert(target.startsWith(root + sep), 'Pages conversion must stay inside content/pages');
    const before = await readFile(file, 'utf8');
    if (!Array.isArray(parseDocumentSource(before, file).metadata.blocks)) continue;
    const schema = relative(dirname(target), schemaPath).split(sep).join('/');
    const after = formatPageSource(before, {file, schema});
    if (after !== before || target !== file) plans.push({file, target, after});
  }
  if (write) for (const {file, target, after} of plans) {
    await writeFile(target, after, file === target ? undefined : {flag: 'wx'});
    if (file !== target) await unlink(file);
  }
  return plans.map(plan => plan.target);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write')) throw new Error('Usage: format-pages.mjs [--write], from a site root');
  const changes = await formatPages(process.cwd(), {write: args.includes('--write')});
  console.log(`${args.includes('--write') ? 'Converted/formatted' : 'Would convert/format'} ${changes.length} JSON Pages documents.`);
}
