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
  const root = document.createElement('div');
  root.className = 'privacy-manager';

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'privacy-settings-button';
  settingsButton.textContent = ui.privacySettings || 'Privacy settings';

  const panel = document.createElement('section');
  panel.className = 'privacy-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'privacy-panel-title');
  panel.lang = config.siteLanguage || document.documentElement.lang;
  panel.hidden = true;

  const heading = document.createElement('h2');
  heading.id = 'privacy-panel-title';
  heading.tabIndex = -1;
  heading.textContent = ui.privacyNotice || 'Optional services';
  const intro = document.createElement('p');
  intro.className = 'privacy-intro';
  intro.textContent = ui.privacyIntro || 'Choose which optional services may load.';
  const details = document.createElement('div');
  details.className = 'privacy-details';
  details.setAttribute('role', 'group');
  details.setAttribute('aria-label', ui.optionalServices || 'Optional services');
  const actions = document.createElement('div');
  actions.className = 'privacy-actions';
  const close = makeButton(ui.closePrivacy || 'Close settings', 'privacy-close');

  const accept = makeButton(ui.acceptOptional || 'Accept all', 'privacy-accept');
  const reject = makeButton(ui.rejectOptional || 'Reject optional', 'privacy-reject');
  const save = makeButton(ui.savePreferences || 'Save choices', 'privacy-save');
  actions.append(accept, reject, save);
  panel.append(close, heading, intro, details);
  if (privacy.controller?.name || privacy.controller?.contact) {
    const controller = document.createElement('p');
    controller.className = 'privacy-controller';
    controller.textContent = (ui.privacyController || 'Site operator') + ': ' + [privacy.controller.name, privacy.controller.contact].filter(Boolean).join(' · ');
    panel.append(controller);
  }
  if (privacy.policyUrl) {
    const policy = document.createElement('a');
    policy.href = privacy.policyUrl;
    policy.textContent = ui.privacyPolicy || 'Privacy policy';
    policy.className = 'privacy-policy-link';
    panel.append(policy);
  }
  panel.append(actions);
  root.append(settingsButton, panel);
  document.body.append(root);

  const saved = readChoice(privacy);
  const checkboxes = new Map();
  for (const integration of integrations) {
    const label = document.createElement('label');
    label.className = 'privacy-service';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = integration.id;
    checkbox.checked = saved?.allowed.includes(integration.id) || false;
    const info = document.createElement('span');
    info.className = 'privacy-service-info';
    const title = document.createElement('strong');
    title.className = 'privacy-service-title';
    title.textContent = integration.provider;
    const purpose = document.createElement('span');
    purpose.className = 'privacy-service-purpose';
    purpose.textContent = (ui.servicePurpose || 'Purpose') + ': ' + integration.purpose;
    info.append(title, purpose);
    if (integration.retention) {
      const retention = document.createElement('span');
      retention.className = 'privacy-service-retention';
      retention.textContent = (ui.serviceRetention || 'Retention') + ': ' + integration.retention;
      info.append(retention);
    }
    label.append(checkbox, info);
    details.append(label);
    checkboxes.set(integration.id, checkbox);
  }
  if (!integrations.length) {
    const empty = document.createElement('p');
    empty.textContent = ui.noIntegrations || 'No optional services are configured.';
    details.append(empty);
    accept.disabled = true;
    reject.disabled = true;
    save.disabled = true;
  }

  settingsButton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) heading.focus?.();
  });
  close.addEventListener('click', () => { panel.hidden = true; settingsButton.focus(); });
  accept.addEventListener('click', () => saveChoice(integrations.map((item) => item.id)));
  reject.addEventListener('click', () => saveChoice([]));
  save.addEventListener('click', () => saveChoice([...checkboxes].filter(([, checkbox]) => checkbox.checked).map(([id]) => id)));

  function saveChoice(allowed) {
    const previous = readChoice(privacy);
    const next = makeChoice(privacy, allowed);
    persistChoice(next);
    panel.hidden = true;
    if (previous && previous.allowed.some((id) => !next.allowed.includes(id))) {
      intro.textContent = ui.consentReload || 'Your choice was saved. Reloading to apply the updated settings.';
      window.location.reload();
      return;
    }
    activate(next.allowed);
  }

  if (saved) activate(saved.allowed);
  else if (integrations.length) panel.hidden = false;

  function makeButton(label, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }
}

function makeChoice(privacy, allowed) {
  const expiresAt = Date.now() + Math.max(1, Math.min(730, privacy.consent?.expiresDays || 180)) * 86400000;
  const fingerprint = JSON.stringify({ controller: privacy.controller, policyUrl: privacy.policyUrl, integrations: privacy.integrations });
  return { version: privacy.consent?.version || '1', fingerprint, expiresAt, allowed: [...new Set(allowed)] };
}

function readChoice(privacy) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    const fingerprint = JSON.stringify({ controller: privacy.controller, policyUrl: privacy.policyUrl, integrations: privacy.integrations });
    if (!saved || saved.version !== (privacy.consent?.version || '1') || saved.fingerprint !== fingerprint || saved.expiresAt <= Date.now() || !Array.isArray(saved.allowed)) {
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
