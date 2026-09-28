import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs/promises';

const origin=process.env.BINDER_URL||'http://127.0.0.1:4173';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function createAuditPage(browser,origin,pageOptions={}){
const bundle=await build({
  stdin:{resolveDir:root,contents:`
    import * as THREE from 'three';
    import {createRoom} from './binder/src/room.js';
    import {Binder} from './binder/src/binder3d.js';
    import {CityLightPass} from './binder/src/city-light-pass.js';
    import {CARDS,cardImage,createCollection} from './binder/src/collection.js';
    const samples={active:false,frames:[],work:[],gpu:[],draws:[],queries:[],last:0,drawCalls:0,occluders:true,running:true,staleProbes:[]};
    const cityRender=CityLightPass.prototype.render;
    const buildCovers=Binder.prototype.buildCovers;let binder,legacySheets;
    Binder.prototype.buildCovers=function(){binder=this;return buildCovers.call(this)};
    let auditCity,cityRoot,sun,shadowSun,probeCount=0;
    const sunKey=()=>sun.position.toArray().join(',');
    CityLightPass.prototype.render=function(renderer,scene,camera,night,refresh,occluders){
      const gl=renderer.getContext();
      samples.renderSizes={target:this.target?[this.target.width,this.target.height]:null,canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
      if(auditCity!==scene){
        auditCity=scene;cityRoot=scene.children.find(child=>child.userData.outdoorEnvironment);
        sun=scene.getObjectByProperty('type','DirectionalLight');
        const renderShadows=renderer.shadowMap.render.bind(renderer.shadowMap);
        renderer.shadowMap.render=(lights,shadowScene,shadowCamera)=>{
          const updating=shadowScene===auditCity&&renderer.shadowMap.needsUpdate;
          const result=renderShadows(lights,shadowScene,shadowCamera);
          if(updating)shadowSun=sunKey();
          return result;
        };
      }
      const captures=cityRoot.userData.environmentCaptures;
      if(captures!==probeCount){
        if(shadowSun&&shadowSun!==sunKey())samples.staleProbes.push({capture:captures,shadowSun,sun:sunKey()});
        probeCount=captures;
      }
      return cityRender.call(this,renderer,scene,camera,night,refresh,samples.occluders?occluders:null);
    };
    let context,extension;
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      const result=getContext.call(this,type,...args);
      if(type==='webgl2'&&result){
        context=result;extension=context.getExtension('EXT_disjoint_timer_query_webgl2');
        for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
          const draw=context[name].bind(context);
          context[name]=(...values)=>{samples.drawCalls++;return draw(...values)};
        }
      }
      return result;
    };
    const raf=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>raf(now=>{
      if(!samples.active){callback(now);return}
      if(samples.last)samples.frames.push(now-samples.last);
      samples.last=now;
      if(extension){
        const disjoint=context.getParameter(extension.GPU_DISJOINT_EXT);
        while(samples.queries.length&&context.getQueryParameter(samples.queries[0],context.QUERY_RESULT_AVAILABLE)){
          const query=samples.queries.shift();
          if(!disjoint)samples.gpu.push(context.getQueryParameter(query,context.QUERY_RESULT)/1e6);
          context.deleteQuery(query);
        }
      }
      const query=extension?context.createQuery():null;
      if(query)context.beginQuery(extension.TIME_ELAPSED_EXT,query);
      const calls=samples.drawCalls,started=performance.now();
      try{callback(now)}finally{
        samples.work.push(performance.now()-started);samples.draws.push(samples.drawCalls-calls);
        if(query){context.endQuery(extension.TIME_ELAPSED_EXT);samples.queries.push(query)}
      }
    });
    await document.fonts.load('12px Manrope');
    let state=createCollection(),room;const startup=performance.now();
    room=await createRoom(document.querySelector('canvas'),{
      state,onLayout:()=>{},onTurn:({completed,direction})=>{if(completed)state={...state,spread:state.spread+direction};room.sync(state)},
      onError:(message,fatal)=>{if(fatal)throw new Error(message);console.warn(message)},reducedMotion:false,
    });
    const startupMs=performance.now()-startup;
    const summary=values=>{
      if(!values.length)return null;
      const sorted=values.slice(4).sort((a,b)=>a-b);
      return {median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],mean:sorted.reduce((a,b)=>a+b,0)/sorted.length};
    };
    window.roomAudit={
      room,
      state:()=>state,
      unseen:()=>{const card=CARDS.find(card=>card.image&&!state.slots.includes(card.id)&&!Object.values(state.piles).some(ids=>ids.includes(card.id)));return {id:card.id,url:cardImage(card,true)}},
      place:(id)=>{state={...state,slots:[...state.slots]};state.slots[17]=id;room.sync(state)},
      configure(view,running){samples.running=running;room.view(view);room.setMotion(running)},
      occluders(enabled){samples.occluders=enabled;room.setMotion(samples.running)},
      staleProbes:()=>samples.staleProbes,
      renderSizes:()=>samples.renderSizes,
      startupMs,
      sheetBatches(enabled){
        if(legacySheets){legacySheets.removeFromParent();legacySheets=null}
        room.sync(state);
        if(!enabled){
          legacySheets=new THREE.Group();binder.group.add(legacySheets);
          for(const stack of binder.group.children.filter(object=>object.userData.sheetSide)){
            for(let i=0;i<stack.count;i++){
              const mesh=new THREE.Mesh(stack.geometry,stack.material);stack.getMatrixAt(i,mesh.matrix);
              mesh.matrixAutoUpdate=false;mesh.castShadow=stack.castShadow;mesh.receiveShadow=stack.receiveShadow;legacySheets.add(mesh);
            }
            stack.visible=false;
          }
        }
      },
      sheets:()=>binder.group.children.filter(object=>object.userData.sheetSide).map(stack=>({count:stack.count,instanced:stack.isInstancedMesh})),
      start(){for(const query of samples.queries)context.deleteQuery(query);Object.assign(samples,{frames:[],work:[],gpu:[],draws:[],queries:[],last:0,active:true})},
      stop(){samples.active=false;return {framesMs:summary(samples.frames),cpuSubmissionMs:summary(samples.work),gpuMs:summary(samples.gpu),drawCallsPerFrame:summary(samples.draws),scene:room.info(),gpuTimerAvailable:Boolean(extension)}},
      dispose(){samples.active=false;for(const query of samples.queries)context.deleteQuery(query);room.dispose()},
    };
    window.roomAuditReady=true;
  `},
  bundle:true,format:'esm',target:'es2022',write:false,logLevel:'silent',
});
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,...pageOptions});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,1800))});
  const url=`${origin}/__room_performance_audit__`;
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>
    @font-face{font-family:Manrope;src:url('/fonts/manrope-regular.ttf')}html,body{margin:0;width:100%;height:100%}canvas{display:block;width:100%;height:100%}
    </style></head><body><canvas></canvas><script>addEventListener('error',e=>{window.roomAuditError=e.message});addEventListener('unhandledrejection',e=>{window.roomAuditError=String(e.reason)})</script></body></html>`}));
  await page.goto(url);
  await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.roomAuditReady||window.roomAuditError,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.roomAuditError),undefined,errors.join('\n'));
  return {page,errors,close:async()=>{await page.evaluate(()=>window.roomAudit.dispose());await page.close()}};
}

export async function auditRoomPerformance(browser,origin){
  const {page,errors,close}=await createAuditPage(browser,origin);
  try{
  const results={startupMs:await page.evaluate(()=>window.roomAudit.startupMs)};
  for(const [name,view,running,weather='clear',look=false]of [
    ['cityMoving','city',true],['cityPaused','city',false],['binderMoving','binder',true],['binderPaused','binder',false],
    ['cityRainMoving','city',true,'rain'],['gamingRoomMoving','room',true,'clear',true],
  ]){
    await page.evaluate(({view,running,weather,look})=>{
      window.roomAudit.configure(view,running);window.roomAudit.room.setWeather(weather);
      if(look)window.roomAudit.room.dragLook(-475,20);
    },{view,running,weather,look});
    await page.waitForTimeout(1600);
    await page.evaluate(()=>window.roomAudit.start());
    await page.waitForTimeout(3500);
    results[name]=await page.evaluate(()=>window.roomAudit.stop());
  }
  results.occluderAB={};
  for(const view of ['binder','city']){
    await page.evaluate(view=>window.roomAudit.configure(view,false),view);
    await page.waitForTimeout(1600);
    await page.evaluate(()=>window.roomAudit.occluders(false));await page.waitForTimeout(160);
    const without=await page.screenshot();
    await page.evaluate(()=>window.roomAudit.occluders(true));await page.waitForTimeout(160);
    const withOcclusion=await page.screenshot();
    const a=await sharp(without).removeAlpha().raw().toBuffer(),b=await sharp(withOcclusion).removeAlpha().raw().toBuffer();
    let changed=0;
    for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>18)changed++;
    const changedFraction=changed/(a.length/3);
    const shots=new URL('../../shots/binder/',import.meta.url);
    await fs.mkdir(shots,{recursive:true});
    await Promise.all([
      fs.writeFile(new URL(`occlusion-${view}-off.png`,shots),without),
      fs.writeFile(new URL(`occlusion-${view}-on.png`,shots),withOcclusion),
    ]);
    assert.ok(changedFraction<.01,`The room depth prepass must preserve the visible composition (${view}: ${(changedFraction*100).toFixed(2)}% changed)`);
    const pairs=[];
    await page.evaluate(view=>window.roomAudit.configure(view,true),view);
    for(const enabled of [false,true,true,false]){
      await page.evaluate(enabled=>window.roomAudit.occluders(enabled),enabled);
      await page.waitForTimeout(350);
      await page.evaluate(()=>window.roomAudit.start());
      await page.waitForTimeout(2000);
      pairs.push({enabled,...await page.evaluate(()=>window.roomAudit.stop())});
    }
    results.occluderAB[view]={changedFraction,pairs};
  }
  assert.deepEqual(errors,[]);
  return results;
  }finally{await close()}
}

export async function checkPausedRendering(browser,origin){
  const {page,errors,close}=await createAuditPage(browser,origin);
  let releaseImage;
  const counters=()=>page.evaluate(()=>window.roomAudit.room.info());
  const settle=async()=>{
    await page.waitForTimeout(1600);
    const before=await counters();await page.waitForTimeout(160);
    assert.equal((await counters()).renderedFrames,before.renderedFrames,'A settled paused scene must not keep submitting identical frames');
    return before;
  };
  try{
    await page.evaluate(()=>window.roomAudit.configure('binder',false));
    const initial=await settle();
    await page.evaluate(()=>window.roomAudit.room.highlight(17));await page.waitForTimeout(100);
    const highlight=await counters();
    assert.ok(highlight.renderedFrames>initial.renderedFrames);
    assert.equal(highlight.cityFrames,initial.cityFrames,'Pocket highlights must reuse the paused city color/depth');
    await page.evaluate(()=>window.roomAudit.room.highlight(null));
    await settle();

    const {id,url}=await page.evaluate(()=>window.roomAudit.unseen());
    let requested=false;
    const gate=new Promise(resolve=>{releaseImage=resolve});
    await page.route(`**/${url}`,async route=>{requested=true;await gate;await route.continue()});
    await page.evaluate(id=>window.roomAudit.place(id),id);
    await page.waitForTimeout(150);assert.equal(requested,true,'The cache test must exercise a genuinely delayed card texture');
    const loading=await counters(),before=await page.screenshot();
    releaseImage();releaseImage=null;
    await page.waitForFunction(count=>window.roomAudit.room.info().renderedFrames>count,loading.renderedFrames);
    await page.waitForTimeout(80);
    const loaded=await counters(),after=await page.screenshot();
    assert.equal(loaded.cityFrames,loading.cityFrames);
    const a=await sharp(before).removeAlpha().raw().toBuffer(),b=await sharp(after).removeAlpha().raw().toBuffer();
    let changed=0;for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>15)changed++;
    assert.ok(changed>200,'Artwork arriving after a paused frame must actually replace its loading texture');
    const beforeTurn=await settle();
    assert.equal(await page.evaluate(()=>window.roomAudit.room.startTurn(1)),true);
    await page.waitForFunction(()=>!window.roomAudit.room.turning);
    const afterTurn=await settle();
    assert.ok(afterTurn.renderedFrames>beforeTurn.renderedFrames+5);
    assert.equal(afterTurn.cityFrames,beforeTurn.cityFrames,'A binder turn must not re-render a motionless city');
    assert.equal(await page.evaluate(()=>window.roomAudit.state().spread),2);

    for(const [method,value]of [['setWeather','rain'],['setCityTime',12],['setCityClouds',.2],['setCityWindows',false],['setCityTower',false]]){
      const before=await counters();
      await page.evaluate(({method,value})=>window.roomAudit.room[method](value),{method,value});
      await page.waitForFunction(count=>window.roomAudit.room.info().cityFrames>count,before.cityFrames);
    }
    const beforeLook=await counters();
    await page.evaluate(()=>window.roomAudit.room.dragLook(40,-20));
    const afterLook=await settle();assert.ok(afterLook.cityFrames>beforeLook.cityFrames);
    await page.setViewportSize({width:1280,height:800});
    const resized=await settle();assert.ok(resized.cityFrames>afterLook.cityFrames);
    await page.evaluate(()=>window.roomAudit.room.setMotion(true));
    await page.waitForTimeout(250);
    assert.ok((await counters()).cityFrames>resized.cityFrames+2);
    await page.evaluate(()=>window.roomAudit.room.setModalOccluded(true));
    const modalFrozen=await settle();await page.waitForTimeout(200);
    assert.equal((await counters()).renderedFrames,modalFrozen.renderedFrames,'An obscuring sorting dialog must not render the animated city behind it');
    await page.evaluate(()=>window.roomAudit.room.setModalOccluded(false));
    await page.waitForTimeout(250);assert.ok((await counters()).cityFrames>modalFrozen.cityFrames+2);
    await page.evaluate(()=>window.roomAudit.room.setMotion(false));await settle();
    const beforeSliders=await counters();
    await page.evaluate(async()=>{
      const started=performance.now();
      while(performance.now()-started<950){
        window.roomAudit.room.setCityTime(16.5+(performance.now()-started)/1000);
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
    });
    await page.waitForTimeout(450);
    const afterSliders=await counters();
    assert.ok(afterSliders.environmentCaptures-beforeSliders.environmentCaptures<=6,'Continuous input must not rebuild a six-face city probe every frame');
    await page.evaluate(async()=>{
      const room=window.roomAudit.room,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      await wait(300);room.setCityClouds(.4);
      await wait(100);room.setCityTime(18);
      await wait(100);room.setCityTime(19);
      await wait(550);
    });
    assert.deepEqual(await page.evaluate(()=>window.roomAudit.staleProbes()),[],'Every captured reflection must use shadows from the same sun position, including staggered cloud/time changes');
    await page.evaluate(()=>window.roomAudit.configure('held',false));await settle();
    await page.evaluate(()=>window.roomAudit.sheetBatches(false));await settle();const separateSheets=await page.screenshot();
    await page.evaluate(()=>window.roomAudit.sheetBatches(true));await settle();const batchedSheets=await page.screenshot();
    const unbatched=await sharp(separateSheets).removeAlpha().raw().toBuffer(),batched=await sharp(batchedSheets).removeAlpha().raw().toBuffer();
    let changedSheets=0;
    for(let i=0;i<unbatched.length;i+=3)if(Math.abs(unbatched[i]-batched[i])+Math.abs(unbatched[i+1]-batched[i+1])+Math.abs(unbatched[i+2]-batched[i+2])>18)changedSheets++;
    assert.ok(changedSheets/(unbatched.length/3)<.002,'Batched binder sheets must preserve their actual geometry, highlights and shadows');
    const sheets=await page.evaluate(()=>window.roomAudit.sheets());
    assert.equal(sheets.length,2);assert.ok(sheets.every(stack=>stack.instanced));assert.equal(sheets.reduce((sum,stack)=>sum+stack.count,0),20);
    assert.deepEqual(errors,[]);
    console.log('PASS: paused scenes issue no redundant draws; late artwork, highlights, page turns, weather, lighting, camera and resize invalidate the correct cached layers');
  }finally{releaseImage?.();await close()}
}

export async function checkParallelRoomLoading(browser,origin){
  const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage();
  let release;const blockedTexture=new Promise(resolve=>{release=resolve});
  await page.route('**/room/oak-color.webp',async route=>{await blockedTexture;await route.continue()});
  const plantRequested=page.waitForRequest(request=>request.url().includes('/room/plants/potted_plant_01.glb.gz'),{timeout:15000});
  try{
    await page.goto(origin,{waitUntil:'commit'});
    await plantRequested;
    assert.equal(await page.locator('html').getAttribute('data-ready'),null,'Plants must load while an independent room texture is still blocked');
    await page.locator('#loading-bag').click();assert.ok(await page.locator('.collection-card').count()>0);
    release();
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
    assert.equal(await page.locator('#bag-dialog').isVisible(),true,'Finishing startup must preserve collection browsing');
    console.log('PASS: optional plant/model loading overlaps room textures and collection controls stay usable during startup');
  }finally{release();await context.close()}
}

export async function checkRoomDepthAlignment(browser,origin,shots){
  const {page,errors,close}=await createAuditPage(browser,origin,{viewport:{width:1440,height:830},deviceScaleFactor:2});
  try{
    for(const [width,height,dy]of [[1440,830,-180],[1365,767,-320]]){
      await page.setViewportSize({width,height});
      await page.evaluate(dy=>{window.roomAudit.configure('binder',false);window.roomAudit.room.dragLook(-110,dy)},dy);
      await page.waitForTimeout(1600);
      await page.evaluate(()=>window.roomAudit.occluders(true));await page.waitForTimeout(160);
      const sizes=await page.evaluate(()=>window.roomAudit.renderSizes());
      assert.deepEqual(sizes.target,sizes.canvas,'HDR color/depth must use the exact drawing-buffer size, including fractional DPR rounding');
      const enabled=await page.screenshot();
      await page.evaluate(()=>window.roomAudit.occluders(false));await page.waitForTimeout(160);
      const disabled=await page.screenshot();
      const a=await sharp(enabled).removeAlpha().raw().toBuffer(),b=await sharp(disabled).removeAlpha().raw().toBuffer();
      let changed=0;
      for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>24)changed++;
      assert.ok(changed/(a.length/3)<.006,'The optimized table must not gain a horizontal dark band at Retina/odd viewport dimensions');
      await sharp(enabled).resize(width).toFile(new URL(`table-depth-${width}x${height}.png`,shots).pathname);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: Retina/odd-size city depth matches the canvas exactly and preserves the table without a horizontal band');
  }finally{await close()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
  try{console.log(JSON.stringify(await auditRoomPerformance(browser,origin),null,2))}
  finally{await browser.close()}
}
