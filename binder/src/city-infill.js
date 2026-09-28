import * as THREE from 'three';
import { CITY_GROUND, PARK, SIDE_PARKS, TEMPLE_COURT } from './city-layout.js';
import { overlapsBuilding } from './city-survey-layout.js';
import { RoadSurfaceIndex } from './city-roads.js';
import { CityBatch } from './city-materials.js';
import { random } from './materials.js';

export const INFILL_BOUNDS = Object.freeze({left:-164,right:164,near:-12,far:-165});

export function buildingFootprint(spec){
  const cosine=Math.abs(Math.cos(spec.yaw??0)),sine=Math.abs(Math.sin(spec.yaw??0));
  return {...spec,width:spec.width*cosine+spec.depth*sine,depth:spec.depth*cosine+spec.width*sine};
}

export class PlotIndex {
  constructor(specs) { this.cells=new Map();for(const spec of specs)this.add(spec); }
  cellsFor(spec,margin=0){
    const cells=[];
    for(let x=Math.floor((spec.x-spec.width/2-margin)/8);x<=Math.floor((spec.x+spec.width/2+margin)/8);x++)
      for(let z=Math.floor((spec.z-spec.depth/2-margin)/8);z<=Math.floor((spec.z+spec.depth/2+margin)/8);z++)cells.push(`${x}:${z}`);
    return cells;
  }
  add(spec){for(const key of this.cellsFor(spec)){if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(spec);}}
  occupied(spec,margin){return this.cellsFor(spec,margin).some(key=>(this.cells.get(key)||[]).some(other=>overlapsBuilding(spec,other,margin)));}
}

const reserved = [
  {x:(PARK.left+PARK.right)/2,z:(PARK.near+PARK.far)/2,width:PARK.right-PARK.left,depth:PARK.near-PARK.far},
  {x:(TEMPLE_COURT.left+TEMPLE_COURT.right)/2,z:(TEMPLE_COURT.near+TEMPLE_COURT.far)/2,width:TEMPLE_COURT.right-TEMPLE_COURT.left,depth:TEMPLE_COURT.near-TEMPLE_COURT.far},
  ...SIDE_PARKS.map(park=>({...park,width:park.width+2,depth:park.depth+2})),
];

export function createCityInfill(specs,roads){
  const index=new PlotIndex([...specs.map(buildingFootprint),...reserved]),surfaces=new RoadSurfaceIndex(roads);
  const rng=random(196422),buildings=[],yards=[],parking=[];
  const colors=[0xb8b4a2,0x9caeb1,0xaca493,0x999c9c,0xb9b6ae,0xa0aea4,0xb49c8c,0x97a6b2];
  for(let row=0,z=INFILL_BOUNDS.near-3;z>INFILL_BOUNDS.far;row++,z-=3.7){
    for(let column=0,x=INFILL_BOUNDS.left+3;x<INFILL_BOUNDS.right-3;column++,x+=3.65){
      const px=x+(rng()-.5)*.6,pz=z+(rng()-.5)*.6;
      for(const [width,depth]of [[4.8,5.1],[3.7,4.2],[2.5,3.1]]){
        const plot={x:px,z:pz,width,depth};
        if(index.occupied(plot,.33)||surfaces.intersectsPlot(plot,1.08))continue;
        index.add(plot);
        const yard=width>3&&yards.length<54&&rng()<.14;
        if(yard){
          yards.push({...plot,id:`service-court-${row}-${column}`});
          for(let bay=0;bay<3;bay++)parking.push({x:px-width*.29+bay*.71,z:pz-depth*.21,yaw:0,size:bay%2?.94:1.06});
        }else{
          const floors=pz> -36?4+Math.floor(rng()*4):6+Math.floor(rng()*8);
          buildings.push({...plot,id:`block-infill-${row}-${column}`,height:floors*.78,floors,
            color:colors[Math.floor(rng()*colors.length)],style:rng()>.48?'residential':'office',
            yaw:0,hero:false,blockInfill:true});
        }
        break;
      }
    }
  }
  return {buildings,yards,parking};
}

export function createInfillDetails(parent,infill,materials){
  const group=new THREE.Group();group.name='Dense neighborhood service courts and pocket gardens';parent.add(group);
  const batch=new CityBatch(group);
  const gravel=new THREE.MeshStandardMaterial({color:0x70736d,roughness:.96});
  const paving=new THREE.MeshStandardMaterial({color:0x9a9c92,roughness:.87,metalness:.01});
  const steel=new THREE.MeshStandardMaterial({color:0x515d61,roughness:.48,metalness:.5});
  for(const [i,yard]of infill.yards.entries()){
    const {x,z,width,depth}=yard;
    batch.box(gravel,[x,CITY_GROUND+.015,z],[width,.02,depth]);
    for(const side of [-1,1]){
      batch.box(paving,[x+side*(width/2-.045),CITY_GROUND+.075,z],[.08,.12,depth]);
      batch.beam(steel,[x+side*(width/2-.04),CITY_GROUND+.08,z+depth/2],[x+side*(width/2-.04),CITY_GROUND+.55,z+depth/2],.024);
    }
    for(let bay=0;bay<3;bay++){
      const px=x-width*.29+bay*.71;
      for(const sign of [-1,1])batch.box(materials.marking,[px+sign*.29,CITY_GROUND+.037,z-depth*.21],[.021,.006,1.15]);
      batch.box(paving,[px,CITY_GROUND+.07,z-depth*.21-.61],[.38,.1,.08]);
    }
    batch.box(steel,[x+width*.3,CITY_GROUND+.27,z+depth*.3],[.48,.52,.32]);
    if(i%2===0){
      batch.box(paving,[x-width*.3,CITY_GROUND+.16,z+depth*.28],[.72,.3,.65]);
      batch.beam(materials.dark,[x-width*.3,CITY_GROUND+.3,z+depth*.28],[x-width*.3,CITY_GROUND+1.35,z+depth*.28],.045);
      batch.add('foliage',materials.grass,[x-width*.3,CITY_GROUND+1.4,z+depth*.28],[.65,.68,.6]);
    }
    batch.box(steel,[x,CITY_GROUND+.055,z+depth*.44],[.55,.02,.14]);
    for(let grate=0;grate<7;grate++)batch.box(paving,[x-.23+grate*.077,CITY_GROUND+.068,z+depth*.44],[.018,.01,.13]);
  }
  batch.finish();
  group.userData.serviceCourts=infill.yards.length;group.userData.parkedCars=infill.parking.length;
  return group;
}
