import * as THREE from 'three';
import { CityBatch } from './city-materials.js';
import { box, canvasTexture, contactShadow, fabricTexture, random, roundedBox, upholsteredCushion } from './materials.js';
import { createGamingRoom } from './gaming-room.js';

export const ROOM_INTERIOR = Object.freeze({
  floor: -1.52, ceiling: 7.2, right: 9.95, left: -9.9,
  entryZ: 3.6, entryWidth: 2.7, entryHeight: 5.85, hallDepth: 5.8, doorAngle: 1.64,
});

export function interiorWallMaterial(assets) {
  return new THREE.MeshStandardMaterial({
    color: 0x737871, roughness: .96, normalMap: assets['city-concrete-normal'], normalScale: new THREE.Vector2(.055, .055),
  });
}

export function createInteriorShell(parent, wall) {
  const root = new THREE.Group(); root.name = 'Interior walls with a real doorway'; parent.add(root);
  const { floor, ceiling, left, right, entryZ, entryWidth, entryHeight } = ROOM_INTERIOR;
  const panel = (size, position, material, name) => {
    const mesh = box(root, size, position, material); mesh.name = name; mesh.userData.cityOccluder = true;
  };
  panel([.25, ceiling - floor, 26], [left, (ceiling + floor) / 2, 5.5], wall, 'Left apartment wall');
  for (const [from, to] of [[-7.5, entryZ - entryWidth / 2], [entryZ + entryWidth / 2, 18.5]]) {
    panel([.25, ceiling - floor, to - from], [right, (floor + ceiling) / 2, (from + to) / 2], wall, 'Right wall beside open doorway');
  }
  panel([.25, ceiling - floor - entryHeight, entryWidth], [right, (floor + entryHeight + ceiling) / 2, entryZ], wall, 'Doorway lintel wall');
  panel([20, ceiling - floor, .25], [0, (floor + ceiling) / 2, 18.5], wall, 'Back apartment wall');
  panel([20, .25, 26], [0, ceiling, 5.5], new THREE.MeshStandardMaterial({ color: 0x8e8b80, roughness: 1 }), 'Apartment ceiling');
  return root;
}

