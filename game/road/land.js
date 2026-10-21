// ============================================================
// The land between the farm and Bleak Flats, laid out as Chapter Two
// drives it. North from the gate, the road forks: the Old Canyon Road
// banks hard left (west) into a canyon of rusted iron-shale and
// sandstone, the interesting way; the old main road runs straight on,
// broken seal and all, under the escarpment of the canyon's mesa and
// along the edge of the salt pans, where salt-strider hunt by day. It
// is littered with what the old world left: a power line falling down
// pole by pole, a pipeline failing section by section, and Tally Bore,
// a hamlet of houses coming apart. The two rejoin and run on past the
// skeleton of an old transmission line, then through the scarred
// outskirts (boreholes, strip mines, a ridge to the east) to the walls
// of Bleak Flats.
//
// The canyon is scaled down (the book's walls are three hundred feet;
// these are forty metres) to fit 1.8 km standing for twenty clicks.
// Units are metres; the road runs north along +z; east is −x.
// ============================================================
import { THREE, clamp, lerp, smooth, rng, noise2, G, W, blockers, shades, addThing, MX, rodMX, planarUV, merge, mesh, M, SWAY, NEW, CH2, GUIDE, hooks, S } from './core.js';

export const LORE_KM = 20, ARRIVE_Z = 1782;
export const HALF_W = 330;

// ---------- the routes ----------
const ROUTE_PTS = {
  gate: [[0, -60], [0, 0], [-2, 100], [2, 200]],
  canyon: [[2, 200], [28, 238], [66, 280], [88, 318], [94, 380], [88, 450], [93, 520], [99, 590], [91, 660], [85, 730], [74, 784], [36, 836], [6, 878]],
  main: [[2, 200], [0, 270], [-6, 360], [-4, 450], [3, 540], [2, 620], [-3, 720], [0, 800], [6, 878]],
  north: [[6, 878], [9, 960], [1, 1060], [-7, 1160], [0, 1260], [6, 1360], [-2, 1460], [-6, 1560], [2, 1660], [0, 1760], [0, 1840]],
};
function sampleRoute(pts, step = 2) {
  const out = [];
  const P = (i) => pts[clamp(i, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: cr(p0[0], p1[0], p2[0], p3[0]), z: cr(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  out.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
  for (let i = 0; i < out.length; i++) { const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1; out[i].dx = (b.x - a.x) / L; out[i].dz = (b.z - a.z) / L; }
  return out;
}
export const ROUTES = {};
for (const k in ROUTE_PTS) ROUTES[k] = sampleRoute(ROUTE_PTS[k]);
// a coarse grid over the samples, so "how far to the nearest road" is cheap anywhere
const RCELL = 20, rgrid = new Map();
for (const k in ROUTES) for (const s of ROUTES[k]) { const key = Math.floor(s.x / RCELL) + ',' + Math.floor(s.z / RCELL); if (!rgrid.has(key)) rgrid.set(key, []); rgrid.get(key).push(Object.assign(s, { route: k })); }
export function nearestRoad(x, z, reach = 2) {
  const cx = Math.floor(x / RCELL), cz = Math.floor(z / RCELL);
  let best = null, bd = 1e9;
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const list = rgrid.get((cx + i) + ',' + (cz + j)); if (!list) continue;
    for (const s of list) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
  }
  return best ? { d: Math.sqrt(bd), s: best } : { d: 1e9, s: null };
}
export const roadDist = (x, z) => nearestRoad(x, z).d;

// ---------- the canyon: an axis, a floor, walls and the mesa they hold up ----------
export const CANYON = { z0: 300, z1: 760, half: 13, H: 40 };
const canyonSamples = ROUTES.canyon.filter(s => s.z > 280 && s.z < 790).sort((a, b) => a.z - b.z);
export function canyonAxisX(z) {
  let lo = 0, hi = canyonSamples.length - 1;
  if (z <= canyonSamples[0].z) return canyonSamples[0].x;
  if (z >= canyonSamples[hi].z) return canyonSamples[hi].x;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (canyonSamples[m].z < z) lo = m; else hi = m; }
  const a = canyonSamples[lo], b = canyonSamples[hi]; return lerp(a.x, b.x, (z - a.z) / (b.z - a.z || 1));
}
export const canyonWeight = (z) => smooth(CANYON.z0 - 12, CANYON.z0 + 8, z) * (1 - smooth(CANYON.z1 - 8, CANYON.z1 + 12, z));
// the mesa the canyon cuts: broad to the west, and a short steep escarpment on the east, above the main road
export const mesaOuter = (side) => side > 0 ? 120 : 42;
const mesaFall = (side) => side > 0 ? 50 : 6;
export const inCanyon = (x, z) => z > CANYON.z0 - 4 && z < CANYON.z1 + 4 && Math.abs(x - canyonAxisX(z)) < CANYON.half + 2;
// where the walls bulge, ledge and overhang; kept plain near the cave mouths
export const CAVE_MOUTHS = { den: { z: 440, side: 1 }, seep: { z: 646, side: -1 } };
function wallOffset(z, y, side) {
  let d = 0.6 + 1.3 * (0.5 + 0.5 * Math.sin(z * 0.045 + side * 2)) + 0.8 * Math.sin(z * 0.17 + y * 0.3) * 0.5;
  d += 0.5 * Math.round(Math.sin(y * 0.55 + z * 0.01) * 1.5) / 1.5;                      // ledges where the strata stand proud
  for (const k in CAVE_MOUTHS) {
    const c = CAVE_MOUTHS[k]; if (c.side !== side) continue;
    const near = 1 - smooth(4, 9, Math.abs(z - c.z));
    d = lerp(d, y < 4.2 ? 0.4 : y < 6.4 ? -1.4 : 0.2, near);                               // a plain face round the mouth, an overhang over it
  }
  return d;
}
// strata: rusted iron-shale, sandstone, ochre and ironstone, banded and warped
const STRATA = [[0.62, 0.27, 0.16], [0.45, 0.18, 0.11], [0.78, 0.5, 0.26], [0.92, 0.76, 0.56], [0.42, 0.31, 0.33], [0.3, 0.18, 0.14], [0.86, 0.6, 0.38]];
export function strataColour(y, z, out) {
  const t = (y + 1.6 * Math.sin(z * 0.019) + 0.7 * Math.sin(z * 0.071 + y * 0.2)) / 2.4;
  const i = Math.floor(t), f = smooth(0.75, 1, t - i), a = STRATA[((i % 7) + 7) % 7], b = STRATA[(((i + 1) % 7) + 7) % 7];
  const g = 0.9 + 0.12 * Math.sin(z * 0.9 + y * 1.7);
  out.setRGB(lerp(a[0], b[0], f) * g, lerp(a[1], b[1], f) * g, lerp(a[2], b[2], f) * g);
  return out;
}

// ---------- the ridge to the east, the strip mines, the salt pans ----------
export const ridgeX = (z) => -152 + 14 * Math.sin(z * 0.011);
const ridgeW = (z) => smooth(1220, 1290, z) * (1 - smooth(1690, 1760, z));
export const PITS = [{ x: -84, z: 1418, r: 36, depth: 11 }, { x: 62, z: 1530, r: 26, depth: 7 }];
export const ADIT = { x: -84 - 21.5, z: 1418, facing: 1 };     // in the east wall of the big pit, its mouth facing west into the pit
// Tally Bore: a hamlet on the old main road, built round a pumping station on the pipeline
export const TALLY = { x: 2, z: 575, pump: { x: -22, z: 620 } };
// the salt pans lie east of the main road, a long white sheet the road skirts
export const panX = (z) => -100 + 12 * Math.sin(z * 0.009);
export const saltAt = (x, z) => {
  if (z < 240 || z > 850 || x > -20) return 0;
  return smooth(78, 46, Math.abs(x - panX(z))) * smooth(240, 300, z) * (1 - smooth(790, 850, z));
};

// ---------- the height of the land anywhere ----------
export function h(x, z) {
  const rd = roadDist(x, z), shoulder = smooth(8, 42, rd);
  let y = shoulder * 2.4 * noise2(x, z) * 2.2;
  y += smooth(70, 200, rd) * 7 * Math.max(0, Math.sin(x * 0.011 + z * 0.004) * Math.cos(z * 0.006 - x * 0.002));
  y *= 1 - saltAt(x, z) * 0.95;                                                                   // the pans lie flat as a table
  // the mesa the canyon cuts through
  const cw = canyonWeight(z);
  if (cw > 0) {
    const dx = x - canyonAxisX(z), d = Math.abs(dx), side = dx > 0 ? 1 : -1, o = mesaOuter(side);
    const mesa = CANYON.H + 3 * noise2(x * 2, z * 2);
    y = lerp(y, mesa, smooth(CANYON.half + 4, CANYON.half + 12, d) * cw * (1 - smooth(o, o + mesaFall(side), d)));
  }
  // the ridge
  const rw = ridgeW(z);
  if (rw > 0) { const d = (x - ridgeX(z)) / 24; y += 17 * Math.exp(-d * d) * rw * (0.85 + 0.15 * noise2(x * 3, z * 3)); }
  // the strip mines
  for (const p of PITS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 6) y = lerp(y, -p.depth, smooth(p.r, p.r * 0.62, d)); }
  { const dx = ADIT.x - x, dz = Math.abs(z - ADIT.z); if (dx > -1 && dx < 8 && dz < 5) y = lerp(y, -PITS[0].depth, smooth(5, 3, dz) * smooth(8, 6, dx)); }   // the pit floor runs level into the adit
  // the slight rise Bleak Flats sits on
  y += smooth(1800, 1950, z) * 4;
  return y;
}
// where can't Jacob or the tractor go: into the canyon walls and the mesa they hold up
export function landBlocked(x, z, r) {
  const cw = canyonWeight(z);
  if (cw > 0.35) {
    const ax = canyonAxisX(z), d = Math.abs(x - ax), side = x > ax ? 1 : -1;
    for (const k in CAVE_MOUTHS) { const c = CAVE_MOUTHS[k]; if (Math.abs(z - c.z) < 1.6 - r && side === c.side && d < CANYON.half + 2.6) return false; }   // up into a cave mouth
    if (d > CANYON.half - 0.6 - r && d < mesaOuter(side) + (side > 0 ? 5 : 6) - r) return true;      // the walls, and the mesa up to the top of its slope
  }
  if (z > CANYON.z0 - 16 && z < CANYON.z0 + 2 || z > CANYON.z1 - 2 && z < CANYON.z1 + 16) {   // the mesa's end faces
    const ax = canyonAxisX(clamp(z, CANYON.z0, CANYON.z1)), d = Math.abs(x - ax);
    if (d > CANYON.half + 1 && d < mesaOuter(x > ax ? 1 : -1) - 2 && cw > 0.05) return true;
  }
  return false;
}

