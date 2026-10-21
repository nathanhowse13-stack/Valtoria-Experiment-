// ============================================================
// The Road to Bleak Flats: the game itself. Chapter Two's road, from
// the yard's north gate to the south gate of the Flats: a fork (the Old
// Canyon Road through the gums and the spinifex, or straight across the
// salt pans where the striders hunt), the breakdown under the old
// transmission line, the outskirts and their strip mines, the walls.
// Three shallow caves to walk into on the way, and a few relics in each.
//
// 1.8 km standing for twenty clicks. The land is in land.js, what lives
// on it in life.js, the caves in caves.js, the shared state, materials
// and the field notes in core.js. This file is the player: the tractor
// and Jacob on foot, the camera, the HUD and the notebook, sound, water,
// heat and the endings.
//
// The tractor (shared/tractor.js; unnamed, Rustbucket is the bull) is
// the safest place out here, but not safe: the anima-shield gauge reads
// "Non-existent" (Chapter Two), and it only takes the edge off the flies.
// Units are metres. The road runs north along +z; east is −x.
// ============================================================
import { THREE, clamp, lerp, smooth, esc, reduceMotion, valueOf, TAG_NAME, GUIDE, CH1, CH2, NEW, tagHTML, G, S, P, W, things, blockers, shades, hooks, addThing, bark, once, meet, SPECIES, FINDS, RELICS, SWAY, M, mesh, glowTexture, initMaterials } from './core.js';
import { LORE_KM, ARRIVE_Z, HALF_W, h, placeAt, nearestRoad, saltAt, landBlocked, nearbySpinifex, buildLand, RESERVED, ADIT } from './land.js';
import { reserveLife, buildLife, updateLife, sulphurBlast, SWARM, STRIDERS } from './life.js';
import { CAVES, buildCaves, enterCave, caveConstrain, caveFloor, updateCave } from './caves.js';
import { reserveMainRoad, buildMainRoad, updateMainRoad } from './mainroad.js';
import { buildTractor as buildTractorModel } from '../shared/tractor.js';
import { ideas, IDEA_KINDS, connectIdeas, addIdea, deleteIdea, exportIdeas, ideaWhere } from '../shared/notebook.js';

