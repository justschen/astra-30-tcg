export class RefreshBudget {
  constructor(interval = 250) {
    this.interval = interval; this.pending = true; this.last = -Infinity;
  }
  request() { this.pending = true; }
  due(now) { return this.pending && now - this.last >= this.interval; }
  complete(now) { this.pending = false; this.last = now; }
}
