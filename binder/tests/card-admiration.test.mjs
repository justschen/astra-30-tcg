import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CardAdmiration, ADMIRE_PITCH_LIMIT, ADMIRE_ROTATION_SPEED } from '../src/card-admiration.js';
import { CARDS, cardImage } from '../src/collection.js';

function createAdmiration(t) {
  const document = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return { getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) };
    },
  } });
  t.after(() => {
    if (document) Object.defineProperty(globalThis, 'document', document);
    else delete globalThis.document;
  });
  const requests = [], errors = [];
  let invalidations = 0;
  t.mock.method(THREE.TextureLoader.prototype, 'load', (url, onLoad, onProgress, onError) => {
    const texture = new THREE.Texture();
    requests.push({ url, texture, onLoad, onError });
    return texture;
  });
  const view = new CardAdmiration(new THREE.Scene(), () => invalidations++, message => errors.push(message));
  t.after(() => { view.dispose(); requests.forEach(request => request.texture.dispose()); });
  view.show(CARDS[0].id);
  return { view, requests, errors, invalidations: () => invalidations };
}

function assertUpright(view) {
  const rotation = view.card.quaternion;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
  assert.ok(rotation.toArray().every(Number.isFinite));
  assert.ok(Math.abs(rotation.length() - 1) < 1e-12);
  assert.ok(up.y >= Math.cos(ADMIRE_PITCH_LIMIT) - 1e-12, 'The top edge must remain above the bottom edge');
  assert.ok(Math.abs(right.y) < 1e-12, 'Yaw and tilt must not introduce camera-relative roll');
  assert.ok(Math.abs(view.euler.x) <= ADMIRE_PITCH_LIMIT);
  assert.ok(view.euler.y >= -Math.PI && view.euler.y < Math.PI);
  assert.equal(view.euler.z, 0);
}

test('admiring a card does not add a camera light that relights the room when it appears or disappears',t=>{
  const {view}=createAdmiration(t);
  assert.equal(view.root.getObjectByProperty('isLight',true),undefined);
});

test('all yaw angles and extreme pitch inputs keep both faces upright relative to the camera', t => {
  const { view } = createAdmiration(t);
  assert.equal(ADMIRE_PITCH_LIMIT, Math.PI / 3);
  const camera = new THREE.PerspectiveCamera(48, 1.6, .15, 100);
  const { width, height } = view.front.geometry.parameters;
  for (const [pitch, yaw, roll, aspect] of [[0, 0, 0, 1.6], [.8, -1.1, .3, .46], [-.6, 2.4, -.2, 2]]) {
    camera.position.set(3, 2, 5);
    camera.rotation.set(pitch, yaw, roll, 'YXZ');
    camera.aspect = aspect; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    view.update(camera);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    for (let step = -288; step <= 288; step++) {
      for (const tilt of [-1e6, -ADMIRE_PITCH_LIMIT, -.38, 0, .38, ADMIRE_PITCH_LIMIT, 1e6]) {
        view.reset();
        view.rotate(step * Math.PI / 24 / ADMIRE_ROTATION_SPEED, tilt / ADMIRE_ROTATION_SPEED);
        assertUpright(view);
        const worldRotation = view.card.getWorldQuaternion(new THREE.Quaternion());
        assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(worldRotation).dot(cameraUp) >= .5 - 1e-12);
        const top = [], bottom = [];
        for (const x of [-width / 2, width / 2]) for (const z of [-.007, .007]) {
          top.push(view.card.localToWorld(new THREE.Vector3(x, height / 2, z)).project(camera).y);
          bottom.push(view.card.localToWorld(new THREE.Vector3(x, -height / 2, z)).project(camera).y);
        }
        assert.ok(Math.min(...top) > Math.max(...bottom), 'Perspective projection must not invert either top edge');
      }
    }
  }
});

test('thousands of mixed drags, arrow-sized inputs, tilts and flips cannot accumulate roll or pitch', t => {
  const { view } = createAdmiration(t);
  for (let i = 0; i < 8192; i++) {
    view.rotate(Math.sin(i * .31) * 1200, Math.cos(i * .17) * 800);
    view.rotate(i % 2 ? 40 : -60, i % 3 ? 50 : -40);
    assertUpright(view);
    if (i % 3 === 0) { view.flip(); assertUpright(view); }
  }
  for (const extreme of [Number.MAX_VALUE, -Number.MAX_VALUE, 1e20, -1e20]) {
    view.rotate(extreme, extreme);
    assertUpright(view);
    view.flip();
    assertUpright(view);
  }
});

