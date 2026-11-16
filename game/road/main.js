// ============================================================
// The Road to Bleak Flats: the game itself. Chapter Two's road, from
// the yard's north gate to the south gate of the Flats: a fork (the Old
// Canyon Road through the gums and the spinifex, or the old main road
// along the salt pans where the striders hunt), the breakdown under the
// old transmission line, the outskirts and their strip mines, the walls.
// Three shallow caves to walk into on the way, and a few relics in each.
//
// 1.8 km standing for twenty clicks. The land is in land.js, what lives
// on it in life.js, the old main road's ruins in mainroad.js, the caves
// in caves.js, the air (wind, dust, smoke, tracks) in air.js, the small
// stuff underfoot in detail.js, things to open, kick, throw and work in
// props.js, sound in sound.js, the keyboard, mouse and controller in
// input.js, and the shared state, materials and field notes in core.js.
// This file is the player: the tractor and Jacob on foot, the camera,
// the sky and the sun, the HUD and the notebook, heat, water, the endings.
//
// It draws through the same post chain as the yard (shared/post.js):
// HDR, contact shade, bloom, sun shafts, heat shimmer, a film grade.
//
// The tractor (shared/tractor.js; unnamed, Rustbucket is the bull) is
// the safest place out here, but not safe: the anima-shield gauge reads
// "Non-existent" (Chapter Two), and it only takes the edge off the flies.
// Units are metres. The road runs north along +z; east is −x.
// ============================================================
import { THREE, clamp, lerp, smooth, esc, reduceMotion, valueOf, TAG_NAME, GUIDE, CH1, CH2, NEW, tagHTML, G, S, P, W, things, blockers, shades, hooks, addThing, bark, once, meet, SPECIES, FINDS, RELICS, SWAY, M, mesh, initMaterials } from './core.js';
import { LORE_KM, ARRIVE_Z, HALF_W, h, placeAt, nearestRoad, saltAt, landBlocked, nearbySpinifex, buildLand, RESERVED, ADIT, inCanyon, TOWERS } from './land.js';
import { reserveLife, buildLife, updateLife, sulphurBlast, SWARM, STRIDERS } from './life.js';
import { CAVES, buildCaves, enterCave, caveConstrain, caveFloor, updateCave } from './caves.js';
import { reserveMainRoad, buildMainRoad, updateMainRoad } from './mainroad.js';
import { WIND, buildAir, updateAir, setParticleScale, footfall, airState } from './air.js';
import { buildDetail, updateDetail, setDetailQuality } from './detail.js';
import { reserveProps, buildProps, updateProps, primaryAction, canThrow, propState } from './props.js';
import { HANDS, buildHands, playHand, updateHands } from './hands.js';
import { buildFar, updateFar } from './far.js';
import { buildRooms, updateRooms } from './rooms.js';
import { buildDriver } from './driver.js';
import { buildGate, updateGate, gatePose, GS } from './gate.js';
import { audio, initAudio, sfx, updateAudio, setMuted } from './sound.js';
import { input, bindInput, pollInput, takeLook, saveSettings, rumble, navFocus, releaseLock } from './input.js';
import { buildJacob } from './jacob.js';
import { buildTractor as buildTractorModel } from '../shared/tractor.js';
import { ideas, IDEA_KINDS, connectIdeas, addIdea, deleteIdea, exportIdeas, ideaWhere } from '../shared/notebook.js';
import { POSTU, QUALITY, QUALITY_ORDER, makePost, HAZEU, hazeify } from '../shared/post.js';
import { voice, saveVoice, speak, stopVoice } from '../shared/voice.js';

const SPEED = { tractor: 6, offroad: 0.56, salt: 0.85, reverse: 2, walk: 1.55, run: 2.2, cave: 0.85, crouch: 0.5, radius: 0.3 };   // run is how many times faster than a walk
const TIME_SCALE = (LORE_KM * 1000) / 1800;      // world seconds per real second: five minutes of driving is fifty-five on the clock
const CANISTER_MAX = 6;
const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search), DEBUG = QS.has('debug');
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

