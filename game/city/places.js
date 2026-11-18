// ============================================================
// The landmarks of Bleak Flats.
//
// The Rusty Cog: "a massive structure built inside the hollowed-out
// remains of an ancient giant steel cylinder. A single giant blade hung
// lazily from the structure, a looming Sword of Damocles threatening to
// fall the moment the city relaxed." Along its outer wall, scour-brush
// hedges "in perfect, geometric cubes". Inside: dim, lit by fungus in
// mason jars, Grumm at a corner table, and the stairs up to the offices.
// The bay out front where Jacob leaves the tractor. (Chapter Two.) The
// two-storey verandah on its front, the hotel's false front and the
// offices upstairs are the blockout's ("a grand outback verandah hotel",
// the Cog and Cogswell's office in the one building).
//
// Water Square, where water is handed out, and taxed: the Miser-Boab
// and the Gallows-Gums are the Field Guide's (the blockout puts them
// here). The markets. Scrimp's stall, by the old stamp-mills whose
// ore-crushers keep "a heartbeat for the district": THOOM-THOOM-THOOM.
// The Bones: mine towers "assembled from dark metallic beams/ribs to
// evoke salvaged steamforged skeletons" (the blockout). The refinery
// stacks "belched thick, yellow-black smoke into the pristine sky". The
// sheriff's station on the Iron-Eye Approach. The abandoned homesteads
// outside the wall, and the crater (the Field Guide's) over the roofs.
//
// Everything these places are made of beyond those words (the tapped
// boab, the cages, the lens on the station, the stamp sheds' form, the
// works) is this sketch's: Experimental.
// ============================================================
import { THREE, TAU, clamp, lerp, smooth, rng, noise2, G, S, P, W, blockers, addThing, hooks, once, MX, rodMX, planarUV, merge, mesh, M, T, glowTexture, CH2, GUIDE, NEW } from '../road/core.js';
import { h } from '../road/land.js';
import { farHeight } from '../road/far.js';
import { buildGum } from '../road/life.js';
import { sfx, spot } from '../road/sound.js';
import { dustKick } from '../road/air.js';
import { GS } from '../road/gate.js';
import { SITE, ARTERY_HALF, CASTE_E, CASTE_W, EAST, WEST, NORTH, LANES, arteryX, claim } from './plan.js';
import { CITY, SURF, STEAM, patch, cityPut as put, cityRod as rod, cityAs as as, CITY_COLOURS as CC } from './build.js';

const C2 = ['C', CH2], CG = ['C', GUIDE], X = (why) => ['X', why ? why + ': ' + NEW : NEW];
const bark = (t, p) => hooks.bark(t, p);
const R = rng(4096), rr = (a, b) => a + (b - a) * R(), pick = (a) => a[Math.floor(R() * a.length)];
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const add = (o) => { CITY.root.add(o); return o; };
const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); CITY.mats.push(m); return m; };
export const PLACES = { cog: null, blade: null, gear: null, doors: [], stamps: null, cams: [], fly: null, sheaves: [], cages: [], eye: null, flare: null, hedge: null, bay: null, grumm: null, scrimp: null, inside: 0 };

// ground the town mustn't build on (claims, for build.js), and the works' own bookkeeping (they stand in open ground)
const TAKEN = [];
function take(x0, z0, x1, z1, open = false) {
  const r = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
  TAKEN.push(r); claim(r.x0, r.z0, r.x1, r.z1, open ? 'open' : 'solid'); return r;
}
const free = (x0, z0, x1, z1) => !TAKEN.some(r => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0) && Math.abs((x0 + x1) / 2 - arteryX((z0 + z1) / 2)) > ARTERY_HALF + 1.5 + (x1 - x0) / 2;

// ---------- helpers: textures painted here ----------
function uvScale(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
function boardTexture(lines, { w = 1024, h: ht = 256, bg = '#2a1c14', fg = '#e8cf9a', edge = '#8a6a3a', font = 'Georgia, serif' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = ht; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, ht); x.strokeStyle = edge; x.lineWidth = Math.max(6, ht * 0.04); x.strokeRect(ht * 0.04, ht * 0.04, w - ht * 0.08, ht - ht * 0.08);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [t, size, y] of lines) { x.font = `bold ${size}px ${font}`; x.fillText(t, w / 2, y * ht); }
  x.globalAlpha = 0.32; x.fillStyle = '#6a2a14'; for (let k = 0; k < 140; k++) x.fillRect(Math.random() * w, Math.random() * ht, 2 + Math.random() * 14, 1 + Math.random() * 3);   // rust and weather
  x.globalAlpha = 0.25; x.fillStyle = '#000'; for (let k = 0; k < 30; k++) x.fillRect(Math.random() * w, ht * (0.6 + Math.random() * 0.4), 1 + Math.random() * 2, ht * 0.4);   // runs from the bottom edge
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// a painted board facing +x (the way the Cog and the station look onto the street) unless turned
function board(lines, wdt, hgt, opts, x, y, z, ry = Math.PI / 2) {
  const m = mesh(new THREE.PlaneGeometry(wdt, hgt), mat({ map: boardTexture(lines, opts), roughness: 0.85 }), { cast: false });
  m.position.set(x, y, z); m.rotation.y = ry; return add(m);
}
function boabTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#d6ccc0'; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 46; k++) { const yy = Math.random() * 256, w = 2 + Math.random() * 6; x.fillStyle = `rgba(118,98,86,${0.12 + Math.random() * 0.2})`; x.fillRect(0, yy, 256, w); x.fillStyle = 'rgba(255,250,240,0.2)'; x.fillRect(0, yy + w, 256, 1.5); }   // folds, like a stomach
  for (let k = 0; k < 600; k++) { x.fillStyle = Math.random() < 0.55 ? `rgba(250,248,242,${Math.random() * 0.3})` : `rgba(140,122,108,${Math.random() * 0.22})`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, Math.random() * 3.2, 0, TAU); x.fill(); }   // calcified, chalky
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function laceTexture() {                                   // cast-iron lace for the verandah's friezes
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 64); x.strokeStyle = x.fillStyle = '#fff'; x.lineWidth = 4;
  x.fillRect(0, 0, 256, 6); x.fillRect(0, 58, 256, 6);
  for (let i = 0; i < 4; i++) {
    const cx = 32 + i * 64;
    x.beginPath(); x.arc(cx, 34, 15, 0, TAU); x.stroke(); x.beginPath(); x.arc(cx, 34, 5, 0, TAU); x.fill();
    x.beginPath(); x.moveTo(cx - 32, 6); x.quadraticCurveTo(cx - 16, 46, cx, 19); x.quadraticCurveTo(cx + 16, 46, cx + 32, 6); x.stroke();
    x.beginPath(); x.moveTo(cx - 32, 58); x.lineTo(cx - 32, 6); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function gearGeometry(rOut, rRoot, teeth, depth) {
  const s = new THREE.Shape(), n = teeth * 4;
  for (let i = 0; i <= n; i++) { const a = i / n * TAU, r = (i % 4 === 1 || i % 4 === 2) ? rOut : rRoot; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const hub = new THREE.Path(); hub.absarc(0, 0, rRoot * 0.16, 0, TAU, true); s.holes.push(hub);
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3, p = new THREE.Path(); p.absarc(Math.cos(a) * rRoot * 0.56, Math.sin(a) * rRoot * 0.56, rRoot * 0.22, 0, TAU, true); s.holes.push(p); }   // lightening holes
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 14 });
  g.translate(0, 0, -depth / 2); return planarUV(g, 1.2);
}
// a fungus light hung in the air somewhere: the jar, and a pool of its light on whatever's under it
const POOLS = [];
function jar(x, y, z, drop, floorY = null, k = 1) {
  put('cyl', x, y - drop / 2, z, 0.012, drop, 0.012, CC.RUSTS[4]);
  put('lit', x, y - drop - 0.13, z, 0.16 * k, 0.22 * k, 0.16 * k, CC.FUNGUS); put('cyl', x, y - drop + 0.0, z, 0.19 * k, 0.05, 0.19 * k, CC.RUSTS[3]);
  if (floorY !== null) POOLS.push([x, floorY, z, 1.2 + (y - drop - floorY) * 0.4]);
}

