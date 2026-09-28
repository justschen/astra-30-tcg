import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CARDS, cardImage } from '../src/collection.js';

test('the Pages build preserves every full-size card and thumbnail without replacing the artwork', async () => {
  const output = new URL('../../dist/binder/', import.meta.url);
  const source = new URL('../public/', import.meta.url);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(CARDS.length, 251);
  for (const card of CARDS) for (const fullSize of [false, true]) {
    const image = cardImage(card, fullSize);
    const [original, deployed] = await Promise.all([
      fs.readFile(new URL(image, source)), fs.readFile(new URL(image, output)),
    ]);
    assert.equal(hash(deployed), hash(original), `${image} must retain the exact original artwork bytes`);
  }
  await assert.rejects(fs.access(new URL('cards/PUBLIC-DEMO.json', output)), { code: 'ENOENT' });
  assert.equal(await fs.readFile(new URL('.nojekyll', output), 'utf8'), '');
});