// ---------- renderer, the post chain, scene and camera ----------
const canvas = $('scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }); }
catch (e) { $('btn-start').textContent = 'This needs WebGL, and this browser has it switched off'; throw e; }
const perf = { acc: 0, n: 0, ratio: 1, max: 1, cool: 3, slow: 0, upWait: 0, backoff: 8, raised: false };
perf.max = Math.min(devicePixelRatio || 1, 2); perf.ratio = perf.max;
renderer.setPixelRatio(perf.ratio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;          // PCF with a radius: soft-edged shadows, as in the yard
const post = makePost(renderer);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd2a07e, 0.0021);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 6000);          // far enough for the outer ranges, 3 km past the land (far.js)
camera.rotation.order = 'YXZ';
const view = { baseFov: 60, camYaw: 0, camPos: new THREE.Vector3(), eyeY: 0, lookIdle: 0, lastX: 0, lastZ: 0, chunkFar: 560, chase: 8.2, chaseNow: 8.2 };
const hemi = new THREE.HemisphereLight(0xb8c0d8, 0x8a4426, 0.5);   // the sky's blue and the dirt's red bounce: shade out here is never black
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b4, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SHADOW_HALF = 58;
Object.assign(sun.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 320 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const sunDir = new THREE.Vector3(), shadowDir = new THREE.Vector3(0, 1, 0);

// ---------- the sky: a dusty gradient, a hard sun, thin high cloud drawn out along the wind ----------
// Written in linear light, like everything else, so the horizon is the fog's own colour and far things fade into it.
const IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]], OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const mul3 = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const shown = (c, e = 1.05) => mul3(OUT, mul3(IN, c.map(x => x * e / 0.6)).map(x => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081))).map(x => { x = clamp(x, 0, 1); return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; });
// the linear colour that comes out of the tone curve as this one on screen (worked out once, at load)
function lit(r, g, b) {
  const want = [r, g, b]; let c = want.map(x => Math.pow(x, 2.2) * 0.6);
  for (let k = 0; k < 300; k++) { const d = shown(c); c = c.map((x, i) => Math.max(0, x + (want[i] - d[i]) * 0.35 * (x + 0.05))); }
  return new THREE.Color().setRGB(c[0], c[1], c[2]);
}
const SKY = {
  hazeLow: lit(0.9, 0.66, 0.48), hazeHigh: lit(0.87, 0.77, 0.67),         // the horizon (and the fog): orange at dawn, pale dust by mid-morning
  zenLow: lit(0.3, 0.33, 0.5), zenHigh: lit(0.25, 0.39, 0.66),
  midLow: lit(0.68, 0.6, 0.62), midHigh: lit(0.6, 0.64, 0.74),
  sunHazeLow: lit(0.99, 0.8, 0.52), sunHazeHigh: lit(0.97, 0.9, 0.78),     // what the haze does towards the sun
};
const skyU = { uSun: { value: sunDir }, uHaze: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uZen: { value: new THREE.Color() }, uSunHaze: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color(1, 0.8, 0.55) }, uDrift: { value: new THREE.Vector2() }, uCloud: { value: 0.85 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vD; uniform vec3 uSun; uniform vec3 uHaze; uniform vec3 uMid; uniform vec3 uZen; uniform vec3 uSunHaze; uniform vec3 uSunCol; uniform vec2 uDrift; uniform float uCloud;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
    void main(){
      vec3 d = normalize(vD); float h = d.y, s = max(dot(d, uSun), 0.0);
      vec3 hz = mix(uHaze, uSunHaze, pow(s, 5.0) * 0.8);                       // the same sun-ward glow the haze has
      vec3 c = mix(hz, uMid, smoothstep(0.0, 0.2, h)); c = mix(c, uZen, smoothstep(0.14, 0.85, h));
      if (h < 0.0) c = hz;
      // cirrus: mares' tails a long way up, combed out along the wind, lit warm from the sun's side
      if (h > 0.015) {
        vec2 p = d.xz / (h + 0.1) * 0.9 + uDrift;
        float n = fbm(p * vec2(0.55, 1.9) + fbm(p * 0.7) * 1.4), n2 = fbm(p * 4.3 + 11.0);
        float cov = smoothstep(0.5, 0.82, n * 0.8 + n2 * 0.2) * uCloud * smoothstep(0.015, 0.3, h);
        vec3 cc = mix(uMid * 1.25, uSunHaze * (1.15 + 1.6 * pow(s, 3.0)), 0.55 + 0.35 * n2);
        c = mix(c, cc, cov * 0.7);
      }
      c += uSunCol * (pow(s, 8.0) * 0.12 + pow(s, 80.0) * 0.55 + pow(s, 900.0) * 5.0);
      c += vec3(1.0, 0.96, 0.88) * smoothstep(0.99962, 0.99984, s) * 60.0;       // the disc, hot enough to bloom
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
Object.assign(G, { renderer, scene, camera, maxAniso, exposure: 1.05, exposureTarget: 1.05, redline: 0, post });
initMaterials(maxAniso);

// ---------- what carries over between journeys ----------
try { const s = JSON.parse(localStorage.getItem('valtoria-road-save') || '{}'); S.finds = s.finds || {}; } catch (e) { /* storage unavailable */ }
try { S.workshop = localStorage.getItem('valtoria-workshop') === '1'; } catch (e) { /* storage unavailable */ }
// an ear-cage found in the yard (the Farm sketch's curio) keeps the flies out of his ears here too
try { const c = JSON.parse(localStorage.getItem('farm-of-rust-collection') || '{}'); S.earcage = (c.found || []).includes('earcage'); } catch (e) { /* storage unavailable */ }
function saveRoad() { try { localStorage.setItem('valtoria-road-save', JSON.stringify({ finds: S.finds })); } catch (e) { /* storage unavailable */ } }
S.visited = {};

// ---------- the HUD ----------
const ui = {};
for (const id of ['hud', 'title', 'btn-start', 'btn-yard', 'btn-ws', 'place', 'track-fill', 'km', 'compass', 'compass-strip', 'compass-note', 'time', 'heat', 'reticle', 'prompt', 'prompt-key', 'prompt-verb', 'prompt-name', 'prompt-tag', 'whisper', 'thought', 'book', 'toasts', 'mode', 'status', 'gauges', 'menu', 'menu-body', 'menu-close', 'jot', 'jot-thumb', 'jot-ctx', 'jot-kinds', 'jot-text', 'jot-where', 'jot-cancel', 'jot-save', 'end', 'end-card', 'fx-fade', 'fade-line', 'fx-dark', 'fx-glare', 'fx-hurt', 'fx-bleed', 'fx-stress', 'fx-haze', 'fx-swirl', 'pad-note', 'choice']) ui[id.replace(/-(.)/g, (_, c) => c.toUpperCase())] = $(id);
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
// what's underfoot, for the sound of a step and the mark it leaves
function surfaceAt(x, z) {
  if (inCave()) return 'rock';
  for (const s of shades) if ((s.why === 'shack' || s.why === 'house' || s.why === 'shed') && Math.hypot(x - s.x, z - s.z) < s.r) return 'boards';
  if (saltAt(x, z) > 0.4) return 'salt';
  const n = nearestRoad(x, z, 1);
  if (n.s && n.s.route !== 'canyon' && n.d < 3.7) return 'seal';
  return inCanyon(x, z) || h(x, z) > 4 ? 'scree' : 'dirt';
}
let thoughtTimer = 0, whisperTimer = 0, bookTimer = 0;
function say(text, prov = ['X', NEW]) {
  ui.thought.innerHTML = `${esc(text)}<span class="tagline ws">${tagHTML(...prov)}</span>`;
  ui.thought.classList.add('on'); clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(() => ui.thought.classList.remove('on'), clamp(2200 + text.length * 55, 3000, 8000));
  speak(text, 'jacob', { muted: audio.muted });
}
function whisper(text, prov = ['C', CH2], ms = 2800) {
  ui.whisper.innerHTML = `${esc(text)}<span class="tagline ws">${tagHTML(...prov)}</span>`; ui.whisper.classList.add('on');
  clearTimeout(whisperTimer); whisperTimer = setTimeout(() => ui.whisper.classList.remove('on'), ms);
  if (!voice.cur) speak(text, 'whisper', { muted: audio.muted });
}
// a line from the books, when a relic calls it up: the Age of Glass, remembered (in the Book's voice, as in the yard)
function book([text, src]) {
  ui.book.innerHTML = `<p>${esc(text)}</p><span class="src">${esc(src)}</span><span class="ws"> ${tagHTML('C', 'quoted from the book')}</span>`;
  ui.book.classList.add('on'); clearTimeout(bookTimer); bookTimer = setTimeout(() => ui.book.classList.remove('on'), 9000);
  speak(text, 'book', { muted: audio.muted });
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
  rumble(0.5, clamp(amount / 40, 0.2, 1), 180);
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
  const key = [S.inTractor, S.hull, S.sulphur, G.redline > 0, input.mode].join();
  if (key === gaugeKey) return; gaugeKey = key;
  const hull = S.hull ? `${S.hull} new scratch${S.hull === 1 ? '' : 'es'}` : 'Old scratches';
  ui.gauges.innerHTML = `<div class="gk">Gauges<span class="ws"> ${tagHTML('C')}</span></div>
    <span>Engine temp</span><b class="${G.redline > 0 ? 'bad' : 'warn'}">${G.redline > 0 ? 'Redline' : 'High'}</b>
    <span>Fuel pressure</span><b class="warn">Low</b>
    <span>Anima-shield</span><b class="bad">Non-existent</b>
    <span>Coolant</span><b>High</b>
    <span>Oil</span><b><i class="dial" aria-label="dial spinning"></i></b>
    <span>Hull<span class="ws"> ${tagHTML('X')}</span></span><b>${hull}</b>
    <span>Sulphur-Salts</span><b class="${S.sulphur ? '' : 'bad'}">${S.sulphur ? S.sulphur + (S.sulphur === 1 ? ' tin' : ' tins') + ' · ' + (input.mode === 'pad' ? 'LB' : 'G') : 'None'}</b>`;
}
const COMPASS_MARKS = (() => { const out = []; for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360, lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[n]; out.push(`<span class="${lab ? 'c' : ''}">${lab || '·'}</span>`); } return out.join(''); })();
ui.compassStrip.innerHTML = COMPASS_MARKS;
let needle = 0, modeKey = '';
function updateHud(dt) {
  ui.time.textContent = clockText();
  const t = heatNow(), c = inCave(); ui.heat.textContent = `${Math.round(t)} °C · ${c ? 'cool, under rock' : t > 46 ? 'scorching' : t > 40 ? 'hazy' : 'clear'}`;
  const { x, z } = here();
  const place = (c ? c.def.name : placeAt(x, z)).replace(/^./, ch => ch.toUpperCase());
  if (ui.place.textContent !== place) ui.place.textContent = place;
  ui.trackFill.style.width = clamp(z / ARRIVE_Z * 100, 0, 100) + '%';
  ui.km.textContent = `${clamp((ARRIVE_Z - z) / ARRIVE_Z * LORE_KM, 0, LORE_KM).toFixed(1)} km to Bleak Flats`;
  // the compass: true heading, unless the weed has got into the needle
  const heading = ((-viewYaw() * 180 / Math.PI) % 360 + 360) % 360;
  const wild = S.disoriented > 0 ? Math.sin(S.time * 0.013) * 140 + Math.sin(S.time * 0.051) * 60 : 0;
  needle += angDiff((heading + wild) * Math.PI / 180, needle * Math.PI / 180) * 180 / Math.PI * clamp(dt * (S.disoriented > 0 ? 2 : 8), 0, 1);
  needle = ((needle % 360) + 360) % 360;
  ui.compassStrip.style.transform = `translateX(${(ui.compass.clientWidth / 2) - (needle + 360) / 15 * 30 - 15}px)`;
  ui.compass.hidden = !S.compass; ui.compass.classList.toggle('wild', S.disoriented > 0);
  ui.compassNote.hidden = !(S.compass && S.disoriented > 0);
  ui.compassNote.textContent = 'Compass-weed · the needle’s lying. Follow the wires.';
  const pad = input.mode === 'pad', near = !c && !S.inTractor && Math.hypot(P.x - tractor.x, P.z - tractor.z) < 3.4, key = [c ? 1 : 0, S.inTractor, S.view, pad, near].join();
  if (key !== modeKey) {
    modeKey = key;
    ui.mode.innerHTML = c ? (pad ? `<b>Underground</b>Left stick walk · A use · X drink · walk back out into the light to leave` : `<b>Underground</b>WASD walk · Shift hurry · E use · F drink · walk back out into the light to leave`)
      : S.inTractor ? (pad ? `<b>The tractor</b>RT throttle · LT brake · left stick steer · X drink · LB Sulphur-Salts · B radio · Y ${S.view === 'chase' ? 'seat' : 'chase'} view · A climb down`
        : `<b>The tractor</b>W/S throttle · A/D steer · F drink · G Sulphur-Salts · R radio · V ${S.view === 'chase' ? 'seat' : 'chase'} view · E climb down`)
      : (pad ? `<b>On foot</b>Left stick walk · L3 run · A use · X drink · RT throw a stone · ${near ? 'A climb aboard' : 'the tractor waits'}`
        : `<b>On foot</b>WASD walk · Shift run · E use · F drink · click or Q throw a stone · ${near ? 'E climb aboard' : 'the tractor waits'}`);
  }
  ui.fxStress.style.opacity = smooth(45, 100, S.stress);
  ui.fxBleed.style.opacity = clamp(S.bleed / 2, 0, 0.9);
  ui.fxHaze.style.opacity = S.haze;
  ui.fxSwirl.style.opacity = S.disoriented > 0 ? Math.min(1, S.disoriented / 6) * 0.8 : 0;
}

// ---------- the hooks the land, its life and the caves call ----------
Object.assign(hooks, {
  bark: say, book, toast, hurt, updateVitals, whisper, rumble, padMode: () => input.mode === 'pad',
  sfx: new Proxy(sfx, { get: (o, k) => o[k] || (() => {}) }),
  found(def) {
    S.finds[def.name] = { text: def.text, where: def.where, at: clockText() };
    saveRoad(); sfx.find(); toast(`Found · ${def.name}`);
    bark(def.text, ['X', 'a find: ' + NEW]);
    if (def.counts === 'sulphur') S.sulphur++;
    if (def.book) setTimeout(() => book(def.book), clamp(2600 + def.text.length * 62, 4200, 14000));           // once he's taken it in, a line from the books comes to mind
    updateVitals();
  },
  addWater: (def) => waterThing(def),
  // into the dark: a moment of black while his eyes open up
  fade(sec) {
    flash(ui.fxDark, sec * 3); sfx.step('rock');
    S.visited[G.area] = true; view.eyeY = -99; P.vx = P.vz = 0;        // the eye height snaps to the cave floor
    const c = inCave(); if (c) c.scene.add(jacob.root);
    if (flySwarms.length) { for (const sw of flySwarms) sw.life = 0; toast('The gossip-flies hang at the mouth, and don’t follow'); }
  },
  // and back out: the light just erases everything for a moment
  glare() {
    flash(ui.fxGlare, 1.8); scene.add(jacob.root); view.eyeY = -99; P.vx = P.vz = 0;
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
// somebody else speaking: the Ironshell at the gate (its words on screen where the radio's go, in its own voice)
hooks.caption = (who, text, prov, role = 'radio', ms = 3600) => {
  ui.whisper.innerHTML = `<span style="font-style:normal;color:#e8b0a4">${esc(who)} · </span>${esc(text)}<span class="tagline ws">${tagHTML(...prov)}</span>`;
  ui.whisper.classList.add('on'); clearTimeout(whisperTimer); whisperTimer = setTimeout(() => ui.whisper.classList.remove('on'), ms);
  speak(text, role, { muted: audio.muted });
};
// a choice put to him: a title, a line, and two or three things he can do about it (1, 2, 3 on the keys; A on a controller)
let choiceDef = null;
hooks.choice = (def) => {
  choiceDef = def;
  ui.choice.hidden = !def;
  if (!def) { canvas.focus(); return; }
  ui.choice.innerHTML = `<div class="ck">${esc(def.title)}<span class="ws"> ${tagHTML(...def.prov)}</span></div><p>${esc(def.note)}</p><div class="actions">` +
    def.options.map((o, i) => `<button class="btn" data-pick="${i}" ${o.disabled ? 'disabled' : ''}><kbd>${i + 1}</kbd> ${esc(o.label)}<small>${esc(o.sub || '')}</small></button>`).join('') + '</div>';
  releaseLock();
  if (input.mode === 'pad') setTimeout(() => navFocus(ui.choice, 'down'), 0);
};
function pickChoice(i) { const d = choiceDef, o = d && d.options[i]; if (!o || o.disabled) return; hooks.choice(null); o.pick(); }
ui.choice.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) pickChoice(Number(b.dataset.pick)); });
addEventListener('keydown', (e) => { if (choiceDef && /^Digit[1-9]$/.test(e.code) && ui.menu.hidden && ui.jot.hidden) pickChoice(Number(e.code.slice(5)) - 1); });
hooks.arrive = () => { if (!S.flags.arrived) arrive(); };
hooks.fillWater = (line, prov) => { S.sips = 4; const c = topUpCanister(); sfx.fill(); updateVitals(); bark(line + c, prov); };

// ---------- the tractor: the shared model, and where it is ----------
let tractor = null, jacob = null, driver = null;
function buildTractor() {
  const model = buildTractorModel(THREE, { maxAniso });
  scene.add(model.group);
  // how it sits: where it is, which way it points, how fast; and the driver's hands and feet, eased (thr, brk, steer)
  return { model, g: model.group, x: 0, z: 0, yaw: 0, speed: 0, stall: 0, wasThrottle: false, wired: 0, thr: 0, brk: 0, steer: 0, offroad: false,
    sus: { p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0 }, pitch: 0, roll: 0 };
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
  if (!/static/.test(line)) setTimeout(() => speak(line, 'radio', { muted: audio.muted }), 500);
}
// Sulphur-Salts in the intake, then redline it (Chapter Two)
function sulphur() {
  if (!S.inTractor) { bark(S.sulphur ? 'The salts go in the intake. Aboard first, then redline it.' : 'No salts left anyway.', ['C', CH2]); return; }
  if (!S.sulphur) { bark('Out of salts. Not enough for a second blast.', ['C', CH2]); return; }
  S.sulphur--; G.redline = 4; tractor.model.sulphur(5); tractor.stall = 0; sfx.sizzle(); rumble(0.8, 0.6, 900);
  bark('Chew on this.', ['C', CH2]);
  let hit = sulphurBlast(tractor.x, tractor.z);
  if (flySwarms.length) { hit = true; for (const sw of flySwarms) sw.life = 0; }
  setTimeout(() => {
    if (hit) { S.stress = Math.max(0, S.stress - 30); bark('A thick, yellow-white cloud. Rotten eggs and hellfire. The collective voice shatters into static, and the swarm breaks apart.', ['C', CH2]); }
    else bark(S.sulphur ? 'Rotten eggs and hellfire, and nothing out here to use it on. Wasted a tin.' : 'Rotten eggs and hellfire, and nothing out here to use it on. That was the last tin.', ['X', NEW]);
  }, 1600);
  updateVitals();
}

// ---------- flies: small moving things ----------
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

// which way he's facing in the world (in a cave, P.yaw is the cave's own; its mouth says how it sits)
const viewYaw = () => { const c = inCave(); return c ? P.yaw + Math.atan2(c.mouth.ox, c.mouth.oz) : S.inTractor ? tractor.yaw + P.look : P.yaw; };

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
    P.x = tractor.x + side.x; P.z = tractor.z + side.z; P.yaw = tractor.yaw + P.look; P.look = 0; P.vx = P.vz = 0; sfx.door();
    if (blocked(P.x, P.z, 0.3)) { P.x = tractor.x - side.x; P.z = tractor.z - side.z; }        // the other side, if a wall's in the way
    jacob.snap(P.yaw + Math.PI); view.eyeY = -99;
    once('down', 'Down off the tractor. The air tastes of hot iron, and everything out here has noticed.', ['X', NEW]);
    updateVitals(); return;
  }
  if (target) { playHand('reach'); target.use(); rumble(0.2, 0.1, 60); return; }
  if (!inCave() && Math.hypot(P.x - tractor.x, P.z - tractor.z) < 3.4) {
    S.inTractor = true; P.look = 0; view.camYaw = tractor.yaw; sfx.door(); tractor.model.spit(20);
    if (tractor.wired) { tractor.wired = 0; tractor.stall = 2.5; bark('Dead. Jaw-jaws had at the ignition wiring. Twist it back together… there. She coughs, and catches.', ['P', 'the Farm of Rust sketch']); }
    else if (flySwarms.length) bark('Back aboard. The shielding hums. The whispering thins out, but it doesn’t stop.', ['C', CH2 + ': the anima-shield gauge reads “Non-existent”']);
    else once('shield', 'Back aboard. The shielding hums, for what it’s worth. The gauge says it doesn’t exist.', ['C', CH2]);
    updateVitals();
  }
}
function drink() {
  if (S.water > 92) { bark('Not thirsty yet. Out here you ration even that.', ['X', NEW]); return; }
  if (S.inTractor && S.can) { S.can--; S.water = Math.min(100, S.water + 30); setTimeout(() => sfx.gulp(), 400); if (S.view === 'seat') playHand('drink'); updateVitals(); return; }   // at the wheel, off the canister's tap
  if (!S.sips) { once('dry', S.can ? 'Bag’s empty. There’s some in the canister on the tractor.' : 'Bag’s empty, canister too. The pipeline leaks, if you know where.', ['X', NEW]); return; }
  S.sips--; S.water = Math.min(100, S.water + 30); playHand('drink'); setTimeout(() => sfx.gulp(), 450); updateVitals();
}

