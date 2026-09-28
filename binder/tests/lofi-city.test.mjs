import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCityLayout, HERO_BUILDINGS, SIDE_PARKS, inSidePark } from '../src/city-layout.js';

test('side gaps gain denser districts while the photo-anchored landmarks stay fixed', () => {
  const buildings=createCityLayout();
  assert.deepEqual(buildings.slice(0,HERO_BUILDINGS.length),HERO_BUILDINGS);
  assert.ok(buildings.filter(spec=>spec.sideDistrict).length>=250);
  assert.equal(buildings.filter(spec=>spec.sideDistrict&&spec.hero).length,4);
  for(const sign of [-1,1]){
    assert.ok(buildings.filter(spec=>spec.sideDistrict&&spec.x*sign>60).length>80);
  }
});

test('two side parks reserve real ground space rather than overlapping buildings', () => {
  const buildings=createCityLayout();
  assert.equal(SIDE_PARKS.length,2);
  for(const spec of buildings.filter(spec=>!spec.hero)){
    assert.equal(inSidePark(spec.x,spec.z,spec.width,spec.depth),false,`${spec.id} overlaps a park`);
  }
});
