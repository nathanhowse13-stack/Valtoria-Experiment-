// ============================================================
// The south gate of Bleak Flats, as Chapter Two has it:
//
//   "Jacob slowed the tractor as he approached the south gate. He
//   joined the queue of traffic. A line of weary travellers,
//   dust-covered merchants, and steam-belching transport trucks waited
//   to be processed."
//
// The queue moves. The truck at the booth is scanned, the slab of ship
// plating goes up on its pistons, the truck goes in under the wall, the
// slab comes down, the next one pulls up. Then it's Jacob's turn: stop
// at the line, and the Ironshell (a heavy variant, officious grey going
// to rust, no face, a vision slit glowing dull crimson, a speaker grill
// where a throat should be) says "Scan." Jacob leans out of the seat,
// pulls his scarf down and offers his wrist; the lens in the palm of the
// gauntlet throws a grid of green light over it. Caste, name, solvency.
// Then the entry tax: five bits, or three ounces of raw water. Pay
// either, and the gate groans up, and under the wall is the end of the
// road.
//
// The words are the chapter's (Canon). Choosing how to pay, the lamp
// on the booth and the travellers on foot are this sketch's.
// ============================================================
import { THREE, clamp, lerp, rng, G, S, P, W, blockers, addThing, hooks, once, MX, planarUV, merge, mesh, M, T, CH2, NEW } from './core.js';
import { h, GATE } from './land.js';
import { dustKick } from './air.js';
import { sfx, spot } from './sound.js';

const C2 = ['C', CH2], X = (why) => ['X', why ? why + ': ' + NEW : NEW];
const gx = GATE.x, gz = GATE.z;
const BOOTH = { x: gx + 6.0, z: gz - 6.0 }, STAND = { x: gx + 4.5, z: gz - 6.0 }, STOP_Z = gz - 5.4;
const SLAB = { down: 2.75, up: 10.0 };

