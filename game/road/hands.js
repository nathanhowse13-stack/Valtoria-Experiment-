// ============================================================
// Jacob's hand on the road, drawn over the scene through the post
// chain's view-model pass (as the yard draws his hand and the rebar).
// Chapter One has it "as pale as marble, without an ounce of softness",
// the nails thick and stained with red dust and engine grease.
//
// It only shows when it's doing something:
//   throw  picks a stone up, cocks it back, and lets go at the top of
//          the swing (the stone leaves his hand on that frame)
//   reach  goes out to whatever he's using, closes, comes back
//   drink  brings the water bag up, tips it, lowers it
// Each action is a few keyframes of the forearm's place and turn and
// how far each finger is curled, eased from one to the next; the whole
// arm lags a little behind the head and bobs with the stride.
// ============================================================
import { THREE, clamp, lerp, rng, T } from './core.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const smoothT = (t) => t * t * (3 - 2 * t);
// a rod with rounded ends from a to b, radius r0 at a and r1 at b
function bone(a, b, r0, r1 = r0, seg = 10) {
  const len = a.distanceTo(b), pts = [];
  for (let i = 0; i <= 4; i++) { const t = -Math.PI / 2 + (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-5, Math.cos(t) * r0), Math.sin(t) * r0)); }
  for (let i = 0; i <= 4; i++) { const t = (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-5, Math.cos(t) * r1), len + Math.sin(t) * r1)); }
  const g = new THREE.LatheGeometry(pts, seg), d = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d)); g.translate(a.x, a.y, a.z);
  return g;
}
// a box with rounded edges and true normals: the back of the hand
function roundBox(hx, hy, hz, r, seg = 5) {
  const g = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = v3(0, 0, 0), c = v3(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx + r, hx - r), clamp(v.y, -hy + r, hy - r), clamp(v.z, -hz + r, hz - r));
    v.sub(c).normalize(); p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
