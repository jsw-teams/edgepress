import {renderServiceBlock} from './service-block.js';
import {renderDocument} from './document.js';
import {renderMediaViewer} from './media-viewer.js';
import {renderEmbed, renderPageText} from './embed.js';
import { renderMarkdownExcerpt } from './markdown.js';
import { localizedContentUrl, translate, translateValue } from './i18n.js';
import { isIconName, renderIcon } from './icons.js';
import { postsForLocale } from './content.js';
import { categoryFilter, filterPostsByCategory, categorySlug, sortPinnedPosts } from './post-details.js';

const captchaProviders = new Set(['cloudflare-turnstile', 'google-recaptcha', 'hcaptcha']);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function text(value, label, limit = 4000, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || value.length > limit) throw new Error(label + ' must be a string of at most ' + limit + ' characters');
  return value;
}

function safeUrl(value, label) {
  const url = text(value, label, 2048).trim();
  if (/^[\x00-\x20]|[\x00-\x20\\]/.test(url) || /^\/\//.test(url) || /^(?:javascript|data|vbscript):/i.test(url)) {
    throw new Error(label + ' must be a safe site path or HTTP URL');
  }
  if (url.startsWith('/')) return url;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(label + ' must be a safe site path or HTTP URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(label + ' must use HTTP or HTTPS');
  return url;
}

function localizedSiteUrl(value, label, context) {
  return localizedContentUrl(context.config,context.locale,safeUrl(value,label),label);
}

function list(value, label, min = 1, max = 50) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(label + ' must contain ' + min + ' to ' + max + ' items');
  return value;
}

function imageCandidates(value, label) {
  let previousWidth = 0;
  return list(value, label, 1, 4).map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(label + '[' + index + '] must be an object');
    const src = escapeHtml(safeUrl(candidate.src, label + '[' + index + '].src'));
    const width = candidate.width;
    if (!Number.isInteger(width) || width < 1 || width > 10000 || width <= previousWidth) {
      throw new Error(label + ' widths must be increasing integers from 1 to 10000');
    }
    previousWidth = width;
    return src + ' ' + width + 'w';
  }).join(', ');
}

function enabledIntegration(config, id) {
  const match = config.browserPlugins.services.find(item => item.enabled !== false && item.id === id);
  if (!match) throw new Error('Page block requires a configured service with id: ' + id);
  return match;
}

