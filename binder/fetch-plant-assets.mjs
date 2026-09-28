import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';

const directory = fileURLToPath(new URL('./public/room/plants/', import.meta.url));
const cache = fileURLToPath(new URL('../tools/.cache/binder-plants/', import.meta.url));
const IDS = ['potted_plant_01', 'potted_plant_02'];

async function download(source) {
  const url = new URL(source.url);
  if (!['api.polyhaven.com', 'dl.polyhaven.org'].includes(url.hostname) || url.protocol !== 'https:') throw new Error('Unexpected plant asset source.');
  if (source.md5 && !/^[a-f0-9]{32}$/.test(source.md5)) throw new Error('Invalid plant source checksum.');
  const cached = source.md5 && path.join(cache, source.md5);
  if (cached) {
    try {
      const bytes = await fs.readFile(cached);
      if (createHash('md5').update(bytes).digest('hex') !== source.md5) throw new Error(`Invalid cached plant source: ${url}`);
      return bytes;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const response = await fetch(url, { headers: { 'User-Agent': 'Afterhours-local-prototype/1.0' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Plant asset HTTP ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12_000_000) throw new Error(`Plant asset exceeds its download budget: ${url}`);
  if (source.md5 && createHash('md5').update(bytes).digest('hex') !== source.md5) throw new Error(`Plant source checksum changed: ${url}`);
  if (cached) { await fs.mkdir(cache, { recursive: true }); await fs.writeFile(cached, bytes); }
  return bytes;
}

export function packPlantGLB(source, binary, images) {
  if (source.animations || source.skins || source.nodes.some(node => node.children?.length)) throw new Error('Expected static, flat plant nodes.');
  const gltf = structuredClone(source);
  const chunks = [], views = [], accessors = [], meshes = [], nodes = [], viewMap = new Map(), accessorMap = new Map();
  let length = 0, triangles = 0;
  const append = bytes => {
    const offset = length, padding = (4 - bytes.length % 4) % 4;
    chunks.push(bytes, Buffer.alloc(padding)); length += bytes.length + padding;
    return { buffer: 0, byteOffset: offset, byteLength: bytes.length };
  };
  const accessor = index => {
    if (accessorMap.has(index)) return accessorMap.get(index);
    const original = source.accessors[index];
    if (!original || original.sparse || original.bufferView === undefined) throw new Error('Unsupported plant accessor.');
    if (!viewMap.has(original.bufferView)) {
      const view = source.bufferViews[original.bufferView];
      if (view.buffer !== 0 || (view.byteOffset || 0) + view.byteLength > binary.length) throw new Error('Invalid plant buffer bounds.');
      viewMap.set(original.bufferView, views.length);
      views.push({ ...view, ...append(binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)) });
    }
    const next = accessors.length;
    accessors.push({ ...original, bufferView: viewMap.get(original.bufferView) }); accessorMap.set(index, next); return next;
  };
  for (const node of source.nodes) {
    if (/pebbles|dirt/.test(node.name)) continue;
    const original = source.meshes[node.mesh];
    if (!original) throw new Error('Plant mesh is missing.');
    const primitives = original.primitives.map(primitive => {
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Expected triangulated plant geometry.');
      triangles += source.accessors[primitive.indices].count / 3;
      return { ...primitive, attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([key, index]) => [key, accessor(index)])), indices: accessor(primitive.indices) };
    });
    nodes.push({ ...node, mesh: meshes.length }); meshes.push({ ...original, primitives });
  }
  gltf.images = source.images.map(image => {
    const data = images.get(image.uri);
    if (!data) throw new Error(`Plant texture is missing: ${image.uri}`);
    const bufferView = views.length; views.push(append(data.bytes));
    return { name: image.name || path.basename(image.uri), bufferView, mimeType: data.mimeType };
  });
  for (const texture of gltf.textures) if (gltf.images[texture.source]?.mimeType === 'image/webp') {
    texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: texture.source } }; delete texture.source;
    gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), 'EXT_texture_webp'])];
    gltf.extensionsRequired = [...new Set([...(gltf.extensionsRequired || []), 'EXT_texture_webp'])];
  }
  gltf.nodes = nodes; gltf.meshes = meshes; gltf.accessors = accessors; gltf.bufferViews = views;
  gltf.scenes = [{ nodes: nodes.map((_, index) => index) }]; gltf.scene = 0; gltf.buffers = [{ byteLength: length }];
  gltf.asset.extras = { source: 'Poly Haven', license: 'CC0-1.0', modifications: 'Leaf opacity baked into color maps; dense dirt/pebbles replaced by a local soil surface.' };
  const json = Buffer.from(JSON.stringify(gltf)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(length); binHeader.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, padded, binHeader, ...chunks]), triangles };
}

export async function plantLeafImage(color, alpha) {
  const rgb = await sharp(color).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (rgb.info.width !== alpha.info.width || rgb.info.height !== alpha.info.height || alpha.info.channels !== 1) throw new Error('Plant color and opacity maps do not align.');
  const bytes = await sharp(rgb.data, { raw: { width: rgb.info.width, height: rgb.info.height, channels: 3 } })
    .joinChannel(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } })
    .webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  if (!(await sharp(bytes).metadata()).hasAlpha) throw new Error('Plant leaf opacity was lost during conversion.');
  return bytes;
}

export async function fetchPlantAssets() {
  await fs.mkdir(directory, { recursive: true });
  const records = [];
  for (const id of IDS) {
    const manifest = JSON.parse((await download({ url: `https://api.polyhaven.com/files/${id}` })).toString());
    const model = manifest.gltf?.['1k']?.gltf;
    if (!model || !manifest.leaves_alpha?.['1k']?.png) throw new Error(`Required plant data is unavailable: ${id}`);
    const sourceBytes = await download(model), source = JSON.parse(sourceBytes.toString());
    const geometry = model.include[source.buffers[0].uri];
    if (!geometry) throw new Error(`Plant geometry source is missing: ${id}`);
    const binary = await download(geometry);
    const alpha = await sharp(await download(manifest.leaves_alpha['1k'].png)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const images = new Map();
    for (const image of source.images) {
      const input = model.include[image.uri]; if (!input) throw new Error(`Unknown texture dependency: ${image.uri}`);
      let bytes = await download(input), mimeType = 'image/jpeg';
      if (image.uri.includes('leaves_diff')) {
        bytes = await plantLeafImage(bytes, alpha);
        mimeType = 'image/webp';
      }
      images.set(image.uri, { bytes, mimeType });
    }
    const packed = packPlantGLB(source, binary, images), compressed = gzipSync(packed.bytes, { level: 9 });
    if (packed.triangles > 125000 || compressed.length > 4_000_000) throw new Error(`Plant exceeds runtime budget: ${id}, ${packed.triangles} triangles / ${compressed.length} bytes`);
    const file = `${id}.glb.gz`; await fs.writeFile(path.join(directory, file), compressed);
    records.push({ id, file, source: `https://polyhaven.com/a/${id}`, license: 'CC0-1.0', triangles: packed.triangles, bytes: compressed.length,
      sha256: createHash('sha256').update(compressed).digest('hex'), sourceMD5: model.md5 });
    console.log(`${id}: ${packed.triangles} triangles, ${(compressed.length / 1048576).toFixed(2)} MiB including textures; CC0.`);
  }
  await fs.writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify({ version: 1, models: records }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await fetchPlantAssets();
