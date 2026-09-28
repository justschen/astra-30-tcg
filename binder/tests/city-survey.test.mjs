import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { packCityGeometry, clearOfRoads } from '../fetch-city-assets.mjs';
import { unpackCityGeometry } from '../src/city-survey.js';
import { CITY_GROUND, CITY_UNITS_PER_METRE, HERO_BUILDINGS, TOWER, createCityLayout } from '../src/city-layout.js';
import { SURVEY_ORIGIN, combineSurveyLayout, geographicToECEF, surveyBuildingAllowed, surveyLocation, surveyNormal, surveyPoint } from '../src/city-survey-layout.js';
import { architecturalSurfaces, architecturalWindows, architectureProfile } from '../src/city-architecture.js';
import { streetFrontage, surveyAttachments } from '../src/city-streetscape.js';
import { REFERENCE_BUILDINGS, createReferenceBuilding } from '../src/city-reference-buildings.js';

const directory = new URL('../public/city/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', directory), 'utf8'));
const asArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('survey coordinates rebase real ECEF metres and retain upright normals', () => {
  const { longitude, latitude, scale } = SURVEY_ORIGIN;
  const base = surveyLocation(longitude, latitude);
  assert.deepEqual(base, [TOWER.x, CITY_GROUND, TOWER.z]);
  const top = surveyPoint(geographicToECEF(longitude, latitude, 333), [0, 0, 0]);
  assert.ok(Math.abs(top[1] - base[1] - 333*CITY_UNITS_PER_METRE) < .000001);
  assert.ok(Math.hypot(top[0] - base[0], top[2] - base[2]) < .000001);
  const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
  const normal = surveyNormal([Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)]);
  assert.ok(Math.hypot(normal[0], normal[1] - 1, normal[2]) < 1e-10);
  assert.ok(Math.abs(scale - 95 / 333) < 1e-10,'Changing the tower appearance must not rescale the existing survey data or facade grid');
  assert.equal(scale,manifest.origin.scale,'The runtime facade scale must still match the scale baked into the city assets');
});

test('packed city geometry welds duplicates without distorting positions, normals or UVs', () => {
  const positions = [[12, -24, -170], [14, -24, -170], [12, -19, -170], [12, -24, -168], [12, -24, -170]];
  const normal = new THREE.Vector3(.7, .2, .4).normalize();
  const vertices = positions.flatMap(position => [...position, ...normal, .2, .8, .5, .4, .2, 25]);
  const packed = packCityGeometry(vertices, [0, 1, 2, 4, 2, 3]);
  assert.equal(packed.vertices, 4);
  const parsed = unpackCityGeometry(asArrayBuffer(packed.buffer));
  try {
    const attribute = parsed.geometry.attributes.position;
    const transform = new THREE.Matrix4().compose(parsed.position, new THREE.Quaternion(), parsed.size);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    for (let i = 0; i < 4; i++) {
      const actual = new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(transform);
      assert.ok(actual.distanceTo(new THREE.Vector3(...positions[i])) < .0002);
      const decodedNormal = new THREE.Vector3().fromBufferAttribute(parsed.geometry.attributes.normal, i).applyMatrix3(normalMatrix).normalize();
      assert.ok(decodedNormal.distanceTo(normal) < .0002);
      assert.ok(Math.abs(parsed.geometry.attributes.uv.getX(i) - .2) < .00002);
      assert.ok(Math.abs(parsed.geometry.attributes.uv.getY(i) - .8) < .00002);
    }
    assert.deepEqual(Array.from(parsed.geometry.index.array), [0, 1, 2, 0, 2, 3]);
  } finally { parsed.geometry.dispose(); }
  assert.throws(() => unpackCityGeometry(new ArrayBuffer(8)), /format/);
  const corrupt = packed.buffer.slice(); corrupt.writeUInt32LE(999999, corrupt.length - 4);
  assert.throws(() => unpackCityGeometry(asArrayBuffer(corrupt)), /indices/);
});

