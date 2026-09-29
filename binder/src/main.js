import './styles.css';
import {
  CARDS, CARD_BY_ID, CATALOG, CATEGORIES, PAGE_COUNT, PILES, RARITY_ORDER, STORAGE_KEY, SPREAD_COUNT,
  cardImage, collectionCounts, createCollection, faceLabel, faceSlots, filterCards,
  locateCard, locationLabel, parseCollection, rarityLabel, sortPile, spreadFaces,
} from './collection.js';
import { addToHand, canPlaceInPocket, handLayout, placeFromHand, removeFromHand, returnHandToBag, selectedFromHand } from './hand.js';
import { nearestPocket } from './drag.js';
import { hydrateIcons, icon } from './icons.js';
import { RoomAudio } from './audio.js';
import { installIdleHUD } from './idle-hud.js';
import { DEFAULT_CITY_HOUR, formatCityTime, TIME_PRESETS } from './day-cycle.js';
import { collectionRevision, CollectionConflictError, CollectionStorage } from './collection-storage.js';
import { planBinderArrangement, spreadForSlot } from './organizer.js';
import { GRAPHICS_KEY, GRAPHICS_PRESETS } from './render-quality.js';
import { installMobileViewport } from './mobile-viewport.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const compactControls = window.matchMedia('(max-width: 767px), (pointer: coarse)');
const audio = new RoomAudio();
let state = createCollection();
let hand = [];
let selectedCardId = null;
let handCollapsed = false;
let storageEnabled = true;
let storageConflict = false;
let saveTicket = 0;
const storage = new CollectionStorage({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}, navigator.locks);
let room = null;
let idleHUD = null;
let inspectedId = null;
let inspectReturn = null;
let inspectOrigin = null;
let organizationPlan = null;
let organizationBase = '';
let pendingFocusSlot = null;
let autoFoldHand = true;
let isTurning = false;
let sceneFailed = false;
let warmLighting = false;
let graphicsQuality='auto';
let weather = 'clear';
let cityMotion = !reducedMotion.matches;
let cityHour = DEFAULT_CITY_HOUR;
let cloudCover = .6;
let cloudSpeed = 1;
let trafficDensity = .75;
let cityWindows = true;
let cityTower = true;
let gesture = null;
let cancelledPointer = null;
let ignoreClickUntil = 0;
let toastTimer = 0;
let projectedPockets = [];
let hoverIndex = null;
let activeView = 'binder';
let hudHidden=false;
let admiredId=null;
const history = [];
const filters = { query: '', category: 'all', rarity: 'all', location: 'all', sort: 'number' };
const weatherNames = { clear: 'Clear', rain: 'Rain', fog: 'Fog' };
const weatherIcons = { clear: 'sun', rain: 'rain', fog: 'fog' };

hydrateIcons();
installMobileViewport();
$('bag-filters').open=!compactControls.matches;
compactControls.addEventListener('change',()=>{ $('bag-filters').open=!compactControls.matches; });
document.addEventListener('pointerdown', () => { document.documentElement.dataset.inputMode = 'pointer'; }, { passive: true });
document.addEventListener('keydown', event => {
  if (event.key === 'Tab' || event.key.startsWith('Arrow')) document.documentElement.dataset.inputMode = 'keyboard';
}, true);
try {
  state = storage.load(state);
} catch (error) {
  storageEnabled = false;
  storageWarning(`Your previous layout could not be loaded: ${error.message} It has not been overwritten.`);
}
function pendingArt(card, failed = false) {
  return `<span class="pending-art">${icon('cards')}<strong>${escape(card.name)}</strong><span>${escape(card.number)}</span><small>${failed ? 'Image unavailable' : 'Artwork pending'}<br>Checklist slot reserved</small></span>`;
}

function art(card, eager = false) {
  return card.image
    ? `<img src="${escape(cardImage(card, eager))}" alt="${escape(`${card.name}, ${card.number}, ${card.variant}`)}" draggable="false" loading="${eager ? 'eager' : 'lazy'}" width="630" height="880" data-art-id="${escape(card.id)}">`
    : pendingArt(card);
}

function storageWarning(message) {
  document.documentElement.dataset.saveState = 'blocked';
  $('storage-message').textContent = message;
  $('storage-warning').hidden = false;
  $('save-status').innerHTML = `${icon('help')}Not saved`;
  $('save-status').classList.add('is-error');
}

function persist(navigationOnly = false) {
  if (!storageEnabled) return;
  const ticket = ++saveTicket;
  const generation = storage.generation;
  document.documentElement.dataset.saveState = 'saving';
  $('save-status').textContent = 'Saving...';
  storage.save(state, navigationOnly).then(() => {
    if (ticket !== saveTicket || !storageEnabled) return;
    document.documentElement.dataset.saveState = 'saved';
    $('storage-warning').hidden = true; $('storage-load-latest').hidden = true;
    $('save-status').innerHTML = `${icon('check')}Saved on this device`; $('save-status').classList.remove('is-error');
  }).catch(error => {
    if (generation !== storage.generation) return;
    storageEnabled = false; storage.suspend(); saveTicket++;
    console.error('Could not save the binder layout.', error);
    storageConflict = error instanceof CollectionConflictError;
    $('storage-retry').hidden = storageConflict; $('storage-load-latest').hidden = !storageConflict;
    storageWarning(storageConflict
      ? 'Another tab saved a different layout. Saving is paused so neither version is overwritten. Load latest, or export this tab first.'
      : `This browser could not save your layout. ${error.message} Export a backup before leaving.`);
  });
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  const modal = document.querySelector('dialog[open]');
  const target = modal ? (modal.querySelector('.dialog-notice') || (() => {
    const notice = document.createElement('p'); notice.className = 'dialog-notice'; modal.prepend(notice); return notice;
  })()) : $('toast');
  target.textContent = message; target.hidden = false;
  target.classList.toggle('is-error', error);
  target.setAttribute('role', error ? 'alert' : 'status');
  toastTimer = setTimeout(() => { target.hidden = true; }, error ? 8000 : 3200);
}

function remember() {
  history.push({ state, hand, selectedCardId, handCollapsed });
  if (history.length > 30) history.shift();
}

function renderNavigation() {
  const numbers = spreadFaces(state.spread).filter(face => face !== null).map(face => String(face + 1).padStart(2, '0'));
  $('page-label').innerHTML = `${numbers.join(' <span class="page-dash">/</span> ')} <span class="page-total">of 40</span>`;
  $('page-label').setAttribute('aria-label', `Open pages ${numbers.join(' and ')} of 40`);
  $('flat-page-label').textContent = `Pages ${numbers.join(' / ')} of 40`;
  $('previous-page').disabled = isTurning || state.spread === 0;
  $('next-page').disabled = isTurning || state.spread === SPREAD_COUNT - 1;
  $('flat-previous').disabled = isTurning || state.spread === 0;
  $('flat-next').disabled = isTurning || state.spread === SPREAD_COUNT - 1;
  $('undo-action').disabled = !history.length || isTurning;
  $('import-layout').disabled = isTurning;
  $('storage-load-latest').disabled = isTurning;
  $('bag-place').disabled = !hand.length || isTurning;
  $('hand-clear').disabled = !hand.length || isTurning;
  $('hand-collapse').disabled = !hand.length || isTurning;
  $('hand-admire').disabled = !hand.length || isTurning || !room || sceneFailed;
  $('admire-card').disabled = isTurning || !room || sceneFailed;
  for (const id of ['page-map-open','flat-page-select','organizer-open','flat-organize','organizer-preview']) $(id).disabled = isTurning;
  $('flat-page-select').value = String(state.spread);
  $('hand-cards').querySelectorAll('button').forEach(button => { button.disabled = isTurning; });
}

