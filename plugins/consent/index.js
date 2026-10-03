import {createHash} from 'node:crypto';
import {choiceSnapshot} from '../../static/edgepress/plugins/consent/choices.js';
function translate(config, locale, key) {
  const base = config.i18n.translationsByLocale?.[config.i18n.defaultLocale];
  const selected = config.i18n.translationsByLocale?.[locale];
  return selected?.[key] ?? base?.[key] ?? key;
}

function localizedUrl(config, locale, path) {
  const prefix = locale === config.i18n.defaultLocale ? '' : '/' + locale;
  const suffix = String(path ?? '').replace(/^\/+/, '');
  return prefix + '/' + suffix;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export default function consentManager(api) {
  api.registerFilter('html:afterLayout', (html, { config, page }) => {
    if (!config.browserPlugins.consent.enabled) return html;
    const locale = page?.locale || config.i18n.defaultLocale;
    const ui = Object.fromEntries([
      'privacySettings', 'privacyNotice', 'privacyIntro', 'acceptOptional', 'rejectOptional',
      'savePreferences', 'optionalServices', 'noIntegrations', 'privacyPolicy', 'privacyController', 'privacyContact',
      'serviceDataCategories', 'serviceRecipient', 'serviceRetention', 'servicePrivacyDetails', 'servicePrivacyLink', 'consentReload',
      'closePrivacy', 'reviewDetails', 'essentialStorage', 'loadMedia', 'embedUnavailable'
    ].map((key) => [key, translate(config, locale, key)]));
    const services = config.browserPlugins.services.filter(service => service.enabled !== false);
    const privacy = {
      ...config.privacy,
      consent: config.browserPlugins.consent,
      integrations: services
    };
    if (privacy.policyUrl.startsWith('/')) privacy.policyUrl = localizedUrl(config, locale, privacy.policyUrl);
    const snapshot = choiceSnapshot({
      controller: config.privacy.controller,
      policyUrl: config.privacy.policyUrl,
      consent: config.browserPlugins.consent,
      integrations: services
    },config.site.url);
    const choiceFingerprint=createHash('sha256').update(snapshot).digest('hex');
    const payload = safeJson({ privacy, ui, siteOrigin:config.site.url,siteLanguage: locale, defaultLocale: config.i18n.defaultLocale, choiceFingerprint,choiceSnapshot:snapshot });
    const integration = '<script type="application/json" id="edgepress-privacy-config">' + payload + '</script>' +
      '<script type="module" src="/edgepress/plugins/consent/manager.js"></script>';
    return html.replace(/<\/body\s*>/i, integration + '</body>');
  });
}
