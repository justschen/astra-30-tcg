import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { compressedAsset } from './compressed-asset.js';
import { canvasTexture, contactShadow, random } from './materials.js';

export const PLANT_MODELS = ['potted_plant_01', 'potted_plant_02'];
export const HOUSEPLANTS = [
  { id: 'window-tree', model: 'potted_plant_01', position: [6.42, -1.52, -5.05], height: 4.15, yaw: .55 },
  { id: 'reading-plant', model: 'potted_plant_02', position: [-8.22, -1.52, 4.05], height: 1.95, yaw: 1.1 },
  { id: 'shelf-plant', model: 'potted_plant_02', position: [-8.79, 1.10, 1.01], height: .93, yaw: -.5 },
  { id: 'hall-plant', model: 'potted_plant_02', position: [13.37, -1.52, 1.16], height: 1.03, yaw: 2.1 },
];

function disposePlant(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  textures.forEach(texture => { texture.dispose(); texture.image?.close?.(); });
}

export async function loadRoomPlants(onWarning) {
  const loader = new GLTFLoader(), templates = new Map();
  const results = await Promise.allSettled(PLANT_MODELS.map(async id => {
    const data = await compressedAsset(new URL(`room/plants/${id}.glb.gz`, document.baseURI), `Houseplant ${id}`);
    const gltf = await loader.parseAsync(data, '');
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true;
      const material = object.material;
      material.metalness = 0; material.envMapIntensity = .65;
      material.normalScale.setScalar(.65);
      if (material.name.endsWith('_leaves')) {
        material.alphaTest = .48; material.alphaToCoverage = true; material.side = THREE.DoubleSide;
        material.shadowSide = THREE.DoubleSide; material.roughness = .94;
      }
      for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = 4;
    });
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    if (bounds.isEmpty() || bounds.max.y - bounds.min.y < .1) { disposePlant(gltf.scene); throw new Error(`Invalid houseplant bounds: ${id}`); }
    templates.set(id, { root: gltf.scene, bounds });
  }));
  const failed = results.flatMap((result, index) => result.status === 'rejected' ? [PLANT_MODELS[index]] : []);
  if (failed.length) {
    results.forEach(result => { if (result.status === 'rejected') console.warn('Detailed houseplant could not load.', result.reason); });
    onWarning(`Some houseplants could not load (${failed.join(', ')}). The room and binder remain usable. Reload to retry.`);
  }
  return { templates, failed, dispose() { templates.forEach(({ root }) => disposePlant(root)); } };
}

export function createHouseplants(parent, library) {
  const root = new THREE.Group(); root.name = 'Photographic houseplant materials and botanical geometry'; parent.add(root);
  root.userData.plantCount = HOUSEPLANTS.filter(spec => library.templates.has(spec.model)).length;
  root.userData.failed = library.failed;
  if (!root.userData.plantCount) return root;
  const soilMap = canvasTexture(256, 256, (ctx, w, h) => {
    const rng = random(9342); ctx.fillStyle = '#30271c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = ['#1a1913', '#544536', '#71604a', '#988871'][i % 4];
      ctx.beginPath(); ctx.ellipse(rng() * w, rng() * h, .5 + rng() * 2, .4 + rng(), rng() * 6, 0, Math.PI * 2); ctx.fill();
    }
  });
  const soil = new THREE.MeshStandardMaterial({ map: soilMap, roughness: 1 });
  const soilGeometry = new THREE.CircleGeometry(1, 48);
  for (const spec of HOUSEPLANTS) {
    const template = library.templates.get(spec.model);
    if (!template) continue;
    const plant = new THREE.Group(); plant.name = `Houseplant ${spec.id}`;
    const scale = spec.height / (template.bounds.max.y - template.bounds.min.y);
    plant.position.set(...spec.position); plant.rotation.y = spec.yaw; plant.scale.setScalar(scale);
    const model = template.root.clone(true); model.position.y -= template.bounds.min.y; plant.add(model);
    const earth = new THREE.Mesh(soilGeometry, soil);
    earth.rotation.x = -Math.PI / 2;
    earth.scale.setScalar(spec.model === 'potted_plant_01' ? .210 : .216);
    earth.position.y = (spec.model === 'potted_plant_01' ? .49 : .306) - template.bounds.min.y; plant.add(earth);
    plant.userData = { model: spec.model, source: 'Poly Haven, CC0', targetHeight: spec.height };
    root.add(plant);
    const diameter = scale * .52;
    contactShadow(root, [diameter * 1.45, diameter * 1.45], [spec.position[0], spec.position[1] + .004, spec.position[2]], .38);
  }
  return root;
}