test('the deployed survey assets contain real, bounded geometry within the download budget', async () => {
  assert.ok(manifest.buildings.filter(spec => !spec.authoredPlacement).length >= 4000);
  assert.ok(manifest.buildings.filter(spec => spec.authoredPlacement).length >= 18);
  assert.ok(manifest.buildings.some(spec => spec.lod === 3));
  let bytes = 0, vertices = 0, triangles = 0, buildings = 0;
  for (const tile of manifest.tiles) {
    const compressed = await fs.readFile(new URL(tile.geometry, directory));
    const parsed = unpackCityGeometry(asArrayBuffer(gunzipSync(compressed)));
    try {
      assert.equal(parsed.geometry.attributes.position.count, tile.vertices);
      assert.equal(parsed.geometry.index.count, tile.triangles * 3);
      assert.ok(Math.abs(parsed.position.y - CITY_GROUND) < .0002, `${tile.id} must sit on the ground, not float above it`);
      assert.ok(parsed.size.y > .3);
      let covered = 0;
      for (const group of tile.groups) {
        assert.equal(group.start, covered); assert.ok(group.count > 0 && group.count % 3 === 0);
        assert.ok(tile.materials[group.material]); covered += group.count;
      }
      assert.equal(covered, tile.triangles * 3);
    } finally { parsed.geometry.dispose(); }
    let tileBytes = compressed.length;
    for (const material of tile.materials.filter(material => material.textured)) {
      const [map, mask] = await Promise.all([fs.readFile(new URL(material.map, directory)), fs.readFile(new URL(material.windows, directory))]);
      assert.equal(gunzipSync(mask).length, material.width * material.height);
      assert.ok(material.width <= 1024 && material.height <= 1024);
      tileBytes += map.length + mask.length;
    }
    assert.equal(tileBytes, tile.bytes);
    bytes += tileBytes; vertices += tile.vertices; triangles += tile.triangles; buildings += tile.buildings;
  }
  assert.equal(bytes, manifest.bytes); assert.equal(vertices, manifest.vertices); assert.equal(triangles, manifest.triangles);
  assert.equal(buildings, manifest.buildings.length);
  assert.ok(bytes <= 28_000_000 && vertices < 1_500_000 && triangles < 650_000);
});

test('the real neighborhood preserves streets, the tower view and foreground interaction anchors', () => {
  const combined = combineSurveyLayout(createCityLayout(), manifest.buildings);
  assert.equal(new Set(combined.map(spec => spec.id)).size, combined.length);
  for (const spec of manifest.buildings) {
    if (!spec.authoredPlacement) {
      assert.ok(surveyBuildingAllowed(spec), `${spec.id} must respect the park and landmark view`);
      assert.ok(clearOfRoads(spec), `${spec.id} must not intersect the rendered road ribbons`);
    } else {
      const template = HERO_BUILDINGS.find(building => building.id === spec.id);
      assert.ok(template);
      for (const key of ['x', 'z', 'width', 'height', 'depth', 'yaw']) assert.equal(spec[key], template[key]);
    }
  }
  assert.ok(combined.find(spec => spec.id === 'daimon-white-podium'));
  assert.ok(combined.find(spec => spec.id === 'front-left-cream-office')?.surveyed);
  assert.ok(combined.some(spec => spec.z < -800 && spec.height < 35), 'The distant city should recede into lower urban massing, not a wall of giant boxes');
});

test('an unavailable survey retains every authored plot and landmark instead of removing the survey district', () => {
  const authored = createCityLayout(), fallback = combineSurveyLayout(authored, []);
  assert.deepEqual(fallback, authored);
  assert.equal(fallback.filter(spec => spec.hero).length, authored.filter(spec => spec.hero).length);
});

