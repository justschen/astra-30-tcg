import * as THREE from 'three';
import { CITY_GROUND, TOWER } from './city-layout.js';
import { CityBatch } from './city-materials.js';

export const TOWER_MODEL = Object.freeze({ height: 333, base: 80, mainDeck: 118, topDeck: 249.6, mainDeckWidth: 25.4, topDeckWidth: 11.3 });
export const TOWER_PROFILE = [
  [0, 40], [12, 35.6], [32, 28.3], [55, 20.8], [80, 14.3], [104, 10.5],
  [124, 9.25], [150, 8.0], [180, 6.7], [210, 5.1], [238, 3.8],
  [253, 3.2], [268, 2.55], [283, 1.75], [295, 1.02], [307, .46], [333, .08],
];

export function towerDeckOutline(width,main=true){
  const r=width/2,cut=main?width*.085:width*.293;
  return [[-r+cut,r],[r-cut,r],[r,r-cut],[r,-r+cut],[r-cut,-r],[-r+cut,-r],[-r,-r+cut],[-r,r-cut]];
}

export function towerRadius(height) {
  if (!Number.isFinite(height) || height < 0 || height > TOWER_MODEL.height) throw new RangeError('Tower height is outside its profile.');
  const upper = Math.max(1, TOWER_PROFILE.findIndex(([at]) => at >= height));
  const [low, start] = TOWER_PROFILE[upper - 1], [high, end] = TOWER_PROFILE[upper];
  return THREE.MathUtils.lerp(start, end, (height - low) / (high - low));
}

