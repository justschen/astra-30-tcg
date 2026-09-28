import * as THREE from 'three';
import { CITY_GROUND } from './city-layout.js';
import { citySeed } from './city-life.js';

export const MASSING_KINDS=['service-slab','side-setback','rear-setback','terraced','shoulder-core','slant-cut','courtyard'];

export function authoredBuildingTiers(spec){
  const count=spec.stepped?4:1;
  return Array.from({length:count},(_,tier)=>({
    center:[spec.x-tier*spec.width*.028,CITY_GROUND+spec.height*(tier+.5)/count,spec.z+tier*spec.depth*.045],
    width:spec.width*(1-tier*.12),depth:spec.depth*(1-tier*.12),height:spec.height/count,
    floors:Math.max(1,Math.round(spec.floors/count)),
  }));
}

export function buildingMassing(spec){
  if(spec.surveyed||spec.hero||spec.stepped||spec.pitched||spec.width<1.45||spec.depth<1.5)return null;
  const seed=citySeed(spec.id),w=spec.width,d=spec.depth,h=spec.height,floors=spec.floors;
  const choice=seed%20;
  let kind=choice<5?'service-slab':choice<9?'side-setback':choice<12?'rear-setback':choice<14?'terraced':choice<16?'shoulder-core':choice<18?'slant-cut':'courtyard';
  if(floors<5&&['terraced','courtyard'].includes(kind))kind='side-setback';
  const preserveSigns=spec.x>47&&spec.x<135&&spec.z< -32&&spec.z> -135&&h>4.5&&w>2.2;
  const upperFloors=Math.max(0,Math.min(floors-2,preserveSigns?Math.floor(floors*.12):Math.max(1,Math.min(4,Math.round(floors*.23)))));
  if(!upperFloors)kind='service-slab';
  else if(kind==='terraced'&&upperFloors<2)kind='rear-setback';
  const lower=h*(floors-upperFloors)/floors,upper=h-lower,sign=seed&32?1:-1;
  const parts=[],roofs=[];
  const part=(x,z,width,depth,bottom,height,shape='box')=>{
    parts.push({x,z,width,depth,bottom,height,floors:Math.max(1,Math.round(height/h*floors)),shape});
  };
  const roof=(x,z,width,depth,y,edges=['left','right','front','back'])=>{
    if(width>.2&&depth>.2)roofs.push({x,z,width,depth,y,edges});
  };
  if(kind==='service-slab'){
    part(0,0,w,d,0,h);roof(0,0,w,d,h);
  }else{
    part(0,0,w,d,0,lower);
    if(kind==='side-setback'){
      const share=.56+((seed>>>8)%19)/100,coreX=sign*w*(1-share)/2;
      part(coreX,0,w*share,d,lower,upper);
      roof(coreX,0,w*share,d,h);
      roof(-sign*w*share/2,0,w*(1-share),d,lower,[sign>0?'left':'right','front','back']);
    }else if(kind==='rear-setback'){
      const share=.49+((seed>>>11)%23)/100,coreZ=-d*(1-share)/2;
      part(0,coreZ,w,d*share,lower,upper);
      roof(0,coreZ,w,d*share,h);
      roof(0,d*share/2,w,d*(1-share),lower,['left','right','front']);
    }else if(kind==='terraced'){
      const middleFloors=Math.max(1,Math.floor(upperFloors/2)),middle=h*middleFloors/floors;
      part(0,-d*.1,w,d*.8,lower,middle);
      part(sign*w*.12,-d*.23,w*.76,d*.54,lower+middle,upper-middle);
      roof(sign*w*.12,-d*.23,w*.76,d*.54,h);
      roof(-sign*w*.38,-d*.23,w*.24,d*.54,lower+middle,[sign>0?'left':'right','back']);
      roof(0,d*.17,w,d*.26,lower+middle,['left','right','front']);
      roof(0,d*.4,w,d*.2,lower,['left','right','front']);
    }else if(kind==='shoulder-core'){
      const widthShare=.39+((seed>>>7)%16)/100,depthShare=.55+((seed>>>13)%19)/100;
      const coreX=sign*w*(.47-widthShare/2),coreZ=-d*(1-depthShare)/2;
      part(coreX,coreZ,w*widthShare,d*depthShare,lower,upper);
      roof(coreX,coreZ,w*widthShare,d*depthShare,h);
      roof(-sign*w*(widthShare+.03)/2,0,w*(.97-widthShare),d,lower,[sign>0?'left':'right','front','back']);
      roof(coreX,d*depthShare/2,w*widthShare,d*(1-depthShare),lower,['front',sign>0?'right':'left']);
    }else if(kind==='slant-cut'){
      part(-w*.175,0,w*.65,d*.82,lower,upper,'shed');
      part(w*.335,-d*.19,w*.27,d*.62,lower,upper);
      roof(w*.335,-d*.19,w*.27,d*.62,h);
      roof(w*.335,d*.31,w*.27,d*.38,lower,['front','right']);
      roof(0,d*.455,w,d*.09,lower,['front']);
    }else{
      const backShare=.29+((seed>>>6)%16)/100,sideShare=.27+((seed>>>14)%14)/100;
      const backZ=-d*(1-backShare)/2,wingZ=d*backShare/2,wingX=sign*w*(1-sideShare)/2;
      part(0,backZ,w,d*backShare,lower,upper);
      part(wingX,wingZ,w*sideShare,d*(1-backShare),lower,upper);
      roof(0,backZ,w,d*backShare,h,['back','left','right']);
      roof(wingX,wingZ,w*sideShare,d*(1-backShare),h,[sign>0?'right':'left','front']);
      roof(-sign*w*sideShare/2,wingZ,w*(1-sideShare),d*(1-backShare),lower,['front',sign>0?'left':'right']);
    }
  }
  roofs.sort((a,b)=>b.y-a.y||b.width*b.depth-a.width*a.depth);
  return {kind,seed,parts,roofs};
}

