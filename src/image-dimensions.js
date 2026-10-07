import {readFile} from 'node:fs/promises';
import {imageSize} from 'image-size';
import {mapLimit} from './concurrency.js';
export async function collectImageDimensions(assets){
 const result=new Map();await mapLimit(assets.filter(item=>/\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(item.path)),8,async item=>{
  try{let {width,height,orientation}=imageSize(item.content??await readFile(item.source));if([5,6,7,8].includes(orientation))[width,height]=[height,width];if(width>0&&height>0)result.set('/'+item.path,{width,height});}catch{}
 });return result;
}
export function reserveImageDimensions(html,dimensions,path,origin){
 return html.replace(/<img\b[^>]*>/gi,tag=>{
  const value=name=>tag.match(new RegExp('\\s'+name+'\\s*=\\s*["\']([^"\']+)["\']','i'))?.[1],src=value('src');if(!src)return tag;
  let url,key;try{url=new URL(src,new URL('/'+path,origin));key=decodeURI(url.pathname);}catch{return tag;}
  if(url.origin!==new URL(origin).origin)return tag;const size=dimensions.get(key);if(!size)return tag;
  const w=Number(value('width')),h=Number(value('height'));
  const width=w>0?w:Math.max(1,Math.round(h>0?h*size.width/size.height:size.width));
  const height=h>0?h:Math.max(1,Math.round(w>0?w*size.height/size.width:size.height));
  tag=tag.replace(/\s*\/?>$/,end=>(value('width')?'':' width="'+width+'"')+(value('height')?'':' height="'+height+'"')+end);
  // Edge's lazy-image audit needs an authored ratio when responsive CSS sets height:auto.
  // Use the reserved dimensions, and preserve ratios supplied by the author.
  if(value('loading')?.toLowerCase()==='lazy'&&!/(?:^|;)\s*aspect-ratio\s*:/i.test(value('style')||'')){
   const ratio='aspect-ratio:'+width+' / '+height;
   tag=/\sstyle\s*=/i.test(tag)?tag.replace(/(\sstyle\s*=\s*)(["'])(.*?)\2/i,(_m,prefix,quote,style)=>prefix+quote+style+';'+ratio+quote):tag.replace(/\s*\/?>$/,end=>' style="'+ratio+'"'+end);
  }
  return tag;
 });
}
