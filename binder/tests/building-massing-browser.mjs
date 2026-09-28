import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MASSING_KINDS } from '../src/building-massing.js';

export async function checkBuildingMassing(browser,origin,shots){
  const bundle=await build({
    stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
      import * as THREE from 'three';
      import {buildingLocalPoint,buildingMassing,dressBuildingRoofs,MASSING_KINDS,massingGeometry} from './binder/src/building-massing.js';
      import {CityBatch} from './binder/src/city-materials.js';
      import {CITY_GROUND} from './binder/src/city-layout.js';
      const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(800,700);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      const scene=new THREE.Scene();scene.background=new THREE.Color(0x26343d);
      scene.add(new THREE.HemisphereLight(0xdde8ed,0x6b706c,1.6));
      const light=new THREE.DirectionalLight(0xffe6c2,2.6);light.position.set(-10,CITY_GROUND+23,12);light.target.position.set(0,CITY_GROUND+3,0);light.castShadow=true;
      Object.assign(light.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:.1,far:70});light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.025;light.shadow.bias=-.00005;
      scene.add(light,light.target);
      const camera=new THREE.PerspectiveCamera(40,800/700,.1,90);camera.position.set(13,CITY_GROUND+16,19);camera.lookAt(0,CITY_GROUND+4.5,0);
      const surface=color=>new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.09});
      const material=surface(0xabb2ae),materials={stone:surface(0xc1c7c0),roof:surface(0x6e8185),mechanical:surface(0xa9b1ad),dark:surface(0x354248)};
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),surface(0x646e70));ground.rotation.x=-Math.PI/2;ground.position.y=CITY_GROUND-.015;ground.receiveShadow=true;scene.add(ground);
      let group=null,detailGroup=null;
      const fixtures=new Map();
      for(const kind of MASSING_KINDS){
        for(let index=0;index<2000;index++){
          const spec={id:'roof-probe-'+kind+'-'+index,x:0,z:0,yaw:0,width:8,depth:6,height:10,floors:12,hero:false,style:'office',color:0xabb2ae};
          if(buildingMassing(spec).kind===kind){fixtures.set(kind,spec);break;}
        }
        if(!fixtures.has(kind))throw new Error('No fixture for '+kind);
      }
      const clear=()=>{
        if(!group)return;
        group.traverse(object=>object.geometry?.dispose());group.removeFromParent();group=null;
      };
      window.massingProbe={
        render(kind,details){
          clear();const spec=fixtures.get(kind),form=buildingMassing(spec);
          group=new THREE.Group();scene.add(group);
          for(const part of form.parts){
            const mesh=new THREE.Mesh(massingGeometry(part.shape),material);
            mesh.position.set(...buildingLocalPoint(spec,part.x,part.z,part.bottom+part.height/2));mesh.scale.set(part.width,part.height,part.depth);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
          }
          if(details){detailGroup=new THREE.Group();group.add(detailGroup);const batch=new CityBatch(detailGroup);dressBuildingRoofs(batch,spec,materials,form);batch.finish();}
          renderer.render(scene,camera);
          return {parts:form.parts.length,roofs:form.roofs.length,geometryShapes:[...new Set(form.parts.map(part=>part.shape))],draws:renderer.info.render.calls};
        },
        dispose(){clear();ground.geometry.dispose();ground.material.dispose();material.dispose();Object.values(materials).forEach(material=>material.dispose());light.shadow.dispose();renderer.dispose()},
      };
      window.massingProbeReady=true;
    `},
    bundle:true,write:false,format:'esm',target:'es2022',logLevel:'silent',
  });
  const context=await browser.newContext({viewport:{width:800,height:700},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  const url=`${origin}/__building_massing_probe__`;
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><canvas></canvas></body></html>'}));
  try{
    await page.goto(url);await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.waitForFunction(()=>window.massingProbeReady);
    const shapes=new Set();
    for(const kind of MASSING_KINDS){
      await page.evaluate(kind=>window.massingProbe.render(kind,false),kind);
      const pixels=await sharp(await page.screenshot()).resize(240,210).removeAlpha().raw().toBuffer();
      shapes.add(createHash('sha256').update(pixels).digest('hex'));
      const stats=await page.evaluate(kind=>window.massingProbe.render(kind,true),kind);
      assert.ok(stats.parts>=1&&stats.parts<=3);
      assert.ok(stats.draws<45,'Rooftop details must be batched instead of adding a draw for every pipe and louver');
      if(kind==='slant-cut')assert.ok(stats.geometryShapes.includes('shed'));
      await page.screenshot({path:new URL(`tokyo-roof-${kind}.png`,shots).pathname});
    }
    assert.equal(shapes.size,MASSING_KINDS.length,'The seven neutral, equally sized buildings must have seven genuinely different rendered shapes');
    assert.deepEqual(errors,[]);
    console.log('PASS: seven distinct same-size building silhouettes, supported service roofs and bounded batched rooftop details');
  }finally{await page.evaluate(()=>window.massingProbe?.dispose());await context.close();}
}
