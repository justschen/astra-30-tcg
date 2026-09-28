import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollection, moveCard, parseCollection, STORAGE_KEY } from '../src/collection.js';
import { CollectionConflictError, CollectionStorage } from '../src/collection-storage.js';

function fixture() {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let queue = Promise.resolve();
  const locks = { request(name, options, action) {
    const result = queue.then(action); queue = result.then(() => {}, () => {}); return result;
  } };
  return { data, storage, locks, reader: () => parseCollection(storage.getItem(STORAGE_KEY)) };
}

test('a stale tab cannot replace newer placements, even with only page navigation', async () => {
  const f = fixture(), initial = createCollection();
  f.storage.setItem(STORAGE_KEY, JSON.stringify(initial));
  const a = new CollectionStorage(f.storage, f.locks), b = new CollectionStorage(f.storage, f.locks);
  a.load(initial); b.load(initial);
  const moved = moveCard(initial, initial.slots[9], { kind: 'slot', index: 17 });
  await a.save(moved);
  assert.equal(b.changedElsewhere(), true);
  await assert.rejects(b.save({ ...initial, spread: 2 }, true), CollectionConflictError);
  assert.deepEqual(f.reader(), moved);
  assert.deepEqual(b.load(initial), moved);
  await b.save({ ...moved, spread: 2 }, true);
  assert.equal(a.changedElsewhere(), false, 'Changing only the page is not an arrangement conflict');
  assert.deepEqual(f.reader().slots, moved.slots);
});

test('concurrent writers serialize and one fails explicitly instead of losing a placement', async () => {
  const f = fixture(), initial = createCollection(); f.storage.setItem(STORAGE_KEY, JSON.stringify(initial));
  const a = new CollectionStorage(f.storage, f.locks), b = new CollectionStorage(f.storage, f.locks);
  a.load(initial); b.load(initial);
  const first = moveCard(initial, initial.slots[9], { kind: 'slot', index: 17 });
  const second = moveCard(initial, initial.slots[10], { kind: 'slot', index: 20 });
  const results = await Promise.allSettled([a.save(first), b.save(second)]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.deepEqual(f.reader(), first);
});

test('queued local operations retain their order and external reload cancels old writes', async () => {
  const f = fixture(), initial = createCollection(), store = new CollectionStorage(f.storage, f.locks); store.load(initial);
  const next = moveCard(initial, initial.slots[9], { kind: 'slot', index: 17 });
  await Promise.all([store.save(initial), store.save(next), store.save({ ...next, spread: 4 }, true)]);
  assert.equal(f.reader().spread, 4); assert.deepEqual(f.reader().slots, next.slots);
  const pending = store.save(initial); store.suspend();
  await assert.rejects(pending, CollectionConflictError);
  assert.deepEqual(f.reader().slots, next.slots);
});

test('corrupt data, blocked storage and unavailable locks never silently overwrite saved work', async () => {
  const f = fixture(), store = new CollectionStorage(f.storage, f.locks);
  f.storage.setItem(STORAGE_KEY, 'broken');
  assert.throws(() => store.load(createCollection()), /valid JSON/);
  await assert.rejects(store.save(createCollection()), /valid JSON/);
  assert.equal(f.storage.getItem(STORAGE_KEY), 'broken');
  store.authorizeRecovery(); await store.save(createCollection()); assert.deepEqual(f.reader(), createCollection());
  const noLock = new CollectionStorage(f.storage, null); noLock.load(createCollection());
  await assert.rejects(noLock.save(createCollection()), /coordinate safe saving/);
  f.storage.setItem(STORAGE_KEY, 'another version');
  store.authorizeRecovery(); f.storage.setItem(STORAGE_KEY, 'newer invalid version');
  await assert.rejects(store.save(createCollection()), CollectionConflictError);
  assert.equal(f.storage.getItem(STORAGE_KEY), 'newer invalid version');
});

test('reload waits for a failure-propagating completion instead of the recovery sequencing queue', async () => {
  const f = fixture(), state = createCollection(), store = new CollectionStorage(f.storage, f.locks);
  store.load(state);
  f.storage.setItem = () => { throw new Error('Storage quota exhausted'); };
  const write = store.save(state);
  const reload = store.whenSaved();
  await assert.rejects(write, /quota/);
  await assert.rejects(reload, /quota/);
  await store.queue;
  assert.equal(f.storage.getItem(STORAGE_KEY), null);
});

test('loading an external version supersedes old queued failures without cancelling the recovered generation', async () => {
  const f = fixture(), initial = createCollection(); f.storage.setItem(STORAGE_KEY, JSON.stringify(initial));
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const locks = { request: async (name, options, action) => { await held; return action(); } };
  const store = new CollectionStorage(f.storage, locks); store.load(initial);
  const generation = store.generation, pending = store.save(initial);
  const external = moveCard(initial, initial.slots[9], { kind: 'slot', index: 17 });
  f.storage.setItem(STORAGE_KEY, JSON.stringify(external)); store.suspend(); store.load(initial);
  let failedCurrentGeneration = false;
  pending.catch(() => { if (generation === store.generation) failedCurrentGeneration = true; });
  release(); await assert.rejects(pending, CollectionConflictError);
  await store.whenSaved();
  assert.equal(failedCurrentGeneration, false);
  await store.save(external); assert.deepEqual(f.reader(), external);
});
