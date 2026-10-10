import {callService} from './services.js';
import {readChoice} from './plugins/consent/choices.js';

const scripts=new Map();
function reservePhotoDimensions(image,data){
  const width=Number(data.width),height=Number(data.height);
  if(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&width<=100000&&height<=100000){
    image.width=Math.max(1,Math.round(width));image.height=Math.max(1,Math.round(height));
    image.style.aspectRatio=String(image.width)+' / '+image.height;
  }else{image.style.aspectRatio='4 / 3';image.style.objectFit='contain';}
  return image;
}
function config(){return JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent||'{}');}
function updateNotice(root,key){
  const settings=config(),service=settings.privacy?.integrations?.find(item=>item.id===root.dataset.edgepressOembed);
  if(!service)return;
  if(!key)key=root.dataset.loaded?'embedLoaded':root.dataset.oembedUnavailable?'embedUnavailable':readChoice(settings)?.allowed.includes(service.id)?'embedReady':'embedNeedsConsent';
  const name=typeof service.name==='string'?service.name:service.name?.[settings.siteLanguage]||service.name?.[settings.defaultLocale]||service.id;
  const notice=root.querySelector('[data-oembed-notice]');if(notice){notice.hidden=key==='embedLoaded';notice.textContent=(settings.ui?.[key]||key).replace('{service}',name);}
}
export function trustedProviderEmbed(data,service,document) {
  if(!data||String(data.version)!=='1.0'||!['rich','video','photo','link'].includes(data.type))throw new Error('Invalid oEmbed metadata');
  const origins=service.embedOrigins || [new URL(service.backendUrl).origin];
  const safe=value=>{const url=new URL(value);if(url.protocol!=='https:'||!origins.includes(url.origin)||url.username||url.password)throw new Error('Untrusted embed origin');return url.href;};
  if(data.type==='photo'){const img=document.createElement('img');img.src=safe(data.url);img.alt=data.title||'';img.loading='lazy';img.style.cssText='width:100%;max-width:100%;height:auto';return reservePhotoDimensions(img,data);}
  const container=document.createElement('div');container.className='oembed-content';
  const template=document.createElement('template');template.innerHTML=data.html||'';
  const tags=new Set(['IFRAME','BLOCKQUOTE','DIV','SECTION','A','P','SPAN','BR','STRONG','EM']);
  function copy(source,parent){
    if(source.nodeType===3){parent.append(document.createTextNode(source.textContent));return;}
    if(source.nodeType!==1||!tags.has(source.tagName))return;
    const node=document.createElement(source.tagName.toLowerCase());
    if(source.tagName==='IFRAME'){
      if(source.hasAttribute('class'))node.className=source.getAttribute('class');
      node.src=safe(source.getAttribute('src'));node.title=data.title||'Media';node.loading='lazy';node.referrerPolicy='strict-origin-when-cross-origin';node.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups');node.allow='fullscreen; picture-in-picture; encrypted-media';node.allowFullscreen=true;
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
    const reusable=/^https:\/\/platform\.(?:x|twitter)\.com\/widgets\.js$/.test(address);
    if(!scripts.has(address)||!reusable)scripts.set(address,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=address;script.async=true;script.referrerPolicy='no-referrer';script.onload=resolve;script.onerror=()=>{scripts.delete(address);script.remove();reject(new Error('Embed script unavailable'));};document.body.append(script);}));
    await scripts.get(address);
  }
  globalThis.twttr?.widgets?.load(root);
}

