import * as THREE from 'three';
import { CITY_GROUND } from './city-layout.js';
import { CityBatch } from './city-materials.js';
import { canvasTexture } from './materials.js';
import { streetFrontage, surveyAttachments } from './city-streetscape.js';
import { BALCONY_CAMERA } from './room-extras.js';
import { STREET_SCREEN_BUILDINGS } from './city-life.js';
import { buildingLocalPoint, buildingMassing, roofFixtureAnchor, roofSignPosts } from './building-massing.js';

const LABELS=[
  ['SORA','RECORDS','#53c6de'],['PLAY','NIGHT ARCADE','#ee668d'],['24','MINI MARKET','#f3db89'],
  ['KISSA','COFFEE & LATE SETS','#82c6b0'],['RAMEN','OPEN TILL LATE','#ed8a50'],['NEON','BOOKS & FILM','#b295de'],
];
export const SCREEN_COLORS=[0x4cd6e8,0xf16a9a,0xf0ce69,0x9ecbb4];
export function screenState(time,index){
  const position=time/11+index*.7,frame=((Math.floor(position)%4)+4)%4;
  const t=Math.min(1,Math.max(0,((position%1+1)%1-.8)*5));
  return {frame,next:(frame+1)%4,blend:t*t*(3-2*t)};
}

export function visibleScreenMount(spec,surfaces,host){
  host.updateWorldMatrix(true,false);
  const ray=new THREE.Raycaster(),cameras=[[0,3.05,5.9],BALCONY_CAMERA];
  for(const mount of surveyAttachments(spec,surfaces.filter(surface=>surface.normal.z>.3),{
    x:spec.x,y:CITY_GROUND+spec.height*.62,z:spec.z+spec.depth/2,width:Math.min(spec.width*.83,3.3),height:1.8,
  })){
    const c=Math.cos(mount.yaw),s=Math.sin(mount.yaw);
    const visible=cameras.every(camera=>{
      const eye=new THREE.Vector3(...camera);
      return [-.44,0,.44].every(x=>[-.44,0,.44].every(y=>{
        const point=new THREE.Vector3(mount.x+x*mount.width*c,mount.y+y*mount.height,mount.z-x*mount.width*s);
        const direction=point.sub(eye),distance=direction.length();
        ray.set(eye,direction.normalize());ray.far=distance-.015;
        return ray.intersectObject(host,false).length===0;
      }));
    });
    if(visible&&mount.width>=1.8)return mount;
  }
  return null;
}