// ---------- the jotter (N) and the notebook ----------
const jot = { kind: 'gameplay', ctx: null, thumb: '', want: false };
function openJot() {
  if (!ui.jot.hidden || !S.started || S.ended || S.dead) return;
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
  const ok = await addIdea(text, jot.kind, 'road-3', { ...c, pos: [+p.x.toFixed(1), +p.z.toFixed(1)] }, jot.thumb);
  toast(ok ? 'Idea kept in the notebook' : 'Idea kept on this computer');
}
const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 320; thumbCanvas.height = 180;
function grabThumb() {
  if (!jot.want) return; jot.want = false;
  try { const src = renderer.domElement, x = thumbCanvas.getContext('2d'), hh = src.width / (16 / 9); x.drawImage(src, 0, Math.max(0, (src.height - hh) / 2), src.width, Math.min(src.height, hh), 0, 0, 320, 180); jot.thumb = thumbCanvas.toDataURL('image/jpeg', 0.72); ui.jotThumb.src = jot.thumb; ui.jotThumb.hidden = false; } catch (e) { jot.thumb = ''; }
}
ui.jotKinds.addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; jot.kind = b.dataset.kind; for (const c of ui.jotKinds.children) c.setAttribute('aria-pressed', String(c === b)); });
ui.jotCancel.addEventListener('click', closeJot); ui.jotSave.addEventListener('click', saveJot);