test('close-building window frames follow the real facade planes and match the shader grid', async () => {
  let windows = 0, facades = 0;
  for (const spec of manifest.buildings.filter(spec => spec.authoredPlacement && spec.z > -150)) {
    const tile = manifest.tiles.find(tile => tile.id === `hero-${spec.id}`);
    const parsed = REFERENCE_BUILDINGS[spec.id] ? createReferenceBuilding(spec) : unpackCityGeometry(asArrayBuffer(gunzipSync(await fs.readFile(new URL(tile.geometry, directory)))));
    try {
      const profile = architectureProfile(spec);
      assert.ok(profile.floor > .4 && profile.floor < 2);
      for (const surface of architecturalSurfaces(parsed)) {
        assert.ok(Math.abs(surface.normal.y) < 1e-7);
        assert.ok(Math.abs(surface.normal.dot(surface.tangent)) < 1e-7);
        const center = surface.tangent.clone().multiplyScalar((surface.min[0] + surface.max[0]) / 2).addScaledVector(surface.normal, surface.offset);
        if (new THREE.Vector3(0, 3.05, 5.9).sub(center).dot(surface.normal) < -2) continue;
        facades++;
        for (const window of architecturalWindows(surface, spec)) {
          assert.ok(window.left >= surface.min[0] && window.right <= surface.max[0]);
          assert.ok(window.bottom >= surface.min[1] && window.top <= surface.max[1]);
          assert.ok(Math.abs(window.right - window.left - profile.bay * (1 - 2 * profile.inset)) < 1e-6);
          windows++;
        }
      }
    } finally { parsed.geometry.dispose(); }
  }
  assert.ok(facades >= 35 && windows >= 1500, `${facades} facades, ${windows} physically framed windows`);
  assert.ok(windows < 6500, 'Close-range geometric detail must stay inside its instancing budget');
});

test('shops and billboards attach to real walls instead of the old bounding boxes', async () => {
  const ids = ['front-left-cream-office', 'daimon-white-podium', 'daimon-corner', 'east-dark-glass'];
  let mounted = 0;
  for (const id of ids) {
    const spec = manifest.buildings.find(spec => spec.id === id), tile = manifest.tiles.find(tile => tile.id === `hero-${id}`);
    const parsed = unpackCityGeometry(asArrayBuffer(gunzipSync(await fs.readFile(new URL(tile.geometry, directory)))));
    const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(parsed.geometry, material);
    mesh.position.copy(parsed.position); mesh.scale.copy(parsed.size); mesh.updateMatrixWorld(true);
    try {
      const surfaces = architecturalSurfaces(parsed);
      const storefront = streetFrontage(spec, surfaces);
      if (id === 'daimon-white-podium') assert.ok(storefront, '7-Eleven must retain a supported street-level facade');
      const billboard = surveyAttachments(spec, surfaces.filter(surface => surface.normal.z > .2), {
        x: spec.x + spec.width * .22, y: CITY_GROUND + spec.height * .54, z: spec.z + spec.depth / 2,
        width: Math.min(2.3, spec.width * .6) + .12, height: Math.min(6.7, spec.height * .58) + .12,
      })[0];
      if (id === 'front-left-cream-office') assert.ok(billboard, 'The previously floating billboard must now have a real supporting wall');
      for (const attachment of [storefront, billboard].filter(Boolean)) {
        const normal = new THREE.Vector3(Math.sin(attachment.yaw), 0, Math.cos(attachment.yaw));
        const tangent = new THREE.Vector3(normal.z, 0, -normal.x);
        for (const u of [-.4, 0, .4]) for (const v of [-.4, 0, .4]) {
          const origin = new THREE.Vector3(attachment.x, attachment.y + v * attachment.height, attachment.z)
            .addScaledVector(tangent, u * attachment.width).addScaledVector(normal, .25);
          const hit = new THREE.Raycaster(origin, normal.clone().negate(), 0, .5).intersectObject(mesh, false)[0];
          assert.ok(hit && Math.abs(hit.distance - .32) < .045, `${id} attachment must remain supported across its footprint`);
        }
        mounted++;
      }
    } finally { parsed.geometry.dispose(); material.dispose(); }
  }
  assert.ok(mounted >= 5);
});