// ---------- the Rusty Cog ----------
function buildCog() {
  const cx = SITE.cog.x, cz = SITE.cog.z, R0 = 8, AXY = 5, L = 30, y = h(cx, cz), z0 = cz - L / 2, z1 = cz + L / 2;
  const fx = cx + 8.05, px = fx + 3.4, fz0 = z0 + 1, fz1 = z1 - 1, DZ = 1.6, a0 = 0.86, a1 = 1.37, DOOR = 1.3;
  PLACES.cog = { cx, cz, y, z0, z1, fx, px, R0, AXY };
  // its ground: the shell, the verandah, the kitchen out the back; and the forecourt to the street kept clear
  take(cx - R0 - 0.6, z0 - 0.6, px + 0.5, z1 + 0.6); take(cx - 13.2, z1 - 9.5, cx - 6, z1 - 0.2);
  const edge = arteryX(z0) - ARTERY_HALF; take(px + 0.5, z0 - 2.5, edge, z1 + 2.5, true); patch(px + 0.5, z0 - 2.5, edge - 0.5, z1 + 2.5, 0.92);

  // the shell: an ancient steel cylinder on its side, a third of it sunk in the ground, the door cut through the street side
  const tile = 2.4;
  const outer = mat({ map: T.iron.c, normalMap: T.iron.n, color: 0xc8957a, roughness: 0.78, metalness: 0.5 });
  const inner = mat({ map: T.iron.c, normalMap: T.iron.n, color: 0x4e3e36, roughness: 0.94, metalness: 0.2, side: THREE.BackSide });   // soot and a century of smoke
  const g = add(new THREE.Group()); g.position.set(cx, y + AXY, cz);
  const piece = (za, zb, t0, tl) => {
    const geo = uvScale(new THREE.CylinderGeometry(R0, R0, zb - za, Math.max(6, Math.round(72 * tl / TAU)), 1, true, t0, tl), tl * R0 / tile, (zb - za) / tile);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, (za + zb) / 2 - cz);
    g.add(mesh(geo, outer)); g.add(mesh(geo, inner, { cast: false }));
  };
  piece(z0, cz - DZ, 0, TAU); piece(cz + DZ, z1, 0, TAU); piece(cz - DZ, cz + DZ, a1, TAU - a1); piece(cz - DZ, cz + DZ, 0, a0);
  // its ends: plates riveted on, with portholes; and the riveted bands round it
  const iron = [];
  for (const [z, ry] of [[z0, Math.PI], [z1, 0]]) {
    const c = uvScale(new THREE.CircleGeometry(R0, 72), R0 * 2 / tile, R0 * 2 / tile);
    for (const m of [mesh(c, outer), mesh(c, inner, { cast: false })]) { m.position.set(0, 0, z - cz); m.rotation.y = ry; g.add(m); }
    const out = z < cz ? -1 : 1;
    for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; if (Math.sin(a) < -0.5) continue; iron.push([new THREE.SphereGeometry(0.07, 5, 4), MX(Math.cos(a) * (R0 - 0.25), Math.sin(a) * (R0 - 0.25), z - cz + out * 0.03)]); }
    for (const pxl of [-4.2, 0, 4.2]) {
      iron.push([new THREE.TorusGeometry(0.52, 0.09, 6, 20), MX(pxl, 0.2, z - cz + out * 0.05)]);
      const lit = pxl === 0 || R() < 0.5; for (const o of [0.06, -0.06]) put(lit ? 'lit' : 'dark', cx + pxl, y + AXY + 0.2, z + out * o, 0.7, 0.7, 0.03, lit ? CC.AMBER.map(v => v * 0.55) : CC.DARK);
    }
  }
  for (let k = 0; k <= 6; k++) { const z = z0 + k * L / 6; if (Math.abs(z - cz) < DZ + 0.4) continue; iron.push([new THREE.TorusGeometry(R0 + 0.06, 0.13, 6, 80), MX(0, 0, z - cz)]); }
  iron.push([new THREE.BoxGeometry(0.4, 0.4, DZ * 2 + 0.5), MX(R0 * Math.sin(a1) - 0.1, -R0 * Math.cos(a1) + 0.15, 0)]);                // the door's lintel, where the cut was made
  const ironM = mat({ map: T.iron.c, normalMap: T.iron.n, color: 0x9a7262, roughness: 0.7, metalness: 0.55 });
  g.add(mesh(merge(iron), ironM));
  // a rust stain run down from every band, and the shell's top streaked pale where the birds sit
  // (the shell's own texture carries the rest)

  // the hotel's front: a false front of painted weatherboard against the curve, two storeys of verandah on cast-iron posts
  const cream = [0.7, 0.6, 0.44], lower = [0.46, 0.34, 0.25], len = fz1 - fz0;
  as(SURF.plank, () => {
    for (const [za, zb] of [[fz0, cz - DOOR], [cz + DOOR, fz1]]) put('box', fx, y + 1.8, (za + zb) / 2, 0.24, 3.6, zb - za, lower);
    put('box', fx, y + 3.3, cz, 0.24, 0.6, DOOR * 2, lower);
    put('box', fx, y + 5.7, cz, 0.24, 4.2, len, cream);
    put('box', fx, y + 8.2, cz, 0.3, 0.8, len + 0.3, cream);                                                                    // the parapet
  });
  put('box', fx + 0.14, y + 8.66, cz, 0.6, 0.14, len + 0.7, [0.5, 0.4, 0.3], 0, 0, 0, SURF.sheet);                              // its cornice
  put('box', fx + 0.1, y + 3.68, cz, 0.36, 0.16, len + 0.2, [0.4, 0.3, 0.22], 0, 0, 0, SURF.sheet);                             // the string course
  // windows: the bar's, either side of the door; the offices' upstairs, tall, two of them lit
  for (const zz of [-10.5, -7, -4, 4, 7, 10.5]) { const z = cz + zz, lit = Math.abs(zz) < 6; put(lit ? 'lit' : 'dark', fx + 0.13, y + 1.7, z, 0.04, 1.4, 1.2, lit ? CC.AMBER.map(v => v * 0.45) : CC.DARK); put('box', fx + 0.16, y + 0.95, z, 0.14, 0.08, 1.4, cream, 0, 0, 0, SURF.sheet); }
  for (let k = 0; k < 7; k++) { const z = fz0 + 1.5 + k * (len - 3) / 6, lit = k === 2 || k === 3 || k === 5; put(lit ? 'lit' : 'dark', fx + 0.13, y + 5.6, z, 0.04, 1.7, 1.0, lit ? CC.AMBER.map(v => v * 0.6) : CC.DARK); put('box', fx + 0.15, y + 6.55, z, 0.12, 0.12, 1.25, [0.4, 0.3, 0.22], 0, 0, 0, SURF.sheet); put('box', fx + 0.16, y + 4.68, z, 0.14, 0.08, 1.2, cream, 0, 0, 0, SURF.sheet); }
  // the verandah: posts, the balcony floor that is its ceiling, the balcony's rail, the roof's bullnose curve
  const posts = 9;
  for (let k = 0; k < posts; k++) {
    const z = fz0 + 0.2 + k * (len - 0.4) / (posts - 1);
    put('cyl', px, y + 3.7, z, 0.2, 7.4, 0.2, [0.32, 0.3, 0.29]); put('box', px, y + 0.2, z, 0.42, 0.4, 0.42, [0.52, 0.46, 0.4], 0, 0, 0, SURF.sheet);
    for (const yy of [3.25, 7.0]) for (const e of [-1, 1]) if ((k > 0 || e > 0) && (k < posts - 1 || e < 0)) rod(px, y + yy - 0.55, z, px, y + yy, z + e * 0.55, 0.035, [0.32, 0.3, 0.29]);   // brackets
    blockers.push({ x: px, z, r: 0.22 });
  }
  as(SURF.plank, () => { put('box', fx + 1.72, y + 3.55, cz, 3.44, 0.18, len + 0.1, [0.42, 0.3, 0.22]); put('box', px + 0.04, y + 3.4, cz, 0.08, 0.36, len + 0.4, cream); });
  put('box', px - 0.02, y + 4.62, cz, 0.08, 0.08, len, [0.32, 0.3, 0.29], 0, 0, 0, SURF.sheet);                                 // the balcony rail
  for (let z = fz0 + 0.3; z < fz1 - 0.2; z += 0.3) put('cyl', px - 0.02, y + 4.12, z, 0.025, 0.95, 0.025, [0.32, 0.3, 0.29]);
  {
    // the roof: a straight run off the parapet, then curved down over the posts in a bullnose
    const corr = new THREE.MeshStandardMaterial({ map: T.tin.c, normalMap: T.tin.n, color: 0xa08a78, roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide }); CITY.mats.push(corr);
    const flat = uvScale(new THREE.PlaneGeometry(2.7, len + 0.6), 2.7 / 1.2, (len + 0.6) / 1.2); flat.rotateX(-Math.PI / 2); flat.rotateZ(-0.12);
    const fm = mesh(flat, corr); fm.position.set(fx + 1.32, y + 7.78, cz); add(fm);
    const bull = uvScale(new THREE.CylinderGeometry(0.9, 0.9, len + 0.6, 10, 1, true, Math.PI / 2, Math.PI / 2), 1.4 / 1.2, (len + 0.6) / 1.2);
    bull.rotateX(Math.PI / 2); const bm = mesh(bull, corr); bm.position.set(px - 0.62, y + 6.72, cz); add(bm);
    // and cast-iron lace along the tops of both storeys, between the posts
    const lace = laceTexture(); lace.repeat.set(len / 1.15, 1);
    const lm = mat({ color: 0x3e3430, alphaMap: lace, alphaTest: 0.5, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    for (const yy of [2.95, 6.4]) { const l = mesh(new THREE.PlaneGeometry(len - 0.3, 0.5), lm, { cast: false }); l.position.set(px, y + yy, cz); l.rotation.y = Math.PI / 2; add(l); }
  }
  for (let k = 0; k < 6; k++) CITY.lamps.push({ x: px - 1.4, y: y + 3.1, z: fz0 + 2 + k * (len - 4) / 5, hung: true });
  // the name across the parapet, Cogswell's board on the balcony, and a great iron cog turning slowly over it all
  board([['THE RUSTY COG', 150, 0.54]], 13.5, 1.75, { bg: '#3a1e12', fg: '#f0c878', edge: '#c08a40' }, fx + 0.2, y + 9.25, cz);
  board([['COGSWELL & ASSOCIATES', 74, 0.4], ['ACCOUNTS · LOANS · LAND', 44, 0.76]], 6.4, 1.1, { bg: '#161616', fg: '#d8d0c0', edge: '#9a9080' }, px + 0.09, y + 4.15, cz);
  {
    const gg = add(new THREE.Group()); gg.position.set(fx + 0.55, y + 11.6, cz); gg.rotation.y = Math.PI / 2;
    const gear = mesh(gearGeometry(1.75, 1.45, 14, 0.36), ironM); gg.add(gear);
    gg.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 10).rotateX(Math.PI / 2), M.iron));
    rod(fx + 0.55, y + 9.95, cz, fx + 0.55, y + 11.5, cz, 0.16, CC.RUSTS[4]);
    for (const e of [-1, 1]) rod(fx + 0.5, y + 11.6, cz, cx + 4.2, y + 11.3, cz + e * 2, 0.08, CC.RUSTS[3]);
    PLACES.gear = gear;
  }
  // the batwing doors, and the vestibule through the false front to the cut in the shell
  const wood = mat({ map: T.boards.c, normalMap: T.boards.n, color: 0x8a6a52, roughness: 0.9 });
  for (const e of [-1, 1]) {
    const pivot = add(new THREE.Group()); pivot.position.set(fx + 0.12, y + 0.55, cz + e * DOOR);
    const leaf = mesh(planarUV(new THREE.BoxGeometry(0.05, 1.2, DOOR - 0.06), 0.6), wood); leaf.position.set(0, 0.6, -e * (DOOR - 0.06) / 2); pivot.add(leaf);
    PLACES.doors.push({ g: pivot, e, a: 0, v: 0, was: 0 });
  }
  as(SURF.plank, () => { for (const e of [-1, 1]) put('box', (cx + 6.1 + fx) / 2, y + 1.6, cz + e * (DOOR + 0.12), fx - cx - 6.1, 3.2, 0.1, lower); put('box', (cx + 6.1 + fx) / 2, y + 3.26, cz, fx - cx - 6.1, 0.1, DOOR * 2 + 0.3, lower); });
  // the blade: one great vane of whatever this cylinder once was, hung on chains off a gantry on the roof, over the forecourt
  {
    const bx = cx + 13, top = y + 16.9;
    for (const e of [-1, 1]) { rod(cx + 4.8, y + AXY + 6.3, cz + e * 2.6, cx + 4.8, top, cz + e * 2.6, 0.32, CC.RUSTS[4], 'cyl'); rod(cx + 1.4, y + AXY + 7.8, cz + e * 2.6, cx + 4.8, top - 0.2, cz + e * 2.6, 0.2, CC.RUSTS[3]); }
    put('box', (cx + 1 + bx + 0.6) / 2, top + 0.25, cz, bx + 0.6 - cx - 1, 0.5, 0.5, CC.RUSTS[4], 0, 0, 0, SURF.sheet);              // the boom
    for (const e of [-1, 1]) rod(cx + 4.8, top + 0.2, cz + e * 2.6, bx, top + 0.2, cz, 0.12, CC.RUSTS[3]);
    rod(cx + 4.8, top - 2.8, cz, bx - 0.3, top, cz, 0.16, CC.RUSTS[3]);                                                       // its brace
    put('box', cx + 1.2, top - 0.4, cz, 1.6, 1.4, 1.6, [0.3, 0.28, 0.27], 0, 0, 0, SURF.sheet);                                 // the counterweight
    const pivot = add(new THREE.Group()); pivot.position.set(bx, top, cz);
    const bl = new THREE.BoxGeometry(0.24, 11.5, 2.4, 1, 26, 6), p = bl.attributes.position;
    for (let i = 0; i < p.count; i++) {        // twisted along its length, tapering to a point at the bottom, curved across its face
      const yy = p.getY(i), t = (yy + 5.75) / 11.5, zc = p.getZ(i) * (0.28 + 0.72 * Math.sqrt(t)), tw = (1 - t) * 0.75, xc = p.getX(i) + Math.sin(zc * 1.2) * 0.2;
      p.setXYZ(i, xc * Math.cos(tw) - zc * Math.sin(tw), yy, xc * Math.sin(tw) + zc * Math.cos(tw));
    }
    bl.computeVertexNormals(); bl.translate(0, -7.4, 0);
    pivot.add(mesh(planarUV(bl, 1.5), mat({ map: T.ironpaint.c, normalMap: T.ironpaint.n, color: 0x8c8078, roughness: 0.48, metalness: 0.78 })));
    for (const e of [-0.85, 0.85]) { const ch = mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.6, 5), M.iron); ch.position.set(0, -0.8, e * 0.45); ch.rotation.x = -e * 0.28; pivot.add(ch); }
    PLACES.blade = { pivot, t: 0, x: bx, z: cz };
    addThing({ id: 'cog:blade', name: 'The blade over the Cog', verb: 'Look up', x: bx, y: y + 2.5, z: cz, r: 4.5, prov: C2, use: () => bark('A single giant blade, hung lazily over the door on two chains. A Sword of Damocles, waiting for the moment the city relaxes. Nobody here relaxes.', C2) });
  }
  // scour-brush hedges against the front, either side of the door: "stiff, wire-bristle bushes grew in perfect, geometric cubes"
  {
    const cubes = [], hx = fx + 0.78;
    for (const [za, zb] of [[fz0 + 0.8, cz - 2.2], [cz + 2.2, fz1 - 0.8]]) for (let z = za + 0.6; z < zb - 0.55; z += 1.35) { cubes.push([new THREE.BoxGeometry(1.2, 1.2, 1.2), MX(hx, y + 0.6, z)]); blockers.push({ x0: hx - 0.6, x1: hx + 0.6, z0: z - 0.6, z1: z + 0.6 }); }
    add(mesh(planarUV(merge(cubes), 0.22), mat({ map: T.canvas.c, normalMap: T.dirt.n, normalScale: new THREE.Vector2(2.4, 2.4), color: 0x737a72, roughness: 0.5, metalness: 0.7 })));
    PLACES.hedge = { x: hx + 1.3, z: cz - 6, y };
    addThing({ id: 'cog:hedge', name: 'Scour-brush hedges', verb: 'Look', x: hx + 0.9, y: y + 1, z: cz - 5, r: 2.6, prov: C2, use: () => bark('Scour-brush, clipped into perfect cubes. The steamforged back up into it and grind off the rust-rot. Scritch-scratch-scritch. Emotion is oxidation, they tell each other. Scrub the shell.', C2) });
  }
  // the bay out front, where you leave a vehicle
  {
    const bx = px + 3.0, bz = cz - 9.5, y2 = h(bx, bz);
    for (const [ox, oz, w, d] of [[-1.8, 0, 0.14, 6.6], [1.8, 0, 0.14, 6.6], [0, -3.3, 3.74, 0.14]]) put('box', bx + ox, y2 + 0.03, bz + oz, w, 0.04, d, [0.78, 0.74, 0.62], 0, 0, 0, SURF.sheet);
    put('cyl', bx - 2.2, y2 + 1.0, bz - 3.4, 0.06, 2.0, 0.06, CC.RUSTS[3]);
    board([['BAY · VEHICLES', 64, 0.5]], 1.6, 0.36, { w: 512, h: 112, bg: '#2a2a22', fg: '#e0d8c0', edge: '#7a7060' }, bx - 2.2, y2 + 2.1, bz - 3.44, Math.PI);
    PLACES.bay = { x: bx, z: bz, hw: 1.8, hd: 3.3 };
    addThing({ id: 'cog:bay', name: 'The Cog’s bay', verb: 'Look', x: bx - 2, y: y2 + 1.2, z: bz - 3.2, r: 1.8, prov: C2, use: () => bark('The designated bay outside the Rusty Cog. Park in it, or the Wolf-Guard park you somewhere you won’t like.', C2) });
  }
  // the shell holds everything in but for its doorway; inside, a plank floor a step up
  const sx = Math.sqrt(R0 * R0 - AXY * AXY);
  blockers.push({ x0: cx - R0 - 0.2, x1: cx - sx + 0.25, z0: z0 - 0.4, z1: z1 + 0.4 },
    { x0: cx + sx - 0.25, x1: fx + 0.2, z0: z0 - 0.4, z1: cz - DOOR }, { x0: cx + sx - 0.25, x1: fx + 0.2, z0: cz + DOOR, z1: z1 + 0.4 },
    { x0: cx - R0, x1: cx + sx, z0: z0 - 0.4, z1: z0 + 0.35 }, { x0: cx - R0, x1: cx + sx, z0: z1 - 0.35, z1: z1 + 0.4 });
  as(SURF.plank, () => put('box', cx, y + 0.05, cz, sx * 2 - 0.1, 0.1, L - 0.4, [0.3, 0.22, 0.16]));
  (W.floors = W.floors || []).push({ x: cx, z: cz, r: 16, yaw: 0, hw: sx - 0.1, hd: L / 2 - 0.2, y: y + 0.1 });
  buildCogInside(cx, cz, y + 0.1, z0, z1, sx);
  // the kitchen out the back, onto the alley: a lean-to against the shell, a stovepipe, a door that isn't always latched
  {
    const kx = cx - 10, kz = z1 - 5;
    put('box', kx, y + 1.5, kz, 5.6, 3.0, 8, CC.wallCol(0.2)); put('box', kx + 0.3, y + 3.15, kz, 6.4, 0.08, 8.6, [0.48, 0.4, 0.34], 0, 0, -0.1);
    put('dark', kx - 2.82, y + 1.05, kz + 1.5, 0.06, 2.1, 0.95, CC.DARK); put('lit', kx - 2.82, y + 2.3, kz - 1.5, 0.06, 0.6, 0.9, CC.AMBER.map(v => v * 0.5));
    put('cyl', kx - 1.5, y + 4.2, kz - 2.5, 0.28, 3.0, 0.28, CC.RUSTS[3]); W.smoke.push({ x: kx - 1.5, y: y + 5.8, z: kz - 2.5, rate: 0.6, mat: M.smoke, size: 0.45, near: 220, life: 8 });
    for (let k = 0; k < 6; k++) put(k % 2 ? 'cyl' : 'box', kx - 3.6 - R() * 1.4, y + 0.35, kz - 3 + k * 1.1, 0.6, 0.7, 0.6, k % 2 ? CC.RUSTS[1] : CC.woodCol(), 0, R(), 0, SURF.plank);   // crates and drums
    blockers.push({ x0: kx - 2.8, x1: kx + 2.8, z0: kz - 4, z1: kz + 4 });
    addThing({ id: 'cog:kitchen', name: 'The kitchen door', verb: 'Try it', x: kx - 3.2, y: y + 1, z: kz + 1.5, r: 1.4, prov: C2, use: () => { sfx.latch(spot(kx - 3, kz + 1.5, 8)); bark(S.flags.grumm ? 'Unlatched, like Grumm said. A way out the back if Cogswell whistles for the dogs.' : 'The Cog’s kitchen door, onto the back alley. Grease and steam and somebody singing badly. Not latched.', C2); } });
  }
  addThing({ id: 'cog:door', name: 'The Rusty Cog', verb: 'Look', x: px + 0.8, y: y + 2, z: cz, r: 3.4, prov: C2, use: () => bark('The Cog. The social hub of the lower districts, built inside an ancient steel cylinder. It smells of cheap alcohol, lubricant and regret.', C2) });
}
// inside the Cog: the bar along the back, the tables, the jars, the stairs up to the offices
function buildCogInside(cx, cz, fy, z0, z1, sx) {
  const dark = [0.26, 0.17, 0.12], darker = [0.18, 0.12, 0.09], brass = [0.62, 0.48, 0.24];
  // the bar, its rail, the shelves behind it, the still that makes what it sells
  const bx = cx - 4.2, bz = cz - 1;
  as(SURF.plank, () => { put('box', bx, fy + 0.55, bz, 0.9, 1.1, 12, dark); put('box', bx + 0.08, fy + 1.14, bz, 1.2, 0.08, 12.3, darker); });
  put('cyl', bx + 0.62, fy + 0.22, bz, 0.06, 12, 0.06, brass, Math.PI / 2, 0, 0);
  as(SURF.plank, () => { for (const yy of [0.9, 1.6, 2.3]) put('box', cx - 5.6, fy + yy, bz, 0.45, 0.06, 9, darker); put('box', cx - 5.85, fy + 1.4, bz, 0.08, 2.8, 9.2, darker); });
  put('dark', cx - 5.78, fy + 1.95, bz, 0.03, 0.9, 4, [0.12, 0.13, 0.14]);                                                       // a mirror gone grey
  for (let k = 0; k < 40; k++) { const yy = [0.9, 1.6, 2.3][k % 3], z = bz - 4.3 + (k / 40) * 8.6 + rr(-0.05, 0.05); put('cyl', cx - 5.55, fy + yy + 0.15, z, 0.08, rr(0.22, 0.32), 0.08, pick([[0.25, 0.42, 0.25], [0.5, 0.3, 0.14], [0.66, 0.64, 0.56], [0.3, 0.22, 0.12]])); }
  for (let k = 0; k < 8; k++) { const z = bz - 5 + k * 1.4; put('cyl', bx + 1.25, fy + 0.38, z, 0.06, 0.76, 0.06, CC.RUSTS[4]); put('cyl', bx + 1.25, fy + 0.8, z, 0.42, 0.07, 0.42, darker); }   // the stools along it
  { const sx2 = cx - 4.6, sz = bz + 7.4; put('cyl', sx2, fy + 1.1, sz, 1.4, 2.2, 1.4, [0.7, 0.42, 0.26]); put('dome', sx2, fy + 2.2, sz, 0.7, 0.6, 0.7, [0.7, 0.42, 0.26]); rod(sx2, fy + 2.7, sz, sx2 + 1.4, fy + 3.6, sz - 1.2, 0.09, [0.62, 0.4, 0.24]); rod(sx2 + 1.4, fy + 3.6, sz - 1.2, sx2 + 0.6, fy + 1.3, sz - 2.4, 0.09, [0.62, 0.4, 0.24]); blockers.push({ x: sx2, z: sz, r: 0.9 }); }   // the still: copper gone green and brown
  blockers.push({ x0: bx - 0.5, x1: bx + 0.65, z0: bz - 6.1, z1: bz + 6.1 }, { x0: cx - 6.2, x1: cx - 5.3, z0: bz - 4.6, z1: bz + 4.6 });
  addThing({ id: 'cog:bar', name: 'The bar', verb: 'Ask for a water', x: bx + 1.2, y: fy + 1.2, z: bz, r: 1.8, prov: C2, use: () => { if (S.flags.cogWater) { bark('Another water? It costs. Everything in here costs.', X('the Cog')); return; } S.flags.cogWater = true; sfx.clink(); bark('Signalled the barkeep for a water. It comes in a cup that’s had other things in it, and the barkeep watches my skin, not my money.', C2); } });
  // the tables, and the one in the corner big enough for three men, where Grumm sits
  const tables = [[0.6, -10.5], [2.4, -8.4], [-0.2, -5.0], [2.4, -3.2], [0.4, 4.6], [3.2, 7.6], [0.8, 10.2]];
  for (const [tx, tz] of tables) {
    const x = cx + tx, z = cz + tz;
    as(SURF.plank, () => { put('cyl', x, fy + 0.4, z, 0.14, 0.8, 0.14, darker); put('cyl', x, fy + 0.82, z, 1.3, 0.06, 1.3, dark); });
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + tx * 3; put('cyl', x + Math.cos(a) * 1.0, fy + 0.25, z + Math.sin(a) * 1.0, 0.38, 0.5, 0.38, darker); }
    if (R() < 0.7) put('cyl', x + rr(-0.3, 0.3), fy + 0.92, z + rr(-0.3, 0.3), 0.14, 0.18, 0.14, [0.5, 0.36, 0.2]);                // a tankard left
    blockers.push({ x, z, r: 0.75 });
  }
  { const gx = cx - 3.2, gz = z1 - 2.6;
    as(SURF.plank, () => { put('box', gx, fy + 0.82, gz, 2.6, 0.08, 1.7, dark); for (const [a, b] of [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]]) put('box', gx + a, fy + 0.4, gz + b, 0.12, 0.8, 0.12, darker); });
    put('dome', gx + 0.4, fy + 0.86, gz - 0.2, 0.32, 0.14, 0.32, [0.62, 0.46, 0.3]); put('cyl', gx - 0.5, fy + 0.98, gz + 0.2, 0.22, 0.26, 0.22, [0.5, 0.36, 0.2]);   // a bowl of roasted grubs, a tankard
    put('box', gx, fy + 0.3, gz - 1.5, 2.0, 0.6, 0.7, darker, 0, 0, 0, SURF.plank);                                                // the bench, built for a suini
    blockers.push({ x0: gx - 1.3, x1: gx + 1.3, z0: gz - 1.9, z1: gz + 0.9 });
    PLACES.grumm = { x: gx, z: gz - 1.5, y: fy, yaw: 0 };
    addThing({ id: 'cog:grumm', name: 'The corner table', verb: 'Look', x: gx + 1.6, y: fy + 1, z: gz - 0.4, r: 1.8, prov: C2, use: () => { S.flags.grumm = true; bark('The corner table, taking up room enough for three. A bowl of roasted grubs on it, pushed to the empty side. “Eat. You are too skinny.” I can hear him say it.', C2); } });
  }
  // the beams across the vault, and the jars of fungus-light hung from them: "dim, lit by bioluminescent fungi hanging from the ceiling in mason jars"
  const by = fy + 6.9 - 0.1, half = Math.sqrt(64 - (5 - 6.8) ** 2) - 0.1;
  for (let z = z0 + 3; z < z1 - 2; z += 4.2) {
    put('box', cx, by, z, half * 2, 0.22, 0.2, CC.RUSTS[4], 0, 0, 0, SURF.sheet);
    for (let k = 0; k < 4; k++) { const x = cx + rr(-half + 1.5, half - 1.5), zz = z + rr(-0.05, 0.05); jar(x, by - 0.1, zz, rr(1.6, 3.6), fy); }
  }
  // the mezzanine across the south end, the offices behind its partition, and the stairs up to it
  const dy = fy + 4.1, dz1 = z0 + 5.3, dh = Math.sqrt(64 - (5 - 4.2) ** 2) - 0.15;
  as(SURF.plank, () => {
    put('box', cx, dy, (z0 + dz1) / 2, dh * 2, 0.2, dz1 - z0 - 0.3, dark);
    put('box', cx, dy + 1.5, z0 + 3.4, dh * 2 - 0.4, 2.8, 0.12, [0.36, 0.26, 0.19]);                                          // the offices' partition
  });
  for (const x of [cx - 5.4, cx - 2, cx + 2, cx + 5.4]) { put('cyl', x, (fy + dy) / 2, dz1 - 0.2, 0.18, dy - fy, 0.18, darker); blockers.push({ x, z: dz1 - 0.2, r: 0.2 }); }
  put('box', cx - 1.2, dy + 1.0, dz1 - 0.1, dh * 2 - 3, 0.06, 0.06, darker, 0, 0, 0, SURF.sheet);                                  // the landing's rail
  put('dark', cx + 1.5, dy + 1.15, z0 + 3.47, 1.0, 2.1, 0.04, CC.DARK); put('lit', cx + 1.5, dy + 2.35, z0 + 3.47, 0.7, 0.12, 0.03, CC.AMBER.map(v => v * 0.6));
  board([['ACCOUNTS', 60, 0.52]], 1.0, 0.24, { w: 384, h: 92, bg: '#161616', fg: '#d8d0c0', edge: '#9a9080' }, cx + 1.5, dy + 2.6, z0 + 3.5, 0);
  const n = 14, run = 0.55, stx = cx + 4.95, stz0 = dz1 + n * run;
  as(SURF.plank, () => { for (let k = 0; k < n; k++) { const top = (k + 1) * (dy - fy) / n; put('box', stx, fy + top / 2, stz0 - (k + 0.5) * run, 1.3, top, run, dark); } });
  rod(stx - 0.68, fy + 1.0, stz0, stx - 0.68, dy + 1.0, dz1, 0.05, CC.RUSTS[4]);
  for (let k = 0; k <= n; k += 3) rod(stx - 0.68, fy + k * (dy - fy) / n, stz0 - k * run, stx - 0.68, fy + k * (dy - fy) / n + 1.0, stz0 - k * run, 0.04, CC.RUSTS[4]);
  blockers.push({ x0: stx - 0.7, x1: stx + 0.75, z0: dz1, z1: stz0 - 0.4 });
  PLACES.stairs = { x: stx, z: stz0 + 0.6 };
  addThing({ id: 'cog:stairs', name: 'The stairs to the offices', verb: 'Climb them', x: stx, y: fy + 0.8, z: stz0 + 0.5, r: 1.5, prov: C2, use: () => hooks.cogswell && hooks.cogswell() });
  // an upright piano nobody's tuned in a generation, by the door
  as(SURF.plank, () => { put('box', cx + 5.5, fy + 0.68, cz + 5.2, 0.62, 1.36, 1.5, darker); put('box', cx + 5.12, fy + 0.74, cz + 5.2, 0.36, 0.06, 1.4, [0.8, 0.76, 0.66]); });
  blockers.push({ x0: cx + 5.1, x1: cx + 5.9, z0: cz + 4.4, z1: cz + 6 });
  addThing({ id: 'cog:piano', name: 'The piano', verb: 'Press a key', x: cx + 4.8, y: fy + 0.9, z: cz + 5.2, r: 1.2, prov: X('the Cog'), use: () => { sfx.plink && sfx.plink(spot(cx + 5.5, cz + 5.2, 10)); bark('A note that was a note once. Somebody at the bar says something about my teeth. I leave the piano alone.', X('the Cog')); } });
}

