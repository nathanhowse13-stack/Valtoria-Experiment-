// ============================================================
// The old main road, and what the old world left along it: a power
// line falling down pole by pole (one wire still live, lying across the
// road), Tally Bore (a hamlet of houses coming apart round a dead
// pumping station on the pipeline), the pipeline's burst mains spraying
// (land.js lays the pipe), and what lives along it, all of it from the
// Field Guide and native to the country round Bleak Flats: Scream-Peas
// that have taken the dead poles, the sagging wires and the fences,
// their lidded flowers turning to watch whoever passes; and Drop-Stalkers
// pacing travellers along the ledges of the escarpment above the road.
//
// The road's ruins are new on the road (Experimental). The species are
// the Guide's (Canon); where they grow and how they pace you is the game's.
// ============================================================
import { THREE, TAU, clamp, lerp, smooth, rng, reduceMotion, G, S, P, W, blockers, shades, addThing, bark, once, meet, hooks, MX, rodMX, planarUV, merge, mesh, M, glowTexture, placeRelic, GUIDE, CH1, NEW } from './core.js';
import { h, ROUTES, TALLY, RESERVED, nearestRoad, CANYON, escarpmentPoint } from './land.js';
import { buildStalker } from './life.js';

const here = () => S.inTractor ? { x: G.tractor.x, z: G.tractor.z } : { x: P.x, z: P.z };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _one = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
const X = (why) => ['X', why ? why + ': ' + NEW : NEW];

export function reserveMainRoad() { RESERVED.push({ x: TALLY.x, z: TALLY.z + 8, r: 72 }); }
export function buildMainRoad() { buildPowerLine(); buildTallyBore(); buildScreamPeas(); buildCliffStalkers(); buildSprays(); }
export function updateMainRoad(dt) { updateLiveWire(dt); updateScreamPeas(dt); updateCliffStalkers(dt); updateSprays(dt); updateTown(dt); }

