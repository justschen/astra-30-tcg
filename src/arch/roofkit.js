import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const materialCache = new Map();
export const KINDS = {
  vermilion: [0xb8412c, 0.55, 0.0], lacquer_black: [0x1d1b19, 0.62, 0.0], wood: [0x8c7258, 0.8, 0.0], wood_dark: [0x4b3627, 0.82, 0.0],
  plaster: [0xe6e0d2, 0.9, 0.0], tile: [0x5a5f66, 0.45, 0.1], stone: [0x9b968c, 0.86, 0.0], bronze: [0x5d7a64, 0.58, 0.5],
  gold: [0xc9a24a, 0.35, 1.0], paper: [0xefe6d2, 0.92, 0.0], rope: [0xb99a5b, 0.86, 0.0], shide: [0xf4f1ea, 0.82, 0.0],
  bark_roof: [0x4b3024, 0.9, 0.0], copper_green: [0x6f9c8a, 0.55, 0.25]
};
export function material(kind) {
  if (!materialCache.has(kind)) {
    const [color, roughness, metalness] = KINDS[kind] || KINDS.wood;
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true, side: THREE.DoubleSide });
    m.userData.kind = kind;
    materialCache.set(kind, m);
  }
  return materialCache.get(kind);
}
export function makeRng(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function tintColor(kind, r = Math.random, ao = 1) {
  const c = new THREE.Color(KINDS[kind]?.[0] ?? 0xffffff);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h + (r() - .5) * .018, Math.max(0, hsl.s * (0.94 + r() * .12)), Math.max(0, hsl.l * (0.88 + r() * .18) * ao));
  return c;
}
export function applyMetersUVAndAO(geometry, kind, opts = {}) {
  geometry.computeBoundingBox(); geometry.computeVertexNormals();
  const pos = geometry.attributes.position; const uv = []; const col = [];
  const box = geometry.boundingBox; const size = new THREE.Vector3(); box.getSize(size);
  const rr = opts.rng || Math.random;
  const base = new THREE.Color().setScalar((opts.tint ?? 1) * (0.94 + rr() * 0.12));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(size.x), ay = Math.abs(size.y), az = Math.abs(size.z);
    if (ay >= ax && ay >= az) uv.push(x, y); else if (ax >= az) uv.push(z, y); else uv.push(x, y);
    const yn = size.y > 1e-5 ? (y - box.min.y) / size.y : .5;
    let ao = (opts.ao ?? 1) * (0.72 + yn * 0.28);
    if (opts.under) ao *= 0.72; if (opts.joint) ao *= 0.82; if (opts.tile) ao *= 0.86 + 0.10 * Math.sin((x + z) * 7.0);
    c.copy(base).multiplyScalar(THREE.MathUtils.clamp(ao, .48, 1.22)); col.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geometry;
}
export class GeometryCollector {
  constructor(seed = 4) { this.byKind = new Map(); this.rng = makeRng(seed); }
  add(kind, geometry, matrix = new THREE.Matrix4(), opts = {}) {
    let g = geometry.clone(); g.applyMatrix4(matrix); applyMetersUVAndAO(g, kind, { ...opts, rng: this.rng });
    if (g.index) g = g.toNonIndexed();
    if (!this.byKind.has(kind)) this.byKind.set(kind, []); this.byKind.get(kind).push(g); return g;
  }
  box(kind, pos, size, rot = [0,0,0], radius = 0.025, opts = {}) {
    const g = radius >= 0.04 ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius) : new THREE.BoxGeometry(size[0], size[1], size[2]);
    const m = compose(pos, rot); this.add(kind, g, m, opts);
  }
  cyl(kind, pos, radius, depth, rot = [0,0,0], seg = 16, opts = {}) {
    const g = new THREE.CylinderGeometry(radius, radius, depth, seg, 1, false); this.add(kind, g, compose(pos, rot), opts);
  }
  cone(kind, pos, r1, r2, h, rot = [0,0,0], seg = 20, opts = {}) {
    const g = new THREE.CylinderGeometry(r1, r2, h, seg, 1, false); this.add(kind, g, compose(pos, rot), opts);
  }
  mesh(group, name = '') {
    const root = group || new THREE.Group();
    for (const [kindName, geoms] of this.byKind) {
      const merged = mergeGeometries(geoms, false); if (!merged) continue;
      merged.computeVertexNormals(); const mesh = new THREE.Mesh(merged, material(kindName)); mesh.name = name ? `${name}_${kindName}` : kindName; root.add(mesh);
    }
    return root;
  }
}
export function compose(pos = [0,0,0], rot = [0,0,0], scale = [1,1,1]) {
  const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)); return m;
}
export function boxBetween(col, kind, a, b, thickness, width = thickness, opts = {}) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), mid = va.clone().add(vb).multiplyScalar(.5); const dir = vb.clone().sub(va); const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1,1,1));
  const geom = Math.max(thickness, width) >= 0.13 ? new RoundedBoxGeometry(width, len, thickness, 1, Math.min(thickness, width) * .18) : new THREE.BoxGeometry(width, len, thickness);
  col.add(kind, geom, m, opts);
}
export function cylinderBetween(col, kind, a, b, radius, seg = 12, opts = {}) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), mid = va.clone().add(vb).multiplyScalar(.5); const dir = vb.clone().sub(va); const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1,1,1)); col.add(kind, new THREE.CylinderGeometry(radius, radius, len, seg, 1, false), m, opts);
}
function halfCylinderGeometry(radius, len, seg = 10, convex = true) {
  const g = new THREE.CylinderGeometry(radius, radius, len, seg, 1, true, convex ? 0 : Math.PI, Math.PI);
  g.rotateZ(Math.PI / 2); // axis along X after caller orient yaw/pitch if needed
  return g;
}
export function roofY(t, eaveY, ridgeY, sori = .22) { return THREE.MathUtils.lerp(eaveY, ridgeY, t) - Math.sin(Math.PI * t) * sori; }
function placeAlong(col, kind, geom, center, dirX, dirY, dirZ, opts) {
  const basis = new THREE.Matrix4().makeBasis(dirX.clone().normalize(), dirY.clone().normalize(), dirZ.clone().normalize()); basis.setPosition(center); col.add(kind, geom, basis, opts);
}
function addTileSurface(col, side, W, D, ridgeLen, y, ridgeY, cfg) {
  const frontBack = side === 'front' || side === 'back';
  const sign = (side === 'front' || side === 'right') ? 1 : -1;
  const divU = Math.max(16, Math.floor((frontBack ? W : D) / 0.28));
  const divV = Math.max(10, Math.floor((frontBack ? D : W) / 0.34));
  const pitch = cfg.tilePitch ?? .30, course = cfg.course ?? .32, sori = cfg.sori ?? .28, lift = cfg.cornerLift ?? .75;
  const ridgeHalf = Math.max(.18, ridgeLen * .5);
  const positions = [], indices = [], uvs = [];
  const acrossSpan = frontBack ? W : D;
  const run = frontBack ? D * .5 : W * .5;
  for (let j=0;j<=divV;j++) {
    const t = j / divV;
    const half = THREE.MathUtils.lerp(acrossSpan*.5, ridgeHalf, Math.pow(t, .94));
    for (let i=0;i<=divU;i++) {
      const a = -half + (i/divU) * half * 2;
      const en = half > 0 ? a / half : 0;
      const corner = Math.pow(Math.abs(en), 3.5) * lift * (1-t);
      const baseY = roofY(t, y + corner, ridgeY, sori * (0.75 + 0.25*t));
      const phase = ((a / pitch) % 1 + 1) % 1;
      const d = Math.min(phase, 1 - phase);
      const cover = Math.max(0, 1 - d / .22);
      const pan = -0.018 * Math.cos(phase * Math.PI * 2);
      const lip = ((((t * run) / course) % 1) < .18) ? .022 * (1-t*.25) : 0;
      const yy = baseY + .03 + cover * .075 + pan + lip;
      let x,z;
      if (frontBack) { x = a; z = sign * THREE.MathUtils.lerp(D*.5, 0, t); }
      else { x = sign * THREE.MathUtils.lerp(W*.5, 0, t); z = a; }
      positions.push(x, yy, z); uvs.push(a, t * run);
    }
  }
  for (let j=0;j<divV;j++) for (let i=0;i<divU;i++) {
    const n=divU+1, a=j*n+i, b=a+1, c=a+n, d=c+1;
    if (sign > 0) indices.push(a,c,b,b,c,d); else indices.push(a,b,c,b,d,c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2)); g.setIndex(indices); col.add('tile', g, new THREE.Matrix4(), { tile:true, ao:.96 });
}
function addSoffitSurface(col, side, W, D, ridgeLen, y, ridgeY, cfg) {
  const frontBack = side === 'front' || side === 'back'; const sign = (side === 'front' || side === 'right') ? 1 : -1;
  const divU=4, divV=4, positions=[], indices=[]; const acrossSpan=frontBack?W:D; const ridgeHalf=Math.max(.18,ridgeLen*.5); const sori=cfg.sori??.28, lift=cfg.cornerLift??.75, thick=cfg.thickness??.22;
  for (let j=0;j<=divV;j++){ const t=j/divV; const half=THREE.MathUtils.lerp(acrossSpan*.5,ridgeHalf,Math.pow(t,.94)); for(let i=0;i<=divU;i++){ const a=-half+(i/divU)*half*2; const en=half? a/half:0; const corner=Math.pow(Math.abs(en),3.5)*lift*(1-t); const yy=roofY(t,y+corner,ridgeY,sori*(.75+.25*t))-thick; let x,z; if(frontBack){x=a; z=sign*THREE.MathUtils.lerp(D*.5,0,t);} else {x=sign*THREE.MathUtils.lerp(W*.5,0,t); z=a;} positions.push(x,yy,z); }}
  for (let j=0;j<divV;j++) for(let i=0;i<divU;i++){ const n=divU+1,a=j*n+i,b=a+1,c=a+n,d=c+1; indices.push(a,b,c,b,d,c); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setIndex(indices); col.add('wood_dark',g,new THREE.Matrix4(),{under:true,ao:.82});
}
function addCurvedHipRidge(col, sx, sz, W, D, ridgeLen, y, ridgeY, cfg) {
  const lift = cfg.cornerLift ?? .75, sori = cfg.sori ?? .28;
  const t = 0;
  const x = sx * (W/2 - .22);
  const z = sz * (D/2 - .22);
  const corner = lift;
  const yy = y + corner + .11;
  col.box('tile',[x,yy,z],[.30,.13,.34],[0,Math.atan2(sx,sz),sx*.22],.03,{tile:true});
}
export function addTiledRoof(col, cfg) {
  const { width, depth, y = 4, rise = 1.8, overhang = 1.2, ridgeRatio = .24 } = cfg;
  const W = width + overhang * 2, D = depth + overhang * 2, ridgeY = y + rise, ridgeLen = Math.max(.45, W * ridgeRatio);
  for (const side of ['front','back','left','right']) { addSoffitSurface(col, side, W, D, ridgeLen, y, ridgeY, cfg); addTileSurface(col, side, W, D, ridgeLen, y, ridgeY, cfg); }
  // thick fascia/eave shell edges
  const fasciaH = (cfg.thickness ?? .22) + .16, lift = cfg.cornerLift ?? .75;
  col.box('wood_dark',[0,y-.11,D/2+.03],[W+.10,fasciaH,.26],[0,0,0],.035,{under:true});
  col.box('wood_dark',[0,y-.11,-D/2-.03],[W+.10,fasciaH,.26],[0,0,0],.035,{under:true});
  col.box('wood_dark',[W/2+.03,y-.11,0],[.26,fasciaH,D+.10],[0,0,0],.035,{under:true});
  col.box('wood_dark',[-W/2-.03,y-.11,0],[.26,fasciaH,D+.10],[0,0,0],.035,{under:true});
  // pan lips and round eave-end tiles on all four eaves
  const addDiscs=(frontBack,sign)=>{ const span=frontBack?W:D; const n=Math.max(10,Math.floor(span/(cfg.tilePitch??.30)/2)); for(let i=0;i<n;i++){ const a=-span/2+(i+.5)*span/n; const en=a/(span/2); const yy=y+Math.pow(Math.abs(en),3.5)*lift+.08; const x=frontBack?a:sign*(W/2+.04), z=frontBack?sign*(D/2+.04):a; col.cyl('tile',[x,yy,z],.145,.07,frontBack?[Math.PI/2,0,0]:[0,0,Math.PI/2],14,{tile:true}); for(let k=0;k<3;k++){ const aa=k*2.094+.4; const dx=Math.cos(aa)*.04, dy=Math.sin(aa)*.04; col.cyl('tile',[x+(frontBack?dx:0),yy+dy,z+(frontBack?0:dx)],.018,.025,frontBack?[Math.PI/2,0,0]:[0,0,Math.PI/2],7,{tile:true}); } } };
  addDiscs(true,1); addDiscs(true,-1); addDiscs(false,1); addDiscs(false,-1);
  // stacked ridge, collar and hip ridges
  for (let k=0;k<5;k++) col.box('tile',[0,ridgeY+.08+k*.105,0],[ridgeLen+.85-k*.10,.12,.54-k*.045],[0,0,0],.045,{tile:true});
  col.box('tile',[0,ridgeY-.04,0],[ridgeLen+.40,.20,.74],[0,0,0],.035,{tile:true});
  for (const x of [-ridgeLen/2-.48, ridgeLen/2+.48]) addOni(col, [x, ridgeY+.36, 0], x<0?-1:1, .95);
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    addCurvedHipRidge(col, sx, sz, W, D, ridgeLen, y, ridgeY, cfg);
  }
  if (cfg.irimoya) {
    const gw = ridgeLen*.92, gz = depth*.18;
    col.box('wood',[0,ridgeY-.40,gz],[gw,1.25,.18],[0,0,0],.025,{joint:true});
    col.box('wood',[0,ridgeY-.40,-gz],[gw,1.25,.18],[0,0,0],.025,{joint:true});
    for (const sign of [-1,1]) {
      const z=sign*gz;
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute([-gw/2,ridgeY-.98,z, gw/2,ridgeY-.98,z, 0,ridgeY+.55,z],3));
      tg.setIndex([0,1,2]);
      col.add('plaster', tg, new THREE.Matrix4(), {ao:.9});
      for (let i=1;i<6;i++) {
        const x=-gw/2+i*gw/6;
        col.box('wood_dark',[x,ridgeY-.58,z+sign*.035],[.055,.76,.07],[0,0,0],.006,{joint:true});
      }
      boxBetween(col,'wood_dark',[-gw/2,ridgeY-.98,z+sign*.08],[0,ridgeY+.55,z+sign*.08],.13,.16,{joint:true}); boxBetween(col,'wood_dark',[gw/2,ridgeY-.98,z+sign*.08],[0,ridgeY+.55,z+sign*.08],.13,.16,{joint:true});
      col.cone('gold',[0,ridgeY-.92,z+sign*.10],.16,.04,.46,[0,0,Math.PI],7,{joint:true});
    }
    // upper gable roof: two closed sloped slabs tied into the tsuma walls.
    col.box('tile',[0,ridgeY+.36,gz*.50],[gw+1.00,.18,gz*1.18],[-.34,0,0],.025,{tile:true});
    col.box('tile',[0,ridgeY+.36,-gz*.50],[gw+1.00,.18,gz*1.18],[.34,0,0],.025,{tile:true});
    col.box('tile',[0,ridgeY+.62,0],[gw+1.10,.18,.30],[0,0,0],.035,{tile:true});
    for (let k=0;k<3;k++) col.box('tile',[0,ridgeY+.72+k*.08,0],[gw+1.00-k*.12,.09,.26-k*.035],[0,0,0],.035,{tile:true});
    for (const x of [-gw/2-.62, gw/2+.62]) addOni(col, [x, ridgeY+.80, 0], x<0?-1:1, .45);
    for (const sx of [-1,1]) {
      boxBetween(col,'tile',[sx*(gw/2+.56),ridgeY+.18,gz*.98],[sx*(gw/2+.08),ridgeY+.86,0],.12,.17,{tile:true});
      boxBetween(col,'tile',[sx*(gw/2+.56),ridgeY+.18,-gz*.98],[sx*(gw/2+.08),ridgeY+.86,0],.12,.17,{tile:true});
    }
  }
  return { width:W, depth:D, eaveY:y, ridgeY };
}

