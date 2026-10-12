// Local tool modules are trusted site source, like theme scripts. External
// providers belong to consent-controlled services, never this element.
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderLocalTool(block, context) {
  for (const key of Object.keys(block)) if (!['type','id','title','text','script','stylesheet','data','fallback'].includes(key)) throw new Error('Unsupported local-tool option: ' + key);
  if (typeof block.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(block.id)) throw new Error('local-tool.id must be a lowercase HTML identifier');
  if (context.localToolIds?.has(block.id)) throw new Error('Duplicate local-tool.id: ' + block.id);
  context.localToolIds?.add(block.id);
  const string = (key, required = false) => {
    const value = block[key];
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('local-tool.' + key + ' must be a non-empty string of at most 2000 characters');
    return escape(value);
  };
  const asset = (key, extension, required = false) => {
    if (block[key] === undefined && !required) return '';
    const value = block[key];
    if (typeof value !== 'string' || !/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(value) || value.split('/').some(p => p==='.' || p==='..') || !extension.test(value)) throw new Error('local-tool.' + key + ' must be a same-origin local asset path');
    if (!context.config.assetManifest?.[value]) throw new Error('local-tool.' + key + ' asset does not exist: ' + value);
    return escape(value);
  };
  const script = asset('script', /\.m?js$/, true);
  const stylesheet = asset('stylesheet', /\.css$/);
  const data = asset('data', /\.json$/);
  const title = string('title', true), description = string('text'), fallback = string('fallback', true);
  const heading = block.id + '-title';
  return '<section class="local-tool" id="' + block.id + '" data-edgepress-local-tool' + (data ? ' data-tool-data="' + data + '"' : '') + ' aria-labelledby="' + heading + '"><h2 id="' + heading + '">' + title + '</h2>' + (description ? '<p class="local-tool-description">' + description + '</p>' : '') + '<div data-tool-mount></div><noscript><p>' + fallback + '</p></noscript></section>' + (stylesheet ? '<link rel="stylesheet" href="' + stylesheet + '">' : '') + '<script type="module" src="' + script + '"></script>';
}
