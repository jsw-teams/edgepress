for (const select of document.querySelectorAll('[data-language-select]')) {
  select.addEventListener('change', () => {
    if (select.value) window.location.assign(select.value);
  });
}