// ---------- names for where Jacob is ----------
export function placeAt(x, z) {
  if (inCanyon(x, z)) return z < 480 ? 'the Old Canyon Road, among the gums' : z < 670 ? 'the Old Canyon Road, in the spinifex' : 'the Old Canyon Road';
  if (saltAt(x, z) > 0.4) return 'the salt pans';
  if (Math.hypot(x - TALLY.x, z - TALLY.z) < 60) return 'Tally Bore';
  if (z > 1780) return 'the gates of Bleak Flats';
  for (const p of PITS) if (Math.hypot(x - p.x, z - p.z) < p.r) return 'an old strip mine';
  if (ridgeW(z) > 0.5 && Math.abs(x - ridgeX(z)) < 30) return 'the ridge to the east';
  const names = [[-100, 'the north gate'], [150, 'the fork'], [240, 'the old main road'], [880, 'the north road'], [960, 'the old transmission line'], [1250, 'the outskirts'], [1640, 'the last stretch']];
  if (z > 240 && z < 880 && x < 40 && Math.abs(x - panX(z)) < 140 && roadDist(x, z) <= 16) return 'the old main road, along the salt pans';
  let n = names[0][1]; for (const [z0, name] of names) if (z >= z0) n = name;
  return roadDist(x, z) > 16 ? `off the road, ${n}` : n;
}

// ---------- building it ----------
export function buildLand() {
  for (let i = -1; i <= 20; i++) buildChunk(i);
  for (const k in ROUTES) roadRibbon(ROUTES[k], k === 'canyon' ? 4.6 : 7.6, 1.0, k !== 'canyon');
  for (const k of ['gate', 'main', 'north']) { centreLine(ROUTES[k]); guidePosts(ROUTES[k], 7.6); }
  buildCanyon(); buildEscarpment(); buildSaltPans(); buildTransmissionLine(); buildPipeline(); buildMesas(); buildOutskirts(); buildBleakFlats(); buildSigns();
}

