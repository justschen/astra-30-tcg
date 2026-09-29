export function dialogViewport(layoutHeight, visualHeight, offsetTop, scale, editing, wasKeyboardOpen = false) {
  if (![layoutHeight, visualHeight, offsetTop, scale].every(Number.isFinite) || layoutHeight <= 0 || visualHeight <= 0 || scale <= 0) {
    throw new RangeError('Invalid visual viewport dimensions.');
  }
  if (Math.abs(scale - 1) > .001) return null;
  const height=Math.min(layoutHeight,visualHeight);
  return { height: Math.floor(height), top: Math.max(0, offsetTop), keyboard: Boolean((editing || wasKeyboardOpen) && layoutHeight - height > 100) };
}

export function installMobileViewport(win = window, doc = document) {
  const root = doc.documentElement, viewport = win.visualViewport;
  let frame = 0, previous = '', keyboardOpen = false;
  const update = () => {
    frame = 0;
    const height = viewport?.height || win.innerHeight;
    const active = doc.activeElement;
    const editing = active?.matches('input[type="search"],input[type="text"],input[type="email"],input[type="url"],input[type="tel"],input[type="password"],input[type="number"],textarea,[contenteditable="true"]');
    const next = dialogViewport(win.innerHeight, height, viewport?.offsetTop || 0, viewport?.scale || 1, editing, keyboardOpen);
    if (!next) return;
    keyboardOpen = next.keyboard;
    const key = `${next.height}/${next.top}/${next.keyboard}`;
    if (key === previous) return;
    previous = key;
    root.style.setProperty('--dialog-viewport-height', `${next.height}px`);
    root.style.setProperty('--dialog-viewport-top', `${next.top}px`);
    root.dataset.keyboardOpen = String(next.keyboard);
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  viewport?.addEventListener('resize', schedule, { passive: true });
  viewport?.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
  doc.addEventListener('focusin', schedule); doc.addEventListener('focusout', schedule);
  update();
  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule); doc.removeEventListener('focusin', schedule); doc.removeEventListener('focusout', schedule);
  };
}
