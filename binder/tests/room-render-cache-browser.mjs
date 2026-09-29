import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function checkRoomToneMapping(browser,origin){
  const bundle=await build({
    stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
      import * as THREE from 'three';import {RoomRenderCache} from './binder/src/room-render-cache.js';
      const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(512,256);renderer.autoClear=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
      const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,1,-1,.1,10);camera.position.z=3;
      const pixels=new Uint8Array([44,68,142,255,210,76,38,255,36,36,36,255,220,198,59,255]);
      const image=new THREE.DataTexture(pixels,4,1);image.colorSpace=THREE.SRGBColorSpace;image.needsUpdate=true;image.magFilter=image.minFilter=THREE.NearestFilter;
      const print=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:image,toneMapped:false}));
      print.position.x=-1;scene.add(print);
      const wall=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({color:0xaeb7a6,roughness:.93}));
      wall.position.x=1;scene.add(wall,new THREE.HemisphereLight(0xffffff,0x777777,2));
      const read=()=>{const result=[],gl=renderer.getContext();for(const x of [32,96,160,224,384]){const rgba=new Uint8Array(4);gl.readPixels(x,128,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);result.push(Array.from(rgba).slice(0,3))}return result};
      renderer.clear();renderer.render(scene,camera);const direct=read();
      const cache=new RoomRenderCache(renderer);cache.setSize(512,256);await cache.prepare(renderer,scene,camera);
      renderer.clear();cache.render(renderer,scene,camera,true,[]);const cached=read();
      renderer.toneMappingExposure=1.24;renderer.clear();renderer.render(scene,camera);const warmDirect=read();
      renderer.clear();cache.render(renderer,scene,camera,true,[]);const warmCached=read();
      window.toneCheck={direct,cached,warmDirect,warmCached};
      cache.dispose();image.dispose();print.geometry.dispose();print.material.dispose();wall.geometry.dispose();wall.material.dispose();renderer.dispose();
    `},bundle:true,write:false,format:'esm',target:'es2022',logLevel:'silent',
  });
  const context=await browser.newContext({viewport:{width:512,height:256}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  const url=`${origin}/__room_color_probe__`;await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><canvas></canvas></body>'}));
  try{
    await page.goto(url);await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.waitForFunction(()=>window.toneCheck);
    const result=await page.evaluate(()=>window.toneCheck),expected=[[44,68,142],[210,76,38],[36,36,36],[220,198,59]];
    for(const [name,actual]of Object.entries(result)){
      expected.forEach((rgb,i)=>rgb.forEach((channel,j)=>assert.ok(Math.abs(actual[i][j]-channel)<=2,`${name}: printed colors must survive without HDR washout`)));
    }
    for(const [direct,cached]of [[result.direct,result.cached],[result.warmDirect,result.warmCached]]){
      direct.forEach((rgb,i)=>rgb.forEach((channel,j)=>assert.ok(Math.abs(channel-cached[i][j])<=2,'Cached and fresh rendering must apply material tone mapping exactly once')));
    }
    assert.notDeepEqual(result.direct[4],result.warmDirect[4],'Physical room materials must still respond to exposure');
    assert.deepEqual(errors,[]);console.log('PASS: printed color swatches survive exactly while the cached physical room is tone-mapped once at both lighting exposures');
  }finally{await context.close()}
}
