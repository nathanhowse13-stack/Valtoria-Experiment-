// ============================================================
// The people of Bleak Flats.
//
// "The street level was a churning river of biology and machinery,
// without a single relaxed face among them." Rat-kin scurrying round a
// refuse pile, their fur matted with grease and their pink tails
// twitching; a chitin-born merchant with a hard, iridescent carapace
// waving a skewer of grubs; steamforged sentries venting steam from
// their shoulder-stacks; the feralis running the streets as
// mercenaries (Cogswell's lupari, the Wolf-Guard); suini, huge and
// scarred from the crushers; and every one of them staring at the pale
// one going by. Grumm at his corner table in the Cog. Scrimp at his
// stall. Steamforged backing into the scour-brush, scrubbing off the
// rust-rot. (Chapter Two: the castes, the scenes and the words.)
//
// Each caste is a handful of simple shapes, instanced: a body, two
// legs, two arms, posed every frame (walking, standing, sitting,
// working, scrubbing), so a hundred and more people cost a few dozen
// draws. They step out of the tractor's way. What they say beyond the
// chapter's words, and who stands where, is this sketch's
// (Experimental).
// ============================================================
import { THREE, TAU, clamp, lerp, rng, G, S, P, addThing, hooks, once, MX, rodMX, CH2, NEW } from '../road/core.js';
import { h } from '../road/land.js';
import { joinColoured } from '../road/shapes.js';
import { FX } from '../road/air.js';
import { sfx, spot } from '../road/sound.js';
import { SITE, ARTERY_HALF, NORTH, GATE_AT, LANES, arteryX } from './plan.js';
import { CITY } from './build.js';
import { PLACES } from './places.js';

const C2 = ['C', CH2], X = (why) => ['X', why ? why + ': ' + NEW : NEW];
const R = rng(1313), rr = (a, b) => a + (b - a) * R(), pick = (a) => a[Math.floor(R() * a.length)];
const say = (who, text, prov, role, ms = 4200) => hooks.caption && hooks.caption(who, text, prov, role, ms);

