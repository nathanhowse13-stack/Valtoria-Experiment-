// ============================================================
// Bleak Flats, built from the plan.
//
// "It was a canyon of scrap metal. The buildings were leaning towers
// of corrugated iron, welded junk, and repurposed transport containers,
// stacked three or four storeys high. They were lashed together with
// cables and prayer, leaning over the street like drunks trying to hold
// each other up." (Chapter Two)
//
// So the Artery's frontage is towers of stacked boxes, each storey
// smaller and further out over the street than the one under it, no
// two the same colour, with doors, shutters, awnings and signs at the
// bottom, tanks and stovepipes at the top, and cables slung across the
// street between them with rags and jars of fungus-light hung on them.
// Behind the frontage, inside the caste walls, each district is built
// to its own recipe: the Warrens tiny and packed, the Workers' Block in
// rows, the old workshops of North Ridge in their yards, the High Caste
// Terrace pale and spaced on its raised ground.
//
// Everything box-shaped in the town is one instanced draw (coloured
// per piece, its iron textured by the metre whatever its size), so a
// few thousand pieces cost about what one does.
// ============================================================
import { THREE, TAU, clamp, lerp, smooth, rng, G, W, blockers, M, T } from '../road/core.js';
import { h, roadRibbon } from '../road/land.js';
import { WEST, EAST, NORTH, ARC, SOUTH_CORNER, CASTE_W, CASTE_E, CASTE_RUNS, WORKERS_END, TERRACE, TERRACE_GATE, GATE_AT, ARTERY_HALF, arteryX, LANES, BACK, SITE, claim, clear, inCity } from './plan.js';

export const CITY = { root: null, lots: [], lamps: [], vents: [], signs: [], mats: [], rand: rng(20261) };
const R = CITY.rand, pick = (a) => a[Math.floor(R() * a.length)], rr = (a, b) => a + (b - a) * R();
const pickW = (list) => { let t = 0; for (const [, w] of list) t += w; let r = R() * t; for (const [v, w] of list) { if ((r -= w) <= 0) return v; } return list[0][0]; };

// ---------- the pieces: boxes, cylinders, domes, all instanced ----------
const PIECES = { box: [], cyl: [], dome: [], dark: [], lit: [], glow: [], cloth: [] };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// what a box is made of, for the shader: plain sheet, corrugated iron, a shipping container, planks, plaster
export const SURF = { sheet: 0, corr: 1, box: 2, plank: 3, plaster: 4 };
let surf = SURF.corr;
const as = (k, fn) => { const o = surf; surf = k; fn(); surf = o; };       // build something out of one material
function put(kind, x, y, z, sx, sy, sz, col, rx = 0, ry = 0, rz = 0, k = surf) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
  PIECES[kind].push({ m: _m.clone(), c: col, k });
}
// a strut or a pipe from one point to another
function rod(ax, ay, az, bx, by, bz, r, col, kind = 'cyl') {
  _d.set(bx - ax, by - ay, bz - az); const len = _d.length(); if (len < 1e-3) return;
  _q.setFromUnitVectors(_up, _d.divideScalar(len));
  _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(r, len, r));
  PIECES[kind].push({ m: _m.clone(), c: col, k: SURF.sheet });
}
// paint, where there's any left: mostly rust, with the odd container still showing what colour it was shipped in
const RUSTS = [[0.62, 0.36, 0.26], [0.5, 0.27, 0.19], [0.7, 0.44, 0.3], [0.42, 0.25, 0.2], [0.34, 0.3, 0.28]];
const PAINTS = [[0.56, 0.2, 0.14], [0.74, 0.56, 0.22], [0.28, 0.5, 0.47], [0.4, 0.52, 0.66], [0.62, 0.62, 0.6], [0.3, 0.42, 0.26], [0.78, 0.74, 0.68]];
const CLOTHS = [[0.6, 0.22, 0.16], [0.72, 0.58, 0.36], [0.5, 0.5, 0.48], [0.3, 0.4, 0.5], [0.66, 0.42, 0.2], [0.42, 0.34, 0.26]];
const BRIGHT = [[0.72, 0.18, 0.1], [0.86, 0.6, 0.2], [0.2, 0.4, 0.62], [0.5, 0.6, 0.3], [0.82, 0.42, 0.16], [0.56, 0.26, 0.42], [0.84, 0.8, 0.7], [0.3, 0.55, 0.52]];   // market awnings, dyed and not yet faded
const PALE = [[0.86, 0.8, 0.7], [0.8, 0.72, 0.6], [0.9, 0.86, 0.8], [0.74, 0.7, 0.66]];
const WOODS = [[0.46, 0.34, 0.24], [0.4, 0.3, 0.22], [0.52, 0.4, 0.3], [0.36, 0.27, 0.2]];
const wallCol = (paint = 0.3) => { const c = R() < paint ? pick(PAINTS) : pick(RUSTS), v = rr(0.8, 1.15); return [c[0] * v, c[1] * v, c[2] * v]; };
const woodCol = () => { const c = pick(WOODS), v = rr(0.85, 1.12); return [c[0] * v, c[1] * v, c[2] * v]; };
const DARK = [0.03, 0.025, 0.02], AMBER = [2.6, 1.5, 0.55], FUNGUS = [0.5, 2.2, 0.9];

// Scrap by the metre. Every box is one instance of the same unit cube, so the shader does what a modeller would:
// the texture is laid in the piece's own size, not stretched over it; the sides of a corrugated sheet are ribbed every
// 7.6 cm, a container's every 28 cm, planks have their gaps; rust runs down from every top edge, and the bottom
// half-metre is red with what the street throws up at it. The roofs' tops are corrugated too.
const NOISE1 = `float cH(float x){ return fract(sin(x * 127.1) * 43758.5453); }
  float cN(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(cH(i), cH(i + 1.0), f); }`;
