document.addEventListener('click', event => {
  if (event.target.closest('[data-service-consent-settings]')) document.dispatchEvent(new CustomEvent('edgepress:privacy-open'));
});
