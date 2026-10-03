import {callService} from './services.js';
import {readChoice} from './plugins/consent/choices.js';

const scripts=new Map();
export function trustedProviderEmbed(data,service,document) {
  if(!data||String(data.version)!=='1.0'||!['rich','video','photo','link'].includes(data.type))throw new Error('Invalid oEmbed metadata');
  const origins=service.embedOrigins || [new URL(service.backendUrl).origin];
  const safe=value=>{const url=new URL(value);if(url.protocol!=='https:'||!origins.includes(url.origin)||url.username||url.password)throw new Error('Untrusted embed origin');return url.href;};
  if(data.type==='photo'){const img=document.createElement('img');img.src=safe(data.url);img.alt=data.title||'';img.loading='lazy';img.style.cssText='max-width:100%;height:auto';return img;}
  const container=document.createElement('div');container.className='oembed-content';
  const template=document.createElement('template');template.innerHTML=data.html||'';
  const tags=new Set(['IFRAME','BLOCKQUOTE','DIV','SECTION','A','P','SPAN','BR','STRONG','EM']);
  function copy(source,parent){
    if(source.nodeType===3){parent.append(document.createTextNode(source.textContent));return;}
    if(source.nodeType!==1||!tags.has(source.tagName))return;
    const node=document.createElement(source.tagName.toLowerCase());
    if(source.tagName==='IFRAME'){
      node.src=safe(source.getAttribute('src'));node.title=data.title||'Media';node.loading='lazy';node.referrerPolicy='no-referrer';node.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups');node.allow='fullscreen; picture-in-picture';node.allowFullscreen=true;
      const w=Math.max(200,Math.min(4096,Number(data.width)||640)),h=Math.max(60,Math.min(4096,Number(data.height)||480));node.style.cssText='display:block;width:100%;border:0;aspect-ratio:'+w+'/'+h+';height:auto';
    }else{
      if(source.tagName==='A'){
        try{const url=new URL(source.getAttribute('href'));if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();node.href=url.href;node.target='_blank';node.rel='noopener noreferrer';}catch{return;}
      }
      for(const name of ['class','lang','dir','cite','data-video-id','data-embed-from','data-dnt','data-theme'])if(source.hasAttribute(name))node.setAttribute(name,source.getAttribute(name));
      for(const attribute of source.attributes)if(attribute.name.startsWith('data-'))node.setAttribute(attribute.name,attribute.value);
      for(const child of source.childNodes)copy(child,node);
    }
    parent.append(node);
  }
  for(const child of template.content.childNodes)copy(child,container);
  return container;
}
async function loadScripts(service,root) {
  for(const address of service.embedScripts || []) {
    if(!scripts.has(address)||!globalThis.twttr?.widgets?.load)scripts.set(address,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=address;script.async=true;script.referrerPolicy='no-referrer';script.onload=resolve;script.onerror=()=>{scripts.delete(address);script.remove();reject(new Error('Embed script unavailable'));};document.body.append(script);}));
    await scripts.get(address);
  }
  globalThis.twttr?.widgets?.load(root);
}

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
  const dimensions=data=>({...data,...(root.dataset.oembedWidth?{width:Number(root.dataset.oembedWidth)}:{}),...(root.dataset.oembedHeight?{height:Number(root.dataset.oembedHeight)}:{})});
  try{
    if(!readChoice(config)?.allowed.includes(id))throw new Error('Service requires visitor consent: '+id);
    if(integration.oembedEndpoint||integration.embedTemplate){
      const stored=root.querySelector('[data-oembed-data]');if(!stored)throw new Error('Embed unavailable');
      const data=dimensions(JSON.parse(stored.content.textContent)),media=trustedProviderEmbed(data,integration,document);
      root.querySelector('[data-oembed-status]').replaceChildren(media);
      await loadScripts(integration,media);root.querySelector('[data-oembed-load]')?.remove();root.dataset.loaded='true';return;
    }
    const response=await callService(id,'oembed',{headers:{'X-Service-Resource':encodeURIComponent(root.dataset.oembedUrl)}});
    if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('Embed unavailable');
    const data=dimensions(await response.json()),media=trustedEmbed(data,new URL(integration.backendUrl).origin,document);
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
