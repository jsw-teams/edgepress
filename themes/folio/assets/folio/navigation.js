// Mark the current reading section without changing EdgePress navigation URLs.
const path = window.location.pathname;
for (const link of document.querySelectorAll('.primary-navigation a')) {
  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin) continue;
  if (destination.pathname === path ||
      (document.querySelector('main .post') && destination.pathname.endsWith('/archives/'))) {
    link.setAttribute('aria-current', 'page');
  }
}
