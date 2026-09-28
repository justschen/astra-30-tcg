import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = 'https://pokecottagecdn.com/mastersets/data/me55-30th-celebration-data.js';
const supportedId = /^[a-z0-9_-]+$/i;

function printingIdentity(card) {
  if ([card.name, card.number, card.variant, card.category].some(value => typeof value !== 'string' || !value)) {
    throw new Error(`${card.id}: incomplete printing identity. No files were changed.`);
  }
  return JSON.stringify([card.name, card.number.replace(/\b0+(\d)/g, '$1'), card.variant, card.category]);
}

function validateReview(card) {
  const review = card.imageVerification;
  if (review === undefined) return;
  if (!review || review.method !== 'visual-review' ||
    typeof review.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(review.sourceSha256) ||
    !Number.isFinite(Date.parse(review.reviewedAt)) || !Number.isFinite(Date.parse(review.sourceUpdatedAt)) ||
    !['pending', 'verified'].includes(review.sourceStatus) ||
    !Array.isArray(review.checks) || !['name', 'number', 'printing'].every(check => review.checks.includes(check))) {
    throw new Error(`${card.id}: invalid visual artwork review.`);
  }
}

export function prepareCards(data, previousCards = []) {
  if (!Array.isArray(data?.cards) || data.cards.length !== data.counts?.variants) {
    throw new Error('Source catalog counts do not match its card records.');
  }
  if (data.cards.some(card => typeof card.id !== 'string' || !supportedId.test(card.id)) ||
    new Set(data.cards.map(card => card.id)).size !== data.cards.length) {
    throw new Error('Source card IDs must be unique, filename-safe strings. No files were changed.');
  }
  if (!Array.isArray(previousCards) || previousCards.some((card, index) =>
    typeof card.id !== 'string' || !supportedId.test(card.id) || card.order !== index)) {
    throw new Error('The existing catalog has invalid IDs or ordering. No files were changed.');
  }
  const incoming = data.cards.filter(card => !card.excludeFromBinder).map((card, index) => ({
    id: card.id,
    name: card.name,
    number: card.displayCardNumber || card.cardNumber,
    rarity: card.rarity,
    variant: card.variant,
    category: card.collectionSection === 'Classic Collection' ? 'classic'
      : card.collectionSection === 'Holo Energies' ? 'energy' : card.setCategory,
    artist: card.artist?.name || 'Not listed',
    imageStatus: card.imageStatus === 'verified' ? 'verified' : 'pending',
    image: null,
    sourceImage: card.imageUrl || null,
    order: index,
  }));
  const byPrinting = new Map(incoming.map(card => [printingIdentity(card), card]));
  if (byPrinting.size !== incoming.length) {
    throw new Error('Source catalog contains ambiguous duplicate printings. No files were changed.');
  }

  // Source sequence IDs can change; saved layouts must keep their original IDs and order.
  const cards = previousCards.map(previous => {
    const key = printingIdentity(previous);
    const card = byPrinting.get(key);
    if (!card) throw new Error(`${previous.id}: existing printing is missing or changed in the source. No files were changed.`);
    byPrinting.delete(key);
    card.id = previous.id;
    card.number = previous.number;
    card.order = previous.order;
    validateReview(previous);
    if (previous.imageVerification) {
      if (previous.sourceImage !== card.sourceImage) {
        throw new Error(`${previous.id}: reviewed source URL changed; visually re-review the new image before importing.`);
      }
      card.imageVerification = previous.imageVerification;
      card.imageStatus = 'verified';
    } else if (previous.imageStatus === 'verified' && card.imageStatus === 'verified') {
      // Keep the provenance of existing cached artwork, rather than relabeling it with a new URL.
      card.sourceImage = previous.sourceImage;
    }
    return card;
  });
  for (const card of byPrinting.values()) cards.push({ ...card, order: cards.length });
  if (new Set(cards.map(card => card.id)).size !== cards.length) {
    throw new Error('New source IDs conflict with existing layout IDs. No files were changed.');
  }
  return cards.map(card => ({ ...card, image: card.imageStatus === 'verified' ? `cards/${card.id}.webp` : null }));
}

