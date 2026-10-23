import { mkdir, lstat, realpath, open, access, rm } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { slugify } from './content.js';

const validSlug = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
function within(root, path) {
  const rel = relative(root, path);
  return rel && rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep);
}
async function directory(path) {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('Unsafe page directory: ' + path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path);
  }
}

/** Reused by the CLI and the local editor. The browser never supplies a filesystem path. */
export async function createPage(root, {
  title, slug, lang, locales = ['en', 'zh-CN'], defaultLocale = 'en'
} = {}) {
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || /[\x00-\x1f\x7f]/.test(title)) {
    throw new Error('Page title must be one line of 1–160 characters');
  }
  const locale = locales.find(value => value.toLowerCase() === String(lang || defaultLocale).toLowerCase());
  if (!locale) throw new Error('Unsupported page locale; configure the language first');
  const name = slug === undefined || slug === '' ? slugify(title) : String(slug);
  if (!validSlug.test(name) || name.length > 100 || name !== name.toLowerCase()) {
    throw new Error('Page slug must be a single lowercase URL segment (letters, digits, hyphens)');
  }
  const projectRoot = resolve(root);
  const content = resolve(projectRoot, 'content');
  const pages = resolve(content, 'pages');
  await directory(content);
  await directory(pages);
  const pageDir = resolve(pages, name);
  await directory(pageDir);
  const actualPages = await realpath(pages);
  const actualPageDir = await realpath(pageDir);
  if (!within(actualPages, actualPageDir)) throw new Error('Unsafe page path');
  const file = resolve(pageDir, locale.toLowerCase() + '.json');
  const alternate = resolve(pageDir, locale.toLowerCase() + '.md');
  try { await access(alternate); throw new Error('Page already exists: ' + alternate); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bundledSchema = resolve(projectRoot, 'schemas/pages.schema.json');
  let schemaPath = resolve(projectRoot, 'node_modules/edgepress/schemas/pages.schema.json');
  try { await access(bundledSchema); schemaPath = bundledSchema; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const schema = relative(dirname(file), schemaPath).split(sep).join('/');
  const page = {
    $schema: schema.startsWith('.') ? schema : './' + schema,
    title: title.trim(), lang: locale, slug: name,
    description: '', blocks: [
      { columns: 1, cells: [[{ type: 'hero', title: title.trim(), text: 'Describe this page.' }]] }
    ]
  };
  const source = JSON.stringify(page, null, 2) + '\n';
  let handle;
  try { handle = await open(file, 'wx', 0o644); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Page already exists: ' + file);
    throw error;
  }
  try { await handle.writeFile(source); }
  catch (error) { await handle.close(); await rm(file, { force: true }); throw error; }
  await handle.close();
  return { file, path: name + '/' + locale.toLowerCase() + '.json', page, source };
}