const TABS = ['finds', 'guide', 'ideas', 'settings'];
function openMenu(tab) { if (S.ended || S.dead || !S.started) return; if (tab) S.menuTab = tab; S.paused = true; releaseLock(); stopVoice(); ui.menu.hidden = false; renderMenu(); if (input.mode === 'pad') setTimeout(() => navFocus(ui.menu, 'down'), 0); }
function closeMenu() { ui.menu.hidden = true; S.paused = false; canvas.focus(); }
const hint = (w) => /^off /.test(w) ? `Something ${w}` : /^a /.test(w) ? `Something at ${w}` : `Something in ${w}`;
const onOff = (v) => v ? 'On' : 'Off';
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
    const s = input.settings, V = voice.settings;
    html = `<h3>Picture</h3>
      <div class="set"><span>Quality${post.supported ? '' : ' <span class="src">(this browser can only do Low)</span>'}</span><span class="seg" role="group" aria-label="Quality">${QUALITY_ORDER.map(k => `<button type="button" class="btn" data-q="${k}" aria-pressed="${k === post.key}" ${k !== 'low' && !post.supported ? 'disabled' : ''}>${QUALITY[k].label}</button>`).join('')}</span></div>
      <div class="set"><label for="set-bright">Brightness</label><span><input type="range" id="set-bright" min="0.6" max="1.6" step="0.05" value="${s.bright}"> <output id="set-bright-v">${Math.round(s.bright * 100)}%</output></span></div>
      <div class="set"><label for="set-fov">Field of view</label><span><input type="range" id="set-fov" min="70" max="104" step="2" value="${s.fov}"> <output id="set-fov-v">${s.fov}°</output></span></div>
      <div class="set"><span>Head-bob and sway</span><button class="btn" id="set-bob" aria-pressed="${s.bob !== false}">${onOff(s.bob !== false)}</button></div>
      <h3>Controls</h3>
      <div class="set"><label for="set-sens">Look sensitivity</label><span><input type="range" id="set-sens" min="0.3" max="2.5" step="0.1" value="${s.sens}"> <output id="set-sens-v">${Number(s.sens).toFixed(1)}×</output></span></div>
      <div class="set"><span>Invert look up and down</span><button class="btn" id="set-invert" aria-pressed="${!!s.invert}">${onOff(s.invert)}</button></div>
      <div class="set"><span>Controller rumble</span><button class="btn" id="set-rumble" aria-pressed="${s.rumble !== false}">${onOff(s.rumble !== false)}</button></div>
      <p>${input.mode === 'pad'
    ? 'Driving: RT throttle, LT brake and reverse, left stick steers, right stick looks, X drink, LB Sulphur-Salts, B the radio, Y seat or chase view, RB compass, A climb down (stop first). On foot: left stick walks, L3 or LT runs, A uses things, climbs aboard or goes into a cave, X drink, RT throws a stone. Menu opens this notebook; View opens the finds.'
    : 'Driving: W/S throttle and brake, A/D steer, mouse looks, F drink from the canister, G Sulphur-Salts into the intake, R the radio, V seat or chase view, E climb down (stop first). On foot: WASD, Shift run, E use, climb aboard or go into a cave, F drink, click or Q to throw a stone. Always: C compass, Tab this notebook, N jot an idea, Esc pause.'}</p>
      <h3>Sound</h3>
      <div class="set"><span>Sound</span><button class="btn" id="set-mute" aria-pressed="${!audio.muted}">${onOff(!audio.muted)}</button></div>
      <div class="set"><span>Jacob’s thoughts, spoken${voice.ok ? '' : ' <span class="src">(this browser has no voices)</span>'}</span><button class="btn" id="set-voice" aria-pressed="${!!V.on}" ${voice.ok ? '' : 'disabled'}>${onOff(V.on)}</button></div>
      <div class="set"><label for="set-vvol">Voice volume</label><span><input type="range" id="set-vvol" min="0" max="1" step="0.05" value="${V.vol}"> <output id="set-vvol-v">${Math.round(V.vol * 100)}%</output></span></div>
      <h3>The workshop</h3>
      <div class="set"><span>Workshop view: tags on every line and thing</span><button class="btn" id="set-ws" aria-pressed="${S.workshop}">${onOff(S.workshop)}</button></div>
      <div class="set"><span>Compass on screen</span><button class="btn" id="set-compass" aria-pressed="${S.compass}">${onOff(S.compass)}</button></div>
      <div class="set"><span>Leave the road</span><span><button class="btn" id="set-yard">Back to the yard</button> <button class="btn" id="set-restart">Start the road again</button></span></div>`;
  }
  ui.menuBody.innerHTML = html;
}
ui.menu.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const s = input.settings, again = (sel) => { renderMenu(); const el = ui.menuBody.querySelector(sel); if (el) el.focus(); };
  if (t.dataset.tab) { S.menuTab = t.dataset.tab; renderMenu(); return; }
  if (t.dataset.del) { deleteIdea(t.dataset.del); return; }
  if (t.dataset.q) { if (t.dataset.q !== post.key) { s.quality = t.dataset.q; saveSettings(); applyQuality(t.dataset.q); } again(`[data-q="${t.dataset.q}"]`); return; }
  if (t.id === 'menu-close') closeMenu();
  if (t.id === 'ideas-export') exportIdeas().then(r => toast(r === 'saved' ? 'Ideas exported' : r === 'declined' ? 'Export cancelled' : 'Couldn’t export here. The PC copy can.'));
  if (t.id === 'set-ws') { setWorkshop(!S.workshop); again('#set-ws'); }
  if (t.id === 'set-compass') { S.compass = !S.compass; again('#set-compass'); }
  if (t.id === 'set-bob') { s.bob = s.bob === false; saveSettings(); again('#set-bob'); }
  if (t.id === 'set-invert') { s.invert = !s.invert; saveSettings(); again('#set-invert'); }
  if (t.id === 'set-rumble') { s.rumble = s.rumble === false; saveSettings(); again('#set-rumble'); if (s.rumble) rumble(0.5, 0.5, 200); }
  if (t.id === 'set-mute') { initAudio(); setMuted(!audio.muted); again('#set-mute'); }
  if (t.id === 'set-voice') { voice.settings.on = !voice.settings.on; saveVoice(); if (!voice.settings.on) stopVoice(); again('#set-voice'); }
  if (t.id === 'set-yard') location.href = (window.__YARD_URL || 'yard.html');
  if (t.id === 'set-restart') location.href = (window.__ROAD_URL || 'road.html');
});
ui.menuBody.addEventListener('input', (e) => {
  const id = e.target.id, v = Number(e.target.value), o = $(id + '-v'), s = input.settings;
  if (id === 'set-sens') { s.sens = v; if (o) o.textContent = v.toFixed(1) + '×'; }
  if (id === 'set-bright') { s.bright = v; if (o) o.textContent = Math.round(v * 100) + '%'; }
  if (id === 'set-fov') { s.fov = v; resize(); if (o) o.textContent = v + '°'; }
  if (id === 'set-vvol') { voice.settings.vol = v; saveVoice(); if (o) o.textContent = Math.round(v * 100) + '%'; return; }
  saveSettings();
});
function setWorkshop(on) {
  S.workshop = on; document.body.classList.toggle('workshop', on);
  ui.btnWs.textContent = 'Workshop view: ' + (on ? 'on' : 'off'); ui.btnWs.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('valtoria-workshop', on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}

// ---------- what's solid: everything the land and its builders registered, in a grid so it's cheap to ask ----------
const CELL = 8;
let grid = null, gridN = -1;
function buildGrid() {
  grid = new Map(); gridN = blockers.length;
  for (const b of blockers) {
    const c = b.r !== undefined;
    if (c && !(b.r > 0)) continue;
    const x0 = Math.floor((c ? b.x - b.r : b.x0) / CELL), x1 = Math.floor((c ? b.x + b.r : b.x1) / CELL), z0 = Math.floor((c ? b.z - b.r : b.z0) / CELL), z1 = Math.floor((c ? b.z + b.r : b.z1) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = i + ',' + j; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(b); }
  }
}
function* solidsNear(x, z, r) {
  if (blockers.length !== gridN) buildGrid();
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const l = grid.get(i + ',' + j); if (l) yield* l; }
  if (W.dynamic) yield* W.dynamic;                 // doors and the like, which open and shut
}
function blocked(x, z, r) {
  for (const b of solidsNear(x, z, r)) {
    if (b.off) continue;
    if (b.r !== undefined) { if (Math.hypot(x - b.x, z - b.z) < b.r + r) return true; }
    else if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return landBlocked(x, z, r);
}
// push a round thing out of whatever it's overlapping, so it slides along walls and round posts; returns how far it was moved
function collide(p, r) {
  let moved = 0;
  for (const b of solidsNear(p.x, p.z, r)) {
    if (b.off) continue;
    if (b.r !== undefined) {
      const dx = p.x - b.x, dz = p.z - b.z, d2 = dx * dx + dz * dz, rr = r + b.r;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4; p.x = b.x + dx / d * rr; p.z = b.z + dz / d * rr; moved += rr - d;
    } else {
      const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), push = (r - d) / d; p.x += dx * push; p.z += dz * push; moved += r - d; }
      else { const l = p.x - b.x0, rt = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rt, t, bt); if (m === l) p.x = b.x0 - r; else if (m === rt) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r; moved += m + r; }
    }
  }
  return moved;
}
hooks.blocked = blocked;

// ---------- moving: the tractor ----------
function driveTractor(dt) {
  const T = tractor;
  // keys are all or nothing, so the pedals and the wheel are eased; a trigger or a stick comes through as it is
  T.thr += (input.throttle - T.thr) * damp(input.throttle > T.thr ? 4 : 8, dt);
  T.brk += (input.brake - T.brk) * damp(10, dt);
  T.steer += (input.steer - T.steer) * damp(Math.abs(input.steer) > Math.abs(T.steer) ? 4.2 : 7, dt);
  const n = nearestRoad(T.x, T.z, 1), salt = saltAt(T.x, T.z);
  T.offroad = !n.s || n.d > (n.s.route === 'canyon' ? 3.2 : 4.6);
  const crush = nearbySpinifex(T.x, T.z).length ? 0.85 : 1;
  const max = SPEED.tractor * (T.offroad ? (salt > 0.5 ? SPEED.salt : SPEED.offroad) : 1) * crush * (G.redline > 0 ? 1.3 : 1);
  if (T.stall > 0) { T.stall -= dt; T.speed = lerp(T.speed, 0, clamp(dt * 3, 0, 1)); }
  else if (T.brk > 0.05) T.speed = T.speed > 0.2 ? Math.max(0, T.speed - dt * 6 * T.brk) : Math.max(-SPEED.reverse * T.brk, T.speed - dt * 1.5);
  else if (T.thr > 0.03) { const want = max * T.thr; T.speed = T.speed < want ? Math.min(want, T.speed + dt * 2.2 * (0.35 + 0.65 * T.thr)) : Math.max(want, T.speed - dt * 1.2); }      // hold a pedal part-way and she holds a speed
  else T.speed = T.speed > 0 ? Math.max(0, T.speed - dt * 1.4) : Math.min(0, T.speed + dt * 1.4);
  if (T.speed > max) T.speed = lerp(T.speed, max, clamp(dt * 2, 0, 1));
  const drift = S.disoriented > 0 ? Math.sin(S.time * 0.02) * 0.25 : 0;     // the weed gets into his hands on the wheel too
  T.yaw += (T.steer * 0.78 + drift * Math.sign(T.speed)) * dt * clamp(Math.abs(T.speed) / 2.5, 0, 1) * Math.sign(T.speed || 1);
  const ox = T.x, oz = T.z, nx = T.x + Math.sin(T.yaw) * T.speed * dt, nz = T.z + Math.cos(T.yaw) * T.speed * dt;
  let hit = 0;
  if (!landBlocked(nx, T.z, 1.3)) T.x = nx; else hit += Math.abs(nx - T.x);
  if (!landBlocked(T.x, nz, 1.3)) T.z = nz; else hit += Math.abs(nz - T.z);
  for (let i = 0; i < 2; i++) hit += collide(T, 1.3);
  T.x = clamp(T.x, -HALF_W + 10, HALF_W - 10); T.z = clamp(T.z, -50, 1900);
  if (hit > 0.004 && dt > 0) {
    // she ploughs into it and scrubs her speed off rather than stopping dead; a real knock rings through the frame
    const lost = clamp(hit / (Math.abs(T.speed) * dt + 0.01), 0, 1);
    if (Math.abs(T.speed) > 2.6 && lost > 0.5 && (T.bumpCool || 0) <= 0) { sfx.thump(0.3); rumble(0.6, 0.9, 160); T.sus.pv -= 0.6; T.bumpCool = 0.6; }
    T.speed *= 1 - lost * clamp(dt * 9, 0, 1);
    const made = Math.hypot(T.x - ox, T.z - oz) / dt; if (made < Math.abs(T.speed)) T.speed = Math.sign(T.speed) * Math.max(made, Math.abs(T.speed) * (1 - dt * 6));
  }
  T.bumpCool = Math.max(0, (T.bumpCool || 0) - dt);
  P.x = T.x; P.z = T.z; P.speed = Math.abs(T.speed); P.vx = P.vz = 0;
  if (Math.abs(T.speed) > 0.5) rumble(0, 0, 0);
}
// how the tractor sits and shakes: the slope under its wheels, a spring for the bumps, a lean into the turn
function poseTractor(dt) {
  const T = tractor, ty = h(T.x, T.z), sy = Math.sin(T.yaw), cy = Math.cos(T.yaw);
  const f = h(T.x + sy * 1.6, T.z + cy * 1.6) - h(T.x - sy * 1.1, T.z - cy * 1.1);
  const sd = h(T.x - cy, T.z + sy) - h(T.x + cy, T.z - sy);
  const sp = Math.abs(T.speed), s = T.sus;
  if (dt > 0) {
    T.pitch += (-Math.atan2(f, 2.7) - T.pitch) * damp(9, dt); T.roll += (Math.atan2(sd, 2) * 0.6 - T.roll) * damp(9, dt);
    // "the suspension coils whined, protesting every bump": rougher off the road, rougher the faster she goes
    const rough = sp * (T.offroad ? 1 : 0.4) * (S.inTractor ? 1 : 0), kick = rough * dt * 9;
    s.pv += (Math.random() - 0.5) * kick * 0.22 - (T.thr - T.brk) * sp * 0.006; s.rv += (Math.random() - 0.5) * kick * 0.2; s.yv += (Math.random() - 0.5) * kick * 0.5;
    s.pv += (-s.p * 110 - s.pv * 9) * dt; s.rv += (-s.r * 90 - s.rv * 8) * dt; s.yv += (-s.y * 160 - s.yv * 12) * dt;
    s.p = clamp(s.p + s.pv * dt, -0.08, 0.08); s.r = clamp(s.r + s.rv * dt, -0.08, 0.08); s.y = clamp(s.y + s.yv * dt, -0.06, 0.06);
  }
  const lean = -T.steer * clamp(sp / 6, 0, 1) * 0.035;
  // two cylinders, so she doesn't hum, she shudders: slow and lumpy at idle, quicker and harder with the throttle open
  if (dt > 0) T.beat = (T.beat || 0) + dt * Math.PI * 2 * (5.2 + T.thr * 8);
  T.shudder = S.started && T.stall <= 0 ? (Math.sin(T.beat) + 0.4 * Math.sin(T.beat * 2.03 + 1)) * 0.0016 * (1 + T.thr * 0.8) : 0;
  T.g.position.set(T.x, ty + s.y + T.shudder, T.z);
  T.g.rotation.set(T.pitch + s.p, T.yaw, T.roll + s.r + lean + T.shudder * 0.5, 'YXZ');
}

