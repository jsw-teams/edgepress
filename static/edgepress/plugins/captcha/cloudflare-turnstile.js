let loading;

export async function load(integration) {
  if (!document.querySelector('[data-edgepress-captcha="cloudflare-turnstile"]')) return;
  await (loading ||= loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', 'cloudflare-turnstile'));
  for (const element of document.querySelectorAll('[data-edgepress-captcha="cloudflare-turnstile"]')) {
    if (element.dataset.rendered || !window.turnstile) continue;
    element.dataset.rendered = 'true';
    window.turnstile.render(element, {
      sitekey: element.dataset.sitekey || integration.siteKey,
      callback: (token) => element.dispatchEvent(new CustomEvent('edgepress:captcha-success', { bubbles: true, detail: { token } })),
      'error-callback': () => { element.dataset.rendered = ''; }
    });
  }
}

function loadScript(src, name) {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.dataset.edgepressProvider = name;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load CAPTCHA provider'));
    document.head.append(script);
  });
}
