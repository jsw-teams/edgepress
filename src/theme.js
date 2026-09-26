import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { localePrefix, localizedUrl, translate } from './i18n.js';
import { isIconName, renderIcon } from './icons.js';
const defaultNavigationIcons = {
  home: 'home', guides: 'book-open', 'quick-start': 'rocket', posts: 'newspaper',
  search: 'search', privacy: 'shield-check', feed: 'rss'
};

function isInside(root, target) {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function navigationItems(config, locale, items) {
  const values = items.length ? items : [
    { key: 'home', url: '@home' },
    { key: 'archives', url: '@archives' },
    { key: 'search', url: '@search' },
    { key: 'feed', url: '@feed' }
  ];
  return values.map((item) => {
    const path = item.url === '@home' ? localizedUrl(config, locale, '') :
      item.url === '@archives' ? localizedUrl(config, locale, 'archives/') :
        item.url === '@feed' ? localizedUrl(config, locale, 'feed.xml') :
          item.url === '@search' ? localizedUrl(config, locale, 'search/') :
          item.url.startsWith('/') ? localizedUrl(config, locale, item.url) : item.url;
    const label = item.labels?.[locale] ?? item.labels?.[config.i18n.defaultLocale] ?? translate(config, locale, item.key);
    const iconName = item.icon || defaultNavigationIcons[item.key];
    const icon = isIconName(iconName) ? renderIcon(iconName, 'navigation-icon') : '';
    return '<a href="' + escapeHtml(path) + '">' + icon + escapeHtml(label) + '</a>';
  }).join('');
}

function lookup(values, path) {
  return path.split('.').reduce((value, key) => value?.[key], values);
}

async function loadLayout(config) {
  if (!config.layoutPromise) {
    config.layoutPromise = (async () => {
      const directory = resolve(config.resolvedPaths.theme, 'layouts');
      const realDirectory = await realpath(directory).catch((error) => {
        if (error.code === 'ENOENT') throw new Error('Selected theme must contain layouts/layout.html: ' + directory);
        throw error;
      });
      if (!isInside(config.realPaths.theme, realDirectory)) throw new Error('Theme layouts must stay inside the selected theme directory');
      const layoutPath = resolve(realDirectory, 'layout.html');
      const realLayout = await realpath(layoutPath);
      if (!isInside(realDirectory, realLayout)) throw new Error('Theme layout must stay inside its layouts directory');
      const source = await readFile(realLayout, 'utf8');
      const partialPattern = /{{>\s*([A-Za-z0-9_-]+)\s*}}/g;
      const loaded = new Map();
      async function expand(template, depth = 0) {
        if (depth > 8) throw new Error('Theme partial nesting exceeds 8 levels');
        const matches = [...template.matchAll(partialPattern)];
        let result = template;
        for (const match of matches) {
          const name = match[1];
          let partial = loaded.get(name);
          if (partial === undefined) {
            const path = resolve(realDirectory, 'partials', name + '.html');
            const realPath = await realpath(path);
            const partialRoot = await realpath(resolve(realDirectory, 'partials'));
            if (!isInside(realDirectory, partialRoot)) throw new Error('Theme partial directory resolves outside its layouts directory');
            if (!isInside(partialRoot, realPath)) throw new Error('Theme partial resolves outside its partials directory: ' + name);
            partial = await readFile(realPath, 'utf8');
            loaded.set(name, partial);
          }
          result = result.replace(match[0], await expand(partial, depth + 1));
        }
        return result;
      }
      const expanded = await expand(source);
      if (/{{>/.test(expanded)) throw new Error('Invalid or unresolved theme partial directive');
      return expanded;
    })();
  }
  return config.layoutPromise;
}

export async function renderLayout(config, extensions, page, body) {
  const locale = page.locale || config.i18n.defaultLocale;
  const context = { config, page };
  const content = await extensions.filter('html:beforeLayout', body, context);
  if (typeof content !== 'string') throw new Error('html:beforeLayout filters must return a string');
  const stylesheet = config.assetManifest?.['/style.css'] || '/style.css';
  const canonical = config.site.url ? config.site.url + (page.urlPath || localizedUrl(config, locale, '')) : '';
  const description = page.description || config.site.description;
  const titleSuffix = config.site.head.titleSuffix || config.site.title;
  const title = page.title ? page.title + config.site.head.titleSeparator + titleSuffix : titleSuffix;
  const robots = page.robots || config.site.seo.robots || 'index,follow';
  const keywords = (page.keywords || config.site.seo.keywords || []).join(', ');
  const image = page.image || config.site.seo.image || '';
  const currentPrefix = localePrefix(config, locale);
  const currentPath = page.urlPath || localizedUrl(config, locale, '');
  const localeRoute = currentPrefix && currentPath.startsWith(currentPrefix + '/')
    ? currentPath.slice(currentPrefix.length)
    : currentPath;
  const localeLinksHtml = '<select id="site-language" data-language-select aria-label="' +
    escapeHtml(translate(config, locale, 'languageLabel')) + '">' + config.i18n.locales.map((item) => {
      const path = (localePrefix(config, item) + (localeRoute.startsWith('/') ? localeRoute : '/' + localeRoute)) || '/';
      return '<option lang="' + escapeHtml(item) + '" value="' + escapeHtml(path) + '"' +
        (item === locale ? ' selected' : '') + '>' + escapeHtml(translate(config, item, 'languageName')) + '</option>';
    }).join('') + '</select>';
  const componentClass = (enabled, className) => enabled ? '' : className + '--hidden';
  const jsonLd = page.structuredData === false ? '' : JSON.stringify(page.structuredData || {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.site.title,
    description: config.site.description,
    url: canonical || config.site.url || undefined,
    inLanguage: locale
  }).replace(/</g, '\\u003c');
  const values = {
    site: {
      ...config.site,
      language: locale,
      headerClass: componentClass(config.site.components.header, 'site-header'),
      brandClass: componentClass(config.site.header.showBrand, 'brand'),
      headerBrand: config.site.header.brandLabel || config.site.title,
      primaryNavigationClass: componentClass(config.site.components.primaryNavigation, 'primary-navigation'),
      languageNavigationClass: componentClass(config.site.components.languageNavigation, 'locale-nav'),
      footerClass: componentClass(config.site.components.footer, 'site-footer'),
      footerCopyClass: componentClass(Boolean(config.site.footer), 'footer-copy'),
      footerNavigationClass: componentClass(config.site.components.footerNavigation && config.site.footerNavigation.length, 'footer-navigation'),
      primaryNavigationHtml: navigationItems(config, locale, config.site.navigation),
      footerNavigationHtml: navigationItems(config, locale, config.site.footerNavigation),
      localeLinksHtml,
      stylesheet,
      homePath: localizedUrl(config, locale, ''),
      archivesPath: localizedUrl(config, locale, 'archives/'),
      feedPath: localizedUrl(config, locale, 'feed.xml'),
      homeLabel: translate(config, locale, 'home'),
      archivesLabel: translate(config, locale, 'archives'),
      feedLabel: translate(config, locale, 'feed'),
      mainNavigationLabel: translate(config, locale, 'mainNavigationLabel'),
      languageLabel: translate(config, locale, 'languageLabel'),
      footerNavigationLabel: translate(config, locale, 'footerNavigationLabel'),
      skipToContent: translate(config, locale, 'skipToContent'),
    },
    page: { ...page, content, title, description, robots, keywords, image, canonical, jsonLd }
  };
  const template = await loadLayout(config);
  const rendered = template.replace(/{{{\s*([A-Za-z][A-Za-z0-9_.]*)\s*}}}|{{\s*([A-Za-z][A-Za-z0-9_.]*)\s*}}/g,
    (_match, rawKey, key) => {
      const name = rawKey || key;
      const value = lookup(values, name);
      if (value === undefined) throw new Error('Unknown theme placeholder: ' + name);
      if (rawKey) {
        if (!['page.content', 'page.jsonLd', 'site.localeLinksHtml', 'site.primaryNavigationHtml', 'site.footerNavigationHtml'].includes(name)) {
          throw new Error('Only generated content, JSON-LD, and locale navigation may use raw theme placeholders: ' + name);
        }
        return value == null ? '' : String(value);
      }
      return escapeHtml(value);
    });
  const html = '<!doctype html>' + rendered;
  const filtered = await extensions.filter('html:afterLayout', html, context);
  if (typeof filtered !== 'string') throw new Error('html:afterLayout filters must return a string');
  const scripts = [];
  if (!/src=["']\/edgepress\/code-copy\.js["']/i.test(filtered)) scripts.push('<script defer src="/edgepress/code-copy.js"></script>');
  if (/data-post-toc(?:\s|>)/i.test(filtered) && !/src=["']\/edgepress\/post-toc\.js["']/i.test(filtered)) {
    scripts.push('<script defer src="/edgepress/post-toc.js"></script>');
  }
  if (!scripts.length) return filtered;
  const integration = scripts.join('');
  return /<\/body\s*>/i.test(filtered)
    ? filtered.replace(/<\/body\s*>/i, integration + '</body>')
    : filtered + integration;
}