// ---------- moving: Jacob on foot, and Jacob underground ----------
function walk(dt) {
  const cave = inCave();
  let ix = 0, iz = 0;
  if (P.stun > 0) P.stun -= dt; else { ix = input.move.x; iz = input.move.y; }
  const push = Math.min(1, Math.hypot(ix, iz)), running = input.sprint && push > 0.3 && !(cave && P.crouch > 0.5);
  P.run += ((running ? 1 : 0) - P.run) * damp(6, dt);
  const speed = SPEED.walk * (cave ? (P.crouch > 0.5 ? SPEED.crouch : SPEED.cave) : 1) * (1 + (SPEED.run - 1) * P.run);
  // under compass-weed his feet don't go quite where he points them
  const drift = !cave && S.disoriented > 0 ? Math.sin(S.time * 0.017) * 0.7 * Math.min(1, S.disoriented / 5) : 0;
  const yaw = P.yaw + drift, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const tx = (fx * iz + rx * ix) * speed, tz = (fz * iz + rz * ix) * speed;
  // get going a little softer than stopping, so steps start smoothly and end without sliding (the yard's way)
  const k = damp(Math.hypot(tx, tz) > Math.hypot(P.vx, P.vz) ? 9 : 13, dt);
  P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
  const ox = P.x, oz = P.z, nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  if (cave) {
    // keep to the rock, and don't squeeze where there isn't room to
    const c = caveConstrain(cave, nx, nz, 0.3), fl = caveFloor(cave, c.x, c.z);
    if (fl.ceil - fl.floor > 1.05) { P.x = c.x; P.z = c.z; }
  } else {
    // the land's own walls first, one axis at a time; then everything else pushes him out and lets him slide round it
    if (!landBlocked(nx, P.z, SPEED.radius)) P.x = nx;
    if (!landBlocked(P.x, nz, SPEED.radius)) P.z = nz;
    for (let i = 0; i < 3; i++) collide(P, SPEED.radius);
    { const dx = P.x - tractor.x, dz = P.z - tractor.z, d = Math.hypot(dx, dz); if (d < 1.4 && d > 1e-3) { P.x = tractor.x + dx / d * 1.4; P.z = tractor.z + dz / d * 1.4; } }
    P.x = clamp(P.x, -HALF_W + 5, HALF_W - 5); P.z = clamp(P.z, -50, 1900);
    // walking up into a cave mouth takes him in
    for (const id in CAVES) { const m = CAVES[id].mouth; if (Math.hypot(P.x - (m.x - m.ox * 0.2), P.z - (m.z - m.oz * 0.2)) < 0.7) { enterCave(id); return; } }
  }
  // what actually happened is the speed: leaning into a wall doesn't keep the legs pumping
  if (dt > 0) { const ax = (P.x - ox) / dt, az = (P.z - oz) / dt, a = Math.hypot(ax, az), v = Math.hypot(P.vx, P.vz); if (a < v && a < 8) { P.vx = ax; P.vz = az; } }
  const sp = Math.hypot(P.vx, P.vz);
  P.speed = sp; S.footKm += sp * dt / 1000;
  if (sp > 0.08) {
    const prev = Math.floor(P.bob / Math.PI), stride = 0.72 + 0.5 * P.run;      // metres per step, longer when running
    P.bob += dt * sp * Math.PI / stride;
    if (Math.floor(P.bob / Math.PI) !== prev) { const surf = surfaceAt(P.x, P.z); sfx.step(surf, P.run); if (!cave) footfall(P.x, P.z, Math.atan2(P.vx, P.vz), surf, P.run); }
  }
}
function look(dt) {
  const [lx, ly] = takeLook();
  if (S.paused || !S.started) return;
  if (S.inTractor) {
    P.look = clamp(P.look + lx, -2.4, 2.4);
    // nobody steering the view: it comes back round behind her once she's moving
    view.lookIdle = lx || ly ? 0 : view.lookIdle + dt;
    if (view.lookIdle > 2.2 && Math.abs(tractor.speed) > 1.5) P.look *= 1 - damp(1.6, dt);
  } else P.yaw += lx;
  P.pitch = clamp(P.pitch + ly, -1.3, 1.25);
}