export function createRoofCrane(batch,spec,index,steel,frame){
  const roof=roofFixtureAnchor(spec,.85,.85),height=9+index*2,yaw=roof.yaw+(index?-.24:.18);
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const world=(x,y,z)=>[roof.x+x*c+z*s,roof.y+.04+y,roof.z-x*s+z*c];
  const beam=(material,a,b,radius)=>batch.beam(material,world(...a),world(...b),radius);
  const block=(material,point,size)=>batch.box(material,world(...point),size,yaw);
  for(const x of [-.4,.4])for(const z of [-.4,.4]){
    block(frame,[x,.07,z],[.13,.14,.13]);
    beam(steel,[x,.14,z],[x,height,z],.049);
  }
  const levels=Math.ceil(height);
  for(let level=0;level<=levels;level++){
    const y=level/levels*height;
    for(const side of [-.4,.4]){
      beam(steel,[-.4,y,side],[.4,y,side],.027);
      beam(steel,[side,y,-.4],[side,y,.4],.027);
      if(level<levels){
        const next=(level+1)/levels*height,sign=level%2?1:-1;
        beam(steel,[sign*.4,y,side],[-sign*.4,next,side],.027);
        beam(steel,[side,y,sign*.4],[side,next,-sign*.4],.027);
      }
    }
  }
  beam(frame,[0,height-.22,0],[0,height+.16,0],.54);
  block(steel,[0,height+.19,0],[1.72,.14,1.48]);
  const lower=height+.44,upper=height+1.14;
  for(const x of [-.4,.4])for(const z of [-.36,.36])beam(steel,[x,height+.19,z],[x,lower,z],.041);
  for(let arm=-4;arm<13;arm++){
    for(const z of [-.36,.36]){
      beam(steel,[arm,lower,z],[arm+1,lower,z],.046);
      beam(steel,[arm,lower,z],[arm+1,upper,0],.029);
      beam(steel,[arm,lower,z],[arm,upper,0],.027);
    }
    beam(steel,[arm,upper,0],[arm+1,upper,0],.046);
    beam(steel,[arm,lower,-.36],[arm,lower,.36],.027);
  }
  for(const z of [-.36,.36])beam(steel,[13,lower,z],[13,upper,0],.029);
  beam(steel,[13,lower,-.36],[13,lower,.36],.027);
  beam(steel,[0,height+.25,0],[0,height+2.68,0],.056);
  for(const x of [-3.45,7.8])beam(frame,[0,height+2.68,0],[x,upper,0],.022);
  block(steel,[-.92,height-.41,.53],[.91,.95,.78]);
  block(frame,[-.92,height-.32,.933],[.72,.59,.027]);
  block(frame,[-1.392,height-.32,.53],[.023,.59,.6]);
  block(frame,[-.92,height-.90,.53],[1.06,.08,.91]);
  block(steel,[-1.75,lower+.23,0],[1.05,.46,.7]);
  for(const x of [-3.55,-3.15,-2.75])block(frame,[x,lower+.39,0],[.34,.78,.94]);
  block(frame,[10,lower-.13,0],[.72,.18,.9]);
  for(const z of [-.09,.09])beam(frame,[10,lower-.2,z],[10,height-4.55,z],.017);
  beam(frame,[10,height-4.55,-.1],[10,height-4.55,.1],.14);
  beam(frame,[10,height-4.67,0],[10,height-4.79,0],.035);
  const hook=angle=>[10+.095-Math.cos(angle)*.095,height-4.8-Math.sin(angle)*.12,0];
  for(let i=0;i<9;i++)beam(frame,hook(i*Math.PI/9),hook((i+1)*Math.PI/9),.025);
  return {host:spec.id,roof,height,yaw,beacons:[world(0,height+2.72,0),world(13,upper+.08,0),world(-4,upper+.08,0)]};
}

