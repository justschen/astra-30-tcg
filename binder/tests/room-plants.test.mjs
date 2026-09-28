import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { packPlantGLB, plantLeafImage } from '../fetch-plant-assets.mjs';

const directory = new URL('../public/room/plants/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', directory), 'utf8'));

test('leaf conversion retains newly joined alpha rather than stripping it at the end of the image pipeline', async () => {
  const color = await sharp({ create: { width: 2, height: 1, channels: 3, background: '#466733' } }).png().toBuffer();
  const bytes = await plantLeafImage(color, { data: Buffer.from([0, 255]), info: { width: 2, height: 1, channels: 1 } });
  const pixels = await sharp(bytes).raw().toBuffer();
  assert.equal(pixels[3], 0); assert.equal(pixels[7], 255);
});

test('local CC0 houseplants preserve detailed leaves while excluding disproportionate dirt geometry', async () => {
  let bytes = 0, triangles = 0;
  assert.equal(manifest.models.length, 2);
  for (const record of manifest.models) {
    assert.equal(record.license, 'CC0-1.0');
    const compressed = await fs.readFile(new URL(record.file, directory));
    assert.equal(createHash('sha256').update(compressed).digest('hex'), record.sha256);
    assert.equal(compressed.length, record.bytes); bytes += compressed.length;
    const glb = gunzipSync(compressed);
    assert.equal(glb.subarray(0, 4).toString(), 'glTF'); assert.equal(glb.readUInt32LE(8), glb.length);
    const jsonLength = glb.readUInt32LE(12), data = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    const binary = glb.subarray(28 + jsonLength);
    assert.ok(data.nodes.every(node => !/pebbles|dirt/.test(node.name)));
    assert.ok(data.buffers.every(buffer => !buffer.uri) && data.images.every(image => !image.uri), 'Runtime plant models must be self-contained, not fetch remote textures');
    const count = data.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((subtotal, primitive) => subtotal + data.accessors[primitive.indices].count / 3, 0), 0);
    assert.equal(count, record.triangles); triangles += count;
    const foliage = data.materials.find(material => material.name.endsWith('_leaves'));
    assert.equal(foliage.alphaMode, 'MASK'); assert.equal(foliage.doubleSided, true);
    assert.ok(foliage.normalTexture && foliage.pbrMetallicRoughness.metallicRoughnessTexture);
    const texture = data.textures[foliage.pbrMetallicRoughness.baseColorTexture.index];
    const image = data.images[texture.extensions.EXT_texture_webp.source], view = data.bufferViews[image.bufferView];
    const raw = await sharp(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(raw.info.width >= 1024 && raw.info.height >= 1024);
    let cutouts = 0, solid = 0;
    for (let i = 3; i < raw.data.length; i += 4) { if (raw.data[i] < 10) cutouts++; if (raw.data[i] > 240) solid++; }
    assert.ok(cutouts > 5000 && solid > 5000, 'Leaf color maps must contain the actual opaque leaves and transparent negative space, not rectangular cards');
  }
  assert.ok(bytes < 4_100_000 && triangles < 140000, 'Shared high-detail plants must stay within a bounded download and geometry budget');
});

test('plant packing rejects unsupported or out-of-bounds geometry rather than emitting a broken model', () => {
  assert.throws(() => packPlantGLB({ nodes: [{ children: [1] }] }, Buffer.alloc(0), new Map()), /static/);
  const source = { asset: { version: '2.0' }, nodes: [{ name: 'leaves', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0 }, { bufferView: 0, count: 3 }], bufferViews: [{ buffer: 0, byteOffset: 4, byteLength: 64 }], images: [], textures: [] };
  assert.throws(() => packPlantGLB(source, Buffer.alloc(8), new Map()), /buffer bounds/);
});
