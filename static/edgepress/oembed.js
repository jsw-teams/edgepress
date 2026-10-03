import {callService} from './services.js';

export function trustedEmbed(data,origin,document) {
  if(!data||String(data.version)!=='1.0'||!['rich','video','photo'].includes(data.type))throw new Error('Invalid oEmbed metadata');
  const safe=value=>{const url=new URL(value);if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('Untrusted embed origin');return url.href;};
  if(data.type==='photo'){
    const image=document.createElement('img');image.src=safe(data.url);image.alt=typeof data.title==='string'?data.title.slice(0,500):'';image.loading='lazy';image.style.cssText='display:block;max-width:100%;height:auto;';return image;
  }
  if(typeof data.html!=='string'||data.html.length>32768)throw new Error('Invalid embed HTML');
  const template=document.createElement('template');template.innerHTML=data.html;
  const nodes=template.content.children;if(nodes.length!==1||nodes[0].tagName!=='IFRAME'||nodes[0].children.length)throw new Error('Only an iframe embed is supported');
  const frame=document.createElement('iframe');frame.src=safe(nodes[0].getAttribute('src'));frame.title=typeof data.title==='string'?data.title.slice(0,500):'Media';
  frame.referrerPolicy='no-referrer';frame.loading='lazy';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');frame.allow='fullscreen';frame.allowFullscreen=true;
  const width=Number(data.width),height=Number(data.height);if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>4096||height>4096)throw new Error('Invalid embed dimensions');
  frame.width=String(width);frame.height=String(height);frame.style.cssText='display:block;width:100%;max-width:100%;border:0;aspect-ratio:'+width+'/'+height+';height:auto;';return frame;
}

async function show(root) {
  if(root.dataset.loading||root.dataset.loaded)return;
  const id=root.dataset.edgepressOembed,config=JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent||'{}');
  const integration=config.privacy?.integrations?.find(service=>service.id===id&&service.provider==='oembed');if(!integration)return;
  root.dataset.requested='true';root.dataset.loading='true';
  try{
    const response=await callService(id,'oembed',{headers:{'X-Service-Resource':encodeURIComponent(root.dataset.oembedUrl)}});
    if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('Embed unavailable');
    const data=await response.json(),media=trustedEmbed(data,new URL(integration.backendUrl).origin,document);
    root.querySelector('[data-oembed-load]')?.remove();root.querySelector('[data-oembed-status]').replaceChildren(media);root.dataset.loaded='true';
  }catch(error){
    if(error.message.startsWith('Service requires visitor consent:'))document.dispatchEvent(new CustomEvent('edgepress:privacy-open'));
    else{root.dataset.requested='false';root.querySelector('[data-oembed-status]').textContent=config.ui?.embedUnavailable||'Media unavailable';}
  }finally{delete root.dataset.loading;}
}
if(typeof document!=='undefined'){
  document.addEventListener('click',event=>{const button=event.target.closest('[data-oembed-load]');if(button)void show(button.closest('[data-edgepress-oembed]'));});
  document.addEventListener('edgepress:service-ready',event=>{for(const root of document.querySelectorAll('[data-edgepress-oembed]'))if(root.dataset.edgepressOembed===event.detail?.id&&root.dataset.requested==='true')void show(root);});
}
