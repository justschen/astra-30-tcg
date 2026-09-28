import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { CITY_GROUND, CITY_STREETS, TOWER, createCityLayout } from '../src/city-layout.js';
import { combineSurveyLayout } from '../src/city-survey-layout.js';
import { createCityInfill } from '../src/city-infill.js';
import { authoredBuildingTiers, buildingLocalPoint, buildingMassing, drawRoofAssembly, MASSING_KINDS, massingGeometry, roofFixtureAnchor, roofSignPosts, rooftopAssemblies } from '../src/building-massing.js';
import { ArchitectureDetails } from '../src/city-architecture.js';
import { unpackCityGeometry } from '../src/city-survey.js';
import { REFERENCE_BUILDINGS, createReferenceBuilding } from '../src/city-reference-buildings.js';
import { gunzipSync } from 'node:zlib';

const manifest=JSON.parse(await fs.readFile(new URL('../public/city/manifest.json',import.meta.url),'utf8'));
const existing=combineSurveyLayout(createCityLayout(),manifest.buildings);
const roads=CITY_STREETS.map(street=>({...street,curve:new THREE.CatmullRomCurve3(street.points.map(([x,z])=>new THREE.Vector3(x,CITY_GROUND+.055,z)),false,'centripetal')}));
const specs=[...existing,...createCityInfill(existing,roads).buildings];
const styles=new Map(MASSING_KINDS.map(kind=>[kind,[]]));
for(const spec of specs){const form=buildingMassing(spec);if(form)styles.get(form.kind).push(spec);}

test('stepped landmark bodies and facade trim share the same shrinking tier envelopes',()=>{
  const stepped=specs.filter(spec=>spec.stepped&&!spec.surveyed);
  assert.ok(stepped.length>=2);
  for(const spec of stepped){
    const tiers=authoredBuildingTiers(spec);
    assert.equal(tiers.length,4);
    assert.equal(tiers[0].center[1]-tiers[0].height/2,CITY_GROUND);
    assert.ok(Math.abs(tiers[3].center[1]+tiers[3].height/2-CITY_GROUND-spec.height)<1e-9);
    tiers.forEach((tier,i)=>{
      assert.equal(tier.width,spec.width*(1-i*.12));assert.equal(tier.depth,spec.depth*(1-i*.12));
      assert.ok(tier.height<spec.height,'No individual facade strip should run the full height outside a stepped body');
      if(i)assert.ok(tier.width<tiers[i-1].width&&tier.depth<tiers[i-1].depth);
    });
  }
});

function bodyMeshes(spec,form,material){
  return form.parts.map(part=>{
    const mesh=new THREE.Mesh(massingGeometry(part.shape),material);
    mesh.position.set(...buildingLocalPoint(spec,part.x,part.z,part.bottom+part.height/2));
    mesh.scale.set(part.width,part.height,part.depth);mesh.rotation.y=spec.yaw;mesh.updateMatrixWorld(true);
    return mesh;
  });
}

test('roof diversity applies across the ordinary city without moving or replacing its population',()=>{
  assert.equal(specs.length,8558);
  assert.ok([...styles.values()].reduce((sum,items)=>sum+items.length,0)>2800);
  for(const [kind,items]of styles)assert.ok(items.length>=150,`${kind} must exist across the city, not only on one hero building`);
  const before=JSON.stringify(specs);
  for(const spec of specs){
    const form=buildingMassing(spec);if(!form)continue;
    assert.deepEqual(buildingMassing(spec),form);
    assert.ok(form.parts.every(part=>part.width>0&&part.depth>0&&part.height>0));
    for(const part of form.parts){
      assert.ok(Math.abs(part.x)+part.width/2<=spec.width/2+1e-8,`${spec.id} width`);
      assert.ok(Math.abs(part.z)+part.depth/2<=spec.depth/2+1e-8,`${spec.id} depth`);
      assert.ok(part.bottom>=0&&part.bottom+part.height<=spec.height+1e-8);
      assert.equal(Number.isInteger(part.floors),true);
    }
  }
  assert.equal(JSON.stringify(specs),before);
  assert.ok(specs.filter(spec=>spec.surveyed||spec.hero||spec.stepped||spec.pitched).every(spec=>buildingMassing(spec)===null));
  assert.equal(TOWER.height,72);
});

