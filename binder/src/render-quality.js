export const GRAPHICS_KEY = 'afterhours.graphics.v1';
export const GRAPHICS_PRESETS = {
  auto: 'Balanced (recommended)',
  detail: 'Full detail',
  smooth: 'Smooth',
};
export function renderSizing(quality, width, height, deviceRatio) {
  if (!Object.hasOwn(GRAPHICS_PRESETS, quality)) throw new RangeError('Unknown graphics setting.');
  if (![width, height, deviceRatio].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Invalid render dimensions.');
  const native = Math.min(deviceRatio, 1.65), area = width * height;
  const budget = quality === 'detail' ? Infinity : quality === 'smooth' ? 900000 : 1400000;
  const ratio = Math.min(native, Math.sqrt(budget / area));
  const cityBudget = quality === 'detail' ? Infinity : quality === 'smooth' ? 900000 : 1200000;
  const cityRatio = Math.min(ratio, Math.sqrt(cityBudget / area));
  return {
    ratio,
    width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)),
    cityWidth: Math.max(1, Math.floor(width * cityRatio)), cityHeight: Math.max(1, Math.floor(height * cityRatio)),
  };
}
