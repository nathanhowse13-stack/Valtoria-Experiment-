// ============================================================
// Jacob on the road: the same legs, boots and shadow he has in the
// yard (shared/body.js), dressed from textures painted here. Look down
// and he's there; walk and his shadow walks with him.
// ============================================================
import { THREE, rng } from './core.js';
import { buildBody } from '../shared/body.js';

// tan work pants (u runs round the leg, v up it: shin 0 to 0.5, thigh 0.5 to 1), red dust worked into the hems
function pantsCanvas() {
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), R = rng(4411);
  x.fillStyle = '#a98f68'; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 2600; k++) { x.fillStyle = `rgba(${R() < 0.5 ? '60,44,28' : '214,196,160'},${0.05 + R() * 0.09})`; x.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 3); }      // the weave
  for (const u of [0.02, 0.5]) { x.strokeStyle = 'rgba(70,52,34,0.55)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(u * W, 0); x.lineTo(u * W, H); x.stroke(); x.strokeStyle = 'rgba(225,208,170,0.35)'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(u * W + 3, 0); x.lineTo(u * W + 3, H); x.stroke(); x.setLineDash([]); }   // seams, double-stitched
  { const g = x.createLinearGradient(0, H, 0, H * 0.45); g.addColorStop(0, 'rgba(150,62,34,0.75)'); g.addColorStop(0.5, 'rgba(150,62,34,0.3)'); g.addColorStop(1, 'rgba(150,62,34,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }   // red dust, thickest at the hem (v = 0 is the bottom of the canvas)
  x.fillStyle = 'rgba(92,70,46,0.5)'; x.fillRect(W * 0.14, H * 0.42, W * 0.3, H * 0.16);                                             // a knee patch
  x.strokeStyle = 'rgba(60,44,28,0.7)'; x.setLineDash([2, 2]); x.strokeRect(W * 0.14, H * 0.42, W * 0.3, H * 0.16); x.setLineDash([]);
  for (let k = 0; k < 5; k++) { x.strokeStyle = 'rgba(48,30,20,0.5)'; x.lineWidth = 1; const y = H * (0.55 + R() * 0.4), u = R() * W; x.beginPath(); x.moveTo(u, y); x.lineTo(u + 6 + R() * 10, y + 2 + R() * 5); x.stroke(); }   // where the spinifex got in
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
// heavy country boots: oiled leather, scuffed pale at the toe, red to the ankle
function bootCanvas() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), R = rng(8822);
  x.fillStyle = '#4a3324'; x.fillRect(0, 0, N, N);
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(${R() < 0.6 ? '24,14,10' : '150,112,84'},${0.06 + R() * 0.12})`; x.beginPath(); x.arc(R() * N, R() * N, 0.5 + R() * 2.2, 0, 6.3); x.fill(); }
  for (let k = 0; k < 26; k++) { x.strokeStyle = `rgba(190,160,130,${0.12 + R() * 0.2})`; x.lineWidth = 0.6 + R(); const u = R() * N, v = R() * N; x.beginPath(); x.moveTo(u, v); x.lineTo(u + (R() - 0.5) * 26, v + (R() - 0.5) * 8); x.stroke(); }      // scuffs
  { const g = x.createLinearGradient(0, N, 0, N * 0.3); g.addColorStop(0, 'rgba(160,70,38,0.6)'); g.addColorStop(1, 'rgba(160,70,38,0)'); x.fillStyle = g; x.fillRect(0, 0, N, N); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function buildJacob() {
  const body = buildBody({ pants: pantsCanvas(), boot: bootCanvas() });
  body.root.visible = false;
  return body;
}
