import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { mapLimit } from './concurrency.js';

async function walkMarkdown(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const found = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walkMarkdown(fullPath));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') found.push(fullPath);
  }
  return found;
}

function splitFrontmatter(source, file) {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0] !== '---') return { metadata: {}, markdown: source };
  const end = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
  if (end < 0) throw new Error('Unclosed YAML front matter in ' + file);
  const metadata = parseYaml(lines.slice(1, end).join('\n')) ?? {};
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Front matter must be a YAML object in ' + file);
  }
  return { metadata, markdown: lines.slice(end + 1).join('\n') };
}

export function slugify(value) {
  const slug = String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'post';
}

function normalizeTags(value) {
  if (value == null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map(String).map((tag) => tag.trim()).filter(Boolean);
}

function normalizeDate(value, filename, kind, file) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.valueOf())) return value;
    throw new Error('Invalid date in ' + file);
  }
  if (value != null) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date;
    throw new Error('Invalid date in ' + file);
  }
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (match) {
    const date = new Date(match[1] + 'T00:00:00Z');
    if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === match[1]) return date;
    throw new Error('Invalid date in filename: ' + file);
  }
  if (kind === 'posts') throw new Error('Posts need a valid date in front matter or a YYYY-MM-DD filename: ' + file);
  return new Date(0);
}

function normalizePagePath(value, file) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Page folder or slug must be a non-empty path: ' + file);
  const source = value.trim();
  if (source.startsWith('/') || source.includes('\\') || /[%?#\0]/.test(source)) throw new Error('Page path contains unsafe URL characters: ' + file);
  const segments = source.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..')) throw new Error('Page path contains an empty or traversal segment: ' + file);
  const parts = segments.map((part) => slugify(part));
  if (parts.some((part) => !part)) throw new Error('Page path contains an invalid segment: ' + file);
  return parts.join('/');
}

export async function readDocuments(config) {
  const root = config.resolvedPaths.content;
  const groups = [['posts', resolve(root, 'posts')], ['pages', resolve(root, 'pages')]];
  const files = [];
  for (const [kind, directory] of groups) {
    for (const file of await walkMarkdown(directory)) files.push({ kind, file });
  }
  return await mapLimit(files, config.concurrency, async ({ kind, file }) => {
    const source = await readFile(file, 'utf8');
    const { metadata, markdown } = splitFrontmatter(source, file);
    const contentRoot = resolve(root, kind);
    const relativePath = relative(contentRoot, file).split(sep).join('/');
    const bundleDirectory = dirname(file);
    const bundlePath = relative(contentRoot, bundleDirectory).split(sep).join('/');
    if (!bundlePath || bundlePath === '.' || bundlePath.startsWith('..')) {
      throw new Error('Each content document must have its own folder with one file per language: ' + file);
    }
    const bundleName = basename(bundleDirectory);
    const languageFileName = basename(file, extname(file));
    const languageFile = languageFileName.toLowerCase();
    const fileLocale = config.i18n.locales.find((locale) => locale.toLowerCase() === languageFile);
    if (!fileLocale || languageFileName !== languageFile || extname(file).toLowerCase() !== '.md') {
      throw new Error('Content language files must be named after a configured locale, such as en.md or zh-cn.md: ' + file);
    }
    const declaredLocale = metadata.lang === undefined ? fileLocale :
      config.i18n.locales.find((locale) => locale.toLowerCase() === String(metadata.lang).toLowerCase());
    if (!declaredLocale) throw new Error('Unsupported lang value in ' + file + '; use the language filename and configure its language pack');
    if (declaredLocale !== fileLocale) throw new Error('Front matter lang must match the content filename locale in ' + file);
    const locale = fileLocale;
    const fallbackSlug = bundlePath.replace(/\\/g, '/');
    const fallbackName = bundleName.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const fallbackTitle = fallbackName.replace(/[-_]/g, ' ');
    const title = String(metadata.title ?? fallbackTitle).trim();
    if (!title) throw new Error('Document needs a non-empty title: ' + file);
    if (metadata.homepage !== undefined && typeof metadata.homepage !== 'boolean') {
      throw new Error('homepage must be a boolean in ' + file);
    }
    if (metadata.homepage === true && kind !== 'pages') throw new Error('Only pages can be marked as the homepage: ' + file);
    if (metadata.blocks !== undefined && (kind !== 'pages' || !Array.isArray(metadata.blocks) || metadata.blocks.length > 100)) {
      throw new Error('blocks must be an array of at most 100 items on a page: ' + file);
    }
    if (kind === 'pages' && (!Array.isArray(metadata.blocks) || metadata.blocks.length === 0)) {
      throw new Error('Pages need an ordered blocks array; use Markdown only for posts: ' + file);
    }
    if (kind === 'pages' && markdown.trim()) {
      throw new Error('Page body must be empty; move content into page blocks: ' + file);
    }
    const rawSlug = metadata.slug ?? (kind === 'posts' ? fallbackName : fallbackSlug);
    const normalizedPagePath = kind === 'pages' && metadata.homepage !== true ? normalizePagePath(rawSlug, file) : '';
    const slug = slugify(String(rawSlug).split('/').pop());
    const date = normalizeDate(metadata.date, bundleName, kind, file);
    let path;
    if (kind === 'posts') {
      path = config.permalink
        .replace(/:year/g, String(date.getUTCFullYear()))
        .replace(/:month/g, String(date.getUTCMonth() + 1).padStart(2, '0'))
        .replace(/:day/g, String(date.getUTCDate()).padStart(2, '0'))
        .replace(/:slug/g, slug)
        .replace(/:title/g, slug)
        .replace(/^\/+|\/+$/g, '') + '/';
    } else {
      const localePrefix = locale === config.i18n.defaultLocale ? '' : locale + '/';
      path = metadata.homepage === true ? localePrefix : normalizedPagePath + '/';
    }
    if (locale !== config.i18n.defaultLocale && metadata.homepage !== true) path = locale + '/' + path;
    return {
      kind, file, relativePath, title, slug, date, locale,
      tags: normalizeTags(metadata.tags),
      description: String(metadata.description ?? ''),
      keywords: normalizeTags(metadata.keywords),
      robots: typeof metadata.robots === 'string' ? metadata.robots : '',
      image: typeof metadata.image === 'string' ? metadata.image : '',
      homepage: metadata.homepage === true,
      blocks: metadata.blocks ?? [],
      draft: metadata.draft === true,
      path,
      markdown: markdown.trim()
    };
  });
}