// the boards of a house floor, where he's standing on one (a step up from the dirt outside)
function floorAt(x, z) {
  for (const f of W.floors || []) {
    if (f.hw === undefined) continue;
    const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz > f.r * f.r) continue;
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = c * dx - s * dz, lz = s * dx + c * dz;
    if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) return f.y;
  }
  return null;
}
// ---------- the camera ----------
const _n = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function placeCamera(dt) {
  const shake = P.shake > 0 ? (P.shake -= dt * 0.08, P.shake) : 0, cave = inCave(), bobOn = input.settings.bob !== false && !reduceMotion, T = tractor;
  poseTractor(S.paused ? 0 : dt);
  let fovGoal = view.baseFov;
  jacob.root.visible = !S.inTractor && S.started;
  if (S.inTractor) {
    const ty = T.g.position.y, sp = Math.abs(T.speed);
    if (S.view === 'seat') {
      // at the wheel: the cab's shake comes through, softened so it reads as the machine and not the camera
      _e.set(T.pitch + T.sus.p * 0.5, T.yaw, (T.roll + T.sus.r) * 0.6);
      _n.set(-0.06, 2.26, -0.52).applyEuler(_e).add(T.g.position); if (!bobOn) _n.y -= T.shudder || 0;
      camera.position.copy(_n); camera.rotation.set(P.pitch + (bobOn ? T.sus.p * 0.5 : 0), T.yaw + P.look + Math.PI, bobOn ? (T.roll + T.sus.r) * 0.45 : 0);
      fovGoal += 6 + (bobOn ? sp * 0.5 : 0);
    } else {
      // behind her on a long arm that swings round a beat late, drops back with speed, and keeps out of the rock
      const jumped = Math.hypot(T.x - view.lastX, T.z - view.lastZ) > 6;
      const goal = T.yaw + P.look;
      view.camYaw = jumped ? goal : view.camYaw + angDiff(goal, view.camYaw) * damp(P.look ? 9 : 4.2, dt);
      view.chaseNow += (view.chase - view.chaseNow) * damp(6, dt);                  // the mouse wheel sets how far back the camera rides
      let back = view.chaseNow + sp * 0.22;
      const at = (b) => _n.set(T.x - Math.sin(view.camYaw) * b, 0, T.z - Math.cos(view.camYaw) * b);
      at(back); for (let i = 0; i < 6 && landBlocked(_n.x, _n.z, 0.8); i++) at(back *= 0.8);
      _n.y = Math.max(h(_n.x, _n.z) + 1.2, ty + 1.4 + view.chaseNow * 0.256 - P.pitch * (2 + view.chaseNow * 0.24) + Math.max(0, view.chaseNow - back) * 0.25);
      if (jumped) view.camPos.copy(_n); else { view.camPos.x = _n.x; view.camPos.z = _n.z; view.camPos.y += (_n.y - view.camPos.y) * damp(7, dt); }
      camera.position.copy(view.camPos);
      const ahead = 5 + sp * 0.5;
      camera.lookAt(T.x + Math.sin(view.camYaw) * ahead, ty + 1.8 + P.pitch * 6, T.z + Math.cos(view.camYaw) * ahead);
      fovGoal += 7 + (bobOn ? sp * 0.75 : 0);
    }
    view.lastX = T.x; view.lastZ = T.z;
  } else {
    // on his feet: the eye follows the ground a touch late, and bobs and sways with his stride
    const sp = Math.hypot(P.vx, P.vz), amt = Math.min(1, sp / 1.4);
    let gy, eye = 1.62;
    if (cave) {
      const fl = caveFloor(cave, P.x, P.z), room = fl.ceil - fl.floor;      // stoop where the roof comes down
      P.crouch += ((room < 1.95 ? 1 : 0) - P.crouch) * damp(6, dt);
      gy = fl.floor; eye = Math.min(1.62, room - 0.3);
    } else { gy = floorAt(P.x, P.z) ?? h(P.x, P.z); P.crouch += (0 - P.crouch) * damp(6, dt); }
    const want = gy + eye;
    view.eyeY = Math.abs(view.eyeY - want) > 2 ? want : view.eyeY + (want - view.eyeY) * damp(cave ? 8 : 12, dt);
    const bobY = bobOn ? Math.sin(P.bob * 2) * (0.014 + 0.016 * P.run) * amt : 0, bobX = bobOn ? Math.sin(P.bob) * (0.008 + 0.01 * P.run) * amt : 0;
    camera.position.set(P.x - Math.cos(P.yaw) * bobX + (Math.random() - 0.5) * shake, view.eyeY + bobY + (Math.random() - 0.5) * shake, P.z + Math.sin(P.yaw) * bobX);
    // standing still he still breathes; stepping sideways he leans into it
    view.breath = (view.breath || 0) + dt * (1.5 + P.run * 2 + S.stress * 0.012);
    const still = 1 - amt, side = (P.vx * -Math.cos(P.yaw) + P.vz * Math.sin(P.yaw)) / (SPEED.walk * SPEED.run);
    view.lean = (view.lean || 0) + (clamp(side, -1, 1) * 0.022 - (view.lean || 0)) * damp(6, dt);
    if (bobOn) camera.position.y += Math.sin(view.breath) * 0.004 * still;
    camera.rotation.set(P.pitch + (bobOn ? Math.sin(view.breath) * 0.0016 * still : 0), P.yaw + Math.PI, bobOn ? Math.sin(P.bob) * 0.003 * amt - view.lean : 0);
    if (bobOn) fovGoal += 5 * P.run * Math.min(1, sp / (SPEED.walk * 1.5));
    jacob.setCrouch(P.crouch * 0.35);
    jacob.update(S.paused ? 0 : dt, P, P.yaw + Math.PI, { sprint: P.run > 0.5 && sp > SPEED.walk * 1.4, groundY: view.eyeY - eye });
    view.camYaw = P.yaw; view.lastX = P.x; view.lastZ = P.z;
  }
  if (Math.abs(fovGoal - camera.fov) > 0.01) { camera.fov += (fovGoal - camera.fov) * damp(5, dt || 0.016); camera.updateProjectionMatrix(); }
  const throttle = S.inTractor && !S.paused ? T.thr * (G.redline > 0 ? 1.6 : 1) : 0;
  if (throttle > 0.4 && !T.wasThrottle) T.model.spit(30);       // opening the throttle coughs phosphor
  T.wasThrottle = throttle > 0.4;
  T.model.update(S.paused ? 0 : dt, { running: S.started && T.stall <= 0, throttle, speed: T.speed, steer: T.steer });
  driver.update(S.paused ? 0 : dt, { visible: S.inTractor, seat: S.inTractor && S.view === 'seat', steer: T.steer, speed: T.speed, thr: T.thr, brk: T.brk, look: P.look, pitch: P.pitch, sus: T.sus, gust: WIND.gust, rightBusy: HANDS.active, pose: gatePose() });
  T.g.updateMatrixWorld();
  for (const t of W.tractorThings || []) { const p = tractorPoint(...t.local); t.x = p.x; t.y = p.y; t.z = p.z; }
}

// ---------- the sun across the morning: up in the east, swinging north (the Waste is southern) ----------
const _c = new THREE.Color(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _ctr = new THREE.Vector3();
function updateSun(dt) {
  const hr = hours(), el = Math.max(0.03, Math.sin((hr - 6) / 12 * Math.PI)) * 1.2, az = (90 - (hr - 6) / 12 * 180) * Math.PI / 180;
  sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  (G.sunDirXZ || (G.sunDirXZ = new THREE.Vector2())).set(sunDir.x, sunDir.z).normalize();          // for the salt crust's lit edges (detail.js)
  // the light that casts shadows only moves in small steps, and its box is snapped to its own texels, so shadows don't crawl
  if (shadowDir.angleTo(sunDir) > 0.004) { shadowDir.copy(sunDir); }
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _ctr.set(camera.position.x + _fwd.x * 30, 0, camera.position.z + _fwd.z * 30);
  _r.set(0, 1, 0).cross(shadowDir).normalize(); _u.copy(shadowDir).cross(_r).normalize();
  const texel = SHADOW_HALF * 2 / sun.shadow.mapSize.x, cx = _ctr.dot(_r), cyy = _ctr.dot(_u);
  _ctr.addScaledVector(_r, Math.round(cx / texel) * texel - cx).addScaledVector(_u, Math.round(cyy / texel) * texel - cyy);
  sun.target.position.copy(_ctr); sun.position.copy(_ctr).addScaledVector(shadowDir, 170); sun.target.updateMatrixWorld();
  const low = smooth(0.42, 0.06, sunDir.y);
  sun.color.setRGB(1, lerp(0.9, 0.62, low), lerp(0.76, 0.38, low)); sun.intensity = lerp(3.4, 2.3, low);
  hemi.intensity = lerp(0.55, 0.42, low);
  // the haze: orange at dawn, paler as the day gets up, thicker with the heat; brighter and golden towards the sun
  _c.copy(SKY.hazeHigh).lerp(SKY.hazeLow, low); scene.fog.color.copy(_c); skyU.uHaze.value.copy(_c);
  skyU.uZen.value.copy(SKY.zenHigh).lerp(SKY.zenLow, low); skyU.uMid.value.copy(SKY.midHigh).lerp(SKY.midLow, low);
  skyU.uSunHaze.value.copy(SKY.sunHazeHigh).lerp(SKY.sunHazeLow, low); HAZEU.uSunHaze.value.copy(skyU.uSunHaze.value);
  skyU.uSunCol.value.setRGB(1, lerp(0.86, 0.66, low), lerp(0.66, 0.36, low));
  skyU.uDrift.value.x += WIND.x * dt * 0.006 * (0.5 + WIND.gust); skyU.uDrift.value.y += WIND.z * dt * 0.006 * (0.5 + WIND.gust);
  scene.fog.density = 0.0018 + smooth(10, 14, hr) * 0.0008;
  sky.position.copy(camera.position);
  post.shaftColor.setRGB(1, lerp(0.84, 0.7, low), lerp(0.62, 0.42, low));
  updateFar(sunDir, sun.color, scene.fog.color);
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
  if (S.water < 20) { S.health -= dt * 0.5; once('thirst', input.mode === 'pad' ? 'Mouth like the road. Drink, Jacob. X.' : 'Mouth like the road. Drink, Jacob. F.', ['X', NEW]); }
  const calm = c ? 1.0 : S.inTractor ? 0.8 : shade ? 1.2 : 0.12;     // the tractor, the cool of the rock and any shade settle him (a gum's too: that's its bait)
  S.stress = Math.max(0, S.stress - dt * calm);
  if (S.stress > 85) S.health -= dt * 0.4;
  if (S.health <= 0) die('heat');
}

// ---------- endings ----------
function die(why) {
  if (S.dead) return; S.dead = true; S.paused = true; releaseLock(); stopVoice();
  const cause = { stalker: 'Something came down from the rocks.', gum: 'He sat down in the shade, and let himself relax.', strider: 'The strider weighed him, and decided.', bled: 'The spinifex drank its fill.', bite: 'Something in a web, in the dark.', wire: 'A wire that should have been dead years ago.', house: 'A house that was only waiting for somebody to stand under it.', devil: 'He threw a stone at a thorny-devil. It came back.', heat: 'The heat, the thirst and the voices.' }[why] || 'The Waste.';
  ui.endCard.innerHTML = `<div class="kicker">The Red Waste</div><h1>The Waste wins this time.</h1><p class="lede">${esc(cause)} The road stays where it is, indifferent.</p>
    <div class="actions"><button class="btn primary" id="end-retry">Wake up back on the tractor</button><button class="btn" id="end-restart">Start the road again</button><button class="btn" id="end-ideas">Jot what happened</button></div>`;
  ui.end.hidden = false; if (input.mode === 'pad') setTimeout(() => navFocus(ui.end, 'down'), 0);
}
function retry() {
  S.dead = false; S.paused = false; ui.end.hidden = true;
  Object.assign(S, { health: 55, water: Math.max(S.water, 45), stress: 30, bleed: 0, disoriented: 0, inTractor: true });
  if (G.area !== 'out') { G.area = 'out'; G.exposureTarget = 1.05; scene.add(jacob.root); }
  P.look = 0; P.stun = 0; P.x = tractor.x; P.z = tractor.z; P.vx = P.vz = 0; tractor.stall = 0; tractor.speed = 0;
  for (const s of W.stalkers) { s.state = 'perched'; s.cool = 20; s.g.position.copy(s.home); }
  for (const k in STRIDERS) { const st = STRIDERS[k]; if (st.state === 'attack' || st.state === 'assess' || st.state === 'stalk') { st.state = 'leave'; st.cool = 30; } }
  updateVitals(); bark('Back on the seat. Shaking. Everything still where it was, except my nerve.', ['X', NEW]);
}
function arrive() {
  if (S.ended) return; S.ended = true; S.paused = true; releaseLock(); stopVoice();
  const found = FINDS.filter(f => S.finds[f.name]).length, met = Object.keys(S.met).filter(k => k !== 'ruin').map(k => SPECIES[k].name);
  const caves = Object.keys(S.visited).map(k => CAVES[k] && CAVES[k].def.name).filter(Boolean);
  ui.fxFade.classList.add('on');
  setTimeout(() => {
    ui.endCard.innerHTML = `<div class="kicker">Bleak Flats</div><h1>Under the wall, at ${esc(clockText())}.</h1>
      <p class="lede">The massive gate groaned, hydraulic pistons screaming as they lifted the multi-ton slab of ship plating. Jacob kicked the tractor forward, passing under the shadow of the wall and into the belly of the beast.<span class="ws"> ${tagHTML('C', CH2)}</span></p>
      <p>${S.flags.paid === 'water' ? 'He paid the entry tax in raw water, three ounces of it, and kept his five bits.' : S.flags.paid === 'bits' ? 'He paid the entry tax with his last five bits.' : 'He went in under the wall.'}<span class="ws"> ${tagHTML('X', 'choosing how to pay: ' + NEW)}</span></p>
      <ul><li>Health ${Math.round(S.health)}, water ${Math.round(S.water)}, stress ${Math.round(S.stress)}.${S.hull ? ` The hull took ${S.hull} new scratch${S.hull === 1 ? '' : 'es'}.` : ''}</li>
      <li>${S.footKm > 0.05 ? `Walked ${(S.footKm * 1000).toFixed(0)} m of it.` : 'Never left the tractor.'}${caves.length ? ` Went into ${caves.join(', ')}.` : ''}</li>
      <li>${met.length ? 'Met: ' + met.join(', ') + '.' : 'Met nothing worth mentioning. Lucky.'}</li>
      <li>Finds on the road: ${found} of ${FINDS.length}.</li></ul>
      <p>The city isn’t built yet. Tell Claude what the road did to you, or jot it with N before you go.</p>
      <div class="actions"><button class="btn primary" id="end-stay">Keep exploring the road</button><button class="btn" id="end-ideas">Read my ideas</button><button class="btn" id="end-morning">Start the morning again</button></div>`;
    ui.end.hidden = false; ui.fxFade.classList.remove('on'); if (input.mode === 'pad') setTimeout(() => navFocus(ui.end, 'down'), 0);
  }, reduceMotion ? 50 : 1500);
}
ui.end.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'end-retry') retry();
  if (t.id === 'end-restart') location.href = (window.__ROAD_URL || 'road.html');
  if (t.id === 'end-ideas') { ui.end.hidden = true; if (S.dead) retry(); S.ended = false; S.flags.arrived = S.flags.arrived || (here().z > ARRIVE_Z); openMenu('ideas'); }
  if (t.id === 'end-stay') { ui.end.hidden = true; S.ended = false; S.paused = false; S.flags.arrived = true; canvas.focus(); }
  if (t.id === 'end-morning') { for (const k of ['valtoria-yard-save', 'valtoria-shack-save', 'valtoria-handoff', 'valtoria-road-handoff']) try { localStorage.removeItem(k); } catch (err) { /* storage unavailable */ } location.href = window.__SHACK_URL || 'index.html'; }
});

