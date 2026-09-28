import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CITY_GROUND, HERO_BUILDINGS, TOWER } from '../src/city-layout.js';
import { TOWER_MODEL, TOWER_PROFILE, createTokyoTower, towerDeckOutline, towerRadius } from '../src/tokyo-tower.js';
import { REFERENCE_BUILDINGS, createReferenceBuilding, referenceRingAt, referenceCrownBeams } from '../src/city-reference-buildings.js';
import { airOpticalDepth, applyCityAir } from '../src/city-air.js';

test('Tokyo Tower matches the reference deck proportions at its smaller independent scene scale', () => {
  assert.ok(TOWER_MODEL.mainDeck/TOWER_MODEL.height>.34&&TOWER_MODEL.mainDeck/TOWER_MODEL.height<.37);
  assert.ok(TOWER_MODEL.topDeck/TOWER_MODEL.height>.73&&TOWER_MODEL.topDeck/TOWER_MODEL.height<.76);
  assert.equal(towerRadius(0),40);assert.equal(towerRadius(333),.08);
  for(let i=1;i<TOWER_PROFILE.length;i++){
    assert.ok(TOWER_PROFILE[i][0]>TOWER_PROFILE[i-1][0]);
    assert.ok(TOWER_PROFILE[i][1]<TOWER_PROFILE[i-1][1]);
  }
  assert.ok(towerRadius(80)<15&&towerRadius(150)<9);
  assert.ok(towerRadius(270)>2.3&&towerRadius(270)<3&&towerRadius(307)<.5);
  assert.throws(()=>towerRadius(NaN),/profile/);
  const parent=new THREE.Scene(),tower=createTokyoTower(parent);
  const bounds=new THREE.Box3().setFromObject(tower.root);
  assert.ok(Math.abs(bounds.max.y-CITY_GROUND-TOWER.height)<.005);
  let instances=0,triangles=0;
  const materials=new Set();
  const observatories=tower.root.children.filter(mesh=>!mesh.isInstancedMesh);
  assert.equal(observatories.length,2,'Main and top decks must be shaped observatory meshes, not generic square boxes');
  assert.ok(observatories.every(mesh=>mesh.geometry.attributes.position.count>=100));
  const top=towerDeckOutline(TOWER_MODEL.topDeckWidth,false);
  const sides=top.map((point,index)=>Math.hypot(point[0]-top[(index+1)%8][0],point[1]-top[(index+1)%8][1]));
  assert.ok(Math.max(...sides)-Math.min(...sides)<.02,'The top deck must have a balanced octagonal outline');
  for(const mesh of tower.root.children){
    instances+=mesh.isInstancedMesh?mesh.count:0;
    triangles+=(mesh.isInstancedMesh?mesh.count:1)*(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;materials.add(mesh.material);
    mesh.geometry.dispose();
  }
  materials.forEach(material=>material.dispose());
  assert.ok(instances>1600,'The structure must remain modeled, with heavier structural braces rather than a faint wireframe');
  assert.ok(TOWER.height/95<.77,'The silhouette must be visibly smaller than its prior scale');
  assert.ok(triangles<250000&&tower.root.children.length<=13,'Tower detail must remain efficiently batched');
});

test('seven reference buildings have distinct real silhouettes within their reserved footprints', () => {
  const signatures=new Set();
  for(const id of Object.keys(REFERENCE_BUILDINGS)){
    const spec=HERO_BUILDINGS.find(spec=>spec.id===id),parsed=createReferenceBuilding(spec);
    const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(parsed.geometry,material);
    mesh.position.copy(parsed.position);mesh.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(mesh);
    assert.ok(bounds.min.y>=CITY_GROUND-.001&&bounds.max.y<=CITY_GROUND+spec.height+.001);
    const halfX=(spec.width*Math.abs(Math.cos(spec.yaw))+spec.depth*Math.abs(Math.sin(spec.yaw)))/2;
    const halfZ=(spec.depth*Math.abs(Math.cos(spec.yaw))+spec.width*Math.abs(Math.sin(spec.yaw)))/2;
    assert.ok(bounds.min.x>=spec.x-halfX-.001&&bounds.max.x<=spec.x+halfX+.001);
    assert.ok(bounds.min.z>=spec.z-halfZ-.001&&bounds.max.z<=spec.z+halfZ+.001);
    const ray=new THREE.Raycaster(new THREE.Vector3(spec.x,CITY_GROUND+spec.height+2,spec.z),new THREE.Vector3(0,-1,0));
    assert.ok(ray.intersectObject(mesh,false)[0]?.point.y>CITY_GROUND+spec.height*.8,`${id} must have an outward-facing solid roof`);
    const normals=parsed.geometry.attributes.normal;
    assert.ok(Array.from(normals.array).every(Number.isFinite));
    if(id==='right-rounded-tower'){
      const directions=new Set();
      for(let i=0;i<normals.count;i++)if(Math.abs(normals.getY(i))<.01)directions.add(`${normals.getX(i).toFixed(2)}:${normals.getZ(i).toFixed(2)}`);
      assert.ok(directions.size>=20,'The rounded tower cannot be another rectangular box');
    }
    signatures.add(REFERENCE_BUILDINGS[id].shape);
    parsed.geometry.dispose();material.dispose();
  }
  assert.equal(signatures.size,7);
});

test('height-integrated haze thickens with distance and weather without flattening close or high surfaces', () => {
  const near=airOpticalDepth(45,27,12,.0013),middle=airOpticalDepth(330,27,12,.0013),far=airOpticalDepth(900,27,12,.0013);
  assert.ok(Math.exp(-near)>.94,'Nearby architecture must retain contrast');
  assert.ok(near<middle&&middle<far);
  assert.ok(airOpticalDepth(900,27,180,.0013)<far*.65,'Tall skyline tops should emerge above the denser ground haze');
  assert.ok(airOpticalDepth(330,27,12,.009)>middle*5);
  assert.equal(airOpticalDepth(0,27,12,.0013),0);
  assert.ok(Math.abs(airOpticalDepth(300,27,27,.0013)-airOpticalDepth(300,27,27.0001,.0013))<1e-6);
  assert.throws(()=>airOpticalDepth(-1,0,0,.0013),/atmospheric/);
});

test('the atmosphere composes with existing material hooks without duplicate uniforms or room changes', () => {
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();
  material.onBeforeCompile=shader=>{shader.fragmentShader='uniform float cityNight;\\n'+shader.fragmentShader;};
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);scene.add(mesh);
  const roomMaterial=new THREE.MeshStandardMaterial();
  const uniforms=Object.fromEntries(['cityAirDensity','cityDaylight','cityNight','citySunset','citySunDirection'].map(key=>[key,{value:0}]));
  applyCityAir(scene,uniforms);
  const key=material.customProgramCacheKey();applyCityAir(scene,uniforms);assert.equal(material.customProgramCacheKey(),key);
  const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <tonemapping_fragment>\n#include <fog_fragment>'};
  material.onBeforeCompile(shader);
  assert.equal((shader.fragmentShader.match(/uniform float cityNight;/g)||[]).length,1);
  assert.ok(!shader.fragmentShader.includes('y--'));
  assert.ok(shader.fragmentShader.indexOf('opticalDepth')<shader.fragmentShader.indexOf('#include <tonemapping_fragment>'),'Atmospheric scattering must happen in linear light before display mapping, including the non-HDR fallback');
  assert.ok(shader.vertexShader.includes('instanceMatrix*airPoint'));
  assert.equal(roomMaterial.userData.cityAir,undefined);
  material.dispose();roomMaterial.dispose();mesh.geometry.dispose();
});