function renderHand() {
  const active = document.activeElement;
  const focusedCard = active?.closest('#hand-cards') ? active.dataset.handSelect : null;
  $('hand-tray').hidden = !hand.length;
  if (!hand.length) handCollapsed = false;
  document.querySelector('.room-coordinate').hidden = Boolean(hand.length)&&!hudHidden;
  if(admiredId&&!hand.includes(admiredId))stopAdmiring();
  $('hand-cards').innerHTML = hand.map((id, index) => {
    const card = CARD_BY_ID.get(id);
    return `<li data-hand-id="${escape(id)}"><button class="hand-card-art" data-hand-select="${escape(id)}" aria-pressed="${id === selectedCardId}" aria-label="Select ${escape(card.name)}, ${escape(card.number)}, card ${index + 1} of ${hand.length}" title="${escape(card.name)} ${escape(card.number)}: click to select; double-click or press E to inspect">${art(card)}</button></li>`;
  }).join('');
  $('bag-place').textContent = hand.length ? `Back to binder · ${hand.length} in hand` : 'Pick up cards first';
  $('stage').classList.toggle('is-holding', Boolean(hand.length));
  updateHandLayout();
  updateHandSelection();
  if (focusedCard) {
    const replacement = $('hand-cards').querySelector(`[data-hand-select="${focusedCard}"]`) ||
      $('hand-cards').querySelector('[aria-pressed="true"]') || $('bag-open');
    replacement.focus({ preventScroll: true });
  } else if (active?.id === 'hand-clear' && !hand.length) {
    $('bag-open').focus({ preventScroll: true });
  }
  updateBagSelection();
  updatePocketStates();
  updateInspectorActions();
  foldObstructingHand();
}

function updateHandLayout() {
  const layout = handLayout(handCollapsed ? 1 : hand.length, window.innerWidth, window.innerHeight);
  const tray = $('hand-tray');
  tray.style.setProperty('--hand-width', `${Math.max(230, layout.width)}px`);
  tray.style.setProperty('--hand-card-size', `${layout.cardWidth}px`);
  tray.style.setProperty('--hand-overlap', `${layout.overlap}px`);
  tray.style.setProperty('--hand-stride', `${layout.stride}px`);
  tray.style.setProperty('--hand-columns', layout.columns);
  $('hand-cards').querySelectorAll('li').forEach((item, index) => {
    const row = handCollapsed ? 0 : Math.floor(index / layout.columns);
    const itemsInRow = Math.min(layout.columns, hand.length - row * layout.columns);
    item.style.gridRow = row + 1;
    item.style.gridColumn = handCollapsed ? 1 : layout.columns - itemsInRow + index % layout.columns + 1;
  });
  tray.classList.toggle('is-collapsed', handCollapsed);
  $('hand-collapse').textContent = handCollapsed ? `Show ${hand.length} cards` : 'Fold hand';
  $('hand-collapse').setAttribute('aria-expanded', String(!handCollapsed));
}

function foldObstructingHand() {
  if (!autoFoldHand || handCollapsed || hand.length < 2 || admiredId || document.querySelector('dialog[open]')) return;
  const tray = $('hand-cards').getBoundingClientRect();
  const obscured = projectedPockets.some(({ corners }) => {
    const x = corners.reduce((sum, point) => sum + point.x, 0) / 4;
    const y = corners.reduce((sum, point) => sum + point.y, 0) / 4;
    return x > tray.left && x < tray.right && y > tray.top && y < tray.bottom && corners.every(point => point.z > -1 && point.z < 1);
  });
  if (obscured) { handCollapsed = true; updateHandLayout(); }
}

function updateHandSelection() {
  $('hand-next').textContent = selectedCardId ? `${CARD_BY_ID.get(selectedCardId).name} selected. Click a pocket or stack label to place it. Press E to inspect or Delete to put it back.` : '';
  $('hand-cards').querySelectorAll('[data-hand-select]').forEach(button => {
    const selected = button.dataset.handSelect === selectedCardId;
    button.setAttribute('aria-pressed', String(selected));
    button.closest('li').classList.toggle('is-selected', selected);
  });
}

function selectCard(id) {
  if (isTurning || !hand.includes(id)) return;
  selectedCardId = id;
  autoFoldHand = true;
  updateHandSelection();
  updateHandLayout();
  updatePocketStates();
  updatePileLabels();
  room?.setHand(hand, selectedCardId);
  foldObstructingHand();
  if(admiredId&&admiredId!==id){
    admiredId=id;updateAdmireLabels(id,room.admire(id));
  }
  if ($('flat-dialog').open) renderFlat();
}

function updateInspectorActions() {
  if (!inspectedId) return;
  const queued = hand.includes(inspectedId);
  $('hold-card').disabled = queued || isTurning;
  $('hold-card').innerHTML = `${icon('hand')}${queued ? `In hand, position ${hand.indexOf(inspectedId) + 1}` : 'Add to hand'}${icon('right')}`;
  $('inspect-remove').hidden = !queued;
  $('inspect-return').disabled = isTurning || (!queued && locateCard(state, inspectedId).kind === 'bag');
  $('admire-card').disabled=isTurning||!room||sceneFailed;
  const saved = locateCard(state, inspectedId);
  $('inspect-show-in-binder').hidden = saved.kind !== 'slot';
  if (saved.kind === 'slot') $('inspect-show-in-binder').textContent = `Show page ${Math.floor(saved.index / 9) + 1}, pocket ${saved.index % 9 + 1}`;
}

function updateBagSelection() {
  $('card-grid').querySelectorAll('.collection-card').forEach(button => {
    const id = button.dataset.cardId, index = hand.indexOf(id), card = CARD_BY_ID.get(id);
    button.classList.toggle('is-in-hand', index !== -1);
    button.setAttribute('aria-pressed', String(index !== -1));
    button.setAttribute('aria-label', `${card.name}, ${card.number}, ${card.variant}. ${index === -1 ? 'Pick up card' : `In hand, position ${index + 1}. Click to put back`}.`);
    const badge = button.querySelector('.selection-number');
    badge.hidden = index === -1; badge.textContent = index + 1;
    const location = locateCard(state, id);
    button.querySelector('.card-location').textContent = index !== -1 ? `Hand ${index + 1}` : location.kind === 'slot'
      ? `Page ${Math.floor(location.index / 9) + 1}` : location.kind === 'pile' ? PILES[location.pile] : 'Bag';
    const jump = button.closest('.collection-item').querySelector('[data-show-card]');
    jump.hidden = location.kind !== 'slot';
    if (location.kind === 'slot') jump.textContent = `Show page ${Math.floor(location.index / 9) + 1}`;
  });
}

function updatePocketStates() {
  $('pocket-hotspots').querySelectorAll('[data-slot]').forEach(button => {
    const index = Number(button.dataset.slot), id = state.slots[index];
    const available = canPlaceInPocket(state, hand, index);
    button.classList.toggle('ready-to-place', available && !isTurning);
    button.classList.toggle('placing', available && !isTurning);
    const reserved = id && hand.includes(id);
    button.classList.toggle('reserved-pocket', Boolean(reserved));
    button.dataset.reserved = reserved ? `In hand: ${CARD_BY_ID.get(id).name}` : '';
    button.setAttribute('aria-label', `Page ${Math.floor(index / 9) + 1}, pocket ${index % 9 + 1}. ${reserved ? `${CARD_BY_ID.get(id).name} is reserved here while held. ` : ''}${available ? `Place ${CARD_BY_ID.get(selectedCardId).name}` : id ? `Pick up ${CARD_BY_ID.get(id).name}` : 'Empty pocket. Choose a card from your bag'}.`);
  });
  if (hoverIndex !== null) room?.highlight(hoverIndex);
}

function syncUI(rebuild = true) {
  const counts = collectionCounts(state);
  const heldLocations = hand.map(id => locateCard(state, id).kind);
  const inBinder = counts.binder - heldLocations.filter(kind => kind === 'slot').length;
  $('collection-count').textContent = inBinder;
  $('variant-total').textContent = CARDS.length;
  $('progress-fill').style.width = `${inBinder / CARDS.length * 100}%`;
  $('bag-count').textContent = counts.bag - heldLocations.filter(kind => kind === 'bag').length;
  renderHand(); renderNavigation();
  if (rebuild) room?.sync(state, hand, selectedCardId); else room?.setHand(hand, selectedCardId);
  if ($('flat-dialog').open) renderFlat();
  if ($('bag-dialog').open) {
    if (rebuild) renderBag(); else updateBagSelection();
  }
  updatePileLabels();
}

function updatePileLabels() {
  for (const [pile, label] of Object.entries(PILES)) {
    const count = state.piles[pile].filter(id => !hand.includes(id)).length;
    const button = $(`pile-${pile}`);
    button.innerHTML = `${icon('stack')}<span>${label}</span> <span>${count}</span>`;
    button.classList.toggle('can-place', Boolean(selectedCardId));
    button.title = selectedCardId ? `Place ${CARD_BY_ID.get(selectedCardId).name} on ${label}. Right-click to browse.` : `${label}: ${count} available cards. Browse or sort this stack.`;
  }
}

