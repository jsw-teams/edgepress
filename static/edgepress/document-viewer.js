import { mountDocument } from './document-viewer/index.js';
import { readChoice } from './plugins/consent/choices.js';

const labels = JSON.parse(document.getElementById('edgepress-document-viewer-config')?.textContent || '{}');
const settings = JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent || '{}');
const viewers = new Map();

function allowed(root) {
  const id = root.dataset.documentService;
  const origins = [root.dataset.documentSrc, root.dataset.documentPreview].filter(Boolean).map(source => new URL(source, document.baseURI).origin);
  if (!id) return origins.every(origin => origin === location.origin);
  const service = settings.privacy?.integrations?.find(item => item.id === id);
  const permitted = service?.backendUrl ? [location.origin, new URL(service.backendUrl).origin, ...(service.csp?.['connect-src'] || [])] : [];
  if (service?.provider === 'external-api' && service.enabled !== false && origins.every(origin => permitted.includes(origin)) && readChoice(settings)?.allowed.includes(id)) return true;
  return false;
}

function refresh() {
  for (const root of document.querySelectorAll('[data-edgepress-document]')) {
    if (viewers.has(root)) continue;
    if (root.closest('[data-edgepress-oembed], [data-edgepress-service], template')) continue;
    const viewer = mountDocument(root.querySelector('[data-document-mount]'), {
      src: root.dataset.documentSrc, previewSrc: root.dataset.documentPreview,
      title: root.dataset.documentTitle, format: root.dataset.documentFormat,
      locale: document.documentElement.lang, labels, canLoad: () => allowed(root)
    });
    viewers.set(root, viewer);
  }
}
refresh();
document.addEventListener('edgepress:data-media', refresh);

addEventListener('pagehide', () => { for (const viewer of viewers.values()) viewer.close(false); });
addEventListener('storage', () => { for (const [root, viewer] of viewers) if (!allowed(root)) viewer.close(false); });
document.addEventListener('visibilitychange', () => { for (const [root, viewer] of viewers) if (!allowed(root)) viewer.close(false); });