// ---------- the power line: a pole every thirty-eight metres on the west side of the road, from the gate to the walls ----------
const POLE_H = 8.6;
const LOCAL_INS = (len) => [[-0.85, len - 0.4, 0], [0, len + 0.12, 0], [0.85, len - 0.4, 0]];   // where the three wires hang from
export const LIVE = { on: false, x0: 0, z0: 0, x1: 0, z1: 0, cool: 0, arcIn: 1, crossed: false };
function poleMatrix(x, y, z, yaw, tilt) { return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, tilt, 'YXZ')), _one); }
// a pole (or what's left of one) into parts, returning where its wires attach in the world
function pole(parts, m, len, arm = true) {
  const cyl = new THREE.CylinderGeometry(0.13, 0.18, len, 7); cyl.translate(0, len / 2, 0);
  parts.pole.push([cyl, m]);
  if (!arm) return null;
  parts.pole.push([new THREE.BoxGeometry(2.1, 0.14, 0.16), m.clone().multiply(MX(0, len - 0.55, 0))]);
  for (const [ix, iy] of LOCAL_INS(len)) parts.glass.push([new THREE.CylinderGeometry(0.06, 0.085, 0.2, 8), m.clone().multiply(MX(ix, iy - 0.02, 0))]);
  return LOCAL_INS(len).map(([ix, iy, iz]) => new THREE.Vector3(ix, iy + 0.1, iz).applyMatrix4(m));
}
function wire(lines, a, b, sag, ground = false) {
  let prev = null;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), gy = h(x, z) + 0.04;
    const y = ground ? gy : Math.max(gy, lerp(a.y, b.y, t) - sag * Math.sin(Math.PI * t));
    if (prev) lines.push(prev[0], prev[1], prev[2], x, y, z);
    prev = [x, y, z];
  }
}
function buildPowerLine() {
  const chain = [...ROUTES.gate, ...ROUTES.main, ...ROUTES.north].filter(s => s.z > -30 && s.z < 1785);
  const R = rng(4040), poles = [], parts = { pole: [], glass: [] }, lines = [];
  let run = 0, next = 0, prev = null;
  for (const s of chain) {
    if (prev) run += Math.hypot(s.x - prev.x, s.z - prev.z); prev = s;
    if (run < next) continue; next = run + 38;
    const x = s.x + s.dz * 11, z = s.z - s.dx * 11;
    if (Math.hypot(x - TALLY.pump.x, z - TALLY.pump.z) < 8) continue;
    const roll = R();
    poles.push({ x, z, y: h(x, z), yaw: Math.atan2(s.dx, s.dz), run, state: roll < 0.56 ? 'up' : roll < 0.76 ? 'lean' : roll < 0.88 ? 'snapped' : 'down', tilt: (R() < 0.5 ? -1 : 1) * (0.22 + R() * 0.25), ins: null });
  }
  // one has come down across the road, near the bend before Tally Bore, and one of its wires is still live
  const live = poles.reduce((b, p) => Math.abs(p.z - 415) < Math.abs(b.z - 415) ? p : b, poles[0]);
  live.state = 'down'; live.tilt = 1.52; live.live = true;
  for (const p of poles) {
    if (p.state === 'up' || p.state === 'lean') {
      p.upright = true;
      p.m = poleMatrix(p.x, p.y, p.z, p.yaw, p.state === 'lean' ? p.tilt : (R() - 0.5) * 0.08); p.len = POLE_H;
      p.ins = pole(parts, p.m, POLE_H);
      blockers.push({ x: p.x, z: p.z, r: 0.35 });
    } else if (p.state === 'down') {
      // lying in the dirt; if it fell toward the road (+tilt), its top lies in the road
      p.m = poleMatrix(p.x, p.y + 0.16, p.z, p.yaw, p.live ? 1.52 : p.tilt > 0 ? 1.5 : -1.5); p.len = POLE_H;
      p.ins = pole(parts, p.m, POLE_H);
      for (let d = 0.6; d < POLE_H - 0.4; d += 1.1) { const sgn = (p.live || p.tilt > 0) ? -1 : 1; blockers.push({ x: p.x + Math.cos(p.yaw) * sgn * d, z: p.z - Math.sin(p.yaw) * sgn * d, r: 0.3 }); }
    } else {
      // snapped: a stump, and the top lying beside it, crossarm and all
      p.m = poleMatrix(p.x, p.y, p.z, p.yaw, (R() - 0.5) * 0.1); p.len = 3.1;
      pole(parts, p.m, 3.1, false);
      const sgn = p.tilt > 0 ? -1 : 1, bx = p.x + Math.cos(p.yaw) * sgn * 0.7, bz = p.z - Math.sin(p.yaw) * sgn * 0.7;
      p.ins = pole(parts, poleMatrix(bx, h(bx, bz) + 0.16, bz + 0.5, p.yaw + (R() - 0.5) * 0.5, sgn * -1.5), 5.4);
      blockers.push({ x: p.x, z: p.z, r: 0.35 });
    }
  }
  // the wires: strung where both poles stand, dragged to the dirt where one's down, lying loose where both are
  for (let k = 0; k < poles.length - 1; k++) {
    const a = poles[k], b = poles[k + 1];
    if (b.run - a.run > 60) continue;
    for (let i = 0; i < 3; i++) {
      if (a.upright && b.upright) {
        if (R() < 0.12 && i !== 1) { const mid = a.ins[i].clone().lerp(b.ins[i], 0.55); mid.y = h(mid.x, mid.z) + 0.04; wire(lines, a.ins[i], mid, 2); continue; }   // snapped, hanging to the dirt
        const sag = 0.8 + R() * 0.7 + (a.state === 'lean' || b.state === 'lean' ? 0.8 : 0);
        wire(lines, a.ins[i], b.ins[i], sag);
        if (i === 1) W.spans.push({ a: a.ins[i], b: b.ins[i], sag, z: (a.z + b.z) / 2 });
      } else if (a.upright || b.upright) wire(lines, a.ins[i], b.ins[i], 4);
      else if (i !== 2) wire(lines, a.ins[i], b.ins[i], 0, true);
    }
  }
  // the live one: off the fallen pole's crossarm, across the road, and into the dirt on the far side
  {
    const p = live, a = p.ins[0], east = { x: -Math.cos(p.yaw), z: Math.sin(p.yaw) };
    const b = new THREE.Vector3(a.x + east.x * 10.5, 0, a.z + east.z * 10.5 + 1.8); b.y = h(b.x, b.z) + 0.04;
    wire(lines, a, b, 0, true);
    Object.assign(LIVE, { on: true, x0: a.x, z0: a.z, x1: b.x, z1: b.z });
    placeRelic('Insulator glass', new THREE.Vector3(p.x - 1.4, h(p.x - 1.4, p.z + 1.8) + 0.1, p.z + 1.8));
    addThing({ id: 'live-wire', name: 'A fallen power pole', verb: 'Look', x: p.x - 3, y: p.y + 0.6, z: p.z, r: 2.2, prov: X('the power line'), use: () => bark('The pole came down across the road and dragged its wires with it. One of them’s humming. Out here. With nothing at the other end. Don’t touch it.', X('the power line')) });
  }
  G.scene.add(mesh(planarUV(merge(parts.pole), 1.2), M.pole));
  G.scene.add(mesh(merge(parts.glass), M.insulator, { cast: false }));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  G.scene.add(new THREE.LineSegments(lg, M.wire));
  W.poles = poles; W.live = LIVE;
  // the arcs: a little light and a handful of sparks, now and then, where it lies on the road
  const N = 60, pos = new Float32Array(N * 3).fill(-999), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: 0xd8ecff, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; G.scene.add(pts);
  const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xbcd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); light.scale.setScalar(3.5); G.scene.add(light);   // a flash, without adding a light to every surface in the scene
  Object.assign(LIVE, { pts, geo, pos, vel, life, light, i: 0, flash: 0 });
}
function arc(n = 14) {
  const t = 0.55 + Math.random() * 0.45, x = lerp(LIVE.x0, LIVE.x1, t), z = lerp(LIVE.z0, LIVE.z1, t), y = h(x, z) + 0.08;
  for (let k = 0; k < n; k++) { const i = LIVE.i = (LIVE.i + 1) % 60; LIVE.pos.set([x, y, z], i * 3); LIVE.vel.set([(Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3], i * 3); LIVE.life[i] = 0.3 + Math.random() * 0.4; }
  LIVE.light.position.set(x, y + 0.3, z); LIVE.flash = 1;
  return { x, z };
}
function segDist(px, pz) {
  const dx = LIVE.x1 - LIVE.x0, dz = LIVE.z1 - LIVE.z0, t = clamp(((px - LIVE.x0) * dx + (pz - LIVE.z0) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (LIVE.x0 + dx * t), pz - (LIVE.z0 + dz * t));
}
function updateLiveWire(dt) {
  if (!LIVE.on) return;
  const p = here(), far = Math.hypot(p.x - LIVE.x0, p.z - LIVE.z0);
  LIVE.cool = Math.max(0, LIVE.cool - dt);
  if (far < 150) {
    LIVE.arcIn -= dt;
    if (LIVE.arcIn <= 0) { arc(); LIVE.arcIn = 0.6 + Math.random() * 1.8; if (far < 45) hooks.sfx.zap(clamp(1 - far / 45, 0.15, 1)); }
    // on foot, touch it and it bites; the tractor rolls over it on leather
    const d = segDist(p.x, p.z);
    if (!S.inTractor && d < 0.5 && LIVE.cool <= 0) {
      LIVE.cool = 3; arc(30); hooks.sfx.zap(1); hooks.hurt(18, 'wire'); P.stun = 0.8; S.stress = Math.min(100, S.stress + 15);
      bark('Still live. Every hair on my arms is standing up and my teeth hurt. Don’t touch the wires, Jacob.', X('the power line'));
    } else if (S.inTractor && d < 1.8 && Math.abs(G.tractor.speed) > 0.3 && LIVE.cool <= 0) {
      LIVE.cool = 2; arc(24); hooks.sfx.zap(0.8);
      if (!LIVE.crossed) { LIVE.crossed = true; bark('Sparks off the rim, and nothing. Leather wheels. Best insulator I own.', X('the tractor’s leather wheels')); }
    }
  }
  LIVE.flash = Math.max(0, LIVE.flash - dt * 9); LIVE.light.material.opacity = LIVE.flash;
  let any = false;
  for (let i = 0; i < 60; i++) {
    if (LIVE.life[i] <= 0) { LIVE.pos[i * 3 + 1] = -999; continue; }
    any = true; LIVE.life[i] -= dt; LIVE.vel[i * 3 + 1] -= 9 * dt;
    for (let a = 0; a < 3; a++) LIVE.pos[i * 3 + a] += LIVE.vel[i * 3 + a] * dt;
  }
  if (any || LIVE.flash) LIVE.geo.attributes.position.needsUpdate = true;
}

// ---------- Tally Bore: a hamlet built round a pumping station, left when the pipe failed ----------
const VER = { state: 'none' };
const WINDMILL = { wheel: null };
// a weatherboard house with a tin roof, in one of four states of coming apart. Front (door) is local +z.
function house({ x, z, yaw, kind }) {
  const y = h(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; G.scene.add(g);
  const Wd = 7, D = 6, H = 2.6, T = 0.12, R = rng(Math.round(x * 31 + z * 7));
  const boards = [], iron = [], bricks = [], solid = [];
  const wall = (cx, cz, w, d, ht = H, block = true) => { boards.push([new THREE.BoxGeometry(w, ht, d), MX(cx, ht / 2, cz)]); if (block) solid.push([cx, cz, w, d]); };
  const slope = Math.atan2(1.2, D / 2 + 0.4), slab = Math.hypot(D / 2 + 0.4, 1.2);
  const roofHalf = (s, len = Wd + 0.6, off = 0) => iron.push([new THREE.BoxGeometry(len, 0.05, slab), MX(off, H + 0.6, s * (D / 4 + 0.2), s * slope, 0, 0)]);
  boards.push([new THREE.BoxGeometry(Wd, 0.1, D), MX(0, 0.05, 0)]);                                   // the floor
  bricks.push([new THREE.BoxGeometry(0.7, H + 2.2, 0.7), MX(-Wd / 2 + 0.7, (H + 2.2) / 2, -D / 2 + 0.6)]);   // the chimney, last thing standing in most of these
  const debris = (n, spread) => { for (let k = 0; k < n; k++) boards.push([new THREE.BoxGeometry(0.16 + R() * 0.1, 0.03, 1.2 + R() * 1.8), MX((R() - 0.5) * spread, 0.12 + R() * 0.1, (R() - 0.5) * spread, (R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.3)]); };
  if (kind === 'racked' || kind === 'verandah') {
    wall(0, -D / 2, Wd, T); wall(-Wd / 2, 0, T, D); wall(Wd / 2, 0, T, D);
    wall(-(Wd / 2 + 0.6) / 2, D / 2, Wd / 2 - 0.6, T); wall((Wd / 2 + 0.6) / 2, D / 2, Wd / 2 - 0.6, T); wall(0, D / 2, 1.2, T, 0.5, false); boards[boards.length - 1][1] = MX(0, H - 0.25, D / 2);
    roofHalf(-1); kind === 'racked' ? roofHalf(1, Wd * 0.55, -Wd * 0.2) : roofHalf(1);                  // half the iron gone off one side
  } else if (kind === 'caved') {
    wall(0, -D / 2, Wd, T); wall(-Wd / 2, 0, T, D); wall(Wd / 2, -D / 4, T, D / 2, 1.1); wall(-(Wd / 2 + 0.6) / 2, D / 2, Wd / 2 - 0.6, T);
    roofHalf(-1);
    iron.push([new THREE.BoxGeometry(Wd * 0.8, 0.05, slab), MX(0.8, 1.2, D / 4, -0.55, 0.15, 0.32)]);   // the front of the roof, fallen in across the room
    debris(9, 5);
  } else {   // shell: only the front wall and the chimney still stand, like a stage set
    wall(-(Wd / 2 + 0.6) / 2, D / 2, Wd / 2 - 0.6, T); wall((Wd / 2 + 0.6) / 2, D / 2, Wd / 2 - 0.6, T); wall(0, D / 2, 1.2, T, 0.5, false); boards[boards.length - 1][1] = MX(0, H - 0.25, D / 2);
    iron.push([new THREE.BoxGeometry(Wd * 0.7, 0.05, slab), MX(1.5, 0.2, -D / 2 - 1.5, 0.08, 0.4, 0.05)]);
    debris(14, 6.5);
  }
  let bGeo = merge(boards), iGeo = merge(iron);
  if (kind === 'racked') { const shear = new THREE.Matrix4().set(1, 0.17, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); bGeo.applyMatrix4(shear); iGeo.applyMatrix4(shear); bGeo.computeVertexNormals(); }
  g.add(mesh(planarUV(bGeo, 1.2), M.boards)); g.add(mesh(planarUV(iGeo, 1), M.corr)); g.add(mesh(merge(bricks), M.brick));
  const world = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, 0, z));
  for (const [cx, cz, w, d] of solid) { const a = world(cx - w / 2, cz - d / 2), b = world(cx + w / 2, cz + d / 2); blockers.push({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) }); }
  { const c = world(-Wd / 2 + 0.7, -D / 2 + 0.6); blockers.push({ x: c.x, z: c.z, r: 0.45 }); }
  if (kind === 'racked' || kind === 'verandah') shades.push({ x, z, r: 2.6, why: 'house' });
  return { g, y, world, Wd, D, H, yaw, x, z };
}
function buildTallyBore() {
  const T = TALLY, R = rng(1717);
  // the houses: two west of the road, two east, all facing it
  const h1 = house({ x: T.x + 23, z: T.z - 27, yaw: -Math.PI / 2, kind: 'racked' });
  const h2 = house({ x: T.x + 25, z: T.z + 21, yaw: -Math.PI / 2 + 0.1, kind: 'caved' });
  const h3 = house({ x: T.x - 23, z: T.z - 19, yaw: Math.PI / 2, kind: 'shell' });
  const h4 = house({ x: T.x - 26, z: T.z + 25, yaw: Math.PI / 2 - 0.05, kind: 'verandah' });
  const furnish = (hs, lx, lz, geo, mat, ly) => { const p = hs.world(lx, lz), m = mesh(geo, mat); m.position.set(p.x, hs.y + ly, p.z); m.rotation.y = hs.yaw; G.scene.add(m); return p; };
  // inside the racked one: a cot, a table, and a calendar
  furnish(h1, -2.3, -1.4, planarUV(new THREE.BoxGeometry(0.9, 0.45, 1.9), 1), M.canvas, 0.33);
  furnish(h1, 1.6, -1.6, planarUV(new THREE.BoxGeometry(1.2, 0.08, 0.8), 0.8), M.timber, 0.8);
  { const p = h1.world(0.5, -h1.D / 2 + 0.2); addThing({ id: 'tally:calendar', name: 'A calendar', verb: 'Read', x: p.x, y: h1.y + 1.6, z: p.z, r: 1.4, prov: X('Tally Bore'), use: () => { meet('ruin'); bark('A calendar, the days crossed off in pencil. The crosses stop on a Tuesday. Under it, in the same pencil: PRESSURE 9. GOING TO THE FLATS. LEAVE THE DOOR, IT DOESN’T SHUT.', X('Tally Bore')); } }); }
  // the caved one: the roof's in the room, and something small left on the floor
  placeRelic('Tin wind-up bird', (() => { const p = h2.world(-2.1, -1.8); return new THREE.Vector3(p.x, h2.y + 0.18, p.z); })());
  { const p = h2.world(0, 1); addThing({ id: 'tally:caved', name: 'The fallen roof', verb: 'Look', x: p.x, y: h2.y + 1.2, z: p.z, r: 2, prov: X('Tally Bore'), use: () => bark('The front of the roof came down into the room in one piece, iron and rafters and all. Whoever slept here wasn’t in bed when it went. I hope.', X('Tally Bore')) }); }
  // the shell
  { const p = h3.world(0, 2.5); addThing({ id: 'tally:shell', name: 'What’s left of a house', verb: 'Look', x: p.x, y: h3.y + 1.4, z: p.z, r: 2.4, prov: X('Tally Bore'), use: () => bark('Only the front wall and the chimney still stand, like a stage set. Walk through the door and you’re outside again. The rest is boards and roof iron in a heap.', X('Tally Bore')) }); }
  // the one with the verandah: a chair under it, a tank beside it, and words over the door
  {
    const hs = h4, pivot = new THREE.Group(), pv = hs.world(0, hs.D / 2); pivot.position.set(pv.x, hs.y + hs.H - 0.1, pv.z); pivot.rotation.order = 'YXZ'; pivot.rotation.y = hs.yaw; pivot.rotation.x = 0.16; pivot.rotation.z = 0.05; G.scene.add(pivot);
    const roof = mesh(planarUV(new THREE.BoxGeometry(hs.Wd + 0.8, 0.05, 2.5), 1), M.corr); roof.position.set(0, 0, 1.25); pivot.add(roof);
    const beam = mesh(planarUV(new THREE.BoxGeometry(hs.Wd + 0.8, 0.12, 0.12), 0.6), M.timber); beam.position.set(0, -0.06, 2.4); pivot.add(beam);
    const pp = hs.world(-hs.Wd / 2, hs.D / 2 + 2.35), post = new THREE.Group(); post.position.set(pp.x, hs.y, pp.z); post.rotation.y = hs.yaw; G.scene.add(post);
    const pm = mesh(planarUV(new THREE.BoxGeometry(0.12, 2.3, 0.12), 0.6), M.timber); pm.position.y = 1.15; post.add(pm);
    const stump = hs.world(hs.Wd / 2, hs.D / 2 + 2.35), sm = mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), M.timber); sm.position.set(stump.x, hs.y + 0.25, stump.z); G.scene.add(sm);   // the other post, rotted off
    const chair = furnish(hs, 1.6, hs.D / 2 + 1.1, planarUV(new THREE.BoxGeometry(0.5, 0.45, 0.5), 0.6), M.timber, 0.23);
    furnish(hs, 1.6, hs.D / 2 + 0.85, planarUV(new THREE.BoxGeometry(0.5, 0.6, 0.06), 0.6), M.timber, 0.75);
    Object.assign(VER, { state: 'up', pivot, post, hs, timer: 0, sat: false, creaked: false, t: 0 });
    addThing({ id: 'tally:chair', name: 'A chair on the verandah', verb: 'Sit a moment', x: chair.x, y: hs.y + 0.6, z: chair.z, r: 1.3, prov: X('Tally Bore'), enabled: () => VER.state === 'up', use: () => {
      VER.sat = true; P.x = chair.x; P.z = chair.z; S.stress = Math.max(0, S.stress - 12); hooks.updateVitals();
      bark('Off my feet, in the shade of a verandah somebody built to sit on. Just for a—', X('Tally Bore'));
    } });
    const door = hs.world(0, hs.D / 2 + 0.1);
    addThing({ id: 'tally:door', name: 'Words over the door', verb: 'Read', x: door.x, y: hs.y + 2.3, z: door.z, r: 1.6, prov: X('Tally Bore'), use: () => { meet('ruin'); bark('Painted over the door: GOD BLESS THIS HOUSE. Somebody’s added, smaller, in a different hand: AND THE PIPE.', X('Tally Bore')); } });
    const tp = hs.world(hs.Wd / 2 + 1, -1), tank = mesh(planarUV(new THREE.CylinderGeometry(0.75, 0.75, 1.7, 16), 1), M.tank); tank.position.set(tp.x, hs.y + 0.85, tp.z); G.scene.add(tank);
    blockers.push({ x: tp.x, z: tp.z, r: 0.85 });
    W.water = W.water || []; W.water.push({ id: 'tally:tank', name: 'Rainwater tank', x: tp.x, y: hs.y + 1, z: tp.z, once: true, line: 'A rainwater tank with a hand’s depth left in it, warm as tea. Whoever left it full enough to share, thanks.' });
  }
  // the pump house, straddling the pipeline: the pump, the valve, and the logbook
  {
    const p = T.pump, y = h(p.x, p.z), g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = Math.PI / 2; G.scene.add(g);
    const shed = [], Wd = 4.2, D = 3.2, H = 2.7;
    for (const [cx, cz, w, d] of [[0, -D / 2, Wd, 0.06], [-Wd / 2, 0, 0.06, D], [Wd / 2, 0, 0.06, D], [-1.2, D / 2, 1.8, 0.06], [1.5, D / 2, 1.2, 0.06]]) shed.push([new THREE.BoxGeometry(w, H, d), MX(cx, H / 2, cz)]);
    shed.push([new THREE.BoxGeometry(Wd + 0.5, 0.05, D + 0.6), MX(0, H + 0.1, 0, 0.08, 0, 0)]);
    g.add(mesh(planarUV(merge(shed), 1), M.corr));
    const machine = [[new THREE.CylinderGeometry(0.45, 0.5, 1.2, 14), MX(-0.8, 0.6, -0.7)], [new THREE.TorusGeometry(0.55, 0.08, 6, 18), MX(-0.15, 1.0, -0.7, 0, Math.PI / 2, 0)], [new THREE.CylinderGeometry(0.34, 0.34, Wd + 9, 12), MX(0, 1.95, 0, 0, 0, Math.PI / 2)]];
    g.add(mesh(planarUV(merge(machine), 0.8), M.rust));
    const wheel = mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 16), M.iron); wheel.position.set(1.1, 1.95, 0.42); g.add(wheel);
    for (let k = 0; k < 3; k++) { const s = mesh(new THREE.BoxGeometry(0.6, 0.03, 0.03), M.iron); s.rotation.z = k * Math.PI / 3; wheel.add(s); }
    // the walls (the door's on the road side), the pipe either end, and the pump
    blockers.push({ x0: p.x - D / 2, z0: p.z - Wd / 2 - 4.5, x1: p.x + D / 2, z1: p.z - Wd / 2 + 0.05 }, { x0: p.x - D / 2, z0: p.z + Wd / 2 - 0.05, x1: p.x + D / 2, z1: p.z + Wd / 2 + 4.5 }, { x0: p.x - D / 2 - 0.05, z0: p.z - Wd / 2, x1: p.x - D / 2 + 0.1, z1: p.z + Wd / 2 },
      { x0: p.x + D / 2 - 0.05, z0: p.z + 0.3, x1: p.x + D / 2 + 0.05, z1: p.z + Wd / 2 }, { x0: p.x + D / 2 - 0.05, z0: p.z - Wd / 2, x1: p.x + D / 2 + 0.05, z1: p.z - 0.9 }, { x: p.x - 0.7, z: p.z + 0.8, r: 0.6 });
    const wpos = new THREE.Vector3(1.1, 1.95, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).add(g.position);
    addThing({ id: 'tally:valve', name: 'The valve wheel', verb: () => S.flags.valve ? 'Close it' : 'Turn the wheel', x: wpos.x, y: y + 1.6, z: wpos.z, r: 1.4, prov: X('Tally Bore'), use: () => {
      S.flags.valve = !S.flags.valve; hooks.sfx.creak(); wheel.rotation.z += S.flags.valve ? 1.4 : -1.4;
      bark(S.flags.valve ? 'Seized. Then it gives, a quarter turn, with a shriek. Down the line, the burst main coughs and throws its spray higher. There’s still something in the bore.' : 'Back the way it was. Whatever’s left down there, it isn’t mine to waste.', X('Tally Bore'));
    } });
    const lp = new THREE.Vector3(-0.8, 1.27, -0.7).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).add(g.position);
    placeRelic('Pump-house logbook', lp);
    shades.push({ x: p.x, z: p.z, r: 1.8, why: 'shed' });
  }
  // the windmill, half its blades gone, still turning when the wind finds it; and the water tower that fell
  {
    const x = T.x + 40, z = T.z - 3, y = h(x, z), parts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push([new THREE.CylinderGeometry(0.06, 0.06, 1, 5), rodMX([x + sx * 1.4, y, z + sz * 1.4], [x + sx * 0.25, y + 10, z + sz * 0.25])]);
    for (let l = 1; l < 5; l++) { const t = l / 5, r = lerp(1.4, 0.25, t); parts.push([new THREE.BoxGeometry(r * 2, 0.05, 0.05), MX(x, y + t * 10, z - r)], [new THREE.BoxGeometry(r * 2, 0.05, 0.05), MX(x, y + t * 10, z + r)]); }
    parts.push([new THREE.BoxGeometry(0.3, 0.3, 1.2), MX(x, y + 10.2, z)], [new THREE.BoxGeometry(0.04, 1.0, 1.4), MX(x, y + 10.4, z - 1.2)]);
    G.scene.add(mesh(merge(parts), M.rust));
    const wheel = new THREE.Group(); wheel.position.set(x, y + 10.2, z + 0.7); G.scene.add(wheel);
    const blades = [];
    for (let k = 0; k < 18; k++) { if ([2, 3, 7, 11, 12, 15].includes(k)) continue; const a = k / 18 * TAU; blades.push([new THREE.BoxGeometry(0.22, 1.5, 0.02), new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * 1.1, Math.cos(a) * 1.1, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, -a)), _one)]); }
    blades.push([new THREE.TorusGeometry(1.0, 0.03, 4, 24), new THREE.Matrix4()]);
    wheel.add(mesh(merge(blades), M.tin));
    WINDMILL.wheel = wheel; WINDMILL.x = x; WINDMILL.z = z;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) blockers.push({ x: x + sx * 1.4, z: z + sz * 1.4, r: 0.2 });
    addThing({ id: 'tally:windmill', name: 'The windmill', verb: 'Look', x, y: y + 1.5, z, r: 3, prov: X('Tally Bore'), use: () => bark('A windmill, a third of its blades gone, still turning when the wind finds it. Pumping nothing. The bore’s down there somewhere, dry or near enough.', X('Tally Bore')) });
  }
  {
    const x = T.x - 38, z = T.z + 3, y = h(x, z), legs = [];
    legs.push([new THREE.CylinderGeometry(0.08, 0.08, 1, 6), rodMX([x - 1.2, y, z - 1.2], [x - 1.0, y + 6, z - 1.0])], [new THREE.CylinderGeometry(0.08, 0.08, 1, 6), rodMX([x + 1.2, y, z - 1.2], [x + 1.0, y + 6, z - 1.0])]);
    legs.push([new THREE.CylinderGeometry(0.08, 0.08, 1, 6), rodMX([x + 1.2, y, z + 1.2], [x + 2.6, y + 2.4, z + 3.1])], [new THREE.CylinderGeometry(0.08, 0.08, 1, 6), rodMX([x - 1.2, y, z + 1.2], [x - 0.6, y + 1.2, z + 4.0])]);   // buckled
    legs.push([new THREE.BoxGeometry(2.4, 0.12, 0.12), MX(x, y + 6, z - 1.0)]);
    G.scene.add(mesh(merge(legs), M.rust));
    const tank = mesh(planarUV(new THREE.CylinderGeometry(1.5, 1.5, 3, 18, 1, true), 1), M.tank); tank.position.set(x + 1, y + 1.45, z + 5.5); tank.rotation.set(Math.PI / 2, 0.4, 0); G.scene.add(tank);
    blockers.push({ x: x + 1, z: z + 5.5, r: 1.6 }, { x: x - 1.1, z: z - 1.1, r: 0.25 }, { x: x + 1.1, z: z - 1.1, r: 0.25 });
    addThing({ id: 'tally:tower', name: 'The water tower', verb: 'Look', x: x + 1, y: y + 1.5, z: z + 4.5, r: 2.4, prov: X('Tally Bore'), use: () => bark('The water tower came down when two legs buckled. The tank split along its seam when it hit. Rust on the inside, and a tidemark halfway up. They had water here once. Half a tank of it.', X('Tally Bore')) });
  }
  // a car left on the shoulder, stripped to the springs
  {
    const x = T.x - 11, z = T.z - 10, y = h(x, z), parts = [];
    parts.push([new THREE.BoxGeometry(1.7, 0.7, 4.2), MX(x, y + 0.6, z, 0.04, 0.12, 0.05)], [new THREE.BoxGeometry(1.5, 0.6, 2.0), MX(x + 0.05, y + 1.2, z - 0.3, 0.04, 0.12, 0.05)]);
    for (const [sx, sz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.4], [0.85, -1.4]]) parts.push([new THREE.BoxGeometry(0.3, 0.3, 0.3), MX(x + sx, y + 0.15, z + sz)]);   // up on blocks
    G.scene.add(mesh(planarUV(merge(parts), 1), M.rust));
    blockers.push({ x0: x - 1, z0: z - 2.2, x1: x + 1, z1: z + 2.2 });
    addThing({ id: 'tally:car', name: 'A car', verb: 'Look', x, y: y + 1, z, r: 2.6, prov: X('Tally Bore'), use: () => bark('A car. Four doors, glass long gone, seats eaten to the springs, up on blocks because somebody wanted the wheels more than the car. The jaw-jaws have had every wire out of it.', ['P', 'the Farm of Rust sketch, for the jaw-jaws']) });
  }
  // the fence along the backs of the western houses, half of it down
  {
    const posts = [], lines = []; let prev = null;
    for (let z = T.z - 46; z < T.z + 50; z += 3.2) {
      const x = T.x + 17 + Math.sin(z * 0.2) * 0.3, y = h(x, z), down = R() < 0.22, gap = Math.sin(z * 0.13) > 0.75;
      if (gap) { prev = null; continue; }
      posts.push([new THREE.CylinderGeometry(0.05, 0.06, 1.2, 5), down ? MX(x + 0.5, y + 0.06, z, 0, 0, 1.5) : MX(x, y + 0.6, z, (R() - 0.5) * 0.15, 0, (R() - 0.5) * 0.15)]);
      if (!down && prev) for (const hy of [0.6, 1.0]) lines.push(prev[0], prev[1] + hy - (R() < 0.3 ? 0.4 : 0), prev[2], x, y + hy, z);
      prev = down ? null : [x, y, z];
    }
    G.scene.add(mesh(merge(posts), M.timber));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); G.scene.add(new THREE.LineSegments(lg, M.wire));
  }
  W.flySources.push({ x: T.x, z: T.z, r: 40 });
}
function updateTown(dt) {
  if (WINDMILL.wheel) WINDMILL.wheel.rotation.z += dt * (0.5 + 0.45 * Math.sin(G.time * 0.21));
  if (VER.state === 'up') {
    if (S.inTractor || G.area !== 'out') { VER.timer = 0; VER.sat = false; return; }
    const hs = VER.hs, dx = P.x - hs.x, dz = P.z - hs.z, c = Math.cos(hs.yaw), s = Math.sin(hs.yaw);
    const lx = c * dx - s * dz, lz = s * dx + c * dz, under = Math.abs(lx) < hs.Wd / 2 + 0.4 && lz > hs.D / 2 + 0.1 && lz < hs.D / 2 + 2.6;
    if (under) {
      VER.timer += dt * (VER.sat ? 2.2 : 1);
      if (VER.timer > 0.6 && !VER.creaked) { VER.creaked = true; hooks.sfx.creak(); bark('The verandah groans over my head. Dust sifting down through the iron.', X('Tally Bore')); }
      if (VER.timer > 2.8) { VER.state = 'falling'; VER.t = 0; hooks.sfx.crash(); }
    } else { VER.timer = Math.max(0, VER.timer - dt * 0.5); VER.sat = false; }
  } else if (VER.state === 'falling') {
    VER.t = Math.min(1, VER.t + dt / 0.4); const e = VER.t * VER.t;
    VER.pivot.rotation.x = lerp(0.16, 1.02, e); VER.post.rotation.z = lerp(0, 1.4, e);
    if (VER.t >= 1) {
      VER.state = 'down';
      const hs = VER.hs, dx = P.x - hs.x, dz = P.z - hs.z, c = Math.cos(hs.yaw), s = Math.sin(hs.yaw), lx = c * dx - s * dz, lz = s * dx + c * dz;
      const under = !S.inTractor && Math.abs(lx) < hs.Wd / 2 + 0.4 && lz > hs.D / 2 + 0.1 && lz < hs.D / 2 + 2.8;
      if (under) { hooks.hurt(14, 'house'); P.stun = 0.6; S.stress = Math.min(100, S.stress + 15); bark('The whole verandah came down on me. Iron and rot and a hundred years of dust. Nothing broken. Nothing of mine.', X('Tally Bore')); }
      else bark('And down it comes, the whole verandah, right where I was standing. Nothing out here is holding itself up any more.', X('Tally Bore'));
    }
  }
}

