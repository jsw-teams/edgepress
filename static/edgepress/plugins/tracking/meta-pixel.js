export function load(service) {
  if (window.__edgepressMetaPixelLoaded) return;
  window.__edgepressMetaPixelLoaded = true;
  window.fbq = window.fbq || function fbq() {
    if (window.fbq.callMethod) window.fbq.callMethod.apply(window.fbq, arguments);
    else window.fbq.queue.push(arguments);
  };
  window.fbq.queue = window.fbq.queue || [];
  window.fbq.loaded = true;
  window.fbq.version = '2.0';
  window.fbq('init', service.pixelId);
  window.fbq('track', 'PageView');
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.dataset.edgepressProvider = 'meta-pixel';
  document.head.append(script);
}
