// ============================================================
// The Road to Bleak Flats: twenty clicks of the Red Waste, from the
// yard's north gate to the crater rim. 1.8 km of playable road stands
// for 20 km of Valtoria; the tractor covers it in five minutes if
// Jacob never stops, and the Waste gives him reasons to.
//
// The systems came from the Road Relic v0.5 prototype (route, pacing,
// vitals, the pipeline and the power line, ruins and finds) and were
// rebuilt here in the game's own dress. Each Field Guide species gets
// its canon behaviour, something that gives it away, and something
// Jacob can do about it:
//   Razor-Spinifex  cuts, then feeds on the blood (it reddens). Walk, don't run; the tractor crushes it.
//   Compass-Weed    scrambles the compass and his sense of direction. Steer by the wires and the sun.
//   Gallows-Gum     waits for someone to relax in its shade. Keep moving; the creak is the warning.
//   Drop-Stalker    drops from rocky overhangs. It clicks first; look up and hold its eye.
//   Gossip-Flies    whisper fears. Outrun them in the tractor; an ear-cage helps.
//   Judas-Wattle    golden haze, a green lie over the red.   Argus-Bush  watches, and remembers.
//   Salt-Strider    one crossing. Stop and let it pass.
// The tractor (shared/tractor.js; unnamed, Rustbucket is the bull) is the safe place: its anima
// shielding keeps the flies out of Jacob's head, its canister is a second water supply, its
// compartment carries the load and the finds, and its radio picks up Bleak Flats.
// Units are metres. The road runs north along +z; east is −x.
// ============================================================
import * as THREE from '../yard/vendor/three.module.js';
import { ideas, IDEA_KINDS, connectIdeas, addIdea, deleteIdea, exportIdeas, ideaWhere } from '../shared/notebook.js';
import { buildTractor as buildTractorModel } from '../shared/tractor.js';

const ROUTE = 1800, LORE_KM = 20, ARRIVE_Z = 1790, HALF_W = 330, CHUNK = 100;
const SPEED = { tractor: 6, offroad: 0.56, reverse: 2, walk: 1.22, run: 2.26 };
const TIME_SCALE = (LORE_KM * 1000) / ROUTE;      // world seconds per real second: five minutes of driving is fifty-five on the clock
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const noise2 = (x, z) => Math.sin(x * 0.027 + z * 0.009) * 0.45 + Math.cos(x * 0.039 - z * 0.012) * 0.35 + Math.sin(z * 0.027 + x * 0.012) * 0.2;

// ---------- Canon, Plausible, Experimental ----------
const TAG_NAME = { C: 'Canon', P: 'Plausible', X: 'Experimental' };
const GUIDE = 'Survival Field Guide';
const NEW = 'new on the road';
const tagHTML = (tag, src) => `<span class="tag ${tag}">${TAG_NAME[tag]}</span>${src ? ` <span class="src">${esc(src)}</span>` : ''}`;

// ---------- the land ----------
const roadX = (z) => 7 * Math.sin(z * 0.005) + 2 * Math.sin(z * 0.016);
const creekZ = (x) => 720 + 30 * Math.sin(x * 0.012);
function h(x, z) {
  const off = Math.abs(x - roadX(z));
  const shoulder = smooth(11, 49, off);
  let y = shoulder * 2.4 * noise2(x, z) * 2.2;
  y += smooth(70, 200, off) * 7 * Math.max(0, Math.sin(x * 0.011 + z * 0.004) * Math.cos(z * 0.006 - x * 0.002));   // ironstone ridges, away from the road
  const c = (z - creekZ(x)) / 9; y -= 1.7 * Math.exp(-c * c);                                                       // the dry creek, crossing at a ford
  y += smooth(1820, 1930, z) * 9 * smooth(80, 0, Math.abs(Math.hypot(x - roadX(1800), z - 2060) - 190) - 20);     // the crater rim beyond the fence
  return y;
}
function placeAt(z, x) {
  const off = x - roadX(z);
  if (z > 1760) return 'the crater rim';
  const names = [[0, 'the north gate'], [150, 'the pipeline flats'], [320, 'Gallows bend'], [520, 'the ironstone shelters'], [690, 'the dry creek'], [830, 'the Pipewright’s shack'], [980, 'strider country'], [1240, 'the compass scrub'], [1380, 'the long straight'], [1580, 'the last shelter']];
  let n = names[0][1]; for (const [z0, name] of names) if (z >= z0) n = name;
  return Math.abs(off) > 14 ? `off the road, ${n}` : n;
}

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
const hemi = new THREE.HemisphereLight(0xb8c0d8, 0x8a4426, 1.7);   // the sky's blue and the dirt's red bounce: shade out here is never black scene.add(hemi);
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

// ---------- textures: the shack's photographed dirt, iron, paint, boards and tin ----------
const assetURL = (path) => (window.__ASSETS && window.__ASSETS[path]) || 'assets/' + path;
const texLoader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function tex(name, srgb = true) {
  const t = texLoader.load(assetURL('tex/' + name + '.jpg'));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
const T = {};
for (const k of ['dirt', 'iron', 'ironpaint', 'boards', 'tin', 'frame', 'canvas', 'leather']) T[k] = { c: tex(k + '_c'), n: tex(k + '_n', false) };
const std = (k, o = {}) => new THREE.MeshStandardMaterial({ map: T[k].c, normalMap: T[k].n, roughness: 0.9, ...o });
const M = {
  ground: new THREE.MeshStandardMaterial({ map: T.dirt.c, normalMap: T.dirt.n, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ map: T.dirt.c, normalMap: T.dirt.n, normalScale: new THREE.Vector2(0.35, 0.35), vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  rock: std('iron', { color: 0xc8826a, roughness: 0.95 }),
  iron: std('iron', { roughness: 0.8, metalness: 0.4 }),
  rust: std('iron', { color: 0xe0a07c, roughness: 0.9, metalness: 0.3 }),
  paint: std('ironpaint', { color: 0xc4553a, roughness: 0.7, metalness: 0.3 }),
  boards: std('boards', { roughness: 0.95 }),
  tin: std('tin', { roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide }),
  timber: std('frame', { color: 0xb8a690, roughness: 0.92 }),
  canvas: std('canvas', { roughness: 0.97 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1d1a19, roughness: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9aa09a, roughness: 0.15, metalness: 0.3 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.7 }),
  gumBark: new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.85 }),
  gumLeaf: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.9, flatShading: true }),
  stain: new THREE.MeshStandardMaterial({ color: 0x4a1008, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  spinifex: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35 }),
  scrub: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }),
  compass: new THREE.MeshStandardMaterial({ color: 0xa9c88e, roughness: 0.55 }),
  wattle: new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.9, emissive: 0x4a3300, emissiveIntensity: 0.5, flatShading: true }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.15 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.2 }),
  fur: std('canvas', { color: 0x8a817a, roughness: 1 }),
  furDark: new THREE.MeshStandardMaterial({ color: 0x2a2523, roughness: 0.6 }),
  claw: new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: 0.35 }),
  stalkerEye: new THREE.MeshStandardMaterial({ color: 0x220a02, emissive: 0xe0661a, emissiveIntensity: 0.8 }),
  salt: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.55, flatShading: true }),
  fly: new THREE.MeshPhysicalMaterial({ color: 0x14302f, metalness: 0.7, roughness: 0.25, iridescence: 1, iridescenceIOR: 1.6 }),
  wing: new THREE.MeshStandardMaterial({ color: 0xc4d9cf, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  relic: new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 0.9, emissive: 0x3a2400, emissiveIntensity: 0.6 }),
  mirage: new THREE.MeshBasicMaterial({ color: 0x9bd0cd, transparent: true, opacity: 0, depthWrite: false, fog: false }),
  pea: new THREE.MeshStandardMaterial({ color: 0x8c1016, emissive: 0x300306, roughness: 0.4 }),
  wire: new THREE.LineBasicMaterial({ color: 0x1c1816 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x3a3230, transparent: true, opacity: 0.35, depthWrite: false }),
};

// textures that tile by the metre on whatever they're wrapped round
function planarUV(geo, tile = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  if (!uv || !n) return geo;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const u = ax > 0.6 ? p.getZ(i) : p.getX(i), v = ay > 0.6 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / tile, v / tile);
  }
  return geo;
}
// many pieces, one draw: geometries placed by matrices and joined
function merge(parts) {
  const out = { position: [], normal: [], uv: [] };
  for (const [g, m] of parts) {
    const n = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    for (const k in out) { const a = n.attributes[k]; if (a) out[k].push(...a.array); else if (k === 'uv') out[k].push(...new Array(n.attributes.position.count * 2).fill(0)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  return g;
}
const MX = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1, sy = s, sz = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, sy, sz));
function rodMX(a, b) {   // a unit-high cylinder stretched from a to b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  return new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, len, 1));
}
function mesh(geo, mat, { cast = true, receive = true } = {}) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m; }

// ---------- the world's contents ----------
const things = [];        // anything that can be used: { id, name, verb, x, y, z, r, prov, use, enabled }
const blockers = [];      // circles and boxes Jacob and the tractor can't pass: { x, z, r } or { x0, z0, x1, z1 }
const shades = [];        // where the sun can't reach: { x, z, r } or boxes, with a reason
const species = {};       // what Jacob has met, for the field notes
const chunks = [];
const W = { spinifex: [], weeds: [], gums: [], stalkers: [], argus: [], wattles: [], flySources: [], mirages: [], leaks: [], smoke: [] };
const addThing = (t) => { const o = { r: 1.4, y: 0.8, enabled: () => true, ...t }; things.push(o); return o; };