// ---------- Water Square: the Miser-Boab, tapped; the Gallows-Gums; water handed out, and taxed ----------
function buildWaterSquare() {
  const s = SITE.water, ax = arteryX(s.z), sx0 = ax - ARTERY_HALF - 36, sx1 = ax - ARTERY_HALF, cx = sx0 + 18.5, cz = s.z + 7, y = h(cx, cz);
  // the boab: a swollen bottle of a trunk, pale and calcified and folded like a stomach, no leaves at all, its branches straight out of the top
  const prof = [[0, -0.4], [3.3, -0.4], [3.55, 0.6], [3.75, 2.2], [3.6, 3.8], [3.15, 5.4], [2.45, 6.8], [1.7, 8.0], [1.2, 9.0], [1.05, 9.8], [0.9, 10.3], [0, 10.4]].map(([r, yy]) => new THREE.Vector2(r, yy));
  const trunk = new THREE.LatheGeometry(prof, 40), tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), yy = tp.getY(i), a = Math.atan2(z, x), f = 1 + 0.06 * Math.sin(a * 7 + yy * 0.7) + 0.035 * Math.sin(a * 13 - yy * 1.9) + 0.03 * Math.sin(yy * 3.1 + a * 2); tp.setX(i, x * f); tp.setZ(i, z * f); }
  trunk.computeVertexNormals(); uvScale(trunk, 5, 3);
  const bm = mat({ map: boabTexture(), normalMap: T.leather.n, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xe2d8ce, roughness: 0.92 });
  const tr = mesh(trunk, bm); tr.position.set(cx, y, cz); add(tr);
  const limbs = [], tips = [];
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * TAU + R() * 0.5, len = rr(3.2, 4.6), r0 = [cx + Math.cos(a) * 0.5, y + 9.8, cz + Math.sin(a) * 0.5], tip = [r0[0] + Math.cos(a) * len, r0[1] + len * rr(0.25, 0.55), r0[2] + Math.sin(a) * len];
    limbs.push([new THREE.CylinderGeometry(0.2, 0.42, 1, 8), rodMX(r0, tip)]);
    for (const da of [-0.6, 0.7]) { const t2 = [tip[0] + Math.cos(a + da) * 1.4, tip[1] + 0.6, tip[2] + Math.sin(a + da) * 1.4]; limbs.push([new THREE.CylinderGeometry(0.08, 0.17, 1, 6), rodMX(tip, t2)]); }
    tips.push({ a, tip });
  }
  add(mesh(planarUV(merge(limbs), 1.5), bm));
  // the ground round it sucked dry: a dead white ring of salt
  { const ring = mesh(new THREE.CircleGeometry(11, 48), new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.85, transparent: true, depthWrite: false, alphaMap: radialTexture([[0, '#fff'], [0.45, '#ddd'], [0.8, '#555'], [1, '#000']]), polygonOffset: true, polygonOffsetFactor: -4 }), { cast: false });
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, y + 0.05, cz); add(ring); CITY.mats.push(ring.material); }
  blockers.push({ x: cx, z: cz, r: 3.9 });
  // the cages hung from three of its branches: public punishments, where everyone comes for water. Empty today
  for (const k of [0, 2, 5]) {
    const { tip } = tips[k], cg = add(new THREE.Group()); cg.position.set(tip[0], tip[1] - 0.2, tip[2]);
    const bars = [], drop = rr(3.2, 4.4);
    bars.push([new THREE.CylinderGeometry(0.03, 0.03, drop, 4), MX(0, -drop / 2, 0)]);
    for (let b = 0; b < 12; b++) { const ba = b / 12 * TAU; bars.push([new THREE.CylinderGeometry(0.022, 0.022, 1.9, 4), MX(Math.cos(ba) * 0.55, -drop - 0.95, Math.sin(ba) * 0.55)]); }
    for (const yy of [-drop, -drop - 1.9]) bars.push([new THREE.TorusGeometry(0.55, 0.035, 4, 18), MX(0, yy, 0, Math.PI / 2, 0, 0)]);
    bars.push([new THREE.CylinderGeometry(0.56, 0.56, 0.04, 14), MX(0, -drop - 1.9, 0)], [new THREE.ConeGeometry(0.6, 0.4, 14, 1, true), MX(0, -drop + 0.2, 0)]);
    cg.add(mesh(merge(bars), M.iron)); PLACES.cages.push({ g: cg, ph: R() * 6 });
  }
  // the tap: a pipe driven into the trunk, a brass wheel, the spout over a stone trough, the ladle on its chain; and the queue's rails
  { const tx = cx + 3.7, ty = y + 1.15;
    put('cyl', tx + 0.6, ty, cz, 0.16, 1.4, 0.16, [0.6, 0.46, 0.24], 0, 0, Math.PI / 2); put('cyl', tx + 1.35, ty, cz, 0.12, 0.6, 0.12, [0.6, 0.46, 0.24]);
    put('cyl', tx + 1.35, ty + 0.38, cz, 0.42, 0.04, 0.42, [0.66, 0.52, 0.26]);                                                    // the wheel
    put('box', tx + 1.5, y + 0.35, cz, 1.0, 0.7, 2.0, [0.56, 0.52, 0.48], 0, 0, 0, SURF.sheet); put('box', tx + 1.5, y + 0.69, cz, 0.8, 0.02, 1.8, [0.16, 0.14, 0.12]);   // the trough, dark with what's in it
    for (const e of [-1, 1]) for (let k = 0; k < 4; k++) { const x = tx + 3 + k * 2.2; put('cyl', x, y + 0.5, cz + e * 1.1, 0.08, 1.0, 0.08, CC.RUSTS[3]); if (k) put('cyl', x - 1.1, y + 0.95, cz + e * 1.1, 0.05, 2.2, 0.05, CC.RUSTS[4], 0, 0, Math.PI / 2); }
    blockers.push({ x0: tx + 0.9, x1: tx + 2.1, z0: cz - 1.1, z1: cz + 1.1 });
    addThing({ id: 'water:tap', name: 'The tap in the boab', verb: 'Look', x: tx + 2.4, y: y + 1, z: cz, r: 1.8, prov: X('Water Square'), use: () => bark('They drove a pipe into the boab and put a wheel on it. One bit a ladle, and the ladle’s on a chain. Drink from a Miser-Boab and you’ll never share again, they say. Explains the tax.', X('Water Square')) });
  }
  // bollards round the boab, a chain slung between them
  { const pts = [];
    for (let k = 0; k < 18; k++) { const a = k / 18 * TAU, a2 = (k + 1) / 18 * TAU, bx = cx + Math.cos(a) * 6.4, bz = cz + Math.sin(a) * 6.4; if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) > 0) continue; put('cyl', bx, y + 0.5, bz, 0.24, 1.0, 0.24, CC.RUSTS[3]); for (let i = 0; i < 6; i++) { for (const t of [i / 6, (i + 1) / 6]) { const aa = lerp(a, a2, t); pts.push(cx + Math.cos(aa) * 6.4, y + 0.85 - Math.sin(t * Math.PI) * 0.25, cz + Math.sin(aa) * 6.4); } } blockers.push({ x: bx, z: bz, r: 0.2 }); }
    const l = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), M.wire); add(l); }
  // the tax booth where the queue comes in off the Artery
  { const kx = sx1 - 4.5, kz = cz + 5.5, ky = h(kx, kz);
    put('box', kx, ky + 1.35, kz, 2.4, 2.7, 2.4, [0.36, 0.4, 0.36], 0, 0, 0, SURF.corr); put('box', kx, ky + 2.78, kz, 3.0, 0.14, 3.0, [0.44, 0.38, 0.34], 0, 0, 0, SURF.corr);
    put('lit', kx + 1.22, ky + 1.6, kz, 0.04, 0.8, 1.4, CC.AMBER.map(v => v * 0.5)); put('box', kx + 1.4, ky + 1.1, kz, 0.4, 0.08, 1.6, CC.RUSTS[4], 0, 0, 0, SURF.sheet);
    board([['WATER · BY THE LADLE', 66, 0.34], ['ONE BIT · NO CREDIT', 54, 0.72]], 2.6, 0.95, { bg: '#20261e', fg: '#e8e0c0', edge: '#7a8060' }, kx + 1.24, ky + 3.4, kz);
    CITY.lamps.push({ x: kx + 1.6, y: ky + 2.4, z: kz - 1.2 });
    blockers.push({ x0: kx - 1.2, x1: kx + 1.2, z0: kz - 1.2, z1: kz + 1.2 });
    addThing({ id: 'water:booth', name: 'The water-tax booth', verb: 'Look', x: kx + 1.8, y: ky + 1.3, z: kz, r: 1.8, prov: X('Water Square'), use: () => bark('Taxed coming in at the gate, taxed again here. The man in the booth counts ladles the way the Ironshell counts bits. I brought my own water. He looks at me like that’s theft.', X('Water Square')) }); }
  addThing({ id: 'water:boab', name: 'The Miser-Boab', verb: 'Look', x: cx + 4.4, y: y + 2.2, z: cz + 2.5, r: 3.4, prov: CG, use: () => bark('A Miser-Boab, the biggest I’ve ever seen. Pale as chalk and swollen like a stomach, holding more water than any tank in the city and not sparing a drop of it. The ground round it’s dead white for ten metres.', CG) });
  addThing({ id: 'water:cages', name: 'The cages', verb: 'Look up', x: cx, y: y + 2, z: cz - 5.5, r: 4, prov: X('Water Square'), use: () => bark('Cages, hung off the boab’s branches where everybody queuing for water has to look at them. Empty today. The chains still creak.', X('Water Square')) });
  // the Gallows-Gums on the square's north side, their limbs out over where the queue stands
  for (const gx of [sx0 + 5, sx0 + 27]) { const gz = s.z + 15.5; buildGum({ x: gx, z: gz, yaw: Math.atan2(cx - gx, cz - gz) }); }
  take(sx0, s.z - 18, sx1, s.z + 18, true);
}