function changeHand(next) {
  if (next === hand || isTurning) return;
  remember(); hand = next; selectedCardId = selectedFromHand(hand, selectedCardId); syncUI(false);
}

function pickUp(id) {
  if (!id || isTurning) return;
  changeHand(addToHand(hand, id));
}

function clearHand() {
  if (!hand.length || isTurning) return;
  changeHand([]);
  clearHover();
  notify('Unplaced cards put back. Your saved layout is unchanged.');
}

function commit(next, message, nextHand = hand) {
  if (next === state && nextHand === hand) return;
  remember(); state = next; hand = nextHand; selectedCardId = selectedFromHand(hand, selectedCardId);
  syncUI(); persist();
  if (message) notify(message);
}

function placeSelected(destination) {
  if (!hand.length || isTurning) return;
  const displaced = destination.kind === 'slot' ? state.slots[destination.index] : null;
  const result = placeFromHand(state, hand, destination, selectedCardId);
  const action = destination.kind === 'bag' ? 'returned to your bag' : destination.kind === 'pile'
    ? `placed on ${PILES[destination.pile]}` : `placed in ${locationLabel(destination).toLowerCase()}`;
  clearHover();
  const reservation = displaced && displaced !== result.id ? ` ${CARD_BY_ID.get(displaced).name}'s reserved home is now ${locationLabel(locateCard(result.state, displaced)).toLowerCase()}.` : '';
  commit(result.state, `${CARD_BY_ID.get(result.id).name} ${action}.${reservation}${result.hand.length ? ` ${result.hand.length} still in hand.` : ''}`, result.hand);
}

function undo() {
  if (!history.length || isTurning) return;
  ({ state, hand, selectedCardId, handCollapsed } = history.pop());
  clearHover(); syncUI(); persist();
  notify('Last change undone.');
}

function turn(direction, immediate = false) {
  if (isTurning || state.spread + direction < 0 || state.spread + direction >= SPREAD_COUNT) return;
  clearHover();
  if (immediate || !room || sceneFailed) {
    state = { ...state, spread: state.spread + direction }; syncUI(); persist(true); audio.page();
  } else if (room.startTurn(direction)) {
    isTurning = true; renderNavigation(); audio.page();
  }
}

function setView(view) {
  if(admiredId)stopAdmiring();
  activeView = view;
  autoFoldHand = true;
  $('app').dataset.view = view;
  $('app').classList.toggle('is-room-view', view !== 'binder');
  for (const mode of ['binder', 'held', 'room', 'city']) {
    $(`${mode}-view`).classList.toggle('is-active', mode === view);
    $(`${mode}-view`).setAttribute('aria-pressed', String(mode === view));
  }
  room?.view(view);
}

function goToSpread(spread, focusSlot = null) {
  if (isTurning) return;
  if (!Number.isInteger(spread) || spread < 0 || spread >= SPREAD_COUNT) { notify('Choose an existing spread.', true); return; }
  pendingFocusSlot = focusSlot; autoFoldHand = true;
  state = { ...state, spread }; clearHover(); syncUI(); persist(true);
}

function showInBinder(id) {
  const location = locateCard(state, id);
  if (location.kind !== 'slot' || isTurning) return;
  closeDialogs();
  if (!room || sceneFailed || window.innerWidth < 600) {
    goToSpread(spreadForSlot(location.index)); openFlat();
    $('flat-pages').querySelector(`[data-slot="${location.index}"]`)?.focus({ preventScroll: false });
  } else {
    setView('held'); goToSpread(spreadForSlot(location.index), location.index);
  }
}

function showPageMap() {
  if (isTurning) return;
  closeDialogs();
  $('page-map-grid').innerHTML = Array.from({ length: SPREAD_COUNT }, (_, spread) => {
    const faces = spreadFaces(spread), slots = faces.filter(face => face !== null).flatMap(faceSlots);
    return `<button class="spread-choice" data-jump-spread="${spread}" aria-current="${spread === state.spread ? 'page' : 'false'}"><strong>${faces.map(face => face === null ? 'Cover' : String(face + 1).padStart(2, '0')).join(' / ')}</strong><span class="spread-mini" aria-hidden="true">${slots.map(index => `<i class="${state.slots[index] ? 'filled' : ''}"></i>`).join('')}</span><span>${slots.filter(index => state.slots[index]).length} / ${slots.length} filled</span></button>`;
  }).join('');
  $('page-map-dialog').showModal(); $('page-map-grid').querySelector('[aria-current="page"]')?.focus();
}

function openOrganizer() {
  if (isTurning) return;
  closeDialogs(); organizationPlan = null; organizationBase = '';
  $('organizer-source').value = hand.length ? 'hand' : 'binder';
  $('organizer-sort').value = hand.length ? 'hand' : 'number'; $('organizer-start').value = hand.length ? String(spreadFaces(state.spread).find(face => face !== null)) : '0';
  $('organizer-results').replaceChildren(); $('organizer-summary').textContent = 'Preview a plan before making changes.'; $('organizer-apply').disabled = true;
  $('organizer-dialog').showModal();
}

function previewOrganization() {
  organizationPlan = null; $('organizer-apply').disabled = true;
  try {
    const lockedPages = [...$('organizer-locks').querySelectorAll('input:checked')].map(input => Number(input.value));
    organizationPlan = planBinderArrangement(state, hand, {
      source: $('organizer-source').value, sort: $('organizer-sort').value, startSlot: Number($('organizer-start').value) * 9, lockedPages,
    });
    organizationBase = `${collectionRevision(state)}|${JSON.stringify(hand)}`;
    const plan = organizationPlan;
    $('organizer-summary').textContent = `${plan.placements.length} cards, ${plan.changedCount} moves. ${lockedPages.length} protected pages.${plan.skippedHeld ? ` ${plan.skippedHeld} cards stay in hand on protected pages.` : ''}`;
    $('organizer-results').innerHTML = `<table><thead><tr><th>Card</th><th>From</th><th>Destination</th></tr></thead><tbody>${plan.placements.map(item => `<tr><td>${escape(CARD_BY_ID.get(item.id).name)} <small>${escape(CARD_BY_ID.get(item.id).number)}</small></td><td>${escape(locationLabel(item.from))}</td><td>Page ${Math.floor(item.index / 9) + 1}, pocket ${item.index % 9 + 1}${item.changed ? '' : ' (unchanged)'}</td></tr>`).join('')}</tbody></table>`;
    $('organizer-apply').textContent = `Apply ${plan.changedCount} moves`; $('organizer-apply').disabled = !plan.changedCount;
  } catch (error) {
    console.warn('Binder arrangement could not be planned.', error);
    $('organizer-results').replaceChildren(); $('organizer-summary').textContent = error.message;
    $('organizer-summary').setAttribute('role', 'alert');
  }
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  clearHover();
}

function openBag(location = 'all', restore = null, focusSearch = !compactControls.matches) {
  if (isTurning) return;
  if(admiredId)stopAdmiring();
  if(hudHidden)setHUDHidden(false);
  closeDialogs();
  if (filters.location !== location) {
    filters.query = ''; filters.category = 'all'; filters.rarity = 'all';
    $('card-search').value = ''; $('category-filter').value = 'all'; $('rarity-filter').value = 'all';
  }
  filters.location = location; renderBag(); $('bag-dialog').showModal();
  const control = restore?.id && $('card-grid').querySelector(`[data-inspect-id="${restore.id}"]`);
  if (control) {
    control.focus({ preventScroll: true }); $('card-grid').scrollTop = restore.scroll; $('bag-dialog').scrollTop=restore.bagScroll||0;
    if(compactControls.matches)requestAnimationFrame(()=>{
      if(!$('bag-dialog').open||!control.isConnected)return;
      const bag=$('bag-dialog'),rect=control.getBoundingClientRect(),top=bag.querySelector('.bag-header').getBoundingClientRect().bottom+8,footer=bag.querySelector('.bag-footer').getBoundingClientRect();
      const bottom=footer.height?footer.top-8:bag.getBoundingClientRect().bottom-16;
      if(rect.top<top)bag.scrollTop+=rect.top-top;
      else if(rect.bottom>bottom)bag.scrollTop+=rect.bottom-bottom;
    });
  } else if(focusSearch) $('card-search').focus({preventScroll:true});
  else $('bag-title').focus({preventScroll:true});
}