function buildChunk(i) {
  const g = new THREE.Group(), z0 = i * CHUNK, R = rng(9001 + i * 7919);
  // ground: 10 m across, 5 m along, red dust with ironstone and salt in it
  const NX = 66, NZ = 20, pos = [], col = [], uv = [], idx = [];
  const base = new THREE.Color(), tmp = new THREE.Color();
  for (let j = 0; j <= NZ; j++) for (let k = 0; k <= NX; k++) {
    const x = -HALF_W + k * (2 * HALF_W / NX), z = z0 + j * (CHUNK / NZ), y = h(x, z);
    pos.push(x, y - 0.02, z); uv.push(x / 2.5, z / 2.5);
    const n = noise2(x * 3.1, z * 2.7) * 0.5 + 0.5, off = Math.abs(x - roadX(z));
    base.setRGB(1.0, 0.93, 0.88).multiplyScalar(0.82 + n * 0.3);
    if (y > 3) base.lerp(tmp.setRGB(0.62, 0.42, 0.36), smooth(3, 7, y) * 0.7);          // ironstone, darker on the ridges
    const saltPan = smooth(0.55, 0.85, noise2(x * 0.4 + 300, z * 0.35)) * smooth(40, 90, off);
    base.lerp(tmp.setRGB(1.25, 1.2, 1.15), saltPan * 0.6);                              // salt pans, out in the open
    if (Math.abs(z - creekZ(x)) < 12) base.multiplyScalar(0.86);                        // the creek bed holds a little shade and damp
    col.push(base.r, base.g, base.b);
  }
  for (let j = 0; j < NZ; j++) for (let k = 0; k < NX; k++) { const a = j * (NX + 1) + k, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gg.setIndex(idx); gg.computeVertexNormals();
  g.add(mesh(gg, M.ground, { cast: false }));
  // the road: a compacted ribbon, paler in the middle, wheel ruts either side
  {
    const across = [-3.8, -2.6, -1.9, -1.2, -0.6, 0.6, 1.2, 1.9, 2.6, 3.8], shade = [0.86, 1.12, 0.66, 1.16, 1.22, 1.22, 1.16, 0.66, 1.12, 0.86];
    const p = [], c = [], u = [], ix = [], rows = CHUNK / 2 + 1;
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * 2, x0 = roadX(z), dx = (roadX(z + 1) - roadX(z - 1)) / 2, nx = 1 / Math.hypot(1, dx), nz = -dx * nx;
      const potholes = noise2(z * 0.7, 3) > 0.62 ? 0.82 : 1;
      across.forEach((a, k) => { const x = x0 + a * nx, zz = z + a * nz; p.push(x, h(x, zz) + 0.03, zz); u.push(x / 2.5, zz / 2.5); const s = shade[k] * potholes * (0.95 + noise2(z * 1.3, k) * 0.05); c.push(1.12 * s, 1.0 * s, 0.93 * s); });
    }
    const n = across.length;
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < n - 1; k++) { const a = r * n + k, b = a + 1, cc = a + n, d = cc + 1; ix.push(a, cc, b, b, cc, d); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    rg.setIndex(ix); rg.computeVertexNormals();
    g.add(mesh(rg, M.road, { cast: false }));
  }
  // power line on the east side, every 50 m; one pole down in places, its wires slack on the ground
  {
    const parts = [], wires = [];
    for (let z = z0 + 10; z < z0 + CHUNK; z += 50) {
      const x = roadX(z) - 18, y = h(x, z), down = Math.floor(z / 50) % 9 === 4;
      if (down) {
        parts.push([new THREE.CylinderGeometry(0.2, 0.24, 1, 7), rodMX([x, y + 0.2, z], [x + 7.5, y + 0.45, z + 3])], [new THREE.BoxGeometry(4, 0.16, 0.2), MX(x + 6.5, y + 0.6, z + 3, 0, 0.4)]);
        blockers.push({ x: x + 4, z: z + 1.6, r: 1.1 });
        addThing({ id: 'pole' + z, name: 'Fallen power pole', verb: 'Look', x: x + 3, y: y + 0.5, z: z + 1.5, r: 2, prov: ['X', 'the old power line: ' + NEW], use: () => bark('Pole’s down again. The wire still hums, some mornings. Nothing’s on the other end.', ['X', NEW]) });
        continue;
      }
      parts.push([new THREE.CylinderGeometry(0.17, 0.23, 8.2, 8), MX(x, y + 4.1, z)], [new THREE.BoxGeometry(4, 0.16, 0.18), MX(x, y + 7.4, z)]);
      for (const s of [-1.5, 1.5]) parts.push([new THREE.CylinderGeometry(0.07, 0.09, 0.26, 8), MX(x + s, y + 7.6, z)]);
      blockers.push({ x, z, r: 0.35 });
      const zn = z + 50, xn = roadX(zn) - 18, yn = h(xn, zn), downNext = Math.floor(zn / 50) % 9 === 4;
      for (const s of [-1.5, 1.5]) {
        let prev = null;
        for (let k = 0; k <= 12; k++) {
          const t = k / 12, xx = lerp(x + s, xn + s, t), zz = lerp(z, zn, t);
          const yy = downNext ? lerp(y + 7.7, h(xx, zz) + 0.1, smooth(0.3, 1, t)) : lerp(y + 7.7, yn + 7.7, t) - 1.8 * Math.sin(Math.PI * t);
          if (prev) wires.push(...prev, xx, yy, zz);
          prev = [xx, yy, zz];
        }
      }
    }
    if (parts.length) g.add(mesh(planarUV(merge(parts), 1.2), M.timber));
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    g.add(new THREE.LineSegments(wg, M.wire));
  }
  // the pipeline on the west side, on trestles; broken sections leak, and leaks are water
  {
    const parts = [];
    for (let z = z0; z < z0 + CHUNK; z += 14) {
      const x = roadX(z) + 24, y = h(x, z), zn = z + 14, xn = roadX(zn) + 24, yn = h(xn, zn), broken = Math.floor(z / 14) % 19 === 7;
      parts.push([new THREE.BoxGeometry(0.5, 1.6, 0.5), MX(x, y + 0.8, z)], [new THREE.BoxGeometry(1.2, 0.12, 0.5), MX(x, y + 1.6, z)]);
      blockers.push({ x, z, r: 0.45 });   // the trestles; Jacob ducks under the pipe between them, the tractor drives under it
      if (broken) {
        parts.push([new THREE.CylinderGeometry(0.34, 0.34, 1, 12), rodMX([x, y + 1.95, z], [lerp(x, xn, 0.42), lerp(y, yn, 0.42) + 1.6, lerp(z, zn, 0.42)])]);
        const lx = lerp(x, xn, 0.5), lz = lerp(z, zn, 0.5);
        const pool = mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.15, metalness: 0.2 }), { cast: false });
        pool.rotation.x = -Math.PI / 2; pool.position.set(lx, h(lx, lz) + 0.04, lz); g.add(pool);
        W.leaks.push({ x: lx, z: lz });
        addThing({ id: 'leak' + z, name: 'Pipeline leak', verb: () => S.sips < 4 || canFill() ? 'Fill up' : 'Look', x: lx, y: 1.2, z: lz, r: 2.2, prov: ['X', 'the old water pipeline: ' + NEW], use: () => {
          if (S.sips < 4 || canFill()) { S.sips = 4; const c = topUpCanister(); sfx.fill(); bark('Pipeline water. Tastes of rust and somebody else’s taxes. It’s wet.' + c, ['X', NEW]); updateVitals(); }
          else bark('The pipe weeps here. Cogswell would bill the ground for it if he could.', ['X', NEW]);
        } });
        continue;
      }
      parts.push([new THREE.CylinderGeometry(0.34, 0.34, 1, 12), rodMX([x, y + 1.95, z], [xn, yn + 1.95, zn])]);
      if (Math.floor(z / 14) % 5 === 0) parts.push([new THREE.TorusGeometry(0.37, 0.06, 6, 14), MX(x, y + 1.95, z, 0, Math.atan2(xn - x, zn - z))]);
    }
    g.add(mesh(planarUV(merge(parts), 1.5), M.rust));
  }
  // rocks, scrub and Razor-Spinifex: instanced, scattered off the road, kept clear of the places that matter
  {
    const rocks = [], scrub = [], clumps = [];
    for (let k = 0; k < 140; k++) {
      const z = z0 + R() * CHUNK, x = (R() - 0.5) * 2 * (HALF_W - 10), off = Math.abs(x - roadX(z)), roll = R();
      if (off < 10 || nearPOI(x, z, 14)) continue;
      if (roll < 0.22) rocks.push([x, z, 0.3 + R() * (h(x, z) > 3 ? 2.2 : 1.2), R()]);
      else if (roll < 0.62) scrub.push([x, z, 0.4 + R() * 0.7, R()]);
      else clumps.push([x, z, 0.5 + R() * 0.8]);
    }
    if (rocks.length) {
      const im = new THREE.InstancedMesh(planarUV(new THREE.DodecahedronGeometry(1, 1), 1.6), M.rock, rocks.length); im.castShadow = im.receiveShadow = true;
      rocks.forEach(([x, z, s, r], k) => { im.setMatrixAt(k, MX(x, h(x, z) + s * 0.25, z, r * 3, r * 6, 0, s * 1.5, s * 0.7, s * 1.1)); if (s > 0.9) blockers.push({ x, z, r: s * 1.1 }); });
      g.add(im);
    }
    if (scrub.length) {
      const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), M.scrub, scrub.length); im.castShadow = true;
      const c = new THREE.Color();
      scrub.forEach(([x, z, s, r], k) => { im.setMatrixAt(k, MX(x, h(x, z) + s * 0.35, z, 0, r * 6, 0, s, s * 0.6, s)); im.setColorAt(k, c.setHSL(0.17 + r * 0.08, 0.12 + r * 0.1, 0.42 + r * 0.12)); });
      g.add(im);
    }
    if (clumps.length) {
      const BLADES = 16, blade = new THREE.ConeGeometry(0.018, 1, 3); blade.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(blade, M.spinifex, clumps.length * BLADES);
      const straw = new THREE.Color(0xd2a94e), cc = new THREE.Color();
      clumps.forEach(([x, z, s], k) => {
        const y = h(x, z);
        for (let b = 0; b < BLADES; b++) {
          const a = b * 2.39996 + k, lean = 0.35 + (b % 5) * 0.12;
          im.setMatrixAt(k * BLADES + b, MX(x + Math.cos(a) * 0.08 * s, y, z + Math.sin(a) * 0.08 * s, Math.sin(a) * lean, 0, Math.cos(a) * lean, 1, s * (0.6 + (b % 4) * 0.18), 1));
          im.setColorAt(k * BLADES + b, cc.copy(straw).multiplyScalar(0.85 + (b % 3) * 0.08));
        }
        W.spinifex.push({ x, z, r: 0.55 + s * 0.55, im, first: k * BLADES, n: BLADES, fed: 0, chunk: i });
      });
      g.add(im);
    }
  }
  g.userData.z = z0 + CHUNK / 2;
  scene.add(g); chunks.push(g);
}

// the places that matter, so the scatter keeps clear of them
const POI = {
  shacks: [{ x: -80, z: 262, id: 'shack1' }, { x: 94, z: 868, id: 'shack2' }, { x: -72, z: 1522, id: 'shack3' }],
  caves: [{ x: 118, z: 560, stalker: true }, { x: -114, z: 1180, stalker: true }, { x: 104, z: 1642, stalker: false }],
  gums: [{ x: 15.5, z: 346 }, { x: -16.5, z: 992 }, { x: 18, z: 1412 }],
  weeds: [{ x: -42, z: 424 }, { x: 47, z: 1088 }, { x: -50, z: 1296 }],
  wattle: [{ x: 62, z: 758 }],
};
function nearPOI(x, z, r) {
  for (const list of Object.values(POI)) for (const p of list) if (Math.hypot(x - (p.x + roadX(p.z)), z - p.z) < r + 10) return true;
  return false;
}
const at = (p) => ({ x: p.x + roadX(p.z), z: p.z });   // POI x is measured from the road

