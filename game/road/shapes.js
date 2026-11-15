// ============================================================
// Shapes for the land's scatter, made once and instanced many times:
// rocks with fractured faces and a dark, dusty foot; saltbush as a
// mound of silver-green clumps, darker inside; dead bushes and bleached
// dead trees, all forks and no leaves; spoil heaps cut by gullies and
// banded like the ground they came out of; and the mesas on the
// horizon, with a talus apron, cliffs stepped at the strata, and a
// caprock lip.
// ============================================================
import { THREE, TAU, lerp, smooth, rng, rodMX, planarUV, merge, SWAY } from './core.js';

const v = new THREE.Vector3();
// a cheap, smooth, repeatable 3D wobble
const wob = (x, y, z, s) => Math.sin(x * 1.7 + y * 2.3 + s) * Math.cos(z * 1.9 - x * 0.7 + s * 2.1) + 0.5 * Math.sin(y * 3.7 - z * 2.9 + s * 3.3);

// a rock: a lumpy ball, cut flat by a few fracture planes, with its foot dark where the dust and shade gather
export function rockGeometry(seed, detail = 2) {
  const R = rng(seed), g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  const cuts = [];
  for (let k = 0; k < 6; k++) { const a = R() * TAU, b = (R() - 0.3) * 1.4; cuts.push([new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)), 0.55 + R() * 0.3]); }
  const col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + wob(v.x, v.y, v.z, seed) * 0.16 + wob(v.x * 3, v.y * 3, v.z * 3, seed + 5) * 0.05);
    for (const [n, d] of cuts) { const o = v.dot(n) - d; if (o > 0) v.addScaledVector(n, -o); }       // fracture faces
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35;                                              // a flat bottom to sit on
    p.setXYZ(i, v.x, v.y, v.z);
    const foot = smooth(-0.35, 0.25, v.y), streak = 0.92 + 0.08 * Math.sin(v.x * 9 + v.z * 7 + seed);
    const k = (0.55 + 0.45 * foot) * streak; col.push(k, k * (0.97 + 0.03 * foot), k * (0.95 + 0.05 * foot));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return planarUV(g, 1.6);
}

