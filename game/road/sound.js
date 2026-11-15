// ============================================================
// The road's sound. Everything is synthesised, as in the yard: a wind
// that gusts, the tractor's two cylinders popping, wires humming, tin
// creaking, a windmill that wants oil, water hissing out of a burst
// main, and footsteps that know what they're landing on. While Jacob
// thinks out loud the world drops and dulls, as it does in the yard.
// ============================================================
import { G, S, W, clamp } from './core.js';
import { voice, stopVoice } from '../shared/voice.js';

export const audio = { ctx: null, muted: false, T: { tin: 4, mill: 1, thump: 0.9, drip: 1, tick: 6, flap: 3 } };
try { audio.muted = localStorage.getItem('valtoria-road-muted') === '1'; } catch (e) { /* storage unavailable */ }

export function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ac = audio.ctx = new AC();
  audio.master = ac.createGain(); audio.master.gain.value = audio.muted ? 0 : 0.9;
  audio.duck = ac.createGain(); audio.lp = ac.createBiquadFilter(); audio.lp.type = 'lowpass'; audio.lp.frequency.value = 20000; audio.lp.Q.value = 0.5;
  audio.master.connect(audio.duck); audio.duck.connect(audio.lp); audio.lp.connect(ac.destination);
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  audio.noise = buf;
  const bed = ac.createBufferSource(); bed.buffer = buf; bed.loop = true; bed.start();
  const band = (type, f, q, g0 = 0) => { const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = g0; bed.connect(fl); fl.connect(g); g.connect(audio.master); return { f: fl, g }; };
  audio.wind = band('bandpass', 600, 0.5);            // the body of the wind
  audio.whistle = band('bandpass', 2400, 6);          // what it does round wire and tin when it gusts
  audio.rattle = band('bandpass', 1700, 1.2);         // the tractor's panels at speed
  audio.spray = band('highpass', 2600, 0.7);          // a burst main
  // the engine: two cylinders, so it pops rather than hums
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
  const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 380;
  const eg = ac.createGain(); eg.gain.value = 0;
  const pop = ac.createOscillator(); pop.type = 'sine'; pop.frequency.value = 5;
  const popG = ac.createGain(); popG.gain.value = 0; pop.connect(popG); popG.connect(eg.gain);
  o1.connect(ef); o2.connect(ef); ef.connect(eg); eg.connect(audio.master); o1.start(); o2.start(); pop.start();
  audio.engine = { g: eg, o1, o2, pop, popG, f: ef };
  // gossip-flies: two detuned saws with a flutter on them
  const b1 = ac.createOscillator(), b2 = ac.createOscillator(); b1.type = b2.type = 'sawtooth'; b1.frequency.value = 196; b2.frequency.value = 213;
  const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 950; bf.Q.value = 1.1;
  const trem = ac.createGain(); trem.gain.value = 0.6;
  const lfo = ac.createOscillator(); lfo.frequency.value = 26; const lfoG = ac.createGain(); lfoG.gain.value = 0.35; lfo.connect(lfoG); lfoG.connect(trem.gain);
  const bg = ac.createGain(); bg.gain.value = 0;
  b1.connect(bf); b2.connect(bf); bf.connect(trem); trem.connect(bg); bg.connect(audio.master); b1.start(); b2.start(); lfo.start();
  audio.buzz = { g: bg, o1: b1, o2: b2 };
  // the wires: a hum with a beat in it
  const h1 = ac.createOscillator(), h2 = ac.createOscillator(), h3 = ac.createOscillator(); h1.frequency.value = 100; h2.frequency.value = 151; h3.frequency.value = 202.5;
  const hg = ac.createGain(); hg.gain.value = 0; for (const o of [h1, h2, h3]) { o.connect(hg); o.start(); } hg.connect(audio.master);
  audio.hum = hg;
}
function out(pan) {
  if (!pan || !audio.ctx.createStereoPanner) return audio.master;
  const p = audio.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(audio.master); return p;
}
export function noiseHit({ dur = 0.1, type = 'bandpass', f = 2000, f2 = null, q = 1, gain = 0.3, attack = 0.003, delay = 0, pan = 0 } = {}) {
  if (!audio.ctx || gain <= 0.0002) return;
  const ac = audio.ctx, t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = audio.noise;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out(pan));
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
export function tone({ type = 'sine', f = 440, f2 = null, dur = 0.2, gain = 0.1, attack = 0.005, delay = 0, lp = null, pan = 0, vib = 0 } = {}) {
  if (!audio.ctx || gain <= 0.0002) return;
  const ac = audio.ctx, t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 7; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
  node.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
}
// where is a sound, relative to Jacob's ears? Loudness falls off with distance; pan follows the camera.
export function spot(x, z, range = 12) {
  const cam = G.camera; if (!cam) return { gain: 1, pan: 0 };
  const dx = x - cam.position.x, dz = z - cam.position.z, d = Math.hypot(dx, dz), e = cam.matrixWorld.elements;
  return { gain: 1 / (1 + (d / range) ** 2 * 4), pan: d > 0.3 ? clamp((dx * e[0] + dz * e[2]) / d, -1, 1) * 0.8 : 0 };
}
const HERE = { gain: 1, pan: 0 };