function metred(mat, key, tile = 2.4, weather = true, ribs = true) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind; varying float vKind; varying float vCor; varying float vY; varying float vTop; varying float vSide; varying float vSeed; varying vec3 vTan;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
      { vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)), lp = position * sc, an = abs(normal);
        vec2 wuv = (an.x > 0.5 ? lp.zy : an.y > 0.5 ? lp.xz : lp.xy) / ${tile.toFixed(2)} + instanceMatrix[3].xz * 0.137;
        #ifdef USE_MAP
        vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
        vNormalMapUv = wuv;
        #endif
        vKind = aKind; vCor = an.x > 0.5 ? lp.z : lp.x; vY = lp.y + sc.y * 0.5; vTop = sc.y * 0.5 - lp.y; vSide = an.y > 0.5 ? 0.0 : 1.0;
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        vTan = normalize((modelViewMatrix * (instanceMatrix * vec4(an.x > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), 0.0))).xyz);
      }
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vKind; varying float vCor; varying float vY; varying float vTop; varying float vSide; varying float vSeed; varying vec3 vTan;\n${NOISE1}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${weather ? `if (vSide > 0.5) {
          if (vKind < 2.5) {
            // rust runs: from the top edge and from the seams between sheets, longer where it's wetter
            float run = smoothstep(0.58, 0.92, cN(vCor * 2.7 + vSeed * 31.0)) * (1.0 - smoothstep(0.0, 1.2 + 3.0 * cN(vCor * 0.9 + 7.0 + vSeed * 13.0), vTop));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.42, 0.26) + vec3(0.06, 0.02, 0.0), run * 0.75);
            // and the odd sheet a different age from its neighbours
            diffuseColor.rgb *= 0.9 + 0.2 * cH(floor(vCor / 0.9) + vSeed * 17.0);
          }
          // and the foot of every wall red with the street, ragged along its top
          float grime = 1.0 - smoothstep(0.0, 0.45 + 0.35 * cN(vCor * 1.7 + vSeed * 9.0), vY);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.2, 0.13), grime * 0.6);
        }` : ''}
        if (floor(vKind + 0.5) == 3.0) {
          // planks: the gaps between the boards, and the butt joints staggered along them
          float row = floor(vY / 0.19), f = fract(vY / 0.19), j = fract(vCor / 2.3 + cH(row + vSeed * 7.0));
          diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.07, f) * smoothstep(1.0, 0.93, f) * smoothstep(0.0, 0.012, j) * smoothstep(1.0, 0.988, j));
          diffuseColor.rgb *= 0.86 + 0.28 * cH(row * 3.1 + floor(vCor / 2.3) + vSeed * 11.0);
        }`)
      .replace('#include <normal_fragment_maps>', ribs ? `#include <normal_fragment_maps>
        {
          // each kind of ridge fades out before it gets finer than the pixels, so it never crawls
          float k = floor(vKind + 0.5), fade = 1.0 - smoothstep(25.0, 90.0, length(vViewPosition)), px = max(fwidth(vCor), 1e-4);
          fade *= k == 1.0 ? 1.0 - smoothstep(0.012, 0.03, px) : k == 2.0 ? 1.0 - smoothstep(0.05, 0.12, px) : 1.0 - smoothstep(0.035, 0.08, max(fwidth(vY), 1e-4));
          float slope = 0.0;
          if (k == 1.0) slope = 0.55 * cos(vCor * 82.67);                                         // corrugated iron: 7.6 cm
          else if (k == 2.0) { float c = cos(vCor * 22.44); slope = 0.6 * sign(c) * smoothstep(0.45, 0.85, abs(c)); }   // a container's trapezoid ribs: 28 cm
          normal = normalize(normal + vTan * slope * fade);
        }` : '#include <normal_fragment_maps>');
  };
  mat.customProgramCacheKey = () => 'metred-' + key;
  return mat;
}
function instance(geo, mat, list, { cast = true, receive = true } = {}) {
  if (!list.length) return null;
  geo = geo.clone(); geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(list.map(p => p.k ?? 0)), 1));
  const im = new THREE.InstancedMesh(geo, mat, list.length), c = new THREE.Color();
  list.forEach((p, i) => { im.setMatrixAt(i, p.m); im.setColorAt(i, c.setRGB(p.c[0], p.c[1], p.c[2])); });
  im.castShadow = cast; im.receiveShadow = receive; im.frustumCulled = false;
  CITY.root.add(im); return im;
}

// ---------- walls ----------
// a run of iron plates along a line: uneven heights, posts behind, spikes and coiled wire on top (as the south wall)
function wallRun(ax, az, bx, bz, { ht = 8, vary = 2.5, spikes = true, col = null } = {}) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 6.2)), yaw = Math.atan2(dx, dz) + Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + dx * t, z = az + dz * t, y = h(x, z) - 0.5, hh = ht + vary * Math.sin(i * 2.3 + ax) + (Math.sin(i * 6.1 + az) > 0.6 ? vary * 0.8 : 0), w = len / n + 0.15;
    put('box', x, y + hh / 2, z, w, hh, 0.22, col || wallCol(0.12), 0, yaw, Math.sin(i * 3.7) * 0.03);
    if (i % 2 === 0) put('box', x, y + hh / 2, z, 0.34, hh + 0.8, 0.5, RUSTS[3], 0, yaw);
    if (spikes) { for (const k of [-0.25, 0.25]) put('cyl', x + dx / len * w * k, y + hh + 0.5, z + dz / len * w * k, 0.12, 1.3, 0.12, [0.25, 0.23, 0.22], 0, 0, k * 0.5); }
  }
  // what stops you: the wall's own line, a little fatter than it is
  if (Math.abs(dx) < 0.5) blockers.push({ x0: ax - 0.6, x1: ax + 0.6, z0: Math.min(az, bz), z1: Math.max(az, bz) });
  else if (Math.abs(dz) < 0.5) blockers.push({ x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: az - 0.6, z1: az + 0.6 });
  else for (let i = 0; i <= n; i++) blockers.push({ x: ax + dx * i / n, z: az + dz * i / n, r: len / n * 0.62 });
  claim(Math.min(ax, bx) - 1.5, Math.min(az, bz) - 1.5, Math.max(ax, bx) + 1.5, Math.max(az, bz) + 1.5);
}
function buildWalls() {
  const eastCorner = ARC.cz - Math.sqrt(ARC.r * ARC.r - EAST * EAST);
  wallRun(WEST, SOUTH_CORNER - 2, WEST, NORTH);
  wallRun(EAST, eastCorner - 2, EAST, TERRACE_GATE.z0); wallRun(EAST, TERRACE_GATE.z1, EAST, NORTH);
  wallRun(EAST, NORTH, WEST, NORTH, { ht: 9 });
  // the Terrace Gate: pale stone, iron-bound, shut. "For high castes and approved visitors only."
  const tg = TERRACE_GATE, gy = h(tg.x, (tg.z0 + tg.z1) / 2);
  for (const z of [tg.z0, tg.z1]) put('box', tg.x, gy + 7, z, 4, 14, 4, PALE[1]);
  put('box', tg.x, gy + 4.2, (tg.z0 + tg.z1) / 2, 0.8, 8.4, tg.z1 - tg.z0, [0.3, 0.28, 0.27]); put('box', tg.x, gy + 12.6, (tg.z0 + tg.z1) / 2, 4.6, 1.6, tg.z1 - tg.z0 + 4, PALE[0]);
  blockers.push({ x0: tg.x - 2, x1: tg.x + 2, z0: tg.z0 - 2, z1: tg.z1 + 2 });
  // the caste walls, behind the frontage: lower, plainer, and no way through but the gaps the lanes take
  for (const [x, runs] of [[CASTE_W, CASTE_RUNS.west], [CASTE_E, CASTE_RUNS.east]]) for (const [z0, z1] of runs) {
    wallRun(x, z0, x, z1, { ht: 6.2, vary: 1.2, spikes: false, col: [0.4, 0.3, 0.26] });
    for (const z of [z0, z1]) { put('box', x, h(x, z) + 4, z, 1.4, 8.6, 1.4, [0.3, 0.27, 0.26]); put('cyl', x, h(x, z) + 8.8, z, 0.5, 0.9, 0.5, FUNGUS.map(v => v * 0.25)); blockers.push({ x, z, r: 1.0 }); }
  }
  // the gap in the Terrace's wall is its side gate: iron, shut, a storey up a flight of steps
  { const z0 = CASTE_RUNS.east[1][1], z1 = CASTE_RUNS.east[2][0], x = CASTE_E, y = h(x + 3, (z0 + z1) / 2);
    put('box', x - 1.2, y + 5.6, (z0 + z1) / 2, 0.5, 6.4, z1 - z0, [0.3, 0.28, 0.27]);
    for (let k = 0; k < 9; k++) put('box', x + 3.6 - k * 0.5, y + 0.3 + k * 0.6, (z0 + z1) / 2, 0.55, 0.62, (z1 - z0) * 0.6, PALE[3]);
    blockers.push({ x0: x - 2, x1: x + 0.6, z0, z1 }); claim(x - 3, z0, x + 5, z1, 'open'); }
}

// ---------- streets ----------
export function patch(x0, z0, x1, z1, tone = 1) {                 // a square of trodden dirt
  const nz = Math.max(1, Math.round((z1 - z0) / 4)), samples = [];
  for (let j = 0; j <= nz; j++) samples.push({ x: (x0 + x1) / 2, z: lerp(z0, z1, j / nz), dx: 0, dz: 1 });
  roadRibbon(samples, x1 - x0, tone);
}
function buildStreets() {
  const art = [];
  for (let z = GATE_AT.z + 1; z <= NORTH - 3; z += 2) { const x = arteryX(z), x2 = arteryX(z + 1), L = Math.hypot(x2 - x, 1); art.push({ x, z, dx: (x2 - x) / L, dz: 1 / L }); claim(x - ARTERY_HALF - 0.6, z - 1.1, x + ARTERY_HALF + 0.6, z + 1.1, 'open'); }
  roadRibbon(art, ARTERY_HALF * 2, 1.0);
  const blockedAt = (runs, z) => runs.some(([a, b]) => z > a - 1 && z < b + 1);
  for (const l of LANES) {
    const x0 = blockedAt(CASTE_RUNS.east, l.z) ? CASTE_E + 1.2 : l.x0, x1 = blockedAt(CASTE_RUNS.west, l.z) ? CASTE_W - 1.2 : l.x1, s = [];
    for (let x = x0; x <= x1; x += 3) s.push({ x, z: l.z, dx: 1, dz: 0 });
    roadRibbon(s, l.half * 2, 0.94); claim(x0, l.z - l.half - 0.5, x1, l.z + l.half + 0.5, 'open'); l.x0 = x0; l.x1 = x1;
  }
  for (const b of BACK) { const s = []; for (let z = b.z0; z <= b.z1; z += 3) s.push({ x: b.x, z, dx: 0, dz: 1 }); roadRibbon(s, b.half * 2, 0.9); claim(b.x - b.half - 0.4, b.z0, b.x + b.half + 0.4, b.z1, 'open'); }
  // the open places: the gate yard, the two markets, Water Square, the works (the landmarks claim their own ground: places.js)
  const open = (x0, z0, x1, z1, draw = true) => { claim(x0, z0, x1, z1, 'open'); if (draw) patch(x0, z0, x1, z1, 0.97); };
  open(-24, GATE_AT.z + 2, 24, 1872);
  { const s = SITE.lower, ax = arteryX(s.z); open(ax + ARTERY_HALF, s.z - 13, ax + ARTERY_HALF + 26, s.z + 13); }
  { const s = SITE.water, ax = arteryX(s.z); open(ax - ARTERY_HALF - 36, s.z - 18, ax - ARTERY_HALF, s.z + 18); }
  { const s = SITE.market, ax = arteryX(s.z); open(ax + ARTERY_HALF, s.z - 19, CASTE_W - 3, s.z + 19); }
  open(CASTE_E + 2, 2210, 44, 2262); open(EAST + 4, 2262, WEST - 4, NORTH - 3, false);
}

// ---------- a tower on the Artery ----------
const SIGNS = ['GRUBS · NO PARASITES', 'SALVAGE', 'BOLTS & BITS', 'WATER · TAXED', 'VALVES', 'SWILL-ALE', 'PAWN', 'COAL', 'RIVETS', 'LAMPS · FUNGUS', 'RUST-ROT SCRUBBED', 'CHITIN POLISH', 'ROPE · CABLE', 'TEETH', 'BOILER-MENDER', 'BEDS BY THE SHIFT', 'TOOLS', 'HIDES', 'SCRAP WEIGHED', 'LETTERS WRITTEN', 'NO CREDIT', 'TUBERS', 'OIL', 'SPARES'];
// a storey made of shipping containers: one or two of them, set across the lot, door ends to the street
function containers(face, by, bz, mw, s, yaw, tilt, L) {
  const n = mw > 5.2 ? 2 : 1, zs = n === 2 ? [bz - 1.23, bz + 1.23] : [bz];
  for (const z of zs) {
    const c = R() < 0.6 ? pick(PAINTS) : wallCol(0.2), cx = face + s * L / 2, v = rr(0.75, 1.05);
    put('box', cx, by + 1.3, z, L, 2.59, 2.44, [c[0] * v, c[1] * v, c[2] * v], 0, yaw, tilt, SURF.box);
    for (const e of [-1, 1]) put('box', cx, by + 1.3 + e * 1.27, z, L + 0.04, 0.1, 2.48, RUSTS[4], 0, yaw, tilt, SURF.sheet);        // the rails top and bottom
    // the door end, to the street: the seam, the locking bars; now and then a door left open on the dark
    const fx = face - s * 0.03;
    if (R() < 0.3) put('dark', fx + s * 0.02, by + 1.25, z + 0.6, 0.05, 2.3, 1.1, DARK);
    else put('box', fx, by + 1.3, z, 0.05, 2.3, 0.05, [0.12, 0.1, 0.09], 0, yaw, 0, SURF.sheet);
    for (const o of [-0.9, -0.38, 0.38, 0.9]) put('cyl', fx - s * 0.05, by + 1.3, z + o, 0.04, 2.3, 0.04, RUSTS[3]);
  }
  return n * 2.44;
}
// Storeys stacked up from the street: corrugated iron, a container or two, planks, or an open deck; each a little
// further out over the street than the one under it, on brackets, and none of them quite plumb. The ground floor is a
// shop, its shutter half up; the roof has its tank, its stovepipe, a still.
function tower(cx, cz, w, d, s, storeys, { paint = 0.34, shop = true } = {}) {
  const y0 = h(cx, cz), face0 = cx - s * d / 2, yaw0 = (R() - 0.5) * 0.05;
  let y = y0, face = face0, md = d, mw = w, bz = cz, lastKind = '';
  const floors = [];
  for (let k = 0; k < storeys; k++) {
    let kind = k === 0 ? pickW([['iron', 5], ['plank', 2], ['box', 2.5]]) : pickW([['iron', 4], ['box', 2.4], ['plank', 1.6], ['deck', k > 1 && k === storeys - 1 ? 1.4 : 0]]);
    if (kind === lastKind && R() < 0.5) kind = kind === 'iron' ? 'plank' : 'iron';
    lastKind = kind;
    if (k > 0) {
      const out = rr(0.3, 0.95);
      // the brackets: struts from the wall below up under the floor that hangs out over the street
      for (const e of [-0.36, 0.36]) rod(face + s * 0.05, y - 1.1, bz + e * mw, face - s * out + s * 0.15, y - 0.05, bz + e * mw, 0.09, RUSTS[3]);
      face -= s * out; md = Math.max(4.2, md * rr(0.8, 0.96)); mw = Math.max(3.6, Math.min(w + 0.6, mw * rr(0.88, 1.04))); bz += rr(-0.35, 0.35);
    }
    const tilt = s * k * rr(0.004, 0.011), yaw = yaw0 + (R() - 0.5) * 0.035 * k;
    let hh = rr(2.5, 3.0), bx = face + s * md / 2;
    if (kind === 'box') { const L = md > 11 && R() < 0.6 ? 12.19 : 6.06; hh = 2.59; mw = containers(face, y, bz, mw, s, yaw, tilt, L); md = L; bx = face + s * L / 2; }
    else if (kind === 'deck') {
      hh = 2.4;
      as(SURF.plank, () => put('box', bx, y + 0.08, bz, md, 0.16, mw, woodCol(), 0, yaw, tilt));
      for (const [ex, ez] of [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]) put('cyl', bx + ex * (md - 0.2), y + hh / 2, bz + ez * (mw - 0.2), 0.1, hh, 0.1, RUSTS[3]);
      put('box', face - s * 0.02, y + 1.0, bz, 0.06, 0.06, mw, RUSTS[3], 0, yaw, 0, SURF.sheet);                                   // the rail
      for (let z = bz - mw / 2 + 0.3; z < bz + mw / 2; z += 0.45) put('cyl', face - s * 0.02, y + 0.55, z, 0.03, 0.9, 0.03, RUSTS[4]);
      put('box', bx + s * md * 0.2, y + 1.1, bz, md * 0.5, 2.0, mw * 0.8, wallCol(paint), 0, yaw, tilt);                            // a lean-to at the back of it
      put('cloth', face + s * 0.6, y + 1.35, bz + rr(-1, 1), 0.04, rr(0.5, 0.9), rr(1, 2), pick(CLOTHS), 0, yaw, 0);              // washing on the rail
      if (R() < 0.6) put('box', bx - s * md * 0.15, y + 0.4, bz + mw * 0.25, 0.6, 0.5, 0.6, woodCol(), 0, R(), 0, SURF.plank);
    } else {
      const col = kind === 'plank' ? woodCol() : wallCol(paint);
      put('box', bx, y + hh / 2, bz, md, hh, mw, col, 0, yaw, tilt, kind === 'plank' ? SURF.plank : SURF.corr);
      put('box', bx, y + 0.07, bz, md + 0.12, 0.14, mw + 0.12, RUSTS[4], 0, yaw, tilt, SURF.sheet);                                 // the floor's edge between storeys
      // corners: angle iron up each street corner, where the sheets are riveted to it
      for (const e of [-1, 1]) put('box', face - s * 0.03, y + hh / 2, bz + e * (mw / 2 - 0.02), 0.1, hh, 0.1, RUSTS[3], 0, yaw, tilt, SURF.sheet);
    }
    floors.push({ y, hh, bx, bz, md, mw, face, kind, yaw, tilt });
    y += hh;
  }
  const top = y, F = floors;
  // the shop on the street: a dark doorway, the shutter half up over it, a counter, an awning, its goods, its sign
  if (shop) {
    const f = F[0], fw = Math.min(f.mw * 0.62, 3.6), dz = (R() - 0.5) * (f.mw - fw) * 0.6, z = f.bz + dz, fx = f.face - s * 0.04;
    put('dark', fx + s * 0.03, y0 + 1.2, z, 0.06, 2.4, fw, DARK);
    put('box', fx - s * 0.02, y0 + 2.18, z, 0.07, rr(0.4, 0.9), fw + 0.1, wallCol(0.4), 0, 0, 0, SURF.corr);                       // the roller shutter, half up
    put('cyl', fx - s * 0.12, y0 + 2.62, z, 0.22, fw + 0.2, 0.22, RUSTS[3], Math.PI / 2, 0, 0);                                    // its drum
    as(SURF.plank, () => put('box', fx - s * 0.45, y0 + 0.5, z, 0.65, 1.0, fw * 0.85, woodCol()));
    for (let i = 0; i < 6; i++) { const q = R(), gz = z + rr(-fw * 0.38, fw * 0.38); if (q < 0.4) put('box', fx - s * 0.45, y0 + 1.11, gz, 0.26, 0.2, 0.26, woodCol(), 0, R(), 0, SURF.plank); else if (q < 0.75) put('cyl', fx - s * 0.45, y0 + 1.12, gz, 0.13, 0.24, 0.13, pick(PAINTS)); else put('dome', fx - s * 0.45, y0 + 1.0, gz, 0.18, 0.16, 0.18, pick(CLOTHS)); }
    // the awning: cloth or a sheet of iron, sloping down to the street on its brackets
    const aw = rr(1.8, 2.6), ay = y0 + rr(2.7, 2.95), cloth = R() < 0.55;
    put(cloth ? 'cloth' : 'box', fx - s * aw / 2, ay, z, aw, cloth ? 0.04 : 0.06, fw + rr(0.4, 1.2), cloth ? pick(CLOTHS) : wallCol(0.3), 0, 0, s * 0.24, SURF.corr);
    for (const e of [-0.45, 0.45]) rod(fx, ay - 0.9, z + e * fw, fx - s * aw * 0.92, ay - aw * 0.24 + 0.02, z + e * fw, 0.05, RUSTS[3]);
    if (cloth) for (let i = 0; i < 4; i++) put('cloth', fx - s * aw * 0.97, ay - aw * 0.24 - 0.12, z + (i - 1.5) * fw / 4, 0.02, 0.22, fw / 4.4, pick(CLOTHS), 0, 0, 0);   // its scalloped edge
    // what hangs off the awning's front: pots, hides, a string of something
    for (let i = Math.floor(R() * 4); i > 0; i--) put('box', fx - s * aw * 0.8, ay - 0.65, z + rr(-fw / 2, fw / 2), 0.12, rr(0.3, 0.6), 0.12, pick([[0.42, 0.22, 0.12], [0.5, 0.4, 0.2], [0.3, 0.28, 0.26]]));
    // the sign: on the wall over the awning, or a blade hung out from the first floor so it reads up and down the street
    if (R() < 0.42) CITY.signs.push({ text: pick(SIGNS), x: f.face - s * 0.08, y: ay + 0.75, z, w: Math.min(3.2, f.mw * 0.8), s, blade: false });
    else { const bz2 = f.bz + (R() < 0.5 ? -1 : 1) * f.mw * 0.36, bx2 = (F[1] ? F[1].face : f.face) - s * 0.85; CITY.signs.push({ text: pick(SIGNS), x: bx2, y: ay + 1.0, z: bz2, w: 1.5, s, blade: true }); put('cyl', bx2 + s * 0.45, ay + 1.62, bz2, 0.04, 1.0, 0.04, RUSTS[3], 0, 0, Math.PI / 2); }
    if (R() < 0.45) CITY.lamps.push({ x: fx - s * 0.35, y: ay - 0.55, z: z + (R() < 0.5 ? -1 : 1) * fw * 0.5 });
    if (R() < 0.6) for (let i = 1 + Math.floor(R() * 3); i > 0; i--) put('box', fx - s * rr(0.4, 1.2), y0 + 0.3, f.bz + (R() < 0.5 ? -1 : 1) * rr(fw / 2 + 0.2, f.mw / 2), rr(0.4, 0.7), rr(0.4, 0.6), rr(0.4, 0.7), woodCol(), 0, R(), 0, SURF.plank);   // crates out the front
  }
  // upper storeys: windows (most dark, a few lit), shutters hung open or nailed shut, a balcony now and then
  for (let k = 1; k < F.length; k++) {
    const f = F[k]; if (f.kind === 'deck') continue;
    const nwin = f.mw > 5 ? 2 + (R() < 0.4 ? 1 : 0) : 1;
    for (let i = 0; i < nwin; i++) {
      const z = f.bz + (nwin === 1 ? rr(-0.6, 0.6) : (i / (nwin - 1) - 0.5) * (f.mw - 1.8)), wy = f.y + f.hh * 0.55, lit = R() < 0.16, q = R();
      if (q < 0.18) { as(SURF.plank, () => { for (const o of [-0.25, 0.05, 0.3]) put('box', f.face - s * 0.06, wy + o, z, 0.05, 0.16, 1.0, woodCol(), 0, 0, (R() - 0.5) * 0.3); }); continue; }   // boarded up
      put(lit ? 'lit' : 'dark', f.face - s * 0.02, wy, z, 0.06, 0.85, 0.75, lit ? AMBER.map(v => v * rr(0.5, 1)) : DARK);
      put('box', f.face - s * 0.05, wy - 0.48, z, 0.12, 0.06, 0.95, RUSTS[3], 0, 0, 0, SURF.sheet);                                // the sill
      if (q > 0.6) put('box', f.face - s * 0.08 - s * 0.25, wy, z + 0.68, 0.04, 0.85, 0.42, wallCol(0.6), 0, s * 0.9, 0, SURF.corr);  // a shutter hung open
    }
    if (f.kind !== 'box' && R() < 0.22) {
      const z = f.bz + rr(-0.5, 0.5), bw = Math.min(2.6, f.mw * 0.6);
      as(SURF.plank, () => put('box', f.face - s * 0.55, f.y + 0.06, z, 1.1, 0.12, bw, woodCol()));
      put('box', f.face - s * 1.08, f.y + 1.0, z, 0.05, 0.05, bw, RUSTS[3], 0, 0, 0, SURF.sheet);
      for (const e of [-0.5, 0.5]) put('cyl', f.face - s * 1.08, f.y + 0.5, z + e * bw, 0.05, 1.0, 0.05, RUSTS[3]);
      rod(f.face, f.y - 0.8, z, f.face - s * 1.0, f.y - 0.02, z, 0.06, RUSTS[3]);
      put('dark', f.face - s * 0.02, f.y + 1.0, z, 0.06, 2.0, 0.85, DARK);                                                          // the door onto it
      if (R() < 0.5) put('cloth', f.face - s * 1.1, f.y + 0.75, z + rr(-0.4, 0.4), 0.03, 0.6, rr(0.5, 0.9), pick(CLOTHS));
    }
  }
  // a pipe down one corner from the roof, and a ladder or a stair up the side to the first floor
  { const f = F[F.length - 1], e = R() < 0.5 ? -1 : 1; put('cyl', f.face - s * 0.15, (y0 + top) / 2, f.bz + e * (f.mw / 2 - 0.2), 0.11, top - y0, 0.11, RUSTS[3]); }
  if (F.length > 1 && R() < 0.5) {
    const e = R() < 0.5 ? -1 : 1, f = F[0], z = f.bz + e * (f.mw / 2 + 0.3), x = f.face + s * Math.min(2.4, f.md * 0.4), hh = F[1].y - y0;
    if (R() < 0.5) { for (const o of [-0.22, 0.22]) put('cyl', x, y0 + hh / 2, z + o, 0.05, hh, 0.05, RUSTS[3]); for (let r = 0.3; r < hh; r += 0.32) put('cyl', x, y0 + r, z, 0.03, 0.44, 0.03, RUSTS[4], Math.PI / 2, 0, 0); }
    else { const n = Math.round(hh / 0.24); for (let i = 0; i < n; i++) put('box', x + s * i * 0.27, y0 + (i + 0.5) * hh / n, z, 0.3, 0.06, 0.8, RUSTS[3], 0, 0, 0, SURF.sheet); rod(x, y0, z + 0.42, x + s * n * 0.27, top > y0 + hh ? y0 + hh + 0.9 : y0 + hh, z + 0.42, 0.04, RUSTS[3]); }
  }
  // the roof: a skin of iron over the top storey, and what lives up there
  { const f = F[F.length - 1], ry = top + 0.06;
    if (f.kind !== 'deck') put('box', f.bx, ry, f.bz, f.md + 0.35, 0.08, f.mw + 0.35, [0.5, 0.42, 0.36].map(v => v * rr(0.8, 1.1)), 0, f.yaw, f.tilt + s * 0.05, SURF.corr);
    else put('box', f.bx + s * f.md * 0.1, top + 0.15, f.bz, f.md * 0.8, 0.06, f.mw + 0.3, [0.5, 0.42, 0.36], 0, f.yaw, s * 0.12, SURF.corr);
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const q = R(), rx = f.bx + s * rr(-0.2, 0.35) * f.md, rz = f.bz + rr(-0.35, 0.35) * f.mw;
      if (q < 0.3) { put('cyl', rx, ry + 1.5, rz, 1.5, 1.8, 1.5, wallCol(0.3)); for (const [a, b] of [[-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5]]) put('cyl', rx + a, ry + 0.3, rz + b, 0.08, 0.6, 0.08, RUSTS[3]); }   // a water tank on its stand
      else if (q < 0.55) { put('cyl', rx, ry + 0.9, rz, 0.2, 1.8, 0.2, RUSTS[3]); put('cyl', rx, ry + 1.85, rz, 0.32, 0.1, 0.32, RUSTS[4]); CITY.vents.push({ x: rx, y: ry + 2.0, z: rz, kind: R() < 0.3 ? 'steam' : 'smoke' }); }   // a stovepipe, smoking
      else if (q < 0.72) { put('box', rx, ry + 0.75, rz, 1.4, 0.06, 1.0, [0.55, 0.68, 0.72], 0.6, R() * 3, 0, SURF.sheet); for (const o of [-0.5, 0.5]) put('cyl', rx + o, ry + 0.35, rz, 0.05, 0.7, 0.05, RUSTS[3]); }   // a solar still, its glass to the sky
      else if (q < 0.86) { put('cyl', rx, ry + 2, rz, 0.06, 4, 0.06, RUSTS[4]); put('cloth', rx + 0.3, ry + 3.6, rz, 0.6, 0.4, 0.02, pick(CLOTHS), 0, R() * 3, 0); }   // a pole with a rag on it
      else put('box', rx, ry + 0.9, rz, rr(1.6, 2.4), 1.8, rr(1.4, 2.2), wallCol(0.2), 0, R(), 0);                                  // a hut on the roof
    }
  }
  const lot = { x: cx, z: cz, w, d, s, top, face: face0, lean: F[F.length - 1].face, floors: F.length };
  CITY.lots.push(lot);
  blockers.push({ x0: cx - d / 2, x1: cx + d / 2, z0: cz - w / 2, z1: cz + w / 2 }); claim(cx - d / 2, cz - w / 2, cx + d / 2, cz + w / 2);
  return lot;
}
// "lashed together with cables and prayer, leaning over the street like drunks trying to hold each other up":
// props between neighbours, and a fungus lamp on a post every so often along each side
function buildStreetEdge() {
  for (const s of [1, -1]) {
    const lots = CITY.lots.filter(l => l.s === s).sort((a, b) => a.z - b.z);
    for (let i = 0; i < lots.length - 1; i++) {
      const a = lots[i], b = lots[i + 1], gap = b.z - b.w / 2 - (a.z + a.w / 2);
      if (gap < 4 && R() < 0.55) { const y = Math.min(a.top, b.top) - rr(1, 3); put('cyl', (a.lean + b.lean) / 2, y, (a.z + b.z) / 2, 0.09, Math.abs(b.z - a.z), 0.09, RUSTS[3], Math.PI / 2, 0, 0); }
    }
    for (let z = 1880; z < 2205; z += rr(12, 17)) {
      const x = arteryX(z) + s * (ARTERY_HALF + 0.5); if (!clear(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0)) continue;
      const y = h(x, z); put('cyl', x, y + 1.7, z, 0.07, 3.4, 0.07, RUSTS[3]); put('box', x - s * 0.4, y + 3.35, z, 0.8, 0.05, 0.05, RUSTS[3]);
      CITY.lamps.push({ x: x - s * 0.75, y: y + 3.05, z, hung: true }); blockers.push({ x, z, r: 0.15 });
    }
  }
}
function buildFrontage() {
  for (const s of [1, -1]) {
    let z = 1873;
    while (z < 2212) {
      // a lot as wide as there's room for: it shrinks to fit between the lanes and squares, and stands shoulder to shoulder
      const d = rr(9, 14), set = rr(0, 0.7); let placed = false;
      for (let w = rr(6, 10.5); w >= 3.8; w -= 1.1) {
        const cz = z + w / 2, ax = s > 0 ? Math.max(arteryX(z), arteryX(cz), arteryX(z + w)) : Math.min(arteryX(z), arteryX(cz), arteryX(z + w)), cx = ax + s * (ARTERY_HALF + 0.9 + set + d / 2);
        if (!clear(cx - d / 2, cz - w / 2, cx + d / 2, cz + w / 2, 0.15)) continue;
        // the core is tallest; it's lower by the gate and where the works begin
        const core = smooth(1880, 1950, cz) * (1 - smooth(2150, 2215, cz)), storeys = clamp(Math.round(1.5 + core * 2.6 + R() * 1.3), 1, 5);
        tower(cx, cz, w, d, s, storeys);
        z += w + (R() < 0.14 ? rr(1.4, 2.6) : rr(0.04, 0.3)); placed = true; break;   // now and then an alley
      }
      if (!placed) z += 0.8;
    }
  }
}

// ---------- the districts behind ----------
function shanty(cx, cz, w, d, hh, { paint = 0.15, storeys = 1, tarp = 0.3, lit = 0.06 } = {}) {
  if (!clear(cx - d / 2, cz - w / 2, cx + d / 2, cz + w / 2, 0.3)) return false;
  const y0 = h(cx, cz), yaw = (R() - 0.5) * 0.12; let top = y0;
  for (let k = 0; k < storeys; k++) { const f = k ? 0.8 : 1; put('box', cx + (k ? (R() - 0.5) : 0), top + hh / 2, cz + (k ? (R() - 0.5) : 0), d * f, hh, w * f, wallCol(paint), 0, yaw + (k ? (R() - 0.5) * 0.2 : 0), 0); top += hh; }
  put('box', cx, top + 0.1, cz, d + 0.4, 0.06, w + 0.4, [0.46, 0.38, 0.33], (R() - 0.5) * 0.14, yaw, (R() - 0.5) * 0.14);
  const side = R() < 0.5 ? 1 : -1; put(R() < lit ? 'lit' : 'dark', cx + side * (d / 2 + 0.02), y0 + 0.95, cz + (R() - 0.5) * w * 0.5, 0.1, 1.9, 0.85, R() < lit ? AMBER : DARK);
  if (R() < tarp) put('cloth', cx - side * (d / 2 + 0.9), y0 + hh * 0.85, cz, 1.9, 0.04, w * 0.7, pick(CLOTHS), 0, yaw, -side * 0.35);
  if (R() < 0.12) { put('cyl', cx + d * 0.25, top + 0.7, cz, 0.13, 1.4, 0.13, RUSTS[3]); if (R() < 0.5) CITY.vents.push({ x: cx + d * 0.25, y: top + 1.5, z: cz, kind: 'smoke' }); }
  blockers.push({ x0: cx - d / 2, x1: cx + d / 2, z0: cz - w / 2, z1: cz + w / 2 }); claim(cx - d / 2, cz - w / 2, cx + d / 2, cz + w / 2);
  return true;
}
function fill(x0, z0, x1, z1, pitchX, pitchZ, make) {
  for (let z = z0 + pitchZ / 2; z < z1; z += pitchZ) for (let x = x0 + pitchX / 2; x < x1; x += pitchX) if (inCity(x, z, 3)) make(x + (R() - 0.5) * pitchX * 0.25, z + (R() - 0.5) * pitchZ * 0.25);
}
function buildDistricts() {
  // the back lots, between the frontage and the caste walls
  fill(CASTE_E + 3, 1876, CASTE_W - 3, 2208, 8.5, 9, (x, z) => { if (Math.abs(x - arteryX(z)) < ARTERY_HALF + 12) return; shanty(x, z, rr(5, 7.5), rr(5, 7.5), rr(2.4, 3), { storeys: R() < 0.35 ? 2 : 1, paint: 0.25 }); });
  // the Warrens: "Lowest caste housing. Dugouts, tunnels, dens and black markets." Small, low, packed, patched with cloth
  fill(EAST + 3, 1872, CASTE_E - 2, TERRACE.z0 - 6, 5.6, 5.8, (x, z) => {
    if (R() < 0.2) { if (clear(x - 1.8, z - 1.8, x + 1.8, z + 1.8)) { const y = h(x, z); put('dome', x, y - 0.3, z, 2.4, 1.5, 2.4, [0.5, 0.3, 0.22]); put('dark', x + 2.0, y + 0.5, z, 0.5, 1.0, 0.9, DARK); blockers.push({ x, z, r: 2.1 }); claim(x - 2, z - 2, x + 2, z + 2); } return; }   // a dugout: a mound and a hole
    shanty(x, z, rr(3, 4.6), rr(3, 4.6), rr(1.9, 2.5), { paint: 0.06, tarp: 0.6, lit: 0.1 });
  });
  // the Workers' Block: barracks in rows, a depot shed at the end of each
  for (let x = CASTE_W + 7; x < WEST - 6; x += 9.5) for (let z = 1880; z < WORKERS_END - 8; z += 21) {
    if (!inCity(x, z, 4)) continue;
    if (clear(x - 3, z - 8.5, x + 3, z + 8.5, 0.3)) {
      const y = h(x, z), c = [0.42, 0.36, 0.33]; put('box', x, y + 1.6, z, 5.6, 3.2, 17, c); put('box', x, y + 3.35, z, 6.2, 0.07, 17.6, [0.5, 0.44, 0.4], 0, 0, 0.08);
      for (let k = -3; k <= 3; k++) put(R() < 0.08 ? 'lit' : 'dark', x - 2.83, y + 1.7, z + k * 2.3, 0.1, 0.7, 0.9, R() < 0.08 ? AMBER : DARK);
      put('dark', x - 2.83, y + 1.0, z - 7.4, 0.1, 2.0, 0.9, DARK);
      blockers.push({ x0: x - 2.8, x1: x + 2.8, z0: z - 8.5, z1: z + 8.5 }); claim(x - 2.8, z - 8.5, x + 2.8, z + 8.5);
    }
  }
  // North Ridge: "Older town. Scrap yards, workshops, mid-caste housing." Bigger sheds, further apart, heaps between them
  fill(CASTE_W - 8, WORKERS_END + 6, WEST - 4, 2258, 14, 13.5, (x, z) => {
    if (R() < 0.22) { const y = h(x, z); for (let k = 0; k < 7; k++) put('box', x + rr(-2.5, 2.5), y + rr(0.2, 1.1), z + rr(-2.5, 2.5), rr(0.6, 2.4), rr(0.3, 1.2), rr(0.6, 2.6), wallCol(0.2), rr(-0.5, 0.5), R() * 3, rr(-0.5, 0.5)); blockers.push({ x, z, r: 2.6 }); claim(x - 3, z - 3, x + 3, z + 3); return; }   // a scrap heap
    shanty(x, z, rr(7, 10), rr(7, 10), rr(3, 4), { storeys: R() < 0.45 ? 2 : 1, paint: 0.3, tarp: 0.15, lit: 0.1 });
  });
  // the High Caste Terrace: "Cleaner, better maintained." Pale walls, domes, verandahs, room to breathe. Seen over its wall, not entered
  fill(EAST + 6, TERRACE.z0 + 8, CASTE_E - 6, TERRACE.z1 - 6, 21, 23, (x, z) => {
    if (Math.abs(z - (TERRACE_GATE.z0 + TERRACE_GATE.z1) / 2) < 12) return;                                     // the road in from its gate
    const y = h(x, z), w = rr(9, 12), d = rr(9, 12), hh = rr(5.5, 8), c = pick(PALE);
    if (!clear(x - d / 2, z - w / 2, x + d / 2, z + w / 2, 0.5)) return;
    as(SURF.plaster, () => { put('box', x, y + hh / 2, z, d, hh, w, c); put('box', x, y + hh + 0.25, z, d + 0.8, 0.5, w + 0.8, PALE[2]); });
    if (R() < 0.6) put('dome', x, y + hh + 0.4, z, d * 0.3, d * 0.3, d * 0.3, R() < 0.5 ? [0.36, 0.46, 0.58] : PALE[2]);
    for (const e of [-1, 1]) { put('cyl', x + d / 2 + 1.2, y + hh * 0.36, z + e * w * 0.35, 0.22, hh * 0.72, 0.22, PALE[2]); put('lit', x + d / 2 + 0.03, y + hh * 0.6, z + e * w * 0.2, 0.08, 1.5, 1.0, AMBER.map(v => v * 0.5)); }
    put('box', x + d / 2 + 0.8, y + hh * 0.74, z, 2.2, 0.2, w, PALE[2]);
    claim(x - d / 2 - 1, z - w / 2 - 1, x + d / 2 + 2, z + w / 2 + 1);
  });
}

// ---------- across the street: cables, and what hangs from them ----------
function buildCables() {
  const west = CITY.lots.filter(l => l.s > 0), east = CITY.lots.filter(l => l.s < 0), pts = [], v = new THREE.Vector3();
  for (const a of west) {
    if (R() < 0.3) continue;
    const b = east.reduce((best, l) => Math.abs(l.z - a.z) < Math.abs(best.z - a.z) ? l : best, east[0]);
    if (!b || Math.abs(b.z - a.z) > 8) continue;
    const A = new THREE.Vector3(a.lean, a.top - rr(0.3, 2.5), a.z + rr(-2, 2)), B = new THREE.Vector3(b.lean, b.top - rr(0.3, 2.5), b.z + rr(-2, 2)), sag = rr(0.8, 2.6), n = 10;
    for (let i = 0; i < n; i++) { for (const t of [i / n, (i + 1) / n]) { v.lerpVectors(A, B, t); v.y -= Math.sin(t * Math.PI) * sag; pts.push(v.x, v.y, v.z); } }
    // prayer and washing: rags along the cable; and a jar of fungus-light or two
    const hung = Math.floor(R() * 4);
    for (let k = 0; k < hung; k++) { const t = rr(0.15, 0.85); v.lerpVectors(A, B, t); v.y -= Math.sin(t * Math.PI) * sag; put('cloth', v.x, v.y - 0.3, v.z, rr(0.35, 0.7), rr(0.4, 0.7), 0.02, pick(CLOTHS), 0, rr(-0.3, 0.3), 0); }
    if (R() < 0.45) { const t = rr(0.3, 0.7); v.lerpVectors(A, B, t); v.y -= Math.sin(t * Math.PI) * sag; CITY.lamps.push({ x: v.x, y: v.y - 0.35, z: v.z, hung: true }); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, M.wire); l.frustumCulled = false; CITY.root.add(l);
}
// the jars: a point of green-white light each, and a little glass round it
function buildLamps() {
  for (const l of CITY.lamps) { put('glow', l.x, l.y, l.z, 0.17, 0.24, 0.17, FUNGUS); put('cyl', l.x, l.y + 0.13, l.z, 0.2, 0.04, 0.2, RUSTS[3]); if (!l.hung) put('cyl', l.x, l.y + 0.25, l.z, 0.02, 0.2, 0.02, RUSTS[4]); }
}
// shop signs: one sheet of painted boards, one draw
function buildSigns() {
  if (!CITY.signs.length) return;
  const N = SIGNS.length, cols = 4, rows = Math.ceil(N / cols), cw = 256, ch = 56, c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
  const x = c.getContext('2d'), BG = ['#3a2a1f', '#5a2a1c', '#2c3a34', '#4a4132', '#26221e'], FG = ['#e9dcc0', '#f0c890', '#d8d0c0'];
  SIGNS.forEach((t, i) => {
    const px = (i % cols) * cw, py = Math.floor(i / cols) * ch;
    x.fillStyle = BG[i % BG.length]; x.fillRect(px + 2, py + 2, cw - 4, ch - 4);
    x.fillStyle = FG[i % FG.length]; x.font = `bold ${t.length > 15 ? 21 : 27}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px + cw / 2, py + ch / 2 + 1);
    x.globalAlpha = 0.5; x.fillStyle = '#7a3a22'; for (let k = 0; k < 26; k++) x.fillRect(px + Math.random() * cw, py + Math.random() * ch, 2 + Math.random() * 9, 1 + Math.random() * 2); x.globalAlpha = 1;     // weather
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const pos = [], uv = [], idx = [];
  CITY.signs.forEach((s) => {
    const i = SIGNS.indexOf(s.text), u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) / rows, u1 = u0 + 1 / cols, v0 = v1 - 1 / rows, hw = s.w / 2, hh = s.w * ch / cw / 2;
    if (s.blade) {
      // hung out from the wall on its bracket: square to the street, readable from up and down it
      // (two faces a hair apart, each the right way round from its own side)
      for (const e of [1, -1]) { const xa = s.x + e * hw, xb = s.x - e * hw, zz = s.z - e * 0.025; pos.push(xa, s.y - hh, zz, xb, s.y - hh, zz, xa, s.y + hh, zz, xb, s.y + hh, zz); }
      put('cyl', s.x, s.y + hh + 0.12, s.z, 0.03, s.w + 0.3, 0.03, RUSTS[3], 0, 0, Math.PI / 2);
    } else {
      // facing the street: the west side's signs face east (−x), the east side's face west
      const zs = s.s > 0 ? [-hw, hw] : [hw, -hw];
      pos.push(s.x, s.y - hh, s.z + zs[0], s.x, s.y - hh, s.z + zs[1], s.x, s.y + hh, s.z + zs[0], s.x, s.y + hh, s.z + zs[1]);
    }
    const n = pos.length / 3 - (s.blade ? 8 : 4);
    for (let q = n; q < pos.length / 3; q += 4) { uv.push(u0, v0, u1, v0, u0, v1, u1, v1); idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide })); m.receiveShadow = true; CITY.root.add(m);
}