// pale skin, faint blue veins, red dust and grease worked into the creases
function skinTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), R = rng(5511);
  x.fillStyle = '#e2e3e4'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 1800; k++) { x.fillStyle = `rgba(${R() < 0.5 ? '205,200,205' : '248,244,238'},${0.12 + R() * 0.2})`; x.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
  x.strokeStyle = 'rgba(130,146,170,0.2)'; x.lineWidth = 1.1;
  for (let k = 0; k < 12; k++) { x.beginPath(); let px = R() * S, py = 0; x.moveTo(px, py); for (let s = 0; s < 16; s++) { px += (R() - 0.5) * 10; py += S / 16; x.lineTo(px, py); } x.stroke(); }
  for (let k = 0; k < 60; k++) { x.strokeStyle = `rgba(150,70,40,${0.1 + R() * 0.25})`; x.lineWidth = 0.6 + R() * 0.9; const px = R() * S, py = R() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 18, py + (R() - 0.5) * 3); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export const HANDS = { scene: null, camera: null, active: false, freeze: null, A: null };
const A = { act: null, t: 0, dur: 1, release: null, released: false, lagX: 0, lagY: 0, lastYaw: null, lastPitch: 0 };
HANDS.A = A;                        // for tests
let arm, wrist, fingers = [], thumb = [], stone, bag, key, hemi, fill;

// ---------- building the arm ----------
export function buildHands() {
  const scene = HANDS.scene = new THREE.Scene();
  HANDS.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  hemi = new THREE.HemisphereLight(0xb8c0d8, 0x8a4426, 0.8); key = new THREE.DirectionalLight(0xffe0b4, 2.4);
  fill = new THREE.DirectionalLight(0xfff0e0, 0.8); fill.position.set(0.4, 0.5, 1);                 // light off his own face and chest, so a hand against the sun isn't a silhouette
  scene.add(hemi, key, key.target, fill, fill.target);
  const skin = new THREE.MeshStandardMaterial({ map: skinTexture(), color: 0xc6c2c0, roughness: 0.55, envMapIntensity: 0.3 });
  const nail = new THREE.MeshStandardMaterial({ color: 0x3e2218, roughness: 0.35 });
  const sleeve = new THREE.MeshStandardMaterial({ map: T.canvas ? T.canvas.c : null, color: 0x8a6e50, roughness: 0.96, side: THREE.DoubleSide });
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.frustumCulled = false; return o; };
  arm = new THREE.Group(); scene.add(arm);
  // the forearm runs back towards the elbow (+z), the sleeve rolled to just short of the wrist
  arm.add(mk(bone(v3(0, 0, 0.0), v3(0, -0.016, 0.42), 0.026, 0.038, 12), skin));
  const sl = new THREE.CylinderGeometry(0.044, 0.052, 0.38, 14, 1, true); sl.rotateX(Math.PI / 2); sl.translate(0, -0.011, 0.27);   // long enough that the elbow is always off the bottom of the screen
  arm.add(mk(sl, sleeve));
  const cuff = new THREE.TorusGeometry(0.045, 0.011, 8, 18); cuff.translate(0, -0.006, 0.083);
  arm.add(mk(cuff, sleeve));
  // the hand hangs off the wrist; fingers point down −z, the back of the hand is +y, the thumb's on the −x side
  wrist = new THREE.Group(); arm.add(wrist);
  wrist.add(mk(roundBox(0.04, 0.013, 0.047, 0.011).translate(0.002, 0, -0.048), skin));
  wrist.add(mk(bone(v3(0, -0.004, 0.006), v3(0.002, -0.002, -0.02), 0.024, 0.03, 12), skin));     // the heel of the hand, into the wrist
  const F = [[-0.028, [0.04, 0.025, 0.019], 0.0092], [-0.009, [0.044, 0.028, 0.02], 0.0096], [0.01, [0.041, 0.026, 0.019], 0.0091], [0.027, [0.032, 0.02, 0.017], 0.0082]];
  for (const [fx, L, r] of F) {
    const segs = []; let parent = wrist, at = v3(fx, 0.001, -0.09);
    L.forEach((len, k) => {
      const j = new THREE.Group(); j.position.copy(at); parent.add(j);
      const rr = r * (1 - k * 0.1);
      j.add(mk(bone(v3(0, 0, 0), v3(0, 0, -len), rr, rr * 0.92, 9), skin));
      if (k === 2) { const n = mk(new THREE.SphereGeometry(1, 10, 6), nail); n.scale.set(rr * 0.85, rr * 0.35, rr * 1.1); n.position.set(0, rr * 0.62, -len * 0.75); j.add(n); }
      segs.push(j); parent = j; at = v3(0, 0, -len);
    });
    fingers.push(segs);
  }
  { // the thumb: off the side of the palm, angled forward and in
    let parent = wrist, at = v3(-0.036, -0.008, -0.03);
    [[0.034, 0.012], [0.027, 0.0105]].forEach(([len, r], k) => {
      const j = new THREE.Group(); j.position.copy(at); if (k === 0) { j.rotation.set(-0.2, 0.75, 0.35); } parent.add(j);
      j.add(mk(bone(v3(0, 0, 0), v3(0, 0, -len), r, r * 0.9, 9), skin));
      if (k === 1) { const n = mk(new THREE.SphereGeometry(1, 10, 6), nail); n.scale.set(r * 0.85, r * 0.35, r * 1.1); n.position.set(0, r * 0.6, -len * 0.72); j.add(n); }
      thumb.push(j); parent = j; at = v3(0, 0, -len);
    });
  }
  // what the hand might hold: a stone (for throwing) and the canvas water bag
  stone = mk(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshStandardMaterial({ color: 0x8a4a32, roughness: 0.85, flatShading: true }));
  stone.scale.set(1, 0.78, 1.15); stone.position.set(0.0, -0.032, -0.085); wrist.add(stone);
  bag = new THREE.Group(); wrist.add(bag); bag.position.set(0, -0.06, -0.06);
  const bagBody = new THREE.SphereGeometry(0.075, 16, 12); bagBody.scale(1, 1.25, 0.7);
  bag.add(mk(bagBody, new THREE.MeshStandardMaterial({ map: T.canvas ? T.canvas.c : null, color: 0x9a8a6a, roughness: 0.95 })));
  const neck = mk(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.7 })); neck.position.y = 0.11; bag.add(neck);
  const cap = mk(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 10), new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.4, metalness: 0.7 })); cap.position.y = 0.14; bag.add(cap);
  arm.visible = false;
  return HANDS;
}

