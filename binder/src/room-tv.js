import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { TV } from './room-extras.js';

export const TV_VIDEO_ID='kuctuTR_cEM';
export function youtubeEmbedURL(origin){
  const url=new URL(`https://www.youtube-nocookie.com/embed/${TV_VIDEO_ID}`);
  for(const [key,value]of Object.entries({enablejsapi:1,origin,autoplay:1,mute:1,playsinline:1,controls:1,rel:0,loop:1,playlist:TV_VIDEO_ID}))url.searchParams.set(key,value);
  return url.href;
}

export function tvFrustumVisibility(corners,camera){
  const projected=corners.map(point=>point.clone().project(camera));
  const xs=projected.map(point=>point.x),ys=projected.map(point=>point.y);
  const depth=projected.every(point=>point.z>-1&&point.z<1);
  return {visible:depth&&Math.max(...xs)>=-1&&Math.min(...xs)<=1&&Math.max(...ys)>=-1&&Math.min(...ys)<=1,
    fullyVisible:depth&&projected.every(point=>Math.abs(point.x)<=1&&Math.abs(point.y)<=1)};
}

export function createRoomTV(stage,screen,roomScene,onError){
  const element=document.getElementById('tv-surface');
  if(!element)return {resize(){},update(){},dispose(){}};
  const renderer=new CSS3DRenderer();renderer.domElement.id='tv-layer';stage.append(renderer.domElement);
  const scene=new THREE.Scene(),object=new CSS3DObject(element);
  screen.updateWorldMatrix(true,false);
  object.position.copy(screen.getWorldPosition(new THREE.Vector3()));
  object.quaternion.copy(screen.getWorldQuaternion(new THREE.Quaternion()));
  object.scale.setScalar(TV.width/640);scene.add(object);
  const play=document.getElementById('tv-play'),power=document.getElementById('tv-power'),status=document.getElementById('tv-status');
  const playerHost=document.getElementById('tv-player'),cover=document.getElementById('tv-cover');
  const retry=document.getElementById('tv-retry');
  let iframe=null,playing=false,enabled=false,ready=false,disposed=false,loadTimer=0,listenTimer=0,lastCamera='';
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3(),center=object.position.clone(),normal=new THREE.Vector3(0,0,1).applyQuaternion(object.quaternion);
  const probes=[[0,0],[-.43,-.43],[-.43,.43],[.43,-.43],[.43,.43]].map(([x,y])=>screen.localToWorld(new THREE.Vector3(x*TV.width,y*TV.height,.012)));
  const corners=[[-.5,-.5],[-.5,.5],[.5,-.5],[.5,.5]].map(([x,y])=>screen.localToWorld(new THREE.Vector3(x*TV.width,y*TV.height,0)));
  const send=(func,args=[])=>iframe?.contentWindow?.postMessage(JSON.stringify({event:'command',func,args}), 'https://www.youtube-nocookie.com');
  const setStatus=message=>{status.textContent=message;};
  const start=()=>{
    if(disposed)return;
    enabled=true;power?.setAttribute('aria-pressed','true');
    if(iframe){
      send('playVideo');cover.hidden=false;setStatus('Starting the TV...');return;
    }
    iframe=document.createElement('iframe');iframe.title='Afterhours TV: YouTube video';
    iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;
    iframe.referrerPolicy='strict-origin-when-cross-origin';
    iframe.src=youtubeEmbedURL(location.origin);playerHost.replaceChildren(iframe);
    setStatus('Connecting to YouTube...');play.hidden=true;retry.hidden=true;
    iframe.addEventListener('load',()=>{
      listenTimer=window.setInterval(()=>{
        if(ready||disposed){clearInterval(listenTimer);return;}
        iframe.contentWindow?.postMessage(JSON.stringify({event:'listening',id:'afterhours-tv'}),'https://www.youtube-nocookie.com');
      },500);
    });
    loadTimer=window.setTimeout(()=>{
      if(!playing&&!disposed){
        cover.hidden=false;play.hidden=false;retry.hidden=false;
        setStatus('Playback has not started. Press Play, or open this video on YouTube.');
      }
    },12000);
  };
  const stop=()=>{enabled=false;playing=false;clearTimeout(loadTimer);send('pauseVideo');cover.hidden=false;play.hidden=false;setStatus('TV paused');power?.setAttribute('aria-pressed','false');};
  const onMessage=event=>{
    if(!iframe||event.source!==iframe.contentWindow||!['https://www.youtube-nocookie.com','https://www.youtube.com'].includes(event.origin))return;
    let message=event.data;
    if(typeof message==='string'){try{message=JSON.parse(message)}catch{return}}
    if(!message||typeof message!=='object')return;
    if(message.event==='onReady'){
      ready=true;clearInterval(listenTimer);send('addEventListener',['onStateChange']);send('addEventListener',['onError']);send('mute');
      if(enabled&&!document.hidden)send('playVideo');else send('pauseVideo');
    }
    const state=message.event==='onStateChange'?message.info:message.event==='infoDelivery'?message.info?.playerState:null;
    if(state===1){
      if(enabled&&!document.hidden){
        playing=true;cover.hidden=true;clearTimeout(loadTimer);setStatus('Playing on YouTube · muted by default');
      }else{
        playing=false;send('pauseVideo');cover.hidden=false;play.hidden=false;setStatus('TV paused');
      }
    }else if(state===2){playing=false;}
    if(message.event==='onError'){
      playing=false;cover.hidden=false;play.hidden=true;retry.hidden=false;
      const code=message.info;
      const text=[101,150,153].includes(code)?'YouTube cannot play this video in an embedded player. Open it on YouTube.':'The TV video could not load. Retry or open it on YouTube.';
      setStatus(text);console.warn('YouTube television playback error',code);onError?.(text);
    }
  };
  const onPower=()=>enabled?stop():start();
  const onRetry=()=>{clearInterval(listenTimer);clearTimeout(loadTimer);iframe?.remove();iframe=null;ready=false;playing=false;start();};
  const onVisibility=()=>{if(document.hidden){playing=false;send('pauseVideo');}else if(enabled&&ready)send('playVideo');};
  play.addEventListener('click',start);power?.addEventListener('click',onPower);retry.addEventListener('click',onRetry);
  window.addEventListener('message',onMessage);document.addEventListener('visibilitychange',onVisibility);
  element.addEventListener('pointerdown',event=>event.stopPropagation());
  element.addEventListener('click',event=>event.stopPropagation());
  return {
    resize(width,height){renderer.setSize(width,height);lastCamera='';},
    update(camera,force=false){
      const key=camera.matrixWorld.elements.join(',')+'/'+camera.fov+'/'+camera.aspect;
      if(key===lastCamera&&!force)return;lastCamera=key;
      camera.updateMatrixWorld(true);screen.updateWorldMatrix(true,false);
      let visible=normal.dot(direction.subVectors(camera.position,center))>0;
      const projection=center.clone().project(camera);
      visible&&=projection.z>-1&&projection.z<1;
      const frustum=tvFrustumVisibility(corners,camera);
      visible&&=frustum.visible;
      const occluders=[];
      roomScene.traverseVisible(mesh=>{
        const material=mesh.material;
        if(mesh.isMesh&&mesh!==screen&&!Array.isArray(material)&&!material?.transparent)occluders.push(mesh);
      });
      if(visible)for(const point of probes){
        direction.subVectors(point,camera.position);
        const distance=direction.length();ray.set(camera.position,direction.normalize());ray.far=distance-.025;
        if(ray.intersectObjects(occluders,false).some(hit=>hit.object.visible)){visible=false;break;}
      }
      object.visible=visible;element.inert=!visible||!frustum.fullyVisible;
      renderer.render(scene,camera);
    },
    dispose(){
      disposed=true;clearTimeout(loadTimer);clearInterval(listenTimer);send('stopVideo');
      window.removeEventListener('message',onMessage);document.removeEventListener('visibilitychange',onVisibility);
      play.removeEventListener('click',start);power?.removeEventListener('click',onPower);retry.removeEventListener('click',onRetry);
      renderer.domElement.remove();iframe?.remove();
    },
  };
}