export function massingGeometry(shape){
  if(!['box','shed'].includes(shape))throw new RangeError('Unsupported shared building geometry.');
  const geometry=new THREE.BoxGeometry(1,1,1);
  if(shape==='shed'){
    const points=geometry.attributes.position;
    for(let i=0;i<points.count;i++)if(points.getY(i)>0&&points.getZ(i)>0)points.setY(i,-.16);
    geometry.computeVertexNormals();
  }
  return geometry;
}

export function buildingLocalPoint(spec,x,z,y=0){
  const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
  return [spec.x+x*c+z*s,CITY_GROUND+y,spec.z-x*s+z*c];
}

export function roofFixtureAnchor(spec,width=.2,depth=.2){
  const form=buildingMassing(spec);
  if(!form)return {x:spec.x,z:spec.z,y:CITY_GROUND+spec.height,width:spec.width,depth:spec.depth,yaw:spec.yaw};
  const surface=form.roofs.find(roof=>roof.width>=width+.1&&roof.depth>=depth+.1);
  if(!surface)throw new Error(`No supported rooftop fixture space on ${spec.id}.`);
  const [x,y,z]=buildingLocalPoint(spec,surface.x,surface.z,surface.y);
  return {x,y,z,width:surface.width,depth:surface.depth,yaw:spec.yaw};
}

export function roofSignPosts(roof,width){
  const c=Math.cos(roof.yaw),s=Math.sin(roof.yaw);
  return [-1,1].map(side=>{
    const dx=side*width*.38,x=roof.x+dx*c,z=roof.z-dx*s;
    return [[x,roof.y,z],[x,roof.y+.16,z]];
  });
}

export function rooftopAssemblies(spec,form=buildingMassing(spec)){
  if(!form||spec.distant)return [];
  const placements=[],primary=form.roofs[0],seed=form.seed,layout=seed%5;
  const construction=spec.x>60&&spec.x<170&&spec.z< -75&&spec.z> -190&&spec.width>4&&spec.depth>4;
  const reserved=(spec.x>47&&spec.x<170&&spec.z< -32&&spec.z> -190)||(spec.height>20&&Math.abs(spec.x)<300&&spec.z< -80&&spec.z> -650);
  const fixtureSize=construction?.85:.2;
  const fixture=reserved?roofFixtureAnchor(spec,fixtureSize,fixtureSize):null;
  const fitted=(kind,roof,dx,dz,width,depth,height)=>{
    const x=roof.x+dx,z=roof.z+dz;
    if(width+.14>roof.width||depth+.14>roof.depth||Math.abs(dx)+width/2>roof.width/2-.06||Math.abs(dz)+depth/2>roof.depth/2-.06)return;
    const point=buildingLocalPoint(spec,x,z,roof.y);
    if(fixture&&Math.abs(point[0]-fixture.x)<width/2+.56&&Math.abs(point[2]-fixture.z)<depth/2+.56)return;
    if(placements.some(other=>other.roof===roof&&Math.abs(other.x-x)<(other.width+width)/2+.08&&Math.abs(other.z-z)<(other.depth+depth)/2+.08))return;
    placements.push({kind,roof,x,z,y:roof.y,width,depth,height});
  };
  for(const [index,roof]of form.roofs.entries()){
    if(index>1||roof.width<.8||roof.depth<.8)continue;
    const sideX=seed&128?1:-1,sideZ=seed&256?1:-1;
    if(index===0){
      const accessW=Math.min(1.2,roof.width*.28),accessD=Math.min(1.3,roof.depth*.34);
      fitted('stair-core',roof,-sideX*roof.width*(.22+((seed>>>5)%4)*.02),-sideZ*roof.depth*(.2+((seed>>>9)%3)*.02),accessW,accessD,.45+(seed%7)*.085);
    }
    const x=sideX*roof.width*(.17+((seed>>>12)%4)*.02),z=sideZ*roof.depth*(.13+((seed>>>15)%4)*.02);
    if(layout===0&&index===0)fitted('plant-screen',roof,x,z,Math.min(2.2,roof.width*.49),Math.min(1.6,roof.depth*.45),.42);
    else if(layout===1&&index===0)fitted('water-tank',roof,x,z,Math.min(.85,roof.width*.3),Math.min(.85,roof.depth*.3),.95);
    else if(layout===2)fitted('plant-bank',roof,x,z,Math.min(2.5,roof.width*.46),Math.min(1.15,roof.depth*.36),.27);
    else if(layout===3&&index===0)fitted('lift-overrun',roof,x,z,Math.min(1.6,roof.width*.39),Math.min(1.5,roof.depth*.4),.8);
    else fitted('vent-rack',roof,x,z,Math.min(1.3,roof.width*.39),Math.min(1.4,roof.depth*.39),.22);
  }
  if(!placements.length&&primary.width>.7&&primary.depth>.7)fitted('vent-rack',primary,-primary.width*.26,primary.depth*.2,primary.width*.23,primary.depth*.24,.2);
  return placements;
}

