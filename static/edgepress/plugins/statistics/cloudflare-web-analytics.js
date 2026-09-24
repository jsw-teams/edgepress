export function load(integration) {
  if (document.querySelector('script[data-edgepress-provider="cloudflare-web-analytics"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.dataset.cfBeacon = JSON.stringify({ token: integration.token });
  script.dataset.edgepressProvider = 'cloudflare-web-analytics';
  document.head.append(script);
}
