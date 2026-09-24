import { plainText } from './markdown.js';
import { renderBlocks } from './page-blocks.js';
import { renderLayout } from './theme.js';
import { localizedUrl, translate } from './i18n.js';
import { slugify } from './content.js';
import { mapLimit } from './concurrency.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[char]);
}

function urlFor(path) {
  const parts = String(path ?? '').split('/').filter(Boolean).map(encodeURIComponent);
  return '/' + parts.join('/') + (String(path).endsWith('/') && parts.length ? '/' : '');
}

function tagSlug(tag) {
  if (/[^\x00-\x7F]/.test(tag)) return 'tag-' + Array.from(tag).map((char) => char.codePointAt(0).toString(16)).join('-');
  return slugify(tag);
}

function dateLabel(date, language) {
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function fileRoute(path, body, contentType = 'text/html; charset=utf-8') {
  return { path, body, contentType };
}

function urlPathForRoute(path) {
  const value = String(path).replace(/\\/g, '/');
  if (value === 'index.html') return '/';
  if (value.endsWith('/index.html')) return '/' + value.slice(0, -'index.html'.length);
  return '/' + value;
}

async function pageRoute(path, title, description, body, locale, config, extensions, metadata = {}) {
  const urlPath = metadata.urlPath || urlPathForRoute(path);
  const structuredData = metadata.structuredData ?? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: description || config.site.description,
    url: config.site.url ? config.site.url + urlPath : undefined,
    inLanguage: locale,
    isPartOf: config.site.url ? { '@type': 'WebSite', name: config.site.title, url: config.site.url } : undefined
  };
  let html = await renderLayout(config, extensions, {
    title,
    description,
    locale,
    urlPath,
    keywords: metadata.keywords,
    image: metadata.image,
    robots: metadata.robots,
    structuredData
  }, body);
  if (config.preview) {
    html = html.replace(/<\/body>/i, '<script defer src="/__edgepress_preview.js"></script></body>');
  }
  return fileRoute(path, html);
}

function renderPostCard(post, locale) {
  const summary = post.description || plainText(post.markdown).slice(0, 220);
  return '<article class="post-card"><h2><a href="' + escapeHtml(urlFor(post.path)) + '">' + escapeHtml(post.title) + '</a></h2>' +
    '<p class="meta"><time datetime="' + post.date.toISOString() + '">' + escapeHtml(dateLabel(post.date, locale)) + '</time></p><p>' +
    escapeHtml(summary) + '</p></article>';
}

async function pageBodyForDocument(page, site, config, locale, isHomepage = false) {
  const content = await renderBlocks(page.blocks, { config, locale, site, isHomepage });
  const firstElement = page.blocks[0]?.cells?.[0]?.[0];
  const needsTitle = !isHomepage || firstElement?.type !== 'hero';
  const title = needsTitle ? '<header class="page-title"><h1>' + escapeHtml(page.title) + '</h1></header>' : '';
  return '<article class="page-builder">' + title + content + '</article>';
}

function homepageDocument(pages, locale, defaultLocale) {
  return pages.find((page) => page.homepage && page.locale === locale) ||
    pages.find((page) => page.homepage && page.locale === defaultLocale) || null;
}