// ---------- the actions: keyframes of where the arm is, how it's turned, and how curled the fingers are ----------
// pos is the wrist in view space (camera at the origin looking down −z), rot is the forearm's pitch, yaw and roll,
// curl is [fingers, thumb] from 0 (open) to 1 (a fist); hold is what's in the hand
const ACTS = {
  throw: { dur: 0.72, release: 0.44, hold: 'stone', keys: [
    [0.0, { pos: [0.3, -0.48, -0.5], rot: [0.1, 0.45, -0.25], curl: [0.72, 0.6] }],
    [0.3, { pos: [0.3, -0.04, -0.38], rot: [1.15, 0.2, -0.55], curl: [0.72, 0.6] }],            // cocked back beside his head
    [0.44, { pos: [0.1, -0.08, -0.62], rot: [0.05, 0.3, -0.15], curl: [0.15, 0.1] }],            // and let go
    [0.7, { pos: [0.0, -0.34, -0.58], rot: [-0.55, 0.45, 0.15], curl: [0.25, 0.2] }],            // the follow-through
    [1.0, { pos: [0.08, -0.62, -0.45], rot: [-0.6, 0.5, 0.25], curl: [0.35, 0.3] }],
  ] },
  reach: { dur: 0.75, keys: [
    [0.0, { pos: [0.3, -0.5, -0.45], rot: [0.0, 0.45, -0.3], curl: [0.5, 0.4] }],
    [0.38, { pos: [0.13, -0.14, -0.6], rot: [0.12, 0.42, -0.35], curl: [0.05, 0.0] }],          // out to it, fingers open
    [0.58, { pos: [0.14, -0.15, -0.58], rot: [0.12, 0.42, -0.35], curl: [0.75, 0.6] }],         // close on it
    [1.0, { pos: [0.3, -0.52, -0.42], rot: [0.0, 0.45, -0.3], curl: [0.6, 0.45] }],
  ] },
  drink: { dur: 1.6, hold: 'bag', keys: [
    [0.0, { pos: [0.22, -0.5, -0.4], rot: [0.5, 0.3, -0.2], curl: [0.8, 0.7] }],
    [0.28, { pos: [0.08, -0.2, -0.34], rot: [1.15, 0.2, -0.15], curl: [0.8, 0.7] }],            // up to his mouth, tipped
    [0.72, { pos: [0.07, -0.18, -0.33], rot: [1.3, 0.18, -0.12], curl: [0.82, 0.7] }],
    [1.0, { pos: [0.22, -0.55, -0.4], rot: [0.5, 0.3, -0.2], curl: [0.8, 0.7] }],
  ] },
};
// start an action; false if the hand is busy with another (a throw can't be interrupted)
export function playHand(name, { release = null } = {}) {
  const def = ACTS[name]; if (!def) return false;
  if (A.act && A.act !== 'reach') return false;
  Object.assign(A, { act: name, t: 0, dur: def.dur, release, released: false });
  return true;
}
export const handsBusy = () => !!A.act;