export function createNeonDistrict(parent,specs,facades,uniforms,meshes){
  const root=new THREE.Group();root.name='East-side neon shopping blocks, animated signs and construction cranes';parent.add(root);
  const batch=new CityBatch(root),frame=new THREE.MeshStandardMaterial({color:0x334048,roughness:.53,metalness:.47});
  const signs=LABELS.map(([title,subtitle,color],index)=>{
    const map=canvasTexture(256,512,(ctx,w,h)=>{
      ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.fillStyle='#11242e';ctx.fillRect(11,11,w-22,h-22);
      ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(20,20,w-40,h-40);
      ctx.fillStyle=color;ctx.textAlign='center';ctx.font='700 62px Manrope,sans-serif';
      [...title].forEach((letter,i)=>ctx.fillText(letter,w/2,86+i*66));
      ctx.fillStyle='#ecebda';ctx.font='700 18px Manrope,sans-serif';
      subtitle.split(' & ').forEach((line,i)=>ctx.fillText(line,w/2,420+i*23,218));
      ctx.font='14px Manrope,sans-serif';ctx.fillText(`${index+2}F / EVERY NIGHT`,w/2,474);
    });
    return new THREE.MeshStandardMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:1.6,roughness:.5});
  });
  const wideSigns=LABELS.map(([title,subtitle,color])=>{
    const map=canvasTexture(512,176,(ctx,w,h)=>{
      ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.fillStyle='#10242e';ctx.fillRect(10,10,w-20,h-20);
      ctx.fillStyle=color;ctx.font='700 69px Manrope,sans-serif';ctx.textAlign='center';ctx.fillText(title,w/2,92,w-30);
      ctx.fillStyle='#f0ecd9';ctx.font='700 22px Manrope,sans-serif';ctx.fillText(subtitle,w/2,138,w-30);
    });
    return new THREE.MeshStandardMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:1.5,roughness:.5});
  });
  const tubes=LABELS.map(([, ,color])=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.8}));
  const doors=LABELS.map(([, ,color])=>new THREE.MeshStandardMaterial({color:0x38464b,roughness:.22,metalness:.18,emissive:color,emissiveIntensity:.14}));
  const candidates=specs.filter(spec=>!spec.surveyed&&!spec.stepped&&!spec.pitched&&spec.x>47&&spec.x<135&&spec.z< -32&&spec.z> -135&&spec.height>4.5&&spec.width>2.2)
    .map(spec=>({spec,front:streetFrontage(spec)})).filter(item=>item.front.distance<8).sort((a,b)=>a.front.distance-b.front.distance).slice(0,30);
  const sources=[];
  for(const [index,{spec,front}]of candidates.entries()){
    const {x,z,yaw}=front,c=Math.cos(yaw),s=Math.sin(yaw),position=(u,y,v=.08)=>[x+u*c+v*s,CITY_GROUND+y,z-u*s+v*c];
    const form=buildingMassing(spec),facadeHeight=form?form.parts[0].height:spec.height;
    const total=Math.min(3,Math.max(1,Math.floor(front.width/.9)));
    for(let sign=0;sign<total;sign++){
      const at=(sign-(total-1)/2)*front.width/total,width=Math.min(.84,front.width/total*.82),height=Math.min(facadeHeight-1.65,3.8+(index%4)*.8);
      const center=position(at,height/2+1.4,.11);
      batch.box(frame,center,[width+.07,height+.08,.14],yaw);
      batch.box(signs[(index+sign)%signs.length],position(at,height/2+1.4,.19),[width,height,.02],yaw);
      if(sign===0)sources.push({position:center,color:new THREE.Color(LABELS[index%LABELS.length][2]),strength:.65});
    }
    const trim=tubes[index%tubes.length];
    for(const y of [.65,1.28,Math.min(facadeHeight-.2,6.6)]){
      batch.box(trim,position(0,y,.1),[front.width*.92,.06,.08],yaw);
    }
    batch.box(doors[index%doors.length],position(0,.62,.1),[front.width*.75,1.15,.035],yaw);
    for(const [level,fraction]of [.3,.55,.79].entries()){
      const w=spec.width*.78,h=Math.min(1.15,facadeHeight*.13),y=facadeHeight*fraction;
      batch.box(frame,buildingLocalPoint(spec,0,spec.depth/2+.07,y),[w+.08,h+.08,.08],spec.yaw);
      batch.box(wideSigns[(index+level)%wideSigns.length],buildingLocalPoint(spec,0,spec.depth/2+.121,y),[w,h,.02],spec.yaw);
    }
    const roof=roofFixtureAnchor(spec),capWidth=Math.min(spec.width*.72,roof.width*.8),capHeight=Math.min(1.25,capWidth*.34);
    batch.box(frame,[roof.x,roof.y+capHeight/2+.15,roof.z],[capWidth+.09,capHeight+.09,.15],roof.yaw);
    batch.box(wideSigns[(index+3)%wideSigns.length],[roof.x+Math.sin(roof.yaw)*.081,roof.y+capHeight/2+.15,roof.z+Math.cos(roof.yaw)*.081],[capWidth,capHeight,.018],roof.yaw);
    for(const [from,to]of roofSignPosts(roof,capWidth))batch.beam(frame,from,to,.02);
    for(const side of [-1,1])batch.box(trim,buildingLocalPoint(spec,side*spec.width*.46,spec.depth/2+.07,facadeHeight*.47),[.035,facadeHeight*.92,.06],spec.yaw);
  }
  const beaconPositions=[];
  const craneBuildings=specs.filter(spec=>!spec.surveyed&&!spec.hero&&!spec.stepped&&!spec.pitched&&spec.x>60&&spec.x<170&&spec.z< -75&&spec.z> -190&&spec.width>4&&spec.depth>4)
    .sort((a,b)=>b.height-a.height).slice(0,2);
  const yellow=new THREE.MeshStandardMaterial({color:0xcdbb86,roughness:.63,metalness:.27});
  const craneSites=[];
  for(const [i,spec]of craneBuildings.entries()){
    const crane=createRoofCrane(batch,spec,i,yellow,frame);
    craneSites.push(crane);beaconPositions.push(...crane.beacons);
  }
  batch.finish();

  const atlas=canvasTexture(1024,576,(ctx,w,h)=>{
    for(const [index,[title,subtitle,color]]of [
      ['MIDNIGHT','A DIFFERENT SIDE OF TOKYO','#4cd6e8'],['AFTERGLOW','SOUND / CULTURE / LATE COFFEE','#f16a9a'],
      ['LAST TRAIN','MAKE A LITTLE MORE TIME','#f0ce69'],['GREEN ROOM','FIND YOUR NEXT RECORD','#9ecbb4'],
    ].entries()){
      const y=index*144;ctx.fillStyle=color;ctx.fillRect(0,y,w,144);ctx.fillStyle='#102832';
      ctx.beginPath();ctx.arc(920,y+72,110,0,Math.PI*2);ctx.fill();
      ctx.font='700 58px Manrope,sans-serif';ctx.fillText(title,34,y+77);
      ctx.font='600 20px Manrope,sans-serif';ctx.fillText(subtitle,38,y+119);
    }
  });
  const screens=[];
  for(const [index,id]of STREET_SCREEN_BUILDINGS.entries()){
    const spec=specs.find(spec=>spec.id===id);
    if(!spec)throw new Error(`Street screen host is missing: ${id}`);
    const surfaces=facades.get(id);
    const mount=surfaces&&meshes.get(id)?visibleScreenMount(spec,surfaces,meshes.get(id))
      : {x:spec.x+Math.sin(spec.yaw)*(spec.depth/2+.07),y:CITY_GROUND+spec.height*.62,z:spec.z+Math.cos(spec.yaw)*(spec.depth/2+.07),width:Math.min(spec.width*.8,3.3),height:1.8,yaw:spec.yaw};
    if(!mount)throw new Error(`No supported wall for street screen: ${id}`);
    // Display pixels emit their own light; the street spill must not light them a second time.
    const surface=new THREE.MeshBasicMaterial({map:atlas});
    const values={screenFrame:{value:0},screenNext:{value:1},screenBlend:{value:0},screenNight:uniforms.cityNight};
    surface.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,values);
      shader.fragmentShader='uniform float screenFrame;uniform float screenNext;uniform float screenBlend;uniform float screenNight;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        vec2 first=vec2(vMapUv.x,(3.0-screenFrame+vMapUv.y)/4.0),second=vec2(vMapUv.x,(3.0-screenNext+vMapUv.y)/4.0);
        vec4 screenImage=mix(texture2D(map,first),texture2D(map,second),screenBlend);
        diffuseColor*=screenImage;
        diffuseColor.rgb*=.25+screenNight*.68;
      `);
    };
    surface.customProgramCacheKey=()=> 'animated-original-street-screen-v3';
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(mount.width,mount.height),surface);
    screen.position.set(mount.x,mount.y,mount.z);screen.rotation.y=mount.yaw;screen.name=`Animated street display ${index+1}`;root.add(screen);
    const support=new THREE.Mesh(new THREE.BoxGeometry(mount.width+.12,mount.height+.12,.10),frame);
    support.position.copy(screen.position).add(new THREE.Vector3(-Math.sin(mount.yaw)*.066,0,-Math.cos(mount.yaw)*.066));support.rotation.y=mount.yaw;support.name=`Street display backing ${index+1}`;root.add(support);
    const light=new THREE.PointLight(SCREEN_COLORS[index],0,24,2);
    light.position.copy(screen.position).add(new THREE.Vector3(Math.sin(mount.yaw)*1.7,0,Math.cos(mount.yaw)*1.7));root.add(light);
    const source={position:light.position.toArray(),color:new THREE.Color(),strength:1.3};
    sources.push(source);screens.push({values,light,source,index});
  }
  root.userData.neonBuildings=candidates.length;root.userData.animatedScreens=screens.length;root.userData.cranes=craneBuildings.length;root.userData.craneSites=craneSites;
  return {
    root,sources,beaconPositions,
    update(time){
      signs.forEach((material,index)=>{material.emissiveIntensity=(.22+uniforms.cityNight.value*1.25)*(.93+Math.sin(time*.18+index)*.07)});
      wideSigns.forEach((material,index)=>{material.emissiveIntensity=(.18+uniforms.cityNight.value*1.6)*(.94+Math.sin(time*.14+index)*.06)});
      tubes.forEach(material=>{material.emissiveIntensity=.15+uniforms.cityNight.value*1.65});
      for(const screen of screens){
        const state=screenState(time,screen.index);screen.values.screenFrame.value=state.frame;screen.values.screenNext.value=state.next;screen.values.screenBlend.value=state.blend;
        screen.light.color.setHex(SCREEN_COLORS[state.frame]).lerp(new THREE.Color(SCREEN_COLORS[state.next]),state.blend);
        screen.light.intensity=55*uniforms.cityNight.value;screen.source.color.copy(screen.light.color);
      }
    },
  };
}
