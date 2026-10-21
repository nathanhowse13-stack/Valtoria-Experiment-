// ============================================================
// The life of the Red Waste, and the ruins in it. Everything here is
// a Field Guide or Chapter One/Two species doing what the books say
// it does; the tells and the counters are the game's (Experimental).
//
//   Gallows-gums (Guide)  line the canyon floor. They wait for someone to relax in their shade, then strike.
//                         Keep moving, stay on edge; the creak is the warning. (The look is Chapter Two's.)
//   Razor-spinifex (Ch2)  chokes the canyon floor past the gums, with a game trail through it.
//                         It thrashes at movement and lashes the hull. Creep, then punch it.
//   Salt-striders (Ch2)   raptor-like, bone-furred, blinking fifty feet at a time. They hunt
//                         the pans; on the ridge one weighs the tractor. Hold a boring speed.
//   Razor-back boars (Ch2), gossip-fly swarms and the wreck (Ch2), Sulphur-Salts (Ch2),
//   compass-weed (Ch1), Drop-Stalkers, Judas-Wattle, Argus-Bush (Field Guide), and from the
//   Farm of Rust sketch: thorny-devils, jaw-jaws, the Miser-Boab and the Iron-Bark Sentinel.
// ============================================================
import { THREE, TAU, clamp, lerp, smooth, rng, G, S, P, W, blockers, shades, addThing, bark, once, meet, hooks, MX, rodMX, planarUV, merge, mesh, M, SWAY, glowTexture, placeRelic, GUIDE, CH1, CH2, FARM, NEW } from './core.js';
import { h, roadDist, nearestRoad, canyonAxisX, CANYON, CAVE_MOUTHS, ridgeX, PITS, ADIT, saltAt, panX, TALLY, nearbySpinifex, addSpinifex, track, RESERVED, TOWERS, inCanyon } from './land.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _fwd = new THREE.Vector3();
const near = (a, x, z, r) => Math.hypot(a.x - x, a.z - z) < r;
const here = () => S.inTractor ? { x: G.tractor.x, z: G.tractor.z } : { x: P.x, z: P.z };

// ---------- where things are ----------
export const SITES = {
  shacks: [{ id: 'shack1', x: -46, z: 128 }, { id: 'shack2', x: -72, z: 520 }, { id: 'shack3', x: 60, z: 1585 }],
  gums: [], weeds: [{ x: 40, z: 150 }, { x: -56, z: 1108 }, { x: 46, z: 1232 }],
  wattle: { x: 58, z: 948 }, boab: { x: -66, z: 650 }, ironbark: { x: -118, z: 1372 },
  wreck: null, ridgeStalker: null,
};
for (let k = 0, z = 326; z < 474; z += 21, k++) {
  const side = k % 2 ? 1 : -1;
  if (side === CAVE_MOUTHS.den.side && Math.abs(z - CAVE_MOUTHS.den.z) < 14) continue;      // the den's mouth stays clear
  SITES.gums.push({ x: canyonAxisX(z) + side * (CANYON.half - 3.6), z, side });
}
SITES.gums.push({ x: TALLY.x + 17, z: TALLY.z + 82, side: 1 });                              // and one by Tally Bore, the best shade in town
{ const n = nearestRoad(-10, 1012); SITES.wreck = { x: (n.s ? n.s.x : 0) - 15, z: 1012 }; }
SITES.ridgeStalker = { x: ridgeX(1612) + 8, z: 1612 };
// keep the scatter clear of all of it
export function reserveLife() {
  for (const s of SITES.shacks) RESERVED.push({ x: s.x, z: s.z, r: 14 });
  for (const w of SITES.weeds) RESERVED.push({ x: w.x, z: w.z, r: 10 });
  RESERVED.push({ ...SITES.wattle, r: 20 }, { ...SITES.boab, r: 10 }, { ...SITES.ironbark, r: 8 }, { ...SITES.wreck, r: 18 });
}

// ---------- building ----------
export function buildLife() {
  SITES.shacks.forEach(buildShack);
  SITES.gums.forEach(buildGum);
  buildCanyonSpinifex();
  SITES.weeds.forEach(buildWeedPatch);
  buildWattle(SITES.wattle); buildBoab(SITES.boab); buildIronBark(SITES.ironbark);
  buildVines(); buildWreck();
  buildStalker(new THREE.Vector3(canyonAxisX(CAVE_MOUTHS.den.z) + CAVE_MOUTHS.den.side * (CANYON.half - 0.7), 6.55, CAVE_MOUTHS.den.z), CAVE_MOUTHS.den.side > 0 ? -Math.PI / 2 : Math.PI / 2, 'den');
  { const s = SITES.ridgeStalker, y = h(s.x, s.z); buildOutcrop(s.x, s.z); buildStalker(new THREE.Vector3(s.x, y + 4.4, s.z), Math.PI / 2, 'ridge'); }
  STRIDERS.pans = buildStrider(); STRIDERS.ridge = buildStrider();
  for (const [x, z] of [[46, 1150], [52, 1162], [40, 1170]]) boars.push(buildBoar(x, z));
  for (let k = 0; k < 3; k++) { const z = 1388 + k * 9; boars.push(buildBoar(ridgeX(z) + 4, z, true)); }
  const R = rng(808);
  for (let k = 0; k < 16; k++) {
    let x, z, tries = 0;
    do { z = 40 + R() * 1700; const n = nearestRoad(0, z); x = (n.s ? n.s.x : 0) + (R() < 0.5 ? -1 : 1) * (9 + R() * 26); tries++; } while ((saltAt(x, z) > 0.5 || (z > CANYON.z0 - 10 && z < CANYON.z1 + 10)) && tries < 10);
    devils.push(buildDevil(x, z));
  }
  for (let k = 0; k < 2; k++) devils.push(buildDevil(canyonAxisX(400 + k * 160) + (k ? 6 : -7), 400 + k * 160));
  for (let k = 0; k < 6; k++) jaws.push(buildJawJaw(SITES.wreck.x + (R() - 0.5) * 14, SITES.wreck.z + (R() - 0.5) * 14));
  for (let k = 0; k < 4; k++) jaws.push(buildJawJaw(PITS[0].x + (R() - 0.5) * 20, PITS[0].z + (R() - 0.5) * 20));
  for (let k = 0; k < 3; k++) jaws.push(buildJawJaw(TALLY.x - 11 + (R() - 0.5) * 6, TALLY.z - 10 + (R() - 0.5) * 6));   // stripping the dead car in Tally Bore
  for (const [x, z] of [[20, 330], [26, 338], [16, 344], [-30, 760], [-36, 768]]) boars.push(buildBoar(x, z));        // rooting along the main road
  // the finds out in the open
  placeRelic('Survey stake', new THREE.Vector3(26, h(26, 222) + 0.3, 222));
  const leak = W.leaks.find(l => l.z > 900) || W.leaks[0];
  if (leak) placeRelic('Pipewright token', new THREE.Vector3(leak.x + 1.6, h(leak.x + 1.6, leak.z) + 0.25, leak.z + 0.6));
}

