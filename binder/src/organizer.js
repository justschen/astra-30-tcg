import { CARDS, CARD_BY_ID, compareCards, locateCard, parseCollection, SLOT_COUNT } from './collection.js';

export function spreadForSlot(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) throw new RangeError('Choose an existing binder pocket.');
  return Math.floor((Math.floor(index / 9) + 1) / 2);
}

export function planBinderArrangement(state, hand, { source = 'hand', sort = 'hand', startSlot = 0, lockedPages = [] } = {}) {
  parseCollection(JSON.stringify(state));
  if (!['hand', 'binder', 'all'].includes(source) || !['hand', 'number', 'name', 'rarity'].includes(sort)) throw new Error('Choose a supported organization strategy.');
  if (!Number.isInteger(startSlot) || startSlot < 0 || startSlot >= SLOT_COUNT) throw new RangeError('Choose a valid starting page.');
  if (!Array.isArray(lockedPages) || lockedPages.some(page => !Number.isInteger(page) || page < 0 || page >= SLOT_COUNT / 9)) throw new RangeError('A protected page is invalid.');
  if (!Array.isArray(hand) || new Set(hand).size !== hand.length || hand.some(id => !CARD_BY_ID.has(id))) throw new Error('Cards in hand must be valid and unique.');
  const locked = new Set(lockedPages), protectedIds = new Set(state.slots.filter((id, index) => id && (locked.has(Math.floor(index / 9)) || index < startSlot)));
  const candidates = source === 'hand' ? hand : source === 'binder' ? state.slots.filter(Boolean) : CARDS.map(card => card.id);
  const ids = candidates.filter(id => !protectedIds.has(id));
  if (sort !== 'hand') ids.sort((a, b) => compareCards(sort)(CARD_BY_ID.get(a), CARD_BY_ID.get(b)));
  const moving = new Set(ids), available = [];
  for (let index = startSlot; index < SLOT_COUNT; index++) {
    if (!locked.has(Math.floor(index / 9)) && (!state.slots[index] || moving.has(state.slots[index]))) available.push(index);
  }
  if (!ids.length) throw new Error('No movable cards match this plan. Pick up cards or choose another source.');
  if (ids.length > available.length) throw new Error(`This plan needs ${ids.length} pockets, but only ${available.length} are available. Earlier and protected pages stay untouched.`);
  const next = structuredClone(state);
  next.slots = next.slots.map(id => moving.has(id) ? null : id);
  for (const pile of Object.keys(next.piles)) next.piles[pile] = next.piles[pile].filter(id => !moving.has(id));
  const placements = ids.map((id, i) => {
    const destination = available[i], from = locateCard(state, id);
    next.slots[destination] = id;
    return { id, from, index: destination, changed: from.kind !== 'slot' || from.index !== destination };
  });
  const checked = parseCollection(JSON.stringify(next));
  return {
    state: checked, hand: hand.filter(id => !moving.has(id)), placements,
    changedCount: placements.filter(placement => placement.changed).length,
    protectedCount: locked.size, skippedHeld: hand.filter(id => protectedIds.has(id)).length,
  };
}
