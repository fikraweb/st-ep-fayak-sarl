'use strict';
// Extract a small poster from a visible video's own frame, without autoplay.
window.FAYAKVideoThumbnails=(()=>{
  const entries=new Map();
  function release(video,entry){entry.alive=false;entry.cleanup?.();observer?.unobserve(video);if(entry.url)URL.revokeObjectURL(entry.url);entries.delete(video)}
  function start(video){
    const entry=entries.get(video);if(!entry||entry.started||!video.isConnected)return;
    entry.started=true;let capturing=false,target=0,seekRequested=false;
    const cleanup=()=>{clearTimeout(timer);for(const event of ['loadedmetadata','loadeddata','seeked'])video.removeEventListener(event,ready);video.removeEventListener('error',failed);video.removeEventListener('play',played)};
    entry.cleanup=cleanup;
    const failed=()=>{cleanup();video.dataset.thumbnailReady='failed';video.preload='metadata'};
    const played=()=>{entry.alive=false;cleanup()};
    const capture=()=>{
      if(capturing||!entry.alive||video.seeking||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
      capturing=true;
      try{
        const scale=Math.min(1,640/video.videoWidth,480/video.videoHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{if(!entry.alive||!video.isConnected)return;if(!blob){failed();return}cleanup();entry.url=URL.createObjectURL(blob);video.poster=entry.url;video.dataset.thumbnailReady='true';video.preload='none';video.load()},'image/jpeg',.85);
      }catch{failed()}
    };
    const ready=()=>{
      if(!seekRequested&&video.readyState>=1){seekRequested=true;target=Number.isFinite(video.duration)&&video.duration>0?Math.min(.5,video.duration/3):0;try{video.currentTime=target}catch{}}
      if(!video.seeking&&Math.abs(video.currentTime-target)<.1)capture();
    };
    const timer=setTimeout(failed,20000);
    for(const event of ['loadedmetadata','loadeddata','seeked'])video.addEventListener(event,ready);
    video.addEventListener('error',failed);video.addEventListener('play',played);
    video.preload='auto';video.load();
  }
  const observer='IntersectionObserver'in window?new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){observer.unobserve(item.target);start(item.target)}},{rootMargin:'150px'}):null;
  return{observe(root=document){for(const[video,entry]of entries)if(!video.isConnected)release(video,entry);for(const video of root.querySelectorAll('video[data-thumbnail]')){if(entries.has(video))continue;entries.set(video,{alive:true,started:false,url:null,cleanup:null});if(observer)observer.observe(video);else start(video)}}};
})();
