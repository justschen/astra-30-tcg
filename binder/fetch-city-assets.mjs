import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import * as THREE from 'three';
import { CITY_GROUND, CITY_STREETS, HERO_BUILDINGS } from './src/city-layout.js';
import { createRoadRibbon } from './src/city-roads.js';
import { cityIdentity } from './src/city-life.js';
import { SURVEY_BOUNDS, SURVEY_ORIGIN, SURVEY_SOURCE, keepAuthoredBuilding, surveyBuildingAllowed, surveyLocation, surveyNormal, surveyPoint } from './src/city-survey-layout.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'public/city');
const cache = path.resolve(root, '../tools/.cache/binder-city', createHash('sha256').update(SURVEY_SOURCE).digest('hex').slice(0, 12));
const decoderModule = draco.createDecoderModule({});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = bytes => JSON.parse(bytes.toString('utf8').replace(/\0+$/, '').trim());
const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function scalar(batch, binary, key, index) {
  const value = batch[key];
  if (Array.isArray(value)) return value[index];
  if (value?.componentType === 'BYTE') return binary.readInt8(value.byteOffset + index);
  if (value?.componentType === 'DOUBLE') return binary.readDoubleLE(value.byteOffset + index * 8);
  throw new Error(`Unsupported PLATEAU metadata attribute: ${key}`);
}

function accessorData(json, binary, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  const readers = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
  const reader = readers[accessor.componentType], size = dimensions[accessor.type];
  if (!reader || !size || accessor.sparse) throw new Error('Unsupported uncompressed city accessor.');
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || size * reader[1];
  const values = new Float64Array(accessor.count * size);
  for (let i = 0; i < accessor.count; i++) for (let j = 0; j < size; j++) {
    values[i * size + j] = binary[reader[0]](start + i * stride + j * reader[1]);
  }
  return values;
}

async function decodePrimitive(json, binary, primitive) {
  const extension = primitive.extensions?.KHR_draco_mesh_compression;
  if (!extension) {
    return {
      attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessorData(json, binary, index)])),
      indices: accessorData(json, binary, primitive.indices),
    };
  }
  const module = await decoderModule;
  const decoder = new module.Decoder(), buffer = new module.DecoderBuffer(), mesh = new module.Mesh();
  const view = json.bufferViews[extension.bufferView];
  const bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  buffer.Init(bytes, bytes.length);
  const status = decoder.DecodeBufferToMesh(buffer, mesh);
  try {
    if (!status.ok()) throw new Error(`Draco city geometry: ${status.error_msg()}`);
    const attributes = {};
    for (const [name, id] of Object.entries(extension.attributes)) {
      const attribute = decoder.GetAttributeByUniqueId(mesh, id), values = new module.DracoFloat32Array();
      try {
        if (!decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)) throw new Error(`Could not decode city ${name}.`);
        attributes[name] = Float32Array.from({ length: values.size() }, (_, index) => values.GetValue(index));
      } finally { module.destroy(values); }
    }
    const face = new module.DracoInt32Array(), indices = new Uint32Array(mesh.num_faces() * 3);
    try {
      for (let i = 0; i < mesh.num_faces(); i++) {
        decoder.GetFaceFromMesh(mesh, i, face);
        for (let j = 0; j < 3; j++) indices[i * 3 + j] = face.GetValue(j);
      }
    } finally { module.destroy(face); }
    return { attributes, indices };
  } finally {
    module.destroy(status); module.destroy(mesh); module.destroy(buffer); module.destroy(decoder);
  }
}