// ---------- Scream-Peas: up the dead poles, hanging off the wires, along Tally Bore's fence and the walls of the Flats ----------
// By day the pods are shut against the light and the vines are quiet (Chapter One); the lidded flowers still turn to
// watch whoever passes, and open their eyes when you come close (the Farm of Rust sketch's look). Put your face
// to a pod and it splits and screams.
const PEAS = { list: [], petal: null, eye: null, pupil: null, lid: null, cool: 0, dawnIn: 1.5 };
function wirePoint(sp, t, out) { out.copy(sp.a).lerp(sp.b, t); out.y -= sp.sag * Math.sin(Math.PI * t); return out; }
const _z = new THREE.Vector3(0, 0, 1), _x = new THREE.Vector3(1, 0, 0), _lq = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function buildScreamPeas() {
  const R = rng(919), vines = [], pods = [];
  const flower = (p, out) => PEAS.list.push({ p: p.clone(), out: out.clone().normalize(), look: out.clone().normalize(), lid: 0, d: 1e9 });
  const pod = (p, yaw, tilt) => pods.push([new THREE.SphereGeometry(1, 8, 6), new THREE.Matrix4().compose(p, _q.setFromEuler(_e.set(tilt, yaw, 0.3, 'YXZ')), _s.set(0.07, 0.045, 0.17))]);
  const strand = (pts, r = 0.028) => vines.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 3), r, 5, false), new THREE.Matrix4()]);
  // up the poles, standing or fallen: a vine wound round each, flowers facing out
  W.poles.forEach((p, i) => {
    if (i % 2 !== 1 || !p.m) return;
    const turns = 2 + R() * 2.5, top = (p.state === 'up' || p.state === 'lean' ? 0.45 + R() * 0.5 : 1) * p.len, pts = [];
    for (let k = 0; k <= 26; k++) { const t = k / 26, a = t * turns * TAU + i; pts.push(new THREE.Vector3(Math.cos(a) * 0.19, t * top, Math.sin(a) * 0.19).applyMatrix4(p.m)); }
    strand(pts, 0.045);
    const n = 4 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const t = 0.12 + R() * 0.85, a = t * turns * TAU + i + 0.5, local = new THREE.Vector3(Math.cos(a) * 0.36, t * top, Math.sin(a) * 0.36);
      const wp = local.clone().applyMatrix4(p.m), out = new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).transformDirection(p.m);
      if (wp.y < h(wp.x, wp.z) + 0.15) wp.y = h(wp.x, wp.z) + 0.15;
      flower(wp, out); if (R() < 0.7) pod(local.set(Math.cos(a + 0.6) * 0.28, t * top - 0.25, Math.sin(a + 0.6) * 0.28).applyMatrix4(p.m), R() * 3, R() - 0.5);
    }
  });
  // along the sagging wires: tendrils hung off them, flowers at the ends, in rows
  W.spans.forEach((sp, i) => {
    if (i % 2 !== 0 || sp.z < 140) return;
    const n = 3 + Math.floor(R() * 5), run = [];
    for (let k = 0; k <= 12; k++) run.push(wirePoint(sp, 0.1 + k / 12 * 0.8, new THREE.Vector3()).add(_p.set(0, -0.04, 0)));
    strand(run, 0.03);
    for (let k = 0; k < n; k++) {
      const top = wirePoint(sp, 0.12 + R() * 0.76, new THREE.Vector3()), len = 0.35 + R() * 0.9, end = top.clone().add(_p.set((R() - 0.5) * 0.3, -len, (R() - 0.5) * 0.3));
      strand([top, top.clone().lerp(end, 0.5).add(_p.set((R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2)), end], 0.022);
      flower(end, _s.set(R() - 0.5, -0.4, R() - 0.5));
      if (R() < 0.5) pod(top.clone().lerp(end, 0.4), R() * 3, 1.3);
    }
  });
  // Tally Bore's back fence, half of it down
  { const T = TALLY, pts = [];
    for (let z = T.z - 44; z < T.z + 48; z += 1.6) { const x = T.x + 17 + Math.sin(z * 0.2) * 0.3 + Math.sin(z * 1.3) * 0.12; pts.push(new THREE.Vector3(x, h(x, z) + 0.35 + 0.35 * Math.sin(z * 0.7), z)); if (Math.sin(z * 0.13) > 0.75) { if (pts.length > 2) strand(pts.splice(0)); else pts.length = 0; } }
    if (pts.length > 2) strand(pts);
    for (let z = T.z - 42; z < T.z + 46; z += 2.6 + R() * 2) { if (Math.sin(z * 0.13) > 0.72) continue; const x = T.x + 17.2, p = new THREE.Vector3(x, h(x, z) + 0.45 + R() * 0.5, z); flower(p, _s.set(-1, 0.2, (R() - 0.5) * 0.6)); if (R() < 0.6) pod(p.clone().add(_p.set(0.1, -0.2, 0.3)), R() * 3, 0.2); }
  }
  // the walls of Bleak Flats either side of the gate, where the Guide has them
  for (let a = -0.3; a <= 0.3; a += 0.0125) {
    if (Math.abs(a) < 0.045) continue;
    const cx = 0, cz = 2015, rad = 178, x = cx + Math.sin(a) * (rad - 0.25), z = cz - Math.cos(a) * (rad - 0.25), y = h(x, z) - 0.5;
    const low = 0.6 + R() * 1.2, high = low + 1 + R() * 4, pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(new THREE.Vector3(x + Math.cos(a) * Math.sin(t * 9 + a * 50) * 0.3, y + lerp(low, high, t), z + Math.sin(a) * Math.sin(t * 9) * 0.3)); }
    strand(pts, 0.035);
    if (R() < 0.75) { const p = pts[2 + Math.floor(R() * 4)].clone(); p.z -= 0.15; flower(p, _s.set(-Math.sin(a) * 0.4, 0, -1)); }
    if (R() < 0.6) pod(pts[1].clone().add(_p.set(0, 0, -0.12)), a, 0.4);
  }
  G.scene.add(mesh(merge(vines), M.peaVine, { cast: false }));
  G.scene.add(mesh(merge(pods), M.peaPod, { cast: false }));
  // the flowers: four instanced parts, posed each frame for the ones near enough to see
  const n = PEAS.list.length, inst = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; G.scene.add(im); return im; };
  // a flower the size of a hand: a cup of five arterial-red petals round a lidded eye
  const cup = new THREE.ConeGeometry(0.22, 0.2, 5, 1, true); cup.rotateX(-Math.PI / 2); cup.translate(0, 0, -0.02);
  const lid = new THREE.SphereGeometry(0.112, 14, 7, 0, TAU, 0, Math.PI / 2);
  PEAS.petal = inst(cup, M.peaPetal); PEAS.eye = inst(new THREE.SphereGeometry(0.105, 14, 10), M.peaEye); PEAS.pupil = inst(new THREE.SphereGeometry(0.05, 12, 8), M.pupil); PEAS.lid = inst(lid, M.peaLid);
  PEAS.list.forEach((f, i) => poseFlower(f, i));
  PEAS.petal.instanceMatrix.needsUpdate = PEAS.eye.instanceMatrix.needsUpdate = PEAS.pupil.instanceMatrix.needsUpdate = PEAS.lid.instanceMatrix.needsUpdate = true;
  W.peas = PEAS;
}
function poseFlower(f, i) {
  _q.setFromUnitVectors(_z, f.look);
  PEAS.petal.setMatrixAt(i, _m.compose(f.p, _q, _one));
  PEAS.eye.setMatrixAt(i, _m.compose(f.p, _q, _one));
  _p.copy(f.look).multiplyScalar(0.085).add(f.p);
  PEAS.pupil.setMatrixAt(i, _m.compose(_p, _q, _s.set(1, 1, 0.45)));
  _lq.setFromAxisAngle(_x, lerp(Math.PI / 2, -0.55, f.lid));                // closed, the dome faces forward over the eye; open, it rolls back
  PEAS.lid.setMatrixAt(i, _m.compose(f.p, _q.clone().multiply(_lq), _one));
}
function updateScreamPeas(dt) {
  if (!PEAS.list.length || G.area !== 'out') return;
  const cam = G.camera.position, p = here(), foot = !S.inTractor;
  PEAS.cool = Math.max(0, PEAS.cool - dt);
  let near = 1e9, touched = null, any = false;
  PEAS.list.forEach((f, i) => {
    const dx = cam.x - f.p.x, dz = cam.z - f.p.z;
    if (Math.abs(dz) > 80 || Math.abs(dx) > 80) return;
    const d = Math.hypot(dx, dz); f.d = d; near = Math.min(near, d);
    // every flower turns to watch, and the eyes open as he comes close
    _p.set(dx, cam.y - f.p.y, dz).normalize();
    f.look.lerp(d < 45 ? _p : f.out, clamp(dt * (d < 45 ? 2.5 : 0.5), 0, 1)).normalize();
    f.lid = lerp(f.lid, d < 9 ? 1 : 0, clamp(dt * 3, 0, 1));
    if (foot && Math.hypot(p.x - f.p.x, p.z - f.p.z) < 1.3 && Math.abs(cam.y - f.p.y) < 1.6) touched = f;
    poseFlower(f, i); any = true;
  });
  if (any) PEAS.petal.instanceMatrix.needsUpdate = PEAS.eye.instanceMatrix.needsUpdate = PEAS.pupil.instanceMatrix.needsUpdate = PEAS.lid.instanceMatrix.needsUpdate = true;
  if (near < 14) { meet('peas'); once('peas', 'Scream-Peas. All the way up the dead pole and along the wire. Pods shut tight against the light, quiet as they ever get. And every flower turned to watch me come.', ['C', GUIDE + '; quiet by day: ' + CH1]); }
  // too close to a pod, and it wakes
  if (touched && PEAS.cool <= 0) {
    PEAS.cool = 8; hooks.sfx.scream(1); S.stress = Math.min(100, S.stress + 12); if (!reduceMotion) P.shake = 0.03;
    bark('A pod split open a hand’s width from my face and screamed. In broad daylight. I must have woken it.', X('waking a pod by day'));
  }
  // the last of the night's screaming, still going in the shade at dawn
  if ((S.time / 3600) % 24 < 7 && near < 60) {
    PEAS.dawnIn -= dt;
    if (PEAS.dawnIn <= 0) { PEAS.dawnIn = 5 + Math.random() * 7; hooks.sfx.scream(clamp(1 - near / 60, 0.15, 0.6)); once('peas-dawn', 'The last of the Scream-Peas, still at it in the shade. They’ll shut up when the sun gets to them.', ['C', CH1]); }
  }
}