// ---------- abandoned shacks: walk in out of the sun and look round ----------
const SHACK_NOTES = {
  shack1: { note: 'Scratched in the doorframe: “WATER IN THE TANK IS FOR WHOEVER NEEDS IT. LEAVE SOME.” Someone has left some.', relics: ['Ear-cage clasp'], tank: true, argus: true },
  shack2: { note: 'Tally marks on the wall by the cot, four hundred and some. Then nothing. The Pipewright kept count of something, out here on the pans where the striders hunt.', relics: ['Road atlas page', 'Weathered map scrap'] },
  shack3: { note: 'A child’s drawing nailed to the wall: a house, a sun with a face, and a pale thing with a tail at the edge of the page, drawn twice, a little apart.', relics: [], argus: true },
};
function buildShack(def) {
  const x = def.x, z = def.z, y = h(x, z), n = nearestRoad(x, z), rx = n.s ? n.s.x : 0, g = new THREE.Group();
  const facing = x > rx ? -Math.PI / 2 : Math.PI / 2;      // the door faces the road
  g.position.set(x, y, z); g.rotation.y = facing; G.scene.add(g);
  const Wd = 6, D = 5, H = 2.6, t = 0.12, door = 1.2, frontL = (Wd - door) / 2;
  const walls = [[0, -D / 2, Wd, t], [-Wd / 2, 0, t, D], [Wd / 2, 0, t, D], [-Wd / 2 + frontL / 2, D / 2, frontL, t], [Wd / 2 - frontL / 2, D / 2, frontL, t]];
  const parts = [];
  for (const [wx, wz, w, d] of walls) parts.push([new THREE.BoxGeometry(w, H, d), MX(wx, H / 2, wz)]);
  parts.push([new THREE.BoxGeometry(door, 0.4, t), MX(0, H - 0.2, D / 2)]);
  g.add(mesh(planarUV(merge(parts), 1.2), M.boards));
  const roof = mesh(planarUV(new THREE.BoxGeometry(Wd + 0.7, 0.05, D + 0.8), 1), M.tin); roof.position.set(0, H + 0.25, 0); roof.rotation.x = 0.1; g.add(roof);
  const cot = mesh(planarUV(new THREE.BoxGeometry(0.9, 0.45, 1.9), 1), M.canvas); cot.position.set(-2.2, 0.23, -1.2); g.add(cot);
  const crate = mesh(planarUV(new THREE.BoxGeometry(0.7, 0.6, 0.7), 0.8), M.timber); crate.position.set(2.1, 0.3, -1.6); g.add(crate);
  const world = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(new THREE.Vector3(x, 0, z));
  for (const [wx, wz, w, d] of walls) { const a = world(wx - w / 2, wz - d / 2), b = world(wx + w / 2, wz + d / 2); blockers.push({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) }); }
  shades.push({ x, z, r: 2.4, why: 'shack' });
  const info = SHACK_NOTES[def.id], np = world(0, -D / 2 + 0.3), cp = world(-2.2, -1.2);
  addThing({ id: def.id + ':note', name: 'Something written', verb: 'Read', x: np.x, y: y + 1.6, z: np.z, r: 1.2, prov: ['X', 'roadside ruins: ' + NEW], use: () => { bark(info.note, ['X', NEW]); meet('ruin'); } });
  addThing({ id: def.id + ':cot', name: 'Cot', verb: 'Rest a moment', x: cp.x, y: y + 0.5, z: cp.z, r: 1.3, prov: ['X', NEW], use: () => { S.stress = Math.max(0, S.stress - 18); S.time += 600; hooks.updateVitals(); bark('Ten minutes off my feet. The shade in here is honest, at least. No branches.', ['X', NEW]); } });
  if (info.tank) {
    const tp = world(Wd / 2 + 0.9, 0), tank = mesh(planarUV(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 16), 1), M.tin); tank.position.set(tp.x, y + 0.8, tp.z); G.scene.add(tank);
    blockers.push({ x: tp.x, z: tp.z, r: 0.8 });
    W.water = W.water || []; W.water.push({ id: def.id + ':tank', name: 'Rainwater tank', x: tp.x, y: y + 1, z: tp.z, once: true, line: 'Somebody’s kindness, in a tin tank. I’ll leave a little for the next fool.' });
  }
  info.relics.forEach((r, k) => placeRelic(r, world(2.1 - k * 0.3, -1.6).add(new THREE.Vector3(0, y + 0.66, 0))));
  W.flySources.push({ x, z, r: 16 });
  track(rx + (x > rx ? 4 : -4), z - 6, world(0, D / 2 + 1.5).x, world(0, D / 2 + 1.5).z);
  if (info.argus) { const a = world(-Wd / 2 - 3, 2); buildArgus(a.x, a.z); }
}

// ---------- the Gallows-Gum, as Chapter Two has it ----------
function buildGum(def) {
  const { x, z } = def, y = h(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -def.side * Math.PI / 2; G.scene.add(g);      // the waiting limb reaches out over the road
  const R = rng(Math.round(z * 31)), trunk = [], leaves = [], pale = [], flesh = [];
  trunk.push([new THREE.CylinderGeometry(0.42, 0.75, 9, 12), MX(0, 4.5, 0)]);
  const limbs = [];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.27 + R(), len = 4 + R() * 1.6, tip = [Math.cos(a) * len, 8.6 + R() * 1.6, Math.sin(a) * len];
    trunk.push([new THREE.CylinderGeometry(0.22, 0.3, 1, 8), rodMX([0, 8.2, 0], tip)]);
    limbs.push(tip);
  }
  g.add(mesh(merge(trunk), M.gumBark));
  for (const tip of limbs) for (let j = 0; j < 4; j++) leaves.push([new THREE.IcosahedronGeometry(1, 0), MX(tip[0] + (R() - 0.5) * 2.4, tip[1] + R() * 1.2, tip[2] + (R() - 0.5) * 2.4, R(), R(), 0, 1.3 + R() * 0.8, 0.8, 1.3 + R() * 0.8)]);
  g.add(mesh(merge(leaves), M.gumLeaf));
  // bark peeling away in long, fleshy strips, the wet red cambium under them
  for (let k = 0; k < 14; k++) {
    const a = R() * TAU, yy = 1 + R() * 6.5, len = 0.9 + R() * 1.6, r0 = 0.62 - yy * 0.02, curl = 0.25 + R() * 0.4;
    const m = MX(Math.cos(a) * (r0 + 0.02), yy, Math.sin(a) * (r0 + 0.02), curl, -a + Math.PI / 2, 0);
    flesh.push([new THREE.PlaneGeometry(0.22, len * 0.9), MX(Math.cos(a) * (r0 - 0.005), yy + 0.1, Math.sin(a) * (r0 - 0.005), 0, -a + Math.PI / 2, 0)]);   // the bare patch it peeled from
    pale.push([new THREE.PlaneGeometry(0.2, len), m]);
  }
  g.add(mesh(merge(flesh), M.gumFlesh)); g.add(mesh(merge(pale), new THREE.MeshStandardMaterial({ color: 0xe8d6c8, roughness: 0.7, side: THREE.DoubleSide })));
  // the limb that waits, over the road, thick as a man's torso; and the loop hung among the leaves
  const pivot = new THREE.Group(); pivot.position.set(0, 7.6, 0); g.add(pivot);
  const limb = mesh(new THREE.CylinderGeometry(0.3, 0.42, 6.2, 9), M.gumBark); limb.position.set(0, -0.6, 3.0); limb.rotation.x = Math.PI / 2 - 0.2; pivot.add(limb);
  const noose = mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 18), M.gumBark); noose.position.set(0.4, 7.9, 2.6); noose.rotation.set(0.2, 0.3, 0); g.add(noose);
  const rope = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), M.gumBark); rope.position.set(0.4, 8.85, 2.6); g.add(rope);
  const stain = mesh(new THREE.CircleGeometry(3.2, 24), M.stain, { cast: false }); stain.rotation.x = -Math.PI / 2; stain.position.set(0.4, 0.06, 2.2); g.add(stain);
  for (let k = 0; k < 3; k++) { const b = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.45, 6), M.bone); b.position.set(R() * 2, 0.08, 1.4 + R() * 2); b.rotation.set(Math.PI / 2, 0, R() * 3); g.add(b); }
  blockers.push({ x, z, r: 0.9 });
  const reach = new THREE.Vector3(0, 0, 4.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
  const gum = { x, z, rx: reach.x, rz: reach.z, top: new THREE.Vector3(x, y + 8, z), relax: 0, cool: 0, pivot, swing: 0, creaked: false, struck: 0 };
  W.gums.push(gum); shades.push({ x, z, r: 6.5, why: 'gum', gum });
  W.flySources.push({ x, z, r: 12 });
  addThing({ id: 'gum' + Math.round(z), name: 'Gallows-Gum', verb: 'Look', x, y: y + 1.5, z, r: 2.6, prov: ['C', GUIDE], use: () => { meet('gum'); bark('Bark like sunburned skin, and the red under it wet. Cool, deep shade, and a stain on the ground under the big limb. It’s waiting for me to sit down.', ['C', GUIDE + '; the look is ' + CH2]); } });
}

// the canyon floor past the gums, choked with spinifex; one narrow game trail through it, worn down by armoured beasts
function buildCanyonSpinifex() {
  const R = rng(5150), clumps = [], g = new THREE.Group();
  for (let z = 482; z < 668; z += 1.25) {
    const ax = canyonAxisX(z);
    for (let o = -CANYON.half + 0.9; o < CANYON.half - 0.9; o += 1.2) {
      const x = ax + o + (R() - 0.5) * 0.8, zz = z + (R() - 0.5) * 0.8;
      if (Math.abs(x - canyonAxisX(zz)) < 1.8 + Math.sin(zz * 0.05) * 0.3) continue;      // the trail
      const m = CAVE_MOUTHS.seep; if (Math.abs(zz - m.z) < 5 && Math.sign(o) === m.side && Math.abs(o) > CANYON.half - 5) continue;
      if (R() < 0.12) continue;
      clumps.push([x, zz, 0.6 + R() * 0.75]);
    }
  }
  addSpinifex(g, clumps, 'canyon', 10);
  G.scene.add(g);
}