function renderBag() {
  const pile = filters.location.startsWith('pile:') ? filters.location.slice(5) : null;
  $('stack-selector').hidden = filters.location !== 'table' && !pile;
  $('stack-filter').value = pile || 'all';
  $('bag-title').innerHTML = `${pile ? escape(PILES[pile]) : 'Your bag'}<span class="title-period">.</span>`;
  $('bag-subtitle').textContent = pile ? 'Pick up a few cards, then choose which one to place.' : 'Select cards to add them to your hand. Pick as many as you like.';
  const cards = filterCards(state, filters);
  $('results-count').textContent = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
  $('sort-stack').hidden = !pile;
  document.querySelectorAll('[data-location]').forEach(button => {
    const active = button.dataset.location === filters.location || button.dataset.location === 'table' && Boolean(pile);
    button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('card-grid').innerHTML = cards.map(card => `<article class="collection-item"><button class="collection-card" data-card-id="${escape(card.id)}" aria-pressed="false"><span class="card-art">${art(card)}<span class="selection-number" hidden></span></span><span class="card-card-name">${escape(card.name)}</span><span class="card-card-meta"><span>${escape(card.number)}</span><span class="card-location"></span></span><span class="card-rarity">${escape(rarityLabel(card.rarity))}</span></button><button class="card-inspect-button" data-inspect-id="${escape(card.id)}" aria-label="Inspect ${escape(card.name)}, ${escape(card.number)}">${icon('eye')}</button><button class="card-show-page text-button" data-show-card="${escape(card.id)}" hidden>Show in binder</button></article>`).join('');
  $('bag-empty').hidden = cards.length > 0; $('card-grid').hidden = !cards.length;
  updateBagSelection(); renderNavigation();
}

function openInspect(id, from = null) {
  if (isTurning) return;
  if(admiredId)stopAdmiring();
  if(hudHidden)setHUDHidden(false);
  const card = CARD_BY_ID.get(id);
  if (!card) { notify('This card could not be found in the collection.', true); return; }
  if (hand.includes(id)) selectCard(id);
  inspectOrigin = from === 'bag' ? { id, scroll: $('card-grid').scrollTop, bagScroll:$('bag-dialog').scrollTop } : null;
  inspectedId = id; inspectReturn = from; closeDialogs();
  $('inspect-name').textContent = card.name;
  $('inspect-number').textContent = `${card.number} / ${CATEGORIES[card.category] || card.category}`;
  $('inspect-rarity').textContent = rarityLabel(card.rarity); $('inspect-variant').textContent = card.variant;
  $('inspect-artist').textContent = card.artist;
  $('inspect-location').textContent = hand.includes(id) ? `In hand, position ${hand.indexOf(id) + 1}` : locationLabel(locateCard(state, id));
  $('inspect-pending').hidden = card.imageStatus !== 'pending';
  $('inspection-card').innerHTML = art(card, true); $('inspection-card').classList.remove('is-reverse');
  $('inspection-card').style.cssText = '';
  $('flip-inspection').innerHTML = `${icon('rotate')}Turn card over`;
  $('source-art').hidden = !card.sourceImage || card.imageStatus === 'pending';
  if (card.sourceImage) $('source-art').href = card.sourceImage;
  updateInspectorActions(); $('inspect-dialog').showModal();
}

function dismissInspector() {
  $('inspect-dialog').close();
  if (inspectReturn === 'bag') openBag(filters.location, inspectOrigin);
  if (inspectReturn === 'flat') openFlat();
}

function setHUDHidden(hidden){
  hudHidden=hidden;
  $('app').dataset.hudHidden=String(hidden);
  $('hud-toggle').setAttribute('aria-pressed',String(hidden));
  $('hud-toggle').setAttribute('aria-label',hidden?'Show HUD':'Hide HUD');
  const targets=document.querySelectorAll('.topbar,.top-actions,.collection-summary,.table-controls,.bottom-bar,.binder-caption,.hand-tools,#admire-controls');
  targets.forEach(element=>{element.inert=hidden;});
  if(hidden){closeDialogs();clearHover();$('hud-toggle').focus({preventScroll:true});}
  document.querySelector('.room-coordinate').hidden=Boolean(hand.length)&&!hidden;
  document.querySelector('.room-coordinate').setAttribute('aria-hidden',String(!hidden));
  idleHUD?.activity();
}

function startAdmiring(id){
  if(!id||isTurning)return;
  if(!room||sceneFailed){notify('Admire card requires the 3D room. Inspection and Pocket view are still available.',true);return;}
  if(!hand.includes(id))pickUp(id);
  selectCard(id);closeDialogs();clearHover();
  admiredId=id;updateAdmireLabels(id,room.admire(id));$('app').dataset.admiring='true';
  $('admire-controls').hidden=false;
  if(!hudHidden)$('admire-done').focus({preventScroll:true});
}
function updateAdmireLabels(id,finish){
  $('admire-name').textContent=`${CARD_BY_ID.get(id).name} / ${CARD_BY_ID.get(id).number}`;
  $('admire-finish').textContent=`${finish.label} / ${finish.confidence==='unknown'?'finish unverified':'simulated finish'}`;
  $('admire-finish').title=finish.reason;
}
function stopAdmiring(){
  admiredId=null;room?.stopAdmiring();delete $('app').dataset.admiring;$('admire-controls').hidden=true;
}

function openFlat() {
  if (isTurning) return;
  closeDialogs(); renderFlat(); $('flat-dialog').showModal();
}

function renderFlat() {
  const focused = document.activeElement?.closest('#flat-pages [data-slot]')?.dataset.slot;
  $('flat-hand-choice').hidden = hand.length < 2;
  $('flat-selected-card').replaceChildren(...hand.map(id => new Option(`${CARD_BY_ID.get(id).name} / ${CARD_BY_ID.get(id).number}`, id, false, id === selectedCardId)));
  $('flat-instruction').textContent = hand.length
    ? `${hand.length} in hand. Selected: ${CARD_BY_ID.get(selectedCardId).name}. Click a highlighted pocket to place it; click another card to pick it up.`
    : 'Click cards to pick them up. Empty pockets will highlight when your hand has cards.';
  $('flat-pages').innerHTML = spreadFaces(state.spread).map(face => {
    if (face === null) return `<div class="flat-cover">${icon('book')}<strong>afterhours.</strong><span>ANNIVERSARY EDITION</span><span>Inside cover</span></div>`;
    return `<section class="flat-page"><h3>Page ${face + 1} / ${faceLabel(face)}</h3><div class="flat-grid">${faceSlots(face).map(index => {
      const id = state.slots[index], available = canPlaceInPocket(state, hand, index);
      return `<button class="flat-pocket ${available ? 'ready-to-place' : ''} ${id && hand.includes(id) ? 'reserved-pocket' : ''}" data-slot="${index}" aria-label="Page ${face + 1}, pocket ${index % 9 + 1}. ${escape(id && hand.includes(id) ? `${CARD_BY_ID.get(id).name} reserved here while held. ` : '')}${escape(available ? `Place ${CARD_BY_ID.get(selectedCardId).name}` : id ? `Pick up ${CARD_BY_ID.get(id).name}` : 'Empty pocket')}">${id ? art(CARD_BY_ID.get(id)) : `<span>${String(index % 9 + 1).padStart(2, '0')}</span>`}${id && hand.includes(id) ? '<span class="reservation-label">In hand</span>' : ''}${available ? '<span class="placement-label">Place selected</span>' : id ? '' : '<span>Empty pocket</span>'}</button>`;
    }).join('')}</div></section>`;
  }).join('');
  renderNavigation();
  if (focused) $('flat-pages').querySelector(`[data-slot="${focused}"]`)?.focus();
}

function clickSlot(index) {
  if (isTurning) return;
  const id = state.slots[index];
  if (id && !hand.includes(id)) pickUp(id);
  else if (hand.length) placeSelected({ kind: 'slot', index });
  else openBag('bag');
}

function clearHover() {
  hoverIndex = null; room?.highlight(null);
  $('drop-hint').hidden = true;
  document.querySelectorAll('.is-drop-target').forEach(element => element.classList.remove('is-drop-target'));
}

function hoverPocket(index, x, y) {
  if (hoverIndex !== index) clearHover();
  hoverIndex = index; room?.highlight(index);
  if (index === null || !canPlaceInPocket(state, hand, index) || isTurning) return;
  document.querySelector(`.pocket-hotspot[data-slot="${index}"]`)?.classList.add('is-drop-target');
  if (x === undefined) return;
  const hint = $('drop-hint');
  hint.textContent = `Place ${CARD_BY_ID.get(selectedCardId).name}`;
  hint.classList.add('can-drop'); hint.hidden = false;
  hint.style.transform = `translate3d(${Math.max(12, Math.min(window.innerWidth - 270, x - 110))}px,${Math.min(window.innerHeight - 55, y + 24)}px,0)`;
}

function layoutScene({ slots, piles, turning, mode }) {
  projectedPockets = turning ? [] : slots;
  const container = $('pocket-hotspots');
  const existing = new Map([...container.children].map(button => [Number(button.dataset.slot), button]));
  const visible = new Set();
  for (const { index, corners } of slots) {
    visible.add(index);
    let button = existing.get(index);
    if (!button) {
      button = document.createElement('button'); button.className = 'pocket-hotspot'; button.dataset.slot = index;
      button.addEventListener('focus', () => hoverPocket(index)); button.addEventListener('blur', clearHover);
      container.append(button);
    }
    const minX = Math.min(...corners.map(point => point.x)), minY = Math.min(...corners.map(point => point.y));
    const width = Math.max(...corners.map(point => point.x)) - minX, height = Math.max(...corners.map(point => point.y)) - minY;
    button.hidden = turning || corners.some(point => point.z > 1 || point.z < -1) || minX + width < 0 || minY + height < 0 || minX > window.innerWidth || minY > window.innerHeight || width < 2 || height < 2;
    if (!button.hidden) {
      button.style.left = `${minX}px`; button.style.top = `${minY}px`; button.style.width = `${width}px`; button.style.height = `${height}px`;
      button.style.clipPath = `polygon(${corners.map(point => `${(point.x - minX) / width * 100}% ${(point.y - minY) / height * 100}%`).join(',')})`;
    }
  }
  existing.forEach((button, index) => { if (!visible.has(index)) button.remove(); });
  for (const point of piles) {
    const button = $(`pile-${point.pile}`);
    button.style.left = `${point.x}px`; button.style.top = `${point.y}px`;
    button.hidden = mode === 'held' || point.z > 1 || point.z < -1 || point.y > window.innerHeight - 105 || point.y < 80 || point.x < 0 || point.x > window.innerWidth;
  }
  updatePocketStates();
  foldObstructingHand();
  if (pendingFocusSlot !== null) {
    const button = container.querySelector(`[data-slot="${pendingFocusSlot}"]`);
    if (button && !button.hidden) { button.focus({ preventScroll: true }); pendingFocusSlot = null; }
  }
}

function renderAtmosphere() {
  const next = weather === 'clear' ? 'rain' : weather === 'rain' ? 'fog' : 'clear';
  $('weather-toggle').innerHTML = icon(weatherIcons[weather]);
  $('weather-toggle').setAttribute('aria-label', `Weather: ${weatherNames[weather]}. Switch to ${next}.`);
  $('weather-toggle').title = `Weather: ${weatherNames[weather]}`;
  document.querySelectorAll('.weather-options [data-weather]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.weather === weather)));
  $('city-motion-toggle').innerHTML = `${icon(cityMotion ? 'pause' : 'play')}${cityMotion ? 'Pause city motion' : 'Resume city motion'}`;
  $('city-motion-toggle').setAttribute('aria-pressed', String(cityMotion));
  $('motion-preference').textContent = reducedMotion.matches && !cityMotion ? 'City motion starts paused to respect your reduced-motion preference. Weather is simulated.' : 'Traffic, aircraft, rooftop lights, and simulated weather move independently.';
  document.documentElement.dataset.weather = weather;
  document.documentElement.dataset.cityMotion = cityMotion ? 'running' : 'paused';
  room?.setWeather(weather); room?.setMotion(cityMotion); audio.setWeather(weather);
}

for (const [pile, label] of Object.entries(PILES)) {
  const button = document.createElement('button');
  button.id = `pile-${pile}`; button.className = 'pile-label'; button.hidden = true;
  button.innerHTML = `${icon('stack')}<span>${label}</span> <span>${state.piles[pile].length}</span>`;
  button.addEventListener('click', event => {
    event.stopPropagation();
    if (selectedCardId) placeSelected({ kind: 'pile', pile }); else openBag(`pile:${pile}`);
  });
  button.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); openBag(`pile:${pile}`); });
  $('pile-labels').append(button);
}
for (const [value, label] of Object.entries(CATEGORIES)) $('category-filter').add(new Option(label, value));
for (const rarity of RARITY_ORDER.filter(rarity => CARDS.some(card => card.rarity === rarity))) $('rarity-filter').add(new Option(rarityLabel(rarity), rarity));
for (let spread = 0; spread < SPREAD_COUNT; spread++) $('flat-page-select').add(new Option(spreadFaces(spread).map(face => face === null ? 'Cover' : `Page ${face + 1}`).join(' / '), spread));
for (let page = 0; page < PAGE_COUNT; page++) $('organizer-start').add(new Option(`Page ${page + 1}`, page));
$('organizer-locks').innerHTML = Array.from({ length: PAGE_COUNT }, (_, page) => `<label><input type="checkbox" value="${page}">Page ${page + 1}</label>`).join('');
const pendingCount = CARDS.filter(card => !card.image).length;
const reviewedArtworkCount=CARDS.filter(card=>card.imageVerification).length;
document.querySelector('.catalog-note').textContent = pendingCount ? `${pendingCount} artwork reveals pending` : `Artwork available for all ${CARDS.length} variants`;
$('source-summary').textContent = `Pokecottage's ${new Date(CATALOG.sourceUpdatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} snapshot lists ${CATALOG.uniqueCards} cards and ${CARDS.length} variants, including promos. ${CARDS.length - pendingCount - reviewedArtworkCount} have source-verified artwork; ${reviewedArtworkCount} additional images were locally checked against their names, numbers and printings. ${pendingCount ? `${pendingCount} artworks remain pending.` : 'Every checklist variant now has artwork.'}`;

