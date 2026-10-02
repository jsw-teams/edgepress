// Native selects retain keyboard interaction; noscript links provide the fallback.
for (const select of document.querySelectorAll('[data-navigation-select]')) {
  select.value = '';
  select.parentElement.hidden = false;
  select.addEventListener('change', () => {
    if (!select.value) return;
    const target = new URL(select.value, location.href);
    select.value = '';
    if (['http:', 'https:'].includes(target.protocol) && !target.username && !target.password) location.assign(target.href);
  });
}
