import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVolumeRain,weatherEnvelope } from '../src/city-weather.js';
import { vehicleProfile,VEHICLE_KINDS } from '../src/vehicle-profile.js';
import { createRoofCrane,screenState,SCREEN_COLORS } from '../src/city-neon.js';
import { CityBatch } from '../src/city-materials.js';
import { roofFixtureAnchor } from '../src/building-massing.js';
import { BALCONY_CAMERA,TV,createCoffeeSteam,createRoomExtras } from '../src/room-extras.js';
import { TV_VIDEO_ID,tvFrustumVisibility,youtubeEmbedURL } from '../src/room-tv.js';
import { writeVehicleInstance } from '../src/instance-transforms.js';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { unpackCityGeometry } from '../src/city-survey.js';
import { architecturalSurfaces } from '../src/city-architecture.js';
import { visibleScreenMount } from '../src/city-neon.js';
import { STREET_SCREEN_BUILDINGS } from '../src/city-life.js';

test('rain automatically adds overcast clouds and denser haze while preserving the clear-weather slider',()=>{
  const clear=weatherEnvelope('clear',.12),rain=weatherEnvelope('rain',.12),fog=weatherEnvelope('fog',.12);
  assert.equal(clear.clouds,.12);assert.ok(rain.clouds>=.94&&fog.clouds>=.8);
  assert.ok(rain.airDensity>clear.airDensity*3&&fog.airDensity>rain.airDensity);
  assert.equal(weatherEnvelope('clear',.12).clouds,.12);
  assert.throws(()=>weatherEnvelope('snow',0),/Invalid/);
});

test('rain contains true near and distant 3D drops driven in one GPU batch',()=>{
  const scene=new THREE.Scene(),rain=createVolumeRain(scene,{cityNight:{value:1}});
  const seed=rain.geometry.attributes.rainSeed,shape=rain.geometry.attributes.rainShape;
  assert.equal(rain.geometry.instanceCount,3000);assert.equal(rain.geometry.attributes.position.count,6);
  const depths=Array.from({length:seed.count},(_,i)=>seed.getY(i));
  assert.ok(Math.min(...depths)<-400&&Math.max(...depths)>-9);
  assert.ok(new Set(depths.map(z=>Math.floor(z/10))).size>=38);
  assert.ok(shape.getX(0)!==shape.getX(1));
  assert.equal(rain.material.depthTest,true);assert.equal(rain.material.depthWrite,false);
  assert.ok(rain.material.vertexShader.includes('modelViewMatrix'));
  rain.geometry.dispose();rain.material.dispose();
});

test('vehicle population includes six distinct shapes and non-identical driver headways/offsets',()=>{
  const fleet=Array.from({length:768},(_,i)=>vehicleProfile(i));
  assert.deepEqual(new Set(fleet.map(vehicle=>vehicle.kind)),new Set(VEHICLE_KINDS));
  assert.ok(fleet.filter(v=>v.kind==='box-truck').length>=50);
  assert.ok(fleet.filter(v=>v.kind==='motorcycle').length>=25);
  assert.ok(new Set(fleet.map(v=>v.followGap.toFixed(3))).size>100);
  assert.ok(new Set(fleet.map(v=>v.laneOffset.toFixed(3))).size>90);
  assert.ok(fleet.every(v=>v.width>=v.bodyWidth+.055&&v.length>=.6));
  assert.deepEqual(vehicleProfile(72),fleet[72]);
});

test('vehicle transforms preserve individual width, height and length without per-frame objects',()=>{
  const buffer=new Float32Array(16),dummy=new THREE.Object3D();
  for(let i=0;i<40;i++){
    const profile=vehicleProfile(i),angle=i*.17;
    writeVehicleInstance(buffer,0,2,-23.8,-50,Math.sin(angle),Math.cos(angle),profile.width,profile.height,profile.length);
    dummy.position.set(2,-23.8,-50);dummy.rotation.y=angle;dummy.scale.set(profile.width,profile.height,profile.length);dummy.updateMatrix();
    new Float32Array(dummy.matrix.elements).forEach((v,j)=>assert.ok(Math.abs(v-buffer[j])<1e-6));
  }
});

