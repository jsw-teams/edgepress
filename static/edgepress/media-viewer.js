import { mountGallery } from './media-gallery-lib.js';
import { readChoice } from './plugins/consent/choices.js';

const settings = JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent || '{}');
const mounted = new Map();
let videoStyles = null;

function allowed(root) {
  const id = root.dataset.mediaService;
  if (!id) return true;
  const service = settings.privacy?.integrations?.find(item => item.id === id);
  return service?.provider === 'external-api' && service.enabled !== false && !!readChoice(settings)?.allowed.includes(id);
}

function refresh() {
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
        if (!videoStyles) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = new URL('./media-player.css', import.meta.url).href;
          videoStyles = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
          document.head.append(link);
        }
        const [{ mountVideo }] = await Promise.all([import('./media-player-lib.js'), videoStyles]);
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
document.addEventListener('click', event => { if (event.target.closest('.privacy-panel button')) setTimeout(refresh, 0); });
addEventListener('pagehide', () => { for (const dispose of mounted.values()) dispose(); mounted.clear(); });
