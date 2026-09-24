export function load(integration) {
  const slots = [...document.querySelectorAll('[data-edgepress-ad="' + CSS.escape(integration.id) + '"]')];
  if (!slots.length) return;
  if (!window.__edgepressAdsenseLoaded) {
    window.__edgepressAdsenseLoaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(integration.clientId);
    script.dataset.edgepressProvider = 'google-adsense';
    document.head.append(script);
  }
  for (const slot of slots) {
    if (slot.dataset.loaded) continue;
    slot.dataset.loaded = 'true';
    const ad = document.createElement('ins');
    ad.className = 'adsbygoogle';
    ad.style.display = 'block';
    ad.dataset.adClient = integration.clientId;
    ad.dataset.adFormat = 'auto';
    ad.dataset.fullWidthResponsive = 'true';
    slot.append(ad);
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push({});
  }
}