document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.close === 'inspect-dialog') dismissInspector(); else $(button.dataset.close).close();
}));
$('inspect-dialog').addEventListener('cancel', event => { event.preventDefault(); dismissInspector(); });
$('bag-open').addEventListener('click', () => openBag());
$('loading-bag').addEventListener('click', () => openBag());
$('loading-pocket').addEventListener('click', openFlat);
$('bag-place').addEventListener('click', () => {
  autoFoldHand = true;
  if (handLayout(hand.length, window.innerWidth, window.innerHeight).rows > 1) handCollapsed = true;
  updateHandLayout();
  closeDialogs(); setView(activeView === 'held' ? 'held' : 'binder');
  if (!room || sceneFailed) openFlat(); else $('pocket-hotspots').querySelector('.ready-to-place')?.focus();
});
$('hand-clear').addEventListener('click', () => {
  if (!hand.length || isTurning) return;
  const count = hand.length;
  const result = returnHandToBag(state, hand);
  commit(result.state, `${count} ${count === 1 ? 'card returned' : 'cards returned'} to your bag.`, result.hand);
});
$('hand-collapse').addEventListener('click', () => {
  handCollapsed = !handCollapsed;
  autoFoldHand = handCollapsed;
  updateHandLayout();
});
$('hud-toggle').addEventListener('click',()=>setHUDHidden(!hudHidden));
$('hand-admire').addEventListener('click',()=>startAdmiring(selectedCardId));
$('admire-card').addEventListener('click',()=>startAdmiring(inspectedId));
$('admire-done').addEventListener('click',stopAdmiring);
for(const [id,dx,dy]of [['admire-left',-60,0],['admire-right',60,0],['admire-tilt-up',0,-50],['admire-tilt',0,50]]){
  $(id).addEventListener('click',()=>room?.rotateAdmired(dx,dy));
}
$('admire-flip').addEventListener('click',()=>room?.flipAdmired());
$('admire-reset').addEventListener('click',()=>room?.resetAdmired());
window.addEventListener('resize', updateHandLayout);
$('hand-cards').addEventListener('click', event => {
  const card = event.target.closest('[data-hand-select]');
  if (card) selectCard(card.dataset.handSelect);
});
$('hand-cards').addEventListener('dblclick', event => {
  const card = event.target.closest('[data-hand-select]');
  if (card) openInspect(card.dataset.handSelect);
});
$('hand-cards').addEventListener('contextmenu', event => {
  const card = event.target.closest('[data-hand-select]');
  if (card) { event.preventDefault(); openInspect(card.dataset.handSelect); }
});
$('flat-open').addEventListener('click', openFlat); $('fallback-open').addEventListener('click', openFlat);
$('flat-bag').addEventListener('click', () => openBag('bag'));
$('flat-selected-card').addEventListener('change', event => selectCard(event.target.value));
$('flat-pages').addEventListener('click', event => { const button = event.target.closest('[data-slot]'); if (button) clickSlot(Number(button.dataset.slot)); });
$('flat-pages').addEventListener('contextmenu', event => {
  const button = event.target.closest('[data-slot]'), id = button && state.slots[Number(button.dataset.slot)];
  if (id) { event.preventDefault(); openInspect(id, 'flat'); }
});
$('flat-previous').addEventListener('click', () => turn(-1, true)); $('flat-next').addEventListener('click', () => turn(1, true));
$('previous-page').addEventListener('click', () => turn(-1)); $('next-page').addEventListener('click', () => turn(1));
$('undo-action').addEventListener('click', undo);
$('page-map-open').addEventListener('click', showPageMap);
$('page-map-grid').addEventListener('click', event => {
  const target = event.target.closest('[data-jump-spread]');
  if (target) { $('page-map-dialog').close(); goToSpread(Number(target.dataset.jumpSpread)); }
});
$('flat-page-select').addEventListener('change', event => goToSpread(Number(event.target.value)));
$('organizer-open').addEventListener('click', openOrganizer);
$('flat-organize').addEventListener('click', openOrganizer);
$('organizer-preview').addEventListener('click', previewOrganization);
for (const id of ['organizer-source','organizer-sort','organizer-start','organizer-locks']) $(id).addEventListener('change', () => {
  organizationPlan = null; $('organizer-apply').disabled = true; $('organizer-summary').textContent = 'Options changed. Preview again before applying.'; $('organizer-results').replaceChildren();
});
$('organizer-apply').addEventListener('click', () => {
  if (isTurning || !organizationPlan) return;
  if (organizationBase !== `${collectionRevision(state)}|${JSON.stringify(hand)}` || storageConflict) { notify('The collection changed. Load the latest layout if needed, then preview again.', true); return; }
  const plan = organizationPlan; organizationPlan = null; closeDialogs();
  commit(plan.state, `${plan.changedCount} cards organized. Undo restores the whole arrangement and hand.`, plan.hand);
  if (window.innerWidth < 600 || sceneFailed) openFlat();
});
$('inspect-show-in-binder').addEventListener('click', () => showInBinder(inspectedId));
$('binder-view').addEventListener('click', () => setView('binder')); $('room-view').addEventListener('click', () => setView('room'));
$('city-view').addEventListener('click', () => setView('city'));
$('held-view').addEventListener('click', () => setView('held'));
$('tv-view').addEventListener('click',()=>{closeDialogs();setView('room');room?.televisionView();});
for (const preset of TIME_PRESETS) $('time-preset').add(new Option(preset.label, preset.id));
const customTimeOption = new Option('Custom time', 'custom');
customTimeOption.disabled = true; customTimeOption.hidden = true;
$('time-preset').add(customTimeOption);
document.querySelector('.time-presets').innerHTML = TIME_PRESETS.map(preset =>
  `<button data-time="${preset.hour}" aria-pressed="false">${escape(preset.label)}</button>`).join('');