test('every declared roof region lies on the actual solid top surface, including stepped terraces',()=>{
  const material=new THREE.MeshBasicMaterial(),ray=new THREE.Raycaster();
  for(const [kind,items]of styles)for(const source of items.slice(0,16)){
    const spec={...source,yaw:.23},form=buildingMassing(spec),meshes=bodyMeshes(spec,form,material);
    for(const roof of form.roofs)for(const x of [-.43,0,.43])for(const z of [-.43,0,.43]){
      const point=buildingLocalPoint(spec,roof.x+x*roof.width,roof.z+z*roof.depth,roof.y);
      ray.set(new THREE.Vector3(point[0],CITY_GROUND+spec.height+3,point[2]),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObjects(meshes,false)[0];
      assert.ok(hit&&Math.abs(hit.point.y-point[1])<.0001,`${kind}/${spec.id}: unsupported roof at ${roof.x},${roof.z}`);
    }
    meshes.forEach(mesh=>mesh.geometry.dispose());
  }
  material.dispose();
});

test('setback and core proportions vary within a family instead of repeating one prefabricated shape',()=>{
  const variants=new Map(['side-setback','rear-setback','shoulder-core','courtyard'].map(kind=>[kind,new Set()]));
  for(let i=0;i<1200;i++){
    const form=buildingMassing({id:`proportion-${i}`,x:0,z:0,yaw:0,width:7,depth:6,height:12,floors:14,style:'office',hero:false});
    variants.get(form.kind)?.add(JSON.stringify(form.parts.slice(1)));
  }
  for(const [kind,forms]of variants)assert.ok(forms.size>12,`${kind} requires varied offsets/proportions within the same plot envelope`);
});

test('rooftop plant, access rooms and tanks fit their supported roof regions without overlap',()=>{
  const types=new Set();let total=0;
  for(const spec of specs){
    const form=buildingMassing(spec);if(!form)continue;
    const items=rooftopAssemblies(spec,form);
    for(const item of items){
      types.add(item.kind);total++;
      assert.ok(Math.abs(item.x-item.roof.x)+item.width/2<item.roof.width/2);
      assert.ok(Math.abs(item.z-item.roof.z)+item.depth/2<item.roof.depth/2);
      assert.equal(item.y,item.roof.y);
      assert.ok(item.height>0);
    }
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j];if(Math.abs(a.y-b.y)>.001)continue;
      assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.z-b.z)>=(a.depth+b.depth)/2);
    }
  }
  assert.equal(types.size,6);assert.ok(total>2000);
});

test('crane and sign roof anchors are real support points and never occupy reserved plant space',()=>{
  const material=new THREE.MeshBasicMaterial(),ray=new THREE.Raycaster();
  for(const spec of specs.filter(spec=>!spec.surveyed&&!spec.hero&&!spec.stepped&&!spec.pitched&&spec.x>60&&spec.x<170&&spec.z< -75&&spec.z> -190&&spec.width>4&&spec.depth>4)){
    const form=buildingMassing(spec),anchor=roofFixtureAnchor(spec,.85,.85),meshes=bodyMeshes(spec,form,material);
    ray.set(new THREE.Vector3(anchor.x,anchor.y+1,anchor.z),new THREE.Vector3(0,-1,0));
    assert.ok(Math.abs(ray.intersectObjects(meshes,false)[0].point.y-anchor.y)<.0001);
    for(const item of rooftopAssemblies(spec,form)){
      const point=buildingLocalPoint(spec,item.x,item.z,item.y);
      assert.ok(Math.abs(point[0]-anchor.x)>=item.width/2+.56||Math.abs(point[2]-anchor.z)>=item.depth/2+.56);
    }
    meshes.forEach(mesh=>mesh.geometry.dispose());
  }
  material.dispose();
});