export function trustedEmbed(data,origin,document) {
  if(!data||String(data.version)!=='1.0'||!['rich','video','photo'].includes(data.type))throw new Error('Invalid oEmbed metadata');
  const safe=value=>{const url=new URL(value);if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new Error('Untrusted embed origin');return url.href;};
  if(data.type==='photo'){
    const image=document.createElement('img');image.src=safe(data.url);image.alt=typeof data.title==='string'?data.title.slice(0,500):'';image.loading='lazy';image.style.cssText='display:block;width:100%;max-width:100%;height:auto;';return reservePhotoDimensions(image,data);
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
  root.dataset.requested='true';root.dataset.loading='true';root.setAttribute('aria-busy','true');root.classList.add('is-loading');
  const button=root.querySelector('[data-oembed-load]');
  const buttonHadFocus=document.activeElement===button;
  if(button)button.disabled=true;
  const complete=media=>{
    const restoreFocus=buttonHadFocus&&(document.activeElement===button||document.activeElement===document.body);
    const status=root.querySelector('[data-oembed-status]');
    if(media.parentElement!==status)status.replaceChildren(media);
    button?.remove();root.dataset.loaded='true';updateNotice(root,'embedLoaded');
    if(restoreFocus)root.querySelector('figcaption a')?.focus({preventScroll:true});
  };
  const dimensions=data=>({...data,...(root.dataset.oembedWidth?{width:Number(root.dataset.oembedWidth)}:{}),...(root.dataset.oembedHeight?{height:Number(root.dataset.oembedHeight)}:{})});
  try{
    if(!readChoice(config)?.allowed.includes(id))throw new Error('Service requires visitor consent: '+id);
    updateNotice(root,'embedLoading');
    if(integration.oembedEndpoint||integration.embedTemplate){
      const stored=root.querySelector('[data-oembed-data]');if(!stored)throw new Error('Embed unavailable');
      const data=dimensions(JSON.parse(stored.content.textContent)),media=trustedProviderEmbed(data,integration,document);
      root.querySelector('[data-oembed-status]').replaceChildren(media);
      await loadScripts(integration,media);complete(media);return;
    }
    const response=await callService(id,'oembed',{headers:{'X-Service-Resource':encodeURIComponent(root.dataset.oembedUrl)}});
    if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('Embed unavailable');
    const data=dimensions(await response.json()),media=trustedEmbed(data,new URL(integration.backendUrl).origin,document);
    complete(media);
  }catch(error){
    if(error.message.startsWith('Service requires visitor consent:'))document.dispatchEvent(new CustomEvent('edgepress:privacy-open'));
    else{root.dataset.requested='false';root.querySelector('[data-oembed-status]').replaceChildren();updateNotice(root,'embedUnavailable');}
  }finally{delete root.dataset.loading;root.classList.remove('is-loading');root.setAttribute('aria-busy','false');if(button?.isConnected)button.disabled=false;}
}
if(typeof document!=='undefined'){
  const roots=[...document.querySelectorAll('[data-edgepress-oembed]')],visible=new WeakSet();
  for(const root of roots){const width=Number(root.dataset.oembedWidth)||640,height=Number(root.dataset.oembedHeight)||480;root.style.setProperty('--oembed-ratio',width+'/'+height);}
  function frameTheme(frame){
    const style=getComputedStyle(document.documentElement),colors=Object.fromEntries(['--accent','--ink','--muted','--line','--paper','--surface'].map(key=>[key,style.getPropertyValue(key).trim()]).filter(([,value])=>value));
    frame.contentWindow?.postMessage({type:'edgepress:embed-theme',colors},new URL(frame.src).origin);
  }
  document.addEventListener('edgepress:theme-change',()=>{for(const root of roots)for(const frame of root.querySelectorAll('iframe[data-theme-ready]'))frameTheme(frame);});
  new MutationObserver(()=>{for(const root of roots)for(const frame of root.querySelectorAll('iframe[data-theme-ready]'))frameTheme(frame);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
  globalThis.matchMedia?.('(prefers-color-scheme:dark)').addEventListener('change',()=>{for(const root of roots)for(const frame of root.querySelectorAll('iframe[data-theme-ready]'))frameTheme(frame);});
  globalThis.addEventListener('message',event=>{
    const frame=roots.flatMap(root=>[...root.querySelectorAll('iframe')]).find(frame=>frame.contentWindow===event.source&&new URL(frame.src).origin===event.origin);if(!frame)return;
    if(event.data?.type==='edgepress:embed-ready'){frame.dataset.themeReady='true';frameTheme(frame);}
    if(event.data?.type==='edgepress:embed-size'&&Number.isFinite(event.data.height)&&event.data.height>=120&&event.data.height<=4096){frame.style.height=Math.ceil(event.data.height)+'px';frame.style.aspectRatio='auto';}
  });
  function loadAllowed(root){updateNotice(root);if(!root.dataset.oembedUnavailable&&readChoice(config())?.allowed.includes(root.dataset.edgepressOembed)&&(root.dataset.requested==='true'||document.documentElement.dataset.edgepressDataMode!=='text'&&visible.has(root)))void show(root);}
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){visible.add(entry.target);loadAllowed(entry.target);}else visible.delete(entry.target);},{rootMargin:'200px'}):null;
  for(const root of roots){updateNotice(root);if(observer)observer.observe(root);else{visible.add(root);loadAllowed(root);}}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-oembed-load]');if(button)void show(button.closest('[data-edgepress-oembed]'));});
  document.addEventListener('edgepress:service-ready',event=>{for(const root of roots)if(root.dataset.edgepressOembed===event.detail?.id)loadAllowed(root);});
}