// ---------- a side track: a fainter ribbon from the road to somewhere ----------
function track(x0, z0, x1, z1, w = 2.6) {
  const p = [], c = [], u = [], ix = [], steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3);
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, bend = Math.sin(t * Math.PI) * 6, x = x0 + dx * t + nx * bend, z = z0 + dz * t + nz * bend;
    for (const a of [-1, 0, 1]) { const xx = x + nx * a * w / 2, zz = z + nz * a * w / 2; p.push(xx, h(xx, zz) + 0.035, zz); u.push(xx / 2.5, zz / 2.5); const k = a === 0 ? 1.0 : 0.88; c.push(1.05 * k, 0.94 * k, 0.86 * k); }
  }
  for (let s = 0; s < steps; s++) for (let a = 0; a < 2; a++) { const i0 = s * 3 + a, i1 = i0 + 1, i2 = i0 + 3, i3 = i2 + 1; ix.push(i0, i2, i1, i1, i2, i3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(ix); g.computeVertexNormals();
  scene.add(mesh(g, M.road, { cast: false }));
}

// ---------- abandoned shacks: walk in, out of the sun, and look round ----------
const SHACK_NOTES = {
  shack1: { note: 'Scratched in the doorframe: “WATER IN THE TANK IS FOR WHOEVER NEEDS IT. LEAVE SOME.” Someone has left some.', relic: { name: 'Ear-cage clasp', text: 'A brass clasp off an ear-cage, the fine mesh ones that keep gossip-flies out of your ears. The rest of it is long gone.', counts: 'earcage' }, tank: true },
  shack2: { note: 'Tally marks on the wall by the cot, four hundred and some. Then nothing. The Pipewright kept count of something.', relic: { name: 'Weathered map scrap', text: 'A corner of a hand-drawn map: the pipeline, the creek, and an X out in the ironstone with “COOL” written beside it.' } },
  shack3: { note: 'A child’s drawing nailed to the wall: a house, a sun with a face, and a tall thin thing on stilts at the edge of the page.', relic: null },
};
function buildShack(def) {
  const { x, z } = at(def), y = h(x, z), g = new THREE.Group(), facing = x > roadX(z) ? -Math.PI / 2 : Math.PI / 2;   // the door faces the road
  g.position.set(x, y, z); g.rotation.y = facing; scene.add(g);
  const Wd = 6, D = 5, H = 2.6, t = 0.12, door = 1.2;
  const walls = [[0, -D / 2, Wd, t], [-Wd / 2, 0, t, D], [Wd / 2, 0, t, D]];               // back and sides
  const frontL = (Wd - door) / 2;
  walls.push([-Wd / 2 + frontL / 2, D / 2, frontL, t], [Wd / 2 - frontL / 2, D / 2, frontL, t]);   // the front, with a doorway in the middle
  const parts = [];
  for (const [wx, wz, w, d] of walls) parts.push([new THREE.BoxGeometry(w, H, d), MX(wx, H / 2, wz)]);
  parts.push([new THREE.BoxGeometry(door, 0.4, t), MX(0, H - 0.2, D / 2)]);
  g.add(mesh(planarUV(merge(parts), 1.2), M.boards));
  const roof = mesh(planarUV(new THREE.BoxGeometry(Wd + 0.7, 0.05, D + 0.8), 1), M.tin); roof.position.set(0, H + 0.25, 0); roof.rotation.x = 0.1; g.add(roof);
  const missing = mesh(new THREE.BoxGeometry(1.4, 0.06, 1.2), M.black); missing.position.set(1.4, H + 0.27, -0.6); missing.rotation.x = 0.1; missing.visible = false; g.add(missing);
  // inside: a cot, a crate, tins, a note on the beam
  const cot = mesh(planarUV(new THREE.BoxGeometry(0.9, 0.45, 1.9), 1), M.canvas); cot.position.set(-2.2, 0.23, -1.2); g.add(cot);
  const crate = mesh(planarUV(new THREE.BoxGeometry(0.7, 0.6, 0.7), 0.8), M.timber); crate.position.set(2.1, 0.3, -1.6); g.add(crate);
  for (let k = 0; k < 4; k++) { const tin = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 10), M.iron); tin.position.set(1.9 + (k % 2) * 0.16, 0.66, -1.7 + Math.floor(k / 2) * 0.16); g.add(tin); }
  const world = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(new THREE.Vector3(x, 0, z));
  for (const [wx, wz, w, d] of walls) {
    const a = world(wx - w / 2, wz - d / 2), b = world(wx + w / 2, wz + d / 2);
    blockers.push({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) });
  }
  const inside = { x, z, r: 2.4, why: 'shack' }; shades.push(inside);
  const info = SHACK_NOTES[def.id], np = world(0, -D / 2 + 0.3), cp = world(-2.2, -1.2);
  addThing({ id: def.id + ':note', name: 'Something written', verb: 'Read', x: np.x, y: y + 1.6, z: np.z, r: 1.2, prov: ['X', 'roadside ruins: ' + NEW], use: () => { bark(info.note, ['X', NEW]); meet('ruin'); } });
  addThing({ id: def.id + ':cot', name: 'Cot', verb: 'Rest a moment', x: cp.x, y: y + 0.5, z: cp.z, r: 1.3, prov: ['X', NEW], use: () => {
    S.stress = Math.max(0, S.stress - 18); S.time += 600; updateVitals();
    bark('Ten minutes off my feet. The shade in here is honest, at least. No branches.', ['X', NEW]);
  } });
  if (info.tank) {
    const tp = world(Wd / 2 + 0.9, 0), tank = mesh(planarUV(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 16), 1), M.tin); tank.position.set(tp.x, y + 0.8, tp.z); scene.add(tank);
    blockers.push({ x: tp.x, z: tp.z, r: 0.8 });
    addThing({ id: def.id + ':tank', name: 'Rainwater tank', verb: () => S.flags.tank ? 'Look' : 'Fill the water bag', x: tp.x, y: y + 1, z: tp.z, r: 1.6, prov: ['X', NEW], use: () => {
      if (S.flags.tank) { bark('Left some, like the sign said.', ['X', NEW]); return; }
      S.flags.tank = true; S.sips = 4; const c = topUpCanister(); sfx.fill(); updateVitals(); bark('Somebody’s kindness, in a tin tank. I’ll leave a little for the next fool.' + c, ['X', NEW]);
    } });
  }
  if (info.relic) placeRelic(info.relic, world(2.1, -1.6).add(new THREE.Vector3(0, y + 0.66, 0)), def.id);
  W.flySources.push({ x, z, r: 16 });
  track(roadX(z) + (x > roadX(z) ? 4 : -4), z - 6, world(0, D / 2 + 1.5).x, world(0, D / 2 + 1.5).z);
  if (def.id !== 'shack2') buildArgus(world(-Wd / 2 - 3, 2).x, world(-Wd / 2 - 3, 2).z);
}

// ---------- rock shelters and dens: cool inside, and something may be lying on top ----------
function buildCave(def) {
  const { x, z } = at(def), y = h(x, z), toRoad = Math.sign(roadX(z) - x), g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = toRoad > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(g);
  const R = rng(Math.round(z * 13)), parts = [];
  for (let k = 0; k < 11; k++) { const a = Math.PI * (0.05 + 0.9 * k / 10), r = 4.2 + R() * 0.6, s = 1.6 + R() * 1.3; parts.push([new THREE.DodecahedronGeometry(1, 1), MX(Math.cos(a) * r, s * 0.6, -Math.sin(a) * r + 1, R() * 3, R() * 3, 0, s * 1.3, s, s)]); }
  parts.push([new THREE.DodecahedronGeometry(1, 1), MX(0, 4.3, -1.4, 0.1, 0.3, 0, 5.4, 1.1, 3.6)]);              // the overhang
  g.add(mesh(planarUV(merge(parts), 1.6), M.rock));
  const world = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
  for (let k = 0; k < 11; k++) { const a = Math.PI * (0.05 + 0.9 * k / 10), p = world(Math.cos(a) * 4.4, 0, -Math.sin(a) * 4.4 + 1); blockers.push({ x: p.x, z: p.z, r: 1.6 }); }
  shades.push({ x: world(0, 0, -1).x, z: world(0, 0, -1).z, r: 2.6, why: 'shelter' });
  const mouth = world(0, 0, 3);
  if (def.stalker) {
    // signs, for anyone who reads them: scratches, a gnawed bone, a smell
    for (let k = 0; k < 4; k++) { const b = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), M.bone); const p = world(-1 + k * 0.6, 0.06, 1.6 + (k % 2) * 0.5); b.position.copy(p); b.rotation.set(Math.PI / 2, 0, k); scene.add(b); }
    addThing({ id: 'den' + z, name: 'Rock shelter', verb: 'Look', x: mouth.x, y: y + 1, z: mouth.z, r: 2.5, prov: ['X', 'den placement: ' + NEW], use: () => bark('Scratches on the stone, higher than my head. Bones, gnawed clean. Something lives up top. Don’t forget to look up, Jacob.', ['X', NEW]) });
    buildStalker(world(0.4, 5.15, -0.6), g.rotation.y, z);
  } else {
    const seep = world(0, 0.05, -1.5), pool = mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshStandardMaterial({ color: 0x241612, roughness: 0.12 }), { cast: false });
    pool.rotation.x = -Math.PI / 2; pool.position.set(seep.x, h(seep.x, seep.z) + 0.04, seep.z); scene.add(pool);
    addThing({ id: 'seep' + z, name: 'Seep at the back of the shelter', verb: () => S.sips < 4 || canFill() ? 'Fill up' : 'Look', x: seep.x, y: y + 0.4, z: seep.z, r: 1.6, prov: ['X', NEW], use: () => {
      if (S.sips < 4 || canFill()) { S.sips = 4; const c = topUpCanister(); sfx.fill(); updateVitals(); bark('A seep. Cold as anything out here gets. Nobody’s taxing this one. Yet.' + c, ['X', NEW]); }
      else bark('Water out of rock. The Book would call it a miracle. I call it Tuesday, if I’m lucky.', ['X', NEW]);
    } });
    placeRelic({ name: 'Pre-Fracture glass', text: 'A thick lens of glass, ground perfectly smooth, wedged in a crack at the back of the shelter. No anima in it at all.' }, world(1.3, 0.3, -1.9), 'cave' + z);
  }
  track(roadX(z) + Math.sign(x - roadX(z)) * 4, z + 5, mouth.x, mouth.z);
}

// ---------- the Gallows-Gum: perfect shade, and a stain beneath it ----------
function buildGum(def) {
  const { x, z } = at(def), y = h(x, z), g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
  const R = rng(Math.round(z * 31)), parts = [];
  parts.push([new THREE.CylinderGeometry(0.45, 0.7, 7, 10), MX(0, 3.5, 0)]);
  const limbs = [];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.27 + R(), len = 4 + R() * 1.5, tip = [Math.cos(a) * len, 7 + R() * 1.5, Math.sin(a) * len];
    parts.push([new THREE.CylinderGeometry(0.26, 0.26, 1, 7), rodMX([0, 6.4, 0], tip)]);
    limbs.push(tip);
  }
  g.add(mesh(merge(parts), M.gumBark));
  const leaves = [];
  for (const tip of limbs) for (let j = 0; j < 4; j++) leaves.push([new THREE.IcosahedronGeometry(1, 0), MX(tip[0] + (R() - 0.5) * 2.4, tip[1] + R() * 1.2, tip[2] + (R() - 0.5) * 2.4, R(), R(), 0, 1.3 + R() * 0.8, 0.8, 1.3 + R() * 0.8)]);
  g.add(mesh(merge(leaves), M.gumLeaf));
  // the limb that waits: hung from a pivot over the best of the shade
  const pivot = new THREE.Group(); pivot.position.set(0, 6.6, 0); g.add(pivot);
  const limb = mesh(new THREE.CylinderGeometry(0.22, 0.34, 4.6, 8), M.gumBark); limb.position.set(0, 0, 2.2); limb.rotation.x = Math.PI / 2 - 0.25; pivot.add(limb);
  for (let k = 0; k < 6; k++) { const strip = mesh(new THREE.PlaneGeometry(0.12, 1.2 + R()), M.gumBark); strip.material = M.gumBark; strip.position.set((R() - 0.5) * 3, 5.2 - R(), (R() - 0.5) * 3); g.add(strip); }
  const stain = mesh(new THREE.CircleGeometry(3.2, 24), M.stain, { cast: false }); stain.rotation.x = -Math.PI / 2; stain.position.set(0.6, 0.06, 1.4); g.add(stain);
  for (let k = 0; k < 3; k++) { const b = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.45, 6), M.bone); b.position.set(R() * 2, 0.08, 1 + R() * 2); b.rotation.set(Math.PI / 2, 0, R() * 3); g.add(b); }
  blockers.push({ x, z, r: 0.85 });
  const gum = { x, z, r: 6.5, relax: 0, cool: 0, pivot, swing: 0, creaked: false, struck: 0 };
  W.gums.push(gum); shades.push({ x, z, r: 6.5, why: 'gum', gum });
  W.flySources.push({ x, z, r: 12 });
  addThing({ id: 'gum' + z, name: 'Gallows-Gum', verb: 'Look', x, y: y + 1.5, z, r: 2.6, prov: ['C', GUIDE], use: () => { meet('gum'); bark('Best shade for twenty clicks, and the ground under it is stained red. It waits for you to get comfortable.', ['C', GUIDE + ': it waits for travellers to relax']); } });
}

