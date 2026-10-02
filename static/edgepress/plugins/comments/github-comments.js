export async function load() {
  if (!document.querySelector('[data-edgepress-comments]')) return;
  await import('../../comments.js');
}
