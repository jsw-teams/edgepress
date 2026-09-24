import { localizedUrl, translate } from '../../src/i18n.js';

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export default function consentManager(api) {
  api.registerFilter('html:afterLayout', (html, { config, page }) => {
    if (!config.browserPlugins.consent.enabled) return html;
    const locale = page?.locale || config.i18n.defaultLocale;
    const ui = Object.fromEntries([
      'privacySettings', 'privacyNotice', 'privacyIntro', 'acceptOptional', 'rejectOptional',
      'savePreferences', 'optionalServices', 'noIntegrations', 'privacyPolicy', 'privacyController',
      'servicePurpose', 'serviceRetention', 'consentReload', 'closePrivacy'
    ].map((key) => [key, translate(config, locale, key)]));
    const services = ['tracking', 'statistics', 'advertising', 'captcha'].flatMap((group) =>
      config.browserPlugins[group].enabled ? config.browserPlugins[group].services.map((service) => ({ ...service, category: group })) : []
    );
    const privacy = {
      ...config.privacy,
      consent: config.browserPlugins.consent,
      integrations: services
    };
    if (privacy.policyUrl.startsWith('/')) privacy.policyUrl = localizedUrl(config, locale, privacy.policyUrl);
    const payload = safeJson({ privacy, ui, siteLanguage: locale });
    const integration = '<script type="application/json" id="edgepress-privacy-config">' + payload + '</script>' +
      '<script src="/edgepress/plugins/consent/manager.js" defer></script>';
    return html.replace(/<\/body\s*>/i, integration + '</body>');
  });
}
