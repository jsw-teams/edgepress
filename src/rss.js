import { renderMarkdown, plainText } from './markdown.js';
import { localizedContentUrl, localizedUrl } from './i18n.js';
import { authorForPost, normalizeCategory } from './post-details.js';

function xml(value) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function decodeAttribute(value) {
  return String(value).replace(/&(?:amp|quot|apos|lt|gt);/gi, entity => ({
    '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>'
  })[entity.toLowerCase()]);
}

// Feed HTML has no reliable base URL. Its images and internal links must work
// independently of the original article page, without adding active embeds.
export function absoluteContentUrls(html, articleUrl) {
  return String(html).replace(/\b(href|src)="([^"]*)"/g, (attribute, name, encoded) => {
    const value = decodeAttribute(encoded);
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return attribute;
    try {
      const url = new URL(value, articleUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return attribute;
      return name + '="' + url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
    } catch {
      return attribute;
    }
  });
}

function canonicalUrl(post, config) {
  return config.site.url + '/' + String(post.path).split('/').filter(Boolean).map(encodeURIComponent).join('/') + '/';
}

function lastChanged(post) {
  return post.updated instanceof Date && post.updated > post.date ? post.updated : post.date;
}

function categories(post) {
  const category = normalizeCategory(post.category);
  return [...new Set([...(category === 'uncategorized' ? [] : [category]), ...(post.tags || [])])];
}

function isSiteImage(href, config) {
  const value = String(href ?? '');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === new URL(config.site.url).origin ? value : '';
  } catch { return ''; }
}

// Returns a single standard RSS 2.0 document; no hand-maintained XML assets.
export async function generateRssRoute(posts, config, locale) {
  const prefix = locale === config.i18n.defaultLocale ? '' : locale + '/';
  const homeUrl = config.site.url + localizedUrl(config, locale, '');
  const rssUrl = config.site.url + localizedUrl(config, locale, 'rss.xml');
  const items = await Promise.all(posts.slice(0, 20).map(async post => {
    const url = canonicalUrl(post, config);
    // Re-render static Markdown with the normal sanitizer. Omit interactive
    // embed/player markup and remote images that may bypass reader consent.
    const rendered = await renderMarkdown(post.markdown || '', {
      ...config.markdown,
      linkResolver: href => localizedContentUrl(config, post.locale, href),
      imageResolver: href => isSiteImage(href, config),
      allowVideo: false
    });
    return {
      url, title: post.title,
      author: authorForPost(post, config).name || config.site.title,
      locale: post.locale, published: post.date, updated: lastChanged(post),
      summary: plainText(post.description || post.markdown).slice(0, 220),
      content: absoluteContentUrls(rendered, url), categories: categories(post)
    };
  }));
  const lastBuild = items.reduce((latest, item) => item.updated > latest ? item.updated : latest, new Date(0));
  const rssItems = items.map(item =>
    '<item><title>' + xml(item.title) + '</title><link>' + xml(item.url) + '</link>' +
    '<guid isPermaLink="true">' + xml(item.url) + '</guid>' +
    '<pubDate>' + item.published.toUTCString() + '</pubDate>' +
    '<dc:date>' + item.updated.toISOString() + '</dc:date>' +
    '<dc:creator>' + xml(item.author) + '</dc:creator>' +
    '<dc:language>' + xml(item.locale) + '</dc:language>' +
    '<description>' + xml(item.summary) + '</description>' +
    item.categories.map(category => '<category>' + xml(category) + '</category>').join('') +
    '<content:encoded>' + xml(item.content) + '</content:encoded></item>'
  ).join('');
  const rss = '<?xml version="1.0" encoding="utf-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>' +
    '<title>' + xml(config.site.title) + '</title><link>' + xml(homeUrl) + '</link>' +
    '<description>' + xml(config.site.description) + '</description><language>' + xml(locale) + '</language>' +
    '<lastBuildDate>' + lastBuild.toUTCString() + '</lastBuildDate>' +
    '<atom:link href="' + xml(rssUrl) + '" rel="self" type="application/rss+xml"/>' +
    rssItems + '</channel></rss>';
  return { path: prefix + 'rss.xml', body: rss, contentType: 'application/rss+xml; charset=utf-8' };
}
