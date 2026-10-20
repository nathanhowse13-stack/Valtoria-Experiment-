// ============================================================
// Three shallow caves off the road, each its own small world you walk
// into: the den in the canyon's west wall (a Drop-Stalker keeps the
// ledge over its mouth), the seep in the east wall (a crack lets a shaft
// of sun down onto still water), and the old adit in the big strip mine
// near Bleak Flats. A few relics in each.
//
// No torch: Jacob is vampiris, and his eyes open wide in the dim
// (Chapter One), so the dark lifts as he goes in, and the sun hits like
// a hammer when he comes back out.
//
// Inside a cave, P.x / P.z are the cave's own coordinates: the mouth at
// the origin, the cave running back along −z.
// ============================================================
import { THREE, TAU, clamp, lerp, smooth, rng, G, S, P, addThing, bark, once, meet, hooks, MX, rodMX, planarUV, merge, mesh, M, placeRelic, glowTexture, CH1, GUIDE, FARM, NEW } from './core.js';
import { h, canyonAxisX, CANYON, CAVE_MOUTHS, ADIT, strataColour } from './land.js';

export const CAVES = {};
const _c = new THREE.Color();

// ---------- the caves, laid out: [x, z, half-width, height, floor] along each passage ----------
const DEFS = {
  den: {
    name: 'the den in the west wall',
    passages: [
      [[0, 1.2, 2.0, 3.6, 0], [0, -1, 1.9, 3.4, 0], [0.4, -3.5, 1.9, 3.3, -0.1], [1.2, -7, 1.5, 2.6, -0.3], [0.6, -11, 2.1, 3.0, -0.5], [-0.8, -15, 3.4, 4.2, -0.6], [-1.2, -19, 3.0, 3.6, -0.6], [-0.6, -22, 1.2, 1.6, -0.6], [-0.4, -23, 0.3, 0.4, -0.6]],
      [[0.6, -11, 1.6, 2.4, -0.5], [2.6, -12.5, 1.0, 1.5, -0.4], [4.4, -14, 0.9, 1.35, -0.3], [5.6, -16, 1.4, 1.8, -0.3], [6.0, -17.6, 0.6, 0.8, -0.3], [6.1, -18.2, 0.2, 0.3, -0.3]],
    ],
  },
  seep: {
    name: 'the seep in the east wall',
    passages: [
      [[0, 1.2, 2.0, 3.6, 0], [0, -1, 1.8, 3.4, 0], [-0.5, -4, 2.0, 3.6, -0.2], [0.4, -8, 1.6, 3.0, -0.5], [1.5, -12, 4.4, 7.5, -0.9], [0.8, -16, 3.6, 6.0, -1.0], [0, -19.5, 1.4, 2.0, -1.0], [-0.2, -20.6, 0.3, 0.4, -1.0]],
      [[0.4, -8, 1.4, 2.6, -0.5], [-2.5, -9.5, 1.2, 2.2, -0.6], [-4.5, -11, 1.7, 2.5, -0.7], [-5.4, -12.6, 0.7, 1.0, -0.7], [-5.6, -13.2, 0.2, 0.3, -0.7]],
    ],
  },
  adit: {
    name: 'the old adit',
    mine: true,
    passages: [
      [[0, 1.2, 1.5, 2.7, 0], [0, -1, 1.4, 2.6, 0], [0, -5, 1.4, 2.5, -0.2], [0.3, -10, 1.5, 2.5, -0.4], [0.2, -15, 1.6, 2.6, -0.6], [0, -20, 2.7, 3.2, -0.8], [0.6, -24, 1.4, 2.2, -0.9], [0.7, -25.4, 0.4, 0.6, -0.9]],
      [[0.3, -10, 1.2, 2.3, -0.4], [2.8, -11.5, 1.2, 2.3, -0.4], [5.5, -13, 1.3, 2.3, -0.4], [7.6, -14, 0.8, 1.4, -0.4], [8.2, -14.4, 0.2, 0.3, -0.4]],
    ],
  },
};

// where each cave opens onto the world, and which way it faces
function mouthOf(id) {
  if (id === 'adit') return { x: ADIT.x + 0.4, z: ADIT.z, y: h(ADIT.x + 1, ADIT.z), ox: 1, oz: 0 };
  const c = CAVE_MOUTHS[id], x = canyonAxisX(c.z) + c.side * (CANYON.half + 0.4);
  return { x, z: c.z, y: 0, ox: -c.side, oz: 0 };
}

