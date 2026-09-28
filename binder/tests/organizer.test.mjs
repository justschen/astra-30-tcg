import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_BY_ID, compareCards, createCollection, parseCollection, RARITY_ORDER, SLOT_COUNT } from '../src/collection.js';
import { planBinderArrangement, spreadForSlot } from '../src/organizer.js';

test('rarity sorting follows the explicit tier/section order rather than spelling', () => {
  const sorted = [...CARDS].sort(compareCards('rarity'));
  const labels = [...new Set(sorted.map(card => card.rarity))];
  assert.deepEqual(labels, RARITY_ORDER);
  assert.ok(labels.indexOf('Rare') < labels.indexOf('Special Illustration Rare'));
  assert.equal(sorted[0].rarity, 'Common');
});

test('every pocket maps to the correct spread including both covers', () => {
  assert.equal(spreadForSlot(0), 0); assert.equal(spreadForSlot(8), 0);
  assert.equal(spreadForSlot(9), 1); assert.equal(spreadForSlot(26), 1); assert.equal(spreadForSlot(27), 2);
  assert.equal(spreadForSlot(SLOT_COUNT - 1), 20);
  assert.throws(() => spreadForSlot(360), /existing/);
});

test('batch filling moves only the selected hand, preserves other cards, and is a pure preview', () => {
  const state = createCollection(), original = structuredClone(state);
  const hand = [state.slots[9], state.piles.unsorted[0], CARDS.find(card => !state.slots.includes(card.id) && !Object.values(state.piles).flat().includes(card.id)).id];
  const plan = planBinderArrangement(state, hand, { source: 'hand', sort: 'hand', startSlot: 9 });
  assert.deepEqual(state, original); assert.equal(plan.hand.length, 0); assert.equal(plan.placements.length, 3);
  assert.equal(plan.state.slots[9], hand[0]); assert.equal(plan.state.slots[17], hand[1]); assert.equal(plan.state.slots[20], hand[2]);
  assert.equal(plan.state.slots[10], state.slots[10]); assert.ok(!plan.state.piles.unsorted.includes(hand[1]));
  assert.deepEqual(parseCollection(JSON.stringify(plan.state)), plan.state);
});

test('entire-checklist arrangement respects protected pages and does not duplicate variants', () => {
  const state = createCollection(), plan = planBinderArrangement(state, [state.slots[9]], { source: 'all', sort: 'number', lockedPages: [1] });
  assert.deepEqual(plan.state.slots.slice(9, 18), state.slots.slice(9, 18));
  assert.equal(plan.state.slots.filter(Boolean).length, CARDS.length);
  assert.equal(new Set(plan.state.slots.filter(Boolean)).size, CARDS.length);
  assert.equal(Object.values(plan.state.piles).flat().length, 0);
  assert.deepEqual(plan.hand, [state.slots[9]]);
  assert.deepEqual(parseCollection(JSON.stringify(plan.state)), plan.state);
});

test('arranging existing binder cards leaves the bag and all table stacks alone', () => {
  const state = createCollection(), plan = planBinderArrangement(state, [], { source: 'binder', sort: 'rarity' });
  assert.deepEqual(plan.state.piles, state.piles);
  assert.deepEqual(new Set(plan.state.slots.filter(Boolean)), new Set(state.slots.filter(Boolean)));
  const expected = state.slots.filter(Boolean).sort((a, b) => compareCards('rarity')(CARD_BY_ID.get(a), CARD_BY_ID.get(b)));
  assert.deepEqual(plan.state.slots.filter(Boolean), expected);
});

test('insufficient space, invalid options and protected-only hands fail explicitly without changes', () => {
  const state = createCollection(), before = JSON.stringify(state);
  assert.throws(() => planBinderArrangement(state, [], { source: 'all', startSlot: 350 }), /only 10 are available/);
  assert.throws(() => planBinderArrangement(state, [state.slots[9]], { lockedPages: [1] }), /No movable/);
  assert.throws(() => planBinderArrangement(state, [], { source: 'unknown' }), /supported/);
  assert.throws(() => planBinderArrangement(state, [], { lockedPages: [40] }), /protected page/);
  assert.equal(JSON.stringify(state), before);
});
