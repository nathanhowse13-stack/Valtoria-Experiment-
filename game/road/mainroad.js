// ============================================================
// The old main road, and what the old world left along it: a power
// line falling down pole by pole (one wire still live, lying across the
// road), Tally Bore (a hamlet of houses coming apart round a dead
// pumping station on the pipeline), the pipeline's burst mains spraying
// (land.js lays the pipe), and things to see: crows in rows along the
// wires, and hounds out in the scrub that are only ever there at the
// corner of the eye.
//
// All of it is new on the road (Experimental). The Field Guide says the
// Waste's life is made of fears, not ordinary animals; the crows and the
// hounds are the game's own animals in that spirit, not the Guide's.
// ============================================================
import { THREE, TAU, clamp, lerp, smooth, rng, G, S, P, W, blockers, shades, addThing, bark, once, meet, hooks, MX, rodMX, planarUV, merge, mesh, M, glowTexture, placeRelic, NEW } from './core.js';
import { h, ROUTES, TALLY, RESERVED, nearestRoad } from './land.js';

const here = () => S.inTractor ? { x: G.tractor.x, z: G.tractor.z } : { x: P.x, z: P.z };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _one = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
const X = (why) => ['X', why ? why + ': ' + NEW : NEW];

export function reserveMainRoad() { RESERVED.push({ x: TALLY.x, z: TALLY.z + 8, r: 72 }); }
export function buildMainRoad() { buildPowerLine(); buildTallyBore(); buildCrows(); buildHounds(); buildSprays(); }
export function updateMainRoad(dt) { updateLiveWire(dt); updateCrows(dt); updateHounds(dt); updateSprays(dt); updateTown(dt); }

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
      p.ins = pole(parts, poleMatrix(p.x, p.y, p.z, p.yaw, p.state === 'lean' ? p.tilt : (R() - 0.5) * 0.08), POLE_H);
      blockers.push({ x: p.x, z: p.z, r: 0.35 });
    } else if (p.state === 'down') {
      // lying in the dirt; if it fell toward the road (+tilt), its top lies in the road
      p.ins = pole(parts, poleMatrix(p.x, p.y + 0.16, p.z, p.yaw, p.live ? 1.52 : p.tilt > 0 ? 1.5 : -1.5), POLE_H);
      for (let d = 0.6; d < POLE_H - 0.4; d += 1.1) { const sgn = (p.live || p.tilt > 0) ? -1 : 1; blockers.push({ x: p.x + Math.cos(p.yaw) * sgn * d, z: p.z - Math.sin(p.yaw) * sgn * d, r: 0.3 }); }
    } else {
      // snapped: a stump, and the top lying beside it, crossarm and all
      pole(parts, poleMatrix(p.x, p.y, p.z, p.yaw, (R() - 0.5) * 0.1), 3.1, false);
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

// ---------- Tally-Crows: in rows along the wires; every head turns as you pass; they lift, and settle again behind you ----------
const CROWS = [];
let crowBody = null, crowWing = null, crowCool = 0;
function wirePoint(sp, t, out) { out.copy(sp.a).lerp(sp.b, t); out.y -= sp.sag * Math.sin(Math.PI * t); return out; }
function buildCrows() {
  const R = rng(777);
  W.spans.forEach((sp, i) => {
    if (i % 3 !== 1 || sp.z < 120) return;
    const n = 3 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) {
      const home = wirePoint(sp, 0.12 + R() * 0.76, new THREE.Vector3()); home.y += 0.1;
      CROWS.push({ home, pos: home.clone(), yaw: R() * TAU, state: 'perch', t: 0, c: new THREE.Vector3(), r: 0, ph: R() * TAU, flap: 0, look: R() * TAU });
    }
  });
  if (!CROWS.length) return;
  const body = merge([
    [new THREE.SphereGeometry(1, 10, 8), MX(0, 0, 0, 0, 0, 0, 0.085, 0.08, 0.16)],
    [new THREE.SphereGeometry(0.058, 10, 8), MX(0, 0.07, 0.14)],
    [new THREE.ConeGeometry(0.02, 0.08, 6), MX(0, 0.06, 0.22, Math.PI / 2, 0, 0)],
    [new THREE.BoxGeometry(0.09, 0.015, 0.14), MX(0, 0.0, -0.2, 0.25, 0, 0)],
  ]);
  const wing = new THREE.BoxGeometry(0.24, 0.012, 0.12); wing.translate(0.12, 0, 0);
  crowBody = new THREE.InstancedMesh(body, M.crow, CROWS.length); crowWing = new THREE.InstancedMesh(wing, M.crow, CROWS.length * 2);
  crowBody.frustumCulled = crowWing.frustumCulled = false; crowBody.castShadow = true;
  G.scene.add(crowBody, crowWing);
  CROWS.forEach((c, i) => poseCrow(c, i));
}
const _sh = new THREE.Vector3(), _sc = new THREE.Vector3();
function poseCrow(c, i) {
  crowBody.setMatrixAt(i, _m.compose(c.pos, _q.setFromEuler(_e.set(c.state === 'perch' ? 0 : -0.1, c.yaw, 0, 'YXZ')), _one));
  const folded = c.state === 'perch';
  for (const side of [1, -1]) {
    _sh.set(side * 0.05, 0.03, 0.02).applyAxisAngle(_w.set(0, 1, 0), c.yaw).add(c.pos);
    _sc.set(side * (folded ? 0.5 : 1), 1, 1);
    crowWing.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), _m.compose(_sh, _q.setFromEuler(_e.set(0, c.yaw + (folded ? side * -0.3 : 0), folded ? 0 : -side * c.flap, 'YXZ')), _sc));
  }
}
function updateCrows(dt) {
  if (!CROWS.length || G.area !== 'out') return;
  const p = here(), reach = S.inTractor ? 16 : 9;
  crowCool = Math.max(0, crowCool - dt);
  let lifted = 0, moved = false;
  CROWS.forEach((c, i) => {
    const d = Math.hypot(c.home.x - p.x, c.home.z - p.z);
    if (c.state === 'perch') {
      if (d > 220) return;
      if (d < reach) { c.state = 'fly'; c.t = 0; c.c.set(c.home.x + (Math.random() - 0.5) * 12, c.home.y + 5 + Math.random() * 6, c.home.z + (Math.random() - 0.5) * 12); c.r = 5 + Math.random() * 7; c.ph = Math.atan2(c.pos.z - c.c.z, c.pos.x - c.c.x); lifted++; }
      else { const want = Math.atan2(p.x - c.pos.x, p.z - c.pos.z); c.yaw += Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw)) * clamp(dt * 3, 0, 1); }   // every head turns to watch
    } else if (c.state === 'fly') {
      c.t += dt; c.ph += dt * (0.8 + 4 / c.r);
      _v.set(c.c.x + Math.cos(c.ph) * c.r, c.c.y + Math.sin(c.t * 1.3) * 0.8, c.c.z + Math.sin(c.ph) * c.r);
      c.pos.lerp(_v, clamp(dt * 2, 0, 1)); c.yaw = Math.atan2(-Math.sin(c.ph), Math.cos(c.ph));
      c.flap = Math.sin(G.time * 24 + i) * 0.9;
      if (c.t > 7 && d > reach + 12) c.state = 'land';
    } else {
      c.pos.lerp(c.home, clamp(dt * 1.6, 0, 1)); c.flap = Math.sin(G.time * 18 + i) * 0.5;
      c.yaw = Math.atan2(c.home.x - c.pos.x, c.home.z - c.pos.z) || c.yaw;
      if (c.pos.distanceTo(c.home) < 0.06) { c.pos.copy(c.home); c.state = 'perch'; }
    }
    poseCrow(c, i); moved = true;
  });
  if (moved) { crowBody.instanceMatrix.needsUpdate = true; crowWing.instanceMatrix.needsUpdate = true; }
  if (lifted >= 2 && crowCool <= 0) {
    crowCool = 6; hooks.sfx.caw(); meet('crows');
    once('crows', 'Tally-Crows. Rows of them on the wires, and every head turned to watch me come. Like they’re counting. They are counting.', X('the crows'));
    if (!S.inTractor) S.stress = Math.min(100, S.stress + 3);
  }
}