test('street screens cycle distinct ad colors with matching deterministic cross-fades',()=>{
  assert.equal(new Set(SCREEN_COLORS).size,4);
  assert.equal(screenState(0,0).frame,0);assert.equal(screenState(11,0).frame,1);
  assert.ok(screenState(10,0).blend>0&&screenState(10,0).blend<1);
  assert.deepEqual(screenState(44,0),screenState(0,0));
  assert.notDeepEqual(screenState(4,0),screenState(4,1));
});

test('roof cranes have braced masts, complete jibs, machinery and attached hooks in bounded batches',()=>{
  const spec={id:'construction-probe',x:80,z:-105,yaw:.24,width:7,depth:6,height:20,floors:24,style:'office'};
  const steel=new THREE.MeshStandardMaterial(),frame=new THREE.MeshStandardMaterial();
  for(const index of [0,1]){
    const group=new THREE.Group(),batch=new CityBatch(group),beams=[],boxes=[];
    const addBeam=batch.beam.bind(batch),addBox=batch.box.bind(batch);
    batch.beam=(material,a,b,radius)=>{beams.push({a,b,radius});addBeam(material,a,b,radius)};
    batch.box=(material,center,size,yaw)=>{boxes.push({center,size});addBox(material,center,size,yaw)};
    const crane=createRoofCrane(batch,spec,index,steel,frame);batch.finish();
    assert.deepEqual(crane.roof,roofFixtureAnchor(spec,.85,.85));
    assert.equal(crane.beacons.length,3);
    assert.ok(beams.length>230&&beams.every(({a,b,radius})=>[...a,...b,radius].every(Number.isFinite)));
    assert.ok(boxes.some(({size})=>size[0]>.8&&size[1]>.9),'A complete crane must include its operator cab');
    assert.ok(boxes.filter(({size})=>size[1]===.78).length===3,'The counterjib must carry its counterweights');
    const collars=beams.filter(({a,b})=>Math.abs(a[1]-b[1])<1e-9&&a[1]<=crane.roof.y+.05+crane.height);
    assert.ok(collars.length>35,'Mast chords need connected horizontal collars rather than lone vertical poles');
    const bounds=new THREE.Box3().setFromObject(group);
    assert.ok(bounds.min.y>=crane.roof.y-.005&&bounds.max.y<=crane.roof.y+crane.height+2.8);
    assert.ok(group.children.length<=4,'All crane parts must reuse a handful of instanced batches');
    group.traverse(object=>{object.geometry?.dispose();if(object.isInstancedMesh)object.dispose()});
  }
  steel.dispose();frame.dispose();
});

test('balcony camera is outside the glazing but inside the completed balcony perimeter',()=>{
  assert.ok(BALCONY_CAMERA[2]<-7.2&&BALCONY_CAMERA[2]>-9.38);
  assert.ok(BALCONY_CAMERA[0]>-6.8&&BALCONY_CAMERA[0]<8.9);
});

test('room extras include physical guitar, speakers, television and rising steam',()=>{
  const scene=new THREE.Scene(),texture=new THREE.Texture(),extras=createRoomExtras(scene,{'oak-color':texture,'oak-normal':texture});
  assert.ok(extras.group.getObjectByName('Acoustic guitar on a floor stand'));
  assert.equal(extras.group.children.filter(o=>o.name==='Walnut floor-standing speaker').length,2);
  assert.ok(extras.tvScreen.geometry.parameters.width===TV.width);
  const steam=createCoffeeSteam(scene);steam.update(12,900);
  assert.equal(steam.root.material.uniforms.steamTime.value,12);
  assert.equal(steam.root.material.depthWrite,false);
  const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();
});

