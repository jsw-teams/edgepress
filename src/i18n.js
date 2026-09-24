import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const MAX_LANGUAGE_FILE_BYTES = 64 * 1024;

function isInside(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

async function loadDictionary(root, directory, locale, label) {
  const directoryPath = resolve(root, directory);
  const file = resolve(directoryPath, locale + '.json');
  const realRoot = await realpath(root);
  const realDirectory = await realpath(directoryPath);
  if (!isInside(realRoot, realDirectory)) throw new Error(label + ' language directory resolves outside the project root: ' + directoryPath);
  const realFile = await realpath(file).catch((error) => {
    if (error.code === 'ENOENT') throw new Error('Missing ' + label + ' language file: ' + file);
    throw error;
  });
  if (!isInside(realDirectory, realFile)) throw new Error(label + ' language file resolves outside its language directory: ' + file);
  const source = await readFile(realFile);
  if (source.byteLength > MAX_LANGUAGE_FILE_BYTES) throw new Error(label + ' language file exceeds 64 KB: ' + file);
  let parsed;
  try { parsed = JSON.parse(source.toString('utf8')); }
  catch (error) { throw new Error('Invalid JSON in ' + label + ' language file: ' + file, { cause: error }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(label + ' language file must contain an object of string translations: ' + file);
  }
  const dictionary = Object.create(null);
  for (const [id, value] of Object.entries(parsed)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(id)) throw new Error('Invalid translation id in ' + file + ': ' + id);
    if (typeof value !== 'string') throw new Error('Translation values must be strings in ' + file + ': ' + id);
    dictionary[id] = value;
  }
  return dictionary;
}

export async function loadLanguagePacks(config) {
  const baseLocale = config.i18n.defaultLocale;
  const translationsByLocale = Object.create(null);
  translationsByLocale[baseLocale] = await loadDictionary(config.root, 'languages/base', baseLocale, 'Base');
  for (const locale of config.i18n.languagePacks) {
    translationsByLocale[locale] = await loadDictionary(config.root, 'languages/packs', locale, 'Language pack');
  }
  config.i18n.translationsByLocale = translationsByLocale;
  return translationsByLocale;
}

export function translate(config, locale, key) {
  const base = config.i18n.translationsByLocale?.[config.i18n.defaultLocale];
  const selected = config.i18n.translationsByLocale?.[locale];
  return selected?.[key] ?? base?.[key] ?? key;
}

export function localePrefix(config, locale) {
  return locale === config.i18n.defaultLocale ? '' : '/' + locale;
}

export function localizedUrl(config, locale, path) {
  const prefix = localePrefix(config, locale);
  const suffix = String(path ?? '').replace(/^\/+/, '');
  return prefix + '/' + suffix;
}