// ---------- the Drop-Stalker: leopard-sized, built like a koala that lifts, waiting on an overhang ----------
export function buildStalker(p, facing, id, fur = M.fur) {
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = facing; G.scene.add(g);
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const S1 = new THREE.SphereGeometry(1, 16, 12);
  part(S1, fur, 0, 0.05, 0, 0.62, 0.48, 0.95); part(S1, fur, 0, 0.18, 0.55, 0.62, 0.5, 0.5);
  const head = new THREE.Group(); head.position.set(0, 0.32, 1.02); g.add(head);
  const hp = (geo, mat, x, y, z, sx, sy, sz) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); head.add(m); return m; };
  hp(S1, fur, 0, 0, 0, 0.42, 0.36, 0.4);
  const ears = [hp(S1, fur, -0.36, 0.22, -0.05, 0.22, 0.2, 0.08), hp(S1, fur, 0.36, 0.22, -0.05, 0.22, 0.2, 0.08)];
  hp(S1, M.furDark, 0, -0.06, 0.36, 0.13, 0.17, 0.12);
  for (const s of [-1, 1]) hp(S1, M.stalkerEye, s * 0.16, 0.08, 0.32, 0.045, 0.045, 0.03);
  for (const s of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.12, 0.09, 0.7, 8), fur, s * 0.4, -0.25, 0.75).rotation.x = 0.5;
    for (let c = 0; c < 3; c++) part(new THREE.ConeGeometry(0.025, 0.16, 6), M.claw, s * 0.4 + (c - 1) * 0.05, -0.58, 0.98).rotation.x = 2.2;
    part(new THREE.CylinderGeometry(0.15, 0.1, 0.6, 8), fur, s * 0.42, -0.25, -0.5).rotation.x = -0.3;
  }
  const rec = { id, g, head, ears, home: p.clone(), state: 'perched', seen: 0, warned: false, cool: 0, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
  W.stalkers.push(rec);
  return rec;
}
function buildOutcrop(x, z) {
  const y = h(x, z), parts = [];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; parts.push([new THREE.DodecahedronGeometry(1, 1), MX(x + Math.cos(a) * 2.6, y + 1.2, z + Math.sin(a) * 2.2, k, k * 2, 0, 1.8, 1.6, 1.6)]); }
  parts.push([new THREE.DodecahedronGeometry(1, 1), MX(x + 1.2, y + 3.4, z, 0.1, 0.3, 0, 3.2, 0.8, 2.4)]);
  G.scene.add(mesh(planarUV(merge(parts), 1.6), M.rock));
  blockers.push({ x, z, r: 3.2 });
}

// ---------- the Salt-Strider: raptor-like, furred bone-white, a rudder of a tail; it moves by folding space ----------
export const STRIDERS = {};
function buildStrider() {
  const g = new THREE.Group(); g.visible = false; G.scene.add(g);
  const S1 = new THREE.SphereGeometry(1, 16, 12), add = (parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; parent.add(m); return m; };
  add(g, S1, M.boneFur, 0, 2.05, 0, 0.55, 0.62, 1.15);                              // a body of pure muscle, leaning forward
  add(g, S1, M.boneFur, 0, 2.15, 0.6, 0.6, 0.66, 0.6);
  add(g, new THREE.CylinderGeometry(0.2, 0.3, 1.0, 10), M.boneFur, 0, 2.62, 1.25, 1, 1, 1, -0.75);   // neck
  const head = new THREE.Group(); head.position.set(0, 3.0, 1.75); g.add(head);
  add(head, S1, M.boneFur, 0, 0, 0.1, 0.24, 0.24, 0.5);
  add(head, S1, M.boneFur, 0, -0.1, 0.42, 0.16, 0.1, 0.32);                          // the jaw
  for (const s of [-1, 1]) { add(head, new THREE.SphereGeometry(0.045, 8, 6), M.stalkerEye, s * 0.16, 0.06, 0.3); }
  const ears = [-1, 1].map(s => { const e = add(head, new THREE.ConeGeometry(0.07, 0.28, 6), M.boneFur, s * 0.14, 0.24, -0.1); e.rotation.z = -s * 0.3; return e; });
  // the tail: thick, muscular, a counterbalance
  const tail = [];
  let parent = g, px = 0, py = 2.0, pz = -1.05;
  for (let k = 0; k < 5; k++) { const seg = new THREE.Group(); seg.position.set(px, py, pz); parent.add(seg); add(seg, S1, M.boneFur, 0, 0, -0.35, 0.34 - k * 0.055, 0.3 - k * 0.05, 0.45); tail.push(seg); parent = seg; px = 0; py = -0.04; pz = -0.62; }
  // two great legs: thigh, shin, a long foot, and a claw
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(s * 0.38, 1.95, -0.1); g.add(hip);
    add(hip, S1, M.boneFur, 0, -0.45, 0.18, 0.26, 0.6, 0.32, 0.4);
    const knee = new THREE.Group(); knee.position.set(0, -0.95, 0.42); hip.add(knee);
    add(knee, new THREE.CylinderGeometry(0.1, 0.07, 0.9, 8), M.boneFur, 0, -0.42, -0.15, 1, 1, 1, 0.35);
    const ankle = new THREE.Group(); ankle.position.set(0, -0.86, -0.3); knee.add(ankle);
    add(ankle, new THREE.BoxGeometry(0.16, 0.08, 0.6), M.boneFur, 0, -0.1, 0.2);
    add(ankle, new THREE.ConeGeometry(0.04, 0.22, 6), M.claw, 0, -0.04, 0.55, 1, 1, 1, Math.PI / 2);
    return { hip, knee, s };
  });
  for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.06, 0.04, 0.6, 6), M.boneFur, s * 0.38, 1.85, 0.95, 1, 1, 1, 0.9);   // small forelimbs, clawed
  return { g, head, ears, tail, legs, state: 'off', x: 0, z: 0, yaw: 0, t: 0, blinkIn: 0, assessT: 0, speed0: 0, dv: 0, cool: 0, done: false };
}
// the dust a blink leaves where it was, and where it lands
const bursts = [];
function dustBurst(x, z, red = false) {
  const n = 16;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: red ? 0x8a1a10 : 0xb8704a, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.set(x + (Math.random() - 0.5) * 1.2, h(x, z) + 0.4 + Math.random() * 1.5, z + (Math.random() - 0.5) * 1.2); m.scale.setScalar(1.2);
    G.scene.add(m); bursts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5), life: 1.4 });
  }
  hooks.sfx.thump(0.35);
}
function poseStrider(st, dt, moving) {
  st.t += dt;
  st.g.position.set(st.x, h(st.x, st.z), st.z); st.g.rotation.y = st.yaw;
  const run = moving ? 1 : 0;
  st.legs.forEach((l, k) => { const ph = st.t * 9 + k * Math.PI; l.hip.rotation.x = Math.sin(ph) * 0.7 * run; l.knee.rotation.x = Math.max(0, -Math.sin(ph)) * 0.9 * run; });
  st.tail.forEach((s, k) => { s.rotation.y = Math.sin(st.t * 2 + k * 0.6) * 0.08; s.rotation.x = -0.05 + Math.sin(st.t * 1.4 + k) * 0.03; });
}
function blinkTo(st, x, z) { dustBurst(st.x, st.z); st.x = x; st.z = z; dustBurst(x, z); }