// ---------- graphics quality, and holding the frame rate ----------
function setShadow(light, size, radius) {
  const s = Math.min(size, renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
  if (light.shadow.mapSize.x !== s) { light.shadow.mapSize.set(s, s); if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; } }
  light.shadow.radius = radius;
  light.shadow.normalBias = s >= 4096 ? 0.03 : 0.045;
}
function applyQuality(key) {
  post.setQuality(key);
  const q = post.q;
  setShadow(sun, q.shadow, q.shadowRadius);
  setDetailQuality(post.key);
  view.chunkFar = { low: 340, medium: 460, high: 560, ultra: 660 }[post.key] || 560;
  perf.max = Math.min(devicePixelRatio || 1, q.ratio); perf.ratio = perf.max; Object.assign(perf, { cool: 3, slow: 0, upWait: 0, backoff: 8, raised: false });
  renderer.setPixelRatio(perf.ratio);
  resize();
}
// the look of the place, set each frame: outside it's bright, hazy and wide; underground it's close, and the Truth-Rot glows
function areaLook(cave) {
  post.setExposure(G.exposure * clamp(input.settings.bright || 1, 0.6, 1.6) * (post.on ? 1.06 : 1));
  post.sunDir = cave ? null : sunDir;
  const hot = smooth(34, 48, heatNow());
  post.shafts = cave ? 0 : 0.4; post.shimmer = cave ? 0 : 0.5 + hot * 1.1;
  post.ao = cave ? 0.7 : 0.72; post.aoRadius = cave ? 0.35 : 0.55; post.aoIntensity = 0.9;
  post.bloom = cave ? 0.09 : 0.055;
  post.vignette = cave ? 0.3 : 0.2; post.sat = 1.03; post.contrast = 1.04; post.split = cave ? 0.25 : 0.5;
  POSTU.uPostBase.value = cave ? 0.1 : 0.4;
}
post.shimRange.set(60, 260, 1400, 1900); post.skyZ = 5600; post.aoFade = 60;     // only the true sky (the far plane) counts as sky for the shafts, not the ranges
// keep the frame rate up by trading sharpness: two slow spells in a row before dropping the resolution,
// steady frames to win it back, and longer between tries each time a step up doesn't hold (the yard's rule)
function adaptResolution(dt) {
  perf.acc += dt; perf.n++; perf.cool -= dt; perf.upWait -= dt;
  if (perf.acc < 2) return;
  const avg = perf.acc / perf.n; perf.fps = 1 / avg; perf.acc = 0; perf.n = 0;
  if (perf.cool > 0 || perf.fixed) return;
  perf.slow = avg > 0.026 ? perf.slow + 1 : 0;
  let r = perf.ratio;
  if (perf.slow >= 2 && r > 0.6) {
    r = Math.max(0.6, r - 0.15); perf.slow = 0;
    if (perf.raised) perf.backoff = Math.min(120, perf.backoff * 2);
    perf.upWait = perf.backoff; perf.raised = false;
  } else if (avg < 0.0185 && r < perf.max && perf.upWait <= 0) { r = Math.min(perf.max, r + 0.1); perf.raised = true; }
  else if (avg < 0.0185) perf.raised = false;
  if (r !== perf.ratio) { perf.ratio = r; renderer.setPixelRatio(r); resize(); perf.cool = 2; }
}

// ---------- the frame ----------
let last = 0, dtS = 0.016;
const amb = { t: 0, wires: 0, live: 0, spray: 0, swarm: 0 };
function loop(ts) {
  requestAnimationFrame(loop);
  const raw = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
  if (document.hidden) return;
  // the clock ticks unevenly even when the frames don't: ease the step so motion stays even
  dtS = Math.abs(raw - dtS) > 0.012 ? raw : dtS + (raw - dtS) * 0.25;
  // (tests can run the world several steps to a drawn frame: window.__road.warp, with ?debug)
  try { for (let n = DEBUG && window.__road && window.__road.warp || 1; n > 0; n--) frame(dtS, raw); } catch (e) { if (!loop.failed) { loop.failed = true; console.error(e); } }
  const cave = inCave();
  post.render(cave ? cave.scene : scene, camera, HANDS.scene, HANDS.camera, HANDS.active, raw);
  grabThumb();
  adaptResolution(raw);
}
function frame(dt, raw) {
  pollInput(raw);
  const live = S.started && !S.paused;
  look(dt);
  if (live) {
    S.time += dt * TIME_SCALE; G.time += dt;
    if (S.inTractor) driveTractor(dt); else walk(dt);
    if (inCave()) updateCave(dt); else { updateLife(dt); updateMainRoad(dt); updateGate(dt); }
    updateProps(dt); updateRooms(dt);
    hazards(dt); survive(dt);
    if (G.redline > 0) G.redline = Math.max(0, G.redline - dt);
  } else if (!S.started) { G.time += dt * 0.5; P.look = Math.sin(G.time * 0.22) * 0.5; view.camYaw = tractor.yaw + P.look; }
  SWAY.uTime.value = G.time;
  updateFlies(live ? dt : 0);
  placeCamera(dt);
  target = live ? pickTarget() : null;
  const cave = inCave();
  if (!cave) updateSun(live ? dt : 0);
  updateAir(live ? dt : 0, { tractor, driving: S.inTractor, cave: !!cave });
  updateDetail(camera, cave);
  updateHands(live ? dt : 0, { camera, sunDir, sunColor: sun.color, sunI: sun.intensity, hemiSky: hemi.color, hemiGround: hemi.groundColor, hemiI: hemi.intensity, cave: !!cave, bob: P.bob, speed: S.inTractor ? 0 : Math.hypot(P.vx, P.vz), firstPerson: !S.inTractor || S.view === 'seat' });
  HAZEU.uSunView.value.copy(cave ? _n.set(0, 0, 0) : _n.copy(sunDir).transformDirection(camera.matrixWorldInverse));
  // vampiris eyes: wide open in the dark, and slow to close again in the sun
  G.exposure = lerp(G.exposure, G.exposureTarget, clamp(dt * (G.exposureTarget > G.exposure ? 0.9 : 1.4), 0, 1));
  areaLook(cave);
  for (const c of W.chunks || []) c.userData.scatter.visible = Math.abs(c.userData.z - camera.position.z) < view.chunkFar;     // how far the scatter is drawn depends on the quality setting; the ground always is
  for (const r of RELICS) if (r.m.visible) r.m.rotation.y += dt * 1.5;
  // what's near enough to hear: worked out a few times a second, not every frame
  if ((amb.t -= raw) <= 0) {
    amb.t = 0.2; const p = here(); cullFar();
    let w = 0; for (const s of W.spans) { const d = Math.hypot((s.a.x + s.b.x) / 2 - p.x, s.z - p.z); if (d < 60) w = Math.max(w, 1 - d / 60); }
    for (const t of TOWERS) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < 80) w = Math.max(w, 1 - d / 80); }
    amb.wires = cave ? 0 : w;
    amb.live = W.live && !cave ? clamp(1 - Math.hypot(W.live.x0 - p.x, W.live.z0 - p.z) / 30, 0, 1) : 0;
    let sp = 0; for (const s of W.sprays) sp = Math.max(sp, clamp(1 - Math.hypot(s.x - p.x, s.z - p.z) / 28, 0, 1)); amb.spray = sp * sp;
    amb.swarm = SWARM.points && !cave ? clamp(1 - Math.hypot(p.x - SWARM.x, p.z - SWARM.z) / 60, 0, 1) * (SWARM.scattered > 0 ? 0.13 : 1) : 0;
    amb.canyon = !cave && inCanyon(p.x, p.z);
  }
  updateAudio(raw, { started: S.started, paused: S.paused && S.started, driving: S.inTractor, speed: Math.abs(tractor.speed), throttle: tractor.thr, stall: tractor.stall, redline: G.redline > 0, cave: !!cave, canyon: amb.canyon, offroad: tractor.offroad,
    gust: WIND.gust, flies: flySwarms.length > 0, swarm: amb.swarm, wires: amb.wires, live: amb.live, spray: amb.spray, tractorDist: S.inTractor ? 0 : Math.hypot(P.x - tractor.x, P.z - tractor.z), x: here().x, z: here().z });
  ui.prompt.hidden = !target || S.paused;
  if (target) { ui.promptVerb.textContent = valueOf(target.verb); ui.promptName.textContent = valueOf(target.name); ui.promptTag.innerHTML = `<span class="tag ${target.prov[0]}">${TAG_NAME[target.prov[0]]}</span>`; ui.promptKey.textContent = input.mode === 'pad' ? 'A' : 'E'; }
  ui.reticle.classList.toggle('on', !!target);
  if (S.started) { updateHud(dt); if ((frame.v = (frame.v || 0) + dt) > 0.25) { frame.v = 0; updateVitals(); } }
}
function resize() {
  const w = innerWidth, hh = innerHeight;
  renderer.setSize(w, hh, false);
  camera.aspect = w / hh;
  // the field of view is set across the screen (the settings slider, shared with the yard), then held to something sensible up and down
  let vf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(clamp(input.settings.fov || 86, 70, 104)) / 2) / camera.aspect);
  vf = clamp(vf, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(92));
  view.baseFov = camera.fov = THREE.MathUtils.radToDeg(vf);
  camera.updateProjectionMatrix();
  setParticleScale(hh * renderer.getPixelRatio() / (2 * Math.tan(vf / 2)));
  renderer.getDrawingBufferSize(_dbs); post.setSize(_dbs.x, _dbs.y);
}
const _dbs = new THREE.Vector2();
addEventListener('resize', resize);