export const GS = {
  phase: 'far',            // far → queue (the trucks ahead are processed) → free (the booth is empty) → scan → tax → proceed → open → through
  t: 0, step: 0, gate: 0, gateWant: 0, lamp: 0, offer: 0, scarf: false, goggles: false, paid: null, bits: 5, arm: 0, laser: 0, served: null, wait: 0, hail: 0,
};
let gy = 0, shell = null, slab = null, lampM = null, grid = null, trucks = [], folk = [], block = null, terminalGlow = null;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// ---------- the Ironshell: a wall that learned to stand up ----------
function buildIronshell() {
  const g = new THREE.Group(); g.position.set(STAND.x, h(STAND.x, STAND.z), STAND.z); g.rotation.y = -Math.PI / 2; G.scene.add(g);      // facing the lane
  // "his armour painted a dull, officious grey that was slowly succumbing to the creeping red rust of the waste"
  const grey = new THREE.MeshStandardMaterial({ map: T.ironpaint.c, normalMap: T.ironpaint.n, color: 0xc4c8cc, roughness: 0.72, metalness: 0.45 }), rust = M.rust, dark = M.black;
  const part = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
  const box = (w, hh, d) => planarUV(new THREE.BoxGeometry(w, hh, d), 0.7);
  // legs like bollards, feet like footings
  for (const s of [-1, 1]) {
    part(g, box(0.36, 0.95, 0.4), grey, s * 0.27, 0.6, 0); part(g, box(0.44, 0.14, 0.62), grey, s * 0.27, 0.07, 0.06);
    part(g, box(0.4, 0.3, 0.44), rust, s * 0.27, 0.34, 0.01);                        // greaves, rusted from the ground up
    part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6), dark, s * 0.27, 0.72, -0.23);   // a piston up the back of each
  }
  part(g, box(0.96, 0.34, 0.62), grey, 0, 1.2, 0);
  // everything above the hips turns to face whoever is in front of it
  const torso = new THREE.Group(); torso.position.set(0, 1.36, 0); g.add(torso);
  part(torso, box(1.16, 0.95, 0.78), grey, 0, 0.5, 0);
  part(torso, box(0.9, 0.5, 0.1), grey, 0, 0.62, 0.42); part(torso, box(0.5, 0.2, 0.1), rust, -0.16, 0.24, 0.42);       // chest plate, a patch of it gone
  for (const [x, y] of [[-0.4, 0.82], [0.4, 0.82], [-0.4, 0.42], [0.4, 0.42]]) part(torso, new THREE.SphereGeometry(0.028, 6, 5), dark, x, y, 0.475);
  part(torso, box(1.0, 0.6, 0.3), grey, 0, 0.52, -0.5);                                                                   // the pack that drives it
  for (const s of [-1, 1]) part(torso, new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), dark, s * 0.3, 1.0, -0.52);
  // the speaker grill, where a throat should be
  part(torso, box(0.34, 0.16, 0.08), dark, 0, 1.01, 0.33);
  for (let k = 0; k < 4; k++) part(torso, box(0.3, 0.012, 0.02), grey, 0, 0.955 + k * 0.036, 0.376);
  // no face: a slab of a head, and the slit
  const head = new THREE.Group(); head.position.set(0, 1.12, 0.02); torso.add(head);
  part(head, box(0.58, 0.46, 0.56), grey, 0, 0.22, 0); part(head, box(0.62, 0.08, 0.6), rust, 0, 0.47, 0);
  const slit = part(head, new THREE.BoxGeometry(0.42, 0.05, 0.03), M.slit.clone(), 0, 0.26, 0.285);
  // shoulders like the tops of gateposts; the left arm hangs, the right carries the gauntlet
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.74, 0.86, 0); torso.add(sh);
    part(sh, new THREE.SphereGeometry(0.27, 12, 8).scale(1, 0.9, 1.05), s > 0 ? grey : rust, 0, 0.04, 0);
    part(sh, box(0.28, 0.62, 0.3), grey, 0, -0.36, 0);
    const el = new THREE.Group(); el.position.set(0, -0.68, 0); sh.add(el);
    part(el, box(0.3, 0.6, 0.32), grey, 0, -0.3, 0); part(el, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), dark, s * 0.17, -0.28, -0.1);
    part(el, box(0.4, 0.4, 0.42), s < 0 ? grey : rust, 0, -0.72, 0.02);                                                   // the fist: a gauntlet the size of a toolbox
    return { sh, el };
  });
  // the lens in the palm of the right gauntlet (his right is the −x side of his own frame)
  const lens = part(arms[0].el, new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x06140a, emissive: 0x30ff70, emissiveIntensity: 0, roughness: 0.2 }), 0, -0.95, 0.04);
  return { g, torso, head, slit, arms, lens, yaw: 0, sweep: Math.random() * 6 };
}

