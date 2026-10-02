// Native selects retain keyboard interaction; noscript links provide the fallback.
for (const select of document.querySelectorAll('[data-navigation-select]')) {
  select.parentElement.hidden = false;
  select.addEventListener('change', () => {
    const target = new URL(select.value, location.href);
    if (['http:', 'https:'].includes(target.protocol) && !target.username && !target.password) location.assign(target.href);
  });
}
