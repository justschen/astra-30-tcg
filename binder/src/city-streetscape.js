import * as THREE from 'three';
import { CITY_GROUND, distanceToStreet } from './city-layout.js';
import { CityBatch } from './city-materials.js';
import { canvasTexture, random } from './materials.js';
import { createSidewalkPaths, RoadSurfaceIndex } from './city-roads.js';
import { fitFacadeAttachment } from './city-architecture.js';
import { createPedestrianAgents, PEDESTRIAN_COUNT, samplePedestrian } from './city-crowds.js';
import { buildingFootprint, PlotIndex } from './city-infill.js';
import { markBufferChanged, writeUprightInstance } from './instance-transforms.js';
import { STREET_SCREEN_BUILDINGS } from './city-life.js';
import { buildingMassing } from './building-massing.js';
import { NearestItems } from './nearest-items.js';

const REFLECTION_LIMIT = 32;
const SHOP_LABELS = [
  ['\u558b\u8336', 'KISSA', '#db6859'],
  ['\u66f8\u5e97', 'BOOKS', '#39bbc7'],
  ['\u98df\u5802', 'KITCHEN', '#e3ae52'],
  ['\u97f3\u697d', 'RECORDS', '#796cb8'],
  ['\u8336\u623f', 'TEA', '#76b79b'],
  ['\u82b1\u5c4b', 'FLOWERS', '#cf8aad'],
  ['\u9152\u5834', 'IZAKAYA', '#ef8260'],
  ['\u96d1\u8ca8', 'GENERAL', '#5c99c8'],
];

export function surveyAttachments(spec, surfaces, options) {
  return surfaces.map(surface => fitFacadeAttachment(surface, { x: spec.x, z: spec.z, ...options }))
    .filter(Boolean).map(attachment => ({ ...attachment, distance: distanceToStreet(attachment.x, attachment.z) }))
    .sort((a, b) => a.distance - b.distance);
}

export function streetFrontage(spec, surfaces) {
  if (surfaces) return surveyAttachments(spec, surfaces, {
    y: CITY_GROUND + 1.15, height: 2.2, width: Math.max(spec.width, spec.depth) * .95, fixedHeight: true,
  })[0] || null;
  const faces = [
    { normal: [0, 1], width: spec.width, distance: spec.depth / 2, yaw: 0 },
    { normal: [1, 0], width: spec.depth, distance: spec.width / 2, yaw: Math.PI / 2 },
    { normal: [0, -1], width: spec.width, distance: spec.depth / 2, yaw: Math.PI },
    { normal: [-1, 0], width: spec.depth, distance: spec.width / 2, yaw: -Math.PI / 2 },
  ];
  const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
  return faces.map(face => {
    const nx = face.normal[0] * c + face.normal[1] * s;
    const nz = -face.normal[0] * s + face.normal[1] * c;
    const x = spec.x + nx * (face.distance + .055), z = spec.z + nz * (face.distance + .055);
    return { x, z, width: face.width, yaw: spec.yaw + face.yaw, distance: distanceToStreet(x, z) };
  }).sort((a, b) => a.distance - b.distance)[0];
}

function signTexture(index, horizontal = false) {
  const [kanji, english, color] = SHOP_LABELS[index];
  return canvasTexture(horizontal ? 512 : 192, horizontal ? 128 : 512, (ctx, width, height) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = horizontal ? '#122b37' : color; ctx.fillRect(6, 6, width - 12, height - 12);
    ctx.strokeStyle = horizontal ? color : '#f6ecc880'; ctx.lineWidth = 4; ctx.strokeRect(13, 13, width - 26, height - 26);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f5ebce';
    if (horizontal) {
      ctx.font = '600 39px sans-serif'; ctx.fillText(english, width / 2, 76);
      ctx.fillStyle = color; ctx.fillRect(26, height - 22, width - 52, 3);
    } else {
      [...kanji].forEach((letter, i) => { ctx.font = '600 95px "Hiragino Sans", sans-serif'; ctx.fillText(letter, width / 2, 163 + i * 120); });
      ctx.fillStyle = '#143140'; ctx.fillRect(14, 369, width - 28, 120);
      ctx.fillStyle = '#f4e7c4'; ctx.font = `700 ${english.length > 6 ? 23 : 29}px sans-serif`; ctx.fillText(english, width / 2, 415);
      ctx.font = '18px sans-serif'; ctx.fillText('1F / 2F', width / 2, 456);
    }
  });
}

