const mounted = new WeakSet();
export async function load(integration) {
  const roots = [...document.querySelectorAll('[data-edgepress-service]')].filter(root => root.dataset.edgepressService === integration.id && !mounted.has(root));
  if (!roots.length) return;
  const address = new URL(integration.moduleUrl);
  if (address.protocol !== 'https:' || address.username || address.password) throw new Error('Invalid service module');
  const widget = await import(address.href);
  if (typeof widget.mount !== 'function') throw new Error('Service module must export mount');
  for (const root of roots) {
    await widget.mount(root, {backendUrl: integration.backendUrl, thread: root.dataset.serviceThread, title: root.dataset.serviceTitle});
    mounted.add(root);
  }
}