// ---------- the rock: a lumpy tube down each passage, banded like the canyon ----------
function sample(nodes, step = 0.45) {
  const out = [], N = (i) => nodes[clamp(i, 0, nodes.length - 1)];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = N(i - 1), b = N(i), c = N(i + 1), d = N(i + 2), len = Math.hypot(c[0] - b[0], c[1] - b[1]), n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, cr = (j) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3);
      out.push({ x: cr(0), z: cr(1), w: lerp(b[2], c[2], t), h: lerp(b[3], c[3], t), floor: lerp(b[4], c[4], t) });
    }
  }
  const l = nodes[nodes.length - 1]; out.push({ x: l[0], z: l[1], w: l[2], h: l[3], floor: l[4] });
  for (let i = 0; i < out.length; i++) { const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1; out[i].dx = (b.x - a.x) / L; out[i].dz = (b.z - a.z) / L; out[i].nx = out[i].dz; out[i].nz = -out[i].dx; }
  return out;
}
const lump = (x, y, z) => Math.sin(x * 2.3 + z * 1.7) * 0.5 + Math.sin(y * 3.1 - x * 1.3) * 0.3 + Math.sin(z * 4.7 + y * 2.1) * 0.2;
function tube(samples, { seed = 1, dark = 0, skipFloor = false, mine = false } = {}) {
  const K = 22, pos = [], col = [], uv = [], idx = [];
  samples.forEach((s, i) => {
    for (let j = 0; j <= K; j++) {
      const phi = j / K * TAU, ex = Math.cos(phi), ey = Math.sin(phi);
      const n = 1 + (mine ? 0.07 : 0.2) * lump(s.x * 1.3 + seed, phi * 2, s.z * 1.3);
      let lx = ex * s.w * n, y = s.floor + s.h / 2 + ey * (s.h / 2) * n;
      if (y < s.floor + 0.04) y = s.floor + 0.04 * lump(s.x * 4, 0, s.z * 4);                 // the floor, worn flat
      const x = s.x + s.nx * lx, z = s.z + s.nz * lx;
      pos.push(x, y, z); uv.push((s.x + s.z + lx) / 2.5, y / 2.5);
      strataColour(y * 1.6 + 18, s.z * 3 + seed * 50, _c);
      if (y < s.floor + 0.1) _c.lerp(_t.setRGB(0.62, 0.36, 0.26), 0.7);                            // red dust on the floor
      _c.lerp(_t.setRGB(0.5, 0.42, 0.38), 0.3);                                                    // out of the sun the rust goes grey-brown
      if (mine) _c.multiplyScalar(0.8);
      _c.multiplyScalar(1 - dark * (0.55 + 0.45 * smooth(0, 1, i / Math.max(1, samples.length - 1))));   // a throat falls away into the dark
      col.push(_c.r, _c.g, _c.b);
    }
  });
  for (let i = 0; i < samples.length - 1; i++) for (let j = 0; j < K; j++) {
    const a = i * (K + 1) + j, b = a + 1, c = a + K + 1, d = c + 1;
    if (skipFloor) { const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1], fy = samples[i].floor + 0.06; if (ya < fy && yb < fy) continue; }
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const _t = new THREE.Color();
let caveRock = null;

// ---------- building ----------
export function buildCaves() {
  caveRock = M.strata.clone(); caveRock.side = THREE.DoubleSide; caveRock.map = null;           // no dirt tint underground: the bands carry it
  for (const id in DEFS) buildCave(id);
}
function buildCave(id) {
  const def = DEFS[id], scene = new THREE.Scene(), m = mouthOf(id);
  scene.background = new THREE.Color(0x020101);
  scene.fog = new THREE.FogExp2(0x050302, 0.07);
  const paths = def.passages.map(p => sample(p)), all = paths.flat();
  paths.forEach((p, k) => scene.add(mesh(tube(p, { seed: k * 3 + id.length, mine: def.mine }), caveRock)));
  // the mouth, from inside: the world out there, too bright to look at
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.2), new THREE.MeshBasicMaterial({ color: 0xffe6c0, fog: false }));
  glare.position.set(0, 1.6, 1.35); glare.rotation.y = Math.PI; scene.add(glare);
  const spill = new THREE.SpotLight(0xffd0a0, 9, 12, 0.85, 0.8, 1.4); spill.position.set(0, 2.2, 1.0); spill.target.position.set(0, -0.5, -8); scene.add(spill, spill.target);
  scene.add(new THREE.AmbientLight(0xe8cdb4, 0.4));                                        // what vampiris eyes make of the dim
  const cave = { id, def, scene, mouth: m, paths, all, lights: [], webs: [], fx: [], jaws: [], rot: [] };
  CAVES[id] = cave;
  G.caves[id] = cave;
  ({ den: furnishDen, seep: furnishSeep, adit: furnishAdit })[id](cave);
  buildMouth(cave);
}