// ---------- razor-back boars, thorny-devils, jaw-jaws ----------
const boars = [], devils = [], jaws = [];
function buildBoar(x, z, ridge = false) {
  const g = new THREE.Group(); G.scene.add(g);
  const add = (geo, mat, px, py, pz, sx = 1, sy = sx, sz = sx, rx = 0) => { const m = mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.rotation.x = rx; g.add(m); return m; };
  const S1 = new THREE.SphereGeometry(1, 12, 10);
  add(S1, M.boarHide, 0, 0.62, 0, 0.42, 0.42, 0.8);
  add(new THREE.ConeGeometry(0.26, 0.6, 10), M.boarHide, 0, 0.58, 0.95, 1, 1, 1, Math.PI / 2);
  for (const s of [-1, 1]) { add(new THREE.ConeGeometry(0.03, 0.18, 5), M.bone, s * 0.12, 0.5, 1.12, 1, 1, 1, -0.6); }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) legs.push(add(new THREE.CylinderGeometry(0.06, 0.05, 0.45, 6), M.boarHide, sx * 0.24, 0.24, sz * 0.48));
  for (let k = 0; k < 9; k++) { const b = add(new THREE.BoxGeometry(0.015, 0.22 + Math.sin(k / 8 * Math.PI) * 0.18, 0.12), M.iron, 0, 1.0 + Math.sin(k / 8 * Math.PI) * 0.05, -0.55 + k * 0.14); b.rotation.x = -0.4; }   // the razor ridge
  const b = { g, legs, x, z, yaw: Math.random() * TAU, state: 'root', t: Math.random() * 10, ridge, dead: false, flee: 0 };
  g.position.set(x, h(x, z), z);
  return b;
}
function buildDevil(x, z) {
  const g = new THREE.Group(), y = h(x, z); g.position.set(x, y, z); g.rotation.y = Math.random() * TAU; G.scene.add(g);
  const body = mesh(new THREE.SphereGeometry(0.11, 10, 8), M.devil); body.scale.set(1, 0.55, 1.4); body.position.y = 0.06; g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.06, 8, 6), M.devil); head.position.set(0, 0.08, 0.17); g.add(head);
  const spikes = [];
  for (let k = 0; k < 18; k++) { const a = k * 2.39996, r = 0.05 + (k % 3) * 0.02; spikes.push([new THREE.ConeGeometry(0.012, 0.05, 4), MX(Math.cos(a) * r, 0.11, Math.sin(a) * r * 1.2)]); }
  g.add(mesh(merge(spikes), M.devil));
  const tail = mesh(new THREE.ConeGeometry(0.03, 0.25, 6), M.devil); tail.position.set(0, 0.05, -0.24); tail.rotation.x = -Math.PI / 2; g.add(tail);
  const d = { g, head, x, z, t: Math.random() * 10, puff: 0 };
  addThing({ id: 'devil' + Math.round(x * 10 + z), name: 'Thorny-Devil', verb: 'Look', x, y: y + 0.15, z, r: 1.2, prov: ['P', FARM], use: () => { meet('devil'); d.puff = 2; bark(['A thorny-devil, sunning itself. Anything thrown at him goes straight back where it came from.', 'He’s puffed himself up at me. Fair enough. I’m bigger.', 'Prickles has cousins out here. Every one of them with the same opinion of me.'][Math.floor(Math.random() * 3)], ['P', FARM]); } });
  return d;
}
function buildJawJaw(x, z) {
  const g = new THREE.Group(); g.position.set(x, h(x, z), z); G.scene.add(g);
  const shell = mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, TAU, 0, Math.PI / 2), M.copper); shell.scale.set(1, 0.7, 1.4); g.add(shell);
  const head = mesh(new THREE.ConeGeometry(0.1, 0.22, 4), M.copper); head.position.set(0, 0.04, 0.27); head.rotation.x = Math.PI / 2; head.rotation.y = Math.PI / 4; g.add(head);   // the wedge head
  const legs = [];
  for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1, l = mesh(new THREE.CylinderGeometry(0.01, 0.008, 0.18, 4), M.claw); l.position.set(s * 0.15, 0.02, -0.1 + Math.floor(k / 2) * 0.1); l.rotation.z = s * 1.1; g.add(l); legs.push(l); }
  return { g, legs, x, z, home: { x, z }, yaw: 0, t: Math.random() * 10, target: null, wait: Math.random() * 3 };
}

// ---------- the plants ----------
function buildWeedPatch(def) {
  const { x, z } = def, R = rng(Math.round(z * 7)), parts = [];
  for (let k = 0; k < 7; k++) {
    const px = x + (R() - 0.5) * 9, pz = z + (R() - 0.5) * 9, y = h(px, pz);
    for (let l = 0; l < 13; l++) { const a = l * 2.39996, r = 0.05 + l * 0.022; parts.push([new THREE.SphereGeometry(1, 6, 4), MX(px + Math.cos(a) * r, y + 0.06, pz + Math.sin(a) * r, 0, -a, 0.5, 0.06, 0.035, 0.03 + l * 0.004)]); }
    W.weeds.push({ x: px, z: pz });
  }
  G.scene.add(mesh(merge(parts), M.compass, { cast: false }));
  addThing({ id: 'weed' + z, name: 'Compass-Weed', verb: 'Look', x, y: h(x, z) + 0.2, z, r: 5, prov: ['C', CH1], use: () => { meet('weed'); bark('Compass-weed. A small, perfect spiral of leaves, its geometry almost deliberate. The needle won’t thank me.', ['C', CH1]); } });
}
function buildArgus(x, z) {
  const g = new THREE.Group(), y = h(x, z); g.position.set(x, y, z); G.scene.add(g);
  const R = rng(Math.round(x * 17 + z)), parts = [], eyes = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = 0.6 + R() * 0.6, top = [Math.cos(a) * r, 0.9 + R() * 0.7, Math.sin(a) * r];
    parts.push([new THREE.CylinderGeometry(0.035, 0.05, 1, 6), rodMX([0, 0, 0], top)]);
    const eye = new THREE.Group(); eye.position.set(...top); g.add(eye);
    eye.add(mesh(new THREE.SphereGeometry(0.11, 12, 8), M.eyeWhite));
    const p = mesh(new THREE.SphereGeometry(0.05, 10, 6), M.pupil); p.position.z = 0.085; eye.add(p);
    eyes.push(eye);
  }
  g.add(mesh(merge(parts), M.timber));
  W.argus.push({ x, z, eyes });
  addThing({ id: 'argus' + Math.round(z), name: 'Argus-Bush', verb: 'Look', x, y: y + 1, z, r: 2, prov: ['C', GUIDE], use: () => { meet('argus'); bark('Argus-Bush. Every pod’s an eye, and every eye’s on me. They keep what they see. It’s seen me before.', ['C', GUIDE + ': it records fear and memory']); } });
}
function buildWattle(def) {
  const { x, z } = def, R = rng(Math.round(z * 5)), trunks = [], puffs = [];
  for (let k = 0; k < 11; k++) {
    const px = x + (R() - 0.5) * 24, pz = z + (R() - 0.5) * 24, y = h(px, pz);
    trunks.push([new THREE.CylinderGeometry(0.14, 0.22, 3.6, 7), MX(px, y + 1.8, pz)]);
    for (let j = 0; j < 7; j++) { const a = j * 2.4; puffs.push([new THREE.IcosahedronGeometry(0.7, 0), MX(px + Math.cos(a) * (1 + R()), y + 3.6 + R(), pz + Math.sin(a) * (1 + R()))]); }
    blockers.push({ x: px, z: pz, r: 0.3 });
  }
  G.scene.add(mesh(merge(trunks), M.timber)); G.scene.add(mesh(merge(puffs), M.wattle));
  W.wattles.push({ x, z, r: 16 });
  track(26, 866, x + 10, z + 36, 2);       // the shortcut it seems to offer
  const m = mesh(new THREE.CircleGeometry(7, 28), M.mirage.clone(), { cast: false, receive: false }); m.rotation.x = -Math.PI / 2; m.position.set(x + 4, h(x + 4, z + 18) + 0.08, z + 18); G.scene.add(m);
  W.mirages.push({ m, x: x + 4, z: z + 18, wattle: true });
  addThing({ id: 'wattle', name: 'Judas-Wattle', verb: 'Look', x, y: h(x, z) + 2, z, r: 12, prov: ['C', GUIDE], use: () => { meet('wattle'); bark('Judas-Wattle, gold as a payday. Breathe the haze and the red goes green and there’s water up ahead. There isn’t.', ['C', GUIDE + ': Golden Haze']); } });
}
// the Miser-Boab on the pans, and the Iron-Bark Sentinel by the ridge: landmarks from the Farm of Rust sketch
function buildBoab({ x, z }) {
  const y = h(x, z), parts = [];
  parts.push([new THREE.SphereGeometry(1, 14, 10), MX(x, y + 2.6, z, 0, 0, 0, 2.2, 2.8, 2.2)]);
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; parts.push([new THREE.CylinderGeometry(0.12, 0.3, 1, 6), rodMX([x + Math.cos(a) * 0.8, y + 5, z + Math.sin(a) * 0.8], [x + Math.cos(a) * 3, y + 7 + (k % 3), z + Math.sin(a) * 3])]); }
  G.scene.add(mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0xd2c8bf, roughness: 0.95 })));
  blockers.push({ x, z, r: 2.4 });
  addThing({ id: 'boab', name: 'Miser-Boab', verb: 'Look', x, y: y + 2, z, r: 3.6, prov: ['P', FARM], use: () => bark('A Miser-Boab, fat with water out here on the salt, and it won’t spare a drop. Drink from it and you’ll never share again, they say.', ['P', FARM]) });
}
function buildIronBark({ x, z }) {
  const y = h(x, z), parts = [];
  parts.push([new THREE.CylinderGeometry(0.5, 0.9, 7, 8), MX(x, y + 3.5, z)]);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; parts.push([new THREE.CylinderGeometry(0.12, 0.25, 1, 6), rodMX([x, y + 5 + (k % 2), z], [x + Math.cos(a) * 3.2, y + 8 + (k % 3), z + Math.sin(a) * 3.2])]); }
  G.scene.add(mesh(planarUV(merge(parts), 1), new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.35, metalness: 0.8 })));
  blockers.push({ x, z, r: 1.1 });
  addThing({ id: 'ironbark', name: 'Iron-Bark Sentinel', verb: 'Look', x, y: y + 2, z, r: 2.4, prov: ['P', FARM], use: () => bark('An Iron-Bark Sentinel. Bark gone to metal from drinking the iron out of the ground. You can’t cut one. You can only wait it out.', ['P', FARM]) });
}
// creeper-vines down the canyon walls: some green, most dried to the colour of the cords that hold the load
function buildVines() {
  const R = rng(2727), live = [], dry = [];
  for (let k = 0; k < 70; k++) {
    const z = CANYON.z0 + 8 + R() * (CANYON.z1 - CANYON.z0 - 16), side = R() < 0.5 ? -1 : 1, x = canyonAxisX(z) + side * (CANYON.half + 0.4), top = 5 + R() * 18, len = 3 + R() * 7;
    const list = R() < 0.35 ? live : dry;
    for (let s = 0; s < 3; s++) list.push([new THREE.PlaneGeometry(0.12, len), MX(x - side * 0.05, top - len / 2, z + (s - 1) * 0.25 + R() * 0.2, 0, Math.PI / 2, (R() - 0.5) * 0.1)]);
  }
  G.scene.add(mesh(merge(live), M.vine, { cast: false })); G.scene.add(mesh(merge(dry), M.vineDry, { cast: false }));
}