function setCityHour(value) {
  cityHour = value;
  const preset = TIME_PRESETS.find(item => item.hour === value);
  customTimeOption.hidden = Boolean(preset);
  customTimeOption.textContent = formatCityTime(value);
  $('time-preset').value = preset ? preset.id : 'custom';
  $('city-time').value = value;
  $('city-time-label').textContent = formatCityTime(value);
  document.querySelector('.room-coordinate').innerHTML = `<span class="night-mark"></span>TOKYO / ${formatCityTime(value)}`;
  document.querySelectorAll('.time-presets [data-time]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.time) === value)));
  room?.setCityTime(value);
}
setCityHour(cityHour);
$('time-preset').addEventListener('change', event => {
  const preset = TIME_PRESETS.find(item => item.id === event.target.value);
  if (!preset) { notify('Choose Dawn, Day, Dusk, or After dark.', true); setCityHour(cityHour); return; }
  setCityHour(preset.hour);
});
$('city-time').addEventListener('input', event => setCityHour(Number(event.target.value)));
document.querySelectorAll('.time-presets [data-time]').forEach(button => button.addEventListener('click', () => setCityHour(Number(button.dataset.time))));
$('cloud-cover').addEventListener('input', event => {
  cloudCover = Number(event.target.value) / 100; $('cloud-cover-label').textContent = `${event.target.value}%`; room?.setCityClouds(cloudCover);
});
$('cloud-speed').addEventListener('input', event => {
  cloudSpeed = Number(event.target.value) / 100; $('cloud-speed-label').textContent = `${cloudSpeed.toFixed(1)}x`; room?.setCloudSpeed(cloudSpeed);
});
$('traffic-density').addEventListener('input', event => {
  trafficDensity = Number(event.target.value) / 100; $('traffic-density-label').textContent = `${event.target.value}%`; room?.setTrafficDensity(trafficDensity);
});
$('city-windows').addEventListener('change', event => { cityWindows = event.target.checked; room?.setCityWindows(cityWindows); });
$('city-tower').addEventListener('change', event => { cityTower = event.target.checked; room?.setCityTower(cityTower); });
$('help-open').addEventListener('click', () => { closeDialogs(); $('help-dialog').showModal(); });
$('lighting-toggle').addEventListener('click', () => {
  warmLighting = !warmLighting; room?.lighting(warmLighting);
  $('lighting-toggle').innerHTML = icon(warmLighting ? 'sun' : 'moon');
  $('lighting-toggle').setAttribute('aria-label', warmLighting ? 'Switch to Tokyo night lighting' : 'Switch to warm room lighting');
});
$('weather-toggle').addEventListener('click', () => { weather = weather === 'clear' ? 'rain' : weather === 'rain' ? 'fog' : 'clear'; renderAtmosphere(); });
document.querySelectorAll('.weather-options [data-weather]').forEach(button => button.addEventListener('click', () => { weather = button.dataset.weather; renderAtmosphere(); }));
$('city-motion-toggle').addEventListener('click', () => { cityMotion = !cityMotion; renderAtmosphere(); });
reducedMotion.addEventListener('change', () => { cityMotion = !reducedMotion.matches; room?.setReducedMotion(reducedMotion.matches); renderAtmosphere(); });
$('sound-toggle').addEventListener('click', async () => {
  try {
    const enabled = await audio.toggle();
    $('sound-toggle').innerHTML = icon(enabled ? 'sound' : 'mute'); $('sound-toggle').setAttribute('aria-pressed', String(enabled));
    $('sound-toggle').setAttribute('aria-label', enabled ? 'Turn ambient sound off' : 'Turn ambient sound on');
    notify(enabled ? 'Ambient sound on.' : 'Ambient sound off.');
  } catch (error) { console.error('Audio could not start.', error); notify(error.message, true); }
});
$('storage-retry').addEventListener('click', () => {
  try { storage.authorizeRecovery(); storageEnabled = true; persist(); }
  catch (error) { console.error('Saving could not be enabled.', error); storageWarning(error.message); }
});
$('storage-load-latest').addEventListener('click', () => {
  if (isTurning) return;
  try {
    const currentPage = state.spread;
    state = { ...storage.load(createCollection()), spread: currentPage };
    storageEnabled = true; storageConflict = false; saveTicket++;
    hand = []; selectedCardId = null; history.length = 0; clearHover(); syncUI();
    $('storage-warning').hidden = true; $('storage-retry').hidden = false; $('storage-load-latest').hidden = true;
    $('save-status').innerHTML = `${icon('check')}Saved on this device`; $('save-status').classList.remove('is-error');
    document.documentElement.dataset.saveState = 'saved';
    notify('Latest saved arrangement loaded. Other-tab changes are preserved.');
  } catch (error) { console.error('Latest saved arrangement could not be read.', error); storageWarning(error.message); }
});
$('city-retry').addEventListener('click', async () => {
  if (isTurning) return;
  if (!storageEnabled) { notify('Export this tab or resolve the save warning before reloading.', true); return; }
  try { await storage.whenSaved(); if (storageEnabled) location.reload(); }
  catch (error) { console.warn('City reload was cancelled because the layout was not saved.', error); notify('Reload cancelled. Resolve the save warning or export this tab first.', true); }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    if (!storage.changedElsewhere()) return;
    storageEnabled = false; storageConflict = true; storage.suspend(); saveTicket++;
    $('storage-retry').hidden = true; $('storage-load-latest').hidden = false;
    storageWarning('The saved arrangement changed in another tab. Saving is paused. Load latest, or export this tab before continuing.');
  } catch (error) {
    console.error('An external layout change could not be read.', error);
    storageEnabled = false; storage.suspend(); storageWarning(`Saving paused: ${error.message}`);
  }
});
$('card-search').addEventListener('input', event => { filters.query = event.target.value; renderBag(); });
const finishSearch=()=>{
  $('card-search').blur();
  $('bag-dialog').querySelector('[data-close="bag-dialog"]').focus({preventScroll:true});
};
$('search-done').addEventListener('click',finishSearch);
$('card-search').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.isComposing&&compactControls.matches){event.preventDefault();finishSearch();}
});
for (const [id, key] of [['category-filter', 'category'], ['rarity-filter', 'rarity'], ['sort-filter', 'sort']]) {
  $(id).addEventListener('change', event => { filters[key] = event.target.value; renderBag(); });
}
document.querySelectorAll('[data-location]').forEach(button => button.addEventListener('click', () => { filters.location = button.dataset.location; renderBag(); }));
$('stack-filter').addEventListener('change', event => {
  filters.location = event.target.value === 'all' ? 'table' : `pile:${event.target.value}`;
  renderBag();
});
$('clear-filters').addEventListener('click', () => {
  Object.assign(filters, { query: '', category: 'all', rarity: 'all', location: 'all', sort: 'number' });
  $('card-search').value = ''; $('category-filter').value = 'all'; $('rarity-filter').value = 'all'; $('sort-filter').value = 'number'; renderBag();
});
$('sort-stack').addEventListener('click', () => { if (filters.location.startsWith('pile:')) commit(sortPile(state, filters.location.slice(5), filters.sort), 'Stack sorted. Cards in your hand keep their pickup order.'); });
$('card-grid').addEventListener('click', event => {
  const jump = event.target.closest('[data-show-card]');
  if (jump) { showInBinder(jump.dataset.showCard); return; }
  const inspect = event.target.closest('[data-inspect-id]');
  if (inspect) { openInspect(inspect.dataset.inspectId, 'bag'); return; }
  const button = event.target.closest('[data-card-id]');
  if (button) changeHand(hand.includes(button.dataset.cardId) ? removeFromHand(hand, button.dataset.cardId) : addToHand(hand, button.dataset.cardId));
});
$('hold-card').addEventListener('click', () => { pickUp(inspectedId); dismissInspector(); });
$('inspect-remove').addEventListener('click', () => { changeHand(removeFromHand(hand, inspectedId)); dismissInspector(); });
$('inspect-return').addEventListener('click', () => {
  if (isTurning) return;
  const result = placeFromHand(state, addToHand(hand, inspectedId), { kind: 'bag' }, inspectedId);
  dismissInspector();
  commit(result.state, `${CARD_BY_ID.get(inspectedId).name} returned to your bag.`, result.hand);
});
$('flip-inspection').addEventListener('click', () => {
  const reverse = !$('inspection-card').classList.contains('is-reverse');
  $('inspection-card').classList.toggle('is-reverse', reverse);
  $('inspection-card').innerHTML = reverse ? `<div class="sleeve-back" role="img" aria-label="Original Afterhours protective sleeve reverse">${icon('cards')}<strong>afterhours.</strong><small>FOR THE KEEPERS</small></div>` : art(CARD_BY_ID.get(inspectedId), true);
  $('flip-inspection').innerHTML = `${icon('rotate')}${reverse ? 'Show card front' : 'Turn card over'}`;
});
$('inspection-card').addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType === 'touch') return;
  const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width - .5, y = (event.clientY - rect.top) / rect.height - .5;
  event.currentTarget.style.setProperty('--tilt-x', `${-y * 17}deg`); event.currentTarget.style.setProperty('--tilt-y', `${x * 21}deg`);
  event.currentTarget.style.setProperty('--glare-angle', `${125 + x * 80 - y * 40}deg`);
});
$('inspection-card').addEventListener('pointerleave', event => { event.currentTarget.style.cssText = ''; });