// the mouth, from outside: a dark way into the rock, rubble round it
function buildMouth(cave) {
  const m = cave.mouth, g = new THREE.Group(); g.position.set(m.x, m.y, m.z); g.rotation.y = Math.atan2(m.ox, m.oz); G.scene.add(g);
  const throat = sample([[0, 0.6, 2.0, 3.6, 0], [0, -1.5, 1.9, 3.4, -0.05], [0, -3.4, 1.6, 3.0, -0.1], [0, -3.9, 0.2, 0.2, -0.1]]);
  g.add(mesh(tube(throat, { seed: 9, dark: 0.92, skipFloor: true, mine: cave.def.mine }), caveRock));
  const R = rng(cave.id.length * 99), parts = [];
  if (cave.def.mine) {
    // timber portal: two posts and a cap, and the rails running out of it
    for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.22, 2.6, 0.22), MX(s * 1.25, 1.3, 0.35)]);
    parts.push([new THREE.BoxGeometry(2.9, 0.26, 0.3), MX(0, 2.65, 0.35)]);
    g.add(mesh(planarUV(merge(parts), 0.6), M.timber));
    const rails = []; for (const s of [-0.45, 0.45]) rails.push([new THREE.BoxGeometry(0.06, 0.08, 5), MX(s, 0.05, 2.0)]);
    for (let k = 0; k < 6; k++) rails.push([new THREE.BoxGeometry(1.3, 0.06, 0.18), MX(0, 0.02, 0.2 + k * 0.8)]);
    g.add(mesh(merge(rails), M.rust));
  } else {
    // a slab of the overhang over the mouth, and rockfall either side of it, half sunk in the wall
    parts.push([new THREE.DodecahedronGeometry(1, 1), MX(0.2, 3.9, -0.2, 0.1, 0.3, 0.05, 2.9, 0.7, 1.3)]);
    for (const s of [-1, 1]) { parts.push([new THREE.DodecahedronGeometry(1, 1), MX(s * 2.5, 0.9, -0.1, R(), R() * 3, 0, 0.9 + R() * 0.3, 1.3 + R() * 0.5, 0.8)], [new THREE.DodecahedronGeometry(1, 1), MX(s * (2.2 + R() * 0.4), 2.7, -0.3, R(), R() * 3, 0, 0.6, 0.9, 0.7)]); }
    for (let k = 0; k < 6; k++) { const s = 0.15 + R() * 0.3; parts.push([new THREE.DodecahedronGeometry(1, 0), MX((R() - 0.5) * 4.4, s * 0.4, 0.8 + R() * 2.2, R() * 3, R() * 3, 0, s, s * 0.7, s)]); }
    g.add(mesh(planarUV(merge(parts), 1.2), M.rock));
  }
  addThing({ id: 'mouth:' + cave.id, name: cave.def.name.replace(/^./, c => c.toUpperCase()), verb: 'Go in', x: m.x + m.ox * 1.2, y: m.y + 1.4, z: m.z + m.oz * 1.2, r: 2.2, prov: ['X', 'a cave: ' + NEW], use: () => enterCave(cave.id) });
}

