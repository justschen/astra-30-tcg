export const TIME_PRESETS = [
  { id: 'dawn', label: 'Dawn', hour: 6.25 },
  { id: 'day', label: 'Day', hour: 12 },
  { id: 'dusk', label: 'Dusk', hour: 17.75 },
  { id: 'after-dark', label: 'After dark', hour: 22 },
];
export const DEFAULT_CITY_HOUR = 22;

const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

export function solarState(hour) {
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) throw new RangeError('Time of day must be between 0 and 24 hours.');
  const time = hour === 24 ? 0 : hour;
  const elevation = Math.sin((time - 6) * Math.PI / 12) * 1.1;
  const azimuth = (time - 12) * Math.PI / 12 - 2.05;
  const sun = [-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)];
  const daylight = smoothstep(-.18, .25, sun[1]);
  const sunset = Math.exp(-(((sun[1] - .025) / .2) ** 2));
  return { hour: time, sun, daylight, night: 1 - daylight, sunset };
}

export function formatCityTime(hour) {
  const { hour: normalized } = solarState(hour);
  const minutes = Math.round(normalized * 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
