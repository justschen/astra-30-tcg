import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  CARDS, CARD_BY_ID, CATALOG, SLOT_COUNT, PAGE_COUNT, SPREAD_COUNT,
  cardImage, collectionCounts, createCollection, faceSlots, filterCards,
  locateCard, moveCard, parseCollection, sortPile, spreadFaces,
} from '../src/collection.js';

const allPlaced = state => [...state.slots.filter(Boolean), ...Object.values(state.piles).flat()];
const bagCard = state => CARDS.find(card => locateCard(state, card.id).kind === 'bag').id;

test('source snapshot retains every variant and only published artwork', async () => {
  assert.equal(CARDS.length, 251);
  assert.equal(CATALOG.uniqueCards, 199);
  assert.equal(CATALOG.variantCount, CARDS.length);
  assert.equal(new Set(CARDS.map(card => card.id)).size, CARDS.length);
  assert.equal(CARDS.filter(card => card.image).length, 251);
  assert.equal(CARDS.filter(card => card.imageStatus === 'pending').length, 0);
  assert.equal(CARDS.filter(card => card.imageVerification).length, 28);
  assert.equal(CATALOG.sourceUpdatedAt, '2026-09-26T14:44:59.918Z');
  assert.equal(createHash('sha256').update(JSON.stringify(CARDS.map(card => card.id))).digest('hex'),
    '708495863568b332de91f35aecc16d0f9fc4ba6e9a7532ba5c22c21a99bc0924');
  await Promise.all(CARDS.filter(card => card.image).map(card => fs.access(new URL(`../public/${card.image}`, import.meta.url))));
  await Promise.all(CARDS.filter(card => card.image).map(card => fs.access(new URL(`../public/${cardImage(card)}`, import.meta.url))));
  for (const card of CARDS) {
    assert.equal(card.order, CARDS.indexOf(card));
    if (card.imageStatus === 'pending') assert.equal(card.image, null);
    else assert.match(card.sourceImage, /^https:\/\/pokecottagecdn\.com\//);
    if (card.imageVerification) {
      assert.equal(card.imageVerification.method, 'visual-review');
      assert.equal(card.imageVerification.sourceStatus, 'pending');
      assert.equal(card.imageVerification.sourceUpdatedAt, CATALOG.sourceUpdatedAt);
      assert.match(card.imageVerification.sourceSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(card.imageVerification.checks, ['name', 'number', 'printing']);
    }
  }
});

test('restored starter artwork uses the printed MEP numbers, not another printing', () => {
  const starters = [
    ['Chimchar', 'MEP 041'], ['Chikorita', 'MEP 046'], ['Cyndaquil', 'MEP 047'],
    ['Totodile', 'MEP 048'], ['Snivy', 'MEP 049'], ['Tepig', 'MEP 050'],
    ['Oshawott', 'MEP 051'], ['Grookey', 'MEP 052'], ['Scorbunny', 'MEP 053'], ['Sobble', 'MEP 054'],
  ];
  for (const [name, number] of starters) {
    const card = CARDS.find(card => card.name === name && card.number === number);
    assert.ok(card, `${name} ${number} is present`);
    assert.equal(card.imageStatus, 'verified');
    assert.ok(card.imageVerification);
    assert.equal(cardImage(card, true), `cards/${card.id}.webp`);
    assert.equal(cardImage(card), `cards/thumbs/${card.id}.webp`);
  }
  const nidorina = CARDS.filter(card => card.name === 'Nidorina' && card.number === 'MEP 101');
  assert.equal(nidorina.length, 2);
  assert.equal(new Set(nidorina.map(card => card.imageVerification.sourceSha256)).size, 2);
  assert.equal(new Set(nidorina.map(card => card.image)).size, 2);
});

test('20 double-sided sheets expose all 360 pockets exactly once', () => {
  assert.equal(PAGE_COUNT, 40);
  assert.equal(SLOT_COUNT, 360);
  assert.equal(SPREAD_COUNT, 21);
  assert.deepEqual(spreadFaces(0), [null, 0]);
  assert.deepEqual(spreadFaces(20), [39, null]);
  const slots = Array.from({ length: SPREAD_COUNT }, (_, spread) => spreadFaces(spread).flatMap(faceSlots)).flat();
  assert.deepEqual(slots, Array.from({ length: 360 }, (_, i) => i));
  assert.throws(() => spreadFaces(-1));
  assert.throws(() => spreadFaces(21));
  assert.throws(() => faceSlots(40));
});

test('starter layout has distinct cards in realistic pockets and three stacks', () => {
  const state = createCollection();
  assert.equal(state.slots.length, 360);
  assert.deepEqual(collectionCounts(state), { binder: 14, table: 27, bag: 210 });
  assert.equal(new Set(allPlaced(state)).size, allPlaced(state).length);
  assert.deepEqual(parseCollection(JSON.stringify(state)), state);
});

test('placing a bag card fills exactly one selected pocket without mutating the prior layout', () => {
  const state = createCollection(), id = bagCard(state);
  const next = moveCard(state, id, { kind: 'slot', index: 359 });
  assert.equal(next.slots[359], id);
  assert.equal(state.slots[359], null);
  assert.deepEqual(locateCard(next, id), { kind: 'slot', index: 359 });
  assert.deepEqual(collectionCounts(next), { binder: 15, table: 27, bag: 209 });
});

test('occupied binder pockets swap, rather than duplicate or discard cards', () => {
  const state = createCollection(), a = state.slots[9], b = state.slots[10];
  const next = moveCard(state, a, { kind: 'slot', index: 10 });
  assert.equal(next.slots[9], b); assert.equal(next.slots[10], a);
  assert.deepEqual(new Set(allPlaced(next)), new Set(allPlaced(state)));
  assert.equal(new Set(allPlaced(next)).size, allPlaced(next).length);
});

test('a bag-to-occupied-pocket move returns the displaced card to the bag', () => {
  const state = createCollection(), id = bagCard(state), previous = state.slots[9];
  const next = moveCard(state, id, { kind: 'slot', index: 9 });
  assert.equal(next.slots[9], id);
  assert.deepEqual(locateCard(next, previous), { kind: 'bag' });
  assert.deepEqual(collectionCounts(next), collectionCounts(state));
});

test('a stack-to-pocket swap preserves the displaced card in the source stack position', () => {
  const state = createCollection(), id = state.piles.unsorted[3], previous = state.slots[9];
  const next = moveCard(state, id, { kind: 'slot', index: 9 });
  assert.equal(next.piles.unsorted[3], previous); assert.equal(next.slots[9], id);
  assert.deepEqual(new Set(allPlaced(next)), new Set(allPlaced(state)));
});

test('cards move between stacks and back to the bag without duplication', () => {
  const state = createCollection(), id = state.piles.unsorted[0];
  let next = moveCard(state, id, { kind: 'pile', pile: 'favorites' });
  assert.equal(next.piles.favorites[0], id); assert.ok(!next.piles.unsorted.includes(id));
  next = moveCard(next, id, { kind: 'pile', pile: 'favorites' });
  assert.equal(next.piles.favorites.filter(item => item === id).length, 1);
  next = moveCard(next, id, { kind: 'bag' });
  assert.deepEqual(locateCard(next, id), { kind: 'bag' });
  assert.equal(allPlaced(next).filter(item => item === id).length, 0);
});

test('stack sorting changes physical order and preserves membership', () => {
  const state = createCollection();
  const next = sortPile(state, 'unsorted', 'name');
  const names = next.piles.unsorted.map(id => CARD_BY_ID.get(id).name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(new Set(next.piles.unsorted), new Set(state.piles.unsorted));
  assert.notEqual(next, state);
});

test('bag search combines name, number, category, rarity, and location filters', () => {
  const state = createCollection();
  assert.ok(filterCards(state, { query: 'pIkAcHu 023' }).every(card => card.name === 'Pikachu' && card.number.includes('023')));
  assert.equal(filterCards(state, { query: 'pIkAcHu 023' }).length, 1);
  assert.equal(filterCards(state, { category: 'classic' }).length, 30);
  assert.equal(filterCards(state, { location: 'binder' }).length, 14);
  assert.equal(filterCards(state, { location: 'bag' }).length, 210);
  assert.equal(filterCards(state, { location: 'pile:unsorted' }).length, 12);
  assert.equal(filterCards(state, { query: 'definitely-not-a-card' }).length, 0);
  assert.equal(filterCards(state, { rarity: 'Special Illustration Rare' }).length, 10);
});

test('invalid moves are rejected without changing the collection', () => {
  const state = createCollection(), id = bagCard(state), before = JSON.stringify(state);
  for (const destination of [null, { kind: 'other' }, { kind: 'slot', index: -1 }, { kind: 'slot', index: 360 }, { kind: 'slot', index: 2.5 }, { kind: 'pile', pile: 'missing' }]) {
    assert.throws(() => moveCard(state, id, destination));
  }
  assert.throws(() => moveCard(state, 'unknown-id', { kind: 'bag' }));
  assert.equal(JSON.stringify(state), before);
});

test('saved layouts reject malformed shapes, duplicates, unknown cards, and unsupported versions', () => {
  assert.throws(() => parseCollection('not-json'), /JSON/);
  const mutations = [
    state => { state.version = 2; },
    state => { state.spread = -1; },
    state => { state.spread = 21; },
    state => { state.slots.pop(); },
    state => { state.slots[0] = state.slots[9]; },
    state => { state.slots[0] = 'missing'; },
    state => { state.piles.unsorted.push('missing'); },
    state => { state.piles.favorites.push(state.slots[9]); },
    state => { state.piles = []; },
    state => { state.piles.unsorted = 'invalid'; },
    state => { state.piles.surprise = []; },
  ];
  mutations.forEach(mutate => {
    const state = createCollection(); mutate(state);
    assert.throws(() => parseCollection(JSON.stringify(state)));
  });
});
