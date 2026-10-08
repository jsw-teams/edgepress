import { classifyLink } from './external-links-policy.js';

export function mountExternalLinks(settings, doc = document) {
  if (!settings.enabled || doc.defaultView.top !== doc.defaultView.self) return () => {};
  const controller = new AbortController();
  const signal = controller.signal;
  const overlay = doc.createElement('div');
  overlay.className = 'edgepress-external-overlay';
  overlay.hidden = true;
  const panel = doc.createElement('section');
  panel.className = 'edgepress-external-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'edgepress-external-heading');
  panel.setAttribute('aria-describedby', 'edgepress-external-description');
  const title = doc.createElement('h2');
  title.id = 'edgepress-external-heading';
  title.textContent = settings.labels.title;
  const description = doc.createElement('p');
  description.id = 'edgepress-external-description';
  description.textContent = settings.labels.description;
  const destination = doc.createElement('p');
  destination.className = 'edgepress-external-domain';
  const origin = doc.createElement('p');
  origin.className = 'edgepress-external-origin';
  const actions = doc.createElement('div');
  actions.className = 'edgepress-external-actions';
  const back = doc.createElement('button');
  back.type = 'button';
  back.textContent = settings.labels.back;
  const proceed = doc.createElement('button');
  proceed.type = 'button';
  proceed.textContent = settings.labels.continue;
  actions.append(back, proceed);
  panel.append(title, description, destination, origin, actions);
  overlay.append(panel);
  doc.body.append(overlay);
  const bypass = new WeakSet();
  let pending = null;
  let active = null;
  let scrollStyle = '';
  const inert = new Map();
  const palette = () => {
    const body = doc.defaultView.getComputedStyle(doc.body);
    const root = doc.defaultView.getComputedStyle(doc.documentElement);
    const paper = body.backgroundColor === 'rgba(0, 0, 0, 0)' ? root.backgroundColor : body.backgroundColor;
    if (paper !== 'rgba(0, 0, 0, 0)') overlay.style.setProperty('--external-auto-paper', paper);
    overlay.style.setProperty('--external-auto-ink', body.color);
    overlay.style.setProperty('--external-auto-accent', active ? doc.defaultView.getComputedStyle(active).color : body.color);
  };
  const close = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    for (const [element, value] of inert) element.inert = value;
    inert.clear();
    doc.body.style.overflow = scrollStyle;
    pending = null;
    if (active?.isConnected) active.focus({ preventScroll: true });
    active = null;
  };
  const protectTarget = anchor => {
    if (anchor.target && !['_self', '_parent', '_top'].includes(anchor.target)) anchor.relList.add('noopener');
  };
  const prepare = () => doc.querySelectorAll('a[href]').forEach(protectTarget);
  prepare();
  const observer = new MutationObserver(() => {
    prepare();
    if (pending) for (const element of doc.body.children) if (element !== overlay && !inert.has(element)) { inert.set(element, element.inert); element.inert = true; }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  const themeObserver = new MutationObserver(() => { if (pending) palette(); });
  themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  doc.addEventListener('pointerdown', event => { const anchor = event.target.closest?.('a[href]'); if (anchor) protectTarget(anchor); }, { signal, capture: true });
  doc.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor) protectTarget(anchor);
    if (!anchor || bypass.has(anchor) || event.defaultPrevented) return;
    const target = classifyLink(anchor.getAttribute('href'), settings, doc.baseURI);
    if (target.kind === 'blocked') { event.preventDefault(); return; }
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (target.kind !== 'external' || anchor.hasAttribute('download') || anchor.closest('[data-external-link-skip]')) return;
    event.preventDefault();
    if (pending) return;
    active = anchor;
    pending = { anchor, url: target.url, target: anchor.target };
    palette();
    destination.textContent = target.domain;
    origin.textContent = target.origin;
    scrollStyle = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    for (const element of doc.body.children) if (element !== overlay) { inert.set(element, element.inert); element.inert = true; }
    overlay.hidden = false;
    back.focus();
  }, { signal });
  proceed.addEventListener('click', () => {
    const current = pending;
    if (!current) return;
    const target = classifyLink(current.anchor.getAttribute('href'), settings, doc.baseURI);
    close();
    if (!current.anchor.isConnected || target.kind !== 'external' || target.url !== current.url || current.anchor.target !== current.target || current.anchor.hasAttribute('download')) return;
    protectTarget(current.anchor);
    bypass.add(current.anchor);
    try { current.anchor.click(); } finally { bypass.delete(current.anchor); }
  }, { signal });
  back.addEventListener('click', close, { signal });
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); }, { signal });
  doc.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (doc.activeElement === back ? proceed : back).focus();
    }
  }, { signal, capture: true });
  doc.addEventListener('focusin', event => { if (!overlay.hidden && !panel.contains(event.target)) back.focus(); }, { signal });
  const dispose = () => { close(); controller.abort(); observer.disconnect(); themeObserver.disconnect(); overlay.remove(); };
  doc.defaultView.addEventListener('pagehide', event => { if (event.persisted) close(); else dispose(); }, { signal });
  return dispose;
}

const configuration = typeof document === 'undefined' ? null : document.getElementById('edgepress-external-links-config');
if (configuration) mountExternalLinks(JSON.parse(configuration.textContent));