export function createRoomNooks(parent, assets, wall = interiorWallMaterial(assets)) {
  const root = new THREE.Group(); root.name = 'Proportioned reading corner and open gaming den'; parent.add(root);
  const { floor, ceiling, entryWidth, entryHeight, hallDepth, doorAngle } = ROOM_INTERIOR;
  const wood = new THREE.MeshStandardMaterial({
    map: assets['oak-color'], normalMap: assets['oak-normal'], normalScale: new THREE.Vector2(.12, .12),
    roughnessMap: assets['oak-roughness'], color: 0x87928f, roughness: .87,
  });
  const darkWood = wood.clone(); darkWood.color.setHex(0x69533e);
  const metal = new THREE.MeshStandardMaterial({ color: 0x292a27, roughness: .52, metalness: .48 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xaa9270, roughness: .48, metalness: .72 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xc9c1ad, roughness: 1 });
  const linen = new THREE.MeshStandardMaterial({
    color: 0xa99a80, normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.23, .23), roughness: .98,
  });
  const moss = linen.clone(); moss.color.setHex(0x55645b);
  const covers = [0x42545a, 0x8f5f46, 0xb5a68a, 0x617165, 0x73616e, 0x39424a].map(color => new THREE.MeshStandardMaterial({ color, roughness: .94 }));
  const rng = random(30926), fixed = new CityBatch(root);
  let bookCount = 0;
  const books = (batch, x, y, z, count) => {
    let cursor = x;
    for (let i = 0; i < count; i++) {
      const width = .065 + rng() * .046, height = .43 + rng() * .19, depth = .34 + rng() * .04;
      batch.box(covers[i % covers.length], [cursor + width / 2, y + height / 2, z], [width, height, depth]);
      batch.box(paper, [cursor + width / 2, y + height - .013, z], [width * .7, .006, depth * .92]);
      for (const fraction of [.19, .75]) batch.box(paper, [cursor + width / 2, y + height * fraction, z + depth / 2 + .003], [width * .66, .007, .005]);
      cursor += width + .012;
    }
    bookCount += count;
  };
  const print = (group, name, position, width, height, draw) => {
    const map = canvasTexture(512, 640, draw);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map, roughness: .94 }));
    mesh.position.set(...position); mesh.name = name; group.add(mesh); return mesh;
  };
  const occluder = (group, size, position, material, name) => {
    const mesh = box(group, size, position, material); mesh.name = name; mesh.userData.cityOccluder = true; return mesh;
  };
  for (const x of [ROOM_INTERIOR.left + .15, ROOM_INTERIOR.right - .15]) {
    const right = x > 0, spans = right ? [[-7.25, ROOM_INTERIOR.entryZ - entryWidth / 2], [ROOM_INTERIOR.entryZ + entryWidth / 2, 18.5]] : [[-7.25, 18.5]];
    for (const [from, to] of spans) {
      fixed.box(darkWood, [x, floor + .11, (from + to) / 2], [.055, .22, to - from]);
    }
    fixed.box(wall, [x - Math.sign(x) * .08, ceiling - .07, 5.625], [.26, .14, 25.75]);
  }

  const reading = new THREE.Group(); reading.name = 'Walnut library and collector shelf';
  reading.position.set(-9.28, floor, 2.8); reading.rotation.y = Math.PI / 2; root.add(reading);
  const library = new CityBatch(reading);
  library.box(darkWood, [0, .15, .02], [4.05, .24, .85], 0, null, true);
  for (const y of [.30, 1.10, 1.86, 2.57]) library.box(wood, [0, y, .02], [4.16, .10, .94], 0, null, true);
  library.box(darkWood, [0, 1.47, -.40], [4.06, 2.27, .055]);
  for (const x of [-2.03, -.45, .76, 2.03]) library.box(wood, [x, 1.48, .02], [.07, 2.32, .88], 0, null, true);
  for (const y of [.37, 1.16, 1.93]) {
    books(library, -1.92, y, .17, 12); books(library, -.34, y, .17, 8);
  }
  for (const y of [.60, 1.35, 2.12]) {
    library.box(linen, [1.35, y, .05], [.91, .39, .65]);
    library.box(metal, [1.35, y + .03, .379], [.16, .045, .016]);
  }
  for (let i = 0; i < 3; i++) library.box(covers[i + 1], [-1.43, 2.68 + i * .066, .05], [.75, .057, .48], .04 - i * .025);
  library.finish();
  const handheld = new THREE.Group(); handheld.name = 'Original pocket-game keepsake';
  handheld.position.set(.22, 2.80, .29); handheld.rotation.x = -.14; handheld.rotation.y = -.15; reading.add(handheld);
  roundedBox(handheld, [.30, .45, .063], [0, 0, 0], covers[4], .022);
  box(handheld, [.22, .17, .009], [0, .070, .036], metal);
  print(handheld, 'Original pixel landscape', [0, .070, .042], .196, .14, (ctx, w, h) => {
    ctx.fillStyle = '#8d9c73'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#435745';
    for (let x = 0; x < 18; x++) ctx.fillRect(x * 32, h * .62 - Math.sin(x * .6) * 46, 30, h);
    ctx.fillRect(95, 98, 60, 60); ctx.fillRect(79, 119, 92, 18);
  });
  box(handheld, [.088, .025, .012], [-.071, -.091, .039], metal);
  box(handheld, [.025, .085, .012], [-.071, -.091, .039], metal);
  const button = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 8), brass);
  button.scale.z = .45; button.position.set(.075, -.078, .040); handheld.add(button);

  const chair = new THREE.Group(); chair.name = 'Moss reading chair';
  chair.position.set(-7.27, floor, 3.00); chair.rotation.y = 1.10; root.add(chair);
  const frame = new CityBatch(chair);
  for (const x of [-.74, .74]) for (const z of [-.63, .64]) frame.beam(darkWood, [x * 1.07, 0, z], [x, 1.03, z], .047, true);
  for (const x of [-.77, .77]) {
    frame.box(wood, [x, 1.48, 0], [.105, .085, 1.73], 0, null, true);
    frame.beam(wood, [x, .90, .66], [x, 1.48, .66], .038);
    frame.beam(wood, [x, .84, -.68], [x, 1.92, -.79], .039);
  }
  frame.box(wood, [0, .98, 0], [1.62, .10, 1.55]); frame.finish();
  upholsteredCushion(chair, [1.47, .28, 1.42], [0, 1.13, .04], moss, .13);
  const back = upholsteredCushion(chair, [1.49, 1.15, .26], [0, 1.72, -.65], moss, .12); back.rotation.x = -.16;
  const pillow = upholsteredCushion(chair, [.69, .58, .20], [.19, 1.55, -.40], linen, .11); pillow.rotation.z = -.16;
  const rugMaterial = new THREE.MeshStandardMaterial({ map: fabricTexture('#898070'), color: 0xaaa08b, roughness: 1 });
  const rug = roundedBox(root, [3.1, .017, 3.9], [-7.63, floor + .011, 3.15], rugMaterial, .08); rug.castShadow = false;
  contactShadow(root, [2.0, 2.1], [-7.27, floor + .024, 3.00], .29);
  const readingFill = new THREE.SpotLight(0xffe0b8, 6.5, 8, 1.02, 1, 2);
  readingFill.position.set(-7.85, 3.8, 3.5); readingFill.target.position.set(-9.6, .1, 2.5); root.add(readingFill, readingFill.target);

  const entry = new THREE.Group(); entry.name = 'Open entry and furnished gaming room';
  entry.position.set(ROOM_INTERIOR.right, floor, ROOM_INTERIOR.entryZ); entry.rotation.y = -Math.PI / 2; root.add(entry);
  const hallWall = wall.clone(); hallWall.color.setHex(0x424b59);
  const stone = new THREE.MeshStandardMaterial({ color: 0x454c52, roughness: .94, normalMap: assets['city-concrete-normal'], normalScale: new THREE.Vector2(.10, .10) });
  const hallWidth = 5.8, hallHeight = entryHeight + .75;
  occluder(entry, [hallWidth + .25, .18, hallDepth + .35], [0, -.10, -hallDepth / 2], stone, 'Continuous hall floor');
  occluder(entry, [hallWidth + .25, .20, hallDepth], [0, hallHeight, -hallDepth / 2 - .15], hallWall, 'Hall ceiling');
  for (const x of [-hallWidth / 2, hallWidth / 2]) occluder(entry, [.18, hallHeight, hallDepth], [x, hallHeight / 2, -hallDepth / 2], hallWall, 'Hall side wall');
  const end = occluder(entry, [hallWidth, hallHeight, .20], [0, hallHeight / 2, -hallDepth], hallWall, 'Gaming room end wall');
  end.userData.hallDepth = hallDepth;
  const joinery = new CityBatch(entry);
  for (const x of [-entryWidth / 2 - .06, entryWidth / 2 + .06]) {
    joinery.box(wood, [x, entryHeight / 2, 0], [.12, entryHeight + .12, .38], 0, null, true);
    joinery.box(darkWood, [x + Math.sign(x) * .07, entryHeight / 2, .17], [.022, entryHeight + .12, .035]);
  }
  joinery.box(wood, [0, entryHeight + .06, 0], [entryWidth + .24, .12, .38], 0, null, true);
  joinery.box(stone, [0, -.006, 0], [entryWidth, .027, .48]);
  for (let z = -.8; z > -hallDepth; z -= 1.2) joinery.box(metal, [0, -.005, z], [hallWidth, .006, .012]);
  for (const x of [-hallWidth / 2 + .12, hallWidth / 2 - .12]) joinery.box(wood, [x, .12, -hallDepth / 2], [.04, .20, hallDepth]);
  const door = new THREE.Group(); door.name = 'Open walnut door'; door.position.set(-entryWidth / 2 + .023, .035, -.10);
  door.rotation.y = doorAngle; door.userData.openAngle = doorAngle; entry.add(door);
  const leafWidth = entryWidth - .08, leafHeight = entryHeight - .08;
  const panel = roundedBox(door, [leafWidth, leafHeight, .105], [leafWidth / 2, leafHeight / 2, 0], wood, .012); panel.name = 'Full-size hinged door leaf';
  const hardware = new CityBatch(door);
  for (const y of [.47, leafHeight / 2, leafHeight - .47]) hardware.beam(brass, [.015, y - .095, .067], [.015, y + .095, .067], .029);
  for (const side of [-1, 1]) {
    hardware.box(brass, [leafWidth - .23, 2.58, side * .063], [.11, .28, .02]);
    hardware.beam(brass, [leafWidth - .23, 2.60, side * .072], [leafWidth - .23, 2.60, side * .14], .022);
    hardware.beam(brass, [leafWidth - .23, 2.60, side * .14], [leafWidth - .47, 2.60, side * .14], .026);
  }
  hardware.finish();
  const runner = roundedBox(entry, [2.1, .018, 4.1], [.35, .016, -3.05], rugMaterial, .045); runner.name = 'Woven gaming-room rug'; runner.castShadow = false;
  const gaming = createGamingRoom(entry, assets, { wood, metal, paper });
  const clock = new THREE.Group(); clock.name = 'Small entry clock'; clock.position.set(entryWidth / 2 + .80, 4.24, .21); entry.add(clock);
  const clockRim = new THREE.Mesh(new THREE.CylinderGeometry(.30, .30, .060, 40), darkWood); clockRim.rotation.x = Math.PI / 2; clock.add(clockRim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(.273, 40), paper); face.position.z = .032; clock.add(face);
  const ticks = new CityBatch(clock);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6; ticks.beam(metal, [Math.sin(a) * .227, Math.cos(a) * .227, .039], [Math.sin(a) * .250, Math.cos(a) * .250, .039], .006);
  }
  ticks.beam(metal, [0, 0, .047], [.045, .137, .047], .010);
  ticks.beam(metal, [0, 0, .05], [0, -.20, .05], .008); ticks.finish();
  const hallLamp = new THREE.Group(); hallLamp.name = 'Hall ceiling practical'; hallLamp.position.set(.1, hallHeight - .45, -2.7); entry.add(hallLamp);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.31, .45, .20, 40, 1, true), linen); hallLamp.add(shade);
  const diffuser = new THREE.Mesh(new THREE.CircleGeometry(.38, 40), new THREE.MeshStandardMaterial({ color: 0xe7d9b9, emissive: 0xffd0a0, emissiveIntensity: .42, roughness: 1 }));
  diffuser.rotation.x = Math.PI / 2; diffuser.position.y = -.09; hallLamp.add(diffuser);
  const hallLight = new THREE.RectAreaLight(0x77cced, 1.8, 2.3, 1.4);
  hallLight.position.set(-.62, 3.03, -4.99); hallLight.lookAt(-.45, 1.8, -1.8); entry.add(hallLight);
  const hallFill = new THREE.PointLight(0xdc73b9, 5.0, 7, 2);
  hallFill.position.set(1.8, 4.1, -4.8); entry.add(hallFill);
  joinery.finish(); fixed.finish();
  root.userData = { bookCount, entryHeight, entryWidth, doorAngle, hallDepth, gaming: gaming.root.userData };
  return {
    root,
    setWarm(warm) {
      readingFill.intensity = warm ? 8 : 6.5; hallLight.intensity = warm ? 2.0 : 1.8; hallFill.intensity = warm ? 5.5 : 5.0;
    },
  };
}
