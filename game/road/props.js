// ============================================================
// Things to kick, throw, open and work.
//
// Stones: click (or Q, or RT) and Jacob throws one where he's looking.
// What it hits answers back: tin clangs, timber knocks, glass clinks,
// the spinifex thrashes at it, a Scream-Pea pod splits and screams, the
// live wire spits, and a thorny-devil sends it straight back where it
// came from (the Farm of Rust sketch's rule; stand somewhere else).
//
// Litter: tins and bottles along the shoulders, round the ruins and the
// wrecks, that skitter when he walks into them and fly when the
// tractor does. A row of tins on a plank in Tally Bore, for target
// practice.
//
// Tally Bore, worked: a front door that opens, the pump-house door
// banging in the wind until somebody latches it, a mailbox with a final
// notice in it, a car's bonnet, the windmill's brake, a hand pump that
// gives up one cupful into the trough, a light switch, a dead wireless,
// fuel drums, washing on the line. On the roads: a ute on its roof, a
// truck stripped to its chassis, a burnt-out car, a cow's bones, and an
// emergency phone with wind in the line.
//
// All of it is new on the road (Experimental).
// ============================================================
import { THREE, TAU, clamp, lerp, rng, G, S, P, W, blockers, addThing, once, meet, hooks, MX, planarUV, merge, mesh, M, SWAY, NEW, FARM } from './core.js';
import { h, nearestRoad, saltAt, TALLY, RESERVED, TOWERS, nearbySpinifex, HALF_W } from './land.js';
import { SITES } from './life.js';
import { WINDMILL, LIVE } from './mainroad.js';
import { dustKick, splash, sparkBurst, WIND } from './air.js';
import { sfx, spot } from './sound.js';
import { groundY } from './detail.js';

const X = (why) => ['X', why ? why + ': ' + NEW : NEW];
const bark = (text, prov) => hooks.bark(text, prov);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0), _az = new THREE.Vector3(0, 0, 1);
const R0 = rng(5150);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- where things go ----------
// a point beside whichever road is nearest (x0, z): side +1 is west (+x), −1 east; off is metres from the centre line
function beside(x0, z, side, off) {
  const s = nearestRoad(x0, z, 2).s;
  if (!s) return { x: x0 + side * off, z, yaw: 0 };
  return { x: s.x + s.dz * side * off, z: s.z - s.dx * side * off, yaw: Math.atan2(s.dx, s.dz) };
}
const SPOTS = {};
// which way to turn something so its front (local +z) faces the nearest road
const faceRoad = (x, z) => { const s = nearestRoad(x, z, 2).s; return s ? Math.atan2(s.x - x, s.z - z) : 0; };
export function reserveProps() {
  SPOTS.ute = beside(0, 704, -1, 10.5);          // on its roof in the ditch, east of the main road
  SPOTS.truck = beside(0, 1186, 1, 9.5);         // stripped to the chassis, on the north road's west shoulder
  SPOTS.burnt = beside(0, 1492, -1, 11);         // burnt out, east of the north road
  SPOTS.bones = beside(0, 306, -1, 9.5);         // a cow, east of the main road
  SPOTS.phone = beside(0, 1092, 1, 6.6);         // an emergency phone on a post
  for (const k of ['ute', 'truck', 'burnt', 'bones']) RESERVED.push({ x: SPOTS[k].x, z: SPOTS[k].z, r: 7 });
  RESERVED.push({ x: SPOTS.phone.x, z: SPOTS.phone.z, r: 3 });
}

// what a small thing comes to rest on: a shelf, a house floor, the road's surface, or the drawn ground
const SHELVES = [];
function surfaceY(x, z) {
  for (const s of SHELVES) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return s.y;
  if (W.floors) for (const f of W.floors) {
    if (f.hw === undefined) continue;
    const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz > f.r * f.r) continue;
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = c * dx - s * dz, lz = s * dx + c * dz;
    if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) return f.y;
  }
  const n = nearestRoad(x, z, 1);
  if (n.s && n.d < (n.s.route === 'canyon' ? 2.3 : 3.8) - 0.2) return h(x, z) + 0.035;
  return groundY(x, z);
}
const surfaceKind = (x, z) => {
  if (saltAt(x, z) > 0.4) return 'salt';
  const n = nearestRoad(x, z, 1);
  return n.s && n.s.route !== 'canyon' && n.d < 3.7 ? 'seal' : 'dirt';
};
function segDist(px, py, pz, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = dx * dx + dy * dy + dz * dz;
  const t = L > 1e-9 ? clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L, 0, 1) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py, az + dz * t - pz);
}
const near2 = (a, x, z, r) => (a.x - x) ** 2 + (a.z - z) ** 2 < r * r;

