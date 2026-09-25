const iconNames = new Set([
  'home', 'book-open', 'rocket', 'newspaper', 'search', 'shield-check', 'rss', 'file-text',
  'layers', 'code', 'puzzle', 'plug', 'cloud', 'palette', 'globe', 'help-circle', 'arrow-up-right',
  'check-circle', 'layout-grid', 'terminal', 'settings', 'sparkles'
]);

export function isIconName(name) {
  return typeof name === 'string' && iconNames.has(name);
}

export function renderIcon(name, className = 'icon') {
  if (!isIconName(name)) throw new Error('Unsupported EdgePress icon: ' + String(name));
  if (!/^[a-z][a-z0-9-]*$/.test(className)) throw new Error('Icon class must be a simple CSS identifier');
  return '<svg class="' + className + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/edgepress/icons.svg#' +
    name + '"></use></svg>';
}
