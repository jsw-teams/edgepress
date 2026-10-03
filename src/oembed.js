import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sanitizeHtml from 'sanitize-html';

export function sourceOrigins(service) { return service.sourceOrigins || [new URL(service.backendUrl).origin]; }
export function mediaOrigins(service) { return service.embedOrigins || [new URL(service.backendUrl).origin]; }
export function sanitizeEmbed(data,service) {
  if(!data || String(data.version)!=='1.0' || !['rich','video','photo','link'].includes(data.type)) throw new Error('Invalid oEmbed metadata');
  const origins=mediaOrigins(service);
  const safe=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&origins.includes(url.origin);}catch{return false;}};
  const result={version:'1.0',type:data.type,title:String(data.title||'').slice(0,500),width:Number(data.width)||640,height:Number(data.height)||480};
  if(data.type==='photo'){if(!safe(data.url))throw new Error('Untrusted oEmbed image');result.url=data.url;}
  if(['rich','video'].includes(data.type)) {
    if(typeof data.html!=='string'||data.html.length>65536)throw new Error('Invalid oEmbed HTML');
    result.html=sanitizeHtml(data.html,{
      allowedTags:['iframe','blockquote','div','section','a','p','span','br','strong','em'],
      allowedAttributes:{iframe:['src','title','width','height'],blockquote:['class','lang','dir','cite','data-*'],div:['class','data-*'],a:['href','class','lang','dir','data-*','target','rel'],p:['lang','dir'],span:['lang','dir']},
      allowedSchemes:['https','http'],allowProtocolRelative:false,
      exclusiveFilter:frame=>frame.tag==='iframe'&&!safe(frame.attribs.src),
      transformTags:{a:(_tag,attributes)=>({tagName:'a',attribs:{...attributes,target:'_blank',rel:'noopener noreferrer'}})}
    });
    if(!result.html.trim())throw new Error('No supported oEmbed content');
  }
  return result;
}

// Provider oEmbed APIs often lack browser CORS. Fetch their public metadata at
// build time; browsers receive inert JSON and only contact vendors after consent.
export async function resolveEmbed(service,address,config,fetcher=fetch) {
  const endpoint=new URL(service.oembedEndpoint);endpoint.searchParams.set('url',address);endpoint.searchParams.set('format','json');
  const key=createHash('sha256').update(endpoint.href+JSON.stringify(mediaOrigins(service))).digest('hex');
  const directory=resolve(config.resolvedPaths.cache,'oembed'),path=resolve(directory,key+'.json');
  let cached;try{cached=JSON.parse(await readFile(path,'utf8'));}catch{}
  if(cached?.expires>Date.now())return sanitizeEmbed(cached.data,service);
  config.oembedRequests ||= new Map();
  if(config.oembedRequests.has(key))return config.oembedRequests.get(key);
  const request=(async()=>{
    try{
      const response=await fetcher(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw new Error('oEmbed HTTP '+response.status);
      const reader=response.body.getReader();let bytes=0,chunks=[];
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>128*1024)throw new Error('oEmbed response exceeds 128 KB');chunks.push(value);}}finally{await reader.cancel();}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),clean=sanitizeEmbed(data,service);
      const ttl=Math.max(60,Math.min(86400,Number(data.cache_age)||3600));
      await mkdir(directory,{recursive:true});await writeFile(path,JSON.stringify({data,expires:Date.now()+ttl*1000,saved:Date.now()}));return clean;
    }catch(error){
      console.warn('oEmbed unavailable for '+address+': '+error.message);
      if(cached?.saved>Date.now()-7*86400000)return sanitizeEmbed(cached.data,service);
      return null;
    }
  })();config.oembedRequests.set(key,request);return request;
}
