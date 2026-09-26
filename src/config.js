import { access, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

const defaults = {
  site: {
    title: 'EdgePress', description: '', url: '', language: 'en',
    head: { titleSuffix: '', titleSeparator: ' · ' },
    header: { showBrand: true, brandLabel: '' },
    components: { header: true, primaryNavigation: true, languageNavigation: true, footer: true, footerNavigation: true },
    navigation: [],
    footerNavigation: [],
    footer: '',
    seo: { author: '', keywords: [], image: '', robots: 'index,follow' },
    agentSeo: { enabled: true, summary: '', topics: [], llmsTxt: true, agentCrawlers: ['GPTBot', 'ClaudeBot', 'PerplexityBot'] }
  },
  privacy: {
    controller: { name: '', contact: '' },
    policyUrl: '/privacy-policy/'
  },
  browserPlugins: {
    consent: { enabled: true, version: '1', expiresDays: 180 },
    tracking: { enabled: true, services: [] },
    statistics: { enabled: true, services: [] },
    advertising: { enabled: true, services: [] },
    captcha: { enabled: true, services: [] }
  },
  paths: { content: 'content', static: 'static', theme: 'themes/default', output: 'dist', cache: '.edgepress' },
  permalink: '/:year/:month/:slug/',
  pagination: { perPage: 10 },
  markdown: { gfm: true, breaks: false },
  i18n: { defaultLocale: 'en', languagePacks: [] },
  concurrency: 8,
  plugins: []
};

function merge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      result[key] = merge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' must be a non-empty string');
}

const integrationProviders = {
  'google-tag-manager': { group: 'tracking', credential: 'containerId', pattern: /^GTM-[A-Z0-9]{4,20}$/i },
  'meta-pixel': { group: 'tracking', credential: 'pixelId', pattern: /^[0-9]{6,20}$/ },
  'cloudflare-web-analytics': { group: 'statistics', credential: 'token', pattern: /^[A-Fa-f0-9-]{20,64}$/ },
  'google-analytics': { group: 'statistics', credential: 'measurementId', pattern: /^(?:G|GT)-[A-Z0-9]{4,24}$/i },
  'baidu-tongji': { group: 'statistics', credential: 'siteId', pattern: /^[A-Fa-f0-9]{16,64}$/ },
  'google-adsense': { group: 'advertising', credential: 'clientId', pattern: /^ca-pub-[0-9]{10,24}$/ },
  'cloudflare-turnstile': { group: 'captcha', credential: 'siteKey', pattern: /^[A-Za-z0-9_-]{20,128}$/ },
  'google-recaptcha': { group: 'captcha', credential: 'siteKey', pattern: /^[A-Za-z0-9_-]{20,256}$/ },
  'hcaptcha': { group: 'captcha', credential: 'siteKey', pattern: /^[A-Za-z0-9_-]{20,256}$/ }
};