export function addOni(col, pos, sx = 1, scale = .5) {
  col.box('tile', pos, [.12*scale,.82*scale,.50*scale], [0,0,0], .04, {tile:true, joint:true});
  col.cone('tile', [pos[0], pos[1]+.38*scale, pos[2]], .22*scale, .05*scale, .32*scale, [0,0,0], 5, {tile:true});
  for (const z of [-.18,.18]) col.cone('tile',[pos[0],pos[1]+.05*scale,pos[2]+z*scale],.08*scale,.025*scale,.24*scale,[Math.PI/2,0,0],8,{tile:true});
}
export function addBracketSet(col, x, y, z, s = 1, kind = 'vermilion') {
  col.box(kind,[x,y,z],[.48*s,.22*s,.48*s],[0,0,0],.035,{joint:true});
  col.box(kind,[x,y+.20*s,z],[.72*s,.18*s,.28*s],[0,0,0],.03,{joint:true});
  col.box(kind,[x,y+.41*s,z],[.32*s,.16*s,.72*s],[0,0,0],.03,{joint:true});
  col.box(kind,[x,y+.60*s,z],[.92*s,.16*s,.24*s],[0,0,0],.03,{joint:true});
  for (const sx of [-1,1]) { col.box(kind,[x+sx*.38*s,y+.33*s,z],[.42*s,.13*s,.20*s],[0,0,sx*.28],.025,{joint:true}); col.box(kind,[x+sx*.54*s,y+.58*s,z],[.38*s,.12*s,.18*s],[0,0,sx*.22],.025,{joint:true}); }
  for (const sz of [-1,1]) { col.box(kind,[x,y+.33*s,z+sz*.38*s],[.20*s,.13*s,.42*s],[sz*.28,0,0],.025,{joint:true}); col.box(kind,[x,y+.58*s,z+sz*.54*s],[.18*s,.12*s,.38*s],[sz*.22,0,0],.025,{joint:true}); }
}
export function addRafters(col, width, depth, y, overhang, rise = .5, countX = 28, countZ = 22, kind='wood_dark') {
  const W=width+overhang*2, D=depth+overhang*2; const topY=y+rise*.32;
  for(let i=0;i<countX;i++){ const x=-W/2+(i+.5)*W/countX; const lift=Math.pow(Math.abs(x)/(W/2),3)*.34; boxBetween(col,kind,[x,y-.16+lift,D/2-.05],[x,topY,depth*.42],.075,.115,{under:true}); boxBetween(col,kind,[x,y+.12+lift,D/2+.34],[x,topY+.15,depth*.48],.055,.09,{under:true}); boxBetween(col,kind,[x,y-.16+lift,-D/2+.05],[x,topY,-depth*.42],.075,.115,{under:true}); boxBetween(col,kind,[x,y+.12+lift,-D/2-.34],[x,topY+.15,-depth*.48],.055,.09,{under:true}); }
  for(let i=0;i<countZ;i++){ const z=-D/2+(i+.5)*D/countZ; const lift=Math.pow(Math.abs(z)/(D/2),3)*.34; boxBetween(col,kind,[W/2-.05,y-.16+lift,z],[width*.42,topY,z],.075,.115,{under:true}); boxBetween(col,kind,[-W/2+.05,y-.16+lift,z],[-width*.42,topY,z],.075,.115,{under:true}); }
  for (const sx of [-1,1]) for (const sz of [-1,1]) for(let i=0;i<7;i++){ const a=(i-3)*0.16; boxBetween(col,kind,[sx*(W/2-.10),y+.05,sz*(D/2-.10)],[sx*(width*.43+a),topY+.07,sz*(depth*.43-a)],.105,.15,{under:true}); }
}
export function addRailings(col, width, depth, y, zFront = null, sides = true, kind='vermilion') {
  const W=width, D=depth, h=.68; const zF=zFront ?? D/2;
  const addRun=(x1,z1,x2,z2,n)=>{ for(let i=0;i<=n;i++){ const t=i/n; const x=THREE.MathUtils.lerp(x1,x2,t), z=THREE.MathUtils.lerp(z1,z2,t); col.box(kind,[x,y+h*.5,z],[.11,h,.11],[0,0,0],.02); } boxBetween(col,kind,[x1,y+h,z1],[x2,y+h,z2],.12,.14); boxBetween(col,kind,[x1,y+.30,z1],[x2,y+.30,z2],.08,.10); };
  addRun(-W/2,zF,W/2,zF,12); if(sides){ addRun(-W/2,-D/2,-W/2,D/2,9); addRun(W/2,-D/2,W/2,D/2,9); }
}
export function addLatticePanel(col, x, y, z, w, h, rotY = 0, paper = true, barsKind = 'wood_dark', paperArray = null) {
  if (paper) col.box('paper',[x,y,z],[w,h,.035],[0,rotY,0],.005,{ao:.95});
  const nx=Math.max(3,Math.floor(w/.32)), ny=Math.max(3,Math.floor(h/.32));
  for(let i=0;i<=nx;i++){ const xx=-w/2+i*w/nx; const p=localToWorld(x,y,z,rotY,xx,0,0); col.box(barsKind,p,[.035,h+.05,.055],[0,rotY,0],.004,{joint:true}); }
  for(let j=0;j<=ny;j++){ const yy=-h/2+j*h/ny; const p=localToWorld(x,y,z,rotY,0,yy,0); col.box(barsKind,p,[w+.06,.032,.055],[0,rotY,0],.004,{joint:true}); }
}
function localToWorld(x,y,z,ry,lx,ly,lz){ const c=Math.cos(ry),s=Math.sin(ry); return [x+lx*c+lz*s,y+ly,z-lx*s+lz*c]; }
export function makeWindBell(scale=.35, phase=0) {
  const pivot = new THREE.Object3D(); pivot.userData.phase = phase;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.20*scale,.27*scale,.30*scale,18,1,false), material('bronze')); body.position.y=-.18*scale; applyMetersUVAndAO(body.geometry,'bronze',{ao:.9}); pivot.add(body);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.27*scale,.025*scale,8,20), material('bronze')); lip.rotation.x=Math.PI/2; lip.position.y=-.34*scale; applyMetersUVAndAO(lip.geometry,'bronze'); pivot.add(lip);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(.055*scale,10,8), material('bronze')); clapper.position.y=-.45*scale; pivot.add(clapper); pivot.userData.clapper=clapper;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(.16*scale,.42*scale,.018*scale), material('paper')); plate.position.y=-.75*scale; applyMetersUVAndAO(plate.geometry,'paper',{ao:.95}); pivot.add(plate); pivot.userData.plate=plate;
  return pivot;
}
export function updateBells(bells, t, wind = {}) { const s=wind.strength??.3, g=wind.gust??.2; bells.forEach((b,i)=>{ const ph=b.userData.phase??i; const a=(.07+.32*s+.12*g)*Math.sin(t*(1.2+s*1.7)+ph); b.rotation.z=a; b.rotation.x=a*.45*Math.cos(ph+1.7); if(b.userData.plate)b.userData.plate.rotation.z=-a*1.8; if(b.userData.clapper)b.userData.clapper.position.x=Math.sin(t*2.7+ph)*.025*s; }); }
export function addBellAt(group, bells, pos, scale=.55, phase=0) { const b=makeWindBell(scale,phase); b.position.set(...pos); group.add(b); bells.push(b); return b; }
