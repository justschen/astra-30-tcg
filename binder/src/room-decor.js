import * as THREE from 'three';
import { beam, box, canvasTexture, contactShadow, fabricTexture, random, roundedBox } from './materials.js';

export function createPaperLantern(parent, position, radius, stretch, assets) {
  const group = new THREE.Group();
  group.position.set(...position);
  const paper = new THREE.MeshPhysicalMaterial({
    map: fabricTexture('#e2d9bd'), color: 0xefe0be, roughness: .9,
    normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.07, .07),
    emissive: 0xf2c48f, emissiveIntensity: .2, side: THREE.DoubleSide,
  });
  const shade = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), paper);
  shade.scale.y = stretch; shade.receiveShadow = true;
  group.add(shade);
  const ribs = new THREE.InstancedMesh(
    new THREE.TorusGeometry(1, .006, 4, 48),
    new THREE.MeshStandardMaterial({ color: 0xb3a181, roughness: .86 }),
    21,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 21; i++) {
    const latitude = -.92 + i / 20 * 1.84;
    const ringRadius = Math.sqrt(1 - latitude * latitude) * radius + .003;
    dummy.position.set(0, latitude * radius * stretch, 0);
    dummy.rotation.x = Math.PI / 2; dummy.scale.setScalar(ringRadius);
    dummy.updateMatrix(); ribs.setMatrixAt(i, dummy.matrix);
  }
  group.add(ribs);
  const capMaterial = new THREE.MeshStandardMaterial({ color: 0x5a5143, roughness: .45, metalness: .5 });
  for (const sign of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * .15, radius * .15, .018, 24), capMaterial);
    cap.position.y = sign * radius * stretch * .99; group.add(cap);
  }
  parent.add(group);
  return paper;
}

function originalPrint(index) {
  return canvasTexture(512, 640, (ctx, width, height) => {
    const rng = random(600 + index);
    ctx.fillStyle = '#d8d3be'; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 22000; i++) {
      ctx.fillStyle = `rgba(${rng() > .5 ? '255,252,232' : '63,61,45'},${rng() * .075})`;
      ctx.fillRect(rng() * width, rng() * height, 1, 1);
    }
    if (index === 0) {
      ctx.fillStyle = '#9b6d45'; ctx.beginPath(); ctx.arc(323, 176, 74, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#536858'; ctx.beginPath(); ctx.moveTo(53, 510); ctx.quadraticCurveTo(205, 76, 460, 510); ctx.fill();
      ctx.fillStyle = '#263e43'; ctx.beginPath(); ctx.moveTo(40, 538); ctx.bezierCurveTo(189, 317, 255, 404, 467, 432); ctx.lineTo(467, 561); ctx.lineTo(40, 561); ctx.fill();
      ctx.strokeStyle = '#bbc0a9'; ctx.lineWidth = 2;
      for (let i = 0; i < 11; i++) {
        ctx.beginPath(); ctx.moveTo(61, 542 - i * 8); ctx.bezierCurveTo(174, 431 - i * 6, 311, 444 - i * 3, 445, 486 - i * 6); ctx.stroke();
      }
    } else if (index === 1) {
      ctx.strokeStyle = '#36505b'; ctx.lineWidth = 5;
      for (let i = 0; i < 18; i++) {
        ctx.beginPath(); ctx.ellipse(256, 324, 58 + i * 8, 26 + i * 12, -.35, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (index === 2) {
      ctx.fillStyle = '#b38b64'; ctx.fillRect(61, 91, 240, 401);
      ctx.fillStyle = '#334f50'; ctx.beginPath(); ctx.ellipse(315, 349, 131, 193, .3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b7b49e'; ctx.beginPath(); ctx.arc(187, 444, 105, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#b59d78'; ctx.beginPath(); ctx.arc(318, 161, 67, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#35464a'; ctx.lineWidth = 17; ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(81 + i * 28, 527);
        ctx.bezierCurveTo(20 + i * 48, 319, 430 - i * 37, 381, 399 - i * 30, 264);
        ctx.stroke();
      }
    }
  });
}

function framedPrint(parent, position, width, height, index, frameMaterial) {
  const group = new THREE.Group(); group.position.set(...position);
  roundedBox(group, [width, height, .068], [0, 0, 0], frameMaterial, .018);
  box(group, [width - .065, height - .065, .012], [0, 0, .042], new THREE.MeshStandardMaterial({ color: 0xe1ddce, roughness: .94 }));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(width - .25, height - .25), new THREE.MeshStandardMaterial({ map: originalPrint(index), roughness: .98 }));
  art.position.z = .05; group.add(art);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - .065, height - .065), new THREE.MeshPhysicalMaterial({
    color: 0xe9efea, transparent: true, opacity: .027, roughness: .13, metalness: .1, clearcoat: 1, depthWrite: false,
  }));
  glass.position.z = .055; group.add(glass);
  parent.add(group);
}

function ceramic(parent, position, height, radius, color) {
  const profile = [
    [.45, 0], [.86, .025], [1, .15], [.94, .56], [.62, .79], [.42, .9],
    [.43, 1], [.34, 1], [.33, .91], [.49, .78],
  ].map(([r, y]) => new THREE.Vector2(r * radius, y * height));
  const material = new THREE.MeshPhysicalMaterial({
    color, roughness: .57, clearcoat: .24, clearcoatRoughness: .43,
    bumpMap: fabricTexture('#888477'), bumpScale: .008, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), material);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
}

function turntable(parent, position, walnut, metal) {
  const group = new THREE.Group(); group.position.set(...position); group.rotation.y = .07;
  roundedBox(group, [1.12, .09, .73], [0, .045, 0], walnut, .03);
  box(group, [1.04, .018, .65], [0, .1, 0], new THREE.MeshStandardMaterial({ color: 0x292f31, roughness: .55 }));
  const recordMap = canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#172126'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 34; i < 123; i += 2) {
      ctx.strokeStyle = i % 4 ? '#4b5255' : '#242f35'; ctx.lineWidth = .5;
      ctx.beginPath(); ctx.arc(128, 128, i, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#bdb092'; ctx.beginPath(); ctx.arc(128, 128, 31, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#455958'; ctx.beginPath(); ctx.arc(128, 128, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d262a'; ctx.beginPath(); ctx.arc(128, 128, 4, 0, Math.PI * 2); ctx.fill();
  });
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .018, 64), metal);
  platter.position.set(-.13, .12, 0); group.add(platter);
  const record = new THREE.Mesh(new THREE.CircleGeometry(.274, 64), new THREE.MeshPhysicalMaterial({ map: recordMap, roughness: .28, metalness: .2 }));
  record.rotation.x = -Math.PI / 2; record.position.set(-.13, .131, 0); group.add(record);
  beam(group, [.35, .14, -.23], [.37, .18, -.13], .012, metal);
  beam(group, [.37, .18, -.13], [.22, .18, .2], .011, metal);
  box(group, [.05, .028, .085], [.205, .156, .21], new THREE.MeshStandardMaterial({ color: 0x252c30, roughness: .4 }));
  parent.add(group);
}