// saltbush: a mound of small rounded clumps, shaded darker inside and underneath
export function bushGeometry(seed) {
  const R = rng(seed), parts = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + R() * 0.6, r = k === 0 ? 0 : 0.28 + R() * 0.2, y = (k === 0 ? 0.42 : 0.22 + R() * 0.2), s = k === 0 ? 0.42 : 0.24 + R() * 0.14;
    const b = new THREE.IcosahedronGeometry(1, k === 0 ? 1 : 0), bp = b.attributes.position, nn = b.attributes.normal, col = [];   // the heart rounder; the rest are seen smaller
    for (let i = 0; i < bp.count; i++) {
      v.fromBufferAttribute(bp, i); const nx = v.x, ny = v.y, nz = v.z;
      v.multiplyScalar(s * (1 + wob(nx * 2, ny * 2, nz * 2, seed + k) * 0.18));
      v.x += Math.cos(a) * r; v.z += Math.sin(a) * r; v.y += y;
      bp.setXYZ(i, v.x, v.y, v.z); nn.setXYZ(i, nx, ny, nz);                                   // soft, round shading
      const inner = smooth(0.0, 0.75, v.y) * (0.75 + 0.25 * smooth(0.1, 0.5, Math.hypot(v.x, v.z)));
      const t = 0.42 + 0.58 * inner; col.push(t * (0.95 + 0.1 * ny), t, t * (0.97 + 0.06 * ny));
    }
    b.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(b);
  }
  return joinColoured(parts);
}
// a dead bush: a few stems from the ground, each forking twice, nothing on them
export function deadBushGeometry(seed) {
  const R = rng(seed), parts = [];
  const branch = (x, y, z, dx, dy, dz, len, r, depth) => {
    const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
    parts.push([new THREE.CylinderGeometry(r * 0.55, r, 1, 4, 1, true), rodMX([x, y, z], [ex, ey, ez])]);
    if (depth <= 0) return;
    for (let k = 0; k < 2; k++) {
      const a = R() * TAU, sp = 0.45 + R() * 0.5;
      v.set(dx + Math.cos(a) * sp, dy * 0.75 + 0.25, dz + Math.sin(a) * sp).normalize();
      branch(ex, ey, ez, v.x, v.y, v.z, len * (0.6 + R() * 0.15), r * 0.6, depth - 1);
    }
  };
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + R(); v.set(Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5).normalize(); branch(0, 0, 0, v.x, v.y, v.z, 0.38 + R() * 0.2, 0.03, 2); }
  return merge(parts);
}
// a dead tree, bleached grey: a leaning trunk and a few bare limbs
export function snagGeometry(seed) {
  const R = rng(seed), parts = [];
  const lean = [(R() - 0.5) * 0.5, (R() - 0.5) * 0.5], H = 3.2 + R() * 1.6, top = [lean[0] * H * 0.3, H, lean[1] * H * 0.3];
  parts.push([new THREE.CylinderGeometry(0.11, 0.2, 1, 7, 1, true), rodMX([0, -0.2, 0], top)]);
  const limb = (from, dir, len, r, depth) => {
    const to = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len];
    parts.push([new THREE.CylinderGeometry(r * 0.5, r, 1, 5, 1, true), rodMX(from, to)]);
    if (depth > 0) for (let k = 0; k < 2; k++) { const a = R() * TAU; v.set(dir[0] + Math.cos(a) * 0.6, dir[1] * 0.7 + 0.2, dir[2] + Math.sin(a) * 0.6).normalize(); limb(to, [v.x, v.y, v.z], len * 0.6, r * 0.6, depth - 1); }
  };
  for (let k = 0; k < 4; k++) {
    const t = 0.45 + k * 0.15, a = k * 2.2 + R(), from = [top[0] * t, H * t, top[2] * t];
    v.set(Math.cos(a), 0.55 + R() * 0.5, Math.sin(a)).normalize();
    limb(from, [v.x, v.y, v.z], 1.1 + R() * 0.9, 0.08, k < 2 ? 2 : 1);
  }
  return merge(parts);
}
// a spoil heap: a blunt cone, gullied, in pale bands of whatever the mine dug through
export function spoilGeometry(seed) {
  const g = new THREE.ConeGeometry(1, 1, 28, 7), p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), t = v.y + 0.5, r = Math.hypot(v.x, v.z);
    const gully = 1 + 0.1 * Math.sin(a * 6 + seed) + 0.06 * Math.sin(a * 13 + seed * 2) - 0.08 * Math.max(0, Math.sin(a * 9 + seed * 3)) * t;
    const y = Math.min(t, 0.82) - 0.5;                                                        // blunt, flat-topped, like a tipped load
    const rr = r * gully; p.setXYZ(i, Math.cos(a) * rr, y, Math.sin(a) * rr);
    // bands of what the mine dug through: grey rock, ochre, the red overburden on top
    // tints over the dirt texture: greyer bands of rock, ochre ones, the red overburden on top
    const band = 0.5 + 0.5 * Math.sin(t * 9 + Math.sin(a * 2 + seed) * 0.8), top = smooth(0.55, 0.85, t), k = 0.85 + 0.2 * band;
    col.push(lerp(lerp(0.85, 1.15, band), 1, top) * k, lerp(lerp(0.95, 1.0, band), 1, top) * k, lerp(lerp(1.15, 0.75, band), 1, top) * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return planarUV(g, 2);
}
// a mesa: a talus apron, cliffs with ledges where the strata stand proud, and a caprock lip
export function mesaGeometry(rad, ht, seed, colourAt) {
  const SEG = 44, RINGS = 14, pos = [], col = [], idx = [], c = new THREE.Color();
  const profile = (t) => t < 0.3 ? lerp(1.5, 1.0, smooth(0, 0.3, t)) : t < 0.9 ? 1.0 - 0.05 * (t - 0.3) + 0.025 * Math.round(Math.sin(t * 31 + seed) * 1.2) : t < 0.97 ? 1.02 : 0.99;
  for (let j = 0; j <= RINGS; j++) {
    const t = j / RINGS, y = t * ht;
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * TAU, w = 1 + 0.13 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 7 + seed * 2) + 0.035 * Math.sin(a * 17 + seed * 3);
      const r = rad * w * profile(t) * (t < 0.3 ? 1 + 0.06 * Math.sin(a * 23 + seed) : 1);
      pos.push(Math.cos(a) * r, y - 4, Math.sin(a) * r);
      colourAt(y, a * rad, c); const shade = t < 0.3 ? 0.85 + 0.15 * t / 0.3 : 1;
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) { const a = j * (SEG + 1) + i, b = a + 1, cc = a + SEG + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }   // wound to face outwards
  // the top: a slightly domed cap
  const top = pos.length / 3; pos.push(0, ht - 4 + ht * 0.02, 0); colourAt(ht, 0, c); col.push(c.r, c.g, c.b);
  const ring = RINGS * (SEG + 1);
  for (let i = 0; i < SEG; i++) idx.push(top, ring + i + 1, ring + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// coloured parts into one geometry (merge() in core.js keeps no colours); indexed parts are unrolled first
export function joinColoured(list) {
  list = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}
// the bushes stir in the wind: the tops more than the base
export function swayPatch(mat, key, amount = 1) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: SWAY.uTime, uWind: SWAY.uWind });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        { vec2 ip = instanceMatrix[3].xz; float k = clamp(position.y, 0.0, 1.2); k *= k;
          float w = sin(uTime * (1.3 + uWind.z) + ip.x * 0.37 + ip.y * 0.29) * 0.5 + 0.5;
          transformed.xz += vec2(uWind.x, uWind.y) * (0.015 + 0.05 * uWind.z) * (0.6 + 0.8 * w) * k * ${amount.toFixed(2)}; }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'sway-' + key;
  return mat;
}
