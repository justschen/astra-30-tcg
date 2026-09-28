import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, createCollection, locateCard, parseCollection } from '../src/collection.js';
import { addToHand, canPlaceInPocket, placeFromHand, removeFromHand, selectedFromHand } from '../src/hand.js';

test('hand preserves pickup order and never adds a second copy', () => {
  const ids = CARDS.slice(0, 3).map(card => card.id);
  let hand = [];
  for (const id of ids) hand = addToHand(hand, id);
  assert.deepEqual(hand, ids);
  assert.equal(addToHand(hand, ids[1]), hand);
  assert.deepEqual(removeFromHand(hand, ids[1]), [ids[0], ids[2]]);
  assert.throws(() => addToHand(hand, 'unknown-card'));
});

test('click placement consumes exactly the oldest card, across different pages', () => {
  let state = createCollection();
  const ids = [state.slots[9], state.piles.unsorted[0], CARDS.find(card => locateCard(state, card.id).kind === 'bag').id];
  let hand = [...ids];
  for (const [i, pocket] of [17, 200, 359].entries()) {
    const result = placeFromHand(state, hand, { kind: 'slot', index: pocket });
    assert.equal(result.id, ids[i]);
    assert.equal(result.state.slots[pocket], ids[i]);
    assert.deepEqual(result.hand, ids.slice(i + 1));
    ({ state, hand } = result);
    parseCollection(JSON.stringify(state));
  }
  assert.equal(hand.length, 0);
});

test('reserved source pockets are usable without losing another queued card', () => {
  const original = createCollection();
  const a = original.slots[9], b = original.slots[10], c = original.slots[11];
  let hand = [a, b, c], state = original;
  assert.equal(canPlaceInPocket(state, hand, 10), true);
  ({ state, hand } = placeFromHand(state, hand, { kind: 'slot', index: 10 }));
  assert.equal(state.slots[10], a);
  assert.equal(locateCard(state, b).kind, 'slot');
  ({ state, hand } = placeFromHand(state, hand, { kind: 'slot', index: 11 }));
  assert.equal(state.slots[11], b);
  assert.deepEqual(hand, [c]);
  parseCollection(JSON.stringify(state));
  assert.equal(original.slots[9], a);
  assert.equal(original.slots[10], b);
});

test('picking up and cancelling is transient and cannot alter a saved layout', () => {
  const state = createCollection(), before = JSON.stringify(state);
  const hand = addToHand(addToHand([], state.slots[9]), state.piles.unsorted[0]);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(removeFromHand(removeFromHand(hand, hand[0]), hand[1]), []);
  assert.equal(JSON.stringify(state), before);
});

test('occupied pockets collect cards instead of silently replacing them', () => {
  const state = createCollection(), hand = [state.slots[9]];
  assert.equal(canPlaceInPocket(state, hand, 10), false);
  assert.throws(() => placeFromHand(state, hand, { kind: 'slot', index: 10 }), /Pick up/);
  assert.throws(() => placeFromHand(state, [], { kind: 'slot', index: 17 }), /Pick up/);
  assert.equal(canPlaceInPocket(state, hand, 360), false);
});

test('returning or stacking cards still follows FIFO, including a bag no-op', () => {
  const state = createCollection();
  const bagId = CARDS.find(card => locateCard(state, card.id).kind === 'bag').id;
  let result = placeFromHand(state, [bagId, state.slots[9]], { kind: 'bag' });
  assert.equal(result.state, state);
  assert.deepEqual(result.hand, [state.slots[9]]);
  result = placeFromHand(result.state, result.hand, { kind: 'pile', pile: 'trades' });
  assert.equal(result.state.piles.trades[0], state.slots[9]);
  assert.equal(result.state.slots[9], null);
  assert.deepEqual(result.hand, []);
});

test('a selected card can be placed without reordering the remaining hand', () => {
  const state = createCollection(), hand = [state.slots[9], state.slots[10], state.slots[11]];
  const result = placeFromHand(state, hand, { kind: 'slot', index: 17 }, hand[2]);
  assert.equal(result.state.slots[17], hand[2]);
  assert.equal(result.state.slots[11], null);
  assert.deepEqual(result.hand, hand.slice(0, 2));
  assert.equal(result.id, hand[2]);
  assert.deepEqual(hand, state.slots.slice(9, 12));
  assert.throws(() => placeFromHand(state, hand, { kind: 'slot', index: 17 }, CARDS[0].id), /Select a card/);
});

test('selection survives pickup and falls back safely when the selected card leaves', () => {
  const ids = CARDS.slice(0, 3).map(card => card.id);
  assert.equal(selectedFromHand(ids, ids[1]), ids[1]);
  assert.equal(selectedFromHand(ids.slice(0, 1), ids[1]), ids[0]);
  assert.equal(selectedFromHand([], ids[1]), null);
});
