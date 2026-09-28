import * as THREE from 'three';
import { compressedAsset as readCompressedAsset } from './compressed-asset.js';
import { CITY_GROUND } from './city-layout.js';
import { SURVEY_ORIGIN } from './city-survey-layout.js';
import { ArchitectureDetails, createArchitectureMaterial } from './city-architecture.js';
import { REFERENCE_BUILDINGS, createReferenceBuilding, decorateReferenceBuilding } from './city-reference-buildings.js';

export function unpackCityGeometry(buffer) {
  const header = new DataView(buffer);
  if (buffer.byteLength < 64 || header.getUint32(0, false) !== 0x41484332 || header.getUint32(12, true) !== 4) throw new Error('Unsupported Tokyo geometry format.');
  const vertices = header.getUint32(4, true), indices = header.getUint32(8, true);
  if (!vertices || !indices || indices % 3 || buffer.byteLength !== 64 + vertices * 20 + indices * 4) throw new Error('Incomplete Tokyo geometry.');
  const position = new THREE.Vector3(...[16, 20, 24].map(offset => header.getFloat32(offset, true)));
  const size = new THREE.Vector3(...[28, 32, 36].map(offset => header.getFloat32(offset, true)));
  if (![...position, ...size].every(Number.isFinite) || size.toArray().some(value => value <= 0)) throw new Error('Invalid Tokyo geometry bounds.');
  const index = new Uint32Array(buffer, 64 + vertices * 20, indices);
  if (index.some(value => value >= vertices)) throw new Error('Invalid Tokyo geometry indices.');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Uint16Array(buffer, 64, vertices * 3), 3, true));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(buffer, 64 + vertices * 6, vertices * 3), 3, true));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(buffer, 64 + vertices * 12, vertices * 2), 2, true));
  geometry.setAttribute('surveyLight', new THREE.BufferAttribute(new Uint8Array(buffer, 64 + vertices * 16, vertices * 4), 4, true));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, position, size };
}