// ---------- what's in them ----------
const S1 = new THREE.SphereGeometry(1, 10, 8);
function bones(scene, x, z, n, floor, R, spread = 1.4) {
  const parts = [];
  for (let k = 0; k < n; k++) parts.push([new THREE.CylinderGeometry(0.03, 0.04, 0.3 + R() * 0.35, 6), MX(x + (R() - 0.5) * spread * 2, floor + 0.04, z + (R() - 0.5) * spread * 2, Math.PI / 2, R() * 3, 0)]);
  scene.add(mesh(merge(parts), M.bone));
}
function rubble(scene, x, z, n, floor, R, spread = 1.2, size = 0.25) {
  const parts = [];
  for (let k = 0; k < n; k++) { const s = size * (0.4 + R()); parts.push([new THREE.DodecahedronGeometry(1, 0), MX(x + (R() - 0.5) * spread * 2, floor + s * 0.4, z + (R() - 0.5) * spread * 2, R() * 3, R() * 3, 0, s, s * 0.7, s)]); }
  scene.add(mesh(planarUV(merge(parts), 0.8), M.rock));
}
function web(cave, x, z, w, h2, floor, yaw) {
  const g = new THREE.Group(); g.position.set(x, floor, z); g.rotation.y = yaw; cave.scene.add(g);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h2, 8, 8), M.web); sheet.position.y = h2 / 2 + 0.1; g.add(sheet);
  const lines = [];
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; lines.push(0, h2 / 2 + 0.1, 0.01, Math.cos(a) * w / 2, h2 / 2 + 0.1 + Math.sin(a) * h2 / 2, 0.01); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0.6 })));
  const spider = new THREE.Group(); spider.position.set(w * 0.2, h2 * 0.7, 0.03); g.add(spider);
  const body = mesh(S1, M.furDark); body.scale.set(0.05, 0.04, 0.07); spider.add(body);
  for (let k = 0; k < 8; k++) { const s = k % 2 ? 1 : -1, l = mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.14, 4), M.furDark); l.position.set(s * 0.06, 0, -0.05 + Math.floor(k / 2) * 0.035); l.rotation.z = s * 1.2; spider.add(l); }
  cave.webs.push({ g, x, z, yaw, w, torn: false });
}
function truthRot(cave, x, y, z, light = true) {
  const parts = [];
  const R = rng(Math.round(x * 97 + z * 13));
  for (let k = 0; k < 9; k++) { const s = 0.05 + R() * 0.07; parts.push([new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI / 2), MX(x + (R() - 0.5) * 0.7, y + (R() - 0.5) * 0.5, z + (R() - 0.5) * 0.7, (R() - 0.5) * 2, 0, (R() - 0.5) * 2, s * 1.6, s * 0.6, s * 1.6)]); }
  const m = mesh(merge(parts), M.truthrot.clone(), { cast: false }); cave.scene.add(m);
  let pl = null; if (light) { pl = new THREE.PointLight(0x7cff6a, 6, 8, 1.6); pl.position.set(x, y, z); cave.scene.add(pl); }
  cave.rot.push({ m, pl, flare: 0 });
}

function furnishDen(cave) {
  const sc = cave.scene, R = rng(41);
  // the den chamber: a nest of shredded hide and fur, and what's left of whoever came in looking for shade
  const nest = [];
  for (let k = 0; k < 14; k++) nest.push([S1, MX(-0.8 + (R() - 0.5) * 2.4, -0.5, -15.5 + (R() - 0.5) * 2, R(), R() * 3, R(), 0.3 + R() * 0.3, 0.08, 0.2 + R() * 0.2)]);
  sc.add(mesh(merge(nest), M.fur));
  bones(sc, -0.8, -15.2, 22, -0.6, R, 2.2); bones(sc, 0.8, -9.5, 6, -0.4, R, 0.8);
  // the scrapper: a skull, ribs, a canvas pack against the wall
  const sk = new THREE.Group(); sk.position.set(1.3, -0.6, -17.6); sc.add(sk);
  const skull = mesh(S1, M.bone); skull.scale.set(0.11, 0.1, 0.13); skull.position.set(0, 0.1, 0.4); sk.add(skull);
  for (let k = 0; k < 6; k++) { const r = mesh(new THREE.TorusGeometry(0.16 - k * 0.012, 0.012, 4, 10, Math.PI), M.bone); r.position.set(0, 0.06, 0.1 - k * 0.07); r.rotation.set(0, Math.PI / 2, Math.PI / 2); sk.add(r); }
  const pack = mesh(planarUV(new THREE.BoxGeometry(0.5, 0.42, 0.3), 0.5), M.canvas); pack.position.set(0.5, 0.2, -0.2); pack.rotation.y = 0.4; sk.add(pack);
  rubble(sc, -0.6, -21.5, 10, -0.6, R); rubble(sc, 1.6, -5.5, 6, -0.2, R, 0.8);
  // the crawl to the alcove, webbed across
  web(cave, 2.6, -12.5, 1.9, 1.3, -0.4, Math.atan2(2.0, -1.5) + Math.PI / 2);
  web(cave, 5.3, -15.4, 2.2, 1.6, -0.3, 0.5);
  placeRelic('Scrapper’s tally-book', new THREE.Vector3(1.85, -0.1, -17.75), { area: 'den', scene: sc });
  placeRelic('Stalker claw', new THREE.Vector3(-1.2, -0.42, -15.8), { area: 'den', scene: sc });
  placeRelic('Painted chariot', new THREE.Vector3(5.8, -0.18, -16.4), { area: 'den', scene: sc });
  addThing({ id: 'den:nest', area: 'den', name: 'The nest', verb: 'Look', x: -0.8, y: -0.3, z: -15.5, r: 2, prov: ['X', NEW], use: () => { meet('stalker'); bark('Shredded hide and fur, still warm in the middle. Whatever sleeps here is up on the ledge now. Musk, and old meat.', ['X', NEW]); } });
  addThing({ id: 'den:bones', area: 'den', name: 'Bones', verb: 'Look', x: 1.3, y: 0, z: -17.4, r: 1.6, prov: ['X', NEW], use: () => bark('Somebody came in here for the shade. Left their pack. Left the rest of themselves too.', ['X', NEW]) });
  cave.onEnter = () => once('den-in', 'Musk, and old meat. My eyes open right up in the dark. The dim suits me. Doesn’t mean I like it in here.', ['C', CH1 + ': his pupils dilate wide in the dim']);
}

