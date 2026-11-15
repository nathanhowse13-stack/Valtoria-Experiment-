// ============================================================
// Insides, and the small signs of people.
//
// The verandah house in Tally Bore, now its door opens: an iron bed
// with the mattress gone to dust, a dresser whose doors still open
// (there's a jar of fruit on the top shelf, a find), a table with one
// chair knocked over, a cold wood stove with the kettle rusted to it,
// a photograph on the back wall, a rag rug. The racked house gets a
// hat on a nail and a shelf of tins. Each roadside shack gets the ring
// of stones where its fires were. And the pipeline's leaks and burst
// mains have left puddles: dark, still, full of sky, rippling where
// the water still drips or sprays into them.
//
// All of it is new on the road (Experimental).
// ============================================================
import { THREE, TAU, rng, G, S, W, blockers, addThing, hooks, MX, planarUV, merge, mesh, M, SWAY, FINDS, NEW } from './core.js';
import { h, nearestRoad } from './land.js';
import { SITES } from './life.js';
import { sfx, spot } from './sound.js';

const X = (why) => ['X', why ? why + ': ' + NEW : NEW];
const bark = (t, p) => hooks.bark(t, p);
const R = rng(2468);

// a group in a house's own frame (x across the front, z from the back wall to the door, y up from the floor)
function frame(hs) { const g = new THREE.Group(); g.position.set(hs.x, hs.y + 0.1, hs.z); g.rotation.y = hs.yaw; G.scene.add(g); return g; }
// a box blocker for something standing in a house, worked out from its corners in the world
function blockIn(hs, lx, lz, w, d) {
  const c = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([a, b]) => hs.world(lx + a, lz + b));
  blockers.push({ x0: Math.min(...c.map(p => p.x)), z0: Math.min(...c.map(p => p.z)), x1: Math.max(...c.map(p => p.x)), z1: Math.max(...c.map(p => p.z)) });
}
// a sepia print: the house when it was whole, and people on its verandah, squinting
function photoTexture() {
  const W = 128, H = 100, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#d8c39a'); g.addColorStop(0.55, '#b89a6a'); g.addColorStop(1, '#8a6c48'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#6a5034'; x.fillRect(18, 38, 92, 40); x.fillStyle = '#4a3624'; x.beginPath(); x.moveTo(12, 40); x.lineTo(64, 22); x.lineTo(116, 40); x.closePath(); x.fill();
  x.fillStyle = '#5a4430'; x.fillRect(14, 52, 100, 4);
  for (const [px, ht] of [[34, 22], [46, 24], [58, 15], [70, 21], [84, 12]]) { x.fillStyle = '#2e2218'; x.fillRect(px, 78 - ht, 6, ht); x.beginPath(); x.arc(px + 3, 76 - ht, 3.5, 0, TAU); x.fill(); }
  x.fillStyle = 'rgba(255,240,210,0.25)'; for (let k = 0; k < 300; k++) x.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  const v = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 80); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,24,10,0.6)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- the verandah house: a bedroom-kitchen, left the way it was ----------
