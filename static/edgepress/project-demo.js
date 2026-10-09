// Manual playback streams immutable media and preserves the chosen playhead.
const mounted = new WeakSet();
function refresh() {
for (const root of document.querySelectorAll('[data-project-demo]')) {
  if (mounted.has(root)) continue;
  mounted.add(root);
  const video=root.querySelector('video'),frame=root.querySelector('.project-demo-media');
  const button=root.querySelector('button'),status=root.querySelector('[role=status]');
  const seek=root.querySelector('[data-demo-seek]'),time=root.querySelector('[data-demo-time]');
  let requested=false,loaded=false,failed=false,dragging=false,gesture=null;
  const stamp=value=>Math.floor((Number(value)||0)/60)+':'+String(Math.floor((Number(value)||0)%60)).padStart(2,'0');
  function progress(){
    const duration=Number.isFinite(video.duration)?video.duration:0;
    const position=dragging&&seek?Number(seek.value):video.currentTime;
    if(time)time.textContent=stamp(position)+' / '+stamp(duration);
    if(seek){seek.disabled=!duration;seek.max=String(duration||1);if(!dragging)seek.value=String(video.currentTime);seek.setAttribute('aria-valuetext',stamp(position)+' / '+stamp(duration));}
  }
  function controls(){
    const label=requested?root.dataset.pause:video.ended?root.dataset.replay:video.currentTime>0?root.dataset.resume:root.dataset.play;
    button.textContent=label;button.setAttribute('aria-label',label+': '+video.getAttribute('aria-label'));
    button.setAttribute('aria-pressed',String(requested));progress();
  }
  function reveal(){if(video.readyState>=2){frame.classList.add('is-ready');video.hidden=false;}}
  function prepare(){if(loaded)return;loaded=true;video.preload='metadata';video.src=root.dataset.animation;video.load();}
  function pause(){requested=false;video.pause();status.textContent='';controls();}
  async function play(){
    if(document.hidden||failed)return;
    prepare();requested=true;controls();if(video.readyState<2)status.textContent=root.dataset.loading;
    try{await video.play();reveal();if(document.hidden)pause();}
    catch(error){requested=false;controls();status.textContent='';if(!['AbortError','NotAllowedError'].includes(error.name)){failed=true;status.textContent=root.dataset.error;}}
  }
  button.addEventListener('click',()=>{
    if(requested){pause();return;}
    if(video.ended)video.currentTime=0;
    if(failed){failed=false;loaded=false;}
    void play();
  });
  const commitSeek=()=>{if(Number.isFinite(video.duration)&&video.duration>0){video.currentTime=Math.max(0,Math.min(video.duration,Number(seek.value)||0));reveal();}dragging=false;progress();controls();};
  const previewSeek=event=>{
    const bounds=seek.getBoundingClientRect(),inset=10;
    seek.value=String(Math.max(0,Math.min(1,(event.clientX-bounds.left-inset)/(bounds.width-2*inset)))*video.duration);
    progress();
  };
  seek?.addEventListener('pointerdown',event=>{
    if(event.button!==0||!Number.isFinite(video.duration)||video.duration<=0)return;
    const bounds=seek.getBoundingClientRect();
    // The range's layout height includes spacing; that spacing is not a seek.
    if(event.pointerType==='mouse'&&Math.abs(event.clientY-bounds.top-bounds.height/2)>10){event.preventDefault();return;}
    event.preventDefault();
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,touch:event.pointerType!=='mouse',moved:false};
    dragging=true;
    if(!gesture.touch){seek.focus({preventScroll:true});seek.setPointerCapture(event.pointerId);previewSeek(event);}
  });
  seek?.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=Math.abs(event.clientX-gesture.x),dy=Math.abs(event.clientY-gesture.y);
    if(gesture.touch&&!gesture.moved){
      if(dy>8&&dy>dx){gesture=null;dragging=false;progress();return;}
      if(dx<8||dx<=dy)return;
      gesture.moved=true;seek.setPointerCapture(event.pointerId);
    }
    previewSeek(event);
  });
  seek?.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const shouldCommit=!gesture.touch||gesture.moved;
    gesture=null;
    if(shouldCommit){previewSeek(event);commitSeek();}else{dragging=false;progress();}
  });
  const cancelSeek=()=>{gesture=null;dragging=false;progress();};
  seek?.addEventListener('pointercancel',cancelSeek);
  seek?.addEventListener('lostpointercapture',()=>{if(gesture)cancelSeek();});
  seek?.addEventListener('input',()=>{if(!gesture)commitSeek();});
  video.addEventListener('loadedmetadata',progress);
  video.addEventListener('durationchange',progress);
  video.addEventListener('timeupdate',progress);
  video.addEventListener('seeked',()=>{reveal();status.textContent='';controls();});
  video.addEventListener('loadeddata',()=>{if(requested||video.currentTime>0)reveal();});
  video.addEventListener('playing',()=>{status.textContent='';controls();});
  video.addEventListener('waiting',()=>{if(requested)status.textContent=root.dataset.loading;});
  video.addEventListener('ended',pause);
  video.addEventListener('error',()=>{failed=true;pause();status.textContent=root.dataset.error;});
  const nearby=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){prepare();nearby.unobserve(frame);}},{rootMargin:'350px'});
  nearby.observe(frame);
  const viewing=new IntersectionObserver(entries=>{for(const entry of entries)if(!entry.isIntersecting)pause();});
  viewing.observe(frame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('pagehide',pause);
  controls();
}
}
refresh();
document.addEventListener('edgepress:data-media', refresh);