// ---------- the markets: stalls in rows along the aisles ----------
function stall(x, z, yaw, w, d, kind) {
  const y = h(x, z), c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const tilt = 0.16, topAt = (lz) => y + 2.35 - lz * Math.tan(tilt);
  for (const lx of [-w / 2, w / 2]) for (const lz of [-d / 2, d / 2]) { const [px, pz] = at(lx, lz), t = topAt(lz); put('cyl', px, (y + t) / 2, pz, 0.08, t - y, 0.08, CC.RUSTS[3]); }
  put('cloth', x, topAt(0) + 0.03, z, w + 0.5, 0.04, (d + 0.7) / Math.cos(tilt), pick(CC.CLOTHS), tilt, yaw, 0);
  const [fx, fz] = at(0, d / 2 - 0.32); as(SURF.plank, () => put('box', fx, y + 0.45, fz, w * 0.95, 0.9, 0.62, CC.woodCol(), 0, yaw, 0));
  const front = (lx, up = 0.92) => { const [gx, gz] = at(lx, d / 2 - 0.32); return [gx, y + up, gz]; };
  // what's for sale
  for (let k = 0; k < 6; k++) {
    const [gx, gy, gz] = front(rr(-w * 0.42, w * 0.42)), q = R();
    if (kind === 'salvage') { if (q < 0.35) put('box', gx, gy + 0.08, gz, rr(0.2, 0.4), 0.16, rr(0.15, 0.3), CC.wallCol(0.3), 0, R() * 3, 0, SURF.sheet); else if (q < 0.65) put('cyl', gx, gy + 0.06, gz, rr(0.18, 0.3), 0.06, rr(0.18, 0.3), CC.RUSTS[q < 0.5 ? 2 : 4]); else put('cyl', gx, gy + 0.12, gz, 0.07, 0.24, 0.07, [0.6, 0.48, 0.26]); }
    else { if (q < 0.35) put('box', gx, gy + 0.1, gz, 0.3, 0.2, 0.3, CC.woodCol(), 0, R(), 0, SURF.plank); else if (q < 0.7) put('cyl', gx, gy + 0.13, gz, 0.13, 0.26, 0.13, pick([[0.5, 0.42, 0.3], [0.4, 0.5, 0.3], [0.56, 0.3, 0.2], [0.7, 0.66, 0.52]])); else put('dome', gx, gy - 0.02, gz, 0.22, 0.2, 0.22, pick(CC.CLOTHS)); }
  }
  for (let k = 0; k < 3; k++) { const [gx, gz] = at(rr(-w * 0.4, w * 0.4), d / 2 + 0.05); put('box', gx, y + 1.85, gz, 0.1, rr(0.3, 0.55), 0.1, kind === 'salvage' ? CC.RUSTS[4] : pick([[0.42, 0.22, 0.12], [0.5, 0.4, 0.2], [0.36, 0.3, 0.18]])); }   // hung from the frame
  for (let k = Math.floor(R() * 3); k > 0; k--) { const [gx, gz] = at(rr(-w / 2, w / 2), -d / 2 - 0.4); put('box', gx, y + 0.3, gz, 0.6, 0.6, 0.6, CC.woodCol(), 0, R(), 0, SURF.plank); }
  if (kind === 'salvage' && R() < 0.5) { const [gx, gz] = at(w / 2 + 0.8, 0); put('dome', gx, y - 0.1, gz, 0.9, 0.6, 0.9, CC.RUSTS[1]); }                        // a heap of it on the ground
  if (R() < 0.45) CITY.lamps.push({ x, y: y + 2.1, z, hung: true });
  blockers.push({ x, z, r: Math.max(w, d) * 0.5 });
}
function marketRows(x0, x1, rows, kind, gaps = 0.14) {
  for (const [z, yaw] of rows) for (let x = x0 + 1.8; x < x1 - 1.6; x += rr(4.3, 5.2)) { if (R() < gaps) continue; stall(x, z, yaw, rr(2.7, 3.4), rr(1.8, 2.2), kind); }
}
function buildMarkets() {
  { const s = SITE.market, ax = arteryX(s.z), x0 = ax + ARTERY_HALF + 2.5, x1 = CASTE_W - 4, lz = LANES[3].z;
    marketRows(x0, x1, [[lz + 5.2, Math.PI], [lz - 5.2, 0], [lz + 8.6, 0], [lz + 15.4, Math.PI], [lz - 8.6, Math.PI], [lz - 15.2, 0]], 'food');
    // the scales where scrap is weighed, by the way in off the Artery
    { const wx = x0 + 1.5, wz = lz + 11.5, wy = h(wx, wz);
      put('cyl', wx, wy + 1.4, wz, 0.18, 2.8, 0.18, CC.RUSTS[3]); put('box', wx, wy + 2.85, wz, 0.12, 0.12, 3.0, CC.RUSTS[4], 0.06, 0, 0, SURF.sheet);
      for (const e of [-1, 1]) { rod(wx, wy + 2.85 + e * 0.09, wz + e * 1.4, wx, wy + 1.3, wz + e * 1.4, 0.02, CC.RUSTS[4]); put('cyl', wx, wy + 1.25, wz + e * 1.4, 1.1, 0.06, 1.1, CC.RUSTS[2]); }
      put('box', wx, wy + 1.4, wz + 1.4, 0.6, 0.3, 0.5, CC.wallCol(0.3), 0, 0.4, 0, SURF.sheet);
      blockers.push({ x: wx, z: wz, r: 0.3 });
      addThing({ id: 'market:scales', name: 'The scrap scales', verb: 'Look', x: wx + 1.2, y: wy + 1.4, z: wz, r: 1.8, prov: X('the Central Market'), use: () => bark('Scrap weighed against stamped iron. Somebody filed the stamped iron. Nobody says anything about it.', X('the Central Market')) }); }
    addThing({ id: 'market', name: 'The Central Market', verb: 'Look', x: x0 + 4, y: h(x0, lz) + 1.5, z: lz, r: 5, prov: X('the Central Market'), use: () => bark('Food, tools, salvage, gossip and vice, all on the one square, and everybody shouting. Nobody looks at my face for long.', X('the Central Market')) }); }
  { const s = SITE.lower, ax = arteryX(s.z), x0 = ax + ARTERY_HALF + 2, x1 = ax + ARTERY_HALF + 25;
    marketRows(x0, x1, [[s.z - 9.5, 0], [s.z - 2.5, Math.PI], [s.z + 2.5, 0], [s.z + 9.5, Math.PI]], 'salvage', 0.18);
    addThing({ id: 'lower', name: 'The Lower Market', verb: 'Look', x: x0 + 3, y: h(x0, s.z) + 1.5, z: s.z, r: 5, prov: X('the Lower Market'), use: () => bark('Rat-kin salvage, mostly: bolts sorted by size into tins, wire by the coil, gears nobody’s needed in years. Everything here was something else first.', X('the Lower Market')) }); }
}