// ---------- litter: tins, bottles, a bucket ----------
const KDEF = {
  can: { r: 0.036, hh: 0.06, roll: 2.2, snd: 'tink' },
  bottle: { r: 0.034, hh: 0.12, roll: 3.2, snd: 'clink' },
  bucket: { r: 0.15, hh: 0.14, roll: 4, snd: 'clang' },
};
const KICK = { list: [], im: {}, n: { can: 0, bottle: 0 }, kicked: 0, dirty: { can: false, bottle: false } };
function buildLitterMeshes() {
  const can = new THREE.CylinderGeometry(0.036, 0.036, 0.12, 10);
  const bottle = new THREE.LatheGeometry([[0, -0.12], [0.033, -0.12], [0.035, -0.112], [0.035, 0.02], [0.022, 0.06], [0.013, 0.08], [0.012, 0.12], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
  KICK.im.can = new THREE.InstancedMesh(can, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.6 }), 90);
  KICK.im.bottle = new THREE.InstancedMesh(bottle, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.78 }), 40);
  for (const k in KICK.im) { const im = KICK.im[k]; im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); G.scene.add(im); }
}
const CAN_COL = [[0.55, 0.24, 0.12], [0.62, 0.32, 0.18], [0.45, 0.16, 0.1], [0.5, 0.12, 0.1], [0.3, 0.38, 0.26], [0.62, 0.6, 0.55]];   // rust, rust, rust, faded red, faded green, bare tin
const BOTTLE_COL = [[0.22, 0.42, 0.2], [0.42, 0.24, 0.1], [0.75, 0.78, 0.72]];
function addLitter(kind, x, z, { upright = R0() < 0.35, y = null } = {}) {
  const def = KDEF[kind], k = { kind, def, x, z, y: 0, vx: 0, vy: 0, vz: 0, yaw: R0() * TAU, roll: R0() * TAU, lying: !upright, air: false, awake: false, q: new THREE.Quaternion(), spin: new THREE.Vector3(), mesh: null, i: -1 };
  const sy = y ?? surfaceY(x, z);
  k.y = sy + (k.lying ? def.r : def.hh);
  if (kind === 'bucket') {
    const g = merge([[new THREE.CylinderGeometry(0.15, 0.12, 0.28, 14, 1, true), new THREE.Matrix4()], [new THREE.CircleGeometry(0.12, 14).rotateX(Math.PI / 2), MX(0, -0.139, 0)]]);
    k.mesh = mesh(g, M.tank); G.scene.add(k.mesh);
  } else {
    if (KICK.n[kind] >= KICK.im[kind].instanceMatrix.count) return null;
    k.i = KICK.n[kind]++; KICK.im[kind].count = KICK.n[kind];
    const c = kind === 'can' ? pick(CAN_COL) : pick(BOTTLE_COL), v = 0.85 + R0() * 0.3;
    KICK.im[kind].setColorAt(k.i, new THREE.Color(c[0] * v, c[1] * v, c[2] * v));
  }
  poseLitter(k); KICK.list.push(k);
  return k;
}
function poseLitter(k) {
  if (k.lying && !k.air) {
    // on its side, its axis across the way it's rolling
    _q.setFromAxisAngle(_up, k.yaw); _q2.setFromAxisAngle(_az, Math.PI / 2); _q.multiply(_q2); _q2.setFromAxisAngle(_up, k.roll); _q.multiply(_q2); k.q.copy(_q);
  } else if (!k.air) k.q.setFromAxisAngle(_up, k.yaw);
  if (k.mesh) { k.mesh.position.set(k.x, k.y, k.z); k.mesh.quaternion.copy(k.q); }
  else { KICK.im[k.kind].setMatrixAt(k.i, _m4.compose(_w.set(k.x, k.y, k.z), k.q, _one)); KICK.dirty[k.kind] = true; }
}
function kick(k, vx, vz, up, loud = 1) {
  const sp = Math.hypot(vx, vz);
  k.vx = vx + (Math.random() - 0.5) * 0.5; k.vz = vz + (Math.random() - 0.5) * 0.5; k.vy = up;
  k.air = true; k.awake = true; k.lying = true;
  k.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + sp * 5);
  const s = spot(k.x, k.z, 10); s.gain *= loud;
  if (k.def.snd === 'tink') sfx.tink(s); else if (k.def.snd === 'clink') sfx.clink(s); else sfx.clang(0.5, s);
  dustKick(k.x, k.z, 2, { size: 0.2, spread: 0.6, up: 0.4, alpha: 0.18 });
  KICK.kicked++;
}
function updateLitter(dt) {
  const tr = G.tractor, foot = !S.inTractor && G.area === 'out';
  for (const k of KICK.list) {
    // boots, and the tractor's wheels
    if (foot && near2(k, P.x, P.z, 0.34 + k.def.r) && k.y < surfaceY(P.x, P.z) + 0.45) {      // at boot height, not up on a plank
      const sp = Math.hypot(P.vx, P.vz);
      if (sp > 0.35 && !k.air) { kick(k, P.vx * (1.3 + P.run * 0.6), P.vz * (1.3 + P.run * 0.6), 0.6 + sp * 0.5); if (KICK.kicked === 1) once('kick', 'Tins and bottles all down the shoulder. People used to throw things out of their windows, I suppose, at the speed of polite agreement.', X()); }
      else if (!k.air) { const dx = k.x - P.x, dz = k.z - P.z, d = Math.hypot(dx, dz) || 1; k.vx = dx / d * 0.6; k.vz = dz / d * 0.6; k.awake = true; k.lying = true; }
    }
    if (tr && Math.abs(tr.speed) > 0.4 && near2(k, tr.x, tr.z, 1.75) && G.area === 'out') {
      const dx = k.x - tr.x, dz = k.z - tr.z, d = Math.hypot(dx, dz) || 1, sp = Math.abs(tr.speed);
      if (!k.air) kick(k, Math.sin(tr.yaw) * tr.speed * 1.1 + dx / d * (1 + sp * 0.3), Math.cos(tr.yaw) * tr.speed * 1.1 + dz / d * (1 + sp * 0.3), 1 + sp * 0.4, 0.7);
    }
    if (!k.awake) continue;
    const sy = surfaceY(k.x, k.z), rest = sy + (k.lying ? k.def.r : k.def.hh);
    let nx = k.x + k.vx * dt, nz = k.z + k.vz * dt;
    // walls: bounce off them, whichever way they face
    if (hooks.blocked && hooks.blocked(nx, nz, k.def.r)) {
      if (!hooks.blocked(nx, k.z, k.def.r)) k.vz = -k.vz * 0.4; else if (!hooks.blocked(k.x, nz, k.def.r)) k.vx = -k.vx * 0.4; else { k.vx *= -0.4; k.vz *= -0.4; }
      nx = k.x; nz = k.z;
      if (Math.hypot(k.vx, k.vz) > 0.5) { const s = spot(k.x, k.z, 8); s.gain *= 0.5; k.def.snd === 'clink' ? sfx.clink(s) : sfx.tink(s); }
    }
    k.x = clamp(nx, -HALF_W + 2, HALF_W - 2); k.z = nz;
    if (k.air) {
      k.vy -= 9.8 * dt; k.y += k.vy * dt;
      _q.setFromAxisAngle(_v.copy(k.spin).normalize(), k.spin.length() * dt); k.q.premultiply(_q);
      if (k.y <= rest) {
        k.y = rest;
        if (k.vy < -1.6) { k.vy = -k.vy * 0.32; k.vx *= 0.7; k.vz *= 0.7; k.spin.multiplyScalar(0.6); const s = spot(k.x, k.z, 9); s.gain *= clamp(-k.vy / 3, 0.15, 0.6); k.def.snd === 'clink' ? sfx.clink(s) : k.def.snd === 'clang' ? sfx.clang(0.3, s) : sfx.tink(s); }
        else { k.air = false; k.lying = true; k.yaw = Math.atan2(k.vx, k.vz); k.y = sy + k.def.r; }
      }
      if (k.mesh) { k.mesh.position.set(k.x, k.y, k.z); k.mesh.quaternion.copy(k.q); }
      else { KICK.im[k.kind].setMatrixAt(k.i, _m4.compose(_w.set(k.x, k.y, k.z), k.q, _one)); KICK.dirty[k.kind] = true; }
      continue;
    }
    // rolling: it slows, and goes to sleep where it stops
    const sp = Math.hypot(k.vx, k.vz), f = Math.exp(-dt * k.def.roll);
    k.vx *= f; k.vz *= f; k.roll += sp * dt / k.def.r; k.y = rest;
    if (sp > 0.05) k.yaw = Math.atan2(k.vx, k.vz);
    if (sp < 0.04) { k.awake = false; k.vx = k.vz = 0; }
    poseLitter(k);
  }
  for (const kind in KICK.dirty) if (KICK.dirty[kind]) { KICK.im[kind].instanceMatrix.needsUpdate = true; KICK.dirty[kind] = false; }
}
// where the litter lies: the shoulders of the old roads, round the ruins, the shacks and the wrecks
function scatterLitter() {
  for (let z = -30; z < 1820; z += 22 + R0() * 40) {
    const side = R0() < 0.5 ? -1 : 1, p = beside(R0() < 0.5 ? 0 : 60, z, side, 4.6 + R0() * 3.2);
    if (Math.hypot(p.x - TALLY.x, p.z - TALLY.z) < 75) continue;
    addLitter(R0() < 0.7 ? 'can' : 'bottle', p.x, p.z);
    if (R0() < 0.35) addLitter('can', p.x + (R0() - 0.5) * 1.5, p.z + (R0() - 0.5) * 1.5);
  }
  for (const hs of W.houses || []) for (let k = 0; k < 4; k++) { const p = hs.world((R0() - 0.5) * hs.Wd * 1.2, hs.D / 2 + 0.6 + R0() * 3); addLitter(R0() < 0.65 ? 'can' : 'bottle', p.x, p.z); }
  for (const s of SITES.shacks) for (let k = 0; k < 4; k++) { const a = R0() * TAU, r = 4 + R0() * 3; addLitter(R0() < 0.6 ? 'can' : 'bottle', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r); }
  for (const k of ['ute', 'truck', 'burnt']) for (let n = 0; n < 4; n++) { const s = SPOTS[k], a = R0() * TAU, r = 3 + R0() * 2.5; addLitter(R0() < 0.7 ? 'can' : 'bottle', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r); }
  if (SITES.wreck) for (let n = 0; n < 5; n++) { const a = R0() * TAU, r = 6 + R0() * 4; addLitter('can', SITES.wreck.x + Math.cos(a) * r, SITES.wreck.z + Math.sin(a) * r); }
}