function curtain(parent, x, width, assets) {
  const height = 7.3, geometry = new THREE.PlaneGeometry(width, height, 40, 48);
  const points = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < points.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const fold = Math.sin(u * Math.PI * 12);
    points.setXYZ(i, (u - .5) * width + Math.sin(v * 3) * .04, (v - .5) * height - Math.pow(1 - v, 5) * (.03 + .02 * Math.cos(u * 19)), fold * (.036 + (1 - v) * .034));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x8f9186, roughness: .98, normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.12, .12),
    side: THREE.DoubleSide, sheen: .5, sheenColor: new THREE.Color(0xc0b99f), sheenRoughness: .86,
  });
  const cloth = new THREE.Mesh(geometry, material);
  cloth.position.set(x, 2.23, -6.72); cloth.castShadow = true; cloth.receiveShadow = true;
  parent.add(cloth);
}

export function createRoomDecor(scene, assets) {
  const group = new THREE.Group(); group.name = 'Lanterns, linen curtains, walnut gallery and listening corner';
  scene.add(group);
  const walnut = new THREE.MeshStandardMaterial({
    color: 0x89928b, map: assets['oak-color'], normalMap: assets['oak-normal'], normalScale: new THREE.Vector2(.12, .12), roughness: .87,
  });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8b8067, roughness: .34, metalness: .82 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x253039, roughness: .74 });
  box(group, [3.12, 6.95, .055], [-8.24, 1.95, -7.025], charcoal);
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(.058, 6.95, .054), walnut, 28);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 28; i++) {
    dummy.position.set(-9.67 + i * .105, 1.95, -6.979); dummy.updateMatrix(); slats.setMatrixAt(i, dummy.matrix);
  }
  slats.castShadow = true; slats.receiveShadow = true; group.add(slats);
  framedPrint(group, [-8.73, 3.77, -6.84], 1.55, 2.05, 0, charcoal);
  framedPrint(group, [-7.34, 4.29, -6.83], .86, .98, 1, walnut);
  framedPrint(group, [-7.34, 3.12, -6.83], .86, .98, 2, walnut);
  const lampBar = roundedBox(group, [1.68, .032, .066], [-8.73, 4.94, -6.54], metal, .012);
  const diffuser = box(group, [1.54, .006, .048], [-8.73, 4.919, -6.54], new THREE.MeshBasicMaterial({ color: 0xe4bd87, toneMapped: false }));
  lampBar.castShadow = diffuser.castShadow = false;
  beam(group, [-8.98, 4.94, -6.95], [-8.98, 4.94, -6.54], .014, metal);
  beam(group, [-8.48, 4.94, -6.95], [-8.48, 4.94, -6.54], .014, metal);
  const pictureLight = new THREE.SpotLight(0xffd4a4, 3.2, 4, .66, .9, 2);
  pictureLight.position.set(-8.73, 4.86, -6.35); pictureLight.target.position.set(-8.73, 3.7, -6.91);
  group.add(pictureLight, pictureLight.target);

  const sideWall = new THREE.Group();
  sideWall.position.set(-9.735, 2.65, -1.65); sideWall.rotation.y = Math.PI / 2;
  framedPrint(sideWall, [-.45, .3, 0], 2.03, 2.72, 3, walnut);
  roundedBox(sideWall, [.2, 1.32, .048], [1.05, .31, -.005], metal, .035);
  const sconce = new THREE.Mesh(new THREE.CylinderGeometry(.044, .044, 1.06, 24), new THREE.MeshStandardMaterial({
    color: 0xf0dcb0, emissive: 0xe9b77a, emissiveIntensity: .3, roughness: .5,
  }));
  sconce.position.set(1.05, .31, .075); sideWall.add(sconce);
  const sconceLight = new THREE.PointLight(0xffd2a2, 1.8, 4, 2);
  sconceLight.position.set(1.05, .31, .24); sideWall.add(sconceLight);
  group.add(sideWall);

  roundedBox(group, [2.65, 1.08, .96], [-8.2, -.88, -6.2], walnut, .035);
  for (const x of [-8.86, -7.54]) {
    roundedBox(group, [1.285, .94, .025], [x, -.87, -5.7], walnut, .012);
    beam(group, [x + .36, -.67, -5.66], [x + .36, -.85, -5.66], .012, metal);
  }
  for (const y of [.62, 1.65]) {
    roundedBox(group, [2.65, .065, .65], [-8.2, y, -6.6], walnut, .013);
    box(group, [2.42, .012, .038], [-8.2, y - .039, -6.37], new THREE.MeshBasicMaterial({ color: 0xb79d7b, toneMapped: false }));
  }
  const rng = random(515);
  const bookColors = [0x6c7873, 0xa8917c, 0x4a626b, 0xb5b7a5, 0x6d6166];
  for (let i = 0; i < 11; i++) {
    const width = .08 + rng() * .035, height = .42 + rng() * .14;
    const book = new THREE.Group(); book.position.set(-9.3 + i * .12, .665, -6.45);
    box(book, [width, height, .32], [0, height / 2, 0], new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: .92 }));
    box(book, [width - .014, height - .03, .012], [0, height / 2, .164], new THREE.MeshStandardMaterial({ color: 0xc7c2ac, roughness: 1 }));
    book.rotation.z = i === 10 ? -.12 : 0; group.add(book);
  }
  ceramic(group, [-8.9, 1.69, -6.5], .61, .2, 0xc5bea6);
  ceramic(group, [-8.34, 1.69, -6.46], .39, .25, 0x718175);
  turntable(group, [-8.65, -.327, -6.1], walnut, metal);
  contactShadow(group, [3.2, 1.45], [-8.2, -1.478, -6.2], .5);

  curtain(group, -6.31, .72, assets);
  curtain(group, 8.29, .78, assets);
  beam(group, [-6.78, 5.99, -6.72], [8.7, 5.99, -6.72], .02, metal);
  const papers = [];
  const pendantLights = [];
  for (const [position, radius, stretch] of [[[5.6, 4.73, -4.85], .57, .84], [[7.02, 4.16, -5.33], .35, 1.12]]) {
    papers.push(createPaperLantern(group, position, radius, stretch, assets));
    beam(group, [position[0], position[1] + radius * stretch, position[2]], [position[0], 7.08, position[2]], .012, charcoal);
    const light = new THREE.PointLight(0xf5cfa2, 2.8, 7, 2);
    light.position.set(...position); group.add(light); pendantLights.push(light);
  }
  return {
    setWarm(warm) {
      papers.forEach(paper => { paper.emissiveIntensity = warm ? .29 : .2; });
      pendantLights.forEach(light => { light.intensity = warm ? 4 : 2.8; });
      pictureLight.intensity = warm ? 4.2 : 3.2;
      sconceLight.intensity = warm ? 2.8 : 1.8;
    },
  };
}