// ---------- Drop-Stalkers on the escarpment: pacing travellers on the old main road, ledge to ledge ----------
// The Guide puts them round rocky overhangs; this escarpment is all overhang. Two of them keep pace with anything on the
// road below, and every time you look up, the one you're looking at is pressed flat to the rock, the colour of it.
// Walk under the cliff and they come along the ledges to be over you. Hold one's eye and it won't drop.
const CLIFF = [];
function buildCliffStalkers() {
  for (const [z, v, ahead] of [[470, 0.24, 24], [560, 0.4, -16]]) {
    const home = escarpmentPoint(z, v, new THREE.Vector3(), 0.7); home.y += 0.55;
    const s = buildStalker(home, -Math.PI / 2, 'cliff' + z, M.furRock);
    s.cliff = { z, v, ahead }; s.moved = 0; s.flat = 0; s.reach = 10.5;            // a ledge ten metres up the cliff is a long leap out from it
    CLIFF.push(s);
  }
}
function updateCliffStalkers(dt) {
  if (!CLIFF.length) return;
  const p = here(), cam = G.camera, foot = !S.inTractor;
  cam.getWorldDirection(_w);
  const beside = G.area === 'out' && p.z > CANYON.z0 + 10 && p.z < CANYON.z1 - 10 && p.x > -60 && p.x < 46;
  for (const s of CLIFF) {
    _v.copy(s.g.position).sub(cam.position); const dist = _v.length(); _v.normalize();
    const watched = _w.dot(_v) > Math.cos(dist < 30 ? 0.3 : 0.18) && dist < 170;
    // looked at, it presses flat to the rock and goes still
    s.flat = lerp(s.flat, watched && s.state !== 'drop' ? 1 : 0, clamp(dt * 7, 0, 1)); s.g.scale.y = 1 - 0.32 * s.flat;
    if (s.state !== 'perched' || !beside) continue;
    if (watched) {
      if (s.moved > 5 && dist < 130) { meet('stalker'); once('cliff-stalker', 'Something on the cliff. A shape on a ledge the colour of the rock… I look, and it’s only rock. I look back, and it’s further along. Drop-Stalker. Pacing me.', ['C', GUIDE + '; the pacing is ' + NEW]); }
      s.moved = 0; continue;
    }
    // under the cliff on foot, it comes along to be over him; otherwise it keeps pace up there, ahead or behind
    _p.set(p.x, 0, p.z); const foot2cliff = escarpmentPoint(p.z, 0, _s).x - p.x;
    const tz = clamp(p.z + (foot && foot2cliff < 16 ? 0 : s.cliff.ahead), CANYON.z0 + 15, CANYON.z1 - 15), dz = tz - s.cliff.z;
    if (Math.abs(dz) > 0.3) {
      const step = clamp(dz, -dt * 6.5, dt * 6.5); s.cliff.z += step; s.moved += Math.abs(step);
      escarpmentPoint(s.cliff.z, s.cliff.v, s.home, 0.7); s.home.y += 0.55;
      s.g.rotation.y = step > 0 ? 0 : Math.PI;
    } else s.g.rotation.y = -Math.PI / 2;                                         // waiting, facing out over the road
  }
}

