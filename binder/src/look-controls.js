export function lookDelta(dx, dy) {
  return { yaw: -dx * .0024, pitch: -dy * .002 };
}
