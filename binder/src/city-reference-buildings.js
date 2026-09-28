import * as THREE from 'three';
import { CITY_GROUND } from './city-layout.js';
import { CityBatch } from './city-materials.js';

export const REFERENCE_BUILDINGS = Object.freeze({
  'shiba-park-office': { shape:'brown-slab', label:'Broad terracotta office with deep floor bands', color:0x9c7160, light:0xffd99d, bay:.53, occupancy:.22 },
  'park-slim-hotel': { shape:'white-hotel', label:'Slender ivory hotel with a solid service spine', color:0xd9d8c8, light:0xffdfa2, bay:.6, occupancy:.28 },
  'left-charcoal-tower': { shape:'dark-crown', label:'Charcoal tower with a recessed rooftop crown', color:0x53646d, light:0xd3e6dc, bay:.57, occupancy:.44 },
  'right-terraced-tower': { shape:'tapered-crown', label:'Chamfered glass tower with an inclined crown', color:0x849a9b, light:0xe1df9d, bay:.5, occupancy:.31 },
  'right-rounded-tower': { shape:'rounded-tower', label:'Rounded silver residential tower with horizontal bands', color:0xabb4ad, light:0xffd3a0, bay:.65, occupancy:.43 },
  'horizon-lean-tower': { shape:'sloped-crown', label:'Green-glass slab with a sloped crown and sky lobbies', color:0x698d86, light:0xe1e6b4, bay:.59, occupancy:.4 },
  'park-east-hotel': { shape:'park-hotel', label:'Long pale park hotel with a rooftop sign pavilion', color:0xc2c6b4, light:0xffdb9c, bay:.6, occupancy:.35 },
});

const rectangle = (width, depth, chamfer = 0) => {
  const x=width/2,z=depth/2,c=Math.min(width,depth)*chamfer;
  return c ? [[-x+c,z],[x-c,z],[x,z-c],[x,-z+c],[x-c,-z],[-x+c,-z],[-x,-z+c],[-x,z-c]]
    : [[-x,z],[x,z],[x,-z],[-x,-z]];
};
const ellipse = (width,depth) => Array.from({length:24},(_,i)=>{
  const angle=i/24*Math.PI*2;
  return [Math.sin(angle)*width/2,Math.cos(angle)*depth/2];
});

export function referenceTowerRings(spec){
  const {width:w,depth:d,height:h}=spec,shape=REFERENCE_BUILDINGS[spec.id]?.shape;
  if(shape==='tapered-crown')return [
    {y:0,outline:rectangle(w,d,.13)},{y:h*.79,outline:rectangle(w*.98,d*.98,.13)},
    {y:h*.96,outline:rectangle(w*.8,d*.85,.13)},
    {y:x=>h*.982-x/w*.036,outline:rectangle(w*.75,d*.8,.13)},
  ];
  if(shape==='rounded-tower')return [
    {y:0,outline:ellipse(w,d)},{y:h*.84,outline:ellipse(w,d)},
    {y:h*.94,outline:ellipse(w*.93,d*.93)},{y:h,outline:ellipse(w*.77,d*.82)},
  ];
  throw new Error('This landmark has no tapered ring profile.');
}

export function referenceRingAt(spec,height){
  const rings=referenceTowerRings(spec).filter(ring=>typeof ring.y==='number');
  const high=rings.findIndex(ring=>ring.y>=height),index=Math.max(1,high);
  if(high<0||height<0)throw new RangeError('Height is outside the horizontal ring profile.');
  const lower=rings[index-1],upper=rings[index],t=(height-lower.y)/(upper.y-lower.y);
  return lower.outline.map(([x,z],i)=>[THREE.MathUtils.lerp(x,upper.outline[i][0],t),height,THREE.MathUtils.lerp(z,upper.outline[i][1],t)]);
}

export function referenceCrownBeams(spec){
  const rings=referenceTowerRings(spec),beams=[];
  const point=(ring,index)=>{
    const [x,z]=ring.outline[index];
    return [x,typeof ring.y==='function'?ring.y(x,z):ring.y,z];
  };
  for(const index of [0,1,2,7])for(let level=1;level<rings.length-1;level++){
    beams.push([point(rings[level],index),point(rings[level+1],index)]);
  }
  return beams;
}