// ---------- the bodies: simple shapes, painted, joined; the figure faces +z, its feet at the origin ----------
function painted(geo, col, m) {
  geo = (geo.index ? geo.toNonIndexed() : geo); if (m) geo.applyMatrix4(m);
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), lin = col.map(v => Math.pow(v, 2.2));   // the colours above are as they'd be painted (sRGB): the renderer wants them linear
  for (let i = 0; i < n; i++) c.set(lin, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
const join = (list) => joinColoured(list.map(([g, c, m]) => painted(g, c, m)));
const box = (w, hh, d) => new THREE.BoxGeometry(w, hh, d), cyl = (r0, r1, hh, n = 8) => new THREE.CylinderGeometry(r1, r0, hh, n);
const sph = (r, a = 8, b = 6) => new THREE.SphereGeometry(r, a, b), cone = (r, hh, n = 6) => new THREE.ConeGeometry(r, hh, n);
const both = (fn) => [fn(-1), fn(1)];
const rodG = (A, B, r0, r1, col) => [new THREE.CylinderGeometry(r1, r0, 1, 5), col, rodMX(A, B)];
// colours
const GREASE = [0.34, 0.29, 0.25], COAT = [0.42, 0.34, 0.26], FURG = [0.5, 0.45, 0.41], PINK = [0.86, 0.56, 0.54], BLACK = [0.05, 0.04, 0.04];
const SHELL = [0.16, 0.3, 0.32], SHELL2 = [0.1, 0.18, 0.2], EYE = [0.32, 0.05, 0.04], IRON = [0.42, 0.4, 0.38], IRON2 = [0.3, 0.29, 0.28], RUSTC = [0.66, 0.36, 0.2], VISOR = [1.0, 0.82, 0.46];
const SKIN = [0.64, 0.52, 0.5], SKIN2 = [0.56, 0.45, 0.43], APRON = [0.3, 0.2, 0.14], TUSK = [0.86, 0.8, 0.62], FUR = [0.3, 0.27, 0.25], LEATHER = [0.32, 0.22, 0.16], ARMOUR = [0.36, 0.36, 0.36];
const GREY = [0.55, 0.56, 0.57], SLIT = [0.9, 0.08, 0.04];

const CASTES = {
  // rat-kin: small, hunched, a coat of many pockets, a pink tail
  ratkin: { name: 'A rat-kin', hip: 0.44, hipW: 0.085, sh: [0.19, 0.9, 0.1], speed: [1.1, 1.7], stride: 7.5, seat: 0.46, mat: { roughness: 0.95 }, voice: 'ratkin',
    tints: [[1, 1, 1], [0.78, 0.74, 0.7], [1.12, 1.0, 0.86], [0.72, 0.74, 0.8], [0.92, 0.8, 0.62]],
    body: () => join([
      [cyl(0.25, 0.15, 0.52, 9), GREASE, MX(0, 0.68, -0.02, 0.22, 0, 0)], [box(0.34, 0.3, 0.26), COAT, MX(0, 0.9, 0.06, 0.45, 0, 0)],
      ...[[-0.1, 0.62], [0.11, 0.7], [-0.08, 0.8], [0.12, 0.54]].map(([x, y]) => [box(0.09, 0.08, 0.04), [0.3, 0.24, 0.2], MX(x, y, 0.2 - (y - 0.5) * 0.3, 0.2, 0, 0)]),   // the pockets
      [sph(0.12), FURG, MX(0, 1.04, 0.2, 0, 0, 0, 1, 0.92, 1.25)], [cone(0.065, 0.2, 6), FURG, MX(0, 1.02, 0.36, Math.PI / 2, 0, 0)], [sph(0.025, 5, 4), BLACK, MX(0, 1.03, 0.46)],
      ...both(e => [cyl(0.075, 0.075, 0.025, 10), PINK, MX(e * 0.1, 1.15, 0.14, 1.3, 0, e * 0.4)]), ...both(e => [sph(0.022, 5, 4), BLACK, MX(e * 0.055, 1.08, 0.31)]),
      rodG([0, 0.5, -0.18], [0, 0.36, -0.42], 0.035, 0.03, PINK), rodG([0, 0.36, -0.42], [0.05, 0.16, -0.58], 0.03, 0.022, PINK), rodG([0.05, 0.16, -0.58], [0.12, 0.04, -0.8], 0.022, 0.012, PINK),
    ]),
    leg: () => join([[box(0.075, 0.44, 0.075), FURG, MX(0, -0.22, 0)], [box(0.09, 0.04, 0.18), PINK, MX(0, -0.42, 0.06)]]),
    arm: () => join([[box(0.055, 0.34, 0.055), GREASE, MX(0, -0.17, 0)], [box(0.06, 0.06, 0.08), PINK, MX(0, -0.36, 0.02)]]) },
  // chitin-born: beetle-like, the carapace hard and iridescent, arms with too many joints
  chitin: { name: 'A chitin-born', hip: 0.86, hipW: 0.1, sh: [0.25, 1.4, 0], speed: [0.9, 1.3], stride: 5.6, seat: 0.5, mat: { roughness: 0.3, metalness: 0.6 }, voice: 'chitin',
    tints: [[1, 1, 1], [0.7, 1.0, 1.15], [1.15, 0.85, 1.2], [0.8, 1.15, 0.75], [1.2, 1.05, 0.7]],
    body: () => join([
      [box(0.38, 0.58, 0.26), SHELL, MX(0, 1.16, 0)], [sph(0.3, 10, 8), SHELL2, MX(0, 1.2, -0.12, 0, 0, 0, 1.05, 1.35, 0.7)], [box(0.3, 0.3, 0.22), SHELL, MX(0, 0.8, 0)],
      [sph(0.15, 8, 6), SHELL, MX(0, 1.6, 0.04, 0, 0, 0, 1, 1.2, 1.1)], ...both(e => [sph(0.06, 6, 5), EYE, MX(e * 0.09, 1.63, 0.15)]),
      ...both(e => [cone(0.03, 0.12, 4), SHELL2, MX(e * 0.05, 1.48, 0.17, 2.2, 0, e * 0.4)]), ...both(e => [cyl(0.008, 0.008, 0.4, 4), SHELL2, MX(e * 0.06, 1.85, 0.12, -0.4, 0, e * 0.3)]),
      ...both(e => [box(0.04, 0.3, 0.04), SHELL2, MX(e * 0.2, 1.05, 0.12, -0.9, 0, 0)]),          // the small second pair of arms, folded
    ]),
    leg: () => join([[box(0.06, 0.46, 0.06), SHELL2, MX(0, -0.22, 0.03, 0.15, 0, 0)], [box(0.055, 0.44, 0.055), SHELL2, MX(0, -0.64, 0.04, -0.12, 0, 0)], [box(0.08, 0.04, 0.16), SHELL, MX(0, -0.85, 0.06)]]),
    arm: () => join([[box(0.05, 0.36, 0.05), SHELL2, MX(0, -0.18, 0)], [box(0.045, 0.34, 0.045), SHELL2, MX(0, -0.5, 0.06, -0.35, 0, 0)], [cone(0.03, 0.12, 4), SHELL, MX(0, -0.72, 0.1, Math.PI, 0, 0)]]) },
  // steamforged: the builders, owned by the fuel they burn; shoulder-stacks, a boiler on the back, rust where they've felt too much
  steam: { name: 'A steamforged', hip: 1.02, hipW: 0.2, sh: [0.44, 1.75, 0], speed: [0.7, 1.0], stride: 4.2, seat: 0.55, scale: [1, 1.12], mat: { roughness: 0.55, metalness: 0.6 }, voice: 'steamforged',
    tints: [[1, 1, 1], [1.1, 0.95, 0.85], [0.85, 0.86, 0.92], [1.15, 0.9, 0.7]],
    body: () => join([
      [box(0.72, 0.78, 0.46), IRON, MX(0, 1.45, 0)], [box(0.6, 0.28, 0.4), IRON2, MX(0, 1.0, 0)], [box(0.46, 0.34, 0.08), RUSTC, MX(0.06, 1.5, 0.24)],
      [box(0.28, 0.32, 0.3), IRON, MX(0, 2.0, 0.02)], [box(0.22, 0.05, 0.02), VISOR, MX(0, 2.03, 0.175)],
      ...both(e => [cyl(0.08, 0.08, 0.42, 8), IRON2, MX(e * 0.24, 1.98, -0.16)]), ...both(e => [box(0.2, 0.18, 0.5), IRON2, MX(e * 0.42, 1.78, 0)]), [box(0.5, 0.5, 0.18), IRON2, MX(0, 1.5, -0.3)],
    ]),
    leg: () => join([[box(0.2, 0.52, 0.22), IRON2, MX(0, -0.26, 0)], [box(0.16, 0.5, 0.18), IRON, MX(0, -0.74, 0)], [box(0.24, 0.1, 0.34), IRON2, MX(0, -0.97, 0.06)]]),
    arm: () => join([[box(0.16, 0.42, 0.16), IRON, MX(0, -0.21, 0)], [box(0.14, 0.4, 0.14), IRON2, MX(0, -0.62, 0)], [box(0.16, 0.16, 0.12), IRON, MX(0, -0.88, 0)], ...[-0.04, 0.04].map(o => [cone(0.025, 0.14, 4), IRON2, MX(o, -1.02, 0.02, Math.PI, 0, 0)])]) },
  // suini: servilis porcine, a mountain of muscle, fat and coarse bristle; tusks; a leather apron from the crushers
  suini: { name: 'A suini', hip: 0.78, hipW: 0.2, sh: [0.48, 1.52, 0.05], speed: [0.75, 1.0], stride: 4.6, seat: 0.55, scale: [1.02, 1.18], mat: { roughness: 0.85 }, voice: 'suini',
    tints: [[1, 1, 1], [1.05, 0.9, 0.9], [0.86, 0.83, 0.82], [1.1, 1.0, 0.95]],
    body: () => join([
      [sph(0.5, 12, 9), SKIN, MX(0, 1.22, 0.02, 0, 0, 0, 1.0, 0.95, 0.82)], [box(0.62, 0.62, 0.06), APRON, MX(0, 1.0, 0.4, 0.12, 0, 0)],
      [sph(0.24, 10, 8), SKIN, MX(0, 1.78, 0.16, 0, 0, 0, 1, 0.9, 1.0)], [cyl(0.1, 0.11, 0.16, 10), SKIN2, MX(0, 1.72, 0.38, Math.PI / 2, 0, 0)],
      ...both(e => [cone(0.025, 0.12, 5), TUSK, MX(e * 0.08, 1.68, 0.42, -0.3, 0, e * 0.2)]), ...both(e => [cone(0.07, 0.14, 4), SKIN2, MX(e * 0.15, 1.97, 0.1, -0.3, 0, e * 0.6)]),
      ...both(e => [sph(0.022, 5, 4), BLACK, MX(e * 0.08, 1.85, 0.36)]),
    ]),
    leg: () => join([[cyl(0.13, 0.15, 0.44, 8), APRON, MX(0, -0.22, 0)], [cyl(0.11, 0.12, 0.36, 8), SKIN2, MX(0, -0.58, 0)], [box(0.2, 0.08, 0.26), [0.16, 0.12, 0.1], MX(0, -0.75, 0.05)]]),
    arm: () => join([[cyl(0.11, 0.13, 0.4, 8), SKIN, MX(0, -0.2, 0)], [cyl(0.09, 0.1, 0.38, 8), SKIN, MX(0, -0.58, 0)], [sph(0.1, 6, 5), SKIN2, MX(0, -0.8, 0)]]) },
  // lupari: the Wolf-Guard, Cogswell's mutts; lean, iron over leather, a rifle slung
  lupari: { name: 'A lupari', hip: 0.96, hipW: 0.12, sh: [0.28, 1.5, 0], speed: [1.0, 1.35], stride: 5.2, seat: 0.5, mat: { roughness: 0.8 }, voice: 'lupari',
    tints: [[1, 1, 1], [0.8, 0.8, 0.86], [1.1, 1.0, 0.9], [0.66, 0.63, 0.6]],
    body: () => join([
      [box(0.46, 0.6, 0.28), LEATHER, MX(0, 1.3, 0)], [box(0.5, 0.3, 0.32), ARMOUR, MX(0, 1.45, 0.02)], [box(0.4, 0.22, 0.26), LEATHER, MX(0, 0.98, 0)],
      [box(0.22, 0.24, 0.26), FUR, MX(0, 1.8, 0.02)], [box(0.12, 0.11, 0.24), FUR, MX(0, 1.75, 0.2)], [box(0.05, 0.04, 0.05), BLACK, MX(0, 1.79, 0.33)],
      ...both(e => [cone(0.06, 0.16, 4), FUR, MX(e * 0.08, 2.0, -0.02, 0, Math.PI / 4, e * 0.15)]), ...both(e => [sph(0.02, 5, 4), [0.8, 0.6, 0.1], MX(e * 0.06, 1.85, 0.15)]),
      [cone(0.08, 0.5, 6), FUR, MX(0, 0.88, -0.24, -2.5, 0, 0)], [box(0.06, 1.2, 0.06), [0.2, 0.2, 0.2], MX(0.22, 1.45, -0.2, 0.1, 0, 0.3)],
    ]),
    leg: () => join([[box(0.12, 0.5, 0.13), LEATHER, MX(0, -0.25, 0)], [box(0.1, 0.46, 0.11), FUR, MX(0, -0.72, -0.03, 0.18, 0, 0)], [box(0.12, 0.07, 0.24), [0.18, 0.14, 0.12], MX(0, -0.93, 0.06)]]),
    arm: () => join([[box(0.1, 0.38, 0.1), LEATHER, MX(0, -0.19, 0)], [box(0.09, 0.34, 0.09), FUR, MX(0, -0.54, 0)], [box(0.1, 0.1, 0.1), FUR, MX(0, -0.74, 0.02)]]) },
  // Ironshells: the walls that learned to stand up; the town's police, grey and rusting
  shell: { name: 'An Ironshell', hip: 1.05, hipW: 0.24, sh: [0.6, 1.95, 0], speed: [0.55, 0.75], stride: 3.6, seat: 0.6, mat: { roughness: 0.6, metalness: 0.5 }, voice: 'ironshell',
    tints: [[1, 1, 1], [0.92, 0.9, 0.88]],
    body: () => join([
      [box(1.0, 0.36, 0.62), GREY, MX(0, 1.2, 0)], [box(1.16, 0.95, 0.78), GREY, MX(0, 1.86, 0)], [box(0.9, 0.5, 0.1), IRON, MX(0, 1.98, 0.42)], [box(0.5, 0.2, 0.1), RUSTC, MX(-0.16, 1.6, 0.42)],
      [box(0.62, 0.5, 0.6), GREY, MX(0, 2.55, 0.02)], [box(0.48, 0.06, 0.04), SLIT, MX(0, 2.58, 0.33)], [box(1.0, 0.6, 0.3), IRON, MX(0, 1.88, -0.5)],
    ]),
    leg: () => join([[box(0.36, 0.55, 0.4), GREY, MX(0, -0.27, 0)], [box(0.4, 0.3, 0.44), RUSTC, MX(0, -0.72, 0)], [box(0.44, 0.14, 0.62), GREY, MX(0, -0.98, 0.06)]]),
    arm: () => join([[box(0.3, 0.5, 0.3), GREY, MX(0, -0.25, 0)], [box(0.34, 0.5, 0.34), GREY, MX(0, -0.75, 0)], [box(0.3, 0.2, 0.3), IRON, MX(0, -1.05, 0)]]) },
};
const WALKERS = [['ratkin', 26], ['chitin', 18], ['steam', 22], ['suini', 15], ['lupari', 10], ['shell', 3]];
const pickCaste = () => { let r = R() * 94; for (const [k, w] of WALKERS) if ((r -= w) <= 0) return k; return 'ratkin'; };

// ---------- the people ----------
export const FOLK = { list: [], mesh: {}, chatter: 30, scenes: {} };
function person(caste, x, z, yaw, mode, o = {}) {
  const c = CASTES[caste], f = { caste, x, z, yaw, mode, y: h(x, z), s: o.s || rr(...(c.scale || [0.94, 1.06])), tint: o.tint || pick(c.tints), ph: R() * TAU, amp: 0, t: R() * 10, pause: 0, home: [x, z], homeYaw: yaw, look: 0, puff: rr(3, 12), ...o };
  f.speed = o.speed || rr(...c.speed);
  FOLK.list.push(f); return f;
}
const onArtery = (f) => { f.x = arteryX(f.z) + f.ox; };

function buildCrowd() {
  const cog = PLACES.cog;
  // the Artery: both ways along each side, nearer the fronts than the middle, where the traffic goes
  for (let k = 0; k < 52; k++) {
    const z = rr(GATE_AT.z + 14, NORTH - 30), side = R() < 0.5 ? -1 : 1, f = person(pickCaste(), 0, z, 0, 'walk', { path: 'artery', dir: R() < 0.5 ? -1 : 1, ox: side * rr(ARTERY_HALF - 2.6, ARTERY_HALF - 1.0) });
    f.ox0 = f.ox; onArtery(f); f.y = h(f.x, f.z);
  }
  // the side roads
  for (const l of LANES) for (let k = 0; k < 2; k++) { const x = rr(l.x0 + 3, l.x1 - 3); if (Math.abs(x - arteryX(l.z)) < ARTERY_HALF + 2) continue; person(pickCaste(), x, l.z + rr(-1.4, 1.4), 0, 'walk', { path: 'lane', x0: l.x0 + 2, x1: l.x1 - 2, dir: R() < 0.5 ? -1 : 1, lz: l.z + rr(-1.4, 1.4) }); }
  // the markets: a keeper behind most stalls, a customer at some, and people drifting along the aisles
  for (const st of PLACES.stalls) {
    if (R() < 0.85) { const [kx, kz] = st.keeper; person(st.kind === 'salvage' ? (R() < 0.7 ? 'ratkin' : 'chitin') : pickCaste(), kx, kz, st.yaw, st.ground ? 'sit' : 'stand', { seatH: st.ground ? 0.42 : 0 }); }
    if (R() < 0.42) { const [cx, cz] = st.customer; person(pickCaste(), cx, cz, st.yaw + Math.PI + rr(-0.3, 0.3), 'stand'); }
  }
  for (const a of PLACES.aisles) for (let k = 0; k < 3; k++) person(pickCaste(), rr(a.x0, a.x1), a.z + rr(-0.8, 0.8), 0, 'walk', { path: 'aisle', x0: a.x0, x1: a.x1, dir: R() < 0.5 ? -1 : 1, lz: a.z + rr(-0.8, 0.8) });
  // Water Square: a queue at the tap, and an Ironshell watching it
  if (PLACES.tap) { const t = PLACES.tap; for (let k = 0; k < 7; k++) person(k % 3 === 2 ? 'suini' : pickCaste(), t.x + 0.6 + k * 1.05, t.z + rr(-0.25, 0.25), -Math.PI / 2 + rr(-0.2, 0.2), 'stand', { fidget: 1 }); person('shell', t.x + 3, t.z + 3.4, Math.PI, 'stand', { s: 1.05 }); }
  // the gate yard: a pack of rat-kin round the refuse pile, one of them arguing with a chitin-born selling grubs; Ironshells by the gate
  if (PLACES.refuse) {
    const r = PLACES.refuse;
    for (let k = 0; k < 4; k++) person('ratkin', r.x, r.z, 0, 'scurry', { cx: r.x, cz: r.z, rad: rr(2.6, 3.6), ang: R() * TAU, speed: rr(1.3, 2.0) * (R() < 0.5 ? 1 : -1) });
    const a = person('ratkin', r.x - 3.8, r.z + 0.4, -Math.PI / 2, 'argue', { tint: [1.1, 0.95, 0.85] }), b = person('chitin', r.x - 5.4, r.z + 0.4, Math.PI / 2, 'argue', { tint: [0.9, 1.1, 1.0] });
    a.partner = b; b.partner = a; FOLK.scenes.argue = { x: r.x - 4.6, z: r.z + 0.4 };
    person('steam', -9, 1866, Math.PI / 2, 'stand', { sentry: true });                                   // a steamforged sentry, at the edge of the yard
  }
  for (const e of [-1, 1]) person('shell', e * 7.5, GATE_AT.z + 6, e > 0 ? -Math.PI / 2 : Math.PI / 2, 'stand', { s: 1.05 });
  // the Cog: steamforged backing into the scour-brush; Grumm in the corner; the barkeep; the drinkers
  if (cog && PLACES.hedge) {
    const hz = cog.cz;
    [[hz - 6.5, true], [hz - 4.2, false], [hz + 5.0, false]].forEach(([z, unit7], i) => person('steam', PLACES.hedge.x - 0.35, z, Math.PI / 2, 'scrub', { unit7, tint: unit7 ? [1.25, 0.82, 0.6] : pick(CASTES.steam.tints), t: i * 1.3 }));
    FOLK.scenes.hedge = { x: PLACES.hedge.x, z: hz - 5.4 };
  }
  if (PLACES.grumm) { const g = PLACES.grumm; FOLK.grumm = person('suini', g.x, g.z, 0, 'sit', { s: 1.22, seatH: 0.6, tint: [0.95, 0.88, 0.88], y: g.y }); }
  if (PLACES.bar) { const b = PLACES.bar; person('chitin', b.x, b.z + 1.5, Math.PI / 2, 'stand', { y: b.y, polish: 1 }); for (let k = 0; k < 3; k++) person(pickCaste(), b.stool, b.z - 4 + k * 2.8, -Math.PI / 2, 'sit', { y: b.y, seatH: 0.84 }); }
  for (const t of PLACES.tables) { if (R() < 0.3) continue; const n = R() < 0.4 ? 2 : 1; for (let k = 0; k < n; k++) { const a = k * 2.1 + t.x * 3; person(pickCaste(), t.x + Math.cos(a) * 1.0, t.z + Math.sin(a) * 1.0, Math.atan2(-Math.cos(a), -Math.sin(a)), 'sit', { y: t.y, seatH: 0.5 }); } }
  // the sheriff's: Wolf-Guard at the trough, an Ironshell at the door
  if (PLACES.trough) { const t = PLACES.trough; for (const e of [-1, 1]) person('lupari', t.x + 1.1, t.z + e * 0.9, -Math.PI / 2 + e * 0.25, 'stand', { guard: true }); FOLK.scenes.trough = { x: t.x, z: t.z }; }
  if (PLACES.door) { const d = PLACES.door; person('shell', d.x + 0.6, d.z - 1.6, Math.PI / 2, 'stand', { s: 1.08 }); }
  // Scrimp, at his table of junk
  if (PLACES.scrimp) { const s = PLACES.scrimp; FOLK.scrimp = person('ratkin', s.x, s.z, s.yaw, 'stand', { s: 1.05, fidget: 2, tint: [0.95, 0.9, 0.85] }); }
  // the works: steamforged at the stamp-mills and the Bones, shovelling
  const st = SITE.stamps; person('steam', st.x - 3.2, st.z + 4.6, Math.PI / 2, 'work'); person('steam', st.x - 2.6, st.z - 2.8, Math.PI / 2 + 0.4, 'work', { t: 1.4 }); person('suini', st.x - 6.4, st.z - 0.5, Math.PI / 2, 'work', { t: 0.6 });
  for (const [bx, bz] of SITE.bones) { const a = R() * TAU; person('steam', bx + Math.cos(a) * 4, bz + Math.sin(a) * 4, Math.atan2(-Math.cos(a), -Math.sin(a)), 'work', { t: R() * 3 }); }
  for (let k = 0; k < 4; k++) { const z = rr(2268, NORTH - 8), x = rr(-40, 60); if (Math.abs(x - arteryX(z)) < ARTERY_HALF + 1) continue; person(R() < 0.7 ? 'steam' : 'suini', x, z, 0, 'walk', { path: 'lane', x0: -40, x1: 60, dir: R() < 0.5 ? -1 : 1, lz: z }); }
}

// ---------- drawing them: per caste, a body, two legs, two arms ----------
function buildMeshes() {
  const by = {};
  FOLK.list.forEach((f) => { (by[f.caste] = by[f.caste] || []).push(f); });
  const col = new THREE.Color();
  for (const caste in by) {
    const c = CASTES[caste], list = by[caste], n = list.length, mat = new THREE.MeshStandardMaterial({ vertexColors: true, ...c.mat }); CITY.mats.push(mat);
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); CITY.root.add(im); return im; };
    const leg = c.leg(), arm = c.arm(), m = { body: mk(c.body()), legL: mk(leg), legR: mk(leg), armL: mk(arm), armR: mk(arm) };
    list.forEach((f, i) => { f.i = i; for (const k in m) m[k].setColorAt(i, col.setRGB(...f.tint)); });
    FOLK.mesh[caste] = m;
  }
  for (const f of FOLK.list) pose(f, 0, true);
  for (const k in FOLK.mesh) for (const p of Object.values(FOLK.mesh[k])) { p.instanceMatrix.needsUpdate = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; }
}