// ---------- Hollow-Hounds: keeping pace out in the scrub, and only ever there at the corner of the eye ----------
const HOUNDS = [];
function buildHounds() {
  const R = rng(321);
  for (let k = 0; k < 3; k++) {
    const mat = M.hound.clone(), g = new THREE.Group(); g.visible = false; G.scene.add(g);
    const add = (geo, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0) => { const m = mesh(geo, mat, { cast: false }); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; g.add(m); return m; };
    const S1 = new THREE.SphereGeometry(1, 10, 8);
    add(S1, 0, 0.74, -0.05, 0.17, 0.2, 0.55);                                   // a lean, ribby body
    add(S1, 0, 0.8, 0.32, 0.2, 0.25, 0.26);
    add(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 7), 0, 0.98, 0.5, 1, 1, 1, -0.7);
    add(S1, 0, 1.12, 0.66, 0.1, 0.11, 0.17);
    add(new THREE.ConeGeometry(0.06, 0.24, 7), 0, 1.08, 0.86, 1, 1, 1, Math.PI / 2);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.04, 0.14, 5), s * 0.06, 1.24, 0.6);
    add(new THREE.CylinderGeometry(0.02, 0.035, 0.55, 5), 0, 0.72, -0.62, 1, 1, 1, 0.9);
    const legs = [];
    for (const [sx, sz] of [[-1, 0.32], [1, 0.32], [-1, -0.4], [1, -0.4]]) { const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0.72, sz); g.add(hip); const l = mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.72, 5), mat, { cast: false }); l.position.y = -0.36; hip.add(l); legs.push(hip); }
    HOUNDS.push({ g, mat, legs, x: 0, z: 0, yaw: 0, side: k === 1 ? -1 : 1, ahead: 42 + k * 9, lat: 30 + R() * 10, op: 0, t: R() * 5, active: false });
    W.hounds = HOUNDS;
  }
}
function updateHounds(dt) {
  const p = here(), n = nearestRoad(p.x, p.z, 1);
  const zone = G.area === 'out' && n.s && n.d < 40 && ((n.s.route === 'main' && p.z > 260) || (n.s.route === 'north' && p.z < 1240));
  const cam = G.camera; cam.getWorldDirection(_v); _v.y = 0; _v.normalize();
  const fx = n.s ? n.s.dx : 0, fz = n.s ? n.s.dz : 1, px = fz, pz = -fx;
  for (const hd of HOUNDS) {
    if (!hd.active) {
      if (!zone) continue;
      hd.active = true; hd.x = p.x + fx * (hd.ahead - 30) + px * hd.side * (hd.lat + 30); hd.z = p.z + fz * (hd.ahead - 30) + pz * hd.side * (hd.lat + 30);
    }
    const tx = p.x + fx * hd.ahead + px * hd.side * hd.lat + Math.sin(G.time * 0.3 + hd.lat) * 5, tz = p.z + fz * hd.ahead + pz * hd.side * hd.lat;
    const dx = tx - hd.x, dz = tz - hd.z, dist = Math.hypot(dx, dz), sp = Math.min(11, dist * 1.3);
    if (dist > 0.3) { hd.x += dx / dist * sp * dt; hd.z += dz / dist * sp * dt; const want = Math.atan2(dx, dz); hd.yaw += Math.atan2(Math.sin(want - hd.yaw), Math.cos(want - hd.yaw)) * clamp(dt * 4, 0, 1); }
    hd.t += dt * (2 + sp * 1.1);
    hd.legs.forEach((l, k) => { l.rotation.x = Math.sin(hd.t + (k % 2 ? Math.PI : 0) + (k > 1 ? 0.6 : 0)) * 0.55 * Math.min(1, sp / 4); });
    hd.g.position.set(hd.x, h(hd.x, hd.z), hd.z); hd.g.rotation.y = hd.yaw;
    // look straight at one and it isn't there
    const ox = hd.x - cam.position.x, oz = hd.z - cam.position.z, od = Math.hypot(ox, oz) || 1, seen = (ox * _v.x + oz * _v.z) / od > Math.cos(0.42);
    const want = !zone || seen || od > 150 ? 0 : 0.92;
    hd.op = lerp(hd.op, want, clamp(dt * (want < hd.op ? 9 : 1.6), 0, 1));
    hd.mat.opacity = hd.op; hd.g.visible = hd.op > 0.02;
    if (!zone && hd.op < 0.02) hd.active = false;
    if (hd.op > 0.5 && od < 100) {
      S.stress = Math.min(100, S.stress + dt * 0.2);
      meet('hounds'); once('hounds', 'Dogs. Lean, ribby things, keeping pace out in the scrub. I look, and there’s nothing there. I look away, and there they are again.', X('the hounds'));
    }
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
