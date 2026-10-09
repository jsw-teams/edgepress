(() => {
  const configuration = document.getElementById('edgepress-data-saver-config');
  if (!configuration) return;
  const settings = JSON.parse(configuration.textContent);
  const modes = ['auto', 'text', 'full'];
  const key = 'edgepress-data-mode';
  const query = new URL(location.href).searchParams.get('data-mode');
  let preference = settings.mode;
  try { const saved = localStorage.getItem(key); if (modes.includes(saved)) preference = saved; } catch {}
  if (modes.includes(query)) preference = query;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const reduced = settings.detectSlowConnection && ['slow-2g', '2g'].includes(connection?.effectiveType) || settings.respectBrowserPreference && (connection?.saveData === true || matchMedia('(prefers-reduced-data: reduce)').matches);
  const mode = preference === 'auto' ? reduced ? 'text' : 'full' : preference;
  document.documentElement.dataset.edgepressDataMode = mode;
  const resources = new Map();
  const activateResources = (kind, feature) => {
    for (const template of document.querySelectorAll('template[data-edgepress-data-resource]')) {
      if (template.dataset.edgepressDataResource !== kind) continue;
      if (feature && template.dataset.dataFeature !== feature) continue;
      const original = template.content.firstElementChild;
      if (!original) continue;
      const source = original.getAttribute('src') || original.getAttribute('href');
      if (resources.has(source)) continue;
      const element = document.createElement(original.tagName);
      for (const attribute of original.attributes) element.setAttribute(attribute.name, attribute.value);
      if (element.tagName === 'SCRIPT') element.async = false;
      resources.set(source, element);
      template.replaceWith(element);
    }
  };
  const activateMedia = host => {
    const template = host.querySelector(':scope > template');
    if (!template) return;
    if (template.hasAttribute('data-edgepress-data-html')) template.innerHTML = template.content.textContent;
    const description = host.querySelector(':scope > [data-data-description]');
    description?.remove();
    host.replaceChildren(template.content.cloneNode(true));
    host.dataset.loaded = 'true';
    document.dispatchEvent(new CustomEvent('edgepress:data-media', { detail: { root: host } }));
  };
  const deferMedia = (element, activate, label = '') => {
    if (mode !== 'text') { activate(); return null; }
    const host = document.createElement('span');
    host.className = 'edgepress-data-placeholder';
    const text = document.createElement('span');
    text.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = settings.labels.load;
    if (label) button.setAttribute('aria-label', settings.labels.load + ': ' + label);
    button.addEventListener('click', () => {
      button.remove();
      text.remove();
      host.dataset.loaded = 'true';
      host.append(element);
      activate();
      if (!element.matches('a, button, input, select, textarea, [tabindex]')) element.tabIndex = -1;
      element.focus({ preventScroll: true });
    }, { once: true });
    host.append(text, button);
    return host;
  };
  window.edgepressDataSaver = Object.freeze({ mode, preference, deferMedia });
  const initialize = () => {
    const controls = document.querySelector('.edgepress-data-controls');
    if (controls) {
      controls.hidden = false;
      controls.querySelector('[data-data-notice]').hidden = mode !== 'text';
      for (const button of controls.querySelectorAll('[data-data-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.dataMode === preference));
        button.addEventListener('click', () => {
          const selected = button.dataset.dataMode;
          const url = new URL(location.href);
          let persisted = false;
          try { sessionStorage.setItem('edgepress-data-focus', selected); } catch {}
          try { localStorage.setItem(key, selected); persisted = localStorage.getItem(key) === selected; } catch {}
          if (persisted) url.searchParams.delete('data-mode'); else url.searchParams.set('data-mode', selected);
          location.assign(url.href);
        });
      }
      let focusMode = query;
      try { focusMode = sessionStorage.getItem('edgepress-data-focus') || focusMode; sessionStorage.removeItem('edgepress-data-focus'); } catch {}
      if (modes.includes(focusMode)) controls.querySelector('[data-data-mode="' + focusMode + '"]')?.focus({ preventScroll: true });
    }
    if (mode === 'full') {
      activateResources('style');
      document.querySelectorAll('[data-edgepress-data-media]').forEach(activateMedia);
      activateResources('script');
      return;
    }
    for (const host of document.querySelectorAll('[data-edgepress-data-media]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = settings.labels.load;
      const description = host.querySelector('[data-data-description]')?.textContent;
      if (description) button.setAttribute('aria-label', settings.labels.load + ': ' + description);
      const link = host.closest('a');
      if (link) link.after(button); else host.append(button);
      button.addEventListener('click', () => {
        activateMedia(host);
        activateResources('style', host.dataset.dataFeature);
        activateResources('script', host.dataset.dataFeature);
        button.remove();
        const target = link || host.querySelector('button, a, [tabindex], img, video, audio, iframe');
        if (target && !target.matches('a, button, input, select, textarea, [tabindex]')) target.tabIndex = -1;
        target?.focus({ preventScroll: true });
      }, { once: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
})();
