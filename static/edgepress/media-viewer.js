import { mountGallery } from './media-gallery-lib.js';
import { readChoice } from './plugins/consent/choices.js';

const settings = JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent || '{}');
const mounted = new Map();
const inlineVideos = new Map();
let playerResources = null;

function loadPlayer() {
  if (!playerResources) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./media-player.css', import.meta.url).href;
    const styles = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
    document.head.append(link);
    playerResources = Promise.all([import('./media-player-lib.js'), styles]).then(([library]) => library).catch(error => {
      link.remove();
      playerResources = null;
      throw error;
    });
  }
  return playerResources;
}

const viewing = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const state = inlineVideos.get(entry.target);
    if (!state) continue;
    if (!entry.isIntersecting) { state.video.pause(); continue; }
    if (state.started) continue;
    state.started = true;
    void loadPlayer().then(({ mountVideo }) => {
      if (!inlineVideos.has(entry.target) || !entry.target.isConnected) return;
      // Keep progressive native controls until the shared component is ready,
      // then leave the actual file inert until the visitor presses Play.
      const sources = [...state.video.querySelectorAll('source[src]')];
      for (const source of sources) source.removeAttribute('src');
      state.video.removeAttribute('src');
      try {
        state.dispose = mountVideo(state.video, { type: 'native', source: () => state.source });
      } catch (error) {
        if (sources.length) sources[0].src = state.source;
        else state.video.src = state.source;
        state.video.controls = true;
        throw error;
      }
    }).catch(() => { state.started = false; });
  }
});

function allowed(root) {
  const id = root.dataset.mediaService;
  if (!id) return true;
  const service = settings.privacy?.integrations?.find(item => item.id === id);
  return service?.provider === 'external-api' && service.enabled !== false && !!readChoice(settings)?.allowed.includes(id);
}

function refresh() {
  for (const [root, dispose] of mounted) {
    if (!root.isConnected) { dispose(); mounted.delete(root); }
  }
  for (const [root, state] of inlineVideos) {
    if (!root.isConnected) { viewing.unobserve(root); state.dispose?.(); inlineVideos.delete(root); }
  }
  for (const root of document.querySelectorAll('[data-edgepress-video]')) {
    if (inlineVideos.has(root) || root.closest('template,[hidden],[data-edgepress-oembed],[data-edgepress-service]')) continue;
    const video = root.matches('video') ? root : root.querySelector('video');
    const source = video?.getAttribute('src') || video?.querySelector('source[src]')?.getAttribute('src');
    if (!source || new URL(source, location.href).origin !== location.origin) continue;
    inlineVideos.set(root, { video, source, started: false, dispose: null });
    viewing.observe(root);
  }
  for (const root of document.querySelectorAll('[data-edgepress-media-viewer]')) {
    if (root.closest('template,[data-edgepress-oembed],[data-edgepress-service]')) continue;
    const gallery = root.querySelector('.media-gallery');
    const stage = gallery.querySelector('.gallery-stage');
    const navigation = gallery.querySelector('.gallery-navigation');
    if (!allowed(root)) {
      mounted.get(root)?.();
      mounted.delete(root);
      stage.replaceChildren();
      navigation.hidden = true;
      continue;
    }
    if (mounted.has(root)) continue;
    stage.replaceChildren(gallery.querySelector('template').content.cloneNode(true));
    navigation.hidden = gallery.querySelectorAll('template').length < 2;
    mounted.set(root, mountGallery(gallery, {
      mountVideo: async (video, { isCurrent }) => {
        const { mountVideo } = await loadPlayer();
        if (!isCurrent() || !allowed(root)) return () => {};
        return mountVideo(video);
      }
    }));
  }
}

refresh();
addEventListener('storage', refresh);
document.addEventListener('edgepress:service-ready', refresh);
document.addEventListener('edgepress:data-media', refresh);
document.addEventListener('visibilitychange', refresh);
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const { video } of inlineVideos.values()) video.pause(); });
document.addEventListener('click', event => { if (event.target.closest('.privacy-panel button')) setTimeout(refresh, 0); });
addEventListener('pagehide', () => {
  viewing.disconnect();
  for (const dispose of mounted.values()) dispose();
  for (const { dispose } of inlineVideos.values()) dispose?.();
  mounted.clear();
  inlineVideos.clear();
});