export function createTokyoTower(parent) {
  const root = new THREE.Group();
  root.name = 'Tokyo Tower: reference-matched lower deck, flared legs and slender segmented mast';
  root.position.set(TOWER.x, CITY_GROUND, TOWER.z);
  root.scale.setScalar(TOWER.height / TOWER_MODEL.height);
  root.rotation.y = .24;
  root.userData.landmark = 'tokyo-tower';
  root.userData.referenceProfile = TOWER_MODEL;
  parent.add(root);
  const orange = new THREE.MeshStandardMaterial({ name: 'Tokyo Tower vermilion paint', color: 0xbc3f23, roughness: .6, metalness: .22, emissive: 0xff6f2c });
  const white = new THREE.MeshStandardMaterial({ name: 'Tokyo Tower white paint', color: 0xe7e5df, roughness: .56, metalness: .18, emissive: 0xfff0da });
  const deck = new THREE.MeshStandardMaterial({ color: 0x943b2a, roughness: .6, metalness: .14, emissive: 0xd64720 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd1c7b5, roughness: .5, metalness: .25, emissive: 0xffe9cd });
  const windows = new THREE.MeshStandardMaterial({ color: 0x3b3430, roughness: .3, metalness: .15, emissive: 0xffb45b });
  const base = new THREE.MeshStandardMaterial({ color: 0x73746e, roughness: .88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x513c30, roughness: .68, metalness: .25 });
  for (const material of [orange, white]) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vTowerPoint; varying vec3 vTowerFace;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', `
        #include <defaultnormal_vertex>
        vTowerFace = inverseTransformDirection(transformedNormal,viewMatrix);
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vTowerPoint = (instanceMatrix * vec4(position,1.0)).xyz;
      `);
      shader.fragmentShader = 'varying vec3 vTowerPoint; varying vec3 vTowerFace;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float height = vTowerPoint.y;
        float uplight = .22 + .9*exp(-abs(height-50.0)/50.0) + .65*exp(-abs(height-195.0)/48.0);
        float facet = .26 + .74*max(0.0,dot(normalize(vTowerFace),normalize(vec3(.45,-.48,1.0))));
        float mast = 1.0-smoothstep(272.0,320.0,height)*.84;
        totalEmissiveRadiance *= uplight * facet * mast;
      `);
    };
    material.customProgramCacheKey = () => 'tokyo-tower-reference-uplight-v4';
  }
  const batch = new CityBatch(root);
  const steelAt = height => height < TOWER_MODEL.mainDeck+9 || Math.floor((height - TOWER_MODEL.mainDeck-9) / 21) % 2 ? orange : white;
  const point = (side, x, y, r) => side === 0 ? [x,y,r] : side === 1 ? [r,y,-x] : side === 2 ? [-x,y,-r] : [-r,y,x];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    batch.box(base, [sx * 38.6, 1.1, sz * 38.6], [6.4,2.2,6.4], 0, null, true);
    for (let y = 2; y < 295; y += 7) {
      const top = Math.min(295,y+7), r0 = towerRadius(y), r1 = towerRadius(top);
      const girder = y < TOWER_MODEL.mainDeck ? .78 - y * .0025 : .4 - (y-TOWER_MODEL.mainDeck)*.00145;
      batch.beam(steelAt(y),[sx*r0,y,sz*r0],[sx*r1,top,sz*r1],girder,true);
      if (y < TOWER_MODEL.mainDeck-8) for (const inward of [0, 1]) {
        const inset = 2.4 * (1 - y / 200);
        batch.beam(orange,[sx*(r0-(inward?inset:0)),y,sz*(r0-(inward?0:inset))],
          [sx*(r1-(inward?inset:0)),top,sz*(r1-(inward?0:inset))],.3);
      }
    }
  }
  for (let y = 6; y < 295; y += y < TOWER_MODEL.mainDeck ? 10 : 9) {
    const high = Math.min(295, y + (y < TOWER_MODEL.mainDeck ? 10 : 9)), lower = towerRadius(y), upper = towerRadius(high);
    const opening = height => height < 60 ? 27.8 * Math.pow(1-height/60,.76) : 0;
    const inner0 = opening(y), inner1 = opening(high), steel = steelAt(y);
    for (let side = 0; side < 4; side++) {
      if (y >= 60) batch.beam(steel,point(side,-lower,y,lower),point(side,lower,y,lower), y < TOWER_MODEL.mainDeck ? .32 : .2);
      for (const sign of [-1,1]) {
        const bays = Math.max(1,Math.ceil((lower-inner0)/(y<TOWER_MODEL.mainDeck?7.0:4.5)));
        for (let bay=0;bay<bays;bay++) {
          const a=bay/bays,b=(bay+1)/bays;
          const x0=sign*THREE.MathUtils.lerp(inner0,lower,a),x1=sign*THREE.MathUtils.lerp(inner0,lower,b);
          const x2=sign*THREE.MathUtils.lerp(inner1,upper,a),x3=sign*THREE.MathUtils.lerp(inner1,upper,b);
          batch.beam(steel,point(side,x0,y,lower),point(side,x3,high,upper),y<TOWER_MODEL.mainDeck?.29:.14);
          batch.beam(steel,point(side,x1,y,lower),point(side,x2,high,upper),y<TOWER_MODEL.mainDeck?.29:.14);
          if (y<60) batch.beam(steel,point(side,x0,y,lower),point(side,x1,y,lower),.22);
        }
      }
    }
  }
  for(let side=0;side<4;side++) for(let i=0;i<32;i++){
    const arch = t => {
      const x=-28+t*56, y=17+42*Math.pow(Math.sin(t*Math.PI),.86);
      return point(side,x,y,towerRadius(y));
    };
    batch.beam(orange,arch(i/32),arch((i+1)/32),.6,true);
  }
  for(let y=20;y<238;y+=8){
    const width=y<TOWER_MODEL.mainDeck?4.6:2.65;
    batch.box(dark,[0,y+4,0],[width,8,width]);
    for(const side of [-1,1]){
      batch.beam(steelAt(y),[side*width/2,y,width/2],[side*width/2,y+8,width/2],.14);
      batch.beam(steelAt(y),[-width/2,y,side*width/2],[width/2,y+8,side*width/2],.1);
    }
  }
  for(const [height,width,depth]of [[TOWER_MODEL.mainDeck,TOWER_MODEL.mainDeckWidth,8.7],[TOWER_MODEL.topDeck,TOWER_MODEL.topDeckWidth,7.2]]){
    const main=height===TOWER_MODEL.mainDeck;
    const rings=[
      {y:height-depth/2-.6,width:width*.9},
      {y:height-depth/2+.7,width},
      {y:height+depth/2-.55,width},
      {y:height+depth/2+.7,width:width*.91},
    ];
    const vertices=[],indices=[];
    for(const ring of rings)for(const [x,z]of towerDeckOutline(ring.width,main))vertices.push(x,ring.y,z);
    for(let level=0;level<rings.length-1;level++)for(let edge=0;edge<8;edge++){
      const a=level*8+edge,b=level*8+(edge+1)%8,c=a+8,d=b+8;
      indices.push(a,b,c,b,d,c);
    }
    for(const [level,reverse]of [[0,true],[3,false]]){
      const outline=towerDeckOutline(rings[level].width,main).map(p=>new THREE.Vector2(...p));
      for(const face of THREE.ShapeUtils.triangulateShape(outline,[])){
        const [a,b,c]=face.map(index=>level*8+index);indices.push(...(reverse?[a,b,c]:[c,b,a]));
      }
    }
    const indexed=new THREE.BufferGeometry();
    indexed.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));indexed.setIndex(indices);
    const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
    const body=new THREE.Mesh(geometry,deck);body.castShadow=true;body.receiveShadow=true;
    body.name=main?'Chamfered two-story Main Deck':'Octagonal tapered Top Deck';root.add(body);
    body.userData.deckCenter=height;body.userData.deckWidth=width;
    const outline=towerDeckOutline(width,main);
    for(let edge=0;edge<8;edge++){
      const a=outline[edge],b=outline[(edge+1)%8],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      const nx=-dz/length,nz=dx/length,yaw=Math.atan2(nx,nz);
      for(const y of [height-depth/2+.7,height+depth/2-.55,...(main?[height]:[])])
        batch.beam(rim,[a[0]+nx*.22,y,a[1]+nz*.22],[b[0]+nx*.22,y,b[1]+nz*.22],main?.3:.22);
      for(let floor=0;floor<(main?2:1);floor++){
        const y=height+(main?(floor-.5)*3.55:0),bays=Math.max(1,Math.floor(length/1.7));
        for(let bay=0;bay<bays;bay++){
          const t=(bay+.5)/bays,x=a[0]+dx*t+nx*.07,z=a[1]+dz*t+nz*.07;
          batch.box(windows,[x,y,z],[length/bays*.8,main?2.3:3.8,.12],yaw);
          batch.box(rim,[x-length/bays*.46*Math.cos(yaw),y,z+length/bays*.46*Math.sin(yaw)],[.095,main?2.6:4.05,.18],yaw);
        }
      }
    }
    if(main)batch.box(deck,[0,height+5.4,0],[width*.78,1.5,width*.78],0,null,true);
  }
  for(const [y,radius,height]of [[261,4.25,1.55],[275,3.05,1.1],[288,2.05,.9],[299,1.25,.8]]){
    batch.box(white,[0,y,0],[radius*2,height,radius*2]);
    for(let side=0;side<4;side++){
      batch.beam(orange,point(side,-radius,y-3,radius),point(side,radius,y+3,radius),.13);
    }
  }
  for(let y=295;y<333;y+=3.8){
    const high=Math.min(333,y+3.8);
    batch.beam(steelAt(y),[0,y,0],[0,high,0],Math.max(.12,.68*(333-y)/38));
  }
  batch.box(base,[0,7.1,0],[43,14.2,31],0,null,true);
  batch.box(dark,[0,14.45,0],[44,.5,32]);
  for(let x=-17;x<=17;x+=3.4)batch.box(windows,[x,8.7,15.55],[2.4,3.8,.12]);
  batch.finish();
  return {
    root, emission:[[orange,4.6],[white,2.1],[deck,.55],[rim,.9],[windows,.75]],
    beacon:[TOWER.x,CITY_GROUND+TOWER.height+.22,TOWER.z],
  };
}
