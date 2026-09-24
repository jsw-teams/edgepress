export function load(integration) {
  if (window.__edgepressGaLoaded) return;
  window.__edgepressGaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', integration.measurementId, { anonymize_ip: true });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(integration.measurementId);
  script.dataset.edgepressProvider = 'google-analytics';
  document.head.append(script);
}