export const sfx = {
  // a footfall, by what it lands on
  step(surface = 'dirt', run = 0) {
    const g = 1 + run * 0.5;
    if (surface === 'seal') { noiseHit({ type: 'bandpass', f: 1900, q: 1.4, dur: 0.05, gain: 0.07 * g }); noiseHit({ type: 'lowpass', f: 320, dur: 0.05, gain: 0.1 * g }); }
    else if (surface === 'salt') { for (let i = 0; i < 3; i++) noiseHit({ type: 'highpass', f: 3200 + Math.random() * 1500, dur: 0.035, gain: 0.06 * g, delay: i * 0.022 }); noiseHit({ type: 'lowpass', f: 300, dur: 0.06, gain: 0.08 * g }); }
    else if (surface === 'boards') { noiseHit({ type: 'lowpass', f: 380, dur: 0.07, gain: 0.15 * g }); if (Math.random() < 0.3) tone({ type: 'sawtooth', f: 150 + Math.random() * 90, f2: 210 + Math.random() * 80, dur: 0.25, gain: 0.014, lp: 900 }); }
    else if (surface === 'rock') { noiseHit({ type: 'bandpass', f: 1400, q: 1.2, dur: 0.06, gain: 0.09 * g }); noiseHit({ type: 'bandpass', f: 900, q: 2, dur: 0.22, gain: 0.02 * g, delay: 0.09 }); }      // and its echo
    else if (surface === 'scree') { for (let i = 0; i < 2; i++) noiseHit({ type: 'bandpass', f: 1500 + Math.random() * 900, q: 1.5, dur: 0.06, gain: 0.08 * g, delay: i * 0.04 }); }
    else { noiseHit({ type: 'bandpass', f: 1100, q: 0.8, dur: 0.09, gain: 0.1 * g }); noiseHit({ type: 'lowpass', f: 260, dur: 0.06, gain: 0.1 * g }); }
  },
  click: (s = HERE) => { for (let i = 0; i < 4; i++) noiseHit({ f: 3800, q: 8, dur: 0.03, gain: 0.25 * s.gain, delay: i * 0.11, pan: s.pan }); },
  creak: (s = HERE) => tone({ type: 'sawtooth', f: 110, f2: 160, dur: 1.2, gain: 0.05 * s.gain, lp: 900, vib: 6, pan: s.pan }),
  crash: () => { noiseHit({ type: 'lowpass', f: 300, dur: 0.5, gain: 0.6 }); tone({ f: 70, f2: 35, dur: 0.6, gain: 0.4 }); },
  snarl: () => { tone({ type: 'sawtooth', f: 140, f2: 80, dur: 0.6, gain: 0.08, lp: 700 }); noiseHit({ f: 700, dur: 0.5, gain: 0.15 }); },
  hiss: (s = HERE) => noiseHit({ type: 'highpass', f: 3000, dur: 0.6, gain: 0.12 * s.gain, attack: 0.1, pan: s.pan }),
  cut: () => { noiseHit({ type: 'highpass', f: 5000, dur: 0.12, gain: 0.2 }); tone({ f: 3100, dur: 0.25, gain: 0.02 }); },
  schwick: () => { noiseHit({ type: 'highpass', f: 4200, dur: 0.18, gain: 0.3 }); tone({ type: 'triangle', f: 2600, f2: 1900, dur: 0.5, gain: 0.05 }); },   // like a sword striking metal
  sizzle: () => { noiseHit({ type: 'highpass', f: 3500, dur: 2.2, gain: 0.16, attack: 0.1 }); tone({ type: 'sawtooth', f: 60, f2: 110, dur: 2.0, gain: 0.08, lp: 400 }); },
  gulp: () => { for (const d of [0, 0.32]) tone({ f: 220, f2: 105, dur: 0.17, gain: 0.25, delay: d }); },
  fill: () => { noiseHit({ type: 'bandpass', f: 500, f2: 1600, q: 0.8, dur: 1.5, gain: 0.14, attack: 0.1 }); tone({ type: 'square', f: 300, f2: 700, dur: 1.5, gain: 0.006, lp: 1200 }); },
  find: () => { for (const [f, d] of [[660, 0], [990, 0.1], [1320, 0.2]]) tone({ f, dur: 1.4, gain: 0.04, attack: 0.01, delay: d }); },
  thump: (g = 0.3) => { tone({ f: 60, f2: 38, dur: 0.3, gain: g }); noiseHit({ type: 'lowpass', f: 200, dur: 0.15, gain: g * 0.6 }); },
  door: (s = HERE) => { tone({ type: 'sawtooth', f: 180, f2: 260, dur: 0.5, gain: 0.03 * s.gain, lp: 900, pan: s.pan }); noiseHit({ type: 'lowpass', f: 500, dur: 0.12, gain: 0.2 * s.gain, delay: 0.45, pan: s.pan }); },
  radio: () => { noiseHit({ f: 2400, q: 0.6, dur: 1.4, gain: 0.08, attack: 0.05 }); tone({ type: 'square', f: 880, dur: 0.06, gain: 0.02 }); },
  drip: (s = HERE) => tone({ f: 1500 + Math.random() * 500, f2: 800, dur: 0.12, gain: 0.03 * s.gain, pan: s.pan }),
  zap: (v = 1) => { for (let i = 0; i < 5; i++) noiseHit({ type: 'highpass', f: 2500 + Math.random() * 3000, q: 2, dur: 0.04 + Math.random() * 0.05, gain: 0.22 * v, delay: i * 0.035 * Math.random() * 3 }); tone({ type: 'square', f: 100, dur: 0.18, gain: 0.03 * v }); },   // a live wire arcing
  scream: (v = 1) => { tone({ type: 'sawtooth', f: 1500, f2: 640, dur: 0.75, gain: 0.05 * v, vib: 40 }); tone({ type: 'square', f: 2100, f2: 1150, dur: 0.55, gain: 0.018 * v, delay: 0.06 }); noiseHit({ type: 'highpass', f: 3200, dur: 0.5, gain: 0.1 * v }); },   // a Scream-Pea pod splitting open
  // new on this pass: things you can knock, kick, throw, open and work
  clang: (big = 1, s = HERE) => { for (const [f, g] of [[420, 0.14], [1130, 0.09], [1970, 0.06], [2730, 0.04]]) tone({ f: f * (0.9 + Math.random() * 0.2), dur: 0.9 * big, gain: g * big * s.gain, attack: 0.002, pan: s.pan }); noiseHit({ type: 'highpass', f: 2500, dur: 0.06, gain: 0.3 * s.gain, pan: s.pan }); },
  tink: (s = HERE) => { for (const f of [2300, 3400, 5100]) tone({ f: f * (0.92 + Math.random() * 0.16), dur: 0.22, gain: 0.03 * s.gain, attack: 0.002, pan: s.pan }); noiseHit({ type: 'highpass', f: 4000, dur: 0.03, gain: 0.12 * s.gain, pan: s.pan }); },       // a tin can
  clink: (s = HERE) => { for (const f of [3100, 4700, 6300]) tone({ f: f * (0.95 + Math.random() * 0.1), dur: 0.4, gain: 0.02 * s.gain, attack: 0.002, pan: s.pan }); },      // glass
  thud: (s = HERE) => { tone({ f: 90, f2: 48, dur: 0.22, gain: 0.25 * s.gain, pan: s.pan }); noiseHit({ type: 'lowpass', f: 400, dur: 0.1, gain: 0.2 * s.gain, pan: s.pan }); },
  clack: (s = HERE) => { noiseHit({ f: 2400, q: 3, dur: 0.04, gain: 0.35 * s.gain, pan: s.pan }); tone({ type: 'triangle', f: 1500, dur: 0.05, gain: 0.05 * s.gain, pan: s.pan }); },      // stone on stone
  knock: (s = HERE) => { tone({ type: 'triangle', f: 170, f2: 120, dur: 0.14, gain: 0.2 * s.gain, pan: s.pan }); noiseHit({ type: 'lowpass', f: 700, dur: 0.05, gain: 0.2 * s.gain, pan: s.pan }); },      // stone on timber
  splash: (s = HERE) => { noiseHit({ type: 'lowpass', f: 5500, f2: 500, dur: 0.6, gain: 0.3 * s.gain, attack: 0.01, pan: s.pan }); noiseHit({ f: 1600, dur: 0.25, gain: 0.1 * s.gain, delay: 0.25, pan: s.pan }); },
  whoosh: () => noiseHit({ type: 'bandpass', f: 700, f2: 2600, q: 1.4, dur: 0.16, gain: 0.14, attack: 0.04 }),
  latch: (s = HERE) => { noiseHit({ f: 2600, q: 3, dur: 0.035, gain: 0.4 * s.gain, pan: s.pan }); tone({ type: 'triangle', f: 1900, dur: 0.06, gain: 0.06 * s.gain, pan: s.pan }); },
  hinge: (s = HERE) => tone({ type: 'sawtooth', f: 520 + Math.random() * 200, f2: 860 + Math.random() * 200, dur: 0.8, gain: 0.025 * s.gain, attack: 0.05, lp: 2600, vib: 40, pan: s.pan }),
  pump: (s = HERE) => { tone({ type: 'sawtooth', f: 300, f2: 420, dur: 0.35, gain: 0.03 * s.gain, lp: 1500, vib: 20, pan: s.pan }); noiseHit({ type: 'lowpass', f: 500, dur: 0.1, gain: 0.2 * s.gain, delay: 0.35, pan: s.pan }); },
  gush: (s = HERE) => noiseHit({ type: 'bandpass', f: 900, f2: 1500, q: 0.7, dur: 0.9, gain: 0.16 * s.gain, attack: 0.1, pan: s.pan }),
  paper: () => { for (let i = 0; i < 3; i++) noiseHit({ type: 'highpass', f: 2200, dur: 0.07, gain: 0.06, delay: i * 0.05 }); },
  squeak: (s = HERE) => tone({ type: 'sawtooth', f: 700, f2: 1000, dur: 0.3, gain: 0.012 * s.gain, attack: 0.04, lp: 3000, vib: 30, pan: s.pan }),
  tin: (s = HERE) => { tone({ type: 'sawtooth', f: 240, f2: 300, dur: 0.6, gain: 0.01 * s.gain, lp: 1200, vib: 10, pan: s.pan }); if (Math.random() < 0.5) noiseHit({ type: 'bandpass', f: 2000, q: 2, dur: 0.12, gain: 0.05 * s.gain, delay: 0.3, pan: s.pan }); },
  flap: (s = HERE) => { for (let i = 0; i < 2; i++) noiseHit({ f: 700, q: 0.8, dur: 0.12, gain: 0.05 * s.gain, attack: 0.03, delay: i * 0.14, pan: s.pan }); },
  static: () => { noiseHit({ f: 2400, q: 0.6, dur: 2.6, gain: 0.06, attack: 0.2 }); tone({ type: 'sine', f: 1180, f2: 640, dur: 1.2, gain: 0.012, delay: 0.5, vib: 80 }); },
  ring: () => { for (let i = 0; i < 2; i++) for (const f of [1340, 1680]) tone({ type: 'triangle', f, dur: 0.4, gain: 0.02, delay: i * 0.6, vib: 18 }); },
  scan: () => { tone({ type: 'square', f: 1400, f2: 2100, dur: 0.5, gain: 0.02, lp: 4000 }); noiseHit({ type: 'highpass', f: 6000, dur: 0.4, gain: 0.04, attack: 0.1 }); },
  bite: () => { noiseHit({ f: 1800, q: 2, dur: 0.05, gain: 0.4 }); tone({ f: 70, f2: 40, dur: 0.2, gain: 0.2 }); },
};