async function readSiteYaml(root) {
  const file = resolve(root, 'config.yml');
  const realRoot = await realpath(root);
  let realFile;
  try { realFile = await realpath(file); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  if (!isPathInside(realRoot, realFile)) throw new Error('config.yml must stay inside the project root');
  const source = await readFile(realFile);
  if (source.byteLength > 64 * 1024) throw new Error('config.yml exceeds 64 KB');
  let parsed;
  try { parsed = parseYaml(source.toString('utf8'), { uniqueKeys: true, maxAliasCount: 20 }) ?? {}; }
  catch (error) { throw new Error('Invalid YAML in config.yml: ' + error.message, { cause: error }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('config.yml must contain an object');
  for (const key of Object.keys(parsed)) if (!['site', 'privacy', 'plugins'].includes(key)) throw new Error('Unsupported config.yml section: ' + key);
  return parsed;
}

function validateSiteConfig(config) {
  if (!config.site.seo || typeof config.site.seo !== 'object' || Array.isArray(config.site.seo)) throw new Error('site.seo must be an object');
  if (typeof config.site.footer !== 'string') throw new Error('site.footer must be a string');
  for (const field of ['author', 'image', 'robots']) {
    if (typeof config.site.seo[field] !== 'string') throw new Error('site.seo.' + field + ' must be a string');
  }
  if (!Array.isArray(config.site.seo.keywords) || config.site.seo.keywords.some((item) => typeof item !== 'string')) {
    throw new Error('site.seo.keywords must be an array of strings');
  }
  const agentSeo = config.site.agentSeo;
  if (!agentSeo || typeof agentSeo !== 'object' || Array.isArray(agentSeo) || typeof agentSeo.enabled !== 'boolean' || typeof agentSeo.llmsTxt !== 'boolean' || typeof agentSeo.summary !== 'string' ||
      !Array.isArray(agentSeo.topics) || agentSeo.topics.some((item) => typeof item !== 'string') ||
      !Array.isArray(agentSeo.agentCrawlers) || agentSeo.agentCrawlers.some((item) => typeof item !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item))) {
    throw new Error('site.agentSeo must define enabled, summary, topics, llmsTxt, and valid agentCrawlers');
  }
  for (const key of Object.keys(config.site.agentSeo)) if (!['enabled', 'summary', 'topics', 'llmsTxt', 'agentCrawlers'].includes(key)) {
    throw new Error('Unsupported site.agentSeo option: ' + key);
  }
  const { head, header, components } = config.site;
  if (!head || typeof head !== 'object' || Array.isArray(head) || typeof head.titleSuffix !== 'string' ||
      typeof head.titleSeparator !== 'string' || head.titleSuffix.length > 120 || head.titleSeparator.length > 20 ||
      /[<>\r\n]/.test(head.titleSuffix + head.titleSeparator)) {
    throw new Error('site.head needs a short plain-text titleSuffix and titleSeparator');
  }
  for (const key of Object.keys(head)) if (!['titleSuffix', 'titleSeparator'].includes(key)) throw new Error('Unsupported site.head option: ' + key);
  if (!header || typeof header !== 'object' || Array.isArray(header) || typeof header.showBrand !== 'boolean' || typeof header.brandLabel !== 'string') {
    throw new Error('site.header needs showBrand and brandLabel');
  }
  for (const key of Object.keys(header)) if (!['showBrand', 'brandLabel'].includes(key)) throw new Error('Unsupported site.header option: ' + key);
  const componentKeys = ['header', 'primaryNavigation', 'languageNavigation', 'footer', 'footerNavigation'];
  if (!components || typeof components !== 'object' || Array.isArray(components)) throw new Error('site.components must be an object');
  for (const key of Object.keys(components)) if (!componentKeys.includes(key)) throw new Error('Unsupported site.components option: ' + key);
  for (const key of componentKeys) if (typeof components[key] !== 'boolean') throw new Error('site.components.' + key + ' must be a boolean');

  function validateNavigation(items, field) {
    if (!Array.isArray(items) || items.length > 30) throw new Error(field + ' must be an array with at most 30 items');
    const keys = new Set();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.key !== 'string' ||
          !/^[a-z][a-z0-9-]{0,63}$/.test(item.key) || keys.has(item.key) || typeof item.url !== 'string' || !item.url.trim()) {
        throw new Error(field + ' items need a unique key and URL');
      }
      keys.add(item.key);
      for (const key of Object.keys(item)) if (!['key', 'url', 'labels'].includes(key)) throw new Error('Unsupported ' + field + ' item option: ' + key);
      const url = item.url.trim();
      if (!['@home', '@archives', '@feed', '@search'].includes(url)) {
        const safeLocal = url.startsWith('/') && !url.startsWith('//') && !/[\\\x00-\x20]/.test(url) && !/^(?:javascript|data|vbscript):/i.test(url);
        let safeExternal = false;
        if (!safeLocal) {
          try {
            const parsed = new URL(url);
            safeExternal = ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
          } catch { safeExternal = false; }
        }
        if (!safeLocal && !safeExternal) throw new Error(field + ' URL must be a safe site path or HTTP URL');
      }
      if (item.labels !== undefined) {
        if (!item.labels || typeof item.labels !== 'object' || Array.isArray(item.labels)) throw new Error(field + '.labels must be a locale-to-label object');
        for (const [locale, label] of Object.entries(item.labels)) {
          if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(locale) || typeof label !== 'string' || !label.trim() || label.length > 120) {
            throw new Error(field + '.labels values must be short locale-specific strings');
          }
        }
      }
    }
  }
  validateNavigation(config.site.navigation, 'site.navigation');
  validateNavigation(config.site.footerNavigation, 'site.footerNavigation');
}

