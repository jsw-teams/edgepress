(() => {
  const configuration = document.getElementById('edgepress-data-saver-config');
  if (!configuration) return;
  const settings = JSON.parse(configuration.textContent);
  const parameters = new URL(location.href).searchParams;
  if (parameters.has('data-save') && (!settings.enabled || !settings.debug || parameters.getAll('data-save').length !== 1 || parameters.get('data-save') !== '')) {
    location.replace(settings.notFoundUrl);
    return;
  }
  if (!settings.enabled) return;
  const modes = ['auto', 'text', 'full'];
  const key = 'edgepress-data-mode';
  const query = parameters.has('data-save') ? 'text' : parameters.get('data-mode');
  let preference = settings.mode;
  try { const saved = localStorage.getItem(key); if (modes.includes(saved)) preference = saved; } catch {}
  if (modes.includes(query)) preference = query;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const reduced = settings.respectBrowserPreference && (connection?.saveData === true || matchMedia('(prefers-reduced-data: reduce)').matches);
  const mode = preference === 'auto' ? reduced ? 'text' : 'full' : preference;
  document.documentElement.dataset.edgepressDataMode = mode;
  const resources = new Map();
  let firstScreenReady = false;
  let dismissed = false;
  let offerRequested = false;
  let monitor;
  let switching = false;
  const prepareWaiting = () => {
    const waiting = document.querySelector('[data-data-wait]');
    if (!waiting) return;
    waiting.hidden = false;
    const offer = waiting.querySelector('[data-data-offer]');
    if (offer) offer.hidden = mode !== 'full' || !settings.detectSlowConnection;
    earlyObserver.disconnect();
  };
  const earlyObserver = new MutationObserver(prepareWaiting);
  earlyObserver.observe(document.documentElement, { childList: true, subtree: true });
  document.documentElement.dataset.edgepressDataReady = 'false';
  const switchView = selected => {
    if (switching || !['text', 'full'].includes(selected)) return;
    switching = true;
    const url = new URL(location.href);
    url.searchParams.delete('data-save');
    document.documentElement.dataset.edgepressDataReady = 'false';
    const waiting = document.querySelector('[data-data-wait]');
    if (waiting) waiting.hidden = false;
    document.querySelectorAll('[data-data-mode]').forEach(control => { control.disabled = true; });
    let persisted = false;
    try { sessionStorage.setItem('edgepress-data-focus', selected); sessionStorage.setItem('edgepress-data-scroll', String(scrollY)); } catch {}
    try { localStorage.setItem(key, selected); persisted = localStorage.getItem(key) === selected; } catch {}
    if (persisted) url.searchParams.delete('data-mode'); else url.searchParams.set('data-mode', selected);
    location.assign(url.href);
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-data-mode]');
    if (button) switchView(button.dataset.dataMode);
  });
  document.addEventListener('focusin', event => {
    if (event.target.closest('[data-data-offer]')) offerRequested = true;
  });
  const progress = (phase, completed, total) => {
    const indicator = document.querySelector('[data-data-progress]');
    const label = document.querySelector('[data-data-progress-label]');
    if (!indicator || !label || switching) return;
    indicator.max = Math.max(1, total);
    indicator.value = completed;
    label.textContent = (settings.labels[phase] || settings.labels.loading).replace('{loaded}', completed).replace('{total}', total);
    indicator.setAttribute('aria-label', label.textContent);
  };
  const showOffer = () => {
    if (firstScreenReady || dismissed) return;
    offerRequested = true;
    const offer = document.querySelector('[data-data-offer]');
    if (offer) {
      offer.hidden = false;
      offer.querySelector('h2').textContent = settings.labels.slowTitle;
      offer.querySelector('[data-data-loading-notice]').textContent = settings.labels.slowNotice;
    }
  };
  const offerTimer = mode === 'full' && preference === 'auto' && settings.detectSlowConnection
    ? setTimeout(showOffer, Math.max(0, (settings.promptAfterMs || 5000) - performance.now()))
    : null;
  const activateResources = (kind, feature) => {
    const loading = [];
    for (const template of document.querySelectorAll('template[data-edgepress-data-resource]')) {
      if (template.dataset.edgepressDataResource !== kind) continue;
      if (feature && template.dataset.dataFeature !== feature) continue;
      const original = template.content.firstElementChild;
      if (!original) continue;
      const source = original.getAttribute('src') || original.getAttribute('href');
      const identity = kind + ':' + original.tagName + ':' + (original.getAttribute('rel') || '') + ':' + source;
      if (resources.has(identity)) continue;
      const element = document.createElement(original.tagName);
      for (const attribute of original.attributes) element.setAttribute(attribute.name, attribute.value);
      if (element.tagName === 'SCRIPT') element.async = false;
      if (element.tagName === 'SCRIPT' || element.tagName === 'LINK' && element.rel === 'stylesheet') loading.push(new Promise(resolve => {
        element.addEventListener('load', () => resolve(true), { once: true });
        element.addEventListener('error', () => {
          resources.delete(identity);
          element.replaceWith(template);
          resolve(false);
        }, { once: true });
      }));
      resources.set(identity, element);
      template.replaceWith(element);
    }
    return loading;
  };
  const activateMedia = host => {
    const template = host.querySelector(':scope > template');
    if (!template) return;
    if (template.hasAttribute('data-edgepress-data-html')) template.innerHTML = template.content.textContent;
    host.replaceChildren(template.content.cloneNode(true));
    host.dataset.loaded = 'true';
    document.dispatchEvent(new CustomEvent('edgepress:data-media', { detail: { root: host } }));
  };
  const deferMedia = (element, activate, label = '') => {
    if (mode !== 'text') { activate(); return null; }
    const host = document.createElement('span');
    host.className = 'edgepress-data-placeholder';
    const text = document.createElement('span');
    text.dataset.dataDescription = '';
    text.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = settings.labels.load;
    if (label) button.setAttribute('aria-label', settings.labels.load + ': ' + label);
    button.addEventListener('click', () => {
      host.replaceChildren(element);
      host.dataset.loaded = 'true';
      activate();
      if (!element.matches('a, button, input, select, textarea, [tabindex]')) element.tabIndex = -1;
      element.focus({ preventScroll: true });
    }, { once: true });
    host.append(text, button);
    return host;
  };
  window.edgepressDataSaver = Object.freeze({ mode, preference, deferMedia });
  const initialize = () => {
    const offer = document.querySelector('[data-data-offer]');
    const waiting = document.querySelector('[data-data-wait]');
    prepareWaiting();
    let revealPage = () => {};
    const returnEntry = document.querySelector('[data-data-return]');
    if (returnEntry) returnEntry.hidden = mode !== 'text';
    if (offer && offerRequested) offer.hidden = false;
    const closeOffer = () => {
      if (!offer) return;
      if (offer.contains(document.activeElement)) {
        const main = document.querySelector('main');
        if (main) { if (!main.hasAttribute('tabindex')) main.tabIndex = -1; main.focus({ preventScroll: true }); }
      }
      offer.hidden = true;
    };
    const dismiss = () => { dismissed = true; clearTimeout(offerTimer); revealPage(); closeOffer(); };
    document.querySelector('[data-data-dismiss]')?.addEventListener('click', dismiss);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && offer && !offer.hidden) dismiss(); });
    let requestedFocus = false;
    let position = 0;
    try {
      requestedFocus = modes.includes(sessionStorage.getItem('edgepress-data-focus'));
      position = Number(sessionStorage.getItem('edgepress-data-scroll')) || 0;
      sessionStorage.removeItem('edgepress-data-focus');
      sessionStorage.removeItem('edgepress-data-scroll');
    } catch { requestedFocus = modes.includes(query); }
    const focusDeadline = performance.now() + 8000;
    const restoreFocus = () => {
      if (!requestedFocus || document.activeElement !== document.body) return;
      const target = document.querySelector('main');
      if (!target) return;
      if (getComputedStyle(target).visibility !== 'visible') {
        if (performance.now() < focusDeadline) requestAnimationFrame(restoreFocus);
        return;
      }
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      if (position > 0) scrollTo({ top: position, behavior: 'instant' });
    };
    const loading = activateResources('style', mode === 'text' ? 'core' : undefined);
    let completedStyles = 0;
    progress('progressStyles', 0, loading.length);
    for (const resource of loading) void resource.then(() => progress('progressStyles', ++completedStyles, loading.length));
    if (mode === 'full') {
      const reveal = () => {
        if (switching) return;
        clearTimeout(deadline);
        if (document.documentElement.dataset.edgepressDataReady === 'true') return;
        document.documentElement.dataset.edgepressDataReady = 'true';
        if (waiting) waiting.hidden = true;
        activateResources('script');
        requestAnimationFrame(restoreFocus);
      };
      revealPage = reveal;
      const deadline = setTimeout(() => { if (!offerRequested) reveal(); }, settings.detectSlowConnection && preference === 'auto' ? Math.max(20000, (settings.promptAfterMs || 5000) + 1000) : 4000);
      let stylesReady = false;
      const ready = () => { stylesReady = true; checkFirstScreen(); };
      void Promise.all(loading).then(() => {
        if (switching) return;
        document.querySelectorAll('[data-edgepress-data-media]').forEach(activateMedia);
        ready();
      }, ready);
      const checkFirstScreen = () => {
        if (!stylesReady || document.readyState === 'loading') return;
        const visibleImages = [...document.images].filter(image => {
          const rectangle = image.getBoundingClientRect();
          const visible = rectangle.width > 0 && rectangle.height > 0 && rectangle.top < innerHeight && rectangle.bottom > 0;
          if (visible && image.loading === 'lazy' && !image.complete) image.loading = 'eager';
          return visible;
        });
        const completedImages = visibleImages.filter(image => image.complete).length;
        progress('progressMedia', completedImages, visibleImages.length);
        if (completedImages < visibleImages.length) return;
        firstScreenReady = true;
        clearTimeout(offerTimer);
        clearInterval(monitor);
        if (!offerRequested || dismissed) { reveal(); closeOffer(); }
      };
      monitor = setInterval(checkFirstScreen, 100);
      requestAnimationFrame(checkFirstScreen);
      addEventListener('pagehide', () => clearTimeout(deadline), { once: true });
      return;
    }
    void Promise.all(loading).then(() => {
      if (switching) return;
      document.documentElement.dataset.edgepressDataReady = 'true';
      if (waiting) waiting.hidden = true;
      activateResources('script', 'core');
      requestAnimationFrame(restoreFocus);
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-oembed-load]');
      if (!button || !document.querySelector('template[data-edgepress-data-resource="script"][data-data-feature="embed"]')) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      void Promise.all(activateResources('script', 'embed')).then(results => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (results.every(Boolean)) button.click();
      });
    });
    for (const host of document.querySelectorAll('[data-edgepress-data-media]')) {
      if (host.hasAttribute('data-data-decorative') || host.hasAttribute('data-data-brand')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = settings.labels.load;
      const descriptionNode = host.querySelector('[data-data-description]');
      if (descriptionNode && !descriptionNode.textContent.trim()) descriptionNode.textContent = settings.labels.missingDescription;
      const description = descriptionNode?.textContent;
      if (description) button.setAttribute('aria-label', settings.labels.load + ': ' + description);
      const link = host.closest('a');
      if (link) link.after(button); else host.append(button);
      button.addEventListener('click', () => {
        if (link) button.remove();
        activateMedia(host);
        activateResources('style', host.dataset.dataFeature);
        activateResources('script', host.dataset.dataFeature);
        const target = host.querySelector('button, a, [tabindex], img, video, audio, iframe');
        if (target && !target.matches('a, button, input, select, textarea, [tabindex]')) target.tabIndex = -1;
        target?.focus({ preventScroll: true });
      }, { once: true });
    }
  };
  addEventListener('pagehide', () => { earlyObserver.disconnect(); clearTimeout(offerTimer); clearInterval(monitor); }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
})();
