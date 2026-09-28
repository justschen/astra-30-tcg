import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { advanceCityTime, beaconGlow, flightPosition, rainHeight, trafficProgress } from '../src/city-motion.js';
import { CITY_GROUND, CITY_STREETS, createCityLayout, HERO_BUILDINGS, PARK, TEMPLE, TOWER } from '../src/city-layout.js';

test('city animation uses elapsed time and pauses without catch-up jumps', () => {
  assert.equal(advanceCityTime(10, 1 / 60, false), 10);
  assert.equal(advanceCityTime(10, 900, true), 10.1);
  assert.equal(advanceCityTime(10, -1, true), 10);
  let at30 = 0, at60 = 0;
  for (let i = 0; i < 30; i++) at30 = advanceCityTime(at30, 1 / 30, true);
  for (let i = 0; i < 60; i++) at60 = advanceCityTime(at60, 1 / 60, true);
  assert.ok(Math.abs(at30 - at60) < 1e-10);
});

test('traffic, aircraft and weather actually change position with time', () => {
  assert.notEqual(trafficProgress(0, 1), trafficProgress(3, 1));
  assert.notDeepEqual(flightPosition(0), flightPosition(3));
  assert.notEqual(rainHeight(2, 6, 0), rainHeight(2, 6, .1));
  for (const time of [0, .3, 100, 10000]) {
    assert.ok(trafficProgress(time, 9) >= 0 && trafficProgress(time, 9) < 1);
    assert.ok(rainHeight(2, 6, time) >= -1.5 && rainHeight(2, 6, time) <= 9);
    assert.ok(Math.abs(flightPosition(time).x) <= 135);
  }
});

test('rooftop lights pulse slowly with distinct phases', () => {
  assert.notEqual(beaconGlow(0, 0), beaconGlow(0, 1));
  for (let t = 0; t < 20; t += .1) {
    assert.ok(beaconGlow(t) >= .18 && beaconGlow(t) <= 1);
    assert.ok(Math.abs(beaconGlow(t + .01) - beaconGlow(t)) < .02);
  }
});

test('reconstruction has distinct near, middle and far building volumes', () => {
  const buildings = createCityLayout();
  assert.ok(buildings.length >= 1200);
  assert.equal(new Set(buildings.map(spec => spec.id)).size, buildings.length);
  assert.deepEqual(createCityLayout(), buildings, 'The district layout must be deterministic');
  for (const spec of buildings) {
    for (const key of ['x', 'z', 'height', 'width', 'depth']) assert.ok(Number.isFinite(spec[key]), `${spec.id}/${key}`);
    assert.ok(spec.width > 0 && spec.depth > 0 && spec.height > 0);
  }
  assert.ok(buildings.some(spec => spec.z > -50));
  assert.ok(buildings.some(spec => spec.z < -800));
  assert.equal(HERO_BUILDINGS.length, 30);
  assert.ok(TOWER.z < TEMPLE.z && TEMPLE.z < -180, 'Tower must sit behind the temple, not on the same plane');
  assert.equal(TOWER.height,72,'The tower must be reduced independently of the surrounding city');
  assert.ok(Math.abs(TOWER.width / TOWER.height - 80 / 333) < 1e-9, 'Tower proportions follow the 333 m height and 80 m base, rather than an oversized toy silhouette');
  assert.ok(TEMPLE.x > PARK.left && TEMPLE.x < PARK.right);
});

test('street traffic uses level ground lanes that do not pass through buildings', () => {
  const buildings = createCityLayout();
  const collisions = new Set();
  for (const street of CITY_STREETS) {
    const curve = new THREE.CatmullRomCurve3(street.points.map(([x, z]) => new THREE.Vector3(x, CITY_GROUND + .055, z)), false, 'centripetal');
    for (let i = 0; i <= 200; i++) {
      const point = curve.getPointAt(i / 200), tangent = curve.getTangentAt(i / 200);
      assert.ok(Math.abs(point.y - CITY_GROUND - .055) < 1e-10);
      for (const sign of [-1, 1]) {
        const x = point.x - tangent.z * street.width * .24 * sign;
        const z = point.z + tangent.x * street.width * .24 * sign;
        for (const spec of buildings) {
          const dx = x - spec.x, dz = z - spec.z, c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
          if (Math.abs(dx * c - dz * s) < spec.width / 2 + .23 && Math.abs(dx * s + dz * c) < spec.depth / 2 + .48) {
            collisions.add(`${street.id}: ${spec.id}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...collisions], []);
});