const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _o = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function pose(f, dt, init = false) {
  const c = CASTES[f.caste], m = FOLK.mesh[f.caste]; if (!m) return;
  const walking = f.mode === 'walk' || f.mode === 'scurry';
  let lean = 0, roll = 0, legA = 0, armA = 0, armB = null, legB = null, yOff = 0, fx = 0, fz = 0;
  const sw = Math.sin(f.ph);
  if (walking) { legA = sw * 0.55 * f.amp; armA = -sw * 0.45 * f.amp; yOff = Math.abs(Math.cos(f.ph)) * 0.04 * f.amp; lean = 0.06 * f.amp + (f.caste === 'ratkin' ? 0.12 : 0); }
  else if (f.mode === 'sit') { yOff = (f.seatH || c.seat) - c.hip; legA = 1.45; legB = 1.45; armA = 0.55; armB = 0.5 + Math.sin(f.t * 0.7) * 0.06; }
  else if (f.mode === 'work') { const w = Math.sin(f.t * 2.2); lean = 0.45 + w * 0.3; armA = 0.7 + w * 0.6; armB = armA; legA = 0.15; legB = -0.15; yOff = -0.05 - Math.max(0, w) * 0.06; }
  else if (f.mode === 'scrub') { const w = Math.sin(f.t * 5.2); fx = -Math.sin(f.yaw) * (0.07 + w * 0.07); fz = -Math.cos(f.yaw) * (0.07 + w * 0.07); roll = Math.sin(f.t * 2.6) * 0.06; lean = -0.05; armA = 0.3; armB = 0.3; legA = 0.12; legB = -0.12; }
  else if (f.mode === 'argue') { armA = 0; armB = 1.3 + Math.sin(f.t * 5.5) * 0.45; lean = 0.08 + Math.sin(f.t * 3.1) * 0.04; yOff = Math.max(0, Math.sin(f.t * 5.5)) * 0.02; }
  else { lean = (f.caste === 'ratkin' ? 0.1 : 0) + Math.sin(f.t * 0.6) * 0.012; roll = Math.sin(f.t * 0.45 + f.ph) * 0.02; if (f.polish) { armB = 1.0 + Math.sin(f.t * 3) * 0.2; } if (f.guard) armB = 0.2; }
  _m.compose(_p.set(f.x + fx, (f.y ?? 0) + yOff * f.s, f.z + fz), _q.setFromEuler(_e.set(lean, f.yaw, roll, 'YXZ')), _s.set(f.s, f.s, f.s));
  m.body.setMatrixAt(f.i, _m);
  for (const side of [-1, 1]) {
    const a = side < 0 ? legA : (legB ?? -legA);
    _l.makeRotationX(-a).setPosition(side * c.hipW, c.hip, 0); _o.multiplyMatrices(_m, _l); (side < 0 ? m.legL : m.legR).setMatrixAt(f.i, _o);
    const b = side < 0 ? armA : (armB ?? -armA);
    _l.makeRotationX(-b); _l.setPosition(side * c.sh[0], c.sh[1], c.sh[2]); _o.multiplyMatrices(_m, _l); (side < 0 ? m.armL : m.armR).setMatrixAt(f.i, _o);
  }
  f.dirty = true;
}