// ---------- thrown stones ----------
const STONE = { geo: null, mat: null, flying: [], resting: [], cool: 0, thrown: 0, hits: {} };
// whether a throw would go now (main.js plays the throw on the hand first, and lets go at the top of the swing)
export const canThrow = () => S.started && !S.inTractor && !S.paused && !S.dead && G.area === 'out' && STONE.cool <= 0 && STONE.flying.length < 4;
export function primaryAction(camera) {
  if (!S.started || S.inTractor || S.paused || S.dead) return;
  if (G.area !== 'out') { once('stone-cave', 'Not in here. You don’t throw things in the dark when you don’t know what’s listening.', X()); return; }
  if (STONE.cool > 0 || STONE.flying.length >= 4) return;
  STONE.cool = 0.65;
  camera.getWorldDirection(_v);
  const rx = -_v.z, rz = _v.x, rl = Math.hypot(rx, rz) || 1;
  const p = camera.position.clone().addScaledVector(_v, 0.35); p.x += rx / rl * 0.18; p.z += rz / rl * 0.18; p.y -= 0.12;
  const vel = _v.clone().multiplyScalar(15.5); vel.y += 1.4; vel.x += P.vx * 0.6; vel.z += P.vz * 0.6;
  const m = mesh(STONE.geo, STONE.mat); m.position.copy(p); m.scale.set(1, 0.75, 1.15); G.scene.add(m);
  STONE.flying.push({ m, p, v: vel, from: new THREE.Vector3(P.x, 0, P.z), spin: new THREE.Vector3(Math.random() * 24 - 12, Math.random() * 24 - 12, Math.random() * 24 - 12), bounces: 0, back: null, t: 0, hit: new Set() });
  sfx.whoosh(); hooks.rumble(0.12, 0, 60);
  if (++STONE.thrown === 1) setTimeout(() => once('stone', 'Plenty of stones out here. Might as well find out what lives under things from a safe distance.', X('throwing stones')), 900);
}
// the stone has stopped: leave it lying, a dozen at most
function settle(s, y) {
  s.m.position.set(s.p.x, y + 0.025, s.p.z);
  STONE.resting.push(s.m);
  while (STONE.resting.length > 14) { const m = STONE.resting.shift(); G.scene.remove(m); }
}
const firstHit = (k, text, prov) => { if (STONE.hits[k]) return; STONE.hits[k] = true; setTimeout(() => bark(text, prov), 350); };
function updateStones(dt) {
  STONE.cool = Math.max(0, STONE.cool - dt);
  for (let i = STONE.flying.length - 1; i >= 0; i--) {
    const s = STONE.flying[i]; s.t += dt;
    const ox = s.p.x, oy = s.p.y, oz = s.p.z;
    if (s.back) {
      // a thorny-devil's answer: straight back to where it was thrown from, at chest height
      _v.set(s.back.x - s.p.x, s.back.y - s.p.y, s.back.z - s.p.z); const d = _v.length();
      if (d < 0.6) {
        STONE.flying.splice(i, 1);
        const there = !S.inTractor && Math.hypot(P.x - s.back.x, P.z - s.back.z) < 1.1;
        if (there) { sfx.thud(); hooks.hurt(7, 'devil'); bark(pick(['It came straight back. Right where I threw it from. Right where I was still standing, like a fool.', 'Back it came, exactly as advertised. Ow.']), ['P', FARM]); }
        else { sfx.thud(spot(s.back.x, s.back.z, 8)); bark('It came back to where I was standing. I wasn’t, any more. Learning.', ['P', FARM]); }
        settle(s, surfaceY(s.p.x, s.p.z)); continue;
      }
      s.p.addScaledVector(_v.multiplyScalar(1 / d), Math.min(d, 15 * dt));
    } else { s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); }
    s.m.position.copy(s.p); s.m.rotation.x += s.spin.x * dt; s.m.rotation.y += s.spin.y * dt; s.m.rotation.z += s.spin.z * dt;
    if (!s.back && strike(s, ox, oy, oz)) continue;
    const gy = surfaceY(s.p.x, s.p.z);
    if (s.p.y < gy + 0.03) { if (land(s, gy)) { STONE.flying.splice(i, 1); } continue; }
    if (s.t > 7 || Math.abs(s.p.x) > HALF_W) { STONE.flying.splice(i, 1); G.scene.remove(s.m); }
  }
}
// what the stone met on its way, this step; true if it's finished with
function strike(s, ox, oy, oz) {
  const x = s.p.x, y = s.p.y, z = s.p.z, seg = (px, py, pz) => segDist(px, py, pz, ox, oy, oz, x, y, z);
  // a thorny-devil: anything thrown at one goes straight back where it came from
  for (const d of W.devils || []) {
    if (!near2(d, x, z, 3)) continue;
    const dy = h(d.x, d.z) + 0.1;
    if (seg(d.x, dy, d.z) < 0.32) {
      d.puff = 2.2; meet('devil'); sfx.tink(spot(d.x, d.z, 8));
      s.back = new THREE.Vector3(s.from.x, h(s.from.x, s.from.z) + 1.25, s.from.z); s.v.set(0, 0, 0);
      return false;
    }
  }
  // Scream-Pea pods: hit one and it splits and screams, sun or no sun
  if (W.peas && W.peas.list) for (const f of W.peas.list) {
    if (Math.abs(f.p.z - z) > 3 || Math.abs(f.p.x - x) > 3) continue;
    if (seg(f.p.x, f.p.y, f.p.z) < 0.55) {
      const sp = spot(f.p.x, f.p.z, 16); sfx.scream(clamp(sp.gain * 1.4, 0.2, 1)); f.lid = 1; S.stress = Math.min(100, S.stress + 3); meet('peas');
      firstHit('peas', 'The pod I hit split and screamed, and every flower on the pole turned to look at me instead of the stone.', ['X', 'waking a pod: ' + NEW]);
      s.v.multiplyScalar(-0.25); return false;
    }
  }
  // the animals: a boar's hide, a jaw-jaw's copper shell, a Drop-Stalker up on its ledge
  for (const b of W.boars || []) {
    if (b.dead || !near2(b, x, z, 2)) continue;
    if (seg(b.x, h(b.x, b.z) + 0.6, b.z) < 0.7) {
      sfx.thud(spot(b.x, b.z, 14)); noise(b.x, b.z, 4); meet('boar');
      firstHit('boar', 'A stone off its ridge and it bolted, squealing. Bristles like blades, and it runs from a pebble. Out here everything is afraid of something.', ['X', 'a stone at a Razor-Back Boar: ' + NEW]);
      bounceBack(s, ox, oz); return false;
    }
  }
  for (const j of W.jaws || []) {
    if (!near2(j, x, z, 1)) continue;
    if (seg(j.x, h(j.x, j.z) + 0.08, j.z) < 0.3) {
      sfx.tink(spot(j.x, j.z, 10)); noise(j.x, j.z, 7); meet('jaws');
      firstHit('jaws', 'It rang like a kettle. The lot of them went to ground like spilled bolts.', ['P', FARM]);
      bounceBack(s, ox, oz); return false;
    }
  }
  for (const st of W.stalkers || []) {
    const p = st.g.position; if (Math.abs(p.x - x) > 2 || Math.abs(p.z - z) > 2) continue;
    if (st.state === 'perched' && seg(p.x, p.y + 0.2, p.z) < 0.9) {
      noise(p.x, p.z, 3, st); sfx.thud(spot(p.x, p.z, 16)); meet('stalker');
      firstHit('stalker', 'That found it. Ears flat, pressed to the rock, looking at me now and knowing I’m looking back. It won’t drop on something that’s seen it.', ['X', 'a stone at a Drop-Stalker: ' + NEW]);
      bounceBack(s, ox, oz); return false;
    }
  }
  // litter
  for (const k of KICK.list) {
    if (!near2(k, x, z, 0.6)) continue;
    if (seg(k.x, k.y, k.z) < k.def.r + 0.07) {
      kick(k, s.v.x * 0.35, s.v.z * 0.35, 1.6 + Math.random(), 1.2); s.v.multiplyScalar(0.35); s.v.y = Math.abs(s.v.y) * 0.3;
      if (k.shelf) firstHit('tins', 'Got one. Out here that’s what passes for entertainment.', X());
      return false;
    }
  }
  // a Gallows-Gum's trunk: it takes a stone like skin takes a slap, and the big limb shifts
  for (const g of W.gums) {
    if (!near2(g, x, z, 1.0)) continue;
    if (y < g.top.y + 1) {
      sfx.knock(spot(g.x, g.z, 12)); setTimeout(() => sfx.creak(spot(g.x, g.z, 18)), 500); meet('gum');
      firstHit('gum', 'The trunk took the stone like skin takes a slap. Up in the leaves, the big limb creaked, and settled again. It knows I’m here.', ['X', 'a stone at a Gallows-Gum: ' + NEW]);
      bounceBack(s, ox, oz); return false;
    }
  }
  // power poles (timber), their glass insulators, the old transmission towers (steel)
  for (const p of W.poles || []) {
    if (p.state === 'down' || !near2(p, x, z, 0.35)) continue;
    if (y < p.y + 8.2) { if (y > p.y + 7.4) { sfx.clink(spot(p.x, p.z, 14)); sparkBurst(x, y, z, 3, { colour: [0.7, 1, 0.8], speed: 1.5, life: 0.3 }); } else sfx.knock(spot(p.x, p.z, 12)); bounceBack(s, ox, oz); return false; }
  }
  for (const t of TOWERS) {
    if (!near2(t, x, z, 2.4) || y > h(t.x, t.z) + 22) continue;
    if (Math.random() < 0.5) { sfx.clang(0.7, spot(t.x, t.z, 20)); sparkBurst(x, y, z, 4, { colour: [1, 0.8, 0.5], speed: 2, life: 0.25 }); bounceBack(s, ox, oz); return false; }
  }
  // the live wire lying across the road
  if (LIVE && LIVE.x1 !== LIVE.x0 && y < h(x, z) + 0.6 && segDist(x, 0, z, LIVE.x0, 0, LIVE.z0, LIVE.x1, 0, LIVE.z1) < 0.4) {
    sparkBurst(x, y, z, 18, { speed: 3.5, life: 0.5 }); sfx.zap(0.8);
    firstHit('wire', 'The stone hit the wire and the wire spat at it. Still live. I knew that. Now I know it from here.', X('the power line'));
    s.v.set(s.v.x * 0.2, 2, s.v.z * 0.2); return false;
  }
  // walls, sheds, tanks and wrecks: tin clangs, timber knocks
  if (hooks.blocked && y < surfaceY(x, z) + 2.6 && hooks.blocked(x, z, 0.04)) {
    let tin = false; for (const t of W.tins || []) if (near2(t, x, z, 5)) tin = true;
    for (const w of WRECKS) if (near2(w, x, z, 3.5)) tin = true;
    const sp = spot(x, z, 14); tin ? sfx.clang(0.55, sp) : sfx.knock(sp);
    bounceBack(s, ox, oz); return false;
  }
  return false;
}
// something made a noise here: the animals within r metres hear it (life.js)
function noise(x, z, r, hit = null) { (W.noises = W.noises || []).push({ x, z, r, hit }); }
function bounceBack(s, ox, oz) { s.p.x = ox; s.p.z = oz; s.v.x *= -0.3; s.v.z *= -0.3; s.v.y *= 0.5; }
// landing: what it lands in decides the sound and what happens next; true once it has stopped
function land(s, gy) {
  const x = s.p.x, z = s.p.z, sp = spot(x, z, 12);
  // into the spinifex: it thrashes at the stone as it would at a foot
  if (nearbySpinifex(x, z).length) {
    W.thrash = { x, z, t: 2.4 }; sfx.cut(); meet('spinifex');
    firstHit('spin', 'The spinifex went for the stone like it was a leg. Every blade round it, thrashing. Good to know from here.', ['X', 'a stone into the Razor-Spinifex: ' + NEW]);
    settle(s, gy); return true;
  }
  // the trough at the windmill, if there's water in it
  if (TROUGH.level > 0.05 && Math.abs(x - TROUGH.x) < 0.95 && Math.abs(z - TROUGH.z) < 0.32) { splash(x, TROUGH.y + 0.1, z, 14, 0.8); sfx.splash(sp); G.scene.remove(s.m); return true; }
  noise(x, z, 7);
  const kind = surfaceKind(x, z), hard = Math.abs(s.v.y);
  if (s.bounces < 2 && hard > 2.2) {
    s.v.y = hard * (kind === 'seal' ? 0.38 : kind === 'salt' ? 0.3 : 0.22); s.v.x *= 0.55; s.v.z *= 0.55; s.bounces++; s.p.y = gy + 0.03;
    if (kind === 'seal') sfx.clack(sp); else { sp.gain *= 0.5; sfx.thud(sp); }
    dustKick(x, z, kind === 'seal' ? 2 : 5, { size: 0.3, spread: 1.2, up: 0.8, alpha: kind === 'salt' ? 0.16 : 0.24 });
    return false;
  }
  sp.gain *= 0.35; kind === 'seal' ? sfx.clack(sp) : sfx.thud(sp);
  settle(s, gy); return true;
}

