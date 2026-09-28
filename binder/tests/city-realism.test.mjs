import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCityLayout, distanceToStreet, HERO_BUILDINGS } from '../src/city-layout.js';
import { streetFrontage } from '../src/city-streetscape.js';

test('shops attach to the nearest building face without moving the original structure', () => {
  const buildings = createCityLayout();
  const original = JSON.stringify(buildings);
  for (const spec of buildings.filter(spec => spec.z > -180 && !spec.distant)) {
    const frontage = streetFrontage(spec);
    assert.ok(Number.isFinite(frontage.x) && Number.isFinite(frontage.z) && Number.isFinite(frontage.yaw));
    const dx=frontage.x-spec.x,dz=frontage.z-spec.z,c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
    const localX=dx*c-dz*s,localZ=dx*s+dz*c;
    const xFace=Math.abs(Math.abs(localX)-spec.width/2-.055)<1e-8 && Math.abs(localZ)<1e-8;
    const zFace=Math.abs(Math.abs(localZ)-spec.depth/2-.055)<1e-8 && Math.abs(localX)<1e-8;
    assert.ok(xFace||zFace, `${spec.id} frontage must remain mounted to a real exterior face`);
    assert.equal(frontage.distance,distanceToStreet(frontage.x,frontage.z));
  }
  assert.equal(JSON.stringify(buildings),original);
  assert.deepEqual(buildings.slice(0,HERO_BUILDINGS.length),HERO_BUILDINGS);
});