// ---------- the breakdown: a transport truck on its side under the transmission line, and the swarm over it ----------
export const SWARM = { x: 0, z: 0, y: 0, points: null, pos: null, home: [], state: 'mining', t: 0, scattered: 0, whisperIn: 2, tendril: 0, scrapper: null, helped: false, left: false };
function buildWreck() {
  const { x, z } = SITES.wreck, y = h(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, 0.6, 0); G.scene.add(g);
  const body = new THREE.Group(); body.rotation.z = Math.PI / 2 - 0.08; body.position.y = 1.3; g.add(body);    // on its side
  const parts = [];
  parts.push([new THREE.BoxGeometry(2.4, 2.4, 3.0), MX(0, 0, 3.4)], [new THREE.BoxGeometry(2.6, 2.8, 5.4), MX(0, 0.2, -1.2)], [new THREE.BoxGeometry(0.5, 0.4, 9.5), MX(0, -1.4, 0.5)]);
  for (const s of [-1, 1]) for (const zz of [3.4, -0.4, -3.2]) parts.push([new THREE.CylinderGeometry(0.62, 0.62, 0.46, 12), MX(s * 1.3, -1.5, zz, 0, 0, Math.PI / 2)]);
  body.add(mesh(planarUV(merge(parts), 1), M.paint));
  const boiler = mesh(planarUV(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 16, 1, true), 1), M.rust); boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 0.2, 5.6); body.add(boiler);   // the ruptured boiler, open at the end
  for (let k = 0; k < 5; k++) { const c = mesh(planarUV(new THREE.BoxGeometry(0.7, 0.6, 0.7), 0.8), M.timber); c.position.set(-3 - k * 0.8, -0.95, -2 + k * 1.1); c.rotation.y = k; g.add(c); }   // the cargo, spilled
  blockers.push({ x, z, r: 4.5 });
  const bw = new THREE.Vector3(0, 1.5, 5.6).applyEuler(g.rotation).add(g.position);
  W.smoke.push({ x: bw.x, y: bw.y, z: bw.z, rate: 2.2, mat: M.smoke, size: 1.0 });
  // the scrapper, in rags, on his knees by the cab
  const sc = new THREE.Group(); const sp = new THREE.Vector3(3.2, 0, 3.6).applyEuler(g.rotation).add(g.position); sc.position.set(sp.x, h(sp.x, sp.z), sp.z); G.scene.add(sc);
  const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.6, 4, 8), M.rag); torso.position.set(0, 0.55, 0); torso.rotation.x = 0.9; sc.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.17, 10, 8), M.rag); head.position.set(0, 0.55, 0.45); sc.add(head);
  for (const s of [-1, 1]) { const a = mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), M.rag); a.position.set(s * 0.22, 0.75, 0.42); a.rotation.set(-0.6, 0, s * 0.5); sc.add(a); }
  SWARM.scrapper = { g: sc, x: sp.x, z: sp.z };
  // the swarm: a shimmering, iridescent black mist that pulses like a heart
  const N = 1400, pos = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) { const r = Math.cbrt(Math.random()) * 4, a = Math.random() * TAU, b = Math.acos(2 * Math.random() - 1); SWARM.home.push([r * Math.sin(b) * Math.cos(a), r * Math.cos(b) * 0.7, r * Math.sin(b) * Math.sin(a), Math.random() * TAU]); pos.set([sp.x, 2, sp.z], k * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x0a0c10, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));   // fist-sized, a thousand of them
  pts.frustumCulled = false; G.scene.add(pts);
  Object.assign(SWARM, { x: sp.x, z: sp.z, y: h(sp.x, sp.z) + 2.2, points: pts, pos });
  W.flySources.push({ x, z, r: 24 });
  addThing({ id: 'scrapper', name: 'The scrapper', verb: () => SWARM.scattered > 0 && !SWARM.helped && S.sips > 0 ? 'Give him water' : 'Look', x: sp.x, y: sp.y + 0.6, z: sp.z, r: 1.6, prov: ['C', CH2], use: () => {
    if (SWARM.scattered > 0 && !SWARM.helped && S.sips > 0) { SWARM.helped = true; S.sips--; hooks.updateVitals(); bark('Water on his lips. He doesn’t know his own name. The flies took it. I can’t carry him and the load both, and they’re coming back.', ['X', 'a mercy the book doesn’t give him: ' + NEW]); }
    else bark('Alive, but broken. They’ve stripped him of his secrets, his sense of self. They’re mining him.', ['C', CH2]);
  } });
}
const BROADCAST = ['…didn’t check the seals… my fault… oh god it burns…', '…Laura… I told Laura I would be back… she is waiting… I lied… I always lie…', '…didn’t check the seals…'];
const AT_JACOB = ['…Jacob…', '…Jacob is watching… Jacob doesn’t help… coward… alone…'];

// ---------- every frame ----------
export function updateLife(dt) {
  if (G.area !== 'out') return;
  const pos = here(), x = pos.x, z = pos.z, foot = !S.inTractor, cam = G.camera;
  cam.getWorldDirection(_fwd);
  updateSpinifex(dt, x, z, foot);
  updateWeeds(dt, x, z, foot);
  updateGums(dt, x, z, foot);
  updateStalkers(dt, x, z, foot);
  updateStriders(dt, x, z, foot);
  updateBoars(dt, x, z);
  updateDevils(dt, x, z);
  updateJaws(dt);
  updateSwarm(dt, x, z, foot);
  updateHaze(dt, x, z);
  for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.life -= dt; b.m.position.addScaledVector(b.v, dt); b.v.multiplyScalar(1 - dt * 2); b.m.material.opacity = Math.max(0, b.life / 1.4) * 0.7; b.m.scale.setScalar(1.2 + (1.4 - b.life) * 2); if (b.life <= 0) { G.scene.remove(b.m); b.m.material.dispose(); bursts.splice(i, 1); } }
}

