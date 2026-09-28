import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { Quaternion, Vector3 } from 'three';
import { ADMIRE_PITCH_LIMIT } from '../src/card-admiration.js';
import { STORAGE_KEY } from '../src/collection.js';

const origin = process.env.BINDER_URL || 'http://127.0.0.1:4173';
const bundle = await build({
  stdin: { resolveDir: fileURLToPath(new URL('../../', import.meta.url)), contents: `
    import { CardAdmiration } from './binder/src/card-admiration.js';
    const show = CardAdmiration.prototype.show;
    const update = CardAdmiration.prototype.update;
    CardAdmiration.prototype.update = function(camera) { this.probeCamera = camera; return update.call(this,camera); };
    CardAdmiration.prototype.show = function(id) {
      if (!window.admireProbe) {
        const view = this, scene = view.root.parent, afterRender = scene.onAfterRender;
        let frames = 0;
        scene.onAfterRender = function(...args) { frames++; afterRender.apply(this, args); };
        window.admireProbe = () => ({
          id: view.id, rotation: view.card.quaternion.toArray(), frames,
          pitch: view.euler.x, yaw: view.euler.y, roll: view.euler.z,
          ready: Boolean(view.map), visible: view.root.visible,
          bottom: Math.max(...[-.625,.625].flatMap(x=>[-.873,.873].map(y=>{
            const point=view.card.localToWorld(view.card.position.clone().set(x,y,.007)).project(view.probeCamera);
            return (.5-point.y*.5)*innerHeight;
          }))),
        });
      }
      return show.call(this, id);
    };
    await import('./binder/src/main.js');
  ` },
  bundle: true, write: false, format: 'esm', target: ['es2022'],
  loader: { '.css': 'empty', '.svg': 'text' }, logLevel: 'silent',
});
const browser = await chromium.launch({
  headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce',
  });
  await context.route('**/app.js', route => route.fulfill({
    contentType: 'application/javascript', body: bundle.outputFiles[0].text,
  }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const snapshot = () => page.evaluate(() => window.admireProbe());
  const layout = () => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  const hand = () => page.locator('#hand-cards li').evaluateAll(items => items.map(item => item.dataset.handId));
  const selection = () => page.locator('#hand-cards [aria-pressed="true"]').getAttribute('data-hand-select');
  const upright = state => {
    const rotation = new Quaternion().fromArray(state.rotation);
    assert.ok(state.rotation.every(Number.isFinite));
    assert.ok(new Vector3(0, 1, 0).applyQuaternion(rotation).y >= .5 - 1e-12);
    assert.ok(Math.abs(new Vector3(1, 0, 0).applyQuaternion(rotation).y) < 1e-12, 'Controls must never add roll');
    assert.ok(Math.abs(state.pitch) <= ADMIRE_PITCH_LIMIT);
    assert.ok(state.yaw >= -Math.PI && state.yaw < Math.PI);
    assert.equal(state.roll, 0);
    return rotation;
  };
  const change = async action => {
    const before = await snapshot();
    await action();
    await page.waitForFunction(frames => window.admireProbe().frames > frames, before.frames);
    const after = await snapshot(); upright(after);
    return after;
  };
  const settle = async () => {
    let previous = await snapshot();
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.waitForTimeout(150);
      const current = await snapshot();
      if (current.frames === previous.frames) return current;
      previous = current;
    }
    assert.fail('The paused room must settle after an admire interaction');
  };
  const drag = async shift => {
    if (shift) await page.keyboard.down('Shift');
    try {
      await page.mouse.move(700, 300); await page.mouse.down();
      await page.mouse.move(1100, 600, { steps: 12 }); await page.mouse.up();
    } finally {
      if (shift) await page.keyboard.up('Shift');
    }
  };

  await page.goto(origin);
  await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 90000 });
  assert.equal(await page.locator('html').getAttribute('data-ready'), 'true', errors.join('\n'));
  await page.locator('#scene-loading').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('html').getAttribute('data-city-motion'), 'paused');
  const original = await layout(); assert.notEqual(original, null);
  await page.locator('#bag-open').click();
  await page.locator('.collection-card').nth(0).click();
  await page.locator('.collection-card').nth(1).click();
  await page.locator('#bag-place').click();
  await page.locator('#hand-cards button').first().click();
  const picked = await hand(), selected = await selection();
  await page.locator('#hand-admire').click();
  await page.waitForFunction(() => window.admireProbe?.().ready && window.admireProbe().frames > 0);
  assert.equal((await snapshot()).id, selected);
  assert.equal(await page.locator('#admire-roll').count(), 0);
  assert.equal(await page.locator('#admire-controls').getAttribute('aria-describedby'), 'admire-help');
  assert.match(await page.locator('#admire-help').innerText(), /360.*always upright/is);
  const idle = await settle();
  assert.ok(idle.bottom < (await page.locator('#admire-controls').boundingBox()).y-5,'Admire controls must not cover the printed bottom edge of the card');
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).frames, idle.frames, 'Admiring must not restart paused scene animation');

  const flipped = await change(() => page.getByRole('button', { name: 'Flip card to the other side' }).click());
  assert.ok(new Vector3(0, 0, 1).applyQuaternion(upright(flipped)).z < -.999);
  const front = await change(() => page.locator('#admire-flip').click());
  assert.ok(upright(front).angleTo(new Quaternion()) < 1e-7);
  for (const [label, sign] of [['Tilt down', 1], ['Tilt up', -1]]) {
    for (let i = 0; i < 8; i++) await change(() => page.getByRole('button', { name: label }).click());
    assert.equal((await snapshot()).pitch, sign * ADMIRE_PITCH_LIMIT);
  }
  for (const direction of ['ArrowRight', 'ArrowLeft']) {
    let seenFront = false, seenBack = false;
    for (let i = 0; i < 24; i++) {
      const state = await change(() => page.keyboard.press(direction));
      const facing = new Vector3(0, 0, 1).applyQuaternion(upright(state)).z;
      seenFront ||= facing > .3; seenBack ||= facing < -.3;
    }
    assert.ok(seenFront && seenBack, 'Keyboard yaw must freely turn past both sides');
  }
  for (const direction of ['ArrowUp', 'ArrowDown']) {
    for (let i = 0; i < 10; i++) await change(() => page.keyboard.press(direction));
  }
  await change(() => page.locator('#admire-reset').click());
  const normalDrag = await change(() => drag(false));
  await change(() => page.locator('#admire-reset').click());
  const shiftedDrag = await change(() => drag(true));
  assert.ok(upright(normalDrag).angleTo(upright(shiftedDrag)) < 1e-7, 'Shift must not alter drag orientation');
  const touch = await context.newCDPSession(page);
  try {
    await change(async () => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 300, id: 1 }] });
      for (let i = 1; i <= 12; i++) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: 700 - i * 25, y: 300 + i * 20, id: 1 }],
        });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });
  } finally { await touch.detach(); }
  await page.keyboard.press('h');
  assert.equal(await page.locator('#admire-controls').isVisible(), false);
  await change(() => page.keyboard.press('Shift+ArrowRight'));
  await page.keyboard.press('h');
  const reset = await change(() => page.locator('#admire-reset').click());
  assert.deepEqual(reset.rotation, [0, 0, 0, 1]);
  assert.equal(await selection(), selected);
  assert.deepEqual(await hand(), picked);
  assert.equal(await layout(), original, 'Turning, tilting and resetting must not change saved layout or pages');

  await page.locator('#hand-cards button').nth(1).click();
  await page.waitForFunction(id => window.admireProbe().id === id && window.admireProbe().ready, picked[1]);
  assert.deepEqual((await snapshot()).rotation, [0, 0, 0, 1], 'Selecting another card must start at the upright front');
  assert.equal(await selection(), picked[1]);
  const beforeModal = (await snapshot()).rotation;
  await page.locator('#help-open').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
  assert.deepEqual((await snapshot()).rotation, beforeModal, 'Modal controls must have keyboard priority');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-dialog').isVisible(), false);
  assert.equal(await page.locator('#app').getAttribute('data-admiring'), 'true');
  await change(() => page.keyboard.press('Escape'));
  assert.equal((await snapshot()).visible, false);
  assert.equal(await selection(), picked[1]);
  assert.deepEqual(await hand(), picked);
  assert.equal(await layout(), original, 'Finishing admiration must preserve the selected hand and saved layout');
  await settle();
  assert.deepEqual(errors, []);
  console.log('PASS: upright 360-degree turning, bounded buttons/keys/mouse/Shift/touch, front/back flip, reset, selection/layout, modal priority and paused redraws');
} finally {
  await browser.close();
}