// ---------- everything box-shaped, drawn ----------
export function finishCity() {
  buildLamps(); buildSigns();
  const iron = metred(new THREE.MeshStandardMaterial({ map: T.tin.c, normalMap: T.tin.n, color: 0xffffff, roughness: 0.62, metalness: 0.45 }), 'iron');
  const pipe = new THREE.MeshStandardMaterial({ map: T.iron.c, normalMap: T.iron.n, color: 0xffffff, roughness: 0.75, metalness: 0.4 });
  const cloth = metred(new THREE.MeshStandardMaterial({ map: T.canvas.c, color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), 'cloth', 1.2, false, false);
  // the boxes split by what they're made of, because planks and plaster want other textures than iron does
  const byK = (k) => PIECES.box.filter(p => (p.k ?? 1) === k);
  instance(new THREE.BoxGeometry(1, 1, 1), iron, PIECES.box.filter(p => (p.k ?? 1) <= 2));
  instance(new THREE.BoxGeometry(1, 1, 1), metred(new THREE.MeshStandardMaterial({ map: T.boards.c, normalMap: T.boards.n, color: 0xffffff, roughness: 0.92 }), 'plank', 1.6), byK(SURF.plank));
  instance(new THREE.BoxGeometry(1, 1, 1), metred(new THREE.MeshStandardMaterial({ map: T.canvas.c, normalMap: T.iron.n, normalScale: new THREE.Vector2(0.35, 0.35), color: 0xffffff, roughness: 0.95 }), 'plaster', 3.2), byK(SURF.plaster));
  instance(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), pipe, PIECES.cyl);
  instance(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), PIECES.dome);
  instance(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), PIECES.dark, { cast: false });
  instance(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PIECES.lit, { cast: false, receive: false });
  instance(new THREE.CylinderGeometry(0.5, 0.46, 1, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), PIECES.glow, { cast: false, receive: false });
  instance(new THREE.BoxGeometry(1, 1, 1), cloth, PIECES.cloth);
  // stovepipes and vents: smoke from the fires under them, steam from the boilers
  // (indoors the sky's light is turned down on all of these: places.js)
  CITY.mats.push(iron, pipe, cloth, ...CITY.root.children.filter(o => o.isInstancedMesh).map(o => o.material).filter(m => ![iron, pipe, cloth].includes(m)));
  for (const m of CITY.mats) m.userData.env0 = m.envMapIntensity ?? 1;
  for (const v of CITY.vents) W.smoke.push({ x: v.x, y: v.y, z: v.z, rate: v.kind === 'steam' ? 0.5 : 0.22, mat: v.kind === 'steam' ? STEAM : M.smoke, size: v.kind === 'steam' ? 0.35 : 0.3, near: 190, life: v.kind === 'steam' ? 3.5 : 7 });
  for (const k in PIECES) CITY['n' + k] = PIECES[k].length;
}
export const STEAM = { color: new THREE.Color(0.62, 0.62, 0.62), opacity: 0.3 };
export const cityPut = put, cityRod = rod, cityAs = as, cityPick = pick, cityRand = R, cityRR = rr, CITY_COLOURS = { RUSTS, PAINTS, CLOTHS, BRIGHT, PALE, WOODS, DARK, AMBER, FUNGUS, wallCol, woodCol };

export function buildCity() {
  CITY.root = new THREE.Group(); G.scene.add(CITY.root);
  buildWalls(); buildStreets();
}
// after the landmarks have taken their ground (places.js), the ordinary town fills in round them
export function buildTown() { buildFrontage(); buildStreetEdge(); buildDistricts(); buildCables(); }