// ---------- the Drop-Stalker: leopard-sized, built like a koala that lifts, waiting on the overhang ----------
function buildStalker(p, facing, id) {
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = facing; scene.add(g);
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const S1 = new THREE.SphereGeometry(1, 16, 12);
  part(S1, M.fur, 0, 0.05, 0, 0.62, 0.48, 0.95);                // the body, heavy at the shoulders
  part(S1, M.fur, 0, 0.18, 0.55, 0.62, 0.5, 0.5);
  const head = new THREE.Group(); head.position.set(0, 0.32, 1.02); g.add(head);
  const hp = (geo, mat, x, y, z, sx, sy, sz) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); head.add(m); return m; };
  hp(S1, M.fur, 0, 0, 0, 0.42, 0.36, 0.4);
  const ears = [hp(S1, M.fur, -0.36, 0.22, -0.05, 0.22, 0.2, 0.08), hp(S1, M.fur, 0.36, 0.22, -0.05, 0.22, 0.2, 0.08)];
  hp(S1, M.furDark, 0, -0.06, 0.36, 0.13, 0.17, 0.12);           // the big dark nose
  for (const s of [-1, 1]) hp(S1, M.stalkerEye, s * 0.16, 0.08, 0.32, 0.045, 0.045, 0.03);
  for (const s of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.12, 0.09, 0.7, 8), M.fur, s * 0.4, -0.25, 0.75).rotation.x = 0.5;
    for (let c = 0; c < 3; c++) { const cl = part(new THREE.ConeGeometry(0.025, 0.16, 6), M.claw, s * 0.4 + (c - 1) * 0.05, -0.58, 0.98); cl.rotation.x = 2.2; }
    part(new THREE.CylinderGeometry(0.15, 0.1, 0.6, 8), M.fur, s * 0.42, -0.25, -0.5).rotation.x = -0.3;
  }
  W.stalkers.push({ id, g, head, ears, home: p.clone(), facing, state: 'perched', seen: 0, warned: false, cool: 0, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
}

// ---------- the plants ----------
function buildWeedPatch(def) {
  const { x, z } = at(def), R = rng(Math.round(z * 7)), parts = [];
  for (let k = 0; k < 7; k++) {
    const px = x + (R() - 0.5) * 9, pz = z + (R() - 0.5) * 9, y = h(px, pz);
    for (let l = 0; l < 13; l++) { const a = l * 2.39996, r = 0.05 + l * 0.022; parts.push([new THREE.SphereGeometry(1, 6, 4), MX(px + Math.cos(a) * r, y + 0.06, pz + Math.sin(a) * r, 0, -a, 0.5, 0.06, 0.035, 0.03 + l * 0.004)]); }
    W.weeds.push({ x: px, z: pz });
  }
  scene.add(mesh(merge(parts), M.compass, { cast: false }));
  addThing({ id: 'weed' + z, name: 'Compass-Weed', verb: 'Look', x, y: h(x, z) + 0.2, z, r: 5, prov: ['C', GUIDE], use: () => { meet('weed'); bark('Compass-Weed. Pale spirals, perfect ones. The needle won’t thank me, and neither will my sense of which way’s north.', ['C', GUIDE]); } });
}
function buildArgus(x, z) {
  const g = new THREE.Group(), y = h(x, z); g.position.set(x, y, z); scene.add(g);
  const R = rng(Math.round(x * 17 + z)), parts = [], eyes = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = 0.6 + R() * 0.6, top = [Math.cos(a) * r, 0.9 + R() * 0.7, Math.sin(a) * r];
    parts.push([new THREE.CylinderGeometry(0.035, 0.05, 1, 6), rodMX([0, 0, 0], top)]);
    const eye = new THREE.Group(); eye.position.set(...top); g.add(eye);
    const w = mesh(new THREE.SphereGeometry(0.11, 12, 8), M.eyeWhite); eye.add(w);
    const p = mesh(new THREE.SphereGeometry(0.05, 10, 6), M.pupil); p.position.z = 0.085; eye.add(p);
    eyes.push(eye);
  }
  g.add(mesh(merge(parts), M.timber));
  W.argus.push({ x, z, eyes });
  addThing({ id: 'argus' + Math.round(z), name: 'Argus-Bush', verb: 'Look', x, y: y + 1, z, r: 2, prov: ['C', GUIDE], use: () => { meet('argus'); bark('Argus-Bush. Every pod’s an eye, and every eye’s on me. They keep what they see. It’s seen me before.', ['C', GUIDE + ': it records fear and memory']); } });
}
function buildWattle(def) {
  const { x, z } = at(def), R = rng(Math.round(z * 5)), trunks = [], puffs = [];
  for (let k = 0; k < 9; k++) {
    const px = x + (R() - 0.5) * 22, pz = z + (R() - 0.5) * 22, y = h(px, pz);
    trunks.push([new THREE.CylinderGeometry(0.14, 0.22, 3.6, 7), MX(px, y + 1.8, pz)]);
    for (let j = 0; j < 7; j++) { const a = j * 2.4; puffs.push([new THREE.IcosahedronGeometry(0.7, 0), MX(px + Math.cos(a) * (1 + R()), y + 3.6 + R(), pz + Math.sin(a) * (1 + R()))]); }
    blockers.push({ x: px, z: pz, r: 0.3 });
  }
  scene.add(mesh(merge(trunks), M.timber)); scene.add(mesh(merge(puffs), M.wattle));
  W.wattles.push({ x, z, r: 16 });
  // the shortcut it seems to offer, and the mirage at the end of it
  track(roadX(z - 40) + 4, z - 40, x + 10, z + 30, 2);
  const m = mesh(new THREE.CircleGeometry(7, 28), M.mirage.clone(), { cast: false, receive: false }); m.rotation.x = -Math.PI / 2; m.position.set(x + 4, h(x + 4, z + 18) + 0.08, z + 18); scene.add(m);
  W.mirages.push({ m, x: x + 4, z: z + 18, wattle: true });
  addThing({ id: 'wattle', name: 'Judas-Wattle', verb: 'Look', x, y: h(x, z) + 2, z, r: 12, prov: ['C', GUIDE], use: () => { meet('wattle'); bark('Judas-Wattle, gold as a payday. Breathe the haze and the red goes green and there’s water up ahead. There isn’t.', ['C', GUIDE + ': Golden Haze']); } });
}

// ---------- the six finds: small traces of other people's journeys ----------
const RELICS = [];
function placeRelic(def, p, where) {
  const m = mesh(new THREE.OctahedronGeometry(0.09, 0), M.relic); m.position.copy(p); scene.add(m);
  const r = { ...def, m, where }; RELICS.push(r);
  addThing({ id: 'relic:' + def.name, name: def.name, verb: 'Pick it up', x: p.x, y: p.y, z: p.z, r: 1.3, prov: ['X', 'roadside relic: ' + NEW], enabled: () => !S.finds[def.name], use: () => {
    S.finds[def.name] = { text: def.text, where: placeAt(p.z, p.x), at: clockText() };
    saveRoad(); m.visible = false; sfx.find(); toast(`Found · ${def.name} · ${Object.keys(S.finds).length} of 6`);
    bark(def.text, ['X', NEW]);
  } });
}

// ---------- the Salt-Strider: one crossing, early on the long straight ----------
function buildStrider() {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const body = mesh(new THREE.SphereGeometry(1, 14, 10), M.salt); body.scale.set(0.9, 0.55, 1.5); body.position.y = 6.2; g.add(body);
  const head = mesh(new THREE.ConeGeometry(0.28, 1.1, 8), M.salt); head.position.set(0, 6.0, 1.8); head.rotation.x = Math.PI / 2 + 0.5; g.add(head);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.6, 6, sz * 0.8); g.add(hip);
    const upper = mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), M.salt); upper.position.y = 1.4; upper.rotation.z = sx * 0.55; hip.add(upper);
    const knee = new THREE.Group(); knee.position.set(sx * 1.6, 2.9, 0); hip.add(knee);
    const lower = mesh(new THREE.CylinderGeometry(0.04, 0.07, 4.4, 6), M.salt); lower.position.set(-sx * 0.4, -3.6, 0); lower.rotation.z = -sx * 0.18; knee.add(lower);
    legs.push({ hip, sx, sz });
  }
  return { g, legs, state: 'waiting', x: 0, z: 1082, dir: 1, agitation: 0, hit: false, t: 0 };
}

// ---------- the tractor: the shared model, and where it is ----------
function buildTractor() {
  const model = buildTractorModel(THREE, { maxAniso });
  scene.add(model.group);
  return { model, g: model.group, x: 0, z: 0, yaw: 0, speed: 0, stall: 0, wasThrottle: false };
}
const CANISTER_MAX = 6;
// the tractor's own things: where they are this frame, in the world
const _tw = new THREE.Vector3();
function tractorPoint(lx, ly, lz) { return _tw.set(lx, ly, lz).applyMatrix4(tractor.g.matrixWorld); }
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
    const bits = ['spare wire', 'a tin of grease', 'the tyre awl'];
    if (n) bits.push(`${n === 1 ? 'one find' : words(n) + ' finds'} from the road, wrapped in rag`);
    bark(`In the compartment: ${bits.join(', ')}.${h0 && h0.dung >= 6 ? ' The dung bin’s strapped down on the lid.' : ''}`, ['X', NEW]);
  } });
  W.tractorThings = [can, box];
}
const words = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n);
// the radio: Bleak Flats, when the antenna catches it
const RADIO = [
  '…Flats relay, Flats relay… water truck’s held at the Silos till noon… repeat, noon…',
  '…accounts in arrears will be visited in person. H. R. Cogswell and Associates thanks you for your…',
  '…anyone out on the north road, strider walking the salt this morning. Give it room…',
  '…Rusty Cog’s open, and the stew is technically food…',
  '…static, and under it, very faint, somebody humming…',
];
function radio() {
  if (!S.inTractor) return;
  sfx.radio();
  const line = RADIO[(S.flags.radio = ((S.flags.radio ?? -1) + 1) % RADIO.length)];
  ui.whisper.innerHTML = `<span style="font-style:normal;color:#d8e6c8">Radio · </span>${esc(line)}<span class="tagline ws">${tagHTML('X', 'the radio: ' + NEW)}</span>`;
  ui.whisper.classList.add('on'); clearTimeout(whisperTimer); whisperTimer = setTimeout(() => ui.whisper.classList.remove('on'), 5200);
}

// ---------- Bleak Flats on the horizon: the fence, the rim, headframes and stamp-mill smoke ----------
function buildBleakFlats() {
  const z = 1830, parts = [], peas = [];
  for (let x = -120; x <= 120; x += 4) {
    if (Math.abs(x) < 4) continue;
    const xx = roadX(z) + x, y = h(xx, z);
    parts.push([new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), MX(xx, y + 1.1, z)]);
    if (x % 8 === 0) peas.push([new THREE.SphereGeometry(0.12, 8, 6), MX(xx + 1.5, y + 1.3, z)]);
  }
  parts.push([new THREE.BoxGeometry(240, 0.04, 0.04), MX(roadX(z), h(roadX(z), z) + 1.9, z)], [new THREE.BoxGeometry(240, 0.04, 0.04), MX(roadX(z), h(roadX(z), z) + 1.2, z)]);
  scene.add(mesh(merge(parts), M.iron)); scene.add(mesh(merge(peas), M.pea, { cast: false }));
  const cx = roadX(1800), cz = 2060, frames = [];
  for (let k = 0; k < 7; k++) {
    const a = -1.2 + k * 0.4, x = cx + Math.sin(a) * 120, zz = cz - Math.cos(a) * 60 + 40, y = h(x, zz) - 2;
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) frames.push([new THREE.CylinderGeometry(0.2, 0.25, 1, 5), rodMX([x + dx * 1.6, y, zz + dz * 1.6], [x + dx * 0.4, y + 22 + k % 3 * 4, zz + dz * 0.4])]);
    frames.push([new THREE.CylinderGeometry(1.6, 1.6, 0.5, 12), MX(x, y + 22 + k % 3 * 4, zz, 0, 0, Math.PI / 2)]);
    if (k % 2 === 0) { frames.push([new THREE.CylinderGeometry(1.2, 1.6, 30, 10), MX(x + 14, y + 15, zz + 8)]); W.smoke.push({ x: x + 14, y: y + 31, z: zz + 8 }); }
  }
  scene.add(mesh(merge(frames), M.iron));
  addThing({ id: 'fence', name: 'The perimeter fence', verb: 'Look', x: roadX(z) + 6, y: h(roadX(z), z) + 1.2, z, r: 3, prov: ['C', GUIDE + ': the Scream-Pea fence'], use: () => bark('Scream-Peas on the wire. Get too close and they’ll tell the whole crater.', ['P', GUIDE + ': Scream-Peas on the perimeter']) });
}
// mesas: the far edge of things, banded like the cows
function buildMesas() {
  const R = rng(77), parts = [];
  for (let k = 0; k < 18; k++) {
    const side = k % 2 ? 1 : -1, z = -200 + k * 140 + R() * 60, x = roadX(Math.max(0, Math.min(1800, z))) + side * (520 + R() * 380), rad = 40 + R() * 70, ht = 18 + R() * 30;
    parts.push([new THREE.CylinderGeometry(rad * 0.8, rad, ht, 12, 1), MX(x, ht / 2 - 4, z, 0, R() * 3, 0)]);
  }
  const m = mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0x6a3424, roughness: 1, flatShading: true }), { cast: false }); scene.add(m);
}