export function dressBuildingRoofs(batch,spec,materials,form){
  if(spec.distant)return;
  const world=(x,z,y)=>buildingLocalPoint(spec,x,z,y);
  const near=spec.z> -150&&Math.abs(spec.x)<180;
  for(const [index,roof]of form.roofs.entries()){
    if(roof.width<.38||roof.depth<.38)continue;
    const h=.11+(form.seed%4)*.025;
    const edges=(form.seed+index)%5===0?roof.edges.filter(edge=>edge!=='front'):roof.edges;
    for(const edge of edges){
      const alongX=edge==='front'||edge==='back';
      const x=roof.x+(edge==='left'?-1:edge==='right'?1:0)*(roof.width/2-.025);
      const z=roof.z+(edge==='back'?-1:edge==='front'?1:0)*(roof.depth/2-.025);
      batch.box((form.seed%3===0)?materials.dark:materials.stone,world(x,z,roof.y+h/2),[alongX?roof.width:.045,h,alongX?.045:roof.depth],spec.yaw);
    }
  }
  for(const item of rooftopAssemblies(spec,form))drawRoofAssembly(batch,spec,item,materials,near);
}

export function drawRoofAssembly(batch,spec,item,materials,shadows=false){
    const {kind,x,z,y,width:w,depth:d,height:h}=item;
    const at=(dx,dz,dy)=>buildingLocalPoint(spec,x+dx,z+dz,y+dy);
    if(kind==='water-tank'){
      const radius=Math.min(w,d)*.39;
      for (const dx of [-radius*.58,radius*.58])for(const dz of [-radius*.58,radius*.58]){
        batch.beam(materials.dark,at(dx,dz,0),at(dx,dz,.28),.028);
      }
      batch.add('cylinder',materials.mechanical,at(0,0,.28+h*.36),[radius,h*.72,radius],null,null,shadows);
      batch.add('cylinder',materials.roof,at(0,0,.28+h*.73),[radius*1.05,.04,radius*1.05]);
      batch.beam(materials.mechanical,at(radius*.75,0,.29),at(radius*.75,0,.07),.025);
    }else if(kind==='stair-core'||kind==='lift-overrun'){
      batch.box(materials.stone,at(0,0,h/2),[w,h,d],spec.yaw,null,shadows);
      batch.box(materials.roof,at(0,0,h+.025),[w+.045,.05,d+.045],spec.yaw);
      batch.box(materials.dark,at(0,d/2+.006,h*.4),[w*.38,h*.7,.015],spec.yaw);
      for(let vent=0;vent<4;vent++)batch.box(materials.mechanical,at(-w*.3+vent*w*.12,d/2+.017,h*.78),[w*.065,h*.1,.012],spec.yaw);
    }else{
      const count=Math.max(1,Math.min(4,Math.floor(w/.48)));
      batch.box(materials.dark,at(0,0,.035),[w,.07,d],spec.yaw);
      for(let i=0;i<count;i++){
        const dx=((i+.5)/count-.5)*w,unitW=w/count*.82;
        batch.box(materials.mechanical,at(dx,0,h/2+.07),[unitW,h,d*.64],spec.yaw,null,shadows);
        batch.add('cylinder',materials.dark,at(dx,0,h+.077),[Math.min(unitW,d)*.27,.022,Math.min(unitW,d)*.27]);
        for(let louver=0;louver<4;louver++)batch.box(materials.roof,at(dx,-d*.24+louver*d*.16,h+.1),[unitW*.86,.015,.018],spec.yaw);
      }
      if(kind==='plant-screen')for(const sign of [-1,1]){
        for(let slat=0;slat<4;slat++)batch.box(materials.dark,at(0,sign*d*.48,.13+slat*.12),[w,.025,.025],spec.yaw);
        for(const end of [-1,1])batch.beam(materials.mechanical,at(end*w*.46,sign*d*.48,.04),at(end*w*.46,sign*d*.48,.56),.015);
      }
      batch.box(materials.mechanical,at(0,-d*.37,.14),[w*.8,.14,.12],spec.yaw);
  }
}