const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _k = new THREE.Vector3(), _c = new THREE.Color();
function pose(def, u) {
  const keys = def.keys; let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1], f = smoothT(clamp((u - t0) / Math.max(1e-4, t1 - t0), 0, 1));
  const mix = (p, q) => p.map((v, k) => lerp(v, q[k], f));
  return { pos: mix(a.pos, b.pos), rot: mix(a.rot, b.rot), curl: mix(a.curl, b.curl) };
}
// every frame: run the action, sway with the head and the stride, light it the way the world is lit
export function updateHands(dt, { camera, sunDir = null, sunColor = null, sunI = 2.4, hemiSky = null, hemiGround = null, hemiI = 0.6, cave = false, bob = 0, speed = 0, firstPerson = true }) {
  if (A.act) {
    A.t += dt / A.dur;
    const def = ACTS[A.act];
    if (def.release && !A.released && A.t >= def.release) { A.released = true; if (A.release) A.release(); }
    if (A.t >= 1) A.act = null;
  }
  const fr = HANDS.freeze;
  const act = fr ? fr.act : A.act, u = fr ? fr.t : A.t;
  HANDS.active = !!act && firstPerson;
  arm.visible = HANDS.active;
  // the camera matches the world's, so the hand's perspective is right whatever the field of view
  camera.updateMatrixWorld();
  const vc = HANDS.camera; vc.fov = camera.fov; vc.aspect = camera.aspect; vc.updateProjectionMatrix();
  // lag: the arm trails a turn of the head a little, and settles
  const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10]), pitch = Math.asin(clamp(camera.matrixWorld.elements[9], -1, 1));
  if (A.lastYaw === null) { A.lastYaw = yaw; A.lastPitch = pitch; }
  const dy = Math.atan2(Math.sin(yaw - A.lastYaw), Math.cos(yaw - A.lastYaw)), dp = pitch - A.lastPitch; A.lastYaw = yaw; A.lastPitch = pitch;
  A.lagX = clamp(A.lagX + dy * 0.6, -0.06, 0.06) * Math.exp(-dt * 9); A.lagY = clamp(A.lagY - dp * 0.6, -0.05, 0.05) * Math.exp(-dt * 9);
  if (!HANDS.active) return;
  const P = pose(ACTS[act], u), amt = Math.min(1, speed / 1.5);
  arm.position.set(P.pos[0] + A.lagX + Math.sin(bob) * 0.008 * amt, P.pos[1] + A.lagY + Math.abs(Math.cos(bob)) * 0.01 * amt, P.pos[2]);
  _e.set(P.rot[0], P.rot[1], P.rot[2], 'YXZ'); arm.quaternion.setFromEuler(_e);
  // the wrist cocks with the swing; fingers curl at every joint, the last two a little less
  wrist.rotation.set(-P.rot[0] * 0.25, 0, 0);
  for (const f of fingers) { f[0].rotation.x = -P.curl[0] * 1.2; f[1].rotation.x = -P.curl[0] * 1.35; f[2].rotation.x = -P.curl[0] * 0.8; }
  thumb[0].rotation.x = -0.2 - P.curl[1] * 0.4; if (thumb[1]) thumb[1].rotation.x = -P.curl[1] * 0.9;
  const hold = ACTS[act].hold;
  stone.visible = hold === 'stone' && !(A.released || (fr && u >= (ACTS[act].release || 2)));
  bag.visible = hold === 'bag';
  // the light: the sun as the camera sees it, and the sky and the red ground bouncing back
  if (sunDir && !cave) { _k.copy(sunDir).transformDirection(camera.matrixWorldInverse); key.position.copy(_k).multiplyScalar(5); key.color.copy(sunColor || _c.set(0xffe0b4)); key.intensity = sunI * 0.85; }
  else { key.position.set(0.3, 1, 0.4); key.color.setRGB(1, 0.75, 0.5); key.intensity = cave ? 0.35 : 1.2; }
  if (hemiSky) hemi.color.copy(hemiSky); if (hemiGround) hemi.groundColor.copy(hemiGround);
  hemi.intensity = cave ? 0.3 : hemiI * 1.7; fill.intensity = cave ? 0.25 : 0.55 + 0.35 * (1 - Math.max(0, _k.z));   // more fill when the sun's in front of him
}
