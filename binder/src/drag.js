export function pointInQuad(point, corners) {
  let positive = false, negative = false;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross > .001) positive = true;
    if (cross < -.001) negative = true;
  }
  return !(positive && negative);
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

export function nearestPocket(point, pockets, tolerance = 10) {
  let closest = null, distance = tolerance;
  for (const pocket of pockets) {
    const { corners } = pocket;
    if (corners.length !== 4 || corners.some(p => p.z < -1 || p.z > 1)) continue;
    const area = Math.abs(corners.reduce((sum, a, i) => {
      const b = corners[(i + 1) % 4];
      return sum + a.x * b.y - a.y * b.x;
    }, 0)) / 2;
    if (area < 20) continue;
    if (pointInQuad(point, corners)) return pocket;
    const edge = Math.min(...corners.map((a, i) => segmentDistance(point, a, corners[(i + 1) % 4])));
    if (edge < distance) { closest = pocket; distance = edge; }
  }
  return closest;
}
