export const HUD_IDLE_MS = 10_000;

export class IdleTimer {
  constructor({ onChange, isBlocked = () => false, now = () => performance.now(), schedule = (callback, delay) => setTimeout(callback, delay), cancel = timer => clearTimeout(timer) }) {
    this.onChange = onChange;
    this.isBlocked = isBlocked;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.idle = false;
    this.disposed = false;
    this.timer = null;
    this.lastActivity = now();
    this.arm(HUD_IDLE_MS);
  }

  arm(delay) {
    this.timer = this.schedule(() => this.check(), delay);
  }

  activity() {
    if (this.disposed) return;
    this.lastActivity = this.now();
    if (this.idle) { this.idle = false; this.onChange(false); }
    if (this.timer === null) this.arm(HUD_IDLE_MS);
  }

  check() {
    this.timer = null;
    if (this.disposed) return;
    if (this.isBlocked()) {
      this.lastActivity = this.now();
      this.arm(HUD_IDLE_MS);
      return;
    }
    const remaining = HUD_IDLE_MS - (this.now() - this.lastActivity);
    if (remaining > 0) this.arm(remaining);
    else { this.idle = true; this.onChange(true); }
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }
}

export function installIdleHUD(root, isBlocked) {
  root.dataset.uiIdle = 'false';
  const timer = new IdleTimer({ onChange: idle => { root.dataset.uiIdle = String(idle); }, isBlocked });
  const wake = () => timer.activity();
  const events = ['pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'wheel', 'keydown', 'focusin'];
  const options = { capture: true, passive: true };
  events.forEach(type => window.addEventListener(type, wake, options));
  window.addEventListener('focus', wake);
  const visible = () => { if (!document.hidden) wake(); };
  document.addEventListener('visibilitychange', visible);
  return {
    activity: wake,
    dispose() {
      timer.dispose();
      events.forEach(type => window.removeEventListener(type, wake, options));
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', visible);
    },
  };
}
