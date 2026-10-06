// Recordings are loaded only on demand. Pausing freezes the current GIF frame.
for (const root of document.querySelectorAll('[data-project-demo]')) {
 const image=root.querySelector('img'),canvas=root.querySelector('canvas'),button=root.querySelector('button'),status=root.querySelector('[role=status]');
 const poster=image.getAttribute('src'),title=button.getAttribute('aria-label').slice(root.dataset.play.length+2);
 let bytes=null,controller=null,timer=null,playing=false,url=null,alive=true;
 function label(text){button.textContent=text;button.setAttribute('aria-label',text+': '+title);}
 function freeze(){
  clearTimeout(timer);playing=false;
  if(image.complete&&image.naturalWidth){canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);canvas.hidden=false;image.hidden=true;}
  label(root.dataset.replay);
 }
 button.addEventListener('click',async()=>{
  if(playing){freeze();return;}
  button.disabled=true;status.textContent='';
  try{
   if(!bytes){controller=new AbortController();const response=await fetch(root.dataset.animation,{signal:controller.signal});if(!response.ok)throw new Error('Recording unavailable');bytes=await response.blob();}
   if(!alive)return;
   // Retire a previous URL only after its image renderer has detached from it.
   const previous=url;image.src=poster;await image.decode();if(previous)URL.revokeObjectURL(previous);
   url=URL.createObjectURL(bytes);image.src=url;await image.decode();
   if(!alive)return;
   canvas.hidden=true;image.hidden=false;playing=true;label(root.dataset.pause);timer=setTimeout(freeze,Number(root.dataset.duration));
  }catch(error){if(alive&&error.name!=='AbortError'){image.src=poster;image.hidden=false;canvas.hidden=true;status.textContent=root.dataset.error;label(root.dataset.play);}}
  finally{if(alive)button.disabled=false;}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)freeze();});
 window.addEventListener('pagehide',()=>{alive=false;controller?.abort();clearTimeout(timer);image.removeAttribute('src');if(url)URL.revokeObjectURL(url);},{once:true});
}