function dateLabel(date, locale, timeZone = 'UTC', dateOnly = true) {
  return new Intl.DateTimeFormat(locale, dateOnly?{dateStyle:'long',timeZone}:{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short',timeZone}).format(date);
}

function dateOnlyLabel(value, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00.000Z'));
}

function renderPrivacyServices(context) {
  const configured = context.config.browserPlugins.services.filter(service => service.enabled !== false);
  if (!configured.length) {
    return '<p class="privacy-services-empty">' + escapeHtml(text(context.emptyText, 'privacy-services.emptyText', 2000)) + '</p>';
  }
  return '<ul class="privacy-service-list">' + configured.map((service) => '<li><h3>' + escapeHtml(translateValue(context.config, context.locale, service.name || service.provider)) + '</h3><p><strong>' +
    escapeHtml(translate(context.config, context.locale, 'servicePurpose')) + ':</strong> ' +
    escapeHtml(translateValue(context.config, context.locale, service.purpose)) + '</p><p><strong>' +
    escapeHtml(translate(context.config, context.locale, 'serviceDataCategories')) + ':</strong> ' +
    escapeHtml(translateValue(context.config, context.locale, service.dataCategories)) + '</p><p><strong>' +
    escapeHtml(translate(context.config, context.locale, 'serviceRecipient')) + ':</strong> ' +
    escapeHtml(translateValue(context.config, context.locale, service.recipient)) + '</p><p><strong>' +
    escapeHtml(translate(context.config, context.locale, 'serviceRetention')) + ':</strong> ' +
    escapeHtml(translateValue(context.config, context.locale, service.retention)) + '</p><p><a class="privacy-vendor-link" href="' +
    escapeHtml(service.privacyUrl) + '" rel="noopener noreferrer">' +
    escapeHtml(translate(context.config, context.locale, 'servicePrivacyDetails')) + '</a></p></li>').join('') + '</ul>';
}

async function renderLatestPosts(block, context) {
  const count = block.count ?? 3;
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('latest-posts.count must be an integer from 1 to 12');
  const paginate = block.paginate ?? false;
  if (typeof paginate !== 'boolean') throw new Error('latest-posts.paginate must be a boolean');
  if ('tag' in block) throw new Error('post-list.tag is no longer supported; use category/categories and show tags on article pages');
  if ('category' in block && 'categories' in block) throw new Error('Use category or categories, not both');
  const categories = categoryFilter(block.category ?? block.categories ?? (block.type === 'latest-posts' ? context.config.site?.archive?.categories : undefined));
  const archiveCategories = categoryFilter(context.config.site?.archive?.categories);
  const sameArchive = [...categories].sort().join('\0') === [...archiveCategories].sort().join('\0');
  if (paginate && (block.type === 'post-list' || !sameArchive)) throw new Error('Homepage pagination must use the same categories as site.archive.categories');
  const selected = filterPostsByCategory(postsForLocale(context.site.posts, context.locale, context.config.i18n.defaultLocale), categories);
  const ordered = block.type === 'post-list' ? sortPinnedPosts(selected) : selected;
  const posts = ordered.filter(post => !context.displayedPostBundles?.has(post.bundlePath));
  const displayed = posts.slice(0, count);
  for (const post of displayed) context.displayedPostBundles?.add(post.bundlePath);
  const title = escapeHtml(text(block.title, 'latest-posts.title', 200));
  const authorLabel = (post) => post.author ? '<span class="post-author">' + escapeHtml(translate(context.config, context.locale, 'postAuthor')
    .replace('{author}', post.author)) + '</span>' : '';
  const cards = (await Promise.all(displayed.map(async (post) => {
    const excerpt = await renderMarkdownExcerpt(post.description || post.markdown, {...context.config.markdown,linkResolver:value=>localizedContentUrl(context.config,post.locale,value)});
    return '<article class="post-card" lang="' + escapeHtml(post.locale) + '"><h3><a href="' + escapeHtml('/' + post.path.split('/').filter(Boolean).join('/') + (post.path.endsWith('/') ? '/' : '')) + '">' +
      escapeHtml(post.title) + '</a></h3>' + (block.type === 'post-list' && post.pinned ? '<span class="post-pinned">' + escapeHtml(translate(context.config, context.locale, 'postPinned')) + '</span>' : '') + '<p class="meta"><time data-local-time data-time-locale="' + escapeHtml(post.locale || context.locale) + '" data-date-only="' + (post.dateOnly === true) + '" datetime="' + (post.dateOnly ? post.date.toISOString().slice(0,10) : post.date.toISOString()) + '">' + escapeHtml(dateLabel(post.date, post.locale || context.locale, post.dateOnly ? 'UTC' : context.config.site.timeZone, post.dateOnly)) +
      '</time>' + (post.author ? ' ' + authorLabel(post) : '') + '</p><div class="post-excerpt" lang="' + escapeHtml(post.locale) + '">' + excerpt + '</div></article>';
  }))).join('');
  const pagination = paginate && context.latestPostsPagination?.totalPages > 1
    ? '<nav class="pagination latest-posts-pagination" aria-label="' + escapeHtml(translate(context.config, context.locale, 'pagination')) + '">' +
      '<a rel="next" href="' + escapeHtml(context.latestPostsPagination.olderUrl) + '">' + escapeHtml(translate(context.config, context.locale, 'older')) + '</a>' +
      '<a href="' + escapeHtml(context.latestPostsPagination.archiveUrl) + '">' + escapeHtml(translate(context.config, context.locale, 'allPosts')) + '</a></nav>'
    : '';
  const morePath = categories.length === 1 ? '/[launge]/categories/' + categorySlug(categories[0]) + '/' : sameArchive ? '/[launge]/archives/' : '';
  const categoryArchive = !paginate && morePath && posts.length > count
    ? '<p class="post-list-more"><a href="' + escapeHtml(localizedSiteUrl(morePath, 'post-list.categoryArchive', context)) + '">' +
      escapeHtml(translate(context.config, context.locale, categories.length === 1 ? 'allCategoryPosts' : 'allPosts')) + '</a></p>' : '';
  return '<section class="latest-posts"><h2>' + title + '</h2>' +
    (cards ? '<div class="post-list">' + cards + '</div>' : '<p>' + escapeHtml(translate(context.config, context.locale, 'noPosts')) + '</p>') + pagination + categoryArchive + '</section>';
}

function renderMediaText(block, context) {
  const mediaType = text(block.mediaType, 'media-text.mediaType', 10);
  if (!['image', 'video'].includes(mediaType)) throw new Error('media-text.mediaType must be image or video');
  const src = escapeHtml(safeUrl(block.src, 'media-text.src'));
  const alt = escapeHtml(text(block.alt, 'media-text.alt', 500));
  const caption = text(block.caption, 'media-text.caption', 500, true);
  const placement = block.placement ?? 'left';
  if (!['left', 'right'].includes(placement)) throw new Error('media-text.placement must be left or right');
  let media;
  if (mediaType === 'image') {
    const original=block.originalSrc?' data-original="'+escapeHtml(safeUrl(block.originalSrc,'media-text.originalSrc'))+'"':'';
    media = '<img src="' + src + '"'+original+' alt="' + alt + '" loading="lazy" decoding="async">';
    if (block.animationSrc) {
      const animation = safeUrl(block.animationSrc, 'media-text.animationSrc');
      if (!animation.startsWith('/') || !/\.(mp4|webm)$/i.test(animation)) throw new Error('media-text.animationSrc must be a local MP4 or WebM');
      const title = escapeHtml(block.title || block.alt);
      const seekName = 'edgepress-demo-seek-' + (context.demoCount = (context.demoCount || 0) + 1);
      media = '<div class="project-demo" data-project-demo data-animation="' + escapeHtml(animation) + '" data-play="' + escapeHtml(translate(context.config, context.locale, 'demoPlay')) + '" data-resume="' + escapeHtml(translate(context.config, context.locale, 'demoResume')) + '" data-pause="' + escapeHtml(translate(context.config, context.locale, 'demoPause')) + '" data-replay="' + escapeHtml(translate(context.config, context.locale, 'demoReplay')) + '" data-loading="' + escapeHtml(translate(context.config, context.locale, 'demoLoading')) + '" data-error="' + escapeHtml(translate(context.config, context.locale, 'demoError')) + '"><div class="project-demo-media">' + media + '<video muted playsinline preload="none" hidden aria-label="' + title + '"></video></div><button type="button" data-demo-toggle aria-pressed="false" aria-label="' + escapeHtml(translate(context.config, context.locale, 'demoPlay')) + ': ' + title + '">' + escapeHtml(translate(context.config, context.locale, 'demoPlay')) + '</button><input name="' + seekName + '" class="project-demo-seek" data-demo-seek type="range" min="0" max="1" value="0" step="0.1" disabled aria-label="' + escapeHtml(translate(context.config, context.locale, 'demoSeek')) + ': ' + title + '"><span class="project-demo-time" data-demo-time>0:00 / 0:00</span><span class="project-demo-status" role="status"></span></div>';
    }
  } else {
    if (!alt.trim()) throw new Error('media-text.alt must describe the video');
    const videoSrc = escapeHtml(safeUrl(block.src, 'media-text.src'));
    const captions = escapeHtml(safeUrl(block.captions, 'media-text.captions'));
    const language = escapeHtml(text(block.captionLanguage, 'media-text.captionLanguage', 24));
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) throw new Error('media-text.captionLanguage must be a language tag');
    const trackLabel = escapeHtml(text(block.captionLabel, 'media-text.captionLabel', 120));
    const poster = block.poster ? ' poster="' + escapeHtml(safeUrl(block.poster, 'media-text.poster')) + '"' : '';
    media = '<video controls playsinline preload="metadata" aria-label="' + alt + '"' + poster + '><source src="' + videoSrc + '" type="video/mp4"><track kind="captions" src="' + captions + '" srclang="' + language + '" label="' + trackLabel + '" default></video>';
  }
  const title = text(block.title, 'media-text.title', 240, true);
  const content = text(block.text, 'media-text.text', 2000);
  let action = '';
  if (block.cta) {
    action = '<p><a class="button" href="' + escapeHtml(localizedSiteUrl(block.cta.url, 'media-text.cta.url', context)) + '">' +
      escapeHtml(text(block.cta.label, 'media-text.cta.label', 120)) + '</a></p>';
  }
  return '<article class="media-text-block media-text-block--' + placement + '"><figure>' + media +
    (caption ? '<figcaption>' + escapeHtml(caption) + '</figcaption>' : '') + '</figure><div class="media-text-copy">' +
    (title ? '<h2>' + escapeHtml(title) + '</h2>' : '') + '<p>' + escapeHtml(content) + '</p>' + action + '</div></article>';
}

async function renderBlock(block, context, depth, index) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('Page blocks must be objects');
  if (depth > 4) throw new Error('Page block nesting may not exceed 4 levels');
  const type = text(block.type, 'block.type', 40);
  switch (type) {
    case 'document': return renderDocument(block, context);
    case 'media-viewer': return renderMediaViewer(block, context);
    case 'hero': {
      const heading = text(block.title, 'hero.title', 240);
      const level = context.isHomepage && index === 0 ? 'h1' : 'h2';
      const eyebrow = text(block.eyebrow, 'hero.eyebrow', 120, true);
      const description = text(block.text, 'hero.text', 1000, true);
      const bannerSrc = block.bannerSrc === undefined ? '' : safeUrl(block.bannerSrc, 'hero.bannerSrc');
      const bannerAlt = block.bannerAlt === undefined ? '' : text(block.bannerAlt, 'hero.bannerAlt', 500);
      if (Boolean(bannerSrc) !== Boolean(bannerAlt)) throw new Error('hero.bannerSrc and hero.bannerAlt must be provided together');
      const bannerSrcset = block.bannerSrcset === undefined ? '' : imageCandidates(block.bannerSrcset, 'hero.bannerSrcset');
      if (bannerSrcset && !bannerSrc) throw new Error('hero.bannerSrcset requires hero.bannerSrc');
      const bannerWebpSrcset = block.bannerWebpSrcset === undefined ? '' : imageCandidates(block.bannerWebpSrcset, 'hero.bannerWebpSrcset');
      if (bannerWebpSrcset && !bannerSrc) throw new Error('hero.bannerWebpSrcset requires hero.bannerSrc');
      const bannerSizes = escapeHtml(text(block.bannerSizes ?? '(max-width: 620px) 90vw, 680px', 'hero.bannerSizes', 200));
      const bannerWidth = block.bannerWidth;
      const bannerHeight = block.bannerHeight;
      if (bannerSrc && (!Number.isInteger(bannerWidth) || bannerWidth < 1 || bannerWidth > 10000 ||
          !Number.isInteger(bannerHeight) || bannerHeight < 1 || bannerHeight > 10000)) {
        throw new Error('hero banner dimensions must be integers from 1 to 10000');
      }
      const mascotSrc = block.mascotSrc === undefined ? '' : safeUrl(block.mascotSrc, 'hero.mascotSrc');
      const mascotAlt = block.mascotAlt === undefined ? '' : text(block.mascotAlt, 'hero.mascotAlt', 500);
      if (Boolean(mascotSrc) !== Boolean(mascotAlt)) throw new Error('hero.mascotSrc and hero.mascotAlt must be provided together');
      const mascotWebpSrcset = block.mascotWebpSrcset === undefined ? '' : imageCandidates(block.mascotWebpSrcset, 'hero.mascotWebpSrcset');
      if (mascotWebpSrcset && !mascotSrc) throw new Error('hero.mascotWebpSrcset requires hero.mascotSrc');
      if (block.mascotSizes !== undefined && !mascotWebpSrcset) throw new Error('hero.mascotSizes requires hero.mascotWebpSrcset');
      const hasMascotWidth = block.mascotWidth !== undefined;
      const hasMascotHeight = block.mascotHeight !== undefined;
      if (hasMascotWidth !== hasMascotHeight) throw new Error('hero.mascotWidth and hero.mascotHeight must be provided together');
      const mascotWidth = hasMascotWidth ? block.mascotWidth : 1222;
      const mascotHeight = hasMascotHeight ? block.mascotHeight : 1287;
      if (!Number.isInteger(mascotWidth) || mascotWidth < 1 || mascotWidth > 10000 ||
          !Number.isInteger(mascotHeight) || mascotHeight < 1 || mascotHeight > 10000) {
        throw new Error('hero.mascotWidth and hero.mascotHeight must be integers from 1 to 10000');
      }
      const mascotSizes = mascotWebpSrcset ? escapeHtml(text(block.mascotSizes ?? '230px', 'hero.mascotSizes', 200)) : '';
      let action = '';
      if (block.cta) {
        const label = escapeHtml(text(block.cta.label, 'hero.cta.label', 120));
        const url = escapeHtml(localizedSiteUrl(block.cta.url, 'hero.cta.url', context));
        action = '<p><a class="button" href="' + url + '">' + label + '</a></p>';
      }
      const highlights = block.highlights === undefined ? [] : list(block.highlights, 'hero.highlights', 1, 4);
      const highlightPanel = highlights.length ? '<ul class="hero-highlights">' + highlights.map((item) => '<li>' +
        escapeHtml(text(item, 'hero highlight', 180)) + '</li>').join('') + '</ul>' : '';
      const mascotImage = mascotSrc ? '<img class="hero-mascot" src="' + escapeHtml(mascotSrc) + '" alt="' +
        escapeHtml(mascotAlt) + '" width="' + mascotWidth + '" height="' + mascotHeight + '" decoding="async">' : '';
      const mascot = mascotWebpSrcset
        ? '<picture class="hero-mascot-picture"><source type="image/webp" srcset="' + mascotWebpSrcset + '" sizes="' + mascotSizes + '">' + mascotImage + '</picture>'
        : mascotImage;
      const aside = mascot || highlightPanel ? '<div class="hero-aside">' + mascot + highlightPanel + '</div>' : '';
      const bannerImage = bannerSrc ? '<img class="hero-banner" src="' + escapeHtml(bannerSrc) + '" alt="' + escapeHtml(bannerAlt) +
        '" width="' + bannerWidth + '" height="' + bannerHeight + '"' + (bannerSrcset ? ' srcset="' + bannerSrcset +
        '" sizes="(max-width: 620px) calc(100vw - 32px), (max-width: 1168px) calc(100vw - 48px), 1120px"' : '') +
        ' decoding="async" fetchpriority="high">' : '';
      const banner = bannerWebpSrcset ? '<picture class="hero-banner-picture"><source type="image/webp" srcset="' + bannerWebpSrcset + '" sizes="' + bannerSizes + '">' + bannerImage + '</picture>' : bannerImage;
      return '<section class="hero-block' + (aside ? ' hero-block--split' : '') + (banner ? ' hero-block--banner' : '') + '"><div class="hero-main">' +
        (eyebrow ? '<p class="eyebrow">' + escapeHtml(eyebrow) + '</p>' : '') + '<' + level + '>' + escapeHtml(heading) + '</' + level + '>' +
        (description ? '<p class="hero-copy">' + escapeHtml(description) + '</p>' : '') + action + '</div>' + aside + banner + '</section>';
    }
    case 'section': {
      const heading = text(block.title, 'section.title', 200, true);
      const label = text(block.label, 'section.label', 200, true);
      if (!heading && !label) throw new Error('section needs a title or accessible label');
      const tone = block.tone ?? 'plain';
      if (!['plain', 'soft', 'accent', 'dark'].includes(tone)) throw new Error('section.tone must be plain, soft, accent, or dark');
      const width = block.width ?? 'default';
      if (!['default', 'wide', 'narrow'].includes(width)) throw new Error('section.width must be default, wide, or narrow');
      const id = block.id === undefined ? '' : text(block.id, 'section.id', 80);
      if (id && !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('section.id must use lowercase letters, numbers, and hyphens');
      if (id) {
        context.sectionIds ??= new Set();
        if (context.sectionIds.has(id)) throw new Error('Page section IDs must be unique: ' + id);
        context.sectionIds.add(id);
      }
      const intro = text(block.text, 'section.text', 1000, true);
      const children = await renderElements(block.blocks, context, depth + 1);
      context.sectionHeadingCounter = (context.sectionHeadingCounter || 0) + 1;
      const headingId = 'page-section-heading-' + context.sectionHeadingCounter;
      const labelledBy = heading ? ' aria-labelledby="' + headingId + '"' : ' aria-label="' + escapeHtml(label) + '"';
      return '<section' + (id ? ' id="' + escapeHtml(id) + '"' : '') + ' class="page-section page-section--' + tone + '"' + labelledBy +
        '><div class="section-inner section-inner--' + width + '">' + (heading ? '<h2 id="' + headingId + '">' + escapeHtml(heading) + '</h2>' : '') +
        (intro ? '<p class="section-intro">' + escapeHtml(intro) + '</p>' : '') + children + '</div></section>';
    }
    case 'heading': {
      const value = escapeHtml(text(block.text, 'heading.text', 240));
      const level = block.level ?? 2;
      if (![2, 3, 4].includes(level)) throw new Error('heading.level must be 2, 3, or 4');
      const id = block.id === undefined ? '' : text(block.id, 'heading.id', 80);
      if (id && !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('heading.id must use lowercase letters, numbers, and hyphens');
      return '<h' + level + (id ? ' id="' + escapeHtml(id) + '"' : '') + ' class="content-heading">' + value + '</h' + level + '>';
    }
    case 'text': {
      let paragraphs = block.paragraphs;
      if (paragraphs === undefined && typeof block.text === 'string') paragraphs = block.text.split(/\n\s*\n/).filter(Boolean);
      if (!Array.isArray(paragraphs) || paragraphs.length < 1 || paragraphs.length > 30) throw new Error('text needs a text value or 1 to 30 paragraphs');
      return '<div class="text-widget">' + (await Promise.all(paragraphs.map(paragraph => renderPageText(text(paragraph, 'text paragraph', 4000), context)))).join('') + '</div>';
    }
    case 'media-text': return renderMediaText(block, context);
    case 'display-text': {
      const value = escapeHtml(text(block.text, 'display-text.text', 1000));
      const style = block.style ?? 'editorial';
      if (!['editorial', 'serif', 'outline', 'mono', 'accent'].includes(style)) throw new Error('display-text.style must be editorial, serif, outline, mono, or accent');
      const level = block.level ?? 2;
      if (![2, 3, 4].includes(level)) throw new Error('display-text.level must be 2, 3, or 4');
      return '<h' + level + ' class="display-text display-text--' + style + '">' + value + '</h' + level + '>';
    }
    case 'link-list': {
      const items = list(block.items, 'link-list.items', 1, 30);
      const title = text(block.title, 'link-list.title', 200);
      return '<nav class="link-list"' + (title ? ' aria-label="' + escapeHtml(title) + '"' : '') + '>' +
        (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') + '<ul>' + items.map((item) => {
          const label = escapeHtml(text(item?.label, 'link-list label', 200));
          const url = escapeHtml(localizedSiteUrl(item?.url, 'link-list.url', context));
          const description = text(item?.text, 'link-list.text', 500, true);
          return '<li><a href="' + url + '">' + label + '</a>' + (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</li>';
        }).join('') + '</ul></nav>';
    }
    case 'steps': {
      const items = list(block.items, 'steps.items', 1, 20);
      const title = text(block.title, 'steps.title', 200, true);
      const headingTag = title ? 'h4' : 'h3';
      return '<div class="steps-widget">' + (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') + '<ol>' + items.map((item) => {
        const heading = escapeHtml(text(item?.title, 'step.title', 200));
        const description = text(item?.text, 'step.text', 1000, true);
        const command = text(item?.command, 'step.command', 2000, true);
        return '<li><' + headingTag + '>' + heading + '</' + headingTag + '>' + (description ? '<p>' + escapeHtml(description) + '</p>' : '') +
          (command ? '<pre><code>' + escapeHtml(command) + '</code></pre>' : '') + '</li>';
      }).join('') + '</ol></div>';
    }
    case 'code': {
      const source = escapeHtml(text(block.code, 'code.code', 12000));
      const language = block.language === undefined ? '' : text(block.language, 'code.language', 40);
      if (language && !/^[a-z0-9+#.-]+$/i.test(language)) throw new Error('code.language must be a simple language name');
      const title = text(block.title, 'code.title', 200, true);
      return '<figure class="code-widget">' + (title ? '<figcaption>' + escapeHtml(title) + '</figcaption>' : '') +
        '<pre><code' + (language ? ' class="language-' + escapeHtml(language) + '"' : '') + '>' + source + '</code></pre></figure>';
    }
    case 'data-table': {
      const headers = list(block.headers, 'data-table.headers', 1, 12);
      const rows = list(block.rows, 'data-table.rows', 1, 100);
      const title = text(block.title, 'data-table.title', 200);
      for (const row of rows) if (!Array.isArray(row) || row.length !== headers.length) throw new Error('Each data-table row must match the number of headers');
      return '<div class="table-widget" tabindex="0" role="region" aria-label="'+escapeHtml(title)+'"><table><caption>' + escapeHtml(title) + '</caption><thead><tr>' + headers.map((item) =>
        '<th scope="col">' + escapeHtml(text(item, 'data-table header', 200)) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((row) => '<tr>' + row.map((cell) => '<td>' + escapeHtml(text(cell, 'data-table cell', 1000)) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>';
    }
    case 'list': {
      const items = list(block.items, 'list.items', 1, 100);
      const title = text(block.title, 'list.title', 200, true);
      const ordered = block.ordered === true;
      const tag = ordered ? 'ol' : 'ul';
      return '<div class="list-widget">' + (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') + '<' + tag + '>' +
        items.map((item) => '<li>' + escapeHtml(text(item, 'list item', 1000)) + '</li>').join('') + '</' + tag + '></div>';
    }
    case 'notice': {
      const heading = text(block.title, 'notice.title', 200, true);
      const message = escapeHtml(text(block.text, 'notice.text', 2000));
      const tone = block.tone ?? 'info';
      if (!['info', 'warning', 'success'].includes(tone)) throw new Error('notice.tone must be info, warning, or success');
      return '<aside class="notice-widget notice-widget--' + tone + '" role="note">' + (heading ? '<h3>' + escapeHtml(heading) + '</h3>' : '') + '<p>' + message + '</p></aside>';
    }
    case 'privacy-services': {
      const emptyText = text(block.emptyText, 'privacy-services.emptyText', 2000);
      return '<div class="privacy-services-widget">' + renderPrivacyServices({ ...context, emptyText }) + '</div>';
    }
    case 'privacy-consent': {
      const storageLabel = escapeHtml(text(block.storageLabel, 'privacy-consent.storageLabel', 120));
      const expiryLabel = escapeHtml(text(block.expiryLabel, 'privacy-consent.expiryLabel', 120));
      const proposedDateLabel = escapeHtml(text(block.proposedDateLabel, 'privacy-consent.proposedDateLabel', 120));
      const effectiveDateLabel = escapeHtml(text(block.effectiveDateLabel, 'privacy-consent.effectiveDateLabel', 120));
      const expiryText = text(block.expiryText, 'privacy-consent.expiryText', 120);
      if (!expiryText.includes('{days}')) throw new Error('privacy-consent.expiryText must include a {days} placeholder');
      const consent = context.config.browserPlugins.consent;
      return '<dl class="privacy-controller-details"><div><dt>' + storageLabel + '</dt><dd>' + escapeHtml(translate(context.config, context.locale, 'consentStoredOnDevice')) + '</dd></div>' +
        '<div><dt>' + expiryLabel + '</dt><dd>' + escapeHtml(expiryText.replace('{days}', String(consent.expiresDays))) + '</dd></div>' +
        '<div><dt>' + proposedDateLabel + '</dt><dd>' + escapeHtml(dateOnlyLabel(consent.proposedDate, context.locale)) + '</dd></div>' +
        (consent.effectiveDate ? '<div><dt>' + effectiveDateLabel + '</dt><dd>' + escapeHtml(dateOnlyLabel(consent.effectiveDate, context.locale)) + '</dd></div>' : '') + '</dl>';
    }
    case 'privacy-controller': {
      const controller = context.config.privacy.controller;
      const name = controller.name.trim();
      const contact = controller.contact.trim();
      const missingTitle = escapeHtml(text(block.missingTitle, 'privacy-controller.missingTitle', 200));
      const missingText = escapeHtml(text(block.missingText, 'privacy-controller.missingText', 2000));
      const nameLabel = escapeHtml(text(block.nameLabel, 'privacy-controller.nameLabel', 120));
      const contactLabel = escapeHtml(text(block.contactLabel, 'privacy-controller.contactLabel', 120));
      if (!name || !contact) {
        return '<aside class="notice-widget notice-widget--warning"><h3>' + missingTitle + '</h3><p>' + missingText + '</p></aside>';
      }
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
      const contactValue = email ? '<a href="mailto:' + escapeHtml(contact) + '">' + escapeHtml(contact) + '</a>' : escapeHtml(contact);
      return '<p class="privacy-controller-inline"><span><strong>' + nameLabel + ':</strong> ' + escapeHtml(name) +
        '</span><span class="privacy-controller-separator" aria-hidden="true">·</span><span><strong>' + contactLabel +
        ':</strong> ' + contactValue + '</span></p>';
    }
    case 'link-directory': {
      const items = list(block.items, 'link-directory.items', 1, 100);
      const heading = text(block.title, 'link-directory.title', 200);
      const entries = items.map((item) => {
        const name = escapeHtml(text(item?.title, 'link-directory item title', 200));
        const summary = escapeHtml(text(item?.text, 'link-directory item text', 1000, true));
        const href = localizedSiteUrl(item?.url, 'link-directory item url', context);
        const host = /^https?:\/\//i.test(href) ? new URL(href).host : '';
        return '<li class="link-directory-entry"><a class="link-directory-link" href="' + escapeHtml(href) + '">' +
          '<span class="link-directory-number" aria-hidden="true"></span><span class="link-directory-main"><strong class="link-directory-name">' + name + '</strong>' +
          (summary ? '<span class="link-directory-summary">' + summary + '</span>' : '') + '</span>' +
          '<span class="link-directory-destination" aria-hidden="true">' + (host ? '<span>' + escapeHtml(host) + '</span>' : '') +
          '<span class="link-directory-arrow">↗</span></span></a></li>';
      }).join('');
      return '<section class="link-directory-section"><h2>' + escapeHtml(heading) + '</h2><ol class="link-directory-items">' + entries + '</ol></section>';
    }
    case 'feature-grid': {
      const items = list(block.items, 'feature-grid.items', 1, 12);
      const heading = text(block.title, 'feature-grid.title', 200);
      const cells = items.map((item) => {
        const title = escapeHtml(text(item?.title, 'feature title', 200));
        const description = escapeHtml(text(item?.text, 'feature text', 1000, true));
        const href = item?.url ? localizedSiteUrl(item.url, 'feature.url', context) : '';
        const iconName = item?.icon === undefined ? '' : text(item.icon, 'feature icon', 40);
        if (iconName && !isIconName(iconName)) throw new Error('Unsupported feature icon: ' + iconName);
        const icon = iconName ? renderIcon(iconName, 'feature-icon') : '';
        return '<article class="feature-card">' + icon + '<h3>' + (href ? '<a href="' + escapeHtml(href) + '">' + title + '</a>' : title) + '</h3>' +
          (description ? '<p>' + description + '</p>' : '') + '</article>';
      }).join('');
      return '<section class="feature-section"><h2>' + escapeHtml(heading) + '</h2><div class="feature-grid">' + cells + '</div></section>';
    }
    case 'image': {
      const src = safeUrl(block.src, 'image.src');
      const alt = text(block.alt, 'image.alt', 500);
      const caption = text(block.caption, 'image.caption', 500, true);
      const original=block.originalSrc?' data-original="'+escapeHtml(safeUrl(block.originalSrc,'image.originalSrc'))+'"':'';
      return '<figure class="image-block"><img src="' + escapeHtml(src) + '"'+original+' alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async">' +
        (caption ? '<figcaption>' + escapeHtml(caption) + '</figcaption>' : '') + '</figure>';
    }
    case 'quote': {
      const quote = escapeHtml(text(block.text, 'quote.text', 4000));
      const attribution = text(block.attribution, 'quote.attribution', 240, true);
      return '<figure class="quote-block"><blockquote><p>' + quote + '</p></blockquote>' + (attribution ? '<figcaption>' + escapeHtml(attribution) + '</figcaption>' : '') + '</figure>';
    }
    case 'cta': {
      const title = escapeHtml(text(block.title, 'cta.title', 240));
      const description = text(block.text, 'cta.text', 1000, true);
      const label = escapeHtml(text(block.label, 'cta.label', 120));
      const url = escapeHtml(localizedSiteUrl(block.url, 'cta.url', context));
      return '<section class="cta-block"><h2>' + title + '</h2>' + (description ? '<p>' + escapeHtml(description) + '</p>' : '') +
        '<p><a class="button" href="' + url + '">' + label + '</a></p></section>';
    }
    case 'faq': {
      const items = list(block.items, 'faq.items', 1, 30);
      const title = escapeHtml(text(block.title, 'faq.title', 200));
      return '<section class="faq-block"><h2>' + title + '</h2>' + items.map((item) => '<details><summary>' +
        escapeHtml(text(item?.question, 'faq.question', 500)) + '</summary><p>' + escapeHtml(text(item?.answer, 'faq.answer', 4000)) + '</p></details>').join('') + '</section>';
    }
    case 'oembed': return renderEmbed(block, context);
    case 'service': {
      const id = text(block.integration, 'service.integration', 64);
      if (context.servicesRendered.has(id)) throw new Error('A page may contain only one block per service');
      context.servicesRendered.add(id);
      return renderServiceBlock(context.document, context.locale, context.config, id, true);
    }
    case 'post-list':
    case 'latest-posts': return renderLatestPosts(block, context);
    case 'ad-slot': {
      const integration = enabledIntegration(context.config, block.integration);
      return '<div class="ad-slot" data-edgepress-ad="' + escapeHtml(integration.id) + '" aria-label="' + escapeHtml(text(block.label, 'ad-slot.label', 120)) + '"></div>';
    }
    case 'captcha': {
      if (!captchaProviders.has(block.provider)) throw new Error('captcha.provider must be a supported consent-gated provider');
      const integration = context.config.browserPlugins.services.find(item => item.enabled !== false && item.provider === block.provider);
      if (!integration) throw new Error('captcha block needs a configured consent-gated integration: ' + block.provider);
      const siteKey = integration.siteKey;
      return '<div class="captcha-block" data-edgepress-captcha="' + escapeHtml(block.provider) + '" data-sitekey="' + escapeHtml(siteKey) + '" aria-label="' + escapeHtml(text(block.label, 'captcha.label', 120)) + '"></div>';
    }
    default: throw new Error('Unsupported page block type: ' + type);
  }
}

async function renderElements(blocks, context, depth = 0) {
  if (!Array.isArray(blocks) || blocks.length > 100) throw new Error('Page blocks must be an array with at most 100 items');
  const rendered = [];
  for (let index = 0; index < blocks.length; index += 1) {
    context.blockCount = (context.blockCount || 0) + 1;
    if (context.blockCount > 200) throw new Error('A page may contain at most 200 blocks including nested blocks');
    rendered.push(await renderBlock(blocks[index], context, depth, index));
  }
  return rendered.join('\n');
}

export async function renderBlocks(rows, context) {
  context = {...context, displayedPostBundles:new Set(), servicesRendered:new Set(), blockCount:0, demoCount:0};
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('Page layout needs an array of at most 100 rows');
  const rendered = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || 'type' in row) {
      throw new Error('Page layout rows start with a columns count; put element types inside cells');
    }
    for (const key of Object.keys(row)) if (!['columns', 'cells'].includes(key)) throw new Error('Unsupported page row option: ' + key);
    const columns = row.columns;
    if (!Number.isInteger(columns) || columns < 1 || columns > 4) throw new Error('Each page row needs a columns count from 1 to 4');
    if (!Array.isArray(row.cells) || row.cells.length !== columns) throw new Error('Each row needs one cells entry per configured column');
    context.blockCount = (context.blockCount || 0) + 1;
    if (context.blockCount > 200) throw new Error('A page may contain at most 200 blocks including nested blocks');
    const cells = [];
    for (const [index,blocks] of row.cells.entries()) {
      if (!Array.isArray(blocks) || !blocks.length) throw new Error('Every page row cell needs at least one element block');
      cells.push('<div class="page-builder-cell" data-cell="' + (index + 1) + '">' + await renderElements(blocks, context, 1) + '</div>');
    }
    rendered.push('<div class="page-builder-row" data-columns="' + columns + '">' + cells.join('') + '</div>');
  }
  return rendered.join('\n');
}
