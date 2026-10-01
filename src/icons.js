const iconNames = new Set([
  'home', 'book-open', 'rocket', 'newspaper', 'search', 'shield-check', 'rss', 'file-text',
  'layers', 'code', 'puzzle', 'plug', 'cloud', 'palette', 'globe', 'help-circle', 'arrow-up-right',
  'check-circle', 'layout-grid', 'terminal', 'settings', 'sparkles', 'cpu', 'mail', 'github', 'check', 'x', 'arrow-right'
]);

export function isIconName(name) {
  return typeof name === 'string' && iconNames.has(name);
}

export function renderIcon(name, className = 'icon') {
  if (!isIconName(name)) throw new Error('Unsupported EdgePress icon: ' + String(name));
  if (typeof className !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]*(?: [a-zA-Z_][a-zA-Z0-9_-]*)*$/.test(className)) {
    throw new Error('Icon class must contain space-separated CSS identifiers');
  }
  return '<img class="' + className + ' icon-bitmap" src="/edgepress/icons/' + name + '.png" width="24" height="24" alt="" aria-hidden="true" decoding="async">';
}
