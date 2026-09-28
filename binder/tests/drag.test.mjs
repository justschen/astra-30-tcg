import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestPocket, pointInQuad } from '../src/drag.js';

const quad = (index, x = 0) => ({
  index,
  corners: [{ x: x + 8, y: 0, z: 0 }, { x: x + 92, y: 0, z: 0 }, { x: x + 100, y: 80, z: 0 }, { x, y: 80, z: 0 }],
});

test('perspective pocket selection respects its actual quadrilateral', () => {
  assert.equal(pointInQuad({ x: 50, y: 40 }, quad(9).corners), true);
  assert.equal(pointInQuad({ x: 1, y: 1 }, quad(9).corners), false);
  assert.equal(nearestPocket({ x: 50, y: 40 }, [quad(9)])?.index, 9);
});

test('small misses snap to the nearest pocket, not an unrelated row', () => {
  assert.equal(nearestPocket({ x: 104, y: 50 }, [quad(9), quad(10, 112)])?.index, 9);
  assert.equal(nearestPocket({ x: 112, y: 50 }, [quad(9), quad(10, 112)])?.index, 10);
  assert.equal(nearestPocket({ x: 50, y: 85 }, [quad(9)])?.index, 9);
  assert.equal(nearestPocket({ x: 50, y: 110 }, [quad(9)]), null);
});

test('off-camera and collapsed pockets cannot accept a card', () => {
  const behind = quad(9); behind.corners.forEach(p => { p.z = 2; });
  const collapsed = quad(10); collapsed.corners.forEach(p => { p.y = 1; });
  assert.equal(nearestPocket({ x: 50, y: 1 }, [behind, collapsed]), null);
});
