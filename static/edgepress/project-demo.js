// Native media keeps the playhead and streams an immutable, progressive file.
for (const root of document.querySelectorAll('[data-project-demo]')) {
  const video=root.querySelector('video'),frame=root.querySelector('.project-demo-media');
  const button=root.querySelector('button'),status=root.querySelector('[role=status]');
  let visible=false,manualPause=false,requested=false,loaded=false,failed=false;
  function controls(){
    const label=requested?root.dataset.pause:video.ended?root.dataset.replay:video.currentTime>0?root.dataset.resume:root.dataset.play;
    button.textContent=label;button.setAttribute('aria-label',label+': '+video.getAttribute('aria-label'));
    button.setAttribute('aria-pressed',String(requested));
  }
  function prepare(){
    if(loaded)return;loaded=true;
    video.preload=navigator.connection?.saveData?'metadata':'auto';
    video.src=root.dataset.animation;video.load();
  }
  function pause(){requested=false;video.pause();status.textContent='';controls();}
  async function play(){
    if(document.hidden||manualPause||video.ended||failed)return;
    prepare();requested=true;controls();if(video.readyState<2)status.textContent=root.dataset.loading;
    try{await video.play();if(!visible||document.hidden||manualPause)pause();}
    catch(error){requested=false;controls();status.textContent='';if(!['AbortError','NotAllowedError'].includes(error.name)){failed=true;status.textContent=root.dataset.error;}}
  }
  button.addEventListener('click',()=>{
    if(requested){manualPause=true;pause();return;}
    if(video.ended)video.currentTime=0;
    if(failed){failed=false;loaded=false;}
    manualPause=false;visible=true;void play();
  });
  video.addEventListener('loadeddata',()=>{frame.classList.add('is-ready');video.hidden=false;});
  video.addEventListener('playing',()=>{status.textContent='';controls();});
  video.addEventListener('waiting',()=>{if(requested)status.textContent=root.dataset.loading;});
  video.addEventListener('ended',()=>{manualPause=true;pause();});
  video.addEventListener('error',()=>{failed=true;pause();status.textContent=root.dataset.error;});
  const nearby=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){prepare();nearby.unobserve(frame);}},{rootMargin:'350px'});
  nearby.observe(frame);
  const viewing=new IntersectionObserver(entries=>{for(const entry of entries){visible=entry.isIntersecting&&entry.intersectionRatio>=.35;if(visible)void play();else pause();}},{threshold:[0,.35]});
  viewing.observe(frame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(visible)void play();});
  window.addEventListener('pagehide',pause);
  window.addEventListener('pageshow',()=>{if(visible)void play();});
}
