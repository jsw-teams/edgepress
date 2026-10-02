document.querySelector('[data-comments-consent-settings]')?.addEventListener('click', () => {
  document.dispatchEvent(new CustomEvent('edgepress:privacy-open'));
});
