// ============================================================
// The road's input: keyboard and mouse (pointer lock when the page
// allows it, drag-to-look when it doesn't) and the Xbox controller
// through the standard Gamepad mapping, laid out like the yard's.
// Everything ends up as a small set of intentions the game reads each
// frame: a move vector, a throttle, a brake, a steer, a look delta.
//
// The settings (look sensitivity, invert, rumble, graphics quality,
// brightness, field of view, head-bob) are the yard's own, kept under
// the same key, so they carry from page to page.
// ============================================================
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const input = {
  mode: 'kbm',
  move: { x: 0, y: 0 }, throttle: 0, brake: 0, steer: 0, lookX: 0, lookY: 0, sprint: false, sprintLatch: false,
  keys: new Set(), locked: false, lockFailed: false, pad: null, padPrev: [], padRepeat: {}, padSeen: false, padBlocked: false, stickPrev: {},
  ptr: { lookId: null, lx: 0, ly: 0 },
  settings: { sens: 1, invert: false, rumble: true, quality: '', bright: 1, fov: 86, bob: true },
  h: null,
};
try { Object.assign(input.settings, JSON.parse(localStorage.getItem('farm-of-rust-settings') || '{}')); } catch (e) { /* storage unavailable */ }
export function saveSettings() { try { localStorage.setItem('farm-of-rust-settings', JSON.stringify(input.settings)); } catch (e) { /* storage unavailable */ } }

function setMode(m) {
  if (input.mode === m) return;
  input.mode = m;
  document.body.classList.toggle('pad', m === 'pad');
  input.h && input.h.onMode && input.h.onMode(m);
}
export function requestLock(canvas) {
  if (input.mode !== 'kbm' || input.lockFailed || document.pointerLockElement) return;
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { input.lockFailed = true; }); } catch (e) { input.lockFailed = true; }
}
export function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* nothing to release */ } }

export function rumble(weak = 0.3, strong = 0.3, ms = 120) {
  if (!input.settings.rumble || input.mode !== 'pad' || !input.pad) return;
  try {
    const a = input.pad.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: clamp(weak, 0, 1), strongMagnitude: clamp(strong, 0, 1) }).catch(() => {});
    else if (input.pad.hapticActuators && input.pad.hapticActuators[0]) input.pad.hapticActuators[0].pulse(Math.max(weak, strong), ms);
  } catch (e) { /* no rumble on this pad */ }
}