test('TV uses only the requested supported YouTube embed with muted inline playback',()=>{
  const url=new URL(youtubeEmbedURL('http://127.0.0.1:4173'));
  assert.equal(url.origin,'https://www.youtube-nocookie.com');
  assert.equal(url.pathname,`/embed/${TV_VIDEO_ID}`);
  assert.equal(TV_VIDEO_ID,'kuctuTR_cEM');assert.equal(url.searchParams.get('mute'),'1');
  assert.equal(url.searchParams.get('origin'),'http://127.0.0.1:4173');
});

test('TV interaction uses full screen corners, including partially clipped edge controls',()=>{
  const screen=new THREE.Object3D();screen.position.set(...TV.position);screen.rotation.y=TV.yaw;screen.translateZ(.071);screen.updateMatrixWorld(true);
  const corners=[[-.5,-.5],[-.5,.5],[.5,-.5],[.5,.5]].map(([x,y])=>screen.localToWorld(new THREE.Vector3(x*TV.width,y*TV.height,0)));
  const camera=new THREE.PerspectiveCamera(54,1440/900,.15,1800);camera.position.set(0,3.05,5.9);
  const look=yaw=>{const pitch=.08;camera.lookAt(Math.sin(yaw)*Math.cos(pitch),3.05-Math.sin(pitch),5.9-Math.cos(yaw)*Math.cos(pitch));camera.updateMatrixWorld(true);};
  look(.27);assert.deepEqual(tvFrustumVisibility(corners,camera),{visible:true,fullyVisible:false});
  look(.9);assert.deepEqual(tvFrustumVisibility(corners,camera),{visible:true,fullyVisible:true});
  look(-.8);assert.equal(tvFrustumVisibility(corners,camera).visible,false);
});

test('animated street displays are visible in front of their backing and full host geometry',async()=>{
  const root=new URL('../public/city/',import.meta.url);
  const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
  for(const id of STREET_SCREEN_BUILDINGS){
    const spec=manifest.buildings.find(spec=>spec.id===id),tile=manifest.tiles.find(tile=>tile.id===`hero-${id}`);
    const bytes=gunzipSync(await fs.readFile(new URL(tile.geometry,root)));
    const parsed=unpackCityGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const material=new THREE.MeshBasicMaterial(),host=new THREE.Mesh(parsed.geometry,material);
    host.position.copy(parsed.position);host.scale.copy(parsed.size);host.updateMatrixWorld(true);
    const mount=visibleScreenMount(spec,architecturalSurfaces(parsed),host);assert.ok(mount,`${id} must have a visible exterior screen location`);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(mount.width,mount.height),material);
    const backing=new THREE.Mesh(new THREE.BoxGeometry(mount.width+.12,mount.height+.12,.1),material);
    const normal=new THREE.Vector3(Math.sin(mount.yaw),0,Math.cos(mount.yaw));
    screen.position.set(mount.x,mount.y,mount.z);screen.rotation.y=mount.yaw;screen.updateMatrixWorld(true);
    backing.position.copy(screen.position).addScaledVector(normal,-.066);backing.rotation.y=mount.yaw;backing.updateMatrixWorld(true);
    for(const camera of [[0,3.05,5.9],BALCONY_CAMERA])for(const x of [-.44,0,.44])for(const y of [-.44,0,.44]){
      const point=screen.localToWorld(new THREE.Vector3(x*mount.width,y*mount.height,0)),eye=new THREE.Vector3(...camera);
      const ray=new THREE.Raycaster(eye,point.sub(eye).normalize());
      assert.equal(ray.intersectObjects([screen,backing,host],false)[0]?.object,screen,'The screen face, not its support or host wall, must be the nearest surface');
    }
    parsed.geometry.dispose();screen.geometry.dispose();backing.geometry.dispose();material.dispose();
  }
});