export async function decodeCityTile(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'b3dm' || bytes.readUInt32LE(4) !== 1 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Invalid B3DM city tile.');
  }
  const lengths = [12, 16, 20, 24].map(offset => bytes.readUInt32LE(offset));
  const feature = readJSON(bytes.subarray(28, 28 + lengths[0]));
  const batchStart = 28 + lengths[0] + lengths[1];
  const batch = readJSON(bytes.subarray(batchStart, batchStart + lengths[2]));
  const batchBinary = bytes.subarray(batchStart + lengths[2], batchStart + lengths[2] + lengths[3]);
  const start = 28 + lengths.reduce((sum, value) => sum + value, 0);
  if (bytes.toString('ascii', start, start + 4) !== 'glTF' || bytes.readUInt32LE(start + 4) !== 2) throw new Error('Expected an embedded glTF 2.0 city model.');
  const jsonLength = bytes.readUInt32LE(start + 12), json = readJSON(bytes.subarray(start + 20, start + 20 + jsonLength));
  const binary = bytes.subarray(start + 28 + jsonLength);
  const center = json.extensions?.CESIUM_RTC?.center;
  if (!center?.every(Number.isFinite) || center.length !== 3 || !Array.isArray(batch.gml_id)) throw new Error('City tile is missing its geospatial frame or building IDs.');
  if (json.nodes.some(node => node.matrix || node.translation || node.rotation || node.scale)) throw new Error('Unexpected nested city transform; update the importer before using this dataset.');
  const features = Array.from({ length: feature.BATCH_LENGTH }, (_, i) => ({
    sourceId: batch.gml_id[i], lod: scalar(batch, batchBinary, '_lod', i),
    minimum: [Infinity, Infinity, Infinity], maximum: [-Infinity, -Infinity, -Infinity],
    measuredHeight: batch['bldg:measuredHeight']?.[i],
  }));
  const parts = [];
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Expected triangle city geometry.');
    const decoded = await decodePrimitive(json, binary, primitive);
    const { POSITION: positions, NORMAL: normals, TEXCOORD_0: uv, _BATCHID: ids } = decoded.attributes;
    if (!positions || !normals || !ids) throw new Error('City mesh is missing positions, normals, or building IDs.');
    const world = new Float32Array(positions.length), directions = new Float32Array(normals.length);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], building = features[id];
      if (!Number.isInteger(id) || !building) throw new Error('Invalid city building ID.');
      const point = surveyPoint(center, positions.subarray(i * 3, i * 3 + 3));
      const normal = surveyNormal(normals.subarray(i * 3, i * 3 + 3));
      if (![...point, ...normal].every(Number.isFinite)) throw new Error('Non-finite survey geometry.');
      world.set(point, i * 3); directions.set(normal, i * 3);
      for (let axis = 0; axis < 3; axis++) {
        building.minimum[axis] = Math.min(building.minimum[axis], point[axis]);
        building.maximum[axis] = Math.max(building.maximum[axis], point[axis]);
      }
    }
    parts.push({ positions: world, normals: directions, uv, ids, indices: decoded.indices, material: primitive.material });
  }
  features.forEach(building => {
    const { minimum: min, maximum: max } = building;
    Object.assign(building, { x: (min[0] + max[0]) / 2, z: (min[2] + max[2]) / 2, width: max[0] - min[0], depth: max[2] - min[2], height: max[1] - min[1] });
  });
  return { json, binary, features, parts };
}

const roadBounds = CITY_STREETS.flatMap(street => {
  const curve = new THREE.CatmullRomCurve3(street.points.map(([x, z]) => new THREE.Vector3(x, CITY_GROUND + .055, z)), false, 'centripetal');
  return createRoadRibbon(curve, street.width).quads;
});

export function clearOfRoads(building) {
  return !roadBounds.some(road => building.x + building.width / 2 + .6 > road.minX && building.x - building.width / 2 - .6 < road.maxX
    && building.z + building.depth / 2 + .6 > road.minZ && building.z - building.depth / 2 - .6 < road.maxZ);
}