const _c = new THREE.Color(), _t = new THREE.Color(), _e3 = new THREE.Vector3();
function buildChunk(i) {
  const g = new THREE.Group(), z0 = i * 100, R = rng(9001 + (i + 5) * 7919);
  const NX = 132, NZ = 20, pos = [], col = [], uv = [], idx = [];
  for (let j = 0; j <= NZ; j++) for (let k = 0; k <= NX; k++) {
    const x = -HALF_W + k * (2 * HALF_W / NX), z = z0 + j * 5, y = h(x, z);
    pos.push(x, y - 0.02, z); uv.push(x / 2.5, z / 2.5);
    const n = noise2(x * 3.1, z * 2.7) * 0.5 + 0.5;
    _c.setRGB(1.0, 0.93, 0.88).multiplyScalar(0.82 + n * 0.3);
    if (y > 3) _c.lerp(strataColour(y, z, _t).multiplyScalar(1.5), smooth(3, 14, y) * 0.75);   // high ground shows its strata
    const salt = saltAt(x, z); if (salt > 0) _c.lerp(_t.setRGB(1.5, 1.46, 1.38), salt * 0.92);
    for (const p of PITS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 8) _c.lerp(_t.setRGB(0.72, 0.6, 0.58), smooth(p.r + 8, p.r * 0.7, d) * 0.6); }
    if (inCanyon(x, z)) _c.multiplyScalar(0.86);                                                  // the canyon floor, in its own shadow
    col.push(_c.r, _c.g, _c.b);
  }
  for (let j = 0; j < NZ; j++) for (let k = 0; k < NX; k++) { const a = j * (NX + 1) + k, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gg.setIndex(idx); gg.computeVertexNormals();
  g.add(mesh(gg, M.ground, { cast: false }));
  // the scatter: rocks, saltbush, Razor-Spinifex; none on the roads, the pans, the mesa top or the places that matter
  const rocks = [], scrub = [], clumps = [];
  for (let k = 0; k < 220; k++) {
    const z = z0 + R() * 100, x = (R() - 0.5) * 2 * (HALF_W - 10), roll = R();
    const rd = roadDist(x, z), salt = saltAt(x, z), cw = canyonWeight(z);
    if (rd < 9 || (cw > 0.2 && Math.abs(x - canyonAxisX(z)) > CANYON.half - 1 && Math.abs(x - canyonAxisX(z)) < mesaOuter(x > canyonAxisX(z) ? 1 : -1) + 14)) continue;
    if (nearReserved(x, z)) continue;
    if (salt > 0.5) { if (roll < 0.06) scrub.push([x, z, 0.3 + R() * 0.3, R()]); continue; }   // the pans are nearly bare
    if (inCanyon(x, z)) { if (roll < 0.3) rocks.push([x, z, 0.4 + R() * 1.4, R()]); continue; }   // the canyon floor gets its own spinifex
    if (roll < 0.2) rocks.push([x, z, 0.3 + R() * (h(x, z) > 3 ? 2.2 : 1.2), R()]);
    else if (roll < 0.55) scrub.push([x, z, 0.4 + R() * 0.7, R()]);
    else if (roll < 0.8) clumps.push([x, z, 0.5 + R() * 0.8]);
  }
  addRocks(g, rocks); addScrub(g, scrub); addSpinifex(g, clumps, i);
  g.userData.z = z0 + 50;
  G.scene.add(g); W.chunks = W.chunks || []; W.chunks.push(g);
}
// places the scatter keeps clear of, registered by life.js and caves.js before the land is built
export const RESERVED = [];
const nearReserved = (x, z) => RESERVED.some(r => Math.hypot(x - r.x, z - r.z) < r.r);

export function addRocks(g, rocks, mat = M.rock) {
  if (!rocks.length) return;
  const im = new THREE.InstancedMesh(planarUV(new THREE.DodecahedronGeometry(1, 1), 1.6), mat, rocks.length); im.castShadow = im.receiveShadow = true;
  rocks.forEach(([x, z, s, r], k) => { im.setMatrixAt(k, MX(x, h(x, z) + s * 0.25, z, r * 3, r * 6, 0, s * 1.5, s * 0.7, s * 1.1)); if (s > 0.9) blockers.push({ x, z, r: s * 1.1 }); });
  g.add(im);
}
export function addScrub(g, scrub) {
  if (!scrub.length) return;
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), M.scrub, scrub.length); im.castShadow = true;
  scrub.forEach(([x, z, s, r], k) => { im.setMatrixAt(k, MX(x, h(x, z) + s * 0.35, z, 0, r * 6, 0, s, s * 0.6, s)); im.setColorAt(k, _c.setHSL(0.17 + r * 0.08, 0.12 + r * 0.1, 0.42 + r * 0.12)); });   // saltbush, silver-green
  g.add(im);
}
// Razor-Spinifex, instanced: each clump a fan of glassy blades that sway, thrash near movement and redden as they feed
const SPIN_CELL = 5, spinGrid = new Map();
export function nearbySpinifex(x, z) {
  const out = [], cx = Math.floor(x / SPIN_CELL), cz = Math.floor(z / SPIN_CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = spinGrid.get((cx + i) + ',' + (cz + j)); if (l) for (const c of l) if (Math.hypot(c.x - x, c.z - z) < c.r) out.push(c); }
  return out;
}
export function addSpinifex(g, clumps, chunk, blades = 14) {
  if (!clumps.length) return;
  const blade = new THREE.ConeGeometry(0.018, 1, 3); blade.translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(blade, M.spinifex, clumps.length * blades);
  const straw = new THREE.Color(0xd8b050), cc = new THREE.Color();
  clumps.forEach(([x, z, s], k) => {
    const y = h(x, z);
    for (let b = 0; b < blades; b++) {
      const a = b * 2.39996 + k, lean = 0.35 + (b % 5) * 0.12;
      im.setMatrixAt(k * blades + b, MX(x + Math.cos(a) * 0.08 * s, y, z + Math.sin(a) * 0.08 * s, Math.sin(a) * lean, 0, Math.cos(a) * lean, 1, s * (0.6 + (b % 4) * 0.18), 1));
      im.setColorAt(k * blades + b, cc.copy(straw).multiplyScalar(0.85 + (b % 3) * 0.1));
    }
    const c = { x, z, r: 0.55 + s * 0.55, im, first: k * blades, n: blades, fed: 0, chunk };
    W.spinifex.push(c);
    const key = Math.floor(x / SPIN_CELL) + ',' + Math.floor(z / SPIN_CELL); if (!spinGrid.has(key)) spinGrid.set(key, []); spinGrid.get(key).push(c);
  });
  g.add(im);
}