test('yaw has no hard stop and Flip swaps front/back at every tilt without changing pitch', t => {
  const { view } = createAdmiration(t);
  for (const yaw of [0, .4, Math.PI / 2, Math.PI, 5.7, -Math.PI - .2]) {
    for (const pitch of [-ADMIRE_PITCH_LIMIT, -.4, 0, .4, ADMIRE_PITCH_LIMIT]) {
      view.reset(); view.rotate(yaw / ADMIRE_ROTATION_SPEED, pitch / ADMIRE_ROTATION_SPEED);
      const before = view.card.quaternion.clone();
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(before).z;
      view.flip();
      assertUpright(view);
      assert.equal(view.euler.x, pitch);
      assert.ok(Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(view.card.quaternion).z + facing) < 1e-12);
      view.flip();
      assertUpright(view);
      assert.ok(view.card.quaternion.angleTo(before) < 1e-7, 'Two flips must restore the original orientation');
    }
  }
  view.reset();
  for (const direction of [-1, 1]) {
    for (let step = 0; step < 40; step++) view.rotate(direction * Math.PI / 4 / ADMIRE_ROTATION_SPEED, 0);
    assert.ok(view.card.quaternion.angleTo(new THREE.Quaternion()) < 1e-7, 'Five full turns must return to the front');
  }
});

test('reset, selection changes, loading and hide retain paused-room invalidations', t => {
  const { view, requests, errors, invalidations } = createAdmiration(t);
  assert.equal(invalidations(), 1);
  assert.equal(requests[0].url, cardImage(CARDS[0], true));
  requests[0].onLoad(requests[0].texture);
  assert.equal(invalidations(), 2);
  assert.equal(view.front.material.map, requests[0].texture);
  for (const action of [() => view.rotate(60, 50), () => view.flip(), () => view.reset()]) {
    const before = invalidations(); action();
    assert.equal(invalidations(), before + 1, 'Visible orientation changes must invalidate the paused frame');
  }
  assert.deepEqual(view.card.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(view.euler.toArray(), [0, 0, 0, 'YXZ']);
  view.rotate(1200, 2000);
  const before = invalidations();
  view.show(CARDS[1].id);
  assert.equal(view.id, CARDS[1].id);
  assert.equal(invalidations(), before + 1);
  assert.deepEqual(view.card.quaternion.toArray(), [0, 0, 0, 1]);
  view.rotate(0, -40);
  assert.ok(Math.abs(view.euler.x + 40 * ADMIRE_ROTATION_SPEED) < 1e-12, 'Selection must clear accumulated tilt');
  view.hide();
  const hidden = invalidations();
  assert.equal(view.id, null); assert.equal(view.root.visible, false);
  view.rotate(80, 80); view.flip();
  assert.equal(invalidations(), hidden, 'Inactive controls must not redraw a hidden card');
  let staleDisposed = false;
  requests[1].texture.addEventListener('dispose', () => { staleDisposed = true; });
  requests[1].onLoad(requests[1].texture);
  assert.equal(staleDisposed, true);
  assert.equal(view.front.material.map, null);
  assert.equal(invalidations(), hidden, 'Late artwork must not revive a hidden card');
  assert.deepEqual(errors, []);
});

test('non-finite or non-numeric deltas fail explicitly without corrupting the last upright pose', t => {
  const { view, invalidations } = createAdmiration(t);
  view.rotate(80, -40);
  const rotation = view.card.quaternion.toArray(), before = invalidations();
  for (const [dx, dy] of [[NaN, 0], [Infinity, 0], [0, -Infinity], [undefined, 0], [0, '40']]) {
    assert.throws(() => view.rotate(dx, dy), /finite numbers/);
    assert.deepEqual(view.card.quaternion.toArray(), rotation);
    assert.equal(invalidations(), before);
    assertUpright(view);
  }
});