test('the small shared geometry set preserves closed finite solids and valid facade attributes',()=>{
  for(const shape of ['box','shed']){
    const geometry=massingGeometry(shape);
    assert.ok(geometry.index&&geometry.index.count%3===0);
    for(const attribute of ['position','normal','uv'])assert.ok(geometry.attributes[attribute].array.every(Number.isFinite));
    assert.equal(geometry.attributes.position.count,24);
    geometry.computeBoundingBox();assert.ok(geometry.boundingBox.min.y>=-.5&&geometry.boundingBox.max.y<=.5);
    geometry.dispose();
  }
  assert.throws(()=>massingGeometry('unsupported'),/Unsupported/);
});

test('water-tank posts meet the tank base even on narrow rectangular roof footprints',()=>{
  for(const [width,depth]of [[.85,.4],[.4,.85],[.55,.55],[.2,.7]]){
    const beams=[],cylinders=[],spec={id:'tank-check',x:4,z:-60,yaw:.27};
    const batch={beam(material,from,to,radius){beams.push({from,to,radius})},add(shape,material,position,size){cylinders.push({shape,position,size})}};
    drawRoofAssembly(batch,spec,{kind:'water-tank',x:0,z:0,y:8,width,depth,height:.8},{dark:{},mechanical:{},roof:{}});
    const tank=cylinders[0],radius=tank.size[0],bottom=tank.position[1]-tank.size[1]/2;
    assert.equal(beams.length,5);
    for(const post of beams.slice(0,4)){
      assert.ok(Math.abs(post.to[1]-bottom)<1e-8);
      assert.ok(Math.hypot(post.to[0]-tank.position[0],post.to[2]-tank.position[2])<radius*Math.cos(Math.PI/7),'Every post center must contact the actual polygonal tank bottom');
    }
  }
});

test('rooftop sign posts use the panel orientation, not a side-facing shop frontage',()=>{
  for(const yaw of [0,.2,Math.PI/2,-Math.PI/2,Math.PI]){
    const roof={x:8,y:10,z:-90,yaw},width=2.4;
    const inverse=new THREE.Matrix4().compose(new THREE.Vector3(roof.x,roof.y,roof.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1)).invert();
    for(const [from,to]of roofSignPosts(roof,width)){
      const bottom=new THREE.Vector3(...from).applyMatrix4(inverse),top=new THREE.Vector3(...to).applyMatrix4(inverse);
      assert.ok(Math.abs(top.z)<1e-9&&Math.abs(bottom.z)<1e-9);
      assert.ok(Math.abs(top.x)<=width/2);
      assert.equal(bottom.y,0);assert.ok(top.y>.105&&top.y<.2,'Posts must intersect the frame base, not stop below it');
    }
  }
});

test('actual survey/reference roof assemblies reserve space against earlier candidates',async()=>{
  const details=new ArchitectureDetails(new THREE.Group());
  for(const spec of manifest.buildings.filter(spec=>spec.authoredPlacement)){
    let parsed;
    if(REFERENCE_BUILDINGS[spec.id])parsed=createReferenceBuilding(spec);
    else{
      const tile=manifest.tiles.find(tile=>tile.id===`hero-${spec.id}`);
      const bytes=gunzipSync(await fs.readFile(new URL(`../public/city/${tile.geometry}`,import.meta.url)));
      parsed=unpackCityGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    }
    details.add(parsed,spec);parsed.geometry.dispose();
  }
  assert.ok(details.roofAssemblies.length>=20);
  for(let i=0;i<details.roofAssemblies.length;i++)for(let j=i+1;j<details.roofAssemblies.length;j++){
    const a=details.roofAssemblies[i],b=details.roofAssemblies[j];
    if(a.building!==b.building)continue;
    assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.z-b.z)>=(a.depth+b.depth)/2||Math.abs(a.y-b.y)>=(a.height+b.height)/2,
      `${a.building}: ${a.kind} and ${b.kind} must not interpenetrate`);
  }
  details.frame.dispose();details.sill.dispose();details.vent.dispose();
});