async function download(url, filename) {
  const target = path.join(cache, filename);
  try { return await fs.readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`City source returned HTTP ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12_000_000) throw new Error(`Unexpectedly large city tile: ${url}`);
  await fs.writeFile(target, bytes);
  return bytes;
}

function selectTiles(tileset) {
  const tiles = [];
  const walk = node => {
    if (node.transform) throw new Error('Unexpected tileset transform.');
    const region = node.boundingVolume.region;
    if (!region) throw new Error('Expected geographic city tile bounds.');
    const corners = [region[0], region[2]].flatMap(lon => [region[1], region[3]].map(lat => surveyLocation(lon * 180 / Math.PI, lat * 180 / Math.PI)));
    const minX = Math.min(...corners.map(p => p[0])), maxX = Math.max(...corners.map(p => p[0]));
    const minZ = Math.min(...corners.map(p => p[2])), maxZ = Math.max(...corners.map(p => p[2]));
    if (minX > SURVEY_BOUNDS.right || maxX < SURVEY_BOUNDS.left || minZ > SURVEY_BOUNDS.near || maxZ < SURVEY_BOUNDS.far) return;
    if (node.children?.length) node.children.forEach(walk);
    else if (node.content?.uri) {
      if (!/^data\/data\d+\.b3dm$/.test(node.content.uri)) throw new Error('Unexpected city tile content path.');
      tiles.push({ uri: node.content.uri, z: (minZ + maxZ) / 2 });
    }
  };
  walk(tileset.root);
  if (tiles.length > 140 || !tiles.length) throw new Error(`Unexpected survey subset size: ${tiles.length}`);
  return tiles.sort((a, b) => a.uri.localeCompare(b.uri, undefined, { numeric: true }));
}

const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const linearSamples = Float64Array.from({ length: 256 }, (_, value) => linear(value / 255));

function sourceImage(json, binary, index) {
  const material = json.materials[index], textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
  if (textureIndex === undefined) return null;
  const texture = json.textures[textureIndex], imageIndex = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  const image = json.images[imageIndex], view = json.bufferViews[image.bufferView];
  if (!view || image.uri) throw new Error('City textures must be embedded in the source tile.');
  return binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}

function foregroundCandidates(decoded, tile) {
  const candidates = decoded.features.map(feature => ({ ...feature, uri: tile.uri, triangles: 0, walls: 0, photographedWalls: 0, roofs: 0, flatRoofs: 0, sine: 0, cosine: 0 }));
  for (const part of decoded.parts) {
    const photographed = part.uv && decoded.json.materials[part.material].pbrMetallicRoughness?.baseColorTexture;
    for (let i = 0; i < part.indices.length; i += 3) {
      const [a, b, c] = part.indices.subarray(i, i + 3), candidate = candidates[part.ids[a]];
      const ab = [0, 1, 2].map(axis => part.positions[b * 3 + axis] - part.positions[a * 3 + axis]);
      const ac = [0, 1, 2].map(axis => part.positions[c * 3 + axis] - part.positions[a * 3 + axis]);
      const area = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2;
      const [nx, ny, nz] = part.normals.subarray(a * 3, a * 3 + 3);
      candidate.triangles++;
      if (Math.abs(ny) < .15) {
        candidate.walls += area; if (photographed) candidate.photographedWalls += area;
        const angle = Math.atan2(nx, nz);
        candidate.sine += Math.sin(angle * 4) * area; candidate.cosine += Math.cos(angle * 4) * area;
      }
      if (ny > .35) { candidate.roofs += area; if (ny > .98) candidate.flatRoofs += area; }
    }
  }
  for (const candidate of candidates) {
    candidate.angle = Math.atan2(candidate.sine, candidate.cosine) / 4;
    candidate.minX = Infinity; candidate.maxX = -Infinity; candidate.minZ = Infinity; candidate.maxZ = -Infinity;
  }
  for (const part of decoded.parts) for (let i = 0; i < part.ids.length; i++) {
    const candidate = candidates[part.ids[i]], c = Math.cos(candidate.angle), s = Math.sin(candidate.angle);
    const x = part.positions[i * 3] - candidate.x, z = part.positions[i * 3 + 2] - candidate.z;
    const rx = x * c - z * s, rz = x * s + z * c;
    candidate.minX = Math.min(candidate.minX, rx); candidate.maxX = Math.max(candidate.maxX, rx);
    candidate.minZ = Math.min(candidate.minZ, rz); candidate.maxZ = Math.max(candidate.maxZ, rz);
  }
  return candidates.filter(candidate => candidate.lod >= 2 && candidate.triangles >= 45 && candidate.walls > 1
    && candidate.photographedWalls / candidate.walls > .6 && candidate.flatRoofs / candidate.roofs > .55)
    .map(candidate => ({ ...candidate, width: candidate.maxX - candidate.minX, depth: candidate.maxZ - candidate.minZ }));
}

function selectForegroundModels(candidates) {
  const used = new Set(), selected = [];
  const templates = HERO_BUILDINGS.filter(keepAuthoredBuilding).sort((a, b) => b.width * b.height / b.z ** 2 - a.width * a.height / a.z ** 2);
  for (const template of templates) {
    let best = null, score = Infinity;
    for (const candidate of candidates) for (const swap of [false, true]) {
      if (used.has(candidate.sourceId)) continue;
      const width = swap ? candidate.depth : candidate.width, depth = swap ? candidate.width : candidate.depth;
      const scale = [template.width / width, template.height / candidate.height, template.depth / depth];
      if (scale[1] < .6 || scale[1] > 1.6 || Math.max(...scale) / Math.min(...scale) > 1.9) continue;
      const fit = Math.abs(Math.log(scale[0] / scale[1])) + Math.abs(Math.log(scale[2] / scale[1])) + Math.abs(Math.log(scale[1])) * .6;
      if (fit < score) { score = fit; best = { ...candidate, swap, template }; }
    }
    if (!best) {
      console.warn(`No proportionate photographed model for ${template.id}; its authored geometry is retained.`);
      continue;
    }
    used.add(best.sourceId);
    selected.push({ uri: best.uri, z: template.z, replacement: best });
  }
  if (selected.length < 18) throw new Error(`Not enough suitable foreground buildings: ${selected.length}.`);
  return selected;
}

async function repackForegroundTextures(decoded, buildingId) {
  const images = new Map();
  for (let material = 0; material < decoded.json.materials.length; material++) {
    const source = sourceImage(decoded.json, decoded.binary, material);
    if (!source) continue;
    const { width, height } = await sharp(source).metadata(), triangles = [], roots = [], vertices = new Map();
    const find = index => {
      let root = index;
      while (roots[root] !== root) root = roots[root];
      while (roots[index] !== index) { const next = roots[index]; roots[index] = root; index = next; }
      return root;
    };
    decoded.parts.forEach((part, partIndex) => {
      if (part.material !== material || !part.uv) return;
      for (let i = 0; i < part.indices.length; i += 3) {
        const ids = Array.from(part.indices.subarray(i, i + 3));
        if (part.ids[ids[0]] !== buildingId) continue;
        const triangle = triangles.length; roots.push(triangle); triangles.push({ part, partIndex, ids });
        for (const id of ids) {
          const key = `${Math.round(part.uv[id * 2] * width * 16)}:${Math.round(part.uv[id * 2 + 1] * height * 16)}`;
          if (vertices.has(key)) roots[find(triangle)] = find(vertices.get(key));
          else vertices.set(key, triangle);
        }
      }
    });
    if (!triangles.length) continue;
    const islands = new Map();
    triangles.forEach((triangle, index) => {
      const root = find(index);
      if (!islands.has(root)) islands.set(root, { vertices: new Map(), minU: 1, minV: 1, maxU: 0, maxV: 0 });
      const island = islands.get(root);
      for (const id of triangle.ids) {
        const uv = [triangle.part.uv[id * 2], triangle.part.uv[id * 2 + 1]];
        island.vertices.set(`${triangle.partIndex}:${id}`, { part: triangle.part, id, uv });
        island.minU = Math.min(island.minU, uv[0]); island.maxU = Math.max(island.maxU, uv[0]);
        island.minV = Math.min(island.minV, uv[1]); island.maxV = Math.max(island.maxV, uv[1]);
      }
    });
    const rectangles = [...islands.values()].map(island => {
      const left = Math.max(0, Math.floor(island.minU * width) - 2), top = Math.max(0, Math.floor(island.minV * height) - 2);
      const right = Math.min(width, Math.ceil(island.maxU * width) + 2), bottom = Math.min(height, Math.ceil(island.maxV * height) + 2);
      return { ...island, left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
    }).sort((a, b) => b.height - a.height || b.width - a.width);
    const area = rectangles.reduce((sum, rectangle) => sum + (rectangle.width + 4) * (rectangle.height + 4), 0);
    const atlasWidth = 2 ** Math.ceil(Math.log2(Math.max(32, Math.sqrt(area) * 1.12, ...rectangles.map(rectangle => rectangle.width + 4))));
    let x = 2, y = 2, rowHeight = 0;
    for (const rectangle of rectangles) {
      if (x + rectangle.width + 2 > atlasWidth) { x = 2; y += rowHeight + 4; rowHeight = 0; }
      rectangle.x = x; rectangle.y = y; x += rectangle.width + 4; rowHeight = Math.max(rowHeight, rectangle.height);
    }
    const atlasHeight = y + rowHeight + 2, composites = [];
    for (const rectangle of rectangles) {
      composites.push({
        input: await sharp(source).extract({ left: rectangle.left, top: rectangle.top, width: rectangle.width, height: rectangle.height }).png().toBuffer(),
        left: rectangle.x, top: rectangle.y,
      });
      for (const { part, id, uv } of rectangle.vertices.values()) {
        part.uv[id * 2] = (uv[0] * width - rectangle.left + rectangle.x) / atlasWidth;
        part.uv[id * 2 + 1] = (uv[1] * height - rectangle.top + rectangle.y) / atlasHeight;
      }
    }
    images.set(material, await sharp({ create: { width: atlasWidth, height: atlasHeight, channels: 3, background: '#7a8185' } })
      .composite(composites).png().toBuffer());
  }
  return images;
}

async function fitForegroundModel(decoded, replacement) {
  const index = decoded.features.findIndex(feature => feature.sourceId === replacement.sourceId);
  if (index < 0) throw new Error('Foreground source building was not found.');
  const feature = decoded.features[index], spec = replacement.template;
  const angle = replacement.angle + (replacement.swap ? Math.PI / 2 : 0), c = Math.cos(angle), s = Math.sin(angle);
  const min = [Infinity, feature.minimum[1], Infinity], max = [-Infinity, feature.maximum[1], -Infinity];
  for (const part of decoded.parts) for (let i = 0; i < part.ids.length; i++) if (part.ids[i] === index) {
    const x = part.positions[i * 3] - feature.x, z = part.positions[i * 3 + 2] - feature.z;
    const rx = x * c - z * s, rz = x * s + z * c;
    min[0] = Math.min(min[0], rx); max[0] = Math.max(max[0], rx); min[2] = Math.min(min[2], rz); max[2] = Math.max(max[2], rz);
  }
  const images = await repackForegroundTextures(decoded, index);
  const scale = [spec.width / (max[0] - min[0]), spec.height / (max[1] - min[1]), spec.depth / (max[2] - min[2])];
  const cy = Math.cos(spec.yaw), sy = Math.sin(spec.yaw);
  for (const part of decoded.parts) for (let i = 0; i < part.ids.length; i++) if (part.ids[i] === index) {
    const x = part.positions[i * 3] - feature.x, z = part.positions[i * 3 + 2] - feature.z;
    const rx = (x * c - z * s - (min[0] + max[0]) / 2) * scale[0], rz = (x * s + z * c - (min[2] + max[2]) / 2) * scale[2];
    const y = (part.positions[i * 3 + 1] - min[1]) * scale[1] + CITY_GROUND;
    part.positions.set([spec.x + rx * cy + rz * sy, y, spec.z - rx * sy + rz * cy], i * 3);
    const [nx, ny, nz] = part.normals.subarray(i * 3, i * 3 + 3);
    const nrx = (nx * c - nz * s) / scale[0], nrz = (nx * s + nz * c) / scale[2];
    const normal = [nrx * cy + nrz * sy, ny / scale[1], -nrx * sy + nrz * cy], length = Math.hypot(...normal);
    part.normals.set(normal.map(value => value / length), i * 3);
  }
  Object.assign(feature, { ...spec, minimum: [spec.x - spec.width / 2, CITY_GROUND, spec.z - spec.depth / 2], authoredPlacement: true });
  return { index, images };
}

async function saveMaterial(json, binary, index, prefix, resolution, imageOverride) {
  const imageBytes = imageOverride || sourceImage(json, binary, index);
  if (!imageBytes) return { textured: false };
  const { data, info } = await sharp(imageBytes).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    const luminance = .2126 * linearSamples[r] + .7152 * linearSamples[g] + .0722 * linearSamples[b];
    const neutral = Math.max(0, Math.min(1, (b / Math.max(1, r) - .72) * 3.4));
    mask[i] = Math.round(3 * smoothstep(.008, .025, luminance) * (1 - smoothstep(.09, .23, luminance)) * neutral) * 85;
  }
  const map = `${prefix}-map.webp`, windows = `${prefix}-windows.bin.gz`;
  const { data: colorBytes, info: colorInfo } = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize({ width: resolution, height: resolution, fit: 'inside', withoutEnlargement: true }).webp({ quality: 87 }).toBuffer({ resolveWithObject: true });
  const filteredMask = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .resize(colorInfo.width, colorInfo.height, { kernel: 'cubic' }).greyscale().raw().toBuffer();
  for (let i = 0; i < filteredMask.length; i++) filteredMask[i] = Math.round(filteredMask[i] / 17) * 17;
  const maskBytes = gzipSync(filteredMask, { level: 9 });
  await Promise.all([fs.writeFile(path.join(output, map), colorBytes), fs.writeFile(path.join(output, windows), maskBytes)]);
  return { textured: true, map, windows, width: colorInfo.width, height: colorInfo.height, bytes: colorBytes.length + maskBytes.length };
}

export function packCityGeometry(vertices, indices) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 12) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], vertices[i + axis]); max[axis] = Math.max(max[axis], vertices[i + axis]);
  }
  const size = max.map((value, axis) => value - min[axis]);
  if (!size.every(value => Number.isFinite(value) && value > 0)) throw new Error('City geometry has an invalid extent.');
  const unique = new Map(), packed = [], remap = new Uint32Array(vertices.length / 12);
  for (let i = 0; i < vertices.length; i += 12) {
    const normal = size.map((value, axis) => value * vertices[i + axis + 3]), length = Math.hypot(...normal);
    if (length < 1e-8) throw new Error('City geometry has a zero-length normal.');
    const point = [
      ...size.map((value, axis) => Math.round((vertices[i + axis] - min[axis]) / value * 65535)),
      ...normal.map(value => Math.round(value / length * 32767)),
      Math.round(vertices[i + 6] * 65535), Math.round(vertices[i + 7] * 65535),
      ...vertices.slice(i + 8, i + 11).map(value => Math.round(value * 255)), Math.round(vertices[i + 11] / 100 * 255),
    ];
    if (point.slice(6, 8).some(value => value < 0 || value > 65535)) throw new Error('City UVs are outside their atlas.');
    const key = point.join(',');
    if (!unique.has(key)) { unique.set(key, packed.length); packed.push(point); }
    remap[i / 12] = unique.get(key);
  }
  const count = packed.length, buffer = Buffer.alloc(64 + count * 20 + indices.length * 4);
  buffer.write('AHC2'); buffer.writeUInt32LE(count, 4); buffer.writeUInt32LE(indices.length, 8); buffer.writeUInt32LE(4, 12);
  min.forEach((value, axis) => buffer.writeFloatLE(value, 16 + axis * 4));
  size.forEach((value, axis) => buffer.writeFloatLE(value, 28 + axis * 4));
  const positions = new Uint16Array(buffer.buffer, buffer.byteOffset + 64, count * 3);
  const normals = new Int16Array(buffer.buffer, buffer.byteOffset + 64 + count * 6, count * 3);
  const uvs = new Uint16Array(buffer.buffer, buffer.byteOffset + 64 + count * 12, count * 2);
  const lights = new Uint8Array(buffer.buffer, buffer.byteOffset + 64 + count * 16, count * 4);
  packed.forEach((point, index) => {
    positions.set(point.slice(0, 3), index * 3); normals.set(point.slice(3, 6), index * 3);
    uvs.set(point.slice(6, 8), index * 2); lights.set(point.slice(8, 12), index * 4);
  });
  new Uint32Array(buffer.buffer, buffer.byteOffset + 64 + count * 20, indices.length).set(indices.map(index => remap[index]));
  return { buffer, vertices: count };
}

export async function fetchCityAssets() {
  await Promise.all([fs.mkdir(cache, { recursive: true }), fs.mkdir(output, { recursive: true })]);
  const tilesetBytes = await download(SURVEY_SOURCE, 'tileset.json'), tiles = selectTiles(readJSON(tilesetBytes));
  const manifest = {
    version: 1, source: SURVEY_SOURCE, dataset: 'plateau-13103-minato-ku-2025', origin: SURVEY_ORIGIN, bounds: SURVEY_BOUNDS,
    license: 'CC BY 4.0 (per PLATEAU PDL 1.0 compatibility permission)', tiles: [], buildings: [], bytes: 0, vertices: 0, triangles: 0,
  };
  const seen = new Set();
  const candidates = [];
  console.log(`Studying ${tiles.length} survey tiles for proportionate foreground architecture.`);
  for (const tile of tiles) {
    const bytes = await download(new URL(tile.uri, SURVEY_SOURCE).href, path.basename(tile.uri));
    candidates.push(...foregroundCandidates(await decodeCityTile(bytes), tile));
  }
  const foreground = selectForegroundModels(candidates), work = [...tiles, ...foreground];
  console.log(`Importing the neighborhood and ${foreground.length} photographed foreground landmarks; parks and animated streets remain protected.`);
  for (const [number, tile] of work.entries()) {
    const filename = path.basename(tile.uri), source = new URL(tile.uri, SURVEY_SOURCE).href;
    const bytes = await download(source, filename), decoded = await decodeCityTile(bytes);
    const accepted = new Set(); let images = new Map();
    if (tile.replacement) {
      const fitted = await fitForegroundModel(decoded, tile.replacement);
      accepted.add(fitted.index); images = fitted.images;
    } else {
      for (const [index, feature] of decoded.features.entries()) {
        if (seen.has(feature.sourceId) || !surveyBuildingAllowed(feature) || !clearOfRoads(feature)) continue;
        if (![feature.x, feature.z, feature.width, feature.depth, feature.height].every(Number.isFinite)) throw new Error('Invalid city building bounds.');
        accepted.add(index); seen.add(feature.sourceId);
      }
    }
    if (!accepted.size) continue;
    const vertices = [], indices = [], groups = [], materialIds = new Map();
    const prefix = tile.replacement ? `hero-${tile.replacement.template.id}` : filename.replace('.b3dm', '');
    const materials = [];
    for (const part of decoded.parts) {
      const start = indices.length, remap = new Int32Array(part.ids.length).fill(-1);
      for (let i = 0; i < part.indices.length; i += 3) {
        const triangle = part.indices.subarray(i, i + 3), id = part.ids[triangle[0]];
        if (!triangle.every(index => part.ids[index] === id)) throw new Error('Triangle crosses survey building IDs.');
        if (!accepted.has(id)) continue;
        for (const index of triangle) {
          if (remap[index] < 0) {
            remap[index] = vertices.length / 12;
            const building = decoded.features[id], identity = cityIdentity(building.authoredPlacement ? building.id : building.sourceId);
            const color = new THREE.Color(identity.lightColor);
            vertices.push(part.positions[index * 3], part.positions[index * 3 + 1] - building.minimum[1] + CITY_GROUND, part.positions[index * 3 + 2],
              ...part.normals.subarray(index * 3, index * 3 + 3), part.uv?.[index * 2] || 0, part.uv?.[index * 2 + 1] || 0,
              color.r, color.g, color.b, identity.windowPhase);
          }
          indices.push(remap[index]);
        }
      }
      if (indices.length === start) continue;
      if (!materialIds.has(part.material)) {
        materialIds.set(part.material, materials.length);
        materials.push(await saveMaterial(decoded.json, decoded.binary, part.material, `${prefix}-${part.material}`,
          tile.replacement ? 1024 : tile.z < -400 ? 384 : 512, images.get(part.material)));
      }
      groups.push({ start, count: indices.length - start, material: materialIds.get(part.material) });
    }
    if (!indices.length) throw new Error('Selected city buildings have no geometry.');
    const packed = packCityGeometry(vertices, indices);
    const geometry = `${prefix}.bin.gz`, compressed = gzipSync(packed.buffer, { level: 9 });
    await fs.writeFile(path.join(output, geometry), compressed);
    const specs = [...accepted].map(index => {
      const feature = decoded.features[index];
      if (feature.authoredPlacement) return { ...tile.replacement.template, sourceId: feature.sourceId, lod: feature.lod, surveyed: true, authoredPlacement: true };
      return {
        id: `plateau-${feature.sourceId}`, sourceId: feature.sourceId, lod: feature.lod,
        x: feature.x, z: feature.z, width: feature.width, depth: feature.depth, height: feature.height,
        floors: Math.max(1, Math.round(feature.height / (SURVEY_ORIGIN.scale * 3.1))),
        hero: false, surveyed: true, style: 'office', color: 0xa9aeb0, yaw: 0,
      };
    });
    const tileBytes = compressed.length + materials.reduce((sum, material) => sum + (material.bytes || 0), 0);
    manifest.tiles.push({ id: prefix, geometry, groups, materials, buildings: specs.length, vertices: packed.vertices, triangles: indices.length / 3, source, sha256: sha256(bytes), bytes: tileBytes });
    manifest.buildings.push(...specs); manifest.bytes += tileBytes; manifest.vertices += packed.vertices; manifest.triangles += indices.length / 3;
    console.log(`${number + 1}/${work.length}: ${prefix}, ${specs.length} buildings, ${(tileBytes / 1024).toFixed(0)} KB`);
  }
  if (manifest.buildings.length < 300 || manifest.bytes > 28_000_000) throw new Error(`Survey subset failed its detail/payload budget: ${manifest.buildings.length} buildings, ${manifest.bytes} bytes.`);
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Saved ${manifest.buildings.length} buildings / ${manifest.triangles.toLocaleString()} triangles / ${(manifest.bytes / 1048576).toFixed(2)} MiB.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await fetchCityAssets();