// ---------- Scrimp's stall, and the others round it by the stamp-mills ----------
function buildScrimp() {
  const s = SITE.scrimp, y = h(s.x, s.z);
  take(s.x - 1.8, s.z - 4, s.x + 4, s.z + 4);
  // a table of junk, and everything Scrimp can't let go of piled behind it, under a tarp
  as(SURF.plank, () => put('box', s.x, y + 0.42, s.z, 1.2, 0.84, 2.8, [0.42, 0.3, 0.2]));
  for (let k = 0; k < 46; k++) { const q = R(), gx = s.x + rr(-0.5, 0.5), gz = s.z + rr(-1.3, 1.3); if (q < 0.45) put('cyl', gx, y + 0.88, gz, 0.045, 0.08, 0.045, [0.42, 0.4, 0.36]); else if (q < 0.75) put('box', gx, y + 0.86, gz, 0.04, 0.02, 0.2, [0.64, 0.62, 0.58], 0, R() * 3, 0, SURF.sheet); else put('cyl', gx, y + 0.9, gz, 0.08, 0.1, 0.08, [0.7, 0.55, 0.28]); }   // bolts, spoons, valves
  for (let k = 0; k < 14; k++) put(R() < 0.6 ? 'box' : 'cyl', s.x + rr(1.2, 3.2), y + rr(0.2, 1.4), s.z + rr(-2.4, 2.4), rr(0.3, 0.8), rr(0.3, 0.7), rr(0.3, 0.8), CC.wallCol(0.3), R(), R(), R(), SURF.sheet);
  as(SURF.plank, () => { for (const yy of [0.5, 1.2, 1.9]) put('box', s.x + 3.4, y + yy, s.z, 0.5, 0.05, 4.4, [0.38, 0.28, 0.2]); });
  for (let k = 0; k < 24; k++) put('cyl', s.x + 3.4, y + [0.5, 1.2, 1.9][k % 3] + 0.12, s.z - 2 + (k / 24) * 4, 0.1, 0.18, 0.1, pick([[0.6, 0.5, 0.3], [0.4, 0.4, 0.38], [0.5, 0.3, 0.2]]));   // tins of everything
  put('cloth', s.x + 1.6, y + 2.5, s.z, 4.4, 0.05, 5.4, [0.44, 0.36, 0.28], 0, 0, -0.14);
  for (const [dx, dz] of [[-0.6, -2.5], [-0.6, 2.5], [3.7, -2.5], [3.7, 2.5]]) put('cyl', s.x + dx, y + 1.25 + dx * 0.04, s.z + dz, 0.07, 2.5, 0.07, CC.RUSTS[3]);
  board([['SCRIMP · BUYS · SELLS · KEEPS', 56, 0.5]], 2.6, 0.4, { w: 768, h: 118, bg: '#2a241c', fg: '#e8d8b0', edge: '#6a5a40' }, s.x - 0.65, y + 2.15, s.z, -Math.PI / 2);
  blockers.push({ x0: s.x - 0.6, x1: s.x + 3.7, z0: s.z - 2.5, z1: s.z + 2.5 });
  PLACES.scrimp = { x: s.x - 1.1, z: s.z + 0.4, y, yaw: -Math.PI / 2 };
  addThing({ id: 'scrimp', name: 'Scrimp’s stall', verb: 'Ask about the valve', x: s.x - 1.2, y: y + 1, z: s.z, r: 2.4, prov: C2, use: scrimpValve });
  // the others round his: grubs, rope, lamps
  for (const [dx, dz] of [[0.6, -9], [0.6, 9], [5.5, -15], [6, 15]]) { const x = s.x + dx + 1, z = s.z + dz; take(x - 1.8, z - 2, x + 1.8, z + 2); stall(x, z, -Math.PI / 2, rr(2.6, 3.2), 2, R() < 0.5 ? 'salvage' : 'food'); }
}
// "Three bits. And you promise to polish it."
function scrimpValve() {
  if (S.flags.intakeValve) { bark('Scrimp’s already polishing the place in his coat where the valve used to be. He won’t look at me.', C2); return; }
  if (!hooks.choice) return;
  bark('“The valve! The valve, ah. I have it. Yes. But do you need it? Truly? It is a good valve. A vintage valve.”', C2);
  hooks.choice({ title: 'Scrimp’s intake valve', note: '“Three bits. And you promise to polish it.”', prov: C2, options: [
    { label: 'Three bits', sub: `${GS.bits} in the pouch`, disabled: GS.bits < 3, pick: () => {
      GS.bits -= 3; S.flags.intakeValve = true;
      for (let k = 0; k < 3; k++) setTimeout(() => sfx.clink(), k * 120);
      bark('He catches the crystals out of the air and has them in his cheek before I see his hand move. The valve comes out of a pocket that goes down to his ankles, like a mother giving up a child. “You are reckless, Jacob.” Can’t save time, Scrimp.', C2);
    } },
    { label: 'Not today', sub: 'he’ll keep it', pick: () => bark('Scrimp clutches the valve to his chest like I tried to take it anyway.', X('Scrimp')) },
  ] });
}

