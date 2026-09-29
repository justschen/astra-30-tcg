import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSizing } from '../src/render-quality.js';

test('Balanced bounds Retina render cost without changing resolution for interaction or rest', () => {
  for (const [width, height] of [[390, 844], [1440, 900], [1920, 1080], [2880, 1800]]) {
    const still = renderSizing('auto', width, height, 2), moving = renderSizing('auto', width, height, 2, true);
    assert.ok(still.width * still.height <= 1400000);
    assert.ok(still.cityWidth * still.cityHeight <= 1200000);
    assert.deepEqual(moving,still);
    assert.ok(still.cityWidth <= still.width && still.cityHeight <= still.height);
    assert.ok(Math.abs(still.width / still.height - width / height) < .003);
  }
});

test('Full detail preserves the original density and exact fractional buffer rounding', () => {
  for (const moving of [false, true]) {
    assert.deepEqual(renderSizing('detail', 1440, 830, 2, moving), {
      ratio: 1.65, width: 2376, height: 1369, cityWidth: 2376, cityHeight: 1369,
    });
  }
  const smooth = renderSizing('smooth', 1440, 900, 2), native = renderSizing('detail', 1440, 900, 2);
  assert.ok(smooth.width*smooth.height<=900000&&smooth.width<native.width&&smooth.cityWidth*smooth.cityHeight<=900000);
  assert.throws(() => renderSizing('unknown', 1440, 900, 1), RangeError);
  assert.throws(() => renderSizing('auto', 0, 900, 1), RangeError);
});
