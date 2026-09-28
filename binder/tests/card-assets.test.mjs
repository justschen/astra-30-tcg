import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { cacheCardImage, prepareCards } from '../fetch-assets.mjs';
import { CARDS } from '../src/collection.js';

const sourceCard = overrides => ({
  id: 'source-tepig', name: 'Tepig', cardNumber: 'MEP 050', rarity: 'Promo',
  variant: 'First Partner Series 2', setCategory: 'promos', artist: { name: 'Saboteri' },
  imageStatus: 'pending', imageUrl: 'https://pokecottagecdn.com/test/tepig.png',
  ...overrides,
});
const sourceData = cards => ({ cards, counts: { variants: cards.length } });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const review = hash => ({
  method: 'visual-review', reviewedAt: '2026-09-27', sourceUpdatedAt: '2026-09-26T14:44:59.918Z',
  sourceStatus: 'pending', sourceSha256: hash, checks: ['name', 'number', 'printing'],
});

test('pending URLs alone never count as verified artwork', () => {
  const [card] = prepareCards(sourceData([sourceCard()]));
  assert.equal(card.imageStatus, 'pending');
  assert.equal(card.image, null);
  assert.equal(card.imageVerification, undefined);
  assert.equal(card.sourceImage, sourceCard().imageUrl);
});

test('a saved visual review approves only the matching printing and source URL', () => {
  const source = sourceData([sourceCard()]);
  const previous = prepareCards(source);
  previous[0].imageVerification = review('a'.repeat(64));
  const [card] = prepareCards(source, previous);
  assert.equal(card.imageStatus, 'verified');
  assert.equal(card.image, `cards/${previous[0].id}.webp`);
  assert.deepEqual(card.imageVerification, previous[0].imageVerification);
  for (const change of [
    { name: 'Oshawott' }, { cardNumber: 'MEP 051' }, { variant: 'Different printing' },
    { imageUrl: 'https://pokecottagecdn.com/test/replacement.png' },
  ]) {
    assert.throws(() => prepareCards(sourceData([sourceCard(change)]), previous), /missing or changed|reviewed source URL changed/);
  }
  previous[0].imageVerification.sourceSha256 = 'not-a-hash';
  assert.throws(() => prepareCards(source, previous), /invalid visual artwork review/);
});

test('source renumbering, reordering, and zero padding do not change any saved card identity', () => {
  const incoming = CARDS.map((card, index) => sourceCard({
    id: `renumbered-${index}`, name: card.name, cardNumber: card.number.replace(/\b0+(\d)/g, '$1'),
    rarity: card.rarity, variant: card.variant, setCategory: card.category,
    artist: { name: card.artist }, imageStatus: card.imageVerification ? 'pending' : card.imageStatus,
    imageUrl: card.sourceImage,
  })).reverse();
  assert.deepEqual(prepareCards(sourceData(incoming), CARDS), CARDS);
});

test('refreshes retain cached artwork provenance and append new printings without moving old ones', () => {
  const original = sourceCard({ imageStatus: 'verified' });
  const previous = prepareCards(sourceData([original]));
  const incoming = [
    sourceCard({ id: 'source-oshawott', name: 'Oshawott', cardNumber: 'MEP 051' }),
    { ...original, id: 'renumbered-tepig', imageUrl: `${original.imageUrl}?v=2` },
  ];
  const cards = prepareCards(sourceData(incoming), previous);
  assert.deepEqual(cards[0], previous[0]);
  assert.equal(cards[1].id, incoming[0].id);
  assert.equal(cards[1].order, 1);
});

test('ambiguous, missing, excluded, or colliding identities abort rather than discard layout cards', () => {
  const original = sourceCard();
  const previous = prepareCards(sourceData([original]));
  assert.throws(() => prepareCards({ cards: [original], counts: { variants: 2 } }), /counts/);
  assert.throws(() => prepareCards(sourceData([original, original])), /IDs must be unique/);
  assert.throws(() => prepareCards(sourceData([original, { ...original, id: 'duplicate-printing' }])), /duplicate printings/);
  assert.throws(() => prepareCards(sourceData([]), previous), /existing printing is missing/);
  assert.throws(() => prepareCards(sourceData([{ ...original, excludeFromBinder: true }]), previous), /existing printing is missing/);
  assert.throws(() => prepareCards(sourceData([sourceCard({ id: '../invalid' })])), /filename-safe/);
  assert.throws(() => prepareCards(sourceData([
    { ...original, id: 'renumbered-tepig' },
    sourceCard({ id: previous[0].id, name: 'Oshawott', cardNumber: 'MEP 051' }),
  ]), previous), /conflict with existing layout IDs/);
});

async function imageFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'afterhours-card-assets-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'cards/thumbs'), { recursive: true });
  const bytes = await sharp({
    create: { width: 574, height: 800, channels: 3, background: '#5f728c' },
  }).png().toBuffer();
  const [card] = prepareCards(sourceData([sourceCard({ imageStatus: 'verified' })]));
  card.imageVerification = review(sha256(bytes));
  return {
    directory, bytes, card,
    target: path.join(directory, card.image),
    thumbnail: path.join(directory, 'cards/thumbs', `${card.id}.webp`),
  };
}