// ---------- the booth, its counting terminal, the lamp, the stop line ----------
function buildBooth() {
  const y = h(BOOTH.x, BOOTH.z), parts = [], dark = [];
  parts.push([new THREE.BoxGeometry(2, 1.0, 2), MX(BOOTH.x, y + 0.5, BOOTH.z)], [new THREE.BoxGeometry(2.4, 0.14, 2.4), MX(BOOTH.x, y + 2.75, BOOTH.z)]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([new THREE.BoxGeometry(0.12, 1.7, 0.12), MX(BOOTH.x + sx * 0.94, y + 1.85, BOOTH.z + sz * 0.94)]);
  parts.push([new THREE.BoxGeometry(2, 1.7, 0.06), MX(BOOTH.x, y + 1.85, BOOTH.z + 0.97)], [new THREE.BoxGeometry(0.06, 1.7, 2), MX(BOOTH.x + 0.97, y + 1.85, BOOTH.z)]);   // two walls; the lane side and the south are open
  parts.push([new THREE.BoxGeometry(0.5, 0.06, 1.6), MX(BOOTH.x - 1.1, y + 1.02, BOOTH.z)]);                                  // the counter
  G.scene.add(mesh(planarUV(merge(parts), 1), M.corr));
  // the counting terminal: a brass box with a slot in the top, and a window that glows while it thinks
  dark.push([new THREE.BoxGeometry(0.34, 0.3, 0.42), MX(BOOTH.x - 1.1, y + 1.2, BOOTH.z - 0.35)], [new THREE.CylinderGeometry(0.14, 0.2, 0.16, 10), MX(BOOTH.x - 1.1, y + 1.13, BOOTH.z + 0.4)]);
  G.scene.add(mesh(merge(dark), M.iron));
  terminalGlow = mesh(new THREE.BoxGeometry(0.02, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0x1a0d04, emissive: 0xffa040, emissiveIntensity: 0.25 }), { cast: false });
  terminalGlow.position.set(BOOTH.x - 1.28, y + 1.22, BOOTH.z - 0.35); G.scene.add(terminalGlow);
  // the lamp on the roof: red, until it isn't
  G.scene.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6).translate(BOOTH.x - 0.9, y + 3.25, BOOTH.z - 0.9), M.iron));
  lampM = mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0xff2010, emissiveIntensity: 2.2, roughness: 0.3 }), { cast: false });
  lampM.position.set(BOOTH.x - 0.9, y + 3.78, BOOTH.z - 0.9); G.scene.add(lampM);
  // a line across the seal, worn nearly away
  const line = mesh(new THREE.BoxGeometry(7.2, 0.012, 0.32), new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.9, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), { cast: false });
  line.position.set(gx, h(gx, gz - 3.4) + 0.05, gz - 3.4); G.scene.add(line);
  blockers.push({ x0: BOOTH.x - 1.0, z0: BOOTH.z - 1.0, x1: BOOTH.x + 1.0, z1: BOOTH.z + 1.0 }, { x: STAND.x, z: STAND.z, r: 0.75 });
  addThing({ id: 'gate:terminal', name: 'The counting terminal', verb: 'Look', x: BOOTH.x - 1.2, y: y + 1.3, z: BOOTH.z - 0.2, r: 1.5, prov: C2, use: () => hooks.bark(GS.paid ? 'It’s had what it wanted.' : 'A brass box with a slot in the top. Five bits go in, and the gate goes up. That’s the whole of the law here.', X('the gate')) });
  addThing({ id: 'gate:ironshell', name: 'The Ironshell', verb: 'Look', x: STAND.x, y: y + 1.9, z: STAND.z, r: 2.6, prov: C2, use: () => hooks.bark(S.inTractor ? 'Ironshell.' : 'An Ironshell, heavy variant. Officious grey, going to rust. No face, just the slit. It won’t scan a man on foot: it wants a vehicle on the line.', C2) });
}

// ---------- the slab of ship plating, and what stops anything going under it while it's down ----------
function buildSlab() {
  slab = mesh(planarUV(new THREE.BoxGeometry(8.2, 5.5, 0.6), 1.5), M.iron); slab.position.set(gx, gy + SLAB.down, gz); G.scene.add(slab);
  // welded plates and a tide-line of rust, so it reads as a hull that used to float
  const ribs = []; for (let k = -3; k <= 3; k++) ribs.push([new THREE.BoxGeometry(0.14, 5.3, 0.1), MX(k * 1.15, 0, -0.34)]);
  for (const yy of [-1.6, 0.2, 1.9]) ribs.push([new THREE.BoxGeometry(8.0, 0.12, 0.1), MX(0, yy, -0.34)]);
  slab.add(mesh(merge(ribs), M.rust));
  block = { x0: gx - 4.2, z0: gz - 0.6, x1: gx + 4.2, z1: gz + 0.6, off: false };
  (W.dynamic = W.dynamic || []).push(block);
}