// ---------- the stamp-mills: the district's heartbeat ----------
function buildStampMills() {
  const s = SITE.stamps, y = h(s.x, s.z), Lz = 13, n = 10;
  take(s.x - 7.5, s.z - Lz / 2 - 6, s.x + 6, s.z + Lz / 2 + 2);
  // the frame: posts and beams of old rail, a gable roof of iron over it, open on the sides so the dust can get out
  for (const e of [-1, 1]) for (let k = 0; k <= 4; k++) { const z = s.z - Lz / 2 + k * Lz / 4; put('box', s.x + e * 2.4, y + 4.4, z, 0.32, 8.8, 0.32, CC.RUSTS[4], 0, 0, 0, SURF.sheet); blockers.push({ x: s.x + e * 2.4, z, r: 0.25 }); }
  for (const yy of [8.6, 4.6, 2.3]) for (const e of [-1, 1]) put('box', s.x + e * 2.4, y + yy, s.z, 0.3, 0.3, Lz + 0.4, CC.RUSTS[3], 0, 0, 0, SURF.sheet);
  for (const e of [-1, 1]) put('box', s.x + e * 1.75, y + 9.35, s.z, 3.8, 0.08, Lz + 1.6, [0.46, 0.38, 0.32], 0, 0, -e * 0.42, SURF.corr);
  for (const yy of [2.3, 4.6]) put('box', s.x, y + yy, s.z, 4.8, 0.28, 0.3, CC.RUSTS[3], 0, 0, 0, SURF.sheet);
  // the mortar boxes the stamps fall into, two batteries of five; the cam shaft over them
  for (const e of [-1, 1]) put('box', s.x, y + 0.55, s.z + e * 3.3, 1.6, 1.1, 3.4, CC.RUSTS[1], 0, 0, 0, SURF.sheet);
  const camM = new THREE.Group(); camM.position.set(s.x - 0.55, y + 6.4, s.z); add(camM);
  const camParts = [[new THREE.CylinderGeometry(0.16, 0.16, Lz, 10).rotateX(Math.PI / 2), new THREE.Matrix4()]];
  const stems = [];
  for (let k = 0; k < n; k++) {
    const bat = k < 5 ? -1 : 1, i = k % 5, z = s.z + bat * 3.3 + (i - 2) * 0.62, order = [0, 2, 4, 1, 3][i];
    stems.push({ z, ph: order / 5 * TAU + (bat > 0 ? 0.37 : 0), live: bat < 0, hung: bat > 0 && i !== 2 });
    camParts.push([new THREE.BoxGeometry(0.62, 0.12, 0.2), MX(0.2, 0, z - s.z, 0, 0, order / 5 * TAU)]);
  }
  camM.add(mesh(merge(camParts), M.iron)); PLACES.cams.push(camM);
  // each stamp: a long stem through the guides, its tappet, the heavy head and shoe; one instanced draw, moved every frame
  const stamp = merge([[new THREE.CylinderGeometry(0.075, 0.075, 5.2, 8), MX(0, 3.1, 0)], [new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10), MX(0, 4.6, 0)], [new THREE.CylinderGeometry(0.26, 0.26, 0.75, 12), MX(0, 0.62, 0)], [new THREE.CylinderGeometry(0.24, 0.27, 0.25, 12), MX(0, 0.12, 0)]]);
  const im = new THREE.InstancedMesh(stamp, M.iron, n); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; add(im);
  PLACES.stamps = { im, stems, x: s.x - 0.55, y0: y + 1.1, m: new THREE.Matrix4() };
  // the engine that drives it: a boiler, its stack, a flywheel and a belt up to the shaft
  { const ex = s.x - 5.2, ez = s.z - Lz / 2 - 2.5;
    put('cyl', ex, y + 1.4, ez, 2.2, 3.8, 2.2, [0.3, 0.27, 0.25], Math.PI / 2, 0, 0); put('cyl', ex, y + 5.5, ez - 1.2, 0.6, 5.4, 0.6, CC.RUSTS[3]);
    W.smoke.push({ x: ex, y: y + 8.4, z: ez - 1.2, rate: 1.0, mat: M.smoke, size: 0.7, near: 400, life: 9 });
    const fly = add(new THREE.Group()); fly.position.set(ex + 2.2, y + 2.4, ez + 1.5);
    const fw = [[new THREE.TorusGeometry(1.5, 0.16, 6, 28), new THREE.Matrix4()]]; for (let k = 0; k < 6; k++) fw.push([new THREE.BoxGeometry(0.1, 2.9, 0.1), MX(0, 0, 0, 0, 0, k * Math.PI / 6)]);
    const fm = mesh(merge(fw), M.iron); fm.rotation.y = Math.PI / 2; fly.add(fm); PLACES.fly = fm;
    rod(ex + 2.2, y + 3.9, ez + 1.5, s.x - 0.55, y + 6.6, s.z - Lz / 2, 0.05, [0.12, 0.1, 0.09]); rod(ex + 2.2, y + 0.9, ez + 1.5, s.x - 0.55, y + 6.2, s.z - Lz / 2, 0.05, [0.12, 0.1, 0.09]);   // the belt
    blockers.push({ x0: ex - 1.2, x1: ex + 1.2, z0: ez - 2, z1: ez + 2 }); }
  // the ore: a bin behind fed down a chute; the crushed stuff red as the ground, heaped where it comes out
  put('box', s.x + 3.9, y + 4.6, s.z, 2.4, 3.2, Lz - 2, CC.RUSTS[1], 0, 0, 0, SURF.sheet); for (const e of [-1, 1]) for (const zz of [-4, 0, 4]) put('box', s.x + 3.9 + e * 1.0, y + 1.5, s.z + zz, 0.25, 3.0, 0.25, CC.RUSTS[4], 0, 0, 0, SURF.sheet);
  put('box', s.x + 2.2, y + 3.5, s.z, 1.6, 0.1, Lz - 3, CC.RUSTS[3], 0, 0, 0.55, SURF.sheet);
  put('dome', s.x - 4.6, y - 0.4, s.z + 1, 2.6, 1.9, 5.2, [0.56, 0.3, 0.2]); put('dome', s.x - 4.2, y - 0.3, s.z - 5, 1.8, 1.1, 2.4, [0.6, 0.34, 0.24]);
  blockers.push({ x0: s.x - 1.2, x1: s.x + 5.2, z0: s.z - Lz / 2, z1: s.z + Lz / 2 }, { x: s.x - 4.6, z: s.z + 1, r: 2.4 });
  addThing({ id: 'stamps', name: 'The stamp-mills', verb: 'Look', x: s.x - 3.2, y: y + 1.5, z: s.z - 4, r: 3.4, prov: C2, use: () => bark('The old stamp-mills. Iron feet lifted on the cams and dropped on the ore, one after another, all day. THOOM. THOOM. THOOM. The heartbeat of the district. Half the second battery is hung up and nobody’s mending it.', C2) });
}

// ---------- the Bones: mine towers built like dead steamforged ----------
function buildBones() {
  const bone = new THREE.MeshStandardMaterial({ map: T.iron.c, normalMap: T.iron.n, color: 0x4c4642, roughness: 0.55, metalness: 0.8 }), parts = [], OFF = [[-1, 0], [-1, 0], [0, -1], [0, -1]];
  const seg = (A, B, r0, r1, sides = 7) => parts.push([new THREE.CylinderGeometry(r1, r0, 1, sides, 1, true), rodMX(A, B)]);
  SITE.bones.forEach(([bx, bz, ht], bi) => {
    const y = h(bx, bz), spread = ht * 0.16, top = y + ht;
    take(bx - spread - 2, bz - spread - 2, bx + spread + 2, bz + spread + 2);
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ a, b }));
    const at = (L, t) => [bx + L.a * spread * (1 - t * 0.78), lerp(y - 0.5, top, t), bz + L.b * spread * (1 - t * 0.78)];
    for (const L of legs) {
      const n = Math.round(ht / 1.35);
      for (let k = 0; k < n; k++) {
        const A = at(L, k / n), B = at(L, (k + 0.78) / n), C = at(L, (k + 0.89) / n);
        seg(A, B, 0.42, 0.36);                                                                       // the body of a vertebra
        parts.push([new THREE.CylinderGeometry(0.56, 0.56, 0.14, 8), rodMX(B, C)]);                 // the disc
        const out = v3(L.a, 0, L.b).normalize();                                                       // and its spine, sticking out
        parts.push([new THREE.BoxGeometry(0.14, 0.5, 0.75), MX(B[0] + out.x * 0.55, B[1] - 0.1, B[2] + out.z * 0.55, 0, Math.atan2(out.x, out.z), 0)]);
      }
      blockers.push({ x: at(L, 0)[0], z: at(L, 0)[2], r: 0.7 });
    }
    // ribs between the legs, curving out and down like a chest's, a set every few metres
    for (let yy = 7; yy < ht - 6; yy += 6.2) {
      const t = yy / ht;
      for (let f = 0; f < 4; f++) {
        const A = at(legs[f], t), B = at(legs[(f + 1) % 4], t), mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2, out = v3(mx - bx, 0, mz - bz).normalize(), bow = spread * (1 - t * 0.78) * 0.32;
        let prev = A;
        for (let i = 1; i <= 5; i++) { const u = i / 5, w = Math.sin(u * Math.PI), p = [lerp(A[0], B[0], u) + out.x * bow * w, lerp(A[1], B[1], u) - w * 1.2, lerp(A[2], B[2], u) + out.z * bow * w]; seg(prev, p, 0.2, 0.17, 6); prev = p; }
      }
    }
    // the head on top: a steamforged's, its faceplate split, the eyes put out, but something still glowing in them
    parts.push([new THREE.BoxGeometry(3.4, 2.6, 3.0), MX(bx, top + 1.3, bz)], [new THREE.BoxGeometry(2.8, 0.9, 0.6), MX(bx, top + 0.45, bz + 1.5, 0.2, 0, 0)], [new THREE.BoxGeometry(0.2, 2.2, 0.2), MX(bx + 0.4, top + 1.4, bz + 1.52, 0, 0, 0.3)]);
    for (const e of [-1, 1]) { parts.push([new THREE.CylinderGeometry(0.38, 0.46, 2.0, 10), MX(bx + e * 1.25, top + 3.4, bz - 0.7)]); put('lit', bx + e * 0.72, top + 1.55, bz + 1.52, 0.5, 0.32, 0.04, [2.6, 0.7, 0.22]); }
    for (const e of [-1, 1]) W.smoke.push({ x: bx + e * 1.25, y: top + 4.5, z: bz - 0.7, rate: 0.5, mat: STEAM, size: 0.8, life: 6 });
    // the sheave wheel over the head, and the winding cables running down to the engine house
    const sh = new THREE.Group(); sh.position.set(bx, top + 5.6, bz + 0.4); G.scene.add(sh);
    const sv = [[new THREE.TorusGeometry(2.0, 0.16, 6, 28), new THREE.Matrix4()]]; for (let k = 0; k < 8; k++) sv.push([new THREE.BoxGeometry(0.1, 3.9, 0.1), MX(0, 0, 0, 0, 0, k * Math.PI / 8)]);
    const wheel = mesh(merge(sv), M.iron); wheel.rotation.y = Math.PI / 2; sh.add(wheel); PLACES.sheaves.push(wheel);
    parts.push([new THREE.BoxGeometry(0.3, 2.6, 0.3), MX(bx - 0.4, top + 4.0, bz + 0.4)], [new THREE.BoxGeometry(0.3, 2.6, 0.3), MX(bx + 0.4, top + 4.0, bz + 0.4)]);
    const [ox, oz] = OFF[bi], wx = bx + ox * (spread + 16), wz = bz + (oz ? oz * (spread + 14) : -6), wy = h(wx, wz), face = ox ? -ox : 0;
    put('box', wx, wy + 2.2, wz, 7, 4.4, 6, CC.wallCol(0.25), 0, 0, 0, SURF.corr); put('box', wx, wy + 4.5, wz, 7.6, 0.1, 6.6, [0.46, 0.38, 0.33], 0, 0, 0.1, SURF.corr); if (face) put('dark', wx + face * 3.52, wy + 1.4, wz, 0.06, 2.6, 2.4, CC.DARK); else put('dark', wx, wy + 1.4, wz + 3.02, 2.4, 2.6, 0.06, CC.DARK);
    blockers.push({ x0: wx - 3.5, x1: wx + 3.5, z0: wz - 3, z1: wz + 3 }); take(wx - 4, wz - 3.5, wx + 4, wz + 3.5);
    CITY.cables = CITY.cables || []; CITY.cables.push([bx, top + 5.6 + 2.0, bz + 0.4, wx, wy + 3.4, wz], [bx, top + 5.6 - 2.0, bz + 0.4, bx, y - 1, bz + 0.4]);
    // the shaft under it: a black square in the ground with a collar of sleepers round it
    put('box', bx, y - 0.02, bz, 3.2, 0.06, 3.2, [0.02, 0.018, 0.016]); for (const e of [-1, 1]) { put('box', bx + e * 1.8, y + 0.15, bz, 0.4, 0.3, 4, CC.woodCol(), 0, 0, 0, SURF.plank); put('box', bx, y + 0.15, bz + e * 1.8, 4, 0.3, 0.4, CC.woodCol(), 0, 0, 0, SURF.plank); }
    for (const e of [-1, 1]) CITY.lamps.push({ x: bx + e * spread * 0.4, y: y + ht * 0.45, z: bz + spread * 0.4 });
  });
  const m = mesh(planarUV(merge(parts), 1.6), bone); m.receiveShadow = true; G.scene.add(m);
  const b1 = SITE.bones[1];
  addThing({ id: 'bones', name: 'The Bones', verb: 'Look up', x: b1[0] - 8, y: h(b1[0], b1[1]) + 2, z: b1[1] - 9, r: 7, prov: X('the Bones'), use: () => bark('The Bones. Mine towers built out of steamforged too far gone to scrub: spines for legs, ribs for bracing, a head on top with the eyes put out. Something in the eyes still glows. The cables still run. The city stands on its dead, and the dead are still at work.', X('the Bones')) });
}

// ---------- the refinery: stacks belching yellow-black, tanks, a flare ----------
function buildRefinery() {
  const s = SITE.refinery, y = h(s.x, s.z), parts = [], rust = [];
  take(s.x - 24, s.z - 18, s.x + 20, s.z + 26);
  for (const [dx, dz, ht] of [[0, 0, 48], [-10, 7, 40], [9, 10, 44], [-4, -11, 36]]) {
    const x = s.x + dx, z = s.z + dz, yy = h(x, z);
    parts.push([uvScale(new THREE.CylinderGeometry(1.5, 2.3, ht, 18, 1, true), 4, ht / 3), MX(x, yy + ht / 2, z)]);
    for (let k = 1; k < 5; k++) rust.push([new THREE.TorusGeometry(2.3 - 0.8 * k / 5 + 0.08, 0.14, 6, 20), MX(x, yy + ht * k / 5, z, Math.PI / 2, 0, 0)]);
    rust.push([new THREE.TorusGeometry(1.6, 0.22, 6, 20), MX(x, yy + ht - 0.4, z, Math.PI / 2, 0, 0)]);
    for (let k = 0; k < 3; k++) rust.push([new THREE.CylinderGeometry(0.05, 0.05, ht - 2, 4), MX(x + Math.cos(k * 2.1) * 2.0, yy + ht / 2, z + Math.sin(k * 2.1) * 2.0)]);   // the stays
    W.smoke.push({ x, y: yy + ht + 1, z, rate: 1.6, mat: M.yellowSmoke, size: 2.6 });
    blockers.push({ x, z, r: 2.4 });
  }
  for (const [dx, dz, r, ht] of [[13, -7, 4.2, 7], [15, 4, 3.6, 6], [-15, -6, 4.6, 8]]) { const x = s.x + dx, z = s.z + dz; parts.push([uvScale(new THREE.CylinderGeometry(r, r, ht, 24), 8, 2), MX(x, h(x, z) + ht / 2, z)], [uvScale(new THREE.SphereGeometry(r, 24, 6, 0, TAU, 0, 0.5), 6, 1), MX(x, h(x, z) + ht - r * Math.cos(0.5), z)]); blockers.push({ x, z, r: r + 0.2 }); }
  for (let k = 0; k < 5; k++) rust.push([new THREE.CylinderGeometry(0.28, 0.28, 30, 8), MX(s.x + 2, y + 5.5 + k * 0.62, s.z + 2, Math.PI / 2, 0.5 + k * 0.03, 0)]);
  for (let k = 0; k < 6; k++) rust.push([new THREE.BoxGeometry(0.3, 6.5, 0.3), MX(s.x + 2 + Math.sin(0.5) * (k - 2.5) * 5, y + 3.2, s.z + 2 + Math.cos(0.5) * (k - 2.5) * 5)]);   // the rack's legs
  rust.push([new THREE.CylinderGeometry(0.5, 0.6, 30, 10), MX(s.x - 20, y + 15, s.z + 16)]);                             // the flare stack
  G.scene.add(mesh(merge(parts), M.rust)); G.scene.add(mesh(merge(rust), M.iron));
  put('box', s.x + 5, y + 4, s.z + 19, 16, 8, 10, [0.32, 0.3, 0.29], 0, 0, 0, SURF.corr); put('box', s.x + 5, y + 8.2, s.z + 19, 16.6, 0.3, 10.6, [0.4, 0.36, 0.33], 0, 0, 0, SURF.corr);
  blockers.push({ x0: s.x - 3, x1: s.x + 13, z0: s.z + 14, z1: s.z + 24 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.6, 0.45), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })); flame.position.set(s.x - 20, y + 31.6, s.z + 16); G.scene.add(flame);
  PLACES.flare = flame; W.smoke.push({ x: s.x - 20, y: y + 33.5, z: s.z + 16, rate: 1.0, mat: M.smoke, size: 1.2 });
  addThing({ id: 'refinery', name: 'The refinery', verb: 'Look', x: s.x + 22, y: y + 2, z: s.z, r: 6, prov: C2, use: () => bark('The refinery stacks, belching thick, yellow-black smoke into what was a clean sky this morning. The air tastes of it from here: old pennies, and something burnt that wasn’t meant to be.', C2) });
}

