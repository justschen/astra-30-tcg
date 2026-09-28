import catalog from './catalog-data.json' with { type: 'json' };

export const CATALOG = catalog;
export const CARDS = catalog.cards;
export const CARD_BY_ID = new Map(CARDS.map(card => [card.id, card]));
export const SHEET_COUNT = 20;
export const PAGE_COUNT = SHEET_COUNT * 2;
export const SLOT_COUNT = PAGE_COUNT * 9;
export const SPREAD_COUNT = SHEET_COUNT + 1;
export const STORAGE_KEY = 'afterhours.binder.v1';
export const PILES = { unsorted: 'To sort', favorites: 'Keepers', trades: 'Trades' };
export const CATEGORIES = {
  main: 'Main set', secret: 'Secret rares', classic: 'Classic Collection',
  promos: 'Promos', variants: 'Variants', energy: 'Holo energies',
};
export const RARITY_ORDER = ['Common', 'Rare', 'Pikachu', 'Double Rare', 'Illustration Rare', 'Special Illustration Rare', 'Futuristic Rare', 'RGB Rare', 'Classic Collection', 'Promo', 'Energy'];
export const rarityLabel = rarity => rarity === 'Pikachu' ? 'Pikachu holo' : rarity;

export function cardImage(card, fullSize = false) {
  return card.image && (fullSize ? card.image : card.image.replace('cards/', 'cards/thumbs/'));
}

/** @typedef {{version: 1, spread: number, slots: (string|null)[], piles: Record<string, string[]>}} Collection */
/** @typedef {{kind: 'bag'} | {kind: 'slot', index: number} | {kind: 'pile', pile: string, index?: number}} Location */

export function spreadFaces(spread) {
  if (!Number.isInteger(spread) || spread < 0 || spread >= SPREAD_COUNT) {
    throw new RangeError('This spread does not exist.');
  }
  return [spread === 0 ? null : spread * 2 - 1, spread === SHEET_COUNT ? null : spread * 2];
}

export function faceSlots(face) {
  if (face === null) return [];
  if (!Number.isInteger(face) || face < 0 || face >= PAGE_COUNT) throw new RangeError('This page does not exist.');
  return Array.from({ length: 9 }, (_, i) => face * 9 + i);
}

export function faceLabel(face) {
  return face === null ? 'Inside cover' : `Sheet ${Math.floor(face / 2) + 1}, ${face % 2 ? 'back' : 'front'}`;
}

/** @returns {Collection} */
export function createCollection() {
  const state = {
    version: 1, spread: 1,
    slots: Array(SLOT_COUNT).fill(null),
    piles: { unsorted: [], favorites: [], trades: [] },
  };
  const featured = CARDS.filter(card => card.imageStatus === 'verified' &&
    ['Special Illustration Rare', 'RGB Rare', 'Classic Collection', 'Illustration Rare'].includes(card.rarity));
  const selected = [];
  for (const name of ['Pikachu', 'Charizard', 'Blastoise', 'Venusaur', 'Mew', 'Umbreon', 'Lugia', 'Gengar']) {
    const card = featured.find(item => item.name.includes(name) && !selected.includes(item));
    if (card) selected.push(card);
  }
  for (const card of featured) {
    if (!selected.includes(card) && selected.length < 14) selected.push(card);
  }
  const starterSlots = [9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 23, 25];
  selected.slice(0, 14).forEach((card, i) => { state.slots[starterSlots[i]] = card.id; });
  const loose = CARDS.filter(card => card.imageStatus === 'verified' && !state.slots.includes(card.id));
  state.piles.unsorted = loose.slice(0, 12).map(card => card.id);
  state.piles.favorites = loose.slice(70, 79).map(card => card.id);
  state.piles.trades = loose.slice(110, 116).map(card => card.id);
  return state;
}

/** @param {Collection} state @param {string} id @returns {Location} */
export function locateCard(state, id) {
  const slot = state.slots.indexOf(id);
  if (slot !== -1) return { kind: 'slot', index: slot };
  for (const pile of Object.keys(PILES)) {
    const index = state.piles[pile].indexOf(id);
    if (index !== -1) return { kind: 'pile', pile, index };
  }
  return { kind: 'bag' };
}

export function locationLabel(location) {
  if (location.kind === 'slot') return `Page ${Math.floor(location.index / 9) + 1}, pocket ${location.index % 9 + 1}`;
  if (location.kind === 'pile') return PILES[location.pile];
  return 'In your bag';
}

