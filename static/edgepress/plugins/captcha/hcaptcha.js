let loading;

export async function load(integration) {
  if (!document.querySelector('[data-edgepress-captcha="hcaptcha"]')) return;
  await (loading ||= loadScript('https://js.hcaptcha.com/1/api.js?render=explicit', 'hcaptcha'));
  for (const element of document.querySelectorAll('[data-edgepress-captcha="hcaptcha"]')) {
    if (element.dataset.rendered || !window.hcaptcha?.render) continue;
    element.dataset.rendered = 'true';
    window.hcaptcha.render(element, {
      sitekey: element.dataset.sitekey || integration.siteKey,
      callback: (token) => element.dispatchEvent(new CustomEvent('edgepress:captcha-success', { bubbles: true, detail: { token } }))
    });
  }
}

function loadScript(src, name) {
  return new Promise((resolve, reject) => {
    if (window.hcaptcha?.render) return resolve();
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.dataset.edgepressProvider = name;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load CAPTCHA provider'));
    document.head.append(script);
  });
}
