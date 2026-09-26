const modules = {
  'google-tag-manager': () => import('../tracking/google-tag-manager.js'),
  'meta-pixel': () => import('../tracking/meta-pixel.js'),
  'cloudflare-web-analytics': () => import('../statistics/cloudflare-web-analytics.js'),
  'google-analytics': () => import('../statistics/google-analytics.js'),
  'baidu-tongji': () => import('../statistics/baidu-tongji.js'),
  'google-adsense': () => import('../advertising/google-adsense.js'),
  'cloudflare-turnstile': () => import('../captcha/cloudflare-turnstile.js'),
  'google-recaptcha': () => import('../captcha/google-recaptcha.js'),
  'hcaptcha': () => import('../captcha/hcaptcha.js')
};

const storageKey = 'edgepress-privacy-choice';
const configElement = document.getElementById('edgepress-privacy-config');
if (configElement) {
  try { initialize(JSON.parse(configElement.textContent)); }
  catch { /* An invalid config does not enable any optional integration. */ }
}

function initialize(config) {
  const privacy = config.privacy || {};
  const integrations = Array.isArray(privacy.integrations) ? privacy.integrations : [];
  const ui = config.ui || {};
  const locale = config.siteLanguage || document.documentElement.lang || 'en';
  const defaultLocale = config.defaultLocale || 'en';
  const root = document.createElement('div');
  root.className = 'privacy-manager';
  root.setAttribute('data-consent-ui', 'true');

  const settingsButton = makeButton(ui.privacySettings || 'Privacy settings', 'privacy-settings-button', 'settings');
  settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.setAttribute('aria-controls', 'privacy-panel');

  const panel = document.createElement('section');
  panel.id = 'privacy-panel';
  panel.className = 'privacy-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'privacy-panel-title');
  panel.lang = locale;
  panel.hidden = true;

  const close = makeButton('', 'privacy-close', 'close');
  close.setAttribute('aria-label', ui.closePrivacy || 'Close settings');
  const heading = document.createElement('h2');
  heading.id = 'privacy-panel-title';
  heading.tabIndex = -1;
  heading.textContent = ui.privacyNotice || 'Privacy choices';
  const intro = document.createElement('p');
  intro.className = 'privacy-intro';
  intro.textContent = ui.privacyIntro || 'Optional services stay off until you choose.';

  const serviceSettings = document.createElement('div');
  serviceSettings.className = 'privacy-service-settings';
  serviceSettings.setAttribute('aria-label', ui.optionalServices || 'Optional services');
  const checkboxes = new Map();

  for (const integration of integrations) {
    const category = translate(ui, 'plugin' + capitalize(integration.category || 'statistics'));
    const name = localized(integration.name, locale, defaultLocale) || integration.provider;
    const purpose = localized(integration.purpose, locale, defaultLocale);
    const dataCategories = localized(integration.dataCategories, locale, defaultLocale);
    const recipient = localized(integration.recipient, locale, defaultLocale);
    const retention = localized(integration.retention, locale, defaultLocale);

    const item = document.createElement('article');
    item.className = 'privacy-service-setting';
    const toggle = document.createElement('label');
    toggle.className = 'privacy-service-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = integration.id;
    checkbox.setAttribute('role', 'switch');
    checkbox.checked = false;
    const toggleText = document.createElement('span');
    toggleText.className = 'privacy-service-toggle-text';
    const title = document.createElement('strong');
    title.textContent = name;
    const categoryLabel = document.createElement('span');
    categoryLabel.className = 'privacy-category';
    categoryLabel.textContent = category;
    const purposeText = document.createElement('span');
    purposeText.className = 'privacy-service-purpose';
    purposeText.textContent = purpose;
    toggleText.append(title, categoryLabel, purposeText);
    toggle.append(checkbox, toggleText);
    const detail = document.createElement('details');
    detail.className = 'privacy-details';
    const detailSummary = document.createElement('summary');
    detailSummary.textContent = ui.reviewDetails || 'Details';
    detail.append(detailSummary, disclosureList(ui, [
      ['serviceDataCategories', dataCategories],
      ['serviceRecipient', recipient],
      ['serviceRetention', retention],
      ['servicePrivacyDetails', '', integration.privacyUrl, 'servicePrivacyLink']
    ]));
    item.append(toggle, detail);
    serviceSettings.append(item);
    checkboxes.set(integration.id, checkbox);
  }

  if (!integrations.length) {
    const empty = document.createElement('p');
    empty.className = 'privacy-empty';
    empty.textContent = ui.noIntegrations || 'No optional services are configured.';
    serviceSettings.append(empty);
  }

  const essential = document.createElement('p');
  essential.className = 'privacy-essential';
  essential.textContent = (ui.essentialStorage || 'Your choice is saved in this browser for up to {days} days.')
    .replace('{days}', String(privacy.consent?.expiresDays || 180));

  const operator = privacy.controller || {};
  const controller = document.createElement('p');
  controller.className = 'privacy-controller';
  if (operator.name || operator.contact) {
    controller.append(document.createTextNode((ui.privacyController || 'Site operator') + ': '));
    if (operator.name) controller.append(document.createTextNode(operator.name));
    if (operator.name && operator.contact) controller.append(document.createTextNode(' · '));
    if (operator.contact) {
      controller.append(document.createTextNode((ui.privacyContact || 'Privacy contact') + ': '));
      appendContact(controller, operator.contact);
    }
  }
  const policy = document.createElement('a');
  policy.href = privacy.policyUrl || '#';
  policy.textContent = ui.privacyPolicy || 'Privacy policy';
  policy.className = 'privacy-policy-link';
  if (!privacy.policyUrl) policy.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'privacy-actions';
  const reject = makeButton(ui.rejectOptional || 'Reject optional', 'privacy-reject', 'reject');
  const accept = makeButton(ui.acceptOptional || 'Accept all', 'privacy-accept', 'accept');
  const save = makeButton(ui.savePreferences || 'Save choices', 'privacy-save', 'save');
  actions.append(reject, accept, save);
  for (const action of [reject, accept, save]) action.disabled = !integrations.length;

  const footer = document.createElement('div');
  footer.className = 'privacy-footer';
  footer.append(essential);
  if (controller.childNodes.length) footer.append(controller);
  footer.append(policy);
  panel.append(close, heading, intro, serviceSettings, actions, footer);
  root.append(settingsButton, panel);
  document.body.append(root);

  const saved = readChoice(privacy);
  for (const [id, checkbox] of checkboxes) checkbox.checked = Boolean(saved?.allowed.includes(id));

  settingsButton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    settingsButton.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) heading.focus();
  });
  close.addEventListener('click', () => closePanel());
  reject.addEventListener('click', () => saveChoice([]));
  accept.addEventListener('click', () => saveChoice(integrations.map((item) => item.id)));
  save.addEventListener('click', () => saveChoice([...checkboxes].filter(([, checkbox]) => checkbox.checked).map(([id]) => id)));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  function closePanel() {
    panel.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.focus();
  }

  function saveChoice(allowed) {
    const previous = readChoice(privacy);
    const next = makeChoice(privacy, allowed);
    persistChoice(next);
    closePanel();
    if (previous && previous.allowed.some((id) => !next.allowed.includes(id))) {
      intro.textContent = ui.consentReload || 'Your choice was saved. Reloading to apply the updated settings.';
      window.location.reload();
      return;
    }
    activate(next.allowed);
  }

  if (saved) activate(saved.allowed);
  else if (integrations.length) {
    panel.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
  }
}

