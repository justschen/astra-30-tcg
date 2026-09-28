import * as THREE from 'three';
import { GeometryCollector, material, applyMetersUVAndAO, addTiledRoof, addRafters, addBracketSet, addRailings, addLatticePanel, addBellAt, updateBells, cylinderBetween, boxBetween } from './roofkit.js';

function addPaperPanel(group, arr, pos, size, rotY = 0) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]); applyMetersUVAndAO(g, 'paper', { ao: .95 });
  const m = new THREE.Mesh(g, material('paper')); m.position.set(...pos); m.rotation.y = rotY; m.name = 'mainHall_doorGlowPaper'; group.add(m); arr.push(m); return m;
}
function addStair(col, topZ, width, floorY) {
  const n = 6, run = 2.85, tread = run / n, rise = floorY / n;
  for (let i=0;i<n;i++) {
    const h = rise * (i + .5), z = topZ + run - (i + .5) * tread;
    col.box('wood', [0, h, z], [width, rise*.82, tread*.94], [0,0,0], .025, { joint:true });
  }
  for (const sx of [-1,1]) {
    boxBetween(col,'wood_dark',[sx*width*.55,.05,topZ+run+.05],[sx*width*.55,floorY+.06,topZ-.06],.15,.19);
    boxBetween(col,'vermilion',[sx*width*.62,.62,topZ+run-.15],[sx*width*.62,floorY+.58,topZ+.05],.10,.12);
  }
}
function addGable(col, side, roofY) {
  const z = side * 5.95; const y0 = roofY + .75;
  col.box('plaster',[0,y0+.55,z],[4.4,1.10,.10],[0,0,0],.02,{joint:true});
  for(let i=0;i<7;i++){ const x=-2.1+i*.7; col.box('wood_dark',[x,y0+.55,z+side*.035],[.055,1.08,.08],[0,0,0],.006,{joint:true}); }
  boxBetween(col,'wood_dark',[-2.4,y0,z+side*.06],[0,y0+1.45,z+side*.06],.11,.13); boxBetween(col,'wood_dark',[2.4,y0,z+side*.06],[0,y0+1.45,z+side*.06],.11,.13);
  col.cone('gold',[0,y0-.12,z+side*.08],.14,.05,.42,[0,0,Math.PI],6,{joint:true});
}
export function buildMainHall(opts = {}) {
  const group = new THREE.Group(); group.name = 'procedural_main_hall';
  const col = new GeometryCollector(opts.seed ?? 1101); const bells = []; const doorGlowMeshes = [];
  const bodyW = 14.5, bodyD = 11.5, floorY = 1.4, podiumH = .8, veranda = 1.25;
  // granite kidan: block courses and visible joints
  col.box('stone',[0,podiumH/2,0],[bodyW+3.2,podiumH,bodyD+3.2],[0,0,0],.035,{joint:true});
  for (let x=-8.5;x<=8.5;x+=1.55) { col.box('stone',[x,.82,bodyD/2+1.63],[.035,.12,.08],[0,0,0],.004,{joint:true}); col.box('stone',[x,.82,-bodyD/2-1.63],[.035,.12,.08],[0,0,0],.004,{joint:true}); }
  for (let z=-7;z<=7;z+=1.45) { col.box('stone',[bodyW/2+1.63,.82,z],[.08,.12,.035],[0,0,0],.004,{joint:true}); col.box('stone',[-bodyW/2-1.63,.82,z],[.08,.12,.035],[0,0,0],.004,{joint:true}); }
  col.box('wood',[0,floorY-.08,0],[bodyW+2.1,.18,bodyD+1.75],[0,0,0],.025,{joint:true});
  for (let x=-7.8;x<=7.8;x+=.48) col.box('wood_dark',[x,floorY+.025,bodyD/2+.66],[.035,.08,1.15],[0,0,0],.006,{joint:true});
  addStair(col, bodyD/2+.95, 3.8, floorY);
  // columns, bases and tie beams
  const xs = Array.from({length:6},(_,i)=>-bodyW/2+i*bodyW/5); const zs = Array.from({length:5},(_,i)=>-bodyD/2+i*bodyD/4);
  for (const x of xs) for (const z of zs) if (x===xs[0]||x===xs.at(-1)||z===zs[0]||z===zs.at(-1)) { col.cyl('stone',[x, floorY+.08, z],.34,.16,[0,0,0],18); col.cyl('vermilion',[x,3.12,z],.225,3.18,[0,0,0],20,{joint:true}); addBracketSet(col,x,4.83,z,.74,'vermilion'); }
  for (const z of [zs[0],zs.at(-1)]) for (let i=0;i<xs.length-1;i++) { boxBetween(col,'vermilion',[xs[i],4.25,z],[xs[i+1],4.25,z],.22,.26,{joint:true}); boxBetween(col,'wood_dark',[xs[i],2.35,z],[xs[i+1],2.35,z],.15,.18,{joint:true}); }
  for (const x of [xs[0],xs.at(-1)]) for (let i=0;i<zs.length-1;i++) { boxBetween(col,'vermilion',[x,4.25,zs[i]],[x,4.25,zs[i+1]],.22,.26,{joint:true}); boxBetween(col,'wood_dark',[x,2.35,zs[i]],[x,2.35,zs[i+1]],.15,.18,{joint:true}); }
  // walls and front doors
  col.box('plaster',[0,3.22,-bodyD/2-.05],[bodyW-1.2,2.25,.12],[0,0,0],.015,{ao:.86}); col.box('wood_dark',[0,2.0,-bodyD/2-.12],[bodyW-1.2,.65,.15],[0,0,0],.012,{joint:true});
  for (const side of [-1,1]) { col.box('plaster',[side*(bodyW/2+.05),3.15,0],[.12,2.05,bodyD-1.2],[0,0,0],.015,{ao:.86}); col.box('wood_dark',[side*(bodyW/2+.12),2.0,0],[.16,.62,bodyD-1.2],[0,0,0],.012,{joint:true}); for (const z of [-3.1,0,3.1]) addLatticePanel(col,side*(bodyW/2+.16),3.35,z,1.5,1.05,Math.PI/2, true,'wood_dark'); }
  for (const x of [-4.35,0,4.35]) { addPaperPanel(group,doorGlowMeshes,[x,3.05,bodyD/2+.09],[2.05,2.45,.045],0); addLatticePanel(col,x,3.05,bodyD/2+.13,2.08,2.46,0,false,'lacquer_black'); col.box('wood_dark',[x,1.74,bodyD/2+.16],[2.25,.18,.16],[0,0,0],.015); col.box('wood_dark',[x,4.38,bodyD/2+.16],[2.25,.20,.16],[0,0,0],.015); }
  for (const x of [-6.5,6.5]) col.box('plaster',[x,3.10,bodyD/2+.04],[1.25,2.28,.10],[0,0,0],.014,{ao:.86});
  // intercolumn frog-leg struts
  for (const z of [bodyD/2,-bodyD/2]) for(let i=0;i<xs.length-1;i++){ const cx=(xs[i]+xs[i+1])/2; boxBetween(col,'wood_dark',[cx-.35,4.55,z],[cx,5.0,z],.08,.10); boxBetween(col,'wood_dark',[cx+.35,4.55,z],[cx,5.0,z],.08,.10); }
  addRailings(col, bodyW+2.25, bodyD+1.95, floorY+.10, bodyD/2+1.02, true, 'vermilion');
  addRafters(col, bodyW, bodyD, 5.18, 2.55, .95, 34, 27, 'wood_dark');
  addTiledRoof(col,{width:bodyW,depth:bodyD,y:5.42,rise:2.25,overhang:2.55,ridgeRatio:.46,cornerLift:.82,sori:.32,irimoya:true});
  col.mesh(group,'mainHall');
  for (const sx of [-1,1]) for (const sz of [-1,1]) addBellAt(group,bells,[sx*(bodyW/2+2.42),5.04,sz*(bodyD/2+2.42)],.88,Math.random()*6.28);
  const update = (t=0, wind={}) => updateBells(bells,t,wind);
  group.userData.info = { width: bodyW, depth: bodyD, floorHeight: floorY, frontStep: { z: bodyD/2+.95, width: 3.8 } };
  return { group, update, doorGlowMeshes, bells, info: group.userData.info };
}
