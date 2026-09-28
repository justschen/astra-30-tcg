export class NearestItems {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Nearest-item capacity must be a positive integer.');
    this.limit = limit; this.items = []; this.distances = new Float64Array(limit);
  }

  reset() { this.items.length = 0; }

  offer(item, distanceSquared) {
    const count = this.items.length;
    if (count === this.limit && distanceSquared >= this.distances[count - 1]) return;
    let index = Math.min(count, this.limit - 1);
    while (index > 0 && distanceSquared < this.distances[index - 1]) {
      this.items[index] = this.items[index - 1]; this.distances[index] = this.distances[index - 1]; index--;
    }
    this.items[index] = item; this.distances[index] = distanceSquared;
  }
}
