import {sourceOrigins, resolveEmbed} from './oembed.js';
import {translate, translateValue} from './i18n.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Embeds occupy their own line, so they never create figures inside paragraphs.
// Marked handles code fences and escaped examples before this block tokenizer.
export function parseEmbed(source) {
  const match = String(source).match(/^ {0,3}!embed\[([a-z0-9_-]+)\]\(([^\s<>]+)\)[\t ]*(?:\r?\n|$)/i);
  return match ? {raw: match[0], integration: match[1], url: match[2]} : null;
}

export async function renderEmbed(block, {config, locale}) {
  const service = config.browserPlugins?.services?.find(item => item.id === block.integration);
  if (!service || service.provider !== 'oembed') throw new Error('Embed requires a registered oembed service: ' + block.integration);
  const address = new URL(block.url);
  if (address.protocol !== 'https:' || !sourceOrigins(service).includes(address.origin) || address.username || address.password || /[\x00-\x20\\]/.test(block.url)) {
    throw new Error('Embed URL must use its registered HTTPS service origin');
  }
  const provider = translateValue(config, locale, service.name || service.id);
  const label = String(block.title || provider);
  if (label.length > 200) throw new Error('Embed title must contain at most 200 characters');
  const notice = key => escapeHtml(translate(config, locale, key).replace('{service}', provider));
  const link = '<a href="' + escapeHtml(address.href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
  const match = service.embedPathPattern ? address.pathname.match(new RegExp(service.embedPathPattern)) : null;
  if (service.embedPathPattern && !match?.[1]) throw new Error('Embed URL does not match the configured content path');
  for (const field of ['width', 'height']) {
    if (block[field] !== undefined && (!Number.isInteger(block[field]) || block[field] < 60 || block[field] > 4096)) throw new Error('Embed ' + field + ' must be from 60 to 4096');
  }
  if (service.enabled === false) return '<figure class="edgepress-oembed" data-oembed-disabled><figcaption>' + escapeHtml(label) + '</figcaption><p role="status">' + notice('embedDisabled') + '</p>' + link + '</figure>';
  const data = service.embedTemplate ? {version:'1.0', type:'rich', title:label, width:640, height:480, html:'<iframe src="' + escapeHtml(service.embedTemplate.replaceAll('{url}', encodeURIComponent(address.href)).replaceAll('{path}', address.pathname).replaceAll('{id}', encodeURIComponent(match?.[1] || ''))) + '"></iframe>'} :
    service.oembedEndpoint ? await resolveEmbed(service, address.href, config) : undefined;
  const dimensions = ' data-oembed-width="' + (block.width || data?.width || 640) + '" data-oembed-height="' + (block.height || data?.height || 480) + '"';
  const caption = block.caption ? '<p class="oembed-caption">' + escapeHtml(block.caption) + '</p>' : '';
  return '<figure class="edgepress-oembed" data-edgepress-oembed="' + escapeHtml(service.id) + '" data-oembed-url="' + escapeHtml(address.href) + '"' + dimensions +
    (data === null ? ' data-oembed-unavailable="true"' : '') + '><figcaption>' + escapeHtml(label) + '</figcaption><p data-oembed-notice role="status">' + notice(data === null ? 'embedUnavailable' : 'embedNeedsConsent') + '</p>' +
    (data !== null ? '<button type="button" data-oembed-load>' + escapeHtml(translate(config, locale, 'loadMedia')) + '</button>' : '') + link +
    '<div data-oembed-status><div class="oembed-placeholder" data-oembed-placeholder aria-hidden="true"></div></div>' + caption +
    (data ? '<template data-oembed-data>' + escapeHtml(JSON.stringify(data)) + '</template>' : '') + '</figure>';
}

// Pages retain escaped text; only standalone embed lines receive special syntax.
export async function renderPageText(source, context) {
  const output = [], lines = String(source).split(/\r?\n/);
  let paragraph = [];
  const flush = () => { if (paragraph.length) output.push('<p>' + escapeHtml(paragraph.join('\n')) + '</p>'); paragraph = []; };
  for (const line of lines) {
    const embed = parseEmbed(line);
    if (embed) { flush(); output.push(await renderEmbed(embed, context)); }
    else if (!line.trim()) flush();
    else paragraph.push(line);
  }
  flush();
  return output.join('');
}