// ---------- the queue: two steam trucks ahead of him, and people on foot ----------
function buildTruck(z, tone) {
  const g = new THREE.Group(), tg = [];
  tg.push([new THREE.BoxGeometry(2.4, 2.2, 3.2), MX(0, 1.8, 2.2)], [new THREE.BoxGeometry(2.6, 2.6, 5), MX(0, 2, -2)], [new THREE.CylinderGeometry(0.7, 0.7, 2.4, 14), MX(0, 1.6, 4.4, Math.PI / 2, 0, 0)]);
  tg.push([new THREE.CylinderGeometry(0.16, 0.2, 1.9, 8), MX(0.75, 3.4, 3.4)], [new THREE.BoxGeometry(2.7, 0.12, 5.2), MX(0, 3.36, -2)]);         // a stack, and a tarp frame over the load
  g.add(mesh(planarUV(merge(tg), 1), tone));
  const wheels = [];
  for (const s of [-1, 1]) for (const zz of [3.2, -0.5, -3.4]) { const w = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 12).rotateZ(Math.PI / 2), M.rubber); w.position.set(s * 1.3, 0.6, zz); g.add(w); wheels.push(w); }
  const x = gx + 0.5; g.position.set(x, h(x, z), z); G.scene.add(g);
  const smoke = { x, y: h(x, z) + 4.4, z: z + 3.4, rate: 0.6, mat: M.smoke, size: 0.6 }; W.smoke.push(smoke);
  const cols = [{ x, z: z + 2.4, r: 2.1, off: false }, { x, z: z - 2.6, r: 2.1, off: false }]; W.dynamic.push(...cols);
  return { g, wheels, x, z, v: 0, smoke, cols, state: 'wait', t: 0, shake: Math.random() * 6 };
}
function buildFolk() {
  const R = rng(733), cloak = M.rag, list = [];
  for (const [fx, fz, sit] of [[-5.3, gz - 8.5, 0], [-5.0, gz - 10.4, 0], [-5.6, gz - 13.2, 1], [-5.1, gz - 16.5, 0], [-5.5, gz - 19.0, 0], [-4.9, gz - 23.5, 1], [-5.4, gz - 27.0, 0]]) {
    const g = new THREE.Group(), y = h(fx, fz); g.position.set(fx, y, fz); g.rotation.y = (R() - 0.5) * 0.6; G.scene.add(g);
    const body = new THREE.Group(); g.add(body);
    const ht = sit ? 0.75 : 1.25 + R() * 0.25;
    const robe = new THREE.CylinderGeometry(0.17, sit ? 0.42 : 0.3, ht, 9); robe.translate(0, ht / 2, 0);
    body.add(mesh(robe, cloak));
    const hood = new THREE.Group(); hood.position.set(0, ht + 0.1, 0); body.add(hood);
    hood.add(mesh(new THREE.SphereGeometry(0.17, 10, 8).scale(1, 1.08, 1.1), cloak));
    hood.add(mesh(new THREE.SphereGeometry(0.105, 8, 6).translate(0, -0.02, 0.1), M.black, { cast: false }));                 // nothing to see under it
    if (R() < 0.7) body.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 0.24).translate(0, ht * 0.72, -0.24), M.timber));        // a pack
    if (!sit && R() < 0.5) g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.7, 5).translate(0.3, 0.85, 0.12), M.timber)); // a staff
    if (sit) g.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4).translate(0, 0.15, -0.05), M.canvas));                           // sitting on what they own
    blockers.push({ x: fx, z: fz, r: 0.35 });
    list.push({ g, body, hood, x: fx, z: fz, ph: R() * 6, yaw: g.rotation.y, look: 0 });
  }
  addThing({ id: 'gate:folk', name: 'The queue', verb: 'Look', x: -5.2, y: h(-5.2, gz - 15) + 1.2, z: gz - 15, r: 5, prov: C2, use: () => hooks.bark('Weary, dust-covered, waiting. Nobody talks in a queue for Bleak Flats. You save your breath for the air inside.', X('the queue')) });
  return list;
}