// the road: a compacted ribbon, paler in the middle, wheel ruts either side. The old main road is sealed: what's
// left of the bitumen, grey under red dust, gone back to dirt at its crumbling edges and in potholes.
function roadRibbon(samples, width, tone, sealed = false) {
  const half = width / 2, across = [-1, -0.68, -0.5, -0.3, -0.15, 0.15, 0.3, 0.5, 0.68, 1], shade = [0.86, 1.12, 0.66, 1.16, 1.22, 1.22, 1.16, 0.66, 1.12, 0.86];
  const p = [], c = [], u = [], ix = [], n = across.length;
  samples.forEach((s) => {
    const nx = s.dz, nz = -s.dx, pot = noise2(s.z * 0.7, s.x * 0.7) > 0.62 ? 0.84 : 1, salt = saltAt(s.x, s.z);
    across.forEach((a, k) => {
      const x = s.x + nx * a * half, z = s.z + nz * a * half; p.push(x, h(x, z) + 0.035, z); u.push(x / 2.5, z / 2.5);
      const crumble = Math.abs(a) > 0.6 && noise2(x * 3.1 + 7, z * 2.3) > -0.4, worn = noise2(x * 1.7 + 40, z * 1.1) > 0.4;
      if (sealed && !crumble && !worn) {                                                                                     // grey seal under drifts of red dust
        const v = (pot < 1 ? 0.7 : 1) * (0.85 + 0.15 * noise2(x * 6, z * 5)), dust = smooth(0.05, 0.8, noise2(x * 0.9 + 3, z * 0.45)) * 0.55 + (Math.abs(a) > 0.4 ? 0.12 : 0);
        c.push(lerp(0.062, 0.36, dust) * v, lerp(0.054, 0.16, dust) * v, lerp(0.05, 0.095, dust) * v);
      }
      else if (sealed) { const v = shade[k] * (0.9 + 0.1 * noise2(x * 4, z * 4)); c.push(0.4 * v, 0.17 * v, 0.1 * v); }                                     // gone back to dirt
      else { const v = shade[k] * pot * tone * (1 + salt * 0.25); c.push(1.12 * v, 1.0 * v, 0.93 * v); }
    });
  });
  for (let r = 0; r < samples.length - 1; r++) for (let k = 0; k < n - 1; k++) { const a = r * n + k, b = a + 1, cc = a + n, d = cc + 1; ix.push(a, cc, b, b, cc, d); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  rg.setIndex(ix); rg.computeVertexNormals();
  G.scene.add(mesh(rg, sealed ? M.seal : M.road, { cast: false }));
}
// a broken centre line, worn away in long stretches
const lineMat = () => lineMat.m || (lineMat.m = new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
function centreLine(samples) {
  const p = [], ix = []; let run = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1]; run += Math.hypot(b.x - a.x, b.z - a.z);
    if (Math.floor(run / 3) % 3 || noise2(a.x * 2.3 + 11, a.z * 0.6) > 0.3) continue;
    const base = p.length / 3;
    for (const s of [a, b]) for (const o of [-0.07, 0.07]) { const x = s.x + s.dz * o, z = s.z - s.dx * o; p.push(x, h(x, z) + 0.05, z); }
    ix.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
  G.scene.add(mesh(g, lineMat(), { cast: false }));
}
// white guide posts with red reflectors, every fifty metres either side; plenty of them knocked flat or gone
function guidePosts(samples, width) {
  const R = rng(samples.length * 7), posts = [], refl = []; let run = 0, next = 25;
  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i]; run += Math.hypot(samples[i + 1].x - s.x, samples[i + 1].z - s.z);
    if (run < next) continue; next += 50;
    for (const side of [-1, 1]) {
      const roll = R(); if (roll < 0.18) continue;
      const x = s.x + s.dz * side * (width / 2 + 1.1), z = s.z - s.dx * side * (width / 2 + 1.1), yaw = Math.atan2(s.dx, s.dz), tilt = roll < 0.34 ? 1.5 : roll < 0.48 ? (R() - 0.5) * 1.1 : (R() - 0.5) * 0.12, y = h(x, z);
      const down = Math.abs(tilt) > 1;
      posts.push([new THREE.BoxGeometry(0.1, 1.0, 0.08), MX(x, y + (down ? 0.05 : 0.5 * Math.cos(tilt)), z, 0, yaw, tilt)]);
      if (!down) refl.push([new THREE.BoxGeometry(0.06, 0.12, 0.09), MX(x - Math.sin(tilt) * 0.42, y + 0.86 * Math.cos(tilt), z, 0, yaw, tilt)]);
    }
  }
  G.scene.add(mesh(merge(posts), M.post)); G.scene.add(mesh(merge(refl), M.reflector, { cast: false }));
}
// a fainter side track from somewhere to somewhere
export function track(x0, z0, x1, z1, w = 2.6) {
  const pts = [], steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3), dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
  for (let s = 0; s <= steps; s++) { const t = s / steps, bend = Math.sin(t * Math.PI) * 6; pts.push({ x: x0 + dx * t + nx * bend, z: z0 + dz * t + nz * bend, dx: dx / L, dz: dz / L }); }
  roadRibbon(pts, w, 0.95);
}

