// ============================================================
// The air over the road, and what it carries: a wind that gusts and
// veers, dust that lifts off the ground when it does, the dust the
// tractor's wheels throw and the tracks they leave, Jacob's footprints,
// motes adrift in the light, smoke from the stacks and the wrecks,
// spray from the burst mains, and now and then a willy-willy walking
// across the plain.
//
// Soft particles are the yard's shared pools (one draw call each).
// ============================================================
import { THREE, clamp, smooth, G, S, W, M, SWAY, once } from './core.js';
import { h, saltAt, nearestRoad, inCanyon } from './land.js';
import { Particles } from '../shared/particles.js';
import { POSTU, POST_GLSL } from '../shared/post.js';

// which way the wind blows (unit x, z), how hard the gust is right now (0 to 1), and its speed over the ground
export const WIND = { x: -1, z: 0, gust: 0.3, speed: 1.6, t: 0 };
export const FX = { dust: null, smoke: null, sparks: null, water: null };
export const scaleU = [];      // every point sprite whose size is set in pixels per metre at one metre (detail.js adds its glints)
export function setParticleScale(sc) { for (const u of scaleU) u.value = sc; }

// a soft, slightly lumpy puff, and a hard little spark
function puffTexture() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  const blob = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, N, N); };
  blob(64, 64, 62, 0.55);
  for (let k = 0; k < 9; k++) { const a = k * 2.39996, r = 18 + (k * 7) % 16; blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 26 + (k * 5) % 14, 0.22); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sparkTexture() {
  const N = 64, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.85)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- marks on the ground: wheel tracks and footprints, fading as the wind fills them in ----------