test('aircraft sprites write their actual world center before evaluating atmospheric haze',()=>{
  const scene=new THREE.Scene(),material=new THREE.SpriteMaterial(),sprite=new THREE.Sprite(material);
  sprite.position.set(12,80,-600);scene.add(sprite);
  const uniforms=Object.fromEntries(['cityAirDensity','cityDaylight','cityNight','citySunset','citySunDirection'].map(key=>[key,{value:0}]));
  applyCityAir(scene,uniforms);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.sprite.vertexShader,fragmentShader:THREE.ShaderLib.sprite.fragmentShader};
  material.onBeforeCompile(shader);
  assert.equal((shader.vertexShader.match(/vCityAirPoint\s*=/g)||[]).length,1);
  assert.ok(shader.vertexShader.includes('vCityAirPoint=modelMatrix[3].xyz'));
  assert.ok(shader.fragmentShader.includes('vCityAirPoint-cameraPosition'));
  material.dispose();
});

test('tapered landmark trims follow the exact shell rings rather than floating bounding boxes',()=>{
  for(const id of ['right-rounded-tower','right-terraced-tower']){
    const spec=HERO_BUILDINGS.find(spec=>spec.id===id),parsed=createReferenceBuilding(spec);
    const mesh=new THREE.Mesh(parsed.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    mesh.updateMatrixWorld(true);
    const rotation=new THREE.Matrix4().makeRotationY(spec.yaw);
    const segments=[];
    if(id==='right-rounded-tower'){
      for(let floor=1;floor<spec.floors;floor++){
        const ring=referenceRingAt(spec,spec.height*floor/spec.floors);
        for(let i=0;i<ring.length;i++)segments.push([ring[i],ring[(i+1)%ring.length]]);
      }
    }else segments.push(...referenceCrownBeams(spec));
    for(const [a,b]of segments)for(const fraction of [.15,.5,.85]){
      const point=new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),fraction).applyMatrix4(rotation);
      const outward=new THREE.Vector3(point.x,0,point.z).normalize();
      const ray=new THREE.Raycaster(point.clone().addScaledVector(outward,.25),outward.clone().negate(),0,.5);
      const hit=ray.intersectObject(mesh,false)[0];
      assert.ok(hit&&Math.abs(hit.distance-.25)<.025,`${id} trim must stay on its real tapered surface`);
    }
    parsed.geometry.dispose();mesh.material.dispose();
  }
});