async function statIfPresent(file) {
  return fs.stat(file).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
}

export async function cacheCardImage(card, publicRoot, previousCard = null) {
  if (!supportedId.test(card.id) || card.image !== `cards/${card.id}.webp`) {
    throw new Error(`${card.id}: invalid card image path.`);
  }
  if (!/^https:\/\/pokecottagecdn\.com\//.test(card.sourceImage)) {
    throw new Error(`${card.id}: unexpected image host.`);
  }
  validateReview(card);
  const target = path.join(publicRoot, card.image);
  const thumbnail = path.join(publicRoot, 'cards/thumbs', `${card.id}.webp`);
  const reusable = !card.imageVerification && previousCard?.imageStatus === 'verified'
    && previousCard.id === card.id && previousCard.image === card.image
    && previousCard.sourceImage === card.sourceImage && printingIdentity(previousCard) === printingIdentity(card);
  const refresh = !reusable || !await statIfPresent(target);
  let fullBytes;
  if (refresh) {
    const result = await fetch(card.sourceImage, { signal: AbortSignal.timeout(30000) });
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    if (!result.headers.get('content-type')?.startsWith('image/')) throw new Error('Not an image');
    const bytes = Buffer.from(await result.arrayBuffer());
    // A successful image request is not verification: only a stored visual review can approve pending art.
    if (card.imageVerification &&
      createHash('sha256').update(bytes).digest('hex') !== card.imageVerification.sourceSha256) {
      throw new Error(`${card.id}: reviewed image content changed; visually re-review it before importing.`);
    }
    fullBytes = await sharp(bytes).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
  }
  if (refresh || !await statIfPresent(thumbnail)) {
    // Decode fresh bytes, not a filename that libvips may still cache after an overwrite.
    const thumbnailBytes = await sharp(fullBytes || await fs.readFile(target)).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (fullBytes) await fs.writeFile(target, fullBytes);
    await fs.writeFile(thumbnail, thumbnailBytes);
  }
  return refresh;
}

async function main() {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Catalog request failed: HTTP ${response.status}`);
  const text = await response.text();
  const match = text.match(/window\.PokeCottageMastersetInline\["me55-30th-celebration"\]\s*=\s*(\{[\s\S]*\})\s*;/);
  if (!match) throw new Error('The source catalog format has changed. No files were changed.');
  const data = JSON.parse(match[1]);
  const catalogPath = path.join(root, 'src/catalog-data.json');
  const previous = await fs.readFile(catalogPath, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  const previousCards = previous === null ? [] : JSON.parse(previous).cards;
  if (!Array.isArray(previousCards)) throw new Error('The existing catalog has no card records. No files were changed.');
  const cards = prepareCards(data, previousCards);
  const previousById = new Map(previousCards.map(card => [card.id, card]));
  await fs.mkdir(path.join(root, 'public/cards/thumbs'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const queue = cards.filter(card => card.image);
  const failures = [];
  let downloaded = 0;
  let cursor = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < queue.length) {
      const card = queue[cursor++];
      try {
        if (await cacheCardImage(card, path.join(root, 'public'), previousById.get(card.id))) downloaded++;
      } catch (error) {
        failures.push(`${card.id}: ${error.message}`);
      }
    }
  }));
  if (failures.length) {
    throw new Error(`Could not cache ${failures.length} images. Catalog was not replaced.\n${failures.join('\n')}`);
  }

  const catalog = {
    name: data.set.name,
    source,
    guide: 'https://pokecottage.com/30th-celebration-master-set-guide#checklist',
    sourceUpdatedAt: data.generatedAt,
    retrievedAt: new Date().toISOString(),
    uniqueCards: data.counts.cards,
    variantCount: cards.length,
    cards,
  };
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Catalog: ${cards.length} variants, ${queue.length} verified images, ${cards.length - queue.length} pending.`);
  console.log(`Cached ${downloaded} images. Artwork remains the property of its respective rights holders.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