function disclosureList(ui, entries) {
  const list = document.createElement('dl');
  list.className = 'privacy-service-disclosures';
  for (const [key, value, href, linkKey] of entries) {
    if (!value && !href) continue;
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = translate(ui, key);
    const description = document.createElement('dd');
    if (href && safeSupplierUrl(href)) {
      const link = document.createElement('a');
      link.href = href;
      link.rel = 'noopener noreferrer';
      link.textContent = translate(ui, linkKey || key);
      description.append(link);
    } else {
      description.textContent = value;
    }
    row.append(term, description);
    list.append(row);
  }
  return list;
}

function appendContact(parent, contact) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  if (!email) {
    parent.append(document.createTextNode(contact));
    return;
  }
  const link = document.createElement('a');
  link.href = 'mailto:' + contact;
  link.textContent = contact;
  parent.append(link);
}

function safeSupplierUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

function translate(ui, key) {
  return ui[key] || key;
}

function localized(value, locale, defaultLocale) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return value[locale] || value[defaultLocale] || Object.values(value)[0] || '';
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function makeButton(label, className, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.append(makeIcon(iconName), document.createTextNode(label));
  return button;
}

function makeIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const paths = {
    settings: 'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-5 2v4',
    accept: 'm5 12 4 4L19 6',
    reject: 'm6 6 12 12M18 6 6 18',
    close: 'm6 6 12 12M18 6 6 18',
    save: 'M5 12h14m-6-6 6 6-6 6'
  };
  path.setAttribute('d', paths[name] || paths.settings);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function makeChoice(privacy, allowed) {
  const consent = privacy.consent || {};
  const expiresAt = Date.now() + Math.max(1, Math.min(730, consent.expiresDays || 180)) * 86400000;
  const fingerprint = JSON.stringify({ controller: privacy.controller, policyUrl: privacy.policyUrl, consent, integrations: privacy.integrations });
  return {
    proposedDate: consent.proposedDate || '',
    effectiveDate: consent.effectiveDate || '',
    fingerprint,
    expiresAt,
    allowed: [...new Set(allowed)]
  };
}

function readChoice(privacy) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    const consent = privacy.consent || {};
    const fingerprint = JSON.stringify({ controller: privacy.controller, policyUrl: privacy.policyUrl, consent, integrations: privacy.integrations });
    if (!saved || saved.proposedDate !== (consent.proposedDate || '') || saved.effectiveDate !== (consent.effectiveDate || '') ||
        saved.fingerprint !== fingerprint || saved.expiresAt <= Date.now() || !Array.isArray(saved.allowed)) {
      localStorage.removeItem(storageKey);
      return null;
    }
    const validIds = new Set((privacy.integrations || []).map((item) => item.id));
    saved.allowed = saved.allowed.filter((id) => validIds.has(id));
    return saved;
  } catch { return null; }
}

function persistChoice(choice) {
  try { localStorage.setItem(storageKey, JSON.stringify(choice)); } catch { /* Session choice still applies in memory. */ }
}

async function activate(allowed) {
  const config = JSON.parse(document.getElementById('edgepress-privacy-config').textContent);
  const permitted = new Set(allowed);
  for (const integration of config.privacy.integrations || []) {
    if (!permitted.has(integration.id)) continue;
    const loader = modules[integration.provider];
    if (!loader) continue;
    try {
      const provider = await loader();
      await provider.load(integration);
    } catch (error) {
      console.error('EdgePress optional integration failed to load:', integration.provider, error);
    }
  }
}
