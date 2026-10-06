// Manual playback streams immutable media and preserves the chosen playhead.
for (const root of document.querySelectorAll('[data-project-demo]')) {
  const video=root.querySelector('video'),frame=root.querySelector('.project-demo-media');
  const button=root.querySelector('button'),status=root.querySelector('[role=status]');
  const seek=root.querySelector('[data-demo-seek]'),time=root.querySelector('[data-demo-time]');
  let requested=false,loaded=false,failed=false,dragging=false;
  const stamp=value=>Math.floor((Number(value)||0)/60)+':'+String(Math.floor((Number(value)||0)%60)).padStart(2,'0');
  function progress(){
    const duration=Number.isFinite(video.duration)?video.duration:0;
    if(time)time.textContent=stamp(video.currentTime)+' / '+stamp(duration);
    if(seek){seek.disabled=!duration;seek.max=String(duration||1);if(!dragging)seek.value=String(video.currentTime);seek.setAttribute('aria-valuetext',stamp(video.currentTime)+' / '+stamp(duration));}
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
  const commitSeek=()=>{if(Number.isFinite(video.duration)){video.currentTime=Math.max(0,Math.min(video.duration,Number(seek.value)||0));reveal();}dragging=false;progress();controls();};
  seek?.addEventListener('pointerdown',event=>{dragging=true;prepare();seek.setPointerCapture?.(event.pointerId);});
  seek?.addEventListener('input',()=>{prepare();if(Number.isFinite(video.duration)){video.currentTime=Number(seek.value);reveal();progress();}});
  seek?.addEventListener('change',commitSeek);
  seek?.addEventListener('pointerup',commitSeek);
  seek?.addEventListener('pointercancel',()=>{dragging=false;progress();});
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
