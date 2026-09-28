import assert from 'node:assert/strict';
import { CARDS, RARITY_ORDER, STORAGE_KEY } from '../src/collection.js';

const ready = async (page, origin) => {
  await page.goto(origin); await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 90000 });
  await page.locator('#scene-loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.documentElement.dataset.saveState !== 'saving');
};
const saved = async page => {
  await page.waitForFunction(() => document.documentElement.dataset.saveState !== 'saving');
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
};

export async function checkAuditFixes(browser, origin, shots) {
  const tabs = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await tabs.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type.startsWith('webgl') ? null : original.call(this, type, ...args); };
  });
  try {
    const first = await tabs.newPage(), second = await tabs.newPage();
    await ready(first, origin); await ready(second, origin);
    const original = await saved(first), picked = original.slots[9];
    await first.locator('#fallback-open').click(); await first.locator('.flat-pocket[data-slot="9"]').click(); await first.locator('.flat-pocket[data-slot="17"]').click();
    assert.equal((await saved(first)).slots[17], picked);
    await second.waitForFunction(() => document.documentElement.dataset.saveState === 'blocked');
    await second.locator('#fallback-open').click(); await second.locator('#flat-next').click();
    assert.equal((await saved(second)).slots[17], picked, 'Navigation in a stale tab must not undo another tab’s placement');
    assert.equal(await second.locator('#storage-retry').isVisible(), false);
    await second.locator('[data-close="flat-dialog"]').click();
    await second.locator('#storage-load-latest').click(); await second.locator('#flat-open').click();
    assert.equal((await saved(second)).slots[17], picked);
    assert.equal(await second.locator('.flat-pocket[data-slot="9"]').count(), 0, 'Loading latest preserves this tab’s chosen page rather than another tab’s navigation');
    assert.equal(await second.locator('#save-status').textContent(), 'Saved on this device');
    console.log('PASS: two tabs cannot silently overwrite one another; stale navigation is safe and latest-layout recovery preserves card placements');
  } finally { await tabs.close(); }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], diagnostics = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  page.on('requestfailed', request => diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`));
  try {
    await ready(page, origin); assert.equal(await page.locator('html').getAttribute('data-ready'), 'true', diagnostics.join('\n'));
    await page.locator('#time-preset').click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#time-preset').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
    await page.getByRole('link', { name: 'Afterhours home' }).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#time-preset').evaluate(element => element === document.activeElement), true);
    assert.notEqual(await page.locator('.time-picker').evaluate(element => getComputedStyle(element).boxShadow), 'none', 'Keyboard users retain a compact focus cue on the control wrapper');
    await page.mouse.click(10, 200);
    await page.locator('#page-map-open').click(); assert.equal(await page.locator('[data-jump-spread]').count(), 21);
    await page.locator('[data-jump-spread="10"]').click(); assert.equal((await saved(page)).spread, 10);
    await page.locator('#page-map-open').click(); await page.locator('[data-jump-spread="1"]').click();
    await page.locator('#bag-open').click(); await page.locator('#sort-filter').selectOption('rarity');
    const visibleRarities = await page.locator('.card-rarity').allTextContents();
    assert.equal(visibleRarities[0], RARITY_ORDER[0]);
    assert.ok(visibleRarities.includes('Pikachu holo'));
    const inspect = page.locator('.card-inspect-button').nth(75);
    await inspect.scrollIntoViewIfNeeded(); await inspect.focus();
    const id = await inspect.getAttribute('data-inspect-id'), scroll = await page.locator('#card-grid').evaluate(element => element.scrollTop);
    await page.keyboard.press('Enter'); await page.locator('[data-close="inspect-dialog"]').click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.inspectId), id);
    assert.ok(Math.abs(await page.locator('#card-grid').evaluate(element => element.scrollTop) - scroll) < 2);
    await page.locator('[data-location="binder"]').click();
    await page.locator('[data-show-card]:visible').first().click(); await page.waitForTimeout(1200);
    assert.equal(await page.locator('#held-view').getAttribute('aria-pressed'), 'true');
    await page.locator('#bag-open').click(); await page.locator('[data-location="all"]').click();
    for (let i = 0; i < 24; i++) await page.locator('.collection-card').nth(i).click();
    await page.locator('#bag-place').click(); await page.waitForTimeout(900);
    const blockers = await page.locator('.pocket-hotspot:not([hidden])').evaluateAll(elements => elements.filter(element => {
      const rect = element.getBoundingClientRect(), top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return top?.closest('#hand-cards,.table-controls');
    }).map(element => element.dataset.slot));
    assert.deepEqual(blockers, [], 'Neither the large hand nor toolbar may cover active lifted-binder pocket centers');
    await page.keyboard.press('Escape'); await page.locator('#bag-open').click();
    const before = await saved(page);
    await page.locator('#organizer-open').click(); await page.locator('#organizer-source').selectOption('all');
    await page.locator('.protected-pages summary').click(); await page.locator('#organizer-locks input[value="1"]').check();
    await page.locator('#organizer-preview').click();
    assert.deepEqual(await saved(page), before, 'Preview cannot modify the saved layout');
    assert.equal(await page.locator('#organizer-apply').isEnabled(), true);
    await page.screenshot({ path: new URL('review-binder-organizer.png', shots).pathname });
    await page.locator('#organizer-apply').click();
    const organized = await saved(page);
    assert.equal(organized.slots.filter(Boolean).length, CARDS.length);
    assert.deepEqual(organized.slots.slice(9, 18), before.slots.slice(9, 18));
    await page.locator('#undo-action').click(); assert.deepEqual(await saved(page), before, 'One undo must restore the entire batch');
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#flat-open').click();
    const pocket = await page.locator('.flat-pocket').first().boundingBox();
    assert.ok(pocket.width > 85 && pocket.height > 100, 'The mobile editing surface presents a readable page instead of two tiny pages');
    assert.deepEqual(errors, []);
    console.log('PASS: compact keyboard focus, page map/jumps, rarity order, restored inspection focus, unobstructed hand and atomic previewable binder organization');
  } finally { await context.close(); }

  const failureContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  let releaseDistrict;
  const districtGate = new Promise(resolve => { releaseDistrict = resolve; });
  await failureContext.route('**/city/data18.bin.gz', async route => {
    await districtGate; await route.fulfill({ status: 503, body: 'Unavailable test district' });
  });
  try {
    const page = await failureContext.newPage(); await page.goto(origin, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.dataset.saveState === 'saved');
    await page.locator('#loading-bag').click();
    assert.ok(await page.locator('.collection-card').count() > 0);
    await page.locator('[data-close="bag-dialog"]').click();
    await page.locator('#loading-pocket').click();
    const initial = await saved(page);
    await page.locator('.flat-pocket[data-slot="9"]').click(); await page.locator('.flat-pocket[data-slot="17"]').click();
    assert.equal((await saved(page)).slots[17], initial.slots[9], 'Collection editing must work while an optional city tile is still loading');
    releaseDistrict();
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 90000 });
    await page.locator('#scene-loading').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#flat-dialog').isVisible(), true, 'Finishing 3D loading must not dismiss the collection workflow');
    await page.locator('[data-close="flat-dialog"]').click();
    assert.equal(await page.locator('html').getAttribute('data-ready'), 'true');
    assert.equal(await page.locator('html').getAttribute('data-city-status'), 'degraded');
    assert.equal(await page.locator('#city-load-warning').isVisible(), true);
    await page.locator('.pocket-hotspot[data-slot="17"]').click(); await page.locator('.pocket-hotspot[data-slot="9"]').click();
    assert.deepEqual(await saved(page), initial);
    let reloads = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) reloads++; });
    await page.evaluate(key => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) throw new DOMException('Test storage is full', 'QuotaExceededError');
        return setItem.call(this, name, value);
      };
      document.querySelector('.pocket-hotspot[data-slot="9"]').click();
      document.querySelector('.pocket-hotspot[data-slot="17"]').click();
      document.querySelector('#city-retry').click();
    }, STORAGE_KEY);
    await page.waitForFunction(() => document.documentElement.dataset.saveState === 'blocked');
    await page.waitForTimeout(200);
    assert.equal(reloads, 0, 'City retry must never reload away a pending layout whose save failed');
    assert.deepEqual(await saved(page), initial);
    assert.equal(await page.locator('#storage-export').isVisible(), true);
    console.log('PASS: loading-time collection editing survives a failed city tile; 3D remains usable and retry cannot discard a failed pending save');
  } finally { releaseDistrict(); await failureContext.close(); }
}
