import { parseCollection, PILES, STORAGE_KEY } from './collection.js';

export const collectionRevision = state => JSON.stringify([state.slots, ...Object.keys(PILES).map(pile => state.piles[pile])]);

export class CollectionConflictError extends Error {
  constructor() { super('This layout changed in another tab. Load the latest saved layout before saving again.'); this.name = 'CollectionConflictError'; }
}

export class CollectionStorage {
  constructor(storage, locks) {
    this.storage = storage; this.locks = locks; this.revision = null; this.generation = 0;
    this.queue = Promise.resolve(); this.replaceRaw = undefined;
    this.latestWrite = Promise.resolve(null);
  }

  load(fallback) {
    const raw = this.storage.getItem(STORAGE_KEY);
    const state = raw === null ? fallback : parseCollection(raw);
    this.revision = raw === null ? null : collectionRevision(state);
    this.replaceRaw = undefined; this.generation++;
    this.latestWrite = Promise.resolve(state);
    return state;
  }

  changedElsewhere() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (this.replaceRaw !== undefined) return raw !== this.replaceRaw;
    return (raw === null ? null : collectionRevision(parseCollection(raw))) !== this.revision;
  }

  suspend() { this.generation++; }

  authorizeRecovery() {
    this.replaceRaw = this.storage.getItem(STORAGE_KEY);
    this.generation++;
  }

  save(state, navigationOnly = false) {
    const snapshot = parseCollection(JSON.stringify(state)), generation = this.generation;
    const operation = async () => {
      if (!this.locks?.request) throw new Error('This browser cannot coordinate safe saving between tabs. Export your layout or use a current browser on HTTPS.');
      return this.locks.request(`${STORAGE_KEY}:writer`, { mode: 'exclusive' }, () => {
        if (generation !== this.generation) throw new CollectionConflictError();
        const raw = this.storage.getItem(STORAGE_KEY);
        if (this.replaceRaw !== undefined ? raw !== this.replaceRaw
          : (raw === null ? null : collectionRevision(parseCollection(raw))) !== this.revision) {
          throw new CollectionConflictError();
        }
        // Navigation merges only the page number; it never writes an older arrangement.
        const next = navigationOnly && raw !== null ? { ...parseCollection(raw), spread: snapshot.spread } : snapshot;
        this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
        this.revision = collectionRevision(next); this.replaceRaw = undefined;
        return next;
      });
    };
    const result = this.queue.then(operation);
    this.latestWrite = result;
    this.queue = result.then(() => {}, () => {});
    return result;
  }

  async whenSaved() {
    let pending;
    do { pending = this.latestWrite; await pending; } while (pending !== this.latestWrite);
  }
}