const SPEED = { tractor: 6, offroad: 0.56, salt: 0.85, reverse: 2, walk: 1.22, run: 2.26, cave: 0.85, crouch: 0.5 };
const TIME_SCALE = (LORE_KM * 1000) / 1800;      // world seconds per real second: five minutes of driving is fifty-five on the clock
const CANISTER_MAX = 6;
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------- renderer, scene, sky and sun ----------
const canvas = $('scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }); }
catch (e) { $('btn-start').textContent = 'This needs WebGL, and this browser has it switched off'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const HAZE = new THREE.Color(0xd2a07e);
scene.fog = new THREE.FogExp2(HAZE.getHex(), 0.0021);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2400);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xb8c0d8, 0x8a4426, 0.45));   // the sky's blue and the dirt's red bounce: shade out here is never black
const sun = new THREE.DirectionalLight(0xffe0b4, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const sunDir = new THREE.Vector3();
const skyU = { uSun: { value: sunDir }, uHaze: { value: HAZE.clone() }, uTop: { value: new THREE.Color(0x6f86b4) }, uGlow: { value: 1 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }',
  fragmentShader: `varying vec3 vD; uniform vec3 uSun; uniform vec3 uHaze; uniform vec3 uTop; uniform float uGlow;
    void main(){ float h = vD.y; vec3 c = mix(uHaze, uTop, smoothstep(0.0, 0.55, h)); c = mix(c, uHaze * 0.55, smoothstep(0.0, -0.2, h));
      float s = max(dot(vD, uSun), 0.0); c += vec3(1.0, 0.75, 0.45) * (pow(s, 6.0) * 0.35 + pow(s, 80.0) * 1.2) * uGlow + vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 6.0;
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -10; scene.add(sky);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
Object.assign(G, { renderer, scene, camera, maxAniso, exposure: 1.05, exposureTarget: 1.05, redline: 0 });
initMaterials(maxAniso);

// ---------- what carries over between journeys ----------
try { const s = JSON.parse(localStorage.getItem('valtoria-road-save') || '{}'); S.finds = s.finds || {}; } catch (e) { /* storage unavailable */ }
try { S.workshop = localStorage.getItem('valtoria-workshop') === '1'; } catch (e) { /* storage unavailable */ }
// an ear-cage found in the yard (the Farm sketch's curio) keeps the flies out of his ears here too
try { const c = JSON.parse(localStorage.getItem('farm-of-rust-collection') || '{}'); S.earcage = (c.found || []).includes('earcage'); } catch (e) { /* storage unavailable */ }
function saveRoad() { try { localStorage.setItem('valtoria-road-save', JSON.stringify({ finds: S.finds })); } catch (e) { /* storage unavailable */ } }
S.visited = {};

// ---------- sound: synthesised, like the yard's ----------
const audio = { ctx: null };
function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ac = audio.ctx = new AC(), master = audio.master = ac.createGain(); master.gain.value = 0.85; master.connect(ac.destination);
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  audio.noise = buf;
  const bed = ac.createBufferSource(); bed.buffer = buf; bed.loop = true;
  const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 600; wf.Q.value = 0.5;
  const wg = audio.wind = ac.createGain(); wg.gain.value = 0.05; bed.connect(wf); wf.connect(wg); wg.connect(master); bed.start();
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
  const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 380;
  const eg = audio.engine = ac.createGain(); eg.gain.value = 0;
  o1.connect(ef); o2.connect(ef); ef.connect(eg); eg.connect(master); o1.start(); o2.start();
  audio.o1 = o1; audio.o2 = o2;
  const b1 = ac.createOscillator(), b2 = ac.createOscillator(); b1.type = b2.type = 'sawtooth'; b1.frequency.value = 196; b2.frequency.value = 213;
  const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 950;
  const bg = audio.buzz = ac.createGain(); bg.gain.value = 0; b1.connect(bf); b2.connect(bf); bf.connect(bg); bg.connect(master); b1.start(); b2.start();
}
function noiseHit({ dur = 0.1, type = 'bandpass', f = 2000, q = 1, gain = 0.3, delay = 0 } = {}) {
  if (!audio.ctx) return; const ac = audio.ctx, t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = audio.noise; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(audio.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone({ type = 'sine', f = 440, f2 = null, dur = 0.2, gain = 0.1, delay = 0 } = {}) {
  if (!audio.ctx) return; const ac = audio.ctx, t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  step: () => noiseHit({ f: 1100, q: 0.8, dur: 0.08, gain: 0.08 }),
  click: () => { for (let i = 0; i < 4; i++) noiseHit({ f: 3800, q: 8, dur: 0.03, gain: 0.25, delay: i * 0.11 }); },
  creak: () => tone({ type: 'sawtooth', f: 110, f2: 160, dur: 1.2, gain: 0.05 }),
  crash: () => { noiseHit({ type: 'lowpass', f: 300, dur: 0.5, gain: 0.6 }); tone({ f: 70, f2: 35, dur: 0.6, gain: 0.4 }); },
  snarl: () => { tone({ type: 'sawtooth', f: 140, f2: 80, dur: 0.6, gain: 0.08 }); noiseHit({ f: 700, dur: 0.5, gain: 0.15 }); },
  hiss: () => noiseHit({ type: 'highpass', f: 3000, dur: 0.6, gain: 0.12 }),
  cut: () => { noiseHit({ type: 'highpass', f: 5000, dur: 0.12, gain: 0.2 }); tone({ f: 3100, dur: 0.25, gain: 0.02 }); },
  schwick: () => { noiseHit({ type: 'highpass', f: 4200, dur: 0.18, gain: 0.3 }); tone({ type: 'triangle', f: 2600, f2: 1900, dur: 0.5, gain: 0.05 }); },   // like a sword striking metal
  sizzle: () => { noiseHit({ type: 'highpass', f: 3500, dur: 2.2, gain: 0.16 }); tone({ type: 'sawtooth', f: 60, f2: 110, dur: 2.0, gain: 0.08 }); },
  gulp: () => { for (const d of [0, 0.32]) tone({ f: 220, f2: 105, dur: 0.17, gain: 0.25, delay: d }); },
  fill: () => noiseHit({ f: 500, dur: 1.4, gain: 0.14, q: 0.8 }),
  find: () => { for (const [f, d] of [[660, 0], [990, 0.1], [1320, 0.2]]) tone({ f, dur: 1.2, gain: 0.04, delay: d }); },
  thump: (g = 0.3) => { tone({ f: 60, f2: 38, dur: 0.3, gain: g }); noiseHit({ type: 'lowpass', f: 200, dur: 0.15, gain: g * 0.6 }); },
  door: () => tone({ type: 'sawtooth', f: 180, f2: 260, dur: 0.4, gain: 0.03 }),
  radio: () => { noiseHit({ f: 2400, q: 0.6, dur: 1.4, gain: 0.08 }); tone({ type: 'square', f: 880, dur: 0.06, gain: 0.02 }); },
  drip: () => tone({ f: 1500 + Math.random() * 500, f2: 800, dur: 0.12, gain: 0.03 }),
  zap: (v = 1) => { for (let i = 0; i < 5; i++) noiseHit({ type: 'highpass', f: 2500 + Math.random() * 3000, q: 2, dur: 0.04 + Math.random() * 0.05, gain: 0.22 * v, delay: i * 0.035 * Math.random() * 3 }); tone({ type: 'square', f: 100, dur: 0.18, gain: 0.03 * v }); },   // a live wire arcing
  scream: (v = 1) => { tone({ type: 'sawtooth', f: 1500, f2: 640, dur: 0.75, gain: 0.05 * v }); tone({ type: 'square', f: 2100, f2: 1150, dur: 0.55, gain: 0.018 * v, delay: 0.06 }); noiseHit({ type: 'highpass', f: 3200, dur: 0.5, gain: 0.1 * v }); },   // a Scream-Pea pod splitting open
};

// ---------- the HUD ----------
const ui = {};
for (const id of ['hud', 'title', 'btn-start', 'btn-yard', 'btn-ws', 'place', 'track-fill', 'km', 'compass', 'compass-strip', 'compass-note', 'time', 'heat', 'reticle', 'prompt', 'prompt-verb', 'prompt-name', 'prompt-tag', 'whisper', 'thought', 'book', 'toasts', 'mode', 'status', 'gauges', 'menu', 'menu-body', 'menu-close', 'jot', 'jot-thumb', 'jot-ctx', 'jot-kinds', 'jot-text', 'jot-where', 'jot-cancel', 'jot-save', 'end', 'end-card', 'fx-fade', 'fade-line', 'fx-dark', 'fx-glare', 'fx-hurt', 'fx-bleed', 'fx-stress', 'fx-haze', 'fx-swirl']) ui[id.replace(/-(.)/g, (_, c) => c.toUpperCase())] = $(id);
const meters = { health: $('m-health'), water: $('m-water'), stress: $('m-stress') };
const clockText = () => { const m = Math.floor(S.time / 60) % 1440, hh = Math.floor(m / 60), mm = m % 60; return `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${hh < 12 ? 'am' : 'pm'}`; };
const hours = () => (S.time / 3600) % 24;
const inCave = () => CAVES[G.area] || null;
// where Jacob is in the world: on the tractor, on his feet, or (in a cave) at its mouth
function here() {
  const c = inCave(); if (c) return { x: c.mouth.x, z: c.mouth.z };
  return S.inTractor ? { x: tractor.x, z: tractor.z } : { x: P.x, z: P.z };
}
function shadeAt(x, z) { for (const s of shades) if (Math.hypot(x - s.x, z - s.z) < s.r) return s; return null; }
function heatNow() {
  if (inCave()) return clamp(23 + 1.1 * (hours() - 6), 21, 31);                                 // the rock keeps the night's cool a while
  const { x, z } = here(), s = shadeAt(x, z);
  return clamp(34 + 2.3 * (hours() - 6), 30, 52) + saltAt(x, z) * 4 - (s ? (s.soft ? 4 : 7) : 0);   // the pans throw the sun back up at you
}
let thoughtTimer = 0, whisperTimer = 0, bookTimer = 0;
function say(text, prov = ['X', NEW]) {
  ui.thought.innerHTML = `${esc(text)}<span class="tagline ws">${tagHTML(...prov)}</span>`;
  ui.thought.classList.add('on'); clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(() => ui.thought.classList.remove('on'), clamp(2200 + text.length * 55, 3000, 8000));
}
function whisper(text, prov = ['C', CH2], ms = 2800) {
  ui.whisper.innerHTML = `${esc(text)}<span class="tagline ws">${tagHTML(...prov)}</span>`; ui.whisper.classList.add('on');
  clearTimeout(whisperTimer); whisperTimer = setTimeout(() => ui.whisper.classList.remove('on'), ms);
}
// a line from the books, when a relic calls it up: the Age of Glass, remembered
function book([text, src]) {
  ui.book.innerHTML = `<p>${esc(text)}</p><span class="src">${esc(src)}</span><span class="ws"> ${tagHTML('C', 'quoted from the book')}</span>`;
  ui.book.classList.add('on'); clearTimeout(bookTimer); bookTimer = setTimeout(() => ui.book.classList.remove('on'), 9000);
}
function toast(text) {
  const el = document.createElement('p'); el.className = 'toast'; el.textContent = text; ui.toasts.appendChild(el);
  while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3400); setTimeout(() => el.remove(), 4000);
}
function hurt(amount, why) {
  S.health = Math.max(0, S.health - amount);
  ui.fxHurt.style.opacity = 1; setTimeout(() => { ui.fxHurt.style.opacity = 0; }, 160);
  if (!reduceMotion) P.shake = Math.min(0.06, 0.012 * amount / 10);
  updateVitals();
  if (S.health <= 0) die(why);
}
function flash(el, sec) { el.style.transition = 'none'; el.style.opacity = 1; void el.offsetWidth; el.style.transition = `opacity ${reduceMotion ? 0.2 : sec}s ease-out`; el.style.opacity = 0; }
function updateVitals() {
  const set = (el, v) => { el.querySelector('i').style.width = clamp(v, 0, 100) + '%'; el.querySelector('.n').textContent = Math.round(v); };
  set(meters.health, S.health); set(meters.water, S.water); set(meters.stress, S.stress);
  const st = [`Bag ${S.sips}/4 · canister ${S.can}/${CANISTER_MAX}`];
  if (S.bleed > 0.15) st.push('<span class="bad">bleeding</span>');
  if (S.disoriented > 0) st.push('<span class="bad">turned around</span>');
  if (inCave()) st.push('in the dark');
  else if (!S.inTractor && shadeAt(P.x, P.z)) st.push('in the shade');
  ui.status.innerHTML = st.join(' · ');
  updateGauges();
}
// the dashboard, as Chapter Two reads it: "Same as usual."
let gaugeKey = '';
function updateGauges() {
  ui.gauges.hidden = !S.inTractor;
  const key = [S.inTractor, S.hull, S.sulphur, G.redline > 0].join();
  if (key === gaugeKey) return; gaugeKey = key;
  const hull = S.hull ? `${S.hull} new scratch${S.hull === 1 ? '' : 'es'}` : 'Old scratches';
  ui.gauges.innerHTML = `<div class="gk">Gauges<span class="ws"> ${tagHTML('C')}</span></div>
    <span>Engine temp</span><b class="${G.redline > 0 ? 'bad' : 'warn'}">${G.redline > 0 ? 'Redline' : 'High'}</b>
    <span>Fuel pressure</span><b class="warn">Low</b>
    <span>Anima-shield</span><b class="bad">Non-existent</b>
    <span>Coolant</span><b>High</b>
    <span>Oil</span><b><i class="dial" aria-label="dial spinning"></i></b>
    <span>Hull<span class="ws"> ${tagHTML('X')}</span></span><b>${hull}</b>
    <span>Sulphur-Salts</span><b class="${S.sulphur ? '' : 'bad'}">${S.sulphur ? S.sulphur + (S.sulphur === 1 ? ' tin' : ' tins') + ' · G' : 'None'}</b>`;
}
const COMPASS_MARKS = (() => { const out = []; for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360, lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[n]; out.push(`<span class="${lab ? 'c' : ''}">${lab || '·'}</span>`); } return out.join(''); })();
ui.compassStrip.innerHTML = COMPASS_MARKS;
let needle = 0;
function updateHud(dt) {
  ui.time.textContent = clockText();
  const t = heatNow(), c = inCave(); ui.heat.textContent = `${Math.round(t)} °C · ${c ? 'cool, under rock' : t > 46 ? 'scorching' : t > 40 ? 'hazy' : 'clear'}`;
  const { x, z } = here();
  ui.place.textContent = (c ? c.def.name : placeAt(x, z)).replace(/^./, ch => ch.toUpperCase());
  ui.trackFill.style.width = clamp(z / ARRIVE_Z * 100, 0, 100) + '%';
  ui.km.textContent = `${clamp((ARRIVE_Z - z) / ARRIVE_Z * LORE_KM, 0, LORE_KM).toFixed(1)} km to Bleak Flats`;
  // the compass: true heading, unless the weed has got into the needle
  const heading = ((-viewYaw() * 180 / Math.PI) % 360 + 360) % 360;
  const wild = S.disoriented > 0 ? Math.sin(S.time * 0.013) * 140 + Math.sin(S.time * 0.051) * 60 : 0;
  needle = lerp(needle, heading + wild, clamp(dt * (S.disoriented > 0 ? 2 : 8), 0, 1));
  ui.compassStrip.style.transform = `translateX(${(ui.compass.clientWidth / 2) - (needle + 360) / 15 * 30 - 15}px)`;
  ui.compass.hidden = !S.compass; ui.compass.classList.toggle('wild', S.disoriented > 0);
  ui.compassNote.hidden = !(S.compass && S.disoriented > 0);
  ui.compassNote.textContent = 'Compass-weed · the needle’s lying. Follow the wires.';
  ui.mode.innerHTML = c ? `<b>Underground</b>WASD walk · Shift hurry · E use · F drink · walk back out into the light to leave`
    : S.inTractor ? `<b>The tractor</b>W/S throttle · A/D steer · F drink · G Sulphur-Salts · R radio · V ${S.view === 'chase' ? 'seat' : 'chase'} view · E climb down`
    : `<b>On foot</b>WASD walk · Shift run · E use · F drink · ${Math.hypot(P.x - tractor.x, P.z - tractor.z) < 3.4 ? 'E climb aboard' : 'the tractor waits'}`;
  ui.fxStress.style.opacity = smooth(45, 100, S.stress);
  ui.fxBleed.style.opacity = clamp(S.bleed / 2, 0, 0.9);
  ui.fxHaze.style.opacity = S.haze;
  ui.fxSwirl.style.opacity = S.disoriented > 0 ? Math.min(1, S.disoriented / 6) * 0.8 : 0;
}

// ---------- the hooks the land, its life and the caves call ----------
Object.assign(hooks, {
  bark: say, book, toast, hurt, updateVitals, whisper,
  sfx: new Proxy(sfx, { get: (o, k) => o[k] || (() => {}) }),
  found(def) {
    S.finds[def.name] = { text: def.text, where: def.where, at: clockText() };
    saveRoad(); sfx.find(); toast(`Found · ${def.name}`);
    bark(def.text, ['X', 'a find: ' + NEW]);
    if (def.counts === 'sulphur') S.sulphur++;
    if (def.book) setTimeout(() => book(def.book), 4200);           // once he's taken it in, a line from the books comes to mind
    updateVitals();
  },
  addWater: (def) => waterThing(def),
  // into the dark: a moment of black while his eyes open up
  fade(sec) {
    flash(ui.fxDark, sec * 3); sfx.step();
    S.visited[G.area] = true; P.y = -99;                              // the eye height snaps to the cave floor
    if (flySwarms.length) { for (const sw of flySwarms) sw.life = 0; toast('The gossip-flies hang at the mouth, and don’t follow'); }
  },
  // and back out: the light just erases everything for a moment
  glare() {
    flash(ui.fxGlare, 1.8);
    for (const s of W.stalkers) s.cool = Math.max(s.cool, 3);      // a moment to get his eyes back before anything up top decides
  },
});

// ---------- water: the pipeline's leaks, a tank, the seep ----------
function waterThing(def) {
  const prov = def.prov || ['X', NEW];
  addThing({ id: def.id, area: def.area || 'out', name: def.name, x: def.x, y: def.y ?? h(def.x, def.z) + 0.6, z: def.z, r: def.r || 1.8, prov,
    verb: () => def.once && S.flags[def.id] ? 'Look' : S.sips < 4 || canFill() ? 'Fill up' : 'Look',
    use: () => {
      if (def.once && S.flags[def.id]) { bark('Left some, like the sign said.', ['X', NEW]); return; }
      if (S.sips >= 4 && !canFill()) { bark(S.can >= CANISTER_MAX ? 'Bag’s full, canister’s full. Rich, for once.' : 'Bag’s full. The canister’s on the tractor, too far to lug it here.', ['X', NEW]); return; }
      if (def.once) S.flags[def.id] = true;
      S.sips = 4; const c = topUpCanister(); sfx.fill(); updateVitals(); bark(def.line + c, prov);
    } });
}
// the canister fills at the same places the bag does, if the tractor's close enough to carry it over
const canFill = () => { const p = here(); return S.can < CANISTER_MAX && Math.hypot(p.x - tractor.x, p.z - tractor.z) < (inCave() ? 30 : 14); };
function topUpCanister() {
  if (!canFill()) return S.can < CANISTER_MAX ? ' The canister’s on the tractor. Too far to lug it.' : '';
  S.can = CANISTER_MAX; return ' Canister’s full too.';
}

// ---------- the tractor: the shared model, and where it is ----------
let tractor = null;
function buildTractor() {
  const model = buildTractorModel(THREE, { maxAniso });
  scene.add(model.group);
  return { model, g: model.group, x: 0, z: 0, yaw: 0, speed: 0, stall: 0, wasThrottle: false, wired: 0 };
}
const _tw = new THREE.Vector3();
function tractorPoint(lx, ly, lz) { return _tw.set(lx, ly, lz).applyMatrix4(tractor.g.matrixWorld); }
const words = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n);
function addTractorThings() {
  const can = addThing({ id: 'tractor:canister', name: 'The tractor’s water canister', verb: () => S.can && S.sips < 4 ? 'Fill the water bag' : 'Look', r: 1.2, prov: ['X', 'the tractor’s refits: ' + NEW], local: [-0.78, 1.25, 0.05], use: () => {
    if (!S.can) { bark('Canister’s dry. Fill it at a leak or the seep, with the tractor close by.', ['X', NEW]); return; }
    if (S.sips >= 4) { bark(`Canister’s got ${S.can} in it. Bag’s full. Good.`, ['X', NEW]); return; }
    const n = Math.min(S.can, 4 - S.sips); S.can -= n; S.sips += n; sfx.fill(); updateVitals(); bark('Off the tap into the bag. Every drop accounted for.', ['X', NEW]);
  } });
  const box = addThing({ id: 'tractor:compartment', name: 'The back compartment', verb: () => S.flags.lid ? 'Shut it' : 'Open it', r: 1.2, prov: ['X', 'the tractor’s refits: ' + NEW], local: [0, 1.15, -1.6], use: () => {
    S.flags.lid = !S.flags.lid; tractor.model.setLid(S.flags.lid); sfx.door();
    if (!S.flags.lid) return;
    const n = Object.keys(S.finds).length, h0 = S.handoff;
    const bits = ['spare wire', 'a tin of grease', 'the tyre awl', S.sulphur ? (S.sulphur === 1 ? 'one tin of Sulphur-Salts' : `${words(S.sulphur)} tins of Sulphur-Salts`) : 'no Sulphur-Salts, not any more'];
    if (n) bits.push(`${n === 1 ? 'one find' : words(n) + ' finds'} from the road, wrapped in rag`);
    bark(`In the compartment: ${bits.join(', ')}.${h0 && h0.dung >= 6 ? ' The dung bin’s strapped down on the lid.' : ''}`, ['X', NEW]);
  } });
  W.tractorThings = [can, box];
}
// the radio: Bleak Flats, when the antenna catches it
const RADIO = [
  '…Flats relay, Flats relay… water truck’s held at the Silos till noon… repeat, noon…',
  '…anyone on the north road: strider walking the salt this morning. Hold your speed. Don’t speed up, don’t slow down…',
  '…accounts in arrears will be visited in person. H. R. Cogswell and Associates thanks you for your…',
  '…canyon traffic: don’t stop under the gums. Whatever the heat, don’t stop…',
  '…Rusty Cog’s open, and the stew is technically food…',
  '…south gate: entry tax is five bits, or three ounces of raw water. Have it ready…',
  '…static, and under it, very faint, somebody humming…',
];
function radio() {
  if (!S.inTractor) return;
  sfx.radio();
  const line = RADIO[(S.flags.radio = ((S.flags.radio ?? -1) + 1) % RADIO.length)];
  ui.whisper.innerHTML = `<span style="font-style:normal;color:#d8e6c8">Radio · </span>${esc(line)}<span class="tagline ws">${tagHTML('X', 'the radio: ' + NEW)}</span>`;
  ui.whisper.classList.add('on'); clearTimeout(whisperTimer); whisperTimer = setTimeout(() => ui.whisper.classList.remove('on'), 5200);
}
// Sulphur-Salts in the intake, then redline it (Chapter Two)
function sulphur() {
  if (!S.inTractor) { bark(S.sulphur ? 'The salts go in the intake. Aboard first, then redline it.' : 'No salts left anyway.', ['C', CH2]); return; }
  if (!S.sulphur) { bark('Out of salts. Not enough for a second blast.', ['C', CH2]); return; }
  S.sulphur--; G.redline = 4; tractor.model.sulphur(5); tractor.stall = 0; sfx.sizzle();
  bark('Chew on this.', ['C', CH2]);
  let hit = sulphurBlast(tractor.x, tractor.z);
  if (flySwarms.length) { hit = true; for (const sw of flySwarms) sw.life = 0; }
  setTimeout(() => {
    if (hit) { S.stress = Math.max(0, S.stress - 30); bark('A thick, yellow-white cloud. Rotten eggs and hellfire. The collective voice shatters into static, and the swarm breaks apart.', ['C', CH2]); }
    else bark(S.sulphur ? 'Rotten eggs and hellfire, and nothing out here to use it on. Wasted a tin.' : 'Rotten eggs and hellfire, and nothing out here to use it on. That was the last tin.', ['X', NEW]);
  }, 1600);
  updateVitals();
}

// ---------- flies, smoke: small moving things ----------
// a few gossip-flies find Jacob on foot near the dead and the abandoned; the swarm at the wreck is life.js's
const flySwarms = [];
const FLY = new THREE.SphereGeometry(0.045, 10, 8);
function spawnSwarm(x, z, n = 4) {
  if (flySwarms.length > 2) return;
  const flies = [];
  for (let k = 0; k < n; k++) {
    const f = new THREE.Group(); scene.add(f);
    const b = mesh(FLY, M.fly, { cast: false }); b.scale.set(1, 0.8, 1.5); f.add(b);   // fist-sized, oil-slick (the Field Guide)
    const wings = [];
    for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(0.09, 0.05), M.wing, { cast: false, receive: false }); w.position.set(s * 0.05, 0.03, 0); w.userData.s = s; f.add(w); wings.push(w); }
    f.position.set(x, h(x, z) + 1.5, z);
    flies.push({ f, wings, ph: Math.random() * Math.PI * 2, r: 1.1 + Math.random() * 0.8 });
  }
  flySwarms.push({ flies, life: 50, lost: 0, whisperIn: 3 });
  meet('flies');
}
const WHISPERS = [['…bills are due, Jacob…', 'C', CH1], ['…you’re all alone…', 'C', CH1], ['…Rustbucket is sick…', 'C', CH1 + ' (the yard)'], ['…Cogswell won’t take it… grade is too low…', 'C', CH1 + ' (the yard)'], ['…parasite… bloodsucker…', 'C', CH1], ['…nobody is coming…', 'X', 'from the Road Relic prototype'], ['…she isn’t coming back…', 'P', 'the shack’s flies, about Mum']];
const _v = new THREE.Vector3();
function updateFlies(dt) {
  if (audio.buzz) audio.buzz.gain.value = flySwarms.length ? 0.015 : SWARM.points && !inCave() ? clamp(1 - Math.hypot(here().x - SWARM.x, here().z - SWARM.z) / 60, 0, 1) * (SWARM.scattered > 0 ? 0.004 : 0.03) : 0;
  for (let i = flySwarms.length - 1; i >= 0; i--) {
    const sw = flySwarms[i]; sw.life -= dt;
    const fast = S.inTractor && tractor.speed > 4; sw.lost = fast ? sw.lost + dt : Math.max(0, sw.lost - dt);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    sw.flies.forEach((f, k) => {
      f.ph += dt * (2.2 + k * 0.3);
      const tx = cx + Math.cos(f.ph + k * 2) * f.r, ty = cy + Math.sin(f.ph * 1.7) * 0.25, tz = cz + Math.sin(f.ph + k * 2) * f.r;
      f.f.position.lerp(_v.set(tx, ty, tz), clamp(dt * (sw.lost > 0 ? 0.3 : 2.5), 0, 1));
      for (const w of f.wings) w.rotation.y = Math.sin(f.ph * 40) * 0.8 * w.userData.s;
      f.f.lookAt(camera.position);
    });
    // aboard, the shield takes the edge off; it doesn't keep them out (Chapter Two)
    const shield = S.inTractor ? 0.6 : 1, cage = S.earcage ? 0.4 : 1;
    S.stress = Math.min(100, S.stress + dt * 0.7 * shield * cage);
    sw.whisperIn -= dt * cage;
    if (sw.whisperIn <= 0) {
      sw.whisperIn = 6 + Math.random() * 4;
      const [w, tag, src] = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
      whisper(w, [tag, src], 2600);
      once('flies', S.earcage ? 'Gossip-flies. The ear-cage keeps the worst of it out. Most of it.' : 'Gossip-flies. Fist-sized, oil-slick, and they talk. Back aboard and leave them in the dust.', ['C', GUIDE]);
    }
    if (sw.life <= 0 || sw.lost > 5) {
      if (sw.lost > 5) toast('The gossip-flies fall behind');
      for (const f of sw.flies) scene.remove(f.f);
      flySwarms.splice(i, 1);
    }
  }
}
// smoke: soft puffs that rise, drift west on the breeze, swell and thin out
const smokePuffs = [], puffMats = new Map();
const puffMat = (src) => { if (!puffMats.has(src)) puffMats.set(src, [0, 1, 2, 3].map(k => new THREE.SpriteMaterial({ map: glowTexture(), color: src.color, transparent: true, opacity: src.opacity * 1.6 * (1 - k / 4), depthWrite: false }))); return puffMats.get(src); };
function updateSmoke(dt) {
  for (const s of W.smoke) if (Math.random() < dt * (s.rate || 1.2)) {
    const mats = puffMat(s.mat || M.smoke), m = new THREE.Sprite(mats[0]); m.position.set(s.x, s.y, s.z); scene.add(m); smokePuffs.push({ m, mats, life: 14, size: s.size || 1 });
  }
  for (let i = smokePuffs.length - 1; i >= 0; i--) {
    const p = smokePuffs[i]; p.life -= dt; p.m.position.y += dt * 2.2; p.m.position.x -= dt * 1.4; p.m.scale.setScalar(p.size * (3 + (14 - p.life) * 1.3));
    p.m.material = p.mats[Math.min(3, Math.floor((14 - p.life) / 3.5))];
    if (p.life <= 0) { scene.remove(p.m); smokePuffs.splice(i, 1); }
  }
}

// ---------- input ----------
const keys = new Set();
const input = { locked: false, dragging: false, lx: 0, ly: 0 };
addEventListener('keydown', (e) => {
  if (!ui.jot.hidden) { if (e.key === 'Escape') closeJot(); else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveJot(); return; }
  const k = e.code;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
  initAudio();
  if (!S.started) { if (k === 'Enter' && !ui.btnStart.disabled) begin(); return; }
  if (k === 'Escape' || k === 'Tab' || k === 'KeyP') { if (!ui.menu.hidden) closeMenu(); else if (!S.ended && !S.dead) openMenu(); return; }
  if (S.paused || S.dead || S.ended) return;
  keys.add(k);
  if (e.repeat) return;
  if (k === 'KeyE') use();
  if (k === 'KeyF') drink();
  if (k === 'KeyG') sulphur();
  if (k === 'KeyC') S.compass = !S.compass;
  if (k === 'KeyV') S.view = S.view === 'chase' ? 'seat' : 'chase';
  if (k === 'KeyR') radio();
  if (k === 'KeyN') openJot();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (!S.started || S.paused) return;
  if (!input.locked) { try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag to look instead */ } }
  input.dragging = true; input.lx = e.clientX; input.ly = e.clientY;
});
addEventListener('pointerup', () => { input.dragging = false; });
document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; document.body.classList.toggle('locked', input.locked); });
addEventListener('pointermove', (e) => {
  if (!S.started || S.paused) return;
  let dx = 0, dy = 0;
  if (input.locked) { dx = e.movementX * 0.0022; dy = e.movementY * 0.0022; }
  else if (input.dragging) { dx = (e.clientX - input.lx) * 0.004; dy = (e.clientY - input.ly) * 0.004; input.lx = e.clientX; input.ly = e.clientY; }
  else return;
  if (S.inTractor) P.look = clamp(P.look - dx, -2.2, 2.2); else P.yaw -= dx;
  P.pitch = clamp(P.pitch - dy, -1.25, 1.25);
});
// which way he's facing in the world (in a cave, P.yaw is the cave's own; its mouth says how it sits)
const viewYaw = () => { const c = inCave(); return c ? P.yaw + Math.atan2(c.mouth.ox, c.mouth.oz) : S.inTractor ? tractor.yaw + P.look : P.yaw; };
function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* nothing to release */ } }

// ---------- using things ----------
let target = null;
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function pickTarget() {
  if (S.inTractor) return null;
  camera.getWorldDirection(_fwd);
  let best = null, bestS = 1e9;
  for (const t of things) {
    if (t.area !== G.area || !t.enabled()) continue;
    const d = Math.hypot(t.x - P.x, t.z - P.z);
    if (d > t.r + 1.8) continue;
    _to.set(t.x - camera.position.x, t.y - camera.position.y, t.z - camera.position.z).normalize();
    const ang = Math.acos(clamp(_fwd.dot(_to), -1, 1));
    if (ang > 0.6 && d > 1.4) continue;
    const s = d + ang * 4;
    if (s < bestS) { bestS = s; best = t; }
  }
  return best;
}
function use() {
  if (S.inTractor) {
    if (Math.abs(tractor.speed) > 1.2) { bark('Not while she’s moving. I like my legs.', ['X', NEW]); return; }
    S.inTractor = false; tractor.speed = 0;
    const side = new THREE.Vector3(-Math.cos(tractor.yaw), 0, Math.sin(tractor.yaw)).multiplyScalar(-1.7);
    P.x = tractor.x + side.x; P.z = tractor.z + side.z; P.yaw = tractor.yaw + P.look; P.look = 0; sfx.door();
    if (blocked(P.x, P.z, 0.3)) { P.x = tractor.x - side.x; P.z = tractor.z - side.z; }        // the other side, if a wall's in the way
    once('down', 'Down off the tractor. The air tastes of hot iron, and everything out here has noticed.', ['X', NEW]);
    updateVitals(); return;
  }
  if (target) { target.use(); return; }
  if (!inCave() && Math.hypot(P.x - tractor.x, P.z - tractor.z) < 3.4) {
    S.inTractor = true; P.look = 0; sfx.door(); tractor.model.spit(20);
    if (tractor.wired) { tractor.wired = 0; tractor.stall = 2.5; bark('Dead. Jaw-jaws had at the ignition wiring. Twist it back together… there. She coughs, and catches.', ['P', 'the Farm of Rust sketch']); }
    else if (flySwarms.length) bark('Back aboard. The shielding hums. The whispering thins out, but it doesn’t stop.', ['C', CH2 + ': the anima-shield gauge reads “Non-existent”']);
    else once('shield', 'Back aboard. The shielding hums, for what it’s worth. The gauge says it doesn’t exist.', ['C', CH2]);
    updateVitals();
  }
}
function drink() {
  if (S.water > 92) { bark('Not thirsty yet. Out here you ration even that.', ['X', NEW]); return; }
  if (S.inTractor && S.can) { S.can--; S.water = Math.min(100, S.water + 30); sfx.gulp(); updateVitals(); return; }   // at the wheel, off the canister's tap
  if (!S.sips) { once('dry', S.can ? 'Bag’s empty. There’s some in the canister on the tractor.' : 'Bag’s empty, canister too. The pipeline leaks, if you know where.', ['X', NEW]); return; }
  S.sips--; S.water = Math.min(100, S.water + 30); sfx.gulp(); updateVitals();
}

// ---------- the jotter (N) and the notebook ----------
const jot = { kind: 'gameplay', ctx: null, thumb: '', want: false };
function openJot() {
  if (!ui.jot.hidden) return;
  const p = here(), c = inCave();
  jot.ctx = { area: 'road', place: c ? c.def.name : placeAt(p.x, p.z), looking: target ? valueOf(target.name).replace(/^./, ch => ch.toLowerCase()) : '', heat: `${heatNow().toFixed(1)} °C`, clock: clockText() };
  jot.want = true; jot.thumb = ''; S.paused = true; releaseLock();
  ui.jotCtx.textContent = [jot.ctx.place.replace(/^./, ch => ch.toUpperCase()), jot.ctx.looking && 'looking at ' + jot.ctx.looking, jot.ctx.heat, jot.ctx.clock].filter(Boolean).join(' · ');
  ui.jotWhere.textContent = ideas.db ? 'Kept in this page’s notebook, where Claude can read it' : 'Kept on this computer · export from the notebook';
  ui.jotKinds.innerHTML = IDEA_KINDS.map(([k, l]) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${jot.kind === k}">${l}</button>`).join('');
  ui.jotText.value = ''; ui.jotThumb.hidden = true; ui.jot.hidden = false;
  setTimeout(() => ui.jotText.focus(), 30);
}
function closeJot() { ui.jot.hidden = true; S.paused = !ui.menu.hidden; canvas.focus(); }
async function saveJot() {
  const text = ui.jotText.value.trim(), c = jot.ctx; closeJot();
  if (!text) return;
  const p = here();
  const ok = await addIdea(text, jot.kind, 'road-2', { ...c, pos: [+p.x.toFixed(1), +p.z.toFixed(1)] }, jot.thumb);
  toast(ok ? 'Idea kept in the notebook' : 'Idea kept on this computer');
}
const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 320; thumbCanvas.height = 180;
function grabThumb() {
  if (!jot.want) return; jot.want = false;
  try { const src = renderer.domElement, x = thumbCanvas.getContext('2d'), hh = src.width / (16 / 9); x.drawImage(src, 0, Math.max(0, (src.height - hh) / 2), src.width, Math.min(src.height, hh), 0, 0, 320, 180); jot.thumb = thumbCanvas.toDataURL('image/jpeg', 0.72); ui.jotThumb.src = jot.thumb; ui.jotThumb.hidden = false; } catch (e) { jot.thumb = ''; }
}
ui.jotKinds.addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; jot.kind = b.dataset.kind; for (const c of ui.jotKinds.children) c.setAttribute('aria-pressed', String(c === b)); });
ui.jotCancel.addEventListener('click', closeJot); ui.jotSave.addEventListener('click', saveJot);