// ---------- the sheriff's station, on the Iron-Eye Approach ----------
function buildSheriff() {
  const lz = LANES[5].z, x0 = -36, x1 = -16, z1 = lz - 5.5, z0 = z1 - 21, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = h(cx, cz), grey = [0.38, 0.37, 0.36];
  const edge = arteryX(cz) - ARTERY_HALF;
  take(x0 - 4.5, z0 - 1, x1, z1); take(x1, z0, edge, z1 + 1, true); patch(x1, z0, edge - 0.3, z1 + 1, 0.95);
  put('box', cx, y + 4.6, cz, x1 - x0, 9.2, z1 - z0, grey, 0, 0, 0, SURF.sheet); put('box', cx, y + 9.45, cz, x1 - x0 + 0.8, 0.5, z1 - z0 + 0.8, [0.3, 0.29, 0.28], 0, 0, 0, SURF.sheet);
  for (let k = 0; k < 8; k++) { const z = z0 + 2 + k * (z1 - z0 - 4) / 7; for (const yy of [3, 6.8]) put('dark', x1 + 0.03, y + yy, z, 0.06, 1.3, 0.22, CC.DARK); }   // slits, not windows
  for (let k = 0; k < 7; k++) put('dark', x0 + 2 + k * (x1 - x0 - 4) / 6, y + 6.8, z1 + 0.03, 0.22, 1.3, 0.06, CC.DARK);
  // the front: iron doors up three steps, a trough where the Wolf-Guard drink, the board
  put('box', x1 + 0.08, y + 1.6, cz, 0.16, 3.2, 3.0, [0.24, 0.23, 0.22], 0, 0, 0, SURF.sheet); for (const e of [-1, 1]) put('box', x1 + 0.2, y + 1.6, cz + e * 0.75, 0.06, 3.0, 0.08, [0.16, 0.15, 0.14]);
  for (let k = 0; k < 3; k++) put('box', x1 + 0.6 + k * 0.4, y + 0.15 + (2 - k) * 0.25 - 0.1, cz, 0.4, 0.3 + (2 - k) * 0.5, 4.2, [0.5, 0.48, 0.45], 0, 0, 0, SURF.sheet);
  put('box', x1 + 1.6, y + 0.45, cz + 5.5, 0.9, 0.9, 3.2, [0.34, 0.32, 0.3], 0, 0, 0, SURF.sheet); put('box', x1 + 1.6, y + 0.82, cz + 5.5, 0.7, 0.04, 3.0, [0.12, 0.11, 0.1]);
  blockers.push({ x0: x1 + 1.1, x1: x1 + 2.1, z0: cz + 3.9, z1: cz + 7.1 });
  board([['SHERIFF', 110, 0.4], ['PROCESSING · DETENTION · TAXES', 40, 0.78]], 6.4, 1.6, { bg: '#1a1816', fg: '#d8c8b0', edge: '#6a5a4a' }, x1 + 0.12, y + 4.4, cz);
  // the tower at the corner, and its lens: the Iron-Eye, turning over the street
  const tx = x1 - 3, tz = z1 - 3;
  put('box', tx, y + 9.5, tz, 5.4, 19, 5.4, [0.34, 0.33, 0.32], 0, 0, 0, SURF.sheet); put('box', tx, y + 19.2, tz, 6.2, 0.4, 6.2, [0.28, 0.27, 0.26], 0, 0, 0, SURF.sheet);
  const eye = new THREE.Group(); eye.position.set(tx, y + 20.8, tz); add(eye);
  const hood = mesh(new THREE.CylinderGeometry(1.5, 1.7, 2.4, 20, 1, true).rotateZ(Math.PI / 2), M.iron); hood.position.x = 1.0; eye.add(hood);
  eye.add(mesh(new THREE.BoxGeometry(2.4, 2.6, 2.6), M.ironshell));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a0402, emissive: 0xd8401a, emissiveIntensity: 1.8, roughness: 0.15 })); lens.position.x = 2.15; eye.add(lens);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 40, 20, 1, true).rotateZ(Math.PI / 2).translate(22, 0, 0), new THREE.MeshBasicMaterial({ color: 0xff7a40, transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); eye.add(beam);
  PLACES.eye = { g: eye, t: 0, yaw: 0, lens };
  // the yard behind, fenced in bars, and its gate onto the lane
  for (let z = z0; z <= z1; z += 0.5) put('cyl', x0 - 4.2, y + 1.9, z, 0.05, 3.8, 0.05, [0.2, 0.2, 0.2]);
  for (const zz of [z0, z1]) for (let x = x0 - 4.2; x < x0; x += 0.5) put('cyl', x, y + 1.9, zz, 0.05, 3.8, 0.05, [0.2, 0.2, 0.2]);
  blockers.push({ x0, x1, z0, z1 }, { x0: x0 - 4.5, x1: x0 - 3.9, z0, z1 }, { x0: x0 - 4.5, x1: x0, z0: z0 - 0.3, z1: z0 + 0.3 }, { x0: x0 - 4.5, x1: x0, z0: z1 - 0.3, z1: z1 + 0.3 });
  addThing({ id: 'sheriff', name: 'The sheriff’s station', verb: 'Look', x: x1 + 3, y: y + 2, z: cz - 3, r: 3.5, prov: X('the Iron-Eye Approach'), use: () => bark('The sheriff’s station: taxes, processing, detention, all behind the same iron. The lens up on the tower watches the whole Artery. It turned to look at me. I’d swear it did.', X('the Iron-Eye Approach')) });
  addThing({ id: 'sheriff:trough', name: 'The trough', verb: 'Look', x: x1 + 2.6, y: y + 0.8, z: cz + 5.5, r: 1.4, prov: C2, use: () => bark('A trough by the station door. Where the Wolf-Guard drink, and talk. Grumm heard them here: land seizures, “Public Safety”. Cogswell’s mutts.', C2) });
}

// ---------- the works: the yards between the landmarks up the Boneworks end ----------
function buildWorks() {
  // ore-cart rails from the Bones down to the stamp-mills, carts on them
  const a = { x: SITE.stamps.x + 4, z: SITE.stamps.z + 8 }, b = { x: SITE.bones[1][0] - 3, z: SITE.bones[1][1] - 12 }, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  for (let t = 0; t < len; t += 0.8) { const x = a.x + dx * t / len, z = a.z + dz * t / len; put('box', x, h(x, z) + 0.06, z, 1.5, 0.12, 0.22, CC.woodCol(), 0, yaw, 0, SURF.plank); }
  for (const e of [-0.5, 0.5]) for (let t = 0; t < len; t += 6) { const L2 = Math.min(6, len - t), x = a.x + dx * (t + L2 / 2) / len + Math.cos(yaw) * e, z = a.z + dz * (t + L2 / 2) / len - Math.sin(yaw) * e; put('box', x, h(x, z) + 0.17, z, 0.08, 0.1, L2, CC.RUSTS[4], 0, yaw, 0, SURF.sheet); }
  for (const t of [0.3, 0.36, 0.72]) { const x = a.x + dx * t, z = a.z + dz * t, y = h(x, z); put('box', x, y + 0.85, z, 1.2, 0.8, 1.8, CC.RUSTS[1], 0, yaw, 0, SURF.sheet); if (t < 0.5) put('dome', x, y + 1.2, z, 0.55, 0.4, 0.85, [0.58, 0.32, 0.22], 0, yaw, 0); for (const [u, v] of [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.6], [0.5, 0.6]]) put('cyl', x + Math.cos(yaw) * u + Math.sin(yaw) * v, y + 0.3, z - Math.sin(yaw) * u + Math.cos(yaw) * v, 0.4, 0.1, 0.4, [0.2, 0.18, 0.17], 0, yaw, Math.PI / 2); blockers.push({ x, z, r: 1.0 }); }
  // and round about: sheds, spoil, slag, drums, a water tower; wherever the landmarks and the street have left room
  const R2 = rng(777);
  for (let k = 0; k < 140; k++) {
    const x = lerp(EAST + 6, WEST - 6, R2()), z = lerp(2214, NORTH - 6, R2()), q = R2();
    if (z < 2262 && (x < CASTE_E + 3 || x > 44)) continue;
    const w = q < 0.4 ? lerp(5, 9, R2()) : lerp(2, 4.5, R2()), d = q < 0.4 ? lerp(4, 7, R2()) : w;
    if (!free(x - w / 2 - 1, z - d / 2 - 1, x + w / 2 + 1, z + d / 2 + 1)) continue;
    const y = h(x, z); take(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    if (q < 0.4) { const hh = lerp(3, 5, R2()); put('box', x, y + hh / 2, z, w, hh, d, CC.wallCol(0.2)); put('box', x, y + hh + 0.06, z, w + 0.4, 0.08, d + 0.4, [0.46, 0.38, 0.32], 0, 0, 0.08); put(R2() < 0.15 ? 'lit' : 'dark', x + w / 2 + 0.02, y + 1.4, z, 0.06, 2.8, 2.4, R2() < 0.5 ? CC.DARK : CC.AMBER.map(v => v * 0.4)); blockers.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); }
    else if (q < 0.62) { put('dome', x, y - 0.3, z, w / 2, lerp(1, 2.6, R2()), d / 2, R2() < 0.5 ? [0.56, 0.3, 0.2] : [0.2, 0.18, 0.17]); blockers.push({ x, z, r: w * 0.42 }); }   // spoil, or slag
    else if (q < 0.82) { for (let i = 0; i < 7; i++) put('cyl', x + (R2() - 0.5) * w, y + 0.5, z + (R2() - 0.5) * d, 0.62, 1.0, 0.62, R2() < 0.5 ? CC.RUSTS[1] : pick(CC.PAINTS)); blockers.push({ x, z, r: w * 0.45 }); }   // drums
    else if (q < 0.9) { put('cyl', x, y + 7.6, z, 3.2, 2.8, 3.2, CC.RUSTS[1]); for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('cyl', x + u * 1.2, y + 3.1, z + v * 1.2, 0.18, 6.2, 0.18, CC.RUSTS[4]); blockers.push({ x, z, r: 1.6 }); }   // a water tower
    else { for (let i = 0; i < 9; i++) put('box', x + (R2() - 0.5) * w, y + R2() * 1.2, z + (R2() - 0.5) * d, lerp(0.5, 2.2, R2()), lerp(0.3, 1.2, R2()), lerp(0.5, 2.4, R2()), CC.wallCol(0.2), R2() - 0.5, R2() * 3, R2() - 0.5); blockers.push({ x, z, r: w * 0.45 }); }   // a scrap heap
  }
}

