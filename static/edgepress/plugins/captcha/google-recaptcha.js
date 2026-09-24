let loading;

export async function load(integration) {
  if (!document.querySelector('[data-edgepress-captcha="google-recaptcha"]')) return;
  await (loading ||= loadScript('https://www.google.com/recaptcha/api.js?render=explicit', 'google-recaptcha'));
  for (const element of document.querySelectorAll('[data-edgepress-captcha="google-recaptcha"]')) {
    if (element.dataset.rendered || !window.grecaptcha?.render) continue;
    element.dataset.rendered = 'true';
    window.grecaptcha.render(element, {
      sitekey: element.dataset.sitekey || integration.siteKey,
      callback: (token) => element.dispatchEvent(new CustomEvent('edgepress:captcha-success', { bubbles: true, detail: { token } }))
    });
  }
}

function loadScript(src, name) {
  return new Promise((resolve, reject) => {
    if (window.grecaptcha?.render) return resolve();
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.dataset.edgepressProvider = name;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load CAPTCHA provider'));
    document.head.append(script);
  });
}