const DRESSER = { doors: [], open: false, t: 0 };
function furnishVerandah(hs) {
  const g = frame(hs), D = hs.D, Wd = hs.Wd;
  // the iron bed, its head against the side wall, the mattress gone to a sag of canvas and dust
  {
    const bx = -Wd / 2 + 1.05, bz = -0.75, parts = [];                                // along the side wall, clear of the chimney in the back corner
    for (const [lx, lz] of [[-0.95, -0.42], [0.95, -0.42], [-0.95, 0.42], [0.95, 0.42]]) parts.push([new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), MX(bx + lx, 0.25, bz + lz)]);
    for (const lz of [-0.42, 0.42]) parts.push([new THREE.CylinderGeometry(0.015, 0.015, 1.9, 6), MX(bx, 0.38, bz + lz, 0, 0, Math.PI / 2)]);
    for (const lx of [-0.95, 0.95]) { parts.push([new THREE.CylinderGeometry(0.015, 0.015, 0.84, 6), MX(bx + lx, 0.38, bz, Math.PI / 2, 0, 0)]); const top = lx < 0 ? 1.0 : 0.75; parts.push([new THREE.CylinderGeometry(0.015, 0.015, 0.84, 6), MX(bx + lx, top, bz, Math.PI / 2, 0, 0)]); for (let k = -2; k <= 2; k++) parts.push([new THREE.CylinderGeometry(0.009, 0.009, top - 0.38, 5), MX(bx + lx, (top + 0.38) / 2, bz + k * 0.17)]); }
    g.add(mesh(merge(parts), M.iron));
    const mat = new THREE.BoxGeometry(1.8, 0.12, 0.8, 8, 1, 4), p = mat.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - 0.07 * Math.cos(p.getX(i) / 0.9 * Math.PI / 2) * Math.cos(p.getZ(i) / 0.4 * Math.PI / 2));   // sagged in the middle
    mat.computeVertexNormals(); const mm = mesh(planarUV(mat, 0.8), M.rag); mm.position.set(bx, 0.45, bz); g.add(mm);
    blockIn(hs, bx, bz, 1.95, 0.9);
    const p0 = hs.world(bx, bz);
    addThing({ id: 'tally:bed', name: 'An iron bed', verb: 'Look', x: p0.x, y: hs.y + 0.6, z: p0.z, r: 1.4, prov: X('Tally Bore'), use: () => bark('An iron bed, the mattress gone to a sag of canvas and red dust. Two dents in it, side by side. I’m not going to lie down in them.', X('Tally Bore')) });
  }
  // the dresser on the side wall: two doors that still swing, jars and tins behind them
  {
    const dx = Wd / 2 - 0.3, dz = -0.6, body = [], wood = M.timber;
    body.push([new THREE.BoxGeometry(0.5, 1.8, 0.04), MX(dx, 0.9, dz - 0.58)], [new THREE.BoxGeometry(0.5, 1.8, 0.04), MX(dx, 0.9, dz + 0.58)], [new THREE.BoxGeometry(0.04, 1.8, 1.2), MX(dx + 0.23, 0.9, dz)]);
    for (const y of [0.05, 0.6, 1.2, 1.78]) body.push([new THREE.BoxGeometry(0.48, 0.03, 1.16), MX(dx, y, dz)]);
    g.add(mesh(planarUV(merge(body), 0.8), wood));
    // what's on the shelves: tins, a bottle, jars, one of them with something in it
    const tins = [], jars = [];
    for (let k = 0; k < 5; k++) tins.push([new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), MX(dx + 0.05 - R() * 0.1, 0.68, dz - 0.45 + k * 0.2 + R() * 0.04)]);
    for (let k = 0; k < 3; k++) jars.push([new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12), MX(dx, 0.1 + 0.08, dz - 0.3 + k * 0.28)]);
    g.add(mesh(merge(tins), M.rust)); g.add(mesh(merge(jars), new THREE.MeshStandardMaterial({ color: 0x9ab0a0, roughness: 0.1, transparent: true, opacity: 0.55 })));
    const jar = new THREE.Group(); jar.position.set(dx, 1.31, dz + 0.1); g.add(jar);
    jar.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 14), new THREE.MeshStandardMaterial({ color: 0xa8b8a8, roughness: 0.08, transparent: true, opacity: 0.5 })));
    jar.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.12, 12).translate(0, -0.02, 0), new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.5 })));
    jar.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 14).translate(0, 0.095, 0), M.rust));
    jar.visible = !S.finds['Preserving jar'];
    // the doors: hinged on the dresser's outer edges, swinging out into the room (−x)
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(dx - 0.25, 0.9, dz + s * 0.58); g.add(piv);
      const door = mesh(planarUV(new THREE.BoxGeometry(0.025, 1.74, 0.575), 0.8), wood); door.position.set(0, 0, -s * 0.29); piv.add(door);
      const knob = mesh(new THREE.SphereGeometry(0.018, 8, 6), M.iron); knob.position.set(-0.02, 0, -s * 0.52); piv.add(knob);
      DRESSER.doors.push({ piv, s });
    }
    blockIn(hs, dx, dz, 0.5, 1.2);
    const p0 = hs.world(dx - 0.4, dz), def = FINDS.find(f => f.name === 'Preserving jar');
    addThing({ id: 'tally:dresser', name: 'A dresser', verb: () => DRESSER.open ? 'Shut it' : 'Open it', x: p0.x, y: hs.y + 1.0, z: p0.z, r: 1.3, prov: X('Tally Bore'), use: () => {
      DRESSER.open = !DRESSER.open; sfx.hinge(spot(p0.x, p0.z, 6));
      if (DRESSER.open && !S.flags.dresser) { S.flags.dresser = true; setTimeout(() => bark('Tins with the labels gone, a bottle of something that used to be vinegar, empty jars. And one that isn’t.', X('Tally Bore')), 500); }
    } });
    const jp = hs.world(dx, dz + 0.1);
    addThing({ id: 'relic:Preserving jar', name: 'A jar with something in it', verb: 'Take it', x: jp.x, y: hs.y + 1.4, z: jp.z, r: 1.2, prov: ['X', 'a find: ' + NEW], enabled: () => DRESSER.open && DRESSER.t > 0.6 && !S.finds['Preserving jar'], use: () => { jar.visible = false; hooks.found(def); } });
  }
  // a table, one chair at it and one on its back
  {
    const tx = 0.9, tz = 0.1, parts = [];
    parts.push([new THREE.BoxGeometry(1.2, 0.05, 0.8), MX(tx, 0.76, tz)]);
    for (const [a, b] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) parts.push([new THREE.BoxGeometry(0.05, 0.74, 0.05), MX(tx + a, 0.37, tz + b)]);
    const chair = (cx, cz, ry, down) => {
      const c = [[new THREE.BoxGeometry(0.42, 0.04, 0.42), MX(0, 0.45, 0)], [new THREE.BoxGeometry(0.42, 0.5, 0.04), MX(0, 0.72, -0.19)]];
      for (const [a, b] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) c.push([new THREE.BoxGeometry(0.035, 0.45, 0.035), MX(a, 0.225, b)]);
      const m = mesh(planarUV(merge(c), 0.6), M.timber); m.position.set(cx, down ? 0.21 : 0, cz); m.rotation.set(down ? -Math.PI / 2 : 0, ry, 0, 'YXZ'); g.add(m);
    };
    g.add(mesh(planarUV(merge(parts), 0.8), M.timber));
    chair(tx - 0.3, tz + 0.65, Math.PI + 0.2, false); chair(tx + 0.75, tz - 0.9, 1.1, true);
    blockIn(hs, tx, tz, 1.25, 0.85);
    const p0 = hs.world(tx, tz);
    addThing({ id: 'tally:table', name: 'The table', verb: 'Look', x: p0.x, y: hs.y + 0.9, z: p0.z, r: 1.3, prov: X('Tally Bore'), use: () => bark('Two places, two cups, a ring in the dust where a third thing stood. One chair pushed back neat, one knocked over. Somebody got up in a hurry.', X('Tally Bore')) });
  }
  // the wood stove in the back corner, its flue up through the roof, the kettle rusted to the plate
  {
    const sx = Wd / 2 - 0.55, sz = -D / 2 + 0.5, parts = [[new THREE.BoxGeometry(0.62, 0.7, 0.5), MX(sx, 0.35, sz)], [new THREE.CylinderGeometry(0.065, 0.065, 2.6, 10), MX(sx + 0.15, 2.0, sz - 0.05)]];
    g.add(mesh(planarUV(merge(parts), 0.6), M.iron));
    const kettle = mesh(new THREE.SphereGeometry(0.11, 12, 8).scale(1, 0.75, 1), M.rust); kettle.position.set(sx - 0.1, 0.78, sz + 0.05); g.add(kettle);
    blockIn(hs, sx, sz, 0.65, 0.55);
    const p0 = hs.world(sx, sz);
    addThing({ id: 'tally:stove', name: 'A wood stove', verb: 'Look', x: p0.x, y: hs.y + 0.8, z: p0.z, r: 1.2, prov: X('Tally Bore'), use: () => { sfx.knock(spot(p0.x, p0.z, 6)); bark('Cold. Somebody’s last fire, a long time ago. The kettle’s rusted to the plate. Even out here people boiled the water first.', X('Tally Bore')); } });
  }
  // a photograph on the back wall, and a rag rug on the boards
  {
    const ph = mesh(new THREE.BoxGeometry(0.34, 0.27, 0.02), M.timber, { cast: false }); ph.position.set(-0.3, 1.55, -D / 2 + 0.08); g.add(ph);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.21), new THREE.MeshStandardMaterial({ map: photoTexture(), roughness: 0.6 })); pic.position.set(-0.3, 1.55, -D / 2 + 0.092); g.add(pic);
    const rug = mesh(new THREE.PlaneGeometry(1.7, 1.05).rotateX(-Math.PI / 2), M.rag, { cast: false }); rug.position.set(-0.4, 0.012, 0.6); rug.rotation.y = 0.08; g.add(rug);
    const p0 = hs.world(-0.3, -D / 2 + 0.3);
    addThing({ id: 'tally:photo', name: 'A photograph', verb: 'Look', x: p0.x, y: hs.y + 1.55, z: p0.z, r: 1.2, prov: X('Tally Bore'), use: () => bark('This house, when it was painted and the verandah was straight. Five of them on it, squinting into the sun, the smallest held up to be in the picture. I don’t know any of them. I look anyway.', X('Tally Bore')) });
  }
}
// ---------- the racked house: a hat on a nail by the door, a shelf of tins ----------
function furnishRacked(hs) {
  const g = frame(hs), D = hs.D, Wd = hs.Wd, sh = (y) => 0.17 * y;      // its walls lean, so what hangs on them leans with them
  const hx = -1.5 + sh(1.75), hz = D / 2 - 0.12;
  const hat = new THREE.Group(); hat.position.set(hx, 1.65, hz - 0.08); hat.rotation.set(-1.2, 0, 0.15); g.add(hat);
  const felt = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  hat.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.012, 20), felt), mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.11, 16).translate(0, 0.06, 0), felt));
  const p0 = hs.world(hx, hz - 0.3);
  addThing({ id: 'tally:hat', name: 'A hat on a nail', verb: 'Look', x: p0.x, y: hs.y + 1.6, z: p0.z, r: 1.1, prov: X('Tally Bore'), use: () => bark('A felt hat on a nail by the door, the brim chewed. Nobody walks into the Waste without a hat. Too small for me anyway, and it’s somebody’s.', X('Tally Bore')) });
  // a shelf on the side wall, tins and a lamp chimney on it
  const sy = 1.35, parts = [[new THREE.BoxGeometry(0.22, 0.03, 1.4), MX(-Wd / 2 + 0.17 + sh(sy), sy, -0.8)]], tins = [];
  for (let k = 0; k < 6; k++) tins.push([new THREE.CylinderGeometry(0.04, 0.04, 0.11 + R() * 0.05, 10), MX(-Wd / 2 + 0.17 + sh(sy + 0.07), sy + 0.08, -1.4 + k * 0.22)]);
  g.add(mesh(planarUV(merge(parts), 0.6), M.timber), mesh(merge(tins), M.rust));
}
// ---------- the roadside shacks: where the fires were ----------
const FIRE_LINES = { shack1: 'Cold ash in a ring of stones, and a billy blacked to the handle. Somebody sat here at night and kept the dark off with a fire. It didn’t keep everything off.', shack2: 'The Pipewright’s fire ring. Ash, a burnt tally stick, a tin plate licked clean by something that wasn’t a person.', shack3: 'A ring of stones and a little heap of ash, and drawn in the dirt beside it with a stick, a sun with a face. The wind hasn’t got to it yet.' };
function fireRings() {
  for (const s of SITES.shacks) {
    const n = nearestRoad(s.x, s.z), facing = s.x > (n.s ? n.s.x : 0) ? -Math.PI / 2 : Math.PI / 2;
    const fx = s.x + Math.sin(facing) * 5.2 + Math.cos(facing) * 2.2, fz = s.z + Math.cos(facing) * 5.2 - Math.sin(facing) * 2.2, y = h(fx, fz);
    const stones = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, r = 0.55 + R() * 0.06; stones.push([new THREE.DodecahedronGeometry(0.09 + R() * 0.04, 0), MX(fx + Math.cos(a) * r, y + 0.04, fz + Math.sin(a) * r, R() * 3, R() * 3, R() * 3, 1, 0.7, 1)]); }
    G.scene.add(mesh(merge(stones), M.rock));
    const ash = mesh(new THREE.CircleGeometry(0.46, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 }), { cast: false }); ash.position.set(fx, y + 0.03, fz); G.scene.add(ash);
    const billy = mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.6, metalness: 0.5 })); billy.position.set(fx + 0.15, y + 0.1, fz - 0.1); G.scene.add(billy);
    addThing({ id: s.id + ':fire', name: 'A fire ring', verb: 'Look', x: fx, y: y + 0.4, z: fz, r: 1.5, prov: X('roadside ruins'), use: () => bark(FIRE_LINES[s.id] || FIRE_LINES.shack1, X('roadside ruins')) });
  }
}