function stageHit(event) {
  const button = event.target instanceof Element && event.target.closest('.pocket-hotspot[data-slot]');
  if (button) return { kind: 'slot', index: Number(button.dataset.slot) };
  const hit = room?.pick(event.clientX, event.clientY);
  if (hit) return hit;
  const pocket = hand.length ? nearestPocket({ x: event.clientX, y: event.clientY }, projectedPockets, 8) : null;
  return pocket ? { kind: 'slot', index: pocket.index } : null;
}

function endGesture(cancelled = false) {
  if (!gesture) return;
  const current = gesture; gesture = null;
  if (current.mode) {
    ignoreClickUntil = performance.now() + 220;
    if (cancelled) cancelledPointer = current.id;
  }
  if (document.body.hasPointerCapture(current.id)) document.body.releasePointerCapture(current.id);
  $('stage').classList.remove('is-dragging'); clearHover();
  if (current.mode === 'turn') room.finishTurn(!cancelled && current.progress > .25);
}

$('stage').addEventListener('pointerdown', event => {
  if (gesture || event.button !== 0 || event.isPrimary === false || isTurning || !room || sceneFailed || event.target.closest('.pile-label')) return;
  ignoreClickUntil = 0; cancelledPointer = null;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, hit: admiredId||hudHidden?null:stageHit(event), mode: null, progress: 0 };
});
window.addEventListener('pointermove', event => {
  if (!room || sceneFailed) return;
  if (!gesture) {
    if(admiredId||hudHidden){clearHover();return;}
    if (document.querySelector('dialog[open]') || !(event.target instanceof Element) || !event.target.closest('#stage')) { clearHover(); return; }
    const hit = stageHit(event);
    hoverPocket(hit?.kind === 'slot' ? hit.index : null, event.clientX, event.clientY);
    $('room-canvas').style.cursor = hit?.kind === 'edge' ? 'ew-resize' : hit ? hit.kind === 'slot' && canPlaceInPocket(state, hand, hit.index) ? 'copy' : 'pointer' : 'grab';
    return;
  }
  if (event.pointerId !== gesture.id) return;
  if (event.pointerType === 'mouse' && !event.buttons) { endGesture(true); return; }
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  if (!gesture.mode && Math.hypot(dx, dy) > 6) {
    clearHover();
    if (gesture.hit?.kind === 'edge') {
      if (!room.startTurn(gesture.hit.direction, true)) { gesture = null; return; }
      gesture.mode = 'turn'; isTurning = true; renderNavigation(); audio.page();
    } else gesture.mode = admiredId?'admire':'look';
    document.body.setPointerCapture(event.pointerId); $('stage').classList.add('is-dragging');
  }
  if (gesture.mode === 'look') room.dragLook(event.clientX - gesture.lastX, event.clientY - gesture.lastY);
  if (gesture.mode === 'admire') room.rotateAdmired(event.clientX-gesture.lastX,event.clientY-gesture.lastY);
  if (gesture.mode === 'turn') {
    gesture.progress = Math.min(1, Math.max(0, -gesture.hit.direction * dx / Math.min(window.innerWidth * .32, 390)));
    room.turnProgress(gesture.progress);
  }
  gesture.lastX = event.clientX; gesture.lastY = event.clientY;
});
window.addEventListener('pointerup', event => {
  if (cancelledPointer === event.pointerId) { cancelledPointer = null; ignoreClickUntil = performance.now() + 220; return; }
  if (gesture?.id === event.pointerId) endGesture();
});
window.addEventListener('pointercancel', event => { if (gesture?.id === event.pointerId) endGesture(true); });
document.body.addEventListener('lostpointercapture', event => { if (event.target === document.body && gesture?.id === event.pointerId) endGesture(true); });
window.addEventListener('blur', () => { endGesture(true); clearHover(); });
$('stage').addEventListener('wheel', event => { if (room) { event.preventDefault(); if (!gesture?.mode) room.zoom(event.deltaY); } }, { passive: false });
$('stage').addEventListener('click', event => {
  if (admiredId||hudHidden||performance.now() < ignoreClickUntil || isTurning || event.target.closest('.pile-label')) return;
  const hit = stageHit(event);
  if (hit?.kind === 'slot') clickSlot(hit.index);
  else if (hit?.kind === 'card') pickUp(hit.id);
  else if (hit?.kind === 'edge') turn(hit.direction);
  else if (hit?.kind === 'pile') { if (hand.length) placeSelected({ kind: 'pile', pile: hit.pile }); else openBag(`pile:${hit.pile}`); }
});
$('stage').addEventListener('contextmenu', event => {
  const hit = stageHit(event), id = hit?.kind === 'slot' ? state.slots[hit.index] : hit?.id;
  if (id) { event.preventDefault(); openInspect(id); }
});

