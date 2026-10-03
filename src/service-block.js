import {translate, translateValue} from './i18n.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderServiceBlock(document, locale, config, id, page = false) {
  const service = config.browserPlugins.services.find(item => item.id === id);
  if (service?.enabled === false) return '';
  if (!service && !config.browserPlugins.services.some(item => item.enabled !== false && item.provider === 'external-widget')) return '';
  if (!service || service.provider !== 'external-widget') throw new Error('Service block needs a registered external-widget: ' + id);
  if (!document?.bundlePath) throw new Error('Service block needs a published document');
  const thread = (page ? 'page:' : '') + document.bundlePath;
  return '<section class="edgepress-service" data-edgepress-service="' + escape(id) + '" data-service-thread="' + escape(thread) + '" data-service-title="' + escape(document.title) + '"><h2>' + escape(translateValue(config, locale, service.name)) + '</h2><button type="button" data-service-consent-settings>' + escape(translate(config, locale, 'privacySettings')) + '</button></section>';
}
export function renderPostServices(document, locale, config) {
  return config.browserPlugins.services.filter(item => item.enabled !== false && item.provider === 'external-widget' && item.placement === 'posts').map(item => renderServiceBlock(document, locale, config, item.id)).join('');
}
export function hasServiceBlock(rows) {
  const contains = blocks => blocks.some(block => block.type === 'service' || (block.type === 'section' && contains(block.blocks || [])));
  return (rows || []).some(row => (row.cells || []).some(contains));
}
