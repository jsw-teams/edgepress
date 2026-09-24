export function load(integration) {
  if (document.querySelector('script[data-edgepress-provider="baidu-tongji"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://hm.baidu.com/hm.js?' + encodeURIComponent(integration.siteId);
  script.dataset.edgepressProvider = 'baidu-tongji';
  document.head.append(script);
}