// ---------- building it all, then the start ----------
function readHandoff() { try { const h0 = JSON.parse(localStorage.getItem('valtoria-road-handoff') || 'null'); return h0 && h0.from === 'yard' ? h0 : null; } catch (e) { return null; } }
function begin() {
  if (S.started || ui.btnStart.disabled) return;
  initAudio();
  S.started = true; ui.title.hidden = true; ui.hud.hidden = false; P.look = 0; view.camYaw = tractor.yaw;
  const h0 = S.handoff = readHandoff();
  if (h0) { if (h0.clock) S.time = h0.clock * 60; tractor.model.milk.visible = !!h0.milk; tractor.model.load.visible = (h0.dung || 0) >= 6; }
  const arrive0 = () => bark(h0 && h0.milk ? 'Milk in the can, dung in the bin, and twenty clicks of the Waste between them and Cogswell. Canyon or pans. Pick your poison.' : 'Twenty clicks to Bleak Flats. The canyon, or the pans. Same heat either way, and things wanting a piece of me.', ['C', CH2 + ': the fork']);
  if (ui.fxFade.classList.contains('on')) setTimeout(() => { ui.fxFade.style.transition = ''; ui.fxFade.classList.remove('on'); ui.fadeLine.hidden = true; arrive0(); }, reduceMotion ? 50 : 1300);
  else arrive0();
  setTimeout(() => toast(input.mode === 'pad' ? 'RT to drive · A to climb down · Menu for the notebook' : 'W to drive · E to climb down · Tab for the notebook · N to jot an idea'), 2600);
  updateVitals(); canvas.focus();
}
// small animals a long way off are a few pixels each but still cost a draw apiece: each is wrapped in a group of its
// own, so it can be dropped past a sensible distance without touching the visibility its own behaviour sets
const CULL = [];
function cullable(list, far) { for (const c of list || []) { if (!c.g) continue; const w = new THREE.Group(); scene.add(w); w.add(c.g); CULL.push({ c, w, far2: far * far }); } }
function cullFar() { const p = camera.position; for (const k of CULL) k.w.visible = (k.c.x - p.x) ** 2 + (k.c.z - p.z) ** 2 < k.far2; }
// every lit material takes the sun-tinted haze instead of flat fog, outside and in
function hazeAll(root) { root.traverse((o) => { if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) hazeify(m); }); }
async function boot() {
  const tick = DEBUG ? (label) => console.log(`[road] ${label} ${Math.round(performance.now())} ms`) : () => {};
  reserveLife(); reserveMainRoad(); reserveProps(); RESERVED.push({ x: ADIT.x + 3, z: ADIT.z, r: 7 });
  tick('start'); buildAir(); buildLand(); buildFar(); tick('land'); buildLife(); tick('life');
  cullable(W.devils, 70); cullable(W.jaws, 90); cullable(W.boars, 260); buildMainRoad(); tick('main road'); buildCaves(); tick('caves');
  tractor = G.tractor = buildTractor(); addTractorThings();
  driver = buildDriver(tractor.model);
  jacob = G.jacob = buildJacob(); scene.add(jacob.root);
  buildHands();
  buildProps(); buildRooms(); buildGate(); tick('props'); buildDetail(); tick('detail');
  for (const l of W.leaks) waterThing({ id: 'leak' + Math.round(l.z), name: l.name || 'Pipeline leak', x: l.x, z: l.z, r: 2.2, line: l.line || 'Pipeline water. Tastes of rust and somebody else’s taxes. It’s wet.', prov: ['X', 'the old water pipeline: ' + NEW] });
  for (const w of W.water || []) waterThing({ ...w, y: w.y, r: 1.6 });
  tractor.x = 0; tractor.z = 8; P.x = tractor.x; P.z = tractor.z; view.lastX = 0; view.lastZ = 8;
  const q = QS.get('q');
  applyQuality(q in QUALITY ? q : input.settings.quality in QUALITY ? input.settings.quality : post.supported ? 'high' : 'low');
  if (QS.has('ratio')) { perf.fixed = true; perf.ratio = Number(QS.get('ratio')) || 1; renderer.setPixelRatio(perf.ratio); resize(); }
  placeCamera(0); updateSun(0);
  // the sky lights the shade: captured once, small, from the sky itself
  { const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(), s = sky.clone(); s.position.set(0, 0, 0); s.scale.setScalar(0.02); env.add(s); scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose(); }
  hazeAll(scene); for (const id in CAVES) hazeAll(CAVES[id].scene);
  setWorkshop(S.workshop);
  bindInput({
    canvas,
    started: () => S.started, paused: () => S.paused || S.dead || S.ended, menuOpen: () => !ui.menu.hidden, jotOpen: () => !ui.jot.hidden,
    screenOpen: () => !ui.title.hidden || !ui.end.hidden || !ui.choice.hidden, driving: () => S.inTractor,
    onAnyInput: () => initAudio(),
    onMode: () => { modeKey = ''; gaugeKey = ''; if (!ui.menu.hidden) renderMenu(); },
    onStart: begin, onUse: use, onDrink: drink, onSulphur: sulphur, onRadio: radio, onJot: openJot, onJotClose: closeJot, onJotSave: saveJot,
    onCompass: () => { S.compass = !S.compass; },
    onZoom: (d) => { if (S.inTractor && S.view === 'chase') view.chase = clamp(view.chase + d * 1.2, 4.2, 15); }, onView: () => { S.view = S.view === 'chase' ? 'seat' : 'chase'; view.camYaw = tractor.yaw + P.look; },
    onPrimary: () => { if (S.inTractor || S.paused) return; if (canThrow()) playHand('throw', { release: () => primaryAction(camera) }); else primaryAction(camera); },
    onMenu: (tab) => openMenu(tab), onBack: () => { if (!ui.menu.hidden) closeMenu(); },
    onTab: (d) => { S.menuTab = TABS[(TABS.indexOf(S.menuTab) + d + TABS.length) % TABS.length]; renderMenu(); },
    onMenuNav: (d) => {
      const a = document.activeElement;
      if (a && a.type === 'range' && (d === 'left' || d === 'right')) { const st = Number(a.step) || 0.1; a.value = String(clamp(Number(a.value) + (d === 'right' ? st : -st), Number(a.min), Number(a.max))); a.dispatchEvent(new Event('input', { bubbles: true })); return; }
      navFocus(!ui.menu.hidden ? ui.menu : !ui.title.hidden ? ui.title : !ui.choice.hidden ? ui.choice : ui.end, d);
    },
    onMenuSelect: () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.click(); else if (!ui.title.hidden) begin(); },
    onPadConnect: () => { toast('Controller connected · Xbox layout'); if (ui.padNote) ui.padNote.hidden = true; },
    onPadDisconnect: () => toast('Controller disconnected'),
  });
  connectIdeas({ onChange: () => { if (!ui.menu.hidden && S.menuTab === 'ideas') renderMenu(); }, onFull: () => toast('The notebook is full. This idea is kept on this computer.') });
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* compile on first frame instead */ }
  tick('ready');
  requestAnimationFrame(loop);
  ui.btnStart.disabled = false; ui.btnStart.textContent = 'Drive out';
  setTimeout(() => { if (input.padBlocked && ui.padNote) { ui.padNote.hidden = false; ui.padNote.textContent = 'Controllers can’t be read inside this preview. Open the downloaded PC copy in Chrome or Edge to play with an Xbox controller.'; } }, 800);
  if (/[?&]from=yard\b/.test(location.search)) begin();
}
ui.btnStart.addEventListener('click', begin);
ui.btnYard.addEventListener('click', () => { location.href = window.__YARD_URL || 'yard.html'; });
ui.btnWs.addEventListener('click', () => setWorkshop(!S.workshop));
ui.menuClose.addEventListener('click', closeMenu);
addEventListener('pagehide', stopVoice);
boot();
if (DEBUG) window.__road = { THREE, HANDS, playHand, GS, get driver() { return driver; }, S, P, W, G, CAVES, STRIDERS, SWARM, things, camera, h, nearestRoad, enterCave, use, begin, sulphur, input, post, perf, view, airState, propState, surfaceAt, blocked, quality: applyQuality, primary: () => primaryAction(camera), get tractor() { return tractor; }, get target() { return target; }, get jacob() { return jacob; } };