function furnishSeep(cave) {
  const sc = cave.scene, R = rng(73);
  // the chamber: a crack in the roof, a shaft of sun on still water, live creeper-vines down the crack
  const cx = 1.6, cz = -12.4, floor = -0.9;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28), M.water); pool.rotation.x = -Math.PI / 2; pool.position.set(cx, floor + 0.05, cz); sc.add(pool);
  const shaft = new THREE.SpotLight(0xfff0d0, 70, 12, 0.22, 0.5, 1.2); shaft.position.set(cx + 0.3, floor + 7.4, cz + 0.2); shaft.target.position.set(cx, floor, cz); sc.add(shaft, shaft.target);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.3, 7, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe8c0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.set(cx + 0.15, floor + 3.5, cz + 0.1); sc.add(beam);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff6e4, fog: false })); hole.rotation.x = Math.PI / 2; hole.position.set(cx + 0.3, floor + 7.35, cz + 0.2); sc.add(hole);
  // motes, turning in the beam
  const N = 160, mp = new Float32Array(N * 3); for (let k = 0; k < N; k++) mp.set([cx + (R() - 0.5) * 1.6, floor + R() * 7, cz + (R() - 0.5) * 1.6], k * 3);
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: glowTexture(), color: 0xffe6b0, size: 0.04, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sc.add(motes); cave.fx.push((dt, t) => { for (let k = 0; k < N; k++) { mp[k * 3 + 1] += Math.sin(t * 0.3 + k) * dt * 0.05; mp[k * 3] += Math.cos(t * 0.2 + k * 1.7) * dt * 0.02; } mg.attributes.position.needsUpdate = true; });
  const vines = [];
  for (let k = 0; k < 7; k++) { const len = 3 + R() * 3.5; vines.push([new THREE.PlaneGeometry(0.1, len), MX(cx + 0.3 + (R() - 0.5) * 0.7, floor + 7.3 - len / 2, cz + 0.2 + (R() - 0.5) * 0.4, 0, R() * 3, 0)]); }
  sc.add(mesh(merge(vines), M.vine, { cast: false }));
  rubble(sc, cx - 2.2, cz + 0.5, 12, floor, R, 1.0, 0.3); rubble(sc, 0.6, -18.5, 8, -1.0, R);
  // Truth-Rot along the walls, lighting the back of the cave green
  truthRot(cave, -1.2, floor + 1.6, -15.6); truthRot(cave, 4.6, floor + 1.2, -11.2); truthRot(cave, 0.6, -0.3 + 1.0, -6.6, false); truthRot(cave, -0.6, floor + 0.6, -18.8);
  // the old camp up the side passage: a fire ring, a bedroll, a cup, and marks on the wall
  const camp = [];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; camp.push([new THREE.DodecahedronGeometry(0.1, 0), MX(-4.5 + Math.cos(a) * 0.35, -0.65, -10.8 + Math.sin(a) * 0.35)]); }
  sc.add(mesh(merge(camp), M.rock));
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), M.black); ash.rotation.x = -Math.PI / 2; ash.position.set(-4.5, -0.68, -10.8); sc.add(ash);
  const roll = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 10), M.canvas); roll.rotation.z = Math.PI / 2; roll.rotation.y = 0.6; roll.position.set(-4.8, -0.55, -11.8); sc.add(roll);
  const cup = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.09, 10), M.tin); cup.position.set(-4.0, -0.65, -10.6); sc.add(cup);
  // scratched on the wall: a pale thing with a tail, drawn three times in a line, a little apart each time
  const marks = document.createElement('canvas'); marks.width = 256; marks.height = 96;
  { const x = marks.getContext('2d'); x.strokeStyle = 'rgba(240,226,200,0.85)'; x.lineWidth = 3; x.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const ox = 30 + k * 80, oy = 60; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + 18, oy - 26); x.lineTo(ox + 34, oy - 30); x.moveTo(ox + 18, oy - 26); x.lineTo(ox - 10, oy - 18); x.moveTo(ox + 8, oy - 14); x.lineTo(ox + 4, oy + 10); x.moveTo(ox + 14, oy - 14); x.lineTo(ox + 18, oy + 10); x.stroke(); if (k < 2) { x.setLineDash([3, 6]); x.beginPath(); x.moveTo(ox + 40, oy - 10); x.lineTo(ox + 70, oy - 10); x.stroke(); x.setLineDash([]); } } }
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(marks), transparent: true, roughness: 1, depthWrite: false }));
  art.position.set(-5.35, 0.5, -11.0); art.rotation.y = Math.PI / 2 - 0.35; sc.add(art);
  placeRelic('Vacuum flask', new THREE.Vector3(-4.1, -0.6, -11.5), { area: 'seep', scene: sc });
  placeRelic('Sulphur-Salts tin', new THREE.Vector3(cx + 3.6, floor + 0.9, cz - 1.4), { area: 'seep', scene: sc });
  placeRelic('Creeper-vine cord', new THREE.Vector3(cx - 0.6, floor + 0.15, cz + 1.6), { area: 'seep', scene: sc });
  hooks.addWater({ id: 'seep:pool', area: 'seep', name: 'The seep', x: cx, y: floor + 0.3, z: cz, line: 'Water out of rock, under a shaft of sun. Nobody’s taxing this one. Yet.' });
  addThing({ id: 'seep:rot', area: 'seep', name: 'Truth-Rot', verb: 'Say you’re fine', x: -1.2, y: floor + 1.6, z: -15.6, r: 2, prov: ['C', GUIDE], use: () => {
    meet('truthrot'); hooks.sfx.sizzle(); for (const r of cave.rot) r.flare = 1.6;
    bark('I’m fine.', ['X', NEW]); setTimeout(() => bark('The whole back wall flares green. …Yeah. All right.', ['C', GUIDE + ': it glows when someone lies']), 1400);
  } });
  addThing({ id: 'seep:art', area: 'seep', name: 'Marks on the wall', verb: 'Look', x: -5.2, y: 0.5, z: -11.0, r: 1.6, prov: ['X', NEW], use: () => bark('Scratched into the rock: a pale thing with a tail, three times in a row, a little further along each time. Whoever drew it had watched a strider fold the space between.', ['X', NEW + '; the blinking is ' + 'Chapter Two']) });
  cave.onEnter = () => once('seep-in', 'Cooler. Damp, even. Somewhere back there, light, and the sound of water not moving.', ['X', NEW]);
}