// ---------- Tally Bore, worked ----------
const DOORS = [];
// a hinged panel: pivot at the hinge, the panel off to its +x; angle is its swing from shut
function hinged({ x, y, z, yaw, w, ht, mat, thick = 0.04, axis = 'y' }) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.rotation.order = 'YXZ'; pivot.rotation.y = yaw; G.scene.add(pivot);
  const panel = mesh(planarUV(new THREE.BoxGeometry(w, ht, thick), 0.9), mat);
  if (axis === 'y') panel.position.set(w / 2, ht / 2, 0); else panel.position.set(0, thick / 2, w / 2);
  pivot.add(panel);
  return { pivot, panel, yaw, angle: 0, target: 0, v: 0, axis };
}
function setSwing(d) { if (d.axis === 'y') d.pivot.rotation.y = d.yaw + d.angle; else d.pivot.rotation.x = d.angle; }
const TROUGH = { x: 0, y: 0, z: 0, level: 0, water: null, strokes: 0, gushes: 0 };
const PUMP = { handle: null, t: 0, flow: 0, spout: null };
let shedDoor = null, bonnet = null, flap = null, brake = null;
function buildTally() {
  const hs = W.houses || [], racked = hs.find(q => q.kind === 'racked'), ver = hs.find(q => q.kind === 'verandah');
  W.dynamic = W.dynamic || [];
  // the verandah house's front door: shut, not locked
  if (ver) {
    const a = ver.world(-0.6, ver.D / 2), b = ver.world(0.6, ver.D / 2);
    const d = hinged({ x: a.x, y: ver.y + 0.1, z: a.z, yaw: ver.yaw, w: 1.18, ht: 1.98, mat: M.boards });
    d.block = { x0: Math.min(a.x, b.x) - 0.06, z0: Math.min(a.z, b.z) - 0.06, x1: Math.max(a.x, b.x) + 0.06, z1: Math.max(a.z, b.z) + 0.06, off: false };
    W.dynamic.push(d.block); DOORS.push(d);
    const c = ver.world(0.1, ver.D / 2 + 0.25);
    addThing({ id: 'tally:frontdoor', name: 'The front door', verb: () => d.target > 0.5 ? 'Shut it' : 'Open it', x: c.x, y: ver.y + 1.1, z: c.z, r: 1.2, prov: X('Tally Bore'), use: () => {
      d.target = d.target > 0.5 ? 0 : 1.55; const sp = spot(c.x, c.z, 8);
      if (d.target) { sfx.hinge(sp); once('frontdoor', 'Not locked. Nobody locks a door they’re not coming back to.', X('Tally Bore')); } else setTimeout(() => sfx.knock(sp), 380);
    } });
  }
  // the pump house's iron door: banging in the wind until somebody latches it
  {
    const p = TALLY.pump, x = p.x + 1.6, z = p.z + 0.3;
    const d = shedDoor = hinged({ x, y: h(x, z), z, yaw: Math.PI / 2, w: 1.18, ht: 2.5, mat: M.corr });
    Object.assign(d, { mode: 'free', bangCool: 0, sx: x, sz: z - 0.6 });
    d.block = { x0: x - 0.06, z0: z - 1.2, x1: x + 0.06, z1: z, off: true };
    W.dynamic.push(d.block); DOORS.push(d);
    addThing({ id: 'tally:shedDoor', name: 'The pump-house door', verb: () => d.mode === 'free' ? 'Latch it shut' : d.mode === 'latched' ? 'Open it' : 'Let it swing', x: x + 0.5, y: h(x, z) + 1.2, z: z - 0.6, r: 1.4, prov: X('Tally Bore'), use: () => {
      const sp = spot(x, z, 10);
      if (d.mode === 'free') { d.mode = 'latched'; sfx.latch(sp); setTimeout(() => sfx.clang(0.4, sp), 120); once('latch', 'Latched. That banging must have been driving the whole town mad for years. What’s left of it.', X('Tally Bore')); }
      else if (d.mode === 'latched') { d.mode = 'wedged'; sfx.hinge(sp); bark('Open, and a rock against it to keep it that way.', X('Tally Bore')); }
      else { d.mode = 'free'; sfx.hinge(sp); }
    } });
    W.flags = W.flags || [];
  }
  // a mailbox on a post at the roadside, with a final notice nobody collected
  {
    const m = beside(0, 593, -1, 5.8), y = h(m.x, m.z), yaw = faceRoad(m.x, m.z);     // its door faces the road
    const g = new THREE.Group(); g.position.set(m.x, y, m.z); g.rotation.y = yaw; G.scene.add(g);
    g.add(mesh(new THREE.BoxGeometry(0.07, 1.05, 0.07).translate(0, 0.52, 0), M.timber));
    g.add(mesh(planarUV(new THREE.BoxGeometry(0.3, 0.24, 0.44), 0.5).translate(0, 1.17, -0.02), M.paint));
    const f = flap = hinged({ x: 0, y: 1.05, z: 0.2, yaw: 0, w: 0.24, ht: 0.3, mat: M.paint, thick: 0.02, axis: 'x' });
    G.scene.remove(f.pivot); g.add(f.pivot); f.panel.position.set(0, 0.11, 0.01); f.panel.scale.set(1, 1, 1); f.panel.geometry = new THREE.BoxGeometry(0.28, 0.22, 0.02);
    blockers.push({ x: m.x, z: m.z, r: 0.12 });
    let read = false;
    addThing({ id: 'tally:mailbox', name: 'A mailbox', verb: () => f.target > 0.5 ? 'Shut it' : read ? 'Open it' : 'Look inside', x: m.x, y: y + 1.15, z: m.z, r: 1.3, prov: X('Tally Bore'), use: () => {
      const sp = spot(m.x, m.z, 6);
      if (f.target > 0.5) { f.target = 0; sfx.latch(sp); return; }
      f.target = 1.45; sfx.hinge(sp);
      if (!read) { read = true; setTimeout(() => { sfx.paper(); bark('A letter, never collected. FINAL NOTICE: WATER RATES, TALLY BORE PUMPING STATION. ACCOUNTS IN ARREARS WILL BE VISITED IN PERSON. H. R. Cogswell and Associates. Visited in person. Out here. I’d like to see that.', ['X', 'the letter is new; the line is the Flats radio’s']); }, 500); }
      else bark('Just the letter. I’m not taking it. It isn’t mine to owe.', X('Tally Bore'));
    } });
  }
  // the car: its bonnet lifts, and there's nothing under it
  {
    const x = TALLY.x - 11, z = TALLY.z - 10, y = h(x, z);
    const frame = new THREE.Group(); frame.position.set(x, y + 0.6, z); frame.rotation.set(0.04, 0.12, 0.05); G.scene.add(frame);
    const bay = mesh(new THREE.BoxGeometry(1.4, 0.004, 1.2), M.black, { cast: false }); bay.position.set(0, 0.352, 1.4); frame.add(bay);
    const b = bonnet = hinged({ x: 0, y: 0.36, z: 0.72, yaw: 0, w: 1.36, ht: 1.62, mat: M.rust, thick: 0.04, axis: 'x' });
    G.scene.remove(b.pivot); frame.add(b.pivot); b.panel.geometry = planarUV(new THREE.BoxGeometry(1.62, 0.04, 1.36), 1); b.panel.position.set(0, 0.02, 0.68);
    let looked = false;
    addThing({ id: 'tally:bonnet', name: 'The car’s bonnet', verb: () => b.target < -0.5 ? 'Drop it' : 'Lift it', x: x + Math.sin(0.12) * 1.5, y: y + 1, z: z + Math.cos(0.12) * 1.5, r: 1.3, prov: X('Tally Bore'), use: () => {
      const sp = spot(x, z, 9);
      if (b.target < -0.5) { b.target = 0; setTimeout(() => sfx.clang(0.8, sp), 260); return; }
      b.target = -1.05; sfx.hinge(sp);
      if (!looked) { looked = true; setTimeout(() => bark('Nothing under it but a hole and the brackets that held what was in it. Not stolen: taken apart, bolt by bolt, and the bolts taken too. The jaw-jaws only got the wiring.', ['P', 'the jaw-jaws are the Farm of Rust sketch’s; the car is ' + NEW]), 600); }
    } });
  }
  // the windmill's brake, a hand pump on its bore, and a trough
  if (WINDMILL.mill) {
    const x = WINDMILL.x, z = WINDMILL.z, y = WINDMILL.y;
    const lever = new THREE.Group(); lever.position.set(x + 1.15, y + 0.9, z + 1.15); G.scene.add(lever);
    lever.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6).translate(0, 0.45, 0), M.iron));
    brake = { lever, t: 0 };
    addThing({ id: 'tally:brake', name: 'The windmill’s brake', verb: () => WINDMILL.mill.braked ? 'Let it go' : 'Pull the brake', x: x + 1.2, y: y + 1.2, z: z + 1.2, r: 1.4, prov: X('Tally Bore'), use: () => {
      const m = WINDMILL.mill; m.braked = !m.braked; const sp = spot(x, z, 10); sfx.latch(sp); sfx.squeak(sp);
      bark(m.braked ? 'Pulled the brake. The wheel groans down to nothing, and the whole tower goes quiet for the first time in years. Too quiet.' : 'Let it go. It takes the wind again, and starts complaining again.', X('Tally Bore'));
    } });
    // the pump: cast-iron body, a spout, a handle
    const px = x - 2.5, pz = z + 0.9, py = h(px, pz);
    const body = [[new THREE.CylinderGeometry(0.11, 0.13, 0.95, 10), MX(px, py + 0.47, pz)], [new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6), MX(px, py + 0.78, pz + 0.16, Math.PI / 2 - 0.3, 0, 0)], [new THREE.BoxGeometry(0.3, 0.12, 0.3), MX(px, py + 0.06, pz)]];
    G.scene.add(mesh(merge(body), M.rust));
    const handle = new THREE.Group(); handle.position.set(px, py + 0.98, pz - 0.05); G.scene.add(handle);
    handle.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 6).rotateX(Math.PI / 2).translate(0, 0, -0.38), M.iron));
    PUMP.handle = handle; PUMP.spout = new THREE.Vector3(px, py + 0.72, pz + 0.3);
    blockers.push({ x: px, z: pz, r: 0.2 });
    // the trough under the spout
    Object.assign(TROUGH, { x: px, z: pz + 0.75, y: h(px, pz + 0.75) });
    const tr = new THREE.CylinderGeometry(0.32, 0.32, 1.8, 14, 1, true, Math.PI / 2, Math.PI); tr.rotateZ(Math.PI / 2);
    const tm = mesh(tr, M.tank); tm.position.set(TROUGH.x, TROUGH.y + 0.36, TROUGH.z); G.scene.add(tm);
    for (const s of [-1, 1]) { const cap = mesh(new THREE.CircleGeometry(0.32, 14, Math.PI, Math.PI), M.tank); cap.rotation.y = Math.PI / 2; cap.position.set(TROUGH.x + s * 0.9, TROUGH.y + 0.36, TROUGH.z); G.scene.add(cap); }
    for (const s of [-0.7, 0.7]) G.scene.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.5).translate(TROUGH.x + s, TROUGH.y + 0.06, TROUGH.z), M.timber));
    const wat = TROUGH.water = mesh(new THREE.PlaneGeometry(1.76, 0.5).rotateX(-Math.PI / 2), M.water, { cast: false }); wat.visible = false; wat.position.set(TROUGH.x, TROUGH.y + 0.1, TROUGH.z); G.scene.add(wat);
    blockers.push({ x0: TROUGH.x - 0.92, z0: TROUGH.z - 0.33, x1: TROUGH.x + 0.92, z1: TROUGH.z + 0.33 });
    addThing({ id: 'tally:pump', name: 'A hand pump', verb: 'Work the handle', x: px, y: py + 0.9, z: pz, r: 1.3, prov: X('Tally Bore'), use: () => {
      PUMP.t = 0.7; TROUGH.strokes++; sfx.pump(spot(px, pz, 8));
      if (TROUGH.strokes === 1) bark('Stiff. Something down there groans when I lean on it.', X('Tally Bore'));
      if (TROUGH.strokes % 4 === 0 && TROUGH.gushes < 3) {
        TROUGH.gushes++; PUMP.flow = 2.4 - TROUGH.gushes * 0.5; setTimeout(() => sfx.gush(spot(px, pz, 8)), 300);
        if (TROUGH.gushes === 1) setTimeout(() => {
          if (S.sips < 4) { S.sips++; hooks.updateVitals(); sfx.fill(); bark('A cupful. Rust and minerals and the taste of the bore. It’s water. Into the bag with it.', X('Tally Bore')); }
          else bark('A cupful of rust and minerals, into the trough. Bag’s full anyway. Something will drink it.', X('Tally Bore'));
        }, 1500);
        if (TROUGH.gushes === 3) setTimeout(() => bark('That’s it. Dry. Whatever was left in the pipe is in the trough now.', X('Tally Bore')), 2600);
      } else if (TROUGH.gushes >= 3 && TROUGH.strokes % 4 === 2) bark('Nothing. Just the groan.', X('Tally Bore'));
    } });
  }
  // a row of tins on a plank across two drums: somebody's target practice
  {
    const bx = -11, bz = 634, y = h(bx, bz), top = y + 0.88 + 0.06;
    for (const s of [-0.85, 0.85]) { G.scene.add(mesh(planarUV(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), 0.9).translate(bx, y + 0.44, bz + s), M.paint)); blockers.push({ x: bx, z: bz + s, r: 0.3 }); }
    G.scene.add(mesh(planarUV(new THREE.BoxGeometry(0.3, 0.06, 2.3), 0.8).translate(bx, top - 0.03, bz), M.timber));
    SHELVES.push({ x0: bx - 0.15, x1: bx + 0.15, z0: bz - 1.15, z1: bz + 1.15, y: top });
    for (let k = 0; k < 6; k++) { const it = addLitter(k === 2 ? 'bottle' : 'can', bx + (R0() - 0.5) * 0.06, bz - 0.95 + k * 0.38, { upright: true, y: top }); if (it) it.shelf = true; }
    addThing({ id: 'tally:targets', name: 'Tins on a plank', verb: 'Look', x: bx + 0.6, y: top, z: bz, r: 1.6, prov: X('Tally Bore'), use: () => bark(input0() ? 'Somebody lined these up to throw stones at. Right trigger, then.' : 'Somebody lined these up to throw stones at. Click, then.', X('Tally Bore')) });
  }
  // fuel drums by the pump house, every one of them empty
  {
    const p = TALLY.pump, spots = [[p.x + 3.2, p.z + 2.6, 0], [p.x + 3.8, p.z + 3.3, 0], [p.x + 4.4, p.z + 1.6, 1]];
    for (const [x, z, down] of spots) {
      const y = h(x, z), dm = mesh(planarUV(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), 0.9), M.paint);
      if (down) { dm.rotation.set(0, 0.7, Math.PI / 2); dm.position.set(x, y + 0.29, z); } else dm.position.set(x, y + 0.44, z);
      G.scene.add(dm); blockers.push({ x, z, r: down ? 0.45 : 0.3 });
    }
    addThing({ id: 'tally:drums', name: 'Fuel drums', verb: 'Knock on one', x: spots[0][0], y: h(spots[0][0], spots[0][1]) + 0.9, z: spots[0][1], r: 1.4, prov: X('Tally Bore'), use: () => { sfx.clang(1.4, spot(spots[0][0], spots[0][1], 8)); bark(pick(['Empty. Every drum out here is empty. Somebody comes round and makes sure.', 'Hollow as a promise.']), X('Tally Bore')); } });
  }
  // inside the racked house: a light switch, and a wireless on the table
  if (racked) {
    const sh = (ly) => 0.17 * ly;          // the house leans, so its walls do
    const sw = racked.world(1.15 + sh(1.45), racked.D / 2 - 0.08), plate = mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), M.bone, { cast: false });
    plate.position.set(sw.x, racked.y + 1.45, sw.z); plate.rotation.y = racked.yaw; G.scene.add(plate);
    let clicks = 0;
    addThing({ id: 'tally:switch', name: 'A light switch', verb: 'Flick it', x: sw.x, y: racked.y + 1.45, z: sw.z, r: 1.1, prov: X('Tally Bore'), use: () => {
      sfx.latch(spot(sw.x, sw.z, 4));
      bark(['Click. Nothing. Habit: there hasn’t been power through here since before I was born.', 'Click. Still nothing. Some habits are older than the people who had them.', 'Click.'][Math.min(2, clicks++)], X('Tally Bore'));
    } });
    const wp = racked.world(1.6, -1.6), set = new THREE.Group(); set.position.set(wp.x, racked.y + 0.95, wp.z); set.rotation.y = racked.yaw; G.scene.add(set);
    set.add(mesh(planarUV(new THREE.BoxGeometry(0.42, 0.22, 0.2), 0.4), M.timber));
    const dial = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2), M.bone); dial.position.set(0.13, 0, 0.105); set.add(dial);
    const grille = mesh(new THREE.PlaneGeometry(0.2, 0.14), M.rag, { cast: false }); grille.position.set(-0.07, 0, 0.101); set.add(grille);
    let tuned = 0;
    addThing({ id: 'tally:wireless', name: 'A wireless set', verb: 'Turn the knob', x: wp.x, y: racked.y + 0.95, z: wp.z, r: 1.2, prov: X('Tally Bore'), use: () => {
      dial.rotation.z += 1.1; sfx.static();
      bark(['Dead as the house. Of course it is.', 'Somebody left it tuned to the Flats relay. Last thing they listened to before they walked out.', 'Nothing. The tractor’s set gets the relay, when the antenna catches it.'][Math.min(2, tuned++)], X('Tally Bore'));
    } });
  }
}
const input0 = () => hooks.padMode ? hooks.padMode() : false;
function updateTally(dt) {
  for (const d of DOORS) {
    if (d === shedDoor) {
      // the wind works the shed door: a spring towards wherever the gust wants it, banging on the frame when it shuts
      const want = d.mode === 'latched' ? 0 : d.mode === 'wedged' ? -1.5 : -(0.15 + 1.25 * WIND.gust * (0.55 + 0.45 * Math.sin(G.time * 0.9 + Math.sin(G.time * 0.37) * 2)));
      if (d.mode === 'free' && Math.random() < dt * 0.7 * WIND.gust) d.v += (Math.random() - 0.25) * 3.2;     // a gust catches it, or lets it go
      d.v += ((want - d.angle) * (d.mode === 'free' ? 7 : 20) - d.v * (d.mode === 'free' ? 1.2 : 9)) * dt;
      d.angle += d.v * dt; d.bangCool -= dt;
      if (d.angle > 0) { if (d.v > 0.7 && d.bangCool <= 0 && d.mode === 'free') { const s = spot(d.sx, d.sz, 14); sfx.clang(clamp(d.v / 3, 0.3, 0.9), s); d.bangCool = 0.25; } d.angle = 0; d.v = -d.v * 0.25; }
      d.block.off = d.angle < -0.75;
    } else {
      d.angle += (d.target - d.angle) * clamp(dt * 3.2, 0, 1);
      if (d.block) d.block.off = d.angle > 0.7;
    }
    setSwing(d);
  }
  if (flap) { flap.angle += (flap.target - flap.angle) * clamp(dt * 6, 0, 1); setSwing(flap); }
  if (bonnet) { bonnet.angle += (bonnet.target - bonnet.angle) * clamp(dt * (bonnet.target ? 2.5 : 6), 0, 1); setSwing(bonnet); }
  if (brake) brake.lever.rotation.z = lerp(brake.lever.rotation.z, WINDMILL.mill.braked ? -0.9 : 0, clamp(dt * 6, 0, 1));
  if (PUMP.handle) {
    if (PUMP.t > 0) { PUMP.t -= dt; PUMP.handle.rotation.x = Math.sin((0.7 - PUMP.t) / 0.7 * Math.PI) * 0.6; } else PUMP.handle.rotation.x *= 1 - clamp(dt * 8, 0, 1);
    if (PUMP.flow > 0) {
      PUMP.flow -= dt; TROUGH.level = Math.min(1, TROUGH.level + dt * 0.12);
      const s = PUMP.spout; if (Math.random() < dt * 40) splash(s.x, s.y, s.z, 1, 0.25);
    }
    // the trough evaporates over the morning
    TROUGH.level = Math.max(0, TROUGH.level - dt * 0.0012);
    if (TROUGH.water) { TROUGH.water.visible = TROUGH.level > 0.02; TROUGH.water.position.y = TROUGH.y + 0.08 + TROUGH.level * 0.22; }
  }
}