function updateSpinifex(dt, x, z, foot) {
  const moving = P.speed > 0.15;
  SWAY.uThrash.value.set(x, z, foot ? 4 : 6, moving ? clamp(P.speed / 3, 0.4, 1.2) : 0.15);
  if (foot && moving) for (const c of nearbySpinifex(x, z)) {
    S.bleed = Math.min(3, S.bleed + dt * (P.speed > 1.6 ? 1.1 : 0.3));
    feed(c, dt);
    if (Math.random() < dt * 3) hooks.sfx.cut();
    meet('spinifex');
    once('spin', P.speed > 1.6 ? 'Razor-spinifex. Running through it was stupid. Glass blades, sharper than surgical steel, and it drinks what it cuts.' : 'Spinifex. Slow, Jacob. Slow through it, or round.', ['C', CH2]);
  }
  // in the tractor: it senses the movement and lashes at the hull; slow is worse, because it has time to find the cab
  if (!foot) {
    let graze = 0; for (const c of nearbySpinifex(x, z)) graze++;
    for (const c of nearbyClumps(x, z, 2.2)) graze++;
    if (graze && P.speed > 0.2) {
      meet('spinifex');
      const rate = Math.min(4, graze * 0.35) * (P.speed < 2.5 ? 1.4 : 0.5);
      if (Math.random() < dt * rate) {
        hooks.sfx.schwick(); S.hull++;
        if (P.speed < 2.5 && Math.random() < 0.18) { S.bleed = Math.min(3, S.bleed + 0.5); hooks.hurt(3, 'bled'); once('lashcab', 'Schwick. It found the cab. Come on, old girl. Keep up.', ['C', CH2]); }
        else once('lash', 'Schwick. Like a sword striking metal. That’s a scratch in the hull, and it’ll want more.', ['C', CH2]);
      }
      if (inCanyon(x, z) && G.tractor.z > 655 && G.tractor.z < 700 && !S.flags.clear) { S.flags.clear = true; bark('Clear of the trees. Speed is survival. Punch it.', ['C', CH2]); }
    }
  }
}
function* nearbyClumps(x, z, pad) { for (const c of W.spinifex) if (Math.abs(c.z - z) < pad + 1.2 && Math.hypot(c.x - x, c.z - z) < c.r + pad) yield c; }
const straw = new THREE.Color(0xd8b050), blood = new THREE.Color(0x8a1a12), _cc = new THREE.Color();
function feed(c, dt) {
  c.fed = Math.min(1, c.fed + dt * 0.4);
  _cc.copy(straw).lerp(blood, c.fed);
  for (let b = 0; b < c.n; b++) c.im.setColorAt(c.first + b, _cc);
  c.im.instanceColor.needsUpdate = true;
}

function updateWeeds(dt, x, z, foot) {
  for (const w of W.weeds) if (Math.hypot(w.x - x, w.z - z) < (foot ? 3.5 : 2.2)) {
    S.disoriented = 25; S.stress = Math.min(100, S.stress + dt * 1.2); meet('weed');
    once('weed', 'Compass-weed. The needle’s gone mad and so’s my sense of which way’s which. Find the wires. Follow the wires.', ['C', CH1 + '; ' + GUIDE]);
    break;
  }
  S.disoriented = Math.max(0, S.disoriented - dt);
}

// The Field Guide: a Gallows-Gum waits for someone to relax before it attacks. Its shade is the bait: stop in it,
// let it cool you down, let your shoulders drop, and the limb comes down. On edge, or moving, you're safe enough.
function updateGums(dt, x, z, foot) {
  for (const g of W.gums) {
    const d = Math.hypot(x - g.rx, z - g.rz);
    g.cool = Math.max(0, g.cool - dt);
    if (d < 6.5 && g.cool <= 0) {
      if (!S.flags.gumIntro) { S.flags.gumIntro = true; meet('gum'); bark('Gallows-Gum. The best shade for twenty clicks, and that’s the trick of it. Don’t get comfortable.', ['C', GUIDE]); }
      const still = P.speed < 0.35, easy = 1 - smooth(20, 60, S.stress);      // stopped, and settling; a racing heart keeps him on edge
      g.relax = still ? g.relax + dt * (0.3 + easy) : Math.max(0, g.relax - dt * (P.speed > 1.5 ? 2 : 0.6));
    } else g.relax = Math.max(0, g.relax - dt * 1.5);
    if (g.relax > 2.4 && !g.creaked) { g.creaked = true; hooks.sfx.creak(); bark('That creak. Like a heavy door opening in an empty house. Don’t get comfortable. Move.', ['X', 'the tell: ' + NEW + '; the sound is ' + CH2]); }
    if (g.relax < 0.5 && g.creaked) g.creaked = false;
    if (g.relax > 4.6) {
      g.relax = 0; g.creaked = false; g.cool = 10; g.struck = 1; hooks.sfx.crash();
      if (S.inTractor) { hooks.hurt(16, 'gum'); G.tractor.stall = 1.6; S.hull += 3; bark('It comes down on the bonnet like intent. Never park under one. Never.', ['C', GUIDE + ': it strikes when you relax']); }
      else { hooks.hurt(32, 'gum'); P.stun = 0.7; S.stress = Math.min(100, S.stress + 20); bark('The limb comes down like a hammer. I let myself relax. That’s all it was waiting for.', ['C', GUIDE + ': it strikes when you relax']); }
    }
    // the limb angles down once it's decided, and comes down when it strikes
    const want = g.struck > 0 ? 1.25 : g.relax > 2.4 ? 0.12 + (g.relax - 2.4) * 0.06 + Math.sin(G.time * 0.6) * 0.03 : 0;
    g.swing = lerp(g.swing, want, clamp(dt * (g.struck > 0 ? 14 : 1.2), 0, 1));
    g.pivot.rotation.x = g.swing;
    if (g.struck > 0) g.struck = Math.max(0, g.struck - dt * 0.6);
  }
}
const _to = new THREE.Vector3();

// Drop-Stalkers: they click, they wait; they won't drop on something that's looking at them
function updateStalkers(dt, x, z, foot) {
  const cam = G.camera;
  for (const s of W.stalkers) {
    const d = Math.hypot(x - s.home.x, z - s.home.z);
    s.cool = Math.max(0, s.cool - dt);
    s.head.lookAt(cam.position);
    if (s.state === 'perched') {
      s.g.position.lerp(s.home, clamp(dt * 2, 0, 1));
      for (const e of s.ears) e.rotation.z = 0;
      if (!foot) continue;
      if (d < 18 && !s.warned) { s.warned = true; hooks.sfx.click(); meet('stalker'); bark('Clicking. Up in the rocks. Look up, Jacob.', ['X', 'the tell: ' + NEW]); }
      if (d < 18 && Math.random() < dt * 0.4) hooks.sfx.click();
      _to.copy(s.g.position).sub(cam.position); const dist = _to.length(); _to.normalize();
      if (dist < 26 && _fwd.dot(_to) > 0.975) { s.seen += dt; if (s.seen > 1.0) { s.state = 'cowed'; s.cool = 45; hooks.sfx.hiss(); bark('Seen you. Stay up there. Good. Stay.', ['X', 'the counter: ' + NEW]); } }
      else s.seen = Math.max(0, s.seen - dt * 0.5);
      if (d < (s.reach || 6.5) && s.cool <= 0) { s.state = 'drop'; s.t = 0; s.from.copy(s.g.position); s.to.set(x, h(x, z) + 0.6, z); hooks.sfx.snarl(); }
    } else if (s.state === 'drop') {
      s.t += dt / 0.45; const t = Math.min(1, s.t);
      s.g.position.lerpVectors(s.from, s.to, t); s.g.position.y += Math.sin(t * Math.PI) * 1.2;
      if (t >= 1) { hooks.sfx.crash(); hooks.hurt(45, 'stalker'); S.stress = Math.min(100, S.stress + 30); P.stun = 1.0; s.state = 'retreat'; s.t = 0; s.cool = 30; bark('Out of nowhere, from above. Never forget to look up.', ['C', GUIDE + ': it ambushes from above']); }
    } else if (s.state === 'retreat') {
      s.t += dt / 4; s.g.position.lerpVectors(s.to, s.home, smooth(0, 1, s.t)); if (s.t >= 1) s.state = 'perched';
    } else if (s.state === 'cowed') {
      _v.copy(s.home); _v.y -= 0.7; s.g.position.lerp(_v, clamp(dt * 2, 0, 1));
      for (const e of s.ears) e.rotation.z = 0.8;
      if (s.cool <= 0) { s.state = 'perched'; s.seen = 0; }
    }
  }
}

