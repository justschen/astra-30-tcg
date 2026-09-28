import assert from 'node:assert/strict';
import sharp from 'sharp';
import { STORAGE_KEY, locateCard } from '../src/collection.js';

const ready = async (page, origin) => {
  await page.goto(origin);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 120000 });
  await page.locator('#scene-loading').waitFor({ state: 'hidden' });
};
const saved = async page => {
  await page.waitForFunction(() => document.documentElement.dataset.saveState !== 'saving');
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
};
const inHand = page => page.locator('#hand-cards li').evaluateAll(items => items.map(item => item.dataset.handId));
const pocket = (page, index) => page.locator(`.pocket-hotspot[data-slot="${index}"]`);
const waitSpread = (page, spread) => page.waitForFunction(({ key, spread }) => JSON.parse(localStorage.getItem(key)).spread === spread, { key: STORAGE_KEY, spread });

async function pixelDifference(a, b) {
  const first = await sharp(a).removeAlpha().raw().toBuffer(), second = await sharp(b).removeAlpha().raw().toBuffer();
  let changed = 0;
  assert.equal(first.length, second.length);
  for (let i = 0; i < first.length; i += 3) if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 18) changed++;
  return changed;
}

export async function checkWorldQOL(browser, origin, shots) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await ready(page, origin);
    const initial = await saved(page);
    await pocket(page, 9).click(); await pocket(page, 10).click();
    await page.locator('#bag-open').click();
    await page.locator('[data-location="table"]').click();
    for (const pile of ['unsorted', 'favorites', 'trades']) {
      await page.locator('#stack-filter').selectOption(pile);
      const ids = await page.locator('.collection-card').evaluateAll(items => items.map(item => item.dataset.cardId));
      assert.deepEqual(new Set(ids), new Set(initial.piles[pile]), `The ${pile} filter must show only that stack`);
      await page.locator('.collection-card').first().click();
    }
    await page.locator('#stack-filter').selectOption('all');
    assert.equal(await page.locator('.collection-card').count(), Object.values(initial.piles).flat().length);
    await page.locator('[data-location="bag"]').click();
    for (let i = 0; i < 17; i++) await page.locator('.collection-card').nth(i).click();
    await page.locator('#bag-place').click();
    const handBefore = await inHand(page);
    assert.equal(handBefore.length, 22);
    assert.equal(await page.locator('#hand-collapse').getAttribute('aria-expanded'), 'false', 'A large hand folds to expose its placement destinations');
    await page.locator('#hand-collapse').click();
    const handBounds = await page.locator('#hand-cards').evaluate(element => ({
      width: element.clientWidth, scrollWidth: element.scrollWidth,
      rows: new Set([...element.children].map(child => child.offsetTop)).size,
      outside: [...element.querySelectorAll('button')].some(button => {
        const rect = button.getBoundingClientRect();
        return rect.left < 8 || rect.right > innerWidth - 8 || rect.top < 0 || rect.bottom > innerHeight;
      }),
    }));
    assert.equal(handBounds.scrollWidth, handBounds.width);
    assert.equal(handBounds.rows, 2);
    assert.equal(handBounds.outside, false);
    const overlap = await page.locator('#hand-cards').evaluate(element => {
      const [first, second] = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      return first.right - second.left;
    });
    assert.ok(overlap >= 10 && overlap <= 20, 'Cards should overlap slightly inside each row');
    await page.locator(`[data-hand-select="${handBefore[1]}"]`).click();
    assert.equal(await page.locator('#hand-cards [aria-pressed="true"]').getAttribute('data-hand-select'), handBefore[1]);
    await page.locator(`[data-hand-select="${handBefore[0]}"]`).click();
    await page.screenshot({ path: new URL('expanded-hand.png', shots).pathname });
    await pocket(page, 17).click();
    const remaining = await inHand(page), beforeClear = await saved(page);
    await page.locator('#hand-clear').click();
    const cleared = await saved(page);
    assert.equal(await page.locator('#hand-tray').isVisible(), false);
    remaining.forEach(id => assert.equal(locateCard(cleared, id).kind, 'bag'));
    assert.equal(cleared.slots[17], initial.slots[9], 'Clearing must not undo cards already placed');
    await page.locator('#undo-action').click();
    assert.deepEqual(await saved(page), beforeClear);
    assert.deepEqual(await inHand(page), remaining);
    await page.locator('#hand-clear').click();
    console.log('PASS: each stack is individually filterable; a large hand folds to reveal pockets and expands without clipping; Return to bag is undoable');

    await page.locator('#help-open').click();
    await page.locator('#import-file').setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(initial)) });
    await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).slots[9] === id, { key: STORAGE_KEY, id: initial.slots[9] });
    await page.locator('[data-close="help-dialog"]').click();
    const tableRect = await pocket(page, 9).boundingBox();
    await page.locator('#held-view').click(); await page.waitForTimeout(1500);
    assert.equal(await page.locator('#app').getAttribute('data-view'), 'held');
    const liftedRect = await pocket(page, 9).boundingBox();
    assert.ok(liftedRect.height > tableRect.height * 1.5, 'Lifted mode must hold the actual binder upright for reading');
    assert.equal(await page.locator('.pocket-hotspot:visible').count(), 18);
    assert.deepEqual(await saved(page), initial);
    await page.screenshot({ path: new URL('lifted-binder.png', shots).pathname });
    await page.keyboard.press('ArrowRight'); await waitSpread(page, 2);
    await page.locator('#previous-page').click(); await waitSpread(page, 1);
    const edge = await pocket(page, 23).evaluate(button => {
      const rect = button.getBoundingClientRect(), points = button.style.clipPath.match(/[\d.]+/g).map(Number);
      return { x: rect.x + (points[2] + points[4]) / 200 * rect.width + 9, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(edge.x, edge.y); await page.mouse.down();
    await page.mouse.move(edge.x - 230, edge.y - 3, { steps: 14 }); await page.mouse.up();
    await waitSpread(page, 2);
    await page.locator('#bag-open').click(); await page.locator('[data-location="bag"]').click();
    const id = await page.locator('.collection-card').first().getAttribute('data-card-id');
    await page.locator('.collection-card').first().click(); await page.locator('#bag-place').click();
    assert.equal(await page.locator('#app').getAttribute('data-view'), 'held');
    await pocket(page, 27).click();
    assert.equal((await saved(page)).slots[27], id);
    await page.locator('#binder-view').click(); await page.waitForTimeout(1300);
    assert.equal(await page.locator('#held-view').getAttribute('aria-pressed'), 'false');
    console.log('PASS: physical binder lift, key/mouse page turns, live pocket placement and safe return to the table');

    await page.locator('#city-view').click(); await page.waitForTimeout(1300);
    await page.locator('#help-open').click();
    await page.locator('#city-motion-toggle').click();
    await page.locator('.weather-options [data-weather="clear"]').click();
    await page.locator('.time-presets [data-time="12"]').click();
    await page.locator('#cloud-cover').fill('0');
    assert.equal(await page.locator('#city-time-label').textContent(), '12:00');
    await page.locator('[data-close="help-dialog"]').click(); await page.waitForTimeout(450);
    const day = await page.screenshot();
    await page.locator('#help-open').click(); await page.locator('.time-presets [data-time="17.75"]').click();
    assert.equal(await page.locator('#city-time-label').textContent(), '17:45');
    await page.locator('[data-close="help-dialog"]').click(); await page.waitForTimeout(450);
    const sunset = await page.screenshot();
    assert.ok(await pixelDifference(day, sunset) > 40_000);
    await page.locator('#help-open').click(); await page.locator('#cloud-cover').fill('100'); await page.locator('#cloud-speed').fill('250');
    await page.locator('#traffic-density').fill('100');
    assert.equal(await page.locator('#cloud-cover-label').textContent(), '100%');
    assert.equal(await page.locator('#cloud-speed-label').textContent(), '2.5x');
    assert.equal(await page.locator('#traffic-density-label').textContent(), '100%');
    await page.locator('[data-close="help-dialog"]').click(); await page.waitForTimeout(450);
    const cloudy = await page.screenshot();
    assert.ok(await pixelDifference(sunset, cloudy) > 5000);
    await page.screenshot({ path: new URL('sunset-clouds.png', shots).pathname });
    for (const [name, dx] of [['right', 470], ['left', -470]]) {
      await page.locator('#city-view').click(); await page.waitForTimeout(1000);
      await page.mouse.move(720, 390); await page.mouse.down(); await page.mouse.move(720 + dx, 390, { steps: 20 }); await page.mouse.up();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: new URL(`filled-city-${name}.png`, shots).pathname });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: full-day presets, visible sunset lighting, cloud coverage/speed, traffic controls and filled side-view captures');
  } finally {
    await context.close();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  try {
    await ready(mobile, origin);
    await mobile.locator('#held-view').tap();
    await mobile.waitForTimeout(150);
    await mobile.locator('#bag-open').tap(); await mobile.locator('[data-location="bag"]').tap();
    const firstCard = await mobile.locator('.collection-card').first().getAttribute('data-card-id');
    for (let i = 0; i < 22; i++) await mobile.locator('.collection-card').nth(i).tap();
    await mobile.locator('#bag-place').tap();
    assert.equal(await mobile.locator('#hand-collapse').getAttribute('aria-expanded'), 'false');
    await pocket(mobile, 17).tap();
    assert.equal((await saved(mobile)).slots[17], firstCard, 'A large mobile hand must not cover every placement target');
    await mobile.locator('#hand-collapse').tap();
    const widths = await mobile.locator('#hand-cards').evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, rows: new Set([...element.children].filter(child => getComputedStyle(child).display !== 'none').map(child => child.offsetTop)).size }));
    assert.equal(widths.width, widths.scroll); assert.ok(widths.rows >= 2);
    await mobile.screenshot({ path: new URL('mobile-wrapped-hand.png', shots).pathname });
    await mobile.locator('#hand-collapse').tap();
    await mobile.locator('#hand-clear').tap();
    assert.equal(await mobile.locator('#hand-tray').isVisible(), false);
    await mobile.locator('#next-page').tap(); await waitSpread(mobile, 2);
    assert.equal(await mobile.locator('.pocket-hotspot:visible').count(), 18);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.setViewportSize({ width: 820, height: 1180 }); await mobile.waitForTimeout(350);
    assert.equal(await mobile.locator('.pocket-hotspot:visible').count(), 18);
    assert.equal(await mobile.locator('.pocket-hotspot').evaluateAll(buttons => buttons.every(button => {
      const rect = button.getBoundingClientRect(); return !button.hidden && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    })), true, 'Every outer pocket must fit in a portrait tablet');
    await mobile.setViewportSize({ width: 768, height: 900 }); await mobile.waitForTimeout(350);
    const previousWeather = await mobile.locator('html').getAttribute('data-weather');
    await mobile.locator('#city-view').tap();
    assert.equal(await mobile.locator('#app').getAttribute('data-view'), 'city');
    assert.equal(await mobile.locator('html').getAttribute('data-weather'), previousWeather, 'Balcony must not overlap the weather control');
    console.log('PASS: large mobile hands retain placement access; lifted binder fits portrait tablets; tablet navigation does not overlap settings');
  } finally {
    await mobileContext.close();
  }
}
