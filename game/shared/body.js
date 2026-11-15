// ============================================================
// Jacob himself: tan work pants and heavy buckled boots you see
// when you look down, a shadow-only stand-in for the rest of him
// (duster, arms, head). Shared by the yard and the road.
//
//   const body = buildBody({ pants, boot });   scene.add(body.root);
//   body.update(dt, { x, z, vx, vz, bob }, viewYaw, { sprint, groundY });
//
// Its yaw runs the yard's way: yaw 0 looks down −z. The road, which
// looks down +z at yaw 0, hands in its yaw plus π.
// ============================================================
import * as THREE from '../yard/vendor/three.module.js';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lathe = (points, seg = 22) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
export const LEG = { thigh: 0.45, shin: 0.43, ankle: 0.1, spread: 0.1, back: 0.18 };
LEG.hip = LEG.ankle + LEG.shin + LEG.thigh;

function remapV(g, a, b) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, a + (b - a) * uv.getY(i)); return g; }
// shape a box into a boot's foot: rounded toe in front (-z), rounded heel behind, the top sloping down to the toe
function footShape(g, toeLen = 0.205, heelLen = 0.075, topSlope = true) {
  g.translate(0, 0, (heelLen - toeLen) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const toe = clamp((-z - (toeLen - 0.1)) / 0.1, 0, 1), heel = clamp((z - (heelLen - 0.035)) / 0.035, 0, 1);
    x *= Math.sqrt(Math.max(0.04, 1 - toe * toe * 0.9)) * (1 - heel * heel * 0.32) * (1 + 0.06 * (1 - toe) * (z < 0 ? 1 : 0));
    if (topSlope && y > 0) y -= toe * toe * 0.04 + Math.max(0, -z) * 0.11;
    if (toe > 0.85) z += (1 - Math.abs(y) / 0.05) * 0.0 + (y > 0 ? 0.006 : 0);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildBody(TB) {
  const mat = {
    pants: new THREE.MeshStandardMaterial({ map: TB.pants, roughness: 0.93 }),
    boot: new THREE.MeshStandardMaterial({ map: TB.boot, roughness: 0.36, metalness: 0.08, color: 0xd8c4b0 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x1b1613, roughness: 0.92 }),
    buckle: new THREE.MeshStandardMaterial({ color: 0xa29b90, roughness: 0.28, metalness: 0.95 }),
    strap: new THREE.MeshStandardMaterial({ map: TB.boot, color: 0x9a8676, roughness: 0.62 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x3a2517, roughness: 0.62 }),
    shirt: new THREE.MeshStandardMaterial({ map: TB.pants, color: 0x8a8a7a, roughness: 0.95 }),
    ghost: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  };
  const mesh = (g, m, parent, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; };
  const root = new THREE.Group();          // under the player, turned by the legs' yaw
  const upper = new THREE.Group();         // chest turns with the view
  root.add(upper);
  const hips = new THREE.Group(); hips.position.y = LEG.hip; root.add(hips);
  // the waist and chest are never drawn (from up here they'd only hide the legs), but they still cast a shadow
  { const add = (g, parent, y, sz = 0.7) => { const o = new THREE.Mesh(g, mat.ghost); o.position.y = y; o.scale.z = sz; o.castShadow = true; parent.add(o); };
    add(new THREE.CylinderGeometry(0.166, 0.15, 0.22, 14), hips, 0.02);
    add(new THREE.CylinderGeometry(0.17, 0.168, 0.34, 14), upper, LEG.hip + 0.29, 0.72); }
  // legs: thigh pivots at the hip, shin at the knee, the boot at the ankle
  const legs = [-1, 1].map((s) => {
    const thigh = new THREE.Group(); thigh.position.set(s * LEG.spread, 0, 0); hips.add(thigh);
    mesh(remapV(lathe([[0.062, -LEG.thigh], [0.068, -0.38], [0.079, -0.25], [0.086, -0.12], [0.082, -0.03], [0.076, 0.04], [0.0, 0.05]], 16), 0.5, 1.0), mat.pants, thigh);
    const knee = new THREE.Group(); knee.position.y = -LEG.thigh; thigh.add(knee);
    mesh(new THREE.SphereGeometry(0.064, 12, 8), mat.pants, knee);
    mesh(remapV(lathe([[0.075, -0.27], [0.07, -0.24], [0.059, -0.2], [0.056, -0.1], [0.06, 0.0], [0.064, 0.035]], 16), 0.0, 0.5), mat.pants, knee);
    const ankle = new THREE.Group(); ankle.position.y = -LEG.shin; knee.add(ankle);
    const boot = new THREE.Group(); ankle.add(boot); boot.scale.x = s;       // mirrored so the buckles sit on the outside of each foot
    { const sh = mesh(lathe([[0.056, -0.03], [0.06, 0.05], [0.062, 0.14], [0.066, 0.21], [0.069, 0.25], [0.064, 0.255]], 16), mat.boot, boot); sh.scale.set(0.92, 1, 1.1);
      const foot = footShape(new THREE.BoxGeometry(0.104, 0.095, 0.28, 4, 3, 12)); foot.translate(0, -0.028, 0); mesh(foot, mat.boot, boot);
      const sole = footShape(new THREE.BoxGeometry(0.118, 0.028, 0.3, 4, 1, 12), 0.215, 0.085, false); sole.translate(0, -0.086, 0); mesh(sole, mat.sole, boot);
      const heel = mesh(new THREE.BoxGeometry(0.098, 0.02, 0.07), mat.sole, boot); heel.position.set(0, -0.09, 0.045);
      // a strap over the instep with a square buckle, another round the top of the shaft
      const instep = mesh(new THREE.TorusGeometry(0.056, 0.009, 4, 16, Math.PI), mat.strap, boot); instep.position.set(0, -0.03, -0.06); instep.rotation.x = -0.35; instep.scale.set(1.02, 1.0, 2.2);
      const top = mesh(new THREE.TorusGeometry(0.068, 0.006, 4, 20), mat.strap, boot); top.rotation.x = Math.PI / 2; top.position.y = 0.2; top.scale.set(0.95, 1.12, 2.6);
      for (const [y, z, w] of [[-0.01, -0.06, 0.028], [0.2, 0.0, 0.022]]) { const bk = mesh(new THREE.BoxGeometry(0.007, w, w * 1.15), mat.buckle, boot); bk.position.set(y < 0 ? 0.056 : 0.064, y, z); const hole = mesh(new THREE.BoxGeometry(0.008, w * 0.55, w * 0.6), mat.sole, boot); hole.position.set(y < 0 ? 0.0565 : 0.0645, y, z); }
      const tab = mesh(new THREE.BoxGeometry(0.03, 0.04, 0.006), mat.strap, boot); tab.position.set(0, 0.26, 0.07); tab.rotation.x = -0.2; }
    return { s, thigh, knee, ankle, boot };
  });
  // shadow-only stand-in: head, shoulders, arms, the duster to the knees
  const ghost = new THREE.Group(); upper.add(ghost);
  { const add = (g, x, y, z, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(g, mat.ghost); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.scale.set(sx, sy, sz); o.castShadow = true; ghost.add(o); return o; };
    add(new THREE.SphereGeometry(0.11, 12, 8), 0, 1.69, 0.02, 0, 0, 0.9, 1.12, 1);
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), 0, 1.55, 0.03);
    add(new THREE.BoxGeometry(0.46, 0.14, 0.24), 0, 1.44, 0.03);
    add(new THREE.CylinderGeometry(0.24, 0.31, 0.95, 12, 1, true), 0, LEG.hip - 0.02 + 0.0, 0.04, 0, 0, 1, 1, 0.68);
    ghost.userData.armL = add(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 8), -0.26, 1.15, 0.0, 0, 0.08);
    ghost.userData.armR = add(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 8), 0.24, 1.2, -0.12, -0.7, -0.15);
  }
  // ---------- pose ----------
  const st = { yaw: 0, hipTwist: 0, phase: 0, amp: 0, crouch: 0, kick: -1, back: 0, upperYaw: 0, sway: 0 };
  const legFK = (a, k) => LEG.thigh * Math.cos(a) + LEG.shin * Math.cos(a - k);
  function update(dt, p, camYaw, { sprint = false, groundY = 0 } = {}) {
    const vx = p.vx, vz = p.vz, sp = Math.hypot(vx, vz);
    // the legs turn to follow the view: quickly when walking, lazily when standing still
    let d = Math.atan2(Math.sin(camYaw - st.yaw), Math.cos(camYaw - st.yaw));
    if (sp > 0.15) st.yaw += d * (1 - Math.exp(-dt * 8));
    else if (Math.abs(d) > 0.9) st.yaw += d * (1 - Math.exp(-dt * 4));
    // walking direction relative to the body: strafing twists the hips, walking backwards runs the cycle backwards
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rxv = Math.cos(st.yaw), rzv = -Math.sin(st.yaw);
    const fwd = vx * fx + vz * fz, side = vx * rxv + vz * rzv;
    let twist = 0, dir = 1;
    if (sp > 0.15) { const back = fwd < -0.2 * sp; dir = back ? -1 : 1; twist = clamp(Math.atan2(side, Math.abs(fwd) + 0.25 * sp) * (back ? -1 : 1), -0.75, 0.75); }
    st.hipTwist += (twist - st.hipTwist) * (1 - Math.exp(-dt * 8));
    st.amp += ((sp > 0.12 ? clamp(sp / 1.45, 0, 1) * (sprint ? 0.62 : 0.44) : 0) - st.amp) * (1 - Math.exp(-dt * 9));
    st.phase = p.bob * dir;
    const crouch = st.crouch;
    hips.rotation.y = -st.hipTwist; hips.rotation.z = Math.sin(st.phase) * st.amp * 0.08;
    let lowest = 0;
    legs.forEach((L, i) => {
      const ph = st.phase + (i ? Math.PI : 0);
      let a = Math.cos(ph) * st.amp, k = Math.max(0, -Math.sin(ph)) * st.amp * 1.7 + 0.04;
      // milking: down on the stool
      a = a * (1 - crouch) + 1.3 * crouch; k = k * (1 - crouch) + 2.15 * crouch;
      // the compass-weed kick, right leg: lift, dig the heel in, swing it back, kick
      if (st.kick >= 0 && i === 1) {
        const t = st.kick;
        const keys = [[0, 0, 0.05, 0], [0.18, 0.75, 1.1, 0.25], [0.42, 0.32, 0.12, 0.55], [0.6, 0.3, 0.1, 0.55], [0.75, -0.45, 0.9, -0.2], [0.9, 0.85, 0.05, -0.55], [1.15, 0, 0.05, 0]];
        let j = 0; while (j < keys.length - 2 && t > keys[j + 1][0]) j++;
        const [t0, a0, k0, f0] = keys[j], [t1, a1, k1, f1] = keys[j + 1], u = smooth(0, 1, (t - t0) / (t1 - t0));
        a = a0 + (a1 - a0) * u; k = k0 + (k1 - k0) * u; L.kickFoot = f0 + (f1 - f0) * u;
      } else L.kickFoot = 0;
      L.thigh.rotation.x = a; L.knee.rotation.x = -k;
      L.ankle.rotation.x = clamp(-(a - k), -0.9, 0.9) * (1 - crouch * 0.4) + (Math.cos(ph) > 0.7 ? 0.12 : 0) * st.amp * 2 + (L.kickFoot || 0);
      L.thigh.rotation.y = L.s * 0.06; L.thigh.rotation.z = -L.s * (0.03 + crouch * 0.2);
      if (!(st.kick >= 0 && i === 1)) lowest = Math.max(lowest, legFK(a, k));
    });
    hips.position.y = LEG.ankle + lowest;
    // the chest follows the view; the duster sways
    upper.position.y = hips.position.y - LEG.hip;
    upper.rotation.y = Math.atan2(Math.sin(camYaw - st.yaw), Math.cos(camYaw - st.yaw));
    ghost.userData.armL.rotation.x = Math.sin(st.phase) * st.amp * 0.6;
    root.position.set(p.x + Math.sin(st.yaw) * LEG.back * (1 - crouch * 0.6), groundY, p.z + Math.cos(st.yaw) * LEG.back * (1 - crouch * 0.6));
    root.rotation.y = st.yaw;
    if (st.kick >= 0) { st.kick += dt; if (st.kick > 1.15) st.kick = -1; }
  }
  return { root, update, st, legs, kick() { st.kick = 0; }, setCrouch(v) { st.crouch = v; }, snap(yaw) { st.yaw = yaw; } };
}