// ---------- wrecks on the roads ----------
const WRECKS = [];
function wreckThing(id, s, name, text, prov = X('wrecks on the road')) {
  addThing({ id, name, verb: 'Look', x: s.x, y: h(s.x, s.z) + 1, z: s.z, r: 3, prov, use: () => { meet('ruin'); bark(text, prov); } });
}
function buildWrecks() {
  const box = (w, ht, d, x, y, z, rx = 0, ry = 0, rz = 0) => [new THREE.BoxGeometry(w, ht, d), MX(x, y, z, rx, ry, rz)];
  const wheel = (x, y, z, ry = 0, rz = Math.PI / 2) => [new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14), MX(x, y, z, 0, ry, rz)];
  // a ute on its roof in the ditch, wheels to the sky
  {
    const s = SPOTS.ute, y = h(s.x, s.z), yaw = s.yaw + 0.35, g = new THREE.Group(); g.position.set(s.x, y, s.z); g.rotation.set(0, yaw, 0.06); G.scene.add(g);
    g.add(mesh(planarUV(merge([box(1.8, 0.75, 4.6, 0, 0.95, 0), box(1.6, 0.5, 1.8, 0, 0.35, 0.6, 0, 0, 0.03), box(1.8, 0.35, 2.2, 0, 1.45, -1.1)]), 1), M.rust));
    g.add(mesh(merge([wheel(-0.85, 1.55, 1.4), wheel(0.85, 1.55, 1.4), wheel(-0.85, 1.55, -1.5), wheel(0.85, 1.55, -1.5)]), M.rubber));
    blockers.push({ x: s.x, z: s.z, r: 2.3 }); WRECKS.push({ x: s.x, z: s.z });
    wreckThing('wreck:ute', s, 'A ute on its roof', 'A ute on its roof in the ditch, wheels to the sky. The cab’s crushed down to the door handles. No telling how long ago. The rust says long.');
  }
  // a truck stripped to its chassis
  {
    const s = SPOTS.truck, y = h(s.x, s.z), g = new THREE.Group(); g.position.set(s.x, y, s.z); g.rotation.y = s.yaw - 0.08; G.scene.add(g);
    g.add(mesh(planarUV(merge([box(2.2, 1.6, 1.8, 0, 1.55, 2.6), box(0.18, 0.25, 7.2, -0.55, 0.62, 0), box(0.18, 0.25, 7.2, 0.55, 0.62, 0), box(1.3, 0.2, 0.18, 0, 0.62, -1.4), box(1.3, 0.2, 0.18, 0, 0.62, 1.2), box(0.5, 0.5, 0.9, 0.3, 0.4, -2.6, 0.3, 0.2, 0.4)]), 1), M.rust));
    g.add(mesh(merge([wheel(-1.0, 0.36, 2.5), wheel(1.0, 0.36, 2.5)]), M.rubber));
    G.scene.add(mesh(new THREE.TorusGeometry(0.34, 0.12, 8, 18), M.rubber).translateX(s.x + 3).translateY(h(s.x + 3, s.z - 2) + 0.12).translateZ(s.z - 2).rotateX(Math.PI / 2));
    blockers.push({ x: s.x, z: s.z + Math.cos(s.yaw) * 2.6, r: 1.5 }, { x: s.x, z: s.z, r: 1.1 }, { x: s.x, z: s.z - Math.cos(s.yaw) * 2.6, r: 1.1 }); WRECKS.push({ x: s.x, z: s.z });
    wreckThing('wreck:truck', s, 'A truck', 'A water truck, by the fittings on the back. The tank’s gone, the tray’s gone, the wheels are gone but two. Somebody needed all of it more than the truck did.');
  }
  // a burnt-out car
  {
    const s = SPOTS.burnt, y = h(s.x, s.z), g = new THREE.Group(); g.position.set(s.x, y, s.z); g.rotation.set(0.03, s.yaw + 1.2, -0.04); G.scene.add(g);
    const ash = new THREE.MeshStandardMaterial({ color: 0x4a3f3a, roughness: 1, map: M.rust.map, normalMap: M.rust.normalMap });
    g.add(mesh(planarUV(merge([box(1.7, 0.6, 4.1, 0, 0.42, 0), box(1.5, 0.5, 1.9, 0, 0.95, -0.25)]), 1), ash));
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.01, 1.6).translate(0, 1.205, -0.25), M.black, { cast: false }));
    blockers.push({ x: s.x, z: s.z, r: 2.1 }); WRECKS.push({ x: s.x, z: s.z });
    W.smoke.push({ x: s.x, y: y + 0.9, z: s.z, rate: 0.12, mat: M.smoke, size: 0.25 });             // a thread of smoke, still: it can’t be, and it is
    wreckThing('wreck:burnt', s, 'A burnt-out car', 'Burnt out. The paint’s gone to ash-grey and the glass has run into the dash. And a thread of smoke still coming off it, which it can’t be, after this long. I’m not putting my hand on it to check.');
  }
  // a cow's bones, picked clean and bleached
  {
    const s = SPOTS.bones, y = h(s.x, s.z), parts = [], R = rng(31337);
    for (let k = 0; k < 8; k++) for (const side of [-1, 1]) parts.push([new THREE.TorusGeometry(0.34 - Math.abs(k - 3.5) * 0.02, 0.022, 4, 10, Math.PI * 0.75), MX(k * 0.16 - 0.6, 0.06, side * 0.02, Math.PI / 2, 0, side > 0 ? 0.15 : Math.PI - 0.15)]);
    for (let k = 0; k < 14; k++) parts.push([new THREE.BoxGeometry(0.07, 0.07, 0.09), MX(k * 0.13 - 0.95, 0.05, (R() - 0.5) * 0.04, 0, R(), 0)]);
    parts.push([new THREE.BoxGeometry(0.42, 0.14, 0.24), MX(1.25, 0.08, 0.05, 0, 0.3, 0.1)], [new THREE.BoxGeometry(0.2, 0.16, 0.18), MX(1.0, 0.09, 0.05, 0, 0.3, 0)]);   // the skull
    for (const side of [-1, 1]) parts.push([new THREE.ConeGeometry(0.035, 0.3, 6), MX(1.08, 0.16, 0.05 + side * 0.18, side * 1.1, 0, 0.4)]);                     // horns
    parts.push([new THREE.BoxGeometry(0.4, 0.12, 0.34), MX(-1.15, 0.06, 0)]);                                                                                    // pelvis
    for (let k = 0; k < 4; k++) parts.push([new THREE.CylinderGeometry(0.03, 0.035, 0.55, 6), MX(-1.6 + R() * 3.2, 0.03, (R() - 0.5) * 2.6, Math.PI / 2, 0, R() * 3)]);
    const g = mesh(merge(parts), M.bone); g.position.set(s.x, y, s.z); g.rotation.y = s.yaw + 0.9; G.scene.add(g);
    addThing({ id: 'bones', name: 'Bones', verb: 'Look', x: s.x, y: y + 0.4, z: s.z, r: 2.2, prov: X(), use: () => bark('A cow, or what the sun and everything else out here left of one. Picked clean and bleached, a long way from any fence. Somebody’s whole year, walking off into the Waste.', X()) });
  }
  // an emergency phone on a post, the kind the old roads had every few kilometres
  {
    const s = SPOTS.phone, y = h(s.x, s.z), g = new THREE.Group(); g.position.set(s.x, y, s.z); g.rotation.y = faceRoad(s.x, s.z); G.scene.add(g);
    const box = new THREE.MeshStandardMaterial({ color: 0xb8862a, roughness: 0.8, map: M.paint.map, normalMap: M.paint.normalMap });
    g.add(mesh(new THREE.BoxGeometry(0.09, 1.5, 0.09).translate(0, 0.75, 0), M.iron), mesh(planarUV(new THREE.BoxGeometry(0.36, 0.5, 0.2), 0.5).translate(0, 1.55, 0.06), box), mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06).translate(0.1, 1.55, 0.18), M.black));
    blockers.push({ x: s.x, z: s.z, r: 0.2 });
    let lifted = 0;
    addThing({ id: 'phone', name: 'An emergency phone', verb: 'Lift the handset', x: s.x, y: y + 1.5, z: s.z, r: 1.3, prov: X(), use: () => {
      sfx.latch(); sfx.static();
      bark(['Wind in the line, and nothing else. Then, so faint I might be making it up, a dial tone.', 'Nothing. Just the wind in the wire.', 'I don’t know who I’d call.'][Math.min(2, lifted++)], X());
    } });
  }
}

