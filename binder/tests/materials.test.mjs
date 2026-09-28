import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshPhysicalMaterial } from 'three';
import { setCardHeld } from '../src/materials.js';
import sharp from 'sharp';
import fs from 'node:fs/promises';

test('picking up a card recompiles the opaque shader for transparency', () => {
  const material = new MeshPhysicalMaterial();
  const initialVersion = material.version;
  setCardHeld(material, true);
  assert.equal(material.transparent, true);
  assert.equal(material.opacity, .32);
  assert.ok(material.version > initialVersion);
  const heldVersion = material.version;
  setCardHeld(material, true);
  assert.equal(material.version, heldVersion, 'Unchanged holding state must not recompile the shader');
  setCardHeld(material, false);
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 1);
  assert.ok(material.version > heldVersion);
  material.dispose();
});

test('the room retains PBR scans and the licensed reference used for modeling', async () => {
  const root = new URL('../public/room/', import.meta.url);
  const skyline = await sharp(new URL('tokyo-night.webp', root).pathname).metadata();
  assert.equal(skyline.width, 5120);
  assert.equal(skyline.height, 2880);
  for (const name of ['walnut-color', 'walnut-normal', 'walnut-roughness', 'leather-color', 'leather-normal', 'leather-roughness', 'upholstery-normal', 'upholstery-roughness',
    'city-concrete-color','city-concrete-normal','city-concrete-roughness','city-brick-color','city-brick-normal','city-brick-roughness','city-asphalt-color','city-asphalt-normal','city-asphalt-roughness']) {
    const metadata = await sharp(new URL(`${name}.webp`, root).pathname).metadata();
    assert.ok(metadata.width >= 1024 && metadata.height >= 1024, `${name} must retain scanned detail`);
  }
  const attribution = await fs.readFile(new URL('ATTRIBUTION.txt', root), 'utf8');
  assert.match(attribution, /Kazuend/);
  assert.match(attribution, /creativecommons\.org\/publicdomain\/zero\/1\.0/);
  assert.match(attribution, /Shiba-koen/);
  assert.match(attribution, /Poly Haven/);
});
