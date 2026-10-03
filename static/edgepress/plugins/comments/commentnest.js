export async function load(integration) {
  const roots=document.querySelectorAll('[data-edgepress-comments]');
  if(!roots.length)return;
  const address=new URL('/commentnest/widget.js',integration.backendUrl);
  const widget=await import(address.href);
  for(const root of roots)widget.mount(root,{backendUrl:integration.backendUrl});
}
