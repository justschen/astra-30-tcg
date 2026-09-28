import * as THREE from 'three';
import { CityBatch } from './city-materials.js';
import { box, canvasTexture, contactShadow, roundedBox, upholsteredCushion } from './materials.js';

export function createGamingRoom(parent, assets, { wood, metal, paper }) {
  const root = new THREE.Group(); root.name = 'Gaming den beyond the open door'; parent.add(root);
  const batch = new CityBatch(root);
  const graphite = new THREE.MeshStandardMaterial({ color: 0x262b31, roughness: .74, metalness: .12 });
  const meshFabric = new THREE.MeshStandardMaterial({
    color: 0x3b4247, roughness: .98, normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.19, .19),
  });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x64d9ed });
  const pink = new THREE.MeshBasicMaterial({ color: 0xdf73b6 });
  const display = (name, width, height, paint) => {
    const map = canvasTexture(1024, 640, paint);
    const material = new THREE.MeshBasicMaterial({ map, color: 0xcad7e0 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    screen.name = name; return screen;
  };
  const monitor = (name, position, width, height, paint) => {
    const group = new THREE.Group(); group.position.set(...position); root.add(group);
    roundedBox(group, [width + .075, height + .075, .07], [0, 0, -.045], graphite, .028);
    const screen = display(name, width, height, paint); screen.position.z = .002; group.add(screen);
    batch.box(graphite, [position[0], 2.36, position[2] - .06], [.072, .48, .075]);
    batch.box(metal, [position[0], 2.13, position[2] + .045], [width * .44, .034, .37]);
    batch.box(cyan, [position[0] + width * .37, position[1] - height / 2 - .023, position[2]], [.025, .008, .006]);
    return screen;
  };

  const desk = roundedBox(root, [5.0, .10, 1.43], [0, 2.07, -4.82], wood, .035);
  desk.name = 'Gaming desk with cable tray'; desk.userData.gamingDesk = true;
  for (const x of [-2.28, 2.28]) {
    batch.box(metal, [x, 1.04, -5.08], [.09, 2.0, .10], 0, null, true);
    batch.box(metal, [x, .08, -4.79], [.13, .11, 1.16]);
  }
  batch.box(graphite, [0, 1.85, -5.27], [3.7, .20, .22]);
  batch.box(metal, [0, 1.39, -5.19], [4.5, .07, .09]);
  const mat = roundedBox(root, [2.93, .017, .69], [-.12, 2.137, -4.56], meshFabric, .05); mat.castShadow = false;
  const main = monitor('Gaming monitor: orbital night race', [-.62, 3.03, -5.10], 2.05, 1.18, (ctx, w, h) => {
    ctx.fillStyle = '#101c30'; ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#26376c'); sky.addColorStop(.58, '#693c79'); sky.addColorStop(1, '#152838');
    ctx.fillStyle = sky; ctx.fillRect(0, 38, w, h - 38);
    ctx.fillStyle = '#aacbd8';
    for (let i = 0; i < 60; i++) ctx.fillRect((i * 193) % w, 55 + (i * 53) % 280, 2, 2);
    ctx.fillStyle = '#e49db4'; ctx.beginPath(); ctx.arc(729, 199, 78, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#24495e' : '#172e46'; const x = i * 90;
      ctx.fillRect(x, 313 - i % 3 * 25, 64, 175 + i % 3 * 25);
      ctx.fillStyle = '#78bad0'; for (let y = 330; y < 452; y += 24) ctx.fillRect(x + 12, y, 24, 3);
    }
    ctx.fillStyle = '#161c34'; ctx.beginPath(); ctx.moveTo(360, 390); ctx.lineTo(662, 390); ctx.lineTo(931, h); ctx.lineTo(40, h); ctx.fill();
    ctx.strokeStyle = '#6edbe7'; ctx.lineWidth = 5;
    for (const x of [50, 290, 740, 932]) { ctx.beginPath(); ctx.moveTo(500 + (x - 500) * .22, 391); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.strokeStyle = '#b373c4'; ctx.lineWidth = 3;
    for (const y of [428, 476, 544, 631]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#bfd6db'; ctx.fillRect(429, 521, 171, 53);
    ctx.fillStyle = '#355071'; ctx.fillRect(468, 496, 94, 43);
    ctx.fillStyle = '#ee889b'; ctx.fillRect(436, 551, 31, 8); ctx.fillRect(566, 551, 28, 8);
    ctx.fillStyle = '#d9e7e9'; ctx.font = '600 23px Manrope,sans-serif'; ctx.fillText('ORBITAL / NIGHT RUN', 25, 29);
    ctx.font = '18px Manrope,sans-serif'; ctx.fillText('02 / 04', w - 128, 29);
  });
  monitor('Portrait monitor: chat and session mixer', [.90, 3.15, -5.05], .66, 1.39, (ctx, w, h) => {
    ctx.fillStyle = '#132430'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#79ced9'; ctx.fillRect(47, 32, w - 94, 52);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = ['#87babc', '#bb91b2', '#c6bf9c'][i % 3]; ctx.fillRect(55, 122 + i * 45, 50, 23);
      ctx.fillStyle = '#597780'; ctx.fillRect(138, 126 + i * 45, 405 + i % 3 * 114, 9);
      ctx.fillStyle = '#314955'; ctx.fillRect(138, 143 + i * 45, 613, 6);
    }
    for (let i = 0; i < 20; i++) { ctx.fillStyle = i % 3 ? '#6eb5bc' : '#af75ae'; ctx.fillRect(50 + i * 47, 617 - i % 7 * 8, 28, 18 + i % 7 * 8); }
  });

  const keyboard = new THREE.Group(); keyboard.name = 'Mechanical keyboard and mouse'; keyboard.position.set(-.50, 2.17, -4.46); root.add(keyboard);
  const keys = new CityBatch(keyboard);
  keys.box(graphite, [0, 0, 0], [1.24, .042, .40]);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) {
    keys.box(row === 0 && col === 0 ? pink : col > 11 ? cyan : paper, [-.562 + col * .086, .031, -.145 + row * .086], [.069, .022, .064]);
  }
  keys.box(graphite, [0, .045, .114], [.45, .022, .06]); keys.finish();
  const mouse = roundedBox(root, [.17, .082, .27], [.47, 2.195, -4.40], graphite, .07);
  mouse.name = 'Desk mouse'; batch.box(cyan, [.47, 2.239, -4.40], [.008, .006, .057]);
  for (const x of [-1.93, 1.51]) {
    batch.box(graphite, [x, 2.39, -5.09], [.26, .54, .27]);
    const driver = new THREE.Mesh(new THREE.CircleGeometry(.071, 24), metal);
    driver.position.set(x, 2.41, -4.946); root.add(driver);
  }
  const pc = new THREE.Group(); pc.name = 'Desktop PC with illuminated cooling fans'; pc.position.set(-1.93, 2.14, -4.55); root.add(pc);
  roundedBox(pc, [.64, 1.22, .82], [0, .61, 0], graphite, .027);
  box(pc, [.56, 1.09, .009], [0, .61, .416], metal);
  const fanGeometry = new THREE.TorusGeometry(.18, .015, 6, 28), fanHub = new THREE.CircleGeometry(.064, 16);
  const rings = new THREE.InstancedMesh(fanGeometry, cyan, 2), accentRing = new THREE.Mesh(fanGeometry, pink);
  const hubs = new THREE.InstancedMesh(fanHub, graphite, 3);
  const vanes = new THREE.InstancedMesh(new THREE.CircleGeometry(.08, 5), meshFabric, 15), dummy = new THREE.Object3D();
  for (let i = 0; i < 3; i++) {
    dummy.position.set(0, .23 + i * .37, .429);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
    if(i===1)accentRing.position.copy(dummy.position);else rings.setMatrixAt(i/2,dummy.matrix);
    dummy.position.z=.432;dummy.updateMatrix();hubs.setMatrixAt(i,dummy.matrix);
    for (let blade = 0; blade < 5; blade++) {
      const a = blade * Math.PI * 2 / 5;
      dummy.scale.set(.48,1,1);dummy.rotation.z=a+.2;dummy.position.set(Math.sin(a)*.09,.23+i*.37+Math.cos(a)*.09,.432);
      dummy.updateMatrix();vanes.setMatrixAt(i*5+blade,dummy.matrix);
    }
  }
  pc.add(rings,accentRing,hubs,vanes);
  batch.box(cyan, [-1.93, 3.34, -4.42], [.13, .009, .025]);

  const chair = new THREE.Group(); chair.name = 'Ergonomic gaming chair'; chair.position.set(1.25, 0, -3.14); chair.rotation.y = -.38; root.add(chair);
  const seat = new CityBatch(chair);
  seat.beam(metal, [0, .11, 0], [0, 1.15, 0], .055);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, x = Math.sin(a) * .62, z = Math.cos(a) * .62;
    seat.beam(metal, [0, .24, 0], [x, .12, z], .035);
    seat.add('cylinder', graphite, [x, .10, z], [.076, .07, .076], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
  }
  for (const x of [-.52, .52]) {
    seat.beam(metal, [x, .95, .02], [x, 1.59, .02], .022);
    seat.box(graphite, [x, 1.63, .03], [.12, .065, .49]);
  }
  seat.beam(metal, [0, .90, .42], [0, 2.39, .42], .038); seat.finish();
  upholsteredCushion(chair, [1.02, .16, 1.01], [0, 1.18, 0], meshFabric, .085);
  upholsteredCushion(chair, [.93, 1.28, .14], [0, 1.91, .44], meshFabric, .08).rotation.x = .08;
  contactShadow(root, [1.72, 1.72], [1.25, .009, -3.14], .26);

  const console = new THREE.Group(); console.name = 'Console shelf and physical game library'; console.position.set(-.30, 4.48, -5.52); root.add(console);
  const shelf = new CityBatch(console);
  shelf.box(wood, [0, 0, 0], [3.5, .066, .47], 0, null, true);
  for (const x of [-1.36, 1.36]) shelf.box(metal, [x, -.12, -.06], [.04, .22, .34]);
  shelf.box(paper, [.82, .18, .04], [.67, .25, .29]); shelf.box(graphite, [.82, .15, .193], [.59, .07, .012]);
  shelf.box(cyan, [1.02, .215, .197], [.033, .014, .009]);
  for (let i = 0; i < 9; i++) {
    shelf.box(i % 3 === 0 ? paper : graphite, [-1.41 + i * .104, .26, .03], [.088, .49, .29]);
    shelf.box(i % 2 ? pink : cyan, [-1.41 + i * .104, .35, .181], [.067, .055, .010]);
  }
  const pad = new THREE.Group(); pad.name = 'Game controller on the shelf'; pad.position.set(.14, .15, .14); pad.rotation.x = -.4; console.add(pad);
  roundedBox(pad, [.35, .14, .17], [0, 0, 0], graphite, .06);
  for (const x of [-.12, .12]) roundedBox(pad, [.09, .20, .095], [x, -.045, .015], graphite, .035).rotation.z = x < 0 ? -.30 : .30;
  box(pad, [.07, .017, .013], [-.095, .065, .054], paper);
  box(pad, [.017, .017, .062], [-.095, .065, .054], paper);
  box(pad, [.033, .012, .033], [.102, .07, .048], pink);
  shelf.finish();

  const sign = display('Continue neon wall sign', 1.63, .35, (ctx, w, h) => {
    ctx.fillStyle = '#132632'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 136px Manrope,sans-serif';
    ctx.shadowColor = '#51cae2'; ctx.shadowBlur = 30; ctx.fillStyle = '#8edfe8'; ctx.fillText('CONTINUE?', w / 2, h / 2, w - 110);
  });
  sign.position.set(-.45, 5.48, -5.68); root.add(sign);
  const halo = canvasTexture(128, 128, (ctx,w,h) => {
    const gradient=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    gradient.addColorStop(0,'#ffffff5c');gradient.addColorStop(.45,'#ffffff19');gradient.addColorStop(1,'#ffffff00');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  });
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.15, .86), new THREE.MeshBasicMaterial({
    map:halo,color:0x69cfe7,transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending,
  }));
  signGlow.position.set(-.45,5.48,-5.687);root.add(signGlow);
  for (const [x, material] of [[-2.67, cyan], [2.67, pink]]) {
    batch.box(metal, [x, 3.47, -5.55], [.055, 4.18, .04]);
    batch.box(material, [x, 3.47, -5.523], [.014, 4.13, .015]);
  }
  batch.box(cyan, [-.32, 2.002, -4.15], [4.26, .019, .019]);
  batch.box(pink, [0, 5.99, -5.68], [4.77, .022, .018]);
  const wire = new THREE.CatmullRomCurve3([new THREE.Vector3(.48, 2.145, -4.34), new THREE.Vector3(.68, 2.146, -4.58), new THREE.Vector3(.40, 2.146, -4.83)]);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(wire, 18, .006, 4, false), graphite); root.add(cord);
  batch.finish();
  root.userData = { computers: 1, monitors: 2, consoles: 1, gameCases: 9, animatedTextures: false };
  return { root, screen: main };
}
