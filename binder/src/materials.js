import * as THREE from 'three';
import { CardFinishLibrary } from './card-finishes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CARD_BY_ID, cardImage } from './collection.js';

export function random(seed = 716) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

export function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function fabricTexture(color = '#c6c1b5') {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const rng = random(328);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        ctx.fillStyle = `rgba(${rng() > .5 ? '255,255,255' : '10,14,19'},${.02 + rng() * .06})`;
        ctx.fillRect(x, y, 1, 2);
      }
    }
    ctx.strokeStyle = '#ffffff08';
    for (let x = 0; x < w; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  });
}

export function woodTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const rng = random(938);
    ctx.fillStyle = '#98806b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const y = rng() * h, phase = rng() * 9, amp = 1 + rng() * 10;
      ctx.strokeStyle = i % 3 ? `rgba(36,19,13,${rng() * .13})` : `rgba(231,208,173,${rng() * .15})`;
      ctx.lineWidth = .3 + rng() * 1.8;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const yy = y + Math.sin(x / 190 + phase) * amp + Math.sin(x / 90) * 2;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (const y of [128, 256, 384]) {
      ctx.fillStyle = '#28201a40'; ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#e1c49b20'; ctx.fillRect(0, y + 1, w, 1);
    }
  });
}

export function roundedBox(parent, size, position, material, radius = .04) {
  const geometry = new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(n => n / 2)));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export async function loadRoomAssets() {
  const names = [
    'oak-color', 'oak-normal', 'oak-roughness',
    'leather-color', 'leather-normal', 'leather-roughness',
    'upholstery-normal', 'upholstery-roughness',
    'city-concrete-color', 'city-concrete-normal', 'city-concrete-roughness',
    'city-brick-color', 'city-brick-normal', 'city-brick-roughness',
    'city-asphalt-color', 'city-asphalt-normal', 'city-asphalt-roughness',
  ];
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(names.map(async name => {
    const texture = await loader.loadAsync(`room/${name}.webp`);
    texture.name = name;
    texture.colorSpace = name.endsWith('-color') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const repeat = name.startsWith('leather') ? [6, 8] : name.startsWith('upholstery') ? [6, 6] : [1, 1];
    texture.repeat.set(...repeat);
    return texture;
  }));
  const failures = results.flatMap((result, i) => result.status === 'rejected' ? [names[i]] : []);
  if (failures.length) {
    results.forEach(result => { if (result.status === 'fulfilled') result.value.dispose(); });
    throw new Error(`Room assets could not load: ${failures.join(', ')}. Rebuild the binder to restore them.`);
  }
  return Object.fromEntries(results.map((result, i) => [names[i], result.value]));
}