// ---------- the striders ----------
// On the pans one hunts whatever crosses them. On the ridge, the book's one: it paces the tractor, stops,
// weighs it for three seconds, and (if Jacob holds a constant, boring speed) takes the boar instead.
function updateStriders(dt, x, z, foot) {
  const speed = S.inTractor ? Math.abs(G.tractor.speed) : P.speed;
  // a changing speed is what it reads: track how much it has varied lately
  S.dv = lerp(S.dv || 0, Math.abs(speed - (S.lastSpeed ?? speed)) / Math.max(dt, 1e-3), clamp(dt * 3, 0, 1)); S.lastSpeed = speed;
  // the pans: from the main road you see one out on the salt, keeping abreast; step onto the salt and it hunts
  const st = STRIDERS.pans, onPans = saltAt(x, z) > 0.4, beside = !onPans && z > 300 && z < 820 && x < 30 && Math.abs(x - panX(z)) < 150;
  if ((st.state === 'off' || st.state === 'watch') && onPans && st.cool <= 0) {
    if (st.state === 'off') { st.x = x - 90; st.z = z + 40; dustBurst(st.x, st.z); }
    st.state = 'stalk'; st.blinkIn = 1; st.t = 0; st.g.visible = true; st.paceT = 0;
    meet('strider'); bark('On the salt now. Salt-strider. Don’t speed up. Don’t slow down. Boring, Jacob. Be boring.', ['C', CH2]);
  } else if (st.state === 'off' && beside && st.cool <= 0) {
    st.state = 'watch'; st.x = panX(z) + (Math.random() - 0.5) * 30; st.z = z + 70; st.g.visible = true; st.blinkIn = 2; dustBurst(st.x, st.z);
    meet('strider'); once('strider-watch', 'Out on the pans. Something pale, taller than a man. Then it isn’t there, and then it’s further along. Salt-strider. Stay on the road.', ['C', GUIDE + '; the blink is ' + CH2]);
  }
  st.cool = Math.max(0, st.cool - dt);
  if (st.state === 'watch') {
    // out on the salt, keeping abreast, folding forward fifty feet at a time; it watches, and doesn't come
    poseStrider(st, dt, false);
    st.yaw = Math.atan2(x - st.x, z - st.z);
    st.blinkIn -= dt;
    if (st.blinkIn <= 0) { blinkTo(st, panX(z + 40) + (Math.random() - 0.5) * 40, z + 40 + Math.random() * 40); st.blinkIn = 2.5 + Math.random() * 3; }
    if (!beside) { st.state = 'leave'; st.t = 0; st.cool = 8; }
  } else if (st.state !== 'off') stride(st, dt, x, z, foot, speed, onPans ? 1 : 0);
  // the ridge
  const rs = STRIDERS.ridge;
  if (rs.state === 'off' && !rs.done && !foot && z > 1335 && z < 1500) {
    rs.state = 'stalk'; rs.x = ridgeX(z + 20); rs.z = z + 20; rs.g.visible = true; rs.paceT = 0; rs.ridge = true; rs.blinkIn = 1.5;
    const b = boars.find(b => b.ridge && !b.dead); if (b) { b.state = 'bolt'; b.flee = 30; b.yaw = 0; }
    meet('boar'); meet('strider');
    bark('A razor-back boar, breaking cover on the ridge. Running scared. Something spooked it from the other direction.', ['C', CH2]);
    setTimeout(() => bark('And there. Salt-strider, parallel, two hundred yards east. Hold your course. Don’t speed up. Don’t slow down.', ['C', CH2]), 3500);
  }
  if (rs.state !== 'off') stride(rs, dt, x, z, foot, speed, 1);
}
function stride(st, dt, x, z, foot, speed, hunting) {
  const moving = st.state === 'stalk' || st.state === 'leave';
  poseStrider(st, dt, moving);
  if (st.state === 'stalk') {
    st.paceT += dt;
    // blink along: fifty feet at a time, keeping pace, never quite in the open with you
    st.blinkIn -= dt;
    const tx = st.ridge ? ridgeX(z + 18) : x + 55 * Math.sign(st.x - x || 1), tz = z + (st.ridge ? 18 : 25 + Math.sin(st.t * 0.4) * 20);
    st.yaw = Math.atan2(tx - st.x, tz - st.z);
    if (st.blinkIn <= 0) { const dx = tx - st.x, dz = tz - st.z, L = Math.hypot(dx, dz) || 1, step = Math.min(L, 15); blinkTo(st, st.x + dx / L * step, st.z + dz / L * step); st.blinkIn = 0.7 + Math.random() * 0.6; }
    if (st.paceT > (st.ridge ? 9 : 7)) { st.state = 'assess'; st.assessT = 0; st.worst = 0; st.yaw = Math.atan2(x - st.x, z - st.z); }
    if (foot) {                                                                         // on foot, out in the open, you're prey
      const d = Math.hypot(x - st.x, z - st.z);
      if (d < 70) once('strider-foot', 'On foot, in the open, and it’s seen me. Back to the tractor. Now.', ['X', NEW]);
      if (d < 24) st.state = 'attack';
    }
  } else if (st.state === 'assess') {
    // three seconds: what does it see?
    st.assessT += dt; st.worst = Math.max(st.worst, S.dv);
    st.head.rotation.y = Math.sin(st.assessT * 2) * 0.15;
    if (st.assessT > 3) {
      const rival = foot || st.worst > 1.1 || (hunting && !st.ridge && Math.random() < 0.25);
      if (rival) { st.state = 'attack'; bark('It’s decided I’m a rival. Oh no.', ['X', NEW]); }
      else if (st.ridge) {
        st.ears.forEach(e => { e.rotation.x = -0.6; });
        const b = boars.find(b => b.ridge && !b.dead);
        if (b) { blinkTo(st, b.x - 1, b.z - 1); dustBurst(b.x, b.z, true); b.dead = true; b.g.visible = false; }
        st.state = 'leave'; st.t = 0; st.done = true;
        bark('Weighed, measured, and found too metallic to be worth the effort.', ['C', CH2]);
      } else { st.state = 'leave'; st.t = 0; st.cool = 25; bark('It’s lost interest. For now. The pans are its kitchen; get off them.', ['X', NEW]); }
    }
  } else if (st.state === 'attack') {
    // it blinks straight onto the hull and kicks
    blinkTo(st, x - 1.5, z + 1);
    if (S.inTractor) { hooks.hurt(32, 'strider'); G.tractor.stall = 3; G.tractor.speed = 0; S.hull += 5; bark('It blinked onto the hull. One kick, and the canopy’s half off.', ['C', CH2 + ': it can blink onto the hull and tear the canopy open']); }
    else { hooks.hurt(55, 'strider'); P.stun = 1.4; bark('It’s on me. It’s on me.', ['X', NEW]); }
    S.stress = Math.min(100, S.stress + 35);
    st.state = 'leave'; st.t = 0; st.cool = 30;
    if (st.ridge) { const b = boars.find(b => b.ridge && !b.dead); if (b) setTimeout(() => { blinkTo(st, b.x, b.z); dustBurst(b.x, b.z, true); b.dead = true; b.g.visible = false; st.done = true; }, 2500); }
  } else if (st.state === 'leave') {
    st.blinkIn -= dt;
    if (st.blinkIn <= 0) { const away = st.ridge ? -1 : Math.sign(st.x - x || 1); blinkTo(st, st.x + away * 14, st.z + 8); st.blinkIn = 0.8; }
    if (Math.hypot(st.x - x, st.z - z) > 160) { st.state = 'off'; st.g.visible = false; }
  }
}