// ---------- washing on a line, a rag on a stick: cloth that moves with the wind ----------
function clothMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide, map: M.rag.map, normalMap: M.rag.normalMap });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: SWAY.uTime, uWind: SWAY.uWind });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hang = clamp(-position.y / 0.8, 0.0, 1.0), g = 0.35 + uWind.z;
        transformed.z += (sin(uTime * 6.5 + position.x * 7.0 + position.y * 4.0) * 0.045 + sin(uTime * 11.0 + position.x * 13.0) * 0.015) * g * hang + hang * hang * 0.22 * uWind.z;
        transformed.y += hang * hang * 0.05 * uWind.z;`);
  };
  m.customProgramCacheKey = () => 'cloth';
  return m;
}
function buildCloth() {
  W.flags = W.flags || [];
  const ver = (W.houses || []).find(q => q.kind === 'verandah');
  if (ver) {
    const a = ver.world(-3.2, -ver.D / 2 - 3), b = ver.world(3.2, -ver.D / 2 - 3), y = h(a.x, a.z), y2 = h(b.x, b.z);
    G.scene.add(mesh(merge([[new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), MX(a.x, y + 0.95, a.z)], [new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), MX(b.x, y2 + 0.95, b.z)]]), M.timber));
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, y + 1.85, a.z), new THREE.Vector3((a.x + b.x) / 2, (y + y2) / 2 + 1.72, (a.z + b.z) / 2), new THREE.Vector3(b.x, y2 + 1.85, b.z)]);
    G.scene.add(new THREE.Line(lg, M.wire));
    const cols = [0x5f6f7f, 0x8a4f42, 0x9a8f80];
    [[0.25, 0.5, 0.7], [0.5, 0.42, 0.55], [0.74, 0.72, 0.5]].forEach(([t, w, ht], k) => {
      const geo = new THREE.PlaneGeometry(w, ht, 8, 8); geo.translate(0, -ht / 2, 0);
      const c = mesh(geo, clothMaterial(cols[k]), { cast: true, receive: true });
      c.position.set(lerp(a.x, b.x, t), lerp(y, y2, t) + 1.82 - Math.sin(t * Math.PI) * 0.12, lerp(a.z, b.z, t)); c.rotation.y = ver.yaw; G.scene.add(c);
    });
    W.flags.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  }
  const s = SITES.shacks[0];
  if (s) {
    const x = s.x + 4, z = s.z + 3.5, y = h(x, z);
    G.scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.6, 5).translate(x, y + 1.3, z), M.timber));
    const geo = new THREE.PlaneGeometry(0.7, 0.45, 8, 6); geo.translate(0.36, -0.22, 0);
    const c = mesh(geo, clothMaterial(0x8a3a2a)); c.position.set(x, y + 2.55, z); c.rotation.y = 0.4; G.scene.add(c);
    blockers.push({ x, z, r: 0.1 }); W.flags.push({ x, z });
  }
}

// ---------- building, and every frame ----------
export function buildProps() {
  STONE.geo = new THREE.IcosahedronGeometry(0.05, 0); STONE.mat = new THREE.MeshStandardMaterial({ color: 0x9a5038, roughness: 0.85, flatShading: true });
  buildLitterMeshes();
  buildTally(); buildWrecks(); buildCloth();
  scatterLitter();
  for (const k of ['can', 'bottle']) { KICK.im[k].instanceMatrix.needsUpdate = true; if (KICK.im[k].instanceColor) KICK.im[k].instanceColor.needsUpdate = true; }
}
export function updateProps(dt) {
  if (G.area !== 'out') return;
  updateStones(dt); updateLitter(dt); updateTally(dt);
}
export const propState = () => ({ stones: STONE.flying.map(s => [+s.p.x.toFixed(2), +s.p.y.toFixed(2), +s.p.z.toFixed(2), s.back ? 'back' : '']), first: KICK.list.filter(k => !k.shelf).slice(0, 3).map(k => ({ kind: k.kind, x: +k.x.toFixed(2), z: +k.z.toFixed(2), y: +k.y.toFixed(2), awake: k.awake })), flying: STONE.flying.length, resting: STONE.resting.length, thrown: STONE.thrown, litter: KICK.list.length, kicked: KICK.kicked, awake: KICK.list.filter(k => k.awake).length, shedDoor: shedDoor ? { mode: shedDoor.mode, angle: +shedDoor.angle.toFixed(2) } : null, trough: +TROUGH.level.toFixed(2), gushes: TROUGH.gushes, hits: Object.keys(STONE.hits) });