test('reviewed source bytes regenerate both full-size artwork and thumbnails, including stale caches', async t => {
  const { directory, bytes, card, target, thumbnail } = await imageFixture(t);
  await fs.writeFile(target, 'stale full-size image');
  await fs.writeFile(thumbnail, 'stale thumbnail');
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  assert.equal(await cacheCardImage(card, directory), true);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(request.mock.calls[0].arguments[0], card.sourceImage);
  const full = await sharp(target).metadata();
  const thumb = await sharp(thumbnail).metadata();
  assert.equal(full.format, 'webp');
  assert.equal(full.width, 574);
  assert.equal(full.height, 800);
  assert.equal(thumb.format, 'webp');
  assert.equal(thumb.width, 320);
  assert.ok(Math.abs(thumb.height / thumb.width - full.height / full.width) < 0.005);
});

test('a changed reviewed image is rejected even with HTTP 200 and existing cached files', async t => {
  const { directory, card, target, thumbnail } = await imageFixture(t);
  const fullBefore = Buffer.from('existing full-size image');
  const thumbBefore = Buffer.from('existing thumbnail');
  await fs.writeFile(target, fullBefore);
  await fs.writeFile(thumbnail, thumbBefore);
  const replacement = await sharp({ create: { width: 574, height: 800, channels: 3, background: '#cc3366' } }).png().toBuffer();
  t.mock.method(globalThis, 'fetch', async () => new Response(replacement, { headers: { 'content-type': 'image/png' } }));
  await assert.rejects(cacheCardImage(card, directory), /reviewed image content changed/);
  assert.deepEqual(await fs.readFile(target), fullBefore);
  assert.deepEqual(await fs.readFile(thumbnail), thumbBefore);
});

test('unavailable, non-image, and untrusted-host assets fail explicitly without caching', async t => {
  const { directory, card, target, thumbnail } = await imageFixture(t);
  const request = t.mock.method(globalThis, 'fetch', async () => new Response('Missing', { status: 404 }));
  await assert.rejects(cacheCardImage(card, directory), /HTTP 404/);
  request.mock.mockImplementation(async () => new Response('<html>Placeholder</html>', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(cacheCardImage(card, directory), /Not an image/);
  await assert.rejects(cacheCardImage({ ...card, sourceImage: 'https://example.com/untrusted.png' }, directory), /unexpected image host/);
  await assert.rejects(fs.access(target), { code: 'ENOENT' });
  await assert.rejects(fs.access(thumbnail), { code: 'ENOENT' });
});

test('only a previous verified printing can authorize reuse of existing image files', async t=>{
  const {directory,bytes,card,target,thumbnail}=await imageFixture(t);
  delete card.imageVerification;
  const request=t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-type':'image/png'}}));
  await fs.writeFile(target,'orphaned artwork');await fs.writeFile(thumbnail,'orphaned thumbnail');
  assert.equal(await cacheCardImage(card,directory),true,'New records must replace orphaned files even when names match');
  const oldFull=await fs.readFile(target),oldThumb=await fs.readFile(thumbnail);
  const calls=request.mock.callCount();
  assert.equal(await cacheCardImage(card,directory,card),false);
  assert.equal(request.mock.callCount(),calls);
  assert.deepEqual(await fs.readFile(target),oldFull);assert.deepEqual(await fs.readFile(thumbnail),oldThumb);
});

test('verified to pending to reverified artwork refreshes both sizes against the replacement URL',async t=>{
  const {directory,bytes,card,target,thumbnail}=await imageFixture(t);
  delete card.imageVerification;
  const request=t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-type':'image/png'}}));
  await cacheCardImage(card,directory);
  const originalFull=await fs.readFile(target),originalThumb=await fs.readFile(thumbnail);
  const replacementURL='https://pokecottagecdn.com/test/reverified-tepig.png';
  const [pending]=prepareCards(sourceData([sourceCard({imageUrl:replacementURL})]),[card]);
  assert.equal(pending.image,null);
  const [reverified]=prepareCards(sourceData([sourceCard({imageUrl:replacementURL,imageStatus:'verified'})]),[pending]);
  const replacement=await sharp({create:{width:574,height:800,channels:3,background:'#ba6041'}}).png().toBuffer();
  request.mock.mockImplementation(async()=>new Response(replacement,{headers:{'content-type':'image/png'}}));
  const calls=request.mock.callCount();
  assert.equal(await cacheCardImage(reverified,directory,pending),true);
  assert.equal(request.mock.callCount(),calls+1);
  assert.equal(request.mock.calls.at(-1).arguments[0],replacementURL);
  assert.notDeepEqual(await fs.readFile(target),originalFull);
  assert.notDeepEqual(await fs.readFile(thumbnail),originalThumb);
});