function furnishAdit(cave) {
  const sc = cave.scene, R = rng(97), timber = [], rails = [];
  // timber frames along the main drive, rails between them
  const main = cave.paths[0];
  for (let i = 4; i < main.length - 6; i += 6) {
    const s = main[i], w = s.w * 0.92, ht = s.h * 0.92, yaw = Math.atan2(s.dx, s.dz);
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.floor, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    for (const sd of [-1, 1]) timber.push([new THREE.BoxGeometry(0.16, ht, 0.16), frame.clone().multiply(MX(sd * (w - 0.15), ht / 2, 0))]);
    timber.push([new THREE.BoxGeometry(w * 2, 0.18, 0.2), frame.clone().multiply(MX(0, ht - 0.05, 0))]);
    for (const sd of [-0.45, 0.45]) rails.push([new THREE.BoxGeometry(0.06, 0.07, 2.8), frame.clone().multiply(MX(sd, 0.05, 0))]);
    rails.push([new THREE.BoxGeometry(1.2, 0.05, 0.16), frame.clone().multiply(MX(0, 0.02, 0.6))], [new THREE.BoxGeometry(1.2, 0.05, 0.16), frame.clone().multiply(MX(0, 0.02, -0.6))]);
  }
  // a collapsed frame near the end
  timber.push([new THREE.BoxGeometry(0.16, 2.2, 0.16), MX(0.9, -0.3, -21.6, 0, 0, 1.1)], [new THREE.BoxGeometry(2.4, 0.18, 0.2), MX(0.1, -0.5, -22.4, 0.3, 0.4, 0.5)]);
  sc.add(mesh(planarUV(merge(timber), 0.6), M.timber)); sc.add(mesh(merge(rails), M.rust));
  // the ore cart, tipped, its load spilled
  const cart = new THREE.Group(); cart.position.set(0.9, -0.62, -17.2); cart.rotation.set(0, 0.5, 1.2); sc.add(cart);
  cart.add(mesh(planarUV(new THREE.BoxGeometry(0.8, 0.55, 1.1), 0.5), M.rust));
  for (const [x, z] of [[-0.42, 0.35], [0.42, 0.35], [-0.42, -0.35], [0.42, -0.35]]) { const w = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10), M.iron); w.rotation.z = Math.PI / 2; w.position.set(x, -0.32, z); cart.add(w); }
  rubble(sc, 0.2, -17.6, 14, -0.65, R, 0.8, 0.14);
  rubble(sc, 0.6, -24.2, 22, -0.9, R, 1.4, 0.4);            // the collapse at the end
  // a dead lamp on a hook, and a jaw-jaw nest of stripped wire up the side gallery
  const lamp = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8), M.rust); lamp.position.set(0.2, 1.95, -9.6); sc.add(lamp);
  const nest = []; for (let k = 0; k < 30; k++) nest.push([new THREE.TorusGeometry(0.1 + R() * 0.15, 0.008, 4, 10), MX(6.6 + (R() - 0.5) * 1.0, -0.36 + R() * 0.15, -13.6 + (R() - 0.5) * 0.8, R() * 3, R() * 3, 0)]);
  sc.add(mesh(merge(nest), M.copper));
  web(cave, 4.2, -12.2, 2.2, 1.9, -0.4, Math.atan2(2.7, -1.5) + Math.PI / 2);
  for (let k = 0; k < 3; k++) cave.jaws.push(caveJaw(sc, 5.6 + k * 0.6, -13.2 + k * 0.3, -0.4));
  truthRot(cave, -1.1, 0.4, -19.8);
  placeRelic('Miner’s brass chit', new THREE.Vector3(0.4, -0.5, -16.5), { area: 'adit', scene: sc });
  placeRelic('Telephone handset', new THREE.Vector3(7.4, -0.25, -14.0), { area: 'adit', scene: sc });
  placeRelic('Pre-Fracture glass', new THREE.Vector3(1.2, -0.2, -23.4), { area: 'adit', scene: sc });
  addThing({ id: 'adit:cart', area: 'adit', name: 'Ore cart', verb: 'Look', x: 0.9, y: -0.3, z: -17.2, r: 1.6, prov: ['X', NEW], use: () => bark('Tipped, and the ore left where it fell. Whoever was pushing it ran, and didn’t come back for it. Bleak Flats is built on carts like this.', ['X', NEW]) });
  addThing({ id: 'adit:collapse', area: 'adit', name: 'The collapse', verb: 'Look', x: 0.6, y: 0, z: -23.8, r: 2, prov: ['X', NEW], use: () => bark('The roof came down here. Whatever they were following goes on behind it. I’m not digging.', ['X', NEW]) });
  cave.onEnter = () => once('adit-in', 'Old timber, older dark. Somebody dug this for iron and walked away from it. Mind the props.', ['X', NEW]);
}
function caveJaw(sc, x, z, floor) {
  const g = new THREE.Group(); g.position.set(x, floor, z); sc.add(g);
  const shell = mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, TAU, 0, Math.PI / 2), M.copper); shell.scale.set(1, 0.7, 1.4); g.add(shell);
  const head = mesh(new THREE.ConeGeometry(0.1, 0.22, 4), M.copper); head.position.set(0, 0.04, 0.27); head.rotation.set(Math.PI / 2, Math.PI / 4, 0); g.add(head);
  return { g, x, z, home: { x, z }, floor, t: Math.random() * 5, yaw: 0, target: null };
}