// while Jacob thinks out loud the world goes quiet and dull, as if heard through his own head
voice.duck = (on) => {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  audio.duck.gain.setTargetAtTime(on ? 0.4 : 1, t, on ? 0.08 : 0.35);
  audio.lp.frequency.setTargetAtTime(on ? 1150 : 20000, t, on ? 0.08 : 0.45);
};
export function setMuted(m) {
  audio.muted = m;
  if (m) stopVoice();
  if (audio.master) audio.master.gain.setTargetAtTime(m ? 0 : 0.9, audio.ctx.currentTime, 0.05);
  try { localStorage.setItem('valtoria-road-muted', m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}

// every frame: the beds follow what's happening; the one-shots come round on their own clocks
// st: { started, paused, driving, speed, throttle, stall, redline, cave, offroad, gust, flies, swarm, x, z }
export function updateAudio(dt, st) {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime, T = audio.T, quiet = !st.started || st.paused;
  const set = (p, v, tc = 0.2) => p.setTargetAtTime(v, now, tc);
  // the wind: lower and steadier in a cave or between canyon walls, a whistle on top when it gusts
  const gust = st.gust || 0, shelter = st.cave ? 0.2 : st.canyon ? 0.6 : 1;
  set(audio.wind.g.gain, quiet ? 0.02 : (0.03 + 0.06 * gust) * shelter + (st.driving ? Math.min(0.03, st.speed * 0.004) : 0), 0.4);
  set(audio.wind.f.frequency, 420 + 380 * gust, 0.5);
  set(audio.whistle.g.gain, quiet || st.cave ? 0 : Math.max(0, gust - 0.55) * 0.05 * (st.wires || 0.25), 0.3);
  set(audio.whistle.f.frequency, 1900 + 900 * gust, 0.4);
  // the engine
  const E = audio.engine, sp = st.driving ? st.speed : 0, red = st.redline ? 1 : 0, run = st.started && st.stall <= 0 && !st.cave;
  const eg = !run ? 0 : st.driving ? 0.045 + sp * 0.005 + st.throttle * 0.012 + red * 0.03 : 0.022 * (1 / (1 + (st.tractorDist || 0) * (st.tractorDist || 0) / 90));
  set(E.g.gain, quiet ? eg * 0.5 : eg, 0.08); set(E.popG.gain, eg * 0.55, 0.08);
  set(E.o1.frequency, 38 + sp * 7 + red * 40, 0.1); set(E.o2.frequency, 19 + sp * 3.5 + red * 20, 0.1);
  set(E.pop.frequency, 5.5 + sp * 1.7 + st.throttle * 1.5 + red * 8, 0.15); set(E.f.frequency, 340 + sp * 40 + red * 300, 0.2);
  set(audio.rattle.g.gain, quiet || !st.driving ? 0 : Math.min(0.05, sp * sp * 0.0006 * (st.offroad ? 2.2 : 1)), 0.1);
  // flies, wires, a burst main
  set(audio.buzz.g.gain, quiet ? 0 : st.flies ? 0.015 : (st.swarm || 0) * 0.03, 0.15);
  set(audio.buzz.o1.frequency, 196 + Math.sin(now * 3.1) * 8, 0.05); set(audio.buzz.o2.frequency, 213 + Math.sin(now * 2.3 + 1) * 9, 0.05);
  set(audio.hum.gain, quiet || st.cave ? 0 : (st.wires || 0) * (0.004 + 0.008 * gust) + (st.live || 0) * 0.02, 0.3);
  set(audio.spray.g.gain, quiet || st.cave ? 0 : (st.spray || 0) * 0.07, 0.2);
  if (quiet) return;
  // one-shots on their own clocks
  if (!st.cave) {
    if (W.tins && (T.tin -= dt * (0.4 + gust)) < 0) { T.tin = 3 + Math.random() * 6; let best = null, bd = 40; for (const t of W.tins) { const d = Math.hypot(t.x - st.x, t.z - st.z); if (d < bd) { bd = d; best = t; } } if (best) sfx.tin(spot(best.x, best.z, 9)); }
    if (W.mills) for (const m of W.mills) { if (m.braked) continue; m.sq = (m.sq || 0) - dt * (m.spin || 0.5); if (m.sq < 0) { m.sq = 2.1; const s = spot(m.x, m.z, 14); if (s.gain > 0.03) sfx.squeak(s); } }
    if (W.flags && (T.flap -= dt * (0.3 + gust * 1.5)) < 0) { T.flap = 1.5 + Math.random() * 3; let best = null, bd = 25; for (const f of W.flags) { const d = Math.hypot(f.x - st.x, f.z - st.z); if (d < bd) { bd = d; best = f; } } if (best) sfx.flap(spot(best.x, best.z, 7)); }
    // the stacks and presses of the Flats, louder as the walls come up
    const near = clamp((st.z - 1300) / 490, 0, 1);
    if (near > 0 && (T.thump -= dt) <= 0) { T.thump = 0.9; sfx.thump(0.06 + near * near * 0.22); }
    // stones ticking as the day heats them
    if ((T.tick -= dt) < 0) { T.tick = 5 + Math.random() * 12; if (!st.driving) noiseHit({ f: 3600 + Math.random() * 1500, q: 7, dur: 0.03, gain: 0.03, pan: Math.random() * 1.6 - 0.8 }); }
  } else if (G.area === 'seep' && (T.drip -= dt) < 0) { T.drip = 0.8 + Math.random() * 2.2; sfx.drip({ gain: 0.6 + Math.random() * 0.6, pan: Math.random() - 0.5 }); }
}
// the game's own state, for anything here that needs it
export const heard = () => S.started && !S.paused;