export async function generateBuiltinRoutes(site, config, extensions) {
  const routes = [];
  const allPagePaths = new Set();
  const defaultLocale = config.i18n.defaultLocale;
  const homepages = site.pages.filter((page) => page.homepage);
  const homepageLocales = new Set();
  for (const page of homepages) {
    if (homepageLocales.has(page.locale)) throw new Error('Only one homepage may be configured for locale ' + page.locale);
    homepageLocales.add(page.locale);
  }

  for (const locale of config.i18n.locales) {
    const posts = site.posts.filter((post) => post.locale === locale).sort((a, b) => b.date - a.date);
    const pages = site.pages.filter((page) => page.locale === locale && !page.homepage);
    const homePage = homepageDocument(site.pages, locale, defaultLocale);
    const prefix = locale === defaultLocale ? '' : locale + '/';
    const label = (key) => translate(config, locale, key);
    const localeHomeUrl = localizedUrl(config, locale, '');
    allPagePaths.add(localeHomeUrl);

    if (homePage) {
      const body = await pageBodyForDocument(homePage, site, config, locale, true);
      routes.push(await pageRoute(prefix + 'index.html', homePage.title, homePage.description || config.site.description,
        body, locale, config, extensions, {
          urlPath: localeHomeUrl,
          keywords: homePage.keywords,
          image: homePage.image,
          robots: homePage.robots,
          structuredData: {
            '@context': 'https://schema.org', '@type': 'WebSite', name: config.site.title,
            description: homePage.description || config.site.description,
            url: config.site.url ? config.site.url + localeHomeUrl : undefined,
            inLanguage: locale,
            publisher: config.site.seo.author ? { '@type': 'Organization', name: config.site.seo.author } : undefined
          }
        }));
    } else {
      const totalPages = Math.max(1, Math.ceil(posts.length / config.pagination.perPage));
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const subset = posts.slice((pageNumber - 1) * config.pagination.perPage, pageNumber * config.pagination.perPage);
        const body = '<section class="intro"><h1>' + escapeHtml(config.site.title) + '</h1><p>' + escapeHtml(config.site.description) +
          '</p></section><section class="post-list" aria-label="' + escapeHtml(label('latestPosts')) + '">' +
          (subset.length ? subset.map((post) => renderPostCard(post, locale)).join('') : '<p>' + escapeHtml(label('noPosts')) + '</p>') +
          '</section>' + (pageNumber === 1 && pages.length ? '<section class="page-links"><h2>' + escapeHtml(label('pages')) + '</h2><ul>' +
            pages.map((page) => '<li><a href="' + escapeHtml(urlFor(page.path)) + '">' + escapeHtml(page.title) + '</a></li>').join('') + '</ul></section>' : '') +
          (totalPages > 1 ? '<nav class="pagination" aria-label="' + escapeHtml(label('pagination')) + '">' +
            (pageNumber > 1 ? '<a href="' + escapeHtml(pageNumber === 2 ? localizedUrl(config, locale, '') : localizedUrl(config, locale, 'page/' + (pageNumber - 1) + '/')) + '">' + escapeHtml(label('newer')) + '</a>' : '') +
            (pageNumber < totalPages ? '<a href="' + escapeHtml(localizedUrl(config, locale, 'page/' + (pageNumber + 1) + '/')) + '">' + escapeHtml(label('older')) + '</a>' : '') + '</nav>' : '');
        const routePath = pageNumber === 1 ? prefix + 'index.html' : prefix + 'page/' + pageNumber + '/index.html';
        routes.push(await pageRoute(routePath, pageNumber === 1 ? config.site.title : 'Page ' + pageNumber,
          config.site.description, body, locale, config, extensions));
      }
    }

    for (const post of posts) allPagePaths.add(urlFor(post.path));
    const postRoutes = await mapLimit(posts, config.concurrency, async (post) => {
      const body = '<article class="post"><header><h1>' + escapeHtml(post.title) + '</h1><p class="meta"><time datetime="' + post.date.toISOString() + '">' +
        escapeHtml(dateLabel(post.date, locale)) + '</time></p></header><div class="post-content">' + post.html + '</div>' +
        (post.tags.length ? '<p class="tags">' + escapeHtml(label('tags')) + ': ' + post.tags.map((tag) => '<a href="' +
          escapeHtml(localizedUrl(config, locale, 'tags/' + tagSlug(tag) + '/')) + '">' + escapeHtml(tag) + '</a>').join(' ') + '</p>' : '') + '</article>';
      const canonicalPath = urlFor(post.path);
      return pageRoute(post.path + 'index.html', post.title, post.description || plainText(post.markdown).slice(0, 160), body,
        locale, config, extensions, {
          urlPath: canonicalPath, keywords: post.tags, image: post.image, robots: post.robots,
          structuredData: {
            '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
            description: post.description || plainText(post.markdown).slice(0, 160),
            datePublished: post.date.toISOString(), dateModified: post.date.toISOString(),
            author: { '@type': 'Person', name: config.site.seo.author || config.site.title },
            mainEntityOfPage: config.site.url ? config.site.url + canonicalPath : undefined,
            inLanguage: locale
          }
        });
    });
    routes.push(...postRoutes);

    for (const page of pages) allPagePaths.add(urlFor(page.path));
    const pageRoutes = await mapLimit(pages, config.concurrency, async (page) => {
      const body = await pageBodyForDocument(page, site, config, locale, false);
      return pageRoute(page.path ? page.path + 'index.html' : prefix + 'index.html', page.title,
        page.description || config.site.description, body, locale, config, extensions, {
          urlPath: urlFor(page.path), keywords: page.keywords, image: page.image, robots: page.robots
        });
    });
    routes.push(...pageRoutes);

    if (!homePage) allPagePaths.add(localizedUrl(config, locale, ''));
    const archiveBody = '<section><h1>' + escapeHtml(label('archives')) + '</h1>' +
      (posts.length ? posts.map((post) => renderPostCard(post, locale)).join('') : '<p>' + escapeHtml(label('noPosts')) + '</p>') + '</section>';
    routes.push(await pageRoute(prefix + 'archives/index.html', label('archives'), label('allPosts'), archiveBody, locale, config, extensions));

    const tags = new Map();
    for (const post of posts) for (const tag of post.tags) {
      const slug = tagSlug(tag);
      if (!tags.has(slug)) tags.set(slug, { label: tag, posts: [] });
      tags.get(slug).posts.push(post);
    }
    const tagRoutes = await mapLimit([...tags.entries()], config.concurrency, async ([slug, value]) => {
      const body = '<section><h1>' + escapeHtml(label('tag')) + ': ' + escapeHtml(value.label) + '</h1>' +
        value.posts.map((post) => renderPostCard(post, locale)).join('') + '</section>';
      return pageRoute(prefix + 'tags/' + slug + '/index.html', label('tag') + ': ' + value.label,
        label('tag') + ' ' + value.label, body, locale, config, extensions);
    });
    routes.push(...tagRoutes);

    const searchable = [
      ...posts.map((post) => ({ title: post.title, date: post.date.toISOString(), url: urlFor(post.path), summary: post.description || plainText(post.markdown).slice(0, 220), content: plainText(post.markdown), type: 'post' })),
      ...pages.map((page) => ({ title: page.title, url: urlFor(page.path), summary: page.description || plainText(page.markdown).slice(0, 220), type: 'page' }))
    ];
    routes.push(fileRoute(prefix + 'search.json', JSON.stringify(searchable), 'application/json; charset=utf-8'));

    const searchBody = '<section class="local-search-page"><h1>' + escapeHtml(label('searchPosts')) + '</h1>' +
      '<p>' + escapeHtml(label('searchIntro')) + '</p><form class="local-search-form" data-edgepress-search data-index="' +
      escapeHtml(localizedUrl(config, locale, 'search.json')) + '"><label for="edgepress-search-query">' + escapeHtml(label('searchLabel')) +
      '</label><div class="local-search-controls"><input id="edgepress-search-query" name="q" type="search" autocomplete="off" ' +
      'aria-describedby="edgepress-search-hint"><button type="submit">' + escapeHtml(label('searchButton')) + '</button></div>' +
      '<p id="edgepress-search-hint">' + escapeHtml(label('searchHint')) + '</p></form><p id="edgepress-search-status" role="status" aria-live="polite">' +
      escapeHtml(label('searchPrompt')) + '</p><ol id="edgepress-search-results" class="local-search-results"></ol>' +
      '<noscript><p>' + escapeHtml(label('searchNeedsJavaScript')) + '</p></noscript></section>' +
      '<script defer src="/edgepress/search.js"></script>';
    routes.push(await pageRoute(prefix + 'search/index.html', label('searchPosts'), label('searchIntro'), searchBody,
      locale, config, extensions));

    const base = config.site.url;
    const entries = posts.slice(0, 20).map((post) => '<entry><title>' + escapeXml(post.title) + '</title><link href="' +
      escapeXml(base + urlFor(post.path)) + '"/><id>' + escapeXml(base + urlFor(post.path)) + '</id><updated>' + post.date.toISOString() +
      '</updated><summary>' + escapeXml(post.description || plainText(post.markdown).slice(0, 220)) + '</summary></entry>').join('');
    routes.push(fileRoute(prefix + 'feed.xml', '<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>' +
      escapeXml(config.site.title) + '</title><id>' + escapeXml(base || 'urn:edgepress:site') + '</id><updated>' +
      (posts[0]?.date.toISOString() || new Date(0).toISOString()) + '</updated>' + entries + '</feed>', 'application/atom+xml; charset=utf-8'));
  }

  const base = config.site.url;
  const sitemap = '<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    [...allPagePaths].map((path) => '<url><loc>' + escapeXml(base + path) + '</loc></url>').join('') + '</urlset>';
  routes.push(fileRoute('sitemap.xml', sitemap, 'application/xml; charset=utf-8'));
  const agentNames = config.site.agentSeo.enabled ? config.site.agentSeo.agentCrawlers : [];
  const robots = ['User-agent: *', 'Allow: /', ...agentNames.flatMap((name) => ['', 'User-agent: ' + name, 'Allow: /']), '',
    'Sitemap: ' + (base ? base + '/sitemap.xml' : '/sitemap.xml'), ''].join('\n');
  routes.push(fileRoute('robots.txt', robots, 'text/plain; charset=utf-8'));
  if (config.preview) {
    routes.push(fileRoute('__edgepress_preview.json', JSON.stringify({ buildId: config.previewBuildId }), 'application/json; charset=utf-8'));
    routes.push(fileRoute('__edgepress_preview.js', '(()=>{let seen="";const poll=async()=>{try{const response=await fetch("/__edgepress_preview.json?ts="+Date.now(),{cache:"no-store"});if(!response.ok)return;const state=await response.json();if(seen&&state.buildId!==seen){window.location.reload();return}seen=state.buildId}catch{}};void poll();window.setInterval(poll,1000)})();', 'text/javascript; charset=utf-8'));
  }
  if (config.site.agentSeo.enabled && config.site.agentSeo.llmsTxt) {
    const sections = [...site.pages.filter((page) => !page.draft), ...site.posts.slice(0, 30)];
    const lines = ['# ' + config.site.title, '', config.site.agentSeo.summary || config.site.description, ''];
    if (config.site.agentSeo.topics.length) lines.push('Topics: ' + config.site.agentSeo.topics.join(', '), '');
    lines.push('## Project pages', '');
    for (const page of sections.filter((item) => item.kind === 'pages')) lines.push('- [' + page.title + '](' + base + urlFor(page.path) + '): ' + (page.description || plainText(page.markdown).slice(0, 240)));
    lines.push('', '## Recent posts', '');
    for (const post of sections.filter((item) => item.kind === 'posts').slice(0, 30)) lines.push('- [' + post.title + '](' + base + urlFor(post.path) + '): ' + (post.description || plainText(post.markdown).slice(0, 240)));
    routes.push(fileRoute('llms.txt', lines.join('\n') + '\n', 'text/plain; charset=utf-8'));
  }

  for (const locale of config.i18n.locales) {
    const prefix = locale === defaultLocale ? '' : locale + '/';
    const notFoundTitle = translate(config, locale, 'notFound');
    const notFoundText = translate(config, locale, 'notFoundText');
    const notFoundBody = '<section class="error-page"><p class="error-code" aria-hidden="true">404</p><h1>' + escapeHtml(notFoundTitle) +
      '</h1><p>' + escapeHtml(notFoundText) + '</p><p><a class="button" href="' + escapeHtml(localizedUrl(config, locale, '')) + '">' +
      escapeHtml(translate(config, locale, 'returnHome')) + '</a></p></section>';
    routes.push(await pageRoute(prefix + '404.html', notFoundTitle, notFoundText, notFoundBody, locale, config, extensions, { robots: 'noindex,follow' }));
    const forbiddenTitle = translate(config, locale, 'forbidden');
    const forbiddenText = translate(config, locale, 'forbiddenText');
    const forbiddenBody = '<section class="error-page"><p class="error-code" aria-hidden="true">403</p><h1>' + escapeHtml(forbiddenTitle) +
      '</h1><p>' + escapeHtml(forbiddenText) + '</p><p><a class="button" href="' + escapeHtml(localizedUrl(config, locale, '')) + '">' +
      escapeHtml(translate(config, locale, 'returnHome')) + '</a></p></section>';
    routes.push(await pageRoute(prefix + '403.html', forbiddenTitle, forbiddenText, forbiddenBody, locale, config, extensions, { robots: 'noindex,nofollow' }));
  }
  return routes;
}
