import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookDelta } from '../src/look-controls.js';
import { HUD_IDLE_MS, IdleTimer } from '../src/idle-hud.js';

function clock() {
  let time = 0, nextId = 0;
  const pending = new Map();
  return {
    now: () => time,
    schedule(callback, delay) { const id = ++nextId; pending.set(id, { callback, at: time + delay }); return id; },
    cancel: id => pending.delete(id),
    count: () => pending.size,
    advance(delta) {
      const end = time + delta;
      while (true) {
        const next = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        pending.delete(next[0]); time = next[1].at; next[1].callback();
      }
      time = end;
    },
  };
}

test('downward drag looks up and upward drag looks down', () => {
  assert.equal(lookDelta(0,40).pitch,-.08);
  assert.equal(lookDelta(0,-40).pitch,.08);
});

test('horizontal scene movement follows the drag direction at the existing sensitivity', () => {
  assert.equal(lookDelta(100,0).yaw,-.24);
  assert.equal(lookDelta(-100,0).yaw,.24);
});

test('stationary input does not move either camera axis', () => {
  const delta=lookDelta(0,0);
  assert.ok(delta.yaw===0&&delta.pitch===0);
});

test('HUD hides at exactly ten seconds, never before the deadline', () => {
  const time = clock(), changes = [];
  const timer = new IdleTimer({ ...time, onChange: idle => changes.push(idle) });
  time.advance(HUD_IDLE_MS - 1);
  assert.deepEqual(changes, []);
  time.advance(1);
  assert.deepEqual(changes, [true]);
  timer.dispose();
});

test('new activity resets the deadline and immediately wakes an idle HUD', () => {
  const time = clock(), changes = [];
  const timer = new IdleTimer({ ...time, onChange: idle => changes.push(idle) });
  time.advance(7500); timer.activity();
  time.advance(9999); assert.deepEqual(changes, []);
  time.advance(1); assert.deepEqual(changes, [true]);
  timer.activity(); assert.deepEqual(changes, [true, false]);
  time.advance(9999); assert.equal(timer.idle, false);
  time.advance(1); assert.equal(timer.idle, true);
  timer.dispose();
});

test('dialogs, active gestures and keyboard-focused HUD controls can keep overlays visible', () => {
  const time = clock(), changes = [];
  let blocked = true;
  const timer = new IdleTimer({ ...time, onChange: idle => changes.push(idle), isBlocked: () => blocked });
  time.advance(30_000);
  assert.deepEqual(changes, []);
  blocked = false; timer.activity();
  time.advance(9999); assert.deepEqual(changes, []);
  time.advance(1); assert.deepEqual(changes, [true]);
  timer.dispose();
});

test('frequent movement retains one timer and disposal cancels pending work', () => {
  const time = clock(), changes = [];
  const timer = new IdleTimer({ ...time, onChange: idle => changes.push(idle) });
  for (let i = 0; i < 1000; i++) timer.activity();
  assert.equal(time.count(), 1);
  timer.dispose();
  time.advance(100_000);
  assert.equal(time.count(), 0); assert.deepEqual(changes, []);
  timer.activity();
  assert.equal(time.count(), 0);
});