// ---------- flies, smoke: small moving things ----------
const flySwarms = [];
function spawnSwarm(x, z, n = 4) {
  if (flySwarms.length > 2) return;
  const flies = [];
  for (let k = 0; k < n; k++) {
    const f = new THREE.Group(); scene.add(f);
    const b = mesh(new THREE.SphereGeometry(0.045, 10, 8), M.fly, { cast: false }); b.scale.set(1, 0.8, 1.5); f.add(b);   // fist-sized, as the Guide has them
    const wings = [];
    for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(0.09, 0.05), M.wing, { cast: false, receive: false }); w.position.set(s * 0.05, 0.03, 0); w.userData.s = s; f.add(w); wings.push(w); }
    f.position.set(x, h(x, z) + 1.5, z);
    flies.push({ f, wings, ph: Math.random() * TAU, r: 1.2 + Math.random() * 0.8 });
  }
  flySwarms.push({ flies, life: 50, lost: 0, whisperIn: 3 });
  meet('flies');
}
const smokePuffs = [];
function updateSmoke(dt) {
  for (const s of W.smoke) if (Math.random() < dt * 1.2) {
    const m = mesh(new THREE.SphereGeometry(1, 8, 6), M.smoke, { cast: false, receive: false }); m.position.set(s.x, s.y, s.z); scene.add(m); smokePuffs.push({ m, life: 14 });
  }
  for (let i = smokePuffs.length - 1; i >= 0; i--) {
    const p = smokePuffs[i]; p.life -= dt; p.m.position.y += dt * 2.2; p.m.position.x -= dt * 1.4; p.m.scale.setScalar(2 + (14 - p.life) * 0.9);
    if (p.life <= 0) { scene.remove(p.m); p.m.geometry.dispose(); smokePuffs.splice(i, 1); }
  }
}

// ---------- state ----------
const S = {
  started: false, paused: false, ended: false, dead: false, inTractor: true, view: 'chase', compass: true, workshop: false,
  time: 6 * 3600 + 25 * 60, health: 100, water: 82, stress: 8, bleed: 0, sips: 3, can: 4, disoriented: 0, haze: 0, earcage: false,
  finds: {}, flags: {}, met: {}, footKm: 0, handoff: null, menuTab: 'finds',
};
const P = { x: 0, z: 0, yaw: 0, pitch: -0.05, look: 0, speed: 0, bob: 0, drift: 0, stun: 0 };
let tractor, strider;
try { const s = JSON.parse(localStorage.getItem('valtoria-road-save') || '{}'); S.finds = s.finds || {}; } catch (e) { /* storage unavailable */ }
try { S.workshop = localStorage.getItem('valtoria-workshop') === '1'; } catch (e) { /* storage unavailable */ }
// an ear-cage found in the yard (the Farm sketch's curio) keeps the flies out of his ears here too
try { const c = JSON.parse(localStorage.getItem('farm-of-rust-collection') || '{}'); S.earcage = (c.found || []).includes('earcage'); } catch (e) { /* storage unavailable */ }
function saveRoad() { try { localStorage.setItem('valtoria-road-save', JSON.stringify({ finds: S.finds })); } catch (e) { /* storage unavailable */ } }

// what Jacob knows about each thing he meets, for the field notes
const SPECIES = {
  spinifex: { name: 'Razor-Spinifex', tag: 'C', fact: 'Cuts anything that brushes it, and feeds on the blood. A fed clump goes red at the tips.', counter: 'Walk through it slowly or go round. Running opens you up. The tractor crushes it.' },
  weed: { name: 'Compass-Weed', tag: 'C', fact: 'Scrambles a compass, and a person’s sense of direction with it.', counter: 'Stop trusting the needle and your feet. Steer by the power line, the pipeline and the sun.' },
  gum: { name: 'Gallows-Gum', tag: 'C', fact: 'Offers the best shade on the road, and waits for whoever rests in it to relax.', counter: 'Use the shade, but keep moving. When the limb creaks, go.' },
  stalker: { name: 'Drop-Stalker', tag: 'C', fact: 'A leopard-sized, heavily muscled koala-like predator that ambushes travellers from above, around rocky overhangs.', counter: 'Listen for the clicking. Look up and hold its eye; it won’t drop on something watching it.' },
  flies: { name: 'Gossip-Flies', tag: 'C', fact: 'Fist-sized, oil-slick wings. They pick up fears and whisper them back.', counter: 'Get back in the tractor and outrun them. An ear-cage takes the edge off.' },
  wattle: { name: 'Judas-Wattle', tag: 'C', fact: 'Its pollen, the Golden Haze, turns the red world green and promises water.', counter: 'Keep to the road. Whatever’s shining up ahead isn’t there.' },
  argus: { name: 'Argus-Bush', tag: 'C', fact: 'Woody pods that open into eyes. It records fear and memory.', counter: 'Don’t linger, and don’t sleep near one.' },
  strider: { name: 'Salt-Strider', tag: 'C', fact: 'A tall, pale walker of the salt country.', counter: 'Stop, kill the engine, and let it cross. It only notices what moves.' },
  ruin: { name: 'Ruins on the road', tag: 'X', fact: 'Shacks people walked away from. Shade without branches, and sometimes a little water.', counter: '' },
};
function meet(k) { if (S.met[k]) return; S.met[k] = true; toast(`Field notes · ${SPECIES[k].name}`); }

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
  gulp: () => { for (const d of [0, 0.32]) tone({ f: 220, f2: 105, dur: 0.17, gain: 0.25, delay: d }); },
  fill: () => noiseHit({ f: 500, dur: 1.4, gain: 0.14, q: 0.8 }),
  find: () => { for (const [f, d] of [[660, 0], [990, 0.1], [1320, 0.2]]) tone({ f, dur: 1.2, gain: 0.04, delay: d }); },
  moan: () => { tone({ type: 'sawtooth', f: 55, f2: 42, dur: 2.4, gain: 0.07 }); tone({ f: 330, f2: 300, dur: 2.0, gain: 0.02 }); },
  thump: (g = 0.3) => { tone({ f: 60, f2: 38, dur: 0.3, gain: g }); noiseHit({ type: 'lowpass', f: 200, dur: 0.15, gain: g * 0.6 }); },
  door: () => tone({ type: 'sawtooth', f: 180, f2: 260, dur: 0.4, gain: 0.03 }),
  radio: () => { noiseHit({ f: 2400, q: 0.6, dur: 1.4, gain: 0.08 }); tone({ type: 'square', f: 880, dur: 0.06, gain: 0.02 }); },
};

// ---------- the HUD ----------
const ui = {};
for (const id of ['hud', 'title', 'btn-start', 'btn-yard', 'btn-ws', 'place', 'track-fill', 'km', 'compass', 'compass-strip', 'compass-note', 'time', 'heat', 'reticle', 'prompt', 'prompt-verb', 'prompt-name', 'prompt-tag', 'whisper', 'thought', 'toasts', 'mode', 'status', 'menu', 'menu-body', 'menu-close', 'jot', 'jot-thumb', 'jot-ctx', 'jot-kinds', 'jot-text', 'jot-where', 'jot-cancel', 'jot-save', 'end', 'end-card', 'fx-fade', 'fade-line', 'fx-hurt', 'fx-bleed', 'fx-stress', 'fx-haze', 'fx-swirl', 'fx-goggles']) ui[id.replace(/-(.)/g, (_, c) => c.toUpperCase())] = $(id);
const meters = { health: $('m-health'), water: $('m-water'), stress: $('m-stress') };
const clockText = () => { const m = Math.floor(S.time / 60) % 1440, hh = Math.floor(m / 60), mm = m % 60; return `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${hh < 12 ? 'am' : 'pm'}`; };
const hours = () => (S.time / 3600) % 24;
function shadeAt(x, z) { for (const s of shades) if (Math.hypot(x - s.x, z - s.z) < s.r) return s; return null; }
const heatNow = () => clamp(34 + 2.3 * (hours() - 6), 30, 52) - (shadeAt(P.x, P.z) ? 7 : 0);
let thoughtTimer = 0;
function bark(text, prov = ['X', NEW]) {
  ui.thought.innerHTML = `${esc(text)}<span class="tagline ws">${tagHTML(...prov)}</span>`;
  ui.thought.classList.add('on'); clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(() => ui.thought.classList.remove('on'), clamp(2200 + text.length * 55, 3000, 8000));
}
const once = (key, text, prov) => { if (S.flags['l:' + key]) return; S.flags['l:' + key] = true; bark(text, prov); };
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
function updateVitals() {
  const set = (el, v) => { el.querySelector('i').style.width = clamp(v, 0, 100) + '%'; el.querySelector('.n').textContent = Math.round(v); };
  set(meters.health, S.health); set(meters.water, S.water); set(meters.stress, S.stress);
  const st = [`Bag ${S.sips}/4 · canister ${S.can}/${CANISTER_MAX}`];
  if (S.bleed > 0.15) st.push('<span class="bad">bleeding</span>');
  if (S.disoriented > 0) st.push('<span class="bad">turned around</span>');
  if (shadeAt(P.x, P.z)) st.push('in the shade');
  ui.status.innerHTML = st.join(' · ');
}
const COMPASS_MARKS = (() => { const out = []; for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360, lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[n]; out.push(`<span class="${lab ? 'c' : ''}">${lab || '·'}</span>`); } return out.join(''); })();
ui.compassStrip.innerHTML = COMPASS_MARKS;
let needle = 0;
function updateHud(dt) {
  ui.time.textContent = clockText();
  const t = heatNow(); ui.heat.textContent = `${Math.round(t)} °C · ${t > 46 ? 'scorching' : t > 40 ? 'hazy' : 'clear'}`;
  const z = S.inTractor ? tractor.z : P.z, x = S.inTractor ? tractor.x : P.x;
  ui.place.textContent = placeAt(z, x).replace(/^./, c => c.toUpperCase());
  ui.trackFill.style.width = clamp(z / ARRIVE_Z * 100, 0, 100) + '%';
  ui.km.textContent = `${clamp((ARRIVE_Z - z) / ARRIVE_Z * LORE_KM, 0, LORE_KM).toFixed(1)} km to Bleak Flats`;
  // the compass: true heading, unless the weed has got into the needle
  const heading = ((-viewYaw() * 180 / Math.PI) % 360 + 360) % 360;
  const wild = S.disoriented > 0 ? Math.sin(S.time * 0.013) * 140 + Math.sin(S.time * 0.051) * 60 : 0;
  needle = lerp(needle, heading + wild, clamp(dt * (S.disoriented > 0 ? 2 : 8), 0, 1));
  ui.compassStrip.style.transform = `translateX(${(ui.compass.clientWidth / 2) - (needle + 360) / 15 * 30 - 15}px)`;
  ui.compass.hidden = !S.compass; ui.compass.classList.toggle('wild', S.disoriented > 0);
  ui.compassNote.hidden = !(S.compass && S.disoriented > 0);
  ui.compassNote.textContent = 'Compass-Weed · the needle’s lying. Follow the wires.';
  ui.mode.innerHTML = S.inTractor
    ? `<b>The tractor</b>W/S throttle · A/D steer · F drink · R radio · V ${S.view === 'chase' ? 'seat' : 'chase'} view · E climb down`
    : `<b>On foot</b>WASD walk · Shift run · E use · F drink · ${Math.hypot(P.x - tractor.x, P.z - tractor.z) < 3.4 ? 'E climb aboard' : 'the tractor waits'}`;
  ui.fxStress.style.opacity = smooth(45, 100, S.stress);
  ui.fxBleed.style.opacity = clamp(S.bleed / 2, 0, 0.9);
  ui.fxHaze.style.opacity = S.haze;
  ui.fxSwirl.style.opacity = S.disoriented > 0 ? Math.min(1, S.disoriented / 6) * 0.8 : 0;
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
const viewYaw = () => S.inTractor ? tractor.yaw + P.look : P.yaw;
function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* nothing to release */ } }