export function createReferenceBuilding(spec) {
  const design=REFERENCE_BUILDINGS[spec.id];
  if(!design)throw new Error(`No reference building definition for ${spec.id}.`);
  const {width:w,depth:d,height:h}=spec, positions=[], indices=[];
  const shell=(rings)=>{
    const start=positions.length/3,count=rings[0].outline.length;
    if(!rings.every(ring=>ring.outline.length===count))throw new Error('Reference building rings have mismatched topology.');
    for(const ring of rings)for(const [x,z]of ring.outline){
      const y=typeof ring.y==='function'?ring.y(x,z):ring.y;
      positions.push(x,y,z);
    }
    for(let level=0;level<rings.length-1;level++)for(let i=0;i<count;i++){
      const a=start+level*count+i,b=start+level*count+(i+1)%count,c=a+count,e=b+count;
      indices.push(a,b,c,b,e,c);
    }
    for(const [level,reverse]of [[0,true],[rings.length-1,false]]){
      const outline=rings[level].outline.map(([x,z])=>new THREE.Vector2(x,z));
      for(const triangle of THREE.ShapeUtils.triangulateShape(outline,[])){
        const [a,b,c]=triangle.map(index=>start+level*count+index);
        if(reverse)indices.push(a,b,c);else indices.push(c,b,a);
      }
    }
  };
  const block=(width,depth,bottom,top,x=0,z=0,chamfer=0)=>{
    const outline=rectangle(width,depth,chamfer).map(([px,pz])=>[px+x,pz+z]);
    shell([{y:bottom,outline},{y:top,outline}]);
  };
  if(design.shape==='brown-slab'){
    block(w,d,0,h*.88);
    block(w*.93,d*.88,h*.88,h*.94);
    block(w*.55,d*.62,h*.94,h,-w*.06,-d*.09);
  }else if(design.shape==='white-hotel'){
    block(w*.54,d,0,h,-w*.16);
    block(w*.22,d*.83,0,h*.975,w*.22);
    block(w*.08,d*.92,0,h*.84,w*.45);
  }else if(design.shape==='tapered-crown'){
    shell(referenceTowerRings(spec));
    block(w*.25,d*.25,h*.97,h,w*.05,-d*.12);
  }else if(design.shape==='rounded-tower'){
    shell(referenceTowerRings(spec));
  }else if(design.shape==='sloped-crown'){
    shell([{y:0,outline:rectangle(w,d,.05)},{y:h*.86,outline:rectangle(w,d,.05)},
      {y:x=>h*(.955+.09*x/w),outline:rectangle(w,d,.05)}]);
  }else if(design.shape==='dark-crown'){
    block(w,d,0,h*.92,0,0,.025);
    block(w*.86,d*.9,h*.92,h,0,-d*.01,.025);
  }else{
    block(w,d,0,h*.86);
    block(w*.26,d*.64,h*.86,h,w*.17,0);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  const flat=geometry.toNonIndexed();geometry.dispose();
  flat.computeVertexNormals();
  flat.rotateY(spec.yaw);
  const uv=new Float32Array(flat.attributes.position.count*2);
  flat.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  flat.setIndex(Array.from({length:flat.attributes.position.count},(_,index)=>index));
  flat.computeBoundingBox();flat.computeBoundingSphere();
  return {geometry:flat,position:new THREE.Vector3(spec.x,CITY_GROUND,spec.z),size:new THREE.Vector3(1,1,1)};
}

export function decorateReferenceBuilding(parent,spec,uniforms){
  const design=REFERENCE_BUILDINGS[spec.id],root=new THREE.Group();
  root.name=design.label;root.position.set(spec.x,CITY_GROUND,spec.z);root.rotation.y=spec.yaw;parent.add(root);
  const batch=new CityBatch(root),{width:w,depth:d,height:h}=spec;
  const trim=new THREE.MeshStandardMaterial({color:design.shape==='brown-slab'?0x734d42:0xb3b8ad,roughness:.68,metalness:.24});
  const dark=new THREE.MeshStandardMaterial({color:0x3d4e52,roughness:.5,metalness:.36});
  const white=new THREE.MeshStandardMaterial({color:0xdfdecb,roughness:.84,metalness:.03});
  const light=new THREE.MeshStandardMaterial({color:0xa3936e,emissive:design.light,emissiveIntensity:1,roughness:.56});
  light.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{cityNight:uniforms.cityNight,cityWindows:uniforms.cityWindows});
    shader.fragmentShader='uniform float cityNight;uniform float cityWindows;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=cityNight*cityWindows*.65;');
  };
  light.customProgramCacheKey=()=> 'reference-building-strip-light-v1';
  if(design.shape==='white-hotel'){
    batch.box(white,[-w*.26,h*.51,d*.501],[w*.23,h*.98,.09],0,null,true);
    batch.box(white,[w*.05,h*.505,d*.503],[w*.07,h*.97,.12],0,null,true);
    for(let y=h/spec.floors;y<h*.96;y+=h/spec.floors){
      batch.box(trim,[-w*.15,y,d*.504],[w*.53,.055,.1]);
      batch.box(light,[w*.2,y+.15,d*.416],[w*.12,.22,.035]);
    }
    batch.box(dark,[-w*.15,h+.025,0],[w*.52,.05,d*.96]);
  }else if(design.shape==='brown-slab'){
    for(let y=h/spec.floors;y<h*.88;y+=h/spec.floors){
      for(const sign of [-1,1])batch.box(trim,[0,y,sign*(d/2+.025)],[w,.1,.1]);
    }
    for(let i=0;i<12;i++)batch.box(trim,[(i/11-.5)*w,h*.435,d*.502],[.07,h*.87,.07]);
    batch.box(dark,[0,h*.942,0],[w*.91,.055,d*.86]);
    for(const x of [-w*.42,w*.42])batch.box(trim,[x,h*.97,0],[.05,h*.05,d*.82]);
  }else if(design.shape==='rounded-tower'){
    for(let floor=1;floor<spec.floors;floor++){
      const ring=referenceRingAt(spec,floor/spec.floors*h);
      for(let i=0;i<ring.length;i++)batch.beam(trim,ring[i],ring[(i+1)%ring.length],.04);
    }
  }else if(design.shape==='sloped-crown'){
    for(const fraction of [.43,.73,.87]){
      batch.box(dark,[0,h*fraction,d*.502],[w*.89,.36,.03]);
      batch.box(light,[0,h*fraction+.15,d*.505],[w*.88,.036,.036]);
    }
    for(let x=-w*.45;x<=w*.45;x+=.72)batch.box(trim,[x,h*.44,d*.502],[.026,h*.88,.036]);
  }else if(design.shape==='tapered-crown'){
    for(const [from,to]of referenceCrownBeams(spec))batch.beam(trim,from,to,.06);
    const lower=referenceRingAt(spec,h*.82),upper=referenceRingAt(spec,h*.93);
    for(let x=-w*.29;x<=w*.29;x+=.75)batch.beam(dark,[x,h*.82,lower[0][2]],[x,h*.93,upper[0][2]],.022);
    batch.box(dark,[w*.05,h+.04,-d*.12],[w*.27,.08,d*.27]);
  }else if(design.shape==='dark-crown'){
    for(let x=-w*.39;x<=w*.39;x+=.55)batch.box(dark,[x,h*.96,d*.454],[.09,h*.075,.055]);
    for(const x of [-w*.32,w*.32])batch.beam(trim,[x,h,-d*.22],[x,h+.6,-d*.22],.024);
  }else{
    for(let y=h/spec.floors;y<h*.86;y+=h/spec.floors)batch.box(trim,[0,y,d*.503],[w,.055,.06]);
    batch.box(light,[w*.17,h*.957,d*.324],[w*.21,h*.075,.07]);
  }
  batch.finish();
  const used=new Set(root.children.map(mesh=>mesh.material));
  for(const material of [trim,dark,white,light])if(!used.has(material))material.dispose();
  return root;
}