// ---------- puddles where the pipeline leaks: dark, still, full of sky, rippling where it drips ----------
const PU = { uTime: SWAY.uTime };
// drops: how many land at once, how far from the middle they fall, how often (per second each)
function puddleMaterial(drops, spread, rate) {
  const m = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 0.05, metalness: 0.0, envMapIntensity: 1.1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, PU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPuv; varying vec2 vPw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuv = uv * 2.0 - 1.0; vPw = (modelMatrix * vec4(position, 1.0)).xz - modelMatrix[3].xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uTime; varying vec2 vPuv; varying vec2 vPw;`)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        float pr = length(vPuv), pa = atan(vPuv.y, vPuv.x), edge = 0.8 + 0.1 * sin(pa * 5.0 + 1.3) + 0.06 * sin(pa * 11.0);
        diffuseColor.a *= 1.0 - smoothstep(edge - 0.2, edge, pr);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // each drop a ring a few centimetres apart, spreading out and dying away; a shiver from the wind over the rest
          vec2 dsum = vec2(sin(vPw.x * 9.0 + uTime * 1.7) + sin(vPw.y * 11.0 - uTime * 1.3), cos(vPw.y * 8.0 + uTime * 1.1)) * 0.012;
          for (int i = 0; i < ${drops}; i++) {
            float fi = float(i), cyc = uTime * ${rate.toFixed(2)} + fi * 0.618, id = floor(cyc), age = fract(cyc);
            vec2 c = (vec2(fract(sin(id * 12.9898 + fi * 78.233) * 43758.5453), fract(sin(id * 39.346 + fi * 11.135) * 24634.6345)) - 0.5) * ${(spread * 2).toFixed(2)};
            vec2 dv = vPw - c; float d = length(dv), front = age * 0.45;
            float wave = sin((d - front) * 80.0) * exp(-age * 3.0) * smoothstep(front + 0.06, front, d) * smoothstep(front - 0.3, front, d);
            dsum += dv / max(d, 1e-3) * wave * 0.35;
          }
          normal = normalize(normal + mat3(viewMatrix) * vec3(dsum.x, 0.0, dsum.y));
        }`);
  };
  m.customProgramCacheKey = () => 'puddle-' + drops + '-' + spread + '-' + rate;
  return m;
}
function puddles() {
  const drip = puddleMaterial(1, 0.15, 0.7), burst = puddleMaterial(4, 1.4, 1.3);       // a slow drip from a seam; the spray from a burst main landing all over
  for (const l of W.leaks || []) {
    const big = !!l.name, r = big ? 2.6 : 1.3 + R() * 0.5, x = l.x + (R() - 0.5) * 0.6, z = l.z + (R() - 0.5) * 0.6;
    const p = mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), big ? burst : drip, { cast: false }); p.position.set(x, h(x, z) + 0.04, z); p.rotation.y = R() * TAU; p.renderOrder = 1; G.scene.add(p);
  }
}

export function buildRooms() {
  const hs = W.houses || [];
  const ver = hs.find(q => q.kind === 'verandah'), racked = hs.find(q => q.kind === 'racked');
  if (ver) furnishVerandah(ver);
  if (racked) furnishRacked(racked);
  fireRings(); puddles();
}
export function updateRooms(dt) {
  DRESSER.t += ((DRESSER.open ? 1 : 0) - DRESSER.t) * Math.min(1, dt * 3.5);
  for (const d of DRESSER.doors) d.piv.rotation.y = d.s * DRESSER.t * 1.7;          // out into the room
}