// ---------- outside the wall: the abandoned homesteads ----------
function buildHomesteads() {
  const s = SITE.homesteads;
  for (const [dx, dz, yaw, ruin] of [[0, 0, 0.3, 0.4], [26, -20, -0.4, 0.8], [-8, 30, 1.2, 0.6], [32, 24, 0.8, 0.95]]) {
    const x = s.x + dx, z = s.z + dz, y = h(x, z), c = Math.cos(yaw), sn = Math.sin(yaw), at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    as(SURF.plank, () => {
      for (const [lx, lz, w, ht, along] of [[0, -3, 8, 2.7, true], [0, 3, 8, 2.7 * (1 - ruin * 0.6), true], [-4, 0, 6, 2.7 * (1 - ruin * 0.4), false], [4, 0, 6, 2.7, false]]) {
        const [px2, pz] = at(lx, lz), hh = Math.max(0.6, ht + (R() - 0.5) * 0.5);
        put('box', px2, y + hh / 2, pz, along ? w : 0.18, hh, along ? 0.18 : w, [0.56, 0.48, 0.4].map(v => v * rr(0.85, 1.05)), 0, yaw, (R() - 0.5) * 0.08);
      }
    });
    if (ruin < 0.7) { const [rx, rz] = at(0.5, -0.5); put('box', rx, y + 1.6, rz, 7.4, 0.07, 5.5, [0.46, 0.38, 0.32], 0.42 * ruin, yaw, 0.15, SURF.corr); }   // the roof, half in
    const [cx2, cz2] = at(-3.3, -2.4); put('box', cx2, y + 2.5, cz2, 0.8, 5.0, 0.8, [0.6, 0.36, 0.28], 0, yaw, 0, SURF.sheet);   // the chimney, last thing standing
    for (let k = 0; k < 8; k++) { const [fx2, fz2] = at(-7 + k * 2, 8); put('cyl', fx2, y + 0.6, fz2, 0.1, 1.2 - R() * 0.4, 0.1, [0.5, 0.44, 0.38], (R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3); }   // what's left of a fence
    blockers.push({ x, z, r: 4.6 });
  }
  // a windpump that stopped turning when the bore went dry
  { const x = s.x + 14, z = s.z + 6, y = h(x, z);
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(x + u * 1.4, y, z + v * 1.4, x + u * 0.25, y + 11, z + v * 0.25, 0.09, CC.RUSTS[4]);
    for (let k = 1; k < 5; k++) { const hh = y + k * 2.2, sp = 1.4 - k * 0.23; put('box', x, hh, z - sp, sp * 2, 0.06, 0.06, CC.RUSTS[4], 0, 0, 0, SURF.sheet); put('box', x, hh, z + sp, sp * 2, 0.06, 0.06, CC.RUSTS[4], 0, 0, 0, SURF.sheet); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + 0.2; if (k === 3 || k === 8) continue; put('box', x + 0.4, y + 11.3 + Math.sin(a) * 1.1, z + Math.cos(a) * 1.1, 0.04, 0.9, 0.3, CC.RUSTS[2], a, 0, 0, SURF.sheet); }
    put('box', x - 1.2, y + 11.3, z, 1.8, 0.7, 0.05, CC.RUSTS[3], 0, 0, 0, SURF.sheet);
    put('cyl', x + 4, y + 1.2, z + 3, 3.2, 2.4, 3.2, [0.52, 0.48, 0.44]); blockers.push({ x: x + 4, z: z + 3, r: 1.7 }, { x, z, r: 1.4 }); }
  addThing({ id: 'homesteads', name: 'The old homesteads', verb: 'Look', x: s.x - 6, y: h(s.x, s.z) + 1.4, z: s.z, r: 6, prov: X('the abandoned homesteads'), use: () => bark('Houses from before the wall. Somebody farmed here once, when there was something to farm. The city built its wall the other side of them and left them out. Looted, silent, and the desert taking them back a board at a time.', X('the abandoned homesteads')) });
}

// ---------- the crater, over the roofs to the north-east ----------
function buildCrater() {
  const c = SITE.crater, RAMP = 190, segs = 160, rag = (a) => 1 + 0.14 * Math.sin(a * 5 + 1) + 0.08 * Math.sin(a * 11 + 2.3) + 0.05 * Math.sin(a * 23);
  const lift = (r, a) => {
    if (r >= c.r) return c.rim * rag(a) * (1 - smooth(c.r, c.r + RAMP, r)) ** 1.6;                              // the ejecta: a long ramp up to the lip
    const t = (c.r - r) / c.r, bench = Math.floor(t * 9) / 9;                                                        // the inner walls, cut into benches by the mines
    return c.rim * rag(a) - 90 * smooth(0, 0.55, lerp(t, bench, 0.75));
  };
  const radii = []; for (let r = c.r - 90; r < c.r; r += 10) radii.push(r); for (let r = c.r; r <= c.r + RAMP; r += 10) radii.push(r);
  const pos = [], col = [], uv = [], idx = [], co = new THREE.Color();
  radii.forEach((r) => { for (let i = 0; i <= segs; i++) {
    const a = i / segs * TAU, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, l = lift(r, a), y = farHeight(x, z) + l - 0.7;
    pos.push(x, y, z); uv.push(x / 2.5, z / 2.5);
    const n = noise2(x * 3.1, z * 2.7) * 0.5 + 0.5, band = 0.5 + 0.5 * Math.sin(l * 0.45 + n);
    co.setRGB(1.0, 0.93, 0.88).multiplyScalar(0.82 + n * 0.3).lerp(new THREE.Color(0.86 + band * 0.2, 0.5 + band * 0.1, 0.38), smooth(4, 40, l) * 0.6); col.push(co.r, co.g, co.b);
  } });
  for (let j = 0; j < radii.length - 1; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i, b = a + 1, cc = a + segs + 1, d = cc + 1; idx.push(a, b, cc, b, d, cc); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSalt', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1)); g.setIndex(idx); g.computeVertexNormals();
  const m = mesh(g, M.ground, { cast: false }); m.frustumCulled = false; G.scene.add(m);
  // the mines work its inner walls: headframes along the lip on the town side, their lamps
  for (let k = 0; k < 7; k++) { const a = -1.05 + k * 0.17, r = c.r - 4, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = farHeight(x, z) + lift(r, a); put('box', x, y + 7, z, 1.6, 14, 1.6, CC.RUSTS[4], 0, a, 0, SURF.sheet); put('lit', x, y + 14.6, z, 0.9, 0.9, 0.9, [2.6, 1.5, 0.6]); }
}

export function buildPlaces() {
  buildCog(); buildWaterSquare(); buildMarkets(); buildScrimp(); buildStampMills(); buildBones(); buildRefinery(); buildSheriff(); buildWorks(); buildHomesteads(); buildCrater();
  // the light the jars throw on the floor under them: one draw of soft green pools
  if (POOLS.length) {
    const quads = POOLS.map(([x, y, z, r]) => [new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), MX(x, y + 0.012, z)]);
    add(mesh(merge(quads), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x2e7a46, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), { cast: false, receive: false }));
  }
  // the winding cables of the Bones
  if (CITY.cables) { const pts = []; for (const c of CITY.cables) pts.push(...c); const l = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), M.wire); l.frustumCulled = false; G.scene.add(l); }
}

// ---------- every frame ----------
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function updatePlaces(dt, cam) {
  const t = G.time, near = (x, z, r) => (x - cam.x) ** 2 + (z - cam.z) ** 2 < r * r;
  if (cam.z < 1700) return;
  // inside the Cog the sky's light can't reach: the eyes open up to the gloom (main.js), and the sky's reflections dim
  const c = PLACES.cog;
  if (c) {
    const inside = Math.abs(cam.x - c.cx) < 7.6 && cam.z > c.z0 && cam.z < c.z1 && cam.y < c.y + 12 ? 1 : 0;
    G.indoor = (G.indoor || 0) + (inside - (G.indoor || 0)) * Math.min(1, dt * 1.6);
    if (Math.abs(G.indoor - PLACES.inside) > 0.01) { PLACES.inside = G.indoor; for (const m of CITY.mats) m.envMapIntensity = (m.userData.env0 ?? 1) * (1 - 0.75 * G.indoor); }
    if (inside) once('cog:in', 'Dim in here. Fungus in mason jars for light, and the smoke isn’t only tobacco. My eyes take a moment. I’m looking for the biggest thing in the room.', C2);
  }
  // the blade over the Cog's door, swinging lazily, and creaking now and then
  if (PLACES.blade && near(PLACES.blade.x, PLACES.blade.z, 260)) {
    const b = PLACES.blade; b.t += dt; b.pivot.rotation.z = Math.sin(b.t * 0.33) * 0.03 + Math.sin(b.t * 0.11 + 2) * 0.015; b.pivot.rotation.x = Math.sin(b.t * 0.27 + 1) * 0.022; b.pivot.rotation.y = Math.sin(b.t * 0.07) * 0.08;
    if (near(b.x, b.z, 40) && Math.random() < dt * 0.08) sfx.creak(spot(b.x, b.z, 18));
  }
  if (PLACES.gear && near(c.fx, c.cz, 260)) { PLACES.gear.rotation.z += dt * 0.12; if (near(c.fx, c.cz, 30) && Math.random() < dt * 0.05) sfx.squeak(spot(c.fx, c.cz, 14)); }
  // the batwing doors: shoved open by whoever walks through, swinging back and forth till they settle
  if (c && near(c.fx, c.cz, 30)) for (const d of PLACES.doors) {
    const dx = P.x - c.fx, dz = P.z - c.cz, close = !S.inTractor && Math.abs(dx) < 1.3 && Math.abs(dz) < 1.4, want = close ? d.e * 1.25 * (dx > 0 ? 1 : -1) : 0;
    if (close && !d.was) sfx.hinge(spot(c.fx, c.cz, 8)); d.was = close;
    d.v += ((want - d.a) * 28 - d.v * 4.2) * dt; d.a += d.v * dt; d.g.rotation.y = d.a;
  }
  // the stamps: lifted on the cams one after another and dropped, THOOM
  const st = PLACES.stamps;
  if (st && near(SITE.stamps.x, SITE.stamps.z, 400)) {
    const rate = 2.1; let drops = 0;
    for (const cm of PLACES.cams) cm.rotation.z -= dt * rate;
    if (PLACES.fly) PLACES.fly.rotation.z -= dt * rate * 1.6;
    st.stems.forEach((s, i) => {
      let lift = 0;
      if (s.live) {
        const prev = s.ph; s.ph = (s.ph + dt * rate) % TAU;
        const u = s.ph / TAU; lift = u < 0.62 ? Math.sin(u / 0.62 * Math.PI / 2) * 0.55 : u < 0.68 ? 0.55 * (1 - (u - 0.62) / 0.06) ** 2 : 0;
        if (prev < 0.68 * TAU && s.ph >= 0.68 * TAU) drops++;
      } else if (s.hung) lift = 0.5;
      _p.set(st.x, st.y0 + lift, s.z); st.m.compose(_p, _q.identity(), _s); st.im.setMatrixAt(i, st.m);
    });
    st.im.instanceMatrix.needsUpdate = true;
    if (drops) { const sp = spot(SITE.stamps.x, SITE.stamps.z, 75); sfx.stamp && sfx.stamp(sp, drops); if (near(SITE.stamps.x, SITE.stamps.z, 50)) dustKick(SITE.stamps.x - 0.5, SITE.stamps.z - 3.3, 2, { size: 0.3, spread: 0.8, up: 0.5, alpha: 0.18, y: st.y0 + 0.2 }); }
  }
  for (const sv of PLACES.sheaves) sv.rotation.z += dt * 0.6;
  for (const cg of PLACES.cages) { cg.ph += dt; cg.g.rotation.z = Math.sin(cg.ph * 0.55) * 0.05; cg.g.rotation.x = Math.sin(cg.ph * 0.43 + 1) * 0.04; if (near(cg.g.position.x, cg.g.position.z, 22) && Math.random() < dt * 0.04) sfx.creak(spot(cg.g.position.x, cg.g.position.z, 10)); }
  // the Iron-Eye: sweeping the street, and turning to whoever comes close
  if (PLACES.eye) {
    const e = PLACES.eye, p = e.g.position; e.t += dt;
    const close = near(p.x, p.z, 45), want = close ? Math.atan2(-(cam.z - p.z), cam.x - p.x) : Math.PI * 0.05 + Math.sin(e.t * 0.13) * 0.85;
    let d = want - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); e.yaw += d * Math.min(1, dt * (close ? 0.9 : 0.4));
    e.g.rotation.y = e.yaw; e.g.rotation.z = close ? -Math.atan2(p.y - cam.y, Math.hypot(cam.x - p.x, cam.z - p.z)) * 0.8 : -0.12;
    e.lens.material.emissiveIntensity = 1.6 + Math.sin(e.t * 2.1) * 0.25 + (close ? 0.6 : 0);
    if (close) once('eye', 'The lens on the station tower’s turned my way. Iron-Eye. It doesn’t blink, because it can’t.', X('the Iron-Eye Approach'));
  }
  if (PLACES.flare) { const f = PLACES.flare; f.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 7.3) * 0.18 + Math.random() * 0.1, 1 + Math.cos(t * 11) * 0.08); f.material.opacity = 0.75 + Math.random() * 0.2; }
  // parked in the Cog's bay
  const b = PLACES.bay, tr = G.tractor;
  if (b && tr && S.inTractor && Math.abs(tr.x - b.x) < b.hw && Math.abs(tr.z - b.z) < b.hd && Math.abs(tr.speed) < 0.3) once('bay', 'In the bay outside the Rusty Cog. She’ll keep here. Mostly.', C2);
}
void clamp; void _e;
