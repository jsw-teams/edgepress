import {mountImage} from './image-viewer-lib.js';
import {readChoice} from './plugins/consent/choices.js';
const root=document.querySelector('main'),mounted=new Map(),selector='.post-content img, .post-change-content img, .image-block img, .media-text-block img, [data-edgepress-oembed] img';
const labels=JSON.parse(document.getElementById('edgepress-image-viewer-config')?.textContent||'{}');
function permitted(image){
 if(image.closest('[data-project-demo]'))return false;
 if(!image.getAttribute('src')||image.closest('[hidden],template'))return false;
 const host=image.closest('[data-edgepress-oembed],[data-edgepress-service]');if(!host)return true;
 const privacy=JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent||'{}'),id=host.dataset.edgepressOembed||host.dataset.edgepressService;
 return !!readChoice(privacy)?.allowed.includes(id);
}
function refresh(){
 for(const [image,dispose] of mounted)if(!root.contains(image)||!permitted(image)){dispose();mounted.delete(image);}
 for(const image of root.querySelectorAll(selector)){
  if(mounted.has(image)||!permitted(image))continue;const link=image.closest('a');
  if(link&&link.href!==image.src&&!/\.(?:png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)/i.test(link.href))continue;
  mounted.set(image,mountImage(image,{labels,original:()=>image.dataset.original||link?.href||image.currentSrc||image.src}));
 }
}
if(root){
 const observer=new MutationObserver(refresh);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','hidden']});refresh();
 window.addEventListener('pagehide',()=>{observer.disconnect();for(const dispose of mounted.values())dispose();mounted.clear();},{once:true});
}
