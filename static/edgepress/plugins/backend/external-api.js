// Register availability locally; visible embed consumers may now load their content.
export async function load(integration) {
  document.dispatchEvent(new CustomEvent('edgepress:service-ready', {detail: {id: integration.id}}));
}
