export function load(service) {
  if (document.querySelector('script[data-edgepress-provider="google-tag-manager"]')) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(service.containerId);
  script.dataset.edgepressProvider = 'google-tag-manager';
  document.head.append(script);
}