class Marks {
  constructor(max, life) {
    this.max = max; this.i = 0; this.life = life;
    this.pos = new Float32Array(max * 12).fill(-999); this.birth = new Float32Array(max * 4).fill(-1e6);
    const idx = new Uint32Array(max * 6);
    for (let q = 0; q < max; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = this.mat = new THREE.MeshBasicMaterial({ color: 0x1c0d06, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const U = this.u = { uNow: { value: 0 }, uLife: { value: life } };
    mat.customProgramCacheKey = () => 'marks';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBirth; uniform float uNow; uniform float uLife; varying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = 1.0 - smoothstep(uLife * 0.35, uLife, uNow - aBirth);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
    };
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  // a quad from (ax, az)-(bx, bz) across to (cx, cz)-(dx, dz), laid on the ground
  quad(ax, az, bx, bz, cx, cz, dx, dz) {
    const q = this.i = (this.i + 1) % this.max, p = this.pos, o = q * 12, lift = 0.045;
    p[o] = ax; p[o + 1] = h(ax, az) + lift; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = h(bx, bz) + lift; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = h(cx, cz) + lift; p[o + 8] = cz; p[o + 9] = dx; p[o + 10] = h(dx, dz) + lift; p[o + 11] = dz;
    this.birth.fill(G.time, q * 4, q * 4 + 4);
    const pa = this.geo.attributes.position, ba = this.geo.attributes.aBirth;
    pa.addUpdateRange(o, 12); ba.addUpdateRange(q * 4, 4); pa.needsUpdate = true; ba.needsUpdate = true;
  }
}
let tracks = null, prints = null;
const wheelAt = [null, null];
const _a = new THREE.Vector3();

// ---------- building it ----------
let motesU = null, devil = null;
export function buildAir() {
  const puff = puffTexture(), spark = sparkTexture(), scene = G.scene;
  FX.dust = new Particles(900, puff, {});
  FX.smoke = new Particles(520, puff, {});
  FX.sparks = new Particles(260, spark, { additive: true });
  FX.water = new Particles(420, spark, {});
  for (const k in FX) { scene.add(FX[k].points); scaleU.push(FX[k].u.uScale); }
  // dust motes adrift in the light around Jacob: only ever noticed against something dark
  {
    const n = 420, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([(Math.random() - 0.5) * 16, 0.2 + Math.random() * 3.4, (Math.random() - 0.5) * 16], i * 3); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const u = motesU = { uTime: SWAY.uTime, uCam: { value: new THREE.Vector3() }, uWind: SWAY.uWind, uScale: { value: 400 }, uAmt: { value: 1 }, ...POSTU };
    const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform vec3 uWind; uniform float uScale; varying float vA;
        void main(){ vec3 p = position; float sp = uTime * (0.35 + aSeed * 0.3) * (0.6 + uWind.z * 1.6);
          p.x += uWind.x * sp + sin(uTime * 0.3 + aSeed * 30.0) * 0.4; p.z += uWind.y * sp + cos(uTime * 0.23 + aSeed * 21.0) * 0.4; p.y += sin(uTime * 0.5 + aSeed * 17.0) * 0.15;
          p.xz = mod(p.xz - uCam.xz + 8.0, 16.0) - 8.0 + uCam.xz; p.y += uCam.y - 1.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = (0.35 + 0.65 * fract(aSeed * 7.3)) * smoothstep(10.0, 2.0, -mv.z) * smoothstep(0.3, 1.0, -mv.z);
          gl_PointSize = max(1.0, 0.012 * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: POST_GLSL + `uniform float uAmt; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(postAdd(vec3(1.0, 0.86, 0.66) * (smoothstep(0.5, 0.0, d) * vA * 0.5 * uAmt)), 1.0); }` });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 4; scene.add(pts);
    scaleU.push(u.uScale);
  }
  tracks = new Marks(900, 150); prints = new Marks(160, 90);
  scene.add(tracks.mesh, prints.mesh);
  devil = { on: false, x: 0, z: 0, t: 0, in: 25, a: 0, seen: false };
}

// ---------- what other parts of the road can ask for ----------
const RED = [0.74, 0.44, 0.31], PALE = [0.9, 0.87, 0.8], GREY = [0.5, 0.47, 0.45];
export const dustColour = (x, z) => saltAt(x, z) > 0.4 ? PALE : RED;
// a burst of dust at a spot on the ground: something landed, kicked off or blinked
export function dustKick(x, z, n = 8, { size = 0.5, spread = 1.6, colour = null, up = 1.2, alpha = 0.3, y = null } = {}) {
  if (!FX.dust) return;
  const col = colour || dustColour(x, z), gy = y ?? h(x, z);
  for (let k = 0; k < n; k++) FX.dust.emit(x + (Math.random() - 0.5) * 0.5, gy + 0.1 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.5,
    { vx: (Math.random() - 0.5) * spread + WIND.x * 0.6, vy: 0.3 + Math.random() * up, vz: (Math.random() - 0.5) * spread + WIND.z * 0.6, life: 1.4 + Math.random() * 1.6, size: size * 0.5, size1: size * (2.2 + Math.random() * 1.5), alpha: alpha * (0.6 + Math.random() * 0.5), color: col, drag: 1.4, grav: 0.15 });
}
export function sparkBurst(x, y, z, n = 14, { colour = [0.85, 0.93, 1], speed = 3, life = 0.5 } = {}) {
  if (!FX.sparks) return;
  for (let k = 0; k < n; k++) FX.sparks.emit(x, y, z, { vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed, vz: (Math.random() - 0.5) * speed, life: life * (0.5 + Math.random()), size: 0.05 + Math.random() * 0.05, alpha: 1, color: colour, drag: 0.6, grav: 9 });
}
export function splash(x, y, z, n = 16, power = 1) {
  if (!FX.water) return;
  for (let k = 0; k < n; k++) FX.water.emit(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, { vx: (Math.random() - 0.5) * 2.4 * power, vy: (1.2 + Math.random() * 2.4) * power, vz: (Math.random() - 0.5) * 2.4 * power, life: 0.5 + Math.random() * 0.5, size: 0.03 + Math.random() * 0.04, alpha: 0.75, color: [0.82, 0.9, 0.95], drag: 0.4, grav: 9.8 });
}
// a footfall: a little dust, and a print left behind
let foot = 1;
export function footfall(x, z, yaw, surface, run = 0) {
  if (surface === 'boards' || surface === 'rock' || surface === 'seal') { if (surface === 'seal' && Math.random() < 0.35) dustKick(x, z, 1, { size: 0.25, spread: 0.4, up: 0.3, alpha: 0.12 }); return; }
  dustKick(x, z, run > 0.5 ? 3 : 2, { size: 0.3 + run * 0.15, spread: 0.6 + run * 0.5, up: 0.4 + run * 0.4, alpha: surface === 'salt' ? 0.14 : 0.2 });
  // the print, toe forward, a little to one side and then the other
  foot = -foot;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx, cx = x + rx * 0.1 * foot, cz = z + rz * 0.1 * foot, L = 0.15, Wd = 0.055;
  prints.quad(cx - fx * L - rx * Wd, cz - fz * L - rz * Wd, cx - fx * L + rx * Wd, cz - fz * L + rz * Wd, cx + fx * L - rx * Wd, cz + fz * L - rz * Wd, cx + fx * L + rx * Wd, cz + fz * L + rz * Wd);
}

// ---------- every frame ----------
const _fwd = new THREE.Vector3();
export function updateAir(dt, { tractor = null, driving = false, cave = false } = {}) {
  // the wind: a slow swell with gusts riding on it, veering a little either side of west-to-east
  WIND.t += dt; const t = WIND.t;
  const swell = 0.32 + 0.2 * Math.sin(t * 0.11 + 1.3) + 0.12 * Math.sin(t * 0.047), burst = Math.max(0, Math.sin(t * 0.31 + Math.sin(t * 0.07) * 2.2)) ** 3 * 0.6;
  WIND.gust = clamp(swell + burst, 0.05, 1);
  const ang = Math.PI + 0.4 * Math.sin(t * 0.021) + 0.15 * Math.sin(t * 0.13);
  WIND.x = Math.cos(ang); WIND.z = Math.sin(ang); WIND.speed = 0.8 + WIND.gust * 3.4;
  SWAY.uWind.value.set(WIND.x, WIND.z, WIND.gust);
  const cam = G.camera, scene = G.scene;
  if (motesU) { motesU.uCam.value.copy(cam.position); motesU.uAmt.value = cave ? 0 : 1; }
  if (tracks) { tracks.u.uNow.value = G.time; prints.u.uNow.value = G.time; }
  if (dt <= 0) { for (const k in FX) FX[k].update(0, scene); return; }
  if (!cave) {
    // smoke from the stacks, the trucks and the wreck's boiler
    for (const s of W.smoke) {
      if (Math.abs(s.z - cam.position.z) > 900) continue;
      if (Math.random() < dt * (s.rate || 1.2)) {
        const c = (s.mat || M.smoke).color, a = (s.mat || M.smoke).opacity, sz = s.size || 1;
        FX.smoke.emit(s.x, s.y, s.z, { vx: WIND.x * (1.0 + WIND.gust), vy: 2.0 + Math.random() * 0.6, vz: WIND.z * (1.0 + WIND.gust), life: 13 + Math.random() * 3, size: sz * 2.2, size1: sz * 17, alpha: a * 1.5, color: [c.r * 1.6, c.g * 1.6, c.b * 1.6], drag: 0.05, spread: 0.5 });
      }
    }
    // spray from the burst mains: a fan of drops, and the mist off it
    for (const s of W.sprays) {
      if (Math.hypot(s.x - cam.position.x, s.z - cam.position.z) > 150) continue;
      const boost = S.flags.valve ? 1.5 : 1;
      for (let n = Math.random() < dt * 60 * boost ? 2 : 0; n > 0; n--) FX.water.emit(s.x, s.y, s.z, { vx: s.dx * (1.8 + Math.random() * 1.6) * boost + (Math.random() - 0.5) * 0.8, vy: (2.4 + Math.random() * 1.6) * boost, vz: s.dz + (Math.random() - 0.5) * 1.4, life: 0.9 + Math.random() * 0.3, size: 0.035 + Math.random() * 0.03, alpha: 0.7, color: [0.82, 0.9, 0.95], drag: 0.2, grav: 9.8 });
      if (Math.random() < dt * 5) FX.dust.emit(s.x + s.dx * 1.2, s.y - 0.6, s.z, { vx: s.dx * 0.6 + WIND.x * 0.5, vy: 0.3, vz: WIND.z * 0.5, life: 2.2, size: 0.4, size1: 1.8, alpha: 0.1, color: [0.85, 0.9, 0.93], drag: 0.6 });
    }
    // dust lifting off the ground ahead of Jacob when it gusts
    const gusty = smooth(0.45, 0.95, WIND.gust);
    if (gusty > 0 && Math.random() < dt * gusty * 14) {
      cam.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
      const d = 6 + Math.random() * 34, side = (Math.random() - 0.5) * 2 * (10 + d * 0.7);
      const x = cam.position.x + _fwd.x * d - _fwd.z * side - WIND.x * 6, z = cam.position.z + _fwd.z * d + _fwd.x * side - WIND.z * 6;
      if (!inCanyon(x, z)) FX.dust.emit(x, h(x, z) + 0.15 + Math.random() * 0.3, z, { vx: WIND.x * WIND.speed * 1.4, vy: 0.15 + Math.random() * 0.3, vz: WIND.z * WIND.speed * 1.4, life: 3 + Math.random() * 2.5, size: 0.5, size1: 2.6 + Math.random() * 2, alpha: 0.085 + gusty * 0.07, color: dustColour(x, z), drag: 0.12, spread: 0.6 });
    }
    // the tractor: dust off the back wheels, and the tracks they leave
    if (tractor) {
      const sp = Math.abs(tractor.speed);
      for (let k = 0; k < 2; k++) {
        const s = k ? 1 : -1; _a.set(s * 0.86, 0.05, -1.02).applyMatrix4(tractor.g.matrixWorld);
        const n = nearestRoad(_a.x, _a.z, 1), sealed = n.s && n.s.route !== 'canyon' && n.d < 3.7, salt = saltAt(_a.x, _a.z) > 0.4;
        if (driving && sp > 0.8 && Math.random() < dt * sp * (sealed ? 1.6 : 5.5)) {
          FX.dust.emit(_a.x + (Math.random() - 0.5) * 0.3, _a.y + 0.15, _a.z + (Math.random() - 0.5) * 0.3, { vx: -Math.sin(tractor.yaw) * sp * 0.25 + WIND.x * 0.5 + (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.8, vz: -Math.cos(tractor.yaw) * sp * 0.25 + WIND.z * 0.5 + (Math.random() - 0.5) * 0.8,
            life: 1.8 + Math.random() * 1.6, size: 0.35, size1: 1.6 + sp * 0.28, alpha: (sealed ? 0.1 : 0.2) * (0.6 + Math.random() * 0.6), color: salt ? PALE : sealed ? GREY : RED, drag: 0.9, grav: -0.05 });
        }
        // tracks: only where there's dirt or salt to take them
        const last = wheelAt[k];
        if (!last) { wheelAt[k] = { x: _a.x, z: _a.z }; continue; }
        const dx = _a.x - last.x, dz = _a.z - last.z, L = Math.hypot(dx, dz);
        if (L > 3) { last.x = _a.x; last.z = _a.z; continue; }
        if (L > 0.5) {
          if (!sealed) { const nx = -dz / L * 0.17, nz = dx / L * 0.17; tracks.quad(last.x - nx, last.z - nz, last.x + nx, last.z + nz, _a.x - nx, _a.z - nz, _a.x + nx, _a.z + nz); }
          last.x = _a.x; last.z = _a.z;
        }
      }
    }
    updateDevil(dt);
  }
  for (const k in FX) FX[k].update(dt, scene);
}

// a willy-willy: a column of dust that walks with the wind for half a minute, some way off
function updateDevil(dt) {
  const d = devil, cam = G.camera;
  if (!d.on) {
    d.in -= dt * (0.4 + WIND.gust);
    if (d.in > 0) return;
    cam.getWorldDirection(_fwd);
    const a = Math.atan2(_fwd.x, _fwd.z) + (Math.random() - 0.5) * 1.6, r = 70 + Math.random() * 90, x = cam.position.x + Math.sin(a) * r - WIND.x * 30, z = cam.position.z + Math.cos(a) * r;
    if (inCanyon(x, z) || h(x, z) > 6 || nearestRoad(x, z, 1).d < 12 || z > 1740) { d.in = 4; return; }
    Object.assign(d, { on: true, x, z, t: 0, life: 22 + Math.random() * 14, colour: dustColour(x, z) });
  }
  d.t += dt; d.a += dt * 5.5;
  d.x += (WIND.x * 2.2 + Math.sin(d.t * 0.4) * 0.8) * dt; d.z += (WIND.z * 2.2 + Math.cos(d.t * 0.31) * 0.8) * dt;
  const k = smooth(0, 3, d.t) * (1 - smooth(d.life - 4, d.life, d.t)), gy = h(d.x, d.z);
  for (let n = Math.random() < dt * 70 * k ? 2 : 0; n > 0; n--) {
    const y = Math.random() ** 1.6 * 16, r = 0.5 + y * 0.16, a = d.a + Math.random() * 6.28;
    FX.dust.emit(d.x + Math.cos(a) * r, gy + y, d.z + Math.sin(a) * r, { vx: -Math.sin(a) * 3.2 + WIND.x * 2.2, vy: 2.4 + Math.random() * 1.5, vz: Math.cos(a) * 3.2 + WIND.z * 2.2, life: 2.2 + Math.random() * 1.4, size: 0.8 + y * 0.08, size1: 2.4 + y * 0.2, alpha: 0.13 * k, color: d.colour, drag: 0.5 });
  }
  const dist = Math.hypot(d.x - cam.position.x, d.z - cam.position.z);
  if (dist < 120 && k > 0.6 && !d.seen) { d.seen = true; once('willy', 'A willy-willy, walking across the flat with its skirts up. Just wind and dust. Out here that counts as good news.', ['X', 'weather: new on the road']); }
  if (!S.inTractor && dist < 2.5 && k > 0.5) S.stress = Math.min(100, S.stress + dt * 2);
  if (d.t > d.life || dist > 320) { d.on = false; d.in = 45 + Math.random() * 70; }
}
// for tests and curious people
export const airState = () => ({ wind: { ...WIND }, dust: FX.dust ? FX.dust.n : 0, smoke: FX.smoke ? FX.smoke.n : 0, devil: devil && devil.on ? { x: devil.x, z: devil.z } : null, tracks: tracks ? tracks.i : 0 });
