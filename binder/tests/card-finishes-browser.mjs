import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

export async function checkCardFinishes(browser,origin,shots){
  const result=await build({
    stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
      import * as THREE from 'three';
      import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
      import {CardFinishLibrary} from './binder/src/card-finishes.js';
      const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(900,900);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
      const scene=new THREE.Scene();scene.background=new THREE.Color(0x172128);
      const generator=new THREE.PMREMGenerator(renderer),environmentScene=new RoomEnvironment(),environment=generator.fromScene(environmentScene,.035);
      environmentScene.dispose();generator.dispose();scene.environment=environment.texture;scene.environmentIntensity=.55;
      scene.add(new THREE.HemisphereLight(0xffffff,0x777777,.5));
      const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-1.3,2.1,4);scene.add(key);
      const source=document.createElement('canvas');source.width=512;source.height=716;const ctx=source.getContext('2d');
      ctx.fillStyle='#979797';ctx.fillRect(0,0,512,716);ctx.fillStyle='#e6e4df';ctx.fillRect(35,418,442,240);
      ctx.fillStyle='#151b20';ctx.font='600 26px sans-serif';ctx.fillText('PRINTED CARD TEXT',57,463);
      ctx.font='20px sans-serif';ctx.fillText('Clear text. Reflective artwork.',57,508);ctx.fillText('No time-based animation.',57,541);
      const map=new THREE.CanvasTexture(source);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
      const material=new THREE.MeshPhysicalMaterial({map,color:0xffffff});
      const card=new THREE.Mesh(new THREE.PlaneGeometry(1.25,1.75),material);scene.add(card);
      const camera=new THREE.PerspectiveCamera(39,1,.1,20);camera.position.set(0,0,3);
      const finishes=new CardFinishLibrary();
      const fixtures={
        paper:{rarity:'Common',variant:'Non-holo',category:'main'},
        holo:{rarity:'Rare',variant:'Holo',category:'main'},
        smooth:{rarity:'Illustration Rare',variant:'Holo',category:'secret'},
        etched:{rarity:'Special Illustration Rare',variant:'Holo',category:'secret'},
        cosmos:{rarity:'Promo',variant:'Cosmos Holo',category:'variants'},
        confetti:{rarity:'Classic Collection',variant:'Holo',category:'classic'},
        unknown:{rarity:'RGB Rare',variant:'Holo',category:'secret'},
      };
      window.finishProbe={
        render(family,yaw=-.2,pitch=-.2){
          const finish=finishes.apply(material,fixtures[family]);card.rotation.set(pitch,yaw,0,'YXZ');card.updateMatrixWorld(true);
          renderer.render(scene,camera);
          const gl=renderer.getContext(),samples=[];
          for(const [u,v]of [[.22,.59],[.38,.7],[.61,.55],[.78,.77]]){
            const point=card.localToWorld(new THREE.Vector3((u-.5)*1.25,(v-.5)*1.75,0)).project(camera);
            const pixels=new Uint8Array(4);gl.readPixels(Math.round((point.x*.5+.5)*900),Math.round((point.y*.5+.5)*900),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            samples.push(...pixels.slice(0,3));
          }
          return {finish,samples,relief:Boolean(material.normalMap),textureCount:renderer.info.memory.textures,cache:finishes.maps.size};
        },
        dispose(){finishes.dispose();card.geometry.dispose();material.dispose();map.dispose();environment.dispose();renderer.dispose()},
      };
      window.finishProbeReady=true;
    `},
    bundle:true,format:'esm',target:'es2022',write:false,logLevel:'silent',
  });
  const context=await browser.newContext({viewport:{width:900,height:900},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  const url=`${origin}/__card_finish_probe__`;
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><canvas></canvas></body></html>'}));
  const raw=bytes=>sharp(bytes).removeAlpha().raw().toBuffer();
  try{
    await page.goto(url);await page.addScriptTag({type:'module',content:result.outputFiles[0].text});
    await page.waitForFunction(()=>window.finishProbeReady);
    await page.evaluate(()=>window.finishProbe.render('paper'));const paper=await raw(await page.screenshot());
    const captures={};
    for(const family of ['holo','smooth','etched','cosmos','confetti','unknown']){
      const result=await page.evaluate(family=>window.finishProbe.render(family),family);
      const image=await page.screenshot({path:new URL(`finish-${family}.png`,shots).pathname});
      const pixels=await raw(image);
      let changed=0;for(let i=0;i<pixels.length;i+=3)if(Math.abs(pixels[i]-paper[i])+Math.abs(pixels[i+1]-paper[i+1])+Math.abs(pixels[i+2]-paper[i+2])>9)changed++;
      assert.ok(changed>1500,`${family} must have visible material response, not just a label (${changed} pixels)`);
      assert.equal(result.relief,['etched','confetti'].includes(family));
      assert.equal(result.finish.exactPatternVerified,false);
      captures[family]=pixels;
    }
    let distinct=0;
    for(let i=0;i<captures.smooth.length;i+=3)if(Math.abs(captures.smooth[i]-captures.etched[i])+Math.abs(captures.smooth[i+1]-captures.etched[i+1])+Math.abs(captures.smooth[i+2]-captures.etched[i+2])>9)distinct++;
    assert.ok(distinct>1500,'Smooth and textured foil must have distinct rendered surface response');
    const first=await page.evaluate(()=>window.finishProbe.render('holo',-.35,.15));
    const turned=await page.evaluate(()=>window.finishProbe.render('holo',.38,-.18));
    assert.ok(first.samples.reduce((sum,value,i)=>sum+Math.abs(value-turned.samples[i]),0)>25,'The same artwork coordinates must change reflection when the card is angled');
    const stable=await page.screenshot();await page.evaluate(()=>window.finishProbe.render('holo',.38,-.18));
    assert.deepEqual(await raw(await page.screenshot()),await raw(stable),'A stationary finish must not sparkle or animate on a timer');
    assert.equal((await page.evaluate(()=>window.finishProbe.render('unknown'))).finish.confidence,'unknown');
    assert.deepEqual(errors,[]);
    console.log('PASS: distinct smooth, textured, cosmos and confetti finishes; angle-dependent response, stationary stability and explicit unknown-printing metadata');
  }finally{
    await page.evaluate(()=>window.finishProbe?.dispose());await context.close();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
  try{await checkCardFinishes(browser,process.env.BINDER_URL||'http://127.0.0.1:4173',new URL('../../shots/binder/',import.meta.url))}
  finally{await browser.close()}
}