function openMenu(tab) { if (tab) S.menuTab = tab; S.paused = true; releaseLock(); ui.menu.hidden = false; renderMenu(); }
function closeMenu() { ui.menu.hidden = true; S.paused = false; canvas.focus(); }
const hint = (w) => /^off /.test(w) ? `Something ${w}` : /^a /.test(w) ? `Something at ${w}` : `Something in ${w}`;
function renderMenu() {
  for (const b of ui.menu.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === S.menuTab));
  let html = '';
  if (S.menuTab === 'finds') {
    html = `<h3>Finds on the road · ${FINDS.filter(f => S.finds[f.name]).length} of ${FINDS.length}</h3>` + FINDS.map(f => {
      const got = S.finds[f.name];
      if (!got) return `<div class="row missing">${esc(hint(f.where))}, not yet found.</div>`;
      return `<div class="row"><div class="hd"><b>${esc(f.name)}</b><span class="ws"><span class="tag X">Experimental</span></span></div><p>${esc(got.text)}</p>${f.book ? `<p class="quote">“${esc(f.book[0])}” <span class="src">${esc(f.book[1])}</span><span class="ws"> <span class="tag C">Canon</span></span></p>` : ''}<p class="src">${esc(got.where)} · ${esc(got.at)}</p></div>`;
    }).join('') + `<p class="src" style="margin-top:12px">Finds are kept in this browser between journeys. The relics are new to the road; the lines they bring to mind are the books’ own.</p>`;
  } else if (S.menuTab === 'guide') {
    html = `<h3>What Jacob knows</h3>` + Object.keys(SPECIES).map(k => {
      const s = SPECIES[k];
      return S.met[k] ? `<div class="row"><div class="hd"><b>${esc(s.name)}</b><span class="ws">${tagHTML(s.tag, s.src)}</span></div><p>${esc(s.fact)}</p>${s.counter ? `<p><i>${esc(s.counter)}</i> <span class="ws"><span class="tag X">Experimental</span> <span class="src">how the game lets you answer it</span></span></p>` : ''}</div>`
        : `<div class="row missing">Not met on this journey.</div>`;
    }).join('');
  } else if (S.menuTab === 'ideas') {
    const kindOf = (k) => (IDEA_KINDS.find(x => x[0] === k) || [0, 'Idea'])[1];
    html = `<div class="set"><span>${ideas.db ? (ideas.shared ? 'Kept in this page’s notebook. Claude can read these next session.' : 'Connecting to the notebook…') : 'Kept on this computer. Export them and send them to Claude.'} Press <kbd>N</kbd> to jot one.</span><button class="btn" id="ideas-export">Export</button></div>` +
      (ideas.list.length ? ideas.list.map(i => `<div class="idea">${i.thumb ? `<img src="${i.thumb}" alt="">` : '<span></span>'}<div><div class="t">${esc(i.text)}</div><div class="m">${esc([kindOf(i.kind), ideaWhere(i), i.place, i.heat].filter(Boolean).join(' · '))}</div></div><button class="x" data-del="${esc(i.id)}" aria-label="Delete this idea">×</button></div>`).join('') : '<p>No ideas yet.</p>');
  } else {
    html = `<div class="set"><span>Workshop view: tags on every line and thing</span><button class="btn" id="set-ws" aria-pressed="${S.workshop}">${S.workshop ? 'On' : 'Off'}</button></div>
      <div class="set"><span>Compass on screen</span><button class="btn" id="set-compass">${S.compass ? 'On' : 'Off'}</button></div>
      <div class="set"><span>Leave the road</span><span><button class="btn" id="set-yard">Back to the yard</button> <button class="btn" id="set-restart">Start the road again</button></span></div>
      <h3>Controls</h3><p>Driving: W/S throttle and brake, A/D steer, mouse looks, F drink from the canister, G Sulphur-Salts into the intake, R the radio, V seat or chase view, E climb down (stop first). On foot: WASD, Shift run, E use, climb aboard or go into a cave, F drink. Always: C compass, Tab this notebook, N jot an idea, Esc pause.</p>`;
  }
  ui.menuBody.innerHTML = html;
}
ui.menu.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { S.menuTab = t.dataset.tab; renderMenu(); return; }
  if (t.dataset.del) { deleteIdea(t.dataset.del); return; }
  if (t.id === 'menu-close') closeMenu();
  if (t.id === 'ideas-export') exportIdeas().then(r => toast(r === 'saved' ? 'Ideas exported' : r === 'declined' ? 'Export cancelled' : 'Couldn’t export here. The PC copy can.'));
  if (t.id === 'set-ws') { setWorkshop(!S.workshop); renderMenu(); }
  if (t.id === 'set-compass') { S.compass = !S.compass; renderMenu(); }
  if (t.id === 'set-yard') location.href = (window.__YARD_URL || 'yard.html');
  if (t.id === 'set-restart') location.href = (window.__ROAD_URL || 'road.html');
});
function setWorkshop(on) {
  S.workshop = on; document.body.classList.toggle('workshop', on);
  ui.btnWs.textContent = 'Workshop view: ' + (on ? 'on' : 'off'); ui.btnWs.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('valtoria-workshop', on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}

// ---------- moving: the tractor, Jacob on foot, and Jacob underground ----------
function blocked(x, z, r) {
  for (const b of blockers) {
    if (b.r !== undefined) { if (Math.hypot(x - b.x, z - b.z) < b.r + r) return true; }
    else if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return landBlocked(x, z, r);
}
const pressed = (...k) => k.some(c => keys.has(c)) ? 1 : 0;
function driveTractor(dt) {
  const fwd = pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown');
  const steer = pressed('KeyA', 'ArrowLeft') - pressed('KeyD', 'ArrowRight');
  const n = nearestRoad(tractor.x, tractor.z, 1), salt = saltAt(tractor.x, tractor.z);
  const off = !n.s || n.d > (n.s.route === 'canyon' ? 3.2 : 4.6);
  const crush = nearbySpinifex(tractor.x, tractor.z).length ? 0.85 : 1;
  const max = SPEED.tractor * (off ? (salt > 0.5 ? SPEED.salt : SPEED.offroad) : 1) * crush * (G.redline > 0 ? 1.3 : 1);
  if (tractor.stall > 0) { tractor.stall -= dt; tractor.speed = lerp(tractor.speed, 0, clamp(dt * 3, 0, 1)); }
  else if (fwd > 0) tractor.speed = Math.min(max, tractor.speed + dt * 2.2);
  else if (fwd < 0) tractor.speed = tractor.speed > 0.2 ? Math.max(0, tractor.speed - dt * 6) : Math.max(-SPEED.reverse, tractor.speed - dt * 1.5);
  else tractor.speed = tractor.speed > 0 ? Math.max(0, tractor.speed - dt * 1.4) : Math.min(0, tractor.speed + dt * 1.4);
  if (tractor.speed > max) tractor.speed = lerp(tractor.speed, max, clamp(dt * 2, 0, 1));
  const drift = S.disoriented > 0 ? Math.sin(S.time * 0.02) * 0.25 : 0;     // the weed gets into his hands on the wheel too
  tractor.yaw += (steer * 0.75 + drift * Math.sign(tractor.speed)) * dt * clamp(Math.abs(tractor.speed) / 2.5, 0, 1) * Math.sign(tractor.speed || 1);
  const nx = tractor.x + Math.sin(tractor.yaw) * tractor.speed * dt, nz = tractor.z + Math.cos(tractor.yaw) * tractor.speed * dt;
  if (!blocked(nx, nz, 1.3)) { tractor.x = nx; tractor.z = nz; } else { if (Math.abs(tractor.speed) > 3) sfx.thump(0.3); tractor.speed *= -0.2; }
  tractor.x = clamp(tractor.x, -HALF_W + 10, HALF_W - 10); tractor.z = clamp(tractor.z, -50, 1900);
  P.x = tractor.x; P.z = tractor.z; P.speed = Math.abs(tractor.speed);
}
function walk(dt) {
  if (P.stun > 0) { P.stun -= dt; P.speed = 0; return; }
  const f = pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown');
  const s = pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft');
  const run = pressed('ShiftLeft', 'ShiftRight'), len = Math.hypot(f, s), cave = inCave();
  if (!len) { P.speed = lerp(P.speed, 0, clamp(dt * 10, 0, 1)); return; }
  // under compass-weed his feet don't go quite where he points them
  const drift = !cave && S.disoriented > 0 ? Math.sin(S.time * 0.017) * 0.7 * Math.min(1, S.disoriented / 5) : 0;
  const yaw = P.yaw + drift, sp = (run ? SPEED.run : SPEED.walk) * (cave ? (P.crouch > 0.5 ? SPEED.crouch : SPEED.cave) : 1);
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const dx = (fx * f + rx * s) / len * sp * dt, dz = (fz * f + rz * s) / len * sp * dt;
  if (cave) {
    // keep to the rock, and don't squeeze where there isn't room to
    const c = caveConstrain(cave, P.x + dx, P.z + dz, 0.3), fl = caveFloor(cave, c.x, c.z);
    if (fl.ceil - fl.floor > 1.05) { P.x = c.x; P.z = c.z; }
  } else {
    if (!blocked(P.x + dx, P.z, 0.3) && Math.hypot(P.x + dx - tractor.x, P.z - tractor.z) > 1.4) P.x += dx;
    if (!blocked(P.x, P.z + dz, 0.3) && Math.hypot(P.x - tractor.x, P.z + dz - tractor.z) > 1.4) P.z += dz;
    P.x = clamp(P.x, -HALF_W + 5, HALF_W - 5); P.z = clamp(P.z, -50, 1900);
    // walking up into a cave mouth takes him in
    for (const id in CAVES) { const m = CAVES[id].mouth; if (Math.hypot(P.x - (m.x - m.ox * 0.2), P.z - (m.z - m.oz * 0.2)) < 0.7) { enterCave(id); break; } }
  }
  P.speed = sp; S.footKm += sp * dt / 1000;
  const was = Math.floor(P.bob / Math.PI); P.bob += dt * sp * 4.2; if (Math.floor(P.bob / Math.PI) !== was) sfx.step();
}

// ---------- the camera ----------
const _n = new THREE.Vector3();
function placeCamera(dt) {
  const shake = P.shake > 0 ? (P.shake -= dt * 0.08, P.shake) : 0, cave = inCave();
  const ty = h(tractor.x, tractor.z);
  tractor.g.position.set(tractor.x, ty, tractor.z);
  if (S.inTractor) {
    // sit the tractor on the ground it's on: pitch and roll from the slope under its wheels
    const f = h(tractor.x + Math.sin(tractor.yaw) * 1.6, tractor.z + Math.cos(tractor.yaw) * 1.6) - h(tractor.x - Math.sin(tractor.yaw) * 1.1, tractor.z - Math.cos(tractor.yaw) * 1.1);
    const sd = h(tractor.x - Math.cos(tractor.yaw), tractor.z + Math.sin(tractor.yaw)) - h(tractor.x + Math.cos(tractor.yaw), tractor.z - Math.sin(tractor.yaw));
    tractor.g.rotation.set(-Math.atan2(f, 2.7) + Math.sin(S.time * 0.9) * 0.003 * tractor.speed, tractor.yaw, Math.atan2(sd, 2) * 0.6, 'YXZ');
    if (S.view === 'seat') {
      _n.set(-0.06, 2.26, -0.52).applyEuler(tractor.g.rotation).add(tractor.g.position);
      camera.position.copy(_n); camera.rotation.set(P.pitch, tractor.yaw + P.look + Math.PI, 0);
    } else {
      const yaw = tractor.yaw + P.look, back = 8.5, cx = tractor.x - Math.sin(yaw) * back, cz = tractor.z - Math.cos(yaw) * back;
      const cy = Math.max(h(cx, cz) + 1.2, ty + 3.6 - P.pitch * 4);
      camera.position.lerp(_n.set(cx, cy, cz), clamp(dt * 6, 0, 1));
      camera.lookAt(tractor.x + Math.sin(yaw) * 6, ty + 1.8 + P.pitch * 6, tractor.z + Math.cos(yaw) * 6);
    }
  } else if (cave) {
    // underground: stoop where the roof comes down
    const fl = caveFloor(cave, P.x, P.z), room = fl.ceil - fl.floor;
    P.crouch = lerp(P.crouch, room < 1.95 ? 1 : 0, clamp(dt * 6, 0, 1));
    const eye = fl.floor + Math.min(1.62, room - 0.3) + Math.sin(P.bob) * 0.025 * Math.min(1, P.speed);
    P.y = Math.abs(P.y - eye) > 2 ? eye : lerp(P.y, eye, clamp(dt * 8, 0, 1));
    camera.position.set(P.x + (Math.random() - 0.5) * shake, P.y, P.z);
    camera.rotation.set(P.pitch, P.yaw + Math.PI, 0);
  } else {
    const y = h(P.x, P.z) + 1.62 + Math.sin(P.bob) * 0.03 * Math.min(1, P.speed);
    camera.position.set(P.x + (Math.random() - 0.5) * shake, y + (Math.random() - 0.5) * shake, P.z);
    camera.rotation.set(P.pitch, P.yaw + Math.PI, 0);
  }
  const throttle = S.inTractor && !S.paused && (keys.has('KeyW') || keys.has('ArrowUp')) ? (G.redline > 0 ? 1.6 : 1) : 0;
  if (throttle && !tractor.wasThrottle) tractor.model.spit(30);       // opening the throttle coughs phosphor
  tractor.wasThrottle = !!throttle;
  tractor.model.update(S.paused ? 0 : dt, { running: S.started && tractor.stall <= 0, throttle: S.inTractor ? throttle : 0, speed: tractor.speed });
  tractor.g.updateMatrixWorld();
  for (const t of W.tractorThings || []) { const p = tractorPoint(...t.local); t.x = p.x; t.y = p.y; t.z = p.z; }
}

// ---------- the sun across the morning: up in the east, swinging north (the Waste is southern) ----------
const _c = new THREE.Color();
function updateSun() {
  const hr = hours(), el = Math.max(0.03, Math.sin((hr - 6) / 12 * Math.PI)) * 1.2, az = (90 - (hr - 6) / 12 * 180) * Math.PI / 180;
  sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  const { x: fx, z: fz } = here();
  sun.position.set(fx + sunDir.x * 120, sunDir.y * 120, fz + sunDir.z * 120); sun.target.position.set(fx, 0, fz); sun.target.updateMatrixWorld();
  const low = smooth(0.35, 0.05, sunDir.y);
  sun.color.setRGB(1, lerp(0.88, 0.62, low), lerp(0.72, 0.4, low)); sun.intensity = lerp(3.3, 2.2, low);
  _c.setRGB(lerp(0.86, 0.9, low), lerp(0.66, 0.55, low), lerp(0.52, 0.4, low)); scene.fog.color.copy(_c); skyU.uHaze.value.copy(_c);
  scene.fog.density = 0.0018 + smooth(10, 14, hr) * 0.0008;
  sky.position.copy(camera.position);
}

// ---------- what's left for every frame: bleeding, the little swarms, heat, water and nerves ----------
function hazards(dt) {
  if (S.bleed > 0) { S.health -= S.bleed * 1.3 * dt; S.bleed = Math.max(0, S.bleed - dt * (S.inTractor ? 0.3 : inCave() ? 0.15 : 0.07)); if (S.health <= 0) die('bled'); }
  if (inCave() || S.inTractor) return;
  // gossip-flies find Jacob on foot, near the dead and the abandoned
  if (!flySwarms.length) for (const src of W.flySources) { if (Math.hypot(P.x - src.x, P.z - src.z) < src.r) { if (Math.random() < dt * 0.25) spawnSwarm(src.x, src.z, 3 + Math.floor(Math.random() * 3)); break; } }
  if (!flySwarms.length && nearestRoad(P.x, P.z, 1).d > 12 && Math.random() < dt * 0.012) spawnSwarm(P.x + 8, P.z + 8, 3);
}
function survive(dt) {
  const t = heatNow(), c = inCave(), shade = c ? null : shadeAt(here().x, here().z), heat = 1 + Math.max(0, t - 35) / 10;
  const drain = c ? 0.025 : S.inTractor ? 0.014 : (P.speed > 1.6 ? 0.07 : 0.04);
  S.water = Math.max(0, S.water - dt * drain * heat * (shade && !shade.soft ? 0.3 : 1));
  if (S.water < 20) { S.health -= dt * 0.5; once('thirst', 'Mouth like the road. Drink, Jacob. F.', ['X', NEW]); }
  const calm = c ? 1.0 : S.inTractor ? 0.8 : shade ? 1.2 : 0.12;     // the tractor, the cool of the rock and any shade settle him (a gum's too: that's its bait)
  S.stress = Math.max(0, S.stress - dt * calm);
  if (S.stress > 85) S.health -= dt * 0.4;
  if (S.health <= 0) die('heat');
}

// ---------- endings ----------
function die(why) {
  if (S.dead) return; S.dead = true; S.paused = true; releaseLock();
  const cause = { stalker: 'Something came down from the rocks.', gum: 'He sat down in the shade, and let himself relax.', strider: 'The strider weighed him, and decided.', bled: 'The spinifex drank its fill.', bite: 'Something in a web, in the dark.', wire: 'A wire that should have been dead years ago.', house: 'A house that was only waiting for somebody to stand under it.', heat: 'The heat, the thirst and the voices.' }[why] || 'The Waste.';
  ui.endCard.innerHTML = `<div class="kicker">The Red Waste</div><h1>The Waste wins this time.</h1><p class="lede">${esc(cause)} The road stays where it is, indifferent.</p>
    <div class="actions"><button class="btn primary" id="end-retry">Wake up back on the tractor</button><button class="btn" id="end-restart">Start the road again</button><button class="btn" id="end-ideas">Jot what happened</button></div>`;
  ui.end.hidden = false;
}
function retry() {
  S.dead = false; S.paused = false; ui.end.hidden = true;
  Object.assign(S, { health: 55, water: Math.max(S.water, 45), stress: 30, bleed: 0, disoriented: 0, inTractor: true });
  if (G.area !== 'out') { G.area = 'out'; G.exposureTarget = 1.05; }
  P.look = 0; P.stun = 0; P.x = tractor.x; P.z = tractor.z; tractor.stall = 0; tractor.speed = 0;
  for (const s of W.stalkers) { s.state = 'perched'; s.cool = 20; s.g.position.copy(s.home); }
  for (const k in STRIDERS) { const st = STRIDERS[k]; if (st.state === 'attack' || st.state === 'assess' || st.state === 'stalk') { st.state = 'leave'; st.cool = 30; } }
  updateVitals(); bark('Back on the seat. Shaking. Everything still where it was, except my nerve.', ['X', NEW]);
}
function arrive() {
  if (S.ended) return; S.ended = true; S.paused = true; releaseLock();
  const found = FINDS.filter(f => S.finds[f.name]).length, met = Object.keys(S.met).filter(k => k !== 'ruin').map(k => SPECIES[k].name);
  const caves = Object.keys(S.visited).map(k => CAVES[k] && CAVES[k].def.name).filter(Boolean);
  ui.fxFade.classList.add('on');
  setTimeout(() => {
    ui.endCard.innerHTML = `<div class="kicker">Bleak Flats</div><h1>The south gate, at ${esc(clockText())}.</h1>
      <p class="lede">The gates of Bleak Flats do not open for free. An Ironshell in officious grey, going to rust, a vision slit glowing a dull crimson: “Scan.” Then: “Entry tax. Five bits. Or three ounces of raw water.” The price has gone up.<span class="ws"> ${tagHTML('C', CH2)}</span></p>
      <ul><li>Health ${Math.round(S.health)}, water ${Math.round(S.water)}, stress ${Math.round(S.stress)}.${S.hull ? ` The hull took ${S.hull} new scratch${S.hull === 1 ? '' : 'es'}.` : ''}</li>
      <li>${S.footKm > 0.05 ? `Walked ${(S.footKm * 1000).toFixed(0)} m of it.` : 'Never left the tractor.'}${caves.length ? ` Went into ${caves.join(', ')}.` : ''}</li>
      <li>${met.length ? 'Met: ' + met.join(', ') + '.' : 'Met nothing worth mentioning. Lucky.'}</li>
      <li>Finds on the road: ${found} of ${FINDS.length}.</li></ul>
      <p>The city isn’t built yet. Tell Claude what the road did to you, or jot it with N before you go.</p>
      <div class="actions"><button class="btn primary" id="end-stay">Keep exploring the road</button><button class="btn" id="end-ideas">Read my ideas</button><button class="btn" id="end-morning">Start the morning again</button></div>`;
    ui.end.hidden = false; ui.fxFade.classList.remove('on');
  }, reduceMotion ? 50 : 1500);
}
ui.end.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'end-retry') retry();
  if (t.id === 'end-restart') location.href = (window.__ROAD_URL || 'road.html');
  if (t.id === 'end-ideas') { ui.end.hidden = true; if (S.dead) retry(); openMenu('ideas'); }
  if (t.id === 'end-stay') { ui.end.hidden = true; S.ended = false; S.paused = false; S.flags.arrived = true; }
  if (t.id === 'end-morning') { for (const k of ['valtoria-yard-save', 'valtoria-shack-save', 'valtoria-handoff', 'valtoria-road-handoff']) try { localStorage.removeItem(k); } catch (err) { /* storage unavailable */ } location.href = window.__SHACK_URL || 'index.html'; }
});

