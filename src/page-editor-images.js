import {readdir, lstat, realpath, mkdir, open} from 'node:fs/promises';
import {resolve, relative, sep, extname} from 'node:path';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {imageSize} from 'image-size';

export const maxImageBytes = 10 * 1024 * 1024;
const types = {jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', avif:'image/avif'};
const inside = (root, file) => { const rel=relative(root,file); return rel && rel!=='..' && !rel.startsWith('..'+sep) && !rel.startsWith(sep); };

async function assetRoot(root, create = false) {
  let current = root;
  for (const segment of ['content','assets']) {
    current = resolve(current, segment);
    if (create) await mkdir(current).catch(error => { if(error.code!=='EEXIST')throw error; });
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe image directory');
  }
  return realpath(current);
}

function localPath(value) {
  if (typeof value!=='string' || !value.startsWith('/') || value.includes('\\') || value.includes('\0')) throw new Error('Invalid image path');
  const parts = value.slice(1).split('/');
  if (parts.some(part => !part || part==='.' || part==='..') || !types[extname(value).slice(1).toLowerCase()]) throw new Error('Invalid image path');
  return parts;
}

export async function openImage(root, path) {
  const parts=localPath(path), base=await assetRoot(root);
  let file=base;
  for(const [index,part] of parts.entries()) {
    file=resolve(file,part);
    const info=await lstat(file);
    if(info.isSymbolicLink() || (index<parts.length-1 ? !info.isDirectory() : !info.isFile())) throw new Error('Unsafe image file');
  }
  if(!inside(base,await realpath(file)))throw new Error('Unsafe image file');
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  const info=await handle.stat();
  if(!info.isFile() || info.size>maxImageBytes){await handle.close();throw new Error('Image exceeds 10 MB');}
  return {handle, size:info.size, type:types[extname(file).slice(1).toLowerCase()]};
}

export async function listImages(root, search = '', offset = 0) {
  let base;
  try{base=await assetRoot(root);}catch(error){if(error.code==='ENOENT')return {images:[],total:0};throw error;}
  const paths=[];
  async function scan(directory,prefix='') {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory())await scan(resolve(directory,entry.name),prefix+entry.name+'/');
      else if(entry.isFile() && types[extname(entry.name).slice(1).toLowerCase()] && (prefix+entry.name).toLowerCase().includes(search.toLowerCase())) paths.push('/'+prefix+entry.name);
    }
  }
  await scan(base);
  paths.sort((a,b)=>a.localeCompare(b));
  return {images:paths.slice(offset,offset+12).map(path=>({path,name:path.split('/').at(-1)})),total:paths.length};
}

export async function uploadImage(root, name, bytes) {
  if(!bytes.length || bytes.length>maxImageBytes)throw new Error('Image exceeds 10 MB or is empty');
  let dimensions;
  try{dimensions=imageSize(bytes);}catch{throw new Error('Unsupported or invalid image');}
  const extension=dimensions.type==='jpg'?'jpg':dimensions.type;
  if(!types[extension] || !dimensions.width || !dimensions.height || dimensions.width>12000 || dimensions.height>12000 || dimensions.width*dimensions.height>25000000)throw new Error('Unsupported image type or dimensions');
  const base=await assetRoot(root,true),uploads=resolve(base,'uploads');
  await mkdir(uploads).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const info=await lstat(uploads);
  if(!info.isDirectory() || info.isSymbolicLink() || !inside(base,await realpath(uploads)))throw new Error('Unsafe image directory');
  const stem=String(name||'image').split(/[\\/]/).at(-1).replace(/\.[^.]*$/,'').normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'image';
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
  const filename=stem+'.'+hash+'.'+extension,file=resolve(uploads,filename);
  try{
    const handle=await open(file,'wx',0o600);
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  }catch(error){
    if(error.code!=='EEXIST')throw error;
    const existing=await openImage(root,'/uploads/'+filename);
    try{if(!(await existing.handle.readFile()).equals(bytes))throw new Error('Unsafe image collision');}finally{await existing.handle.close();}
  }
  return {path:'/uploads/'+filename,width:dimensions.width,height:dimensions.height,name:filename};
}