// ---------- going in, coming out, and keeping to the rock ----------
let out = null;     // where Jacob was outside, to put him back
export function enterCave(id) {
  const c = CAVES[id]; if (!c || G.area !== 'out' || S.inTractor) return;
  out = { x: P.x, z: P.z };
  G.area = id; G.exposureTarget = 1.9;
  P.x = 0; P.z = -0.6; P.yaw = Math.PI; P.pitch = -0.05;
  hooks.fade(0.35);
  if (c.onEnter) setTimeout(c.onEnter, 600);
  hooks.updateVitals();
}
export function leaveCave() {
  const c = CAVES[G.area]; if (!c) return;
  const m = c.mouth;
  G.area = 'out'; G.exposureTarget = 1.05;
  P.x = m.x + m.ox * 2.2; P.z = m.z + m.oz * 2.2; P.yaw = Math.atan2(m.ox, m.oz); P.pitch = 0;
  hooks.glare();
  once('glare', 'Mind the eyes. Out of the dark and the light just erases everything.', ['P', CH1 + ': his eyes are sensitive']);
  hooks.updateVitals();
}
// keep a point inside the rock: find the nearest stretch of passage, and hold it within the walls
export function caveConstrain(c, x, z, r) {
  let best = null, bd = 1e9;
  for (const s of c.all) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
  const lx = (x - best.x) * best.nx + (z - best.z) * best.nz, lim = Math.max(0.15, best.w * 0.82 - r);
  let nx = x, nz = z;
  if (Math.abs(lx) > lim) { const k = Math.sign(lx) * lim - lx; nx += best.nx * k; nz += best.nz * k; }
  return { x: nx, z: nz, s: best };
}
export function caveFloor(c, x, z) { const s = caveConstrain(c, x, z, 0).s; return { floor: s.floor, ceil: s.floor + s.h * (1 - Math.abs(((x - s.x) * s.nx + (z - s.z) * s.nz) / (s.w || 1)) * 0.5) }; }