// ---------- the grid of green light ----------
function buildGrid() {
  const N = (4 + 6 + 6) * 2, pos = new Float32Array(N * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(0.1, 2.4, 0.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.frustumCulled = false; m.visible = false; G.scene.add(m);
  return { m, pos, g };
}
// from the lens to a square of light on whatever it's reading, the lines crawling across it
function drawGrid(from, to, amt, time) {
  const p = grid.pos, size = 0.34 * amt;
  _a.subVectors(to, from).normalize(); _b.set(0, 1, 0).addScaledVector(_a, -_a.y).normalize(); _c.crossVectors(_a, _b);
  let o = 0; const put = (v) => { p[o++] = v.x; p[o++] = v.y; p[o++] = v.z; };
  const at = (u, w) => _v.copy(to).addScaledVector(_c, u * size).addScaledVector(_b, w * size);
  for (const [u, w] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { put(from); put(at(u, w)); }
  for (let k = 0; k < 6; k++) { const s = ((k / 6 + time * 0.35) % 1) * 2 - 1; put(at(s, -1)); put(at(s, 1)); }
  for (let k = 0; k < 6; k++) { const s = ((k / 6 + time * 0.23) % 1) * 2 - 1; put(at(-1, s)); put(at(1, s)); }
  grid.g.attributes.position.needsUpdate = true;
}

export function buildGate() {
  gy = h(gx, gz); W.dynamic = W.dynamic || [];
  shell = buildIronshell(); buildBooth(); buildSlab();
  trucks = [buildTruck(gz - 8.5, M.paint), buildTruck(gz - 21.5, M.rust)];
  folk = buildFolk(); grid = buildGrid();
}

// ---------- every frame ----------
const say = (text, ms = 3200) => hooks.caption && hooks.caption('Ironshell', text, C2, 'ironshell', ms);
// the Ironshell deals with whoever is at the booth: raise the gauntlet, read them, let them through
function serveTruck(dt, t) {
  t.t += dt;
  if (t.state === 'scan') { GS.arm = Math.min(1, GS.arm + dt * 1.2); GS.laser = t.t > 0.8 && t.t < 2.2 ? 1 : 0; if (t.t > 0.8 && !t.beeped) { t.beeped = true; sfx.scan(spot(STAND.x, STAND.z, 22)); } if (t.t > 3.2) { t.state = 'go'; t.t = 0; GS.gateWant = 1; GS.lamp = 1; } }
  else if (t.state === 'go') {
    GS.arm = Math.max(0, GS.arm - dt * 1.2); GS.laser = 0;
    if (GS.gate > 0.85) t.v = Math.min(3.4, t.v + dt * 1.1);
    if (t.z > gz + 9) { GS.gateWant = 0; GS.lamp = 0; }
    if (t.z > gz + 26) { t.state = 'gone'; t.g.visible = false; t.smoke.rate = 0; for (const c of t.cols) c.off = true; GS.served = null; }
  }
}
function moveTruck(dt, t, tr) {
  if (t.state === 'gone') return;
  if (t.state === 'advance') {
    // pull up to the line, unless something (Jacob, say) has got in the way
    const ahead = tr && Math.abs(tr.x - t.x) < 2.6 && tr.z > t.z && tr.z - t.z < 9.5;
    t.v = ahead ? Math.max(0, t.v - dt * 4) : Math.min(2.4, t.v + dt * 1.2);
    if (t.z >= gz - 8.5) { t.z = gz - 8.5; t.v = 0; t.state = 'wait'; }
  }
  t.z += t.v * dt; t.shake += dt;
  const y = h(t.x, t.z);
  t.g.position.set(t.x, y + Math.sin(t.shake * 31) * 0.006, t.z); t.g.rotation.z = Math.sin(t.shake * 27) * 0.0025;                  // the boiler shakes the whole truck
  for (const w of t.wheels) w.rotation.x += t.v * dt / 0.6;
  t.smoke.x = t.x + 0.75; t.smoke.z = t.z + 3.4; t.smoke.y = y + 4.5; t.smoke.rate = 0.5 + t.v * 0.5;
  t.cols[0].z = t.z + 2.4; t.cols[1].z = t.z - 2.6;
}
const HERE = () => S.inTractor && G.tractor ? G.tractor : P;
export function updateGate(dt) {
  const tr = G.tractor, who = HERE(), dist = Math.hypot(who.x - gx, who.z - gz), time = G.time;
  if (dist > 420) return;
  // --- the gate itself, the lamp, the terminal ---
  const before = GS.gate;
  GS.gate += clamp(GS.gateWant - GS.gate, -dt / 3.2, dt / 4.4);
  if (GS.gateWant > before && before === 0 && GS.gate > 0) { sfx.gate(spot(gx, gz, 60)); hooks.rumble && dist < 30 && hooks.rumble(0.5, 0.7, 900); }
  if (GS.gateWant < before && before === 1) sfx.gate(spot(gx, gz, 50));
  if (before > 0 && GS.gate === 0) { sfx.crash && dist < 60 && sfx.thump(0.5 * spot(gx, gz, 40).gain); dustKick(gx - 2, gz - 0.8, 10, { size: 0.8, spread: 3 }); dustKick(gx + 2, gz - 0.8, 10, { size: 0.8, spread: 3 }); }
  const ease = GS.gate * GS.gate * (3 - 2 * GS.gate);
  slab.position.y = gy + lerp(SLAB.down, SLAB.up, ease) + (GS.gate > 0 && GS.gate < 1 ? Math.sin(time * 40) * 0.012 : 0);
  if (GS.gate > 0.02 && GS.gate < 0.98 && Math.random() < dt * 10) dustKick(gx + (Math.random() - 0.5) * 7, gz, 1, { size: 0.3, spread: 0.4, up: 0.1, alpha: 0.2, y: slab.position.y - 2.9 });   // a century of rust shaken off it
  block.off = GS.gate > 0.8;
  lampM.material.emissive.setRGB(GS.lamp ? 0.1 : 1, GS.lamp ? 1 : 0.12, GS.lamp ? 0.25 : 0.05); lampM.material.emissiveIntensity = 1.8 + Math.sin(time * 7) * 0.25;
  terminalGlow.material.emissiveIntensity = GS.phase === 'tax' ? 1.2 + Math.sin(time * 9) * 0.6 : 0.25;
  // --- the queue ahead of him ---
  if (GS.phase === 'far' && dist < 135) { GS.phase = 'queue'; trucks[0].state = 'scan'; trucks[0].t = 0; GS.served = trucks[0]; }
  for (const t of trucks) moveTruck(dt, t, S.inTractor ? tr : null);
  if (GS.served) serveTruck(dt, GS.served);
  if (GS.phase === 'queue' && !GS.served && GS.gate === 0) {
    const next = trucks.find(t => t.state === 'wait' && t.z < gz - 9), at = trucks.find(t => t.state === 'wait' && t.z >= gz - 8.6);
    if (at) { if ((GS.wait += dt) > 1.6) { at.state = 'scan'; at.t = 0; at.beeped = false; GS.served = at; GS.wait = 0; } }
    else if (next) next.state = 'advance';
    else if (!trucks.some(t => t.state === 'advance')) GS.phase = 'free';
  }
  // --- the people on foot: shifting their weight, and watching the tractor come ---
  for (const f of folk) {
    if (Math.abs(f.z - who.z) > 70) continue;
    f.ph += dt;
    f.body.rotation.z = Math.sin(f.ph * 0.7) * 0.03; f.body.rotation.x = Math.sin(f.ph * 0.43 + 1) * 0.02;
    const want = Math.hypot(who.x - f.x, who.z - f.z) < 16 ? clamp(Math.atan2(who.x - f.x, who.z - f.z) - f.yaw, -1.1, 1.1) : Math.sin(f.ph * 0.21) * 0.3;
    f.look += (want - f.look) * clamp(dt * 1.6, 0, 1); f.hood.rotation.y = f.look;
  }
  // --- Jacob's turn ---
  const stopped = S.inTractor && Math.abs(tr.speed) < 0.35 && Math.abs(tr.z - STOP_Z) < 2.6 && tr.x > gx - 2.2 && tr.x < gx + 3.2;
  if (dist < 60 && !GS.joined && S.inTractor) { GS.joined = true; GS.goggles = true; once('gate-queue', 'Age of Glass. What a joke.', C2); }
  if ((GS.phase === 'free' || GS.phase === 'queue') && !GS.served && GS.gate === 0 && stopped && (GS.hail += dt) > 0.5) { GS.phase = 'scan'; GS.t = 0; GS.step = 0; }
  if (!stopped) GS.hail = 0;
  if (GS.phase === 'scan') {
    if (!stopped && GS.step < 5) { GS.offer = Math.max(0, GS.offer - dt * 2); GS.arm = Math.max(0, GS.arm - dt); GS.laser = 0; }       // he's rolled off the line: it waits
    else {
      GS.t += dt;
      const at = (n, when, fn) => { if (GS.step === n && GS.t >= when) { GS.step = n + 1; fn(); } };
      at(0, 0.3, () => say('Scan.', 2200));
      at(1, 1.7, () => { GS.scarf = true; });
      if (GS.step >= 2) GS.offer = Math.min(1, GS.offer + dt * 1.6);
      if (GS.step >= 2) GS.arm = Math.min(1, GS.arm + dt * 1.1);
      at(2, 3.0, () => { GS.laser = 1; sfx.scan(spot(STAND.x, STAND.z, 20)); });
      at(3, 4.6, () => { GS.laser = 0; say('Vampiris caste. Jacob Ackerman. Outer city resident. Solvency rating: critical.', 5200); });
      if (GS.step >= 4) { GS.offer = Math.max(0, GS.offer - dt * 1.4); GS.arm = Math.max(0, GS.arm - dt * 0.9); }
      at(4, 10.2, () => hooks.bark('Good morning to you too, clank.', C2));
      at(5, 12.8, () => { say('Entry tax. Five bits. Or three ounces of raw water.', 4200); });
      at(6, 15.4, () => { GS.phase = 'tax'; GS.scarf = false; askTax(); });
    }
  } else if (GS.phase === 'tax') {
    // the offer stands while he's on the line; drive off and it's withdrawn until he comes back
    const near = S.inTractor && Math.abs(tr.z - STOP_Z) < 5 && Math.abs(tr.x - gx) < 5;
    if (!near && GS.asking) { GS.asking = false; hooks.choice && hooks.choice(null); }
    else if (near && !GS.asking && Math.abs(tr.speed) < 0.35) askTax();
  } else if (GS.phase === 'proceed') {
    GS.t += dt;
    if (GS.step === 0 && GS.t > 1.5) { GS.step = 1; say('Proceed. Keep your vents closed, flesh citizen. The air quality index is… unideal to support biological life. Risk of death is… likely.', 7200); }
    if (GS.step === 1 && GS.t > 4.2) { GS.step = 2; GS.gateWant = 1; GS.lamp = 1; GS.phase = 'open'; }
  } else if (GS.phase === 'open') {
    const z = S.inTractor ? tr.z : P.z;
    if (z > gz + 3.2 && GS.gate > 0.8) { GS.phase = 'through'; hooks.arrive && hooks.arrive(); }
  }
  GS.laser = GS.phase === 'scan' && GS.step === 3 ? 1 : (GS.served && GS.served.state === 'scan' ? GS.laser : 0);
  poseIronshell(dt, who, dist, time);
}
// "Five bits. Or three ounces of raw water."
function askTax() {
  if (!hooks.choice) return;
  GS.asking = true;
  const water = S.can > 0 || S.sips > 0;
  hooks.choice({ title: 'Entry tax', note: 'Five bits. Or three ounces of raw water.', prov: C2, options: [
    { label: `Five bits, from the pouch`, sub: `${GS.bits} in it`, pick: () => pay('bits') },
    { label: 'Three ounces of raw water', sub: water ? (S.can > 0 ? 'off the canister’s tap' : 'out of the water bag') : 'none to give', disabled: !water, pick: () => pay('water') },
  ] });
}
function pay(how) {
  GS.asking = false; GS.paid = how; S.flags.paid = how;
  const sp = spot(BOOTH.x, BOOTH.z, 12);
  if (how === 'bits') {
    GS.bits = 0; for (let k = 0; k < 5; k++) setTimeout(() => sfx.clink(sp), k * 110); setTimeout(() => { for (let k = 0; k < 6; k++) setTimeout(() => sfx.tink(sp), k * 60); }, 800);
    hooks.bark('Five small, jagged crystals, into the counting terminal. The machine closes its fist on them. They rattle.', C2);
  } else {
    if (S.can > 0) S.can--; else S.sips--;
    sfx.fill(); hooks.updateVitals();
    hooks.bark('Three ounces, measured to the drop, out of what I carried all this way. It watches the level, not me. The bits stay in the pouch.', X('paying the tax in water'));
  }
  GS.phase = 'proceed'; GS.t = 0; GS.step = 0;
}
// the slit follows whoever's in front of it; the gauntlet comes up to read them; the grid goes out from the palm
function poseIronshell(dt, who, dist, time) {
  const sh = shell;
  sh.sweep += dt;
  const busy = GS.served && GS.served.state === 'scan', target = busy ? GS.served : who;
  let want = Math.sin(sh.sweep * 0.25) * 0.5;
  if (busy || dist < 26) { const tx = target.x - STAND.x, tz = (busy ? target.z + 2.2 : target.z) - STAND.z; let a = Math.atan2(tx, tz) + Math.PI / 2; if (a > Math.PI) a -= Math.PI * 2; want = clamp(a, -1.5, 1.5); }
  sh.yaw += (want - sh.yaw) * clamp(dt * 1.4, 0, 1);                                    // slowly: it is in no hurry, and it weighs what a wall weighs
  sh.torso.rotation.y = sh.yaw * 0.7; sh.head.rotation.y = sh.yaw * 0.3;
  sh.slit.material.emissiveIntensity = 1.2 + Math.sin(time * 1.3) * 0.25 + (GS.phase === 'scan' ? 0.9 : 0);
  const A = sh.arms[0], up = GS.arm * GS.arm * (3 - 2 * GS.arm);
  A.sh.rotation.x = -up * 1.05; A.el.rotation.x = -up * 0.45; A.sh.rotation.z = -up * 0.12;
  sh.lens.material.emissiveIntensity = GS.laser ? 3.5 : up * 0.4;
  const on = GS.laser > 0 && up > 0.7;
  grid.m.visible = on;
  if (on) {
    sh.g.updateMatrixWorld(true); sh.lens.getWorldPosition(_a.set(0, 0, 0));
    const from = new THREE.Vector3().copy(_a);
    const to = busy ? new THREE.Vector3(GS.served.x + 1.25, gy + 2.3, GS.served.z + 2.6) : (G.offerAt ? G.offerAt.clone() : new THREE.Vector3(who.x + 0.9, gy + 2.0, who.z - 0.5));
    drawGrid(from, to, busy ? 1.6 : 1, time);
    grid.m.material.opacity = 0.65 + Math.random() * 0.35;
  }
}
// what the driver's body is asked to do (driver.js reads it every frame)
export const gatePose = () => ({ offer: GS.offer, scarfDown: GS.scarf, gogglesDown: GS.goggles });
