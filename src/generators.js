import {renderPostServices,hasServiceBlock} from './service-block.js';
import { authorForPost, readingMinutes, filterPostsByCategory, categorySlug, normalizeCategory } from './post-details.js';
import { plainText, renderMarkdownExcerpt } from './markdown.js';
import { renderBlocks } from './page-blocks.js';
import { renderLayout } from './theme.js';
import { localizedUrl, translate } from './i18n.js';
import { postsForLocale, slugify, sortPostsNewest } from './content.js';
import { mapLimit } from './concurrency.js';
import { renderIcon } from './icons.js';

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

function dateLabel(date, language, timeZone = 'UTC') {
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone }).format(date);
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

function decodeHeadingEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function addPostContents(html, locale, config) {
  const headings = [];
  const counts = new Map();
  const content = html.replace(/<h([2-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (whole, levelText, attributes, inner) => {
    const label = decodeHeadingEntities(inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
    if (!label) return whole;
    const base = slugify(label);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    const id = count === 1 ? base : base + '-' + count;
    headings.push({ id, label, level: Number(levelText) });
    const safeAttributes = attributes.replace(/\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return '<h' + levelText + safeAttributes + ' id="' + escapeHtml(id) + '">' + inner + '</h' + levelText + '>';
  });
  if (!headings.length) return { html: content, toc: '' };
  const items = headings.map((heading) => '<li class="post-toc-level-' + heading.level + '"><a href="#' +
    escapeHtml(heading.id) + '">' + escapeHtml(heading.label) + '</a></li>').join('');
  const contentsLabel = translate(config, locale, 'postContents');
  const closeContents = translate(config, locale, 'closeContents');
  const toc = '<aside class="post-toc-widget" data-post-toc hidden>' +
    '<button class="post-toc-toggle" type="button" aria-expanded="false" aria-controls="post-toc-panel" aria-label="' +
    escapeHtml(contentsLabel) + '">' + renderIcon('book-open', 'post-toc-icon') + '<span>' + escapeHtml(contentsLabel) + '</span></button>' +
    '<nav class="post-toc-panel" id="post-toc-panel" aria-labelledby="post-toc-title" aria-label="' +
    escapeHtml(contentsLabel) + '" hidden><div class="post-toc-heading"><h2 id="post-toc-title">' + escapeHtml(contentsLabel) +
    '</h2><button class="post-toc-close" type="button" aria-label="' + escapeHtml(closeContents) + '"><span aria-hidden="true">×</span></button></div>' +
    '<ol>' + items + '</ol></nav></aside>';
  return { html: content, toc };
}

function renderPostVideo(video, locale) {
  if (!video) return '';
  const videoTitle = escapeHtml(video.title);
  return '<figure class="post-video"><video controls playsinline preload="metadata" poster="' + escapeHtml(video.poster) + '" aria-label="' +
    escapeHtml(video.alt) + '"><source src="' + escapeHtml(video.src) + '" type="video/mp4"><track kind="captions" src="' +
    escapeHtml(video.captions) + '" srclang="' + escapeHtml(video.captionLanguage) + '" label="' + escapeHtml(video.captionLabel) + '" default>' +
    '<a href="' + escapeHtml(video.src) + '">' + (locale.toLowerCase().startsWith('zh') ? '下载 MP4 视频' : 'Download the MP4 video') +
    '</a></video><figcaption><strong>' + videoTitle + '</strong><br>' + escapeHtml(video.description) + '</figcaption></figure>';
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
  body = body.replace(/<pre\b/gi, '<pre data-copyable-code');
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

function renderPostAuthor(post, locale, config) {
  if (!post.author) return '';
  return '<span class="post-author">' + escapeHtml(translate(config, locale, 'postAuthor').replace('{author}', post.author)) + '</span>';
}

async function renderPostCard(post, locale, config, showLanguage = false) {
  const summary = await renderMarkdownExcerpt(post.description || post.markdown, config.markdown);
  const postLanguage = showLanguage && post.locale !== locale ? translate(config, post.locale, 'languageName') : '';
  return '<article class="post-card" lang="' + escapeHtml(post.locale) + '"><h2><a href="' + escapeHtml(urlFor(post.path)) + '">' + escapeHtml(post.title) + '</a></h2>' +
    '<p class="meta"><time data-local-time data-time-locale="' + escapeHtml(post.locale || locale) + '" data-date-only="' + (post.dateOnly === true) + '" datetime="' + (post.dateOnly ? post.date.toISOString().slice(0,10) : post.date.toISOString()) + '">' + escapeHtml(dateLabel(post.date, post.locale, post.dateOnly ? 'UTC' : config.site.timeZone)) + '</time>' +
    (postLanguage ? ' · <span class="post-language" lang="' + escapeHtml(post.locale) + '">' + escapeHtml(postLanguage) + '</span>' : '') +
    (post.author ? ' · ' + renderPostAuthor(post, locale, config) : '') + '</p><div class="post-excerpt" lang="' + escapeHtml(post.locale) + '">' +
    summary + '</div></article>';
}

function paginationPageNumbers(currentPage, totalPages) {
  const visible = new Set([1, totalPages]);
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) visible.add(page);
  const pages = [...visible].sort((left, right) => left - right);
  const entries = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) {
      if (page - previous === 2) entries.push(previous + 1);
      else entries.push(null);
    }
    entries.push(page);
  }
  return entries;
}

function renderPagination(locale, currentPage, totalPages, config, pageUrl) {
  const label = (key) => translate(config, locale, key);
  const pageLinks = paginationPageNumbers(currentPage, totalPages).map((page) => {
    if (page === null) return '<li class="pagination-ellipsis" aria-hidden="true">…</li>';
    if (page === currentPage) return '<li><span class="pagination-current" aria-current="page">' + page + '</span></li>';
    const pageLabel = label('pageNumber').replace('{page}', String(page));
    return '<li><a href="' + escapeHtml(pageUrl(page)) + '" aria-label="' + escapeHtml(pageLabel) + '">' + page + '</a></li>';
  }).join('');
  const previous = currentPage > 1
    ? '<a rel="prev" href="' + escapeHtml(pageUrl(currentPage - 1)) + '">' + escapeHtml(label('newer')) + '</a>' : '';
  const next = currentPage < totalPages
    ? '<a rel="next" href="' + escapeHtml(pageUrl(currentPage + 1)) + '">' + escapeHtml(label('older')) + '</a>' : '';
  return '<nav class="pagination" aria-label="' + escapeHtml(label('pagination')) + '">' + previous +
    '<ol class="pagination-pages">' + pageLinks + '</ol>' + next + '</nav>';
}

async function pageBodyForDocument(page, site, config, locale, isHomepage = false, renderContext = {}) {
  const content = await renderBlocks(page.blocks, { config, locale, site, document: page, isHomepage, ...renderContext });
  const firstElement = page.blocks[0]?.cells?.[0]?.[0];
  const needsTitle = !isHomepage || firstElement?.type !== 'hero';
  const title = needsTitle ? '<header class="page-title"><h1>' + escapeHtml(page.title) + '</h1></header>' : '';
  return '<article class="page-builder">' + title + content + '</article>';
}

function paginatedLatestPostsSize(page) {
  function find(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = find(item);
        if (result !== null) return result;
      }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    if (value.type === 'latest-posts' && value.paginate === true) return value.count ?? 3;
    return find(value.cells) ?? find(value.blocks);
  }
  return find(page?.blocks);
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

  const allPosts = sortPostsNewest(site.posts);
  for (const locale of config.i18n.locales) {
    const posts = allPosts.filter((post) => post.locale === locale);
    const localizedPosts = postsForLocale(allPosts, locale, defaultLocale);
    const archivePosts = filterPostsByCategory(localizedPosts, config.site.archive?.categories);
    const pages = site.pages.filter((page) => page.locale === locale && !page.homepage);
    const homePage = homepageDocument(site.pages, locale, defaultLocale);
    const latestPostsPageSize = paginatedLatestPostsSize(homePage);
    if (latestPostsPageSize !== null && (!Number.isInteger(latestPostsPageSize) || latestPostsPageSize < 1 || latestPostsPageSize > 12)) {
      throw new Error('A paginated latest-posts block must use a count from 1 to 12');
    }
    const homepageArchivePages = latestPostsPageSize ? Math.ceil(archivePosts.length / latestPostsPageSize) : 0;
    const prefix = locale === defaultLocale ? '' : locale + '/';
    const label = (key) => translate(config, locale, key);
    const localeHomeUrl = localizedUrl(config, locale, '');
    allPagePaths.add(localeHomeUrl);

    if (homePage) {
      const latestPostsPagination = latestPostsPageSize ? {
        totalPages: homepageArchivePages,
        archiveUrl: localizedUrl(config, locale, 'archives/'),
        olderUrl: localizedUrl(config, locale, 'archives/page/2/')
      } : null;
      const body = await pageBodyForDocument(homePage, site, config, locale, true, { latestPostsPagination });
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
      const totalPages = Math.max(1, Math.ceil(archivePosts.length / config.pagination.perPage));
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const subset = archivePosts.slice((pageNumber - 1) * config.pagination.perPage, pageNumber * config.pagination.perPage);
        const cards = await Promise.all(subset.map((post) => renderPostCard(post, locale, config, true)));
        const body = '<section class="intro"><h1>' + escapeHtml(config.site.title) + '</h1><p>' + escapeHtml(config.site.description) +
          '</p></section><section class="post-list" aria-label="' + escapeHtml(label('latestPosts')) + '">' +
          (cards.length ? '<div class="post-list archive-post-list">' + cards.join('') + '</div>' : '<p>' + escapeHtml(label('noPosts')) + '</p>') +
          '</section>' + (pageNumber === 1 && pages.length ? '<section class="page-links"><h2>' + escapeHtml(label('pages')) + '</h2><ul>' +
            pages.map((page) => '<li><a href="' + escapeHtml(urlFor(page.path)) + '">' + escapeHtml(page.title) + '</a></li>').join('') + '</ul></section>' : '') +
          (totalPages > 1 ? renderPagination(locale, pageNumber, totalPages, config, (page) =>
            localizedUrl(config, locale, page === 1 ? '' : 'page/' + page + '/')) : '');
        const routePath = pageNumber === 1 ? prefix + 'index.html' : prefix + 'page/' + pageNumber + '/index.html';
        routes.push(await pageRoute(routePath, pageNumber === 1 ? config.site.title : 'Page ' + pageNumber,
          config.site.description, body, locale, config, extensions));
      }
    }

    for (const post of posts) allPagePaths.add(urlFor(post.path));
    const postRoutes = await mapLimit(posts, config.concurrency, async (post) => {
      const renderedMarkdown = addPostContents(post.html, locale, config);
      const author = authorForPost(post, config);
      const minutes = post.readingMinutes || readingMinutes(post.markdown);
      const authorHtml = author.name ? '<span class="post-author">' +
        (author.avatar ? '<img class="author-avatar" src="' + escapeHtml(author.avatar) + '" width="40" height="40" alt="" decoding="async">' : '') +
        escapeHtml(label('postAuthor').replace('{author}', author.name)) + '</span>' : '';
      const tagsHtml = post.tags.length ? '<div class="post-tags" role="group" aria-label="' + escapeHtml(label('tags')) + '"><span class="post-tags-label">' +
        escapeHtml(label('tags')) + ':</span>' + post.tags.map(tag => '<span class="post-tag">' + escapeHtml(tag) + '</span>').join('') + '</div>' : '';
      const body = '<article class="post"><header><h1>' + escapeHtml(post.title) + '</h1><div class="meta post-byline">' + authorHtml +
        '<time data-local-time data-time-locale="' + escapeHtml(post.locale || locale) + '" data-date-only="' + (post.dateOnly === true) + '" datetime="' + (post.dateOnly ? post.date.toISOString().slice(0,10) : post.date.toISOString()) + '">' + escapeHtml(dateLabel(post.date, locale, post.dateOnly ? 'UTC' : config.site.timeZone)) + '</time>' +
        '<span class="post-reading-time" data-reading-minutes="' + minutes + '">' + escapeHtml(label('postReadingTime').replace('{minutes}', minutes)) + '</span>' +
        (post.updated ? '<span class="post-updated">' + escapeHtml(label('postUpdated')) + ' <time data-local-time data-time-locale="' + escapeHtml(locale) + '" datetime="' + post.updated.toISOString() + '">' + escapeHtml(dateLabel(post.updated, locale, config.site.timeZone)) + '</time></span>' : '') +
        '</div>' + tagsHtml + '</header>' + (post.showChanges && post.changes ? '<details class="post-changes"><summary>' + escapeHtml(label('postChanges')) + '</summary><pre><code>' + escapeHtml(post.changes) + '</code></pre></details>' : '') + renderPostVideo(post.video, locale) + renderedMarkdown.toc + '<div class="post-content">' + renderedMarkdown.html +
        '</div></article>' + renderPostServices(post, locale, config);
      const canonicalPath = urlFor(post.path);
      return pageRoute(post.path + 'index.html', post.title, post.description || plainText(post.markdown).slice(0, 160), body,
        locale, config, extensions, {
          urlPath: canonicalPath, keywords: post.tags, image: post.image, robots: post.robots,
          structuredData: {
            '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
            description: post.description || plainText(post.markdown).slice(0, 160),
            datePublished: post.dateOnly ? post.date.toISOString().slice(0,10) : post.date.toISOString(), dateModified: post.updated ? post.updated.toISOString() : post.dateOnly ? post.date.toISOString().slice(0,10) : post.date.toISOString(),
            author: { '@type': 'Person', name: author.name || config.site.title },
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
    const archivePageSize = latestPostsPageSize || config.pagination.perPage;
    const archivePageCount = Math.max(1, Math.ceil(archivePosts.length / archivePageSize));
    for (let pageNumber = 1; pageNumber <= archivePageCount; pageNumber += 1) {
      const subset = archivePosts.slice((pageNumber - 1) * archivePageSize, pageNumber * archivePageSize);
      const cards = await Promise.all(subset.map((post) => renderPostCard(post, locale, config, true)));
      const archiveUrl = pageNumber === 1 ? 'archives/' : 'archives/page/' + pageNumber + '/';
      const pagination = archivePageCount > 1
        ? renderPagination(locale, pageNumber, archivePageCount, config, (page) => localizedUrl(config, locale,
          page === 1 ? 'archives/' : 'archives/page/' + page + '/')) : '';
      const archiveBody = '<section><h1>' + escapeHtml(label('archives')) + '</h1>' +
        (cards.length ? '<div class="post-list archive-post-list">' + cards.join('') + '</div>' : '<p>' + escapeHtml(label('noPosts')) + '</p>') + pagination + '</section>';
      routes.push(await pageRoute(prefix + (pageNumber === 1 ? 'archives/index.html' : 'archives/page/' + pageNumber + '/index.html'),
        pageNumber === 1 ? label('archives') : label('archives') + ' · ' + pageNumber, label('allPosts'), archiveBody, locale, config, extensions,
        { urlPath: localizedUrl(config, locale, archiveUrl) }));
      allPagePaths.add(localizedUrl(config, locale, archiveUrl));
    }

    const categories = new Map();
    for (const post of localizedPosts) {
      const category = normalizeCategory(post.category);
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category).push(post);
    }
    for (const [category, categoryPosts] of categories) {
      const slug = categorySlug(category);
      const title = category === 'blog' ? label('categoryBlog') : category === 'uncategorized' ? label('categoryUncategorized') : category;
      const totalPages = Math.ceil(categoryPosts.length / config.pagination.perPage);
      const categoryPath = number => 'categories/' + slug + '/' + (number === 1 ? '' : 'page/' + number + '/');
      for (let number = 1; number <= totalPages; number += 1) {
        const cards = await Promise.all(categoryPosts.slice((number - 1) * config.pagination.perPage, number * config.pagination.perPage)
          .map(post => renderPostCard(post, locale, config, true)));
        const pagination = totalPages > 1 ? renderPagination(locale, number, totalPages, config,
          page => localizedUrl(config, locale, categoryPath(page))) : '';
        const body = '<section><h1>' + escapeHtml(title) + '</h1><div class="post-list archive-post-list">' + cards.join('') + '</div>' + pagination + '</section>';
        const urlPath = localizedUrl(config, locale, categoryPath(number));
        allPagePaths.add(urlPath);
        routes.push(await pageRoute(prefix + categoryPath(number) + 'index.html', title, title, body, locale, config, extensions, { urlPath }));
      }
    }

    const searchable = [
      ...posts.map((post) => ({ title: post.title, author: post.author, date: post.dateOnly ? post.date.toISOString().slice(0,10) : post.date.toISOString(), dateOnly: post.dateOnly, url: urlFor(post.path), summary: plainText(post.description || post.markdown).slice(0, 220), content: plainText(post.markdown), type: 'post' })),
      ...pages.map((page) => ({ title: page.title, url: urlFor(page.path), summary: page.description || plainText(page.markdown).slice(0, 220), type: 'page' }))
    ];
    routes.push(fileRoute(prefix + 'search.json', JSON.stringify(searchable), 'application/json; charset=utf-8'));

    const searchBody = '<section class="local-search-page"><h1>' + escapeHtml(label('searchPosts')) + '</h1>' +
      '<p>' + escapeHtml(label('searchIntro')) + '</p><form class="local-search-form" data-edgepress-search data-index="' +
      escapeHtml(localizedUrl(config, locale, 'search.json')) + '"><label for="edgepress-search-query">' + escapeHtml(label('searchLabel')) +
      '</label><div class="local-search-controls"><input id="edgepress-search-query" name="q" type="search" autocomplete="off" ' +
      '><button type="submit">' + escapeHtml(label('searchButton')) + '</button></div>' +
      '</form><p id="edgepress-search-status" role="status" aria-live="polite">' +
      '' + '</p><ol id="edgepress-search-results" class="local-search-results"></ol>' +
      '<noscript><p>' + escapeHtml(label('searchNeedsJavaScript')) + '</p></noscript></section>';
    routes.push(await pageRoute(prefix + 'search/index.html', label('searchPosts'), label('searchIntro'), searchBody,
      locale, config, extensions));

    const base = config.site.url;
    const entries = posts.slice(0, 20).map((post) => '<entry><title>' + escapeXml(post.title) + '</title>' +
      (post.author ? '<author><name>' + escapeXml(post.author) + '</name></author>' : '') + '<link href="' +
      escapeXml(base + urlFor(post.path)) + '"/><id>' + escapeXml(base + urlFor(post.path)) + '</id><updated>' + post.date.toISOString() +
      '</updated><summary>' + escapeXml(plainText(post.description || post.markdown).slice(0, 220)) + '</summary></entry>').join('');
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
  const discussions = config.browserPlugins.services.some(service => service.enabled !== false && service.provider === 'external-widget') ? [
    ...site.posts.filter(post => !post.draft).map(post => ({thread:post.bundlePath,title:post.title})),
    ...site.pages.filter(page => !page.draft && hasServiceBlock(page.blocks)).map(page => ({thread:'page:' + page.bundlePath,title:page.title}))
  ] : [];
  routes.push(fileRoute('edgepress/service-contexts.json', JSON.stringify([...new Map(discussions.map(item => [item.thread,item])).values()]), 'application/json; charset=utf-8'));
  return routes;
}