function updateBoars(dt, x, z) {
  for (const b of boars) {
    if (b.dead) continue;
    b.t += dt;
    const d = Math.hypot(b.x - x, b.z - z);
    if (b.state !== 'bolt' && d < (S.inTractor ? 30 : 20)) { b.state = 'flee'; b.flee = 4; b.yaw = Math.atan2(b.x - x, b.z - z); }
    let sp = 0;
    if (b.state === 'bolt') { sp = 7; b.yaw = 0; b.flee -= dt; if (b.flee <= 0) b.state = 'root'; }
    else if (b.state === 'flee') { sp = 6; b.flee -= dt; if (b.flee <= 0) b.state = 'root'; }
    else { if (Math.sin(b.t * 0.3) > 0.6) { sp = 0.6; b.yaw += Math.sin(b.t * 0.7) * dt * 0.6; } }
    const nx = b.x + Math.sin(b.yaw) * sp * dt, nz = b.z + Math.cos(b.yaw) * sp * dt;
    if (!b.ridge || Math.abs(nx - ridgeX(nz)) < 30) { b.x = nx; b.z = nz; }
    b.g.position.set(b.x, h(b.x, b.z), b.z); b.g.rotation.y = b.yaw;
    b.g.rotation.x = sp < 1 ? Math.sin(b.t * 2) * 0.06 + 0.12 : 0;      // rooting, nose down
    b.legs.forEach((l, k) => { l.rotation.x = Math.sin(b.t * (sp > 1 ? 16 : 5) + (k % 2 ? Math.PI : 0)) * (sp > 0 ? 0.5 : 0); });
  }
}
function updateDevils(dt, x, z) {
  for (const d of devils) {
    d.t += dt;
    d.head.position.y = 0.08 + Math.max(0, Math.sin(d.t * 3)) * 0.02 * (Math.sin(d.t * 0.5) > 0 ? 1 : 0);   // the little push-ups they do
    if (d.puff > 0) { d.puff -= dt; d.g.scale.setScalar(1 + Math.min(1, d.puff) * 0.35); } else d.g.scale.setScalar(1);
    if (Math.hypot(d.x - x, d.z - z) < 2.5 && d.puff <= 0) d.puff = 1.5;
  }
}
// jaw-jaws scuttle between hiding places, and go for the tractor's wiring if it sits still too long
function updateJaws(dt) {
  const tr = G.tractor;
  for (const j of jaws) {
    j.t += dt;
    const dp = Math.hypot(j.x - P.x, j.z - P.z);
    if (!S.inTractor && dp < 4) { const a = Math.atan2(j.x - P.x, j.z - P.z); j.target = { x: j.x + Math.sin(a) * 8, z: j.z + Math.cos(a) * 8 }; if (Math.random() < dt) hooks.sfx.hiss(); }
    else if (!j.target) {
      j.wait -= dt;
      if (j.wait <= 0) {
        const dtr = Math.hypot(tr.x - j.x, tr.z - j.z);
        j.target = (dtr < 18 && Math.abs(tr.speed) < 0.2 && !S.inTractor) ? { x: tr.x, z: tr.z, wiring: true } : { x: j.home.x + (Math.random() - 0.5) * 12, z: j.home.z + (Math.random() - 0.5) * 12 };
        j.wait = 2 + Math.random() * 4;
      }
    }
    if (j.target) {
      const dx = j.target.x - j.x, dz = j.target.z - j.z, L = Math.hypot(dx, dz);
      if (L < 0.6) { if (j.target.wiring && !S.inTractor) { tr.wired = (tr.wired || 0) + 1; j.home = { x: tr.x + 6, z: tr.z }; if (!S.flags.wiring) { S.flags.wiring = true; meet('jaws'); bark('Oi! Get off my ignition wiring!', ['P', FARM]); } } j.target = null; }
      else { j.yaw = Math.atan2(dx, dz); j.x += dx / L * dt * 2.2; j.z += dz / L * dt * 2.2; j.legs.forEach((l, k) => { l.rotation.x = Math.sin(j.t * 30 + k) * 0.5; }); }
    }
    j.g.position.set(j.x, h(j.x, j.z), j.z); j.g.rotation.y = j.yaw;
  }
}

// the swarm at the wreck: mining the scrapper; a tendril for Jacob; sulphur breaks it
export function sulphurBlast(x, z) {
  let hit = false;
  if (Math.hypot(SWARM.x - x, SWARM.z - z) < 45) { SWARM.scattered = 25; hit = true; }
  return hit;
}
function updateSwarm(dt, x, z, foot) {
  const sw = SWARM; if (!sw.points) return;
  sw.t += dt; sw.scattered = Math.max(0, sw.scattered - dt);
  const d = Math.hypot(x - sw.x, z - sw.z), cam = G.camera;
  const pulse = 1 + Math.sin(sw.t * 2.4) * 0.18;
  const reaching = sw.scattered <= 0 && d < 30;
  sw.tendril = lerp(sw.tendril, reaching ? 1 : 0, clamp(dt * 0.8, 0, 1));
  const p = sw.pos, n = sw.home.length;
  for (let k = 0; k < n; k++) {
    const hm = sw.home[k], ph = hm[3] + sw.t * 3;
    let tx, ty, tz;
    if (sw.scattered > 0) { const fall = 1 - sw.scattered / 25; tx = sw.x + hm[0] * (3 + fall * 8); ty = Math.max(h(sw.x, sw.z) + 0.05, sw.y + hm[1] * 3 - fall * 4); tz = sw.z + hm[2] * (3 + fall * 8); }
    else if (k % 3 === 0 && sw.tendril > 0.05) { const t = (k / n * 3) % 1; tx = lerp(sw.x, cam.position.x, t * sw.tendril) + Math.sin(ph) * 0.6; ty = lerp(sw.y, cam.position.y, t * sw.tendril) + Math.cos(ph) * 0.4; tz = lerp(sw.z, cam.position.z, t * sw.tendril) + Math.sin(ph * 1.3) * 0.6; }
    else { tx = sw.x + hm[0] * pulse + Math.sin(ph) * 0.15; ty = sw.y + hm[1] * pulse * 0.9 + Math.cos(ph) * 0.12 - 1.2; tz = sw.z + hm[2] * pulse + Math.cos(ph * 0.7) * 0.15; }
    const i = k * 3, f = clamp(dt * (sw.scattered > 0 ? 1.2 : 4), 0, 1);
    p[i] += (tx - p[i]) * f; p[i + 1] += (ty - p[i + 1]) * f; p[i + 2] += (tz - p[i + 2]) * f;
  }
  sw.points.geometry.attributes.position.needsUpdate = true;
  sw.points.material.opacity = sw.scattered > 0 ? 0.35 : 0.9;
  if (d > 60) { if (d > 70 && S.flags.swarmSeen && !sw.left && sw.scrapper) { sw.left = true; bark('I can’t.', ['C', CH2]); } return; }
  if (!S.flags.swarmSeen && d < 60) { S.flags.swarmSeen = true; meet('flies'); bark('It’s not smoke. A shimmering black mist over the wreck, pulsing like a heart. Gossip-flies. Not a handful. A swarm.', ['C', CH2]); }
  if (sw.scattered > 0) return;
  // the broadcast: the dying man's thoughts, and then, when it turns, Jacob's
  const shield = S.inTractor ? 0.6 : 1;                                      // the anima shield: the gauge says it doesn't exist, and it nearly doesn't
  const press = (d < 40 ? 1.5 : 0) + (sw.tendril > 0.5 && d < 25 ? 5 : 0) + (foot && Math.hypot(x - sw.scrapper.x, z - sw.scrapper.z) < 6 ? 8 : 0);
  S.stress = Math.min(100, S.stress + press * shield * dt);
  sw.whisperIn -= dt;
  if (d < 45 && sw.whisperIn <= 0) {
    sw.whisperIn = 3.2;
    const lines = sw.tendril > 0.5 ? AT_JACOB : BROADCAST;
    hooks.whisper(lines[Math.floor(sw.t) % lines.length], ['C', CH2]);
    if (sw.tendril > 0.5 && S.sulphur > 0) once('salts', 'The salts. In the compartment under the seat. G. Then redline it.', ['C', CH2 + ': Sulphur-Salts in the intake']);
  }
}

function updateHaze(dt, x, z) {
  let haze = 0;
  for (const w of W.wattles) { const d = Math.hypot(x - w.x, z - w.z); if (d < w.r + 10) haze = Math.max(haze, smooth(w.r + 10, w.r - 6, d)); }
  S.haze = lerp(S.haze, haze * 0.9, clamp(dt * 1.5, 0, 1));
  if (haze > 0.3) { S.stress = Math.min(100, S.stress + dt * 2 * haze); meet('wattle'); once('wattle', 'Golden Haze. The red’s going green, and there’s water shining up ahead. There’s no water. Keep to the road.', ['C', GUIDE + ': Golden Haze']); }
  // the pans' liquid mirage: there at a distance, gone when you get there; the wattle's only in its haze
  const hot = smooth(7, 9, (S.time / 3600) % 24);
  for (const m of W.mirages) {
    const d = Math.hypot(x - m.x, z - m.z);
    m.m.material.opacity = m.wattle ? haze * 0.55 : smooth(30, 80, d) * (1 - smooth(260, 420, d)) * (0.25 + 0.3 * hot);
  }
  for (const a of W.argus) {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < 30) for (const e of a.eyes) e.lookAt(G.camera.position);
    if (d < 9) { S.stress = Math.min(100, S.stress + dt * 0.6); meet('argus'); }
  }
}