function validatePrivacyConfig(config) {
  const privacy = config.privacy;
  for (const key of Object.keys(privacy)) if (!['controller', 'policyUrl'].includes(key)) throw new Error('Unsupported privacy option: ' + key);
  if (!privacy.controller || typeof privacy.controller.name !== 'string' || typeof privacy.controller.contact !== 'string') {
    throw new Error('privacy.controller.name and privacy.controller.contact must be strings');
  }
  for (const key of Object.keys(privacy.controller)) if (!['name', 'contact'].includes(key)) throw new Error('Unsupported privacy.controller option: ' + key);
  if (typeof privacy.policyUrl !== 'string' || !privacy.policyUrl.trim()) throw new Error('privacy.policyUrl must be a non-empty URL or site path');
  const policyUrl = privacy.policyUrl.trim();
  let validPolicyUrl = policyUrl.startsWith('/') && !policyUrl.startsWith('//') && !/[?#\\]/.test(policyUrl);
  if (!validPolicyUrl) {
    try {
      const parsed = new URL(policyUrl);
      validPolicyUrl = ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    } catch { validPolicyUrl = false; }
  }
  if (!validPolicyUrl || /[\x00-\x20]/.test(policyUrl)) throw new Error('privacy.policyUrl must be a safe site path or HTTP URL');
}

function normalizeBrowserPlugins(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('config.yml plugins must be an object');
  for (const key of Object.keys(value)) {
    if (key !== 'consent') {
      throw new Error('Unsupported plugin configuration group: ' + key + '; place browser services under plugins.consent.' + key);
    }
  }
  if (value.consent === undefined) return {};
  const input = value.consent;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('plugins.consent must be an object');
  const consent = {};
  const normalized = {};
  const groups = ['tracking', 'statistics', 'advertising', 'captcha'];
  for (const [key, section] of Object.entries(input)) {
    if (groups.includes(key)) normalized[key] = section;
    else if (['enabled', 'version', 'expiresDays'].includes(key)) consent[key] = section;
    else throw new Error('Unsupported plugins.consent option: ' + key);
  }
  normalized.consent = consent;
  return normalized;
}

function validateBrowserPlugins(config) {
  const plugins = config.browserPlugins;
  const allowedGroups = ['consent', 'tracking', 'statistics', 'advertising', 'captcha'];
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) throw new Error('plugins in config.yml must be an object');
  for (const key of Object.keys(plugins)) if (!allowedGroups.includes(key)) throw new Error('Unsupported plugin configuration group: ' + key);
  const consent = plugins.consent;
  if (!consent || typeof consent !== 'object' || Array.isArray(consent) || typeof consent.enabled !== 'boolean' ||
      typeof consent.version !== 'string' || !consent.version.trim() || !Number.isInteger(consent.expiresDays) ||
      consent.expiresDays < 1 || consent.expiresDays > 730) {
    throw new Error('plugins.consent needs enabled, version, and expiresDays from 1 to 730');
  }
  for (const key of Object.keys(consent)) if (!['enabled', 'version', 'expiresDays'].includes(key)) {
    throw new Error('Unsupported plugins.consent option: ' + key);
  }
  const ids = new Set();
  let servicesCount = 0;
  for (const group of ['tracking', 'statistics', 'advertising', 'captcha']) {
    const groupPath = 'plugins.consent.' + group;
    const section = plugins[group];
    if (!section || typeof section !== 'object' || Array.isArray(section) || typeof section.enabled !== 'boolean' || !Array.isArray(section.services)) {
      throw new Error(groupPath + ' needs enabled and a services array');
    }
    for (const key of Object.keys(section)) if (!['enabled', 'services'].includes(key)) throw new Error('Unsupported ' + groupPath + ' option: ' + key);
    if (!section.enabled && section.services.length) throw new Error('Clear ' + groupPath + '.services or enable the plugin group');
    servicesCount += section.services.length;
    for (const service of section.services) {
      if (!service || typeof service !== 'object' || Array.isArray(service)) throw new Error('Each ' + groupPath + '.services item must be an object');
      const { id, provider, purpose } = service;
      if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(id) || ids.has(id)) throw new Error('Each configured service needs a unique lowercase id');
      ids.add(id);
      const definition = integrationProviders[provider];
      if (!definition || definition.group !== group) throw new Error('Unsupported provider for ' + groupPath + ': ' + provider);
      if (typeof purpose !== 'string' || !purpose.trim() || purpose.length > 500) throw new Error('Service ' + id + ' needs a short purpose description');
      if (typeof service.retention !== 'string' || !service.retention.trim() || service.retention.length > 300) throw new Error('Service ' + id + ' needs a retention description');
      const allowedKeys = new Set(['id', 'provider', 'purpose', 'retention', definition.credential]);
      for (const key of Object.keys(service)) if (!allowedKeys.has(key)) throw new Error('Unsupported option for service ' + id + ': ' + key);
      const credential = service[definition.credential];
      if (typeof credential !== 'string' || !definition.pattern.test(credential)) throw new Error('Service ' + id + ' needs a valid public ' + definition.credential);
    }
  }
  if (servicesCount && !consent.enabled) throw new Error('plugins.consent must be enabled when browser services are configured');
  if (servicesCount) {
    assertString(config.privacy.controller.name, 'privacy.controller.name');
    assertString(config.privacy.controller.contact, 'privacy.controller.contact');
  }
}

