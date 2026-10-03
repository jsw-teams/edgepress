// Register availability locally. No network request is made by granting consent.
export async function load(integration) {
  document.dispatchEvent(new CustomEvent('edgepress:service-ready', {detail: {id: integration.id}}));
}