// ---------- the frame ----------
let last = 0, millIn = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
  if (S.started && !S.paused) {
    S.time += dt * TIME_SCALE; G.time += dt;
    if (S.inTractor) driveTractor(dt); else walk(dt);
    if (inCave()) updateCave(dt); else { updateLife(dt); updateMainRoad(dt); }
    hazards(dt); survive(dt);
    target = pickTarget();
    if (!inCave() && (S.inTractor ? tractor.z : P.z) > ARRIVE_Z && !S.flags.arrived) arrive();
    // the stacks and the presses of the Flats, louder as the walls come up
    const near = smooth(1300, 1790, here().z) * (inCave() ? 0.3 : 1);
    if (near > 0 && (millIn -= dt) <= 0) { millIn = 0.9; sfx.thump(0.08 + near * 0.25); }
    if (G.area === 'seep' && Math.random() < dt * 0.6) sfx.drip();
    if (G.redline > 0) G.redline = Math.max(0, G.redline - dt);
  }
  SWAY.uTime.value = G.time;
  updateFlies(S.paused ? 0 : dt); updateSmoke(dt);
  placeCamera(dt);
  const cave = inCave();
  if (!cave) updateSun();
  // vampiris eyes: wide open in the dark, and slow to close again in the sun
  G.exposure = lerp(G.exposure, G.exposureTarget, clamp(dt * (G.exposureTarget > G.exposure ? 0.9 : 1.4), 0, 1));
  renderer.toneMappingExposure = G.exposure;
  for (const c of W.chunks || []) c.visible = Math.abs(c.userData.z - camera.position.z) < 560;
  for (const r of RELICS) r.m.rotation.y += dt * 1.5;
  if (audio.ctx) {
    const sp = S.inTractor ? Math.abs(tractor.speed) : 0, red = G.redline > 0 ? 1 : 0;
    audio.engine.gain.value = S.started && tractor.stall <= 0 ? (S.inTractor ? 0.05 + sp * 0.006 + red * 0.03 : cave ? 0 : 0.02) : 0;
    audio.o1.frequency.value = 38 + sp * 7 + red * 40; audio.o2.frequency.value = 19 + sp * 3.5 + red * 20;
    audio.wind.gain.value = cave ? 0.012 : 0.035 + (S.inTractor ? 0 : 0.02);
  }
  ui.prompt.hidden = !target || S.paused;
  if (target) { ui.promptVerb.textContent = valueOf(target.verb); ui.promptName.textContent = valueOf(target.name); ui.promptTag.innerHTML = `<span class="tag ${target.prov[0]}">${TAG_NAME[target.prov[0]]}</span>`; }
  ui.reticle.classList.toggle('on', !!target);
  if (S.started) { updateHud(dt); if ((frame.v = (frame.v || 0) + dt) > 0.25) { frame.v = 0; updateVitals(); } }
  renderer.render(cave ? cave.scene : scene, camera);
  grabThumb();
}
function resize() { const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------- building it all, then the start ----------
function readHandoff() { try { const h0 = JSON.parse(localStorage.getItem('valtoria-road-handoff') || 'null'); return h0 && h0.from === 'yard' ? h0 : null; } catch (e) { return null; } }
function begin() {
  if (S.started) return;
  initAudio();
  S.started = true; ui.title.hidden = true; ui.hud.hidden = false;
  const h0 = S.handoff = readHandoff();
  if (h0) { if (h0.clock) S.time = h0.clock * 60; tractor.model.milk.visible = !!h0.milk; tractor.model.load.visible = (h0.dung || 0) >= 6; }
  const arrive0 = () => bark(h0 && h0.milk ? 'Milk in the can, dung in the bin, and twenty clicks of the Waste between them and Cogswell. Canyon or pans. Pick your poison.' : 'Twenty clicks to Bleak Flats. The canyon, or the pans. Same heat either way, and things wanting a piece of me.', ['C', CH2 + ': the fork']);
  if (ui.fxFade.classList.contains('on')) setTimeout(() => { ui.fxFade.style.transition = ''; ui.fxFade.classList.remove('on'); ui.fadeLine.hidden = true; arrive0(); }, reduceMotion ? 50 : 1300);
  else arrive0();
  setTimeout(() => toast('W to drive · E to climb down · Tab for the notebook · N to jot an idea'), 2600);
  updateVitals(); canvas.focus();
}
async function boot() {
  resize();
  const tick = DEBUG ? (label) => console.log(`[road] ${label} ${Math.round(performance.now())} ms`) : () => {};
  reserveLife(); reserveMainRoad(); RESERVED.push({ x: ADIT.x + 3, z: ADIT.z, r: 7 });
  tick('start'); buildLand(); tick('land'); buildLife(); tick('life'); buildMainRoad(); tick('main road'); buildCaves(); tick('caves');
  tractor = G.tractor = buildTractor(); addTractorThings();
  for (const l of W.leaks) waterThing({ id: 'leak' + Math.round(l.z), name: l.name || 'Pipeline leak', x: l.x, z: l.z, r: 2.2, line: l.line || 'Pipeline water. Tastes of rust and somebody else’s taxes. It’s wet.', prov: ['X', 'the old water pipeline: ' + NEW] });
  for (const w of W.water || []) waterThing({ ...w, y: w.y, r: 1.6 });
  tractor.x = 0; tractor.z = 8; P.x = tractor.x; P.z = tractor.z;
  { updateSun(); const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(), s = sky.clone(); s.position.set(0, 0, 0); s.scale.setScalar(0.02); env.add(s); scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose(); }   // the sky, shrunk inside the capture's far plane
  setWorkshop(S.workshop);
  connectIdeas({ onChange: () => { if (!ui.menu.hidden && S.menuTab === 'ideas') renderMenu(); }, onFull: () => toast('The notebook is full. This idea is kept on this computer.') });
  tick('ready');
  requestAnimationFrame(frame);
  ui.btnStart.disabled = false; ui.btnStart.textContent = 'Drive out';
  if (/[?&]from=yard\b/.test(location.search)) begin();
}
ui.btnStart.addEventListener('click', begin);
ui.btnYard.addEventListener('click', () => { location.href = window.__YARD_URL || 'yard.html'; });
ui.btnWs.addEventListener('click', () => setWorkshop(!S.workshop));
ui.menuClose.addEventListener('click', closeMenu);
boot();
if (DEBUG) window.__road = { S, P, W, G, CAVES, STRIDERS, SWARM, things, camera, h, nearestRoad, enterCave, use, begin, sulphur, get tractor() { return tractor; }, get target() { return target; } };