// ---------- the burst mains: a fan of spray, still under a little pressure ----------
const SPRAYS = [];
function buildSprays() {
  for (const s of W.sprays) {
    const N = 90, pos = new Float32Array(N * 3).fill(-999), vel = new Float32Array(N * 3), life = new Float32Array(N), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: 0xcfe2ea, size: 0.13, transparent: true, opacity: 0.7, depthWrite: false }));
    pts.frustumCulled = false; G.scene.add(pts);
    SPRAYS.push({ s, pts, geo, pos, vel, life, i: 0, acc: 0, ground: h(s.x, s.z) + 0.05 });
  }
}
function updateSprays(dt) {
  const p = here();
  for (const sp of SPRAYS) {
    const near = G.area === 'out' && Math.hypot(sp.s.x - p.x, sp.s.z - p.z) < 160; sp.pts.visible = near;
    if (!near) continue;
    const boost = S.flags.valve ? 1.5 : 1, N = sp.life.length;
    sp.acc += dt * 70 * boost;
    while (sp.acc >= 1) {
      sp.acc -= 1; const k = sp.i = (sp.i + 1) % N;
      sp.pos.set([sp.s.x, sp.s.y, sp.s.z], k * 3);
      sp.vel.set([sp.s.dx * (1.8 + Math.random() * 1.6) * boost + (Math.random() - 0.5) * 0.8, (2.4 + Math.random() * 1.6) * boost, sp.s.dz + (Math.random() - 0.5) * 1.4], k * 3);
      sp.life[k] = 2;
    }
    for (let k = 0; k < N; k++) {
      if (sp.life[k] <= 0) continue;
      sp.life[k] -= dt; sp.vel[k * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) sp.pos[k * 3 + a] += sp.vel[k * 3 + a] * dt;
      if (sp.pos[k * 3 + 1] < sp.ground) { sp.life[k] = 0; sp.pos[k * 3 + 1] = -999; }
    }
    sp.geo.attributes.position.needsUpdate = true;
  }
}