// ---------- signs: faded green road signs, and one somebody painted by hand ----------
function signTexture(lines, { bg = '#2f5b40', fg = '#efeadc', hand = false, scratch = null } = {}) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'), R = rng(lines.join('').length * 13);
  x.fillStyle = bg; x.fillRect(0, 0, 256, 128);
  if (!hand) { x.strokeStyle = fg; x.lineWidth = 5; x.strokeRect(8, 8, 240, 112); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, k) => { x.font = hand ? `bold ${k ? 22 : 26}px "Comic Sans MS", cursive` : `bold ${k ? 24 : 30}px Arial, sans-serif`; x.fillText(l, 128, 64 + (k - (lines.length - 1) / 2) * (hand ? 32 : 36)); });
  if (scratch) { x.strokeStyle = bg; x.lineWidth = 3; for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(scratch[0] + R() * 8, scratch[1] - 12 + R() * 6); x.lineTo(scratch[0] + 40 + R() * 8, scratch[1] + 8 + R() * 6); x.stroke(); } }
  for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(${120 + R() * 50},${50 + R() * 30},${20 + R() * 20},${0.25 + R() * 0.5})`; x.beginPath(); x.arc(R() * 256, R() * 128, 1 + R() * (R() < 0.15 ? 12 : 4), 0, Math.PI * 2); x.fill(); }   // rust coming through
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sign(x, z, yaw, lines, read, opts = {}) {
  const { w = 2.0, ht = 1.0, post = 2.2, lean = 0, tag = ['X', NEW] } = opts, y = h(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, yaw, lean); G.scene.add(g);
  for (const s of w > 1.4 ? [-w * 0.35, w * 0.35] : [0]) { const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, post + ht / 2, 6), M.rust); p.position.set(s, (post + ht / 2) / 2, -0.04); g.add(p); }
  const face = new THREE.MeshStandardMaterial({ map: signTexture(lines, opts), roughness: 0.8, metalness: 0.2 });
  const board = mesh(new THREE.BoxGeometry(w, ht, 0.04), [M.rust, M.rust, M.rust, M.rust, face, M.rust]); board.position.y = post; g.add(board);
  blockers.push({ x, z, r: 0.3 });
  addThing({ id: 'sign:' + lines[0], name: 'A sign', verb: 'Read', x, y: y + post, z, r: 2.4, prov: tag, use: () => hooks.bark(read, tag) });
}
function buildSigns() {
  // the fork: straight on for the old main road and Tally Bore, left for the canyon (travellers come up from the south, so the faces look south)
  sign(11, 188, Math.PI, ['BLEAK FLATS  18', 'TALLY BORE  5'], 'BLEAK FLATS 18. TALLY BORE 5. Somebody’s scratched a skull next to Tally Bore. Somebody else has scratched it out.', { lean: 0.06 });
  sign(13.5, 196, Math.PI, ['\u2190 OLD CANYON RD'], 'OLD CANYON RD, and an arrow left, into the rock. Under it, in paint: DONT STOP UNDER THE GUMS.', { w: 1.8, ht: 0.55, post: 1.6, lean: -0.1 });
  sign(29, 248, Math.atan2(-0.67, -0.74), ['DONT STOP', 'UNDER THE GUMS'], 'Painted on a sheet of tin and wired to a stake: DONT STOP UNDER THE GUMS. Good advice. The Field Guide agrees.', { w: 1.5, ht: 0.8, post: 1.1, bg: '#8a7a64', fg: '#3a1408', hand: true, lean: 0.12 });
  sign(12, 500, Math.PI, ['TALLY BORE', 'POP. 41'], 'TALLY BORE. POP. 41. The number’s been scratched out, carefully, the way you’d cross a name off a list.', { scratch: [118, 82], lean: -0.05 });
  sign(12, 905, Math.PI, ['BLEAK FLATS  9'], 'BLEAK FLATS 9. Nine clicks. The air already tastes of it.', { w: 1.8, ht: 0.6, lean: 0.04 });
}

// ---------- the canyon walls ----------
function buildCanyon() {
  for (const side of [-1, 1]) {
    // along the canyon, from floor to rim, with the strata in the vertex colours
    const rows = [], ROWS = Math.ceil((CANYON.z1 - CANYON.z0) / 2), COLS = 22;
    const pos = [], col = [], uv = [], idx = [];
    for (let r = 0; r <= ROWS; r++) {
      const z = CANYON.z0 + r * 2, ax = canyonAxisX(z);
      for (let c = 0; c <= COLS; c++) {
        const v = c / COLS, y = v * CANYON.H, top = c === COLS;
        const d = CANYON.half + (top ? 12 : wallOffset(z, y, side));
        const x = ax + side * d;
        pos.push(x, y, z); uv.push(z / 4, y / 4);
        strataColour(y, z, _c).multiplyScalar(1.25 * (0.75 + 0.25 * smooth(0, 10, y)));      // darker at the foot, where the shade sits
        col.push(_c.r, _c.g, _c.b);
      }
    }
    const mouths = Object.values(CAVE_MOUTHS).filter(m => m.side === side);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const zc = CANYON.z0 + (r + 0.5) * 2, yc = (c + 0.5) / COLS * CANYON.H;
      if (mouths.some(m => Math.abs(zc - m.z) < 2.2 && yc < 3.5)) continue;                     // the way into a cave
      const a = r * (COLS + 1) + c, b = a + 1, cc = a + COLS + 1, d = cc + 1; if (side > 0) idx.push(a, b, cc, b, d, cc); else idx.push(a, cc, b, b, cc, d);
    }
    // the end faces, where the mesa meets the open desert
    const face = (z, dir) => {
      const base = pos.length / 3, ax = canyonAxisX(z), N = 26;
      for (let k = 0; k <= N; k++) for (let c = 0; c <= COLS; c++) {
        const t = k / N, d = lerp(CANYON.half + wallOffset(z, (c / COLS) * CANYON.H, side), mesaOuter(side) - 1, t), y = (c / COLS) * CANYON.H, x = ax + side * d, zz = z + dir * (Math.sin(t * 9 + y * 0.2) * 1.2 + 0.6);
        pos.push(x, y, zz); uv.push(x / 4, y / 4); strataColour(y, zz, _c).multiplyScalar(1.2); col.push(_c.r, _c.g, _c.b);
      }
      for (let k = 0; k < N; k++) for (let c = 0; c < COLS; c++) { const a = base + k * (COLS + 1) + c, b = a + 1, cc = a + COLS + 1, d = cc + 1; idx.push(a, b, cc, b, d, cc); }
    };
    face(CANYON.z0, -1); face(CANYON.z1, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = mesh(g, M.strata); m.material = M.strata; G.scene.add(m);
  }
  M.strata.side = THREE.DoubleSide;
  // the canyon holds shade along its foot; it's cooler than the open plain, if not by much
  for (let z = CANYON.z0 + 10; z < CANYON.z1; z += 20) shades.push({ x: canyonAxisX(z), z, r: CANYON.half, why: 'canyon', soft: true });
}

// ---------- the mesa's eastern escarpment: a banded cliff the main road runs under, scree at its foot ----------
// a point on its face: v = 0 at the foot, 1 at the rim; push = how far out from the rock
export function escarpmentPoint(z, v, out = new THREE.Vector3(), push = 0) {
  const ax = canyonAxisX(clamp(z, CANYON.z0, CANYON.z1)), cw = canyonWeight(z), y = v * (CANYON.H + 2) * cw - 0.6, ledge = Math.round(Math.sin(y * 0.5 + z * 0.013) * 1.4) / 1.4;
  const d = mesaOuter(-1) + 1.4 + (1 - v) * 5.6 + 0.9 * Math.sin(z * 0.11 + y * 0.35) + 0.5 * ledge;
  return out.set(ax - d - push, y, z);
}
function buildEscarpment() {
  const pos = [], col = [], uv = [], idx = [], ROWS = Math.ceil((CANYON.z1 - CANYON.z0 + 40) / 2), COLS = 18, o = mesaOuter(-1);
  for (let r = 0; r <= ROWS; r++) {
    const z = CANYON.z0 - 20 + r * 2, ax = canyonAxisX(clamp(z, CANYON.z0, CANYON.z1)), cw = canyonWeight(z);
    for (let c = 0; c <= COLS; c++) {
      const v = c / COLS, { x, y } = escarpmentPoint(z, v, _e3);
      pos.push(x, y, z); uv.push(z / 4, y / 4);
      strataColour(y, z, _c).multiplyScalar(1.2 * (0.72 + 0.28 * smooth(0, 10, y))); col.push(_c.r, _c.g, _c.b);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const a = r * (COLS + 1) + c, b = a + 1, cc = a + COLS + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  G.scene.add(mesh(g, M.strata));
  // scree: blocks that came off it, and smaller stuff fanned out below
  const R = rng(616), rocks = [], grp = new THREE.Group();
  for (let z = CANYON.z0 + 6; z < CANYON.z1 - 6; z += 2.2) { if (canyonWeight(z) < 0.6) continue; const n = R() < 0.35 ? 2 : 1; for (let k = 0; k < n; k++) { const x = canyonAxisX(z) - o - 7.5 - R() * 5, big = R() < 0.18; rocks.push([x, z + R() * 2, big ? 1.4 + R() * 1.6 : 0.3 + R() * 0.7, R()]); } }
  addRocks(grp, rocks, M.rock); G.scene.add(grp);
}

// ---------- the salt pans: white crust, cracked into plates ----------
function buildSaltPans() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  const R = rng(4242), pts = [];
  for (let k = 0; k < 22; k++) pts.push([R() * N, R() * N]);
  // a crack network: each pixel row scanned for where its nearest seed changes
  const img = x.createImageData(N, N), d = img.data;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    let b1 = 1e9, b2 = 1e9;
    for (const [sx, sy] of pts) for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { const dd = (px - sx - ox) ** 2 + (py - sy - oy) ** 2; if (dd < b1) { b2 = b1; b1 = dd; } else if (dd < b2) b2 = dd; }
    const edge = Math.sqrt(b2) - Math.sqrt(b1), o = (py * N + px) * 4;
    const crack = edge < 1.4 ? 1 - edge / 1.4 : 0, ridge = edge < 3.5 && edge >= 1.4 ? 0.25 : 0;
    d[o] = crack ? 90 : 255; d[o + 1] = crack ? 80 : 252; d[o + 2] = crack ? 72 : 244; d[o + 3] = Math.round(Math.max(crack * 200, ridge * 255));
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 });
  const pos = [], uv = [], idx = [], X0 = -190, X1 = -20, Z0 = 230, Z1 = 870, S = 4;
  const NX = (X1 - X0) / S, NZ = (Z1 - Z0) / S, colA = [];
  for (let j = 0; j <= NZ; j++) for (let k = 0; k <= NX; k++) { const xx = X0 + k * S, zz = Z0 + j * S; pos.push(xx, h(xx, zz) + 0.04, zz); uv.push(xx / 7, zz / 7); colA.push(1, 1, 1, saltAt(xx, zz)); }
  for (let j = 0; j < NZ; j++) for (let k = 0; k < NX; k++) { const a = j * (NX + 1) + k, b = a + 1, cc = a + NX + 1, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colA, 4));
  g.setIndex(idx); g.computeVertexNormals();
  mat.vertexColors = true; mat.vertexAlphas = true;
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; G.scene.add(m);
  // the liquid mirage that hangs over them in the heat
  for (const [mx, mz] of [[-96, 430], [-104, 600], [-98, 720], [-86, 340]]) {
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(70, 22), M.mirage.clone()); mm.rotation.x = -Math.PI / 2; mm.position.set(mx, 0.3, mz); mm.renderOrder = 2; G.scene.add(mm);
    W.mirages.push({ m: mm, x: mx, z: mz, pans: true });
  }
}

// ---------- the skeleton of an old transmission line, along the north road ----------
function lattice(parts, x, y, z, ht, fallen = 0, yaw = 0) {
  const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(fallen, yaw, 0)), new THREE.Vector3(1, 1, 1));
  const leg = (t) => 1.8 * (1 - t) + 0.5 * t, L = 6;
  const pt = (sx, sz, t) => [sx * leg(t), t * ht, sz * leg(t)];
  const add = (a, b, r = 0.06) => parts.push([new THREE.CylinderGeometry(r, r, 1, 4), base.clone().multiply(rodMX(a, b))]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(pt(sx, sz, 0), pt(sx, sz, 1), 0.09);
  for (let l = 0; l < L; l++) {
    const t0 = l / L, t1 = (l + 1) / L, C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) { const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4]; add(pt(ax, az, t1), pt(bx, bz, t1), 0.04); if ((l + k) % 2 === 0) add(pt(ax, az, t0), pt(bx, bz, t1), 0.035); else add(pt(bx, bz, t0), pt(ax, az, t1), 0.035); }
  }
  add([-5, ht, 0], [5, ht, 0], 0.08); add([-5, ht, 0], [0, ht + 2, 0], 0.05); add([5, ht, 0], [0, ht + 2, 0], 0.05);
  for (const s of [-4.5, 0, 4.5]) parts.push([new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), base.clone().multiply(MX(s, ht - 0.7, 0))]);
}
export const TOWERS = [];
function buildTransmissionLine() {
  const parts = [], wires = [];
  for (let z = 900, k = 0; z < 1740; z += 112, k++) {
    const n = nearestRoad(-30, z), x = (n.s ? n.s.x : 0) - 26, y = h(x, z), fallen = k === 3 || k === 6;
    lattice(parts, x, y, z, 20, fallen ? 1.45 : 0, fallen ? 0.4 : 0);
    TOWERS.push({ x, z, y, fallen });
    blockers.push({ x, z, r: fallen ? 0 : 2.2 });
  }
  for (let k = 0; k < TOWERS.length - 1; k++) {
    const a = TOWERS[k], b = TOWERS[k + 1];
    for (const s of [-4.5, 0, 4.5]) {
      if (a.fallen && b.fallen) continue;
      const broken = a.fallen || b.fallen || (k + s) % 3 === 0;
      let prev = null;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16; let yy;
        const ya = a.fallen ? h(a.x, a.z) + 0.3 : a.y + 19.3, yb = b.fallen ? h(b.x, b.z) + 0.3 : b.y + 19.3;
        if (broken && t > 0.5) { if (a.fallen) continue; const tt = (t - 0.5) * 2; yy = lerp(ya - 6, h(lerp(a.x, b.x, t), lerp(a.z, b.z, t)) + 0.1, tt); }   // snapped, hanging to the dirt
        else yy = lerp(ya, yb, t) - 3.5 * Math.sin(Math.PI * t);
        const p = [lerp(a.x, b.x, t) + s, yy, lerp(a.z, b.z, t)];
        if (prev) wires.push(...prev, ...p); prev = p;
      }
    }
  }
  G.scene.add(mesh(merge(parts), M.rust));
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  G.scene.add(new THREE.LineSegments(wg, M.wire));
}

// ---------- the pipeline, west of the open road: on trestles, leaking where it's broken ----------
function buildPipeline() {
  const parts = [], fallen = [];
  for (const [name, route, off] of [['gate', ROUTES.gate, 24], ['main', ROUTES.main, -24], ['north', ROUTES.north, 24]]) {
    for (let i = 0, k = 0; i < route.length - 7; i += 7, k++) {
      const a = route[i], b = route[i + 7], ax = a.x + a.dz * off, az = a.z - a.dx * off, bx = b.x + b.dz * off, bz = b.z - b.dx * off, ya = h(ax, az), yb = h(bx, bz);
      if (canyonWeight(az) > 0 && Math.abs(ax - canyonAxisX(az)) < mesaOuter(ax > canyonAxisX(az) ? 1 : -1) + 16) continue;   // not over the mesa
      if (name === 'main' && Math.hypot(ax - TALLY.pump.x, az - TALLY.pump.z) < 5) continue;                                     // the pump house stands here
      const fail = name !== 'main' ? (Math.floor(az / 14) % 19 === 7 ? 'leak' : '') : k % 10 === 3 ? 'fallen' : k % 16 === 9 ? 'burst' : k % 7 === 5 ? 'rusted' : k % 19 === 12 ? 'leak' : '';
      if (fail === 'fallen') {
        // the trestle gave way: it lies on its side, and the section it held lies in the dirt, kinked
        fallen.push([new THREE.BoxGeometry(0.5, 1.6, 0.5), MX(ax + 0.6, ya + 0.25, az, 0, 0, 1.5)], [new THREE.BoxGeometry(1.2, 0.12, 0.5), MX(ax + 1.4, ya + 0.3, az, 0, 0, 1.5)]);
        const mx = lerp(ax, bx, 0.45), mz = lerp(az, bz, 0.45);
        fallen.push([new THREE.CylinderGeometry(0.34, 0.34, 1, 12), rodMX([ax, ya + 1.3, az], [mx, h(mx, mz) + 0.34, mz])], [new THREE.CylinderGeometry(0.34, 0.34, 1, 12), rodMX([mx, h(mx, mz) + 0.34, mz], [bx, yb + 1.95, bz])]);
        blockers.push({ x: mx, z: mz, r: 0.6 });
        continue;
      }
      parts.push([new THREE.BoxGeometry(0.5, 1.6, 0.5), MX(ax, ya + 0.8, az)], [new THREE.BoxGeometry(1.2, 0.12, 0.5), MX(ax, ya + 1.6, az)]);
      blockers.push({ x: ax, z: az, r: 0.45 });
      if (fail === 'leak') {
        parts.push([new THREE.CylinderGeometry(0.34, 0.34, 1, 12), rodMX([ax, ya + 1.95, az], [lerp(ax, bx, 0.42), lerp(ya, yb, 0.42) + 1.6, lerp(az, bz, 0.42)])]);
        const lx = lerp(ax, bx, 0.5), lz = lerp(az, bz, 0.5);
        const pool = mesh(new THREE.CircleGeometry(1.4, 20), M.water, { cast: false }); pool.rotation.x = -Math.PI / 2; pool.position.set(lx, h(lx, lz) + 0.04, lz); G.scene.add(pool);
        W.leaks.push({ x: lx, z: lz });
        continue;
      }
      parts.push([new THREE.CylinderGeometry(0.34, 0.34, 1, 12), rodMX([ax, ya + 1.95, az], [bx, yb + 1.95, bz])]);
      if (i % 35 === 0) parts.push([new THREE.TorusGeometry(0.37, 0.06, 6, 14), MX(ax, ya + 1.95, az, 0, Math.atan2(bx - ax, bz - az))]);
      if (fail === 'burst') {
        // a blown flange, still under a little pressure: a fan of spray, a pool, a green ring of weed round it
        const fx = lerp(ax, bx, 0.5), fz = lerp(az, bz, 0.5), fy = lerp(ya, yb, 0.5) + 1.95;
        parts.push([new THREE.TorusGeometry(0.42, 0.1, 6, 14), MX(fx, fy, fz, 0, Math.atan2(bx - ax, bz - az))]);
        const px = fx - off * 0.06, pz = fz;
        const pool = mesh(new THREE.CircleGeometry(2.6, 24), M.water, { cast: false }); pool.rotation.x = -Math.PI / 2; pool.position.set(px, h(px, pz) + 0.04, pz); G.scene.add(pool);
        W.sprays.push({ x: fx, y: fy + 0.25, z: fz, dx: -Math.sign(off), dz: 0 });
        W.leaks.push({ x: px, z: pz, name: 'Burst main', line: 'Out of a blown flange, straight into the bag. Rust, and something like pennies. Wet.' });
      }
      if (fail === 'rusted') {
        // rusted through: a weep of water, a dark stain under it
        const fx = lerp(ax, bx, 0.3), fz = lerp(az, bz, 0.3);
        const st = mesh(new THREE.CircleGeometry(0.9, 14), M.stain, { cast: false }); st.rotation.x = -Math.PI / 2; st.position.set(fx, h(fx, fz) + 0.05, fz); G.scene.add(st);
        W.drips = W.drips || []; W.drips.push({ x: fx, y: lerp(ya, yb, 0.3) + 1.6, z: fz });
      }
    }
  }
  G.scene.add(mesh(planarUV(merge(parts), 1.5), M.rust));
  if (fallen.length) G.scene.add(mesh(planarUV(merge(fallen), 1.5), M.rust));
}

// ---------- mesas: the far edge of things ----------
function buildMesas() {
  const R = rng(77), parts = [];
  for (let k = 0; k < 20; k++) {
    const side = k % 2 ? 1 : -1, z = -260 + k * 130 + R() * 60, x = side * (560 + R() * 380), rad = 40 + R() * 70, ht = 18 + R() * 30;
    parts.push([new THREE.CylinderGeometry(rad * 0.8, rad, ht, 12, 1), MX(x, ht / 2 - 4, z, 0, R() * 3, 0)]);
  }
  G.scene.add(mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0x6a3424, roughness: 1, flatShading: true }), { cast: false }));
}

// ---------- the outskirts: boreholes, spoil, the adit face, boulders along the ridge ----------
function buildOutskirts() {
  const R = rng(1313), parts = [], spoil = [];
  // boreholes: capped pipes and the tripods that drilled them
  for (const [x, z] of [[-30, 1290], [28, 1340], [-46, 1505], [34, 1610], [-22, 1660], [44, 1420]]) {
    const y = h(x, z);
    parts.push([new THREE.CylinderGeometry(0.25, 0.25, 1.1, 10), MX(x, y + 0.55, z)], [new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10), MX(x, y + 1.1, z)]);
    if (R() < 0.6) for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; parts.push([new THREE.CylinderGeometry(0.07, 0.07, 1, 5), rodMX([x + Math.cos(a) * 2.2, y, z + Math.sin(a) * 2.2], [x, y + 6, z])]); }
    spoil.push([x + 4, z + 2, 1.6 + R(), R()]);
    blockers.push({ x, z, r: 0.5 });
  }
  G.scene.add(mesh(planarUV(merge(parts), 1), M.rust));
  // spoil heaps round the pits
  for (const p of PITS) for (let k = 0; k < 7; k++) { const a = R() * Math.PI * 2, d = p.r + 6 + R() * 10; spoil.push([p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 1.5 + R() * 2.5, R()]); }
  const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), new THREE.MeshStandardMaterial({ color: 0x8a6a5e, roughness: 1, flatShading: true }), spoil.length);
  spoil.forEach(([x, z, s, r], k) => sp.setMatrixAt(k, MX(x, h(x, z) + s * 0.4, z, 0, r * 6, 0, s * 2.2, s, s * 2)));
  sp.castShadow = sp.receiveShadow = true; G.scene.add(sp);
  // the face of the big pit where the old adit goes in: a wall of rock with a timber-framed mouth
  {
    // an arched cut at the foot of the pit wall, highest over the mouth and running down into the slope either side
    const fx = ADIT.x, fz = ADIT.z, y0 = h(fx + 1, fz), facePos = [], faceCol = [], faceIdx = [], NZ = 20, NY = 12, W2 = 13;
    const tall = (z) => { const u = (z - fz) / (W2 / 2); return Math.max(0.4, 5.6 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.86 + 0.14 * Math.sin(z * 2.1))); };
    for (let i = 0; i <= NZ; i++) for (let j = 0; j <= NY; j++) {
      const z = fz - W2 / 2 + i * W2 / NZ, H = tall(z), y = y0 - 0.3 + j * (H + 0.3) / NY, mouth = Math.abs(z - fz) < 1.4 && y - y0 < 2.6;
      const x = fx - 0.6 - 0.45 * Math.sin(z * 1.3 + y * 1.7) * (mouth ? 0 : 1) - (j / NY) * 1.6;
      facePos.push(x, y, z); strataColour(y + 30, z, _c).multiplyScalar(1.1 * (0.7 + 0.3 * j / NY)); faceCol.push(_c.r, _c.g, _c.b);
    }
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NY; j++) {
      const a = i * (NY + 1) + j, b = a + 1, c = a + NY + 1, d = c + 1, zc = fz - W2 / 2 + (i + 0.5) * W2 / NZ, yc = y0 - 0.3 + (j + 0.5) * (tall(zc) + 0.3) / NY;
      if (Math.abs(zc - fz) < 1.2 && yc - y0 < 2.4) continue;                                 // the hole the adit runs into
      faceIdx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(facePos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(faceCol, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(facePos.length / 3 * 2).fill(0).map((_, i) => i % 2 ? facePos[(i >> 1) * 3 + 1] / 4 : facePos[(i >> 1) * 3 + 2] / 4), 2));
    g.setIndex(faceIdx); g.computeVertexNormals();
    G.scene.add(mesh(g, M.strata));
    blockers.push({ x0: fx - 4, z0: fz - W2 / 2, x1: fx - 0.2, z1: fz - 1.3 }, { x0: fx - 4, z0: fz + 1.3, x1: fx - 0.2, z1: fz + W2 / 2 });
    // rock heaped over the top of the cut, so it runs back into the pit wall
    const cap = [];
    for (let k = 0; k < 9; k++) { const z = fz + (k - 4) * 1.5, H = tall(z); cap.push([z, H]); }
    const capRocks = cap.map(([z, H], k) => [fx - 2.0 - (k % 3) * 1.1, z, 0.8 + Math.abs(Math.sin(k * 7.1)) * 0.7, k * 0.37]);
    const cg = new THREE.Group(); G.scene.add(cg);
    const im = new THREE.InstancedMesh(planarUV(new THREE.DodecahedronGeometry(1, 1), 1.6), M.rock, capRocks.length); im.castShadow = im.receiveShadow = true;
    capRocks.forEach(([x, z, s, r], k) => im.setMatrixAt(k, MX(x, y0 + cap[k][1] - s * 0.2, z, r * 3, r * 6, 0, s * 1.5, s * 0.7, s * 1.2)));
    cg.add(im);
  }
  // iron-shale boulders along the ridge crest
  const crest = [];
  for (let z = 1250; z < 1720; z += 9) { const x = ridgeX(z) + (R() - 0.5) * 30; crest.push([x, z, 0.8 + R() * 2.4, R()]); }
  const g = new THREE.Group(); addRocks(g, crest, M.rock); G.scene.add(g);
}

// ---------- Bleak Flats: walls of corrugated iron and scrap, spikes and wire, stacks belching yellow-black, a queue at the south gate ----------
export const GATE = { x: 0, z: 1838 };
function buildBleakFlats() {
  const cx = 0, cz = 2015, rad = 178, parts = [], spikes = [], plates = [];
  for (let a = -1.25; a <= 1.25; a += 0.035) {
    if (Math.abs(a) < 0.03) continue;                                                            // the gate
    const x = cx + Math.sin(a) * rad, z = cz - Math.cos(a) * rad, y = h(x, z) - 0.5, ht = 8 + 2.5 * Math.sin(a * 23) + (Math.sin(a * 61) > 0.6 ? 2 : 0), w = rad * 0.036;
    plates.push([new THREE.BoxGeometry(w, ht, 0.2), MX(x, y + ht / 2, z, 0, -a, Math.sin(a * 37) * 0.04)]);
    if (Math.sin(a * 13) > 0.3) parts.push([new THREE.BoxGeometry(0.35, ht + 1, 0.35), MX(x, y + ht / 2, z + 0.4, 0, -a)]);
    for (let k = 0; k < 2; k++) spikes.push([new THREE.ConeGeometry(0.09, 1.4, 4), MX(x + (k - 0.5) * w * 0.5 * Math.cos(a), y + ht + 0.6, z + (k - 0.5) * w * 0.5 * Math.sin(a), 0, 0, (k - 0.5) * 0.4)]);
    if (Math.floor(a * 100) % 3 === 0) parts.push([new THREE.TorusGeometry(0.45, 0.025, 4, 10), MX(x, y + ht + 0.35, z, 0, -a + Math.PI / 2, 0)]);   // barbed wire, coiled along the top
  }
  G.scene.add(mesh(planarUV(merge(plates), 1.2), M.corr)); G.scene.add(mesh(merge(parts), M.rust)); G.scene.add(mesh(merge(spikes), M.iron));
  // the gate: two iron towers and a slab of ship plating, hauled up on pistons
  const gx = GATE.x, gz = GATE.z, gy = h(gx, gz);
  const gate = [];
  for (const s of [-1, 1]) gate.push([new THREE.BoxGeometry(2.2, 13, 2.2), MX(gx + s * 5.2, gy + 6.5, gz)], [new THREE.CylinderGeometry(0.18, 0.18, 6, 8), MX(gx + s * 3.8, gy + 8, gz - 0.6)]);
  gate.push([new THREE.BoxGeometry(8.2, 5.5, 0.6), MX(gx, gy + 10, gz)], [new THREE.BoxGeometry(10.6, 0.8, 2.4), MX(gx, gy + 13.2, gz)]);
  G.scene.add(mesh(planarUV(merge(gate), 1.5), M.iron));
  // the booth and its Ironshell
  const booth = [[new THREE.BoxGeometry(2, 2.6, 2), MX(gx + 7.5, gy + 1.3, gz - 4)], [new THREE.BoxGeometry(2.4, 0.15, 2.4), MX(gx + 7.5, gy + 2.7, gz - 4)]];
  G.scene.add(mesh(planarUV(merge(booth), 1), M.corr));
  const shell = new THREE.Group(); shell.position.set(gx + 6.1, gy, gz - 4.2); G.scene.add(shell);
  const sp = (geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); shell.add(m); };
  sp(new THREE.BoxGeometry(0.9, 1.1, 0.6), M.ironshell, 0, 1.55, 0); sp(new THREE.BoxGeometry(0.6, 0.55, 0.55), M.ironshell, 0, 2.4, 0); sp(new THREE.BoxGeometry(0.42, 0.05, 0.02), M.slit, 0, 2.45, -0.28);
  for (const s of [-1, 1]) { sp(new THREE.BoxGeometry(0.3, 0.9, 0.3), M.ironshell, s * 0.25, 0.45, 0); sp(new THREE.BoxGeometry(0.28, 0.9, 0.28), M.ironshell, s * 0.62, 1.5, 0); }
  // the queue: steam-belching transport trucks and the dusty and weary on foot
  const truck = (x, z, tone) => {
    const tg = [];
    tg.push([new THREE.BoxGeometry(2.4, 2.2, 3.2), MX(x, h(x, z) + 1.8, z + 2.2)], [new THREE.BoxGeometry(2.6, 2.6, 5), MX(x, h(x, z) + 2, z - 2)], [new THREE.CylinderGeometry(0.7, 0.7, 2.4, 14), MX(x, h(x, z) + 1.6, z + 4.4, Math.PI / 2, 0, 0)]);
    for (const s of [-1, 1]) for (const zz of [3.2, -0.5, -3.4]) tg.push([new THREE.CylinderGeometry(0.6, 0.6, 0.45, 12), MX(x + s * 1.3, h(x, z) + 0.6, z + zz, 0, 0, Math.PI / 2)]);
    G.scene.add(mesh(planarUV(merge(tg), 1), tone));
    W.smoke.push({ x, y: h(x, z) + 4, z: z + 4.4, rate: 0.6, mat: M.smoke, size: 0.6 });
  };
  truck(1.2, 1812, M.paint); truck(-1, 1798, M.rust);
  const folk = [];
  for (const [x, z] of [[3.6, 1822], [4.4, 1824.5], [-3.2, 1806], [3.2, 1792]]) folk.push([new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), MX(x, h(x, z) + 0.85, z)], [new THREE.SphereGeometry(0.2, 8, 6), MX(x, h(x, z) + 1.75, z)]);
  G.scene.add(mesh(merge(folk), M.rag));
  // beyond the wall: leaning towers of scrap, and the refinery stacks
  const towers = [];
  const R = rng(55);
  for (let k = 0; k < 26; k++) { const a = -0.9 + R() * 1.8, d = 40 + R() * 120, x = cx + Math.sin(a) * d, z = cz - Math.cos(a) * d + 20, ht = 8 + R() * 14; towers.push([new THREE.BoxGeometry(6 + R() * 6, ht, 6 + R() * 5), MX(x, h(x, z) + ht / 2, z, 0, R() * 3, (R() - 0.5) * 0.12)]); }
  G.scene.add(mesh(planarUV(merge(towers), 2), M.corr));
  const stacks = [];
  for (const [x, z, ht] of [[-40, 1960, 42], [-12, 2010, 50], [22, 1985, 38], [55, 2040, 46], [-70, 2050, 36], [8, 2080, 44]]) {
    stacks.push([new THREE.CylinderGeometry(1.6, 2.4, ht, 12), MX(x, h(x, z) + ht / 2, z)], [new THREE.TorusGeometry(1.7, 0.2, 6, 14), MX(x, h(x, z) + ht - 1, z, Math.PI / 2, 0, 0)]);
    W.smoke.push({ x, y: h(x, z) + ht + 1, z, rate: 1.4, mat: M.yellowSmoke, size: 2.4 });
  }
  G.scene.add(mesh(merge(stacks), M.rust));
  addThing({ id: 'gate', name: 'The south gate', verb: 'Look', x: gx, y: gy + 2, z: gz - 6, r: 5, prov: ['C', CH2], use: () => hooks.bark('The gates of Bleak Flats don’t open for free. Five bits, or three ounces of raw water.', ['C', CH2]) });
}