function isCanonicalLocale(value) {
  try { return Intl.getCanonicalLocales(value)[0] === value; }
  catch { return false; }
}

function isInside(root, target) {
  const relativePath = relative(root, resolve(root, target));
  return relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith('..' + sep) &&
    !isAbsolute(relativePath);
}

function isPathInside(root, target) {
  const relativePath = relative(root, target);
  return relativePath !== '' && relativePath !== '..' &&
    !relativePath.startsWith('..' + sep) && !isAbsolute(relativePath);
}

async function realpathWithMissingTail(path) {
  let candidate = resolve(path);
  const missing = [];
  while (true) {
    let actual;
    try {
      actual = await realpath(candidate);
    }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      missing.push(basename(candidate));
      candidate = parent;
      continue;
    }
    if (!(await stat(actual)).isDirectory()) throw new Error('A configured path has a non-directory parent: ' + path);
    return resolve(actual, ...missing.reverse());
  }
}

function pathsOverlap(left, right) {
  return left === right || isPathInside(left, right) || isPathInside(right, left);
}

export async function loadConfig(root = process.cwd()) {
  root = resolve(root);
  const configFile = resolve(root, 'edgepress.config.mjs');
  let userConfig = {};
  try {
    await access(configFile);
    const loaded = await import(pathToFileURL(configFile).href + '?v=' + Date.now());
    userConfig = loaded.default ?? {};
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!userConfig || typeof userConfig !== 'object' || Array.isArray(userConfig)) {
    throw new Error('edgepress.config.mjs must export a configuration object');
  }

  const config = merge(defaults, userConfig);
  const siteYaml = await readSiteYaml(root);
  if (siteYaml.site !== undefined && (!siteYaml.site || typeof siteYaml.site !== 'object' || Array.isArray(siteYaml.site))) {
    throw new Error('config.yml site must be an object');
  }
  if (siteYaml.privacy !== undefined && (!siteYaml.privacy || typeof siteYaml.privacy !== 'object' || Array.isArray(siteYaml.privacy))) {
    throw new Error('config.yml privacy must be an object');
  }
  if (siteYaml.plugins !== undefined && (!siteYaml.plugins || typeof siteYaml.plugins !== 'object' || Array.isArray(siteYaml.plugins))) {
    throw new Error('config.yml plugins must be an object');
  }
  config.site = merge(config.site, siteYaml.site);
  config.privacy = merge(config.privacy, siteYaml.privacy);
  config.browserPlugins = merge(config.browserPlugins, normalizeBrowserPlugins(siteYaml.plugins));
  assertString(config.site.title, 'site.title');
  assertString(config.site.language, 'site.language');
  if (!isCanonicalLocale(config.site.language)) throw new Error('site.language must be a valid canonical language tag');
  if (typeof config.site.description !== 'string') throw new Error('site.description must be a string');
  validateSiteConfig(config);
  validatePrivacyConfig(config);
  validateBrowserPlugins(config);
  if (typeof config.markdown.gfm !== 'boolean' || typeof config.markdown.breaks !== 'boolean') {
    throw new Error('markdown.gfm and markdown.breaks must be booleans');
  }
  assertString(config.permalink, 'permalink');
  if (/[?#\\\0]/.test(config.permalink) || /(^|\/)\.\.?($|\/)/.test(config.permalink)) {
    throw new Error('permalink must be a URL path without query, fragment, or traversal segments');
  }
  const unknownPermalinkTokens = [...config.permalink.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)]
    .map((match) => match[1]).filter((token) => !['year', 'month', 'day', 'slug', 'title'].includes(token));
  if (unknownPermalinkTokens.length) throw new Error('Unknown permalink token: :' + unknownPermalinkTokens[0]);
  if (!Number.isInteger(config.pagination.perPage) || config.pagination.perPage < 1) {
    throw new Error('pagination.perPage must be a positive integer');
  }
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1 || config.concurrency > 64) {
    throw new Error('concurrency must be an integer between 1 and 64');
  }
  if (!Array.isArray(config.plugins)) throw new Error('plugins must be an array');
  if ('messages' in config.i18n || 'labels' in config.i18n || 'locales' in config.i18n) {
    throw new Error('Define translations in languages/base and languages/packs; use i18n.languagePacks instead of inline messages or locales');
  }
  if (typeof config.i18n.defaultLocale !== 'string' || !isCanonicalLocale(config.i18n.defaultLocale)) {
    throw new Error('i18n.defaultLocale must be a valid canonical language tag');
  }
  if (!Array.isArray(config.i18n.languagePacks)) throw new Error('i18n.languagePacks must be an array of language tags');
  for (const locale of config.i18n.languagePacks) {
    if (typeof locale !== 'string' || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(locale) || !isCanonicalLocale(locale)) {
      throw new Error('Each i18n.languagePacks entry must be a canonical language tag such as zh-CN');
    }
    if (locale === config.i18n.defaultLocale) throw new Error('The base language must not also be listed as a language pack');
  }
  if (new Set(config.i18n.languagePacks).size !== config.i18n.languagePacks.length) {
    throw new Error('i18n.languagePacks must not contain duplicates');
  }
  config.i18n.locales = [config.i18n.defaultLocale, ...config.i18n.languagePacks];

  const siteUrl = String(config.site.url ?? '').trim();
  if (siteUrl) {
    let parsedSiteUrl;
    try { parsedSiteUrl = new URL(siteUrl); }
    catch { throw new Error('site.url must be an absolute HTTP or HTTPS URL'); }
    if (!['http:', 'https:'].includes(parsedSiteUrl.protocol) || parsedSiteUrl.username || parsedSiteUrl.password || parsedSiteUrl.search || parsedSiteUrl.hash) {
      throw new Error('site.url must be an absolute HTTP or HTTPS URL without credentials, query, or fragment');
    }
    config.site.url = (parsedSiteUrl.origin + parsedSiteUrl.pathname).replace(/\/+$/, '');
  } else {
    config.site.url = '';
  }
  config.root = root;
  config.resolvedPaths = {};
  config.realPaths = {};
  const realRoot = await realpath(root);
  for (const [name, value] of Object.entries(config.paths)) {
    assertString(value, 'paths.' + name);
    if (isAbsolute(value)) throw new Error('paths.' + name + ' must be relative to the project root');
    const target = resolve(root, value);
    if (!isInside(root, target)) throw new Error('paths.' + name + ' must stay inside the project root');
    const realTarget = await realpathWithMissingTail(target);
    if (!isPathInside(realRoot, realTarget)) {
      throw new Error('paths.' + name + ' must resolve inside the project root, including through symbolic links');
    }
    config.resolvedPaths[name] = target;
    config.realPaths[name] = realTarget;
  }
  const output = config.resolvedPaths.output;
  const cache = config.resolvedPaths.cache;
  if (output === root || cache === root) throw new Error('paths.output and paths.cache cannot be the project root');
  const protectedPaths = ['content', 'static', 'theme'].map((name) => ({
    name: 'paths.' + name,
    path: config.resolvedPaths[name],
    real: config.realPaths[name]
  }));
  for (const name of ['src', 'languages', 'tools']) {
    const path = resolve(root, name);
    const real = await realpathWithMissingTail(path);
    if (!isPathInside(realRoot, real)) throw new Error(name + ' must resolve inside the project root, including through symbolic links');
    protectedPaths.push({ name, path, real });
  }
  for (let left = 0; left < protectedPaths.length; left += 1) {
    for (let right = left + 1; right < protectedPaths.length; right += 1) {
      const a = protectedPaths[left];
      const b = protectedPaths[right];
      if (pathsOverlap(a.path, b.path) || pathsOverlap(a.real, b.real)) {
        throw new Error(a.name + ' and ' + b.name + ' must not overlap');
      }
    }
  }
  for (const protectedPath of protectedPaths) {
    if (pathsOverlap(output, protectedPath.path) || pathsOverlap(config.realPaths.output, protectedPath.real)) {
      throw new Error('paths.output must not overlap ' + protectedPath.name);
    }
    if (pathsOverlap(cache, protectedPath.path) || pathsOverlap(config.realPaths.cache, protectedPath.real)) {
      throw new Error('paths.cache must not overlap ' + protectedPath.name);
    }
  }
  if (pathsOverlap(output, cache) || pathsOverlap(config.realPaths.output, config.realPaths.cache)) {
    throw new Error('paths.output and paths.cache must not overlap');
  }
  return config;
}