// ---------- the town's talk: the chapter's scenes when he comes close, and now and then what somebody says going by ----------
const TALK = {
  ratkin: ['Mine. Mine! Found it first.', 'Bolts! Two for a bit, three for a bit and a half!', 'Don’t look at the pale one. Don’t.', 'Smells like sulphur. Smells like sickness.'],
  chitin: ['Grubs, hot grubs! No parasites!', 'Chitin polish, fresh tin of it!', 'Mind the shell, flesh.'],
  steam: ['Shift change in four minutes. Proceed.', 'Output does not match intake. Rations reduced.', 'Do not feel. Do not feel.'],
  suini: ['Mind your feet, little one.', 'Foreman cut the rations again.', 'Back to the crushers.'],
  lupari: ['Public Safety. Move along.', 'Smell that? Blood-drinker.', 'Cogswell wants his money.'],
  shell: ['Keep moving, flesh citizen.', 'Air quality index: unideal.'],
};
const GRUMM = [
  'You look like a dried-out husk, Jacob. Sun get to you? Or did you just forget to eat again?',
  'Eat. You are too skinny. Even a vampiris needs meat. You look like you would blow away in a dust storm.',
  'I saw you come in. You got the milk? … That is light, Jacob. Even for you. Cogswell is not going to like it. He has been in a mood. A ‘liquidate your assets’ kind of mood.',
  'His lupari mutts, the Wolf-Guard, they have been sniffing around. Land seizures. ‘Public Safety,’ they call it. If you go into that office and you do not have the coin… Cogswell might just whistle for the dogs.',
  'Just… watch your neck in there. Cogswell bites hard for a clunker. And if things go sideways… come out the back way. I left the kitchen door unlatched.',
  'Get out of here. Go fight your dragon. I must finish this swill before it curdles.',
];
function buildTalk() {
  if (FOLK.grumm) {
    const g = FOLK.grumm;
    addThing({ id: 'grumm', name: 'Grumm', verb: 'Sit with him', x: g.x + 1.2, y: g.y + 1.2, z: g.z + 0.9, r: 2.0, prov: C2, use: () => {
      const n = S.flags.grummTalk || 0; say('Grumm', GRUMM[Math.min(n, GRUMM.length - 1)], C2, 'suini', 6500);
      S.flags.grummTalk = n + 1; if (n >= 4) S.flags.grumm = true;
      if (n === 0) setTimeout(() => hooks.bark('Good to see you too, Grumm.', C2), 6800);
    } });
  }
  if (FOLK.scrimp) addThing({ id: 'scrimp:who', name: 'Scrimp', verb: 'Talk', x: FOLK.scrimp.x - 0.4, y: FOLK.scrimp.y + 1, z: FOLK.scrimp.z, r: 1.6, prov: C2, use: () => say('Scrimp', S.flags.intakeValve ? 'You are reckless, Jacob. Consuming resources. Burning fuel. The great empty is coming. You should save. Save everything.' : 'Jacob! Jacob! You look… pale. Paler. Sun is eating you, yes?', C2, 'ratkin') });
  if (FOLK.scenes.hedge) addThing({ id: 'unit7', name: 'Unit 7', verb: 'Watch', x: FOLK.scenes.hedge.x + 1.4, y: 1.5 + (PLACES.cog ? PLACES.cog.y : 0), z: FOLK.scenes.hedge.z, r: 2.2, prov: C2, use: unit7 });
}
function unit7() {
  say('Unit 7', 'It won’t come off. I felt… I felt too much yesterday. The foreman shouted. I felt shame. Now the rust is here. It eats! It eats!', C2, 'steamforged', 6000);
  setTimeout(() => say('A steamforged', 'Calm down, Unit 7. Emotion is oxidation. Purge the data. Scrub the shell.', C2, 'steamforged', 5000), 6200);
}
function scenes(cam) {
  const near = (s, r) => s && (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 < r * r;
  if (near(FOLK.scenes.argue, 20) && !S.flags.l_argue) {
    S.flags.l_argue = true;
    say('A chitin-born', 'Fresh! Fresh meat! Dug this morning! No parasites! Only protein!', C2, 'chitin', 4200);
    setTimeout(() => say('A rat-kin', 'Lies! Lies! Smells like sulphur! Smells like sickness!', C2, 'ratkin', 4200), 4400);
  }
  if (near(FOLK.scenes.hedge, 9) && !(G.indoor > 0.3) && !S.flags.l_unit7) { S.flags.l_unit7 = true; once('hedges', 'A line of steamforged backing into the hedges, groaning like grinding metal. Scritch-scratch-scritch. Scrubbing off the rust-rot.', C2); setTimeout(unit7, 4500); }
  if (near(FOLK.scenes.trough, 7)) once('wolfguard', 'Wolf-Guard at the trough. Cogswell’s mutts. They stop drinking to watch me go by. Neither of them blinks.', C2);
  if (FOLK.scrimp && near(FOLK.scrimp, 9) && !S.flags.l_scrimp) { S.flags.l_scrimp = true; say('Scrimp', 'Jacob! Jacob! You look… pale. Paler. Sun is eating you, yes?', C2, 'ratkin'); }
}

// ---------- every frame ----------
const ESC = 2.6;
export function updateFolk(dt, cam) {
  if (!FOLK.list.length || cam.z < 1700) return;
  const T = G.tractor, tFast = T && Math.abs(T.speed) > 0.4, tfx = T ? Math.sin(T.yaw) : 0, tfz = T ? Math.cos(T.yaw) : 1, walker = !S.inTractor;
  let talkers = null;
  for (const f of FOLK.list) {
    const dx = f.x - cam.x, dz = f.z - cam.z, d2 = dx * dx + dz * dz;
    if (d2 > 150 * 150) continue;
    f.t += dt;
    // out of the tractor's way: anyone in front of it steps aside, and waits till it's by
    if (T && tFast && f.mode !== 'sit') {
      const rx = f.x - T.x, rz = f.z - T.z, ahead = rx * tfx + rz * tfz, side = rx * tfz - rz * tfx;
      if (ahead > -2.5 && ahead < 9 + Math.abs(T.speed) && Math.abs(side) < ESC) { f.dodge = side >= 0 ? 1 : -1; f.pause = Math.max(f.pause, 1.4); f.dodgeX = tfz * f.dodge; f.dodgeZ = -tfx * f.dodge;
        if (f.caste === 'steam' && !f.vented && Math.abs(T.speed) > 2 && ahead < 5) { f.vented = true; vent(f, 2.2); once('sentry', 'Kicked red dust all over a steamforged on the way past. He stopped and vented a cloud of white steam at me from his shoulder-stacks. Irritation, if they have it.', C2); } }
    }
    if (f.pause > 0) f.pause -= dt;
    if (f.dodge) {
      // sidestep, then drift back to where it was going
      const k = Math.min(1, dt * 2.4); f.x += f.dodgeX * k * 1.1 * (f.pause > 0 ? 1 : 0); f.z += f.dodgeZ * k * 1.1 * (f.pause > 0 ? 1 : 0);
      if (f.path === 'artery') { f.ox = clamp(f.x - arteryX(f.z), -(ARTERY_HALF - 0.5), ARTERY_HALF - 0.5); }
      if (f.pause <= 0) f.dodge = 0;
    }
    // out of his way on foot, too
    if (walker) { const px = f.x - P.x, pz = f.z - P.z, pd = Math.hypot(px, pz); if (pd < 0.75 && pd > 1e-3 && f.mode !== 'sit') { f.x = P.x + px / pd * 0.75; f.z = P.z + pz / pd * 0.75; } }
    if (f.mode === 'walk') {
      const moving = f.pause <= 0;
      f.amp += ((moving ? 1 : 0) - f.amp) * Math.min(1, dt * 4);
      if (moving) {
        const v = f.speed * dt;
        if (f.path === 'artery') {
          f.z += f.dir * v; f.ox += (f.ox0 - f.ox) * Math.min(1, dt * 0.4);
          if (f.z > NORTH - 12 || f.z < GATE_AT.z + 10) { f.dir = -f.dir; f.z = clamp(f.z, GATE_AT.z + 10, NORTH - 12); }
          onArtery(f); const ax = arteryX(f.z + f.dir) - arteryX(f.z); f.yaw = Math.atan2(ax, f.dir);
          if (R() < dt * 0.025) { f.pause = rr(2, 6); f.yaw = f.ox > 0 ? Math.PI / 2 : -Math.PI / 2; }                // stop at a front
        } else {
          f.x += f.dir * v; f.z += (f.lz - f.z) * Math.min(1, dt * 2);
          if (f.x > f.x1 || f.x < f.x0) { f.dir = -f.dir; f.x = clamp(f.x, f.x0, f.x1); }
          f.yaw = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (f.path === 'aisle' && R() < dt * 0.06) { f.pause = rr(2, 5); f.yaw = R() < 0.5 ? 0 : Math.PI; }               // stop at a stall
        }
        f.ph += v * CASTES[f.caste].stride;
      }
      f.y = h(f.x, f.z);
    } else if (f.mode === 'scurry') {
      f.amp = 1; f.ang += f.speed / f.rad * dt; if (R() < dt * 0.3) f.speed = -f.speed;                                     // sniff, double back
      f.x = f.cx + Math.cos(f.ang) * f.rad; f.z = f.cz + Math.sin(f.ang) * f.rad; f.y = h(f.x, f.z);
      f.yaw = Math.atan2(-Math.sin(f.ang) * Math.sign(f.speed), Math.cos(f.ang) * Math.sign(f.speed)); f.ph += Math.abs(f.speed) * dt * 7.5;
    } else {
      // back to where it was standing (or working); and the stares: anyone close turns to look at the pale one
      if (!f.dodge) { f.x += (f.home[0] - f.x) * Math.min(1, dt * 1.5); f.z += (f.home[1] - f.z) * Math.min(1, dt * 1.5); }
    }
    if (f.mode === 'stand' || f.mode === 'argue') {
      let want = f.homeYaw;
      if (f.partner) want = Math.atan2(f.partner.x - f.x, f.partner.z - f.z);
      else if (d2 < 64 && !f.polish) want = Math.atan2(cam.x - f.x, cam.z - f.z);
      else if (f.fidget && R() < dt * 0.5 * f.fidget) f.homeYaw += rr(-0.3, 0.3);
      let dy = want - f.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); f.yaw += dy * Math.min(1, dt * (f.caste === 'ratkin' ? 4 : 1.6));
    }
    // the steamforged vent now and then
    if (f.caste === 'steam' && d2 < 70 * 70 && (f.puff -= dt) <= 0) { f.puff = rr(5, 14); vent(f, 1); }
    pose(f, dt);
    if (d2 < 81 && f.mode !== 'sit' && f.mode !== 'scrub') (talkers = talkers || []).push(f);
  }
  for (const k in FOLK.mesh) for (const p of Object.values(FOLK.mesh[k])) p.instanceMatrix.needsUpdate = true;
  // scritch-scratch at the hedges
  if (FOLK.scenes.hedge) { const s = FOLK.scenes.hedge; if ((s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 < 400 && Math.random() < dt * 3) sfx.scritch && sfx.scritch(spot(s.x, s.z, 8)); }
  scenes(cam);
  // now and then, somebody going by says something
  if ((FOLK.chatter -= dt) <= 0 && talkers && (!S.inTractor || Math.abs(T.speed) < 2)) {
    FOLK.chatter = rr(35, 70); const f = pick(talkers), c = CASTES[f.caste];
    say(c.name, pick(TALK[f.caste]), X('the people of Bleak Flats'), c.voice, 3600);
  }
}
function vent(f, big) {
  if (!FX.smoke) return;
  const c = CASTES.steam, top = (f.y ?? 0) + 2.15 * f.s;
  for (const e of [-1, 1]) {
    const x = f.x + Math.cos(f.yaw) * e * 0.24 * f.s - Math.sin(f.yaw) * 0.16, z = f.z - Math.sin(f.yaw) * e * 0.24 * f.s - Math.cos(f.yaw) * 0.16;
    for (let k = 0; k < 2 + big * 2; k++) FX.smoke.emit(x, top, z, { vx: (Math.random() - 0.5) * 0.4, vy: 1.4 + big * 0.8, vz: (Math.random() - 0.5) * 0.4, life: 1.6 + big, size: 0.25, size1: 1.6 + big * 1.4, alpha: 0.4, color: [1.1, 1.1, 1.1], drag: 0.4, spread: 0.15 });
  }
  sfx.hiss(spot(f.x, f.z, 10)); void c;
}

export function buildFolk() { buildCrowd(); buildMeshes(); buildTalk(); }
void lerp;
