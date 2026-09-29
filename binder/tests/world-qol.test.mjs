import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, createCollection, locateCard, parseCollection } from '../src/collection.js';
import { handLayout, returnHandToBag } from '../src/hand.js';
import { binderLiftPose } from '../src/binder3d.js';
import { DEFAULT_CITY_HOUR, formatCityTime, solarState, TIME_PRESETS } from '../src/day-cycle.js';
import { CITY_OUTER_RADIUS, createCityLayout } from '../src/city-layout.js';

test('Clear hand returns binder, stack and already-bag cards to the bag without losing cards', () => {
  const state = createCollection();
  const bagId = CARDS.find(card => locateCard(state, card.id).kind === 'bag').id;
  const ids = [state.slots[9], state.slots[10], state.piles.unsorted[0], state.piles.trades[0], bagId];
  const before = JSON.stringify(state);
  const result = returnHandToBag(state, ids);
  assert.deepEqual(result.hand, []);
  ids.forEach(id => assert.equal(locateCard(result.state, id).kind, 'bag'));
  assert.equal(result.state.slots[9], null); assert.equal(result.state.slots[10], null);
  assert.equal(result.state.piles.unsorted.length, state.piles.unsorted.length - 1);
  assert.equal(result.state.piles.trades.length, state.piles.trades.length - 1);
  assert.equal(JSON.stringify(state), before);
  parseCollection(JSON.stringify(result.state));
});

test('the hand grows leftward and wraps instead of clipping the final card', () => {
  const small = handLayout(3, 1440, 900), medium = handLayout(8, 1440, 900), large = handLayout(20, 1440, 900);
  assert.ok(medium.width > small.width);
  assert.equal(medium.rows, 1);
  assert.ok(medium.overlap > 0 && medium.overlap < medium.cardWidth * .3);
  assert.equal(medium.stride + medium.overlap, medium.cardWidth);
  assert.equal(medium.width, (medium.columns - 1) * medium.stride + medium.cardWidth + 24);
  assert.equal(large.rows, 2);
  assert.ok(large.width <= 1440 - 52);
  for (const width of [320, 375, 390, 768, 1024, 1920]) {
    const layout = handLayout(40, width, 844);
    assert.ok(layout.width <= width - 20);
    assert.ok(layout.columns >= 1 && layout.rows >= 2);
  }
});

test('the lifted view raises and rotates the real binder while leaving its contents alone', () => {
  assert.deepEqual(binderLiftPose(0), { position: [0, .607, .7], rotation: 0 });
  const held = binderLiftPose(1);
  assert.ok(held.position[1] > 2.3 && held.rotation > 1);
  const lowestEdge = held.position[1] - Math.sin(held.rotation) * 1.65 - .1;
  assert.ok(lowestEdge > .6, 'The lifted binder must clear the table');
  assert.deepEqual(binderLiftPose(2), held);
});

test('a full day has a bright noon, warm dawn/sunset, dark midnight and a stable clock', () => {
  assert.equal(solarState(12).daylight, 1);
  assert.equal(solarState(0).night, 1);
  assert.ok(solarState(17.75).sunset > .9);
  assert.ok(solarState(6.25).sunset > .9);
  assert.ok(solarState(12).sunset < .01);
  assert.deepEqual(solarState(24), solarState(0));
  assert.equal(formatCityTime(17.75), '17:45');
  assert.equal(formatCityTime(6.25), '06:15');
  assert.equal(formatCityTime(24), '00:00');
  for (const value of [-1, 25, NaN, Infinity]) assert.throws(() => solarState(value));
});

test('main-view time presets use the same valid clock values as the scene', () => {
  assert.deepEqual(TIME_PRESETS.map(preset=>preset.label),['Dawn','Day','Dusk','After dark']);
  assert.equal(new Set(TIME_PRESETS.map(preset=>preset.id)).size,TIME_PRESETS.length);
  for(const preset of TIME_PRESETS)assert.doesNotThrow(()=>solarState(preset.hour));
  assert.equal(solarState(TIME_PRESETS.find(preset=>preset.id==='after-dark').hour).night,1);
  assert.equal(DEFAULT_CITY_HOUR,TIME_PRESETS.find(preset=>preset.id==='after-dark').hour);
  assert.equal(formatCityTime(DEFAULT_CITY_HOUR),'22:00');
});

test('the outer city fills both side views and continues beyond the original footprint', () => {
  const buildings = createCityLayout();
  assert.ok(buildings.length > 3000);
  assert.ok(CITY_OUTER_RADIUS >= 1500);
  for (let degrees = -110; degrees <= 110; degrees += 10) {
    const angle = degrees * Math.PI / 180;
    const neighborhood = buildings.filter(spec => Math.abs(Math.atan2(spec.x, -spec.z) - angle) < .095);
    assert.ok(neighborhood.filter(spec => Math.hypot(spec.x, spec.z) > 600).length >= 3, `Horizon coverage at ${degrees} degrees`);
    assert.ok(neighborhood.filter(spec => Math.hypot(spec.x, spec.z) > 80 && Math.hypot(spec.x, spec.z) < 550).length >= 3, `Side street coverage at ${degrees} degrees`);
  }
});