document.addEventListener('keydown', event => {
  if (gesture?.mode) { if (event.key === 'Escape') { event.preventDefault(); endGesture(true); } return; }
  if (event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const modal = document.querySelector('dialog[open]');
  if (modal) {
    if(modal===$('bag-dialog')&&event.key==='/'){event.preventDefault();$('card-search').focus({preventScroll:true});}
    if (modal === $('flat-dialog') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); turn(event.key === 'ArrowLeft' ? -1 : 1, true); }
    if (modal === $('flat-dialog') && event.key.toLowerCase() === 'e' && selectedCardId) openInspect(selectedCardId, 'flat');
    return;
  }
  if(event.key.toLowerCase()==='h'){event.preventDefault();setHUDHidden(!hudHidden);return;}
  if(admiredId){
    if(event.key==='Escape'){event.preventDefault();stopAdmiring();}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();room.rotateAdmired(event.key==='ArrowLeft'?-40:event.key==='ArrowRight'?40:0,event.key==='ArrowUp'?-40:event.key==='ArrowDown'?40:0);}
    return;
  }
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); turn(event.key === 'ArrowLeft' ? -1 : 1); }
  if (event.key.toLowerCase() === 'b') { event.preventDefault(); openBag('all',null,true); }
  if (event.key.toLowerCase() === 'e' && selectedCardId) openInspect(selectedCardId);
  if (event.key.toLowerCase() === 'a' && selectedCardId) startAdmiring(selectedCardId);
  if (['Delete', 'Backspace'].includes(event.key) && selectedCardId) {
    event.preventDefault(); changeHand(removeFromHand(hand, selectedCardId));
  }
  if (event.key === 'Escape') clearHand();
  if (event.key === '?') { closeDialogs(); $('help-dialog').showModal(); }
});
function exportLayout() {
  const blob = new Blob([JSON.stringify({ ...state, app: 'afterhours', set: 'me55-30th-celebration' }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'afterhours-layout.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Layout exported. Unplaced cards retain their saved locations.');
}
$('export-layout').addEventListener('click', exportLayout);
$('storage-export').addEventListener('click', exportLayout);
$('import-layout').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (isTurning) throw new Error('Wait for the page to finish turning before importing a layout.');
    if (file.size > 2_000_000) throw new Error('This file is too large to be a binder layout.');
    const imported = parseCollection(await file.text());
    if (isTurning) throw new Error('Wait for the page to finish turning before importing a layout.');
    commit(imported, 'Layout imported. Undo restores your previous layout and hand.', []);
  } catch (error) { notify(`Could not import: ${error.message}`, true); }
  event.target.value = '';
});
document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.dataset.artId) {
    const card = CARD_BY_ID.get(image.dataset.artId);
    if (card) { image.outerHTML = pendingArt(card, true); notify(`Artwork for ${card.name} is unavailable. Its checklist entry is still usable.`, true); }
  }
}, true);
document.addEventListener('visibilitychange', () => { audio.pause(document.hidden); if (document.hidden) endGesture(true); });
const modalObserver = new MutationObserver(() => room?.setModalOccluded(Boolean(document.querySelector('dialog[open]:not(#help-dialog)'))));
document.querySelectorAll('dialog').forEach(dialog => modalObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
window.addEventListener('pagehide', event => { if (!event.persisted) { modalObserver.disconnect(); idleHUD?.dispose(); room?.dispose(); audio.dispose(); } });

syncUI(); renderAtmosphere();
if (storageEnabled) persist();
idleHUD = installIdleHUD($('app'), () => {
  const focus = document.activeElement;
  const focusedOverlay = focus instanceof Element && focus.closest('.idle-ui') && focus.matches(':focus-visible');
  return document.hidden || !$('scene-loading').hidden || Boolean(gesture) || Boolean(document.querySelector('dialog[open]')) || Boolean(focusedOverlay);
});

function roomError(message, fatal = false) {
  if (fatal) {
    endGesture(true); sceneFailed = true; isTurning = false;
    $('scene-error-message').textContent = message; $('scene-error').hidden = false;
    $('pocket-hotspots').hidden = true; $('pile-labels').hidden = true; renderNavigation();
  } else notify(message, true);
}

try {
  const stored=localStorage.getItem(GRAPHICS_KEY);
  if(stored!==null){
    if(!Object.hasOwn(GRAPHICS_PRESETS,stored))throw new Error('The saved graphics setting was not recognized.');
    graphicsQuality=stored;
  }
} catch(error){console.warn('Graphics preference could not be loaded.',error);notify('Graphics preference unavailable. Using Balanced for this session.',true);}
$('graphics-quality').value=graphicsQuality;
$('graphics-quality').addEventListener('change',event=>{
  graphicsQuality=event.target.value;room?.setGraphicsQuality(graphicsQuality);
  try{localStorage.setItem(GRAPHICS_KEY,graphicsQuality);}
  catch(error){console.warn('Graphics preference could not be saved.',error);notify('Graphics changed for this session; this browser could not save the preference.',true);}
});

try {
  await document.fonts.ready;
  const { createRoom } = await import('./room.js');
  room = await createRoom($('room-canvas'), {
    state, onError: roomError, onLayout: layoutScene,
    onProgress: message => { $('scene-loading-label').textContent = message; },
    onCityWarning: message => { $('city-load-message').textContent = message; $('city-load-warning').hidden = false; document.documentElement.dataset.cityStatus = 'degraded'; },
    onTurn: ({ completed, direction }) => {
      isTurning = false;
      if (completed) state = { ...state, spread: state.spread + direction };
      syncUI(); persist(true);
    },
    reducedMotion: reducedMotion.matches,
    graphicsQuality,
  });
  room.sync(state, hand, selectedCardId); room.lighting(warmLighting);
  room.view(activeView);
  room.setGraphicsQuality(graphicsQuality);
  renderNavigation();
  renderAtmosphere();
  room.setCityTime(cityHour); room.setCityClouds(cloudCover); room.setCloudSpeed(cloudSpeed); room.setTrafficDensity(trafficDensity);
  room.setCityWindows(cityWindows); room.setCityTower(cityTower);
  room.setModalOccluded(Boolean(document.querySelector('dialog[open]:not(#help-dialog)')));
  $('scene-loading').classList.add('is-ready');
  setTimeout(() => { $('scene-loading').hidden = true; idleHUD.activity(); }, reducedMotion.matches ? 0 : 550);
  document.documentElement.dataset.ready = 'true';
} catch (error) {
  console.error('The 3D room could not initialize.', error);
  $('scene-loading').hidden = true;
  roomError('The graphics context or a room asset could not load. Pocket view, your bag, and saved layouts still work. Reload after rebuilding the app to retry.', true);
  idleHUD.activity();
  document.documentElement.dataset.ready = 'fallback';
}
