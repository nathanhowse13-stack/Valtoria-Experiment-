// ============================================================
// Jacob's tractor, shared by the yard and the road. Unnamed:
// Rustbucket is the bull.
//
// A old two-cylinder farm tractor of the long-bonnet kind, its green and
// yellow long since gone to brown and rust, kept alive by salvage:
// riveted anima shielding over the engine and round the seat, a stack
// rebuilt to burn dirty and spit phosphorus, a windscreen cracked and
// half gone, no side windows, one seat, wheels rebuilt from layers of
// salvaged leather (no two alike), a radio whip on the roof, a small
// water canister with a tap, and a lidded compartment on the back.
//
// Front is +z, x across, y up, ground at y = 0. The yard turns it round
// to face north; the road drives it forward along +z.
//
//   const t = buildTractor(THREE);   scene.add(t.group);
//   t.update(dt, { running, throttle, speed })   each frame (wheels, antenna, exhaust)
//   t.setLid(open)   t.milk.visible   t.load.visible
// ============================================================

const assetURL = (path) => (window.__ASSETS && window.__ASSETS[path]) || 'assets/' + path;
const cache = new Map();

export function buildTractor(THREE, { maxAniso = 8 } = {}) {
  const loader = new THREE.TextureLoader();
  const tex = (name, srgb = true) => {
    const key = name + srgb;
    if (cache.has(key)) return cache.get(key);
    const t = loader.load(assetURL('tex/' + name + '.jpg'));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache.set(key, t); return t;
  };
  const std = (k, o = {}) => new THREE.MeshStandardMaterial({ map: tex(k + '_c'), normalMap: tex(k + '_n', false), roughness: 0.85, ...o });
  const M = {
    paint: std('ironpaint', { color: 0x7a5236, roughness: 0.8, metalness: 0.35 }),          // what was green, now brown
    paintOdd: std('ironpaint', { color: 0x5f6448, roughness: 0.8, metalness: 0.35 }),       // a side panel off another machine, still faintly green
    trim: std('ironpaint', { color: 0x9a8040, roughness: 0.75, metalness: 0.3 }),           // the last of the yellow
    rust: std('iron', { color: 0xc07a50, roughness: 0.92, metalness: 0.3 }),
    iron: std('iron', { color: 0x6a625a, roughness: 0.7, metalness: 0.6 }),
    tin: std('tin', { roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide }),
    leather: [std('leather', { color: 0xb07a4a, roughness: 0.7 }), std('leather', { color: 0x8a5a36, roughness: 0.75 }), std('leather', { color: 0xc89060, roughness: 0.65 })],   // hide off three different beasts
    stitch: new THREE.MeshStandardMaterial({ color: 0xb8a078, roughness: 0.9 }),
    canvas: std('canvas', { color: 0x8a7a62, roughness: 0.97 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1d1a19, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xb8c4bc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    crack: new THREE.LineBasicMaterial({ color: 0xf2f0e8, transparent: true, opacity: 0.7 }),
    shield: std('tin', { color: 0x9a8a5c, roughness: 0.45, metalness: 0.75, emissive: 0xb89a60, emissiveIntensity: 0.0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a40, roughness: 0.35, metalness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 0.9 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xe8e0b0, emissiveIntensity: 0.0, roughness: 0.3 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.5, metalness: 0.8 }),
  };
  // the shielding's etched glyphs, drawn once: lines that catch the light, and glow faintly when the engine runs
  {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#fff'; x.lineWidth = 2.2; x.lineCap = 'round';
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const cx = 32 + col * 64, cy = 32 + row * 64;
      x.beginPath(); x.arc(cx, cy, 14 + r() * 8, r() * 6, r() * 6 + 3.5); x.stroke();
      for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(cx + (r() - 0.5) * 40, cy + (r() - 0.5) * 40); x.lineTo(cx + (r() - 0.5) * 40, cy + (r() - 0.5) * 40); x.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    M.shield.emissiveMap = t;
  }

  // ---------- assembling: each piece placed by a matrix, then all the pieces of a material joined into one mesh ----------
  const parts = new Map();
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const MX = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(sx, sy, sz));
  const put = (mat, geo, m) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push([geo, m]); };
  const box = (mat, x0, y0, z0, x1, y1, z1, rx = 0, ry = 0, rz = 0) => put(mat, new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), MX((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, rx, ry, rz));
  const rod = (mat, a, b, r, seg = 8) => {
    const A = v3(...a), B = v3(...b), d = B.clone().sub(A), len = d.length();
    put(mat, new THREE.CylinderGeometry(r, r, 1, seg), new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize()), v3(1, len, 1)));
  };
  const rivets = (mat, pts) => { for (const p of pts) put(mat, new THREE.SphereGeometry(0.018, 6, 4), MX(...p)); };
  // textures that tile by the metre, whichever way a face points
  const planarUV = (g, tile) => {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.setXY(i, (ax > 0.6 ? p.getZ(i) : p.getX(i)) / tile, (ay > 0.6 ? p.getZ(i) : p.getY(i)) / tile); }
    return g;
  };
  const join = (list) => {
    const out = { position: [], normal: [], uv: [] };
    for (const [g, m] of list) {
      const n = (g.index ? g.toNonIndexed() : g).applyMatrix4(m);
      for (const k in out) { const a = n.attributes[k]; if (a) for (let i = 0; i < a.array.length; i++) out[k].push(a.array[i]); }
    }
    const g = new THREE.BufferGeometry();
    for (const [k, w] of [['position', 3], ['normal', 3], ['uv', 2]]) g.setAttribute(k, new THREE.Float32BufferAttribute(out[k], w));
    return g;
  };
  const group = new THREE.Group();
  const build = (into, map, tile = 0.7) => {
    for (const [mat, list] of map) {
      const g = join(list); if (mat !== M.stitch && mat !== M.wire) planarUV(g, tile);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; into.add(m);
    }
    map.clear();
  };

  // ---------- chassis, bonnet, grille: the long narrow nose of an old two-cylinder ----------
  box(M.iron, -0.16, 0.42, -0.6, 0.16, 0.66, 1.95);                       // the frame rail
  box(M.rust, -0.48, 0.3, 1.5, 0.48, 0.42, 1.75);                          // front axle beam
  box(M.paint, -0.31, 0.72, 0.2, 0.31, 1.28, 1.95);                        // bonnet sides
  put(M.paint, new THREE.CylinderGeometry(0.31, 0.31, 1.75, 16, 1, false, -Math.PI / 2, Math.PI), MX(0, 1.28, 1.075, Math.PI / 2, 0, 0));   // its rounded top
  box(M.paintOdd, 0.312, 0.78, 0.35, 0.325, 1.22, 1.15);                  // a side panel off something else, bolted on
  rivets(M.iron, [[0.33, 0.8, 0.38], [0.33, 1.2, 0.38], [0.33, 0.8, 1.12], [0.33, 1.2, 1.12]]);
  box(M.trim, -0.315, 1.27, 0.25, -0.31, 1.3, 1.9);                        // a ghost of the yellow stripe, left side only
  for (let i = 0; i < 6; i++) box(M.black, -0.322, 0.86 + i * 0.06, 1.3, -0.318, 0.88 + i * 0.06, 1.75);   // louvres
  box(M.rust, -0.33, 0.66, 1.95, 0.33, 1.45, 2.02);                        // the grille surround
  for (let i = 0; i < 9; i++) box(M.iron, -0.27 + i * 0.0675, 0.72, 2.0, -0.25 + i * 0.0675, 1.4, 2.04);
  box(M.iron, -0.05, 1.42, 1.98, 0.05, 1.6, 2.05);                         // radiator cap neck
  put(M.iron, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), MX(0, 1.62, 2.01));
  // a lamp, wired on
  put(M.rust, new THREE.CylinderGeometry(0.09, 0.07, 0.12, 12), MX(0.38, 1.25, 1.85, Math.PI / 2, 0, 0));
  rod(M.wire, [0.31, 1.24, 1.8], [0.38, 1.22, 1.82], 0.006, 4);
  // welded patches and wire binding: years of fixing
  box(M.tin, -0.33, 0.9, 0.5, -0.315, 1.1, 0.78, 0, 0, 0.04);
  rivets(M.iron, [[-0.335, 0.92, 0.52], [-0.335, 1.08, 0.52], [-0.335, 0.92, 0.76], [-0.335, 1.08, 0.76]]);
  for (let k = 0; k < 3; k++) put(M.wire, new THREE.TorusGeometry(0.33, 0.006, 4, 24), MX(0, 1.0, 0.62 + k * 0.035, 0, 0, 0, 1, 1.05, 1));

  // ---------- anima shielding: riveted plates over the engine and round the seat ----------
  const shields = [];
  for (const s of [-1, 1]) {
    box(M.shield, s * 0.34, 0.74, 0.25, s * 0.355, 1.22, 0.95);
    rivets(M.brass, [[s * 0.36, 0.76, 0.27], [s * 0.36, 1.2, 0.27], [s * 0.36, 0.76, 0.93], [s * 0.36, 1.2, 0.93], [s * 0.36, 0.98, 0.6]]);
  }
  put(M.shield, new THREE.CylinderGeometry(0.335, 0.335, 0.5, 16, 1, true, -Math.PI / 2, Math.PI), MX(0, 1.28, 0.45, Math.PI / 2, 0, 0));   // a cowl over the engine's back half

  // ---------- the rear: transmission housing, fenders, the seat and controls ----------
  box(M.paint, -0.45, 0.55, -0.75, 0.45, 1.15, 0.2);
  box(M.rust, -0.2, 0.25, -0.75, 0.2, 0.55, -0.35);
  for (const s of [-1, 1]) {
    put(M.paint, new THREE.CylinderGeometry(0.93, 0.93, 0.5, 20, 1, true, Math.PI * 0.15, Math.PI * 0.85), MX(s * 0.95, 0.8, -0.7, 0, 0, Math.PI / 2));
    box(M.tin, s * 0.98, 1.55, -0.95, s * 1.18, 1.62, -0.55, 0.3 * s, 0, 0);   // a patch welded over a rust-through
    // the kick panels where side windows would be: shielding, no glass
    box(M.shield, s * 0.5, 1.15, -1.05, s * 0.515, 1.6, -0.05);
    rivets(M.brass, [[s * 0.52, 1.17, -1.0], [s * 0.52, 1.58, -1.0], [s * 0.52, 1.17, -0.1], [s * 0.52, 1.58, -0.1]]);
  }
  rod(M.iron, [0, 1.15, -0.6], [0, 1.5, -0.55], 0.035);                    // seat post, sprung
  put(M.iron, new THREE.TorusGeometry(0.06, 0.012, 5, 10), MX(0, 1.3, -0.58, Math.PI / 2, 0, 0));
  box(M.leather[0], -0.26, 1.5, -0.8, 0.26, 1.6, -0.35);                  // the one seat
  box(M.leather[1], -0.26, 1.58, -0.85, 0.26, 1.95, -0.78, -0.12, 0, 0);
  box(M.canvas, -0.08, 1.601, -0.7, 0.12, 1.605, -0.5, 0, 0.3, 0);         // tape over the split
  rod(M.iron, [0, 1.15, 0.25], [0, 1.72, -0.12], 0.025);                   // steering column
  put(M.black, new THREE.TorusGeometry(0.2, 0.018, 6, 20), MX(0, 1.74, -0.14, 1.15, 0, 0));
  for (const [x, a] of [[0.22, 0.3], [0.3, -0.2]]) rod(M.iron, [x, 1.15, -0.2], [x + 0.05, 1.55, -0.2 + a * 0.3], 0.012);   // levers
  put(M.black, new THREE.SphereGeometry(0.03, 8, 6), MX(0.27, 1.55, -0.11)); put(M.black, new THREE.SphereGeometry(0.03, 8, 6), MX(0.35, 1.55, -0.26));

  // ---------- the cab frame: posts, a patched roof, a cracked windscreen, nothing at the sides ----------
  for (const [x, z] of [[-0.62, 0.15], [0.62, 0.15], [-0.62, -1.05], [0.62, -1.05]]) rod(M.rust, [x, 1.1, z], [x, 2.5, z], 0.035);
  rod(M.rust, [-0.62, 2.5, 0.15], [0.62, 2.5, 0.15], 0.03); rod(M.rust, [-0.62, 2.5, -1.05], [0.62, 2.5, -1.05], 0.03);
  box(M.tin, -0.78, 2.52, -1.2, 0.78, 2.55, 0.32, 0.03, 0, 0);
  box(M.paintOdd, 0.1, 2.555, -0.6, 0.55, 2.565, -0.15, 0.03, 0, 0);       // a roof patch
  rivets(M.iron, [[0.12, 2.57, -0.58], [0.53, 2.57, -0.58], [0.12, 2.57, -0.17], [0.53, 2.57, -0.17]]);
  rod(M.rust, [-0.62, 1.42, 0.15], [0.62, 1.42, 0.15], 0.025);             // the windscreen's bottom rail
  build(group, parts);
  // the windscreen: a pane with its top left corner gone, cracks spidering from a stone strike
  {
    const sh = new THREE.Shape();
    sh.moveTo(-0.6, 1.43); sh.lineTo(0.6, 1.43); sh.lineTo(0.6, 2.47); sh.lineTo(-0.05, 2.47); sh.lineTo(-0.22, 2.2); sh.lineTo(-0.38, 2.28); sh.lineTo(-0.6, 1.98); sh.closePath();
    const pane = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.glass); pane.position.z = 0.15; pane.renderOrder = 3; group.add(pane);
    const lines = [], hit = [0.25, 1.85];
    for (let k = 0; k < 9; k++) {
      let x = hit[0], y = hit[1], a = k / 9 * Math.PI * 2;
      for (let s = 0; s < 4; s++) { const nx = x + Math.cos(a) * 0.09, ny = y + Math.sin(a) * 0.09; if (Math.abs(nx) > 0.59 || ny < 1.44 || ny > 2.46) break; lines.push(x, y, 0.152, nx, ny, 0.152); x = nx; y = ny; a += (Math.sin(k * 7 + s * 3) * 0.5); }
    }
    for (const r of [0.05, 0.1]) for (let k = 0; k < 12; k++) { const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2; lines.push(hit[0] + Math.cos(a0) * r, hit[1] + Math.sin(a0) * r, 0.152, hit[0] + Math.cos(a1) * r, hit[1] + Math.sin(a1) * r, 0.152); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    group.add(new THREE.LineSegments(lg, M.crack));
  }

  // ---------- the wheels: salvaged leather, layered and riveted over the old rims, no two alike ----------
  const wheels = [];
  const wheel = (x, z, r, w, kind) => {
    const g = new THREE.Group(); g.position.set(x, r, z); group.add(g);
    const P = new Map(), add = (mat, geo, m) => { if (!P.has(mat)) P.set(mat, []); P.get(mat).push([geo, m]); };
    const rot = (a) => MX(0, 0, 0, a, 0, Math.PI / 2);
    // the rim and hub
    add(M.rust, new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 0.7, 18), MX(0, 0, 0, 0, 0, Math.PI / 2));
    add(M.iron, new THREE.CylinderGeometry(r * 0.2, r * 0.22, w * 0.9, 10), MX(0, 0, 0, 0, 0, Math.PI / 2));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(M.iron, new THREE.SphereGeometry(0.025, 6, 4), MX(w * 0.46, Math.cos(a) * r * 0.14, Math.sin(a) * r * 0.14)); }
    // the leather: bands of hide wound round the rim, each a different shade
    const layers = kind === 'thin' ? 2 : 3;
    for (let l = 0; l < layers; l++) {
      const rr = r * (0.7 + 0.1 * l), tube = (r * 0.13) * (1 - l * 0.12);
      for (const s of [-1, 0, 1]) add(M.leather[(l + (s + 1) + (kind === 'odd' ? 1 : 0)) % 3], new THREE.TorusGeometry(rr + tube * 0.6, tube, 6, 28), MX(s * w * 0.3, 0, 0, 0, Math.PI / 2, 0, 1, 1, 0.9));
    }
    // straps buckled across the tread, which is what grips
    const straps = kind === 'thin' ? 8 : 12;
    for (let k = 0; k < straps; k++) {
      const a = k / straps * Math.PI * 2 + (kind === 'odd' ? 0.13 : 0);
      add(M.leather[k % 3], new THREE.BoxGeometry(w * 1.02, 0.03, r * 0.16), MX(0, Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99, a, 0, 0));
      add(M.stitch, new THREE.BoxGeometry(w * 1.04, 0.005, 0.01), MX(0, Math.cos(a) * r * 1.015, Math.sin(a) * r * 1.015, a, 0, 0));
      if (k % 2 === 0) for (const s of [-1, 1]) add(M.brass, new THREE.SphereGeometry(0.016, 5, 4), MX(s * w * 0.42, Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0));
    }
    if (kind === 'banded') for (const s of [-0.2, 0.2]) add(M.iron, new THREE.TorusGeometry(r * 0.97, 0.015, 4, 32), MX(s * w, 0, 0, 0, Math.PI / 2, 0));   // a steel band where the leather gave out
    build(g, P, 0.4);
    wheels.push({ g, r, front: z > 0 });
  };
  wheel(-0.98, -0.7, 0.82, 0.44, 'banded');
  wheel(0.98, -0.7, 0.78, 0.4, 'odd');          // smaller than its partner: it rides a little low on the right
  wheel(-0.56, 1.62, 0.42, 0.2, 'thin');
  wheel(0.56, 1.62, 0.46, 0.22, 'odd');

  // ---------- the stack: rebuilt to burn dirty, and it spits phosphorus ----------
  const stackTip = new THREE.Vector3(0.24, 2.62, 1.15);
  rod(M.rust, [0.24, 1.4, 1.15], [0.24, 2.4, 1.15], 0.065, 10);
  put(M.iron, new THREE.CylinderGeometry(0.11, 0.07, 0.24, 10), MX(0.24, 2.5, 1.15));                       // the flared muzzle
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; rod(M.wire, [0.24 + Math.cos(a) * 0.1, 2.55, 1.15 + Math.sin(a) * 0.1], [0.24 + Math.cos(a) * 0.06, 2.72, 1.15 + Math.sin(a) * 0.06], 0.006, 4); }   // a spark cage
  put(M.brass, new THREE.TorusGeometry(0.075, 0.012, 6, 14), MX(0.24, 2.0, 1.15, Math.PI / 2, 0, 0));       // the feed ring for the phosphor
  rod(M.brass, [0.24, 2.0, 1.08], [0.33, 1.5, 0.7], 0.01, 5);
  put(M.rust, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), MX(0.33, 1.42, 0.65));                       // and the little hopper it comes from

  // ---------- the antenna: a radio whip off the roof, and the set under it ----------
  const antenna = new THREE.Group(); antenna.position.set(-0.7, 2.56, -1.12); group.add(antenna);
  {
    const A = new Map();
    A.set(M.iron, [[new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), MX(0, 0.04, 0)]]);
    A.set(M.wire, [[new THREE.CylinderGeometry(0.006, 0.01, 2.0, 5), MX(0, 1.08, 0)], [new THREE.TorusGeometry(0.035, 0.006, 4, 10), MX(0, 0.14, 0, Math.PI / 2, 0, 0)], [new THREE.TorusGeometry(0.035, 0.006, 4, 10), MX(0, 0.18, 0, Math.PI / 2, 0, 0)]]);
    A.set(M.black, [[new THREE.SphereGeometry(0.02, 6, 4), MX(0, 2.08, 0)]]);
    build(antenna, A);
  }
  box(M.iron, -0.5, 2.3, -1.0, -0.22, 2.48, -0.82);                         // the set, bolted under the roof
  put(M.brass, new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), MX(-0.3, 2.39, -0.81, Math.PI / 2, 0, 0));
  put(M.black, new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8), MX(-0.42, 2.39, -0.81, Math.PI / 2, 0, 0));
  rod(M.black, [-0.36, 2.3, -0.9], [-0.25, 1.75, -0.7], 0.006, 4);          // the handset cord
  box(M.black, -0.28, 1.68, -0.74, -0.2, 1.8, -0.66);
  const radioLamp = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), M.lamp); radioLamp.position.set(-0.36, 2.42, -0.81); group.add(radioLamp);

  // ---------- the water canister: small, strapped to the left post, with a tap ----------
  const canister = new THREE.Group(); canister.position.set(-0.78, 1.25, 0.05); group.add(canister);
  {
    const C = new Map();
    C.set(M.tin, [[new THREE.CylinderGeometry(0.12, 0.12, 0.38, 14), MX(0, 0, 0)], [new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), MX(0, 0.215, 0)]]);
    C.set(M.leather[1], [[new THREE.TorusGeometry(0.125, 0.012, 4, 16), MX(0, 0.1, 0, Math.PI / 2, 0, 0)], [new THREE.TorusGeometry(0.125, 0.012, 4, 16), MX(0, -0.1, 0, Math.PI / 2, 0, 0)]]);
    C.set(M.brass, [[new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), MX(0, -0.15, 0.13, Math.PI / 2, 0, 0)], [new THREE.BoxGeometry(0.04, 0.012, 0.012), MX(0, -0.13, 0.16)]]);
    build(canister, C, 0.3);
  }

  // ---------- the compartment on the back: a lidded box over the drawbar ----------
  box(M.rust, -0.5, 0.75, -1.95, 0.5, 0.8, -1.2);                          // floor
  box(M.paint, -0.5, 0.8, -1.95, 0.5, 1.28, -1.92); box(M.paint, -0.5, 0.8, -1.23, 0.5, 1.28, -1.2);
  box(M.paint, -0.5, 0.8, -1.95, -0.47, 1.28, -1.2); box(M.paint, 0.47, 0.8, -1.95, 0.5, 1.28, -1.2);
  box(M.shield, -0.52, 0.85, -1.97, 0.52, 1.25, -1.955);                    // shielded at the back too
  rivets(M.brass, [[-0.48, 0.88, -1.975], [0.48, 0.88, -1.975], [-0.48, 1.22, -1.975], [0.48, 1.22, -1.975]]);
  rod(M.iron, [0, 0.62, -1.2], [0, 0.62, -2.2], 0.04);                      // the drawbar under it
  build(group, parts);
  const lid = new THREE.Group(); lid.position.set(0, 1.29, -1.2); group.add(lid);
  {
    const L = new Map();
    L.set(M.paint, [[new THREE.BoxGeometry(1.04, 0.04, 0.78), MX(0, 0, -0.38)]]);
    L.set(M.iron, [[new THREE.BoxGeometry(0.16, 0.03, 0.06), MX(0, -0.02, -0.76)], [new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), MX(0, 0, 0, 0, 0, Math.PI / 2)]]);
    L.set(M.tin, [[new THREE.BoxGeometry(0.3, 0.01, 0.25), MX(0.25, 0.025, -0.45, 0, 0.2, 0)]]);
    build(lid, L);
  }
  // what rides in and on it: the milk can on the rack beside the seat, the dung bin strapped down on the lid
  const milk = new THREE.Group(); milk.position.set(0.32, 1.12, -0.95); group.add(milk);
  {
    const K = new Map();
    K.set(M.tin, [[new THREE.LatheGeometry([[0, 0], [0.14, 0], [0.15, 0.34], [0.09, 0.42], [0.09, 0.48], [0, 0.48]].map(([a, b]) => new THREE.Vector2(a, b)), 16), MX(0, 0, 0)]]);
    build(milk, K, 0.3);
  }
  const load = new THREE.Group(); load.position.set(0, 0.04, -0.38); lid.add(load);   // strapped to the lid, so it rides up with it
  {
    const D = new Map();
    D.set(M.iron, [[new THREE.CylinderGeometry(0.28, 0.25, 0.5, 14), MX(0, 0.25, 0)]]);
    D.set(M.leather[2], [[new THREE.TorusGeometry(0.29, 0.012, 4, 20), MX(0, 0.3, 0, Math.PI / 2, 0, 0)], [new THREE.BoxGeometry(0.03, 0.02, 0.8), MX(0.2, 0.01, 0)]]);
    build(load, D, 0.4);
  }

  // ---------- the exhaust: white phosphor sparks and a pale smoke, in world space ----------
  const N = 160, sp = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), i: 0 };
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: dot, color: 0xe8ffd8, size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sparks.frustumCulled = false;
  const SN = 60, sm = { pos: new Float32Array(SN * 3), life: new Float32Array(SN), i: 0 };
  const smokeGeo = new THREE.BufferGeometry(); smokeGeo.setAttribute('position', new THREE.BufferAttribute(sm.pos, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ map: dot, color: 0xd8d4c8, size: 0.9, transparent: true, opacity: 0.32, depthWrite: false }));
  smoke.frustumCulled = false;
  for (let k = 0; k < N; k++) sp.pos[k * 3 + 1] = -999;
  for (let k = 0; k < SN; k++) sm.pos[k * 3 + 1] = -999;
  const glow = new THREE.PointLight(0xe8ffd8, 0, 6, 2); glow.position.copy(stackTip); group.add(glow);
  const tipW = new THREE.Vector3();
  let spit = 0, attached = false, swayV = 0, sway = 0, lastSpeed = 0, lidOpen = 0, lidWant = 0;

  const t = {
    group, wheels, milk, load, canister, antenna, stackTip, lid, materials: M,
    running: false,
    setLid(open) { lidWant = open ? 1 : 0; },
    // a burst from the stack: on start, and when the throttle opens
    spit(n = 24) { spit += n; },
    update(dt, { running = t.running, throttle = 0, speed = 0 } = {}) {
      if (!attached && group.parent) { group.parent.add(sparks, smoke); attached = true; }
      for (const w of wheels) w.g.rotation.x += speed * dt / w.r;
      // the whip sways with the ground and with every change of speed
      const accel = (speed - lastSpeed) / Math.max(dt, 1e-3); lastSpeed = speed;
      swayV += (-sway * 40 - swayV * 3 - accel * 0.05 + (running ? Math.sin(performance.now() * 0.03) * 0.4 : 0)) * dt; sway += swayV * dt;
      antenna.rotation.x = sway * 0.15; antenna.rotation.z = Math.sin(performance.now() * 0.0017) * 0.02 * Math.min(1, Math.abs(speed));
      lidOpen += (lidWant - lidOpen) * Math.min(1, dt * 5); lid.rotation.x = -lidOpen * 1.6;
      M.shield.emissiveIntensity += ((running ? 0.12 : 0.02) - M.shield.emissiveIntensity) * Math.min(1, dt * 2);
      M.lamp.emissiveIntensity = running ? 1.5 + Math.sin(performance.now() * 0.01) * 0.3 : 0;
      if (!dt) return;
      group.updateMatrixWorld();
      tipW.copy(stackTip).applyMatrix4(group.matrixWorld);
      if (running) spit += dt * (3 + throttle * 26) * (Math.random() < 0.08 ? 6 : 1);   // a steady sputter, and now and then a cough of it
      while (spit >= 1) {
        spit -= 1;
        const k = sp.i = (sp.i + 1) % N;
        sp.pos.set([tipW.x, tipW.y, tipW.z], k * 3);
        sp.vel.set([(Math.random() - 0.5) * 1.6, 2.2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.6], k * 3);
        sp.life[k] = 0.5 + Math.random() * 0.7;
        if (Math.random() < 0.35) { const j = sm.i = (sm.i + 1) % SN; sm.pos.set([tipW.x, tipW.y + 0.1, tipW.z], j * 3); sm.life[j] = 3; }
      }
      for (let k = 0; k < N; k++) {
        if (sp.life[k] <= 0) { sp.pos[k * 3 + 1] = -999; continue; }
        sp.life[k] -= dt; sp.vel[k * 3 + 1] -= 6 * dt;
        for (let a = 0; a < 3; a++) sp.pos[k * 3 + a] += sp.vel[k * 3 + a] * dt;
      }
      for (let j = 0; j < SN; j++) { if (sm.life[j] <= 0) { sm.pos[j * 3 + 1] = -999; continue; } sm.life[j] -= dt; sm.pos[j * 3 + 1] += dt * 1.1; sm.pos[j * 3] += dt * 0.5; }
      sparkGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.position.needsUpdate = true;
      glow.intensity = running ? 0.6 + throttle * 1.6 + (Math.random() < 0.1 ? 1.5 : 0) : 0;
    },
  };
  return t;
}
