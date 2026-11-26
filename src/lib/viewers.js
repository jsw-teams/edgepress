// Zero-dependency URL/format validators and built-in accessible browser viewers
// (image lightbox, media gallery/player, and document previewer).

const DOCUMENT_FORMATS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);

export function documentUrl(value, base = 'https://document.invalid') {
  const raw = String(value ?? '').trim();
  if (!raw || /[\x00-\x20\\]/.test(raw) || raw.startsWith('//')) {
    throw new Error('Document URL must be a safe site path or HTTPS URL');
  }
  let url;
  try { url = new URL(raw, base); }
  catch { throw new Error('Document URL must be a safe site path or HTTPS URL'); }
  const isLocal = raw.startsWith('/') && !raw.startsWith('//');
  if (url.username || url.password || (!isLocal && url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error('Document URL must be a safe site path or HTTPS URL');
  }
  if (!isLocal && url.protocol !== 'https:') {
    throw new Error('Remote document URL must use HTTPS');
  }
  return url;
}

export function documentFormat(href, explicitFormat) {
  if (explicitFormat !== undefined && explicitFormat !== null && explicitFormat !== '') {
    const normalized = String(explicitFormat).trim().toLowerCase();
    return DOCUMENT_FORMATS.has(normalized) ? normalized : null;
  }
  let pathname;
  try { pathname = new URL(href, 'https://document.invalid').pathname; }
  catch { pathname = String(href ?? ''); }
  const ext = pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
  return DOCUMENT_FORMATS.has(ext) ? ext : null;
}

// Built-in accessible native <dialog> image lightbox (zero external dependencies).
const IMAGE_VIEWER_LIB_JS = `
export function mountImage(image, options = {}) {
  const labels = {
    openImage: 'Open image',
    closeImage: 'Close image',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    saveOriginal: 'Open original',
    retryMedia: 'Retry',
    loading: 'Loading image',
    imageUnavailable: 'Image unavailable',
    ...(options.labels || {})
  };
  const alt = (image.getAttribute('alt') || '').trim();
  const openLabel = alt ? labels.openImage + ': ' + alt : labels.openImage;
  const prevRole = image.getAttribute('role');
  const prevTab = image.getAttribute('tabindex');
  const prevAria = image.getAttribute('aria-label');
  const prevCursor = image.style.cursor;
  image.setAttribute('role', 'button');
  image.setAttribute('tabindex', '0');
  image.setAttribute('aria-label', openLabel);
  image.style.cursor = 'zoom-in';

  let dialog = null;
  const close = () => {
    if (!dialog) return;
    if (dialog.open) dialog.close();
    dialog.remove();
    dialog = null;
    image.focus({ preventScroll: true });
  };

  const open = () => {
    if (dialog) return;
    const src = typeof options.original === 'function' ? options.original() : (image.dataset.original || image.currentSrc || image.src);
    dialog = document.createElement('dialog');
    dialog.className = 'image-lightbox';
    dialog.setAttribute('aria-label', alt || labels.openImage);

    const toolbar = document.createElement('div');
    toolbar.className = 'image-lightbox-toolbar';

    let scale = 1;
    const photo = document.createElement('img');
    photo.className = 'image-lightbox-photo';
    photo.alt = alt;
    photo.decoding = 'async';

    const status = document.createElement('p');
    status.className = 'image-lightbox-status';
    status.setAttribute('role', 'status');
    status.textContent = labels.loading;

    const stage = document.createElement('div');
    stage.className = 'image-lightbox-stage';
    stage.append(photo, status);

    const applyZoom = () => {
      photo.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
      zoomOutBtn.disabled = scale <= 1;
      zoomInBtn.disabled = scale >= 3;
    };

    const mkBtn = (label, text, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'image-lightbox-btn';
      btn.setAttribute('aria-label', label);
      btn.textContent = text;
      btn.addEventListener('click', onClick);
      return btn;
    };

    const zoomOutBtn = mkBtn(labels.zoomOut, '−', () => { scale = Math.max(1, +(scale - 0.5).toFixed(2)); applyZoom(); });
    const zoomInBtn = mkBtn(labels.zoomIn, '+', () => { scale = Math.min(3, +(scale + 0.5).toFixed(2)); applyZoom(); });
    const closeBtn = mkBtn(labels.closeImage, '×', close);
    toolbar.append(zoomOutBtn, zoomInBtn, closeBtn);
    applyZoom();

    photo.addEventListener('load', () => { status.hidden = true; });
    photo.addEventListener('error', () => { status.hidden = false; status.textContent = labels.imageUnavailable; });
    photo.src = src;

    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog || event.target === stage) close(); });
    dialog.append(toolbar, stage);
    document.body.append(dialog);
    dialog.showModal();
    closeBtn.focus({ preventScroll: true });
  };

  const onClick = (event) => {
    const link = image.closest('a');
    if (link) event.preventDefault();
    open();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };
  image.addEventListener('click', onClick);
  image.addEventListener('keydown', onKeyDown);

  return () => {
    close();
    image.removeEventListener('click', onClick);
    image.removeEventListener('keydown', onKeyDown);
    if (prevRole === null) image.removeAttribute('role'); else image.setAttribute('role', prevRole);
    if (prevTab === null) image.removeAttribute('tabindex'); else image.setAttribute('tabindex', prevTab);
    if (prevAria === null) image.removeAttribute('aria-label'); else image.setAttribute('aria-label', prevAria);
    image.style.cursor = prevCursor;
  };
}
`;

const IMAGE_VIEWER_CSS = `
.image-lightbox{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:16px;border:0;background:rgba(12,14,18,.92);color:#fff;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;z-index:2147483000}
.image-lightbox:not([open]){display:none}
.image-lightbox::backdrop{background:rgba(12,14,18,.86)}
.image-lightbox-toolbar{display:flex;justify-content:flex-end;gap:8px}
.image-lightbox-btn{min-width:44px;min-height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:rgba(24,27,34,.85);color:#fff;font:600 18px/1 var(--edgepress-font-sans,system-ui);cursor:pointer}
.image-lightbox-btn:hover:not(:disabled){background:rgba(255,255,255,.18)}
.image-lightbox-btn:disabled{opacity:.45;cursor:not-allowed}
.image-lightbox-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}
.image-lightbox-stage{display:grid;place-items:center;min-width:0;min-height:0;overflow:auto}
.image-lightbox-photo{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;transition:transform .16s ease;transform-origin:center}
.image-lightbox-status{margin:0;font-size:.95rem;color:#e5e7eb}
`;

const MEDIA_GALLERY_LIB_JS = `
import { mountImage } from './image-viewer-lib.js';

export function mountGallery(gallery, options = {}) {
  const templates = [...gallery.querySelectorAll('template')];
  const stage = gallery.querySelector('.gallery-stage');
  const nav = gallery.querySelector('.gallery-navigation');
  const prevBtn = nav?.querySelector('[data-previous]');
  const nextBtn = nav?.querySelector('[data-next]');
  const count = nav?.querySelector('.gallery-count');
  let index = 0;
  let cleanup = () => {};

  if (prevBtn && !prevBtn.textContent) prevBtn.textContent = '←';
  if (nextBtn && !nextBtn.textContent) nextBtn.textContent = '→';

  const show = async (nextIndex) => {
    cleanup();
    cleanup = () => {};
    index = ((nextIndex % templates.length) + templates.length) % templates.length;
    const current = index;
    const fragment = templates[index].content.cloneNode(true);
    stage.replaceChildren(fragment);
    if (count) count.textContent = (index + 1) + ' / ' + templates.length;
    const img = stage.querySelector('img');
    if (img) {
      cleanup = mountImage(img, { original: () => img.dataset.original || img.currentSrc || img.src });
    }
    const video = stage.querySelector('video');
    if (video && typeof options.mountVideo === 'function') {
      const dispose = await options.mountVideo(video, { isCurrent: () => index === current });
      if (index === current && typeof dispose === 'function') cleanup = dispose;
      else if (typeof dispose === 'function') dispose();
    }
  };

  const onPrev = () => { void show(index - 1); };
  const onNext = () => { void show(index + 1); };
  prevBtn?.addEventListener('click', onPrev);
  nextBtn?.addEventListener('click', onNext);
  if (templates.length) void show(0);

  return () => {
    cleanup();
    prevBtn?.removeEventListener('click', onPrev);
    nextBtn?.removeEventListener('click', onNext);
  };
}
`;

const MEDIA_PLAYER_LIB_JS = `
export function mountVideo(video, options = {}) {
  const sourceUrl = typeof options.source === 'function' ? options.source() : (video.dataset.source || video.getAttribute('src') || '');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'none';
  const onPlay = () => {
    if (!video.getAttribute('src') && !video.querySelector('source[src]') && sourceUrl) {
      video.src = sourceUrl;
      video.load();
      void video.play().catch(() => {});
    }
  };
  video.addEventListener('play', onPlay, { once: true });
  return () => {
    video.removeEventListener('play', onPlay);
    video.pause();
  };
}
`;

const MEDIA_PLAYER_CSS = `
.media-gallery{display:grid;gap:12px}
.gallery-stage img,.gallery-stage video{display:block;width:100%;max-height:70vh;object-fit:contain;border-radius:10px}
.gallery-navigation{display:flex;align-items:center;justify-content:center;gap:12px}
.gallery-navigation button{min-width:44px;min-height:44px;border:1px solid var(--line,#cbd5e1);border-radius:999px;background:var(--surface,#fff);color:var(--ink,#111);font:inherit;cursor:pointer}
`;

const DOCUMENT_VIEWER_JS = `
export function mountDocument(container, options = {}) {
  const labels = {
    preview: 'Preview',
    close: 'Close',
    loading: 'Loading document...',
    error: 'Document preview is unavailable.',
    ...(options.labels || {})
  };
  let active = false;
  const render = () => {
    if (typeof options.canLoad === 'function' && !options.canLoad()) {
      container.replaceChildren();
      active = false;
      return;
    }
    if (active) return;
    active = true;
    const wrapper = document.createElement('div');
    wrapper.className = 'edgepress-doc-viewer';
    const header = document.createElement('div');
    header.className = 'edgepress-doc-header';
    const title = document.createElement('strong');
    title.textContent = options.title || '';
    header.append(title);
    wrapper.append(header);
    const src = options.previewSrc || options.src;
    if (options.format === 'pdf' && src) {
      const frame = document.createElement('iframe');
      frame.className = 'edgepress-doc-frame';
      frame.setAttribute('sandbox', '');
      frame.setAttribute('title', options.title || labels.preview);
      frame.src = src;
      wrapper.append(frame);
    } else {
      const notice = document.createElement('p');
      notice.className = 'edgepress-doc-notice';
      notice.textContent = labels.error;
      wrapper.append(notice);
    }
    container.replaceChildren(wrapper);
  };
  render();
  return {
    refresh: render,
    close() { active = false; container.replaceChildren(); }
  };
}
`;

const DOCUMENT_VIEWER_CSS = `
.edgepress-doc-viewer{display:grid;gap:10px;border:1px solid var(--line,#cbd5e1);border-radius:12px;padding:14px;background:var(--surface,var(--paper,#fff))}
.edgepress-doc-header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.edgepress-doc-frame{width:100%;min-height:480px;border:1px solid var(--line,#cbd5e1);border-radius:8px;background:#fff}
.edgepress-doc-notice{margin:0;color:var(--muted,#555)}
`;

export function builtinImageViewerAssets() {
  return [
    { path: 'edgepress/image-viewer-lib.js', content: Buffer.from(IMAGE_VIEWER_LIB_JS, 'utf8'), sourceName: 'EdgePress image viewer' },
    { path: 'edgepress/image-viewer.css', content: Buffer.from(IMAGE_VIEWER_CSS, 'utf8'), sourceName: 'EdgePress image viewer' }
  ];
}

export function builtinMediaViewerAssets() {
  return [
    { path: 'edgepress/media-gallery-lib.js', content: Buffer.from(MEDIA_GALLERY_LIB_JS, 'utf8'), sourceName: 'EdgePress media viewer' },
    { path: 'edgepress/media-player-lib.js', content: Buffer.from(MEDIA_PLAYER_LIB_JS, 'utf8'), sourceName: 'EdgePress media viewer' },
    { path: 'edgepress/media-player.css', content: Buffer.from(MEDIA_PLAYER_CSS, 'utf8'), sourceName: 'EdgePress media viewer' }
  ];
}

export function builtinDocumentViewerAssets(prefix = 'edgepress/document-viewer') {
  return [
    { path: prefix + '/index.js', content: Buffer.from(DOCUMENT_VIEWER_JS, 'utf8'), sourceName: 'EdgePress document viewer' },
    { path: prefix + '/styles.css', content: Buffer.from(DOCUMENT_VIEWER_CSS, 'utf8'), sourceName: 'EdgePress document viewer' }
  ];
}