// find the next focusable control in a direction, for menus driven by the D-pad or arrow keys
export function navFocus(root, dir) {
  const els = [...root.querySelectorAll('button:not([disabled]), input, select, [data-nav]')].filter(e => e.offsetParent !== null && !e.closest('[hidden]'));
  if (!els.length) return;
  const cur = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
  if (!cur) { els[0].focus({ preventScroll: false }); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bestS = 1e9;
  for (const e of els) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const s = along + across * 2.2;
    if (s < bestS) { bestS = s; best = e; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView({ block: 'nearest' }); }
}

// h: what the game is doing (started, paused, menuOpen, jotOpen, screenOpen, driving) and what to call (on*)
export function bindInput(h) {
  input.h = h;
  const { canvas } = h;
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; document.body.classList.toggle('locked', input.locked); });
  document.addEventListener('pointerlockerror', () => { input.lockFailed = true; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // the wheel pulls the chase camera in and out
  canvas.addEventListener('wheel', (e) => { if (!h.onZoom || !h.started() || h.paused()) return; e.preventDefault(); h.onZoom(Math.sign(e.deltaY)); }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    h.onAnyInput(); setMode('kbm');
    if (!h.started() || h.paused()) return;
    e.preventDefault();
    if (input.locked) { if (e.button === 0) h.onPrimary(); else if (e.button === 2) h.onUse(); return; }
    if (e.button === 2) { h.onUse(); return; }
    requestLock(canvas);
    Object.assign(input.ptr, { lookId: e.pointerId, lx: e.clientX, ly: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!h.started() || h.paused()) return;
    const P = input.ptr, inv = input.settings.invert ? -1 : 1;
    if (input.locked) { const s = 0.0022 * input.settings.sens; input.lookX -= e.movementX * s; input.lookY -= e.movementY * s * inv; return; }
    if (e.pointerId === P.lookId) {
      const s = 0.004 * input.settings.sens; input.lookX -= (e.clientX - P.lx) * s; input.lookY -= (e.clientY - P.ly) * s * inv;
      P.lx = e.clientX; P.ly = e.clientY;
    }
  });
  const end = (e) => { if (e.pointerId === input.ptr.lookId) input.ptr.lookId = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  addEventListener('keydown', (e) => {
    const k = e.code;
    if (h.jotOpen()) { if (e.key === 'Escape') { e.preventDefault(); h.onJotClose(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); h.onJotSave(); } return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !(h.menuOpen() && e.target.closest && e.target.closest('input, select'))) e.preventDefault();
    h.onAnyInput();
    if (!h.started()) { if (k === 'Enter' && !(e.target.closest && e.target.closest('button'))) h.onStart(); return; }
    if (k === 'Escape' || k === 'Tab' || k === 'KeyP') { if (h.menuOpen()) h.onBack(); else if (!h.screenOpen()) h.onMenu(); return; }
    if (h.menuOpen() || h.screenOpen()) {
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k];
      if (dir) { const a = document.activeElement; if (!(a && a.type === 'range' && (dir === 'left' || dir === 'right'))) h.onMenuNav(dir); }
      if (h.menuOpen() && (k === 'KeyQ' || k === 'BracketLeft')) h.onTab(-1);
      if (h.menuOpen() && (k === 'KeyE' || k === 'BracketRight')) h.onTab(1);
      return;
    }
    if (h.paused()) return;
    setMode('kbm');
    input.keys.add(k);
    if (e.repeat) return;
    if (k === 'KeyE' || k === 'Enter') h.onUse();
    else if (k === 'KeyF') h.onDrink();
    else if (k === 'KeyG') h.onSulphur();
    else if (k === 'KeyC') h.onCompass();
    else if (k === 'KeyV') h.onView();
    else if (k === 'KeyR') h.onRadio();
    else if (k === 'KeyQ') h.onPrimary();
    else if (k === 'KeyN') h.onJot();
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  addEventListener('gamepadconnected', (e) => { input.padSeen = true; h.onPadConnect && h.onPadConnect(e.gamepad); });
  addEventListener('gamepaddisconnected', () => { input.pad = null; h.onPadDisconnect && h.onPadDisconnect(); });
}

// one frame of input: keys into a move vector and pedals, the controller polled and its buttons fired
export function pollInput(dt) {
  const h = input.h, K = input.keys, has = (...c) => c.some(k => K.has(k));
  let mx = 0, my = 0, throttle = 0, brake = 0, steer = 0;
  if (has('KeyW', 'ArrowUp')) { my += 1; throttle = 1; }
  if (has('KeyS', 'ArrowDown')) { my -= 1; brake = 1; }
  if (has('KeyA', 'ArrowLeft')) { mx -= 1; steer += 1; }
  if (has('KeyD', 'ArrowRight')) { mx += 1; steer -= 1; }
  let sprint = has('ShiftLeft', 'ShiftRight');
  let pads = null;
  try { pads = navigator.getGamepads ? navigator.getGamepads() : null; input.padBlocked = false; } catch (e) { pads = null; input.padBlocked = true; }
  let pad = null;
  if (pads) for (const p of pads) if (p && p.connected && (p.mapping === 'standard' || p.buttons.length >= 16)) { pad = p; break; }
  input.pad = pad;
  if (pad) {
    const dz = (x, y, d = 0.15) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = Math.min(1, (m - d) / (1 - d)) / m; return [x * k, y * k]; };
    const [lx, ly] = dz(pad.axes[0] || 0, pad.axes[1] || 0), [rx, ry] = dz(pad.axes[2] || 0, pad.axes[3] || 0, 0.12);
    const val = (i) => pad.buttons[i] ? pad.buttons[i].value || (pad.buttons[i].pressed ? 1 : 0) : 0;
    const b = (i) => val(i) > 0.5;
    const prev = input.padPrev, edge = (i) => b(i) && !prev[i];
    if (lx || ly || rx || ry || pad.buttons.some(x => x && x.pressed)) { setMode('pad'); h.onAnyInput(); }
    if (input.mode === 'pad') {
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6), look = 3.0 * input.settings.sens;
      input.lookX -= curve(rx) * look * dt; input.lookY -= curve(ry) * look * 0.75 * dt * (input.settings.invert ? -1 : 1);
      const rep = (i) => {
        if (!b(i)) { input.padRepeat[i] = 0; return false; }
        if (!prev[i]) { input.padRepeat[i] = 0.42; return true; }
        input.padRepeat[i] -= dt; if (input.padRepeat[i] <= 0) { input.padRepeat[i] = 0.11; return true; }
        return false;
      };
      const stick = { up: ly < -0.6, down: ly > 0.6, left: lx < -0.6, right: lx > 0.6 };
      const nav = (d, btn) => rep(btn) || (stick[d] && !input.stickPrev[d]);
      const DIRS = [['up', PAD.UP], ['down', PAD.DOWN], ['left', PAD.LEFT], ['right', PAD.RIGHT]];
      if (h.jotOpen()) { if (edge(PAD.B)) h.onJotClose(); }
      else if (h.menuOpen()) {
        for (const [d, btn] of DIRS) if (nav(d, btn)) h.onMenuNav(d);
        if (edge(PAD.A)) h.onMenuSelect();
        if (edge(PAD.B) || edge(PAD.MENU) || edge(PAD.VIEW)) h.onBack();
        if (edge(PAD.LB)) h.onTab(-1); if (edge(PAD.RB)) h.onTab(1);
        input.lookX = input.lookY = 0;
      } else if (h.screenOpen()) {
        for (const [d, btn] of DIRS) if (nav(d, btn)) h.onMenuNav(d);
        if (edge(PAD.A) || edge(PAD.MENU)) h.onMenuSelect();
        input.lookX = input.lookY = 0;
      } else if (!h.paused()) {
        mx += lx; my -= ly;
        if (h.driving()) {
          // triggers are the pedals; the left stick steers, and pushed forward or back it's a pedal too
          throttle = Math.max(throttle, val(PAD.RT), Math.max(0, -ly)); brake = Math.max(brake, val(PAD.LT), Math.max(0, ly));
          steer += -lx;
          if (edge(PAD.A)) h.onUse();
          if (edge(PAD.X)) h.onDrink();
          if (edge(PAD.Y)) h.onView();
          if (edge(PAD.B)) h.onRadio();
          if (edge(PAD.LB)) h.onSulphur();
          if (edge(PAD.RB)) h.onCompass();
        } else {
          if (edge(PAD.L3)) input.sprintLatch = !input.sprintLatch;
          if (Math.hypot(lx, ly) < 0.2) input.sprintLatch = false;
          sprint = sprint || input.sprintLatch || b(PAD.LT);
          if (edge(PAD.A)) h.onUse();
          if (edge(PAD.X)) h.onDrink();
          if (edge(PAD.RT) || edge(PAD.RB)) h.onPrimary();
          if (edge(PAD.LB)) h.onCompass();
        }
        if (edge(PAD.MENU)) h.onMenu();
        if (edge(PAD.VIEW)) h.onMenu('finds');
      }
      input.stickPrev = stick;
    }
    input.padPrev = pad.buttons.map(x => !!x && (x.pressed || x.value > 0.5));
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  input.move.x = mx; input.move.y = my; input.sprint = sprint;
  input.throttle = clamp(throttle, 0, 1); input.brake = clamp(brake, 0, 1); input.steer = clamp(steer, -1, 1);
}
export function takeLook() { const x = input.lookX, y = input.lookY; input.lookX = input.lookY = 0; return [x, y]; }