// ---------- using things ----------
let target = null;
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function pickTarget() {
  if (S.inTractor) return null;
  camera.getWorldDirection(_fwd);
  let best = null, bestS = 1e9;
  for (const t of things) {
    if (!t.enabled()) continue;
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
const valueOf = (v) => typeof v === 'function' ? v() : v;
function use() {
  if (S.inTractor) {
    if (Math.abs(tractor.speed) > 1.2) { bark('Not while she’s moving. I like my legs.', ['X', NEW]); return; }
    S.inTractor = false; tractor.speed = 0;
    const side = new THREE.Vector3(-Math.cos(tractor.yaw), 0, Math.sin(tractor.yaw)).multiplyScalar(-1.7);
    P.x = tractor.x + side.x; P.z = tractor.z + side.z; P.yaw = tractor.yaw + P.look; P.look = 0; sfx.door();
    once('down', 'Down off the tractor. The air tastes of hot iron, and everything out here has noticed.', ['X', NEW]);
    return;
  }
  if (target) { target.use(); return; }
  if (Math.hypot(P.x - tractor.x, P.z - tractor.z) < 3.4) {
    S.inTractor = true; P.look = 0; sfx.door(); tractor.model.spit(20);
    if (flySwarms.length) bark('Back aboard. The shielding hums, and the whispering goes thin and far away.', ['X', 'the anima shielding: ' + NEW]);
    else once('shield', 'Back aboard. The shielding hums. In here, nothing gets into my head that I didn’t put there.', ['X', 'the anima shielding: ' + NEW]);
  }
}
function drink() {
  if (S.water > 92) { bark('Not thirsty yet. Out here you ration even that.', ['X', NEW]); return; }
  if (S.inTractor && S.can) { S.can--; S.water = Math.min(100, S.water + 30); sfx.gulp(); updateVitals(); return; }   // at the wheel, off the canister's tap
  if (!S.sips) { once('dry', S.can ? 'Bag’s empty. There’s some in the canister on the tractor.' : 'Bag’s empty, canister too. The pipeline leaks, if you know where.', ['X', NEW]); return; }
  S.sips--; S.water = Math.min(100, S.water + 30); sfx.gulp(); updateVitals();
}

// the canister fills at the same places the bag does, if the tractor's parked close enough to carry it over
const canFill = () => S.can < CANISTER_MAX && Math.hypot(P.x - tractor.x, P.z - tractor.z) < 14;
function topUpCanister() {
  if (!canFill()) return S.can < CANISTER_MAX ? ' The canister’s on the tractor. Too far to lug it.' : '';
  S.can = CANISTER_MAX; return ' Canister’s full too.';
}

// ---------- the jotter (N) and the notebook ----------
const jot = { kind: 'gameplay', ctx: null, thumb: '', want: false };
function openJot() {
  if (!ui.jot.hidden) return;
  const z = S.inTractor ? tractor.z : P.z, x = S.inTractor ? tractor.x : P.x;
  jot.ctx = { area: 'road', place: placeAt(z, x), looking: target ? valueOf(target.name).replace(/^./, c => c.toLowerCase()) : '', heat: `${heatNow().toFixed(1)} °C`, clock: clockText() };
  jot.want = true; jot.thumb = ''; S.paused = true; releaseLock();
  ui.jotCtx.textContent = [jot.ctx.place.replace(/^./, c => c.toUpperCase()), jot.ctx.looking && 'looking at ' + jot.ctx.looking, jot.ctx.heat, jot.ctx.clock].filter(Boolean).join(' · ');
  ui.jotWhere.textContent = ideas.db ? 'Kept in this page’s notebook, where Claude can read it' : 'Kept on this computer · export from the notebook';
  ui.jotKinds.innerHTML = IDEA_KINDS.map(([k, l]) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${jot.kind === k}">${l}</button>`).join('');
  ui.jotText.value = ''; ui.jotThumb.hidden = true; ui.jot.hidden = false;
  setTimeout(() => ui.jotText.focus(), 30);
}
function closeJot() { ui.jot.hidden = true; S.paused = !ui.menu.hidden; canvas.focus(); }
async function saveJot() {
  const text = ui.jotText.value.trim(), c = jot.ctx; closeJot();
  if (!text) return;
  const ok = await addIdea(text, jot.kind, 'road-1', { ...c, pos: [+P.x.toFixed(1), +P.z.toFixed(1)] }, jot.thumb);
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
function renderMenu() {
  for (const b of ui.menu.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === S.menuTab));
  let html = '';
  if (S.menuTab === 'finds') {
    const all = ['Survey stake', 'Pipewright token', 'Pre-Fracture glass', 'Weathered map scrap', 'Ear-cage clasp', 'Miner’s brass chit'];
    html = `<h3>Roadside finds · ${Object.keys(S.finds).length} of ${all.length}</h3>` + all.map(n => S.finds[n]
      ? `<div class="row"><div class="hd"><b>${esc(n)}</b><span class="ws"><span class="tag X">Experimental</span></span></div><p>${esc(S.finds[n].text)}</p><p class="src">${esc(S.finds[n].where)} · ${esc(S.finds[n].at)}</p></div>`
      : `<div class="row missing">Something out there, not yet found.</div>`).join('') + `<p class="src" style="margin-top:12px">Finds are kept in this browser between journeys. The relics are new to the road, not from the books.</p>`;
  } else if (S.menuTab === 'guide') {
    const keys2 = Object.keys(SPECIES);
    html = `<h3>What Jacob knows</h3>` + keys2.map(k => {
      const s = SPECIES[k], met = S.met[k];
      return met ? `<div class="row"><div class="hd"><b>${esc(s.name)}</b><span class="ws">${tagHTML(s.tag, s.tag === 'C' ? GUIDE : NEW)}</span></div><p>${esc(s.fact)}</p>${s.counter ? `<p><i>${esc(s.counter)}</i> <span class="ws"><span class="tag X">Experimental</span> <span class="src">how the game lets you answer it</span></span></p>` : ''}</div>`
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
      <h3>Controls</h3><p>Driving: W/S throttle and brake, A/D steer, mouse looks, F drink from the canister, R the radio, V seat or chase view, E climb down (stop first). On foot: WASD, Shift run, E use or climb aboard, F drink. Always: C compass, Tab this notebook, N jot an idea, Esc pause.</p>`;
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

// ---------- moving: the tractor, and Jacob on foot ----------
function blocked(x, z, r) {
  for (const b of blockers) {
    if (b.r !== undefined) { if (Math.hypot(x - b.x, z - b.z) < b.r + r) return true; }
    else if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  }
  return false;
}
function driveTractor(dt) {
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const off = Math.abs(tractor.x - roadX(tractor.z)) > 5;
  let crush = 1; for (const c of nearby(W.spinifex, tractor.x, tractor.z, 3)) crush = 0.85;
  const max = SPEED.tractor * (off ? SPEED.offroad : 1) * crush;
  if (tractor.stall > 0) { tractor.stall -= dt; tractor.speed = lerp(tractor.speed, 0, clamp(dt * 3, 0, 1)); }
  else if (fwd > 0) tractor.speed = Math.min(max, tractor.speed + dt * 2.2);
  else if (fwd < 0) tractor.speed = tractor.speed > 0.2 ? Math.max(0, tractor.speed - dt * 6) : Math.max(-SPEED.reverse, tractor.speed - dt * 1.5);
  else tractor.speed = tractor.speed > 0 ? Math.max(0, tractor.speed - dt * 1.4) : Math.min(0, tractor.speed + dt * 1.4);
  if (tractor.speed > max) tractor.speed = lerp(tractor.speed, max, clamp(dt * 2, 0, 1));
  const drift = S.disoriented > 0 ? Math.sin(S.time * 0.02) * 0.25 : 0;     // the weed gets into his hands on the wheel too
  tractor.yaw += (steer * 0.75 + drift * Math.sign(tractor.speed)) * dt * clamp(Math.abs(tractor.speed) / 2.5, 0, 1) * Math.sign(tractor.speed || 1);
  const nx = tractor.x + Math.sin(tractor.yaw) * tractor.speed * dt, nz = tractor.z + Math.cos(tractor.yaw) * tractor.speed * dt;
  if (!blocked(nx, nz, 1.3)) { tractor.x = nx; tractor.z = nz; } else { if (Math.abs(tractor.speed) > 3) sfx.thump(0.3); tractor.speed *= -0.2; }
  tractor.x = clamp(tractor.x, -HALF_W + 10, HALF_W - 10); tractor.z = clamp(tractor.z, -30, 1900);
  P.x = tractor.x; P.z = tractor.z; P.speed = Math.abs(tractor.speed);
}
function walk(dt) {
  if (P.stun > 0) { P.stun -= dt; P.speed = 0; return; }
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const len = Math.hypot(f, s);
  if (!len) { P.speed = lerp(P.speed, 0, clamp(dt * 10, 0, 1)); return; }
  // under Compass-Weed his feet don't go quite where he points them
  const drift = S.disoriented > 0 ? Math.sin(S.time * 0.017) * 0.7 * Math.min(1, S.disoriented / 5) : 0;
  const yaw = P.yaw + drift, sp = run ? SPEED.run : SPEED.walk;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const dx = (fx * f + rx * s) / len * sp * dt, dz = (fz * f + rz * s) / len * sp * dt;
  if (!blocked(P.x + dx, P.z, 0.3) && Math.hypot(P.x + dx - tractor.x, P.z - tractor.z) > 1.4) P.x += dx;
  if (!blocked(P.x, P.z + dz, 0.3) && Math.hypot(P.x - tractor.x, P.z + dz - tractor.z) > 1.4) P.z += dz;
  P.x = clamp(P.x, -HALF_W + 5, HALF_W - 5); P.z = clamp(P.z, -30, 1900);
  P.speed = sp; S.footKm += sp * dt / 1000;
  const was = Math.floor(P.bob / Math.PI); P.bob += dt * sp * 4.2; if (Math.floor(P.bob / Math.PI) !== was) sfx.step();
}
function* nearby(list, x, z, pad) { for (const o of list) if (Math.abs(o.z - z) < (o.r || 0) + pad && Math.hypot(o.x - x, o.z - z) < (o.r || 0) + pad) yield o; }

// ---------- the camera ----------
const _n = new THREE.Vector3();
function placeCamera(dt) {
  const shake = P.shake > 0 ? (P.shake -= dt * 0.08, P.shake) : 0;
  if (S.inTractor) {
    const ty = h(tractor.x, tractor.z);
    tractor.g.position.set(tractor.x, ty, tractor.z);
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
  } else {
    const y = h(P.x, P.z) + 1.62 + Math.sin(P.bob) * 0.03 * Math.min(1, P.speed);
    camera.position.set(P.x + (Math.random() - 0.5) * shake, y + (Math.random() - 0.5) * shake, P.z);
    camera.rotation.set(P.pitch, P.yaw + Math.PI, 0);
    tractor.g.position.set(tractor.x, h(tractor.x, tractor.z), tractor.z);
  }
  const throttle = S.inTractor && !S.paused && (keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0;
  if (throttle && !tractor.wasThrottle) tractor.model.spit(30);       // opening the throttle coughs phosphor
  tractor.wasThrottle = !!throttle;
  tractor.model.update(S.paused ? 0 : dt, { running: S.started && tractor.stall <= 0, throttle, speed: tractor.speed });
  tractor.g.updateMatrixWorld();
  for (const t of W.tractorThings || []) { const p = tractorPoint(...t.local); t.x = p.x; t.y = p.y; t.z = p.z; }
}

// ---------- the sun across the morning: up in the east, swinging north (the Waste is southern) ----------
const _c = new THREE.Color();
function updateSun() {
  const hr = hours(), el = Math.max(0.03, Math.sin((hr - 6) / 12 * Math.PI)) * 1.2, az = (90 - (hr - 6) / 12 * 180) * Math.PI / 180;
  sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  const fx = S.inTractor ? tractor.x : P.x, fz = S.inTractor ? tractor.z : P.z;
  sun.position.set(fx + sunDir.x * 120, sunDir.y * 120, fz + sunDir.z * 120); sun.target.position.set(fx, 0, fz); sun.target.updateMatrixWorld();
  const low = smooth(0.35, 0.05, sunDir.y);
  sun.color.setRGB(1, lerp(0.88, 0.62, low), lerp(0.72, 0.4, low)); sun.intensity = lerp(3.3, 2.2, low);
  _c.setRGB(lerp(0.86, 0.9, low), lerp(0.66, 0.55, low), lerp(0.52, 0.4, low)); scene.fog.color.copy(_c); skyU.uHaze.value.copy(_c);
  scene.fog.density = 0.0018 + smooth(10, 14, hr) * 0.0008;
  sky.position.copy(camera.position);
}

// ---------- the hazards, every frame ----------
const _v = new THREE.Vector3();
function hazards(dt) {
  const foot = !S.inTractor, x = P.x, z = P.z, still = P.speed < 0.25;
  // Razor-Spinifex: it cuts, then it drinks
  if (foot && P.speed > 0.1) for (const c of nearby(W.spinifex, x, z, 0.3)) {
    S.bleed = Math.min(3, S.bleed + dt * (P.speed > 1.6 ? 1.1 : 0.3));
    c.fed = Math.min(1, c.fed + dt * 0.4);
    const red = new THREE.Color(0xd2a94e).lerp(new THREE.Color(0x8a1a12), c.fed);
    for (let b = 0; b < c.n; b++) c.im.setColorAt(c.first + b, red);
    c.im.instanceColor.needsUpdate = true;
    if (Math.random() < dt * 3) sfx.cut();
    meet('spinifex');
    once('spin', P.speed > 1.6 ? 'Razor-Spinifex. Running through it was stupid. It rings like glass and it drinks what it cuts.' : 'Spinifex. Slow, Jacob. Slow through it, or round.', ['C', GUIDE + ': it cuts, and feeds on blood']);
  }
  if (S.bleed > 0) { S.health -= S.bleed * 1.3 * dt; S.bleed = Math.max(0, S.bleed - dt * (S.inTractor ? 0.3 : 0.07)); if (S.health <= 0) die('bled'); }
  // Compass-Weed: pollen in the air near the patches
  for (const w of nearby(W.weeds, x, z, foot ? 3.5 : 2.2)) { S.disoriented = 25; S.stress = Math.min(100, S.stress + dt * 1.2); meet('weed'); once('weed', 'Compass-Weed. The needle’s gone mad and so’s my sense of which way’s which. Find the power line. Follow the wires.', ['C', GUIDE + ': it scrambles compasses and direction']); break; }
  S.disoriented = Math.max(0, S.disoriented - dt);
  // Gallows-Gum: shade, and patience
  for (const g of W.gums) {
    const d = Math.hypot(x - g.x, z - g.z);
    g.cool = Math.max(0, g.cool - dt);
    if (d < g.r && g.cool <= 0) {
      g.relax = still ? g.relax + dt : Math.max(0, g.relax - dt * 2);
      if (!S.flags['gumIntro']) { S.flags.gumIntro = true; meet('gum'); bark('Gallows-Gum. Best shade for twenty clicks. That’s the trick of it.', ['C', GUIDE]); }
      if (g.relax > 2.2 && !g.creaked) { g.creaked = true; sfx.creak(); bark('That creak. Don’t get comfortable.', ['X', 'the tell: ' + NEW]); }
      if (g.relax > 4.5) {
        g.relax = 0; g.creaked = false; g.cool = 9; g.struck = 1; sfx.crash();
        if (S.inTractor) { hurt(14, 'gum'); tractor.stall = 1.5; bark('The limb comes down on the bonnet. Move, move!', ['C', GUIDE + ': it strikes when you relax']); }
        else { hurt(34, 'gum'); P.stun = 0.7; S.stress = Math.min(100, S.stress + 20); bark('The limb comes down like a hammer. Never relax under one. Never.', ['C', GUIDE + ': it strikes when you relax']); }
      }
    } else { g.relax = Math.max(0, g.relax - dt * 2); if (d >= g.r) g.creaked = false; }
    // the limb sways once it's decided, and falls when it strikes
    const want = g.struck > 0 ? 1.3 : g.relax > 2.2 ? 0.12 + Math.sin(S.time * 0.3) * 0.05 : 0;
    g.swing = lerp(g.swing, want, clamp(dt * (g.struck > 0 ? 14 : 2), 0, 1));
    g.pivot.rotation.x = g.swing;
    if (g.struck > 0) g.struck = Math.max(0, g.struck - dt * 0.6);
  }
  // Drop-Stalkers: they click, they wait; they won't drop on something that's looking at them
  camera.getWorldDirection(_fwd);
  for (const s of W.stalkers) {
    const d = Math.hypot(x - s.home.x, z - s.home.z);
    s.cool = Math.max(0, s.cool - dt);
    s.head.lookAt(camera.position);
    if (s.state === 'perched') {
      s.g.position.lerp(s.home, clamp(dt * 2, 0, 1));
      for (const e of s.ears) e.rotation.z = 0;
      if (!foot) continue;
      if (d < 18 && !s.warned) { s.warned = true; sfx.click(); meet('stalker'); bark('Clicking. Up in the rocks. Look up, Jacob.', ['X', 'the tell: ' + NEW]); }
      if (d < 18 && Math.random() < dt * 0.4) sfx.click();
      _to.copy(s.g.position).sub(camera.position); const dist = _to.length(); _to.normalize();
      if (dist < 26 && _fwd.dot(_to) > 0.975) { s.seen += dt; if (s.seen > 1.0) { s.state = 'cowed'; s.cool = 45; sfx.hiss(); bark('Seen you. Stay up there. Good. Stay.', ['X', 'the counter: ' + NEW]); } }
      else s.seen = Math.max(0, s.seen - dt * 0.5);
      if (d < 6.5 && s.cool <= 0 && s.state === 'perched') {
        s.state = 'drop'; s.t = 0; s.from.copy(s.g.position); s.to.set(x, h(x, z) + 0.6, z); sfx.snarl();
      }
    } else if (s.state === 'drop') {
      s.t += dt / 0.45; const t = Math.min(1, s.t);
      s.g.position.lerpVectors(s.from, s.to, t); s.g.position.y += Math.sin(t * Math.PI) * 1.2;
      if (t >= 1) { sfx.crash(); hurt(45, 'stalker'); S.stress = Math.min(100, S.stress + 30); P.stun = 1.0; s.state = 'retreat'; s.t = 0; s.cool = 30; bark('Out of nowhere, from above. Never forget to look up.', ['C', GUIDE + ': it ambushes from above']); }
    } else if (s.state === 'retreat') {
      s.t += dt / 4; s.g.position.lerpVectors(s.to, s.home, smooth(0, 1, s.t)); if (s.t >= 1) s.state = 'perched';
    } else if (s.state === 'cowed') {
      _v.copy(s.home).y -= 0.7; s.g.position.lerp(_v, clamp(dt * 2, 0, 1));
      for (const e of s.ears) e.rotation.z = 0.8;
      if (s.cool <= 0) { s.state = 'perched'; s.seen = 0; }
    }
  }
  // Gossip-Flies: they find Jacob on foot, near the dead and the abandoned
  if (foot && !flySwarms.length) for (const src of nearby(W.flySources, x, z, 0)) { if (Math.random() < dt * 0.25) spawnSwarm(src.x, src.z, 3 + Math.floor(Math.random() * 3)); break; }
  if (foot && !flySwarms.length && Math.abs(x - roadX(z)) > 12 && Math.random() < dt * 0.012) spawnSwarm(x + 8, z + 8, 3);
  // Judas-Wattle: the golden haze
  let haze = 0;
  for (const w of W.wattles) { const d = Math.hypot(x - w.x, z - w.z); if (d < w.r + 10) haze = Math.max(haze, smooth(w.r + 10, w.r - 6, d)); }
  S.haze = lerp(S.haze, haze * 0.9, clamp(dt * 1.5, 0, 1));
  if (haze > 0.3) { S.stress = Math.min(100, S.stress + dt * 2 * haze); meet('wattle'); once('wattle', 'Golden Haze. The red’s going green, and there’s water shining up ahead. There’s no water. Keep to the road.', ['C', GUIDE + ': Golden Haze']); }
  for (const m of W.mirages) m.m.material.opacity = m.wattle ? haze * 0.55 : 0;
  // Argus-Bush: every eye turns to him
  for (const a of W.argus) {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < 30) for (const e of a.eyes) e.lookAt(camera.position);
    if (d < 9) { S.stress = Math.min(100, S.stress + dt * 0.6); meet('argus'); }
  }
}

// ---------- the swarm: around his head, whispering ----------
const WHISPERS = [['…bills are due, Jacob…', 'C', 'Chapter One'], ['…you’re all alone…', 'C', 'Chapter One'], ['…Rustbucket is sick…', 'C', 'Chapter One (yard)'], ['…Cogswell won’t take it… grade is too low…', 'C', 'Chapter One (yard)'], ['…parasite… bloodsucker…', 'C', 'Chapter One'], ['…nobody is coming…', 'X', 'from the Road Relic prototype'], ['…she isn’t coming back…', 'P', 'the shack’s flies, about Mum']];
let whisperTimer = 0;
function updateFlies(dt) {
  if (audio.buzz) audio.buzz.gain.value = flySwarms.length ? 0.015 : 0;
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
    if (!S.inTractor) {        // aboard, the anima shielding keeps them out of his head, even parked
      S.stress = Math.min(100, S.stress + dt * (S.earcage ? 0.25 : 0.7));
      sw.whisperIn -= dt * (S.earcage ? 0.5 : 1);
      if (sw.whisperIn <= 0) {
        sw.whisperIn = 6 + Math.random() * 4;
        const [w, tag, src] = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
        ui.whisper.innerHTML = `${esc(w)}<span class="tagline ws">${tagHTML(tag, src)}</span>`; ui.whisper.classList.add('on');
        clearTimeout(whisperTimer); whisperTimer = setTimeout(() => ui.whisper.classList.remove('on'), 2600);
        once('flies', S.earcage ? 'Gossip-flies. The ear-cage keeps the worst of it out. Most of it.' : 'Gossip-flies. Fist-sized and whispering. Back to the tractor and I’ll leave them in the dust.', ['C', GUIDE]);
      }
    }
    if (sw.life <= 0 || sw.lost > 5) {
      if (sw.lost > 5) toast('The gossip-flies fall behind');
      for (const f of sw.flies) scene.remove(f.f);
      flySwarms.splice(i, 1);
    }
  }
}

// ---------- the Salt-Strider crossing ----------
function updateStrider(dt) {
  const s = strider, z = S.inTractor ? tractor.z : P.z, x = P.x;
  if (s.state === 'waiting') {
    if (z > 930) { s.state = 'crossing'; s.x = roadX(s.z) + 150; s.dir = -1; s.g.visible = true; sfx.moan(); meet('strider'); bark('Salt-strider, crossing up ahead. Stop. Kill the engine and let it pass. It only notices what moves.', ['X', 'the crossing: ' + NEW]); }
    return;
  }
  if (s.state === 'gone') return;
  s.t += dt;
  const moving = P.speed > 0.4, d = Math.hypot(x - s.x, P.z - s.z), nearRoad = Math.abs(s.x - roadX(s.z)) < 35;
  if (s.state === 'crossing') {
    s.x += s.dir * dt * 4.2;
    if (nearRoad && d < 40 && moving) s.agitation += dt; else s.agitation = Math.max(0, s.agitation - dt * 0.5);
    if (s.agitation > 1.6) { s.state = 'charge'; sfx.moan(); bark('It’s seen me moving. Oh no. No no no.', ['X', NEW]); }
    if (Math.abs(s.x - roadX(s.z)) > 160 && s.t > 10) { s.state = 'gone'; s.g.visible = false; if (!S.flags.striderHit) bark('And it’s gone. Twenty clicks and that’s the one that matters. Breathe.', ['X', NEW]); }
  } else if (s.state === 'charge') {
    const dx = x - s.x, dz = P.z - s.z, L = Math.hypot(dx, dz) || 1;
    s.x += dx / L * dt * 9; s.z += dz / L * dt * 9; s.dir = Math.sign(dx) || 1;
    if (L < 4.5) {
      S.flags.striderHit = true; sfx.crash();
      if (S.inTractor) { hurt(25, 'strider'); tractor.stall = 4; tractor.speed = 0; } else { hurt(40, 'strider'); P.stun = 1.2; }
      S.stress = Math.min(100, S.stress + 30); s.state = 'crossing'; s.agitation = -4; s.dir = s.x > roadX(s.z) ? 1 : -1;
      bark('Lucky. Lucky it only swatted. Next time, stop when you’re told, Jacob.', ['X', NEW]);
    }
    if (!moving) { s.agitation -= dt; if (s.agitation < 0.6) { s.state = 'crossing'; bark('Still. Stay still. It’s losing interest.', ['X', NEW]); } }
  }
  // stilt-walk, and the heat makes it flicker between where it is and where it was
  s.g.position.set(s.x, h(s.x, s.z), s.z); s.g.rotation.y = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  s.legs.forEach((l, k) => { l.hip.rotation.x = Math.sin(s.t * 2.2 + (k % 2) * Math.PI) * 0.35 * l.sz; });
  s.g.visible = !(d > 60 && Math.sin(s.t * 23) > 0.7);
}

// ---------- survival: heat, water, stress ----------
function survive(dt) {
  const t = heatNow(), shade = shadeAt(P.x, P.z), heat = 1 + Math.max(0, t - 35) / 10;
  const drain = S.inTractor ? 0.014 : (P.speed > 1.6 ? 0.07 : 0.04);
  S.water = Math.max(0, S.water - dt * drain * heat * (shade ? 0.3 : 1));
  if (S.water < 20) { S.health -= dt * 0.5; once('thirst', 'Mouth like the road. Drink, Jacob. F.', ['X', NEW]); }
  const calm = S.inTractor ? 0.8 : shade && shade.why !== 'gum' ? 1.2 : 0.12;     // the tractor is the safest place out here
  S.stress = Math.max(0, S.stress - dt * calm);
  if (S.stress > 85) S.health -= dt * 0.4;
  if (S.health <= 0) die('heat');
}

// ---------- endings ----------
function die(why) {
  if (S.dead) return; S.dead = true; S.paused = true; releaseLock();
  const cause = { stalker: 'Something came down from the rocks.', gum: 'He sat down in the shade.', strider: 'He kept moving when the strider looked.', bled: 'The spinifex drank its fill.', heat: 'The heat, the thirst and the voices.' }[why] || 'The Waste.';
  ui.endCard.innerHTML = `<div class="kicker">The Red Waste</div><h1>The Waste wins this time.</h1><p class="lede">${esc(cause)} The road stays where it is, indifferent.</p>
    <div class="actions"><button class="btn primary" id="end-retry">Wake up back on the tractor</button><button class="btn" id="end-restart">Start the road again</button><button class="btn" id="end-ideas">Jot what happened</button></div>`;
  ui.end.hidden = false;
}
function retry() {
  S.dead = false; S.paused = false; ui.end.hidden = true;
  Object.assign(S, { health: 55, water: Math.max(S.water, 45), stress: 30, bleed: 0, disoriented: 0, inTractor: true });
  P.look = 0; P.stun = 0; tractor.stall = 0; tractor.speed = 0; for (const s of W.stalkers) { s.state = 'perched'; s.cool = 20; s.g.position.copy(s.home); }
  if (strider.state === 'charge') { strider.state = 'crossing'; strider.agitation = -4; }
  updateVitals(); bark('Back on the seat. Shaking. Everything still where it was, except my nerve.', ['X', NEW]);
}
function arrive() {
  if (S.ended) return; S.ended = true; S.paused = true; releaseLock();
  const found = Object.keys(S.finds).length, met = Object.keys(S.met).filter(k => k !== 'ruin').map(k => SPECIES[k].name);
  ui.fxFade.classList.add('on');
  setTimeout(() => {
    ui.endCard.innerHTML = `<div class="kicker">Bleak Flats</div><h1>The crater rim, at ${esc(clockText())}.</h1>
      <p class="lede">Stamp-mill thunder, smoke from the headframes, and a fence that screams. Twenty clicks, and Jacob is still more or less in one piece.</p>
      <ul><li>Health ${Math.round(S.health)}, water ${Math.round(S.water)}, stress ${Math.round(S.stress)}.</li>
      <li>${S.footKm > 0.05 ? `Walked ${(S.footKm * 1000).toFixed(0)} m of it.` : 'Never left the tractor.'}</li>
      <li>${met.length ? 'Met: ' + met.join(', ') + '.' : 'Met nothing worth mentioning. Lucky.'}</li>
      <li>Finds on the road: ${found} of 6.</li></ul>
      <p>The town isn’t built yet. Tell Claude what the road did to you, or jot it with N before you go.</p>
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
    S.time += dt * TIME_SCALE;
    if (S.inTractor) driveTractor(dt); else walk(dt);
    hazards(dt); updateStrider(dt); survive(dt);
    target = pickTarget();
    if ((S.inTractor ? tractor.z : P.z) > ARRIVE_Z && !S.flags.arrived) arrive();
    // the stamp-mills, louder as the rim comes up
    const near = smooth(1300, 1790, S.inTractor ? tractor.z : P.z);
    if (near > 0 && (millIn -= dt) <= 0) { millIn = 0.9; sfx.thump(0.08 + near * 0.25); }
  }
  updateFlies(S.paused ? 0 : dt); updateSmoke(dt);
  placeCamera(dt); updateSun();
  for (const c of chunks) c.visible = Math.abs(c.userData.z - camera.position.z) < 560;
  for (const r of RELICS) r.m.rotation.y += dt * 1.5;
  if (audio.ctx) {
    const sp = S.inTractor ? Math.abs(tractor.speed) : 0;
    audio.engine.gain.value = S.started && S.inTractor && tractor.stall <= 0 ? 0.05 + sp * 0.006 : 0;
    audio.o1.frequency.value = 38 + sp * 7; audio.o2.frequency.value = 19 + sp * 3.5;
    audio.wind.gain.value = 0.035 + (S.inTractor ? 0 : 0.02);
  }
  ui.prompt.hidden = !target || S.paused;
  if (target) { ui.promptVerb.textContent = valueOf(target.verb); ui.promptName.textContent = valueOf(target.name); ui.promptTag.innerHTML = `<span class="tag ${target.prov[0]}">${TAG_NAME[target.prov[0]]}</span>`; }
  ui.reticle.classList.toggle('on', !!target);
  if (S.started) { updateHud(dt); if ((frame.v = (frame.v || 0) + dt) > 0.25) { frame.v = 0; updateVitals(); } }
  renderer.render(scene, camera);
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
  const arrive0 = () => bark(h0 && h0.milk ? 'Milk in the can, dung in the bin, and twenty clicks of the Waste between them and Cogswell. Here we go again.' : 'Twenty clicks to Bleak Flats. Same road, same heat, same things wanting a piece of me.', ['X', NEW]);
  if (ui.fxFade.classList.contains('on')) setTimeout(() => { ui.fxFade.style.transition = ''; ui.fxFade.classList.remove('on'); ui.fadeLine.hidden = true; arrive0(); }, reduceMotion ? 50 : 1300);
  else arrive0();
  setTimeout(() => toast('W to drive · E to climb down · Tab for the notebook · N to jot an idea'), 2600);
  updateVitals(); canvas.focus();
}
async function boot() {
  resize();
  for (let i = 0; i <= 19; i++) buildChunk(i);
  POI.shacks.forEach(buildShack); POI.caves.forEach(buildCave); POI.gums.forEach(buildGum); POI.weeds.forEach(buildWeedPatch); POI.wattle.forEach(buildWattle);
  // the rest of the finds, out where someone curious might wander
  placeRelic({ name: 'Survey stake', text: 'A brass-capped survey stake, stamped with a number and an arrow. Someone measured this country once, carefully, as if it would hold still.' }, new THREE.Vector3(roadX(668) - 23, h(roadX(668) - 23, 668) + 0.3, 668), 'pole');
  const leak = W.leaks.find(l => l.z > 560) || W.leaks[0];
  placeRelic({ name: 'Pipewright token', text: 'A pressed-tin token, a wrench and a drop of water on it. Good for one day’s wages, from people who no longer pay them.' }, new THREE.Vector3(leak.x + 1.6, h(leak.x + 1.6, leak.z) + 0.25, leak.z + 0.6), 'leak');
  placeRelic({ name: 'Miner’s brass chit', text: 'A brass tally chit, the kind the mines hand out for a shift. This one says 1 SHIFT · BF. Somebody didn’t come back to cash it.' }, new THREE.Vector3(roadX(1712) + 30, h(roadX(1712) + 30, 1712) + 0.25, 1712), 'rim');
  buildBleakFlats(); buildMesas();
  tractor = buildTractor(); strider = buildStrider(); addTractorThings();
  tractor.x = roadX(8); tractor.z = 8; P.x = tractor.x; P.z = tractor.z;
  { const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(); env.add(sky.clone()); updateSun(); scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose(); }
  setWorkshop(S.workshop);
  connectIdeas({ onChange: () => { if (!ui.menu.hidden && S.menuTab === 'ideas') renderMenu(); }, onFull: () => toast('The notebook is full. This idea is kept on this computer.') });
  requestAnimationFrame(frame);
  ui.btnStart.disabled = false; ui.btnStart.textContent = 'Drive out';
  if (/[?&]from=yard\b/.test(location.search)) begin();
}
ui.btnStart.addEventListener('click', begin);
ui.btnYard.addEventListener('click', () => { location.href = window.__YARD_URL || 'yard.html'; });
ui.btnWs.addEventListener('click', () => setWorkshop(!S.workshop));
ui.menuClose.addEventListener('click', closeMenu);
boot();
if (new URLSearchParams(location.search).has('debug')) window.__road = { S, P, W, get tractor() { return tractor; }, get strider() { return strider; }, things, camera, h, roadX, begin, use };
