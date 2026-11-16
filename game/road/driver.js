// ============================================================
// Jacob at the wheel. Chapter Two: "Jacob gripped the wheel with
// white-knuckled intensity, his body tense, reading the terrain the
// way a man reads a contract that binds his soul." Dressed as Chapter
// One dresses him for outside: the heavy canvas duster, polarised
// goggles, the sun scarf wound over his head and across his nose and
// mouth (the wrap over the head is this sketch's; the books don't say
// what's under it).
//
// He sits in the tractor's own frame, so he rides its springs and its
// slopes. Each frame his arms are solved from his shoulders to wherever
// the rim of the wheel is under his hands, his head turns to where the
// player is looking (and glances about on its own when left alone), he
// leans into the turns and back from the throttle, his feet work the
// pedals, and the tail of the scarf streams out behind him with speed.
//
// From the chase view all of him shows. From the seat the camera is
// where his head is, so the head and chest are hidden and what's left is
// what he'd see looking down: his arms, his hands on the wheel, the
// duster over his lap, his knees and boots.
// ============================================================
import { THREE, clamp, G, T } from './core.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _e = new THREE.Vector3(), _s = new THREE.Vector3(), _h = new THREE.Vector3();
const HIP = v3(0, 1.64, -0.6), E = v3(0, 0, 0), Wr = v3(0, 0, 0);

// a tapered limb, a unit long up +y from its own origin; span() lays it from a to b
function limb(r0, r1, mat) { const g = new THREE.CylinderGeometry(r1, r0, 1, 10, 1); g.translate(0, 0.5, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m; }
function span(m, a, b) { _d.subVectors(b, a); const len = _d.length() || 1e-4; m.position.copy(a); m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len)); m.scale.set(1, len, 1); }
function ball(r, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat); m.castShadow = true; return m; }
// the elbow (or knee) between a fixed joint and where the hand has to be: two bones, bent towards the pole
function bend(S, H, L1, L2, pole, out) {
  _d.subVectors(H, S); const d = Math.min(_d.length(), L1 + L2 - 0.004); _d.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  return out.copy(S).addScaledVector(_d, a).addScaledVector(_p, hh);
}