function interiorTexture(index) {
  return canvasTexture(256, 256, (ctx, width, height) => {
    const rng = random(231 + index);
    ctx.fillStyle = index % 2 ? '#415c67' : '#8f623d'; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createLinearGradient(0, 0, 0, height);
    glow.addColorStop(0, '#ffe4a0a0'); glow.addColorStop(1, '#182a3480');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 64 + shelf * 43;
      ctx.fillStyle = '#25383c'; ctx.fillRect(12, y, width - 24, 6);
      for (let item = 0; item < 12; item++) {
        ctx.fillStyle = ['#dcb46a', '#9e755f', '#507d83', '#bec6b2', '#c08e89'][Math.floor(rng() * 5)];
        const h = 13 + rng() * 20;
        ctx.fillRect(16 + item * 18, y - h, 10 + rng() * 5, h);
      }
    }
    ctx.fillStyle = '#ffe7b8'; ctx.fillRect(14, 13, width - 28, 8);
    ctx.fillStyle = '#b3e5e4'; ctx.fillRect(14, 238, width - 28, 4);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, ctx => {
    const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
    gradient.addColorStop(0, '#ffffffb8'); gradient.addColorStop(.27, '#ffffff63'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  });
}

function blossomTexture() {
  return canvasTexture(256, 256, ctx => {
    const rng = random(337);
    for (let i = 0; i < 85; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 94;
      const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
      const size = 6 + rng() * 9;
      ctx.fillStyle = ['#f0bfd0', '#e8abc0', '#f8d5db', '#d28eaf'][Math.floor(rng() * 4)];
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal / 5 * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(angle) * size * .55, y + Math.sin(angle) * size * .55, size * .55, size * .38, angle, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#bd668d'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function convenienceSign(square=false) {
  return canvasTexture(square?256:512,square?256:128,(ctx,width,height)=>{
    ctx.fillStyle='#eee9d8';ctx.fillRect(0,0,width,height);
    const stripe=square?15:9;
    for(const [index,color]of ['#1d8060','#e58f3a','#c94d3f'].entries()){
      ctx.fillStyle=color;ctx.fillRect(0,index*stripe,width,stripe);
      ctx.fillRect(0,height-(3-index)*stripe,width,stripe);
    }
    ctx.textAlign='center';ctx.fillStyle='#185941';
    ctx.font=`700 ${square?40:48}px sans-serif`;ctx.fillText('7-Eleven',width/2,square?132:83);
    if(square){ctx.font='18px sans-serif';ctx.fillText('OPEN 24 HOURS',width/2,170);}
  });
}

export function createStreetscape(root, specs, roads, uniforms, surveyedFacades = new Map()) {
  const group = new THREE.Group(); group.name = 'Illuminated shops, sakura walks and street furnishings'; root.add(group);
  const batch = new CityBatch(group);
  const rng = random(1526);
  const frame = new THREE.MeshStandardMaterial({ color: 0x344950, roughness: .57, metalness: .52 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x866b53, roughness: .86 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x9ca6a5, roughness: .93 });
  const red = new THREE.MeshStandardMaterial({ color: 0x973d38, roughness: .78 });
  const fixtures = [];
  const signs = SHOP_LABELS.map((label, index) => {
    const map = signTexture(index);
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 1.7, roughness: .4 });
    fixtures.push({ material, base: 1.45, window: false });
    return material;
  });
  const headers = SHOP_LABELS.map((label, index) => {
    const map = signTexture(index, true);
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: .5 });
    fixtures.push({ material, base: 1.15, window: false }); return material;
  });
  const interiors = [0, 1, 2].map(index => {
    const map = interiorTexture(index);
    const material = new THREE.MeshPhysicalMaterial({ map, emissiveMap: map, emissive: 0xffe3ad, emissiveIntensity: 1, roughness: .27, clearcoat: .5 });
    fixtures.push({ material, base: 1.2, window: true }); return material;
  });
  const tubes = SHOP_LABELS.map((label, index) => {
    const material = new THREE.MeshStandardMaterial({ color: label[2], emissive: label[2], emissiveIntensity: 2, roughness: .4 });
    fixtures.push({ material, base: 1.9, window: false }); return material;
  });
  const lantern = new THREE.MeshStandardMaterial({ color: 0xf1caa1, emissive: 0xff9058, emissiveIntensity: 1.3, roughness: .75 });
  fixtures.push({ material: lantern, base: 1.5, window: false });
  const lightSources = [];
  const roadSurfaces = new RoadSurfaceIndex(roads);
  const candidates = specs.filter(spec => (!spec.surveyed || spec.authoredPlacement) && !spec.distant && spec.z < -12 && spec.z > -180 && spec.width > 2.3 && spec.height > 2.7)
    .map(spec => ({ spec, frontage: streetFrontage(spec, surveyedFacades.get(spec.id)) }))
    .filter(({ frontage }) => frontage && frontage.distance > .4 && frontage.distance < 8)
    .sort((a, b) => Number(b.spec.hero) - Number(a.spec.hero) || a.frontage.distance - b.frontage.distance)
    .slice(0, 144);
  candidates.forEach(({ spec, frontage }, index) => {
    if(spec.id==='daimon-white-podium')return;
    const { x, z, yaw } = frontage;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const world = (px, py, pz = 0) => [x + px * c + pz * s, CITY_GROUND + py, z - px * s + pz * c];
    const form=buildingMassing(spec),facadeHeight=form?form.parts[0].height:spec.height;
    const width = frontage.width * .9, height = Math.min(1.6,facadeHeight*.32);
    const style = index % signs.length;
    batch.box(wood, world(0, .12), [width, .24, .09], yaw);
    const bays = Math.max(2, Math.min(7, Math.floor(width / .8)));
    for (let bay = 0; bay < bays; bay++) {
      const at = (bay + .5) / bays * width - width / 2;
      batch.box(interiors[index % interiors.length], world(at, height / 2 + .2, .025), [width / bays - .045, height, .035], yaw);
      batch.box(frame, world(at - width / bays / 2, height / 2 + .2, .055), [.035, height + .16, .055], yaw);
    }
    batch.box(headers[style], world(0, height + .45, .05), [width, .44, .08], yaw);
    batch.box(tubes[style], world(0, height + .685, .055), [width + .08, .035, .06], yaw);
    batch.box(index % 3 ? frame : red, world(0, height + .19, .25), [width + .12, .08, .53], yaw);
    const signHeight = Math.min(spec.hero ? Math.min(5.1, spec.height * .58) : 2 + rng() * .75,Math.max(0,(facadeHeight-height-1.3)*2-.14));
    const signWidth = spec.hero ? .82 : .58;
    const signX = width * (index % 2 ? -.43 : .43);
    const surfaces = surveyedFacades.get(spec.id);
    const mount = surfaces ? surveyAttachments(spec, surfaces, { y: CITY_GROUND + height + 1.3, width: signWidth + .09, height: signHeight + .1 })[0]
      : { x: world(signX, 0)[0], z: world(signX, 0)[2], y: CITY_GROUND + height + 1.3, width: signWidth + .09, height: signHeight + .1, yaw };
    if (mount&&signHeight>=.45&&!STREET_SCREEN_BUILDINGS.includes(spec.id)) {
      const normal = new THREE.Vector3(Math.sin(mount.yaw), 0, Math.cos(mount.yaw));
      const center = new THREE.Vector3(mount.x, mount.y, mount.z);
      const signPosition = center.clone().addScaledVector(normal, .4);
      batch.box(frame, signPosition.toArray(), [mount.width, mount.height, .12], mount.yaw);
      batch.box(signs[style], signPosition.clone().addScaledVector(normal, .075).toArray(), [mount.width - .09, mount.height - .1, .025], mount.yaw);
      for (const offset of [-.3, .3]) {
        const foot = center.clone(); foot.y += mount.height * offset;
        batch.beam(frame, foot.toArray(), foot.clone().addScaledVector(normal, .4).toArray(), .022);
      }
      lightSources.push({ position: signPosition.toArray(), color: new THREE.Color(SHOP_LABELS[style][2]), strength: spec.hero ? 1 : .7 });
    }
    if (index % 3 === 0) {
      for (let i = 0; i < Math.min(6, bays + 1); i++) {
        const at = (i / Math.min(5, bays) - .5) * width * .86;
        batch.add('foliage', lantern, world(at, height + .08, .41), [.115, .16, .115]);
      }
    }
    if (width > 3 && index % 3 === 1) {
      batch.box(signs[(style + 1) % signs.length], world(-width * .38, .59, .26), [.42, 1.1, .32], yaw);
      batch.box(frame, world(-width * .38, .12, .43), [.28, .075, .025], yaw);
    }
    if (index % 4 === 0) {
      batch.box(wood, world(width * .3, .5, .6), [.48, .035, .4], yaw);
      batch.beam(frame, world(width * .3, .06, .6), world(width * .3, .5, .6), .035);
    }
  });
  const convenience=specs.find(spec=>spec.id==='daimon-white-podium');
  if(!convenience)throw new Error('The convenience-store building is missing from the city layout.');
  const storeMap=convenienceSign(),bladeMap=convenienceSign(true);
  const storeHeader=new THREE.MeshStandardMaterial({map:storeMap,emissiveMap:storeMap,emissive:0xffffff,emissiveIntensity:.7,roughness:.55});
  const storeBlade=new THREE.MeshStandardMaterial({map:bladeMap,emissiveMap:bladeMap,emissive:0xffffff,emissiveIntensity:.7,roughness:.55});
  fixtures.push({material:storeHeader,base:.9,window:false},{material:storeBlade,base:.9,window:false});
  const storeSurfaces = surveyedFacades.get(convenience.id);
  const storeFrontages = storeSurfaces ? surveyAttachments(convenience, storeSurfaces, {
    y: CITY_GROUND + 1.15, height: 2.2, width: Math.max(convenience.width, convenience.depth) * .95, fixedHeight: true,
  }).slice(0, 2) : [
    { yaw: 0, width: convenience.width, x: convenience.x, z: convenience.z + convenience.depth / 2 + .055 },
    { yaw: -Math.PI / 2, width: convenience.depth, x: convenience.x - convenience.width / 2 - .055, z: convenience.z },
  ];
  if (!storeFrontages.length) throw new Error('The convenience store has no supported ground-floor facade.');
  for(const {yaw,width,x,z}of storeFrontages){
    const c=Math.cos(yaw),s=Math.sin(yaw),world=(px,y,pz=0)=>[x+px*c+pz*s,CITY_GROUND+y,z-px*s+pz*c];
    batch.box(frame,world(0,.13),[width,.26,.1],yaw);
    const bays=Math.max(2,Math.round(width/.7));
    for(let i=0;i<bays;i++){
      const px=(i+.5)/bays*width-width/2;
      batch.box(interiors[1],world(px,.9,.035),[width/bays-.04,1.35,.04],yaw);
      batch.box(frame,world(px-width/bays/2,.9,.07),[.035,1.5,.06],yaw);
    }
    batch.box(storeHeader,world(0,1.82,.1),[width+.13,.45,.13],yaw);
    batch.box(stone,world(0,2.08,.2),[width+.18,.09,.55],yaw);
  }
  const storeMount = storeSurfaces ? surveyAttachments(convenience, storeSurfaces, { y: CITY_GROUND + 2.9, width: 1.04, height: 1.04 })[0]
    : { x: convenience.x + convenience.width * .29, y: CITY_GROUND + 2.9, z: convenience.z + convenience.depth / 2 + .2, width: 1.04, height: 1.04, yaw: 0 };
  if (storeMount) batch.box(storeBlade, [storeMount.x + Math.sin(storeMount.yaw) * .1, storeMount.y, storeMount.z + Math.cos(storeMount.yaw) * .1], [storeMount.width, storeMount.height, .12], storeMount.yaw);
  lightSources.push({position:[storeFrontages[0].x,CITY_GROUND+1.9,storeFrontages[0].z],color:new THREE.Color(0x71c59c),strength:.7});
  group.userData.convenienceStore={name:'7-Eleven',building:convenience.id,x:convenience.x,z:convenience.z};
  const billboardIds = ['daimon-black-corner','street-dark-pencil','front-left-cream-office','east-dark-glass','daimon-corner'];
  billboardIds.forEach((id,index) => {
    const spec=specs.find(item=>item.id===id);
    if(!spec)return;
    const width=Math.min(2.3,spec.width*.6),height=Math.min(6.7,spec.height*.58);
    const surfaces = surveyedFacades.get(spec.id);
    const mount = surfaces ? surveyAttachments(spec, surfaces.filter(surface => surface.normal.z > .2), {
      x: spec.x + spec.width * .22, y: CITY_GROUND + spec.height * .54, z: spec.z + spec.depth * .5, width: width + .12, height: height + .12,
    })[0] : { x: spec.x + spec.width * .22, y: CITY_GROUND + spec.height * .54, z: spec.z + spec.depth * .5 + .075, width: width + .12, height: height + .12, yaw: spec.yaw };
    if (!mount) return;
    const { x, y, z, yaw } = mount;
    batch.box(frame,[x,y,z],[mount.width,mount.height,.12],yaw);
    batch.box(signs[index%signs.length],[x+Math.sin(yaw)*.075,y,z+Math.cos(yaw)*.075],[mount.width-.12,mount.height-.12,.022],yaw);
    lightSources.push({position:[x,y,z],color:new THREE.Color(SHOP_LABELS[index%SHOP_LABELS.length][2]),strength:.8});
  });

  const crownIds = ['left-charcoal-tower','park-slim-hotel','right-terraced-tower','right-rounded-tower','horizon-silver-tower','daimon-corner','street-dark-pencil'];
  const crowns = crownIds.map(id => specs.find(spec => spec.id === id && !spec.surveyed)).filter(Boolean);
  crowns.forEach((spec,index) => {
    const material = tubes[[1,4,7,1,7,5,0][index]];
    const tier = spec.stepped ? 3 : 0;
    const width = spec.width * (1 - tier*.12), depth = spec.depth*(1-tier*.12);
    const centerX = spec.x-tier*spec.width*.028, centerZ = spec.z+tier*spec.depth*.045;
    const top = CITY_GROUND+spec.height+.38;
    const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
    const position=(x,y,z)=>[centerX+x*c+z*s,y,centerZ-x*s+z*c];
    for(const sign of [-1,1]){
      batch.beam(material,position(-width*.5,top,sign*depth*.5),position(width*.5,top,sign*depth*.5),.045);
      batch.beam(material,position(sign*width*.5,top,-depth*.5),position(sign*width*.5,top,depth*.5),.045);
    }
    if(index===0||index===2){
      for(const sign of [-1,1]){
        batch.beam(frame,position(-width*.38,top,sign*depth*.35),position(0,top+2.8,sign*depth*.35),.09);
        batch.beam(frame,position(width*.38,top,sign*depth*.35),position(0,top+2.8,sign*depth*.35),.09);
        batch.beam(material,position(-width*.38,top+.06,sign*depth*.35),position(0,top+2.82,sign*depth*.35),.04);
        batch.beam(material,position(width*.38,top+.06,sign*depth*.35),position(0,top+2.82,sign*depth*.35),.04);
      }
    }
  });

  const wirePoints = [];
  roads.slice(0, 5).forEach(street => {
    const count = Math.floor(Math.min(street.curve.getLength(), 190) / 9);
    let previous = null;
    for (let i = 1; i < count; i++) {
      const p = street.curve.getPointAt(i / count);
      if (p.z < -180) continue;
      const tangent = street.curve.getTangentAt(i / count), side = new THREE.Vector3(-tangent.z, 0, tangent.x);
      p.addScaledVector(side, street.width / 2 + .62);
      const top = new THREE.Vector3(p.x, CITY_GROUND + 3.8, p.z);
      batch.beam(frame, [p.x, CITY_GROUND, p.z], top.toArray(), .038);
      batch.box(stone, [p.x, CITY_GROUND + 2.6, p.z], [.19, .31, .18]);
      if (previous) for (let step = 0; step < 12; step++) {
        const a = new THREE.Vector3().lerpVectors(previous, top, step / 12);
        const b = new THREE.Vector3().lerpVectors(previous, top, (step + 1) / 12);
        a.y -= Math.sin(step / 12 * Math.PI) * .25; b.y -= Math.sin((step + 1) / 12 * Math.PI) * .25;
        wirePoints.push(a, b);
      }
      previous = top;
    }
  });
  const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePoints), new THREE.LineBasicMaterial({ color: 0x293b48 }));
  wires.name = 'Street utility cables'; group.add(wires);

  const blossomMap = blossomTexture();
  const blossomMaterial = new THREE.MeshStandardMaterial({
    map: blossomMap, color: 0xeec3d2, roughness: .88, side: THREE.DoubleSide, alphaTest: .42, depthWrite: true,
    emissive: 0x6e2e4b, emissiveIntensity: .055,
  });
  const bark = new THREE.MeshStandardMaterial({ color: 0x54433e, roughness: .96 });
  const treePositions = [];
  for (let z = -192; z > -259; z -= 6.5) for (const x of [-14, 29]) treePositions.push([x + rng() * 3, z]);
  for (let i = 0; i < 36; i++) treePositions.push([-57 + rng() * 30, -188 - rng() * 35]);
  for (let i = 0; i < 24; i++) treePositions.push([42 + rng() * 20, -204 - rng() * 68]);
  const footprints=specs.map(buildingFootprint);
  const footprintIndex = new PlotIndex(footprints);
  const occupied = (x, z, margin) => footprintIndex.occupied({ x, z, width: 0, depth: 0 }, margin);
  const mainRoad = roads[0];
  for (let i = 1; i < 15; i++) {
    const p = mainRoad.curve.getPointAt(i / 16), tangent = mainRoad.curve.getTangentAt(i / 16);
    for (const sign of [-1, 1]) {
      const x = p.x - tangent.z * sign * (mainRoad.width / 2 + 1.15);
      const z = p.z + tangent.x * sign * (mainRoad.width / 2 + 1.15);
      if (!occupied(x, z, .6)) treePositions.push([x, z]);
    }
  }
  const templeFootprints = [[8,-216,11,11],[-14,-223,6.7,6.2],[32,-237,4,4]];
  const actualTrees = treePositions.filter(([x,z]) => distanceToStreet(x,z) > .65 && !occupied(x,z,.5) &&
    !templeFootprints.some(([tx,tz,halfWidth,halfDepth]) => Math.abs(x-tx)<halfWidth+1 && Math.abs(z-tz)<halfDepth+1));
  for (const [x, z] of actualTrees) {
    const height = 2.1 + rng() * 1.3;
    batch.beam(bark, [x,CITY_GROUND,z], [x + .1,CITY_GROUND + height,z], .09);
    for (let branch = 0; branch < 6; branch++) {
      const angle = branch * 2.4, span = .7 + rng() * .7;
      const tip = new THREE.Vector3(x + Math.sin(angle) * span, CITY_GROUND + height + .25 + rng() * .8, z + Math.cos(angle) * span);
      batch.beam(bark, [x,CITY_GROUND + height*.63,z], tip.toArray(), .035);
      for (let tuft = 0; tuft < 9; tuft++) {
        const center = tip.clone().add(new THREE.Vector3((rng()-.5)*1.05,(rng()-.5)*.62,(rng()-.5)*1.05));
        const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng()*Math.PI,rng()*Math.PI,rng()*Math.PI));
        const size = .55 + rng() * .65;
        batch.add('plane',blossomMaterial,center.toArray(),[size,size,1],orientation);
      }
    }
  }
  batch.finish();
  group.userData.shopCount = candidates.length;
  group.userData.sakuraCount = actualTrees.length;

  const glow = glowTexture();
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lightSources.flatMap(light => light.position), 3));
  glowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lightSources.flatMap(light => light.color.toArray()), 3));
  const signGlows = new THREE.Points(glowGeometry, new THREE.PointsMaterial({
    map: glow, size: 1.7, vertexColors: true, transparent: true, opacity: .23,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  signGlows.name = 'Signage light diffusion'; group.add(signGlows);

  const reflectSources = [...lightSources, ...roads.slice(0, 2).flatMap(street =>
    Array.from({ length: 14 }, (_, i) => ({ position: street.curve.getPointAt((i + .5) / 14).add(new THREE.Vector3(0,2.2,0)).toArray(), color: new THREE.Color(0xffbc76), strength: .55 })))];
  const reflectionData = new Float32Array(REFLECTION_LIMIT*3*4);
  const reflectionTexture = new THREE.DataTexture(reflectionData,REFLECTION_LIMIT,3,THREE.RGBAFormat,THREE.FloatType);
  const nearestReflections=new NearestItems(REFLECTION_LIMIT),reflectionCamera=new THREE.Vector3(Infinity,Infinity,Infinity);
  let reflectionGeometryDirty=true;
  reflectionTexture.name='Road-local reflected light data';
  reflectionTexture.needsUpdate=true;
  uniforms.cityReflections={value:reflectionTexture};
  uniforms.cityReflectionCount={value:0};
  const pointLights = [0,1,2,3].map((i) => {
    const position = [8.5 + (i % 2 ? 1.8 : -1.8), CITY_GROUND + 2.8, -51 - i * 20];
    const light = new THREE.PointLight(i % 2 ? 0x64d6dd : 0xe9809e, 18, 16, 2);
    light.position.set(...position); group.add(light); return light;
  });
  const walkerCount = PEDESTRIAN_COUNT;
  const walkers = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.062,.19,3,6),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),walkerCount);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.055,7,5),new THREE.MeshStandardMaterial({color:0xb49a86,roughness:.9}),walkerCount);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.038,.2,.043),new THREE.MeshStandardMaterial({color:0x253039,roughness:.9}),walkerCount*2);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(.034,.19,.04),walkers.material,walkerCount*2);
  const umbrellas = new THREE.InstancedMesh(new THREE.ConeGeometry(.2,.09,10),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.55,side:THREE.DoubleSide}),walkerCount);
  for(const mesh of [walkers,heads,legs,arms,umbrellas]){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);}
  walkers.name='People walking along the shopping streets';
  umbrellas.name='Rain umbrellas';
  const coats=[0x697e8b,0xc7b59b,0x9c7383,0x445a66,0x9aaa8d,0xbba994,0xb78369,0x889eac];
  for(let i=0;i<walkerCount;i++){
    walkers.setColorAt(i,new THREE.Color(coats[i%coats.length]));
    for(let arm=0;arm<2;arm++)arms.setColorAt(i*2+arm,new THREE.Color(coats[i%coats.length]));
    umbrellas.setColorAt(i,new THREE.Color([0x739aaa,0xa87c91,0xb9ada0,0x586881][i%4]));
  }
  const walkingPoint=new THREE.Vector3(),walkingTangent=new THREE.Vector3(),walkingSide=new THREE.Vector3();
  const routes=createSidewalkPaths(roads,roadSurfaces,(x,z)=>occupied(x,z,.25)||actualTrees.some(([tx,tz])=>Math.hypot(x-tx,z-tz)<.38)||
    templeFootprints.some(([tx,tz,halfWidth,halfDepth])=>Math.abs(x-tx)<halfWidth+.25&&Math.abs(z-tz)<halfDepth+.25));
  const walkingAgents=createPedestrianAgents(routes,walkerCount);
  let lastCrowdTime=-Infinity;
  group.userData.pedestrianCount=walkerCount;
  group.userData.walkingPaths=routes;
  group.userData.walkingAgents=walkingAgents;

  return {
    group, lightSources,
    addLightSources(sources){reflectSources.push(...sources);reflectionGeometryDirty=true;},
    dispose() { reflectionTexture.dispose(); },
    update(time, cameraPosition) {
      const night = uniforms.cityNight.value, wet = uniforms.cityWetness.value;
      fixtures.forEach(({material,base,window},index) => {
        const lamp = .94 + .06*Math.sin(time*.23+index*.73);
        material.emissiveIntensity = base * (.12 + night * 1.3) * lamp * (window ? uniforms.cityWindows.value : 1);
      });
      signGlows.material.opacity = .035 + night * .2;
      pointLights.forEach((light,index) => { light.intensity = night * (17 + Math.sin(time*.16+index)*1.5); });
      blossomMaterial.emissiveIntensity = .025 + night * .14;
      if(time<lastCrowdTime||time-lastCrowdTime>=1/30){
      for(let i=0;i<walkerCount;i++){
        const agent=walkingAgents[i];
        samplePedestrian(agent,time,walkingPoint,walkingTangent);
        walkingSide.set(-walkingTangent.z,0,walkingTangent.x);
        const x=walkingPoint.x,z=walkingPoint.z,fx=walkingTangent.x,fz=walkingTangent.z,scale=agent.scale;
        writeUprightInstance(walkers.instanceMatrix.array,i,x,CITY_GROUND+.37*scale,z,fx,fz,scale);
        writeUprightInstance(heads.instanceMatrix.array,i,x,CITY_GROUND+.565*scale,z,fx,fz,scale);
        for(let leg=0;leg<2;leg++){
          const step=Math.sin(time*5+i+leg*Math.PI)*.042;
          writeUprightInstance(legs.instanceMatrix.array,i*2+leg,x+walkingSide.x*(leg?-.035:.035)+fx*step,CITY_GROUND+.16*scale,
            z+walkingSide.z*(leg?-.035:.035)+fz*step,fx,fz,scale);
          writeUprightInstance(arms.instanceMatrix.array,i*2+leg,x+walkingSide.x*(leg?-.091:.091)-fx*step,CITY_GROUND+.36*scale,
            z+walkingSide.z*(leg?-.091:.091)-fz*step,fx,fz,scale);
        }
        writeUprightInstance(umbrellas.instanceMatrix.array,i,x,CITY_GROUND+.72*scale,z,fx,fz,scale);
      }
      for(const mesh of [walkers,heads,legs,arms,umbrellas])markBufferChanged(mesh.instanceMatrix,mesh.count*16);
      lastCrowdTime=time;
      }
      umbrellas.visible=wet>.6;
      uniforms.cityReflectionCount.value=0;
      if (!cameraPosition||wet<=.25||night<=.15) return;
      let changed=reflectionGeometryDirty||!reflectionCamera.equals(cameraPosition);
      if(changed){
        nearestReflections.reset();
        for(const source of reflectSources){
          const dx=source.position[0]-cameraPosition.x,dz=source.position[2]-cameraPosition.z;
          nearestReflections.offer(source,dx*dx+dz*dz);
        }
        for(const [index,source]of nearestReflections.items.entries()){
          const [x,y,z]=source.position;
          const ratio=(cameraPosition.y-CITY_GROUND)/(cameraPosition.y+y-2*CITY_GROUND);
          const rx=cameraPosition.x+(x-cameraPosition.x)*ratio,rz=cameraPosition.z+(z-cameraPosition.z)*ratio;
          const length=Math.hypot(rx-cameraPosition.x,rz-cameraPosition.z)||1,at=index*4,direction=(REFLECTION_LIMIT+index)*4;
          reflectionData[at]=rx;reflectionData[at+1]=rz;reflectionData[at+2]=.35+(y-CITY_GROUND)*.16;reflectionData[at+3]=1.1+(y-CITY_GROUND)*1.3;
          reflectionData[direction]=(rx-cameraPosition.x)/length;reflectionData[direction+1]=(rz-cameraPosition.z)/length;
          reflectionData[direction+2]=source.strength;reflectionData[direction+3]=0;
        }
        reflectionCamera.copy(cameraPosition);reflectionGeometryDirty=false;
      }
      for(const [index,source]of nearestReflections.items.entries()){
        const at=(REFLECTION_LIMIT*2+index)*4,{r,g,b}=source.color;
        if(reflectionData[at]!==Math.fround(r)||reflectionData[at+1]!==Math.fround(g)||reflectionData[at+2]!==Math.fround(b)){
          reflectionData[at]=r;reflectionData[at+1]=g;reflectionData[at+2]=b;changed=true;
        }
      }
      uniforms.cityReflectionCount.value=nearestReflections.items.length;
      if(changed)reflectionTexture.needsUpdate=true;
    },
  };
}
