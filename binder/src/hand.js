import { CARD_BY_ID, moveCard } from './collection.js';

export function addToHand(hand, id) {
  if (!CARD_BY_ID.has(id)) throw new Error('This card is not in the collection.');
  return hand.includes(id) ? hand : [...hand, id];
}

export function removeFromHand(hand, id) {
  return hand.includes(id) ? hand.filter(card => card !== id) : hand;
}

export function selectedFromHand(hand, selectedId) {
  return hand.includes(selectedId) ? selectedId : hand[0] || null;
}

export function returnHandToBag(state, hand) {
  let next = state;
  for (const id of hand) next = moveCard(next, id, { kind: 'bag' });
  return { state: next, hand: [] };
}

export function handLayout(count, viewportWidth, viewportHeight) {
  const cardWidth = viewportWidth < 768 || viewportHeight < 620 ? 62 : 78;
  const overlap = Math.round(cardWidth * .18), stride = cardWidth - overlap, padding = 24;
  const available = Math.max(cardWidth + padding, Math.min(1180, viewportWidth - (viewportWidth < 768 ? 24 : 52)));
  const capacity = Math.max(1, Math.floor((available - padding - cardWidth) / stride) + 1);
  const columns = Math.max(1, Math.min(count, capacity));
  return { cardWidth, overlap, stride, columns, rows: Math.ceil(count / columns), width: (columns - 1) * stride + cardWidth + padding };
}

export function canPlaceInPocket(state, hand, index) {
  return hand.length > 0 && Number.isInteger(index) && index >= 0 && index < state.slots.length &&
    (state.slots[index] === null || hand.includes(state.slots[index]));
}

export function placeFromHand(state, hand, destination, selectedId = hand[0]) {
  if (!hand.length) throw new Error('Pick up a card first.');
  if (!hand.includes(selectedId)) throw new Error('Select a card in your hand before placing it.');
  if (destination?.kind === 'slot' && !canPlaceInPocket(state, hand, destination.index)) {
    throw new Error('Pick up the card in that pocket before placing another one there.');
  }
  return { state: moveCard(state, selectedId, destination), hand: removeFromHand(hand, selectedId), id: selectedId };
}
