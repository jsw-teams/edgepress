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

function navigationItems(config, locale, items, currentPath = '', scope = 'primary') {
  const values = items.length ? items : [
    { key: 'home', url: '@home' },
    { key: 'archives', url: '@archives' },
    { key: 'search', url: '@search' },
    { key: 'feed', url: '@feed' }
  ];
  return values.map((item, index) => {
    const path = item.url === '@home' ? localizedUrl(config, locale, '') :
      item.url === '@archives' ? localizedUrl(config, locale, 'archives/') :
        item.url === '@feed' ? localizedUrl(config, locale, 'rss.xml') :
          item.url === '@search' ? localizedUrl(config, locale, 'search/') :
            item.url.startsWith('/') ? localizedUrl(config, locale, item.url) : item.url;
    const label = item.labels?.[locale] ?? item.labels?.[config.i18n.defaultLocale] ?? translate(config, locale, item.key);
    const iconName = item.icon || defaultNavigationIcons[item.key];
    const icon = isIconName(iconName) ? renderIcon(iconName, 'navigation-icon') : '';
    const attributes = item.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : '';
    const current = currentPath && path === currentPath ? ' aria-current="page"' : '';
    if (item.children?.length) {
      const choices = [{ path, label, target: item.target }, ...item.children.map(child => ({
        path: child.url === '@home' ? localizedUrl(config, locale, '') : child.url === '@archives' ? localizedUrl(config, locale, 'archives/') :
          child.url === '@feed' ? localizedUrl(config, locale, 'rss.xml') : child.url === '@search' ? localizedUrl(config, locale, 'search/') :
            child.url.startsWith('/') ? localizedUrl(config, locale, child.url) : child.url,
        label: child.labels?.[locale] ?? child.labels?.[config.i18n.defaultLocale] ?? translate(config, locale, child.key), target: child.target
      }))];
      return '<span class="navigation-select" hidden>' + icon + '<select name="edgepress-navigation-' + scope + '-' + index + '" data-navigation-select aria-label="' + escapeHtml(label) + '">' +
        '<option value="" selected disabled hidden>' + escapeHtml(label) + '</option>' +
        choices.map(choice => '<option value="' + escapeHtml(choice.path) + '"' + (choice.target === '_blank' ? ' data-target="_blank"' : '') + '>' + escapeHtml(choice.label) + '</option>').join('') +
        '</select></span><noscript>' + choices.map(choice => '<a href="' + escapeHtml(choice.path) + '"' + (choice.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + escapeHtml(choice.label) + '</a>').join('') + '</noscript>';
    }
    return '<a href="' + escapeHtml(path) + '"' + current + attributes + '>' + icon + escapeHtml(label) + '</a>';
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

function lcpImagePreload(html, siteUrl) {
  const pictureMatch = html.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/i);
  if (pictureMatch && /\bfetchpriority=["']high["']/i.test(pictureMatch[0])) {
    const source = pictureMatch[0].match(/<source\b[^>]*>/i)?.[0] || '';
    const img = pictureMatch[0].match(/<img\b[^>]*>/i)?.[0] || '';
    const attr = (tag, name) => tag.match(new RegExp('\\s' + name + '=["\']([^"\']+)["\']', 'i'))?.[1];
    const srcset = attr(source, 'srcset') || attr(img, 'srcset');
    const sizes = attr(source, 'sizes') || attr(img, 'sizes');
    const href = srcset ? srcset.split(',')[0].trim().split(/\s+/)[0] : attr(img, 'src');
    const type = attr(source, 'type');
    if (href && href.startsWith('/')) {
      return '<link rel="preload" as="image" href="' + escapeHtml(href) + '"' +
        (srcset ? ' imagesrcset="' + escapeHtml(srcset) + '"' : '') +
        (sizes ? ' imagesizes="' + escapeHtml(sizes) + '"' : '') +
        (type ? ' type="' + escapeHtml(type) + '"' : '') +
        ' fetchpriority="high">';
    }
  }
  const imgMatch = html.match(/<img\b[^>]*\bfetchpriority=["']high["'][^>]*>/i);
  if (imgMatch) {
    const src = imgMatch[0].match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (src && src.startsWith('/')) {
      return '<link rel="preload" as="image" href="' + escapeHtml(src) + '" fetchpriority="high">';
    }
  }
  return '';
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
  const imagePath = page.image || config.site.seo.image || '';
  const image = imagePath.startsWith('/') && config.site.url ? new URL(imagePath, config.site.url).href : imagePath;
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
      primaryNavigationHtml: navigationItems(config, locale, config.site.navigation, page.urlPath || localizedUrl(config, locale, '')),
      footerNavigationHtml: navigationItems(config, locale, config.site.footerNavigation, '', 'footer'),
      localeLinksHtml,
      stylesheet,
      homePath: localizedUrl(config, locale, ''),
      archivesPath: localizedUrl(config, locale, 'archives/'),
      feedPath: localizedUrl(config, locale, 'rss.xml'),
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
  let filtered = await extensions.filter('html:afterLayout', html, context);
  if (typeof filtered !== 'string') throw new Error('html:afterLayout filters must return a string');

  // Preload faces.css alongside fonts.css to eliminate the CSS @import serial waterfall.
  const headAdditions = [];
  if (!config.site.dataSaver?.enabled) {
    const heroPreload = lcpImagePreload(filtered, config.site.url);
    if (heroPreload) headAdditions.push(heroPreload);
    headAdditions.push('<link rel="preload" as="style" href="/edgepress/fonts/faces.css">');
  }
  headAdditions.push('<link rel="stylesheet" href="/edgepress/fonts.css">');
  if (/class="link-directory-section"/.test(filtered)) headAdditions.push('<link rel="stylesheet" href="/edgepress/link-directory.css">');
  if (/<img\b[^>]*\sloading=["']lazy["']/i.test(filtered)) headAdditions.push('<link rel="stylesheet" href="/edgepress/images.css">');

  const hasLightboxTarget = (/\b(?:post-content|post-change-content|image-block|media-text)\b/.test(filtered) && /<img\b/i.test(filtered)) || /\bdata-edgepress-oembed\b/.test(filtered);
  if (hasLightboxTarget) {
    const keys = ['openImage', 'closeImage', 'zoomIn', 'zoomOut', 'saveOriginal', 'retryMedia', 'loading', 'imageUnavailable'];
    const labels = Object.fromEntries(keys.map(key => [key, translate(config, locale, 'imageViewer' + key[0].toUpperCase() + key.slice(1))]).filter(([key, value]) => value !== 'imageViewer' + key[0].toUpperCase() + key.slice(1)));
    headAdditions.push('<link rel="stylesheet" href="/edgepress/image-viewer.css">');
    filtered = filtered.replace(/<\/body\s*>/i, '<script id="edgepress-image-viewer-config" type="application/json">' + JSON.stringify(labels).replace(/</g, '\\u003c') + '</script><script type="module" src="/edgepress/image-viewer.js"></script></body>');
  }

  const scripts = [];
  if (config.site.externalLinks?.enabled) {
    const labels = Object.fromEntries(['title', 'description', 'back', 'continue'].map(key => [key, translate(config, locale, 'externalLink' + key[0].toUpperCase() + key.slice(1))]));
    const settings = { ...config.site.externalLinks, siteUrl: config.site.url, labels };
    headAdditions.push('<link rel="stylesheet" href="/edgepress/external-links.css">');
    scripts.push('<script id="edgepress-external-links-config" type="application/json">' + JSON.stringify(settings).replace(/</g, '\\u003c') + '</script><script type="module" src="/edgepress/external-links.js"></script>');
  }
  if (/<main\b/i.test(filtered)) scripts.push('<script type="module" src="/edgepress/webmcp.js"></script>');
  if (/data-edgepress-(?:media-viewer|video)(?:\s|=|>)/i.test(filtered)) {
    headAdditions.push('<link rel="stylesheet" href="/edgepress/media-viewer.css">');
    if (!hasLightboxTarget) headAdditions.push('<link rel="stylesheet" href="/edgepress/image-viewer.css">');
    scripts.push('<script type="module" src="/edgepress/media-viewer.js"></script>');
    if (filtered.includes('data-media-service')) scripts.push('<script defer src="/edgepress/services-consent.js"></script>');
  }
  if (/data-edgepress-document(?:\s|=|>)/i.test(filtered)) {
    const keys = ['preview', 'close', 'loading', 'error', 'page', 'sheet'];
    const labels = Object.fromEntries(keys.map(key => [key, translate(config, locale, 'documentViewer' + key[0].toUpperCase() + key.slice(1))]));
    headAdditions.push('<link rel="stylesheet" href="/edgepress/document-viewer/styles.css">');
    scripts.push('<script id="edgepress-document-viewer-config" type="application/json">' + JSON.stringify(labels).replace(/</g, '\\u003c') + '</script><script type="module" src="/edgepress/document-viewer.js"></script>');
    if (filtered.includes('data-document-service')) scripts.push('<script defer src="/edgepress/services-consent.js"></script>');
  }
  if (filtered.includes('data-project-demo')) scripts.push('<script defer src="/edgepress/project-demo.js"></script>');
  if (filtered.includes('data-local-time')) scripts.push('<script defer src="/edgepress/local-time.js"></script>');
  if (filtered.includes('data-navigation-select')) scripts.push('<script defer src="/edgepress/navigation-select.js"></script>');
  if (/<pre\b/i.test(filtered) && !/src=["']\/edgepress\/code-copy\.js["']/i.test(filtered)) {
    scripts.push('<script defer src="/edgepress/code-copy.js"></script>');
  }
  if (/data-post-toc(?:\s|>)/i.test(filtered) && !/src=["']\/edgepress\/post-toc\.js["']/i.test(filtered)) {
    scripts.push('<script defer src="/edgepress/post-toc.js"></script>');
  }
  if (/data-edgepress-search(?:\s|=|>)/i.test(filtered) && !/src=["']\/edgepress\/search\.js["']/i.test(filtered)) {
    scripts.push('<script defer src="/edgepress/search.js"></script>');
  }
  if (/data-edgepress-oembed(?:\s|=|>)/i.test(filtered)) {
    filtered = filtered.replace(/<\/body\s*>/i, '<script type="module" src="/edgepress/oembed.js"></script></body>');
  }
  if (/data-edgepress-service(?:\s|=|>)/i.test(filtered) && !/src=["']\/edgepress\/services-consent\.js["']/i.test(filtered)) {
    scripts.push('<script defer src="/edgepress/services-consent.js"></script>');
  }
  if (config.i18n.locales.length <= 1) {
    filtered = filtered.replace(/<script\s+defer\s+src=["']\/edgepress\/language-select\.js["']\s*><\/script>/gi, '');
  }
  filtered = filtered.replace(/<\/head\s*>/i, headAdditions.join('') + '</head>');
  if (!scripts.length) return filtered;
  const integration = scripts.join('');
  return /<\/body\s*>/i.test(filtered)
    ? filtered.replace(/<\/body\s*>/i, integration + '</body>')
    : filtered + integration;
}