function surveyMaterial(textured, uniforms, occupancy) {
  const material = new THREE.MeshStandardMaterial({
    color: textured ? 0xffffff : 0xa8adae, roughness: .86, metalness: .035, envMapIntensity: .45,
  });
  material.name = textured ? 'PLATEAU photographed surfaces with relightable windows' : 'PLATEAU untextured architectural surfaces';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { surveyOccupancy: { value: occupancy } });
    shader.vertexShader = `
      attribute vec4 surveyLight;
      varying vec4 vSurveyLight;
      varying vec3 vSurveyPosition;
      varying vec3 vSurveyFace;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', `
      #include <defaultnormal_vertex>
      vSurveyFace = inverseTransformDirection(transformedNormal, viewMatrix);
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vSurveyPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vSurveyLight = surveyLight;
    `);
    shader.fragmentShader = `
      uniform float cityNight;
      uniform float cityWindows;
      uniform float cityClock;
      uniform float cityWetness;
      uniform sampler2D surveyOccupancy;
      varying vec4 vSurveyLight;
      varying vec3 vSurveyPosition;
      varying vec3 vSurveyFace;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float surveyRoof = smoothstep(.36, .78, abs(normalize(vSurveyFace).y));
      float surveyGlass = ${textured ? 'texture2D(emissiveMap, vEmissiveMapUv).r' : '1.0'} * (1.0 - surveyRoof);
      diffuseColor.rgb *= .94;
      diffuseColor.rgb *= 1.0 - cityWetness * .12 * surveyRoof;
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(.88, .32, surveyGlass);
      roughnessFactor *= 1.0 - cityWetness * .13;
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float surveySeed = vSurveyLight.a * 100.0;
      float horizontal = abs(vSurveyFace.z) > abs(vSurveyFace.x) ? vSurveyPosition.x : vSurveyPosition.z;
      vec2 grid = vec2(horizontal / ${(SURVEY_ORIGIN.scale * 1.85).toFixed(6)}, (vSurveyPosition.y - ${CITY_GROUND.toFixed(1)}) / ${(SURVEY_ORIGIN.scale * 3.1).toFixed(6)});
      vec2 rooms = texture2D(surveyOccupancy, (grid + vec2(surveySeed, surveySeed * .37)) / 64.0).rg;
      float activity = .5 + .5 * sin(cityClock * .025 + surveySeed);
      float occupied = mix(rooms.r, rooms.g, activity);
      totalEmissiveRadiance += vSurveyLight.rgb * occupied * surveyGlass * cityNight * cityWindows * 1.2;
    `);
  };
  material.customProgramCacheKey = () => `plateau-surface-${textured}-v1`;
  return material;
}

const compressedAsset = url => readCompressedAsset(url, 'Tokyo asset');

export async function createCitySurvey(parent, uniforms, facades, assets, onProgress, onWarning = () => {}) {
  onProgress?.('Loading Tokyo architecture...');
  const base = new URL('city/', document.baseURI);
  const manifest = JSON.parse(new TextDecoder().decode(await compressedAsset(new URL('manifest.json.gz',base).href)));
  if (manifest.version !== 1 || !Array.isArray(manifest.tiles) || !manifest.tiles.length || !Array.isArray(manifest.buildings)) throw new Error('Invalid Tokyo survey manifest.');
  const assetURL = filename => {
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) throw new Error('Invalid local Tokyo asset path.');
    return new URL(filename, base).href;
  };
  const group = new THREE.Group();
  group.name = 'Surveyed Minato architecture: real roofs, setbacks and facade atlases';
  group.userData.surveyedBuildings = manifest.buildings.length;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const placements = new Map(manifest.buildings.filter(spec => spec.authoredPlacement).map(spec => [`hero-${spec.id}`, spec]));
  let offset = 0;
  const tileBuildings = new Map(manifest.tiles.map(tile => {
    const entries = manifest.buildings.slice(offset, offset + tile.buildings); offset += tile.buildings;
    return [tile.id, entries];
  }));
  if (offset !== manifest.buildings.length) throw new Error('Tokyo tile membership does not match the manifest.');
  const facadesByBuilding = new Map();
  const meshesByBuilding=new Map();
  const details = new ArchitectureDetails(group);
  materials.add(details.frame); materials.add(details.sill); materials.add(details.vent);
  const loader = new THREE.TextureLoader();
  const failed = [];
  let next = 0;
  const worker = async () => {
    while (next < manifest.tiles.length) {
      const tile = manifest.tiles[next++];
      const placement = placements.get(tile.id), reference=placement&&REFERENCE_BUILDINGS[placement.id];
      const tileGeometries = new Set(), tileMaterials = new Set(), tileTextures = new Set();
      try {
      const parsed = reference ? createReferenceBuilding(placement) : unpackCityGeometry(await compressedAsset(assetURL(tile.geometry)));
      tileGeometries.add(parsed.geometry);
      if (!reference&&(parsed.geometry.attributes.position.count !== tile.vertices || parsed.geometry.index.count !== tile.triangles * 3)) throw new Error('Tokyo geometry does not match its manifest.');
      const surfaceMaterials = [];
      if (placement) {
        const material = createArchitectureMaterial(placement, uniforms, assets, facades[placement.style].emissiveMap);
        tileMaterials.add(material); surfaceMaterials.push(material);
      }
      for (const surface of placement ? [] : tile.materials) {
        const material = surveyMaterial(surface.textured, uniforms, facades.office.emissiveMap); tileMaterials.add(material);
        if (surface.textured) {
          material.map = await loader.loadAsync(assetURL(surface.map)); tileTextures.add(material.map);
          material.map.colorSpace = THREE.SRGBColorSpace; material.map.flipY = false; material.map.anisotropy = 4;
          const bytes = await compressedAsset(assetURL(surface.windows));
          if (bytes.byteLength !== surface.width * surface.height) throw new Error('Tokyo window mask is incomplete.');
          const mask = new THREE.DataTexture(new Uint8Array(bytes), surface.width, surface.height, THREE.RedFormat);
          mask.generateMipmaps = true; mask.minFilter = THREE.LinearMipmapLinearFilter; mask.magFilter = THREE.LinearFilter;
          mask.anisotropy = 4; mask.needsUpdate = true; mask.name = 'Filtered facade glass classification'; tileTextures.add(mask);
          material.emissiveMap = mask;
        }
        surfaceMaterials.push(material);
      }
      let end = reference?parsed.geometry.index.count:0;
      for (const part of reference?[]:tile.groups) {
        if (part.start !== end || part.count % 3 || !tile.materials[part.material]) throw new Error('Invalid Tokyo material groups.');
        if (!placement) parsed.geometry.addGroup(part.start, part.count, part.material); end += part.count;
      }
      if (end !== parsed.geometry.index.count) throw new Error('Tokyo material groups do not cover the geometry.');
      if (placement) parsed.geometry.addGroup(0, end, 0);
      const mesh = new THREE.Mesh(parsed.geometry, surfaceMaterials);
      mesh.position.copy(parsed.position); mesh.scale.copy(parsed.size);
      mesh.name = reference?reference.label:`PLATEAU ${tile.id} (${tile.buildings} buildings)`;
      mesh.userData.surveyedBuildings = reference?0:tile.buildings; mesh.userData.architecturalFacade = Boolean(placement);
      mesh.userData.referenceBuilding=reference?.shape;
      mesh.castShadow = parsed.position.z + parsed.size.z / 2 > -440; mesh.receiveShadow = true;
      group.add(mesh);
      if(placement){meshesByBuilding.set(placement.id,mesh);facadesByBuilding.set(placement.id,details.add(parsed,placement));}
      if(reference){
        placement.referenceBuilding=reference.shape;
        const decoration=decorateReferenceBuilding(group,placement,uniforms);
        decoration.traverse(object=>{if(object.geometry)tileGeometries.add(object.geometry);if(object.material)tileMaterials.add(object.material);});
      }
      tileGeometries.forEach(geometry => geometries.add(geometry)); tileMaterials.forEach(material => materials.add(material)); tileTextures.forEach(texture => textures.add(texture));
      } catch (error) {
        tileGeometries.forEach(geometry => geometry.dispose()); tileMaterials.forEach(material => material.dispose()); tileTextures.forEach(texture => texture.dispose());
        console.warn(`Tokyo district ${tile.id} could not load; using its recorded building bounds.`, error);
        failed.push(tile.id);
        const bounds = tileBuildings.get(tile.id);
        const material = placement ? createArchitectureMaterial(placement, uniforms, assets, facades[placement.style].emissiveMap)
          : new THREE.MeshStandardMaterial({ color: 0x8c989e, roughness: .85, metalness: .05 });
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        geometries.add(geometry); materials.add(material);
        if (placement) {
          const parsed = { geometry, position: new THREE.Vector3(placement.x, CITY_GROUND + placement.height / 2, placement.z), size: new THREE.Vector3(placement.width, placement.height, placement.depth) };
          const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(parsed.position); mesh.scale.copy(parsed.size);
          mesh.name = `Unavailable detailed building: ${placement.id}`; mesh.userData.surveyedBuildings = 1; mesh.userData.cityFallback = true; group.add(mesh);
          facadesByBuilding.set(placement.id, details.add(parsed, placement)); meshesByBuilding.set(placement.id, mesh);
        } else {
          const mesh = new THREE.InstancedMesh(geometry, material, bounds.length), transform = new THREE.Object3D();
          bounds.forEach((spec, index) => {
            transform.position.set(spec.x, CITY_GROUND + spec.height / 2, spec.z); transform.scale.set(spec.width, spec.height, spec.depth); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
          });
          mesh.name = `Unavailable district: ${tile.id}`; mesh.userData.surveyedBuildings = bounds.length; mesh.userData.cityFallback = true; group.add(mesh);
        }
      }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: 4 }, worker));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    throw new Error('The detailed Tokyo neighborhood could not be prepared. Your saved collection is unchanged.', { cause: failure.reason });
  }
  details.finish();
  group.userData.failedTiles = failed;
  if (failed.length) onWarning(`${failed.length} Tokyo district${failed.length === 1 ? '' : 's'} could not load. Simplified building outlines are shown; your binder is fully available. Reload the city to retry.`);
  parent.add(group);
  return { group, buildings: manifest.buildings, bytes: manifest.bytes, triangles: manifest.triangles, facades: facadesByBuilding,meshes:meshesByBuilding,failed };
}