// every frame inside: webs, jaw-jaws, the Truth-Rot's glow, the way out
let caveTime = 0;
export function updateCave(dt) {
  const c = CAVES[G.area]; if (!c) return;
  caveTime += dt;
  for (const f of c.fx) f(dt, caveTime);
  for (const r of c.rot) { r.flare = Math.max(0, r.flare - dt * 0.5); const k = 1.1 + Math.sin(caveTime * 1.3) * 0.15 + r.flare * 2.5; r.m.material.emissiveIntensity = k; if (r.pl) r.pl.intensity = 5 * k; }
  // Tunnel-Webs: blunder through and get bitten; go slowly and brush them aside
  for (const w of c.webs) {
    if (w.torn) continue;
    const dx = P.x - w.x, dz = P.z - w.z, along = dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw), across = dx * Math.cos(w.yaw) - dz * Math.sin(w.yaw);
    if (Math.abs(along) < 0.35 && Math.abs(across) < w.w / 2) {
      w.torn = true; w.g.visible = false; meet('webs');
      if (P.speed > 1.4) { hooks.hurt(10, 'bite'); S.stress = Math.min(100, S.stress + 15); hooks.sfx.hiss(); bark('Tunnel-web. Ran straight into it, and something bit. Slow, you idiot.', ['P', FARM]); }
      else bark('Tunnel-web across the passage. Brushed it aside, slowly. The thing in it decided I wasn’t worth it.', ['P', FARM]);
    }
  }
  for (const j of c.jaws) {
    j.t += dt;
    const dp = Math.hypot(j.x - P.x, j.z - P.z);
    if (dp < 2.5) { const a = Math.atan2(j.x - P.x, j.z - P.z); j.target = caveConstrain(c, j.x + Math.sin(a) * 3, j.z + Math.cos(a) * 3, 0.2); if (Math.random() < dt) hooks.sfx.hiss(); meet('jaws'); }
    else if (!j.target && Math.random() < dt * 0.3) j.target = caveConstrain(c, j.home.x + (Math.random() - 0.5) * 2, j.home.z + (Math.random() - 0.5) * 2, 0.2);
    if (j.target) { const dx = j.target.x - j.x, dz = j.target.z - j.z, L = Math.hypot(dx, dz); if (L < 0.1) j.target = null; else { j.yaw = Math.atan2(dx, dz); j.x += dx / L * dt * 2; j.z += dz / L * dt * 2; } }
    j.g.position.set(j.x, j.floor, j.z); j.g.rotation.y = j.yaw;
  }
  // out through the mouth
  if (P.z > 0.9) leaveCave();
}
