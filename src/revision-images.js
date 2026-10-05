import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {relative,resolve,sep,extname} from 'node:path';
import {imageSize} from 'image-size';
import {renderMarkdown} from './markdown.js';

const decode=value=>value.replace(/&(?:amp|quot|apos|lt|gt);/g,entity=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[entity]));
export async function revisionImageReferences(text){
 const html=await renderMarkdown(text,{allowVideo:false}),images=new Map();
 for(const match of html.matchAll(/<img\b[^>]*>/gi)){
  const attr=name=>decode(match[0].match(new RegExp('\\b'+name+'="([^"]*)"','i'))?.[1]||'');
  const src=attr('src');if(src)images.set(src,attr('alt'));
 }
 return images;
}
export function revisionImageFile(href,assetsRoot){
 if(!assetsRoot||!href.startsWith('/')||href.startsWith('//'))return null;
 let path;try{path=decodeURIComponent(href.split(/[?#]/)[0]);}catch{return null;}
 if(/[\\\0]/.test(path)||!/\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(path))return null;
 const root=resolve(assetsRoot),file=resolve(root,'.'+path);return file.startsWith(root+sep)?file:null;
}
export async function revisionImageState(text,assetsRoot,root,commit,git){
 const refs=await revisionImageReferences(text),images=new Map();
 for(const [href,alt] of refs){
  const file=revisionImageFile(href,assetsRoot);if(!file)continue;
  try{const path=relative(root,file).split(sep).join('/'),oid=(await git(root,commit?['rev-parse',commit+':'+path]:['hash-object','--',file])).trim();images.set(href,{file,path,oid,alt});}catch{}
 }
 return images;
}
export async function snapshotRevisionImages(before,after,diff,root,binaryGit){
 const changed=await revisionImageReferences(diff.split(/\r?\n/).filter(line=>/^[+-](?![+-])/.test(line)).map(line=>line.slice(1)).join('\n'));
 const assets=new Map(),sides={before:Object.create(null),after:Object.create(null)};
 for(const [side,state] of [['before',before],['after',after]])for(const [href,image] of state.images){
  if(!changed.has(href))continue;
  try{
   const content=state.commit?await binaryGit(root,['show',state.commit+':'+image.path]):await readFile(image.file);
   if(content.length>20_000_000)continue;
   const size=imageSize(content);if(!(size.width>0&&size.height>0))continue;
   const hash=createHash('sha256').update(content).digest('hex').slice(0,16),path='edgepress/revisions/image.'+hash+extname(image.file).toLowerCase();
   assets.set(path,{path,content});sides[side][href]='/'+path;
  }catch{ /* Missing historical bytes never produce a broken image request. */ }
 }
 return {revisionImages:sides,revisionAssets:[...assets.values()]};
}
