import { plainText } from './markdown.js';
import { translate } from './i18n.js';
import { isIconName, renderIcon } from './icons.js';

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

function list(value, label, min = 1, max = 50) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(label + ' must contain ' + min + ' to ' + max + ' items');
  return value;
}

function enabledIntegration(config, id, category) {
  const section = config.browserPlugins[category];
  const match = section?.enabled && section.services.find((item) => item.id === id);
  if (!match) throw new Error('Page block requires a configured ' + category + ' service with id: ' + id);
  return match;
}

function dateLabel(date, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function renderPrivacyServices(context) {
  const groups = [
    ['tracking', translate(context.config, context.locale, 'pluginTracking')],
    ['statistics', translate(context.config, context.locale, 'pluginStatistics')],
    ['advertising', translate(context.config, context.locale, 'pluginAdvertising')],
    ['captcha', translate(context.config, context.locale, 'pluginCaptcha')]
  ];
  const configured = groups.flatMap(([key, label]) => {
    const section = context.config.browserPlugins[key];
    return (section?.enabled ? section.services : []).map((service) => ({ ...service, category: label }));
  });
  if (!configured.length) {
    return '<p class="privacy-empty">' + escapeHtml(text(context.emptyText, 'privacy-services.emptyText', 2000)) + '</p>';
  }
  return '<ul class="privacy-service-list">' + configured.map((service) => '<li><h3>' + escapeHtml(service.category + ' · ' + service.provider) +
    '</h3><p><strong>' + escapeHtml(translate(context.config, context.locale, 'servicePurpose')) + ':</strong> ' + escapeHtml(service.purpose) +
    '</p><p><strong>' + escapeHtml(translate(context.config, context.locale, 'serviceRetention')) + ':</strong> ' + escapeHtml(service.retention) + '</p></li>').join('') + '</ul>';
}

function renderLatestPosts(block, context) {
  const count = block.count ?? 3;
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('latest-posts.count must be an integer from 1 to 12');
  const paginate = block.paginate ?? false;
  if (typeof paginate !== 'boolean') throw new Error('latest-posts.paginate must be a boolean');
  const posts = context.site.posts.filter((post) => post.locale === context.locale ||
    (!context.site.posts.some((item) => item.locale === context.locale) && post.locale === context.config.i18n.defaultLocale))
    .sort((a, b) => b.date - a.date);
  const title = escapeHtml(text(block.title, 'latest-posts.title', 200));
  const authorLabel = (post) => post.author ? '<span class="post-author">' + escapeHtml(translate(context.config, context.locale, 'postAuthor')
    .replace('{author}', post.author)) + '</span>' : '';
  const cards = posts.slice(0, count).map((post) => '<article class="post-card"><h3><a href="' + escapeHtml('/' + post.path.split('/').filter(Boolean).join('/') + (post.path.endsWith('/') ? '/' : '')) + '">' +
    escapeHtml(post.title) + '</a></h3><p class="meta"><time datetime="' + post.date.toISOString() + '">' + escapeHtml(dateLabel(post.date, context.locale)) +
    '</time>' + (post.author ? ' · ' + authorLabel(post) : '') + '</p><p>' + escapeHtml(post.description || plainText(post.markdown).slice(0, 220)) + '</p></article>').join('');
  const pagination = paginate && context.latestPostsPagination?.totalPages > 1
    ? '<nav class="pagination latest-posts-pagination" aria-label="' + escapeHtml(translate(context.config, context.locale, 'pagination')) + '">' +
      '<a rel="next" href="' + escapeHtml(context.latestPostsPagination.olderUrl) + '">' + escapeHtml(translate(context.config, context.locale, 'older')) + '</a>' +
      '<a href="' + escapeHtml(context.latestPostsPagination.archiveUrl) + '">' + escapeHtml(translate(context.config, context.locale, 'allPosts')) + '</a></nav>'
    : '';
  return '<section class="latest-posts"><h2>' + title + '</h2>' +
    (cards ? '<div class="post-list">' + cards + '</div>' : '<p>' + escapeHtml(translate(context.config, context.locale, 'noPosts')) + '</p>') + pagination + '</section>';
}

function renderMediaText(block) {
  const mediaType = text(block.mediaType, 'media-text.mediaType', 10);
  if (!['image', 'video'].includes(mediaType)) throw new Error('media-text.mediaType must be image or video');
  const src = escapeHtml(safeUrl(block.src, 'media-text.src'));
  const alt = escapeHtml(text(block.alt, 'media-text.alt', 500));
  const caption = text(block.caption, 'media-text.caption', 500, true);
  const placement = block.placement ?? 'left';
  if (!['left', 'right'].includes(placement)) throw new Error('media-text.placement must be left or right');
  let media;
  if (mediaType === 'image') {
    media = '<img src="' + src + '" alt="' + alt + '" loading="lazy" decoding="async">';
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
    action = '<p><a class="button" href="' + escapeHtml(safeUrl(block.cta.url, 'media-text.cta.url')) + '">' +
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
    case 'hero': {
      const heading = text(block.title, 'hero.title', 240);
      const level = context.isHomepage && index === 0 ? 'h1' : 'h2';
      const eyebrow = text(block.eyebrow, 'hero.eyebrow', 120, true);
      const description = text(block.text, 'hero.text', 1000, true);
      const mascotSrc = block.mascotSrc === undefined ? '' : safeUrl(block.mascotSrc, 'hero.mascotSrc');
      const mascotAlt = block.mascotAlt === undefined ? '' : text(block.mascotAlt, 'hero.mascotAlt', 500);
      if (Boolean(mascotSrc) !== Boolean(mascotAlt)) throw new Error('hero.mascotSrc and hero.mascotAlt must be provided together');
      let action = '';
      if (block.cta) {
        const label = escapeHtml(text(block.cta.label, 'hero.cta.label', 120));
        const url = escapeHtml(safeUrl(block.cta.url, 'hero.cta.url'));
        action = '<p><a class="button" href="' + url + '">' + label + '</a></p>';
      }
      const highlights = block.highlights === undefined ? [] : list(block.highlights, 'hero.highlights', 1, 4);
      const highlightPanel = highlights.length ? '<ul class="hero-highlights">' + highlights.map((item) => '<li>' +
        escapeHtml(text(item, 'hero highlight', 180)) + '</li>').join('') + '</ul>' : '';
      const mascot = mascotSrc ? '<img class="hero-mascot" src="' + escapeHtml(mascotSrc) + '" alt="' +
        escapeHtml(mascotAlt) + '" width="1222" height="1287" decoding="async">' : '';
      const aside = mascot || highlightPanel ? '<div class="hero-aside">' + mascot + highlightPanel + '</div>' : '';
      return '<section class="hero-block' + (aside ? ' hero-block--split' : '') + '"><div class="hero-main">' +
        (eyebrow ? '<p class="eyebrow">' + escapeHtml(eyebrow) + '</p>' : '') + '<' + level + '>' + escapeHtml(heading) + '</' + level + '>' +
        (description ? '<p class="hero-copy">' + escapeHtml(description) + '</p>' : '') + action + '</div>' + aside + '</section>';
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
      return '<div class="text-widget">' + paragraphs.map((paragraph) => '<p>' + escapeHtml(text(paragraph, 'text paragraph', 4000)) + '</p>').join('') + '</div>';
    }
    case 'media-text': return renderMediaText(block);
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
          const url = escapeHtml(safeUrl(item?.url, 'link-list.url'));
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
      return '<div class="table-widget"><table><caption>' + escapeHtml(title) + '</caption><thead><tr>' + headers.map((item) =>
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
      const versionLabel = escapeHtml(text(block.versionLabel, 'privacy-consent.versionLabel', 120));
      const expiryText = text(block.expiryText, 'privacy-consent.expiryText', 120);
      if (!expiryText.includes('{days}')) throw new Error('privacy-consent.expiryText must include a {days} placeholder');
      const consent = context.config.browserPlugins.consent;
      return '<dl class="privacy-controller-details"><div><dt>' + storageLabel + '</dt><dd>edgepress-privacy-choice</dd></div>' +
        '<div><dt>' + expiryLabel + '</dt><dd>' + escapeHtml(expiryText.replace('{days}', String(consent.expiresDays))) + '</dd></div>' +
        '<div><dt>' + versionLabel + '</dt><dd>' + escapeHtml(consent.version) + '</dd></div></dl>';
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
      return '<dl class="privacy-controller-details"><div><dt>' + nameLabel + '</dt><dd>' + escapeHtml(name) +
        '</dd></div><div><dt>' + contactLabel + '</dt><dd>' + escapeHtml(contact) + '</dd></div></dl>';
    }
    case 'feature-grid': {
      const items = list(block.items, 'feature-grid.items', 1, 12);
      const heading = text(block.title, 'feature-grid.title', 200);
      const cells = items.map((item) => {
        const title = escapeHtml(text(item?.title, 'feature title', 200));
        const description = escapeHtml(text(item?.text, 'feature text', 1000, true));
        const href = item?.url ? safeUrl(item.url, 'feature.url') : '';
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
      return '<figure class="image-block"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async">' +
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
      const url = escapeHtml(safeUrl(block.url, 'cta.url'));
      return '<section class="cta-block"><h2>' + title + '</h2>' + (description ? '<p>' + escapeHtml(description) + '</p>' : '') +
        '<p><a class="button" href="' + url + '">' + label + '</a></p></section>';
    }
    case 'faq': {
      const items = list(block.items, 'faq.items', 1, 30);
      const title = escapeHtml(text(block.title, 'faq.title', 200));
      return '<section class="faq-block"><h2>' + title + '</h2>' + items.map((item) => '<details><summary>' +
        escapeHtml(text(item?.question, 'faq.question', 500)) + '</summary><p>' + escapeHtml(text(item?.answer, 'faq.answer', 4000)) + '</p></details>').join('') + '</section>';
    }
    case 'latest-posts': return renderLatestPosts(block, context);
    case 'ad-slot': {
      const integration = enabledIntegration(context.config, block.integration, 'advertising');
      return '<div class="ad-slot" data-edgepress-ad="' + escapeHtml(integration.id) + '" aria-label="' + escapeHtml(text(block.label, 'ad-slot.label', 120)) + '"></div>';
    }
    case 'captcha': {
      if (!captchaProviders.has(block.provider)) throw new Error('captcha.provider must be a supported consent-gated provider');
      const integration = context.config.browserPlugins.captcha.enabled && context.config.browserPlugins.captcha.services.find((item) => item.provider === block.provider);
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
    const cells = await Promise.all(row.cells.map(async (blocks, index) => {
      if (!Array.isArray(blocks) || !blocks.length) throw new Error('Every page row cell needs at least one element block');
      return '<div class="page-builder-cell" data-cell="' + (index + 1) + '">' + await renderElements(blocks, context, 1) + '</div>';
    }));
    rendered.push('<div class="page-builder-row" data-columns="' + columns + '">' + cells.join('') + '</div>');
  }
  return rendered.join('\n');
}