/** Moving onto an occupied pocket swaps back to the source, never discarding a card. */
export function moveCard(state, id, destination) {
  if (!CARD_BY_ID.has(id)) throw new Error('This card is not in the collection.');
  if (!destination || !['bag', 'slot', 'pile'].includes(destination.kind)) throw new Error('Choose a valid destination.');
  if (destination.kind === 'slot' &&
    (!Number.isInteger(destination.index) || destination.index < 0 || destination.index >= SLOT_COUNT)) {
    throw new RangeError('Choose a pocket in this binder.');
  }
  if (destination.kind === 'pile' && !Object.hasOwn(PILES, destination.pile)) throw new Error('This stack does not exist.');
  const source = locateCard(state, id);
  if (source.kind === 'bag' && destination.kind === 'bag') return state;
  if (source.kind === 'slot' && destination.kind === 'slot' && source.index === destination.index) return state;
  const next = structuredClone(state);
  const displaced = destination.kind === 'slot' ? next.slots[destination.index] : null;
  if (source.kind === 'slot') next.slots[source.index] = null;
  if (source.kind === 'pile') next.piles[source.pile].splice(source.index, 1);
  if (displaced) {
    if (source.kind === 'slot') next.slots[source.index] = displaced;
    if (source.kind === 'pile') next.piles[source.pile].splice(source.index, 0, displaced);
  }
  if (destination.kind === 'slot') next.slots[destination.index] = id;
  if (destination.kind === 'pile') next.piles[destination.pile].unshift(id);
  return next;
}

export function compareCards(sort) {
  if (sort === 'name') return (a, b) => a.name.localeCompare(b.name) || a.order - b.order;
  if (sort === 'rarity') return (a, b) => {
    const first = RARITY_ORDER.indexOf(a.rarity), second = RARITY_ORDER.indexOf(b.rarity);
    return (first < 0 ? RARITY_ORDER.length : first) - (second < 0 ? RARITY_ORDER.length : second)
      || a.rarity.localeCompare(b.rarity) || a.order - b.order;
  };
  return (a, b) => a.order - b.order;
}

export function sortPile(state, pile, sort = 'number') {
  if (!Object.hasOwn(PILES, pile)) throw new Error('This stack does not exist.');
  const next = structuredClone(state);
  next.piles[pile].sort((a, b) => compareCards(sort)(CARD_BY_ID.get(a), CARD_BY_ID.get(b)));
  return next;
}

const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filterCards(state, { query = '', category = 'all', rarity = 'all', location = 'all', sort = 'number' } = {}) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return CARDS.filter(card => {
    if (category !== 'all' && card.category !== category) return false;
    if (rarity !== 'all' && card.rarity !== rarity) return false;
    const place = locateCard(state, card.id);
    if (location === 'bag' && place.kind !== 'bag') return false;
    if (location === 'binder' && place.kind !== 'slot') return false;
    if (location === 'table' && place.kind !== 'pile') return false;
    if (location.startsWith('pile:') && (place.kind !== 'pile' || place.pile !== location.slice(5))) return false;
    const text = normalize(`${card.name} ${card.number} ${card.rarity} ${card.variant} ${card.artist}`);
    return words.every(word => text.includes(word));
  }).sort(compareCards(sort));
}

export function collectionCounts(state) {
  const binder = state.slots.filter(Boolean).length;
  const table = Object.values(state.piles).reduce((sum, ids) => sum + ids.length, 0);
  return { binder, table, bag: CARDS.length - binder - table };
}

export function parseCollection(raw) {
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('The layout file is not valid JSON.'); }
  if (!data || data.version !== 1) throw new Error('This layout version is not supported.');
  if (!Number.isInteger(data.spread) || data.spread < 0 || data.spread >= SPREAD_COUNT) throw new Error('The saved page is invalid.');
  if (!Array.isArray(data.slots) || data.slots.length !== SLOT_COUNT) throw new Error('A layout must contain exactly 360 pockets.');
  if (!data.piles || typeof data.piles !== 'object' || Array.isArray(data.piles) ||
    Object.keys(data.piles).length !== Object.keys(PILES).length ||
    Object.keys(PILES).some(key => !Array.isArray(data.piles[key]))) {
    throw new Error('The saved table stacks are invalid.');
  }
  if (data.slots.some(id => id !== null && (typeof id !== 'string' || !CARD_BY_ID.has(id)))) {
    throw new Error('The layout includes an unknown pocket card.');
  }
  const all = [...data.slots.filter(id => id !== null), ...Object.values(data.piles).flat()];
  if (all.some(id => typeof id !== 'string' || !CARD_BY_ID.has(id))) throw new Error('The layout includes an unknown stack card.');
  if (new Set(all).size !== all.length) throw new Error('The layout places the same card in more than one location.');
  return { version: 1, spread: data.spread, slots: data.slots, piles: data.piles };
}