export function buildDriver(model) {
  const canvas = T.canvas || {}, leather = T.leather || {};
  const M = {
    duster: new THREE.MeshStandardMaterial({ map: canvas.c, normalMap: canvas.n, color: 0x8f775a, roughness: 0.97 }),            // heavy canvas, tan gone to brown
    pants: new THREE.MeshStandardMaterial({ map: canvas.c, color: 0xa98f68, roughness: 0.95 }),
    boot: new THREE.MeshStandardMaterial({ map: leather.c, normalMap: leather.n, color: 0x4a3324, roughness: 0.8 }),
    scarf: new THREE.MeshStandardMaterial({ map: canvas.c, color: 0xb9a184, roughness: 1, side: THREE.DoubleSide }),          // sun-bleached, red with dust in the folds
    skin: new THREE.MeshStandardMaterial({ color: 0xc4beba, roughness: 0.6 }),                                                // pale as marble
    lens: new THREE.MeshStandardMaterial({ color: 0x2a1804, roughness: 0.12, metalness: 0.3, emissive: 0x4a2c00, emissiveIntensity: 0.3 }),   // polarised amber
    strap: new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 0.8 }),
  };
  const root = new THREE.Group(); model.group.add(root);
  const add = (parent, m) => { parent.add(m); return m; };

  // ---------- hips, spine, chest: the part that leans and rides the bumps ----------
  const body = new THREE.Group(); body.position.copy(HIP); root.add(body);
  const spine = new THREE.Group(); spine.rotation.x = 0.2; body.add(spine);           // tense, leaning into it
  {
    const torso = new THREE.CylinderGeometry(0.15, 0.19, 0.52, 14); torso.scale(1.22, 1, 0.74); torso.translate(0, 0.26, 0);
    const t = add(spine, new THREE.Mesh(torso, M.duster)); t.castShadow = true; t.receiveShadow = true;
    const sh = new THREE.CylinderGeometry(0.078, 0.078, 0.34, 10); sh.rotateZ(Math.PI / 2); sh.translate(0, 0.5, 0);
    add(spine, new THREE.Mesh(sh, M.duster)).castShadow = true;
    for (const s of [-1, 1]) { const b = add(spine, ball(0.082, M.duster)); b.position.set(s * 0.19, 0.5, 0); }
    const collar = new THREE.TorusGeometry(0.082, 0.032, 8, 16); collar.rotateX(Math.PI / 2); collar.translate(0, 0.565, 0.005);
    add(spine, new THREE.Mesh(collar, M.duster)).castShadow = true;
    // the book, in its pocket (Chapter Two: "He touched the pocket of his duster, feeling the outline of the book")
    const pocket = add(spine, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.03), M.duster)); pocket.position.set(0.1, 0.3, 0.125); pocket.rotation.x = -0.08;
  }
  // the duster's skirts: round the hips, over the seat's edges
  const skirt = new THREE.CylinderGeometry(0.2, 0.28, 0.24, 14, 1, true); skirt.scale(1.2, 1, 0.95); skirt.translate(0, -0.08, 0.02);
  const skirtM = add(body, new THREE.Mesh(skirt, new THREE.MeshStandardMaterial({ map: canvas.c, normalMap: canvas.n, color: 0x8f775a, roughness: 0.97, side: THREE.DoubleSide }))); skirtM.castShadow = true;
  // where the arms hang from (read back in the tractor's frame every frame, since the spine moves)
  const shoulders = [-1, 1].map((s) => { const o = new THREE.Object3D(); o.position.set(s * 0.2, 0.49, 0.01); spine.add(o); return o; });

  // ---------- head: the scarf wound over it and across the face, goggles over the scarf ----------
  const head = new THREE.Group(); head.position.set(0, 0.71, 0.03); spine.add(head);
  const gog = new THREE.Group(), face = new THREE.Group(); head.add(gog, face);
  let mask = null;
  {
    add(head, ball(0.105, M.scarf));
    mask = add(head, ball(0.075, M.scarf)); mask.scale.set(0.95, 0.75, 0.9); mask.position.set(0, -0.045, 0.045);       // nose and mouth, under the wrap
    const neck = new THREE.CylinderGeometry(0.06, 0.075, 0.12, 10); neck.translate(0, -0.13, -0.005); add(head, new THREE.Mesh(neck, M.scarf));
    const knot = add(head, ball(0.035, M.scarf)); knot.position.set(0.02, -0.07, -0.1);
    const band = new THREE.TorusGeometry(0.107, 0.013, 6, 22); band.rotateX(Math.PI / 2); band.translate(0, 0.022, 0); add(gog, new THREE.Mesh(band, M.strap));
    for (const s of [-1, 1]) {
      const cup = new THREE.CylinderGeometry(0.037, 0.04, 0.035, 14); cup.rotateX(Math.PI / 2); cup.translate(s * 0.043, 0.022, 0.092); add(gog, new THREE.Mesh(cup, M.strap));
      const glass = new THREE.CylinderGeometry(0.031, 0.031, 0.006, 14); glass.rotateX(Math.PI / 2); glass.translate(s * 0.043, 0.022, 0.111); add(gog, new THREE.Mesh(glass, M.lens));
    }
    // under the goggles: "the raccoon-mask of clean pale skin around his eyes where the dust had not touched" (Chapter Two)
    const eyes = new THREE.BoxGeometry(0.17, 0.05, 0.03); eyes.translate(0, 0.022, 0.093); face.add(new THREE.Mesh(eyes, M.skin));
    for (const s of [-1, 1]) { const e = ball(0.011, M.strap); e.position.set(s * 0.04, 0.024, 0.108); face.add(e); }
    face.visible = false;
  }
  // the scarf's tail: four lengths of cloth off the knot, each hinged to the last
  const tail = []; { let parent = head, at = v3(0.02, -0.08, -0.11);
    for (let k = 0; k < 4; k++) {
      const j = new THREE.Group(); j.position.copy(at); parent.add(j);
      const g = new THREE.PlaneGeometry(0.11 - k * 0.012, 0.13); g.translate(0, -0.065, 0);
      const m = add(j, new THREE.Mesh(g, M.scarf)); m.castShadow = true;
      tail.push(j); parent = j; at = v3(0, -0.125, 0);
    } }

  // ---------- arms: shoulder to elbow to the rim of the wheel ----------
  const UP = 0.3, FORE = 0.29;
  const arms = [-1, 1].map((s) => {
    const upper = add(root, limb(0.06, 0.05, M.duster)), fore = add(root, limb(0.05, 0.042, M.duster)), elbow = add(root, ball(0.052, M.duster));
    const wrist = add(root, limb(0.027, 0.03, M.skin));                                              // out of the cuff, pale
    // a fist round the rim: the back of the hand, four knuckles standing white, the thumb hooked over
    const hand = new THREE.Group(); root.add(hand);
    const palm = add(hand, ball(0.046, M.skin)); palm.scale.set(1.05, 0.7, 1.1);
    for (let k = 0; k < 4; k++) { const kn = add(hand, ball(0.0165, M.skin)); kn.position.set(-0.03 + k * 0.02, 0.022, 0.03); }
    const thumb = add(hand, ball(0.02, M.skin)); thumb.scale.set(1, 0.8, 1.7); thumb.position.set(s * -0.045, 0.004, 0.012);
    return { s, upper, fore, elbow, wrist, hand, phi: s * 0.87 };          // +x is his left: hands at ten and two
  });

  // ---------- legs: knees up in front of him, boots on the plate, the duster over his lap ----------
  const legs = [-1, 1].map((s) => {
    const hip = v3(s * 0.1, HIP.y + 0.02, HIP.z + 0.03), knee = v3(s * 0.17, 1.7, -0.14), ankle = v3(s * 0.2, 1.25, 0.03);
    const thigh = add(root, limb(0.088, 0.07, M.pants)), shin = add(root, limb(0.068, 0.05, M.pants)), kn = add(root, ball(0.072, M.pants));
    const boot = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.27), M.boot)); boot.castShadow = true;
    const cuff = add(root, limb(0.062, 0.058, M.boot));
    const lap = add(root, new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.02, 0.4), M.duster)); lap.castShadow = true;
    span(thigh, hip, knee); kn.position.copy(knee);
    lap.position.set(s * 0.14, 1.765, -0.36); lap.rotation.set(0.13, 0, s * -0.12);
    return { s, hip, knee, ankle, ankle0: ankle.clone(), thigh, shin, boot, cuff };
  });

  const st0 = { headYaw: 0, headPitch: 0, glance: 0, glanceTo: 0, glanceIn: 2, lean: 0, pitch: 0, bounce: 0, t: 0, stream: 0 };
  const W = model.wheelAt, yAxis = v3(0, Math.cos(W.tilt), Math.sin(W.tilt)), C = v3(W.x, W.y, W.z);
  const POSE0 = { offer: 0, scarfDown: false, gogglesDown: false }, offerAt = new THREE.Vector3(); let gDown = 0;
  function update(dt, { visible = true, seat = false, steer = 0, speed = 0, thr = 0, brk = 0, look = 0, pitch = 0, sus = null, gust = 0.3, rightBusy = false, pose = POSE0 } = {}) {
    root.visible = visible; if (!visible) return;
    const s = st0, sp = Math.abs(speed), k = (r) => 1 - Math.exp(-r * dt);
    s.t += dt;
    // from the seat the camera is his head: hide what would be in its way
    spine.visible = !seat; skirtM.visible = !seat;
    // he leans into a turn, back from the throttle and forward onto the brake, and rides the springs a beat late
    s.lean += (-steer * clamp(sp / 6, 0, 1) * 0.13 - s.lean) * k(5);
    s.pitch += ((brk - thr * 0.6) * clamp(sp / 3 + 0.3, 0, 1) * 0.07 - s.pitch) * k(4);
    s.bounce += ((sus ? -sus.y * 0.6 : 0) - s.bounce) * k(9);
    body.position.set(HIP.x, HIP.y + s.bounce + Math.sin(s.t * 1.7) * 0.0025, HIP.z);          // and breathes
    body.rotation.set(s.pitch + (sus ? sus.p * 0.6 : 0), 0, s.lean + (sus ? -sus.r * 0.8 : 0) - pose.offer * 0.2);      // and out of the seat, to offer his wrist
    // at the gate: the goggles come down round his neck, and the scarf comes down off his face when he's spoken to
    gDown += ((pose.gogglesDown ? 1 : 0) - gDown) * k(4);
    gog.position.set(0, -0.15 * gDown, -0.012 * gDown); gog.rotation.x = 0.55 * gDown; face.visible = gDown > 0.5;
    mask.material = pose.scarfDown ? M.skin : M.scarf;
    // his head goes where the player looks; left alone, he checks the gums, the pans, the mirrors he doesn't have
    if ((s.glanceIn -= dt) < 0) { s.glanceIn = 2.5 + Math.random() * 5; s.glanceTo = (Math.random() - 0.5) * (sp < 1 ? 1.3 : 0.5); if (Math.random() < 0.35) s.glanceTo = 0; }
    s.glance += (s.glanceTo - s.glance) * k(2.2);
    const wantYaw = pose.offer > 0.05 ? 1.15 * pose.offer : clamp(look, -1.35, 1.35) + (Math.abs(look) < 0.15 ? s.glance : 0);
    s.headYaw += (wantYaw - s.headYaw) * k(6); s.headPitch += (clamp(-pitch * 0.6, -0.4, 0.5) - s.headPitch) * k(6);
    head.rotation.set(s.headPitch - 0.14, s.headYaw * 0.8, 0, 'YXZ');
    spine.rotation.set(0.2, s.headYaw * 0.2, 0, 'YXZ');                                         // the shoulders come round a little with it
    // the scarf's tail: hanging when he's still, streaming back and snapping when he isn't
    s.stream += (clamp(sp / 5 + gust * 0.25, 0, 1.2) - s.stream) * k(3);
    tail.forEach((j, i) => { j.rotation.x = (i === 0 ? 0.25 : 0.12) + s.stream * (i === 0 ? 0.95 : 0.16) + Math.sin(s.t * (7 + i * 1.3) + i * 1.1) * (0.05 + 0.2 * s.stream); j.rotation.z = Math.sin(s.t * 5.1 + i * 1.7) * 0.1 * s.stream; });
    // hands: at ten and two, going round with the rim as far as an arm will, then letting it slip through
    root.updateMatrixWorld(true);
    const turn = clamp(W.turn, -0.95, 0.95);
    for (const a of arms) {
      const sh = shoulders[a.s < 0 ? 0 : 1]; sh.getWorldPosition(_s); root.worldToLocal(_s);
      const phi = a.phi - turn;
      _h.copy(C).addScaledVector(yAxis, Math.cos(phi) * W.r).addScaledVector(_e.set(1, 0, 0), Math.sin(phi) * W.r);
      _h.y += 0.012; _h.z -= 0.012;                                                              // on top of the rim, not inside it
      if (a.s > 0 && pose.offer > 0) { _h.lerp(_p.copy(_s).add(_e.set(0.5, -0.08, 0.14)), pose.offer * pose.offer * (3 - 2 * pose.offer)); G.offerAt = root.localToWorld(offerAt.copy(_h)); }   // his left wrist, held out
      const vis = !(a.s < 0 && rightBusy);
      a.upper.visible = a.fore.visible = a.elbow.visible = a.hand.visible = a.wrist.visible = vis;
      if (!vis) continue;
      bend(_s, _h, UP, FORE, _p.set(a.s * 0.55, -1, -0.35), _e);
      E.copy(_e); Wr.copy(_h).sub(E).setLength(Math.max(0.05, E.distanceTo(_h) - 0.075)).add(E);      // the cuff stops short of the hand
      span(a.upper, _s, E); span(a.fore, E, Wr); span(a.wrist, Wr, _h); a.elbow.position.copy(E);
      a.hand.position.copy(_h); a.hand.rotation.set(W.tilt - 0.35, 0, a.s * -0.5 - turn * 0.5);
    }
    // feet: the right boot on the throttle, the left on the brake
    for (const l of legs) {
      const press = l.s < 0 ? thr : brk;
      l.ankle.set(l.ankle0.x, l.ankle0.y - press * 0.03, l.ankle0.z + press * 0.035);
      span(l.shin, l.knee, l.ankle); span(l.cuff, _p.copy(l.ankle).setY(l.ankle.y + 0.1), l.ankle);
      l.boot.position.set(l.ankle.x, l.ankle.y - 0.035, l.ankle.z + 0.075); l.boot.rotation.x = -0.15 + press * 0.22;
    }
  }
  update(0, {});
  return { root, update, head, body };
}