export function contactShadow(parent, size, position, opacity = .35) {
  const texture = canvasTexture(128, 128, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, width * .08, width / 2, height / 2, width * .5);
    gradient.addColorStop(0, '#000000da');
    gradient.addColorStop(.55, '#00000096');
    gradient.addColorStop(.83, '#00000024');
    gradient.addColorStop(1, '#00000000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({
    map: texture, color: 0x111c25, opacity, transparent: true, depthWrite: false, toneMapped: false,
  }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

export function upholsteredCushion(parent, size, position, material, radius = .16) {
  const geometry = new RoundedBoxGeometry(...size, 6, Math.min(radius, ...size.map(value => value / 2)));
  const points = geometry.attributes.position;
  const [width, height, depth] = size;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const nearEdge = Math.pow(Math.abs(x) / (width / 2), 6);
    const wrinkle = Math.sin(y / height * 36 + z / depth * 4) * .006 * nearEdge;
    points.setXYZ(i, x, y + wrinkle, z + Math.cos(x / width * 31) * .008 * Math.pow(Math.abs(y) / (height / 2), 7));
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function plasticNormalTexture() {
  const texture = canvasTexture(256, 256, (ctx, width, height) => {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      image.data[i] = 128 + Math.sin(x * .052 + y * .031) * 12 + Math.sin(x * .37) * 2;
      image.data[i + 1] = 128 + Math.cos(y * .062 - x * .012) * 9;
      image.data[i + 2] = 253; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function box(parent, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function beam(parent, from, to, radius, material, segments = 8) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(a.add(b).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function freezeStaticTransforms(root){
  root.traverse(object=>{
    if(object.isLight)return;
    object.updateMatrix();
    object.matrixAutoUpdate=false;
  });
  root.updateMatrixWorld(true);
}

export function textTexture(text, { width = 512, height = 128, color = '#cfb77f', background = null, size = 25 } = {}) {
  return canvasTexture(width, height, ctx => {
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      ctx.font = `${i === 0 ? '600' : '400'} ${i === 0 ? size : size * .54}px Manrope, sans-serif`;
      ctx.fillText(line, width / 2, height / 2 + (i - (lines.length - 1) / 2) * size * 1.65);
    });
  });
}

function placeholderTexture(card, failed = false) {
  return canvasTexture(252, 352, (ctx, w, h) => {
    ctx.fillStyle = '#263540'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b9a57b'; ctx.lineWidth = 2; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = '#b9a57b40'; ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.fillStyle = '#e1cfab'; ctx.textAlign = 'center'; ctx.font = '500 12px sans-serif';
    ctx.fillText('30TH CELEBRATION', w / 2, 76);
    ctx.font = '600 19px sans-serif';
    const words = card.name.split(' '), lines = [''];
    for (const word of words) {
      const last = lines.length - 1;
      if (ctx.measureText(`${lines[last]} ${word}`).width > 205 && lines[last]) lines.push(word);
      else lines[last] = `${lines[last]} ${word}`.trim();
    }
    lines.forEach((line, i) => ctx.fillText(line, w / 2, 150 + i * 25));
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#bac4c9';
    ctx.fillText(card.number, w / 2, 233);
    ctx.fillText(failed ? 'Image unavailable' : card.image ? 'Loading artwork' : 'Artwork pending', w / 2, 280);
  });
}

export function setCardHeld(material, held) {
  if (material.transparent !== held) {
    material.transparent = held;
    material.needsUpdate = true;
  }
  material.opacity = held ? .32 : 1;
}

export class CardTextures {
  constructor(onError,onChange=()=>{}) {
    this.entries = new Map();
    this.loader = new THREE.TextureLoader();
    this.onError = onError;
    this.onChange = onChange;
    this.disposed = false;
    this.finishes=new CardFinishLibrary();
  }

  material(id) {
    const card = CARD_BY_ID.get(id);
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { texture: placeholderTexture(card), materials: new Set(), time: performance.now(), ready: null };
      this.entries.set(id, entry);
      if (card.image) {
        entry.ready = new Promise(resolve => {
          this.loader.load(cardImage(card, true), texture => {
            if (this.disposed || this.entries.get(id) !== entry) { texture.dispose(); resolve(); return; }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            entry.texture.dispose();
            entry.texture = texture;
            entry.materials.forEach(material => { material.map = texture; material.needsUpdate = true; });
            this.onChange();
            resolve();
          }, undefined, () => {
            if (!this.disposed && this.entries.get(id) === entry) {
              entry.texture.dispose();
              entry.texture = placeholderTexture(card, true);
              entry.materials.forEach(material => { material.map = entry.texture; material.needsUpdate = true; });
              this.onChange();
              this.onError(`Artwork for ${card.name} could not load. The card is still available to organize.`);
            }
            resolve();
          });
        });
      }
    }
    const material = new THREE.MeshPhysicalMaterial({
      map: entry.texture, roughness: .7, metalness: 0, clearcoat: .08, clearcoatRoughness: .6, specularIntensity:.45,
      side: THREE.FrontSide, color: 0xf7f7f7,
    });
    this.finishes.apply(material,card);
    material.userData.cardId = id;
    entry.materials.add(material);
    entry.time = performance.now();
    return material;
  }

  release(material) {
    const entry = this.entries.get(material.userData.cardId);
    entry?.materials.delete(material);
    material.dispose();
  }

  trim() {
    const unused = [...this.entries].filter(([, entry]) => !entry.materials.size).sort((a, b) => a[1].time - b[1].time);
    for (const [id, entry] of unused) {
      if (this.entries.size <= 40) break;
      entry.texture.dispose();
      this.entries.delete(id);
    }
  }

  async ready() {
    await Promise.all([...this.entries.values()].map(entry => entry.ready));
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.texture.dispose();
      entry.materials.forEach(material => material.dispose());
    }
    this.entries.clear();
    this.finishes.dispose();
  }
}
