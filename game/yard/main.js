import * as THREE from "./vendor/three.module.js";
import { ideas, IDEA_KINDS, connectIdeas, addIdea, deleteIdea, exportIdeas, ideaWhere } from "../shared/notebook.js";
// ============================================================
// Procedural textures – everything is painted onto canvases at
// load time, so the page ships with no image files at all.
// ============================================================
const TAU = Math.PI * 2;
let _seed = 0x2f6b9d11;
function R() { _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5; return (_seed >>> 0) / 4294967296; }
function rand(a = 0, b = 1) { return a + (b - a) * R(); }
function pick(list) { return list[Math.floor(R() * list.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Tileable value-noise fBm, greyscale. Drawn once, reused as grit everywhere.
function makeNoise(size, cells, octaves) {
  const c = cv(size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const n = cells << o, g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = R();
    layers.push({ n, g, amp: Math.pow(0.55, o) });
  }
  const total = layers.reduce((s, l) => s + l.amp, 0);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let v = 0;
    for (const { n, g, amp } of layers) {
      const fx = px / size * n, fy = py / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      const a = g[y0 * n + x0], b = g[y0 * n + x1], c2 = g[y1 * n + x0], e = g[y1 * n + x1];
      v += amp * ((a + (b - a) * sx) * (1 - sy) + (c2 + (e - c2) * sx) * sy);
    }
    const i = (py * size + px) * 4, b8 = (v / total) * 255;
    d[i] = d[i + 1] = d[i + 2] = b8; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function grit(x, w, h, noise, alpha, op, scale = 1) {
  x.save();
  x.globalCompositeOperation = op; x.globalAlpha = alpha;
  x.scale(scale, scale);
  x.fillStyle = x.createPattern(noise, 'repeat');
  x.fillRect(0, 0, w / scale + 2, h / scale + 2);
  x.restore();
}
function tint(x, w, h, color, op) { x.save(); x.globalCompositeOperation = op; x.fillStyle = color; x.fillRect(0, 0, w, h); x.restore(); }
function specks(x, w, h, n, colour, r0, r1) { for (let i = 0; i < n; i++) { x.fillStyle = typeof colour === 'function' ? colour() : colour; x.beginPath(); x.arc(rand(0, w), rand(0, h), rand(r0, r1), 0, TAU); x.fill(); } }
// Map noise values onto two colours with a threshold – used for rust and patina.
function noiseBlend(x, w, h, noise, lo, hi, a, b, alpha = 1) {
  const c = cv(w, h), cx = c.getContext('2d');
  cx.drawImage(noise, 0, 0, w, h);
  const img = cx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const t = smooth(lo, hi, d[i] / 255);
    d[i] = a[0] + (b[0] - a[0]) * t; d[i + 1] = a[1] + (b[1] - a[1]) * t; d[i + 2] = a[2] + (b[2] - a[2]) * t;
    d[i + 3] = 255 * alpha * (a.length > 3 ? (a[3] + (b[3] - a[3]) * t) : 1);
  }
  cx.putImageData(img, 0, 0);
  x.drawImage(c, 0, 0);
}
function wavyLine(x, x0, y0, len, horizontal, amp, freq, phase) {
  x.beginPath();
  for (let s = 0; s <= len; s += 16) {
    const o = Math.sin(s * freq + phase) * amp;
    if (horizontal) (s ? x.lineTo(x0 + s, y0 + o) : x.moveTo(x0, y0 + o));
    else (s ? x.lineTo(x0 + o, y0 + s) : x.moveTo(x0 + o, y0));
  }
  x.stroke();
}

// ---------- surfaces ----------
function wallCanvas(N, G) {           // vertical boards, bleached grey by the sun (1.2 m square)
  const S = 512, c = cv(S), x = c.getContext('2d'), boards = 8, bw = S / boards;
  for (let i = 0; i < boards; i++) {
    x.fillStyle = hsl(rand(22, 32), rand(8, 15), rand(38, 50)); x.fillRect(i * bw, 0, bw, S);
    for (let k = 0; k < 24; k++) {
      x.strokeStyle = `rgba(38, 26, 18, ${rand(0.05, 0.2)})`; x.lineWidth = rand(0.5, 1.7);
      wavyLine(x, i * bw + rand(3, bw - 3), 0, S, false, rand(0.5, 2.4), 0.02, k);
    }
    if (R() < 0.55) {
      const kx = i * bw + rand(14, bw - 14), ky = rand(24, S - 24);
      for (let r = 10; r > 0; r -= 2) { x.strokeStyle = `rgba(52, 33, 22, ${0.12 + (10 - r) * 0.04})`; x.lineWidth = 1.2; x.beginPath(); x.ellipse(kx, ky, r * 0.55, r * 1.5, 0, 0, TAU); x.stroke(); }
    }
    if (R() < 0.35) { x.strokeStyle = 'rgba(20, 12, 8, 0.55)'; x.lineWidth = 1.2; wavyLine(x, i * bw + rand(10, bw - 10), rand(0, S * 0.6), rand(60, 180), false, 1.5, 0.05, i); }
    x.fillStyle = 'rgba(22, 14, 10, 0.92)'; x.fillRect(i * bw, 0, 2.5, S);
  }
  for (const ny of [84, 340]) for (let i = 0; i < boards; i++) {
    const nx = i * bw + bw / 2 + rand(-6, 6), yy = ny + rand(-3, 3);
    x.fillStyle = 'rgba(130, 60, 25, 0.3)'; x.fillRect(nx - 1.5, yy, 3, rand(10, 26));
    x.fillStyle = 'rgba(28, 18, 12, 0.9)'; x.beginPath(); x.arc(nx, yy, 2.4, 0, TAU); x.fill();
  }
  grit(x, S, S, N, 0.45, 'multiply', 2);
  grit(x, S, S, G, 0.22, 'overlay');
  tint(x, S, S, 'rgba(220, 150, 120, 0.32)', 'multiply');
  return c;
}

function floorCanvas(N, G) {          // horizontal planks with red dust packed into the cracks (1.6 m)
  const S = 512, c = cv(S), x = c.getContext('2d'), rows = 7, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let px = -rand(0, 300);
    while (px < S) {
      const len = rand(220, 420);
      x.fillStyle = hsl(rand(18, 28), rand(16, 26), rand(22, 31)); x.fillRect(px, r * rh, len, rh);
      for (let k = 0; k < 14; k++) {
        x.strokeStyle = `rgba(20, 12, 8, ${rand(0.06, 0.2)})`; x.lineWidth = rand(0.6, 1.8);
        wavyLine(x, px, r * rh + rand(3, rh - 3), len, true, rand(0.4, 2), 0.03, k);
      }
      x.fillStyle = 'rgba(92, 34, 16, 0.95)'; x.fillRect(px + len - 1.5, r * rh, 2.5, rh);
      x.fillStyle = 'rgba(24, 14, 9, 0.9)';
      for (const ny of [r * rh + rh * 0.3, r * rh + rh * 0.7]) { x.beginPath(); x.arc(px + 9, ny, 1.9, 0, TAU); x.fill(); x.beginPath(); x.arc(px + len - 11, ny, 1.9, 0, TAU); x.fill(); }
      px += len;
    }
    x.fillStyle = 'rgba(96, 36, 18, 0.95)'; x.fillRect(0, r * rh, S, 2.5);
  }
  for (let i = 0; i < 46; i++) {
    x.strokeStyle = `rgba(205, 160, 125, ${rand(0.03, 0.08)})`; x.lineWidth = rand(1, 4);
    const sx = rand(0, S), sy = rand(0, S); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + rand(-40, 40), sy + rand(-6, 6)); x.stroke();
  }
  grit(x, S, S, N, 0.5, 'multiply', 2);
  grit(x, S, S, G, 0.28, 'overlay');
  tint(x, S, S, 'rgba(190, 80, 40, 0.42)', 'soft-light');
  return c;
}

function tinCanvases(N, G) {          // corrugated iron, seen from underneath (1 m)
  const S = 512, waves = 13, color = cv(S), x = color.getContext('2d');
  for (let i = 0; i < S; i++) { const s = Math.sin(i / S * waves * TAU); x.fillStyle = hsl(205, 5, 44 + s * 10); x.fillRect(i, 0, 1, S); }
  noiseBlend(x, S, S, N, 0.5, 0.72, [140, 62, 26, 0], [128, 52, 20, 0.9]);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(105, 44, 18, ${rand(0.05, 0.2)})`; x.fillRect(rand(0, S), rand(0, S), rand(1, 3), rand(40, 220)); }
  grit(x, S, S, G, 0.3, 'overlay');
  const em = cv(S), ex = em.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  for (const ny of [62, 318]) for (let k = 0; k < waves; k += 2) {
    const nx = (k + 0.25) / waves * S;
    x.fillStyle = 'rgba(120, 50, 20, 0.5)'; x.fillRect(nx - 1.5, ny, 3, rand(12, 40));
    x.fillStyle = '#29231f'; x.beginPath(); x.arc(nx, ny, 3, 0, TAU); x.fill();
  }
  for (let i = 0; i < 8; i++) {
    const hx = rand(8, S - 8), hy = rand(8, S - 8), g = ex.createRadialGradient(hx, hy, 0, hx, hy, 4);
    g.addColorStop(0, '#fff6dc'); g.addColorStop(1, 'rgba(255, 246, 220, 0)');
    ex.fillStyle = g; ex.fillRect(hx - 5, hy - 5, 10, 10);
    x.fillStyle = '#0f0b09'; x.beginPath(); x.arc(hx, hy, 2.4, 0, TAU); x.fill();
  }
  const nm = cv(S, 8), nx2 = nm.getContext('2d'), img = nx2.createImageData(S, 8), d = img.data;
  for (let px = 0; px < S; px++) {
    const slope = Math.cos(px / S * waves * TAU) * 0.75, len = Math.hypot(slope, 1);
    for (let py = 0; py < 8; py++) { const i = (py * S + px) * 4; d[i] = (-slope / len * 0.5 + 0.5) * 255; d[i + 1] = 128; d[i + 2] = (1 / len * 0.5 + 0.5) * 255; d[i + 3] = 255; }
  }
  nx2.putImageData(img, 0, 0);
  return { color, normal: nm, emissive: em };
}

function woodCanvas(N, G, stains) {    // dark furniture timber (1 m); the table version carries rings and knife marks
  const S = 512, c = cv(S), x = c.getContext('2d'), boards = 4, bh = S / boards;
  for (let b = 0; b < boards; b++) {
    x.fillStyle = hsl(rand(18, 26), rand(24, 34), rand(19, 26)); x.fillRect(0, b * bh, S, bh);
    for (let k = 0; k < 30; k++) { x.strokeStyle = `rgba(10, 6, 4, ${rand(0.08, 0.25)})`; x.lineWidth = rand(0.6, 2); wavyLine(x, 0, b * bh + rand(2, bh - 2), S, true, rand(0.5, 3), 0.015, k + b); }
    x.fillStyle = 'rgba(8, 5, 3, 0.9)'; x.fillRect(0, b * bh, S, 2);
  }
  if (stains) {
    for (let i = 0; i < 7; i++) {
      const cx2 = rand(40, S - 40), cy2 = rand(40, S - 40), r = rand(16, 26);
      x.strokeStyle = `rgba(30, 14, 6, ${rand(0.25, 0.45)})`; x.lineWidth = rand(2, 4);
      x.beginPath(); x.arc(cx2, cy2, r, rand(0, 1), rand(4.5, 6.3)); x.stroke();
    }
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(190, 150, 110, ${rand(0.1, 0.25)})`; x.lineWidth = rand(0.5, 1.2); const sx = rand(0, S), sy = rand(0, S); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + rand(-30, 30), sy + rand(-30, 30)); x.stroke(); }
    const g = x.createRadialGradient(S * 0.7, S * 0.35, 0, S * 0.7, S * 0.35, 40); g.addColorStop(0, 'rgba(8, 4, 2, 0.7)'); g.addColorStop(1, 'rgba(8, 4, 2, 0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  grit(x, S, S, N, 0.4, 'multiply', 2);
  grit(x, S, S, G, 0.2, 'overlay');
  return c;
}

function ironCanvas(N, G) {           // rusted iron (0.5 m)
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#3b2318'; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, N, 0.38, 0.75, [52, 30, 20], [150, 70, 30]);
  specks(x, S, S, 160, () => `rgba(20, 10, 6, ${rand(0.3, 0.7)})`, 0.5, 2.2);
  specks(x, S, S, 80, () => `rgba(190, 95, 40, ${rand(0.2, 0.5)})`, 0.5, 1.6);
  grit(x, S, S, G, 0.35, 'overlay');
  return c;
}

function canvasCanvas(N, G) {         // stained mattress canvas (1 m)
  const S = 512, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#cbbd9b'; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(60, 45, 25, 0.06)'; x.lineWidth = 1;
  for (let i = 0; i < S; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  for (let i = 0; i < 12; i++) {
    const sx = rand(0, S), sy = rand(0, S), r = rand(25, 90);
    for (let k = 0; k < 5; k++) { const g = x.createRadialGradient(sx + rand(-20, 20), sy + rand(-20, 20), 0, sx, sy, r * rand(0.5, 1)); g.addColorStop(0, `rgba(110, 76, 38, ${rand(0.08, 0.2)})`); g.addColorStop(1, 'rgba(110, 76, 38, 0)'); x.fillStyle = g; x.fillRect(sx - r, sy - r, r * 2, r * 2); }
  }
  x.fillStyle = 'rgba(150, 128, 92, 0.6)'; x.fillRect(300, 120, 120, 90);
  x.strokeStyle = 'rgba(50, 35, 20, 0.7)'; x.lineWidth = 1.5; x.setLineDash([5, 4]); x.strokeRect(302, 122, 116, 86);
  x.beginPath(); x.moveTo(0, 256); x.lineTo(S, 256); x.stroke(); x.setLineDash([]);
  for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(200, 165, 80, ${rand(0.4, 0.8)})`; x.lineWidth = rand(1, 2); const sx = rand(0, S), sy = rand(0, S); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + rand(-14, 14), sy + rand(-14, 14)); x.stroke(); }
  grit(x, S, S, N, 0.35, 'multiply', 2);
  grit(x, S, S, G, 0.25, 'overlay');
  return c;
}

function hessianCanvas(N, G) {        // burlap / feed-sack weave (0.4 m)
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#7f6140'; x.fillRect(0, 0, S, S);
  for (let py = 0; py < S; py += 4) for (let px = 0; px < S; px += 4) {
    const odd = ((px + py) / 4) % 2;
    x.fillStyle = odd ? `rgba(170, 135, 90, ${rand(0.35, 0.6)})` : `rgba(60, 42, 24, ${rand(0.2, 0.45)})`;
    if (odd) x.fillRect(px, py + 1, 4, 2); else x.fillRect(px + 1, py, 2, 4);
  }
  grit(x, S, S, N, 0.4, 'multiply', 1);
  grit(x, S, S, G, 0.25, 'overlay');
  return c;
}

function brickCanvas(N, G) {          // old bricks (0.5 m)
  const S = 256, c = cv(S), x = c.getContext('2d'), bh = 41, bw = 107;
  x.fillStyle = '#8a7a66'; x.fillRect(0, 0, S, S);
  for (let r = 0; r * bh < S + bh; r++) for (let k = -1; k < 4; k++) {
    const bx = k * bw + (r % 2 ? bw / 2 : 0);
    x.fillStyle = hsl(rand(10, 20), rand(38, 52), rand(28, 38)); x.fillRect(bx + 3, r * bh + 3, bw - 5, bh - 5);
  }
  specks(x, S, S, 90, () => `rgba(30, 14, 8, ${rand(0.3, 0.6)})`, 0.8, 2.5);
  grit(x, S, S, N, 0.45, 'multiply', 1);
  grit(x, S, S, G, 0.3, 'overlay');
  return c;
}

function enamelCanvas(N, G) {         // white enamel, chipped to black
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#e7e2d6'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const sx = rand(0, S), sy = rand(0, S), r = rand(1.5, 7);
    x.fillStyle = 'rgba(140, 70, 30, 0.35)'; x.beginPath(); x.ellipse(sx, sy, r + 2, r * 0.8 + 2, rand(0, 3), 0, TAU); x.fill();
    x.fillStyle = '#1b222b'; x.beginPath(); x.ellipse(sx, sy, r, r * 0.7, rand(0, 3), 0, TAU); x.fill();
  }
  grit(x, S, S, N, 0.25, 'multiply', 1);
  return c;
}

function crateCanvas(N, G) {          // pale crate slats (0.5 m)
  const S = 256, c = cv(S), x = c.getContext('2d'), slats = 4, sh = S / slats;
  for (let i = 0; i < slats; i++) {
    x.fillStyle = hsl(rand(28, 36), rand(22, 32), rand(38, 47)); x.fillRect(0, i * sh, S, sh - 6);
    x.fillStyle = 'rgba(15, 9, 6, 0.95)'; x.fillRect(0, i * sh + sh - 6, S, 6);
    for (let k = 0; k < 10; k++) { x.strokeStyle = `rgba(40, 25, 14, ${rand(0.08, 0.2)})`; x.lineWidth = 1; wavyLine(x, 0, i * sh + rand(2, sh - 8), S, true, 1.2, 0.03, k); }
  }
  grit(x, S, S, N, 0.4, 'multiply', 1);
  return c;
}

function clothCanvas(N, G) {          // near-white book cloth; book colours come from the material
  const S = 128, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#d6d1c7'; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  for (let i = 0; i < S; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  grit(x, S, S, N, 0.4, 'multiply', 1);
  grit(x, S, S, G, 0.3, 'overlay');
  return c;
}

function paperCanvas(N) {
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#e6d9bd'; x.fillRect(0, 0, S, S);
  grit(x, S, S, N, 0.25, 'multiply', 1);
  return c;
}

// ---------- printed and handwritten things ----------
function billCanvas(N) {
  const W = 512, H = 724, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#ece0c6'; x.fillRect(0, 0, W, H);
  grit(x, W, H, N, 0.22, 'multiply', 2);
  x.fillStyle = '#2b1d15'; x.textAlign = 'center';
  x.font = "34px 'Special Elite', 'Courier New', monospace"; x.fillText('H.R. COGSWELL & ASSOCIATES', W / 2, 74);
  x.font = "18px 'Special Elite', 'Courier New', monospace"; x.fillText('Liquidations, Acquisitions, & Futures', W / 2, 104);
  x.fillRect(48, 122, W - 96, 3);
  x.font = "24px 'Special Elite', 'Courier New', monospace"; x.fillText('NOTICE OF ARREARS', W / 2, 172);
  x.textAlign = 'left'; x.font = "17px 'Special Elite', 'Courier New', monospace";
  const lines = ['Account ........ ACKERMAN, J.', 'Solvency ....... CRITICAL', 'Water tax ...... 25 bits', 'Overdue ........ 14 days', 'Interest ....... compounding'];
  lines.forEach((l, i) => x.fillText(l, 64, 228 + i * 34));
  x.fillStyle = 'rgba(43, 29, 21, 0.45)';
  for (let i = 0; i < 9; i++) x.fillRect(64, 420 + i * 22, rand(260, 380), 7);
  x.save(); x.translate(330, 300); x.rotate(-0.2);
  x.strokeStyle = 'rgba(163, 38, 29, 0.8)'; x.lineWidth = 6; x.strokeRect(-110, -36, 220, 70);
  x.fillStyle = 'rgba(163, 38, 29, 0.8)'; x.font = "bold 46px Impact, 'Arial Narrow', sans-serif"; x.textAlign = 'center'; x.fillText('OVERDUE', 0, 16);
  x.restore();
  x.strokeStyle = 'rgba(80, 45, 20, 0.35)'; x.lineWidth = 7; x.beginPath(); x.arc(380, 610, 52, 0.4, 5.6); x.stroke();
  return c;
}

function notesCanvas(N) {
  const W = 1024, H = 680, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#8c6240'; x.fillRect(0, 0, W, H);
  specks(x, W, H, 2400, () => `rgba(40, 22, 10, ${rand(0.15, 0.4)})`, 0.6, 2);
  x.strokeStyle = '#4a3020'; x.lineWidth = 22; x.strokeRect(11, 11, W - 22, H - 22);
  const hand = "'Caveat', 'Bradley Hand', cursive";
  const notes = [
    { x: 60, y: 50, w: 420, h: 250, r: -0.03, lines: ['RUSTBUCKET', 'favouring left side', 'vents puffing fast', 'neck scales going grey', 'WATCH HIM'] },
    { x: 530, y: 46, w: 400, h: 190, r: 0.04, lines: ['Feed: dried scrub,', 'red shale, scrap shards.', "Grain's too dear."] },
    { x: 540, y: 270, w: 300, h: 170, r: -0.05, lines: ['Ask Scrimp re', 'intake valve.', 'Do NOT pay 3.'] },
    { x: 70, y: 350, w: 360, h: 260, r: 0.025, sketch: true },
    { x: 470, y: 470, w: 470, h: 160, r: 0.02, lines: ['Compass-weed in the', 'yard again. Check the pen.'], red: true },
  ];
  for (const n of notes) {
    x.save(); x.translate(n.x + n.w / 2, n.y + n.h / 2); x.rotate(n.r);
    x.fillStyle = 'rgba(0, 0, 0, 0.3)'; x.fillRect(-n.w / 2 + 6, -n.h / 2 + 8, n.w, n.h);
    x.fillStyle = '#ead9b8'; x.fillRect(-n.w / 2, -n.h / 2, n.w, n.h);
    x.fillStyle = n.red ? '#a3261d' : '#2b1d15'; x.textAlign = 'left';
    if (n.sketch) {
      x.strokeStyle = '#2b1d15'; x.lineWidth = 3; x.lineCap = 'round';
      x.beginPath(); x.ellipse(-10, 10, 110, 55, 0, 0, TAU); x.stroke();
      for (const lx of [-80, -40, 30, 70]) { x.beginPath(); x.moveTo(lx, 55); x.lineTo(lx, 95); x.stroke(); }
      x.beginPath(); x.ellipse(115, -20, 40, 30, 0.2, 0, TAU); x.stroke();
      x.beginPath(); x.moveTo(110, -48); x.lineTo(95, -80); x.stroke();
      x.beginPath(); x.moveTo(135, -45); x.lineTo(142, -58); x.stroke();
      for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(150 + k * 10, -70 - k * 14, 7, 0, TAU * 0.7); x.stroke(); }
      for (const sx of [-60, -20, 20]) { x.beginPath(); x.moveTo(sx, -20); x.lineTo(sx + 8, 30); x.stroke(); }
      x.font = `34px ${hand}`; x.fillText('Rustbucket (not to scale)', -n.w / 2 + 20, n.h / 2 - 16);
    } else {
      x.font = `44px ${hand}`;
      n.lines.forEach((l, i) => x.fillText(l, -n.w / 2 + 24, -n.h / 2 + 62 + i * 44));
    }
    x.fillStyle = '#a3261d'; x.beginPath(); x.arc(0, -n.h / 2 + 14, 9, 0, TAU); x.fill();
    x.restore();
  }
  return c;
}

function posterCanvas(N) {
  const W = 512, H = 732, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#ddcb9c'; x.fillRect(0, 0, W, H);
  grit(x, W, H, N, 0.35, 'multiply', 2);
  x.fillStyle = '#a3261d'; x.fillRect(0, 0, W, 34);
  x.fillStyle = '#2b1d15'; x.textAlign = 'center';
  x.font = "bold 104px 'Big Shoulders Stencil Display', Impact, 'Arial Narrow', sans-serif";
  x.fillText('HARMONY', W / 2, 170);
  x.fillStyle = '#a3261d'; x.font = "bold 54px 'Big Shoulders Stencil Display', Impact, sans-serif"; x.fillText('IS', W / 2, 240);
  x.fillStyle = '#2b1d15'; x.font = "bold 74px 'Big Shoulders Stencil Display', Impact, 'Arial Narrow', sans-serif"; x.fillText('PRODUCTIVITY', W / 2, 320);
  x.save(); x.translate(W / 2, 470); x.strokeStyle = '#2b1d15'; x.lineWidth = 14;
  x.beginPath(); x.arc(0, 0, 70, 0, TAU); x.stroke();
  for (let i = 0; i < 10; i++) { x.rotate(TAU / 10); x.fillStyle = '#2b1d15'; x.fillRect(-12, -98, 24, 30); }
  x.beginPath(); x.arc(0, 0, 26, 0, TAU); x.fillStyle = '#a3261d'; x.fill(); x.restore();
  x.fillStyle = '#4a3624'; x.font = "22px 'Special Elite', 'Courier New', monospace"; x.fillText('A message from the Corporate Council of Auria', W / 2, 640);
  x.fillStyle = 'rgba(60, 40, 25, 0.9)'; x.beginPath(); x.moveTo(W, H - 120); x.lineTo(W, H); x.lineTo(W - 90, H); x.closePath(); x.fill();
  return c;
}

function drawPhoto(x, W, H) {        // sepia print: the farm, two tall figures and a small one
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#e9d7b4'); g.addColorStop(0.62, '#cdb48a'); g.addColorStop(0.63, '#8f7250'); g.addColorStop(1, '#6d553a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#5b4630'; x.fillRect(W * 0.55, H * 0.36, W * 0.36, H * 0.27);
  x.beginPath(); x.moveTo(W * 0.52, H * 0.37); x.lineTo(W * 0.73, H * 0.24); x.lineTo(W * 0.94, H * 0.37); x.closePath(); x.fill();
  x.fillStyle = '#3e2f20'; x.fillRect(W * 0.66, H * 0.46, W * 0.06, H * 0.17);
  const fig = (fx, fh, w) => { x.fillStyle = '#f2e6cf'; x.beginPath(); x.arc(fx, H * 0.63 - fh - w * 0.9, w * 0.75, 0, TAU); x.fill(); x.fillStyle = '#3a2c1e'; x.fillRect(fx - w * 0.75, H * 0.63 - fh, w * 1.5, fh); };
  fig(W * 0.2, H * 0.3, W * 0.05); fig(W * 0.33, H * 0.28, W * 0.048); fig(W * 0.27, H * 0.15, W * 0.035);
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7); v.addColorStop(0, 'rgba(60, 40, 20, 0)'); v.addColorStop(1, 'rgba(60, 40, 20, 0.65)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255, 245, 225, 0.5)'; x.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const sx = rand(0, W); x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + rand(-20, 20), H); x.stroke(); }
}
function photoCanvas() { const c = cv(256, 192), x = c.getContext('2d'); drawPhoto(x, 256, 192); return c; }

function thermoCanvas(N) {
  const W = 64, H = 256, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#d8cdb3'; x.fillRect(0, 0, W, H);
  grit(x, W, H, N, 0.3, 'multiply', 1);
  x.strokeStyle = '#3b2a1e'; x.lineWidth = 3; x.strokeRect(2, 2, W - 4, H - 4);
  x.fillStyle = '#2b1d15'; x.font = "bold 13px 'Courier New', monospace"; x.textAlign = 'right';
  for (let t = 0; t <= 50; t += 5) {
    const y = 226 - t / 50 * 190;
    x.fillRect(t % 10 ? 40 : 34, y, t % 10 ? 10 : 16, 2);
    if (t % 10 === 0) x.fillText(String(t), 30, y + 5);
  }
  x.textAlign = 'center'; x.fillText('°C', W / 2, 20);
  specks(x, W, H, 30, 'rgba(140, 70, 30, 0.45)', 0.8, 2.5);
  return c;
}

function mirrorCanvas() {             // old silvering, flaking at the edges, cracked from one corner
  const W = 256, H = 352, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#c9ccc6'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const edge = R() < 0.5, sx = edge ? (R() < 0.5 ? rand(0, 30) : rand(W - 30, W)) : rand(0, W), sy = edge ? rand(0, H) : (R() < 0.5 ? rand(0, 30) : rand(H - 30, H));
    x.fillStyle = `rgba(40, 38, 34, ${rand(0.4, 0.85)})`; x.beginPath(); x.ellipse(sx, sy, rand(4, 20), rand(3, 14), rand(0, 3), 0, TAU); x.fill();
  }
  x.strokeStyle = 'rgba(25, 25, 25, 0.9)'; x.lineWidth = 1.6;
  const ox = W * 0.78, oy = H * 0.2;
  for (let i = 0; i < 6; i++) {
    let px = ox, py = oy, a = rand(1.6, 4.4);
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 7; s++) { a += rand(-0.4, 0.4); px += Math.cos(a) * rand(20, 50); py += Math.sin(a) * rand(20, 50); x.lineTo(px, py); }
    x.stroke();
  }
  return c;
}

function glassCanvas() {              // mostly clear; grime along the bottom, fly specks, one crack
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = 'rgba(205, 200, 185, 0.1)'; x.fillRect(0, 0, S, S);
  const g = x.createLinearGradient(0, S, 0, S * 0.65); g.addColorStop(0, 'rgba(120, 70, 40, 0.55)'); g.addColorStop(1, 'rgba(120, 70, 40, 0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  specks(x, S, S, 70, 'rgba(20, 14, 10, 0.6)', 0.6, 1.5);
  x.strokeStyle = 'rgba(255, 250, 235, 0.55)'; x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(10, 40); x.lineTo(70, 75); x.lineTo(100, 70); x.lineTo(160, 120); x.lineTo(175, 118); x.lineTo(246, 170); x.stroke();
  return c;
}

function idolCanvases(N, G) {         // verdigris bronze; the head carries the face, the tears and the crack
  const body = cv(128), b = body.getContext('2d');
  b.fillStyle = '#4e7d69'; b.fillRect(0, 0, 128, 128);
  noiseBlend(b, 128, 128, N, 0.45, 0.7, [78, 125, 105, 0], [138, 104, 58, 0.9]);
  for (let i = 0; i < 14; i++) { b.fillStyle = `rgba(30, 20, 14, ${rand(0.2, 0.5)})`; b.fillRect(rand(0, 128), rand(0, 128), rand(1, 2), rand(10, 40)); }
  const W = 512, H = 256, head = cv(W, H), h = head.getContext('2d');
  h.drawImage(body, 0, 0, W, H);
  const fx = W / 2, fy = H / 2;
  h.strokeStyle = '#1b2620'; h.lineWidth = 3; h.lineCap = 'round';
  for (const ex of [-17, 17]) { h.beginPath(); h.arc(fx + ex, fy - 14, 8, 0.15 * Math.PI, 0.85 * Math.PI); h.stroke(); }
  h.lineWidth = 2.4; h.beginPath(); h.arc(fx, fy - 6, 26, 0.12 * Math.PI, 0.88 * Math.PI); h.stroke();
  h.fillStyle = 'rgba(110, 34, 18, 0.85)';
  for (const ex of [-21, 21]) h.fillRect(fx + ex - 1.5, fy - 8, 3, 46);
  const crack = [[fx - 30, fy - 60], [fx - 12, fy - 34], [fx - 20, fy - 16], [fx + 4, fy - 2], [fx - 2, fy + 22], [fx + 16, fy + 50]];
  const drawCrack = (ctx) => { ctx.beginPath(); crack.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); };
  h.strokeStyle = '#120a10'; h.lineWidth = 2.6; drawCrack(h);
  const headE = cv(W, H), e = headE.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  e.strokeStyle = '#b58bff'; e.lineWidth = 3.2; e.lineCap = 'round'; e.shadowColor = '#8f5cff'; e.shadowBlur = 8; drawCrack(e);
  return { body, head, headE };
}

function labelCanvases(N) {
  const make = (bg, band, title, sub, fine) => {
    const W = 256, H = 128, c = cv(W, H), x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = band; x.fillRect(0, 10, W, 18); x.fillRect(0, H - 26, W, 14);
    x.fillStyle = '#231710'; x.textAlign = 'center';
    x.font = "bold 30px 'Special Elite', 'Courier New', monospace"; x.fillText(title, W / 2, 66);
    x.font = "16px 'Special Elite', 'Courier New', monospace"; x.fillText(sub, W / 2, 88);
    if (fine) { x.font = "10px 'Courier New', monospace"; x.fillText(fine, W / 2, 104); }
    grit(x, W, H, N, 0.45, 'multiply', 1);
    return c;
  };
  const faded = make('#d9ccb0', '#bfae8c', '', '', '');
  const fx = faded.getContext('2d');
  for (let i = 0; i < 5; i++) { const g = fx.createRadialGradient(rand(0, 256), rand(0, 128), 0, rand(0, 256), rand(0, 128), rand(30, 70)); g.addColorStop(0, 'rgba(110, 80, 40, 0.35)'); g.addColorStop(1, 'rgba(110, 80, 40, 0)'); fx.fillStyle = g; fx.fillRect(0, 0, 256, 128); }
  fx.fillStyle = 'rgba(40, 28, 18, 0.25)'; for (let i = 0; i < 3; i++) fx.fillRect(60, 52 + i * 14, rand(80, 140), 6);
  return [
    make('#b5432a', '#e7d3a8', 'SHALE-MASH', 'Human grade*', '*grade not guaranteed'),
    make('#c49a3a', '#efe0b8', 'GRUB PASTE', 'Protein. Mostly.', ''),
    faded,
  ];
}

function glintCanvas() {
  const S = 64, c = cv(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255, 240, 210, 1)'); g.addColorStop(0.25, 'rgba(255, 220, 170, 0.45)'); g.addColorStop(1, 'rgba(255, 220, 170, 0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(255, 245, 225, 0.7)'; x.fillRect(S / 2 - 0.75, 6, 1.5, S - 12); x.fillRect(6, S / 2 - 0.75, S - 12, 1.5);
  return c;
}

function makeTextures(maxAniso) {
  const tex = (c, { srgb = true, repeat = true, aniso = 4 } = {}) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(aniso, maxAniso);
    return t;
  };
  const N = makeNoise(256, 4, 5), G = makeNoise(256, 32, 2);
  const tin = tinCanvases(N, G), idol = idolCanvases(N, G);
  return {
    wall: tex(wallCanvas(N, G), { aniso: 8 }),
    floor: tex(floorCanvas(N, G), { aniso: 8 }),
    tin: tex(tin.color, { aniso: 8 }), tinN: tex(tin.normal, { srgb: false }), tinE: tex(tin.emissive),
    wood: tex(woodCanvas(N, G, false)), tableTop: tex(woodCanvas(N, G, true), { aniso: 8 }),
    iron: tex(ironCanvas(N, G)), canvas: tex(canvasCanvas(N, G)), hessian: tex(hessianCanvas(N, G)),
    brick: tex(brickCanvas(N, G)), enamel: tex(enamelCanvas(N, G)), crate: tex(crateCanvas(N, G)),
    cloth: tex(clothCanvas(N, G)), paper: tex(paperCanvas(N)),
    bill: tex(billCanvas(N), { repeat: false }), notes: tex(notesCanvas(N), { repeat: false, aniso: 8 }),
    poster: tex(posterCanvas(N), { repeat: false }), photo: tex(photoCanvas(), { repeat: false }),
    thermo: tex(thermoCanvas(N), { repeat: false }), mirror: tex(mirrorCanvas(), { repeat: false }),
    glass: tex(glassCanvas(), { repeat: false }),
    idolBody: tex(idol.body), idolHead: tex(idol.head, { repeat: false }), idolHeadE: tex(idol.headE, { repeat: false }),
    labels: labelCanvases(N).map(c => tex(c, { repeat: false })),
    glint: tex(glintCanvas(), { repeat: false }),
  };
}
// ============================================================
// Procedural textures for the yard, Jacob's body and the things
// you can find. Same rule as the shack: no image files at all.
// ============================================================

// draw a dot on a tiling canvas, repeating it across the edges so the texture stays seamless
function tileDot(x, S, cx, cy, r, fill) {
  x.fillStyle = fill;
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    const px = cx + ox, py = cy + oy;
    if (px < -r || px > S + r || py < -r || py > S + r) continue;
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
}
// tileable Voronoi: returns per-pixel {cell id, distance to the nearest edge}
function voronoi(S, n, stretchY = 1) {
  const pts = Array.from({ length: n }, () => [R() * S, R() * S]);
  const id = new Int16Array(S * S), edge = new Float32Array(S * S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < n; i++) {
      let dx = Math.abs(px - pts[i][0]), dy = Math.abs(py - pts[i][1]);
      if (dx > S / 2) dx = S - dx; if (dy > S / 2) dy = S - dy;
      const d = dx * dx + dy * dy * stretchY;
      if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
    }
    id[py * S + px] = best; edge[py * S + px] = Math.sqrt(d2) - Math.sqrt(d1);
  }
  return { id, edge, n };
}

function dirtCanvas(N, G) {           // red dust with pebbles and iron-shale flakes, tiles every 1.7 m
  const S = 512, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#a5532b'; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, N, 0.3, 0.75, [126, 58, 30, 0.0], [184, 100, 58, 0.75]);
  grit(x, S, S, G, 0.5, 'overlay');
  for (let i = 0; i < 70; i++) {          // flat flakes of iron shale
    const cx = rand(0, S), cy = rand(0, S), r = rand(2, 7);
    tileDot(x, S, cx, cy, r, `rgba(${46 + rand(0, 20)}, ${40 + rand(0, 14)}, ${44 + rand(0, 16)}, ${rand(0.35, 0.7)})`);
  }
  for (let i = 0; i < 520; i++) {         // pebbles, each with a sunny top edge
    const cx = rand(0, S), cy = rand(0, S), r = rand(0.6, 2.6), k = R();
    const col = k < 0.45 ? `rgba(58, 34, 26, ${rand(0.5, 0.9)})` : k < 0.8 ? `rgba(150, 66, 34, ${rand(0.6, 0.9)})` : `rgba(214, 170, 130, ${rand(0.5, 0.85)})`;
    tileDot(x, S, cx, cy, r, col);
    tileDot(x, S, cx - r * 0.3, cy - r * 0.3, r * 0.45, 'rgba(255, 220, 180, 0.25)');
  }
  x.strokeStyle = 'rgba(60, 24, 12, 0.35)'; x.lineWidth = 1.2;   // hairline cracks
  for (let i = 0; i < 12; i++) {
    let px = rand(20, S - 20), py = rand(20, S - 20); x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += rand(-26, 26); py += rand(-26, 26); x.lineTo(px, py); }
    x.stroke();
  }
  grit(x, S, S, N, 0.3, 'multiply', 2);
  return c;
}

// The yard seen from above, at 40 m across: paths worn by boots, tyre tracks, the trampled pen,
// ash, oil and the salt-white ring the Miser-Boab has sucked dry. Grey 186 is "no change".
function yardLayoutCanvas(N) {
  const W = 1024, SIZE = YARD.layoutSize, c = cv(W), x = c.getContext('2d');
  const P = (wx, wz) => [(wx / SIZE + 0.5) * W, (wz / SIZE + 0.5) * W], S = W / SIZE;
  x.fillStyle = 'rgb(186, 186, 186)'; x.fillRect(0, 0, W, W);
  // broad, gentle variation
  const v = cv(W), vx = v.getContext('2d'); vx.drawImage(N, 0, 0, W, W);
  x.save(); x.globalAlpha = 0.22; x.globalCompositeOperation = 'overlay'; x.drawImage(v, 0, 0); x.restore();
  const blob = (wx, wz, r, col, a = 1) => {
    const [px, py] = P(wx, wz), g = x.createRadialGradient(px, py, 0, px, py, r * S);
    g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
    x.fillStyle = g; x.fillRect(px - r * S, py - r * S, r * S * 2, r * S * 2);
  };
  const path = (pts, w, col) => {
    x.save(); x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = w * S; x.filter = `blur(${Math.round(w * S * 0.35)}px)`;
    x.beginPath(); pts.forEach(([wx, wz], i) => { const [px, py] = P(wx, wz); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); x.restore();
  };
  const Y = YARD;
  // the Beggar's Hand bed around the edge is bare and darker
  x.save(); x.strokeStyle = 'rgba(120, 104, 100, 0.55)'; x.lineWidth = 1.6 * S; x.filter = `blur(${Math.round(0.4 * S)}px)`;
  x.beginPath(); x.arc(W / 2, W / 2, (Y.R - 0.1) * S, 0, TAU); x.stroke(); x.restore();
  // worn paths: boots and hooves pack the dust lighter
  const pale = 'rgba(222, 204, 186, 0.55)';
  path([[-0.9, 0.7], [1.2, 2.2], [3.5, 3.2], [5.4, 3.4]], 1.0, pale);
  path([[-0.9, 0.7], [1.6, 0.6], [3.4, -1.0], [4.0, -4.0], [4.4, -5.3]], 0.8, pale);
  path([[-0.9, 0.7], [-3.4, 0.8], [-4.4, -2.0], [-5.6, -4.4]], 0.8, pale);
  path([[-0.9, 0.7], [0.2, 4.0], [0.8, 5.8]], 0.7, pale);
  path([[-4.4, -2.0], [-6.6, -6.6], [-9.0, -8.6]], 0.6, pale);
  path([[-3.4, 0.8], [-8.0, 1.4], [-13.0, 1.6]], 0.5, 'rgba(222, 204, 186, 0.35)');
  path([[3.5, 3.2], [3.6, -0.6], [4.4, -1.1]], 0.6, pale);
  // tractor tracks: from where it parks, past the house, out the north gate
  const track = [[-6.0, 5.8], [-5.2, 0.0], [-4.9, -4.0], [-4.0, -9.0], [-2.0, -13.5], [0.0, -17.6]];
  for (const off of [-0.72, 0.72]) path(track.map(([a, b], i) => [a + off * (i < 3 ? 1 : 0.85), b]), 0.34, 'rgba(120, 96, 88, 0.5)');
  path(track, 1.3, 'rgba(214, 196, 178, 0.3)');
  // the pen: trampled, dunged, iron-shale showing through
  {
    const [x0, y0] = P(Y.pen.x0, Y.pen.z0), [x1, y1] = P(Y.pen.x1, Y.pen.z1);
    x.save(); x.fillStyle = 'rgba(150, 128, 116, 0.55)'; x.filter = `blur(${Math.round(0.5 * S)}px)`; x.fillRect(x0, y0, x1 - x0, y1 - y0); x.restore();
    for (let i = 0; i < 60; i++) blob(rand(Y.pen.x0 + 0.4, Y.pen.x1 - 0.4), rand(Y.pen.z0 + 0.4, Y.pen.z1 - 0.4), rand(0.3, 0.9), 'rgba(70, 52, 44, A)', rand(0.25, 0.6));
    for (let i = 0; i < 26; i++) blob(rand(Y.pen.x0 + 0.5, Y.pen.x1 - 0.5), rand(Y.pen.z0 + 0.5, Y.pen.z1 - 0.5), rand(0.4, 1.1), 'rgba(110, 118, 132, A)', rand(0.25, 0.5));
    for (let i = 0; i < 300; i++) {          // hoof prints
      const [px, py] = P(rand(Y.pen.x0 + 0.3, Y.pen.x1 - 0.3), rand(Y.pen.z0 + 0.3, Y.pen.z1 - 0.3));
      x.fillStyle = `rgba(80, 60, 52, ${rand(0.2, 0.45)})`; x.beginPath(); x.ellipse(px, py, 0.07 * S, 0.09 * S, rand(0, 3), 0, TAU); x.fill();
    }
    const s = Y.shelter, [sx0, sy0] = P(s.x0, s.z0), [sx1, sy1] = P(s.x1, s.z1);
    x.fillStyle = 'rgba(120, 100, 92, 0.35)'; x.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    blob(Y.waterTrough.x + 0.3, (Y.waterTrough.z0 + Y.waterTrough.z1) / 2, 1.3, 'rgba(60, 40, 34, A)', 0.6);
  }
  // ash: the fire pit and the burn barrel
  blob(Y.firepit.x, Y.firepit.z, 1.2, 'rgba(70, 66, 64, A)', 0.9); blob(Y.firepit.x, Y.firepit.z, 0.55, 'rgba(26, 24, 24, A)', 0.95);
  blob(Y.barrel.x, Y.barrel.z, 0.9, 'rgba(84, 78, 74, A)', 0.7);
  // oil under the vehicles, a wet patch under the tank tap
  blob(Y.tractor.x + 0.2, Y.tractor.z - 1.0, 0.9, 'rgba(30, 24, 22, A)', 0.75);
  blob(Y.ute.x - 0.6, Y.ute.z - 1.3, 1.1, 'rgba(26, 22, 20, A)', 0.8);
  blob(Y.tank.x - 0.2, Y.tank.z + 1.1, 0.7, 'rgba(70, 48, 40, A)', 0.7);
  // under the house is always in shade
  { const [hx0, hy0] = P(-3.2, -5.9), [hx1, hy1] = P(3.2, -1.1); x.save(); x.fillStyle = 'rgba(110, 96, 92, 0.6)'; x.filter = `blur(${Math.round(0.3 * S)}px)`; x.fillRect(hx0, hy0, hx1 - hx0, hy1 - hy0); x.restore(); }
  // salt rings round every salt-bush, and the Miser-Boab's dead white circle
  for (const [bx, bz] of Y.saltbush) blob(bx, bz, 1.1, 'rgba(236, 228, 216, A)', 0.45);
  {
    const [bx, by] = P(Y.boab.x, Y.boab.z), r = Y.boab.kill * S;
    const g = x.createRadialGradient(bx, by, r * 0.2, bx, by, r);
    g.addColorStop(0, 'rgba(248, 245, 238, 0.98)'); g.addColorStop(0.75, 'rgba(244, 238, 228, 0.9)'); g.addColorStop(1, 'rgba(244, 238, 228, 0)');
    x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(96, 70, 60, 0.75)'; x.lineWidth = 1.4;
    for (let i = 0; i < 46; i++) {             // fissures
      const a = rand(0, TAU), d0 = rand(0.15, 0.85) * r;
      let px = bx + Math.cos(a) * d0, py = by + Math.sin(a) * d0; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 4; k++) { const b = a + rand(-1.2, 1.2), l = rand(4, 11); px += Math.cos(b) * l; py += Math.sin(b) * l; x.lineTo(px, py); }
      x.stroke();
    }
  }
  // the clothesline's worn circle
  { const [cx, cy] = P(Y.clothesline.x, Y.clothesline.z); x.strokeStyle = 'rgba(214, 196, 178, 0.35)'; x.lineWidth = 0.5 * S; x.beginPath(); x.arc(cx, cy, 1.4 * S, 0, TAU); x.stroke(); }
  // scuffs and dark scrub patches anywhere
  for (let i = 0; i < 90; i++) {
    const a = rand(0, TAU), d = Math.sqrt(R()) * (Y.R - 1);
    blob(Math.cos(a) * d, Math.sin(a) * d, rand(0.3, 1.2), R() < 0.5 ? 'rgba(150, 132, 122, A)' : 'rgba(206, 190, 176, A)', rand(0.15, 0.35));
  }
  return c;
}

function hideCanvas(N, G) {          // mooeow hide: rocky plates overlapping like strata (tiles every 1.2 m)
  const S = 256, c = cv(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  const vo = voronoi(S, 30, 2.2), tone = Array.from({ length: vo.n }, () => rand(0.75, 1.15));
  const nd = N.getContext('2d').getImageData(0, 0, 256, 256).data;
  for (let i = 0; i < S * S; i++) {
    const e = vo.edge[i], t = tone[vo.id[i]], n = nd[i * 4] / 255;
    const crack = e < 1.6 ? 0.25 + e * 0.25 : e < 4 ? 0.85 + (e - 1.6) * 0.07 : 1;
    const lip = e > 1.6 && e < 4.5 ? 1.12 : 1;           // the raised, sun-bleached edge of each plate
    const k = crack * lip * t * (0.82 + n * 0.36);
    d[i * 4] = clamp(136 * k, 0, 255); d[i * 4 + 1] = clamp(118 * k, 0, 255); d[i * 4 + 2] = clamp(104 * k, 0, 255); d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  specks(x, S, S, 900, () => R() < 0.5 ? `rgba(30, 24, 22, ${rand(0.2, 0.5)})` : `rgba(230, 216, 200, ${rand(0.12, 0.3)})`, 0.4, 1.1);
  grit(x, S, S, G, 0.25, 'overlay');
  return c;
}

function featherCanvas(N) {           // scruffy Panic-Fowl feathers: streaks in every direction
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#8f8576'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const px = rand(0, S), py = rand(0, S), a = rand(-0.6, 0.6) + Math.PI / 2, l = rand(6, 16);
    x.strokeStyle = R() < 0.5 ? `rgba(60, 52, 44, ${rand(0.25, 0.6)})` : `rgba(220, 210, 196, ${rand(0.2, 0.5)})`;
    x.lineWidth = rand(0.8, 2.2); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  grit(x, S, S, N, 0.35, 'multiply', 1);
  return c;
}

function furCanvas(N) {               // Riot-Devil: light-swallowing black, with dead red markings
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#0d0a0a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const px = rand(0, S), py = rand(0, S); x.strokeStyle = `rgba(${R() < 0.5 ? '40, 34, 32' : '4, 3, 3'}, ${rand(0.4, 0.8)})`;
    x.lineWidth = rand(0.6, 1.4); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-2, 2), py + rand(5, 12)); x.stroke();
  }
  x.strokeStyle = 'rgba(120, 22, 18, 0.75)'; x.lineWidth = 7; x.lineCap = 'round';
  for (let i = 0; i < 6; i++) { const y0 = 20 + i * 40; x.beginPath(); x.moveTo(rand(0, 40), y0); x.quadraticCurveTo(S / 2, y0 + rand(-26, 26), S - rand(0, 40), y0 + rand(-10, 10)); x.stroke(); }
  grit(x, S, S, N, 0.3, 'multiply', 1);
  return c;
}

function copperCanvas(N, G) {         // Jaw-Jaw shells: copper going to verdigris
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#b5683c'; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, N, 0.45, 0.7, [120, 62, 34, 0], [96, 52, 30, 0.8]);
  noiseBlend(x, S, S, G, 0.68, 0.82, [90, 160, 138, 0], [90, 160, 138, 0.85]);
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(255, 200, 150, ${rand(0.2, 0.5)})`; x.lineWidth = 0.8; const px = rand(0, S), py = rand(0, S); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-20, 20), py + rand(-6, 6)); x.stroke(); }
  return c;
}

function paintCanvas(N, G, paint, rustAmount = 0.5) {   // faded machine paint eaten by rust
  const S = 512, c = cv(S), x = c.getContext('2d');
  x.fillStyle = paint; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, G, 0.4, 0.8, [255, 245, 230, 0], [255, 245, 230, 0.25]);      // chalky sun fade
  noiseBlend(x, S, S, N, 0.62 - rustAmount * 0.25, 0.72 - rustAmount * 0.2, [120, 56, 26, 0], [104, 46, 22, 0.95]);
  for (let i = 0; i < 90; i++) {                    // rust runs down from every seam and bolt
    const px = rand(0, S), py = rand(0, S), l = rand(20, 90);
    const g = x.createLinearGradient(px, py, px, py + l); g.addColorStop(0, `rgba(110, 48, 20, ${rand(0.3, 0.6)})`); g.addColorStop(1, 'rgba(110, 48, 20, 0)');
    x.fillStyle = g; x.fillRect(px, py, rand(1.5, 4), l);
  }
  for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(200, 190, 175, ${rand(0.15, 0.4)})`; x.lineWidth = rand(0.6, 1.4); const px = rand(0, S), py = rand(0, S); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-30, 30), py + rand(-8, 8)); x.stroke(); }
  grit(x, S, S, N, 0.3, 'multiply', 2);
  grit(x, S, S, G, 0.2, 'overlay');
  return c;
}

function barkPlateCanvas(N, G) {     // Iron-Bark Sentinel: bark calcified into heavy metal plates
  const S = 256, c = cv(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  const vo = voronoi(S, 26, 0.18), tone = Array.from({ length: vo.n }, () => rand(0.7, 1.2));
  const nd = N.getContext('2d').getImageData(0, 0, 256, 256).data;
  for (let i = 0; i < S * S; i++) {
    const e = vo.edge[i], t = tone[vo.id[i]], n = nd[i * 4] / 255, gap = e < 2.2;
    const r = gap ? 34 : 88 * t * (0.8 + n * 0.4), g = gap ? 22 : 86 * t * (0.8 + n * 0.4), b = gap ? 16 : 90 * t * (0.8 + n * 0.4);
    d[i * 4] = r + (gap ? 0 : n * 30); d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  noiseBlend(x, S, S, G, 0.66, 0.8, [130, 60, 28, 0], [140, 64, 28, 0.7]);
  grit(x, S, S, G, 0.25, 'overlay');
  return c;
}

function boabCanvas(N, G) {          // Miser-Boab: pale, calcified, folded like a stomach
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#c9c0b0'; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, N, 0.35, 0.7, [150, 140, 126, 0], [224, 218, 206, 0.8]);
  for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(90, 80, 70, ${rand(0.2, 0.45)})`; x.lineWidth = rand(1, 3); wavyLine(x, 0, rand(0, S), S, true, rand(2, 6), 0.03, i); }
  for (let i = 0; i < 30; i++) { x.strokeStyle = 'rgba(70, 60, 52, 0.5)'; x.lineWidth = 1; let px = rand(0, S), py = rand(0, S); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += rand(-10, 10); py += rand(4, 14); x.lineTo(px, py); } x.stroke(); }
  specks(x, S, S, 300, () => `rgba(250, 248, 240, ${rand(0.3, 0.7)})`, 0.5, 1.5);
  return c;
}

function fuzzCanvas(N) {             // Beggar's Hand: bruised red stalks in fine sensory fuzz
  const S = 128, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#6e1a1a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 1600; i++) { const px = rand(0, S), py = rand(0, S); x.strokeStyle = R() < 0.6 ? `rgba(200, 80, 70, ${rand(0.2, 0.5)})` : `rgba(30, 6, 8, ${rand(0.3, 0.6)})`; x.lineWidth = 0.7; x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-3, 3), py + rand(-3, 3)); x.stroke(); }
  grit(x, S, S, N, 0.25, 'multiply', 1);
  return c;
}

function eyeCanvas() {               // a Scream-Pea flower: arterial red, lidded, jet-black pupil looking out along +z
  const W = 256, H = 128, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#9a1414'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(60, 4, 6, 0.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) { let px = rand(0, W), py = rand(0, H); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += rand(-12, 12); py += rand(-8, 8); x.lineTo(px, py); } x.stroke(); }
  const cx = W * 0.25, cy = H * 0.5;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, 30); g.addColorStop(0, '#e83c26'); g.addColorStop(0.5, '#c21c12'); g.addColorStop(1, 'rgba(154, 20, 20, 0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 15, 30, 0, 0, TAU); x.fill();
  x.fillStyle = '#050304'; x.beginPath(); x.ellipse(cx, cy, 5.5, 11, 0, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255, 240, 230, 0.85)'; x.beginPath(); x.ellipse(cx - 3, cy - 6, 2, 3.5, 0, 0, TAU); x.fill();
  return c;
}

function pantsCanvas(N, G) {          // tan work pants, kevlar-lined, torn where the spinifex got in (u: round the leg, v: shin 0–0.5, thigh 0.5–1)
  const S = 512, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#a58a62'; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(70, 52, 30, 0.13)'; x.lineWidth = 1;               // twill
  for (let i = -S; i < S; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
  x.strokeStyle = 'rgba(240, 225, 195, 0.07)';
  for (let i = -S; i < S; i += 7) { x.beginPath(); x.moveTo(i + 2, 0); x.lineTo(i + S + 2, S); x.stroke(); }
  // dust climbing up from the boots, grime at the knees
  const dust = x.createLinearGradient(0, S, 0, S * 0.55); dust.addColorStop(0, 'rgba(150, 66, 34, 0.55)'); dust.addColorStop(1, 'rgba(150, 66, 34, 0)');
  x.fillStyle = dust; x.fillRect(0, S * 0.55, S, S * 0.45);
  for (const v of [0.5, 0.52]) { const g = x.createRadialGradient(S * 0.5, S * (1 - v), 0, S * 0.5, S * (1 - v), 70); g.addColorStop(0, 'rgba(70, 48, 26, 0.35)'); g.addColorStop(1, 'rgba(70, 48, 26, 0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
  // side seams with stitching
  for (const u of [0.25, 0.75]) {
    x.fillStyle = 'rgba(60, 44, 26, 0.5)'; x.fillRect(u * S - 2, 0, 4, S);
    x.fillStyle = 'rgba(230, 210, 170, 0.5)'; for (let y = 0; y < S; y += 9) x.fillRect(u * S + 4, y, 1.5, 5);
  }
  // a sewn-on knee patch, darker canvas
  x.save(); x.translate(S * 0.52, S * 0.44); x.rotate(0.06);
  x.fillStyle = '#7d6748'; x.fillRect(-46, -40, 92, 80);
  grit(x, 92, 80, N, 0.3, 'multiply', 1);
  x.strokeStyle = 'rgba(230, 210, 170, 0.7)'; x.setLineDash([5, 4]); x.lineWidth = 1.6; x.strokeRect(-42, -36, 84, 72); x.setLineDash([]);
  x.restore();
  // tears: yellow kevlar weave showing through, frayed threads round the edge
  const tear = (cx, cy, w, h, a) => {
    x.save(); x.translate(cx, cy); x.rotate(a);
    x.beginPath(); for (let k = 0; k <= 14; k++) { const t = k / 14 * TAU, r = 1 + rand(-0.28, 0.2); x.lineTo(Math.cos(t) * w * r, Math.sin(t) * h * r); } x.closePath();
    x.fillStyle = '#4a3a20'; x.fill(); x.save(); x.clip();
    x.fillStyle = '#d3a82e'; x.fillRect(-w - 4, -h - 4, w * 2 + 8, h * 2 + 8);
    x.strokeStyle = 'rgba(120, 88, 20, 0.7)'; x.lineWidth = 1.2;
    for (let i = -w - 4; i < w + 4; i += 4) { x.beginPath(); x.moveTo(i, -h - 4); x.lineTo(i, h + 4); x.stroke(); }
    for (let i = -h - 4; i < h + 4; i += 4) { x.beginPath(); x.moveTo(-w - 4, i); x.lineTo(w + 4, i); x.stroke(); }
    const sh = x.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h)); sh.addColorStop(0.5, 'rgba(40, 26, 10, 0)'); sh.addColorStop(1, 'rgba(40, 26, 10, 0.6)'); x.fillStyle = sh; x.fillRect(-w - 4, -h - 4, w * 2 + 8, h * 2 + 8);
    x.restore();
    x.strokeStyle = 'rgba(236, 222, 190, 0.85)'; x.lineWidth = 1;
    for (let k = 0; k < 22; k++) { const t = rand(0, TAU); x.beginPath(); x.moveTo(Math.cos(t) * w, Math.sin(t) * h); x.lineTo(Math.cos(t) * w * rand(0.6, 0.9) + rand(-3, 3), Math.sin(t) * h * rand(0.6, 0.9) + rand(-3, 3)); x.stroke(); }
    x.restore();
  };
  tear(S * 0.46, S * 0.73, 20, 34, 0.3);      // shin, front
  tear(S * 0.57, S * 0.86, 12, 20, -0.4);
  tear(S * 0.62, S * 0.2, 16, 26, 0.2);       // thigh, front
  tear(S * 0.38, S * 0.3, 9, 14, -0.2);
  tear(S * 0.12, S * 0.66, 8, 22, 0.1);       // the side, where the barbed wire lives
  // frayed cuff at the very bottom
  x.strokeStyle = 'rgba(80, 60, 34, 0.8)'; x.lineWidth = 1;
  for (let i = 0; i < S; i += 3) { x.beginPath(); x.moveTo(i, S - 6); x.lineTo(i + rand(-2, 2), S - rand(0, 8)); x.stroke(); }
  grit(x, S, S, N, 0.28, 'multiply', 2);
  grit(x, S, S, G, 0.18, 'overlay');
  return c;
}

function bootCanvas(N, G) {           // heavy motorbike-style country boots: oiled leather, scuffed, red to the ankle
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#3e2a1c'; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, N, 0.4, 0.8, [52, 36, 24, 0], [96, 66, 44, 0.7]);
  for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(150, 120, 96, ${rand(0.12, 0.35)})`; x.lineWidth = rand(1, 3); const px = rand(0, S), py = rand(0, S); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-14, 14), py + rand(-4, 4)); x.stroke(); }
  x.strokeStyle = 'rgba(10, 6, 4, 0.5)'; x.lineWidth = 1.5;                  // creases
  for (let i = 0; i < 9; i++) wavyLine(x, 0, S * 0.55 + i * 9, S, true, 3, 0.05, i);
  x.strokeStyle = 'rgba(200, 170, 120, 0.4)'; x.setLineDash([4, 3]); x.lineWidth = 1;   // welt stitching
  for (const y of [S - 22, S - 14]) { x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
  x.setLineDash([]);
  const dust = x.createLinearGradient(0, S, 0, S * 0.45); dust.addColorStop(0, 'rgba(170, 76, 38, 0.8)'); dust.addColorStop(1, 'rgba(170, 76, 38, 0)');
  x.fillStyle = dust; x.fillRect(0, S * 0.45, S, S * 0.55);
  grit(x, S, S, G, 0.3, 'overlay');
  return c;
}

function skinCanvas(N) {             // a hand as pale as marble, red dust and grease worked into the creases
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#e4e6e8'; x.fillRect(0, 0, S, S);
  noiseBlend(x, S, S, N, 0.3, 0.8, [214, 218, 226, 0], [246, 244, 240, 0.7]);
  x.strokeStyle = 'rgba(130, 146, 170, 0.22)'; x.lineWidth = 1.1;
  for (let i = 0; i < 14; i++) wavyLine(x, rand(0, S), 0, S, false, rand(4, 12), 0.02, i);
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(150, 70, 40, ${rand(0.1, 0.3)})`; x.lineWidth = rand(0.6, 1.4); const px = rand(0, S), py = rand(0, S); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-10, 10), py + rand(-2, 2)); x.stroke(); }
  return c;
}

function rebarCanvas() {             // deformed bar: ribs, mill scale, rust, and a bright sharpened end (v = 1)
  const W = 64, H = 256, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#4c4744'; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 9) { x.fillStyle = 'rgba(20, 18, 16, 0.7)'; x.save(); x.translate(0, y); x.rotate(-0.25); x.fillRect(-4, 0, W + 8, 2.5); x.restore(); x.fillStyle = 'rgba(160, 150, 140, 0.35)'; x.fillRect(0, y + 3, W, 1); }
  x.fillStyle = 'rgba(20, 18, 16, 0.6)'; x.fillRect(W * 0.48, 0, 3, H);
  specks(x, W, H, 120, () => `rgba(150, 70, 30, ${rand(0.3, 0.7)})`, 0.6, 2.4);
  const g = x.createLinearGradient(0, 0, 0, 60); g.addColorStop(0, 'rgba(225, 222, 215, 0.95)'); g.addColorStop(1, 'rgba(225, 222, 215, 0)');
  x.fillStyle = g; x.fillRect(0, 0, W, 60);
  return c;
}

function wireMeshCanvas() {          // chicken wire, hexagons on nothing
  const S = 256, c = cv(S), x = c.getContext('2d'), r = 16;
  x.strokeStyle = 'rgba(150, 140, 128, 1)'; x.lineWidth = 2;
  for (let row = -1; row < S / (r * 1.5) + 1; row++) for (let col = -1; col < S / (r * Math.sqrt(3)) + 1; col++) {
    const cx = col * r * Math.sqrt(3) + (row % 2 ? r * Math.sqrt(3) / 2 : 0), cy = row * r * 1.5;
    x.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.stroke();
  }
  return c;
}

function puffCanvas(N) {             // a soft puff for steam, smoke and dust
  const S = 64, c = cv(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); g.addColorStop(0.45, 'rgba(255, 255, 255, 0.45)'); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 0.35; x.drawImage(N, 0, 0, S, S);
  return c;
}
function sparkCanvas() {
  const S = 32, c = cv(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(0.2, 'rgba(255, 230, 170, 0.9)'); g.addColorStop(1, 'rgba(255, 160, 60, 0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}

function tyreCanvas(N) {             // tractor tread, cracked and dusty (u runs round the tyre)
  const W = 512, H = 64, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#1d1a19'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2f2a28';
  for (let i = 0; i < W; i += 21) { x.save(); x.translate(i, H / 2); x.beginPath(); x.moveTo(0, -H * 0.42); x.lineTo(9, -H * 0.42); x.lineTo(2, 0); x.lineTo(9, H * 0.42); x.lineTo(0, H * 0.42); x.lineTo(-7, 0); x.closePath(); x.fill(); x.restore(); }
  noiseBlend(x, W, H, N, 0.5, 0.8, [150, 70, 36, 0], [150, 70, 36, 0.55]);
  return c;
}

function logCanvas(N, G) {           // Ironbark: near-black, deeply furrowed, a dull metallic glint in the ridges
  const S = 256, c = cv(S), x = c.getContext('2d');
  x.fillStyle = '#2a2624'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) { x.strokeStyle = `rgba(${R() < 0.5 ? '8, 6, 6' : '96, 90, 86'}, ${rand(0.4, 0.8)})`; x.lineWidth = rand(1.5, 5); wavyLine(x, rand(0, S), 0, S, false, rand(2, 6), 0.03, i); }
  specks(x, S, S, 120, () => `rgba(150, 70, 36, ${rand(0.2, 0.5)})`, 0.5, 1.8);
  grit(x, S, S, G, 0.3, 'overlay');
  return c;
}

// ---------- the small found things ----------
function textCanvas(W, H, paint) { const c = cv(W, H), x = c.getContext('2d'); paint(x, W, H); return c; }
const TYPE = "'Special Elite', 'Courier New', monospace", HAND = "'Caveat', 'Bradley Hand', cursive";
function foundCanvases(N) {
  return {
    card: textCanvas(256, 160, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2f7f86'); g.addColorStop(1, '#1d4c63'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      noiseBlend(x, W, H, N, 0.4, 0.8, [255, 250, 240, 0], [255, 250, 240, 0.35]);
      x.fillStyle = '#c9a548'; x.fillRect(26, 52, 40, 30); x.strokeStyle = 'rgba(80, 60, 20, 0.7)'; x.strokeRect(26, 52, 40, 30); x.beginPath(); x.moveTo(46, 52); x.lineTo(46, 82); x.moveTo(26, 67); x.lineTo(66, 67); x.stroke();
      x.fillStyle = 'rgba(255, 255, 255, 0.85)'; x.font = `bold 22px ${TYPE}`; x.fillText('SAVER', 24, 36);
      x.font = `17px ${TYPE}`; x.fillText('•••• •••• •••• 1952', 24, 112); x.font = `12px ${TYPE}`; x.fillText('VALID THRU 08/31', 24, 132); x.fillText('J CITIZEN', 24, 148);
    }),
    tag: textCanvas(128, 256, (x, W, H) => {
      x.fillStyle = '#efeae0'; x.fillRect(0, 0, W, H); x.fillStyle = '#2b2622'; x.textAlign = 'center';
      x.font = `bold 15px ${TYPE}`; x.fillText('DO NOT', W / 2, 40); x.fillText('REMOVE', W / 2, 60);
      x.font = `10px ${TYPE}`; ['UNDER PENALTY', 'OF LAW THIS TAG', 'NOT TO BE', 'REMOVED EXCEPT', 'BY THE CONSUMER'].forEach((l, i) => x.fillText(l, W / 2, 90 + i * 15));
      x.strokeStyle = '#2b2622'; x.strokeRect(20, 186, 24, 20); x.beginPath(); x.arc(70, 196, 10, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(90, 206); x.lineTo(102, 186); x.lineTo(114, 206); x.closePath(); x.stroke();
      grit(x, W, H, N, 0.25, 'multiply', 1);
    }),
    mat: textCanvas(512, 256, (x, W, H) => {
      x.fillStyle = '#8b6232'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 2600; i++) { x.strokeStyle = `rgba(${R() < 0.5 ? '60, 38, 18' : '190, 150, 96'}, ${rand(0.3, 0.7)})`; x.lineWidth = 1.2; const px = rand(0, W), py = rand(0, H); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rand(-3, 3), py + rand(-6, 6)); x.stroke(); }
      x.fillStyle = 'rgba(24, 16, 10, 0.85)'; x.textAlign = 'center'; x.font = `bold 92px Impact, 'Arial Narrow', sans-serif`; x.fillText('WELCOME', W / 2, H / 2 + 32);
      noiseBlend(x, W, H, N, 0.55, 0.75, [150, 70, 36, 0], [150, 70, 36, 0.6]);
    }),
    library: textCanvas(256, 160, (x, W, H) => {
      x.fillStyle = '#e6d6a8'; x.fillRect(0, 0, W, H); x.fillStyle = '#3b2f22'; x.font = `bold 13px ${TYPE}`; x.fillText('DATE DUE', 14, 22);
      x.strokeStyle = 'rgba(60, 50, 40, 0.5)'; for (let y = 32; y < H; y += 16) { x.beginPath(); x.moveTo(10, y); x.lineTo(W - 10, y); x.stroke(); }
      x.fillStyle = 'rgba(90, 40, 120, 0.8)'; x.font = `13px ${TYPE}`; ['14 MAR', '28 MAR', '11 APR', '25 APR', '09 MAY'].forEach((d, i) => x.fillText(d, 18 + (i % 2) * 120, 46 + i * 16));
      x.fillStyle = 'rgba(160, 30, 24, 0.75)'; x.font = `16px ${HAND}`; x.fillText('due back in fourteen days', 40, 146);
      grit(x, W, H, N, 0.3, 'multiply', 1);
    }),
    ruler: textCanvas(512, 48, (x, W, H) => {
      x.fillStyle = '#d8b46a'; x.fillRect(0, 0, W, H); x.fillStyle = '#231a12';
      for (let i = 0; i <= 300; i++) { const px = 6 + i * (W - 12) / 300, l = i % 10 === 0 ? 16 : i % 5 === 0 ? 11 : 6; x.fillRect(px, 0, 1, l); if (i % 10 === 0) { x.font = `10px ${TYPE}`; x.fillText(String(i / 10), px - 3, 28); } }
      x.font = `11px ${TYPE}`; x.fillText('MY SCHOOL RULER – 30 cm', 150, 42);
      grit(x, W, H, N, 0.3, 'multiply', 1);
    }),
    page: textCanvas(256, 320, (x, W, H) => {
      x.fillStyle = '#e4d5b2'; x.fillRect(0, 0, W, H); x.fillStyle = '#2f241b'; x.font = `bold 13px ${TYPE}`; x.fillText('FIELD GUIDE · VOL. IX', 16, 24); x.textAlign = 'right'; x.fillText('IX', W - 16, 24); x.textAlign = 'left';
      x.fillStyle = 'rgba(47, 36, 27, 0.55)'; for (let i = 0; i < 9; i++) x.fillRect(16, 44 + i * 11, rand(170, 224), 4);
      x.strokeStyle = '#2f241b'; x.lineWidth = 2; x.beginPath(); x.ellipse(128, 200, 60, 30, 0, 0, TAU); x.stroke();
      for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(80 + k * 18, 222); x.lineTo(74 + k * 18, 246); x.stroke(); }
      x.beginPath(); x.moveTo(188, 196); x.lineTo(214, 184); x.lineTo(200, 206); x.stroke();
      x.font = `15px ${HAND}`; x.fillText('Jaw-Jaw. Copper. Do not', 20, 280); x.fillText('leave the bonnet up.', 20, 298);
      x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(W, 0); for (let y = 0; y <= H; y += 12) x.lineTo(W - rand(4, 22), y); x.lineTo(W, H); x.closePath(); x.fill();
      grit(x, W, H, N, 0.3, 'multiply', 1);
    }),
    slate: textCanvas(192, 256, (x, W, H) => {
      x.fillStyle = '#2c2f33'; x.fillRect(0, 0, W, H); noiseBlend(x, W, H, N, 0.4, 0.8, [40, 44, 50, 0], [70, 74, 80, 0.8]);
      x.strokeStyle = 'rgba(220, 220, 214, 0.75)'; x.lineWidth = 2.5; x.lineCap = 'round';
      x.beginPath(); x.arc(96, 70, 12, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(96, 82); x.lineTo(92, 140); x.lineTo(76, 190); x.moveTo(92, 140); x.lineTo(110, 188); x.moveTo(94, 100); x.lineTo(124, 120); x.moveTo(126, 60); x.lineTo(122, 200); x.moveTo(94, 100); x.lineTo(72, 124); x.stroke();
      x.fillStyle = 'rgba(220, 220, 214, 0.8)'; x.font = `16px ${TYPE}`; x.textAlign = 'center'; x.fillText('THE WANDERER', W / 2, 232);
    }),
    stencil: textCanvas(256, 96, (x, W, H) => {
      x.fillStyle = '#6f6a64'; x.fillRect(0, 0, W, H); noiseBlend(x, W, H, N, 0.45, 0.75, [120, 60, 30, 0], [120, 56, 26, 0.8]);
      x.globalCompositeOperation = 'destination-out'; x.font = `800 70px 'Big Shoulders Stencil Display', Impact, sans-serif`; x.textAlign = 'center'; x.fillText('…IPPS', W / 2, 74);
    }),
    lure: textCanvas(128, 64, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2f6b34'); g.addColorStop(0.45, '#c9c25a'); g.addColorStop(0.55, '#dcdcd0'); g.addColorStop(1, '#f2f0e8'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(20, 40, 20, 0.7)'; for (let i = 0; i < 6; i++) x.fillRect(10 + i * 18, 0, 6, 26);
      x.fillStyle = '#b01e18'; x.fillRect(0, 34, 18, 20);
    }),
    candle: textCanvas(64, 64, (x, W, H) => {
      x.fillStyle = '#f3e4e8'; x.fillRect(0, 0, W, H); x.strokeStyle = '#e0708c'; x.lineWidth = 7;
      for (let i = -2; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 16); x.lineTo(W, i * 16 + 32); x.stroke(); }
    }),
  };
}

function makeYardTextures(maxAniso) {
  const tex = (c, { srgb = true, repeat = true, aniso = 4, flipY = true } = {}) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(aniso, maxAniso);
    t.flipY = flipY;
    return t;
  };
  const N = makeNoise(256, 4, 5), G = makeNoise(256, 32, 2);
  const f = foundCanvases(N);
  const found = {}; for (const k in f) found[k] = tex(f[k], { repeat: false });
  return {
    dirt: tex(dirtCanvas(N, G), { aniso: 8 }),
    layout: tex(yardLayoutCanvas(N), { repeat: false, aniso: 4, flipY: false }),
    hide: tex(hideCanvas(N, G)), feather: tex(featherCanvas(N)), fur: tex(furCanvas(N)), copper: tex(copperCanvas(N, G)),
    tractorPaint: tex(paintCanvas(N, G, '#9c3a24', 0.55), { aniso: 8 }), utePaint: tex(paintCanvas(N, G, '#86a2a6', 0.7), { aniso: 8 }),
    ironbark: tex(barkPlateCanvas(N, G)), boab: tex(boabCanvas(N, G)), fuzz: tex(fuzzCanvas(N)), eye: tex(eyeCanvas(), { repeat: false }),
    mesh: tex(wireMeshCanvas(), { srgb: true }), puff: tex(puffCanvas(N), { repeat: false }), spark: tex(sparkCanvas(), { repeat: false }),
    tyre: tex(tyreCanvas(N)), log: tex(logCanvas(N, G)),
    found,
  };
}

// Jacob's own textures are made at boot, so his boots are there in the shack too
function makeBodyTextures(maxAniso) {
  const tex = (c, aniso = 4) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(aniso, maxAniso); return t; };
  const N = makeNoise(256, 4, 5), G = makeNoise(256, 32, 2);
  return { pants: tex(pantsCanvas(N, G), 8), boot: tex(bootCanvas(N, G)), skin: tex(skinCanvas(N)), rebar: tex(rebarCanvas()) };
}
// ============================================================
// Shared building helpers: matrices, merged batches, UVs, glints
// and little particle pools. Used by the shack and the yard alike.
// ============================================================
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

function mergeGeos(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const col = list.some(g => g.attributes.color) ? new Float32Array(count * 3).fill(1) : null;   // vertex tints, white where a piece has none
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3);
    o += c; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}

// Box projection: UVs from world position along the dominant normal axis, so pieces tile seamlessly.
function worldUV(g, scale, off) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / scale + off[0]; uv[i * 2 + 1] = v / scale + off[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Collects pieces per material and merges them into one mesh each, so a whole room is a handful of draw calls.
class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix, uv = { mode: 'world', scale: 1 }) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    if (uv.mode === 'world') worldUV(g, uv.scale, uv.offset || [R(), R()]);
    else if (uv.mode === 'scale') { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uv.su, a.getY(i) * uv.sv); }
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, list = []);
    list.push(g);
  }
  box(mat, x0, y0, z0, x1, y1, z1, uv) {
    this.add(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), uv);
  }
  cyl(mat, rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10, texScale = 0.5, open = false) {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, M(x, y, z, rx, ry, rz), { mode: 'scale', su: (TAU * Math.max(rt, rb)) / texScale, sv: h / texScale });
  }
  // a beam between two points (square section), handy for rails, struts and bracing
  beam(mat, ax, ay, az, bx, by, bz, w, h = w, uv = { mode: 'world', scale: 1 }) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(w, h, len);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), Math.abs(dy) > len * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.add(g, mat, m, uv);
  }
  // a round rod between two points
  rod(mat, ax, ay, az, bx, by, bz, r, seg = 6, texScale = 0.5) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    const m = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1));
    this.add(g, mat, m, { mode: 'scale', su: (TAU * r) / texScale, sv: len / texScale });
  }
  build(parent, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, list] of this.groups) {
      const mesh = new THREE.Mesh(mergeGeos(list), mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      parent.add(mesh); out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

function solidCells(z0, z1, y0, y1, holes) {
  const zs = [...new Set([z0, z1, ...holes.flatMap(h => [h[0], h[1]])].filter(v => v >= z0 && v <= z1))].sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...holes.flatMap(h => [h[2], h[3]])].filter(v => v >= y0 && v <= y1))].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let run = null;
    for (let i = 0; i < zs.length - 1; i++) {
      const cz = (zs[i] + zs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      const hole = holes.some(h => cz > h[0] && cz < h[1] && cy > h[2] && cy < h[3]);
      if (!hole) { if (run) run[1] = zs[i + 1]; else run = [zs[i], zs[i + 1], ys[j], ys[j + 1]]; }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}

function lathe(points, seg = 22) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

const std = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, envMapIntensity: 0.45, ...o });

// ---------- surface relief: a normal map worked out from a canvas texture's own light and dark ----------
function normalCanvas(src, strength = 2) {
  const w = src.width, h = src.height, s = src.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (s[i * 4] * 0.3 + s[i * 4 + 1] * 0.59 + s[i * 4 + 2] * 0.11) / 255;
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  const out = cv(w, h), ctx2 = out.getContext('2d'), img = ctx2.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * w + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  ctx2.putImageData(img, 0, 0);
  return out;
}
const _reliefCache = new Map();
function reliefFor(map, strength) {
  let t = _reliefCache.get(map);
  if (t) return t;
  t = new THREE.CanvasTexture(normalCanvas(map.image, strength));
  t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = map.anisotropy;
  t.repeat.copy(map.repeat); t.offset.copy(map.offset); t.center.copy(map.center); t.rotation = map.rotation;
  _reliefCache.set(map, t);
  return t;
}
// give every material in a scene whose colour texture is on the list a matching normal map
function applyRelief(scene, list) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.map || m.normalMap || !m.isMeshStandardMaterial || !list.has(m.map) || !(m.map.image instanceof HTMLCanvasElement)) continue;
      const k = list.get(m.map);
      m.normalMap = reliefFor(m.map, k.strength || 2); m.normalScale.set(k.scale || 1, k.scale || 1); m.needsUpdate = true;
    }
  });
}

// Push every vertex of a geometry along its direction from the centre by a little noise – rocks, hides, lumps.
function lumpify(geo, amount, freq = 3, seed = 0) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq * 1.7 + seed) * Math.sin(v.y * freq * 2.3 + seed * 1.3) * Math.sin(v.z * freq * 1.9 + seed * 0.7)
      + 0.5 * Math.sin(v.x * freq * 4.1 + seed * 2.1) * Math.sin(v.z * freq * 3.7 + seed);
    const len = v.length() || 1;
    v.multiplyScalar(1 + (n * amount) / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- glints: one Points draw call for every "you haven't looked at this yet" twinkle ----------
function makeGlints(positions, tex, { size = 0.07, color = 0xffe2b0, near = 0.4, far = 1.0, strength = 1 } = {}) {
  const n = positions.length, pos = new Float32Array(n * 3), phase = new Float32Array(n), on = new Float32Array(n);
  positions.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); phase[i] = rand(0, TAU); on[i] = 1; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aOn', new THREE.BufferAttribute(on, 1));
  const u = { uTex: { value: tex }, uTime: { value: 0 }, uScale: { value: 400 }, uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uNear: { value: near }, uFar: { value: far }, uStrength: { value: strength }, ...POSTU };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aPhase; attribute float aOn; uniform float uTime; uniform float uScale; uniform float uSize; uniform float uNear; uniform float uFar; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vA = aOn * (0.22 + 0.28 * (0.5 + 0.5 * sin(uTime * 2.2 + aPhase))) * smoothstep(uNear, uFar, d);
        gl_PointSize = aOn > 0.5 ? max(2.0, uSize * uScale / d) : 0.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: POST_GLSL + `uniform sampler2D uTex; uniform vec3 uColor; uniform float uStrength; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(postAdd(uColor * t.rgb * (t.a * vA * uStrength * 2.0)), 1.0); }`,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false; points.renderOrder = 5;
  return {
    points, uniforms: u,
    set(i, visible) { on[i] = visible ? 1 : 0; g.attributes.aOn.needsUpdate = true; },
    move(i, p) { pos.set([p.x, p.y, p.z], i * 3); g.attributes.position.needsUpdate = true; },
  };
}

// ---------- a pool of soft particles (steam, smoke, sparks, feathers, splashes) ----------
class Particles {
  constructor(max, tex, { additive = false, fog = true, color = 0xffffff, renderOrder = 6 } = {}) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max);
    this.alpha = new Float32Array(max); this.a0 = new Float32Array(max);
    this.col = new Float32Array(max * 3); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.sizeNow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizeNow, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.u = { uTex: { value: tex }, uScale: { value: 400 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, uTint: { value: new THREE.Color(color) }, ...POSTU };
    this.useFog = fog;
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC; varying float vFogDepth;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vFogDepth = -mv.z; vA = aAlpha; vC = aColor;
          gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: POST_GLSL + `uniform sampler2D uTex; uniform vec3 uTint; uniform vec3 fogColor; uniform float fogDensity; varying float vA; varying vec3 vC; varying float vFogDepth;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); vec3 c = t.rgb * vC * uTint;
          float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          ${additive ? 'gl_FragColor = vec4(postAdd(c * (t.a * vA * (1.0 - f))), 1.0);' : `vec3 cf = mix(c, fogColor, f); float a = t.a * vA;
          // through the post chain this blends in linear light, where a pale puff over dark ground reads far stronger than it
          // did on screen: thin the pale ones out, keep dark smoke dense
          if (uPostLin > 0.5) a = pow(a, mix(0.85, 2.0, smoothstep(0.25, 0.75, dot(cf, vec3(0.299, 0.587, 0.114)))));
          gl_FragColor = vec4(postOut(cf), a);`} }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = renderOrder;
    this.geo = g;
  }
  emit(x, y, z, { vx = 0, vy = 0, vz = 0, life = 1, size = 0.1, size1 = null, alpha = 1, color = [1, 1, 1], drag = 1, grav = 0, spread = 0 } = {}) {
    let i = this.n < this.max ? this.n++ : (this._r = ((this._r || 0) + 1) % this.max);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx + (R() - 0.5) * spread; this.vel[i * 3 + 1] = vy + (R() - 0.5) * spread; this.vel[i * 3 + 2] = vz + (R() - 0.5) * spread;
    this.life[i] = life; this.age[i] = 0; this.size0[i] = size; this.size1[i] = size1 ?? size; this.a0[i] = alpha; this.alpha[i] = alpha;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.drag[i] = drag; this.grav[i] = grav; this.sizeNow[i] = size;
  }
  update(dt, scene) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.copy(--n, i); i--; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.sizeNow[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.alpha[i] = this.a0[i] * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    this.n = n;
    const g = this.geo;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aColor.needsUpdate = true;
    if (this.useFog && scene && scene.fog) { this.u.fogColor.value.copy(scene.fog.color); this.u.fogDensity.value = scene.fog.density || 0; }
    else this.u.fogDensity.value = 0;
  }
  copy(from, to) {
    if (from === to) return;
    for (const [arr, w] of [[this.pos, 3], [this.vel, 3], [this.col, 3]]) for (let k = 0; k < w; k++) arr[to * w + k] = arr[from * w + k];
    for (const arr of [this.life, this.age, this.size0, this.size1, this.alpha, this.a0, this.drag, this.grav, this.sizeNow]) arr[to] = arr[from];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// Collision shapes for walking: circles, axis-aligned rectangles and thick segments.
function pushOut(p, r, c) {
  if (c.off) return;
  if (c.type === 'obb') {           // a rotated rectangle: solve in its own frame, then rotate back
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), dx = p.x - c.x, dz = p.z - c.z;
    const q = { x: dx * co - dz * s, z: dx * s + dz * co };
    pushOut(q, r, { type: 'rect', x0: -c.hw, z0: -c.hd, x1: c.hw, z1: c.hd });
    p.x = c.x + q.x * co + q.z * s; p.z = c.z - q.x * s + q.z * co;
    return;
  }
  if (c.type === 'circle') {
    const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz, rr = r + c.r;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-4; p.x = c.x + dx / d * rr; p.z = c.z + dz / d * rr;
  } else if (c.type === 'seg') {
    const ex = c.bx - c.ax, ez = c.bz - c.az, l2 = ex * ex + ez * ez;
    const t = clamp(((p.x - c.ax) * ex + (p.z - c.az) * ez) / l2, 0, 1);
    const qx = c.ax + ex * t, qz = c.az + ez * t, dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz, rr = r + (c.r || 0.05);
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2);
    if (d > 1e-4) { p.x = qx + dx / d * rr; p.z = qz + dz / d * rr; }
    else { const nx = -ez / Math.sqrt(l2), nz = ex / Math.sqrt(l2); p.x = qx + nx * rr; p.z = qz + nz * rr; }
  } else {
    const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), push = (r - d) / d; p.x += dx * push; p.z += dz * push; }
    else {
      const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b);
      if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
    }
  }
}
const rectC = (x0, z0, x1, z1) => ({ type: 'rect', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const circC = (x, z, r) => ({ type: 'circle', x, z, r });
const segC = (ax, az, bx, bz, r = 0.06) => ({ type: 'seg', ax, az, bx, bz, r });

// An interactable thing: a box to aim at, a name and a verb (either can be a function of the moment).
function IT(id, name, verb, cx, cy, cz, sx, sy, sz, glint, extra = {}) {
  return {
    id, name, verb,
    box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz)),
    center: new THREE.Vector3(cx, cy, cz), size: new THREE.Vector3(sx, sy, sz),
    glintAt: glint ? new THREE.Vector3(...glint) : new THREE.Vector3(cx, cy + sy / 2 + 0.04, cz),
    ...extra,
  };
}
function moveItem(it, cx, cy, cz) { it.center.set(cx, cy, cz); it.box.setFromCenterAndSize(it.center, it.size); }
const valueOf = (v) => typeof v === 'function' ? v() : v;
// ============================================================
// Post-processing and graphics quality. On anything but "low" the
// world is drawn into a linear HDR target (multisampled), ambient
// occlusion is worked out from its depth, Jacob's hand is drawn on
// top, then bloom and sun shafts are added and the lot is tone-mapped,
// graded, vignetted and dithered onto the screen. "Low" draws straight
// to the screen the old way, for slow phones.
// ============================================================
const POSTU = { uPostLin: { value: 0 }, uPostExpo: { value: 1 }, uPostBase: { value: 0.2 } };
// three's ACES matrices (GLSL column order) and their inverses, so custom shaders can hand the post chain
// a linear colour that comes back out of the tone curve exactly as they meant it
const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];
const glslMat3 = (a) => `mat3(${a.map(v => v.toFixed(7)).join(', ')})`;
const invMat3 = (a) => new THREE.Matrix3().fromArray(a).invert().elements.slice();
// Every custom shader that writes a display-ready colour ends with postOut(c).
const POST_GLSL = `
uniform float uPostLin; uniform float uPostExpo; uniform float uPostBase;
vec3 postOut(vec3 c) {
  if (uPostLin < 0.5) return c;
  c = clamp(c, 0.0, 0.99);
  c = mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
  vec3 u = clamp(${glslMat3(invMat3(ACES_OUT))} * c, 0.0, 0.99);
  vec3 A = 1.0 - 0.983729 * u, B = 0.0245786 - 0.4329510 * u, C = -(0.000090537 + 0.238081 * u);
  vec3 v = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  return max(${glslMat3(invMat3(ACES_IN))} * v, 0.0) * 0.6 / uPostExpo;
}
// An additive glow, given as what it adds on screen over a typical background for the place (uPostBase),
// turned into the light the post chain has to add to land there. Draw with alpha 1: vec4(postAdd(colour * a), 1.0).
vec3 postAdd(vec3 c) {
  if (uPostLin < 0.5) return c;
  vec3 b = vec3(uPostBase);
  return max(postOut(min(b + c, vec3(0.99))) - postOut(b), 0.0);
}`;
const ACES_GLSL = `
vec3 postRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 acesFilmic(vec3 color, float exposure) {
  color *= exposure / 0.6;
  color = ${glslMat3(ACES_IN)} * color;
  color = postRRT(color);
  color = ${glslMat3(ACES_OUT)} * color;
  return clamp(color, 0.0, 1.0);
}`;

// ---------- quality presets ----------
const QUALITY = {
  low: { label: 'Low', post: false, ao: 0, msaa: 0, ratio: 1.0, shadow: 2048, shadowRadius: 1.5, shafts: false, bloom: false, aniso: 4 },
  medium: { label: 'Medium', post: true, ao: 0, msaa: 4, ratio: 1.25, shadow: 2048, shadowRadius: 2, shafts: true, bloom: true, aniso: 8 },
  high: { label: 'High', post: true, ao: 12, msaa: 4, ratio: 1.5, shadow: 4096, shadowRadius: 2.5, shafts: true, bloom: true, aniso: 16 },
  ultra: { label: 'Ultra', post: true, ao: 16, msaa: 4, ratio: 2.0, shadow: 4096, shadowRadius: 3, shafts: true, bloom: true, aniso: 16, aoFull: true },
};
const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

function makePost(renderer) {
  const caps = renderer.capabilities, ext = renderer.extensions;
  const supported = caps.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  const maxSamples = caps.maxSamples || 0;
  const P = {
    supported, on: false, q: QUALITY.low, w: 2, h: 2,
    exposure: 1, ao: 0.75, aoRadius: 0.5, aoIntensity: 1.0, bloom: 0.065, shafts: 0, shaftColor: new THREE.Color(1.0, 0.78, 0.5), shimmer: 0, grain: 0.032, vignette: 0.26, sat: 1.04, contrast: 1.035, split: 0.5,
    sunDir: null, time: 0,
  };
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(quadGeo), quadScene = new THREE.Scene();
  quad.frustumCulled = false; quadScene.add(quad);
  const mk = (fs, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

  // ---------- targets ----------
  const RT = {};
  const target = (w, h, { samples = 0, depth = false, depthTex = false, half = true } = {}) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, stencilBuffer: false, samples });
    if (depthTex) t.depthTexture = new THREE.DepthTexture(w, h);
    t.texture.generateMipmaps = false;
    return t;
  };
  const LEVELS = 5;
  function build() {
    for (const k in RT) { if (Array.isArray(RT[k])) RT[k].forEach(t => t.dispose()); else RT[k].dispose(); delete RT[k]; }
    if (!P.on) return;
    const q = P.q, s = Math.min(q.msaa, maxSamples), w = P.w, h = P.h;
    RT.scene = target(w, h, { samples: s, depth: true, depthTex: true });
    RT.comp = target(w, h, { samples: s, depth: true });
    const aw = q.aoFull ? w : Math.ceil(w / 2), ah = q.aoFull ? h : Math.ceil(h / 2);
    RT.ao = target(aw, ah, { half: false }); RT.ao2 = target(aw, ah, { half: false });
    RT.down = []; RT.up = [];
    let bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    for (let i = 0; i < LEVELS; i++) { RT.down.push(target(bw, bh)); RT.up.push(target(bw, bh)); bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2)); }
    RT.shaft = target(Math.ceil(w / 4), Math.ceil(h / 4), { half: false }); RT.shaft2 = target(Math.ceil(w / 4), Math.ceil(h / 4), { half: false });
    // blank stand-ins when a stage is switched off
    RT.white = target(1, 1, { half: false }); RT.black = target(1, 1, { half: false });
    const cl = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(RT.white); renderer.setClearColor(0xffffff, 1); renderer.clear();
    renderer.setRenderTarget(RT.black); renderer.setClearColor(0x000000, 1); renderer.clear();
    renderer.setRenderTarget(null); renderer.setClearColor(cl, ca);
  }

  // ---------- passes ----------
  const DEPTH_GLSL = `uniform float uNear; uniform float uFar;
    float viewDist(float d) { return (uNear * uFar) / (uFar - (uFar - uNear) * d); }`;
  // scalable ambient obscurance from the depth buffer alone
  const aoMat = mk(`varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 uRes; uniform mat4 uProjInv; uniform float uProjY;
    uniform float uRadius; uniform float uIntensity; uniform float uBias; uniform float uFade; uniform float uSeed;
    vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d > 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = vpos(vUv);
      if (-P.z > uFade) { gl_FragColor = vec4(1.0); return; }
      vec2 px = 1.0 / uRes;
      vec3 Pr = vpos(vUv + vec2(px.x, 0.0)), Pl = vpos(vUv - vec2(px.x, 0.0)), Pu = vpos(vUv + vec2(0.0, px.y)), Pd = vpos(vUv - vec2(0.0, px.y));
      vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
      vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
      vec3 N = normalize(cross(dx, dy));
      float rPx = min(uRadius * uProjY * 0.5 * uRes.y / -P.z, 90.0);
      if (rPx < 1.5) { gl_FragColor = vec4(1.0); return; }
      float spin = hash(gl_FragCoord.xy + uSeed) * 6.2831853, sum = 0.0, r2 = uRadius * uRadius;
      for (int i = 0; i < NS; i++) {
        float a = (float(i) + 0.5) / float(NS), ang = a * 6.2831853 * 7.0 + spin;
        vec3 S = vpos(vUv + vec2(cos(ang), sin(ang)) * a * rPx * px);
        vec3 v = S - P; float vv = dot(v, v), vn = dot(v, N);
        float f = max(r2 - vv, 0.0);
        sum += f * f * f * max((vn - uBias) / (vv + 0.01), 0.0);
      }
      float ao = max(0.0, 1.0 - sum * uIntensity / (r2 * r2 * r2) * (5.0 / float(NS)));
      ao = mix(ao, 1.0, smoothstep(uFade * 0.6, uFade, -P.z));
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`, { tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uProjInv: { value: new THREE.Matrix4() }, uProjY: { value: 1 }, uRadius: { value: 0.55 }, uIntensity: { value: 1.0 }, uBias: { value: 0.012 }, uFade: { value: 42 }, uSeed: { value: 0 } }, { NS: 12 });
  // depth-aware blur, run across and then down
  const blurMat = mk(`varying vec2 vUv; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; ${DEPTH_GLSL}
    void main() {
      float z0 = viewDist(texture2D(tDepth, vUv).x), sum = texture2D(tAO, vUv).r, ws = 1.0;
      for (int i = -4; i <= 4; i++) {
        if (i == 0) continue;
        vec2 uv = vUv + uDir * float(i);
        float z = viewDist(texture2D(tDepth, uv).x);
        float w = exp(-float(i * i) / 9.0) * max(0.0, 1.0 - abs(z - z0) / (0.04 * z0 + 0.03));
        sum += texture2D(tAO, uv).r * w; ws += w;
      }
      float a = sum / ws; gl_FragColor = vec4(a, a, a, 1.0);
    }`, { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uNear: { value: 0.03 }, uFar: { value: 600 } });
  // the world times its occlusion, with a heat shimmer over the far ground outside
  const compMat = mk(`varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tAO; uniform sampler2D tDepth; uniform float uAO; uniform float uShimmer; uniform float uTime; ${DEPTH_GLSL}
    void main() {
      vec2 uv = vUv;
      if (uShimmer > 0.0) {
        float z = viewDist(texture2D(tDepth, vUv).x), k = smoothstep(28.0, 140.0, z) * (1.0 - smoothstep(330.0, 400.0, z)) * uShimmer;
        uv += vec2(sin(vUv.y * 190.0 + uTime * 5.3) + 0.6 * sin(vUv.y * 83.0 - uTime * 3.7), 0.5 * cos(vUv.x * 140.0 + uTime * 4.1)) * 0.00055 * k;
      }
      vec4 c = texture2D(tColor, uv);
      c.rgb *= mix(1.0, texture2D(tAO, vUv).r, uAO);
      gl_FragColor = vec4(c.rgb, 1.0);
    }`, { tColor: { value: null }, tAO: { value: null }, tDepth: { value: null }, uAO: { value: 0.8 }, uShimmer: { value: 0 }, uTime: { value: 0 }, uNear: { value: 0.03 }, uFar: { value: 600 } });
  // bloom: a soft threshold, then a dual-filter chain down and back up
  const brightMat = mk(`varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uTexel; uniform float uExpo; uniform float uThresh;
    void main() {
      vec3 c = (texture2D(tColor, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.5, -0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25 * uExpo;
      float br = max(c.r, max(c.g, c.b)), knee = uThresh * 0.5;
      float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
      c *= max(soft, br - uThresh) / max(br, 1e-4);
      gl_FragColor = vec4(min(c, vec3(40.0)), 1.0);
    }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uExpo: { value: 1 }, uThresh: { value: 1.0 } });
  const downMat = mk(`varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
    void main() { vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
      s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
      gl_FragColor = vec4(s / 8.0, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const upMat = mk(`varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
    void main() { vec3 s = vec3(0.0);
      s += texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
      s += (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 2.0;
      gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb, 1.0); }`, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  // sun shafts: the sky that shows round things, smeared out from the sun's spot on screen
  const shaftMaskMat = mk(`varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect; ${DEPTH_GLSL}
    void main() {
      float z = viewDist(texture2D(tDepth, vUv).x);
      float sky = step(360.0, z);
      vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
      gl_FragColor = vec4(vec3(sky * pow(max(0.0, 1.0 - length(d) / 0.75), 2.2)), 1.0);
    }`, { tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uNear: { value: 0.03 }, uFar: { value: 600 } });
  const shaftBlurMat = mk(`varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uSun; uniform float uSpan;
    void main() {
      vec2 step = (uSun - vUv) * uSpan / 30.0; vec2 uv = vUv; float sum = 0.0, w = 1.0;
      for (int i = 0; i < 30; i++) { sum += texture2D(tSrc, uv).r * w; w *= 0.955; uv += step; }
      gl_FragColor = vec4(vec3(sum / 12.0), 1.0);
    }`, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uSpan: { value: 1 } });
  // the last word: tone curve, grade, vignette, grain
  const finalMat = mk(`varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tShaft;
    uniform float uExpo; uniform float uBloom; uniform float uShaft; uniform vec3 uShaftCol; uniform float uSat; uniform float uContrast; uniform float uSplit; uniform float uVignette; uniform float uGrain; uniform float uTime; uniform vec2 uRes;
    ${ACES_GLSL}
    void main() {
      vec3 c = texture2D(tColor, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom + texture2D(tShaft, vUv).r * uShaftCol * uShaft;
      c = acesFilmic(c, uExpo);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, uSat), 0.0);
      // a light split tone: shade leans cool, sunlit things lean warm, so the red world has some depth to it
      vec3 tint = mix(vec3(0.93, 0.97, 1.1), vec3(1.05, 1.0, 0.93), smoothstep(0.02, 0.5, l));
      c *= mix(vec3(1.0), tint, uSplit);
      c = mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
      c = (c - 0.5) * uContrast + 0.5;
      vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.25, 1.1, length(q) * 1.25);
      float n = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`, { tColor: { value: null }, tBloom: { value: null }, tShaft: { value: null }, uExpo: { value: 1 }, uBloom: { value: 0 }, uShaft: { value: 0 }, uShaftCol: { value: P.shaftColor }, uSat: { value: 1 }, uContrast: { value: 1 }, uSplit: { value: 0 }, uVignette: { value: 0 }, uGrain: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() } });

  const _sun = new THREE.Vector3(), _sz = new THREE.Vector2();
  // a target the driver won't draw into means no post chain here: fall back to drawing straight to the screen
  function targetsWork() {
    const gl = renderer.getContext();
    for (const t of [RT.scene, RT.comp, RT.down[0]]) {
      renderer.setRenderTarget(t);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { renderer.setRenderTarget(null); return false; }
    }
    renderer.setRenderTarget(null);
    return true;
  }
  P.setQuality = (key) => {
    const q = QUALITY[key] || QUALITY.medium;
    P.q = q; P.key = key in QUALITY ? key : 'medium';
    P.on = q.post && P.supported;
    POSTU.uPostLin.value = P.on ? 1 : 0;
    if (P.on && q.ao) { aoMat.defines.NS = q.ao; aoMat.needsUpdate = true; }
    build();
    if (P.on && !targetsWork()) { P.supported = false; P.on = false; P.q = QUALITY.low; P.key = 'low'; POSTU.uPostLin.value = 0; build(); }
  };
  P.setSize = (w, h) => { w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h)); if (w === P.w && h === P.h && (RT.scene || !P.on)) return; P.w = w; P.h = h; build(); };
  P.setExposure = (e) => { P.exposure = e; POSTU.uPostExpo.value = e; renderer.toneMappingExposure = e; };
  P.render = (scene, camera, vmScene, vmCam, drawVM, dt = 0.016) => {
    P.time += dt;
    if (!P.on) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      if (drawVM) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
      return;
    }
    const q = P.q;
    // 1. the world
    renderer.setRenderTarget(RT.scene); renderer.render(scene, camera);
    const near = camera.near, far = camera.far, depth = RT.scene.depthTexture;
    for (const m of [blurMat, compMat, shaftMaskMat]) { m.uniforms.uNear.value = near; m.uniforms.uFar.value = far; }
    // 2. ambient occlusion
    let aoTex = RT.white.texture;
    if (q.ao && P.ao > 0) {
      const u = aoMat.uniforms;
      u.tDepth.value = depth; u.uRes.value.set(P.w, P.h); u.uRadius.value = P.aoRadius; u.uIntensity.value = P.aoIntensity; u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uProjY.value = camera.projectionMatrix.elements[5]; u.uSeed.value = (P.time * 7.3) % 50;
      pass(aoMat, RT.ao);
      blurMat.uniforms.tDepth.value = depth;
      blurMat.uniforms.tAO.value = RT.ao.texture; blurMat.uniforms.uDir.value.set(1 / RT.ao.width, 0); pass(blurMat, RT.ao2);
      blurMat.uniforms.tAO.value = RT.ao2.texture; blurMat.uniforms.uDir.value.set(0, 1 / RT.ao.height); pass(blurMat, RT.ao);
      aoTex = RT.ao.texture;
    }
    // 3. world × occlusion, then the hand on top of it
    compMat.uniforms.tColor.value = RT.scene.texture; compMat.uniforms.tAO.value = aoTex; compMat.uniforms.tDepth.value = depth;
    compMat.uniforms.uAO.value = q.ao ? P.ao : 0; compMat.uniforms.uShimmer.value = P.shimmer; compMat.uniforms.uTime.value = P.time;
    pass(compMat, RT.comp);
    if (drawVM) { renderer.setRenderTarget(RT.comp); renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
    // 4. bloom
    let bloomTex = RT.black.texture;
    if (q.bloom && P.bloom > 0) {
      brightMat.uniforms.tColor.value = RT.comp.texture; brightMat.uniforms.uTexel.value.set(1 / P.w, 1 / P.h); brightMat.uniforms.uExpo.value = P.exposure;
      pass(brightMat, RT.down[0]);
      for (let i = 1; i < LEVELS; i++) { downMat.uniforms.tSrc.value = RT.down[i - 1].texture; downMat.uniforms.uTexel.value.set(0.5 / RT.down[i - 1].width, 0.5 / RT.down[i - 1].height); pass(downMat, RT.down[i]); }
      let src = RT.down[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) { upMat.uniforms.tSrc.value = src.texture; upMat.uniforms.tAdd.value = RT.down[i].texture; upMat.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height); pass(upMat, RT.up[i]); src = RT.up[i]; }
      bloomTex = RT.up[0].texture;
    }
    // 5. sun shafts, when the sun is on or near the screen
    let shaftTex = RT.black.texture, shaftAmt = 0;
    if (q.shafts && P.shafts > 0 && P.sunDir) {
      _sun.copy(P.sunDir).multiplyScalar(400).add(camera.position).project(camera);
      const fwd = camera.getWorldDirection(new THREE.Vector3()).dot(P.sunDir);
      if (fwd > 0.05) {
        const sx = _sun.x * 0.5 + 0.5, sy = _sun.y * 0.5 + 0.5, edge = Math.max(Math.abs(_sun.x), Math.abs(_sun.y));
        shaftAmt = P.shafts * smooth(0.05, 0.5, fwd) * (1 - smooth(1.0, 1.9, edge));
        if (shaftAmt > 0.01) {
          shaftMaskMat.uniforms.tDepth.value = depth; shaftMaskMat.uniforms.uSun.value.set(sx, sy); shaftMaskMat.uniforms.uAspect.value = P.w / P.h;
          pass(shaftMaskMat, RT.shaft);
          shaftBlurMat.uniforms.tSrc.value = RT.shaft.texture; shaftBlurMat.uniforms.uSun.value.set(sx, sy); shaftBlurMat.uniforms.uSpan.value = 0.85;
          pass(shaftBlurMat, RT.shaft2);
          shaftTex = RT.shaft2.texture;
        }
      }
    }
    // 6. out to the screen
    const f = finalMat.uniforms;
    f.tColor.value = RT.comp.texture; f.tBloom.value = bloomTex; f.tShaft.value = shaftTex;
    f.uExpo.value = P.exposure; f.uBloom.value = q.bloom ? P.bloom : 0; f.uShaft.value = shaftAmt;
    f.uSat.value = P.sat; f.uContrast.value = P.contrast; f.uSplit.value = P.split; f.uVignette.value = P.vignette; f.uGrain.value = P.grain; f.uTime.value = P.time;
    renderer.getDrawingBufferSize(_sz); f.uRes.value.copy(_sz);
    pass(finalMat, null);
  };
  P.dispose = () => { P.on = false; build(); };
  return P;
}

// ---------- the yard's haze: brighter and golden towards the sun, dusty red away from it ----------
const HAZEU = { uSunView: { value: new THREE.Vector3(0, 0, -1) }, uSunHaze: { value: new THREE.Color(1.0, 0.82, 0.58).multiplyScalar(1.25) } };
function hazeify(mat) {
  if (!mat || mat.userData.hazed || !mat.fog || mat.isShaderMaterial || mat.isMeshBasicMaterial || mat.isPointsMaterial || mat.isSpriteMaterial || mat.isLineBasicMaterial) return;
  mat.userData.hazed = true;
  // the old cache key is taken now, before the wrapper replaces onBeforeCompile (three keys programs on its source)
  const prev = mat.onBeforeCompile, baseKey = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uSunView = HAZEU.uSunView; sh.uniforms.uSunHaze = HAZEU.uSunHaze;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uSunView; uniform vec3 uSunHaze;')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float hzF = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float hzF = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        float hzS = pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 5.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uSunHaze, hzS * 0.8), hzF);
      #endif`);
  };
  mat.customProgramCacheKey = function () { return baseKey + '|haze'; };
  mat.needsUpdate = true;
}
// ============================================================
// Jacob's thoughts, spoken. The browser's own speech voices read his
// lines, the Book comes back in a softer voice (his mother's, the way
// he remembers it), and the gossip-flies whisper. While a thought is
// spoken the world's sound drops and muffles, so it sits in his head.
// Nothing is downloaded; what's available depends on the computer.
// ============================================================
const voice = {
  ok: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  list: [], cur: null, token: 0, onEnd: null, timer: 0,
  settings: { on: true, vol: 0.9, jacob: '', book: '', auto: false },
  duck: null,          // set by the game: (on) => muffle the world or let it back in
};
try { Object.assign(voice.settings, JSON.parse(localStorage.getItem('farm-of-rust-voice') || '{}')); } catch (e) { /* storage unavailable */ }
function saveVoice() { try { localStorage.setItem('farm-of-rust-voice', JSON.stringify(voice.settings)); } catch (e) { /* storage unavailable */ } }

// best guesses first: natural Australian voices in Edge, then Windows, Mac and Chrome's own, then any English voice
const VOICE_PREF = {
  jacob: [/William.*Natural/i, /James.*Austral/i, /\bLee\b/i, /Austral.*\bmale\b/i, /Ryan.*Natural/i, /Thomas.*Natural/i, /Guy.*Natural/i, /Christopher.*Natural/i, /Eric.*Natural/i,
    /Google UK English Male/i, /\bDaniel\b/i, /\bArthur\b/i, /\bGeorge\b/i, /\bDavid\b/i, /\bMark\b/i, /\bAlex\b/i, /\bFred\b/i],
  book: [/Natasha.*Natural/i, /Annette.*Natural/i, /Catherine.*Austral/i, /\bKaren\b/i, /Sonia.*Natural/i, /Libby.*Natural/i, /Aria.*Natural/i, /Jenny.*Natural/i,
    /Google UK English Female/i, /\bHazel\b/i, /\bSerena\b/i, /\bMoira\b/i, /\bKate\b/i, /\bZira\b/i, /\bSamantha\b/i, /\bVictoria\b/i],
};
function loadVoices() {
  if (!voice.ok) return;
  try {
    const all = speechSynthesis.getVoices() || [];
    voice.list = all.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
    if (!voice.list.length) voice.list = all.slice();
  } catch (e) { voice.list = []; }
}
if (voice.ok) { loadVoices(); try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; } }
function pickVoice(role) {
  if (!voice.list.length) loadVoices();
  const want = voice.settings[role === 'whisper' ? 'jacob' : role];
  if (want) { const v = voice.list.find(v => v.name === want); if (v) return v; }
  for (const re of VOICE_PREF[role === 'book' ? 'book' : 'jacob']) { const v = voice.list.find(v => re.test(v.name)); if (v) return v; }
  return voice.list.find(v => /en[-_]AU/i.test(v.lang)) || voice.list.find(v => /en[-_]GB/i.test(v.lang)) || voice.list[0] || null;
}
// the voices a role can cycle through in settings: "Automatic" first, then everything English
function voiceChoices() { if (!voice.list.length) loadVoices(); return [''].concat(voice.list.map(v => v.name)); }
function voiceLabel(name, role) {
  if (!name) { const v = pickVoice(role); return 'Automatic' + (v ? ` (${shortVoice(v.name)})` : ''); }
  return shortVoice(name);
}
const shortVoice = (n) => n.replace(/^Microsoft\s+/i, '').replace(/\s+Online\s+\(Natural\)/i, ' (natural)').replace(/\s*-\s*English\s*/i, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// what the voice actually reads: no ellipses or dashes read aloud, a pause where the page has one
function speakable(text) {
  return String(text).replace(/…/g, ', ').replace(/\s[–—]\s/g, ', ').replace(/[“”"]/g, '').replace(/\s+,/g, ',').replace(/^[,\s]+|[,\s]+$/g, '').trim();
}
function stopVoice() {
  if (!voice.ok) return;
  voice.token++;
  clearTimeout(voice.timer);
  if (voice.cur) { voice.cur = null; try { speechSynthesis.cancel(); } catch (e) { /* nothing to stop */ } }
  if (voice.duck) voice.duck(false);
}
// role: 'jacob' (his thoughts), 'book' (the Book of Lost Echoes), 'whisper' (the flies)
function speak(text, role = 'jacob', { muted = false, onEnd = null } = {}) {
  if (!voice.ok || !voice.settings.on || muted) return false;
  const say = speakable(text);
  if (!say) return false;
  let busy = false; try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch (e) { /* unknown */ }
  stopVoice();
  const u = new SpeechSynthesisUtterance(say), v = pickVoice(role), token = voice.token;
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-AU';
  const natural = v && /Natural|Online/i.test(v.name);
  if (role === 'book') { u.rate = natural ? 0.94 : 0.9; u.pitch = 1.0; u.volume = voice.settings.vol * 0.9; }
  else if (role === 'whisper') { u.rate = 0.82; u.pitch = 0.55; u.volume = voice.settings.vol * 0.32; }
  else { u.rate = natural ? 1.02 : 0.98; u.pitch = natural ? 0.94 : 0.86; u.volume = voice.settings.vol; }
  const finish = () => {
    if (token !== voice.token) return;
    clearTimeout(voice.timer);
    voice.cur = null;
    if (voice.duck && role !== 'whisper') voice.duck(false);
    if (onEnd) onEnd();
  };
  u.onend = finish; u.onerror = finish;
  voice.cur = u;
  if (voice.duck && role !== 'whisper') voice.duck(true);
  // some browsers never fire onend: give the world its sound back after a generous guess at the length
  voice.timer = setTimeout(finish, 2500 + say.length * 95 / (u.rate || 1));
  // straight after a cancel Chrome can drop the next line, so give it a moment when something was playing
  const go = () => { if (token !== voice.token) return; try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch (e) { finish(); } };
  if (busy) setTimeout(go, 70); else go();
  return true;
}
// ============================================================
// The shack: geometry, light, and the few things that move.
// Units are metres. +x is east (the window), +z is south (the door).
// ============================================================
const RX = 3.0, RZ = 2.25, EAVE = 2.3, RIDGE = 3.1, WT = 0.05;
const DOOR = { x0: -1.3, x1: -0.45, h: 2.02 };
const WIN = { z0: 0.0, z1: 0.9, y0: 0.95, y1: 1.95 };
const SLITS = [{ z: -1.35, w: 0.024, y0: 0.25, y1: 2.05 }, { z: 1.62, w: 0.02, y0: 0.45, y1: 2.2 }];
const HOLE = { x0: -0.95, x1: -0.35, z0: -1.145, z1: -1.015 };
const BED = { x0: -2.95, x1: -1.07, z0: -2.18, z1: -1.38 };
const SHELF = { x0: -2.99, x1: -2.73, z0: -0.62, z1: 0.48 };
const BASIN = { x: -2.72, z: 1.8 };
const BENCH = { x0: 1.22, x1: 2.96, z0: -2.23, z1: -1.69, h: 0.88 };
const SAFE = { x: 2.62, z: -1.2 };
const TABLE = { x: 0.45, z: 0.2, w: 1.2, d: 0.75, h: 0.77 };
const JAR = { x: 0.45, z: 0.2 };

function buildShack(renderer, T) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x140c09);
  scene.fog = new THREE.FogExp2(0x24130c, 0.035);

  const mat = {
    wall: std(T.wall, { roughness: 0.93 }),
    floor: std(T.floor, { roughness: 0.9 }),
    tin: std(T.tin, { roughness: 0.55, metalness: 0.55, normalMap: T.tinN, emissive: 0xffffff, emissiveMap: T.tinE, emissiveIntensity: 2.2 }),
    timber: std(T.wall, { roughness: 0.9, color: 0xc0aa90 }),
    wood: std(T.wood, { roughness: 0.78 }),
    tableTop: std(T.tableTop, { roughness: 0.7 }),
    iron: std(T.iron, { roughness: 0.82, metalness: 0.5 }),
    canvas: std(T.canvas, { roughness: 0.97 }),
    hessian: std(T.hessian, { roughness: 1 }),
    wool: std(T.hessian, { roughness: 1, color: 0x8a867c }),
    scarf: std(T.canvas, { roughness: 0.95, color: 0xc0623a }),
    mask: std(T.canvas, { roughness: 0.95, color: 0x9a9284 }),
    leather: std(T.iron, { roughness: 0.75, metalness: 0.05, color: 0x7a5640 }),
    brick: std(T.brick, { roughness: 0.95 }),
    enamel: std(T.enamel, { roughness: 0.3, side: THREE.DoubleSide }),
    tinware: std(T.iron, { roughness: 0.36, metalness: 0.85, color: 0xd2cbc0, envMapIntensity: 0.8 }),
    paper: std(T.paper, { roughness: 0.92 }),
    crate: std(T.crate, { roughness: 0.9 }),
    straw: new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0705, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1a221f, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.1 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x6a4214, roughness: 0.12, metalness: 0.5, envMapIntensity: 1.2 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xd9ccaa, roughness: 0.6 }),
    murk: new THREE.MeshStandardMaterial({ color: 0x3b3a1c, roughness: 0.4 }),
    mercury: new THREE.MeshStandardMaterial({ color: 0xb3261d, roughness: 0.3, emissive: 0x5a0d08, emissiveIntensity: 0.6 }),
  };
  const glass = new THREE.MeshStandardMaterial({ map: T.glass, transparent: true, roughness: 0.08, metalness: 0, depthWrite: false, envMapIntensity: 1.0, side: THREE.DoubleSide });
  const jarGlass = new THREE.MeshStandardMaterial({ color: 0xcfe0d8, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const bookMats = [0x6b2a22, 0x2f3b4f, 0x4e5233, 0x8a6a2c, 0x5b524a, 0x3e2a20].map(c => std(T.cloth, { color: c, roughness: 0.85 }));

  const S = new Batch();
  const WALL = { mode: 'world', scale: 1.2, offset: [0, 0] };
  const FLOOR = { mode: 'world', scale: 1.6, offset: [0.13, 0.41] };
  const WOOD = { mode: 'world', scale: 1.0 };
  const TIM = { mode: 'world', scale: 1.2 };
  const IRON = { mode: 'world', scale: 0.5 };

  // ---------- floor, with a hole under the loose board ----------
  S.box(mat.floor, -RX, -0.05, -RZ, RX, 0, HOLE.z0, FLOOR);
  S.box(mat.floor, -RX, -0.05, HOLE.z1, RX, 0, RZ, FLOOR);
  S.box(mat.floor, -RX, -0.05, HOLE.z0, HOLE.x0, 0, HOLE.z1, FLOOR);
  S.box(mat.floor, HOLE.x1, -0.05, HOLE.z0, RX, 0, HOLE.z1, FLOOR);
  S.box(mat.dark, HOLE.x0, -0.09, HOLE.z0, HOLE.x1, -0.03, HOLE.z1, IRON);

  // ---------- walls ----------
  S.box(mat.wall, -RX - WT, 0, -RZ - WT, RX + WT, EAVE, -RZ, WALL);
  S.box(mat.wall, -RX - WT, 0, RZ, DOOR.x0, EAVE, RZ + WT, WALL);
  S.box(mat.wall, DOOR.x1, 0, RZ, RX + WT, EAVE, RZ + WT, WALL);
  S.box(mat.wall, DOOR.x0, DOOR.h, RZ, DOOR.x1, EAVE, RZ + WT, WALL);
  S.box(mat.wall, -RX - WT, 0, -RZ, -RX, EAVE, RZ, WALL);
  const eastCols = [
    [-RZ, SLITS[0].z, [[0, EAVE]]],
    [SLITS[0].z, SLITS[0].z + SLITS[0].w, [[0, SLITS[0].y0], [SLITS[0].y1, EAVE]]],
    [SLITS[0].z + SLITS[0].w, WIN.z0, [[0, EAVE]]],
    [WIN.z0, WIN.z1, [[0, WIN.y0], [WIN.y1, EAVE]]],
    [WIN.z1, SLITS[1].z, [[0, EAVE]]],
    [SLITS[1].z, SLITS[1].z + SLITS[1].w, [[0, SLITS[1].y0], [SLITS[1].y1, EAVE]]],
    [SLITS[1].z + SLITS[1].w, RZ, [[0, EAVE]]],
  ];
  for (const [z0, z1, ys] of eastCols) for (const [y0, y1] of ys) S.box(mat.wall, RX, y0, z0, RX + WT, y1, z1, WALL);
  const gable = () => {
    const s = new THREE.Shape();
    s.moveTo(-RZ - WT, EAVE); s.lineTo(RZ + WT, EAVE); s.lineTo(0, RIDGE + 0.05); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: WT, bevelEnabled: false });
    g.translate(0, 0, -WT / 2); g.rotateY(Math.PI / 2);
    return g;
  };
  S.add(gable(), mat.wall, M(-RX - WT / 2, 0, 0), WALL);
  S.add(gable(), mat.wall, M(RX + WT / 2, 0, 0), WALL);

  // window reveal, sill and outside storm shutters (the gaps are where the sun gets in)
  S.box(mat.wood, RX - 0.085, WIN.y0 - 0.035, WIN.z0 - 0.07, RX + WT, WIN.y0, WIN.z1 + 0.07, WOOD);
  S.box(mat.wood, RX - 0.03, WIN.y1, WIN.z0 - 0.06, RX + 0.012, WIN.y1 + 0.06, WIN.z1 + 0.06, WOOD);
  S.box(mat.wood, RX - 0.03, WIN.y0, WIN.z0 - 0.06, RX + 0.012, WIN.y1, WIN.z0, WOOD);
  S.box(mat.wood, RX - 0.03, WIN.y0, WIN.z1, RX + 0.012, WIN.y1, WIN.z1 + 0.06, WOOD);
  const SH = { x0: RX + WT + 0.006, x1: RX + WT + 0.03 };
  const leaves = [
    { z0: WIN.z0 - 0.03, z1: 0.44, holes: [[1.19, 1.225], [1.44, 1.475], [1.69, 1.73]].map(([a, b]) => [WIN.z0 - 0.03, 0.44, a, b]) },
    { z0: 0.46, z1: WIN.z1 + 0.03, holes: [[1.1, 1.13], [1.33, 1.37]].map(([a, b]) => [0.46, WIN.z1 + 0.03, a, b]).concat([[0.56, 0.86, 1.5, 1.66]]) },
  ];
  for (const leaf of leaves) for (const r of solidCells(leaf.z0, leaf.z1, WIN.y0 - 0.03, WIN.y1 + 0.03, leaf.holes)) S.box(mat.wood, SH.x0, r[2], r[0], SH.x1, r[3], r[1], WOOD);
  const openings = [];
  for (const leaf of leaves) for (const h of leaf.holes) openings.push({ z0: Math.max(h[0], WIN.z0), z1: Math.min(h[1], WIN.z1), y0: h[2], y1: h[3], gain: (h[3] - h[2]) > 0.05 ? 1.0 : 0.7 });
  openings.push({ z0: 0.44, z1: 0.46, y0: WIN.y0, y1: WIN.y1, gain: 0.6 });
  for (const s of SLITS) openings.push({ z0: s.z, z1: s.z + s.w, y0: s.y0, y1: s.y1, gain: 0.6 });

  // ---------- door: boards, ledges and brace, three deadbolts ----------
  S.box(mat.wood, DOOR.x0 - 0.07, 0, RZ - 0.02, DOOR.x0, DOOR.h + 0.07, RZ, WOOD);
  S.box(mat.wood, DOOR.x1, 0, RZ - 0.02, DOOR.x1 + 0.07, DOOR.h + 0.07, RZ, WOOD);
  S.box(mat.wood, DOOR.x0 - 0.07, DOOR.h, RZ - 0.02, DOOR.x1 + 0.07, DOOR.h + 0.07, RZ, WOOD);
  S.box(mat.wood, DOOR.x0 + 0.012, 0.012, RZ + 0.006, DOOR.x1 - 0.012, DOOR.h - 0.014, RZ + 0.04, WOOD);
  S.box(mat.wood, DOOR.x0 + 0.03, 0.24, RZ - 0.014, DOOR.x1 - 0.03, 0.35, RZ + 0.006, WOOD);
  S.box(mat.wood, DOOR.x0 + 0.03, 1.62, RZ - 0.014, DOOR.x1 - 0.03, 1.73, RZ + 0.006, WOOD);
  {
    const ax = DOOR.x0 + 0.08, ay = 0.35, bx = DOOR.x1 - 0.08, by = 1.62;
    const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    S.add(new THREE.BoxGeometry(len, 0.09, 0.02), mat.wood, M((ax + bx) / 2, (ay + by) / 2, RZ - 0.004, 0, 0, ang), WOOD);
  }
  for (const by of [0.62, 1.06, 1.5]) {
    S.box(mat.iron, DOOR.x1 - 0.17, by - 0.028, RZ - 0.034, DOOR.x1 - 0.04, by + 0.028, RZ - 0.006, IRON);
    S.cyl(mat.iron, 0.009, 0.009, 0.16, DOOR.x1 - 0.03, by, RZ - 0.02, 0, 0, Math.PI / 2, 8);
    S.add(new THREE.SphereGeometry(0.016, 8, 6), mat.iron, M(DOOR.x1 - 0.12, by + 0.04, RZ - 0.022), IRON);
  }
  S.add(new THREE.TorusGeometry(0.035, 0.006, 6, 16), mat.iron, M(DOOR.x1 - 0.13, 1.0, RZ - 0.025), IRON);

  // ---------- roof: tin on rafters, ridge beam, purlins, tie beams ----------
  const slope = Math.atan2(RIDGE - EAVE, RZ), slopeLen = Math.hypot(RIDGE - EAVE, RZ);
  const TIN = { mode: 'world', scale: 1.0, offset: [0, 0] };
  for (const s of [-1, 1]) {
    const ext = 0.32, cz = s * (RZ / 2 + (ext / 2) * Math.cos(slope)) + s * 0.012 * Math.sin(slope);
    const cy = (RIDGE + EAVE) / 2 - (ext / 2) * Math.sin(slope) + 0.012 * Math.cos(slope);
    S.add(new THREE.BoxGeometry(2 * RX + 0.6, 0.02, slopeLen + ext), mat.tin, M(0, cy, cz, s * slope, 0, 0), TIN);
  }
  S.box(mat.tin, -RX - 0.3, RIDGE + 0.01, -0.13, RX + 0.3, RIDGE + 0.06, 0.13, TIN);
  S.box(mat.timber, -RX, RIDGE - 0.17, -0.035, RX, RIDGE - 0.015, 0.035, TIM);
  for (const x of [-2.2, -0.75, 0.75, 2.2]) for (const s of [-1, 1]) {
    const cz = s * RZ / 2 - s * 0.05 * Math.sin(slope), cy = (RIDGE + EAVE) / 2 - 0.05 * Math.cos(slope);
    S.add(new THREE.BoxGeometry(0.05, 0.1, slopeLen), mat.timber, M(x, cy, cz, s * slope, 0, 0), TIM);
  }
  for (const s of [-1, 1]) for (const f of [0.35, 0.7]) {
    const z = s * RZ * f, y = RIDGE - (RIDGE - EAVE) * f - 0.13;
    S.box(mat.timber, -RX, y - 0.035, z - 0.03, RX, y + 0.035, z + 0.03, TIM);
  }
  for (const x of [-1.5, 1.5]) S.box(mat.timber, x - 0.03, EAVE - 0.12, -RZ, x + 0.03, EAVE - 0.02, RZ, TIM);
  S.box(mat.timber, -RX, EAVE - 0.1, RZ - 0.07, RX, EAVE, RZ, TIM);
  S.box(mat.timber, -RX, EAVE - 0.1, -RZ, RX, EAVE, -RZ + 0.07, TIM);

  // ---------- table, chair and what's on the table ----------
  S.box(mat.tableTop, TABLE.x - TABLE.w / 2, TABLE.h - 0.045, TABLE.z - TABLE.d / 2, TABLE.x + TABLE.w / 2, TABLE.h, TABLE.z + TABLE.d / 2, WOOD);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = TABLE.x + dx * (TABLE.w / 2 - 0.07), lz = TABLE.z + dz * (TABLE.d / 2 - 0.07);
    S.box(mat.wood, lx - 0.03, 0, lz - 0.03, lx + 0.03, TABLE.h - 0.045, lz + 0.03, WOOD);
  }
  S.box(mat.wood, TABLE.x - TABLE.w / 2 + 0.07, TABLE.h - 0.13, TABLE.z - TABLE.d / 2 + 0.06, TABLE.x + TABLE.w / 2 - 0.07, TABLE.h - 0.045, TABLE.z - TABLE.d / 2 + 0.08, WOOD);
  S.box(mat.wood, TABLE.x - TABLE.w / 2 + 0.07, TABLE.h - 0.13, TABLE.z + TABLE.d / 2 - 0.08, TABLE.x + TABLE.w / 2 - 0.07, TABLE.h - 0.045, TABLE.z + TABLE.d / 2 - 0.06, WOOD);
  {
    const C = M(0.45, 0, 0.88, 0, 0.25, 0), add = (w, h, d, x, y, z) => S.add(new THREE.BoxGeometry(w, h, d), mat.wood, C.clone().multiply(M(x, y, z)), WOOD);
    add(0.42, 0.035, 0.42, 0, 0.45, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(0.035, 0.45, 0.035, dx * 0.18, 0.225, dz * 0.18);
    add(0.035, 0.5, 0.035, -0.18, 0.72, 0.18); add(0.035, 0.5, 0.035, 0.18, 0.72, 0.18);
    add(0.4, 0.07, 0.02, 0, 0.92, 0.19); add(0.17, 0.05, 0.02, -0.1, 0.7, 0.19);
  }
  const TT = TABLE.h;
  S.cyl(mat.tinware, 0.038, 0.04, 0.15, 0.15, TT + 0.075, 0.08, 0, 0, 0, 14, 0.4);
  S.cyl(mat.tinware, 0.02, 0.02, 0.025, 0.15, TT + 0.162, 0.08, 0, 0, 0, 10, 0.4);
  S.add(lathe([[0, 0], [0.036, 0], [0.04, 0.005], [0.041, 0.09], [0.043, 0.093]]), mat.enamel, M(0.27, TT, 0.4), { mode: 'scale', su: 1, sv: 1 });
  S.add(new THREE.TorusGeometry(0.025, 0.005, 6, 12, Math.PI), mat.enamel, M(0.315, TT + 0.045, 0.4, 0, 0, -Math.PI / 2), { mode: 'scale', su: 1, sv: 1 });
  // the rebar knife: its own little group so Jacob can pick it up
  const rebar = new THREE.Group();
  {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.24, 8), mat.iron);
    bar.rotation.z = Math.PI / 2; bar.position.set(0.99, TT + 0.009, 0.044);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0075, 0.05, 8), mat.tinware);
    tip.rotation.z = -Math.PI / 2; tip.position.set(1.135, TT + 0.009, 0.044);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.11, 8), mat.hessian);
    grip.rotation.z = Math.PI / 2; grip.position.set(0.81, TT + 0.016, 0.045);
    for (const m of [bar, tip, grip]) { m.castShadow = m.receiveShadow = true; rebar.add(m); }
  }
  scene.add(rebar);
  const bills = [];
  for (const [x, z, ry, dy] of [[0.72, 0.31, 0.35, 0.001], [0.66, 0.25, -0.12, 0.003], [0.7, 0.24, 0.08, 0.005]]) {
    const g = new THREE.BoxGeometry(0.21, 0.002, 0.29);
    S.add(g, mat.paper, M(x, TT + dy, z, 0, ry, 0), { mode: 'world', scale: 0.4 });
    bills.push([x, z, ry, dy]);
  }
  const billTop = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.285), std(T.bill, { roughness: 0.9 }));
  billTop.rotation.set(-Math.PI / 2, 0, 0.08); billTop.position.set(0.7, TT + 0.0068, 0.24); billTop.receiveShadow = true;
  scene.add(billTop);

  // ---------- bed: iron frame, sagging straw mattress, one leg on bricks ----------
  {
    const { x0, x1, z0, z1 } = BED, r = 0.017, rail = 0.33, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (const z of [z0, z1]) S.cyl(mat.iron, r, r, 0.92, x0, 0.46, z, 0, 0, 0, 8);
    S.cyl(mat.iron, r, r, 0.62, x1, 0.31, z0, 0, 0, 0, 8);
    S.cyl(mat.iron, r, r, 0.48, x1, 0.38, z1, 0, 0, 0, 8);
    S.box(mat.brick, x1 - 0.1, 0, z1 - 0.05, x1 + 0.1, 0.07, z1 + 0.05, IRON);
    S.add(new THREE.BoxGeometry(0.2, 0.07, 0.1), mat.brick, M(x1 + 0.01, 0.105, z1, 0, 0.18, 0), IRON);
    for (const z of [z0, z1]) S.cyl(mat.iron, 0.014, 0.014, x1 - x0, mx, rail, z, 0, 0, Math.PI / 2, 8);
    for (const [x, y] of [[x0, rail], [x0, 0.9], [x1, rail], [x1, 0.6]]) S.cyl(mat.iron, 0.014, 0.014, z1 - z0, x, y, mz, Math.PI / 2, 0, 0, 8);
    for (let i = 1; i <= 5; i++) S.cyl(mat.iron, 0.009, 0.009, 0.9 - rail, x0, (0.9 + rail) / 2, z0 + i * (z1 - z0) / 6, 0, 0, 0, 6);
    for (let i = 1; i <= 3; i++) S.cyl(mat.iron, 0.009, 0.009, 0.6 - rail, x1, (0.6 + rail) / 2, z0 + i * (z1 - z0) / 4, 0, 0, 0, 6);
    const hw = (x1 - x0 - 0.04) / 2, hd = (z1 - z0 - 0.03) / 2;
    const mg = new THREE.BoxGeometry(hw * 2, 0.15, hd * 2, 14, 1, 7), mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i), u = x / hw, v = z / hd;
      const sag = 0.05 * (1 - u * u) * (1 - v * v), lump = 0.012 * Math.sin(x * 9 + z * 5) * Math.sin(z * 11), tilt = 0.035 * (u * 0.5 + 0.5) * (v * 0.5 + 0.5);
      mp.setY(i, y > 0 ? y - sag + lump - tilt : y - sag * 0.6 - tilt);
    }
    mg.computeVertexNormals();
    S.add(mg, mat.canvas, M(mx, rail + 0.085, mz), { mode: 'world', scale: 1.0 });
    S.add(new THREE.SphereGeometry(1, 14, 8), mat.canvas, M(x0 + 0.26, rail + 0.17, mz, 0, 0, 0.05, 0.2, 0.055, 0.28), { mode: 'world', scale: 1.0 });
    S.add(new THREE.BoxGeometry(0.42, 0.05, z1 - z0 - 0.02), mat.wool, M(x1 - 0.3, rail + 0.15, mz, 0, 0, -0.04), { mode: 'world', scale: 0.4 });
    for (let i = 0; i < 22; i++) {
      const along = R() < 0.5, x = along ? rand(x0 + 0.1, x1 - 0.1) : (R() < 0.5 ? x0 + 0.03 : x1 - 0.03), z = along ? (R() < 0.5 ? z0 + 0.02 : z1 - 0.02) : rand(z0 + 0.1, z1 - 0.1);
      S.cyl(mat.straw, 0.0018, 0.0018, rand(0.04, 0.1), x, rail + rand(0.07, 0.13), z, rand(-1.3, 1.3), rand(0, 3), rand(-1.3, 1.3), 4, 0.2);
    }
    S.add(new THREE.BoxGeometry(0.2, 0.09, 0.13), mat.tinware, M(x1 - 0.25, 0.045, z1 + 0.02, 0, 0.35, 0), IRON);
    S.box(mat.hessian, -2.55, 0, -1.25, -1.55, 0.012, -0.62, { mode: 'world', scale: 0.4 });
    S.add(new THREE.BoxGeometry(0.11, 0.12, 0.26), mat.leather, M(-1.0, 0.06, -1.62, 0, 0.3, 0), IRON);
    S.add(new THREE.BoxGeometry(0.11, 0.12, 0.26), mat.leather, M(-0.86, 0.06, -1.6, 0, 0.12, 0), IRON);
  }

  // loose floorboard (hinged on its north edge) and the photo hidden under it
  const boardPivot = new THREE.Group();
  boardPivot.position.set((HOLE.x0 + HOLE.x1) / 2, 0.004, HOLE.z0);
  {
    const g = new THREE.BoxGeometry(HOLE.x1 - HOLE.x0 - 0.004, 0.022, HOLE.z1 - HOLE.z0 - 0.004).toNonIndexed();
    g.translate((HOLE.x0 + HOLE.x1) / 2, -0.011 + 0.004, (HOLE.z0 + HOLE.z1) / 2);
    worldUV(g, FLOOR.scale, FLOOR.offset);
    g.translate(-(HOLE.x0 + HOLE.x1) / 2, -0.004, -HOLE.z0);
    const board = new THREE.Mesh(g, mat.floor);
    board.castShadow = board.receiveShadow = true;
    boardPivot.add(board);
  }
  scene.add(boardPivot);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.075), std(T.photo, { roughness: 0.6 }));
  photo.rotation.set(-Math.PI / 2, 0, 0.12); photo.position.set(-0.62, -0.028, (HOLE.z0 + HOLE.z1) / 2);
  scene.add(photo);

  // ---------- bookshelf: planks on bricks, scavenged books, the idol on top ----------
  {
    const { x0, x1, z0, z1 } = SHELF, planks = [[0.08, 0.11], [0.43, 0.46], [0.78, 0.81]];
    let base = 0;
    for (const [pb, pt] of planks) {
      S.box(mat.wood, x0, pb, z0, x1, pt, z1, WOOD);
      for (const bz of [z0 + 0.07, z1 - 0.07]) for (let y = base; y < pb - 0.01; y += 0.08) S.add(new THREE.BoxGeometry(0.2, 0.078, 0.1), mat.brick, M((x0 + x1) / 2 + rand(-0.01, 0.01), y + 0.039, bz, 0, rand(-0.06, 0.06), 0), IRON);
      base = pt;
    }
    const BK = new Batch();
    for (const [, top] of planks.slice(0, 2)) {
      let z = z0 + 0.14;
      while (z < z1 - 0.16) {
        const t = rand(0.02, 0.05), h = rand(0.17, 0.3), d = rand(0.14, 0.2), m = pick(bookMats);
        if (R() < 0.12 && z < z1 - 0.4) {
          for (let k = 0; k < 3; k++) BK.add(new THREE.BoxGeometry(d, rand(0.03, 0.05), rand(0.18, 0.24)), pick(bookMats), M(x0 + 0.01 + d / 2, top + 0.025 + k * 0.045, z + 0.12, 0, rand(-0.15, 0.15), 0), { mode: 'world', scale: 0.3 });
          z += 0.26; continue;
        }
        const lean = R() < 0.1 ? rand(0.15, 0.3) : 0;
        BK.add(new THREE.BoxGeometry(d, h, t), m, M(x0 + 0.01 + d / 2, top + h / 2 - lean * 0.02, z + t / 2 + lean * 0.06, lean, 0, 0), { mode: 'world', scale: 0.3 });
        z += t + 0.003 + lean * 0.12;
      }
    }
    BK.build(scene);
    S.cyl(mat.tinware, 0.04, 0.04, 0.12, x0 + 0.12, 0.81 + 0.06, z0 + 0.22, 0, 0, 0, 12, 0.3);
    S.cyl(mat.wax, 0.022, 0.024, 0.06, x0 + 0.13, 0.81 + 0.03, z1 - 0.12, 0, 0, 0, 10, 0.2);
    S.cyl(mat.wax, 0.045, 0.05, 0.006, x0 + 0.13, 0.813, z1 - 0.12, 0, 0, 0, 12, 0.2);
  }
  const idol = new THREE.Group();
  idol.position.set(SHELF.x0 + 0.13, 0.81, 0.05);
  const idolMat = std(T.idolBody, { roughness: 0.5, metalness: 0.6, envMapIntensity: 0.7 });
  const headMat = std(T.idolHead, { roughness: 0.5, metalness: 0.6, envMapIntensity: 0.7, emissive: 0xffffff, emissiveMap: T.idolHeadE, emissiveIntensity: 0.6 });
  const part = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true; idol.add(mesh); return mesh; };
  part(new THREE.CylinderGeometry(0.062, 0.07, 0.025, 18), idolMat, 0, 0.0125, 0);
  part(new THREE.SphereGeometry(1, 16, 10), idolMat, 0.005, 0.045, 0, 0.085, 0.032, 0.075);
  part(new THREE.SphereGeometry(1, 16, 12), idolMat, 0, 0.108, 0, 0.048, 0.07, 0.042);
  part(new THREE.SphereGeometry(1, 12, 8), idolMat, 0.034, 0.066, 0, 0.026, 0.014, 0.03);
  part(new THREE.SphereGeometry(1, 12, 8), idolMat, 0, 0.15, 0, 0.058, 0.026, 0.05);
  part(new THREE.CylinderGeometry(0.016, 0.018, 0.024, 10), idolMat, 0, 0.17, 0);
  const idolHead = new THREE.Group(); idolHead.position.set(0, 0.2, 0); idol.add(idolHead);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.033, 28, 18), headMat); headMesh.castShadow = true; idolHead.add(headMesh);
  scene.add(idol);
  const idolLight = new THREE.PointLight(0x9a6bff, 0.25, 0.9, 2);
  idolLight.position.set(SHELF.x0 + 0.2, 1.02, 0.05); scene.add(idolLight);

  // ---------- wash basin on its iron stand, cracked mirror above ----------
  {
    const { x, z } = BASIN;
    for (const a of [0.5, 2.6, 4.7]) S.cyl(mat.iron, 0.011, 0.011, 0.86, x + Math.cos(a) * 0.15, 0.42, z + Math.sin(a) * 0.15, Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.06, 6);
    S.add(new THREE.TorusGeometry(0.17, 0.009, 6, 26), mat.iron, M(x, 0.84, z, Math.PI / 2, 0, 0), IRON);
    S.add(new THREE.TorusGeometry(0.15, 0.007, 6, 26), mat.iron, M(x, 0.3, z, Math.PI / 2, 0, 0), IRON);
    S.add(lathe([[0, 0], [0.08, 0], [0.13, 0.02], [0.17, 0.06], [0.195, 0.1], [0.205, 0.106]]), mat.enamel, M(x, 0.8, z), { mode: 'scale', su: 1, sv: 1 });
    S.add(new THREE.CircleGeometry(0.168, 24), mat.water, M(x, 0.872, z, -Math.PI / 2, 0, 0), { mode: 'scale', su: 1, sv: 1 });
    S.add(lathe([[0, 0], [0.06, 0], [0.065, 0.14], [0.045, 0.2], [0.05, 0.23]], 16), mat.enamel, M(x + 0.02, 0.307, z - 0.02), { mode: 'scale', su: 1, sv: 1 });
    S.box(mat.wood, -RX, 1.26, 1.53, -RX + 0.02, 1.74, 1.91, WOOD);
    S.box(mat.mask, -RX + 0.005, 0.95, 1.24, -RX + 0.02, 1.32, 1.44, { mode: 'world', scale: 0.6 });
  }
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), std(T.mirror, { roughness: 0.07, metalness: 0.95, envMapIntensity: 1.1 }));
  mirror.rotation.y = Math.PI / 2; mirror.position.set(-RX + 0.022, 1.5, 1.72); scene.add(mirror);

  // ---------- kitchen bench on crates, sink with dishes, kero stove and billy ----------
  {
    const { x0, x1, z0, z1, h } = BENCH;
    S.box(mat.wood, x0, h - 0.045, z0, x1, h, z1, WOOD);
    for (const cx of [x0 + 0.27, x1 - 0.27]) {
      S.box(mat.crate, cx - 0.25, 0, z0 + 0.02, cx + 0.25, 0.415, z1 - 0.02, { mode: 'world', scale: 0.5 });
      S.box(mat.crate, cx - 0.25, 0.42, z0 + 0.02, cx + 0.25, h - 0.045, z1 - 0.02, { mode: 'world', scale: 0.5 });
    }
    S.box(mat.hessian, x0 + 0.53, 0.02, z1 - 0.022, x1 - 0.53, h - 0.06, z1 - 0.012, { mode: 'world', scale: 0.4 });
    S.box(mat.wood, x0 + 0.12, 1.41, z0, x1 - 0.12, 1.44, z0 + 0.21, WOOD);
    for (const bx of [x0 + 0.3, x1 - 0.3]) S.box(mat.iron, bx - 0.012, 1.25, z0, bx + 0.012, 1.41, z0 + 0.15, IRON);
    const sx = 2.2, sz = -1.96;
    S.add(lathe([[0, 0], [0.12, 0], [0.18, 0.06], [0.21, 0.12], [0.22, 0.13]]), mat.enamel, M(sx, h, sz), { mode: 'scale', su: 1, sv: 1 });
    for (let k = 0; k < 3; k++) S.add(new THREE.CylinderGeometry(0.1, 0.085, 0.012, 20), mat.enamel, M(sx - 0.02 + k * 0.01, h + 0.04 + k * 0.02, sz + 0.01, 0.5, 0.2 * k, 0.1), { mode: 'scale', su: 1, sv: 1 });
    S.add(lathe([[0, 0], [0.08, 0], [0.085, 0.1], [0.09, 0.102]], 18), mat.tinware, M(sx + 0.08, h + 0.03, sz - 0.05, 0.25, 0, -0.2), { mode: 'scale', su: 2, sv: 1 });
    S.add(new THREE.BoxGeometry(0.015, 0.006, 0.2), mat.tinware, M(sx + 0.1, h + 0.16, sz - 0.03, 0.9, 0.3, 0), IRON);
    S.cyl(mat.iron, 0.07, 0.075, 0.09, 1.48, h + 0.045, -1.97, 0, 0, 0, 14);
    S.add(new THREE.TorusGeometry(0.06, 0.006, 6, 16), mat.iron, M(1.48, h + 0.092, -1.97, Math.PI / 2, 0, 0), IRON);
    S.cyl(mat.tinware, 0.065, 0.068, 0.13, 1.48, h + 0.16, -1.97, 0, 0, 0, 16, 0.4);
    S.add(new THREE.TorusGeometry(0.066, 0.0025, 4, 16, Math.PI), mat.iron, M(1.48, h + 0.225, -1.97, 0, 0.6, 0), IRON);
  }
  const labelMats = T.labels.map(t => std(t, { roughness: 0.6 }));
  const canSpots = [[1.45, 1.44, 0], [1.56, 1.44, 1], [1.56, 1.554, 2], [1.74, 1.44, 0], [2.06, 1.44, 1], [2.18, 1.44, 2], [2.62, 1.44, 0], [1.66, BENCH.h, 1]];
  for (const [x, y, li] of canSpots) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.11, 18), [labelMats[li], mat.tinware, mat.tinware]);
    can.position.set(x, y + 0.055, BENCH.z0 + 0.1 + (y === BENCH.h ? 0.25 : 0)); can.rotation.y = rand(0, TAU);
    if (li === 2 && y > 1.5) can.scale.set(0.86, 1, 1);
    can.castShadow = can.receiveShadow = true; scene.add(can);
  }
  S.cyl(mat.murk, 0.038, 0.038, 0.1, 2.36, 1.44 + 0.06, BENCH.z0 + 0.1, 0, 0, 0, 14, 0.3);
  const shelfJar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 18, 1, true), jarGlass);
  shelfJar.position.set(2.36, 1.44 + 0.065, BENCH.z0 + 0.1); scene.add(shelfJar);

  // ---------- cooling safe: wet hessian on a frame, legs standing in ant moats ----------
  {
    const { x, z } = SAFE, hw = 0.23, hd = 0.21;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      S.box(mat.wood, x + dx * (hw - 0.02) - 0.015, 0.02, z + dz * (hd - 0.02) - 0.015, x + dx * (hw - 0.02) + 0.015, 1.12, z + dz * (hd - 0.02) + 0.015, WOOD);
      S.cyl(mat.tinware, 0.045, 0.045, 0.05, x + dx * (hw - 0.02), 0.025, z + dz * (hd - 0.02), 0, 0, 0, 12, 0.3, true);
      S.add(new THREE.CircleGeometry(0.043, 12), mat.water, M(x + dx * (hw - 0.02), 0.04, z + dz * (hd - 0.02), -Math.PI / 2, 0, 0), { mode: 'scale', su: 1, sv: 1 });
    }
    S.box(mat.hessian, x - hw + 0.01, 0.34, z - hd + 0.01, x + hw - 0.01, 1.1, z + hd - 0.01, { mode: 'world', scale: 0.4 });
    S.box(mat.wood, x - hw, 0.32, z - hd, x + hw, 0.35, z + hd, WOOD);
    S.box(mat.tinware, x - hw - 0.01, 1.1, z - hd - 0.01, x + hw + 0.01, 1.14, z + hd + 0.01, IRON);
    for (const wz of [z - 0.1, z + 0.1]) S.box(mat.hessian, x - hw - 0.012, 0.86, wz - 0.04, x - hw - 0.006, 1.13, wz + 0.04, { mode: 'world', scale: 0.4 });
    S.box(mat.wood, x - hw - 0.03, 0.7, z + 0.13, x - hw, 0.76, z + 0.16, WOOD);
  }

  // ---------- water drum, notice board, thermometer, broom ----------
  S.cyl(mat.iron, 0.27, 0.27, 0.86, 0.83, 0.43, -1.94, 0, 0, 0, 22, 0.6);
  S.cyl(mat.iron, 0.282, 0.282, 0.02, 0.83, 0.87, -1.94, 0, 0, 0, 22, 0.6);
  for (const y of [0.2, 0.62]) S.add(new THREE.TorusGeometry(0.272, 0.01, 6, 28), mat.iron, M(0.83, y, -1.94, Math.PI / 2, 0, 0), IRON);
  S.box(mat.wood, -0.53, 1.27, -RZ, 0.43, 1.93, -RZ + 0.025, WOOD);
  const notes = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), std(T.notes, { roughness: 0.9 }));
  notes.position.set(-0.05, 1.6, -RZ + 0.027); notes.receiveShadow = true; scene.add(notes);
  S.box(mat.tinware, RX - 0.012, 1.4, 1.185, RX, 1.7, 1.255, IRON);
  const thermoFace = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.29), std(T.thermo, { roughness: 0.6 }));
  thermoFace.rotation.y = -Math.PI / 2; thermoFace.position.set(RX - 0.0125, 1.55, 1.22); scene.add(thermoFace);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.22, 8, 1, true), jarGlass);
  tube.position.set(RX - 0.022, 1.565, 1.212); scene.add(tube);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), mat.mercury); bulb.position.set(RX - 0.022, 1.448, 1.212); scene.add(bulb);
  const mercury = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 1, 6).translate(0, 0.5, 0), mat.mercury);
  mercury.position.set(RX - 0.022, 1.452, 1.212); scene.add(mercury);
  S.cyl(mat.wood, 0.013, 0.013, 1.25, 2.83, 0.72, 2.07, -0.1, 0, 0.11, 8, 0.6);
  S.add(new THREE.ConeGeometry(0.11, 0.32, 10, 1, true), mat.straw, M(2.9, 0.15, 2.1, 0, 0, 0.11), { mode: 'scale', su: 1, sv: 1 });

  // ---------- hooks by the door: goggles, dust mask, sun scarf ----------
  S.box(mat.wood, 0.0, 1.66, RZ - 0.025, 0.76, 1.74, RZ, WOOD);
  for (const hx of [0.14, 0.38, 0.62]) S.cyl(mat.iron, 0.006, 0.006, 0.06, hx, 1.69, RZ - 0.045, Math.PI / 2, 0, 0, 6);
  S.add(new THREE.TorusGeometry(0.07, 0.006, 4, 20), mat.leather, M(0.14, 1.6, RZ - 0.05, 0, 0, 0, 1, 1.35, 1), IRON);
  for (const dx of [-0.033, 0.033]) {
    S.cyl(mat.lens, 0.026, 0.026, 0.02, 0.14 + dx, 1.535, RZ - 0.065, Math.PI / 2, 0, 0, 14);
    S.add(new THREE.TorusGeometry(0.027, 0.006, 6, 16), mat.leather, M(0.14 + dx, 1.535, RZ - 0.072), IRON);
  }
  S.add(new THREE.BoxGeometry(0.15, 0.12, 0.04), mat.mask, M(0.38, 1.58, RZ - 0.05, -0.1, 0, 0), { mode: 'world', scale: 0.5 });
  S.add(new THREE.TorusGeometry(0.06, 0.003, 4, 16), mat.leather, M(0.38, 1.64, RZ - 0.045), IRON);
  S.add(new THREE.BoxGeometry(0.17, 0.76, 0.012), mat.scarf, M(0.62, 1.29, RZ - 0.04, 0.03, 0, 0.02), { mode: 'world', scale: 0.6 });
  S.add(new THREE.BoxGeometry(0.19, 0.1, 0.03), mat.scarf, M(0.62, 1.68, RZ - 0.045), { mode: 'world', scale: 0.6 });

  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), std(T.poster, { roughness: 0.92 }));
  poster.rotation.set(0, Math.PI, 0.035); poster.position.set(1.78, 1.42, RZ - 0.004); poster.receiveShadow = true; scene.add(poster);

  // ---------- glass in the window ----------
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(WIN.z1 - WIN.z0, WIN.y1 - WIN.y0), glass);
  pane.rotation.y = -Math.PI / 2; pane.position.set(RX + 0.016, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
  pane.renderOrder = 2; scene.add(pane);

  // ---------- the Truth-Rot jar, hanging from the ridge over the table ----------
  const jar = new THREE.Group();
  const pivotY = RIDGE - 0.17;
  jar.position.set(JAR.x, pivotY, JAR.z);
  {
    const drop = pivotY - 2.27;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, drop, 4), mat.iron); wire.position.y = -drop / 2; jar.add(wire);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 16), mat.iron); lid.position.y = -drop - 0.01; jar.add(lid);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 20, 1, true), jarGlass); body.position.y = -drop - 0.1; jar.add(body);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), jarGlass); base.rotation.x = -Math.PI / 2; base.position.y = -drop - 0.18; jar.add(base);
    const fungus = new THREE.MeshStandardMaterial({ color: 0xdff2c8, emissive: 0x7cf04a, emissiveIntensity: 2.2, roughness: 0.5 });
    jar.userData.fungus = fungus;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + rand(-0.3, 0.3), r = rand(0.012, 0.035), hgt = rand(0.02, 0.06);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, hgt, 6), fungus); stem.position.set(Math.cos(a) * r, -drop - 0.18 + hgt / 2, Math.sin(a) * r); jar.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2), fungus); cap.scale.set(rand(0.012, 0.022), rand(0.008, 0.014), rand(0.012, 0.022)); cap.position.set(stem.position.x, -drop - 0.18 + hgt, stem.position.z); jar.add(cap);
    }
    const light = new THREE.PointLight(0x9ae86e, 1.0, 3.2, 2); light.position.y = -drop - 0.1; jar.add(light);
    jar.userData.light = light;
  }
  scene.add(jar);

  S.build(scene);

  // ---------- outside: sky dome and red ground, seen through the gaps ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(1, 0.1, 0.1) }, uWarm: { value: 0 }, ...POSTU },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: POST_GLSL + `uniform vec3 uSun; uniform float uWarm; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 zen = mix(vec3(0.30, 0.38, 0.55), vec3(0.55, 0.68, 0.82), uWarm);
        vec3 hor = mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.86, 0.66), uWarm);
        vec3 gnd = vec3(0.45, 0.18, 0.08);
        vec3 c = h > 0.0 ? mix(hor, zen, pow(clamp(h * 1.6, 0.0, 1.0), 0.7)) : mix(hor, gnd, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        c += vec3(1.0, 0.82, 0.55) * (pow(s, 700.0) * 8.0 + pow(s, 14.0) * 0.7);
        gl_FragColor = vec4(postOut(c), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), skyMat); sky.renderOrder = -1; scene.add(sky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x8a3f1f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; scene.add(ground);

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0xffcf9e, 0x3a1a10, 0.75); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb070, 4.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 2, far: 32 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.018;
  sun.target.position.set(0, 1, 0);
  scene.add(sun, sun.target);
  const bounce = new THREE.PointLight(0xff8a50, 5, 7, 2); bounce.position.set(-1.9, 0.7, -0.2); scene.add(bounce);

  // a static environment map so metal, enamel and the mirror have something warm to reflect
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4.5), new THREE.MeshBasicMaterial({ color: 0x3a2418, side: THREE.BackSide })));
    const add = (w, h, color, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; env.add(m); };
    add(0.9, 1.0, 0xffd6a0, 2.95, 0.0, 0.45, -Math.PI / 2);
    add(1.4, 0.8, 0xa65a32, -2.95, -0.6, 0.0, Math.PI / 2);
    add(0.4, 0.4, 0x4a8a2a, 0.4, 1.3, 0.2, 0);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();
  }

  // ---------- sunbeams through every gap, with dust turning in them ----------
  const beamU = { uDir: { value: new THREE.Vector3(-1, -0.1, -0.05) }, uLen: { value: 7.5 }, uColor: { value: new THREE.Color(0xffb878) }, uIntensity: { value: 0.16 }, uTime: { value: 0 }, ...POSTU };
  {
    const corners = [], vs = [], us = [], gains = [];
    for (const o of openings) {
      const pad = 0.01, x = RX - 0.004;
      const c = [[x, o.y0 - pad, o.z0 - pad], [x, o.y0 - pad, o.z1 + pad], [x, o.y1 + pad, o.z1 + pad], [x, o.y1 + pad, o.z0 - pad]];
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4];
        const quad = [[a, 0, 0], [b, 0, 1], [b, 1, 1], [a, 0, 0], [b, 1, 1], [a, 1, 0]];
        for (const [p, v, u] of quad) { corners.push(...p); vs.push(v); us.push(u); gains.push(o.gain); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(vs, 1));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    g.setAttribute('aGain', new THREE.Float32BufferAttribute(gains, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute float aV; attribute float aU; attribute float aGain; uniform vec3 uDir; uniform float uLen;
        varying float vV; varying float vU; varying float vGain; varying vec3 vW;
        void main(){ vec3 p = position + uDir * (uLen * aV); vV = aV; vU = aU; vGain = aGain; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: POST_GLSL + `uniform vec3 uColor; uniform float uIntensity; uniform float uTime; varying float vV; varying float vU; varying float vGain; varying vec3 vW;
        void main(){ float along = pow(1.0 - vV, 1.7); float across = smoothstep(0.0, 0.5, vU) * smoothstep(1.0, 0.5, vU);
          float flick = 0.82 + 0.18 * sin(uTime * 1.3 + vW.x * 2.7 + vW.y * 4.1 + vW.z * 1.9);
          float a = along * across * flick * uIntensity * vGain; gl_FragColor = vec4(postAdd(uColor * a), 1.0); }`,
    });
    const beams = new THREE.Mesh(g, m); beams.frustumCulled = false; beams.renderOrder = 3; scene.add(beams);
  }
  const dustU = { uDir: beamU.uDir, uLen: beamU.uLen, uTime: beamU.uTime, uScale: { value: 400 }, uColor: { value: new THREE.Color(0xffd4a0) }, uIntensity: { value: 1 }, ...POSTU };
  {
    const starts = [], ts = [], seeds = [], kinds = [];
    for (const o of openings) {
      const area = (o.z1 - o.z0 + 0.02) * (o.y1 - o.y0 + 0.02), n = Math.round(clamp(area * 2600, 10, 70));
      for (let i = 0; i < n; i++) { starts.push(RX - 0.01, rand(o.y0 - 0.01, o.y1 + 0.01), rand(o.z0 - 0.01, o.z1 + 0.01)); ts.push(rand(0.02, 0.85)); seeds.push(R()); kinds.push(1); }
    }
    for (let i = 0; i < 260; i++) { starts.push(rand(-RX, RX), rand(0.2, 2.3), rand(-RZ, RZ)); ts.push(0); seeds.push(R()); kinds.push(0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(starts, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aT; attribute float aSeed; attribute float aKind; uniform vec3 uDir; uniform float uLen; uniform float uTime; uniform float uScale; varying float vA;
        void main(){ vec3 p = position + uDir * (uLen * aT);
          p += vec3(sin(uTime * 0.21 + aSeed * 40.0), sin(uTime * 0.15 + aSeed * 17.0) * 0.7, cos(uTime * 0.18 + aSeed * 23.0)) * mix(0.25, 0.03, aKind);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float tw = 0.55 + 0.45 * sin(uTime * 1.4 + aSeed * 31.0);
          vA = aKind > 0.5 ? pow(1.0 - aT, 1.3) * tw : 0.1 * tw;
          gl_PointSize = max(1.0, mix(0.004, 0.0055, aKind) * uScale / -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: POST_GLSL + `uniform vec3 uColor; uniform float uIntensity; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uIntensity; gl_FragColor = vec4(postAdd(uColor * a), 1.0); }`,
    });
    const dust = new THREE.Points(g, m); dust.frustumCulled = false; dust.renderOrder = 4; scene.add(dust);
  }

  // ---------- gossip-flies on the glass and sill ----------
  const FLY_N = 16;
  const flyGeo = (() => {
    const body = new THREE.SphereGeometry(1, 8, 6).toNonIndexed(); body.scale(0.0065, 0.0055, 0.012);
    const w1 = new THREE.PlaneGeometry(0.012, 0.007).toNonIndexed(); w1.rotateX(-Math.PI / 2); w1.rotateY(0.5); w1.translate(0.008, 0.004, -0.002);
    const w2 = new THREE.PlaneGeometry(0.012, 0.007).toNonIndexed(); w2.rotateX(-Math.PI / 2); w2.rotateY(-0.5); w2.translate(-0.008, 0.004, -0.002);
    return mergeGeos([body, w1, w2]);
  })();
  const flyMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0d12, roughness: 0.28, metalness: 0.45, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 680], side: THREE.DoubleSide, envMapIntensity: 1.4 });
  const flies = new THREE.InstancedMesh(flyGeo, flyMat, FLY_N);
  flies.frustumCulled = false; scene.add(flies);
  const flyData = [];
  for (let i = 0; i < FLY_N; i++) {
    const onGlass = i < 11;
    const home = onGlass ? new THREE.Vector3(RX + 0.008, rand(1.0, 1.85), rand(0.06, 0.84)) : new THREE.Vector3(rand(RX - 0.07, RX - 0.01), WIN.y0 + 0.006, rand(0.0, 0.88));
    flyData.push({ home, onGlass, pos: home.clone(), from: new THREE.Vector3(), to: new THREE.Vector3(), seg: 0, segT: 0, phase: rand(0, 100), hop: rand(2, 9) });
  }
  const flyState = { mode: 'home', t: 0 };

  // ---------- what can be used ----------
  const items = [
    IT('flask', 'Tin flask', () => state.routine.breakfast ? 'Look' : 'Drink', 0.15, TT + 0.09, 0.08, 0.16, 0.22, 0.16),
    IT('bills', 'Bills', 'Read', 0.69, TT + 0.03, 0.27, 0.38, 0.08, 0.36),
    IT('rebar', 'Rebar knife', 'Take', 0.96, TT + 0.03, 0.045, 0.4, 0.07, 0.16),
    IT('window', 'Window', () => flyState.mode === 'home' ? 'Tap the glass' : 'Look', RX - 0.04, 1.45, 0.45, 0.12, 1.0, 0.9, [RX - 0.12, 1.25, 0.45]),
    IT('thermo', 'Thermometer', 'Read', RX - 0.03, 1.55, 1.22, 0.08, 0.34, 0.14, [RX - 0.08, 1.75, 1.22]),
    IT('basin', 'Wash basin', 'Wash your face', BASIN.x, 1.1, BASIN.z, 0.5, 0.8, 0.5, [BASIN.x + 0.05, 0.98, BASIN.z]),
    IT('sink', 'Sink', 'Look', 2.2, BENCH.h + 0.08, -1.96, 0.5, 0.2, 0.45),
    IT('tins', 'Tins', 'Look', 2.05, 1.52, -2.12, 1.5, 0.22, 0.26),
    IT('safe', 'Cooling safe', 'Look', SAFE.x, 0.75, SAFE.z, 0.5, 0.85, 0.46),
    IT('bed', 'Bed', 'Look', (BED.x0 + BED.x1) / 2, 0.42, (BED.z0 + BED.z1) / 2, 1.9, 0.4, 0.8),
    IT('seeds', 'Seed tin', 'Look', BED.x1 - 0.25, 0.06, BED.z1 + 0.02, 0.26, 0.14, 0.2),
    IT('board', 'Loose board', () => boardState.open ? 'Put it back' : 'Lift', (HOLE.x0 + HOLE.x1) / 2, 0.03, (HOLE.z0 + HOLE.z1) / 2, 0.62, 0.08, 0.2),
    IT('books', 'Books', 'Look', -2.86, 0.33, -0.07, 0.28, 0.5, 1.1, [-2.72, 0.62, -0.07]),
    IT('idol', 'Little idol', 'Look', -2.86, 0.92, 0.05, 0.2, 0.26, 0.2, [-2.76, 1.08, 0.05]),
    IT('door', 'Door', () => state.routine.gear && state.routine.rebar ? 'Head out' : 'Check the bolts', (DOOR.x0 + DOOR.x1) / 2, 1.0, RZ - 0.03, 0.85, 2.0, 0.1, [(DOOR.x0 + DOOR.x1) / 2, 1.3, RZ - 0.1]),
    IT('gear', 'Goggles, mask, scarf', () => state.routine.gear ? 'Look' : 'Gear up', 0.38, 1.42, RZ - 0.05, 0.72, 0.75, 0.12, [0.38, 1.82, RZ - 0.08]),
    IT('poster', 'Poster', 'Read', 1.78, 1.42, RZ - 0.01, 0.44, 0.62, 0.05, [1.78, 1.78, RZ - 0.06]),
    IT('jar', 'Truth-Rot jar', 'Look', JAR.x, 2.18, JAR.z, 0.2, 0.3, 0.2, [JAR.x, 1.98, JAR.z]),
    IT('notes', 'Notes', 'Read', -0.05, 1.6, -RZ + 0.03, 0.95, 0.64, 0.06, [-0.05, 1.98, -RZ + 0.08]),
    IT('drum', 'Water drum', 'Look', 0.83, 0.5, -1.94, 0.56, 0.95, 0.56),
  ];
  // ---------- glints over things not yet looked at ----------
  const glints = makeGlints(items.map(it => it.glintAt), T.glint);
  items.forEach((it, i) => { it.glintIndex = i; });
  scene.add(glints.points);
  const rebarItem = items.find(it => it.id === 'rebar');

  const colliders = [
    [BED.x0 - 0.05, BED.z0 - 0.05, BED.x1 + 0.03, BED.z1 + 0.04],
    [TABLE.x - TABLE.w / 2, TABLE.z - TABLE.d / 2, TABLE.x + TABLE.w / 2 + 0.08, TABLE.z + TABLE.d / 2],   // the knife hangs over the edge
    [0.2, 0.63, 0.7, 1.12],
    [BENCH.x0 - 0.02, BENCH.z0, BENCH.x1 + 0.04, BENCH.z1 + 0.03],
    [SAFE.x - 0.26, SAFE.z - 0.24, SAFE.x + 0.26, SAFE.z + 0.24],
    [0.55, -2.25, 1.11, -1.66],
    [SHELF.x0 - 0.02, SHELF.z0, SHELF.x1, SHELF.z1],
    [BASIN.x - 0.23, BASIN.z - 0.23, BASIN.x + 0.23, BASIN.z + 0.23],
    [RX - 0.1, WIN.z0 - 0.3, RX, 1.35],                 // window sill and the thermometer
    [-0.05, RZ - 0.14, 0.81, RZ],                       // the gear hanging on its hooks
    [DOOR.x0 - 0.05, RZ - 0.1, DOOR.x1 + 0.05, RZ],      // bolts and handle on the door
    [-0.55, -RZ, 0.45, -RZ + 0.1],                      // the notes board
  ].map(([x0, z0, x1, z1]) => rectC(x0, z0, x1, z1)).concat([circC(2.86, 2.08, 0.15)]);   // and the broom in the corner

  // ---------- per-frame animation ----------
  const sunTo = new THREE.Vector3(), cold = new THREE.Color(0xff9a58), warm = new THREE.Color(0xffd9a6), tmpC = new THREE.Color();
  const dummy = new THREE.Object3D(), tmpV = new THREE.Vector3(), camDir = new THREE.Vector3(), ndc = new THREE.Vector3();
  const idolState = { yaw: 0, unseen: 0, cooldown: 4 };
  const boardState = { open: false, angle: 0 };
  const shadow = { dirty: true };

  function setDawn(t) {
    const el = THREE.MathUtils.degToRad(5 + 8 * t), az = THREE.MathUtils.degToRad(5);
    sunTo.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    sun.position.copy(sun.target.position).addScaledVector(sunTo, 15);
    tmpC.copy(cold).lerp(warm, t); sun.color.copy(tmpC); sun.intensity = 4.8 + 3.0 * t;
    beamU.uDir.value.copy(sunTo).negate();
    beamU.uColor.value.copy(tmpC);
    beamU.uIntensity.value = 0.3 + 0.12 * t;
    bounce.intensity = 2.5 + 2.5 * t;
    skyMat.uniforms.uSun.value.copy(sunTo); skyMat.uniforms.uWarm.value = t;
    hemi.intensity = 0.75 + 0.2 * t;
  }

  function update(dt, time, ctx) {
    beamU.uTime.value = time;
    jar.rotation.z = Math.sin(time * 0.6) * 0.03; jar.rotation.x = Math.sin(time * 0.47 + 1) * 0.025;
    jarState.flare = Math.max(0, jarState.flare - dt * 0.5);
    jar.userData.light.intensity = 1.0 + Math.sin(time * 1.7) * 0.08 + Math.sin(time * 4.3) * 0.04 + jarState.flare * 3.5 * (0.8 + 0.2 * Math.sin(time * 40));
    jar.userData.fungus.emissiveIntensity = 2.2 + jarState.flare * 6;
    headMat.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.8));
    idolLight.intensity = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(time * 0.8));

    // flies
    flyState.t += dt;
    if (flyState.mode === 'scatter' && flyState.t > 10) flyState.mode = 'home';
    for (let i = 0; i < FLY_N; i++) {
      const f = flyData[i];
      if (flyState.mode === 'scatter') {
        f.segT += dt / f.segDur;
        if (f.segT >= 1) {
          f.seg++; f.segT = 0; f.from.copy(f.pos);
          if (f.seg >= 3 || flyState.t > 7.5) { f.to.copy(f.home); f.segDur = rand(1.6, 2.6); f.returning = true; }
          else { f.to.set(rand(1.0, 2.8), rand(1.0, 2.2), rand(-1.2, 1.8)); f.segDur = rand(0.8, 1.8); }
        }
        const k = f.segT * f.segT * (3 - 2 * f.segT);
        f.pos.lerpVectors(f.from, f.to, Math.min(1, k));
        if (!(f.returning && f.segT >= 1)) f.pos.add(tmpV.set(Math.sin(time * 23 + f.phase) * 0.02, Math.sin(time * 19 + f.phase * 2) * 0.02, Math.cos(time * 21 + f.phase) * 0.02));
        dummy.position.copy(f.pos); dummy.rotation.set(time * 7 + f.phase, time * 5 + f.phase, 0);
      } else {
        f.hop -= dt;
        if (f.hop < 0) { f.hop = rand(2, 9); if (f.onGlass) f.home.set(RX + 0.008, clamp(f.home.y + rand(-0.12, 0.12), 1.0, 1.88), clamp(f.home.z + rand(-0.12, 0.12), 0.04, 0.86)); else f.home.z = clamp(f.home.z + rand(-0.1, 0.1), 0, 0.88); }
        f.pos.lerp(f.home, 1 - Math.exp(-dt * 3));
        const j = 0.0025;
        dummy.position.set(f.pos.x, f.pos.y + Math.sin(time * 9 + f.phase) * j, f.pos.z + Math.cos(time * 7 + f.phase) * j);
        if (f.onGlass) dummy.rotation.set(Math.sin(f.phase) * 0.4, Math.PI / 2, -Math.PI / 2 + Math.sin(time * 0.7 + f.phase) * 0.6);
        else dummy.rotation.set(0, f.phase + Math.sin(time * 0.5 + f.phase), 0);
      }
      dummy.updateMatrix(); flies.setMatrixAt(i, dummy.matrix);
    }
    flies.instanceMatrix.needsUpdate = true;

    // the idol turns its head toward you, but only while you aren't looking
    const cam = ctx.camera;
    idol.getWorldPosition(tmpV); tmpV.y += 0.2;
    ndc.copy(tmpV).project(cam);
    cam.getWorldDirection(camDir);
    const toIdol = tmpV.clone().sub(cam.position), dist = toIdol.length();
    const seen = ndc.z < 1 && Math.abs(ndc.x) < 1.05 && Math.abs(ndc.y) < 1.05 && toIdol.dot(camDir) > 0;
    if (seen) { idolState.unseen = 0; }
    else {
      idolState.unseen += dt; idolState.cooldown -= dt;
      if (idolState.unseen > 1.5 && idolState.cooldown < 0 && ctx.started) {
        const dx = cam.position.x - tmpV.x, dz = cam.position.z - tmpV.z;
        let target = Math.atan2(-dz, dx);
        target = clamp(target, -1.3, 1.3);
        if (ctx.resetIdol) { idolState.yaw = 0; ctx.resetIdol = false; }
        else idolState.yaw += clamp(target - idolState.yaw, -0.45, 0.45);
        idolHead.rotation.y = idolState.yaw;
        idolState.cooldown = rand(3, 7);
        shadow.dirty = true;
      }
    }

    // floorboard hinge
    const goal = boardState.open ? 1.15 : 0;
    if (Math.abs(goal - boardState.angle) > 0.0005) {
      boardState.angle += (goal - boardState.angle) * (1 - Math.exp(-dt * 9));
      boardPivot.rotation.x = -boardState.angle;
      shadow.dirty = true;
    }

    glints.uniforms.uTime.value = time;

    // thermometer
    mercury.scale.y = clamp(ctx.temp / 50, 0, 1) * 0.19;
  }

  setDawn(0);
  const jarState = { flare: 0 };
  const bounds = { x0: -RX + 0.22, x1: RX - 0.22, z0: -RZ + 0.22, z1: RZ - 0.22 };
  return {
    id: 'shack', scene, sun, items, colliders, flies: flyState, flyData, idolState, idolHead, boardState, dustU, shadow, glints,
    setDawn, update,
    exposure: 1.25, far: 160, footstep: 'wood',
    spawn: { start: { x: -1.25, z: 1.0, yaw: -1.32, pitch: -0.08 }, door: { x: (DOOR.x0 + DOOR.x1) / 2, z: 1.62, yaw: 0, pitch: -0.05 } },
    // what light the hand and tools in view should catch in here: dim, warm, a little green from the jar
    vmLight: { sky: 0xb08a68, ground: 0x3a1c10, hemi: 0.85, key: 0xffb070, keyI: 1.35, keyDir: [0.55, 0.45, 0.7], fill: 0x9ae86e, fillI: 0.08 },
    groundAt: () => 0,
    collide(p, r) {
      p.x = clamp(p.x, bounds.x0, bounds.x1); p.z = clamp(p.z, bounds.z0, bounds.z1);
      for (const c of colliders) pushOut(p, r, c);
    },
    setGlint(it, on) { glints.set(it.glintIndex, on); },
    setRebar(on) { rebar.visible = on; rebarItem.gone = !on; shadow.dirty = true; },
    flareJar() { jarState.flare = 1; },
    scatterFlies() {
      flyState.mode = 'scatter'; flyState.t = 0;
      for (const f of flyData) { f.seg = 0; f.segT = 0; f.from.copy(f.pos); f.to.set(rand(1.2, 2.8), rand(1.0, 2.2), rand(-1.0, 1.6)); f.segDur = rand(0.5, 1.2); f.returning = false; }
    },
    resetFlies() { flyState.mode = 'home'; for (const f of flyData) f.pos.copy(f.home); },
    windowPoint: new THREE.Vector3(RX - 0.1, 1.35, 0.45),
    hitTargets: [{ id: 'flies', pos: new THREE.Vector3(RX - 0.05, 1.4, 0.45), r: 0.45 }],
  };
}
// ============================================================
// The yard: a circle of a thousand square metres around the shack,
// fenced by Beggar's Hand. Units are metres; +x is east, +z is south,
// the shack sits north of centre with its door facing the yard.
// ============================================================
const YARD = {
  R: 17.84, layoutSize: 40,
  lift: 0.3, house: { x: 0, z: -3.5 },
  deck: { x0: -2.65, x1: 0.85, z0: -1.2, z1: 0.35 },
  step: { x0: -1.5, x1: -0.25, z0: 0.35, z1: 0.8 },
  tank: { x: 4.6, z: -6.4, r: 0.95, h: 1.9, stand: 1.0 },
  still: { x: 6.0, z: -3.6 },
  pen: { x0: 5.6, x1: 14.6, z0: -2.6, z1: 8.4, gate: { z0: 2.4, z1: 4.4 } },
  shelter: { x0: 8.0, x1: 14.5, z0: -2.55, z1: 0.6, hi: 3.0, lo: 2.45 },
  feedTrough: { x: 6.35, z0: -1.9, z1: -0.5 },
  waterTrough: { x: 6.3, z0: 0.05, z1: 1.75 },
  feedPile: { x: 4.45, z: -1.2 },
  bin: { x: 13.6, z: 6.7 },
  coop: { x: -8.0, z: -7.4, w: 1.6, d: 1.2 },
  run: { x0: -9.4, x1: -6.6, z0: -6.8, z1: -4.2 },
  shed: { x0: -11.6, x1: -8.6, z0: -10.7, z1: -8.9 },
  tractor: { x: -6.0, z: 4.2 },
  ute: { x: -11.4, z: 6.4, yaw: 0.35 },
  firepit: { x: 0.8, z: 6.8 },
  barrel: { x: -9.6, z: -1.2 },
  clothesline: { x: -3.4, z: 4.4 },
  windmill: { x: 7.4, z: -12.2 },
  dunny: { x: -14.2, z: 1.6 },
  ironbark: { x: -12.6, z: -11.4 },
  boab: { x: 9.2, z: 12.4, kill: 3.2 },
  stobie: { x: -1.6, z: -16.5 },
  letterbox: { x: 1.7, z: -16.3 },
  devil: { x: -4.6, z: 17.15 },
  hemorrhage: { x: 2.25, z: -0.45 },
  tomato: { x: 3.0, z: 0.9 },
  woodpile: { x: -3.05, z: -0.45 },
  saltbush: [[-2.2, 11.5], [4.8, 13.1], [12.6, -6.2], [-14.6, -3.8], [-7.0, 13.6], [3.6, -10.8]],
  junk: [[-9.0, 11.6, 1.3], [-12.6, -6.0, 1.1], [10.4, -9.4, 1.2]],
  weeds: [[6.25, 3.4, 'pen'], [-2.6, 9.6], [9.8, -5.6], [-10.6, 3.6]],
  sunEl: 15, sunAz: -14,   // the shack's sun twenty minutes on: low in the east, a touch south of it
};
const LIFT = YARD.lift;

function yardMaterials(T, TY) {
  const S = THREE.MeshStandardMaterial;
  return {
    boards: std(T.wall, { roughness: 0.93 }),
    boardsDark: std(T.wall, { roughness: 0.95, color: 0x9a8a7a }),
    tin: std(T.tin, { roughness: 0.48, metalness: 0.62, normalMap: T.tinN, envMapIntensity: 0.6 }),
    tinOld: std(T.tin, { roughness: 0.62, metalness: 0.5, normalMap: T.tinN, color: 0xb09a8a, side: THREE.DoubleSide }),
    timber: std(T.wall, { roughness: 0.9, color: 0xc9b39a }),
    wood: std(T.wood, { roughness: 0.8 }),
    iron: std(T.iron, { roughness: 0.82, metalness: 0.5 }),
    rust: std(T.iron, { roughness: 0.9, metalness: 0.35, color: 0xe0a07c }),
    rustDS: std(T.iron, { roughness: 0.9, metalness: 0.35, color: 0xe0a07c, side: THREE.DoubleSide }),
    steel: new S({ color: 0x86827c, roughness: 0.42, metalness: 0.85 }),
    steelDS: new S({ color: 0x86827c, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide }),
    galv: std(T.iron, { color: 0xc9c6bc, roughness: 0.45, metalness: 0.75 }),
    galvDS: std(T.iron, { color: 0xc9c6bc, roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide }),
    concrete: std(T.brick, { color: 0xb8aea2, roughness: 0.95 }),
    brick: std(T.brick, { roughness: 0.95 }),
    log: std(TY.log, { roughness: 0.55, metalness: 0.4 }),
    ironbark: std(TY.ironbark, { roughness: 0.38, metalness: 0.78, envMapIntensity: 0.8 }),
    boab: std(TY.boab, { roughness: 0.95, color: 0xd2c8bf }),
    leaf: new S({ color: 0x6d7860, roughness: 0.75, side: THREE.DoubleSide, flatShading: true }),
    hide: std(TY.hide, { roughness: 0.9, flatShading: true }),
    horn: new S({ color: 0x4f4842, roughness: 0.55 }),
    cowEye: new S({ color: 0x2a1004, emissive: 0xe0661a, emissiveIntensity: 0.55, roughness: 0.25, flatShading: true }),
    feather: std(TY.feather, { roughness: 0.95, flatShading: true }),
    fowlEye: new S({ color: 0xff8a1a, emissive: 0xd05000, emissiveIntensity: 0.8, roughness: 0.15 }),
    beak: new S({ color: 0xb0893a, roughness: 0.55 }),
    crest: new S({ color: 0xc44a1c, roughness: 0.8, flatShading: true }),
    copper: std(TY.copper, { roughness: 0.38, metalness: 0.85, envMapIntensity: 0.9 }),
    fur: std(TY.fur, { roughness: 1 }),
    tractor: std(TY.tractorPaint, { roughness: 0.72, metalness: 0.3 }),
    tractorDS: std(TY.tractorPaint, { roughness: 0.72, metalness: 0.3, side: THREE.DoubleSide }),
    ute: std(TY.utePaint, { roughness: 0.68, metalness: 0.35 }),
    tyre: std(TY.tyre, { roughness: 0.95 }),
    rubber: new S({ color: 0x1d1a19, roughness: 0.95 }),
    chrome: new S({ color: 0xd8d2c8, roughness: 0.18, metalness: 1, envMapIntensity: 1.1 }),
    glassDirty: new S({ color: 0x9aa09a, transparent: true, opacity: 0.32, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide }),
    canvas: std(T.canvas, { roughness: 0.97 }),
    hessian: std(T.hessian, { roughness: 1 }),
    enamel: std(T.enamel, { roughness: 0.35, side: THREE.DoubleSide }),
    water: new S({ color: 0x1b2420, roughness: 0.04, metalness: 0.25, envMapIntensity: 1.3 }),
    ash: new S({ color: 0x3b3735, roughness: 1 }),
    ember: new S({ color: 0x2a0a02, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.9 }),
    char: std(TY.log, { color: 0x2a2624, roughness: 0.9 }),
    stone: std(TY.dirt, { color: 0xa69486, roughness: 0.95, flatShading: true }),
    dung: new S({ color: 0x3a2b24, roughness: 0.62, metalness: 0.4, flatShading: true }),
    feed: std(TY.dirt, { color: 0x9a8a78, roughness: 0.9, flatShading: true }),
    mesh: new S({ map: TY.mesh, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.5, color: 0xb0a89c }),
    wire: new S({ color: 0x5e5852, roughness: 0.5, metalness: 0.75 }),
    fuzz: std(TY.fuzz, { roughness: 1 }),
    pea: std(TY.eye, { roughness: 0.32 }),
    peaLid: new S({ color: 0x6e0c0e, roughness: 0.6, side: THREE.DoubleSide }),
    vine: Object.assign(new S({ color: 0x4a3a24, roughness: 0.9 }), { userData: { soft: true } }),   // creeping vines: walked through
    spinifex: new S({ color: 0xd2a94e, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    spinifexRust: new S({ color: 0x9a5a30, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    saltbush: new S({ color: 0x93a28f, roughness: 0.35, metalness: 0.1, flatShading: true }),
    berry: new S({ color: 0xf2f6f2, roughness: 0.05, transparent: true, opacity: 0.62, envMapIntensity: 1.5 }),
    compass: new S({ color: 0xa9c88e, roughness: 0.55 }),
    stalk: new S({ color: 0x5a2a1a, roughness: 0.7 }),
    heart: new S({ color: 0x8c1016, roughness: 0.35, emissive: 0x300306, emissiveIntensity: 1 }),
    fungus: new S({ color: 0xe6e2cf, roughness: 0.7, emissive: 0x7cf04a, emissiveIntensity: 0 }),
    wattle: new S({ color: 0xf4c430, roughness: 0.9, emissive: 0x4a3300, emissiveIntensity: 0.4, flatShading: true }),
    wattleTrunk: new S({ color: 0x4a3a2e, roughness: 0.9 }),
    obsidian: new S({ color: 0x15131a, roughness: 0.12, metalness: 0.6, envMapIntensity: 1.4, flatShading: true }),
    bone: new S({ color: 0xe9e2d4, roughness: 0.7 }),
    paper: std(T.paper, { roughness: 0.92 }),
    shirt: std(T.canvas, { color: 0x6f8aa0, roughness: 0.95, side: THREE.DoubleSide }),
    towel: std(T.canvas, { color: 0xb06048, roughness: 0.95, side: THREE.DoubleSide }),
    sock: std(T.canvas, { color: 0xa09a8c, roughness: 0.95, side: THREE.DoubleSide }),
    bit: new S({ color: 0x6ac0ff, emissive: 0x2a8cff, emissiveIntensity: 2.2, roughness: 0.12, flatShading: true }),
    brass: new S({ color: 0xc09640, roughness: 0.28, metalness: 1, envMapIntensity: 1.2 }),
    plastic: new S({ color: 0x3e6e8e, roughness: 0.4 }),
    ceramic: new S({ color: 0x7a4a2c, roughness: 0.18, envMapIntensity: 1.1 }),
    redGlass: new S({ color: 0xb01810, roughness: 0.08, emissive: 0x400404, envMapIntensity: 1.3, transparent: true, opacity: 0.88 }),
    clearGlass: new S({ color: 0xe8efe8, roughness: 0.03, transparent: true, opacity: 0.35, envMapIntensity: 1.5, depthWrite: false }),
    shadowOnly: null,
  };
}

// small helper: a Batch whose pieces are all offset by one matrix (the house sits on stumps, north of centre)
function offsetBatch(S, base) {
  return { add: (g, m, mx, uv) => S.add(g, m, base.clone().multiply(mx), uv), box(m, x0, y0, z0, x1, y1, z1, uv) { this.add(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), m, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), uv); } };
}

// ---------- the ground: one polar mesh, flat inside the fence, rolling red country outside ----------
function yardGround(Y) {
  const { scene, mats, TY } = Y;
  const rings = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 16.8, 17.4, 18.0, 18.6, 19.4, 20.5, 22, 24, 27, 31, 36, 42, 50, 60, 72, 88, 108, 135, 170, 215, 270];
  const segs = 180, pos = [], salt = [], idx = [];
  const hill = (x, z, r) => {
    if (r < 18.7) return 0;
    const a = Math.atan2(z, x);
    let h = smooth(18.7, 32, r) * (0.7 * Math.sin(a * 3 + r * 0.07) + 0.5 * Math.sin(a * 7 - r * 0.11) + 0.35 * Math.sin(r * 0.21 + a * 2) + 0.6);
    // a long ridge to the south-east where something pale walks
    const ra = Math.atan2(36, 52), dA = Math.atan2(Math.sin(a - ra), Math.cos(a - ra));
    h += 5.5 * Math.exp(-dA * dA * 6) * Math.exp(-((r - 66) * (r - 66)) / 260);
    h += smooth(70, 240, r) * 6 * (0.5 + 0.5 * Math.sin(a * 5 + 1.3));
    return h;
  };
  for (const r of rings) for (let i = 0; i <= segs; i++) {
    const a = i / segs * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x, hill(x, z, r), z);
    // the salt pan: a white glare to the south, out past the ridge
    const dA = Math.atan2(Math.sin(a - Math.PI / 2 - 0.15), Math.cos(a - Math.PI / 2 - 0.15));
    salt.push(smooth(70, 110, r) * (1 - smooth(0.35, 0.7, Math.abs(dA))) * (0.75 + 0.25 * Math.sin(a * 23 + r * 0.3)));
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSalt', new THREE.Float32BufferAttribute(salt, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  // the painted dirt to begin with; the shack's photographed red dust takes over once it has loaded
  const GU = { uLayout: { value: TY.layout }, uDetail: { value: TY.dirt }, uDetailN: { value: reliefFor(TY.dirt, 2.4) }, uTile: { value: 1.7 }, uGain: { value: 1 } };
  loadPhotoDirt(GU);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSalt; varying float vSalt; varying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSalt = aSalt;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uLayout; uniform sampler2D uDetail; uniform sampler2D uDetailN; uniform float uTile; uniform float uGain; varying float vSalt; varying vec3 vGW;')
      .replace('#include <map_fragment>', `
        vec2 luv = vGW.xz / ${YARD.layoutSize.toFixed(1)} + 0.5;
        vec3 lay = texture2D(uLayout, clamp(luv, 0.002, 0.998)).rgb;
        float inYard = 1.0 - smoothstep(18.6, 19.8, length(vGW.xz));
        lay = mix(vec3(0.49), lay, inYard);
        vec3 d1 = texture2D(uDetail, vGW.xz / uTile).rgb;
        vec3 d2 = texture2D(uDetail, vGW.xz / (uTile * 3.6) + vec2(0.37, 0.71)).rgb;
        vec3 d3 = texture2D(uDetail, vGW.xz / (uTile * 18.2) + vec2(0.11, 0.53)).rgb;
        vec3 dirt = (d1 * 0.55 + d2 * 0.3 + d3 * 0.15) * uGain;
        vec3 col = dirt * lay * 2.04;
        float salt = max(smoothstep(0.55, 0.9, min(lay.r, min(lay.g, lay.b))), vSalt);
        float lum = dot(dirt, vec3(0.3, 0.59, 0.11));
        col = mix(col, vec3(0.86, 0.83, 0.78) * (0.7 + lum * 1.1), salt);
        diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // the dirt's own relief, from the same three scales as its colour, fading with distance so it never shimmers
          vec3 n1 = texture2D(uDetailN, vGW.xz / uTile).rgb * 2.0 - 1.0;
          vec3 n2 = texture2D(uDetailN, vGW.xz / (uTile * 3.6) + vec2(0.37, 0.71)).rgb * 2.0 - 1.0;
          vec2 g = n1.xy * 0.62 + n2.xy * 0.38;
          float fade = 1.0 - smoothstep(12.0, 55.0, length(vViewPosition));
          normal = normalize(normal + mat3(viewMatrix) * vec3(g.x, 0.0, g.y) * 0.9 * fade);
        }`);
  };
  const ground = new THREE.Mesh(g, mat);
  ground.receiveShadow = true;
  scene.add(ground);
  Y.hill = hill;

  // mesas on the horizon, banded like the cows
  const mesaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const MB = [];
  for (const [ang, dist, rad, h] of [[-1.2, 175, 26, 22], [-0.6, 205, 34, 16], [0.4, 190, 22, 26], [1.15, 230, 40, 14], [2.3, 185, 28, 20], [2.9, 210, 30, 24], [3.6, 170, 20, 18], [4.4, 220, 36, 15], [5.3, 195, 24, 21]]) {
    const geo = new THREE.CylinderGeometry(rad * 0.82, rad, h, 14, 4).toNonIndexed();
    const p = geo.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx), wob = 1 + 0.12 * Math.sin(a * 5 + ang * 3) + 0.06 * Math.sin(a * 13 + vy);
      if (Math.abs(vy) < h / 2 - 0.01) { p.setX(i, vx * wob); p.setZ(i, vz * wob); }
      const band = 0.5 + 0.5 * Math.sin(vy * 0.9 + ang), k = 0.62 + band * 0.22;
      col.push(0.62 * k, 0.3 * k, 0.2 * k);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.translate(Math.cos(ang) * dist, h / 2 - 2, Math.sin(ang) * dist);
    MB.push(geo);
  }
  const mergedM = new THREE.BufferGeometry();
  {
    let n = 0; for (const g2 of MB) n += g2.attributes.position.count;
    const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
    for (const g2 of MB) { P.set(g2.attributes.position.array, o * 3); Nn.set(g2.attributes.normal.array, o * 3); C.set(g2.attributes.color.array, o * 3); o += g2.attributes.position.count; }
    mergedM.setAttribute('position', new THREE.BufferAttribute(P, 3)); mergedM.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); mergedM.setAttribute('color', new THREE.BufferAttribute(C, 3));
  }
  scene.add(new THREE.Mesh(mergedM, mesaMat));
}

// the shack's dirt textures (assets/tex) were made for 2.5 m tiles; their brightness is matched to the painted
// dirt's, so the yard's layout map (paths, the pen's trodden floor, the salt) still reads the same over them
// the PC copy carries its files inside the page (window.__ASSETS); the web page fetches them from assets/
const assetURL = (path) => (window.__ASSETS && window.__ASSETS[path]) || 'assets/' + path;
function loadPhotoDirt(GU) {
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ imageOrientation: 'flipY' });
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  Promise.all([load(assetURL('tex/dirt_c.jpg')), load(assetURL('tex/dirt_n.jpg'))]).then(([c, n]) => {
    const mean = (img) => { const k = cv(32, 32), x = k.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; return s / (d.length / 4); };
    const tex = (img, srgb) => { const t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t; };
    const painted = GU.uDetail.value.image ? mean(GU.uDetail.value.image) : 0.45;
    GU.uGain.value = clamp(Math.pow(painted, 2.2) / Math.max(0.02, Math.pow(mean(c), 2.2)), 0.4, 2.5);
    GU.uDetail.value = tex(c, true); GU.uDetailN.value = tex(n, false); GU.uTile.value = 2.5;
  }).catch(() => { /* the painted dirt stays */ });
}

// ---------- sky, haze, the smoke of Bleak Flats on the northern horizon ----------
function yardSky(Y) {
  const { scene, sunDir } = Y;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir.clone() }, uHaze: { value: new THREE.Color(Y.hazeColor) }, ...POSTU },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: POST_GLSL + `uniform vec3 uSun; uniform vec3 uHaze; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 zen = vec3(0.30, 0.36, 0.56);
        vec3 mid = vec3(0.66, 0.64, 0.70);
        vec3 c = mix(uHaze, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zen, smoothstep(0.18, 0.9, h));
        if (h < 0.0) c = uHaze * 0.92;
        float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        c += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 14.0 + pow(s, 40.0) * 0.6 + pow(s, 6.0) * 0.18);
        gl_FragColor = vec4(postOut(c), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat); sky.renderOrder = -1; scene.add(sky);
  Y.sky = sky;
  // Bleak Flats: a black smudge of smoke to the north
  const smoke = new Particles(60, Y.TY.puff, { fog: false, renderOrder: 1 });
  smoke.mat.depthWrite = false;
  scene.add(smoke.points);
  for (let i = 0; i < 46; i++) smoke.emit(rand(-10, 10), rand(2, 70), -330 + rand(-10, 10), { vx: rand(1, 2.5), vy: rand(1.2, 2.2), life: 1e9, size: rand(30, 60), alpha: rand(0.28, 0.5), color: [0.28, 0.24, 0.23], drag: 0 });
  const smokeAge = new Float32Array(smoke.max);
  for (let i = 0; i < smoke.n; i++) { smoke.age[i] = 0; smokeAge[i] = rand(0, 60); }
  Y.updaters.push((dt) => {
    // a slow, endless column: wrap particles back to the base when they rise too high
    for (let i = 0; i < smoke.n; i++) {
      smokeAge[i] += dt;
      smoke.pos[i * 3] += smoke.vel[i * 3] * dt; smoke.pos[i * 3 + 1] += smoke.vel[i * 3 + 1] * dt;
      if (smoke.pos[i * 3 + 1] > 80) { smoke.pos[i * 3] = rand(-10, 10); smoke.pos[i * 3 + 1] = 2; smokeAge[i] = 0; }
      const t = smoke.pos[i * 3 + 1] / 80;
      smoke.sizeNow[i] = smoke.size0[i] * (0.5 + t * 1.2);
      smoke.alpha[i] = smoke.a0[i] * Math.min(1, smokeAge[i] / 6) * (1 - t * 0.7);
    }
    const g = smoke.geo; g.setDrawRange(0, smoke.n);
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
  });
  Y.smoke = smoke;
}

// ---------- the shack from outside, on its stumps, with a verandah ----------
function yardHouse(Y) {
  const { mats: m, S } = Y;
  const base = M(YARD.house.x, LIFT, YARD.house.z), H = offsetBatch(S, base);
  const WALL = { mode: 'world', scale: 1.2, offset: [0.31, 0] }, TIM = { mode: 'world', scale: 1.2 }, IRONUV = { mode: 'world', scale: 0.5 };
  // floor platform, bearers and stumps
  H.box(m.timber, -RX - WT - 0.02, -0.16, -RZ - WT - 0.02, RX + WT + 0.02, -0.0, RZ + WT + 0.02, TIM);
  for (const sx of [-2.85, -1.0, 1.0, 2.85]) for (const sz of [-2.1, 0, 2.1]) H.box(m.timber, sx - 0.06, -LIFT, sz - 0.06, sx + 0.06, -0.16, sz + 0.06, TIM);
  // walls with the door and window cut out, as inside
  H.box(m.boards, -RX - WT, 0, -RZ - WT, RX + WT, EAVE, -RZ, WALL);
  H.box(m.boards, -RX - WT, 0, RZ, DOOR.x0, EAVE, RZ + WT, WALL);
  H.box(m.boards, DOOR.x1, 0, RZ, RX + WT, EAVE, RZ + WT, WALL);
  H.box(m.boards, DOOR.x0, DOOR.h, RZ, DOOR.x1, EAVE, RZ + WT, WALL);
  H.box(m.boards, -RX - WT, 0, -RZ, -RX, EAVE, RZ, WALL);
  const cols = [[-RZ, SLITS[0].z, [[0, EAVE]]], [SLITS[0].z, SLITS[0].z + SLITS[0].w, [[0, SLITS[0].y0], [SLITS[0].y1, EAVE]]], [SLITS[0].z + SLITS[0].w, WIN.z0, [[0, EAVE]]], [WIN.z0, WIN.z1, [[0, WIN.y0], [WIN.y1, EAVE]]], [WIN.z1, SLITS[1].z, [[0, EAVE]]], [SLITS[1].z, SLITS[1].z + SLITS[1].w, [[0, SLITS[1].y0], [SLITS[1].y1, EAVE]]], [SLITS[1].z + SLITS[1].w, RZ, [[0, EAVE]]]];
  for (const [z0, z1, ys] of cols) for (const [y0, y1] of ys) H.box(m.boards, RX, y0, z0, RX + WT, y1, z1, WALL);
  // dark interior behind the gaps, so the slits read as slits
  H.box(m.wood, -RX, 0.01, -RZ, -RX + 0.01, EAVE, RZ, WALL);
  H.box(m.wood, RX - 0.02, 0.01, -RZ, RX - 0.01, EAVE, RZ, WALL);
  const gable = () => { const s = new THREE.Shape(); s.moveTo(-RZ - WT, EAVE); s.lineTo(RZ + WT, EAVE); s.lineTo(0, RIDGE + 0.05); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: WT, bevelEnabled: false }); g.translate(0, 0, -WT / 2); g.rotateY(Math.PI / 2); return g; };
  H.add(gable(), m.boards, M(-RX - WT / 2, 0, 0), WALL); H.add(gable(), m.boards, M(RX + WT / 2, 0, 0), WALL);
  // roof
  const slope = Math.atan2(RIDGE - EAVE, RZ), slopeLen = Math.hypot(RIDGE - EAVE, RZ), TINUV = { mode: 'world', scale: 1.0, offset: [0, 0] };
  for (const s of [-1, 1]) {
    const ext = 0.34, cz = s * (RZ / 2 + (ext / 2) * Math.cos(slope)) + s * 0.012 * Math.sin(slope), cy = (RIDGE + EAVE) / 2 - (ext / 2) * Math.sin(slope) + 0.012 * Math.cos(slope);
    H.add(new THREE.BoxGeometry(2 * RX + 0.6, 0.02, slopeLen + ext), m.tin, M(0, cy, cz, s * slope, 0, 0), TINUV);
  }
  H.box(m.tin, -RX - 0.3, RIDGE + 0.01, -0.13, RX + 0.3, RIDGE + 0.07, 0.13, TINUV);
  // a gutter along the north eave, running to the tank
  { const gz = -RZ - 0.36, gy = EAVE - 0.12; H.add(new THREE.CylinderGeometry(0.06, 0.06, 2 * RX + 0.6, 10, 1, true, 0, Math.PI), m.galvDS, M(0, gy, gz, Math.PI, 0, Math.PI / 2), IRONUV);
    H.add(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), m.galv, M(RX + 0.25, gy - 0.1, gz, 0, 0, 0.9), IRONUV); }
  // window frame and storm shutters
  H.box(m.wood, RX + WT, WIN.y0 - 0.05, WIN.z0 - 0.08, RX + WT + 0.04, WIN.y0, WIN.z1 + 0.08, IRONUV);
  const SH = { x0: RX + WT + 0.006, x1: RX + WT + 0.03 };
  const leaves = [
    { z0: WIN.z0 - 0.03, z1: 0.44, holes: [[1.19, 1.225], [1.44, 1.475], [1.69, 1.73]].map(([a, b]) => [WIN.z0 - 0.03, 0.44, a, b]) },
    { z0: 0.46, z1: WIN.z1 + 0.03, holes: [[1.1, 1.13], [1.33, 1.37]].map(([a, b]) => [0.46, WIN.z1 + 0.03, a, b]).concat([[0.56, 0.86, 1.5, 1.66]]) },
  ];
  for (const leaf of leaves) for (const r of solidCells(leaf.z0, leaf.z1, WIN.y0 - 0.03, WIN.y1 + 0.03, leaf.holes)) H.box(m.boardsDark, SH.x0, r[2], r[0], SH.x1, r[3], r[1], WALL);
  for (const z of [WIN.z0 - 0.05, WIN.z1 + 0.05]) for (const y of [WIN.y0 + 0.15, WIN.y1 - 0.15]) H.box(m.iron, RX + WT, y - 0.015, z - 0.02, SH.x1 + 0.01, y + 0.015, z + 0.02, IRONUV);
  // the door from outside: grey boards, a hasp, a handle worn bright
  const DZ = RZ + WT;
  H.box(m.boardsDark, DOOR.x0 + 0.01, 0.01, DZ - 0.01, DOOR.x1 - 0.01, DOOR.h - 0.01, DZ + 0.012, WALL);
  for (const bx of [DOOR.x0 - 0.06, DOOR.x1]) H.box(m.timber, bx, 0, DZ, bx + 0.06, DOOR.h + 0.06, DZ + 0.03, TIM);
  H.box(m.timber, DOOR.x0 - 0.06, DOOR.h, DZ, DOOR.x1 + 0.06, DOOR.h + 0.08, DZ + 0.03, TIM);
  H.box(m.iron, DOOR.x1 - 0.2, 1.02, DZ + 0.012, DOOR.x1 - 0.06, 1.07, DZ + 0.022, IRONUV);
  H.add(new THREE.TorusGeometry(0.035, 0.008, 6, 14), m.steel, M(DOOR.x1 - 0.13, 0.98, DZ + 0.03), IRONUV);
  for (const hy of [0.3, 1.75]) H.box(m.iron, DOOR.x0 + 0.01, hy, DZ + 0.012, DOOR.x0 + 0.26, hy + 0.05, DZ + 0.02, IRONUV);
  // verandah: deck on joists, posts, a skillion of old tin
  const D = YARD.deck, toH = (z) => z - YARD.house.z;      // deck values are yard z; inside this batch z is house-local
  const dz0 = toH(D.z0), dz1 = toH(D.z1);
  H.box(m.timber, D.x0, -0.04, dz0, D.x1, -0.0, dz1, { mode: 'world', scale: 1.0 });
  for (let x = D.x0 + 0.1; x < D.x1; x += 0.15) H.box(m.boardsDark, x - 0.003, -0.002, dz0, x + 0.003, 0.002, dz1, TIM);
  for (const x of [D.x0 + 0.05, (D.x0 + D.x1) / 2, D.x1 - 0.05]) H.box(m.timber, x - 0.05, -LIFT, dz1 - 0.1, x + 0.05, -0.04, dz1, TIM);
  const S0 = YARD.step;
  H.box(m.timber, S0.x0, -0.17, toH(S0.z0), S0.x1, -0.13, toH(S0.z1), TIM);
  H.box(m.timber, S0.x0, -LIFT, toH(S0.z1) - 0.05, S0.x0 + 0.05, -0.13, toH(S0.z1), TIM);
  H.box(m.timber, S0.x1 - 0.05, -LIFT, toH(S0.z1) - 0.05, S0.x1, -0.13, toH(S0.z1), TIM);
  const vy0 = EAVE - 0.05, vy1 = 2.02;
  for (const x of [D.x0 + 0.06, D.x1 - 0.06]) H.box(m.timber, x - 0.045, 0, dz1 - 0.12, x + 0.045, vy1, dz1 - 0.03, TIM);
  H.box(m.timber, D.x0, vy1 - 0.1, dz1 - 0.12, D.x1, vy1, dz1 - 0.03, TIM);
  { const len = Math.hypot(dz1 - RZ + 0.2, vy0 - vy1), a = Math.atan2(vy0 - vy1, dz1 - RZ + 0.2);
    H.add(new THREE.BoxGeometry(D.x1 - D.x0 + 0.3, 0.018, len + 0.2), m.tinOld, M((D.x0 + D.x1) / 2, (vy0 + vy1) / 2 + 0.05, (RZ + dz1) / 2 + 0.04, a, 0, 0), TINUV); }
  // Dad's chair on the deck
  { const C = M(0.38, 0, toH(-0.8), 0, -0.5, 0), add = (w, h, d, x, y, z) => H.add(new THREE.BoxGeometry(w, h, d), m.wood, C.clone().multiply(M(x, y, z)), { mode: 'world', scale: 1 });
    add(0.42, 0.035, 0.42, 0, 0.45, 0); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(0.035, 0.45, 0.035, dx * 0.18, 0.225, dz * 0.18);
    add(0.035, 0.5, 0.035, -0.18, 0.72, 0.18); add(0.035, 0.5, 0.035, 0.18, 0.72, 0.18); add(0.4, 0.07, 0.02, 0, 0.92, 0.19); add(0.4, 0.05, 0.02, 0, 0.7, 0.19); }
  // boot scraper by the step
  S.box(m.iron, -1.75, 0, 0.55, -1.6, 0.12, 0.57, IRONUV);
  // colliders: the house, the verandah posts
  Y.colliders.push(rectC(-RX - 0.1, -RZ - 0.1 + YARD.house.z, RX + 0.1, RZ + 0.08 + YARD.house.z));
  for (const x of [D.x0 + 0.06, D.x1 - 0.06]) Y.colliders.push(circC(x, D.z1 - 0.08, 0.08));
  Y.items.push(IT('ydoor', 'Door', 'Go inside', (DOOR.x0 + DOOR.x1) / 2, LIFT + 1.0, YARD.house.z + RZ + 0.08, 0.9, 2.0, 0.12, [(DOOR.x0 + DOOR.x1) / 2, LIFT + 1.5, YARD.house.z + RZ + 0.15]));
  Y.items.push(IT('chair', 'Dad’s chair', 'Look', 0.38, LIFT + 0.5, -0.8, 0.5, 0.95, 0.5));
  Y.colliders.push(circC(0.38, -0.8, 0.26));
  Y.hitTargets.push({ id: 'house', pos: new THREE.Vector3(-0.9, 1.4, -1.2), r: 0.1, wall: { x0: -3.05, x1: 3.05, z: -1.2 } });
}

// ---------- woodpile of Ironbark, Truth-Rot on the end of a log, the blowtorch ----------
function yardWoodpile(Y) {
  const { mats: m, S } = Y, { x: wx, z: wz } = YARD.woodpile;
  for (const dz of [-0.55, 0.55]) S.box(m.iron, wx - 0.4, 0, wz + dz - 0.03, wx + 0.4, 0.06, wz + dz + 0.03, { mode: 'world', scale: 0.5 });
  let k = 0;
  for (let row = 0; row < 5; row++) for (let i = 0; i < 6 - row; i++) {
    const r = rand(0.055, 0.075), x = wx - 0.32 + i * 0.13 + row * 0.065 + rand(-0.01, 0.01), y = 0.06 + r + row * 0.115;
    S.cyl(m.log, r, r * rand(0.9, 1.05), rand(1.05, 1.3), x, y, wz + rand(-0.06, 0.06), Math.PI / 2, 0, rand(-0.04, 0.04), 9, 0.6);
    k++;
  }
  // the blowtorch on top
  S.cyl(m.brass, 0.035, 0.035, 0.2, wx + 0.1, 0.72, wz + 0.2, 0, 0, Math.PI / 2 - 0.2, 12, 0.3);
  S.cyl(m.steel, 0.012, 0.016, 0.16, wx - 0.05, 0.75, wz + 0.2, 0, 0, Math.PI / 2 - 0.2, 8, 0.3);
  // Truth-Rot on the end of one log
  const fungus = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2), m.fungus);
    cap.scale.set(rand(0.03, 0.05), rand(0.012, 0.02), rand(0.03, 0.05)); cap.rotation.z = Math.PI / 2;
    cap.position.set(0, rand(-0.08, 0.06), rand(-0.07, 0.07)); fungus.add(cap);
  }
  fungus.position.set(wx - 0.02, 0.34, wz + 0.64); fungus.rotation.y = Math.PI / 2;
  Y.scene.add(fungus);
  Y.colliders.push(rectC(wx - 0.45, wz - 0.72, wx + 0.45, wz + 0.72));
  Y.items.push(IT('woodpile', 'Ironbark woodpile', 'Look', wx, 0.35, wz + 0.1, 0.8, 0.7, 1.1));
  Y.items.push(IT('truthrot', 'Truth-Rot', 'Talk to it', wx - 0.02, 0.34, wz + 0.68, 0.32, 0.32, 0.22));
  Y.truthRot = m.fungus;
}

// ---------- water: the tank on its stand, a tap with the bucket under it, the solar still ----------
function yardWater(Y) {
  const { mats: m, S } = Y, T0 = YARD.tank, IRONUV = { mode: 'world', scale: 0.5 };
  const st = T0.stand;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.box(m.timber, T0.x + dx * 0.8 - 0.07, 0, T0.z + dz * 0.8 - 0.07, T0.x + dx * 0.8 + 0.07, st, T0.z + dz * 0.8 + 0.07, { mode: 'world', scale: 1.2 });
  for (const dz of [-0.8, 0, 0.8]) S.box(m.timber, T0.x - 0.95, st - 0.12, T0.z + dz - 0.06, T0.x + 0.95, st, T0.z + dz + 0.06, { mode: 'world', scale: 1.2 });
  for (const s of [-1, 1]) S.beam(m.timber, T0.x - 0.8, 0.1, T0.z + s * 0.8, T0.x + 0.8, st - 0.15, T0.z + s * 0.8, 0.06, 0.06, { mode: 'world', scale: 1.2 });
  // corrugated body: a cylinder with the tin texture wrapped round it
  const body = new THREE.CylinderGeometry(T0.r, T0.r, T0.h, 40, 1, true);
  S.add(body, m.tin, M(T0.x, st + T0.h / 2, T0.z, 0, 0, 0), { mode: 'scale', su: 6, sv: 1.8 });
  S.add(new THREE.ConeGeometry(T0.r + 0.03, 0.28, 40, 1, true), m.tin, M(T0.x, st + T0.h + 0.14, T0.z), { mode: 'scale', su: 6, sv: 0.4 });
  for (const y of [0.25, 0.95, 1.65]) S.add(new THREE.TorusGeometry(T0.r + 0.006, 0.012, 4, 40), m.galv, M(T0.x, st + y, T0.z, Math.PI / 2, 0, 0), IRONUV);
  S.cyl(m.galv, 0.18, 0.18, 0.04, T0.x + 0.25, st + T0.h + 0.24, T0.z, 0, 0, 0.32, 14, 0.4);
  // the tap: a pipe out the bottom, the bucket under it
  const tx = T0.x - 0.62, tz = T0.z + 0.62;
  S.rod(m.galv, T0.x - 0.6, st + 0.12, T0.z + 0.6, tx, st + 0.12, tz, 0.02);
  S.rod(m.galv, tx, st + 0.12, tz, tx, 0.62, tz, 0.02);
  S.cyl(m.brass, 0.025, 0.025, 0.08, tx, 0.6, tz, 0, 0, 0, 10, 0.3);
  S.box(m.brass, tx - 0.04, 0.66, tz - 0.008, tx + 0.04, 0.675, tz + 0.008, IRONUV);
  Y.tap = new THREE.Vector3(tx, 0.55, tz);
  // the bucket that lives under the tap (a separate mesh: Jacob carries it off)
  const bucket = new THREE.Group();
  const shell = new THREE.Mesh(lathe([[0.1, 0], [0.135, 0.28], [0.14, 0.29]], 20), m.galvDS); shell.castShadow = true;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), m.galvDS); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.005;
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.004, 4, 16, Math.PI), m.steel); bail.position.y = 0.29; bail.rotation.y = 0.4;
  bucket.add(shell, bottom, bail); bucket.position.set(tx, 0, tz);
  Y.scene.add(bucket); Y.bucket = bucket;
  Y.colliders.push(rectC(T0.x - 1.0, T0.z - 1.0, T0.x + 1.0, T0.z + 1.0));
  Y.items.push(IT('tank', 'Water tank', 'Look', T0.x, st + 0.9, T0.z, 1.9, 2.0, 1.9));
  Y.items.push(IT('tap', 'Tank tap', () => Y.verb('tap'), tx, 0.65, tz, 0.2, 0.2, 0.2));
  Y.items.push(IT('bucket', 'Bucket', 'Take the bucket', tx, 0.15, tz, 0.32, 0.32, 0.32, null, { enabled: () => Y.state.bucketHome }));
  // solar still: a shallow pit, clear sheet, rocks round the edge, a jar in the middle
  const { x: sx, z: sz } = YARD.still;
  S.add(new THREE.CylinderGeometry(0.55, 0.58, 0.04, 20), m.ash, M(sx, 0.005, sz), IRONUV);
  const sheet = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.12, 20, 1, true), m.clearGlass); sheet.rotation.x = Math.PI; sheet.position.set(sx, 0.06, sz); Y.scene.add(sheet);
  for (let i = 0; i < 11; i++) { const a = i / 11 * TAU; S.add(lumpify(new THREE.IcosahedronGeometry(0.07, 0), 0.02, 9, i), m.stone, M(sx + Math.cos(a) * 0.6, 0.04, sz + Math.sin(a) * 0.6, rand(0, 3), rand(0, 3), 0), { mode: 'world', scale: 0.6 }); }
  S.cyl(m.clearGlass, 0.045, 0.045, 0.09, sx, 0.045, sz, 0, 0, 0, 12, 0.3);
  Y.items.push(IT('still', 'Solar still', 'Look', sx, 0.15, sz, 1.2, 0.3, 1.2));
  Y.colliders.push(circC(sx, sz, 0.55));
}

// ---------- the pen: timber and pipe, a shrieking iron gate, the shelter, troughs, the dung bin ----------
function yardPen(Y) {
  const { mats: m, S } = Y, P = YARD.pen, TIM = { mode: 'world', scale: 1.2 }, IRONUV = { mode: 'world', scale: 0.5 };
  const post = (x, z, h = 1.45) => S.box(m.timber, x - 0.07, 0, z - 0.07, x + 0.07, h, z + 0.07, TIM);
  const rails = (ax, az, bx, bz) => {
    for (const [y, kind] of [[0.45, 'pipe'], [0.85, 'wood'], [1.25, 'pipe']]) {
      if (kind === 'pipe') S.rod(m.rust, ax, y, az, bx, y, bz, 0.025, 8, 0.4);
      else S.beam(m.timber, ax, y, az, bx, y, bz, 0.05, 0.12, TIM);
    }
  };
  const side = (ax, az, bx, bz, gap) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 2.2);
    const pts = []; for (let i = 0; i <= n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
    for (const [x, z] of pts) post(x, z);
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      if (gap && z0 < gap[1] && z1 > gap[0]) { // the gate opening
        if (z0 < gap[0]) { rails(x0, z0, x0, gap[0]); Y.colliders.push(segC(x0, z0, x0, gap[0], 0.08)); }
        if (z1 > gap[1]) { rails(x0, gap[1], x1, z1); Y.colliders.push(segC(x0, gap[1], x1, z1, 0.08)); }
        continue;
      }
      rails(x0, z0, x1, z1);
      Y.colliders.push(segC(x0, z0, x1, z1, 0.08));
    }
  };
  side(P.x0, P.z0, P.x1, P.z0); side(P.x1, P.z0, P.x1, P.z1); side(P.x1, P.z1, P.x0, P.z1);
  side(P.x0, P.z0, P.x0, P.gate.z0, null); side(P.x0, P.gate.z1, P.x0, P.z1, null);
  post(P.x0, P.gate.z0, 1.6); post(P.x0, P.gate.z1, 1.6);
  // the heavy iron gate, hinged on its north post
  const gate = new THREE.Group(), GW = P.gate.z1 - P.gate.z0 - 0.08;
  const GB = new Batch();
  for (const y of [0.25, 0.75, 1.25]) GB.rod(m.iron, 0, y, 0, 0, y, GW, 0.03, 8, 0.4);
  for (const zz of [0.02, GW - 0.02]) GB.rod(m.iron, 0, 0.2, zz, 0, 1.3, zz, 0.03, 8, 0.4);
  GB.rod(m.iron, 0, 0.25, 0.05, 0, 1.25, GW - 0.05, 0.022, 6, 0.4);
  for (let zz = 0.25; zz < GW - 0.1; zz += 0.25) GB.rod(m.rust, 0, 0.25, zz, 0, 1.25, zz, 0.008, 4, 0.4);
  GB.build(gate);
  gate.position.set(P.x0, 0, P.gate.z0 + 0.04);
  Y.scene.add(gate);
  const gateC = segC(P.x0, P.gate.z0, P.x0, P.gate.z1, 0.09); Y.colliders.push(gateC);
  Y.gate = { group: gate, open: false, angle: 0, collider: gateC, len: GW };
  Y.items.push(IT('gate', 'Pen gate', () => Y.state && Y.state.gateOpen ? 'Shut the gate' : 'Open the gate', P.x0, 0.8, (P.gate.z0 + P.gate.z1) / 2, 0.3, 1.4, GW, null, { dyn: true }));
  // the shelter: posts and a skillion of corrugated iron, north end
  const sh = YARD.shelter;
  for (const x of [sh.x0, (sh.x0 + sh.x1) / 2, sh.x1 - 0.05]) { post(x, sh.z0 + 0.05, sh.hi); post(x, sh.z1, sh.lo); Y.colliders.push(circC(x, sh.z1, 0.1)); }
  S.beam(m.timber, sh.x0, sh.lo - 0.08, sh.z1, sh.x1, sh.lo - 0.08, sh.z1, 0.08, 0.14, TIM);
  { const a = Math.atan2(sh.hi - sh.lo, sh.z1 - sh.z0), len = Math.hypot(sh.hi - sh.lo, sh.z1 - sh.z0);
    S.add(new THREE.BoxGeometry(sh.x1 - sh.x0 + 0.4, 0.018, len + 0.4), m.tinOld, M((sh.x0 + sh.x1) / 2, (sh.hi + sh.lo) / 2 + 0.02, (sh.z0 + sh.z1) / 2, a, 0, 0), { mode: 'world', scale: 1 }); }
  // back wall of the shelter: old tin sheets nailed to the north rail
  S.box(m.tinOld, sh.x0, 0.2, sh.z0 - 0.02, sh.x1, 1.5, sh.z0, { mode: 'world', scale: 1 });
  // troughs: a half drum for feed, an old bathtub for water
  const FT = YARD.feedTrough, fl = FT.z1 - FT.z0;
  S.add(new THREE.CylinderGeometry(0.3, 0.3, fl, 18, 1, true, -Math.PI / 2, Math.PI), m.rustDS, M(FT.x, 0.42, (FT.z0 + FT.z1) / 2, Math.PI / 2, 0, 0), IRONUV);
  for (const z of [FT.z0 + 0.1, FT.z1 - 0.1]) S.box(m.timber, FT.x - 0.3, 0, z - 0.04, FT.x + 0.3, 0.2, z + 0.04, TIM);
  for (const z of [FT.z0, FT.z1]) S.add(new THREE.CircleGeometry(0.3, 18, 0, Math.PI), m.rustDS, M(FT.x, 0.42, z, 0, z === FT.z0 ? Math.PI : 0, Math.PI), IRONUV);
  const feedFill = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, fl - 0.06), m.feed);
  feedFill.position.set(FT.x, 0.24, (FT.z0 + FT.z1) / 2); feedFill.visible = false; Y.scene.add(feedFill);
  const WT0 = YARD.waterTrough, wl = WT0.z1 - WT0.z0;
  { const tub = lathe([[0.0, 0], [0.28, 0.0], [0.36, 0.42], [0.38, 0.46]], 24); tub.scale(1, 1, wl / 0.76); S.add(tub, m.enamel, M(WT0.x, 0.12, (WT0.z0 + WT0.z1) / 2), { mode: 'scale', su: 1, sv: 1 }); }
  for (const z of [WT0.z0 + 0.2, WT0.z1 - 0.2]) for (const dx of [-0.18, 0.18]) S.box(m.brick, WT0.x + dx - 0.05, 0, z - 0.1, WT0.x + dx + 0.05, 0.13, z + 0.1, IRONUV);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.31, 22), m.water);
  water.rotation.x = -Math.PI / 2; water.scale.set(1, wl / 0.76, 1); water.position.set(WT0.x, 0.3, (WT0.z0 + WT0.z1) / 2); Y.scene.add(water);
  Y.troughWater = water; Y.feedFill = feedFill;
  Y.colliders.push(rectC(FT.x - 0.32, FT.z0, FT.x + 0.32, FT.z1), rectC(WT0.x - 0.38, WT0.z0, WT0.x + 0.38, WT0.z1));
  Y.items.push(IT('feedtrough', 'Feed trough', () => Y.verb('feedtrough'), FT.x, 0.4, (FT.z0 + FT.z1) / 2, 0.7, 0.5, fl + 0.1));
  Y.items.push(IT('watertrough', 'Old bathtub', () => Y.verb('watertrough'), WT0.x, 0.4, (WT0.z0 + WT0.z1) / 2, 0.8, 0.6, wl + 0.1));
  // the feed pile outside the fence: dried scrub, red shale, scrap shards
  const FP = YARD.feedPile;
  for (let i = 0; i < 26; i++) { const a = rand(0, TAU), d = Math.sqrt(R()) * 0.6; S.add(lumpify(new THREE.IcosahedronGeometry(rand(0.08, 0.16), 0), 0.03, 7, i), R() < 0.3 ? m.rust : m.feed, M(FP.x + Math.cos(a) * d, rand(0.02, 0.18) * (1 - d), FP.z + Math.sin(a) * d, rand(0, 3), rand(0, 3), rand(0, 3)), { mode: 'world', scale: 0.6 }); }
  S.add(lumpify(new THREE.SphereGeometry(0.62, 12, 6, 0, TAU, 0, Math.PI / 2), 0.06, 5, 3), m.feed, M(FP.x, 0, FP.z, 0, 0, 0, 1, 0.55, 1), { mode: 'world', scale: 0.8 });
  for (let i = 0; i < 9; i++) S.box(m.steel, FP.x + rand(-0.5, 0.5), rand(0.1, 0.3), FP.z + rand(-0.5, 0.5), FP.x + rand(-0.5, 0.5) + 0.12, rand(0.1, 0.3) + 0.01, FP.z + rand(-0.5, 0.5) + 0.03, IRONUV);
  Y.colliders.push(circC(FP.x, FP.z, 0.72));
  Y.items.push(IT('feedpile', 'Feed pile', () => Y.verb('feedpile'), FP.x, 0.25, FP.z, 1.2, 0.5, 1.2));
  // the rolling metal bin at the back of the pen, the shovel leaning on it
  const B = YARD.bin, bin = new THREE.Group();
  {
    const BB = new Batch();
    BB.box(m.galv, -0.42, 0.18, -0.32, 0.42, 1.0, 0.32, IRONUV);
    for (const s of [-1, 1]) { BB.add(new THREE.TorusGeometry(0.16, 0.05, 8, 16), m.rubber, M(-0.32, 0.16, s * 0.36, 0, 0, 0), IRONUV); BB.cyl(m.steel, 0.03, 0.03, 0.06, -0.32, 0.16, s * 0.34, Math.PI / 2, 0, 0, 8); }
    BB.rod(m.steel, 0.42, 1.0, -0.3, 0.6, 1.08, -0.3, 0.018); BB.rod(m.steel, 0.42, 1.0, 0.3, 0.6, 1.08, 0.3, 0.018); BB.rod(m.steel, 0.6, 1.08, -0.3, 0.6, 1.08, 0.3, 0.02);
    BB.box(m.galv, 0.32, 0, -0.06, 0.4, 0.2, 0.06, IRONUV);
    BB.build(bin);
    const load = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.6), m.dung); load.position.y = 0.22; bin.add(load); bin.userData.load = load;
  }
  bin.position.set(B.x, 0, B.z); bin.rotation.y = 0.3; Y.scene.add(bin); Y.bin = bin;
  Y.colliders.push(circC(B.x, B.z, 0.5));
  Y.items.push(IT('bin', 'Dung bin', 'Look', B.x, 0.6, B.z, 0.9, 1.1, 0.8));
  // the shovel, leaning
  const shovel = new THREE.Group();
  {
    const SB = new Batch();
    SB.cyl(m.wood, 0.017, 0.017, 1.0, 0, 0.5, 0, 0, 0, 0, 8, 0.5);
    SB.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), m.wood, M(0, 1.02, 0, 0, 0, 0), { mode: 'world', scale: 0.5 });
    const blade = new THREE.CylinderGeometry(0.17, 0.17, 0.3, 12, 1, true, -0.6, 1.2); SB.add(blade, m.steelDS, M(0, -0.12, 0.08, 0, 0, 0, 1, 1, 0.7), { mode: 'world', scale: 0.5 });
    SB.build(shovel);
  }
  shovel.position.set(B.x - 0.48, 0.28, B.z - 0.2); shovel.rotation.set(0.0, 0.4, 0.28); Y.scene.add(shovel); Y.shovel = shovel;
  Y.items.push(IT('shovel', 'Shovel', 'Take the shovel', B.x - 0.52, 0.6, B.z - 0.2, 0.3, 1.2, 0.3, null, { enabled: () => !Y.owns('shovel') }));
  // milking stool and the pail, under the shelter
  const stool = new Batch();
  stool.cyl(m.wood, 0.17, 0.17, 0.04, 9.4, 0.3, -1.6, 0, 0, 0, 14, 0.5);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; stool.beam(m.wood, 9.4 + Math.cos(a) * 0.08, 0.29, -1.6 + Math.sin(a) * 0.08, 9.4 + Math.cos(a) * 0.15, 0, -1.6 + Math.sin(a) * 0.15, 0.03); }
  stool.build(Y.scene); Y.colliders.push(circC(9.4, -1.6, 0.17));
  const pail = new THREE.Group();
  { const sh2 = new THREE.Mesh(lathe([[0.09, 0], [0.12, 0.25], [0.125, 0.26]], 18), m.galvDS); sh2.castShadow = true;
    const bt = new THREE.Mesh(new THREE.CircleGeometry(0.09, 18), m.galvDS); bt.rotation.x = -Math.PI / 2; bt.position.y = 0.005;
    const bl = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.004, 4, 16, Math.PI), m.steel); bl.position.y = 0.26; pail.add(sh2, bt, bl); }
  pail.position.set(9.85, 0, -1.4); Y.scene.add(pail); Y.pail = pail;
  Y.items.push(IT('pail', 'Milk pail', 'Take the pail', 9.85, 0.15, -1.4, 0.3, 0.32, 0.3, null, { enabled: () => Y.state.pailHome }));
  // salt lick, a shard of spinifex bale
  S.box(m.concrete, 11.6, 0, 3.5, 11.9, 0.22, 3.8, IRONUV); Y.colliders.push(rectC(11.6, 3.5, 11.9, 3.8));
}

// ---------- the coop of Ironbark, its wire run ----------
function yardCoop(Y) {
  const { mats: m, S } = Y, C = YARD.coop, RN = YARD.run, IRONUV = { mode: 'world', scale: 0.5 };
  const x0 = C.x - C.w / 2, x1 = C.x + C.w / 2, z0 = C.z - C.d / 2, z1 = C.z + C.d / 2;
  for (let row = 0; row < 7; row++) {
    const y = 0.08 + row * 0.13;
    for (const z of [z0, z1]) S.cyl(m.log, 0.07, 0.07, C.w + 0.16, C.x, y, z, 0, 0, Math.PI / 2, 9, 0.6);
    for (const x of [x0, x1]) S.cyl(m.log, 0.07, 0.07, C.d + 0.16, x, y + 0.065, C.z, Math.PI / 2, 0, 0, 9, 0.6);
  }
  S.add(new THREE.BoxGeometry(C.w + 0.4, 0.02, C.d + 0.5), m.tinOld, M(C.x, 1.06, C.z, 0.16, 0, 0), { mode: 'world', scale: 1 });
  S.box(m.char, C.x - 0.16, 0.0, z1 + 0.06, C.x + 0.16, 0.28, z1 + 0.075, IRONUV);   // the little door hole is dark
  S.beam(m.wood, C.x, 0.02, z1 + 0.6, C.x, 0.28, z1 + 0.08, 0.2, 0.02);            // ramp
  // the run: pickets and chicken wire
  const pk = (x, z) => S.box(m.iron, x - 0.02, 0, z - 0.02, x + 0.02, 1.0, z + 0.02, IRONUV);
  const corners = [[RN.x0, RN.z0], [RN.x1, RN.z0], [RN.x1, RN.z1], [RN.x0, RN.z1]];
  for (const [x, z] of corners) pk(x, z);
  pk((RN.x0 + RN.x1) / 2, RN.z1); pk(RN.x0, (RN.z0 + RN.z1) / 2); pk(RN.x1, (RN.z0 + RN.z1) / 2);
  const wireWall = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), g = new THREE.PlaneGeometry(len, 0.95);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.35, uv.getY(i) * 0.95 / 0.35);
    const mesh = new THREE.Mesh(g, m.mesh); mesh.position.set((ax + bx) / 2, 0.5, (az + bz) / 2); mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
    mesh.castShadow = true; Y.scene.add(mesh);
    Y.colliders.push(segC(ax, az, bx, bz, 0.06));
  };
  wireWall(RN.x0, RN.z1, RN.x1, RN.z1); wireWall(RN.x0, RN.z0, RN.x0, RN.z1); wireWall(RN.x1, RN.z0, RN.x1, RN.z1);
  wireWall(RN.x0, RN.z0, x0 - 0.1, RN.z0); wireWall(x1 + 0.1, RN.z0, RN.x1, RN.z0);
  Y.colliders.push(rectC(x0 - 0.22, z0 - 0.27, x1 + 0.22, z1 + 0.1));     // the tin roof overhangs at chest height
  Y.items.push(IT('coop', 'Ironbark coop', 'Look', C.x, 0.55, C.z, C.w + 0.2, 1.1, C.d + 0.2));
}

// ---------- tool shed: a lean-to with the bench, the crowbar on its hooks, the blowtorch ----------
function yardShed(Y) {
  const { mats: m, S } = Y, SH = YARD.shed, TIM = { mode: 'world', scale: 1.2 }, IRONUV = { mode: 'world', scale: 0.5 };
  for (const x of [SH.x0, SH.x1]) { S.box(m.timber, x - 0.06, 0, SH.z0, x + 0.06, 2.2, SH.z0 + 0.12, TIM); S.box(m.timber, x - 0.06, 0, SH.z1 - 0.12, x + 0.06, 1.9, SH.z1, TIM); Y.colliders.push(circC(x, SH.z1 - 0.06, 0.1)); }
  S.box(m.tinOld, SH.x0, 0.0, SH.z0 - 0.02, SH.x1, 2.15, SH.z0, { mode: 'world', scale: 1 });
  S.box(m.tinOld, SH.x0 - 0.02, 0.0, SH.z0, SH.x0, 2.0, SH.z1 - 0.3, { mode: 'world', scale: 1 });
  { const a = Math.atan2(2.2 - 1.9, SH.z1 - SH.z0), len = Math.hypot(0.3, SH.z1 - SH.z0); S.add(new THREE.BoxGeometry(SH.x1 - SH.x0 + 0.4, 0.018, len + 0.4), m.tinOld, M((SH.x0 + SH.x1) / 2, 2.08, (SH.z0 + SH.z1) / 2, a, 0, 0), { mode: 'world', scale: 1 }); }
  // workbench
  const bz = SH.z0 + 0.38;
  S.box(m.wood, SH.x0 + 0.2, 0.86, SH.z0 + 0.1, SH.x1 - 0.5, 0.92, bz + 0.25, { mode: 'world', scale: 1 });
  for (const x of [SH.x0 + 0.26, SH.x1 - 0.56]) for (const z of [SH.z0 + 0.16, bz + 0.18]) S.box(m.wood, x - 0.03, 0, z - 0.03, x + 0.03, 0.86, z + 0.03, { mode: 'world', scale: 1 });
  S.box(m.iron, SH.x0 + 0.5, 0.92, bz + 0.1, SH.x0 + 0.66, 1.04, bz + 0.24, IRONUV);    // vice
  S.box(m.wood, SH.x0 + 0.2, 1.35, SH.z0 + 0.02, SH.x1 - 0.5, 1.38, SH.z0 + 0.24, { mode: 'world', scale: 1 }); // shelf
  for (let i = 0; i < 5; i++) S.cyl(m.rust, 0.06, 0.06, 0.16, SH.x0 + 0.45 + i * 0.25, 1.46, SH.z0 + 0.12, 0, 0, 0, 12, 0.4);
  // jerry cans
  for (const [x, ry] of [[SH.x1 - 0.32, 0.1], [SH.x1 - 0.32, -0.15]]) S.add(new THREE.BoxGeometry(0.18, 0.46, 0.34), m.tractor, M(x, 0.23, SH.z0 + 0.3 + (ry > 0 ? 0 : 0.4), 0, ry, 0), { mode: 'world', scale: 0.6 });
  // the crowbar on two hooks (its own mesh)
  const crow = new THREE.Group();
  { const CB = new Batch(); CB.rod(m.tractor, -0.42, 0, 0, 0.38, 0, 0, 0.012, 6, 0.5);
    CB.add(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI * 0.9), m.tractor, M(0.38, 0.05, 0, 0, 0, -Math.PI / 2), IRONUV); CB.build(crow); }
  crow.position.set((SH.x0 + SH.x1) / 2 + 0.1, 1.7, SH.z0 + 0.05); Y.scene.add(crow); Y.crowbar = crow;
  for (const dx of [-0.25, 0.25]) S.box(m.steel, crow.position.x + dx - 0.01, 1.68, SH.z0, crow.position.x + dx + 0.01, 1.72, SH.z0 + 0.06, IRONUV);
  // blowtorch on the bench
  S.cyl(m.brass, 0.04, 0.04, 0.22, SH.x0 + 1.2, 1.03, bz + 0.05, 0, 0, 0, 12, 0.3);
  S.cyl(m.steel, 0.01, 0.014, 0.16, SH.x0 + 1.3, 1.12, bz + 0.05, 0, 0, -1.1, 8, 0.3);
  Y.colliders.push(rectC(SH.x0 + 0.15, SH.z0 - 0.05, SH.x1 - 0.45, bz + 0.3), rectC(SH.x0 - 0.05, SH.z0 - 0.1, SH.x1 + 0.05, SH.z0 + 0.05),
    rectC(SH.x1 - 0.46, SH.z0 + 0.08, SH.x1 - 0.16, SH.z0 + 0.92),             // jerry cans
    segC(SH.x0 - 0.01, SH.z0, SH.x0 - 0.01, SH.z1 - 0.3, 0.04));               // the west wall
  Y.items.push(IT('crowbar', 'Crowbar', 'Take the crowbar', crow.position.x, 1.7, crow.position.z + 0.05, 0.9, 0.2, 0.2, null, { enabled: () => !Y.owns('crowbar') }));
  Y.items.push(IT('bench', 'Workbench', 'Look', SH.x0 + 0.8, 0.95, bz, 1.2, 0.2, 0.5));
  Y.items.push(IT('blowtorch', 'Blowtorch', 'Look', SH.x0 + 1.22, 1.05, bz + 0.05, 0.25, 0.3, 0.2));
}

// ---------- the tractor: rusted, no windshield, cargo bin on the back ----------
function yardTractor(Y) {
  const { mats: m, S } = Y, TR = YARD.tractor, g = new THREE.Group(), B = new Batch(), IRONUV = { mode: 'world', scale: 0.5 }, PAINT = { mode: 'world', scale: 1.6 };
  // the tractor faces north (-z); local frame: x across, z along (front at -z)
  const wheel = (x, y, z, r, w) => {
    B.add(new THREE.TorusGeometry(r - w * 0.35, w * 0.42, 10, 28), m.tyre, M(x, y, z, 0, Math.PI / 2, 0), { mode: 'scale', su: 1, sv: 1 });
    B.cyl(m.tractor, r * 0.62, r * 0.62, w * 0.6, x, y, z, 0, 0, Math.PI / 2, 18, 0.6);
    B.cyl(m.rust, r * 0.18, r * 0.18, w * 0.75, x, y, z, 0, 0, Math.PI / 2, 10, 0.4);
  };
  wheel(-0.78, 0.68, 0.75, 0.68, 0.38); wheel(0.78, 0.68, 0.75, 0.68, 0.38);
  wheel(-0.62, 0.36, -1.15, 0.36, 0.2); wheel(0.62, 0.36, -1.15, 0.36, 0.2);
  B.box(m.tractor, -0.3, 0.55, -1.55, 0.3, 1.18, 0.15, PAINT);                       // engine and body
  B.add(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 14, 1, true, Math.PI / 2, Math.PI), m.tractorDS, M(0, 1.18, -0.7, Math.PI / 2, 0, 0), PAINT);
  B.add(new THREE.CircleGeometry(0.3, 14, 0, Math.PI), m.tractor, M(0, 1.18, -1.55, 0, Math.PI, 0), PAINT);
  B.box(m.iron, -0.28, 0.6, -1.62, 0.28, 1.25, -1.55, IRONUV);                        // grille
  for (let i = 0; i < 7; i++) B.box(m.rust, -0.26, 0.64 + i * 0.085, -1.64, 0.26, 0.66 + i * 0.085, -1.6, IRONUV);
  B.box(m.rust, -0.12, 0.25, -1.3, 0.12, 0.55, -0.9, IRONUV);                         // front axle
  B.box(m.iron, -0.65, 0.65, -1.15, 0.65, 0.75, -1.1, IRONUV);
  B.rod(m.iron, -0.12, 1.45, -1.0, -0.12, 2.1, -1.0, 0.04, 10);                       // exhaust stack
  B.cyl(m.rust, 0.05, 0.04, 0.06, -0.12, 2.12, -1.0, 0, 0, 0.6, 8);
  B.box(m.tractor, -0.45, 0.9, 0.1, 0.45, 1.05, 0.95, PAINT);                          // rear housing
  for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.78, 0.78, 0.45, 18, 1, true, Math.PI / 6, Math.PI * 2 / 3), m.tractorDS, M(s * 0.78, 0.68, 0.75, 0, 0, Math.PI / 2), PAINT); // fenders
  B.cyl(m.iron, 0.03, 0.03, 0.6, 0, 1.25, 0.6, 0, 0, 0, 8);                           // seat post
  B.box(m.iron, -0.22, 1.5, 0.45, 0.22, 1.56, 0.85, IRONUV);                           // pan seat
  B.box(m.iron, -0.22, 1.55, 0.82, 0.22, 1.9, 0.86, IRONUV);
  B.rod(m.iron, 0, 1.2, -0.2, 0, 1.7, 0.15, 0.022);                                   // steering column
  B.add(new THREE.TorusGeometry(0.19, 0.016, 6, 20), m.rubber, M(0, 1.72, 0.16, 1.1, 0, 0), IRONUV);
  // the cab frame where the windshield used to be
  for (const [x, z] of [[-0.7, -0.15], [0.7, -0.15], [-0.7, 1.05], [0.7, 1.05]]) B.rod(m.iron, x, 1.0, z, x, 2.45, z, 0.03, 8);
  B.box(m.tinOld, -0.85, 2.45, -0.3, 0.85, 2.48, 1.2, { mode: 'world', scale: 1 });
  B.rod(m.iron, -0.7, 1.95, -0.15, 0.7, 1.95, -0.15, 0.025, 6); B.rod(m.iron, -0.7, 1.3, -0.15, 0.7, 1.3, -0.15, 0.02, 6);
  B.add(new THREE.PlaneGeometry(0.18, 0.12), m.glassDirty, M(0.6, 1.88, -0.15), IRONUV);   // a last shard in the corner
  // cargo bin on the back
  B.box(m.rust, -0.85, 0.75, 1.25, 0.85, 0.8, 2.25, IRONUV);
  for (const [x0, z0, x1, z1] of [[-0.85, 1.25, 0.85, 1.29], [-0.85, 2.21, 0.85, 2.25], [-0.85, 1.25, -0.81, 2.25], [0.81, 1.25, 0.85, 2.25]]) B.box(m.rust, x0, 0.8, z0, x1, 1.25, z1, IRONUV);
  B.rod(m.iron, 0, 0.75, 1.3, 0, 0.9, 0.9, 0.05, 8);
  B.build(g);
  // cargo that appears as the morning goes: the milk canister, the strapped bin
  const can = new THREE.Mesh(lathe([[0.0, 0], [0.16, 0], [0.17, 0.4], [0.1, 0.5], [0.1, 0.56], [0.0, 0.56]], 18), m.galv); can.position.set(-0.45, 0.8, 1.75); can.visible = false; can.castShadow = true; g.add(can);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 4, 24), m.vine); strap.rotation.x = Math.PI / 2; strap.position.set(0.25, 1.15, 1.75); strap.scale.set(0.9, 0.8, 1); strap.visible = false; g.add(strap);
  g.position.set(TR.x, 0, TR.z); Y.scene.add(g);
  Y.tractor = { group: g, can, strap, engineAt: new THREE.Vector3(TR.x, 1.1, TR.z - 0.9), wires: new THREE.Vector3(TR.x + 0.3, 0.9, TR.z - 0.5) };
  Y.colliders.push(rectC(TR.x - 1.2, TR.z - 1.65, TR.x + 1.2, TR.z + 2.3));
  Y.items.push(IT('tractor', 'Tractor', () => Y.verb('tractor'), TR.x, 1.2, TR.z, 1.8, 2.4, 3.6, [TR.x, 2.7, TR.z]));
  Y.hitTargets.push({ id: 'tractor', pos: new THREE.Vector3(TR.x, 0.9, TR.z), r: 1.3, metal: true });
}

// ---------- the ute: on blocks, bonnet up, gutted by Jaw-Jaws ----------
function yardUte(Y) {
  const { mats: m, S } = Y, U = YARD.ute, g = new THREE.Group(), B = new Batch(), IRONUV = { mode: 'world', scale: 0.5 }, PAINT = { mode: 'world', scale: 1.6 };
  // local frame: front at -z
  B.box(m.ute, -0.85, 0.55, -2.3, 0.85, 0.95, -0.4, PAINT);                         // front body and guards
  B.box(m.ute, -0.85, 0.55, -0.4, 0.85, 1.55, 0.6, PAINT);                          // cab
  B.box(m.ute, -0.88, 0.5, 0.6, 0.88, 0.9, 2.3, PAINT);                             // tray
  B.box(m.rust, -0.8, 0.9, 0.62, 0.8, 0.92, 2.28, IRONUV);
  for (const s of [-1, 1]) B.box(m.ute, s * 0.86 - 0.02, 0.9, 0.62, s * 0.86 + 0.02, 1.2, 2.28, PAINT);
  B.box(m.ute, -0.86, 0.9, 2.26, 0.86, 1.2, 2.3, PAINT);
  B.box(m.chrome, -0.9, 0.45, -2.38, 0.9, 0.55, -2.28, IRONUV);                      // front bumper
  B.box(m.dark || m.char, -0.75, 0.62, -2.31, 0.75, 0.88, -2.29, IRONUV);           // grille hole
  B.add(new THREE.PlaneGeometry(1.5, 0.62), m.glassDirty, M(0, 1.28, -0.42, -0.25, 0, 0), IRONUV);  // cracked windscreen
  B.box(m.char, -0.8, 0.95, -2.2, 0.8, 0.97, -0.5, IRONUV);                         // engine bay floor (dark)
  B.box(m.iron, -0.35, 0.7, -1.9, 0.35, 1.15, -1.0, IRONUV);                          // engine block
  B.cyl(m.rust, 0.1, 0.1, 0.5, 0.0, 1.2, -1.45, 0, 0, Math.PI / 2, 10);
  for (let i = 0; i < 9; i++) B.rod(m.copper, rand(-0.5, 0.5), 1.0 + rand(0, 0.15), rand(-2.0, -0.6), rand(-0.5, 0.5), 0.95 + rand(0, 0.2), rand(-2.0, -0.6), 0.008, 4);
  // the bonnet, propped up
  B.add(new THREE.BoxGeometry(1.6, 0.03, 1.4), m.ute, M(0, 1.6, -0.75, 1.14, 0, 0), PAINT);
  B.rod(m.iron, 0.6, 0.95, -2.0, 0.6, 2.1, -1.02, 0.012);
  // bench seat and wheel inside the cab
  B.box(m.hessian, -0.75, 0.75, 0.05, 0.75, 0.85, 0.5, { mode: 'world', scale: 0.4 }); B.box(m.hessian, -0.75, 0.85, 0.45, 0.75, 1.3, 0.55, { mode: 'world', scale: 0.4 });
  B.add(new THREE.TorusGeometry(0.18, 0.014, 6, 20), m.rubber, M(-0.4, 1.15, -0.25, 0.6, 0, 0), IRONUV);
  // wheels: rear ones flat on their rims, fronts gone, on blocks
  for (const s of [-1, 1]) {
    B.add(new THREE.TorusGeometry(0.28, 0.1, 8, 20), m.rubber, M(s * 0.8, 0.26, 1.55, 0, Math.PI / 2, 0, 1, 0.8, 1), IRONUV);
    B.cyl(m.rust, 0.2, 0.2, 0.16, s * 0.8, 0.27, 1.55, 0, 0, Math.PI / 2, 14);
    B.box(m.concrete, s * 0.75 - 0.15, 0, -1.5 - 0.2, s * 0.75 + 0.15, 0.5, -1.5 + 0.2, IRONUV);   // blocks under the front
    B.cyl(m.rust, 0.05, 0.05, 0.12, s * 0.8, 0.52, -1.5, 0, 0, Math.PI / 2, 8);
  }
  // junk in the tray: a tyre, a drum
  B.add(new THREE.TorusGeometry(0.3, 0.11, 8, 18), m.rubber, M(0.25, 1.0, 1.7, Math.PI / 2, 0, 0), IRONUV);
  B.cyl(m.rust, 0.28, 0.28, 0.85, -0.4, 1.35, 1.3, 0, 0, 0, 16, 0.6);
  B.build(g);
  g.position.set(U.x, 0, U.z); g.rotation.y = U.yaw; Y.scene.add(g);
  Y.ute = { group: g, engineAt: new THREE.Vector3(0, 1.05, -1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), U.yaw).add(new THREE.Vector3(U.x, 0, U.z)) };
  Y.colliders.push({ type: 'obb', x: U.x, z: U.z, hw: 0.95, hd: 2.4, yaw: U.yaw });
  Y.items.push(IT('ute', 'The old ute', 'Look', U.x, 1.0, U.z, 1.8, 1.6, 2.2, [U.x, 1.9, U.z]));
  Y.hitTargets.push({ id: 'ute', pos: new THREE.Vector3(U.x, 0.9, U.z), r: 1.4, metal: true });
}

// ---------- the fire pit (a truck rim), the burn barrel, the rotary line, windmill, dunny ----------
function yardProps(Y) {
  const { mats: m, S } = Y, IRONUV = { mode: 'world', scale: 0.5 };
  // fire pit
  const F = YARD.firepit;
  S.add(new THREE.CylinderGeometry(0.58, 0.58, 0.3, 28, 1, true), m.rustDS, M(F.x, 0.15, F.z), { mode: 'scale', su: 4, sv: 0.6 });
  S.add(new THREE.TorusGeometry(0.58, 0.03, 6, 28), m.rust, M(F.x, 0.3, F.z, Math.PI / 2, 0, 0), IRONUV);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + rand(-0.1, 0.1); S.add(lumpify(new THREE.IcosahedronGeometry(rand(0.09, 0.14), 0), 0.03, 7, i), m.stone, M(F.x + Math.cos(a) * 0.74, 0.05, F.z + Math.sin(a) * 0.74, rand(0, 3), rand(0, 3), 0), { mode: 'world', scale: 0.6 }); }
  S.add(new THREE.CircleGeometry(0.55, 20), m.ash, M(F.x, 0.08, F.z, -Math.PI / 2, 0, 0), IRONUV);
  for (let i = 0; i < 4; i++) S.cyl(m.char, 0.05, 0.06, rand(0.5, 0.75), F.x + rand(-0.15, 0.15), 0.13, F.z + rand(-0.15, 0.15), Math.PI / 2, rand(0, 3), 0.15, 8, 0.6);
  const embers = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, TAU, 0, Math.PI / 2), m.ember); embers.position.set(F.x, 0.08, F.z); embers.scale.set(1.2, 0.35, 1.2); Y.scene.add(embers);
  const emberLight = new THREE.PointLight(0xff6a20, 0.8, 3.5, 2); emberLight.position.set(F.x, 0.35, F.z); Y.scene.add(emberLight);
  // a tripod and billy
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; S.rod(m.iron, F.x + Math.cos(a) * 0.7, 0, F.z + Math.sin(a) * 0.7, F.x, 1.2, F.z, 0.015); }
  S.rod(m.iron, F.x, 1.2, F.z, F.x, 0.75, F.z, 0.004);
  S.cyl(m.galv, 0.09, 0.1, 0.16, F.x, 0.66, F.z, 0, 0, 0, 14, 0.4);
  // seats: a log, an upturned drum, a car seat
  S.cyl(m.log, 0.16, 0.18, 1.2, F.x - 1.5, 0.17, F.z + 0.6, Math.PI / 2, 0.9, 0, 10, 0.6);
  S.cyl(m.rust, 0.28, 0.28, 0.45, F.x + 1.45, 0.225, F.z - 0.4, 0, 0, 0, 16, 0.6);
  { const cs = M(F.x + 0.4, 0, F.z + 1.55, 0, 2.6, 0); S.add(new THREE.BoxGeometry(0.5, 0.14, 0.5), m.hessian, cs.clone().multiply(M(0, 0.32, 0)), { mode: 'world', scale: 0.4 }); S.add(new THREE.BoxGeometry(0.5, 0.6, 0.14), m.hessian, cs.clone().multiply(M(0, 0.62, 0.22, -0.2, 0, 0)), { mode: 'world', scale: 0.4 }); S.add(new THREE.BoxGeometry(0.44, 0.25, 0.44), m.rust, cs.clone().multiply(M(0, 0.12, 0)), IRONUV); }
  { const lx = F.x - 1.5, lz = F.z + 0.6;   // the log lies north-south (its turn is about its own length)
    Y.colliders.push(circC(F.x, F.z, 0.8), segC(lx, lz - 0.6, lx, lz + 0.6, 0.2), circC(F.x + 1.45, F.z - 0.4, 0.3), circC(F.x + 0.4, F.z + 1.55, 0.42)); }
  Y.items.push(IT('firepit', 'Fire pit', 'Look', F.x, 0.3, F.z, 1.3, 0.6, 1.3));
  Y.embers = { mesh: embers, light: emberLight, at: new THREE.Vector3(F.x, 0.2, F.z) };
  // burn barrel
  const BR = YARD.barrel;
  S.cyl(m.rustDS, 0.29, 0.29, 0.88, BR.x, 0.44, BR.z, 0, 0, 0, 18, 0.6, true);
  for (const y of [0.25, 0.62]) S.add(new THREE.TorusGeometry(0.295, 0.012, 4, 22), m.rust, M(BR.x, y, BR.z, Math.PI / 2, 0, 0), IRONUV);
  S.add(new THREE.CircleGeometry(0.28, 16), m.ash, M(BR.x, 0.62, BR.z, -Math.PI / 2, 0, 0), IRONUV);
  Y.colliders.push(circC(BR.x, BR.z, 0.32));
  Y.items.push(IT('barrel', 'Burn barrel', 'Look', BR.x, 0.5, BR.z, 0.62, 0.95, 0.62));
  Y.barrelAt = new THREE.Vector3(BR.x, 0.9, BR.z);
  // rotary clothesline: a pole, four arms, square lines, washing
  const CL = YARD.clothesline, line = new THREE.Group();
  {
    const LB = new Batch();
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; LB.rod(m.galv, 0, 1.95, 0, Math.cos(a) * 1.45, 1.78, Math.sin(a) * 1.45, 0.014); LB.rod(m.galv, 0, 1.45, 0, Math.cos(a) * 0.6, 1.88, Math.sin(a) * 0.6, 0.01); }
    for (const r of [0.55, 0.85, 1.15, 1.42]) for (let i = 0; i < 4; i++) {
      const a0 = i / 4 * TAU + 0.4, a1 = (i + 1) / 4 * TAU + 0.4, y = 1.95 - (r / 1.45) * 0.17;
      LB.rod(m.wire, Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r, 0.003, 3);
    }
    LB.build(line);
    const cloth = (mat, w, h, r, a, droop = 0) => { const geo = new THREE.PlaneGeometry(w, h, 4, 4), p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * Math.PI) * 0.03 + droop * (p.getY(i) / h)); geo.computeVertexNormals(); const c = new THREE.Mesh(geo, mat); const yy = 1.95 - (r / 1.45) * 0.17; c.position.set(Math.cos(a) * r, yy - h / 2, Math.sin(a) * r); c.rotation.y = -a + Math.PI / 2; c.castShadow = true; c.userData.soft = true; line.add(c); return c; };
    cloth(m.shirt, 0.55, 0.62, 1.15, 0.4 + 0.5, 0.04); cloth(m.towel, 0.7, 0.5, 0.85, 0.4 + 2.2, 0.03); cloth(m.sock, 0.12, 0.25, 1.42, 0.4 + 3.6); cloth(m.sock, 0.12, 0.24, 1.42, 0.4 + 3.75);
    cloth(m.paper, 0.5, 0.36, 0.85, 0.4 + 4.9, 0.02);   // a pillowcase, the tag still on it
  }
  const pole = new Batch(); pole.rod(m.galv, CL.x, 0, CL.z, CL.x, 1.98, CL.z, 0.03, 8); pole.build(Y.scene);
  line.position.set(CL.x, 0, CL.z); Y.scene.add(line); Y.clothesline = line;
  Y.colliders.push(circC(CL.x, CL.z, 0.5));     // the braces from the pole are at head height
  Y.items.push(IT('clothesline', 'Rotary clothesline', 'Look', CL.x, 1.5, CL.z, 0.4, 1.0, 0.4));
  // windmill: steel lattice, a fan with blades missing, a tail
  const WM = YARD.windmill, wmH = 7.2;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.rod(m.galv, WM.x + dx * 0.9, 0, WM.z + dz * 0.9, WM.x + dx * 0.18, wmH, WM.z + dz * 0.18, 0.035, 6);
  for (let k = 1; k < 6; k++) { const t = k / 6, h = t * wmH, w = 0.9 - (0.9 - 0.18) * t;
    for (const [ax, az, bx, bz] of [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]]) S.rod(m.galv, WM.x + ax, h, WM.z + az, WM.x + bx, h, WM.z + bz, 0.015, 4); }
  for (let k = 0; k < 5; k++) { const t0 = k / 6, t1 = (k + 1) / 6, w0 = 0.9 - 0.72 * t0, w1 = 0.9 - 0.72 * t1; S.rod(m.galv, WM.x - w0, t0 * wmH, WM.z - w0, WM.x + w1, t1 * wmH, WM.z - w1, 0.01, 4); S.rod(m.galv, WM.x + w0, t0 * wmH, WM.z + w0, WM.x - w1, t1 * wmH, WM.z + w1, 0.01, 4); }
  S.box(m.concrete, WM.x - 1.1, 0, WM.z - 1.1, WM.x + 1.1, 0.1, WM.z + 1.1, IRONUV);
  const fan = new THREE.Group(), FB = new Batch();
  for (let i = 0; i < 16; i++) { if ([3, 4, 9, 13].includes(i)) continue; const a = i / 16 * TAU; FB.add(new THREE.BoxGeometry(0.22, 1.25, 0.012), m.galv, M(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0, 0.35, 0, a - Math.PI / 2), IRONUV); }
  FB.add(new THREE.TorusGeometry(1.5, 0.02, 4, 32), m.galv, M(0, 0, 0), IRONUV); FB.add(new THREE.TorusGeometry(0.4, 0.02, 4, 20), m.galv, M(0, 0, 0), IRONUV);
  FB.cyl(m.iron, 0.1, 0.1, 0.3, 0, 0, 0, Math.PI / 2, 0, 0, 10);
  FB.build(fan);
  const head = new THREE.Group(); head.position.set(WM.x, wmH + 0.15, WM.z); Y.scene.add(head);
  fan.position.set(0, 0, -0.35); head.add(fan);
  { const HB = new Batch(); HB.box(m.iron, -0.12, -0.12, -0.3, 0.12, 0.12, 0.6, IRONUV); HB.rod(m.galv, 0, 0, 0.5, 0, 0.15, 2.0, 0.02); HB.add(new THREE.BoxGeometry(0.012, 0.9, 1.0), m.galv, M(0, 0.2, 2.4, 0, 0, 0), IRONUV); HB.build(head); }
  head.rotation.y = 0.6;
  Y.windmill = { head, fan, spin: 0.15 };
  Y.colliders.push(rectC(WM.x - 1.0, WM.z - 1.0, WM.x + 1.0, WM.z + 1.0));
  Y.items.push(IT('windmill', 'Windmill', 'Look', WM.x, 1.6, WM.z, 2.0, 3.2, 2.0, [WM.x, 3.4, WM.z]));
  // the dunny: a narrow tin box with a crescent moon in the door
  const DU = YARD.dunny, dx0 = DU.x - 0.55, dx1 = DU.x + 0.55, dz0 = DU.z - 0.6, dz1 = DU.z + 0.6;
  S.box(m.tinOld, dx0, 0, dz0, dx0 + 0.02, 2.1, dz1, { mode: 'world', scale: 1 }); S.box(m.tinOld, dx0, 0, dz0, dx1, 2.1, dz0 + 0.02, { mode: 'world', scale: 1 });
  S.box(m.tinOld, dx0, 0, dz1 - 0.02, dx1, 2.1, dz1, { mode: 'world', scale: 1 });
  S.box(m.tinOld, dx1 - 0.02, 0, dz0, dx1, 2.1, dz1 - 0.58, { mode: 'world', scale: 1 });
  S.add(new THREE.BoxGeometry(1.3, 0.02, 1.4), m.tinOld, M(DU.x, 2.18, DU.z, 0, 0, -0.12), { mode: 'world', scale: 1 });
  const door = new THREE.Group(); { const DB = new Batch(); DB.box(m.boardsDark, 0, 0, -0.56, 0.035, 2.0, 0.0, { mode: 'world', scale: 1.2 }); DB.build(door); }
  door.position.set(dx1, 0.02, dz1 - 0.02); door.rotation.y = 0.5; Y.scene.add(door);
  S.box(m.char, DU.x - 0.2, 0.0, DU.z - 0.5, DU.x + 0.25, 0.45, DU.z + 0.5, IRONUV);   // the seat box
  S.add(new THREE.TorusGeometry(0.15, 0.04, 6, 16), m.wood, M(DU.x, 0.46, DU.z, Math.PI / 2, 0, 0), IRONUV);
  Y.colliders.push(rectC(dx0, dz0, dx1, dz1));
  Y.items.push(IT('dunny', 'The dunny', 'Look', DU.x, 1.1, DU.z, 1.2, 2.2, 1.3, [DU.x + 0.6, 1.9, DU.z + 0.2]));
  // the north gate, welded from scrap, and a Stobie pole stump with its insulator
  const G = { x: 0, z: -YARD.R };
  for (const sx of [-1.35, 1.35]) S.box(m.iron, G.x + sx - 0.06, 0, G.z - 0.06, G.x + sx + 0.06, 1.55, G.z + 0.06, IRONUV);
  const ng = new Batch();
  ng.rod(m.rust, -1.25, 0.2, 0, 1.25, 0.2, 0, 0.03); ng.rod(m.rust, -1.25, 1.3, 0, 1.25, 1.3, 0, 0.03); ng.rod(m.rust, -1.25, 0.2, 0, -1.25, 1.3, 0, 0.03); ng.rod(m.rust, 1.25, 0.2, 0, 1.25, 1.3, 0, 0.03); ng.rod(m.rust, -1.25, 0.2, 0, 1.25, 1.3, 0, 0.02);
  ng.cyl(m.chrome, 0.2, 0.2, 0.03, -0.6, 0.75, 0, Math.PI / 2, 0, 0, 18);                     // a hubcap
  ng.add(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 12, 1, true, -0.6, 1.2), m.steel, M(0.55, 0.7, 0, 0, 0, 0.4), IRONUV);  // half a shovel
  for (let i = 0; i < 6; i++) ng.rod(m.iron, -1.2 + i * 0.48, 0.2, 0, -1.0 + i * 0.48, 1.3, 0, 0.012);   // an old bed frame's slats
  ng.add(new THREE.TorusGeometry(0.12, 0.02, 6, 14, Math.PI * 1.4), m.iron, M(0.05, 1.05, 0.02, 0, 0, 0.3), IRONUV);
  const ngg = new THREE.Group(); ng.build(ngg); ngg.position.set(G.x, 0, G.z + 0.02); Y.scene.add(ngg);
  Y.colliders.push(segC(G.x - 1.4, G.z, G.x + 1.4, G.z, 0.1));
  Y.items.push(IT('ngate', 'North gate', 'Look', G.x, 0.75, G.z + 0.05, 2.6, 1.3, 0.2));
  const SP = YARD.stobie;
  for (const s of [-1, 1]) S.box(m.galv, SP.x + s * 0.09 - 0.012, 0, SP.z - 0.08, SP.x + s * 0.09 + 0.012, 2.6, SP.z + 0.08, IRONUV);
  S.box(m.concrete, SP.x - 0.08, 0, SP.z - 0.07, SP.x + 0.08, 2.6, SP.z + 0.07, IRONUV);
  S.box(m.wood, SP.x - 0.5, 2.35, SP.z - 0.05, SP.x + 0.3, 2.45, SP.z + 0.05, { mode: 'world', scale: 1 });
  S.rod(m.steel, SP.x + 0.2, 2.45, SP.z, SP.x + 0.2, 2.55, SP.z, 0.012);
  Y.colliders.push(circC(SP.x, SP.z, 0.14));
  Y.items.push(IT('stobie', 'Stobie pole', 'Look', SP.x, 1.3, SP.z, 0.3, 2.6, 0.3));
  // letterbox: an old kerosene tin on a post
  const LX = YARD.letterbox;
  S.box(m.timber, LX.x - 0.04, 0, LX.z - 0.04, LX.x + 0.04, 1.0, LX.z + 0.04, { mode: 'world', scale: 1.2 });
  S.box(m.rust, LX.x - 0.16, 1.0, LX.z - 0.13, LX.x + 0.16, 1.3, LX.z + 0.13, IRONUV);
  S.box(m.tractor, LX.x + 0.16, 1.15, LX.z - 0.01, LX.x + 0.18, 1.32, LX.z + 0.01, IRONUV);
  Y.colliders.push(circC(LX.x, LX.z, 0.2));     // the tin box sticks out past its post
  Y.items.push(IT('letterbox', 'Letterbox', () => Y.state && Y.state.letter ? 'Look' : 'Check the mail', LX.x, 1.15, LX.z, 0.4, 0.4, 0.35));
  // junk piles: tyres, drums, sheets, an old fridge on its back
  YARD.junk.forEach(([jx, jz, jr], k) => {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU), d = Math.sqrt(R()) * jr, x = jx + Math.cos(a) * d, z = jz + Math.sin(a) * d, kind = R();
      // every piece is solid where it lies, so nothing pokes out past the pile's edge to walk through
      if (kind < 0.25) { S.add(new THREE.TorusGeometry(0.3, 0.1, 6, 14), m.rubber, M(x, 0.1 + rand(0, 0.2), z, Math.PI / 2 + rand(-0.3, 0.3), rand(0, 3), 0), IRONUV); Y.colliders.push(circC(x, z, 0.4)); }
      else if (kind < 0.45) { S.cyl(m.rust, 0.28, 0.28, 0.85, x, 0.28, z, Math.PI / 2, rand(0, 3), 0, 14, 0.6); Y.colliders.push(segC(x, z - 0.43, x, z + 0.43, 0.29)); }   // a drum on its side, rolled about its own length
      else if (kind < 0.75) { const w = rand(0.6, 1.4), dd = rand(0.5, 1.0), ry = rand(0, 3); S.add(new THREE.BoxGeometry(w, 0.015, dd), m.tinOld, M(x, rand(0.05, 0.4), z, rand(-0.4, 0.4), ry, rand(-0.4, 0.4)), { mode: 'world', scale: 1 }); Y.colliders.push({ type: 'obb', x, z, hw: w / 2, hd: dd / 2, yaw: ry }); }
      else { const l = rand(0.3, 0.9); S.add(new THREE.BoxGeometry(rand(0.1, 0.4), rand(0.05, 0.2), l), R() < 0.5 ? m.iron : m.steel, M(x, rand(0.05, 0.3), z, rand(0, 3), rand(0, 3), rand(0, 3)), IRONUV); Y.colliders.push(circC(x, z, l * 0.5)); }
    }
    if (k === 0) S.box(m.enamel, jx - 0.4, 0, jz - 0.8, jx + 0.4, 0.62, jz + 0.8, { mode: 'world', scale: 1 });
    Y.colliders.push(circC(jx, jz, jr * 0.85));
    Y.items.push(IT('junk' + k, 'Junk pile', 'Look', jx, 0.4, jz, jr * 1.6, 0.8, jr * 1.6, null, { act: 'junk' }));
  });
}

// ---------- the tree that turned to metal, and the tree that hoards ----------
function yardTrees(Y) {
  const { mats: m, S } = Y;
  // Iron-Bark Sentinel
  const IB = YARD.ironbark, trunkPts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; trunkPts.push([0.62 - 0.38 * t + (i === 0 ? 0.15 : 0), t * 5.2]); }
  trunkPts.push([0, 5.25]);
  const trunk = lumpify(lathe(trunkPts, 14), 0.05, 4, 1);
  S.add(trunk, m.ironbark, M(IB.x, 0, IB.z, 0, 0, 0.04), { mode: 'scale', su: 3, sv: 4 });
  const branch = (x0, y0, z0, len, a, el, r) => {
    const x1 = x0 + Math.cos(a) * Math.cos(el) * len, y1 = y0 + Math.sin(el) * len, z1 = z0 + Math.sin(a) * Math.cos(el) * len;
    S.rod(m.ironbark, x0, y0, z0, x1, y1, z1, r, 8, 0.6); return [x1, y1, z1];
  };
  const leafClump = (x, y, z, s) => { for (let i = 0; i < 5; i++) S.add(new THREE.IcosahedronGeometry(s * rand(0.5, 0.9), 0), m.leaf, M(x + rand(-s, s), y + rand(-s * 0.4, s * 0.5), z + rand(-s, s), rand(0, 3), rand(0, 3), 0, 1, 0.45, 1), { mode: 'world', scale: 1 }); };
  for (const [a, el, len] of [[0.3, 0.6, 3.0], [2.2, 0.7, 2.6], [4.1, 0.5, 3.2], [5.3, 0.9, 2.2]]) {
    const [x1, y1, z1] = branch(IB.x, 3.6 + rand(-0.6, 0.8), IB.z, len, a, el, 0.12);
    const [x2, y2, z2] = branch(x1, y1, z1, len * 0.6, a + rand(-0.6, 0.6), el + 0.2, 0.06);
    leafClump(x2, y2 + 0.2, z2, 0.9); leafClump(x1, y1 + 0.3, z1, 0.6);
  }
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; S.rod(m.ironbark, IB.x + Math.cos(a) * 0.4, 0.25, IB.z + Math.sin(a) * 0.4, IB.x + Math.cos(a) * 1.1, -0.05, IB.z + Math.sin(a) * 1.1, 0.12, 6, 0.6); }
  Y.colliders.push(circC(IB.x, IB.z, 0.95));    // trunk and the flared roots
  Y.items.push(IT('ironbarktree', 'Iron-Bark Sentinel', 'Look', IB.x, 1.5, IB.z, 1.4, 3, 1.4));
  Y.hitTargets.push({ id: 'ironbarktree', pos: new THREE.Vector3(IB.x, 1.3, IB.z), r: 0.62, metal: true });
  // Miser-Boab: pale, swollen like a stomach on the ground, no leaves at all
  const BO = YARD.boab, bp = [];
  // a bottle: swollen low, tapering to a narrow neck, branches straight out of the top
  for (const [t, r] of [[0, 1.08], [0.06, 1.22], [0.16, 1.32], [0.3, 1.26], [0.44, 1.06], [0.58, 0.78], [0.7, 0.55], [0.82, 0.4], [0.92, 0.34], [1, 0.3]]) bp.push([r, t * 4.2]);
  bp.push([0, 4.25]);
  const boab = lumpify(lathe(bp, 20), 0.06, 3, 4);
  S.add(boab, m.boab, M(BO.x, -0.05, BO.z), { mode: 'scale', su: 4, sv: 3 });
  for (const [a, len] of [[0.4, 1.4], [1.9, 1.1], [3.0, 1.6], [4.6, 1.2], [5.5, 0.9], [2.5, 0.8]]) {
    const x0 = BO.x + Math.cos(a) * 0.15, z0 = BO.z + Math.sin(a) * 0.15, x1 = x0 + Math.cos(a) * len, z1 = z0 + Math.sin(a) * len, y0 = 4.05, y1 = y0 + len * 0.5;
    S.rod(m.boab, x0, y0, z0, x1, y1, z1, 0.12, 7, 0.6);
    for (const da of [-0.6, 0.7]) S.rod(m.boab, x1, y1, z1, x1 + Math.cos(a + da) * 0.55, y1 + 0.3, z1 + Math.sin(a + da) * 0.55, 0.055, 6, 0.6);
  }
  Y.colliders.push(circC(BO.x, BO.z, 1.35));
  Y.items.push(IT('boab', 'Miser-Boab', 'Look', BO.x, 1.6, BO.z, 2.6, 3.2, 2.6));
  Y.hitTargets.push({ id: 'boab', pos: new THREE.Vector3(BO.x, 1.2, BO.z), r: 1.2 });
}

// ---------- far things: the Judas-Wattle grove, Prickles on his rock, scrub and stones ----------
function yardFar(Y) {
  const { mats: m, scene } = Y;
  // Judas-Wattle: a golden grove out east, beautiful and lying
  const trunkG = new THREE.CylinderGeometry(0.08, 0.14, 2.2, 6); trunkG.translate(0, 1.1, 0);
  const crownList = []; for (let i = 0; i < 9; i++) { const g = new THREE.IcosahedronGeometry(rand(0.5, 0.85), 1); g.translate(rand(-0.9, 0.9), 2.4 + rand(-0.3, 0.8), rand(-0.9, 0.9)); crownList.push(g); }
  const crownG = mergeGeos(crownList);
  const N = 22, trunks = new THREE.InstancedMesh(trunkG, m.wattleTrunk, N), crowns = new THREE.InstancedMesh(crownG, m.wattle, N);
  const d = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = rand(-0.55, 0.45), r = rand(27, 46), s = rand(0.8, 1.4);
    d.position.set(Math.cos(a) * r, Y.hill(Math.cos(a) * r, Math.sin(a) * r, r) - 0.1, Math.sin(a) * r); d.rotation.set(0, rand(0, TAU), rand(-0.08, 0.08)); d.scale.setScalar(s); d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix); crowns.setMatrixAt(i, d.matrix);
  }
  trunks.castShadow = crowns.castShadow = false; scene.add(trunks, crowns);
  // a drifting haze of golden pollen over the grove
  // Prickles, the Thorny-Devil, basking on a rock just outside the fence to the east
  const PR = { x: 21.2, z: 3.4 }, pr = new THREE.Group(), PB = new Batch();
  PB.add(lumpify(new THREE.IcosahedronGeometry(0.9, 1), 0.15, 2, 7), m.stone, M(0, 0.2, 0, 0, 0, 0, 1.4, 0.55, 1), { mode: 'world', scale: 1 });
  const body = new THREE.SphereGeometry(1, 12, 8); body.scale(0.32, 0.2, 0.7); PB.add(body, m.obsidian, M(0, 0.8, 0), { mode: 'world', scale: 1 });
  const headG = new THREE.SphereGeometry(1, 10, 8); headG.scale(0.18, 0.14, 0.22); PB.add(headG, m.obsidian, M(0, 0.86, -0.78), { mode: 'world', scale: 1 });
  PB.add(new THREE.ConeGeometry(0.06, 0.8, 6), m.obsidian, M(0, 0.78, 1.05, Math.PI / 2 + 0.15, 0, 0), { mode: 'world', scale: 1 });
  for (let i = 0; i < 46; i++) { const u = rand(-0.9, 0.9), a = rand(-1.4, 1.4); PB.add(new THREE.ConeGeometry(0.03, rand(0.12, 0.26), 4), m.obsidian, M(Math.sin(a) * 0.3 * Math.sqrt(1 - u * u), 0.8 + Math.cos(a) * 0.18, u * 0.66, Math.cos(a) * 0.2, 0, -a), { mode: 'world', scale: 1 }); }
  for (const [lx, lz] of [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]]) PB.rod(m.obsidian, lx * 0.7, 0.8, lz, lx * 1.4, 0.6, lz * 1.1, 0.05, 6);
  PB.build(pr); pr.position.set(PR.x, Y.hill(PR.x, PR.z, Math.hypot(PR.x, PR.z)) - 0.1, PR.z); pr.rotation.y = 2.3; scene.add(pr);
  Y.prickles = pr;
  Y.items.push(IT('prickles', 'Thorny-Devil', 'Look', PR.x, pr.position.y + 0.8, PR.z, 1.6, 1.0, 1.8, null, { reach: 6 }));
  // stones scattered across the yard
  const stoneG = lumpify(new THREE.IcosahedronGeometry(1, 0), 0.25, 2, 3), NS = 260, stones = new THREE.InstancedMesh(stoneG, m.stone, NS);
  for (let i = 0; i < NS; i++) {
    let x, z, ok = false;
    for (let k = 0; k < 12 && !ok; k++) { const a = rand(0, TAU), r = Math.sqrt(R()) * (YARD.R + 18); x = Math.cos(a) * r; z = Math.sin(a) * r; ok = Y.clear(x, z, 0.3); }
    const s = rand(0.03, 0.12) * (R() < 0.08 ? 3 : 1), r = Math.hypot(x, z);
    d.position.set(x, Y.hill(x, z, r) + s * 0.25, z); d.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); d.scale.set(s, s * rand(0.4, 0.8), s * rand(0.7, 1.2)); d.updateMatrix(); stones.setMatrixAt(i, d.matrix);
    if (s > 0.13 && r < YARD.R) Y.colliders.push(circC(x, z, s * 1.05));    // too big to step over
  }
  stones.receiveShadow = true; scene.add(stones);
  // dry scrub tufts: thin blades, bleached grey-gold
  const tuft = (() => { const list = []; for (let i = 0; i < 9; i++) { const g = new THREE.PlaneGeometry(0.02, rand(0.12, 0.3)); g.translate(0, 0.08, 0); g.rotateZ(rand(-0.5, 0.5)); g.rotateY(rand(0, TAU)); list.push(g.toNonIndexed()); } return mergeGeos(list); })();
  const scrubMat = new THREE.MeshStandardMaterial({ color: 0xa08a62, roughness: 0.9, side: THREE.DoubleSide });
  const NT = 520, tufts = new THREE.InstancedMesh(tuft, scrubMat, NT);
  for (let i = 0; i < NT; i++) {
    let x, z, ok = false;
    for (let k = 0; k < 12 && !ok; k++) { const a = rand(0, TAU), r = Math.sqrt(R()) * (YARD.R + 26); x = Math.cos(a) * r; z = Math.sin(a) * r; ok = Y.clear(x, z, 0.4) && !Y.onPath(x, z); }
    const s = rand(0.7, 1.6), r = Math.hypot(x, z); d.position.set(x, Y.hill(x, z, r), z); d.rotation.set(0, rand(0, TAU), 0); d.scale.set(s, s * rand(0.7, 1.3), s); d.updateMatrix(); tufts.setMatrixAt(i, d.matrix);
  }
  tufts.userData.soft = true;     // dry grass: you walk through it
  scene.add(tufts);
}

// keep scatter away from buildings, pens and paths
function yardClearance(Y) {
  const blocks = [
    [-3.4, -6.1, 3.4, 0.9], [YARD.pen.x0 - 0.4, YARD.pen.z0 - 0.4, YARD.pen.x1 + 0.4, YARD.pen.z1 + 0.4], [YARD.run.x0 - 0.3, YARD.coop.z - 0.9, YARD.run.x1 + 0.3, YARD.run.z1 + 0.3],
    [YARD.shed.x0 - 0.3, YARD.shed.z0 - 0.3, YARD.shed.x1 + 0.3, YARD.shed.z1 + 0.5], [YARD.tractor.x - 1.4, YARD.tractor.z - 1.9, YARD.tractor.x + 1.4, YARD.tractor.z + 2.6],
    [YARD.ute.x - 2.4, YARD.ute.z - 2.6, YARD.ute.x + 2.4, YARD.ute.z + 2.6], [YARD.tank.x - 1.2, YARD.tank.z - 1.2, YARD.tank.x + 1.6, YARD.tank.z + 1.6],
    [YARD.dunny.x - 0.8, YARD.dunny.z - 0.8, YARD.dunny.x + 1.2, YARD.dunny.z + 1.0], [YARD.windmill.x - 1.3, YARD.windmill.z - 1.3, YARD.windmill.x + 1.3, YARD.windmill.z + 1.3],
  ];
  const circles = [[YARD.firepit.x, YARD.firepit.z, 2.2], [YARD.barrel.x, YARD.barrel.z, 0.6], [YARD.clothesline.x, YARD.clothesline.z, 0.4], [YARD.ironbark.x, YARD.ironbark.z, 1.3], [YARD.boab.x, YARD.boab.z, 1.6], [YARD.feedPile.x, YARD.feedPile.z, 0.9], [YARD.still.x, YARD.still.z, 0.9], [0, -YARD.R, 2.0], ...YARD.junk.map(([x, z, r]) => [x, z, r + 0.3])];
  Y.clear = (x, z, pad = 0) => {
    const r = Math.hypot(x, z);
    if (r > YARD.R - 1.0 - pad && r < YARD.R + 0.8 + pad) return false;
    for (const [x0, z0, x1, z1] of blocks) if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) return false;
    for (const [cx, cz, cr] of circles) if (Math.hypot(x - cx, z - cz) < cr + pad) return false;
    return true;
  };
  const paths = [[[-0.9, 0.7], [1.2, 2.2], [3.5, 3.2], [5.4, 3.4]], [[-0.9, 0.7], [1.6, 0.6], [3.4, -1.0], [4.0, -4.0], [4.4, -5.3]], [[-0.9, 0.7], [-3.4, 0.8], [-4.4, -2.0], [-5.6, -4.4]], [[-0.9, 0.7], [0.2, 4.0], [0.8, 5.8]], [[-6.0, 5.8], [-5.2, 0.0], [-4.9, -4.0], [-4.0, -9.0], [-2.0, -13.5], [0.0, -17.6]]];
  Y.onPath = (x, z) => {
    for (const pts of paths) for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ex = bx - ax, ez = bz - az, t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
      if (Math.hypot(x - ax - ex * t, z - az - ez * t) < 0.7) return true;
    }
    return false;
  };
}
// ============================================================
// The yard's living things: the Beggar's Hand fence and the
// Scream-Peas on it, spinifex that lashes, compass-weed, the herd,
// the fowl, the flies, the Jaw-Jaws, and everything you can find.
// ============================================================
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _v4 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _e4 = new THREE.Euler(0, 0, 0, 'YXZ');
function TRS(out, x, y, z, rx, ry, rz, sx = 1, sy = sx, sz = sx, order = 'XYZ') {
  _e4.order = order; _e4.set(rx, ry, rz);
  return out.compose(_v4.set(x, y, z), _q4.setFromEuler(_e4), _s4.set(sx, sy, sz));
}
function instanced(geo, mat, n, { cast = true, receive = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}
function merged(parts) { return mergeGeos(parts.map(([g, mx]) => { const n = g.index ? g.toNonIndexed() : g; n.applyMatrix4(mx); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; })); }
// gentle wind for grasses and hands: bend vertices by their height, phase by where the instance stands
function windy(mat, amount = 0.05, speed = 1.8) {
  mat.customProgramCacheKey = () => `windy-${amount}-${speed}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = YARD_TIME;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float wph = uTime * ${speed.toFixed(2)} + ip.x * 0.7 + ip.z * 0.45;
        transformed.x += sin(wph) * ${amount.toFixed(3)} * max(position.y, 0.0) * (1.0 + 0.4 * sin(wph * 2.3));
        transformed.z += cos(wph * 0.8) * ${(amount * 0.6).toFixed(3)} * max(position.y, 0.0);`);
  };
  return mat;
}
const YARD_TIME = { value: 0 };

// ---------- the living fence: Beggar's Hand all the way round, old pickets, Scream-Peas ----------
function yardFence(Y) {
  const { mats: m, scene } = Y, Rr = YARD.R;
  // three variants of a plant: fuzzy red stalks, each ending in a shrivelled hand of tendrils
  const plant = (seed) => {
    const parts = [];
    const n = 3 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const h = 0.35 + ((seed * 7 + i * 13) % 10) / 18, a = i / n * TAU + seed, lean = 0.12 + (i % 2) * 0.1;
      const stalk = new THREE.CylinderGeometry(0.012, 0.02, h, 4); stalk.translate(0, h / 2, 0);
      const base = TRS(new THREE.Matrix4(), Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      parts.push([stalk, base]);
      // the hand: five tendrils curling up and inward like fingers
      for (let f = 0; f < 5; f++) {
        const fa = f / 5 * TAU, fl = 0.08 + (f === 0 ? 0.03 : 0.0);
        const finger = new THREE.ConeGeometry(0.011, fl, 3); finger.translate(0, fl / 2, 0);
        const fm = base.clone().multiply(TRS(new THREE.Matrix4(), Math.cos(fa) * 0.018, h, Math.sin(fa) * 0.018, Math.sin(fa) * 0.55, 0, -Math.cos(fa) * 0.55));
        parts.push([finger, fm]);
      }
    }
    return merged(parts);
  };
  const variants = [plant(1), plant(2), plant(4)].map(g => instanced(g, windy(m.fuzz.clone(), 0.12, 1.4), 140, { cast: true }));
  const counts = [0, 0, 0], hands = [];
  const gateHalf = 1.5 / Rr, gateA = -Math.PI / 2;
  for (const [ring, step] of [[Rr - 0.42, 0.55], [Rr + 0.02, 0.75], [Rr - 0.2, 1.6]]) {
    const n = Math.floor(TAU * ring / step);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(-0.01, 0.01);
      if (Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA))) < gateHalf) continue;
      const v = Math.floor(R() * 3), mesh = variants[v];
      if (counts[v] >= 140) continue;
      const r = ring + rand(-0.08, 0.08), s = rand(0.8, 1.35);
      const h = { v, i: counts[v]++, x: Math.cos(a) * r, z: Math.sin(a) * r, a, s, ry: rand(0, TAU), grab: 0 };
      TRS(_m4, h.x, 0, h.z, 0, h.ry, 0, s, s * rand(0.85, 1.25), s); mesh.setMatrixAt(h.i, _m4); h.matrix = _m4.clone();
      hands.push(h);
    }
  }
  variants.forEach((v, k) => { v.count = counts[k]; scene.add(v); });
  Y.hands = { variants, list: hands };
  // a few old star pickets lean in the hedge, one sagging strand between some of them
  const pick = merged([[new THREE.BoxGeometry(0.035, 1.15, 0.004), M(0, 0.575, 0)], [new THREE.BoxGeometry(0.004, 1.15, 0.03), M(0.012, 0.575, 0.012, 0, 0.5, 0)], [new THREE.BoxGeometry(0.004, 1.15, 0.03), M(-0.012, 0.575, 0.012, 0, -0.5, 0)]]);
  const NP = 28, picks = instanced(pick, m.rust, NP), pkPos = [];
  for (let i = 0; i < NP; i++) {
    let a = i / NP * TAU + 0.07;
    if (Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA))) < gateHalf + 0.05) a += 0.12;
    const r = Rr - 0.2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    TRS(_m4, x, -0.1, z, rand(-0.12, 0.12), rand(0, TAU), rand(-0.12, 0.12)); picks.setMatrixAt(i, _m4); pkPos.push([x, z, a]);
  }
  scene.add(picks);
  for (let i = 0; i < NP; i++) {
    if (i % 3 === 2) continue;
    const [ax, az] = pkPos[i], [bx, bz] = pkPos[(i + 1) % NP], mid = 0.5;
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8, sag = Math.sin(t * Math.PI) * 0.25; pts.push(new THREE.Vector3(ax + (bx - ax) * t, 0.9 - sag, az + (bz - az) * t)); }
    Y.S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.004, 3, false), m.wire, M(0, 0, 0), { mode: 'scale', su: 1, sv: 1 });
  }
  // Scream-Peas: low creeping vines with flowers like staring, lidded eyes
  const NF = 34, bulbs = instanced(new THREE.SphereGeometry(0.07, 16, 12), m.pea, NF, { cast: false });
  const lidGeo = new THREE.SphereGeometry(0.076, 14, 6, 0, TAU, 0, Math.PI / 2);
  const lidsTop = instanced(lidGeo, m.peaLid, NF, { cast: false }), lidsBot = instanced(lidGeo, m.peaLid, NF, { cast: false });
  const peas = [];
  for (let i = 0; i < NF; i++) {
    const a = (i + 0.5) / NF * TAU + rand(-0.03, 0.03);
    if (Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA))) < gateHalf + 0.03) continue;
    const climb = i % 5 === 0, r = Rr - 0.62 - rand(0, 0.15), y = climb ? rand(0.5, 0.95) : rand(0.08, 0.22);
    const p = { idx: peas.length, x: Math.cos(a) * r, y, z: Math.sin(a) * r, yaw: a + Math.PI, pitch: 0, open: 0.45, target: 0.45, shut: 0, phase: rand(0, TAU) };
    peas.push(p);
    // its vine
    const vpts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, va = a + (t - 0.5) * 0.08; vpts.push(new THREE.Vector3(Math.cos(va) * (r + 0.1 * Math.sin(t * 6)), Math.max(0.02, y * t * (climb ? 1 : 1.2)), Math.sin(va) * (r + 0.1 * Math.sin(t * 6)))); }
    Y.S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vpts), 8, 0.008, 4, false), m.vine, M(0, 0, 0), { mode: 'scale', su: 1, sv: 1 });
  }
  bulbs.count = lidsTop.count = lidsBot.count = peas.length;
  bulbs.userData.soft = lidsTop.userData.soft = lidsBot.userData.soft = true;   // creeping vines: walked through, not into
  scene.add(bulbs, lidsTop, lidsBot);
  Y.peas = { bulbs, lidsTop, lidsBot, list: peas };
}

// ---------- spinifex that lashes, salt-bush, compass-weed, the Hemorrhage-Flower, a tomato in a tyre ----------
function yardPlants(Y) {
  const { mats: m, scene, S } = Y;
  // Razor-Spinifex: tufts of glass-and-iron blades
  const tuftGeo = (n, hMax) => {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const h = rand(hMax * 0.45, hMax), w = rand(0.012, 0.02), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, h, 0], 3)); g.computeVertexNormals();
      const a = rand(0, TAU), lean = rand(0.15, 0.7);
      parts.push([g, TRS(new THREE.Matrix4(), Math.cos(a) * rand(0, 0.12), 0, Math.sin(a) * rand(0, 0.12), Math.sin(a) * lean, a, -Math.cos(a) * lean)]);
    }
    return merged(parts);
  };
  const spinGeo = tuftGeo(46, 0.62);
  const gold = instanced(spinGeo, windy(m.spinifex, 0.07, 2.4), 60), rust = instanced(spinGeo, windy(m.spinifexRust, 0.06, 2.1), 24);
  const tufts = [];
  const place = (mesh, n, where) => {
    let k = 0;
    for (let tries = 0; tries < 900 && k < n; tries++) {
      const [x, z] = where();
      if (!Y.clear(x, z, 0.25) || Y.onPath(x, z) || tufts.some(t => Math.hypot(t.x - x, t.z - z) < 0.75)) continue;
      const t = { mesh, i: k++, x, z, s: rand(0.75, 1.3), ry: rand(0, TAU), lash: 0, cut: 0, cool: 0 };
      tufts.push(t);
    }
    mesh.count = k;
  };
  place(gold, 60, () => { const a = rand(0, TAU), r = Math.sqrt(rand(0.05, 1)) * (YARD.R - 1.4); return [Math.cos(a) * r, Math.sin(a) * r]; });
  place(rust, 24, () => { const a = rand(0, TAU), r = rand(YARD.R - 3.2, YARD.R - 1.25); return [Math.cos(a) * r, Math.sin(a) * r]; });
  for (const t of tufts) { TRS(_m4, t.x, 0, t.z, 0, t.ry, 0, t.s); t.mesh.setMatrixAt(t.i, _m4); }
  gold.userData.soft = rust.userData.soft = true;
  scene.add(gold, rust);
  Y.tufts = tufts;
  // Salt-Bush: crystalline grey-green, berries like tears
  Y.saltbush = YARD.saltbush.map(([x, z], k) => {
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU), r = Math.sqrt(R()) * 0.42, y = rand(0.08, 0.6) * (1 - r * 0.8);
      S.add(new THREE.IcosahedronGeometry(rand(0.04, 0.075), 0), m.saltbush, M(x + Math.cos(a) * r, y, z + Math.sin(a) * r, rand(0, 3), rand(0, 3), rand(0, 3), 1, 0.45, 1), { mode: 'world', scale: 0.4 });
    }
    for (let i = 0; i < 4; i++) S.rod(m.wattleTrunk, x, 0, z, x + rand(-0.25, 0.25), rand(0.25, 0.45), z + rand(-0.25, 0.25), 0.012, 4);
    const berries = [];
    for (let i = 0; i < 18; i++) { const a = rand(0, TAU), r = rand(0.15, 0.42); const g = new THREE.SphereGeometry(rand(0.013, 0.02), 8, 6); g.translate(x + Math.cos(a) * r, rand(0.2, 0.62) * (1 - r * 0.6), z + Math.sin(a) * r); berries.push(g.toNonIndexed()); }
    const bm = new THREE.Mesh(mergeGeos(berries), m.berry); bm.userData.soft = true; scene.add(bm);
    Y.colliders.push(circC(x, z, 0.45));
    Y.items.push(IT('salt' + k, 'Salt-Bush', () => Y.verb('salt', k), x, 0.35, z, 0.9, 0.7, 0.9, null, { act: 'salt', k }));
    return { x, z, berries: bm, picked: false };
  });
  // Compass-weed: pale green, a perfect spiral
  const spiral = (() => { const parts = [], GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 26; i++) { const a = i * GA, r = 0.02 + Math.sqrt(i) * 0.03, leaf = new THREE.SphereGeometry(1, 8, 6); leaf.scale(0.022 + i * 0.0012, 0.012, 0.045 + i * 0.0018);
      parts.push([leaf, TRS(new THREE.Matrix4(), Math.cos(a) * r, 0.02 + (26 - i) * 0.0016, Math.sin(a) * r, 0.25 + i * 0.01, -a + Math.PI / 2, 0)]); }
    return merged(parts); })();
  Y.weeds = YARD.weeds.map(([x, z, tag], k) => {
    const w = new THREE.Mesh(spiral, m.compass); w.position.set(x, 0, z); w.rotation.y = rand(0, TAU); w.receiveShadow = true; w.userData.soft = true; scene.add(w);
    return { x, z, mesh: w, pen: tag === 'pen', gone: false, cool: 0 };
  });
  const pw = Y.weeds.find(w => w.pen);
  Y.items.push(IT('penweed', 'Compass-weed', 'Dig it out', pw.x, 0.08, pw.z, 0.4, 0.18, 0.4, null, { enabled: () => !pw.gone, reach: 2.6 }));
  // the Hemorrhage-Flower, rigid on its stalk by the verandah
  const H = YARD.hemorrhage, flower = new THREE.Group();
  { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 1.15, 6), m.stalk); st.position.y = 0.575; st.castShadow = true; flower.add(st);
    for (const [y, a] of [[0.35, 0.4], [0.6, 2.6], [0.8, 4.4]]) { const lf = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), m.leaf); lf.scale.set(0.03, 0.008, 0.12); lf.position.set(Math.cos(a) * 0.08, y, Math.sin(a) * 0.08); lf.rotation.y = -a; flower.add(lf); }
    // thorns up the stalk, a dark calyx, and a tight bud of six blood-red petals wrapped to a point
    for (let i = 0; i < 7; i++) { const a = i * 2.4, y = 0.2 + i * 0.13, th = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.035, 4), m.stalk); th.position.set(Math.cos(a) * 0.016, y, Math.sin(a) * 0.016); th.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); flower.add(th); }
    { const cx = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.06, 7), m.stalk); cx.rotation.x = Math.PI; cx.position.y = 1.13; flower.add(cx); }
    const heartMat = m.heart.clone(); heartMat.color.setHex(0xd8562a); heartMat.emissive.setHex(0xffa040); heartMat.emissiveIntensity = 0.15;
    const heart = new THREE.Mesh(lumpify(new THREE.SphereGeometry(0.038, 12, 8), 0.005, 30, 2), heartMat); heart.position.y = 1.2; heart.castShadow = true; flower.add(heart);
    const petalGeo = (() => {
      const g = new THREE.PlaneGeometry(1, 1, 4, 10), q = g.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const u = q.getX(i), t = q.getY(i) + 0.5;
        const w = 0.05 * Math.sin(Math.PI * Math.pow(t, 0.8)) + 0.008 * (1 - t), x = u * w * 2;
        const rad = 0.026 + 0.064 * Math.sin(Math.PI * t) * (1 - 0.25 * t) - 0.026 * t;
        q.setXYZ(i, x, 0.22 * t, rad - 5 * x * x);
      }
      g.computeVertexNormals(); return g;
    })();
    const petalMat = new THREE.MeshStandardMaterial({ color: 0x7a0c12, roughness: 0.42, emissive: 0x2a0204, emissiveIntensity: 1, side: THREE.DoubleSide });
    const petals = []; for (let i = 0; i < 6; i++) { const pv = new THREE.Group(); pv.position.y = 1.13; pv.rotation.y = i / 6 * TAU + 0.2; const pm = new THREE.Mesh(petalGeo, petalMat); pm.castShadow = true; pm.position.z = -0.004 * (i % 2); pv.add(pm); flower.add(pv); petals.push(pv); }
    const glow = new THREE.PointLight(0xffc860, 0, 4, 2); glow.position.y = 1.3; flower.add(glow);
    flower.userData = { heart, heartMat, petals, glow, open: 0, target: 0 }; }
  flower.position.set(H.x, 0, H.z); scene.add(flower); Y.flower = flower;
  Y.colliders.push(circC(H.x, H.z, 0.12));
  Y.items.push(IT('hemorrhage', 'Hemorrhage-Flower', () => Y.verb('hemorrhage'), H.x, 1.0, H.z, 0.35, 0.6, 0.35));
  // a tomato in a tyre, attempt number three
  const TM = YARD.tomato, tomato = new THREE.Group();
  S.add(new THREE.TorusGeometry(0.34, 0.12, 8, 18), m.rubber, M(TM.x, 0.1, TM.z, Math.PI / 2, 0, 0), { mode: 'world', scale: 0.5 });
  S.add(new THREE.CircleGeometry(0.3, 16), m.feed, M(TM.x, 0.16, TM.z, -Math.PI / 2, 0, 0), { mode: 'world', scale: 0.5 });
  { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.32, 5), m.leaf); st.position.y = 0.16; st.rotation.z = 0.18; tomato.add(st);
    for (let i = 0; i < 6; i++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), m.leaf); lf.scale.set(0.035, 0.006, 0.05); lf.position.set(Math.cos(i * 2.1) * 0.04, 0.08 + i * 0.04, Math.sin(i * 2.1) * 0.04); lf.rotation.set(-0.5, -i * 2.1, 0); tomato.add(lf); }
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8aa040, roughness: 0.5 })); fruit.position.set(0.04, 0.2, 0.0); tomato.add(fruit); }
  tomato.position.set(TM.x, 0.16, TM.z); tomato.scale.set(1, 0.75, 1); scene.add(tomato); Y.tomato = tomato;
  Y.colliders.push(circC(TM.x, TM.z, 0.42));
  Y.items.push(IT('tomato', 'Tomato plant', () => Y.verb('tomato'), TM.x, 0.3, TM.z, 0.6, 0.4, 0.6));
}

// ---------- the herd: six cows and Rustbucket, built from shared parts and posed every frame ----------
// a cow is long: a capsule from chest to rump, turning with her
function cowCollider(c) {
  const fx = -Math.sin(c.yaw) * 0.95 * c.s, fz = -Math.cos(c.yaw) * 0.95 * c.s, k = c.collider;
  k.ax = c.x + fx; k.az = c.z + fz; k.bx = c.x - fx; k.bz = c.z - fz;
}
function yardHerd(Y) {
  const { mats: m, scene } = Y;
  const body = merged([
    [lumpify(new THREE.SphereGeometry(1, 18, 12), 0.05, 4, 1), M(0, 1.12, 0, 0, 0, 0, 0.62, 0.58, 1.18)],
    [lumpify(new THREE.SphereGeometry(1, 12, 8), 0.06, 5, 2), M(0, 1.42, -0.72, 0, 0, 0, 0.55, 0.5, 0.52)],
    [lumpify(new THREE.SphereGeometry(1, 12, 8), 0.06, 5, 3), M(0, 1.28, 0.78, 0, 0, 0, 0.56, 0.5, 0.55)],
    [new THREE.CylinderGeometry(0.3, 0.42, 0.7, 10), M(0, 1.32, -1.05, -1.15, 0, 0)],
    ...[-0.75, -0.32, 0.1, 0.52, 0.88].map((z, i) => [lumpify(new THREE.SphereGeometry(1, 10, 6), 0.05, 6, i), M(0, 1.62 - Math.abs(z) * 0.08, z, 0.2 - i * 0.08, 0, 0, 0.4, 0.13, 0.32)]),
    ...[-1, 1].flatMap(s => [-0.5, 0.0, 0.5].map((z, i) => [lumpify(new THREE.SphereGeometry(1, 10, 6), 0.04, 6, i + 4), M(s * 0.54, 1.18 + i * 0.03, z, 0, 0, s * 0.35, 0.14, 0.3, 0.36)])),
  ]);
  const head = merged([
    [lumpify(new THREE.BoxGeometry(0.44, 0.42, 0.56, 3, 3, 3), 0.025, 7, 5), M(0, 0.02, -0.3)],
    [lumpify(new THREE.BoxGeometry(0.36, 0.3, 0.32, 2, 2, 2), 0.02, 9, 6), M(0, -0.12, -0.6)],
    [new THREE.SphereGeometry(1, 10, 6), M(0, 0.2, -0.28, 0, 0, 0, 0.26, 0.08, 0.2)],
    [new THREE.BoxGeometry(0.3, 0.1, 0.36), M(0, -0.23, -0.42)],
  ]);
  const leg = merged([
    [new THREE.CylinderGeometry(0.17, 0.13, 0.48, 9), M(0, -0.24, 0)],
    [new THREE.SphereGeometry(0.13, 9, 6), M(0, -0.48, 0)],
    [new THREE.CylinderGeometry(0.105, 0.09, 0.4, 8), M(0, -0.68, 0)],
    [new THREE.CylinderGeometry(0.115, 0.135, 0.1, 9), M(0, -0.9, 0)],
  ]);
  const tail = merged([[new THREE.CylinderGeometry(0.035, 0.05, 0.75, 6), M(0, -0.37, 0)], [new THREE.SphereGeometry(0.075, 6, 5), M(0, -0.76, 0)]]);
  const horn = (() => { const g = new THREE.ConeGeometry(0.075, 0.55, 8, 6); g.translate(0, 0.275, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.55; p.setZ(i, p.getZ(i) - 0.22 * t * t); p.setX(i, p.getX(i) * (1 + 0.1 * Math.sin(t * 20))); } g.computeVertexNormals(); return g; })();
  const ear = new THREE.SphereGeometry(1, 8, 6); ear.scale(0.05, 0.14, 0.09); ear.translate(0, -0.08, 0);
  const eye = new THREE.IcosahedronGeometry(0.048, 0);
  const udder = merged([[new THREE.SphereGeometry(1, 10, 8), M(0, 0, 0, 0, 0, 0, 0.22, 0.14, 0.25)], ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [new THREE.ConeGeometry(0.025, 0.08, 6), M(a * 0.09, -0.15, b * 0.1, Math.PI, 0, 0)])]);
  const vents = merged([-1, 1].flatMap(s => [-0.25, 0.1, 0.45].map(z => [new THREE.BoxGeometry(0.02, 0.2, 0.05), M(s * 0.63, 1.08, z, 0, 0, s * 0.3)])));
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 1 });
  const N = 7;
  const I = {
    body: instanced(body, m.hide, N), head: instanced(head, m.hide, N), leg: instanced(leg, m.hide, N * 4), tail: instanced(tail, m.hide, N),
    horn: instanced(horn, m.horn, N * 2), ear: instanced(ear, m.hide, N * 2), eye: instanced(eye, m.cowEye, N * 2, { cast: false }), udder: instanced(udder, m.hide, N), vents: instanced(vents, ventMat, N, { cast: false }),
  };
  for (const k in I) scene.add(I[k]);
  const P = YARD.pen, SH = YARD.shelter;
  const defs = [
    { id: 'oldgirl', name: 'The old girl', col: 0x9a8a7c, s: 1.0, x: 9.2, z: -0.8, oneEar: true },
    { id: 'duchess', name: 'Duchess', col: 0xa89684, s: 1.04, x: 10.8, z: -1.2 },
    { id: 'slag', name: 'Slag', col: 0x7e746c, s: 0.98, x: 12.4, z: -0.6 },
    { id: 'pebbles', name: 'Pebbles', col: 0xb2a08c, s: 0.94, x: 11.2, z: 0.4 },
    { id: 'clinker', name: 'Clinker', col: 0x8c7a6a, s: 1.0, x: 13.2, z: -1.6 },
    { id: 'marge', name: 'Marge', col: 0x9e8e86, s: 0.96, x: 8.8, z: 1.2 },
    { id: 'rustbucket', name: 'Rustbucket', col: 0x6a2a1e, s: 1.42, x: 12.4, z: 5.2, bull: true },
  ];
  const cows = defs.map((d, i) => ({
    ...d, i, yaw: d.bull ? Math.PI / 2 + 0.3 : rand(-0.6, 0.6) + Math.PI, tx: d.x, tz: d.z, walk: rand(0, TAU), speed: 0, headYaw: 0, headPitch: 0, hy: 0, hp: 0,
    idle: rand(2, 9), mode: 'idle', tail: rand(0, TAU), vent: rand(0, 3), chew: rand(0, TAU), stare: 0, snort: 0, paw: 0, glare: 0, eat: 0,
    item: null, collider: segC(d.x, d.z, d.x, d.z, 0.58 * d.s), homeX: d.x, homeZ: d.z,
  }));
  const tint = new THREE.Color();
  for (const c of cows) {
    tint.setHex(c.col);
    for (const k of ['body', 'head', 'tail', 'udder']) I[k].setColorAt(c.i, tint);
    for (let j = 0; j < 4; j++) I.leg.setColorAt(c.i * 4 + j, tint);
    for (let j = 0; j < 2; j++) I.ear.setColorAt(c.i * 2 + j, tint);
    cowCollider(c); Y.colliders.push(c.collider);
    c.item = IT(c.id, c.name, () => Y.verb('cow', c.id), c.x, 1.2 * c.s, c.z, 1.3 * c.s, 1.6 * c.s, 1.3 * c.s, null, { act: 'cow', cow: c, dyn: true, reach: 3.0 });
    Y.items.push(c.item);
  }
  for (const k of ['body', 'head', 'tail', 'udder', 'leg', 'ear']) I[k].instanceColor.needsUpdate = true;
  Y.herd = { cows, I, bounds: { x0: P.x0 + 0.9, x1: P.x1 - 0.9, z0: P.z0 + 0.9, z1: P.z1 - 0.9 } };
  const rb = cows.find(c => c.bull);
  Y.hitTargets.push(...cows.map(c => ({ id: 'cow', cow: c, get pos() { return _v4.set(c.x, 1.1 * c.s, c.z).clone(); }, r: 0.9 * c.s })));
  Y.rustbucket = rb;
}

function poseHerd(Y, dt, time, ctx) {
  const { cows, I, bounds } = Y.herd, pl = ctx.player, base = new THREE.Matrix4(), part = new THREE.Matrix4(), headM = new THREE.Matrix4(), out = new THREE.Matrix4();
  const fed = Y.state.fed, watered = Y.state.watered, FT = YARD.feedTrough, WT0 = YARD.waterTrough;
  for (const c of cows) {
    // ---- behaviour ----
    const dxp = pl.x - c.x, dzp = pl.z - c.z, dp = Math.hypot(dxp, dzp);
    c.idle -= dt;
    if (c.mode === 'idle' && c.idle <= 0) {
      if (fed && !c.bull && R() < 0.7) { c.tx = FT.x + 0.95; c.tz = rand(FT.z0, FT.z1); c.mode = 'walk'; c.goal = 'eat'; }
      else if (watered && R() < 0.3) { c.tx = WT0.x + 1.0; c.tz = rand(WT0.z0, WT0.z1); c.mode = 'walk'; c.goal = 'drink'; }
      else if (c.bull) { c.tx = rand(11.0, 13.6); c.tz = rand(3.8, 7.4); c.mode = 'walk'; c.goal = 'idle'; }
      else { const shade = R() < 0.6; c.tx = shade ? rand(YARD.shelter.x0 + 0.6, YARD.shelter.x1 - 0.8) : rand(bounds.x0, bounds.x1); c.tz = shade ? rand(YARD.shelter.z0 + 0.8, YARD.shelter.z1 - 0.2) : rand(bounds.z0, bounds.z1); c.mode = 'walk'; c.goal = 'idle'; }
    }
    let want = 0;
    if (c.mode === 'walk') {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      if (d < 0.25) { c.mode = c.goal === 'eat' || c.goal === 'drink' ? c.goal : 'idle'; c.idle = c.mode === 'idle' ? rand(6, 16) : rand(10, 20); }
      else {
        const goalYaw = Math.atan2(-dx, -dz);
        let dy = Math.atan2(Math.sin(goalYaw - c.yaw), Math.cos(goalYaw - c.yaw));
        c.yaw += clamp(dy, -dt * 0.9, dt * 0.9);
        want = Math.abs(dy) < 0.8 ? (c.bull ? 0.45 : 0.55) : 0.1;
      }
    } else if ((c.mode === 'eat' || c.mode === 'drink') && c.idle <= 0) { c.mode = 'idle'; c.idle = rand(4, 10); }
    // keep out of each other's way and out of Jacob's
    let px = 0, pz = 0;
    for (const o of cows) { if (o === c) continue; const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz), min = 1.5 * (c.s + o.s) / 2; if (od < min && od > 0.01) { px += ox / od * (min - od); pz += oz / od * (min - od); } }
    if (dp < 1.9 * c.s && dp > 0.01) { px -= dxp / dp * (1.9 * c.s - dp) * 0.6; pz -= dzp / dp * (1.9 * c.s - dp) * 0.6; }
    c.speed += (want - c.speed) * (1 - Math.exp(-dt * 2));
    c.x += (-Math.sin(c.yaw) * c.speed + px * 0.8) * dt; c.z += (-Math.cos(c.yaw) * c.speed + pz * 0.8) * dt;
    c.x = clamp(c.x, bounds.x0, bounds.x1); c.z = clamp(c.z, bounds.z0, bounds.z1);
    c.walk += dt * c.speed * 3.4;
    // head: graze, eat at the trough, or watch Jacob when he's close and in front
    const toP = Math.atan2(-dxp, -dzp), rel = Math.atan2(Math.sin(toP - c.yaw), Math.cos(toP - c.yaw));
    let gy = Math.sin(time * 0.3 + c.i) * 0.15, gp = 0.05;
    if (c.mode === 'eat' || c.mode === 'drink') { gp = 0.55; gy = Math.sin(time * 0.5 + c.i) * 0.08; }
    else if (dp < 7 && Math.abs(rel) < 1.9) { gy = clamp(rel, -0.75, 0.75); gp = -0.05 - (c.bull ? 0 : 0.05); }
    if (c.glare > 0) { c.glare -= dt; gy = clamp(rel, -0.8, 0.8); gp = -0.25; }
    c.hy += (gy - c.hy) * (1 - Math.exp(-dt * 2.5)); c.hp += (gp - c.hp) * (1 - Math.exp(-dt * 2.5));
    c.chew += dt * (c.mode === 'eat' ? 5 : 2.4);
    c.tail += dt * (1.3 + Math.sin(time * 0.2 + c.i) * 0.6);
    // Rustbucket: smoke from the stump, vents puffing fast, and he does not like being stared at
    if (c.bull) {
      c.snort -= dt; c.paw = Math.max(0, c.paw - dt);
      const lookAt = ctx.camLook && dp < 9 && ctx.camLook(c.x, 1.6 * c.s, c.z, 0.14);
      c.stare = lookAt ? c.stare + dt : Math.max(0, c.stare - dt * 2);
      if (c.stare > 2.4 && c.snort <= 0) { c.snort = 6; c.paw = 1.4; c.stare = 0; Y.emit('snort', c); }
    }
    cowCollider(c);
    moveItem(c.item, c.x - Math.sin(c.yaw) * 0.2, 1.2 * c.s, c.z - Math.cos(c.yaw) * 0.2);
    // ---- pose ----
    const breathe = Math.sin(time * (c.bull ? 2.6 : 1.4) + c.i) * (c.bull ? 0.018 : 0.01);
    const limp = c.bull ? Math.sin(c.walk) * 0.03 : 0;
    TRS(base, c.x, 0, c.z, 0, c.yaw, limp, c.s, c.s, c.s, 'YXZ');
    out.multiplyMatrices(base, TRS(part, 0, breathe * 0.5, 0, 0, 0, 0, 1, 1 + breathe, 1)); I.body.setMatrixAt(c.i, out); I.vents.setMatrixAt(c.i, out);
    out.multiplyMatrices(base, TRS(part, 0, 0.66, 0.35, 0, 0, 0, c.bull ? 0 : 1)); I.udder.setMatrixAt(c.i, out);
    const chewBob = Math.sin(c.chew) * 0.03;
    headM.multiplyMatrices(base, TRS(part, 0, 1.3, -1.18, c.hp + chewBob, c.hy, 0, 1, 1, 1, 'YXZ'));
    I.head.setMatrixAt(c.i, headM);
    for (const [j, s] of [[0, -1], [1, 1]]) {
      const stump = c.bull && j === 0;
      out.multiplyMatrices(headM, TRS(part, s * 0.17, 0.2, -0.16, -0.2, 0, -s * 0.75, 1, stump ? 0.28 : 1, 1)); I.horn.setMatrixAt(c.i * 2 + j, out);
      if (stump) c.stumpAt = (c.stumpAt || new THREE.Vector3()).set(s * 0.17 - s * 0.1, 0.32, -0.16).applyMatrix4(headM);
      const twitch = Math.sin(time * 3 + c.i * 2 + j) > 0.97 ? 0.4 : 0;
      out.multiplyMatrices(headM, TRS(part, s * 0.25, 0.14, -0.1, 0, 0, s * (1.1 + twitch), (c.oneEar && j === 0) ? 0 : 1)); I.ear.setMatrixAt(c.i * 2 + j, out);
      out.multiplyMatrices(headM, TRS(part, s * 0.21, 0.08, -0.4, 0, 0, 0)); I.eye.setMatrixAt(c.i * 2 + j, out);
    }
    c.noseAt = (c.noseAt || new THREE.Vector3()).set(0, -0.12, -0.78).applyMatrix4(headM);
    const legs = [[-0.36, -0.72, 0], [0.36, -0.72, Math.PI], [-0.36, 0.72, Math.PI], [0.36, 0.72, 0]];
    legs.forEach(([lx, lz, ph], j) => {
      let sw = Math.sin(c.walk + ph) * 0.32 * clamp(c.speed / 0.4, 0, 1);
      if (c.bull && j === 0) sw *= 0.6;                                     // favouring his left side
      if (c.bull && j === 1 && c.paw > 0) sw = -0.5 + Math.sin(c.paw * 14) * 0.35;   // pawing at the shale
      out.multiplyMatrices(base, TRS(part, lx, 0.95, lz, sw, 0, 0)); I.leg.setMatrixAt(c.i * 4 + j, out);
    });
    out.multiplyMatrices(base, TRS(part, 0, 1.38, 1.15, 0.25 + Math.sin(c.tail * 2) * 0.12, 0, Math.sin(c.tail) * 0.35)); I.tail.setMatrixAt(c.i, out);
    // steam from the flank vents
    c.vent -= dt;
    if (c.vent <= 0) {
      c.vent = c.bull ? rand(0.8, 1.4) : rand(3, 7);
      for (const s of [-1, 1]) { _v4.set(s * 0.68, 1.1, 0.1).applyMatrix4(base); Y.steam.emit(_v4.x, _v4.y, _v4.z, { vx: s * Math.cos(c.yaw) * 0.5, vy: 0.5, vz: -s * Math.sin(c.yaw) * 0.5, life: rand(1.4, 2.2), size: 0.25 * c.s, size1: 0.9 * c.s, alpha: 0.35, color: [1, 0.97, 0.94], drag: 1.6, spread: 0.2 }); }
    }
    if (c.bull) {
      if (R() < dt * 6) Y.smokeP.emit(c.stumpAt.x, c.stumpAt.y, c.stumpAt.z, { vy: 0.35, life: rand(2, 3), size: 0.12, size1: 0.6, alpha: 0.5, color: [0.25, 0.23, 0.22], drag: 0.8, spread: 0.15 });
      if (c.snort > 5.2) { for (let k = 0; k < 2; k++) { _v4.set(0, 0, -1).applyQuaternion(_q4.setFromRotationMatrix(headM)); Y.steam.emit(c.noseAt.x, c.noseAt.y, c.noseAt.z, { vx: _v4.x * 2.5, vy: -0.2, vz: _v4.z * 2.5, life: 0.9, size: 0.12, size1: 0.6, alpha: 0.6, color: [1, 1, 1], drag: 2.5, spread: 0.3 }); } }
      if (c.paw > 0 && R() < dt * 12) { _v4.set(0.36, 0.05, -0.95).applyMatrix4(base); Y.sparks.emit(_v4.x, _v4.y, _v4.z, { vx: rand(-1, 1), vy: rand(1, 2.5), vz: rand(-1, 1), life: 0.4, size: 0.035, alpha: 1, color: [1, 0.7, 0.3], drag: 1, grav: 7 }); }
    }
  }
  for (const k in I) I[k].instanceMatrix.needsUpdate = true;
}

// ---------- Panic-Fowl in their run ----------
function yardFowl(Y) {
  const { mats: m, scene } = Y, N = 4;
  const body = merged([[new THREE.SphereGeometry(1, 9, 7), M(0, 0.2, 0, 0, 0, 0, 0.12, 0.12, 0.16)], ...[0, 1, 2, 3].map(i => [new THREE.ConeGeometry(0.03, 0.18, 4), M((i - 1.5) * 0.03, 0.3, 0.14, -0.8, 0, (i - 1.5) * 0.25)]), [new THREE.CylinderGeometry(0.008, 0.008, 0.13, 4), M(-0.04, 0.065, 0)], [new THREE.CylinderGeometry(0.008, 0.008, 0.13, 4), M(0.04, 0.065, 0)]]);
  const head = merged([[new THREE.SphereGeometry(0.055, 8, 6), M(0, 0.03, -0.02)]]);
  const beak = merged([[new THREE.ConeGeometry(0.017, 0.055, 5), M(0, 0.02, -0.085, -Math.PI / 2, 0, 0)]]);
  const crest = merged([0, 1, 2, 3, 4].map(i => [new THREE.ConeGeometry(0.012, 0.09, 4), M((i - 2) * 0.012, 0.11, 0.0 + (i - 2) * 0.004, 0.1, 0, (i - 2) * 0.28)]));
  const eye = new THREE.SphereGeometry(0.02, 8, 6);
  const I = { body: instanced(body, m.feather, N), head: instanced(head, m.feather, N), beak: instanced(beak, m.beak, N), crest: instanced(crest, m.crest, N), eye: instanced(eye, m.fowlEye, N * 2, { cast: false }) };
  for (const k in I) { I[k].userData.soft = true; scene.add(I[k]); }
  const RN = YARD.run;
  const birds = Array.from({ length: N }, (_, i) => ({ i, x: rand(RN.x0 + 0.3, RN.x1 - 0.3), z: rand(RN.z0 + 0.3, RN.z1 - 0.3), yaw: rand(0, TAU), wait: rand(0, 1), dart: 0, fx: 0, fz: 0, hy: 0, bob: 0, panic: 0, fluff: 0 }));
  Y.fowl = { birds, I };
  Y.items.push(IT('fowl', 'Panic-Fowl', 'Talk to them', (RN.x0 + RN.x1) / 2, 0.4, (RN.z0 + RN.z1) / 2, RN.x1 - RN.x0, 0.8, RN.z1 - RN.z0, null, { reach: 3.2 }));
}
function poseFowl(Y, dt, time, ctx) {
  const { birds, I } = Y.fowl, RN = YARD.run, base = new THREE.Matrix4(), part = new THREE.Matrix4(), out = new THREE.Matrix4(), headM = new THREE.Matrix4();
  const pl = ctx.player, near = Math.hypot(pl.x - (RN.x0 + RN.x1) / 2, pl.z - (RN.z0 + RN.z1) / 2) < 5;
  if (near && (ctx.sprinting || ctx.swinging)) for (const b of birds) b.panic = Math.max(b.panic, 3);
  for (const b of birds) {
    b.panic = Math.max(0, b.panic - dt); b.fluff += ((Y.raid.warn > 0 ? 1 : 0) + (b.panic > 0 ? 0.5 : 0) - b.fluff) * (1 - Math.exp(-dt * 6));
    b.wait -= dt;
    if (b.dart > 0) {
      b.dart -= dt; const sp = b.panic > 0 ? 3.2 : 1.6;
      b.x += b.fx * sp * dt; b.z += b.fz * sp * dt; b.bob += dt * 30;
      if (b.x < RN.x0 + 0.15 || b.x > RN.x1 - 0.15) b.fx *= -1; if (b.z < RN.z0 + 0.15 || b.z > RN.z1 - 0.15) b.fz *= -1;
      b.x = clamp(b.x, RN.x0 + 0.15, RN.x1 - 0.15); b.z = clamp(b.z, RN.z0 + 0.15, RN.z1 - 0.15);
    } else if (b.wait <= 0) {
      const a = rand(0, TAU); b.fx = Math.cos(a); b.fz = Math.sin(a); b.yaw = Math.atan2(-b.fx, -b.fz);
      b.dart = b.panic > 0 ? rand(0.2, 0.5) : rand(0.08, 0.22); b.wait = b.panic > 0 ? rand(0.05, 0.2) : rand(0.4, 1.8);
      b.hy = rand(-0.8, 0.8);
      if (b.panic > 0 && R() < 0.4) Y.feathers.emit(b.x, 0.25, b.z, { vx: rand(-0.6, 0.6), vy: rand(0.4, 1.2), vz: rand(-0.6, 0.6), life: rand(1.2, 2), size: 0.04, alpha: 0.9, color: [0.7, 0.62, 0.52], drag: 3, grav: 0.4 });
    }
    const hop = b.dart > 0 ? Math.abs(Math.sin(b.bob)) * 0.03 : 0, fl = 1 + b.fluff * 0.18;
    TRS(base, b.x, hop, b.z, 0, b.yaw, 0);
    out.multiplyMatrices(base, TRS(part, 0, 0, 0, 0, 0, 0, fl)); I.body.setMatrixAt(b.i, out);
    headM.multiplyMatrices(base, TRS(part, 0, 0.3, -0.12, Math.sin(time * 9 + b.i) * 0.08, b.hy * (b.dart > 0 ? 0.3 : 1), 0));
    I.head.setMatrixAt(b.i, headM); I.beak.setMatrixAt(b.i, out.multiplyMatrices(headM, part.identity()));
    I.crest.setMatrixAt(b.i, out.multiplyMatrices(headM, TRS(part, 0, 0, 0, 0, 0, 0, 1, 1 + b.fluff * 0.7, 1)));
    for (const [j, s] of [[0, -1], [1, 1]]) I.eye.setMatrixAt(b.i * 2 + j, out.multiplyMatrices(headM, TRS(part, s * 0.042, 0.045, -0.045, 0, 0, 0, 1 + b.fluff * 0.3)));
  }
  for (const k in I) I[k].instanceMatrix.needsUpdate = true;
}

// ---------- gossip-flies: a swarm over the dung bin that follows Jacob round the pen ----------
function yardFlies(Y) {
  const N = 14;
  const geo = (() => { const b = new THREE.SphereGeometry(1, 8, 6).toNonIndexed(); b.scale(0.0065, 0.0055, 0.012); const w1 = new THREE.PlaneGeometry(0.012, 0.007).toNonIndexed(); w1.rotateX(-Math.PI / 2); w1.rotateY(0.5); w1.translate(0.008, 0.004, -0.002); const w2 = new THREE.PlaneGeometry(0.012, 0.007).toNonIndexed(); w2.rotateX(-Math.PI / 2); w2.rotateY(-0.5); w2.translate(-0.008, 0.004, -0.002); return mergeGeos([b, w1, w2]); })();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x0d0d12, roughness: 0.28, metalness: 0.45, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 680], side: THREE.DoubleSide, envMapIntensity: 1.4 });
  const mesh = instanced(geo, mat, N, { cast: false }); mesh.userData.soft = true; Y.scene.add(mesh);
  const flies = Array.from({ length: N }, (_, i) => ({ p: new THREE.Vector3(YARD.bin.x, 1.4, YARD.bin.z), ph: rand(0, 100), r: rand(0.2, 0.7), sp: rand(1.5, 3) }));
  const home = new THREE.Vector3(YARD.bin.x, 1.35, YARD.bin.z);
  Y.flies = { mesh, flies, centre: home.clone(), scatter: 0, home, onJacob: false };
  Y.hitTargets.push({ id: 'flies', get pos() { return Y.flies.centre.clone(); }, r: 0.6 });
}
function poseFlies(Y, dt, time, ctx) {
  const F = Y.flies, P = YARD.pen, pl = ctx.player, d = new THREE.Object3D();
  const inPen = pl.x > P.x0 && pl.x < P.x1 && pl.z > P.z0 && pl.z < P.z1;
  F.scatter = Math.max(0, F.scatter - dt);
  F.onJacob = inPen && F.scatter <= 0;
  const goal = F.onJacob ? _v4.set(pl.x + Math.sin(time * 0.7) * 0.3, 1.7, pl.z + Math.cos(time * 0.6) * 0.3) : F.home;
  F.centre.lerp(goal, 1 - Math.exp(-dt * (F.onJacob ? 1.5 : 0.6)));
  for (let i = 0; i < F.flies.length; i++) {
    const f = F.flies[i], s = F.scatter > 0 ? 3.5 : 1;
    const tx = F.centre.x + Math.sin(time * f.sp + f.ph) * f.r * s, ty = F.centre.y + Math.sin(time * f.sp * 1.3 + f.ph * 2) * 0.25 * s, tz = F.centre.z + Math.cos(time * f.sp * 0.9 + f.ph) * f.r * s;
    f.p.lerp(_v4.set(tx, ty, tz), 1 - Math.exp(-dt * 6));
    d.position.copy(f.p); d.rotation.set(time * 7 + f.ph, time * 5 + f.ph, 0); d.updateMatrix(); F.mesh.setMatrixAt(i, d.matrix);
  }
  F.mesh.instanceMatrix.needsUpdate = true;
}

// ---------- Jaw-Jaws: copper strippers living in the ute, raiding the tractor ----------
function yardJaws(Y) {
  const { mats: m, scene } = Y, N = 4;
  const body = merged([
    [new THREE.SphereGeometry(1, 9, 6), M(0, 0.06, 0.05, 0, 0, 0, 0.09, 0.045, 0.11)],
    [new THREE.SphereGeometry(1, 9, 6), M(0, 0.06, 0.18, 0, 0, 0, 0.08, 0.04, 0.09)],
    [new THREE.SphereGeometry(1, 8, 6), M(0, 0.055, 0.29, 0, 0, 0, 0.06, 0.035, 0.08)],
    ...[-1, 1].flatMap(s => [-0.02, 0.1, 0.22].map((z, k) => [new THREE.CylinderGeometry(0.008, 0.006, 0.13, 4), M(s * 0.1, 0.035, z, 0, 0, s * (1.1 + k * 0.08))])),
  ]);
  const head = (() => { const g = new THREE.BoxGeometry(0.16, 0.05, 0.15, 2, 1, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = (0.075 - p.getZ(i)) / 0.15; p.setY(i, p.getY(i) * (1 - t * 0.7)); p.setX(i, p.getX(i) * (1 - t * 0.25)); } g.computeVertexNormals(); g.translate(0, 0.01, -0.07);
    return merged([[g, M(0, 0, 0)], [new THREE.ConeGeometry(0.012, 0.06, 4), M(-0.045, 0.0, -0.16, -Math.PI / 2, 0, -0.4)], [new THREE.ConeGeometry(0.012, 0.06, 4), M(0.045, 0.0, -0.16, -Math.PI / 2, 0, 0.4)]]); })();
  const I = { body: instanced(body, m.copper, N), head: instanced(head, m.copper, N) };
  I.body.userData.soft = I.head.userData.soft = true;
  scene.add(I.body, I.head);
  const ute = Y.ute.engineAt, tr = Y.tractor;
  const jaws = Array.from({ length: N }, (_, i) => {
    const a = i / N * TAU;
    return { i, hp: 2, state: 'ute', x: ute.x + Math.cos(a) * 0.3, y: ute.y + 0.02, z: ute.z + Math.sin(a) * 0.3, yaw: rand(0, TAU), t: 0, path: null, hurt: 0, chew: rand(0, TAU), sink: 0, home: new THREE.Vector3(ute.x + Math.cos(a) * 0.3, ute.y + 0.02, ute.z + Math.sin(a) * 0.3), hiss: 0 };
  });
  Y.jaws = { I, jaws, tractorAt: tr.wires };
  Y.raid = { timer: 38, warn: 0, started: false, wave: 0 };
  for (const j of jaws) Y.hitTargets.push({ id: 'jaw', jaw: j, get pos() { return _v4.set(j.x, j.y + 0.06, j.z).clone(); }, r: 0.22 });
}
function poseJaws(Y, dt, time, ctx) {
  const { I, jaws } = Y.jaws, R0 = Y.raid, pl = ctx.player, base = new THREE.Matrix4(), part = new THREE.Matrix4(), out = new THREE.Matrix4();
  // the raid clock: the fowl warn first, then a pair heads for the tractor
  const alive = jaws.filter(j => j.state !== 'gone' && j.state !== 'flee');
  if (alive.length) {
    R0.timer -= dt;
    if (R0.timer < 6 && R0.warn <= 0 && !R0.warned) { R0.warn = 6; R0.warned = true; Y.emit('raidWarn'); }
    if (R0.timer <= 0) {
      const ready = alive.filter(j => j.state === 'ute');
      ready.slice(0, 2).forEach((j, k) => { j.state = 'drop'; j.t = k * 0.6; });
      if (ready.length) Y.emit('raidStart');
      R0.timer = 30; R0.warned = false; R0.wave++;
    }
  }
  R0.warn = Math.max(0, R0.warn - dt);
  const tr = Y.jaws.tractorAt;
  for (const j of jaws) {
    j.hurt = Math.max(0, j.hurt - dt); j.chew += dt * 12; j.hiss = Math.max(0, j.hiss - dt);
    const dpl = Math.hypot(pl.x - j.x, pl.z - j.z);
    if (j.state === 'ute' || j.state === 'tractor') {
      // chewing at the wiring, hissing if Jacob gets close
      if (dpl < 2.0 && j.hiss <= 0) { j.hiss = 2.5; Y.emit('hiss', j); }
      j.yaw += Math.sin(time * 2 + j.i) * dt * 0.5;
    } else if (j.state === 'drop' || j.state === 'run' || j.state === 'flee') {
      j.t -= dt;
      if (j.t <= 0) {
        // simple legs: get to the ground, scuttle along it, climb at the far end
        const goal = j.state === 'flee' ? j.fleeTo : (j.state === 'drop' ? _v4.set(j.x, 0, j.z) : _v4.set(tr.x + (j.i % 2 ? 0.25 : -0.25), 0, tr.z + 0.4));
        const dx = goal.x - j.x, dz = goal.z - j.z, dh = Math.hypot(dx, dz);
        if (j.y > 0.01 && (j.state === 'drop' || j.state === 'flee')) j.y = Math.max(0, j.y - dt * 1.5);
        else if (dh > 0.08) {
          const sp = j.state === 'flee' ? 2.6 : 1.3;
          j.yaw = Math.atan2(-dx, -dz); j.x += dx / dh * sp * dt; j.z += dz / dh * sp * dt;
        } else if (j.state === 'drop') j.state = 'run';
        else if (j.state === 'run') { j.y = Math.min(tr.y, j.y + dt * 1.2); if (j.y >= tr.y - 0.01) j.state = 'tractor'; }
        else if (j.state === 'flee') { j.sink += dt * 0.6; if (j.sink > 0.25) { j.state = 'gone'; Y.emit('jawGone', j); } }
      }
    }
    // backs off from Jacob's boots
    if ((j.state === 'run' || j.state === 'tractor' || j.state === 'ute') && dpl < 0.9 && j.y < 0.3 && j.state !== 'ute') { j.x -= (pl.x - j.x) / dpl * dt * 1.2; j.z -= (pl.z - j.z) / dpl * dt * 1.2; }
    const vis = j.state !== 'gone';
    const scur = (j.state === 'run' || j.state === 'drop' || j.state === 'flee') ? Math.sin(time * 40 + j.i) * 0.012 : 0;
    const flinch = j.hurt > 0 ? Math.sin(j.hurt * 40) * 0.2 : 0;
    TRS(base, j.x, j.y - j.sink + Math.abs(scur), j.z, flinch * 0.5, j.yaw + flinch, scur * 4, vis ? 1 : 0);
    I.body.setMatrixAt(j.i, base);
    const bite = (j.state === 'ute' || j.state === 'tractor') ? Math.sin(j.chew) * 0.25 : 0;
    out.multiplyMatrices(base, TRS(part, 0, 0.07, -0.06, 0.15 + bite, 0, 0)); I.head.setMatrixAt(j.i, out);
    if ((j.state === 'tractor' || j.state === 'ute') && R() < dt * 2) Y.sparks.emit(j.x, j.y + 0.05, j.z, { vx: rand(-0.6, 0.6), vy: rand(0.6, 1.4), vz: rand(-0.6, 0.6), life: 0.3, size: 0.025, alpha: 1, color: [0.5, 0.8, 1], drag: 1, grav: 5 });
  }
  I.body.instanceMatrix.needsUpdate = I.head.instanceMatrix.needsUpdate = true;
}

// ---------- the Riot-Devil caught in the fence overnight, drained of its heat ----------
function yardDevil(Y) {
  const { mats: m, scene } = Y, D = YARD.devil, g = new THREE.Group(), B = new Batch();
  B.add(new THREE.SphereGeometry(1, 12, 9), m.fur, M(0, 0.24, 0, 0, 0, 1.25, 0.3, 0.24, 0.48), { mode: 'world', scale: 0.6 });
  B.add(new THREE.SphereGeometry(1, 10, 8), m.fur, M(0.08, 0.2, -0.5, 0.2, 0, 1.2, 0.2, 0.17, 0.2), { mode: 'world', scale: 0.6 });
  B.add(new THREE.SphereGeometry(1, 8, 6), m.fur, M(0.12, 0.17, -0.66, 0.2, 0, 1.2, 0.1, 0.08, 0.13), { mode: 'world', scale: 0.6 });
  for (const s of [-1, 1]) B.add(new THREE.ConeGeometry(0.05, 0.12, 5), m.fur, M(0.0 + s * 0.04, 0.3 + s * 0.06, -0.5, 0, 0, 1.2 + s * 0.6), { mode: 'world', scale: 0.6 });
  for (const [lx, lz, ry] of [[0.18, -0.25, 0.4], [0.24, -0.15, -0.3], [0.18, 0.3, 0.2], [0.25, 0.4, -0.5]]) B.rod(m.fur, lx - 0.1, 0.2, lz, lx + 0.18, 0.25 + ry * 0.2, lz + ry * 0.2, 0.045, 6);
  B.rod(m.fur, -0.05, 0.2, 0.45, -0.1, 0.08, 0.8, 0.035, 6);
  B.build(g);
  g.position.set(D.x, 0, D.z); g.rotation.y = Math.atan2(D.x, D.z) + Math.PI / 2; scene.add(g);
  Y.devil = { group: g, state: 'stuck', t: 0, from: g.position.clone() };
  Y.items.push(IT('devil', 'Riot-Devil', () => Y.verb('devil'), D.x, 0.3, D.z - 0.15, 1.0, 0.6, 1.0, null, { enabled: () => Y.devil.state === 'stuck', reach: 2.6 }));
  Y.hitTargets.push({ id: 'devil', get pos() { return _v4.set(D.x, 0.3, D.z).clone(); }, r: 0.45 });
}

// ---------- the salt-strider on the ridge: there, and then not ----------
function yardStrider(Y) {
  const { mats: m, scene } = Y, g = new THREE.Group(), B = new Batch();
  B.add(new THREE.SphereGeometry(1, 12, 8), m.bone, M(0, 2.4, 0, 0.3, 0, 0, 0.35, 0.45, 0.85), { mode: 'world', scale: 1 });
  B.rod(m.bone, 0, 2.6, -0.6, 0, 3.4, -1.0, 0.12, 8); B.add(new THREE.ConeGeometry(0.16, 0.7, 7), m.bone, M(0, 3.45, -1.3, -1.9, 0, 0), { mode: 'world', scale: 1 });
  B.add(new THREE.ConeGeometry(0.16, 1.4, 7), m.bone, M(0, 2.5, 1.2, 1.9, 0, 0), { mode: 'world', scale: 1 });
  for (const s of [-1, 1]) { B.rod(m.bone, s * 0.25, 2.2, 0.1, s * 0.35, 1.2, -0.35, 0.09, 6); B.rod(m.bone, s * 0.35, 1.2, -0.35, s * 0.3, 0.05, 0.15, 0.06, 6); B.box(m.bone, s * 0.3 - 0.07, 0, -0.1, s * 0.3 + 0.07, 0.06, 0.3); }
  B.build(g); scene.add(g);
  const spots = [[0.56, 64], [0.66, 70], [0.5, 72], [0.72, 61]].map(([a, r]) => { const x = Math.cos(a) * r, z = Math.sin(a) * r; return new THREE.Vector3(x, Y.hill(x, z, r) - 0.2, z); });
  Y.strider = { group: g, spots, at: 0, t: 6, flick: 0, seen: false };
  g.position.copy(spots[0]); g.rotation.y = -2.2;
}

// ---------- the things you can find ----------
function buildFoundModel(kind, m, TY) {
  const g = new THREE.Group(), F = TY.found;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.scale.set(sx, sy, sz); mesh.castShadow = false; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const tex = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, ...o });
  switch (kind) {
    case 'mat': add(new THREE.BoxGeometry(0.62, 0.012, 0.36), [m.hessian, m.hessian, tex(F.mat, { roughness: 1 }), m.hessian, m.hessian, m.hessian], 0, 0.006, 0); break;
    case 'sprinkler': add(new THREE.CylinderGeometry(0.025, 0.028, 0.04, 14), m.brass, 0, 0.02, 0); add(new THREE.CylinderGeometry(0.03, 0.025, 0.012, 14), m.brass, 0, 0.045, 0); add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), m.brass, 0, -0.01, 0); break;
    case 'lens': add(lathe([[0, 0.012], [0.04, 0.009], [0.065, 0.0], [0.07, 0.006]], 24), m.redGlass, 0, 0, 0, 0.1, 0, 0.2); add(new THREE.TorusGeometry(0.07, 0.006, 6, 24, 2.4), m.rubber, 0, 0.004, 0, Math.PI / 2, 0, 0); break;
    case 'key': add(new THREE.TorusGeometry(0.014, 0.004, 6, 16), m.brass, -0.032, 0.004, 0, Math.PI / 2, 0, 0); add(new THREE.BoxGeometry(0.05, 0.004, 0.007), m.brass, 0.005, 0.004, 0); for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.005, 0.004, 0.008), m.brass, 0.016 + i * 0.008, 0.004, 0.007); break;
    case 'card': add(new THREE.BoxGeometry(0.086, 0.0012, 0.054), [m.plastic, m.plastic, tex(F.card, { roughness: 0.35 }), m.plastic, m.plastic, m.plastic], 0, 0.001, 0); break;
    case 'insulator': add(lathe([[0.012, 0], [0.04, 0.0], [0.045, 0.012], [0.03, 0.02], [0.042, 0.032], [0.028, 0.044], [0.034, 0.058], [0.02, 0.07], [0.0, 0.072]], 18), m.ceramic, 0, 0, 0); break;
    case 'candle': add(new THREE.CylinderGeometry(0.0045, 0.005, 0.06, 10), tex(F.candle), 0, 0.005, 0, Math.PI / 2 - 0.1, 0.4, 0); add(new THREE.CylinderGeometry(0.0008, 0.0008, 0.008, 4), m.char, 0.002, 0.005, -0.034, Math.PI / 2, 0.4, 0); break;
    case 'bell': add(new THREE.SphereGeometry(0.03, 16, 8, 0, TAU, 0, Math.PI / 2), m.chrome, 0, 0.012, 0); add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), m.steel, 0, 0.006, 0); add(new THREE.BoxGeometry(0.035, 0.004, 0.006), m.steel, 0.03, 0.02, 0, 0, 0, 0.5); break;
    case 'bulb': add(lathe([[0.0, 0.065], [0.024, 0.06], [0.035, 0.045], [0.034, 0.03], [0.016, 0.01], [0.013, 0.0]], 18), m.clearGlass, 0, 0, 0); add(lathe([[0.013, 0], [0.013, -0.025], [0.008, -0.03]], 12), m.steel, 0, 0, 0); g.rotation.z = Math.PI / 2 - 0.2; g.position.y = 0.0; break;
    case 'thong': { const sh = new THREE.Shape(); sh.moveTo(0, -0.12); sh.bezierCurveTo(0.045, -0.12, 0.05, -0.02, 0.04, 0.05); sh.bezierCurveTo(0.035, 0.12, -0.035, 0.12, -0.04, 0.05); sh.bezierCurveTo(-0.05, -0.02, -0.045, -0.12, 0, -0.12);
      const sole = new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: false }); add(sole, m.plastic, 0, 0.015, 0, Math.PI / 2, 0, 0.3);
      for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.035, 0.004, 4, 10, Math.PI * 0.6), m.plastic, s * 0.01, 0.02, -0.02, Math.PI / 2 + 0.6, 0, s * 0.8 + 0.3); break; }
    case 'tag': add(new THREE.PlaneGeometry(0.035, 0.07), tex(F.tag, { side: THREE.DoubleSide }), 0, 0, 0); break;
    case 'librarycard': add(new THREE.BoxGeometry(0.075, 0.0008, 0.125), [m.paper, m.paper, tex(F.library), m.paper, m.paper, m.paper], 0, 0.001, 0); break;
    case 'compact': add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 20), m.brass, 0, 0.003, 0); { const lid = new THREE.Group(); lid.position.set(0, 0.006, -0.03); lid.rotation.x = -1.9; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 20), m.brass); l.position.z = 0.03; lid.add(l); const mir = new THREE.Mesh(new THREE.CircleGeometry(0.026, 20), m.chrome); mir.rotation.x = Math.PI / 2; mir.position.set(0, -0.003, 0.03); lid.add(mir); g.add(lid); } break;
    case 'ruler': add(new THREE.BoxGeometry(0.31, 0.003, 0.03), [m.wood, m.wood, tex(F.ruler), m.wood, m.wood, m.wood], 0, 0.0015, 0); break;
    case 'horntip': { const hg = new THREE.ConeGeometry(0.035, 0.2, 8, 5); const p = hg.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.2 + 0.5; p.setZ(i, p.getZ(i) - 0.06 * t * t); } hg.computeVertexNormals(); add(hg, m.horn, 0, 0.03, 0, Math.PI / 2, 0, 0.2); break; }
    case 'collar': add(new THREE.TorusGeometry(0.07, 0.008, 4, 24), new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.7 }), 0, 0, 0, 0, 0, 0, 1, 1, 0.4); add(new THREE.BoxGeometry(0.03, 0.025, 0.004), m.brass, 0, -0.075, 0.006); break;
    case 'earcage': add(new THREE.SphereGeometry(0.03, 8, 6, 0, TAU, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0xb0aa9c, metalness: 0.9, roughness: 0.3, wireframe: true }), 0, 0.02, 0); add(new THREE.TorusGeometry(0.03, 0.002, 4, 16), m.chrome, 0, 0.012, 0, Math.PI / 2, 0, 0); break;
    case 'feather': { const fg = new THREE.PlaneGeometry(0.03, 0.14, 1, 6); const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.14 + 0.5; p.setX(i, p.getX(i) * Math.sin(t * Math.PI) * 1.2); p.setZ(i, 0.02 * t * t); } fg.computeVertexNormals(); add(fg, new THREE.MeshStandardMaterial({ color: 0xc4521e, roughness: 0.9, side: THREE.DoubleSide }), 0, 0.005, 0, -Math.PI / 2, 0, 0.6); break; }
    case 'pod': add(lumpify(new THREE.SphereGeometry(1, 10, 8), 0.12, 20, 3), new THREE.MeshStandardMaterial({ color: 0x5a1a14, roughness: 0.8 }), 0, 0.02, 0, 0, 0.5, 0, 0.025, 0.02, 0.05); break;
    case 'page': add(new THREE.PlaneGeometry(0.15, 0.19), tex(F.page, { side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }), 0, 0.12, 0, -0.35, 0, 0.1); break;
    case 'slate': add(new THREE.BoxGeometry(0.07, 0.003, 0.095), [m.stone, m.stone, tex(F.slate, { roughness: 0.5 }), m.stone, m.stone, m.stone], 0, 0.0015, 0); break;
    case 'charm': for (let i = 0; i < 3; i++) { add(new THREE.CylinderGeometry(0.005, 0.005, 0.035, 6), m.bone, -0.02 + i * 0.02, 0.006, 0.0, Math.PI / 2, 0, 0.3 * (i - 1)); add(new THREE.SphereGeometry(0.007, 6, 5), m.bone, -0.02 + i * 0.02, 0.006, 0.018); } add(new THREE.TorusGeometry(0.04, 0.0015, 4, 20), m.hessian, 0, 0.003, 0.03, Math.PI / 2, 0, 0); break;
    case 'comb': add(new THREE.BoxGeometry(0.11, 0.004, 0.02), m.horn, 0, 0.002, -0.012); for (let i = 0; i < 16; i++) if (i !== 5 && i !== 11) add(new THREE.BoxGeometry(0.003, 0.003, 0.03), m.horn, -0.052 + i * 0.007, 0.0015, 0.012); break;
    case 'rivet': add(new THREE.SphereGeometry(0.02, 12, 8, 0, TAU, 0, Math.PI / 2), m.iron, 0, 0.008, 0); add(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 8), m.iron, 0, -0.012, 0); g.rotation.z = 1.2; break;
    case 'stencil': add(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshStandardMaterial({ map: F.stencil, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 }), 0, 0.055, 0, -0.25, 0, 0); break;
    case 'lure': add(new THREE.SphereGeometry(1, 12, 8), tex(F.lure, { roughness: 0.25, metalness: 0.3 }), 0, 0, 0, 0, 0, 0, 0.012, 0.009, 0.035); add(new THREE.TorusGeometry(0.006, 0.0012, 4, 10), m.steel, 0, 0, 0.04, 0, Math.PI / 2, 0); add(new THREE.BoxGeometry(0.012, 0.0015, 0.012), m.chrome, 0, -0.004, -0.04, 0.4, 0, 0); break;
    case 'bit': add(new THREE.OctahedronGeometry(0.03, 0), m.bit, 0, 0.03, 0, 0, 0, 0, 0.6, 1.4, 0.6); add(new THREE.OctahedronGeometry(0.018, 0), m.bit, 0.025, 0.018, 0.01, 0.3, 0, 0.5, 0.6, 1.2, 0.6); break;
  }
  return g;
}

function yardCollectibles(Y) {
  const { mats: m, scene, TY } = Y;
  const SH = YARD.shed, U = YARD.ute, F = YARD.firepit, SP = YARD.stobie, DU = YARD.dunny;
  const uteSeat = new THREE.Vector3(-0.25, 0.86, 0.22).applyAxisAngle(new THREE.Vector3(0, 1, 0), U.yaw).add(new THREE.Vector3(U.x, 0, U.z));
  const where = {
    mat: [-0.875, LIFT + 0.002, -0.88, 0], sprinkler: [5.35, 0.0, -5.15, 0.4], lens: [-8.3, 0.04, 11.0, 0.8], key: [1.2, 0.0, -14.8, 1.2], card: [uteSeat.x, uteSeat.y, uteSeat.z, U.yaw + 0.3],
    insulator: [SP.x + 0.2, 2.55, SP.z, 0], candle: [F.x + 0.36, 0.09, F.z + 0.26, 0.7], bell: [8.3, 0.1, -11.5, 2.0], bulb: [SH.x0 + 1.9, 1.395, SH.z0 + 0.14, 0.4], thong: [-12.9, 0.0, 2.6, 2.2],
    tag: null, librarycard: [YARD.letterbox.x, 1.05, YARD.letterbox.z, 0], compact: [8.0, 0.0, 11.0, 0.8], ruler: [-7.4, 0.0, -5.0, 0.5],
    horntip: [11.3, 0.02, 0.9, 1.3], collar: [8.07, 1.45, 0.5, 0], earcage: [F.x + 1.45, 0.455, F.z - 0.4, 0.2], feather: [-6.2, 0.0, -3.7, 0.9], pod: [5.6, 0.0, 15.2, 0.3], page: [-4.7, 0.0, 4.8, -1.4],
    slate: [-13.0, 0.0, -9.6, 0.6], charm: [-6.4, 0.0, 15.0, 1.1], comb: [0.38, LIFT + 0.49, -0.8, 0.6], rivet: [2.4, 0.0, -15.6, 0], stencil: [3.66, 0.0, -5.95, -Math.PI / 2], lure: [DU.x + 0.32, 1.45, DU.z + 0.55, 0],
  };
  const bits = [[-7.6, 9.2], [12.9, 3.2], [-11.3, -4.7], [10.6, -8.6], [2.9, 11.9], [-15.2, -1.0], [-5.4, -13.6], [6.9, -8.2], [-1.6, 14.6], [-3.5, -6.5]];
  const list = [];
  for (const def of FOUND) {
    if (def.kind === 'bit') continue;
    const model = buildFoundModel(def.model || def.id, m, TY);
    let pos = where[def.id];
    if (def.id === 'tag') {
      // pegged on the pillowcase, out on the rotary line: it moves when the line turns
      const a = 0.4 + 4.9, r = 0.85, yy = 1.95 - (r / 1.45) * 0.17;
      model.position.set(Math.cos(a) * r * 0.92, yy - 0.3, Math.sin(a) * r * 0.92); model.rotation.y = -a + Math.PI / 2;
      Y.clothesline.add(model);
    } else {
      model.position.set(pos[0], pos[1], pos[2]); model.rotation.y += pos[3]; model.userData.soft = true; scene.add(model);
    }
    if (def.id === 'librarycard') model.visible = false;     // it's in the letterbox: you find it by checking the mail
    const it = IT('c:' + def.id, def.name, def.verb || 'Pick up', 0, 0, 0, def.box || 0.36, def.boxY || 0.3, def.box || 0.36, null, { act: 'found', def, model, dyn: def.id === 'tag', enabled: () => !Y.isFound(def.id) && !def.hiddenItem, reach: def.reach || 2.4 });
    const wp = new THREE.Vector3(); model.updateMatrixWorld(true); model.getWorldPosition(wp);
    moveItem(it, wp.x, wp.y + 0.05, wp.z);
    it.glintAt.set(wp.x, wp.y + 0.12, wp.z);
    Y.items.push(it); list.push(it);
  }
  FOUND.filter(d => d.kind === 'bit').forEach((def, k) => {
    const [x, z] = bits[k], model = buildFoundModel('bit', m, TY);
    model.position.set(x, 0.0, z); model.rotation.set(0, rand(0, TAU), rand(-0.3, 0.3)); model.userData.soft = true; scene.add(model);
    const it = IT('c:' + def.id, 'Bit', 'Pick up', x, 0.05, z, 0.32, 0.25, 0.32, [x, 0.12, z], { act: 'found', def, model, enabled: () => !Y.isFound(def.id), reach: 2.4 });
    Y.items.push(it); list.push(it);
  });
  // glints: one draw call for every found thing still lying about
  Y.found = list;
  Y.glints = makeGlints(list.map(it => it.glintAt), Y.T.glint, { size: 0.11, near: 0.5, far: 1.6, strength: 1.1 });
  list.forEach((it, i) => { it.glintIndex = i; });
  scene.add(Y.glints.points);
  // the pillowcase tag swings round with the line: keep its box and glint following it
  const tag = list.find(it => it.def.id === 'tag');
  Y.updaters.push(() => { if (!tag) return; const wp = _v4; tag.model.getWorldPosition(wp); moveItem(tag, wp.x, wp.y, wp.z); Y.glints.move(tag.glintIndex, wp.setY(wp.y + 0.08)); });
}

// ---------- dung piles in the pen: dense spheres of iron slag ----------
function yardDung(Y) {
  const { mats: m, scene } = Y;
  const spots = [[7.4, 5.6], [9.6, 3.4], [11.4, 6.9], [12.8, 1.8], [8.6, 7.6], [10.6, 1.6]];
  Y.dung = spots.map(([x, z], k) => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const s = rand(0.07, 0.11), b = new THREE.Mesh(lumpify(new THREE.IcosahedronGeometry(s, 1), 0.012, 30, i + k), m.dung); b.position.set(rand(-0.12, 0.12), s * 0.8 + (i > 3 ? s : 0), rand(-0.12, 0.12)); b.castShadow = true; g.add(b); }
    g.position.set(x, 0, z); g.userData.soft = true; scene.add(g);
    const it = IT('dung' + k, 'Dung', () => Y.verb('dung'), x, 0.12, z, 0.45, 0.3, 0.45, null, { act: 'dung', k, enabled: () => !Y.state.scooped[k], reach: 2.6 });
    Y.items.push(it);
    return { x, z, group: g, k };
  });
}

// ---------- wrap it all up: the yard as an area ----------
function buildYard(renderer, T, TY) {
  const scene = new THREE.Scene();
  const el = THREE.MathUtils.degToRad(YARD.sunEl), az = THREE.MathUtils.degToRad(YARD.sunAz);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az)).normalize();
  const hazeColor = 0xd8a882;
  scene.background = new THREE.Color(hazeColor);
  scene.fog = new THREE.FogExp2(hazeColor, 0.0085);
  const Y = { scene, T, TY, mats: yardMaterials(T, TY), S: new Batch(), items: [], colliders: [], hitTargets: [], updaters: [], sunDir, hazeColor, state: null, emit: () => {}, verb: () => 'Look', isFound: () => false, owns: () => false };
  Y.steam = new Particles(260, TY.puff, { color: 0xffffff });
  Y.smokeP = new Particles(160, TY.puff, { color: 0xffffff });
  Y.sparks = new Particles(200, TY.spark, { additive: true });
  Y.feathers = new Particles(80, TY.puff, {});
  Y.dust = new Particles(220, TY.puff, {});
  Y.water = new Particles(160, TY.spark, {});
  Y.gold = new Particles(160, TY.spark, { additive: true });
  for (const p of [Y.steam, Y.smokeP, Y.sparks, Y.feathers, Y.dust, Y.water, Y.gold]) scene.add(p.points);
  yardClearance(Y);
  yardGround(Y); yardSky(Y);
  yardHouse(Y); yardWoodpile(Y); yardWater(Y); yardPen(Y); yardCoop(Y); yardShed(Y); yardTractor(Y); yardUte(Y); yardProps(Y); yardTrees(Y);
  yardFence(Y); yardPlants(Y); yardHerd(Y); yardFowl(Y); yardFlies(Y); yardJaws(Y); yardDevil(Y); yardStrider(Y); yardDung(Y); yardFar(Y);
  yardCollectibles(Y);
  Y.S.build(scene);

  // ---------- light: a low, hard sun from the east-north-east, a dusty sky, red bounce ----------
  const hemi = new THREE.HemisphereLight(0xa9b6d6, 0x8a3c1e, 1.05); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b4, 3.4);
  sun.castShadow = true;
  const big = renderer.capabilities.maxTextureSize >= 8192 && !matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 17, bottom: -17, near: 1, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = big ? 0.025 : 0.04;
  sun.position.copy(sunDir).multiplyScalar(45); sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  // environment: warm ground, pale sky, a hot spot where the sun is
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: `varying vec3 vD; uniform vec3 uS; void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(vec3(0.85, 0.66, 0.52), vec3(0.42, 0.5, 0.72), smoothstep(0.0, 0.7, h)) : vec3(0.42, 0.18, 0.09); c += vec3(3.0, 2.4, 1.6) * pow(max(dot(vD, uS), 0.0), 60.0); gl_FragColor = vec4(c, 1.0); }`, uniforms: { uS: { value: sunDir } } })));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose();
  }
  // a sun-glare sprite you only notice when you look east
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: TY.spark, color: 0xfff0d0, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false }));
  glare.scale.setScalar(70); glare.position.copy(sunDir).multiplyScalar(380); glare.renderOrder = 0; scene.add(glare);
  // dust motes adrift in the light around Jacob
  const motes = (() => {
    const n = 360, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([rand(-7, 7), rand(0.2, 3.2), rand(-7, 7)], i * 3); seed[i] = R(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const u = { uTime: YARD_TIME, uCam: { value: new THREE.Vector3() }, uScale: { value: 400 }, ...POSTU };
    const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform float uScale; varying float vA;
        void main(){ vec3 p = position; p.x += uTime * (0.25 + aSeed * 0.2); p.z += sin(uTime * 0.3 + aSeed * 30.0) * 0.4; p.y += sin(uTime * 0.5 + aSeed * 17.0) * 0.15;
          p.xz = mod(p.xz - uCam.xz + 7.0, 14.0) - 7.0 + uCam.xz;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = (0.35 + 0.65 * fract(aSeed * 7.3)) * smoothstep(9.0, 2.0, -mv.z);
          gl_PointSize = max(1.0, 0.012 * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: POST_GLSL + `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(postAdd(vec3(1.0, 0.86, 0.66) * (smoothstep(0.5, 0.0, d) * vA * 0.5)), 1.0); }` });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 4; scene.add(pts);
    return u;
  })();

  // every lit material out here takes the sun-tinted haze instead of flat fog
  scene.traverse((o) => { if (o.material) for (const mm of Array.isArray(o.material) ? o.material : [o.material]) hazeify(mm); });
  const shadow = { dirty: true };
  const bounds = YARD.R - 1.1;     // stop short of the Beggar's Hand hedge: they reach for you before you can touch them
  const hz = YARD.house.z;
  const groundAt = (x, z) => {
    const D = YARD.deck, St = YARD.step;
    if (x > D.x0 && x < D.x1 && z > D.z0 - 0.3 && z < D.z1) return LIFT;
    if (x > St.x0 && x < St.x1 && z >= D.z1 && z < St.z1) return LIFT / 2;
    return 0;
  };
  // an aim test the herd uses to know when Jacob is staring
  const area = {
    id: 'yard', scene, sun, items: Y.items, colliders: Y.colliders, shadow, glints: Y.glints, Y,
    exposure: 1.0, far: 600, footstep: 'dirt', groundAt,
    spawn: { door: { x: (DOOR.x0 + DOOR.x1) / 2, z: -0.6, yaw: Math.PI, pitch: -0.12 }, start: { x: -2.0, z: 8.0, yaw: -0.65, pitch: -0.04 } },
    vmLight: { sky: 0xa9b6d6, ground: 0x8a3c1e, hemi: 0.75, key: 0xffe0b4, keyI: 2.1, keyDir: sunDir.toArray(), fill: 0xff8a50, fillI: 0.15 },
    dustU: { uScale: motes.uScale },
    setDawn() {},
    collide(p, r) {
      const d = Math.hypot(p.x, p.z);
      if (d > bounds) { p.x *= bounds / d; p.z *= bounds / d; }
      for (const c of Y.colliders) pushOut(p, r, c);
    },
    setGlint(it, on) { if (it.glintIndex !== undefined) Y.glints.set(it.glintIndex, on); },
    targets: () => Y.hitTargets,
    update(dt, time, ctx) {
      YARD_TIME.value = time;
      HAZEU.uSunView.value.copy(sunDir).transformDirection(ctx.camera.matrixWorldInverse);
      motes.uCam.value.copy(ctx.camera.position);
      Y.glints.uniforms.uTime.value = time;
      for (const u of Y.updaters) u(dt, time, ctx);
      poseHerd(Y, dt, time, ctx); poseFowl(Y, dt, time, ctx); poseFlies(Y, dt, time, ctx); poseJaws(Y, dt, time, ctx);
      yardTick(Y, dt, time, ctx);
      for (const p of [Y.steam, Y.smokeP, Y.sparks, Y.feathers, Y.dust, Y.water, Y.gold]) p.update(dt, scene);
      glare.material.opacity = 0.35 + 0.25 * clamp(ctx.camera.getWorldDirection(_v4).dot(sunDir), 0, 1) ** 4;
    },
  };
  return area;
}

// per-frame business that isn't an animal: gates, plants that react, hazards, the windmill, the fire
function yardTick(Y, dt, time, ctx) {
  const pl = ctx.player, st = Y.state;
  // pen gate swings toward open or shut
  const G = Y.gate, goal = st.gateOpen ? -1.75 : 0;
  if (Math.abs(goal - G.angle) > 0.001) {
    G.angle += (goal - G.angle) * (1 - Math.exp(-dt * 4)); G.group.rotation.y = G.angle;
    const P = YARD.pen, ax = P.x0, az = P.gate.z0 + 0.04;
    G.collider.ax = ax; G.collider.az = az; G.collider.bx = ax + Math.sin(G.angle) * G.len; G.collider.bz = az + Math.cos(G.angle) * G.len;
    Y.shadowDirty = true;
  }
  // windmill: the fan turns now and then, out of habit; the rotary line drifts round
  const W = Y.windmill; W.spin += (Math.max(0, Math.sin(time * 0.05)) * 1.2 - W.spin) * dt * 0.2; W.fan.rotation.z += W.spin * dt;
  Y.clothesline.rotation.y += dt * 0.06 * (0.6 + 0.4 * Math.sin(time * 0.1));
  // embers breathe
  Y.embers.light.intensity = 0.7 + Math.sin(time * 3.1) * 0.15 + Math.sin(time * 7.7) * 0.1;
  if (R() < dt * 3) Y.smokeP.emit(Y.embers.at.x + rand(-0.15, 0.15), 0.25, Y.embers.at.z + rand(-0.15, 0.15), { vy: 0.4, vx: 0.15, life: rand(3, 5), size: 0.1, size1: 0.8, alpha: 0.25, color: [0.6, 0.58, 0.56], drag: 0.5 });
  if (R() < dt * 1.5) Y.smokeP.emit(Y.barrelAt.x, Y.barrelAt.y, Y.barrelAt.z, { vy: 0.5, vx: 0.2, life: rand(3, 5), size: 0.12, size1: 1.0, alpha: 0.22, color: [0.55, 0.53, 0.5], drag: 0.5 });
  // Truth-Rot glows when somebody lies, then sulks back down
  Y.truthRot.emissiveIntensity = Math.max(0, Y.truthRot.emissiveIntensity - dt * 1.2);
  // the Hemorrhage-Flower: petals open when fed, the bulb beats
  const fl = Y.flower.userData; fl.open += (fl.target - fl.open) * (1 - Math.exp(-dt * 2.2));
  fl.heart.scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(time * 5.5)) ** 8);
  fl.heartMat.emissiveIntensity = 0.15 + fl.open * 2.2;
  fl.petals.forEach((p, i) => { p.rotation.x = fl.open * (1.25 + 0.15 * Math.sin(i * 2.3)); });
  fl.glow.intensity = fl.open * (1.6 + Math.sin(time * 4) * 0.2);
  if (fl.target > 0.5 && R() < dt * 25) Y.gold.emit(Y.flower.position.x + rand(-0.1, 0.1), 1.25, Y.flower.position.z + rand(-0.1, 0.1), { vy: rand(0.1, 0.4), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: rand(1.5, 3), size: 0.03, alpha: 0.9, color: [1, 0.8, 0.4], drag: 0.6 });
  // the tomato perks up a little after a drink
  Y.tomato.scale.y += ((st.tomatoWatered ? 1.0 : 0.75) - Y.tomato.scale.y) * dt * 0.8;
  // trough levels
  Y.feedFill.visible = !!st.fed; Y.troughWater.visible = !!st.watered;
  Y.bin.userData.load.position.y = 0.22 + st.dung / 6 * 0.62;
  Y.tractor.can.visible = st.milked; Y.tractor.strap.visible = st.dung >= 6;
  // Scream-Peas follow Jacob with their eyes; the lids open as he comes close
  const PE = Y.peas, head = _v4.set(pl.x, pl.y + 1.55, pl.z), m4 = new THREE.Matrix4(), mm = new THREE.Matrix4();
  for (const p of PE.list) {
    const dx = head.x - p.x, dy = head.y - p.y, dz = head.z - p.z, d = Math.hypot(dx, dz);
    if (d < 10) { const ty = Math.atan2(dx, dz), tp = -Math.atan2(dy, d); p.yaw += Math.atan2(Math.sin(ty - p.yaw), Math.cos(ty - p.yaw)) * (1 - Math.exp(-dt * 3)); p.pitch += (clamp(tp, -0.9, 0.5) - p.pitch) * (1 - Math.exp(-dt * 3)); }
    p.shut = Math.max(0, p.shut - dt);
    const goalOpen = p.shut > 0 ? 0.0 : d < 3 ? 0.85 : d < 8 ? 0.55 : 0.35 + 0.08 * Math.sin(time * 0.4 + p.phase);
    p.open += (goalOpen - p.open) * (1 - Math.exp(-dt * (p.shut > 0 ? 18 : 3)));
    TRS(m4, p.x, p.y, p.z, p.pitch, p.yaw, 0, 1, 1, 1, 'YXZ');
    PE.bulbs.setMatrixAt(p.idx, m4);
    // two domes over the eye: both cover the front when shut, tip back and down when open
    PE.lidsTop.setMatrixAt(p.idx, mm.multiplyMatrices(m4, TRS(_m4b, 0, 0, 0, Math.PI / 2 - p.open * (Math.PI / 2 + 0.9), 0, 0)));
    PE.lidsBot.setMatrixAt(p.idx, mm.multiplyMatrices(m4, TRS(_m4b, 0, 0, 0, Math.PI / 2 + p.open * (Math.PI / 2 + 0.9), 0, 0)));
  }
  PE.bulbs.instanceMatrix.needsUpdate = PE.lidsTop.instanceMatrix.needsUpdate = PE.lidsBot.instanceMatrix.needsUpdate = true;
  // the Beggar's Hand: heat-seeking fingers snap shut on any ankle that strays close
  const rr = Math.hypot(pl.x, pl.z);
  Y.grabCool = Math.max(0, (Y.grabCool || 0) - dt);
  const HD = Y.hands;
  let near = null, nd = 1e9;
  if (rr > YARD.R - 2.2) for (const h of HD.list) { const d = Math.hypot(h.x - pl.x, h.z - pl.z); if (d < nd) { nd = d; near = h; } }
  if (near && rr > YARD.R - 1.4 && Y.grabCool <= 0 && !ctx.busy) { Y.grabCool = 2.5; near.grab = 1; Y.emit('grab', near); }
  for (const h of HD.list) {
    if (h.grab <= 0) continue;
    h.grab = Math.max(0, h.grab - dt * 0.8);
    const lean = Math.sin(h.grab * Math.PI) * 0.6, toward = Math.atan2(pl.x - h.x, pl.z - h.z);
    _e4.order = 'YXZ'; TRS(m4, h.x, 0, h.z, lean, toward, 0, h.s, h.s * (1 + h.grab * 0.25), h.s, 'YXZ');
    if (h.grab <= 0) m4.copy(h.matrix);
    HD.variants[h.v].setMatrixAt(h.i, m4); HD.variants[h.v].instanceMatrix.needsUpdate = true;
  }
  // Razor-Spinifex lashes at legs that brush it; cut tufts grow back
  for (const t of Y.tufts) {
    t.cool = Math.max(0, t.cool - dt); t.lash = Math.max(0, t.lash - dt * 3);
    if (t.cut > 0) t.cut = Math.max(0, t.cut - dt / 45);
    const d = Math.hypot(t.x - pl.x, t.z - pl.z);
    if (d < 0.42 * t.s && t.cool <= 0 && t.cut < 0.5 && ctx.moving && !ctx.busy) { t.cool = 3; t.lash = 1; Y.emit('lash', t); }
    if (t.lash > 0 || t.cut > 0 || t.dirty) {
      const k = 1 - t.cut * 0.7, toward = Math.atan2(pl.x - t.x, pl.z - t.z), whip = Math.sin(t.lash * 12) * t.lash * 0.5;
      TRS(m4, t.x, 0, t.z, whip, t.lash > 0 ? toward : t.ry, 0, t.s, t.s * k, t.s, 'YXZ'); t.mesh.setMatrixAt(t.i, m4); t.mesh.instanceMatrix.needsUpdate = true;
      t.dirty = t.lash > 0 || t.cut > 0;
    }
  }
  // compass-weed underfoot scrambles which way is which
  for (const w of Y.weeds) {
    if (w.gone && w.mesh.visible && w.pen) {
      // kicked over the pen fence: up, over, gone
      w.flying = (w.flying || 0) + dt / 0.8; const t = Math.min(1, w.flying);
      w.mesh.position.set(w.x - 2.6 * t, Math.sin(t * Math.PI) * 1.5, w.z + 0.4 * t); w.mesh.rotation.x += dt * 9;
      if (t >= 1) w.mesh.visible = false;
      continue;
    }
    if (w.gone) continue;
    w.cool = Math.max(0, w.cool - dt);
    if (Math.hypot(w.x - pl.x, w.z - pl.z) < 0.32 && w.cool <= 0 && !ctx.busy) { w.cool = 12; Y.emit('scramble', w); }
  }
  // the Riot-Devil once it's pried loose: up, over, gone
  const DV = Y.devil;
  if (DV.state === 'toss') {
    DV.t += dt; const t = Math.min(1, DV.t / 1.1), out = DV.from.clone().setLength(YARD.R + 2.5);
    DV.group.position.lerpVectors(DV.from, out, t); DV.group.position.y = Math.sin(t * Math.PI) * 1.3; DV.group.rotation.x += dt * 6;
    if (t >= 1) { DV.state = 'gone'; DV.group.visible = false; }
  }
  // the salt-strider blinks along the ridge
  const SS = Y.strider; SS.t -= dt;
  if (SS.t <= 0) { SS.flick = 0.35; SS.t = rand(9, 16); }
  if (SS.flick > 0) { SS.flick -= dt; SS.group.visible = Math.sin(time * 90) > 0; if (SS.flick <= 0) { SS.at = (SS.at + 1 + Math.floor(R() * 2)) % SS.spots.length; SS.group.position.copy(SS.spots[SS.at]); SS.group.rotation.y = rand(-2.6, -1.6); SS.group.visible = true; } }
  if (!SS.seen && ctx.camLook && ctx.camLook(SS.group.position.x, SS.group.position.y + 2.5, SS.group.position.z, 0.05)) { SS.seen = true; Y.emit('strider'); }
  // the found things turn slowly in the light, bits pulse
  for (const it of Y.found) if (it.def.kind === 'bit' && it.model.visible) it.model.rotation.y += dt * 0.8;
}

// put the yard back the way it is at dawn (the collection stays as it is)
function resetYardWorld(Y) {
  for (const d of Y.dung) { d.group.visible = true; d.group.position.set(d.x, 0, d.z); }
  for (const w of Y.weeds) { w.gone = false; w.flying = 0; w.mesh.visible = true; w.mesh.position.set(w.x, 0, w.z); w.mesh.rotation.x = 0; }
  for (const b of Y.saltbush) { b.picked = false; b.berries.visible = true; }
  for (const t of Y.tufts) { t.cut = 0; t.lash = 0; t.dirty = true; }
  Y.shovel.visible = true; Y.crowbar.visible = true; Y.bucket.visible = true; Y.pail.visible = true;
  Y.gate.angle = 0.0001; Y.gate.group.rotation.y = 0;
  const DV = Y.devil; DV.state = 'stuck'; DV.t = 0; DV.group.visible = true; DV.group.position.copy(DV.from); DV.group.rotation.x = 0;
  Y.flower.userData.target = 0; Y.flower.userData.open = 0;
  Y.tomato.scale.y = 0.75;
  const ute = Y.ute.engineAt;
  Y.jaws.jaws.forEach((j, i) => { const a = i / 4 * TAU; Object.assign(j, { hp: 2, state: 'ute', x: ute.x + Math.cos(a) * 0.3, y: ute.y + 0.02, z: ute.z + Math.sin(a) * 0.3, t: 0, sink: 0, hurt: 0 }); });
  Object.assign(Y.raid, { timer: 38, warn: 0, warned: false, wave: 0 });
  Y.flies.scatter = 0;
  for (const c of Y.herd.cows) { c.x = c.homeX ?? c.x; c.z = c.homeZ ?? c.z; cowCollider(c); c.mode = 'idle'; c.idle = rand(2, 9); }
}
// ============================================================
// Jacob himself: tan work pants and heavy buckled boots you see
// when you look down, a shadow-only stand-in for the rest of him
// (duster, arms, head), and the pale clawed hand that holds things.
// ============================================================
const LEG = { thigh: 0.45, shin: 0.43, ankle: 0.1, spread: 0.1, back: 0.18 };
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

function buildBody(TB) {
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

// ---------- the view model: Jacob's hand and whatever's in it, drawn over the scene ----------
function buildViewModel(TB, T) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.0);
  const key = new THREE.DirectionalLight(0xffffff, 2.0), fill = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(hemi, key, key.target, fill, fill.target);
  const mat = {
    skin: new THREE.MeshStandardMaterial({ map: TB.skin, roughness: 0.55, metalness: 0.0, color: 0xbcbec4, vertexColors: true, envMapIntensity: 0.4 }),
    nail: new THREE.MeshStandardMaterial({ color: 0x3e2218, roughness: 0.34, metalness: 0.1, envMapIntensity: 0.6 }),
    sleeve: new THREE.MeshStandardMaterial({ map: T.canvas, color: 0x8a6e50, roughness: 0.96, side: THREE.DoubleSide, envMapIntensity: 0.4 }),
    rebar: new THREE.MeshStandardMaterial({ map: TB.rebar, roughness: 0.5, metalness: 0.75 }),
    point: new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.22, metalness: 1.0 }),
    cord: new THREE.MeshStandardMaterial({ map: T.hessian, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.38, metalness: 0.9, side: THREE.DoubleSide }),
    crowbar: new THREE.MeshStandardMaterial({ color: 0x7c2a1c, roughness: 0.6, metalness: 0.55 }),
    galv: new THREE.MeshStandardMaterial({ color: 0xbdb9b0, roughness: 0.42, metalness: 0.8, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({ color: 0x29362e, roughness: 0.05, metalness: 0.3 }),
    milk: new THREE.MeshStandardMaterial({ color: 0xbfc0c4, roughness: 0.2, metalness: 0.55, emissive: 0x202428 }),
    feed: new THREE.MeshStandardMaterial({ color: 0x8a7464, roughness: 0.9, flatShading: true }),
    dung: new THREE.MeshStandardMaterial({ color: 0x3a2b24, roughness: 0.6, metalness: 0.4, flatShading: true }),
    blood: new THREE.MeshStandardMaterial({ color: 0x3a0606, roughness: 0.3 }),
  };
  const B = (parent, list) => { const b = new Batch(); for (const [g, m, mx] of list) b.add(g, m, mx, { mode: 'keep' }); for (const mm of b.build(parent, { cast: false, receive: false })) mm.frustumCulled = false; };
  // ---------- Jacob's hand ----------
  // Chapter one: "a hand as pale as marble, without an ounce of softness", the nails "thick, almost claw-like,
  // stained permanently with red dust and engine grease". Built round a handle on the z axis (the tool points
  // down -z): back of the hand facing +x, knuckles over the top, fingertips tucked underneath, the thumb laid
  // along the top of the handle like a knife grip, wrist and forearm running down and back from the heel.
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z), I4 = new THREE.Matrix4();
  function basis(a, d, side) {                          // y along d, x towards side, placed at a
    const y = d.clone().normalize(), x = (side ? side.clone() : (Math.abs(y.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)).cross(y));
    x.addScaledVector(y, -x.dot(y)).normalize();
    return new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)).setPosition(a);
  }
  // a rod with rounded ends from a to b, r0 → r1; sx/sz flatten the section (x towards side)
  function bone(a, b, r0, r1 = r0, { side = null, sx = 1, sz = 1, rad = 12 } = {}) {
    const len = a.distanceTo(b), pts = [];
    for (let i = 0; i <= 4; i++) { const t = -Math.PI / 2 + (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-5, Math.cos(t) * r0), Math.sin(t) * r0)); }
    for (let i = 0; i <= 4; i++) { const t = (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-5, Math.cos(t) * r1), len + Math.sin(t) * r1)); }
    const g = new THREE.LatheGeometry(pts, rad);
    if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
    g.applyMatrix4(basis(a, b.clone().sub(a), side));
    return g;
  }
  // a box with rounded edges and true normals, for the back of the hand
  function roundBox(hx, hy, hz, r, seg = 6) {
    const g = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2, seg, seg * 2, seg), p = g.attributes.position, n = g.attributes.normal, v = v3(0, 0, 0), c = v3(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(clamp(v.x, -hx + r, hx - r), clamp(v.y, -hy + r, hy - r), clamp(v.z, -hz + r, hz - r));
      v.sub(c).normalize();
      p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); n.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  // average the normals of vertices that sit on top of each other, so split faces shade as one surface
  function weldNormals(g) {
    const p = g.attributes.position, n = g.attributes.normal, groups = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
      let a = groups.get(key); if (!a) groups.set(key, a = { x: 0, y: 0, z: 0, ids: [] });
      a.x += n.getX(i); a.y += n.getY(i); a.z += n.getZ(i); a.ids.push(i);
    }
    for (const a of groups.values()) { const l = Math.hypot(a.x, a.y, a.z) || 1; for (const i of a.ids) n.setXYZ(i, a.x / l, a.y / l, a.z / l); }
  }
  // a thick, curved, slightly pointed nail: width w, length l (towards +z), thickness t
  function nailGeo(w, l, t) {
    const g = new THREE.SphereGeometry(1, 12, 8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const f = Math.max(0, z);
      x *= 1 - 0.38 * f * f; y = y * (1 - 0.3 * f) - 0.5 * x * x;
      p.setXYZ(i, x * w / 2, y * t / 2, z * l / 2);
    }
    g.computeVertexNormals(); return g;
  }
  // skin tints by position: pink over the knuckles, red dust and grease worked into fingertips and creases
  function tint(g, spots) {
    const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), v = v3(0, 0, 0), ao = g.userData.ao;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); let r = 1, gg = 1, b = 1;
      for (const s of spots) {
        const w = smooth(s.r, s.r * 0.35, v.distanceTo(s.p)) * s.k;
        r += (s.c[0] - r) * w; gg += (s.c[1] - gg) * w; b += (s.c[2] - b) * w;
      }
      if (ao) {   // the sides of a finger that face its neighbours sit in shadow
        const nz = n.getZ(i), w = (ao.pz && nz > 0 ? smooth(0.2, 0.85, nz) : 0) + (ao.nz && nz < 0 ? smooth(0.2, 0.85, -nz) : 0), k = 1 - 0.42 * w;
        r *= k; gg *= k * 0.96; b *= k * 0.94;
      }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  const KNUCKLE = [1, 0.74, 0.7], DUST = [0.7, 0.42, 0.32], CREASE = [0.8, 0.64, 0.6];
  function fist(rh, { sleeve = true, right = true, fore = [0.2, -0.6, 0.78] } = {}) {
    const g = new THREE.Group(), skin = [], L = [], spots = [];
    const zs = [-0.029, -0.0094, 0.0097, 0.0278], rs = [0.0099, 0.0103, 0.0097, 0.0085], fl = [0.95, 1, 0.96, 0.8], a0s = [0.62, 0.66, 0.62, 0.5];
    const PH = [0.041, 0.026, 0.02];
    const at = (a, rho, z) => v3(Math.cos(a) * rho, Math.sin(a) * rho, z);
    zs.forEach((z, i) => {
      const r = rs[i];
      // walk the joints round the handle: knuckle proud on top of the palm, each bone a straight chord
      const rho = [rh + r + 0.0105, rh + r + 0.0045, rh + r + 0.0035, rh + r * 0.82];
      const ang = [a0s[i]];
      for (let k = 0; k < 3; k++) {
        const L2 = PH[k] * fl[i], c = (rho[k] ** 2 + rho[k + 1] ** 2 - L2 * L2) / (2 * rho[k] * rho[k + 1]);
        ang.push(ang[k] + Math.acos(clamp(c, -1, 1)));
      }
      const P = ang.map((a, k) => at(a, rho[k], z));
      const fingerAO = { pz: i < 3, nz: i > 0 };
      for (const b of [bone(P[0], P[1], r * 1.02, r * 0.95), bone(P[1], P[2], r * 0.95, r * 0.9), bone(P[2], P[3], r * 0.88, r * 0.8)]) { b.userData.ao = fingerAO; skin.push(b); }
      { const k = new THREE.SphereGeometry(r * 1.22, 10, 8); k.translate(P[0].x, P[0].y, P[0].z); k.userData.ao = fingerAO; skin.push(k); }
      spots.push({ p: at(ang[0], rho[0] + r * 0.8, z), r: r * 1.5, c: KNUCKLE, k: 0.9 }, { p: at(ang[1], rho[1] + r * 0.8, z), r: r * 1.2, c: KNUCKLE, k: 0.6 },
        { p: P[3], r: r * 1.6, c: DUST, k: 1 }, { p: at(ang[2], rho[2] - r * 0.6, z), r: r * 1.2, c: CREASE, k: 0.8 }, { p: at(ang[1], rho[1] - r * 0.7, z), r: r * 1.1, c: CREASE, k: 0.7 });
      // the nail on the back of the fingertip, running a little past it
      const along = P[3].clone().sub(P[2]).normalize(), out = v3(P[3].x, P[3].y, 0).normalize(), across = new THREE.Vector3().crossVectors(out, along);
      L.push([nailGeo(r * 1.25, r * 1.9, r * 0.5), mat.nail, new THREE.Matrix4().makeBasis(across, out, along).setPosition(P[3].clone().addScaledVector(out, r * 0.62).addScaledVector(along, r * 0.15))]);
    });
    // back of the hand: a rounded slab beside the handle, domed and narrowing to the wrist
    {
      const hx = 0.0145, hy = 0.043, hz = 0.042, bh = roundBox(hx, hy, hz, 0.0125), p = bh.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = clamp((hy - y) / (2 * hy), 0, 1);
        p.setXYZ(i, x + (x > 0 ? 0.0065 : 0.0015) * (1 - (z / hz) ** 2) - 0.005 * t * t, y, z * (1 - 0.28 * t * t) + 0.004 * t);
      }
      bh.computeVertexNormals(); weldNormals(bh);
      bh.applyMatrix4(M(rh + 0.0165, -0.0215, 0.001, 0, 0, 0.1));
      skin.push(bh);
    }
    // the heel of the palm cupping the handle from below, and the pad under the little finger
    { const s = new THREE.SphereGeometry(1, 14, 10); s.applyMatrix4(M(rh * 0.45, -rh - 0.0075, 0.006, 0, 0, 0.3, 0.019, 0.0115, 0.034)); skin.push(s); }
    // thumb: a fleshy base inside the palm, then laid forward along the top of the handle
    const T0 = v3(rh + 0.014, -0.034, -0.02), T1 = v3(rh + 0.0055, rh * 0.5 - 0.001, -0.046), T2 = v3(rh * 0.3, rh + 0.0105, -0.066), T3 = v3(-0.0005, rh + 0.0098, -0.0845);
    skin.push(bone(T0, T1, 0.0165, 0.0118), bone(T1, T2, 0.0112, 0.0102), bone(T2, T3, 0.0098, 0.0088));
    { const k = new THREE.SphereGeometry(0.0112, 10, 8); k.translate(T2.x, T2.y, T2.z); skin.push(k); }
    spots.push({ p: T3, r: 0.016, c: DUST, k: 0.8 }, { p: T2.clone().add(v3(0, 0.006, 0)), r: 0.012, c: KNUCKLE, k: 0.5 });
    {
      const along = T3.clone().sub(T2).normalize(), out = v3(0.15, 1, 0).normalize(), across = new THREE.Vector3().crossVectors(out, along);
      L.push([nailGeo(0.0128, 0.0195, 0.0048), mat.nail, new THREE.Matrix4().makeBasis(across, out, along).setPosition(T3.clone().addScaledVector(out, 0.0068).addScaledVector(along, 0.0005))]);
    }
    // wrist and forearm, running down and back towards the elbow
    const W = v3(rh + 0.0165, -0.066, 0.004), F = v3(...fore).normalize();
    skin.push(bone(W.clone().addScaledVector(F, -0.012), W.clone().addScaledVector(F, 0.16), 0.024, 0.031, { side: v3(1, 0, 0), sx: 0.78, sz: 1.12 }));
    spots.push({ p: W.clone().addScaledVector(F, 0.06), r: 0.05, c: CREASE, k: 0.55 });
    for (const s of skin) L.push([tint(s, spots), mat.skin, I4]);
    if (sleeve) {   // the duster's canvas sleeve and its cuff
      const S0 = W.clone().addScaledVector(F, 0.05);
      const sl = new THREE.CylinderGeometry(0.057, 0.045, 0.42, 14, 1, true); sl.translate(0, 0.21, 0);
      L.push([sl, mat.sleeve, basis(S0, F, v3(1, 0, 0))]);
      const cuff = new THREE.TorusGeometry(0.046, 0.0075, 6, 18); cuff.rotateX(Math.PI / 2);
      L.push([cuff, mat.sleeve, basis(S0, F, v3(1, 0, 0))]);
    }
    B(g, L);
    if (right) g.scale.x = -1;            // built as a left hand; the mirror makes it his right
    return g;
  }
  const rig = new THREE.Group(); scene.add(rig);
  const right = new THREE.Group(), left = new THREE.Group(); rig.add(right, left);
  const tools = {};
  // the rebar knife: deformed bar ground to a needle at one end, cord wrapped for a grip
  tools.rebar = (() => { const g = new THREE.Group(); g.add(fist(0.0135));
    const t = new THREE.Group(); B(t, [
      [new THREE.CylinderGeometry(0.0078, 0.0078, 0.27, 8), mat.rebar, M(0, 0, -0.165, -Math.PI / 2, 0, 0)],
      [new THREE.ConeGeometry(0.0078, 0.07, 8), mat.point, M(0, 0, -0.335, -Math.PI / 2, 0, 0)],
      [new THREE.CylinderGeometry(0.0135, 0.0135, 0.09, 10), mat.cord, M(0, 0, 0.0, Math.PI / 2, 0, 0)],
      [new THREE.CylinderGeometry(0.0078, 0.0078, 0.026, 8), mat.rebar, M(0, 0, 0.056, Math.PI / 2, 0, 0)],
    ]); g.add(t); return g; })();
  tools.shovel = (() => { const g = new THREE.Group(); g.add(fist(0.017));
    const t = new THREE.Group(); B(t, [
      [new THREE.CylinderGeometry(0.017, 0.017, 1.1, 10), mat.wood, M(0, 0, -0.2, -Math.PI / 2, 0, 0)],
      [new THREE.CylinderGeometry(0.02, 0.026, 0.12, 10), mat.steel, M(0, 0, -0.78, -Math.PI / 2, 0, 0)],
      [(() => { const g = new THREE.PlaneGeometry(0.24, 0.3, 8, 4), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, 0.05 * (x / 0.12) ** 2); } g.computeVertexNormals(); return g; })(), mat.steel, M(0, -0.012, -0.93, -Math.PI / 2 - 0.2, 0, 0)],
    ]); g.add(t);
    const loads = { feed: new THREE.Group(), dung: new THREE.Group() };
    for (let i = 0; i < 12; i++) loads.feed.add(Object.assign(new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.025, 0.045), 0), R() < 0.3 ? mat.steel : mat.feed), { frustumCulled: false }));
    loads.feed.children.forEach((c, i) => c.position.set(rand(-0.08, 0.08), rand(0.02, 0.07), -0.98 + rand(-0.09, 0.08)));
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.045, 0.07), 1), mat.dung); b.frustumCulled = false; b.position.set(rand(-0.06, 0.06), rand(0.04, 0.09) + (i > 3 ? 0.05 : 0), -0.98 + rand(-0.07, 0.06)); loads.dung.add(b); }
    for (const k in loads) { loads[k].visible = false; g.add(loads[k]); }
    g.userData.loads = loads; return g; })();
  tools.crowbar = (() => { const g = new THREE.Group(); g.add(fist(0.012));
    const t = new THREE.Group(); B(t, [
      [new THREE.CylinderGeometry(0.0115, 0.0115, 0.62, 6), mat.crowbar, M(0, 0, -0.2, -Math.PI / 2, 0, 0)],
      [new THREE.TorusGeometry(0.045, 0.0115, 6, 10, Math.PI * 0.85), mat.crowbar, M(0, 0.045, -0.51, 0, Math.PI / 2, Math.PI)],
      [new THREE.BoxGeometry(0.02, 0.006, 0.04), mat.crowbar, M(0, 0.1, -0.5, 0.4, 0, 0)],
    ]); g.add(t); return g; })();
  for (const k in tools) { tools[k].visible = false; right.add(tools[k]); }
  // the left hand carries the bucket or the milk pail by the bail
  const carry = {};
  const pailGroup = (r0, r1, h, liquid) => {
    // his left hand hooked over the bail, back of the hand forward, wrist cocked, forearm running back towards him
    const g = new THREE.Group(); const f = fist(0.006, { right: false, fore: [-0.82, 0.5, 0.3] });
    f.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(0, 0.34, -0.94), v3(0, -0.94, -0.34), v3(-1, 0, 0))); g.add(f);
    // the bucket tips about its own middle when he pours, so his arm stays where it is
    const pivot = new THREE.Group(); pivot.position.y = -(h / 2 + 0.012 + r1); g.add(pivot);
    const b = new THREE.Group(); b.position.y = -h / 2;
    B(b, [[lathe([[r0, 0], [r1, h], [r1 + 0.005, h + 0.01]], 22), mat.galv, M(0, 0, 0)], [new THREE.CircleGeometry(r0, 20), mat.galv, M(0, 0.004, 0, -Math.PI / 2, 0, 0)], [new THREE.TorusGeometry(r1 + 0.004, 0.004, 4, 18, Math.PI), mat.steel, M(0, h + 0.01, 0, 0, 0, 0)]]);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(r1 - 0.012, 20), liquid); surf.rotation.x = -Math.PI / 2; surf.position.y = h * 0.72; surf.frustumCulled = false; surf.visible = false; b.add(surf);
    pivot.add(b); g.userData = { body: b, surf, pivot }; return g;
  };
  carry.bucket = pailGroup(0.1, 0.136, 0.28, mat.water);
  carry.pail = pailGroup(0.09, 0.122, 0.25, mat.milk);
  for (const k in carry) { carry[k].visible = false; left.add(carry[k]); }
  const hand = fist(0.012, { right: false }); hand.visible = false; left.add(hand);        // an empty left hand, for reaching for things
  // ---------- rest poses (fractions of the view so they sit right on any screen) and animations ----------
  const REST = {
    rebar: { f: [0.6, -0.6, -0.42], r: [0.3, 0.25, 0.9] },
    shovel: { f: [0.5, -0.62, -0.44], r: [-0.12, 0.42, 0.6] },
    crowbar: { f: [0.6, -0.62, -0.42], r: [0.3, 0.2, 0.9] },
    carry: { f: [-0.55, -0.3, -0.5], r: [0.12, -0.2, 0.05] },
    reach: { f: [-0.3, -0.55, -0.42], r: [0.3, -0.25, -0.9] },
  };
  const ANIM = {
    // [t, dx, dy, dz, drx, dry, drz]
    'rebar:swing': { dur: 0.42, keys: [[0, 0, 0, 0, 0, 0, 0], [0.09, 0.03, 0.025, 0.07, -0.3, 0.06, 0.05], [0.17, -0.09, 0.07, -0.25, 0.14, 0.16, 0.12], [0.24, -0.08, 0.06, -0.22, 0.1, 0.14, 0.1], [0.42, 0, 0, 0, 0, 0, 0]] },
    'shovel:swing': { dur: 0.88, keys: [[0, 0, 0, 0, 0, 0, 0], [0.26, 0.16, 0.16, 0.06, 0.25, -0.95, -0.55], [0.36, -0.06, 0.06, -0.14, 0.12, 0.25, 0.25], [0.46, -0.3, -0.04, -0.12, 0.05, 0.95, 0.6], [0.88, 0, 0, 0, 0, 0, 0]] },
    'crowbar:swing': { dur: 0.62, keys: [[0, 0, 0, 0, 0, 0, 0], [0.2, 0.0, 0.2, 0.08, -1.0, 0.0, 0.0], [0.3, -0.04, -0.07, -0.18, 0.55, 0.05, 0.0], [0.4, -0.04, -0.08, -0.17, 0.5, 0.05, 0.0], [0.62, 0, 0, 0, 0, 0, 0]] },
    'shovel:scoop': { dur: 0.75, keys: [[0, 0, 0, 0, 0, 0, 0], [0.25, -0.06, -0.14, -0.16, -0.55, 0.05, 0], [0.5, -0.02, 0.07, -0.06, 0.38, 0, 0], [0.75, 0, 0.02, 0, 0.12, 0, 0]] },
    'shovel:dump': { dur: 0.7, keys: [[0, 0, 0.02, 0, 0.12, 0, 0], [0.3, -0.06, 0.11, -0.16, 0.25, 0.05, 1.2], [0.45, -0.06, 0.1, -0.16, 0.0, 0.05, 1.5], [0.7, 0, 0, 0, 0, 0, 0]] },
    'shovel:dig': { dur: 0.9, keys: [[0, 0, 0, 0, 0, 0, 0], [0.3, -0.04, -0.2, -0.2, -0.7, 0, 0], [0.55, -0.03, -0.16, -0.18, -0.25, 0, 0], [0.9, 0, 0, 0, 0, 0, 0]] },
    'crowbar:pry': { dur: 1.3, keys: [[0, 0, 0, 0, 0, 0, 0], [0.3, -0.06, -0.2, -0.22, -0.7, 0.1, 0], [0.7, -0.05, -0.12, -0.2, -0.2, 0.1, 0], [0.8, -0.05, -0.15, -0.2, -0.32, 0.1, 0.05], [0.95, -0.04, -0.06, -0.18, 0.1, 0.1, 0], [1.3, 0, 0, 0, 0, 0, 0]] },
    'rebar:nick': { dur: 1.0, keys: [[0, 0, 0, 0, 0, 0, 0], [0.3, -0.2, 0.08, 0.05, 0.2, 0.9, 0.4], [0.6, -0.21, 0.08, 0.05, 0.25, 0.95, 0.4], [1.0, 0, 0, 0, 0, 0, 0]] },
    // an eighth number, where there is one, tips the bucket forward on its own
    'carry:pour': { dur: 1.5, keys: [[0, 0, 0, 0, 0, 0, 0, 0], [0.4, 0.22, 0.2, -0.12, 0.08, 0, -0.08, -0.35], [0.75, 0.24, 0.22, -0.16, 0.1, 0, -0.12, -1.3], [1.15, 0.24, 0.22, -0.16, 0.1, 0, -0.12, -1.4], [1.5, 0, 0, 0, 0, 0, 0, 0]] },
    'carry:fill': { dur: 1.7, keys: [[0, 0, 0, 0, 0, 0, 0], [0.35, 0.18, 0.05, -0.18, 0.05, 0, 0], [1.3, 0.18, 0.04, -0.18, 0.05, 0, 0], [1.7, 0, 0, 0, 0, 0, 0]] },
    'carry:milk': { dur: 3.2, keys: [[0, 0, 0, 0, 0, 0, 0], [0.4, 0.25, -0.05, -0.12, 0.25, 0, 0], [2.8, 0.25, -0.05, -0.12, 0.25, 0, 0], [3.2, 0, 0, 0, 0, 0, 0]] },
    'reach:take': { dur: 0.55, keys: [[0, -0.1, -0.25, 0.1, 0.4, 0, 0], [0.25, 0.0, 0.0, -0.14, 0.0, 0, 0], [0.55, -0.1, -0.25, 0.1, 0.4, 0, 0]] },
  };
  const st = { tool: null, carry: null, anims: { right: null, left: null }, bob: 0, lagX: 0, lagY: 0, lastYaw: 0, lastPitch: 0, lower: 0, swap: 0, swapTo: undefined, sprint: 0 };
  const off = new THREE.Vector3(), rot = new THREE.Euler();
  function sample(a, t, o, r) {
    const k = a.keys; let j = 0; while (j < k.length - 2 && t > k[j + 1][0]) j++;
    const [t0, ...A] = k[j], [t1, ...Bk] = k[j + 1], u = smooth(0, 1, (t - t0) / Math.max(1e-4, t1 - t0));
    o.set(A[0] + (Bk[0] - A[0]) * u, A[1] + (Bk[1] - A[1]) * u, A[2] + (Bk[2] - A[2]) * u);
    r.set(A[3] + (Bk[3] - A[3]) * u, A[4] + (Bk[4] - A[4]) * u, A[5] + (Bk[5] - A[5]) * u);
    return (A[6] || 0) + ((Bk[6] || 0) - (A[6] || 0)) * u;
  }
  function place(group, rest, anim, extra) {
    const z = rest.f[2], hh = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * -z, hw = hh * camera.aspect;
    off.set(0, 0, 0); rot.set(0, 0, 0); let tip = 0;
    if (anim) tip = sample(ANIM[anim.name], anim.t, off, rot);
    group.position.set(rest.f[0] * hw + off.x + extra.x, rest.f[1] * hh + off.y + extra.y, z + off.z + extra.z);
    group.rotation.set(rest.r[0] + rot.x + extra.rx, rest.r[1] + rot.y, rest.r[2] + rot.z);
    return tip;
  }
  const tmpQ = new THREE.Quaternion(), up = new THREE.Vector3();
  return {
    scene, camera, tools, carry, st, mat, REST,
    setTool(name, instant = false) {
      if (st.tool === name && st.swapTo === undefined) return;
      if (instant || !st.tool) { for (const k in tools) tools[k].visible = k === name; st.tool = name; st.swapTo = undefined; st.swap = 0; return; }
      st.swapTo = name; st.swap = 0.001;
    },
    setLoad(kind) { const L = tools.shovel.userData.loads; for (const k in L) L[k].visible = k === kind; },
    setCarry(name, full = false) {
      st.carry = name || null; for (const k in carry) { carry[k].visible = k === name; carry[k].userData.surf.visible = k === name && !!full; }
    },
    play(name) {
      const [who] = name.split(':');
      const side = who === 'carry' || who === 'reach' ? 'left' : 'right';
      st.anims[side] = { name, t: 0, who };
    },
    busy(side = 'right') { return !!st.anims[side]; },
    // light the hand like the world around it, turned into camera space
    setLights(cfg, camQuat) {
      hemi.color.setHex(cfg.sky); hemi.groundColor.setHex(cfg.ground); hemi.intensity = cfg.hemi;
      key.color.setHex(cfg.key); key.intensity = cfg.keyI;
      fill.color.setHex(cfg.fill); fill.intensity = cfg.fillI;
      st.light = cfg;
    },
    update(dt, mainCam, { bob = 0, speed = 0, sprint = false, hidden = false } = {}) {
      camera.fov = clamp(mainCam.fov, 50, 74); camera.aspect = mainCam.aspect; camera.updateProjectionMatrix();
      tmpQ.copy(mainCam.quaternion).invert();
      if (st.light) {
        key.position.fromArray(st.light.keyDir).applyQuaternion(tmpQ).multiplyScalar(5); key.target.position.set(0, 0, 0);
        fill.position.set(-1, -0.3, 0.6).multiplyScalar(5);
        up.set(0, 1, 0).applyQuaternion(tmpQ); hemi.position.copy(up);
      }
      // look lag and walking sway
      const dyaw = Math.atan2(Math.sin(mainCam.rotation.y - st.lastYaw), Math.cos(mainCam.rotation.y - st.lastYaw)), dp = mainCam.rotation.x - st.lastPitch;
      st.lastYaw = mainCam.rotation.y; st.lastPitch = mainCam.rotation.x;
      st.lagX += (clamp(dyaw * 1.6, -0.12, 0.12) - st.lagX) * (1 - Math.exp(-dt * 10));
      st.lagY += (clamp(-dp * 1.6, -0.1, 0.1) - st.lagY) * (1 - Math.exp(-dt * 10));
      st.sprint += ((sprint && speed > 1.6 ? 1 : 0) - st.sprint) * (1 - Math.exp(-dt * 6));
      st.lower += ((hidden ? 1 : 0) - st.lower) * (1 - Math.exp(-dt * 8));
      const w = clamp(speed / 1.6, 0, 1), t = performance.now() / 1000;
      const sway = { x: Math.sin(bob) * 0.008 * w + st.lagX * 0.12, y: -Math.abs(Math.cos(bob)) * 0.01 * w + Math.sin(t * 1.7) * 0.0025 - st.sprint * 0.035 - st.lower * 0.35 + st.lagY * 0.1, z: 0, rx: -st.sprint * 0.25 };
      rig.rotation.set(st.lagY * 0.5, st.lagX * 0.6, 0);
      // swapping tools: drop the current one out of view, bring the next one up
      let swapDrop = 0;
      if (st.swap > 0) {
        st.swap += dt;
        if (st.swap < 0.18) swapDrop = st.swap / 0.18;
        else { if (st.tool !== st.swapTo) { st.tool = st.swapTo; for (const k in tools) tools[k].visible = k === st.tool; } swapDrop = Math.max(0, 1 - (st.swap - 0.18) / 0.2); if (st.swap > 0.38) { st.swap = 0; st.swapTo = undefined; } }
      }
      for (const side of ['right', 'left']) { const a = st.anims[side]; if (a) { a.t += dt; if (a.t >= ANIM[a.name].dur) st.anims[side] = null; } }
      const ra = st.anims.right, la = st.anims.left;
      if (st.tool) place(right, REST[st.tool], ra && ra.who === st.tool ? ra : null, { ...sway, y: sway.y - swapDrop * 0.3 });
      right.visible = !!st.tool;
      const reaching = !!(la && la.who === 'reach');
      hand.visible = reaching && !st.carry;
      if (st.carry) {
        const tip = place(left, REST.carry, la && la.who === 'carry' ? la : null, { ...sway, x: -sway.x }), u = carry[st.carry].userData;
        u.pivot.rotation.x = tip; u.surf.scale.setScalar(Math.abs(tip) > 0.6 ? 0.001 : 1);   // no flat water in a tipped bucket
      }
      else if (reaching) place(left, REST.reach, la, sway);
      else left.position.set(0, -10, 0);
      left.visible = !!st.carry || reaching;
    },
  };
}
// ============================================================
// Everything anyone says: the Book of Lost Echoes, Jacob's lines
// for the shack and the yard, the things you can find, the chores.
// ============================================================

// ---------- The Book of Lost Echoes (passages from the manuscript, Chapters 1–10) ----------
const BOOK = {
  garden: '…and they walked in the garden without fear, for the sun was a warm lover. They held the world in their hands, and it was soft.',
  serpents: 'In the Age of Glass, every home had a garden that watered itself. Silver serpents hid in the grass and woke each morning to spit gentle rain across the flowers.',
  lawns: 'The children played barefoot on lawns so soft they never once drew blood…',
  sunswallowed: '…and when the sun grew tired, the houses swallowed it whole and kept its warmth inside the walls until morning.',
  roads: 'The roads in the Age of Glass were as smooth as fresh milk and stretched from horizon to horizon without a single crack.',
  chariots: 'Painted chariots moved in rivers of polite agreement – red meant stop, green meant go, and every soul obeyed.',
  towers: 'Information moved alongside the road, in towers that stood high and bold.',
  temples: 'They had temples of food where nothing ever rotted. Fruits from the hot places sat beside roots from the cold places, and all of it was wrapped in skin as clear as water.',
  card: 'A child could walk in with a small card – no bigger than a playing tile – and the temple would simply trust that payment would come later. No arguments. No barter. Just a little promise, whispered between strangers.',
  stranger: 'When a stranger knocked upon a door in the Age of Glass, the people inside would open it. They would smile and offer water in a clean cup.',
  locks: 'Their homes were not fortresses. They had no bolts, no bars. A single lock – a tiny mechanism of brass no larger than a thumb – was enough.',
  rest: 'At the end of each day, the people of the Age of Glass simply stopped. They lay down on clouds stitched into fabric and closed their eyes, and dreams came as pleasant memories.',
  weary: 'To be weary in the Age of Glass was not to die by inches. It was to pause, knowing the world would wait.',
  choosing: 'When the children of the Age of Glass grew tall enough, they chose what to become. A farmer’s daughter could become a healer, and a healer’s son could become a painter, and no one told them otherwise.',
  mirrors: 'Every morning, the people of the Age of Glass woke up as themselves. They looked into mirrors of perfect silver and saw the face they wished for – unbroken, unblemished, theirs.',
  feasts: 'Oh, but the celebrations they had! Great feasts where the tables groaned with more food than any mouth could manage, and the only price of attendance was laughter.',
  wishes: 'They lit candles on small cakes and made wishes, and the wishes came true! They wished for puppies and bicycles and sunny days.',
  lending: 'In the Age of Glass, a man could lend his favourite thing to a friend and expect to see it again.',
  beginning: 'In the beginning, there was the Garden. And the Garden did not need to be fought for; it was simply there, waiting for hands to tend it.',
  mercy: 'And the Strong did not crush the Weak, for they knew that strength without mercy is merely gravity.',
};
const BOOK_ORDER = ['garden', 'serpents', 'lawns', 'sunswallowed', 'roads', 'chariots', 'towers', 'temples', 'card', 'stranger', 'locks', 'rest', 'weary', 'choosing', 'mirrors', 'feasts', 'wishes', 'lending', 'beginning', 'mercy'];

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
function words(n) { n = Math.round(n); if (n < 20) return NUM[n]; const t = Math.floor(n / 10), u = n % 10; return TENS[t] + (u ? '-' + NUM[u] : ''); }
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const temp = () => state.area === 'yard' ? 41 + 3 * Math.min(1, state.yardTime / 600) : 36.6 + 2.4 * state.dawn;

const BOOK_REACT = {
  garden: () => `${cap(words(temp()))} degrees and it’s not yet six. Soft.`,
  serpents: () => 'Out here the only thing that spits is the milk.',
  lawns: () => 'Barefoot. Out here. I’d last about four steps.',
  sunswallowed: () => 'My walls swallow the sun too. Then they cook me in it.',
  roads: () => 'Twenty clicks to town, and every one of them wants me dead.',
  chariots: () => 'Red means stop. Out here red means everything.',
  towers: () => 'The only tower round here is a Stobie pole somebody gave up on.',
  temples: () => 'Nothing rots in my tins either. Nothing alive will go near them.',
  card: () => 'Trust that payment would come later. Cogswell would choke.',
  stranger: () => 'Anyone knocks out here, I’m under the bed with the rebar.',
  locks: () => 'I’ve got three deadbolts and I still check them twice.',
  rest: () => 'Clouds. I’ve got straw that bites.',
  weary: () => 'Pause out here and something takes a bite out of you.',
  choosing: () => 'Farmer’s son became a farmer. Nobody had to tell me.',
  mirrors: () => 'Mine’s cracked. Seems more honest.',
  feasts: () => 'The Festival of the Gear’s in a few days. Price of attendance is whatever you’ve got left.',
  wishes: () => 'I wished for rain once. Got a dust storm. Close enough, I suppose.',
  lending: () => 'Grumm’s still got my good spanner. Some things never change.',
  beginning: () => 'There is no garden.',
  mercy: () => 'Lovely idea. Somebody should tell Cogswell.',
};
const WHISPERS = ['…bills are due, Jacob…', '…parasite… bloodsucker…', '…milk is sour… cows are dying…', '…infection is spreading…', '…you’re all alone…', '…Cogswell won’t take it…', '…grade is too low…', '…Rustbucket is sick…'];
const YARD_WHISPERS = ['…Cogswell won’t take it…', '…grade is too low…', '…Rustbucket is sick… look at him…', '…you’re failing your family legacy…', '…bloodsucker…', '…the fence is hungry…', '…all alone out here…', '…milk is sour…'];

// ---------- beats: the little script units the dialogue box plays through ----------
const J = (text) => ({ who: 'jacob', text });
const BK = (key, surfaced = false) => ({ who: 'book', key, text: BOOK[key], surfaced });
const TIP = (text) => ({ who: 'hint', text });
const STAGE = (text) => ({ who: 'stage', text });
const DOC = (key) => ({ doc: key });
const DO = (fn) => ({ fn });
const WAIT = (s) => ({ wait: s });
const DONE = (key) => ({ fn: () => complete(key) });
const CHORE = (key) => ({ fn: () => completeChore(key) });
const pickLine = (list, n) => list[n % list.length];

// ---------- the shack: Before work ----------
const ROUTINE = ['breakfast', 'flies', 'wash', 'book', 'gear', 'rebar'];
const ROUTINE_LABEL = { breakfast: 'Breakfast', flies: 'Settle the flies', wash: 'Wash your face', book: 'Read the Book', gear: 'Goggles, mask, scarf', rebar: 'Take the rebar knife' };
const REMIND = {
  gear: 'Not without goggles, mask and scarf. The sun out there doesn’t shine. It leans on you.',
  rebar: 'Rebar first. Never leave the house without it. Town’s the reason, but the yard’s got ideas of its own.',
};

const ACTS = {
  flask: (n) => n === 0
    ? [DO(() => fx.drink()), J('Breakfast of champions.'), J('Like a battery dipped in bog-water. Most nutrient-dense muck on the continent, worse luck.'), DONE('breakfast')]
    : [J(n % 2 ? 'Once is breakfast. Twice is a cry for help.' : 'No. My stomach’s still filing a complaint about the first one.')],
  bills: (n) => [DOC('bills'), J(n === 0 ? 'Just the interest. Not the principal. Never the principal.' : 'Reading it twice doesn’t shrink the numbers. I’ve checked.')],
  rebar: () => [DO(() => takeTool('rebar')), J('Rebar, sharpened to a needle point. Not much of a weapon.'), J('Enough of one.'), DONE('rebar'),
    TIP(controlHint('swing'))],
  window: () => W.flies.mode === 'home'
    ? [DO(() => fx.scatter()), STAGE('Clack.'), J('Get a job.'), ...(state.routine.flies ? [] : [J('Scream-Peas are shutting up for the day and the Panic-Fowl are starting. Another lovely morning.')]), DONE('flies')]
    : [J('They’ll be back. They always come back.')],
  thermo: (n) => [J(n === 0
    ? `${cap(words(temp()))} degrees and it’s not yet six. The Book says the sun was a warm lover. Mine’s more of a debt collector.`
    : `${cap(words(temp()))} now. Climbing like Cogswell’s interest.`)],
  basin: (n) => n === 0
    ? [DO(() => fx.splash()), J('Cold enough. Wet enough.'), J('Aristocracy of the night, they reckon. If I’m aristocracy, where’s my castle? Where’s my silk?'), BK('mirrors', true), J('Mine’s cracked. Seems more honest.'), DONE('wash')]
    : [DO(() => fx.splash()), J('Same face. Still not a prince.')],
  sink: (n) => [J(n === 0 ? 'Dishes. I’ll do them when the water tax is paid. So, never.' : 'Something in that pot moved. I’m choosing not to know.')],
  tins: (n) => n === 0
    ? [J('Shale-mash, grub paste, and one tin whose label has fully given up.'), BK('temples', true), J('Nothing rots in these either. Nothing alive will go near them.')]
    : [J('The mystery tin rattles. Food shouldn’t rattle.')],
  safe: (n) => [J(n === 0 ? 'Wet hessian and wishful thinking. Keeps the milk somewhere under boiling.' : 'The ants have learnt to swim the moats. Respect.')],
  bed: (n) => n === 0
    ? [J('Canvas, straw, and a frame I welded out of an old gate. It squeaks when I breathe.'), BK('rest', true), J('Clouds. I’ve got straw that bites.')]
    : [J('One leg’s a stack of bricks. We don’t talk about it.')],
  seeds: (n) => [J(n === 0 ? 'Seeds. Saving them for a wetter year.' : 'Still saving. Still not wet.')],
  board: (n) => W.boardState.open
    ? [DO(() => fx.closeBoard()), J('Back under the floor. Safe as anything is out here.')]
    : n === 0
      ? [DO(() => fx.openBoard()), WAIT(0.9), DOC('photo'), J('Mum and Dad. Eleven years since the raids.'), J('I keep them under the floor, where the dust can’t find them.')]
      : [DO(() => fx.openBoard()), WAIT(0.9), DOC('photo'), J('Still there.')],
  books: (n) => [J(n === 0 ? 'Technical manuals, fairy tales, and a book on irrigation from back when water fell out of the sky. Unsanctioned, the lot of them.' : 'If the Church wants them, the Church can come out here and ask.')],
  idol: (n) => {
    if (n === 0) return [J('Dug him out of the dust past the Iron-Bark. Some calm little bloke from before the Fracture, smiling like he knows something I don’t.')];
    if (Math.abs(W.idolState.yaw) > 0.35) { ctx.resetIdol = true; return [DO(() => sfx.hum()), J('I’d swear he was facing the window a minute ago.')]; }
    return [J(n % 2 ? 'Some nights the crack in his face glows. I tell myself it’s the moon.' : 'He watches the door. Someone in this house should.')];
  },
  door: () => {
    const beats = [];
    if (!state.flags.doorTried) {
      state.flags.doorTried = true;
      beats.push(DO(() => sfx.bolts()), J('Three deadbolts.'), BK('locks', true), J('I’ve got three and I still check them twice.'));
    }
    if (!state.routine.gear) beats.push(J(REMIND.gear));
    else if (!state.routine.rebar) beats.push(J(REMIND.rebar));
    else beats.push(DO(() => goOutside()));
    return beats;
  },
  gear: (n) => n === 0
    ? [DO(() => fx.gear()), J('Goggles, mask, sun scarf. The dust out there is so rich in iron you taste rust on your teeth.'), DONE('gear')]
    : [J('Already on. The world through amber. Doesn’t help much.')],
  poster: (n) => [DOC('poster'), J(n === 0 ? 'Came free with the water bill. Keeps the draught out. Bad for the soul.' : 'Harmony is productivity. Productivity is dung. So harmony is dung.')],
  jar: (n) => n === 0
    ? [J('Truth-Rot in a jar. Glows when somebody lies. Living alone, it mostly glows when I say I’m fine.')]
    : n === 1 ? [J('I’m fine.'), DO(() => { W.flareJar(); sfx.sizzle(); }), STAGE('The jar flares a harsh, blinding green.'), J('…Shut up.')]
      : [J('Not saying a word near it. Not one.')],
  notes: (n) => [DOC('notes'), ...(n === 0 ? [J('Mum taught me what those signs mean. I’m trying not to remember.')] : [])],
  drum: (n) => [J(n === 0 ? 'Drinking water. Taxed coming in, taxed going out, and I still check the level twice a day.' : 'Half full. I’m told that’s the optimistic way to look at it.')],
};

// ---------- the yard: chores ----------
const CHORES = [
  { key: 'weed', label: () => 'Dig out the pen compass-weed', hint: 'Just inside the pen gate. Dig it out with a boot heel, and don’t step on it.' },
  { key: 'feed', label: () => 'Feed the herd', hint: 'Shovel from the back of the pen, feed from the pile by the fence, tip it in the trough.' },
  { key: 'dung', label: () => `Scoop the dung (${Ys().dung}/6)`, hint: 'Six piles in the pen. The shovel flings them into the rolling bin.' },
  { key: 'water', label: () => 'Fill the water trough', hint: 'Bucket from under the tank tap, fill it, pour it into the old bathtub.' },
  { key: 'milk', label: () => 'Milk the old girl', hint: 'The pail’s under the shelter. She’s the one missing an ear.' },
  { key: 'rusty', label: () => 'Check on Rustbucket', hint: 'Have a word with the bull. Don’t look him in the eye.' },
  { key: 'devil', label: () => 'Free the Riot-Devil from the fence', hint: 'Something’s caught in the Beggar’s Hand down the south fence. The crowbar’s in the shed.' },
  { key: 'jaws', label: () => `See off the Jaw-Jaws (${Ys().jaws}/4)`, hint: 'Copper strippers, after the tractor’s wiring. Two jabs of the rebar, or one good swing of the shovel.' },
];
const FINAL_CHORE = { label: 'Load up and head to town', hint: 'The dung and the milk go on the tractor, then north to Bleak Flats.' };

const COW_LINES = {
  oldgirl: ['Morning, old girl. Still got one good ear for me?', 'You’ve outlived two vets and a drought. Don’t you dare go soft on me now.', 'Steady, love. You’re the only one round here who never argues.'],
  duchess: ['Duchess. Don’t give me that look. The shade’s for everyone.', 'Yes, you’re very regal. Move your rump.', 'She ate a fence post once. Then looked at me like I owed her another.'],
  slag: ['Slag. You ate a hubcap last week. I saw you.', 'Rocks in a blender, that chewing. Lovely.', 'Best dung in the herd. Don’t let it go to your head.'],
  pebbles: ['Pebbles, love. Steam’s coming out of your vents again. Same.', 'You’re the small one. Small out here means nothing, but still.', 'Chew. Grind. Stare. Riveting conversationalist, this one.'],
  clinker: ['Clinker. Calved in the spring. The lupari took it before its skin hardened.', '…Sorry, girl.', 'You’ve still got the blue milk in you. They’ll come for that too, one day.'],
  marge: ['Marge. Nobody remembers why she’s called Marge. She doesn’t either.', 'Marge, you’re standing on my shovel. Of course you are.', 'If I sold you, I’d make the water tax. I’m not selling you. Don’t tell the others.'],
};

// what Jacob says when things hit back, or when the yard has a go at him
const LINES = {
  grab: ['That’s what the boots are for.', 'Let go. Let go!', 'Not today, hand.', 'Beggar’s Hand. Hot ankles, cold fingers.'],
  lash: ['Razor-Spinifex. That’s why the pants are Kevlar.', 'That’s why they’re lined. Also why they’re torn.', 'Ow. Right. Spinifex.'],
  scramble: ['Compass-weed. Brilliant. Which way’s the house?', 'Spun me right round. Hold still, world.', 'Left’s right, right’s left. Same as town, really.'],
  ironbark: ['Iron-Bark. Right. Good one, Jacob.', 'My wrist just filed for divorce.', 'You don’t cut an Iron-Bark. You wait it out.'],
  cow: ['Sorry, girl. Wasn’t aiming at you.', 'That was the rebar’s idea, not mine.', 'She’s going to remember that.'],
  bull: ['Bad idea. Very bad idea.', 'Easy. Easy! That was an accident.', 'Two tonnes and a concrete skull. I need my head read.'],
  hand: ['Don’t cut the Hands. Never cut the Hands.', 'Screams like a child. Every time.'],
  pea: ['Yep. Deserved that.', 'Ears. My ears.'],
  house: ['Easy. That’s the only wall I’ve got.'],
  boab: ['Like hitting a full water bag. Of course it is.'],
  devil: ['It’s already dead, Jacob. You’re just being rude now.'],
  jawFled: ['And stay out.', 'Go on. Strip someone else’s wiring.', 'That’s one less.', 'Under the fence like a bad debt.'],
  raidWarn: ['The Panic-Fowl’s feathers are standing straight up. Uh oh.', 'Feathers up. Something’s coming.'],
  raidStart: ['Jaw-Jaws, off the ute and onto the tractor. Again.', 'Oi! That’s my ignition wiring!'],
  hiss: ['Hiss all you like.', 'Wedge-headed little thieves.'],
  snort: ['Don’t look him in the eye, Jacob. Rule one.', 'All right, all right. Looking at my boots.', 'Sparks off the shale. He means it.'],
  strider: ['Salt-strider. Out on the ridge. Might be the one that took Rustbucket’s horn. Might be its cousin.', 'It’s not coming in. It’s just letting me know.'],
};

// ---------- the yard: things to use ----------
const Ys = () => state.yard;
const has = (tool) => state.owned.has(tool);
const YACTS = {
  ydoor: () => [DO(() => goInside())],
  chair: (n) => [J(pickLine(['Dad’s chair. I don’t sit in it. Don’t ask me why.', 'Mum’s comb used to live on it. Some days I think it still should.'], n))],
  woodpile: (n) => [J(pickLine(['Ironbark. Burns hotter than coal, once you take a blowtorch to it. The smoke smells like burning pennies.', 'Truth-Rot on the end of that log. I don’t tell lies near the woodpile.'], n))],
  truthrot: (n) => n === 0
    ? [J('Morning, mushrooms. I’m fine, by the way.'), DO(() => { area.Y.truthRot.emissiveIntensity = 4; sfx.sizzle(); rumble(0.2, 0.3, 120); }), STAGE('The Truth-Rot flares a harsh, sickly green.'), J('…Yeah. All right.')]
    : [J(pickLine(['Not saying anything. Not a word.', 'It glows at night on its own. When I talk in my sleep, I reckon.'], n))],
  hemorrhage: (n) => {
    const Y = Ys();
    if (Y.flowerFed) return [J(pickLine(['Don’t look at me like that. It was one drop.', 'Worth a water filter in town. Worth a lot more to a vampiris with a bad habit.'], n))];
    if (n === 0) return [J('Hemorrhage-Flower. Stays shut tight until somebody bleeds on it.'), J('Worth a water filter in town, if I can bear to sell it.')];
    return [DO(() => { if (state.held !== 'rebar' && has('rebar')) takeTool('rebar', true); vm.play('rebar:nick'); }), WAIT(0.7), J('Just a drop.'),
      DO(() => { Y.flowerFed = true; area.Y.flower.userData.target = 1; sfx.bloom(); fx.ego(); }), WAIT(1.6),
      STAGE('The bud splits open like a crown. The air turns sweet and gold.'), J('…There it is. Castle. Silk. Crown. The whole lot.'), WAIT(1.2), J('And it’s gone. Back to dung.')];
  },
  tomato: (n) => {
    const Y = Ys();
    if (state.carry === 'bucket' && state.carryFull && !Y.tomatoWatered) return [DO(() => { vm.play('carry:pour'); sfx.pour(); fx.pourAt(area.Y.tomato.position); }), WAIT(1.2), DO(() => { Y.tomatoWatered = true; }), J('Grow, you coward.'), J('…Leave some for the herd, Jacob.')];
    if (Y.tomatoWatered) return [J(pickLine(['It’s thinking about it.', 'That’s a tomato having a good day, believe it or not.'], n))];
    return [J(pickLine(['Tomato. Attempt number three. It’s not dead, which out here counts as thriving.', 'One fruit. Green. I’ve named it Hope. I’m not proud.'], n))];
  },
  tank: (n) => [J(pickLine(['Corrugated tank. Last time it rained I was nine. I still remember the smell.', 'The water man fills it, Cogswell taxes it, and the sun takes its cut through the seams.'], n))],
  bucket: () => [DO(() => { setCarry('bucket', false); Ys().bucketHome = false; area.Y.bucket.visible = false; sfx.clank(); vm.play('reach:take'); }), J('Bucket.')],
  tap: () => {
    if (state.carry === 'bucket' && !state.carryFull) return [DO(() => { vm.play('carry:fill'); sfx.fill(); fx.tapRun(); }), WAIT(1.6), DO(() => setCarry('bucket', true)), J('Taxed coming in. Taxed going out.')];
    if (state.carry === 'bucket') return [J('Full. Any more and I’m paying for the spill.')];
    if (state.carry === 'pail') return [J('Not in the milk pail. The old girl would never forgive me.')];
    return [J('Bucket first. It lives under the tap, when it’s home.')];
  },
  still: (n) => [J(pickLine(['Solar still. Four mouthfuls a day. Three, if I watch it.', 'The Book says the gardens watered themselves. Mine sulks under a sheet.'], n))],
  gate: () => [DO(() => { Ys().gateOpen = !Ys().gateOpen; sfx.gate(); rumble(0.15, 0.4, 300); }), ...(state.flags.gateOnce ? [] : [J('Shrieks like a Scream-Pea at noon. One day I’ll find some grease.')]), DO(() => { state.flags.gateOnce = true; })],
  penweed: () => [DO(() => fx.kickWeed()), WAIT(1.3), J('Compass-weed. Inside the pen. Overnight.'), J('Caught it early, at least. The spores hadn’t gone off.'), CHORE('weed')],
  feedpile: () => {
    if (!has('shovel')) return [J('Need the shovel. It’s at the back of the pen, leaning on the dung bin.')];
    if (state.load === 'feed') return [J('Shovel’s already full.')];
    if (state.load === 'dung') return [J('Not with dung on it. Even the herd has standards. Low ones.')];
    return [DO(() => { takeTool('shovel', true); vm.play('shovel:scoop'); sfx.scoop(); }), WAIT(0.5), DO(() => setLoad('feed')),
      ...(state.flags.feedOnce ? [] : [J('Dried scrub, red-shale gravel, and whatever scrap shards the junk piles coughed up. Grain’s too dear.')]), DO(() => { state.flags.feedOnce = true; })];
  },
  feedtrough: () => {
    const Y = Ys();
    if (state.load === 'feed') return [DO(() => { vm.play('shovel:dump'); sfx.dumpFeed(); }), WAIT(0.45), DO(() => { setLoad(null); Y.fed = true; area.Y.herd.cows.forEach(c => { if (!c.bull) c.idle = rand(0, 1.5); }); }), J('Breakfast is served. Crunch away, ladies.'), CHORE('feed')];
    if (Y.fed) return [J('Rocks and scrap metal, and they love it. Living refineries.')];
    return [J('Empty. The feed’s in the pile just outside the fence.')];
  },
  watertrough: () => {
    const Y = Ys();
    if (state.carry === 'bucket' && state.carryFull && !Y.watered) return [DO(() => { vm.play('carry:pour'); sfx.pour(); fx.pourAt(new THREE.Vector3(YARD.waterTrough.x, 0.5, (YARD.waterTrough.z0 + YARD.waterTrough.z1) / 2)); }), WAIT(1.3), DO(() => { setCarry('bucket', false); Y.watered = true; }), J('An old bathtub. Somebody in the Age of Glass lay down in this full of hot water. On purpose. For fun.'), CHORE('water')];
    if (Y.watered) return [J('They’ll drink it faster than I can pay for it.')];
    return [J('Bone dry. The bucket’s under the tank tap.')];
  },
  bin: () => [J(Ys().dung >= 6 ? 'Heavy as sin. Good.' : 'The dung bin. Iron-rich, red-grade if I’m lucky. Taxes, mortgage, life itself.')],
  shovel: () => [DO(() => { area.Y.shovel.visible = false; takeTool('shovel'); sfx.clank(); }), J('Heavy shovel. Good for dung, feed, and things that won’t take a hint.'), ...(state.owned.size === 1 ? [TIP(controlHint('swap'))] : [])],
  dung: (n, it) => {
    if (!has('shovel')) return [J('Not with my hands. The shovel’s leaning on the bin, back of the pen.')];
    if (state.load === 'feed') return [J('Feed on the shovel. Trough first.')];
    const k = it.k, Y = Ys(), nth = Y.dung + 1;        // which scoop this is, counted before the beats run
    return [DO(() => { takeTool('shovel', true); vm.play('shovel:scoop'); sfx.scoop(); }), WAIT(0.45), DO(() => { Y.scooped[k] = true; area.Y.dung[k].group.visible = false; fx.flingDung(area.Y.dung[k]); Y.dung++; }), WAIT(0.6),
      J(['Scoop. Lift. Clang.', 'To an outsider, it’s dung.', 'To me, it’s the water tax.', 'Rustbucket’s been productive.', 'Dense little spheres of iron slag. Burns hotter than coal, smelts down to steel. Smells like neither.', 'Last one. The pen’s clean, for about an hour.'][Math.min(5, nth - 1)]),
      ...(nth >= 6 ? [CHORE('dung')] : [])];
  },
  pail: () => [DO(() => { setCarry('pail', false); Ys().pailHome = false; area.Y.pail.visible = false; sfx.clank(); vm.play('reach:take'); }), J('Milk pail. The old girl first.')],
  cow: (n, it) => {
    const c = it.cow, Y = Ys();
    if (c.bull) {
      const k = Y.rustyTalks++;
      if (k === 0) return [J('Easy, you big lug.'), DO(() => sfx.snort()), J('Favouring your left side again. Vents puffing like a kettle.'), J('Dad raised you from a calf. You’ve got his temper, you know that?'), J('Don’t you die on me. I can’t afford a vet, and I definitely can’t afford a new bull.'), CHORE('rusty')];
      return [J(pickLine(['Guarding the fort, are you? Good lad.', 'He’s not listening. He never listens. Family trait.', 'Your neck scales are going grey at the edges. Mine would be too, if I had any.'], k - 1))];
    }
    if (c.id === 'oldgirl' && state.carry === 'pail' && !state.carryFull && !Y.milked) {
      return [DO(() => fx.milking(true)), J('Easy. Easy now.'), DO(() => { vm.play('carry:milk'); sfx.milk(); }), WAIT(1.4), STAGE('Thrum. Thrum. Thrum.'), WAIT(0.8),
        DO(() => { setCarry('pail', true); fx.milking(false); }), J('Ninety degrees, near enough. Don’t spill it on your boots, Jacob.'), J('Into the canister. Might pay down the interest. Just the interest.'),
        DO(() => { setCarry(null); Y.milked = true; }), CHORE('milk')];
    }
    if (c.id === 'oldgirl' && Y.milked) return [J('Thanks, love. Same time tomorrow.')];
    const lines = COW_LINES[c.id] || ['Morning.'];
    const k = (Y.cowTalks[c.id] = (Y.cowTalks[c.id] || 0) + 1) - 1;
    if (c.id === 'clinker' && k === 0) return [J(lines[0]), J(lines[1])];
    return [J(lines[Math.min(lines.length - 1, c.id === 'clinker' ? k + 1 : k)])];
  },
  fowl: (n) => [J(pickLine(['Morning, ladies. Nobody’s dying. Probably.', 'Feathers down. That’s good. When they stand up, run.', 'They don’t cluck. They scream, in your head. Ten seconds before something lands on the roof.'], n))],
  coop: (n) => [J(pickLine(['Ironbark coop. Nothing’s chewed through it yet, and plenty have tried.', 'Built it the year Mum went. Took a blowtorch and most of the winter.'], n))],
  bench: (n) => [J(pickLine(['Workbench. A vice, three files and a tin of bolts that don’t fit anything.', 'Dad’s bench. His initials are carved under the lip. I check they’re still there.'], n))],
  crowbar: () => [DO(() => { area.Y.crowbar.visible = false; takeTool('crowbar'); sfx.clank(); }), J('Crowbar. For prying things loose from the fence. Mornings, mostly.'), ...(state.owned.size === 1 ? [TIP(controlHint('swap'))] : [])],
  blowtorch: (n) => [J(pickLine(['Blowtorch. Lights the Ironbark. Frees an ankle from a Beggar’s Hand too, if you don’t mind the smell.', 'Half a tank. The other half’s a prayer.'], n))],
  devil: (n) => {
    if (!has('crowbar')) return [J('Riot-Devil. Caught in the fence overnight. The Hands drained the heat right out of it.'), J('You don’t cut a Beggar’s Hand. It screams like a child. Crowbar’s in the shed.')];
    return [DO(() => { takeTool('crowbar', true); vm.play('crowbar:pry'); sfx.pry(); }), WAIT(0.9), DO(() => { area.Y.devil.state = 'toss'; area.Y.devil.t = 0; sfx.thud(); rumble(0.5, 0.6, 250); }), WAIT(0.5),
      J('Over you go.'), J('Every morning. Shadow-Hoppers, Riot-Devils. The fence eats well, I’ll give it that.'), CHORE('devil')];
  },
  tractor: () => {
    const Y = Ys(), beats = [];
    if (area.Y.jaws.jaws.some(j => j.state === 'tractor')) beats.push(J('Oi! Get off my ignition wiring!'));
    if (Y.dung >= 6 && Y.milked) return [...beats, DO(() => leaveForTown())];
    beats.push(J(state.flags.tractorOnce ? 'Not yet.' : 'Rusted, held together with prayers, determination and tape. The windshield’s a memory.'));
    state.flags.tractorOnce = true;
    if (Y.dung < 6) beats.push(J('Not without the dung. That bin’s the water tax.'));
    if (!Y.milked) beats.push(J('And the milk. The old girl won’t milk herself.'));
    return beats;
  },
  ute: (n) => [J(pickLine(['The old ute. Hasn’t moved since Dad parked it. The Jaw-Jaws have had the copper out of it bit by bit, like a pantry.', 'Bonnet’s up so I can see them coming. That’s the theory.'], n))],
  firepit: (n) => n === 1 ? [J('Still smouldering from last night. Ironbark never really goes out. It just sulks.'), BK('weary', true), J('Pause out here and something takes a bite out of you.')]
    : [J(pickLine(['Fire pit. A truck rim and a ring of stones. For when it drops below forty and I can bear to light it.', 'Billy’s still warm. Tea later, if there’s water left.', 'Dad used to tell stories here. Mostly lies. The Truth-Rot loved him.'], n))],
  barrel: (n) => [J(pickLine(['Burn barrel. Bills go in here once I’ve read them. A ceremony of sorts.', 'Cogswell’s handwriting burns blue. I don’t know why. I don’t want to know.'], n))],
  clothesline: (n) => [J(pickLine(['Rotary line. Spins when the wind’s up. Everything on it dries in four minutes and stays red forever.', 'One sock. There were two. The yard took the other one.'], n))],
  windmill: (n) => [J(pickLine(['Windmill. The bore went salty years ago. It still turns now and then, out of habit. I know the feeling.', 'Missing four blades. It used to sing. Now it coughs.'], n))],
  dunny: (n) => [J(pickLine(['The dunny. Check under the seat for Tunnel-Webs. Then check again.', 'Dad built it. Only thing on the farm that’s never broken. Make of that what you will.'], n))],
  ngate: (n) => [J(pickLine(['Welded it myself out of scrap. Hubcaps, a bed frame, half a shovel. Keeps out the honest ones.', 'Bleak Flats is that way. Twenty clicks, and every one of them wants me dead.'], n))],
  stobie: (n) => [J(pickLine(['Stobie pole. Steel and concrete. Somebody tried to cut it down for scrap and gave up halfway. Respect.', 'Wires used to run off it. Information, the Book reckons. In towers.'], n))],
  letterbox: () => Ys().letter
    ? [J('No mail. Good. No mail is the best mail.')]
    : [DO(() => { Ys().letter = true; sfx.clank(); }), J('No mail. Not even a bill. That’s how you know Cogswell’s planning something.'), J('Just this, wedged in the back. Been in there since before Dad.'), DO(() => findThing('librarycard'))],
  junk: (n) => [J(pickLine(['Junk pile. Feed for the herd, one shard at a time.', 'Somewhere in here is the rest of the ute.', 'Dad never threw anything out. Now I can’t either. It’s catching.'], n))],
  ironbarktree: (n) => [J(pickLine(['The Iron-Bark Sentinel. The bark’s turned to metal from drinking the iron out of the ground. You can’t cut it. You can only wait it out.', 'Found the little idol out past it, in the dust. Wish I hadn’t, some nights.'], n))],
  boab: (n) => [J(pickLine(['Miser-Boab. Holds more water than my tank and won’t spare a drop. Reminds me of someone.', 'Drink from it and you’ll never share again. Cogswell’s had a sip, I reckon.'], n))],
  salt: (n, it) => {
    const b = area.Y.saltbush[it.k];
    if (b.picked) return [J('Picked clean. It’ll fruit again tomorrow, out of spite.')];
    return [DO(() => { b.picked = true; b.berries.visible = false; sfx.crunch(); vm.play('reach:take'); }), J(state.flags.berries ? pickLine(['Crunchy. Like eating tears.', 'Salt and nothing. Perfect.'], n) : 'Salt-Bush berries. Numbs the hope.'), DO(() => { state.flags.berries = true; })];
  },
  prickles: (n) => [J(pickLine(['That’s Prickles. Thorny-Devil. Anything thrown at him goes straight back where it came from.', 'Don’t poke him. Don’t even think about poking him.', 'Keeps the Wulfgard sorcerers honest. Best neighbour I’ve got.'], n))],
  found: (n, it) => [DO(() => findThing(it.def.id))],
};
const YVERB = {
  tap: () => state.carry === 'bucket' && !state.carryFull ? 'Fill the bucket' : 'Look',
  feedtrough: () => state.load === 'feed' ? 'Tip the feed in' : 'Look',
  watertrough: () => state.carry === 'bucket' && state.carryFull && !Ys().watered ? 'Pour it in' : 'Look',
  feedpile: () => has('shovel') && !state.load ? 'Shovel feed' : 'Look',
  tractor: () => Ys().dung >= 6 && Ys().milked ? 'Load up and head to town' : 'Look',
  cow: (id) => id === 'oldgirl' && state.carry === 'pail' && !state.carryFull && !Ys().milked ? 'Milk her' : id === 'rustbucket' ? 'Talk to him' : 'Talk',
  dung: () => has('shovel') ? 'Scoop' : 'Look',
  devil: () => has('crowbar') ? 'Pry it loose' : 'Look',
  hemorrhage: () => (state.uses.hemorrhage || 0) > 0 && !Ys().flowerFed ? 'Feed it a drop' : 'Look',
  tomato: () => state.carry === 'bucket' && state.carryFull && !Ys().tomatoWatered ? 'Water it' : 'Look',
  salt: (k) => area.Y.saltbush[k].picked ? 'Look' : 'Pick berries',
};

// ---------- the things you can find ----------
// kind: echo (an Age of Glass relic, with its passage), curio (a piece of the farm's story), bit (anima quartz)
const FOUND = [
  { id: 'mat', kind: 'echo', name: 'WELCOME mat', book: 'stranger', line: 'A welcome mat, at a door with three deadbolts. I keep it for the irony.', desc: 'Coir, mostly rot. The letters have outlasted the house they came from.', hint: 'Right where you’d wipe your boots.', box: 0.6, boxY: 0.08 },
  { id: 'sprinkler', kind: 'echo', name: 'Brass sprinkler head', book: 'serpents', line: 'A silver serpent. Brass, really. It spat rain on the flowers every morning, all on its own.', desc: 'Threaded brass, pierced for a spray nobody out here has ever seen.', hint: 'Near the water, half buried.' },
  { id: 'lens', kind: 'echo', name: 'Red traffic lens', book: 'chariots', line: 'Red meant stop. And everybody stopped. Imagine that.', desc: 'A cracked red lens, ridged on the inside like a shell.', hint: 'In the junk south of the dead ute.' },
  { id: 'key', kind: 'echo', name: 'Brass door key', book: 'locks', line: 'One little brass key, and that was the whole lock. Nobody tried the door.', desc: 'No bigger than a thumb. Opens nothing that’s left standing.', hint: 'Dropped on the way to the mail.' },
  { id: 'card', kind: 'echo', name: 'Plastic card', book: 'card', line: 'No bigger than a playing tile, and a temple would trust you on it. J Citizen. Whoever you were, mate.', desc: 'Faded plastic, a little gold square, and a promise that payment would come later.', hint: 'Somebody left it on the seat of the ute.' },
  { id: 'insulator', kind: 'echo', name: 'Ceramic insulator', book: 'towers', line: 'Information moved along the roads, in towers. This little bell held the wire up.', desc: 'Glazed ceramic, ribbed so the rain would run off. The rain never got the message.', hint: 'High on the old pole by the gate.', reach: 2.6 },
  { id: 'candle', kind: 'echo', name: 'Birthday candle', book: 'feasts', line: 'A candle for a cake. Great feasts, and the only price of attendance was laughing. I could manage a chuckle.', desc: 'Pink stripes, a black wick, and a wish nobody ever collected.', hint: 'In the ashes, where nothing should survive.' },
  { id: 'bell', kind: 'echo', name: 'Bicycle bell', book: 'wishes', line: 'Puppies, bicycles and sunny days. One out of three out here. Guess which.', desc: 'Chrome dome and a thumb lever. It still rings, a little hoarse.', hint: 'At the foot of the windmill.' },
  { id: 'bulb', kind: 'echo', name: 'Glass lightbulb', book: 'sunswallowed', line: 'The houses swallowed the sun and kept it warm till morning. This is what they swallowed it with.', desc: 'Clear glass and a filament fine as hair, unbroken somehow.', hint: 'On a shelf in the shed.' },
  { id: 'thong', kind: 'echo', name: 'Rubber thong', book: 'lawns', line: 'Barefoot on soft lawns, and this was for when the lawn ran out. One of them, anyway.', desc: 'Faded blue rubber. A sole, a strap, and a very long way from a beach.', hint: 'Lost on the way to the dunny.' },
  { id: 'tag', kind: 'echo', name: 'Pillow tag', book: 'rest', line: '“Do not remove, under penalty of law.” Clouds stitched into fabric, and they made laws about the labels.', desc: 'A tag from a pillow that no longer exists. The law still stands.', hint: 'Pegged out on the rotary line.', reach: 2.6 },
  { id: 'librarycard', kind: 'echo', name: 'Library card', book: 'lending', line: 'Due back in fourteen days. Lend a thing and expect it back. Grumm’s still got my spanner.', desc: 'Stamped dates in purple ink. Long, long overdue.', hint: 'Check the mail. Really.', hiddenItem: true },
  { id: 'compact', kind: 'echo', name: 'Mirror compact', book: 'mirrors', line: 'A pocket mirror. Perfect silver. Shows you the face you wished for, the Book says. …Still mine.', desc: 'Hinged, tarnished, and kinder than the one in the shack.', hint: 'Out on the salt under the Miser-Boab.' },
  { id: 'ruler', kind: 'echo', name: 'School ruler', book: 'choosing', line: 'Children grew tall enough and chose what to become. Somebody measured them with this.', desc: 'Thirty centimetres of wood, chewed at one end by a fowl.', hint: 'The fowl have been scratching at it in their run.' },
  { id: 'horntip', kind: 'curio', name: 'Horn tip', line: 'The end of Rustbucket’s horn. The salt-strider took the rest. I keep meaning to give it back to him.', desc: 'Grey stone-horn, ringed like a tree, snapped clean.', hint: 'In the pen, near the shelter.' },
  { id: 'collar', kind: 'curio', name: 'Calf collar', line: 'His first collar. R, for Rustbucket. Dad stamped it himself. Wouldn’t go round his ankle now.', desc: 'Cracked leather and a brass tag stamped R.', hint: 'Hanging on a shelter post.' },
  { id: 'earcage', kind: 'curio', name: 'Ear-Cage', line: 'An Ear-Cage. Fine mesh, so the gossip-flies can’t get in your ears. Never worked on the ones in my head.', desc: 'Wire jewellery, bent, one hook missing.', hint: 'Left on a seat by the fire pit.' },
  { id: 'feather', kind: 'curio', name: 'Crest feather', line: 'Panic-Fowl crest. They stand straight up ten seconds before something bad lands on the roof.', desc: 'Stiff and orange at the root. It still bristles if you speak sharply to it.', hint: 'Blown out of the coop.' },
  { id: 'pod', kind: 'curio', name: 'Dried Scream-Pea pod', line: 'Dried Scream-Pea. Dead quiet. Best kind.', desc: 'A lidded pod the colour of an old scab. It might be looking at you.', hint: 'Down along the fence, south-east.' },
  { id: 'page', kind: 'curio', name: 'Field guide page', line: 'A page out of the Field Guide. Volume Nine of Ten. Somebody’s going to want the rest of that sentence.', desc: 'Torn out at the Jaw-Jaw entry, with pencil notes in a hand that isn’t Jacob’s.', hint: 'Blown up against the tractor.' },
  { id: 'slate', kind: 'curio', name: 'Slate card', line: 'A slate card. The Wanderer. Mum would have had something to say about that.', desc: 'Etched slate: a figure with a staff, walking off the edge of things.', hint: 'Out past the Iron-Bark, where the idol turned up.' },
  { id: 'charm', kind: 'curio', name: 'Lupari bone charm', line: 'Lupari charm. Finger bones on a cord. Their raiders wear them. They took two calves this season. They don’t get this back.', desc: 'Small bones on braided sinew. Don’t ask whose.', hint: 'In the dirt by the south fence.' },
  { id: 'comb', kind: 'curio', name: 'Mum’s horn comb', line: 'Mum’s comb. I leave it on Dad’s chair. They can share.', desc: 'Polished horn, two teeth missing, worn smooth by her hand.', hint: 'On the old chair by the door.' },
  { id: 'rivet', kind: 'curio', name: 'Ironshell rivet', line: 'Ironshell rivet. Off an enforcer’s plating. They came out here once. Once.', desc: 'A dome-headed rivet as big as a thumb, stamped with a gear.', hint: 'In the dust near the north gate.' },
  { id: 'stencil', kind: 'curio', name: 'Stencil plate', line: 'A stencil plate. …IPPS. Some station a long way from here, from back when there were stations.', desc: 'Cut steel letters, for painting on wool bales that no longer exist.', hint: 'Leaning on the tank stand.' },
  { id: 'lure', kind: 'curio', name: 'Fishing lure', line: 'A fishing lure. Somebody, somewhere, once stood beside enough water to need one.', desc: 'A painted fish with a treble hook and rust at the eye. Lakes, the Book would call it.', hint: 'Hanging inside the dunny.', reach: 2.6 },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 'bit' + i, kind: 'bit', name: 'Bit', desc: 'A shard of anima quartz, glowing faintly blue. The money of the Flats.', hint: 'Somewhere in the yard. They glow.' })),
];
const FOUND_KIND = { echo: { label: 'Echoes', one: 'Echo', blurb: 'Relics of the Age of Glass. Each one brings back a passage from the Book.' }, curio: { label: 'Curios', one: 'Curio', blurb: 'Pieces of the farm’s own story.' }, bit: { label: 'Bits', one: 'Bit', blurb: 'Anima quartz: the money of the Flats. The water tax is twenty-five.' } };

// ---------- documents ----------
const DOCS = {
  bills: () => `
    <div class="bill">
      <header class="bill-head">
        <p class="bill-firm">H.R. Cogswell &amp; Associates</p>
        <p class="bill-sub">Liquidations, Acquisitions, &amp; Futures</p>
        <p class="bill-fine">Associates yet to be finalised for tax purposes.</p>
      </header>
      <p class="bill-title"><span>Notice of arrears</span><span class="stamp stamp-overdue">Overdue</span></p>
      <dl class="bill-lines">
        <div><dt>Account</dt><dd>Ackerman, J.</dd></div>
        <div><dt>Residency</dt><dd>Outer city</dd></div>
        <div><dt>Solvency rating</dt><dd>Critical</dd></div>
        <div><dt>Water tax</dt><dd><s>20</s> 25 bits</dd></div>
        <div><dt>Overdue</dt><dd>14 days</dd></div>
        <div><dt>Mortgage interest</dt><dd>Compounding, cheerfully</dd></div>
        <div><dt>Principal outstanding</dt><dd>See attached schedule</dd></div>
      </dl>
      <p>Should payment not be received in full, Guildmaster Cogswell regrets that he will be obliged to explore alternative forms of liquidity.</p>
      <p>Time is money. – H.R.C.</p>
      <p class="pencil">nothing attached</p>
      <span class="stamp stamp-revised">Revised upward<br>market conditions</span>
    </div>`,
  notes: () => `
    <div class="board">
      <div class="note wide" style="--r:-1.2deg"><strong>RUSTBUCKET</strong> – favouring his left side. Flank vents puffing fast. Neck scales going grey at the edges. Mum would know. <strong>WATCH HIM.</strong></div>
      <div class="note" style="--r:1.5deg">Feed: dried scrub, red shale, scrap shards. Whatever the piles give. Grain’s too dear.</div>
      <div class="note" style="--r:-2deg">This week: grey ×4, blue ×½, one bin of red-grade dung. Calves lost this season: 2 (lupari).</div>
      <div class="note" style="--r:2.2deg">Ask Scrimp about the intake valve. Do NOT pay 3.</div>
      <div class="note red" style="--r:-1deg">Compass-weed in the yard again. Check the pen.</div>
      <figure class="note wide" style="--r:0.8deg">
        <svg viewBox="0 0 300 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M58 62q-6-30 32-32h110q42 4 46 34q2 30-30 34H92q-34-2-34-36z"/>
          <path d="M84 98v28M112 98v28M182 98v28M210 98v28"/>
          <path d="M240 54q30-12 42 8q8 22-16 30q-22 4-28-12"/>
          <path d="M260 48l-8-24M274 50l5-9"/>
          <path d="M282 36q-7-8 1-14q8-6 2-14"/>
          <path d="M104 50l8 34M134 46l8 38M164 46l8 38"/>
          <path d="M196 70h12M196 79h12"/>
          <path d="M58 66q-22 8-24 30"/>
        </svg>
        <figcaption>Rustbucket (not to scale – worse)</figcaption>
      </figure>
    </div>`,
  photo: () => `
    <figure class="photo">
      <svg viewBox="0 0 300 220" role="img" aria-label="A faded photograph of two tall pale figures and a child in front of the shack">
        <defs>
          <linearGradient id="ph-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8d5b0"/><stop offset="1" stop-color="#cdb289"/></linearGradient>
          <radialGradient id="ph-vig" cx="50%" cy="50%" r="72%"><stop offset="58%" stop-color="#3c2814" stop-opacity="0"/><stop offset="100%" stop-color="#3c2814" stop-opacity="0.75"/></radialGradient>
        </defs>
        <rect width="300" height="220" fill="url(#ph-sky)"/>
        <rect y="140" width="300" height="80" fill="#8c6f4d"/>
        <path d="M160 140V82l52-30 52 30v58z" fill="#5c4630"/>
        <rect x="196" y="106" width="18" height="34" fill="#3d2e1f"/>
        <rect x="232" y="96" width="16" height="14" fill="#c9b08a"/>
        <g fill="#3a2b1d"><rect x="52" y="78" width="22" height="62" rx="6"/><rect x="88" y="82" width="20" height="58" rx="6"/><rect x="74" y="110" width="14" height="30" rx="5"/></g>
        <g fill="#f1e5cc"><circle cx="63" cy="68" r="10"/><circle cx="98" cy="72" r="9"/><circle cx="81" cy="102" r="7"/></g>
        <rect width="300" height="220" fill="url(#ph-vig)"/>
        <path d="M40 0l-6 220M212 0l8 220M150 0l-3 220" stroke="#fff6e4" stroke-opacity="0.35"/>
      </svg>
      <figcaption>Us three. The good year.</figcaption>
    </figure>`,
  poster: () => `
    <div class="poster">
      <div class="poster-band"></div>
      <p class="poster-word">Harmony</p>
      <p class="poster-word small">is</p>
      <p class="poster-word">Productivity</p>
      <svg class="poster-gear" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="10"/>
        <g fill="currentColor">${Array.from({ length: 10 }, (_, i) => `<rect x="45" y="6" width="10" height="16" transform="rotate(${i * 36} 50 50)"/>`).join('')}</g>
        <circle cx="50" cy="50" r="11" fill="var(--stamp)"/>
      </svg>
      <p class="poster-fine">A message from the Corporate Council of Auria.<br>Report dissatisfaction to your nearest Harmony Officer.</p>
    </div>`,
};
// ============================================================
// Input: keyboard and mouse (pointer lock when the page allows it,
// drag-to-look when it doesn't) and the Xbox controller
// through the standard Gamepad mapping. Everything ends up as the
// same small set of intentions the game reads each frame.
// ============================================================
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const input = {
  mode: 'kbm',
  move: { x: 0, y: 0 }, lookX: 0, lookY: 0, sprint: false, sprintLatch: false,
  keys: new Set(), locked: false, lockFailed: false, pad: null, padIndex: -1, padPrev: [], padRepeat: {}, padSeen: false, padBlocked: false,
  ptr: { lookId: null, lx: 0, ly: 0, downT: 0, moved: 0, button: 0 },
  settings: { sens: 1, invert: false, rumble: true, quality: '', bright: 1, fov: 86, bob: true },
  h: null,
};
try { Object.assign(input.settings, JSON.parse(localStorage.getItem('farm-of-rust-settings') || '{}')); } catch (e) { /* storage unavailable */ }
function setInputMode(m) {
  if (input.mode === m) return;
  input.mode = m;
  document.body.classList.toggle('touch', m === 'touch');
  document.body.classList.toggle('pad', m === 'pad');
  input.h && input.h.onMode && input.h.onMode(m);
}
const isTouch = () => false;   // this build is for a computer: keyboard and mouse, or a controller

function requestLock(canvas) {
  if (input.mode !== 'kbm' || input.lockFailed || document.pointerLockElement) return;
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { input.lockFailed = true; }); } catch (e) { input.lockFailed = true; }
}
function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* nothing to release */ } }

function rumble(weak = 0.3, strong = 0.3, ms = 120) {
  if (!input.settings.rumble || input.mode !== 'pad' || !input.pad) return;
  try {
    const a = input.pad.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: clamp(weak, 0, 1), strongMagnitude: clamp(strong, 0, 1) }).catch(() => {});
    else if (input.pad.hapticActuators && input.pad.hapticActuators[0]) input.pad.hapticActuators[0].pulse(Math.max(weak, strong), ms);
  } catch (e) { /* no rumble on this pad */ }
}

// find the next focusable control in a direction, for menus driven by the D-pad or arrow keys
function navFocus(root, dir) {
  const els = [...root.querySelectorAll('button:not([disabled]), input, [data-nav]')].filter(e => e.offsetParent !== null && !e.closest('[hidden]'));
  if (!els.length) return;
  const cur = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
  if (!cur) { els[0].focus({ preventScroll: false }); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bestS = 1e9;
  for (const e of els) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const s = along + across * 2.2;
    if (s < bestS) { bestS = s; best = e; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView({ block: 'nearest' }); }
}

function bindInput(h) {
  input.h = h;
  const { canvas } = h;

  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; document.body.classList.toggle('locked', input.locked); h.onLockChange && h.onLockChange(input.locked); });
  document.addEventListener('pointerlockerror', () => { input.lockFailed = true; });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    h.onAnyInput();
    setInputMode('kbm');
    if (!h.started()) return;
    e.preventDefault();
    if (h.menuOpen()) return;
    if (h.busy()) { h.onAdvance(); return; }
    const P = input.ptr;
    if (input.locked) { if (e.button === 0) h.onAttack(); else if (e.button === 2) h.onUse(); return; }
    if (e.button === 2) { h.onUseAt(e.clientX, e.clientY, false); return; }
    if (!input.lockFailed) requestLock(canvas);
    Object.assign(P, { lookId: e.pointerId, lx: e.clientX, ly: e.clientY, downT: performance.now(), moved: 0, button: e.button });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const P = input.ptr;
    if (input.locked) {
      const sens = 0.0024 * input.settings.sens;
      input.lookX -= e.movementX * sens; input.lookY -= e.movementY * sens * (input.settings.invert ? -1 : 1);
      return;
    }
    if (e.pointerId === P.lookId) {
      const dx = e.clientX - P.lx, dy = e.clientY - P.ly;
      P.lx = e.clientX; P.ly = e.clientY; P.moved += Math.abs(dx) + Math.abs(dy);
      const sens = 0.0042 * input.settings.sens;
      input.lookX -= dx * sens; input.lookY -= dy * sens * (input.settings.invert ? -1 : 1);
    }
  });
  const endPointer = (e) => {
    const P = input.ptr, up = e.type === 'pointerup';
    if (e.pointerId === P.lookId) {
      const quick = performance.now() - P.downT < 350 && P.moved < 10;
      P.lookId = null;
      if (quick && up && h.started() && !h.busy() && !h.menuOpen() && !input.locked) h.onUseAt(e.clientX, e.clientY, e.pointerType === 'mouse');
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => { if (h.started() && !h.busy() && !h.menuOpen()) { e.preventDefault(); h.onSwap(e.deltaY > 0 ? 1 : -1); } }, { passive: false });

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (h.jotOpen()) {
      if (k === 'escape') { e.preventDefault(); h.onJotClose(); }
      else if (k === 'enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); h.onJotSave(); }
      return;
    }
    h.onAnyInput();
    if (k === 'n' && h.started() && !h.ended() && !e.repeat) { e.preventDefault(); h.onJot(); return; }
    if (k === 'tab' || k === 'escape' || k === 'm' || k === 'i') {
      if (h.started() && !h.ended()) { if (k === 'escape' && !h.menuOpen() && !h.busy()) return; e.preventDefault(); if (k === 'escape') h.onBack(); else h.onMenu(); return; }
    }
    if (h.menuOpen()) {
      const dir = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' }[k];
      if (dir) { const a = document.activeElement; if (!(a && a.type === 'range' && (dir === 'left' || dir === 'right'))) { e.preventDefault(); navFocus(h.ui.menu, dir); } }
      if (k === 'q' || k === '[') h.onTab(-1); if (k === 'e' || k === ']') h.onTab(1);
      return;
    }
    if ((k === 'enter' || k === ' ') && e.target.closest && e.target.closest('button')) return;
    if (!h.started()) { if (k === 'enter') h.onStart(); return; }
    if (h.ended()) return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat && (k === 'e' || k === 'enter' || k === ' ' || k === 'f')) return;
    setInputMode('kbm');
    if (h.busy()) { if (['e', 'enter', ' ', 'escape'].includes(k)) h.onAdvance(); return; }
    if (k === 'e' || k === 'enter' || k === ' ') { h.onUse(); return; }
    if (k === 'f') { h.onAttack(); return; }
    if (k === 'q') { h.onSwap(1); return; }
    if (k === 'b') { h.onBook(); return; }
    if (k === '1' || k === '2' || k === '3') { h.onSelectTool(Number(k) - 1); return; }
    input.keys.add(k);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => input.keys.clear());
  addEventListener('gamepadconnected', (e) => { input.padSeen = true; h.onPadConnect && h.onPadConnect(e.gamepad); });
  addEventListener('gamepaddisconnected', () => { input.pad = null; h.onPadDisconnect && h.onPadDisconnect(); });
}

function saveSettings() { try { localStorage.setItem('farm-of-rust-settings', JSON.stringify(input.settings)); } catch (e) { /* storage unavailable */ } }

// one frame of input: keys and touch stick into a move vector, the controller polled and its buttons fired
function pollInput(dt) {
  const h = input.h, P = input.ptr;
  let mx = 0, my = 0;
  const K = input.keys;
  if (K.has('w') || K.has('arrowup')) my += 1;
  if (K.has('s') || K.has('arrowdown')) my -= 1;
  if (K.has('a') || K.has('arrowleft')) mx -= 1;
  if (K.has('d') || K.has('arrowright')) mx += 1;
  let sprint = K.has('shift');
  // the controller
  let pads = null;
  try { pads = navigator.getGamepads ? navigator.getGamepads() : null; input.padBlocked = false; } catch (e) { pads = null; input.padBlocked = true; }
  let pad = null;
  if (pads) for (const p of pads) if (p && p.connected && (p.mapping === 'standard' || p.buttons.length >= 16)) { pad = p; break; }
  input.pad = pad;
  if (pad) {
    const dz = (x, y, d = 0.15) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = Math.min(1, (m - d) / (1 - d)) / m; return [x * k, y * k]; };
    const [lx, ly] = dz(pad.axes[0] || 0, pad.axes[1] || 0), [rx, ry] = dz(pad.axes[2] || 0, pad.axes[3] || 0, 0.12);
    const b = (i) => pad.buttons[i] ? (pad.buttons[i].pressed || pad.buttons[i].value > 0.5) : false;
    const prev = input.padPrev, edge = (i) => b(i) && !prev[i];
    const any = lx || ly || rx || ry || pad.buttons.some(x => x && x.pressed);
    if (any) { setInputMode('pad'); h.onAnyInput(); }
    if (input.mode === 'pad') {
      mx += lx; my -= ly;
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
      const lookSpeed = 3.0 * input.settings.sens;
      input.lookX -= curve(rx) * lookSpeed * dt; input.lookY -= curve(ry) * lookSpeed * 0.75 * dt * (input.settings.invert ? -1 : 1);
      if (edge(PAD.L3)) input.sprintLatch = !input.sprintLatch;
      if (Math.hypot(lx, ly) < 0.2) input.sprintLatch = false;
      sprint = sprint || input.sprintLatch || b(PAD.LT);
      // buttons, with repeat on the d-pad for menus
      const rep = (i) => {
        if (!b(i)) { input.padRepeat[i] = 0; return false; }
        if (!prev[i]) { input.padRepeat[i] = 0.42; return true; }
        input.padRepeat[i] -= dt; if (input.padRepeat[i] <= 0) { input.padRepeat[i] = 0.11; return true; }
        return false;
      };
      const stick = { up: ly < -0.6, down: ly > 0.6, left: lx < -0.6, right: lx > 0.6 };
      input.stickPrev = input.stickPrev || {};
      const sEdge = (d) => stick[d] && !input.stickPrev[d];
      const nav = (d, btn) => rep(btn) || sEdge(d);
      if (h.menuOpen()) {
        for (const [d, btn] of [['up', PAD.UP], ['down', PAD.DOWN], ['left', PAD.LEFT], ['right', PAD.RIGHT]]) if (nav(d, btn)) h.onMenuNav(d);
        if (edge(PAD.A)) h.onMenuSelect();
        if (edge(PAD.B) || edge(PAD.MENU) || edge(PAD.VIEW)) h.onBack();
        if (edge(PAD.LB)) h.onTab(-1); if (edge(PAD.RB)) h.onTab(1);
        mx = my = 0; input.lookX = input.lookY = 0;
      } else if (h.screenOpen()) {
        for (const [d, btn] of [['up', PAD.UP], ['down', PAD.DOWN], ['left', PAD.LEFT], ['right', PAD.RIGHT]]) if (nav(d, btn)) h.onMenuNav(d);
        if (edge(PAD.A) || edge(PAD.MENU)) h.onMenuSelect();
        mx = my = 0;
      } else if (h.busy()) {
        if (edge(PAD.A) || edge(PAD.B) || edge(PAD.X)) h.onAdvance();
        if (edge(PAD.MENU) && !h.ended()) h.onMenu();          // the menu opens mid-sentence too, same as Tab
      } else {
        if (edge(PAD.A)) h.onUse();
        if (edge(PAD.X) || edge(PAD.RT)) h.onAttack();
        if (edge(PAD.Y)) h.onBook();
        if (edge(PAD.RB)) h.onSwap(1);
        if (edge(PAD.LB)) h.onSwap(-1);
        if (edge(PAD.MENU)) h.onMenu();
        if (edge(PAD.VIEW)) h.onMenu('collection');
        if (edge(PAD.B)) h.onBack();
      }
      input.stickPrev = stick;
    }
    input.padPrev = pad.buttons.map(x => x && (x.pressed || x.value > 0.5));
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  input.move.x = mx; input.move.y = my; input.sprint = sprint;
}
function takeLook() { const x = input.lookX, y = input.lookY; input.lookX = input.lookY = 0; return [x, y]; }
// ============================================================
// The morning: state, the dialogue box, the menu, moving between
// the shack and the yard, swinging the rebar, sound, and the loop.
// ============================================================
const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('scene'), hud: $('hud'), title: $('title'), start: $('start'), inside: $('btn-inside'), titleWs: $('btn-workshop'), reticle: $('reticle'),
  prompt: $('prompt'), promptName: $('prompt-name'), promptVerb: $('prompt-verb'), promptKey: $('prompt-key'), promptTag: $('prompt-tag'),
  book: $('btn-book'), menuBtn: $('btn-menu'), sound: $('btn-sound'), sndOn: $('snd-on'), sndOff: $('snd-off'),
  routine: $('routine'), routineToggle: $('routine-toggle'), routineTitle: $('routine-title'), routineCount: $('routine-count'), routineList: $('routine-list'), noticed: $('noticed'),
  thought: $('thought'), whisper: $('whisper'), keys: $('keys'), held: $('held'), heldName: $('held-name'), heldHint: $('held-hint'),
  dlg: $('dialogue'), dlgTag: $('dlg-tag'), dlgSpeaker: $('dlg-speaker'), dlgLine: $('dlg-line'), dlgContinue: $('dlg-continue'),
  doc: $('doc'), docPaper: $('doc-paper'), docHint: $('doc-hint'), toasts: $('toasts'),
  fxGoggles: $('fx-goggles'), fxFlash: $('fx-flash'), fxSplash: $('fx-splash'), fxFade: $('fx-fade'), fadeLine: $('fade-line'), fxHurt: $('fx-hurt'), fxSwirl: $('fx-swirl'), fxEgo: $('fx-ego'), fxPsychic: $('fx-psychic'),
  end: $('end'), endStats: $('end-stats'), endBack: $('end-back'), endIdeas: $('end-ideas'), endRestart: $('end-restart'),
  jot: $('jot'), jotThumb: $('jot-thumb'), jotCtx: $('jot-ctx'), jotKinds: $('jot-kinds'), jotText: $('jot-text'), jotWhere: $('jot-where'), jotCancel: $('jot-cancel'), jotSave: $('jot-save'),
  menu: $('menu'), menuTabs: $('menu-tabs'), menuBody: $('menu-body'), menuClose: $('menu-close'), menuFoot: $('menu-foot'),
  padNote: $('pad-note'),
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- what lasts between mornings: the things you've found, the pages you remember ----------
const save = { found: new Set(), book: new Set(), firstBit: false };
try { const s = JSON.parse(localStorage.getItem('farm-of-rust-collection') || '{}'); save.found = new Set(s.found || []); save.book = new Set(s.book || []); save.firstBit = !!s.firstBit; } catch (e) { /* storage unavailable */ }
function persist() { try { localStorage.setItem('farm-of-rust-collection', JSON.stringify({ found: [...save.found], book: [...save.book], firstBit: save.firstBit })); } catch (e) { /* storage unavailable */ } }

// ---------- state ----------
const newYard = () => ({ bucketHome: true, pailHome: true, gateOpen: false, fed: false, watered: false, milked: false, dung: 0, scooped: [false, false, false, false, false, false], jaws: 0, flowerFed: false, tomatoWatered: false, letter: false, rustyTalks: 0, cowTalks: {} });
const state = {
  started: false, ended: false, area: 'shack', dawn: 0, yardTime: 0,
  routine: {}, noticed: new Set(), uses: {}, seenBook: new Set(), flags: {}, target: null,
  owned: new Set(), held: null, carry: null, carryFull: false, load: null, chores: {}, yard: newYard(), transition: false, menu: false, menuTab: 'chores',
  workshop: false, lastItem: null, handoff: null,
};
try { state.workshop = localStorage.getItem('valtoria-workshop') === '1'; } catch (e) { /* storage unavailable */ }
const player = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0, eye: 1.62, eyeNow: 1.62, crouch: 0, crouchGoal: 0, lookDown: 0, held: 0, stun: 0, scramble: 0, run: 0 };
// walking pace: an easy stroll in the shack, a working walk outside, and outside only, a run at 2.2 times that
const SPEED = { inside: 1.2, outside: 1.55, run: 2.2, radius: 0.24 };
const ctx = { camera: null, temp: 37, started: false, resetIdol: false, player, busy: false, moving: false, sprinting: false, swinging: false, camLook: null };
const AREAS = { shack: null, yard: null };
let renderer, camera, post = null, W = null, area = null, body = null, vm = null, TB = null, last = 0, time = 0, shadowClock = 0, yardPromise = null, hitStop = 0;
const view = { baseFov: 60, runFov: 0 };
const TOOLS = {
  rebar: { name: 'Rebar knife', dmg: 1, reach: 1.7, cool: 0.45, impact: 0.15, sound: 'whoosh' },
  shovel: { name: 'Shovel', dmg: 2, reach: 2.15, cool: 0.9, impact: 0.36, sound: 'heavy' },
  crowbar: { name: 'Crowbar', dmg: 2, reach: 1.85, cool: 0.62, impact: 0.28, sound: 'heavy' },
};
const TOOL_ORDER = ['rebar', 'shovel', 'crowbar'];

function controlHint(what) {
  const pad = input.mode === 'pad', touch = isTouch();
  if (what === 'swing') return pad ? 'Press X or the right trigger to swing it.' : touch ? 'Tap Swing to use it.' : 'Press F, or left-click once the mouse is captured, to swing it.';
  if (what === 'swap') return pad ? 'Two tools now. LB and RB swap between them.' : touch ? 'Two tools now. Swap, by the Use button, changes between them.' : 'Two tools now. Q, the mouse wheel or the number keys swap between them.';
  if (what === 'run') return pad ? 'Out here there’s room to run: hold the left trigger, or click the left stick.' : touch ? 'Out here there’s room to run: tap Run, by the Use button.' : 'Out here there’s room to run: hold Shift.';
  if (what === 'menu') return pad ? 'Press ☰ for chores, your finds and the Book.' : touch ? 'The Menu button, top right, has chores, your finds and the Book.' : 'Tab or M for chores, your finds and the Book.';
  return '';
}

// ---------- sound: everything is synthesised, no audio files ----------
const audio = { ctx: null, master: null, muted: false, noise: null, buzz: null, wind: null, idle: null, timers: { tick: 4, fowl: 9, bellow: 28, mill: 6, creak: 12, chew: 3 } };
try { audio.muted = localStorage.getItem('farm-of-rust-muted') === '1'; } catch (e) { /* storage unavailable */ }
function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC(); audio.ctx = ac;
  audio.master = ac.createGain(); audio.master.gain.value = audio.muted ? 0 : 0.9;
  audio.duck = ac.createGain(); audio.lp = ac.createBiquadFilter(); audio.lp.type = 'lowpass'; audio.lp.frequency.value = 20000; audio.lp.Q.value = 0.5;
  audio.master.connect(audio.duck); audio.duck.connect(audio.lp); audio.lp.connect(ac.destination);
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  audio.noise = buf;
  // indoor air and outdoor wind share one noise bed with two filters
  const bed = ac.createBufferSource(); bed.buffer = buf; bed.loop = true;
  const room = ac.createBiquadFilter(); room.type = 'bandpass'; room.frequency.value = 420; room.Q.value = 0.7;
  const roomG = ac.createGain(); roomG.gain.value = 0.04;
  const wind = ac.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 650; wind.Q.value = 0.5;
  const windG = ac.createGain(); windG.gain.value = 0;
  bed.connect(room); room.connect(roomG); roomG.connect(audio.master); bed.connect(wind); wind.connect(windG); windG.connect(audio.master); bed.start();
  audio.room = roomG; audio.wind = { g: windG, f: wind };
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 196; o2.frequency.value = 213;
  const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 950; bf.Q.value = 1.1;
  const trem = ac.createGain(); trem.gain.value = 0.6;
  const lfo = ac.createOscillator(); lfo.frequency.value = 26; const lfoG = ac.createGain(); lfoG.gain.value = 0.35; lfo.connect(lfoG); lfoG.connect(trem.gain);
  const bg = ac.createGain(); bg.gain.value = 0;
  const bp = ac.createStereoPanner ? ac.createStereoPanner() : null;
  o1.connect(bf); o2.connect(bf); bf.connect(trem); trem.connect(bg); if (bp) { bg.connect(bp); bp.connect(audio.master); } else bg.connect(audio.master);
  o1.start(); o2.start(); lfo.start();
  audio.buzz = { g: bg, o1, o2, pan: bp };
}
function out(pan) {
  if (!pan || !audio.ctx.createStereoPanner) return audio.master;
  const p = audio.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(audio.master); return p;
}
function noiseHit({ dur = 0.1, type = 'bandpass', f = 2000, f2 = null, q = 1, gain = 0.3, attack = 0.003, delay = 0, pan = 0 } = {}) {
  if (!audio.ctx) return;
  const ac = audio.ctx, t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = audio.noise;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out(pan));
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone({ type = 'sine', f = 440, f2 = null, dur = 0.2, gain = 0.2, attack = 0.005, delay = 0, lp = null, pan = 0, vib = 0 } = {}) {
  if (!audio.ctx) return;
  const ac = audio.ctx, t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 7; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
  node.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
}
// where is a sound, relative to Jacob's ears?
function spot(p, range = 12) {
  if (!camera || !p) return { gain: 1, pan: 0 };
  const dx = p.x - camera.position.x, dz = p.z - camera.position.z, d = Math.hypot(dx, dz);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  return { gain: 1 / (1 + (d / range) ** 2 * 4), pan: d > 0.3 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.8 : 0 };
}
const sfx = {
  step(kind) {
    if (kind === 'dirt') { noiseHit({ type: 'bandpass', f: 1100, q: 0.8, dur: 0.09, gain: 0.12 }); noiseHit({ type: 'lowpass', f: 260, dur: 0.06, gain: 0.12 }); }
    else { noiseHit({ type: 'lowpass', f: 380, dur: 0.07, gain: 0.15 }); if (Math.random() < 0.3) tone({ type: 'sawtooth', f: 150 + Math.random() * 90, f2: 210 + Math.random() * 80, dur: 0.25, gain: 0.016, lp: 900 }); }
  },
  tick() { noiseHit({ f: 4200, q: 6, dur: 0.03, gain: 0.06 }); tone({ f: 1500 + Math.random() * 400, dur: 0.18, gain: 0.007 }); },
  clack() { noiseHit({ f: 2600, q: 3, dur: 0.035, gain: 0.5 }); tone({ type: 'triangle', f: 1900, dur: 0.06, gain: 0.07 }); },
  gulp() { for (const d of [0, 0.32]) tone({ f: 220, f2: 105, dur: 0.17, gain: 0.3, delay: d }); },
  paper() { for (let i = 0; i < 3; i++) noiseHit({ type: 'highpass', f: 2200, dur: 0.07, gain: 0.06, delay: i * 0.05 }); },
  splash() { noiseHit({ type: 'lowpass', f: 5500, f2: 500, dur: 0.6, gain: 0.3, attack: 0.01 }); noiseHit({ f: 1600, dur: 0.25, gain: 0.1, delay: 0.25 }); },
  board() { tone({ type: 'sawtooth', f: 120, f2: 190, dur: 0.38, gain: 0.03, lp: 700 }); noiseHit({ type: 'lowpass', f: 300, dur: 0.1, gain: 0.22, delay: 0.3 }); },
  bolts() { for (let i = 0; i < 3; i++) { noiseHit({ type: 'lowpass', f: 600, dur: 0.08, gain: 0.28, delay: i * 0.22 }); tone({ type: 'square', f: 640, f2: 520, dur: 0.1, gain: 0.02, lp: 2400, delay: i * 0.22 }); } },
  door() { tone({ type: 'sawtooth', f: 180, f2: 260, dur: 0.5, gain: 0.03, lp: 900 }); noiseHit({ type: 'lowpass', f: 500, dur: 0.12, gain: 0.25, delay: 0.45 }); },
  book() { sfx.paper(); tone({ f: 220, dur: 2.2, gain: 0.028, attack: 0.8 }); tone({ f: 329.6, dur: 2.2, gain: 0.02, attack: 0.9 }); },
  cloth() { noiseHit({ f: 900, dur: 0.3, gain: 0.1, attack: 0.05 }); },
  hum() { tone({ f: 55, dur: 2.6, gain: 0.07, attack: 0.9 }); tone({ f: 82.4, dur: 2.6, gain: 0.04, attack: 1.1 }); },
  fowl(s = { gain: 1, pan: 0 }) { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const f = 1900 + Math.random() * 700; tone({ f, f2: f * 1.18, dur: 0.09, gain: 0.016 * s.gain, delay: i * 0.13, pan: s.pan }); } },
  bellow(s = { gain: 1, pan: 0 }) { tone({ type: 'sawtooth', f: 98, f2: 70, dur: 1.4, gain: 0.045 * s.gain, attack: 0.15, lp: 420, pan: s.pan }); noiseHit({ type: 'highpass', f: 3000, dur: 0.7, gain: 0.022 * s.gain, attack: 0.1, delay: 1.3, pan: s.pan }); },
  whoosh(heavy) { noiseHit({ type: 'bandpass', f: heavy ? 300 : 700, f2: heavy ? 1100 : 2600, q: 1.4, dur: heavy ? 0.32 : 0.16, gain: heavy ? 0.22 : 0.16, attack: 0.04 }); },
  clang(big = 1, s = { gain: 1, pan: 0 }) { for (const [f, g] of [[420, 0.14], [1130, 0.09], [1970, 0.06], [2730, 0.04]]) tone({ f: f * (0.9 + Math.random() * 0.2), dur: 0.9 * big, gain: g * big * s.gain, attack: 0.002, pan: s.pan }); noiseHit({ type: 'highpass', f: 2500, dur: 0.06, gain: 0.3 * s.gain, pan: s.pan }); },
  thud() { tone({ f: 90, f2: 48, dur: 0.25, gain: 0.3 }); noiseHit({ type: 'lowpass', f: 400, dur: 0.12, gain: 0.25 }); },
  squeal(s = { gain: 1, pan: 0 }) { tone({ type: 'square', f: 900, f2: 1900, dur: 0.18, gain: 0.04 * s.gain, lp: 3000, pan: s.pan }); noiseHit({ type: 'highpass', f: 2000, dur: 0.1, gain: 0.12 * s.gain, pan: s.pan }); },
  hiss(s = { gain: 1, pan: 0 }) { noiseHit({ type: 'highpass', f: 3200, dur: 0.6, gain: 0.08 * s.gain, attack: 0.15, pan: s.pan }); },
  shriek(s = { gain: 1, pan: 0 }) { for (const f of [2300, 2950, 3600]) tone({ type: 'sawtooth', f, f2: f * 1.25, dur: 0.7, gain: 0.018 * s.gain, attack: 0.02, lp: 6000, vib: 60, pan: s.pan }); },
  psychic() { tone({ f: 1760, f2: 2400, dur: 1.6, gain: 0.03, attack: 0.3, vib: 140 }); tone({ type: 'sawtooth', f: 55, dur: 1.8, gain: 0.04, attack: 0.4, lp: 300 }); },
  snap() { noiseHit({ type: 'bandpass', f: 1800, q: 2, dur: 0.05, gain: 0.5 }); tone({ f: 70, f2: 40, dur: 0.2, gain: 0.25 }); },
  ring() { for (const f of [3100, 4700, 6300]) tone({ f: f * (0.95 + Math.random() * 0.1), dur: 0.5, gain: 0.02, attack: 0.002 }); noiseHit({ type: 'highpass', f: 5000, dur: 0.12, gain: 0.1 }); },
  crunch() { for (let i = 0; i < 3; i++) noiseHit({ type: 'bandpass', f: 1600, q: 1.5, dur: 0.06, gain: 0.12, delay: i * 0.08 }); },
  clank() { tone({ type: 'triangle', f: 880, dur: 0.18, gain: 0.05 }); tone({ type: 'triangle', f: 1340, dur: 0.12, gain: 0.03, delay: 0.02 }); noiseHit({ type: 'highpass', f: 3000, dur: 0.04, gain: 0.15 }); },
  scoop() { noiseHit({ type: 'lowpass', f: 900, dur: 0.25, gain: 0.25, attack: 0.03 }); noiseHit({ type: 'bandpass', f: 2200, dur: 0.12, gain: 0.08, delay: 0.1 }); },
  binClang(s) { sfx.clang(0.7, s); tone({ f: 160, f2: 90, dur: 0.3, gain: 0.15 * s.gain, pan: s.pan }); },
  dumpFeed() { for (let i = 0; i < 6; i++) noiseHit({ type: 'bandpass', f: 1200 + Math.random() * 800, q: 1, dur: 0.08, gain: 0.12, delay: i * 0.06 }); sfx.clang(0.25); },
  pour() { noiseHit({ type: 'bandpass', f: 900, f2: 1300, q: 0.7, dur: 1.2, gain: 0.16, attack: 0.15 }); },
  fill() { noiseHit({ type: 'bandpass', f: 500, f2: 1600, q: 0.8, dur: 1.5, gain: 0.14, attack: 0.1 }); tone({ type: 'square', f: 300, f2: 700, dur: 1.5, gain: 0.006, lp: 1200 }); },
  milk() { for (let i = 0; i < 7; i++) { tone({ f: 110, f2: 70, dur: 0.12, gain: 0.18, delay: 0.3 + i * 0.36 }); noiseHit({ type: 'lowpass', f: 700, dur: 0.1, gain: 0.08, delay: 0.3 + i * 0.36 }); } },
  gate() { tone({ type: 'sawtooth', f: 620, f2: 940, dur: 1.0, gain: 0.03, attack: 0.05, lp: 2600, vib: 40 }); noiseHit({ type: 'lowpass', f: 400, dur: 0.15, gain: 0.25, delay: 0.95 }); },
  snort(s = { gain: 1, pan: 0 }) { noiseHit({ type: 'bandpass', f: 380, q: 1.2, dur: 0.6, gain: 0.35 * s.gain, attack: 0.04, pan: s.pan }); tone({ type: 'sawtooth', f: 62, f2: 50, dur: 0.8, gain: 0.06 * s.gain, lp: 260, pan: s.pan }); },
  pry() { tone({ type: 'sawtooth', f: 90, f2: 140, dur: 0.7, gain: 0.04, lp: 600 }); noiseHit({ type: 'bandpass', f: 1500, q: 2, dur: 0.08, gain: 0.4, delay: 0.75 }); },
  bloom() { for (const [f, d] of [[392, 0], [494, 0.15], [587, 0.3], [784, 0.45]]) tone({ f, dur: 2.4, gain: 0.03, attack: 0.4, delay: d }); },
  sizzle() { noiseHit({ type: 'highpass', f: 5000, dur: 0.7, gain: 0.08, attack: 0.05 }); },
  engine() {
    for (let i = 0; i < 9; i++) noiseHit({ type: 'lowpass', f: 300, dur: 0.07, gain: 0.3, delay: i * (0.22 - i * 0.012) });
    tone({ type: 'sawtooth', f: 38, f2: 46, dur: 3, gain: 0.08, attack: 0.6, delay: 1.2, lp: 300 });
  },
  pickup(kind) {
    if (kind === 'bit') { for (const [f, d] of [[2093, 0], [2637, 0.06], [3136, 0.12]]) tone({ f, dur: 0.5, gain: 0.03, delay: d }); return; }
    if (kind === 'echo') { for (const [f, d] of [[660, 0], [990, 0.1], [1320, 0.2]]) tone({ f, dur: 1.4, gain: 0.04, attack: 0.01, delay: d }); return; }
    tone({ type: 'triangle', f: 520, dur: 0.4, gain: 0.05 }); tone({ type: 'triangle', f: 780, dur: 0.35, gain: 0.03, delay: 0.08 });
  },
  mill() { tone({ f: 46, f2: 38, dur: 0.35, gain: 0.03, lp: 200 }); },
  creak() { tone({ type: 'sawtooth', f: 240, f2: 300, dur: 0.6, gain: 0.008, lp: 1200, vib: 10 }); },
  chew(s) { for (let i = 0; i < 4; i++) noiseHit({ type: 'bandpass', f: 700 + Math.random() * 500, q: 2, dur: 0.05, gain: 0.07 * s.gain, delay: i * 0.18, pan: s.pan }); },
};
// while Jacob thinks out loud the world goes quiet and dull, as if heard through his own head
voice.duck = (on) => {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  audio.duck.gain.setTargetAtTime(on ? 0.4 : 1, t, on ? 0.08 : 0.35);
  audio.lp.frequency.setTargetAtTime(on ? 1150 : 20000, t, on ? 0.08 : 0.45);
};
function setMuted(m) {
  audio.muted = m;
  if (m) stopVoice();
  if (audio.master) audio.master.gain.setTargetAtTime(m ? 0 : 0.9, audio.ctx.currentTime, 0.05);
  ui.sound.setAttribute('aria-pressed', String(m));
  ui.sndOn.hidden = m; ui.sndOff.hidden = !m;
  try { localStorage.setItem('farm-of-rust-muted', m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}

// ---------- effects ----------
const shake = { t: 0, amp: 0 };
function flash(el) { el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on'); }
const fx = {
  drink() { sfx.gulp(); flash(ui.fxFlash); if (!reduceMotion) { shake.t = 0.9; shake.amp = 0.02; } },
  scatter() { sfx.clack(); W.scatterFlies(); },
  splash() { sfx.splash(); flash(ui.fxSplash); },
  openBoard() { W.boardState.open = true; sfx.board(); },
  closeBoard() { W.boardState.open = false; sfx.board(); },
  gear() { state.flags.gear = true; ui.fxGoggles.hidden = false; sfx.cloth(); },
  hurt(amount = 1) { flash(ui.fxHurt); if (!reduceMotion) { shake.t = 0.35; shake.amp = 0.02 * amount; } rumble(0.4 * amount, 0.6 * amount, 160); },
  ego() { flash(ui.fxEgo); rumble(0.2, 0.1, 600); },
  psychic() { flash(ui.fxPsychic); sfx.psychic(); rumble(0.3, 0.1, 800); },
  swirl(s) { player.scramble = s; ui.fxSwirl.classList.toggle('is-on', s > 0); },
  kickWeed() { body.kick(); player.lookDown = 1.3; const w = area.Y.weeds.find(x => x.pen); setTimeout(() => { sfx.crunch(); }, 450); setTimeout(() => { w.gone = true; w.flying = 0; sfx.thud(); rumble(0.3, 0.4, 150); }, 950); },
  milking(on) { player.crouchGoal = on ? 1 : 0; },
  pourAt(p) { for (let i = 0; i < 40; i++) setTimeout(() => area.Y && area.Y.water.emit(p.x + rand(-0.06, 0.06), p.y + 0.5, p.z + rand(-0.06, 0.06), { vy: -1.5, vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2), life: 0.5, size: 0.03, alpha: 0.7, color: [0.55, 0.62, 0.6], grav: 4 }), 300 + i * 18); },
  tapRun() { const t = area.Y.tap; for (let i = 0; i < 50; i++) setTimeout(() => area.Y.water.emit(t.x, t.y, t.z, { vy: -1, life: 0.35, size: 0.02, alpha: 0.7, color: [0.55, 0.62, 0.6], grav: 6 }), 200 + i * 22); },
  flingDung(pile) { const Y = area.Y; fling.push({ from: new THREE.Vector3(pile.x, 0.3, pile.z), to: new THREE.Vector3(YARD.bin.x, 1.0, YARD.bin.z), t: 0, dur: 0.55, mesh: Y.dung[pile.k].group }); },
};
const fling = [];

// ---------- dialogue box and documents ----------
const dlg = { queue: [], cur: null, text: '', chars: 0, typing: false, waiting: 0 };
function busy() { return !!dlg.cur || dlg.queue.length > 0 || !ui.doc.hidden || state.ended || state.transition; }
function say(beats) { dlg.queue.push(...beats); if (!dlg.cur) next(); }
function next() {
  dlg.cur = dlg.queue.shift() || null;
  const b = dlg.cur;
  if (!b) { ui.dlg.hidden = true; stopVoice(); return; }
  if (b.fn) { dlg.cur = null; b.fn(); next(); return; }
  if (b.wait) { ui.dlg.hidden = true; dlg.waiting = b.wait; return; }
  if (b.doc) { ui.dlg.hidden = true; showDoc(b.doc); return; }
  if (typeof b.text !== 'string' || !b.text) { console.error('empty line', b); dlg.cur = null; next(); return; }   // never show a blank box
  if (b.who === 'book' && b.key) { state.seenBook.add(b.key); if (!save.book.has(b.key)) { save.book.add(b.key); persist(); } }
  ui.dlg.hidden = false; clearBark();
  ui.dlg.className = 'dialogue' + ({ book: ' is-book', stage: ' is-stage', hint: ' is-hint' }[b.who] || '');
  const speaker = b.who === 'book' ? (b.surfaced ? 'From memory · The Book of Lost Echoes' : 'The Book of Lost Echoes') : b.who === 'hint' ? 'Tip' : b.who === 'stage' ? '' : 'Jacob';
  ui.dlgSpeaker.textContent = speaker; ui.dlgSpeaker.hidden = !speaker;
  if (b.who === 'hint') ui.dlgTag.innerHTML = '';
  else { const [tag, src] = provOf(b); ui.dlgTag.innerHTML = tagHTML(tag, src); noteHeard(b); }
  dlg.text = b.text; dlg.chars = 0; dlg.typing = !reduceMotion;
  ui.dlgLine.textContent = reduceMotion ? b.text : '';
  // his thoughts, and the Book in the voice he remembers it in; stage lines and tips stay silent
  if (b.who === 'jacob' || b.who === 'book') speak(b.text, b.who, { muted: audio.muted, onEnd: () => autoAdvance(b) });
  else stopVoice();
  ui.dlgContinue.textContent = input.mode === 'pad' ? 'Press A to continue' : isTouch() ? 'Tap to continue' : 'Click or press E to continue';
}
function autoAdvance(b) {
  if (!voice.settings.auto) return;
  setTimeout(() => { if (dlg.cur === b && !state.menu) { if (dlg.typing) advance(); advance(); } }, 650);
}
function advance() {
  if (!ui.doc.hidden) { closeDoc(); return; }
  if (!dlg.cur || dlg.waiting > 0) return;
  if (dlg.typing) { dlg.typing = false; ui.dlgLine.textContent = dlg.text; return; }
  dlg.cur = null; next();
}
function updateDialogue(dt) {
  if (dlg.waiting > 0) { dlg.waiting -= dt; if (dlg.waiting <= 0) { dlg.waiting = 0; dlg.cur = null; next(); } return; }
  if (dlg.typing) {
    dlg.chars += dt * 58;
    const n = Math.floor(dlg.chars);
    ui.dlgLine.textContent = dlg.text.slice(0, n);
    if (n >= dlg.text.length) dlg.typing = false;
  }
}
function showDoc(key) {
  ui.docPaper.innerHTML = DOCS[key]();
  ui.doc.hidden = false;
  ui.docHint.textContent = input.mode === 'pad' ? 'Press A to put it down' : `${isTouch() ? 'Tap' : 'Click'} anywhere to put it down`;
  sfx.paper();
}
function closeDoc() {
  ui.doc.hidden = true; sfx.paper();
  if (dlg.cur && dlg.cur.doc) { dlg.cur = null; next(); }
}
// a passing thought: on screen for a moment and spoken in his head, without stopping him where he stands
const thought = { timer: 0 };
function bark(text) {
  if (!text || busy() || state.menu || state.ended) return;
  const [tag, src] = provOf({ who: 'jacob', text });
  ui.thought.innerHTML = `${esc(text)}<span class="tagline ws">${tagHTML(tag, src)}</span>`; ui.thought.classList.add('is-on');
  clearTimeout(thought.timer);
  thought.timer = setTimeout(() => ui.thought.classList.remove('is-on'), clamp(1800 + text.length * 60, 2600, 6500));
  speak(text, 'jacob', { muted: audio.muted });
}
function clearBark() { clearTimeout(thought.timer); ui.thought.classList.remove('is-on'); }
function toast(text, kind = '') {
  const el = document.createElement('p'); el.className = 'toast ' + kind; el.textContent = text;
  ui.toasts.appendChild(el);
  while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  setTimeout(() => el.classList.add('is-out'), 3200); setTimeout(() => el.remove(), 3800);
}

// ---------- routine, chores and the HUD ----------
function complete(key) { if (state.routine[key]) return; state.routine[key] = true; updateHud(); }
function completeChore(key) {
  if (state.chores[key]) return;
  state.chores[key] = true; sfx.pickup('curio');
  const c = CHORES.find(c => c.key === key);
  toast(`Done · ${c.label().replace(/\s*\(.*\)$/, '')}`, 'is-chore');
  updateHud();
  const left = CHORES.filter(c => !state.chores[c.key]).length;
  if (left === 0) setTimeout(() => say([J('That’s the lot. Every chore on the list.'), J('Tractor, then town. Before the heat gets serious.')]), 600);
}
function renderChecklist() {
  const L = ui.routineList;
  let items;
  if (state.area === 'yard') {
    ui.routineTitle.textContent = 'Yard chores';
    items = CHORES.map(c => ({ key: c.key, text: c.label(), done: !!state.chores[c.key] }));
    const ready = state.yard.dung >= 6 && state.yard.milked;
    items.push({ key: 'go', text: FINAL_CHORE.label, final: true, ready });
    ui.routineCount.textContent = `${CHORES.filter(c => state.chores[c.key]).length}/${CHORES.length}`;
    const n = FOUND.filter(f => save.found.has(f.id)).length;
    ui.noticed.textContent = `Found ${n} of ${FOUND.length} · Menu for the list`;
  } else {
    ui.routineTitle.textContent = 'Before work';
    items = ROUTINE.map(k => ({ key: k, text: ROUTINE_LABEL[k], done: !!state.routine[k] }));
    items.push({ key: 'out', text: 'Head out', final: true, ready: state.routine.gear && state.routine.rebar });
    ui.routineCount.textContent = `${ROUTINE.filter(k => state.routine[k]).length}/${ROUTINE.length}`;
    if (W) ui.noticed.textContent = `Noticed ${state.noticed.size} of ${W.items.length}`;
  }
  const sig = items.map(i => i.key + i.text + (i.done ? 1 : 0) + (i.ready ? 1 : 0)).join('|');
  if (L.dataset.sig === sig) return;
  L.dataset.sig = sig;
  L.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li'); li.textContent = it.text;
    if (it.done) li.classList.add('done');
    if (it.final) { li.classList.add('is-final'); if (it.ready) li.classList.add('ready'); }
    L.appendChild(li);
  }
}
function updateHud() {
  renderChecklist();
  ui.book.classList.toggle('is-pulsing', !state.flags.bookFirst && state.area === 'shack');
  const t = state.held ? TOOLS[state.held] : null;
  ui.held.hidden = !t;
  if (t) {
    ui.heldName.textContent = t.name + (state.held === 'shovel' && state.load ? (state.load === 'feed' ? ' · feed' : ' · dung') : '');
    const n = TOOL_ORDER.filter(k => state.owned.has(k)).length;
    ui.heldHint.textContent = n > 1 ? (input.mode === 'pad' ? 'LB / RB swap' : isTouch() ? '' : 'Q swap') : '';
  }
  updateKeysHint();
}
// only what can be done right now: no swing without a tool, no swap with one, no running indoors
function updateKeysHint() {
  const pad = input.mode === 'pad', out = state.area === 'yard', tool = !!state.held, many = TOOL_ORDER.filter(k => state.owned.has(k)).length > 1;
  const parts = pad
    ? ['<span class="pad-b a">A</span> use', tool && '<span class="pad-b x">X</span> swing', many && '<kbd>LB</kbd><kbd>RB</kbd> swap', out && '<kbd>LT</kbd> run', '<span class="pad-b y">Y</span> Book', '<kbd>☰</kbd> menu']
    : ['<kbd>WASD</kbd> walk', out && '<kbd>Shift</kbd> run', `${input.locked ? 'mouse' : 'drag'} to look`, '<kbd>E</kbd> use', tool && '<kbd>F</kbd> swing', many && '<kbd>Q</kbd> swap', '<kbd>B</kbd> Book', '<kbd>Tab</kbd> menu'];
  const html = parts.filter(Boolean).join(' · ');
  if (ui.keys.innerHTML !== html) ui.keys.innerHTML = html;
}
function setRoutineOpen(open) { ui.routine.dataset.open = String(open); ui.routineToggle.setAttribute('aria-expanded', String(open)); }

// ---------- tools and carrying ----------
function takeTool(name, quiet = false) {
  const first = !state.owned.has(name);
  state.owned.add(name);
  if (name === 'rebar' && W) W.setRebar(false);
  equip(name, !quiet && first);
  if (first && !quiet) toast(`${TOOLS[name].name} · ${TOOL_ORDER.filter(k => state.owned.has(k)).length > 1 ? 'swap tools any time' : 'in hand'}`, 'is-tool');
}
function equip(name) {
  if (state.held === name) return;
  state.held = name; vm.setTool(name);
  if (name !== 'shovel' && state.load) setLoad(null);
  sfx.clank(); updateHud();
}
function swapTool(dir = 1) {
  const owned = TOOL_ORDER.filter(k => state.owned.has(k));
  if (owned.length < 2) { if (owned.length === 1 && !state.held) equip(owned[0]); return; }
  const i = owned.indexOf(state.held);
  equip(owned[(i + dir + owned.length) % owned.length]);
}
function setLoad(kind) { state.load = kind; vm.setLoad(kind); updateHud(); }
function setCarry(kind, full = false) {
  if (state.carry && kind !== state.carry) {
    // putting one thing down to pick up another: it goes back where it lives
    if (state.carry === 'bucket') { state.yard.bucketHome = true; area.Y.bucket.visible = true; }
    if (state.carry === 'pail') { state.yard.pailHome = true; area.Y.pail.visible = true; }
  }
  state.carry = kind; state.carryFull = !!full; vm.setCarry(kind, full);
  if (!kind && area && area.Y) { /* carried thing is used up or stowed */ }
}

// ---------- found things ----------
function findThing(id) {
  if (save.found.has(id)) return;
  const def = FOUND.find(f => f.id === id), it = area.Y && area.Y.found.find(x => x.def.id === id);
  save.found.add(id); persist();
  if (it) { it.model.visible = false; area.setGlint(it, false); }
  sfx.pickup(def.kind); vm.play('reach:take');
  const kind = FOUND_KIND[def.kind], got = FOUND.filter(f => f.kind === def.kind && save.found.has(f.id)).length, total = FOUND.filter(f => f.kind === def.kind).length;
  toast(`${kind.one} found · ${def.kind === 'bit' ? 'Bit' : def.name} · ${got} of ${total}`, 'is-' + def.kind);
  rumble(0.15, 0.05, 90);
  const beats = [];
  if (def.kind === 'bit') { if (!save.firstBit) { save.firstBit = true; persist(); beats.push(J('A Bit. Anima quartz. Twenty-four more and the water tax is merely late.')); } }
  else {
    beats.push(J(def.line));
    if (def.book) beats.push(BK(def.book, true), J(BOOK_REACT[def.book]()));
    if (!state.flags.menuTip) { state.flags.menuTip = true; beats.push(TIP(controlHint('menu'))); }
  }
  if (beats.length) say(beats);
  renderChecklist();
}

// ---------- using things ----------
function useItem(it) {
  if (!it || !state.started || busy() || state.menu) return;
  const n = state.uses[it.id] || 0;
  state.uses[it.id] = n + 1;
  state.lastItem = it;
  if (state.area === 'shack') {
    if (!state.noticed.has(it.id)) { state.noticed.add(it.id); W.setGlint(it, false); }
    say(ACTS[it.id](n));
  } else {
    const act = YACTS[it.act || it.id];
    if (act) say(act(n, it));
  }
  updateHud();
}
function readBook() {
  if (!state.started || busy() || state.menu) return;
  let key;
  if (!state.flags.bookFirst) { key = 'garden'; state.flags.bookFirst = true; }
  else {
    const near = state.target && (state.area === 'shack'
      ? { bed: 'rest', tins: 'temples', basin: 'mirrors', door: 'locks', drum: 'serpents', idol: 'mercy', window: 'beginning' }[state.target.id]
      : { tractor: 'roads', ngate: 'roads', tank: 'serpents', tap: 'serpents', still: 'serpents', firepit: 'weary', boab: 'mercy', stobie: 'towers', clothesline: 'rest', ydoor: 'stranger', cow: 'beginning', fowl: 'garden', ute: 'chariots', chair: 'choosing' }[state.target.act || state.target.id]);
    const unseen = Object.keys(BOOK).filter(k => !state.seenBook.has(k));
    key = near && !state.seenBook.has(near) ? near : unseen.length ? pick(unseen) : pick(Object.keys(BOOK));
  }
  updateHud();
  say([DO(() => sfx.book()), BK(key), J(BOOK_REACT[key]()), ...(state.area === 'shack' ? [DONE('book')] : [])]);
}

// ---------- the swing ----------
const combat = { cool: 0, pending: null };
function attack() {
  if (!state.started || busy() || state.menu || !state.held || combat.cool > 0) return;
  const T = TOOLS[state.held];
  combat.cool = T.cool; combat.pending = { t: T.impact, tool: state.held };
  vm.play(state.held + ':swing'); sfx.whoosh(T.sound === 'heavy');
  ctx.swinging = true; setTimeout(() => { ctx.swinging = false; }, 300);
  rumble(0.08, 0.0, 60);
}
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
function resolveHit(tool) {
  const T = TOOLS[tool];
  camera.getWorldDirection(_fwd);
  const origin = camera.position;
  let best = null, bestS = 1e9;
  const consider = (t, pos, r) => {
    _to.copy(pos).sub(origin);
    const d = _to.length(), reachD = d - r;
    if (reachD > T.reach) return;
    const ang = Math.acos(clamp(_to.dot(_fwd) / Math.max(d, 1e-4), -1, 1)), tol = Math.atan2(r, Math.max(d, 0.2)) + 0.32;
    if (ang > tol) return;
    const s = reachD + ang * 0.9;
    if (s < bestS) { bestS = s; best = { t, pos: pos.clone(), d }; }
  };
  if (state.area === 'yard') {
    const Y = area.Y;
    for (const t of area.targets()) {
      if (t.jaw && (t.jaw.state === 'gone' || t.jaw.state === 'flee')) continue;
      if (t.id === 'devil' && Y.devil.state !== 'stuck') continue;
      if (t.wall) continue;
      consider(t, t.pos, t.r);
    }
    for (const tf of Y.tufts) if (tf.cut < 0.5) consider({ id: 'tuft', tuft: tf }, _v4.set(tf.x, 0.3, tf.z).clone(), 0.3 * tf.s);
    for (const w of Y.weeds) if (!w.gone) consider({ id: 'weed', weed: w }, new THREE.Vector3(w.x, 0.05, w.z), 0.2);
    for (const p of Y.peas.list) consider({ id: 'pea', pea: p }, new THREE.Vector3(p.x, p.y, p.z), 0.12);
    { const rr = Math.hypot(player.x, player.z); if (rr > YARD.R - 2.8) { const a = Math.atan2(player.z, player.x); consider({ id: 'hand' }, new THREE.Vector3(Math.cos(a) * (YARD.R - 0.4), 0.45, Math.sin(a) * (YARD.R - 0.4)), 0.5); } }
    const RN = YARD.run; consider({ id: 'run' }, new THREE.Vector3((RN.x0 + RN.x1) / 2, 0.4, (RN.z0 + RN.z1) / 2), 1.4);
    consider({ id: 'tank' }, new THREE.Vector3(YARD.tank.x, 1.8, YARD.tank.z), 1.0);
  } else for (const t of W.hitTargets) consider(t, t.pos, t.r);
  // the house wall, or any wall in the shack, if nothing else was in the way
  if (!best) {
    const wallD = state.area === 'shack' ? shackWallDistance() : yardWallDistance();
    if (wallD !== null && wallD < T.reach) best = { t: { id: 'wall' }, pos: origin.clone().addScaledVector(_fwd, wallD), d: wallD };
  }
  if (!best) return;
  const r = hitTarget(best.t, T, best.pos);
  if (!r) return;
  // feedback: sparks or dust where it landed, a little stop in time, a kick, a rumble
  const P = state.area === 'yard' ? area.Y : null;
  if (P && r.fx === 'spark') for (let i = 0; i < 14; i++) P.sparks.emit(best.pos.x, best.pos.y, best.pos.z, { vx: rand(-2, 2), vy: rand(0.5, 3), vz: rand(-2, 2), life: rand(0.2, 0.5), size: 0.03, alpha: 1, color: [1, 0.75, 0.35], drag: 1.2, grav: 8 });
  if (P && r.fx === 'dust') for (let i = 0; i < 8; i++) P.dust.emit(best.pos.x, best.pos.y, best.pos.z, { vx: rand(-0.6, 0.6), vy: rand(0.2, 0.8), vz: rand(-0.6, 0.6), life: rand(0.8, 1.4), size: 0.08, size1: 0.35, alpha: 0.5, color: [0.75, 0.45, 0.3], drag: 2 });
  if (P && r.fx === 'glass') for (let i = 0; i < 12; i++) P.sparks.emit(best.pos.x, best.pos.y, best.pos.z, { vx: rand(-1.5, 1.5), vy: rand(0.5, 2), vz: rand(-1.5, 1.5), life: 0.4, size: 0.02, alpha: 1, color: [1, 0.9, 0.6], drag: 1, grav: 6 });
  if (P && r.fx === 'copper') for (let i = 0; i < 10; i++) P.sparks.emit(best.pos.x, best.pos.y, best.pos.z, { vx: rand(-1.5, 1.5), vy: rand(0.5, 2.2), vz: rand(-1.5, 1.5), life: 0.35, size: 0.025, alpha: 1, color: [0.6, 0.85, 1], drag: 1, grav: 7 });
  hitStop = reduceMotion ? 0 : (r.stop ?? 0.06);
  if (!reduceMotion) { shake.t = 0.18; shake.amp = r.shake ?? 0.01; }
  rumble(r.rumble?.[0] ?? 0.3, r.rumble?.[1] ?? 0.4, r.rumble?.[2] ?? 120);
  if (r.line) { const list = LINES[r.line], k = (state.flags['l-' + r.line] = (state.flags['l-' + r.line] || 0) + 1) - 1; if (r.always || k < list.length) bark(list[k % list.length]); }
}
function shackWallDistance() {
  camera.getWorldDirection(_fwd); const o = camera.position;
  let best = null;
  for (const [axis, at] of [['x', RX], ['x', -RX], ['z', RZ], ['z', -RZ]]) {
    const dv = axis === 'x' ? _fwd.x : _fwd.z, ov = axis === 'x' ? o.x : o.z;
    if (Math.abs(dv) < 1e-3) continue; const t = (at - ov) / dv; if (t > 0 && (best === null || t < best)) best = t;
  }
  return best;
}
function yardWallDistance() {
  camera.getWorldDirection(_fwd); const o = camera.position, hz = YARD.house.z;
  // only the house: a box from x -3.05..3.05, z -5.8..-1.2
  const tz = (-1.2 - o.z) / _fwd.z;
  if (_fwd.z < 0 && tz > 0) { const x = o.x + _fwd.x * tz, y = o.y + _fwd.y * tz; if (x > -3.05 && x < 3.05 && y > 0.3 && y < 2.6) return tz; }
  return null;
}
function hitTarget(t, T, pos) {
  const s = spot(pos), Y = area.Y;
  switch (t.id) {
    case 'jaw': {
      const j = t.jaw; j.hp -= T.dmg; j.hurt = 0.4; sfx.squeal(s); sfx.clang(0.35, s);
      const away = Math.atan2(j.x - player.x, j.z - player.z); j.x += Math.sin(away) * 0.35; j.z += Math.cos(away) * 0.35;
      if (j.hp <= 0) { j.state = 'flee'; j.t = 0; j.fleeTo = new THREE.Vector3(j.x, 0, j.z).setLength(YARD.R + 0.6); }
      return { fx: 'copper', stop: 0.08, rumble: [0.5, 0.6, 140], shake: 0.012 };
    }
    case 'flies': {
      if (state.area === 'shack') { if (W.flies.mode === 'home') { fx.scatter(); complete('flies'); } return { fx: null, stop: 0.02, rumble: [0.1, 0, 60] }; }
      Y.flies.scatter = 12; sfx.clack(); return { fx: null, stop: 0.02, rumble: [0.1, 0, 60] };
    }
    case 'tuft': { const tf = t.tuft; tf.cut = 1; tf.dirty = true; sfx.ring(); return { fx: 'glass', stop: 0.04, rumble: [0.2, 0.2, 80] }; }
    case 'weed': {
      if (t.weed.pen) { bark('Not with the blade. Boot heel, and quick, before the spores go.'); return { fx: 'dust', stop: 0.02 }; }
      t.weed.gone = true; t.weed.mesh.visible = false; sfx.crunch(); return { fx: 'dust', stop: 0.03, rumble: [0.2, 0.2, 80] };
    }
    case 'pea': { t.pea.shut = 3; sfx.shriek(s); for (const p of Y.peas.list) if (Math.hypot(p.x - t.pea.x, p.z - t.pea.z) < 5) p.shut = Math.max(p.shut, 1.5); return { fx: 'dust', stop: 0.05, rumble: [0.3, 0.3, 200], line: 'pea' }; }
    case 'hand': sfx.shriek(); fx.psychic(); return { fx: 'dust', stop: 0.06, rumble: [0.5, 0.3, 300], line: 'hand' };
    case 'run': for (const b of Y.fowl.birds) b.panic = 4; sfx.fowl(); sfx.fowl(); return { fx: 'dust', stop: 0.03, rumble: [0.2, 0.1, 80] };
    case 'cow': {
      const c = t.cow; c.glare = 3.5;
      if (c.bull) { c.snort = 6; c.paw = 1.6; sfx.snort(s); return { fx: 'spark', stop: 0.1, rumble: [0.7, 0.9, 260], shake: 0.02, line: 'bull' }; }
      sfx.bellow(s); return { fx: 'dust', stop: 0.07, rumble: [0.4, 0.5, 180], line: 'cow' };
    }
    case 'ironbarktree': sfx.clang(1.6, s); fx.hurt(0.6); return { fx: 'spark', stop: 0.14, rumble: [0.9, 1, 320], shake: 0.03, line: 'ironbark' };
    case 'boab': sfx.thud(); return { fx: 'dust', stop: 0.05, rumble: [0.3, 0.4, 150], line: 'boab' };
    case 'devil': sfx.thud(); return { fx: 'dust', stop: 0.05, rumble: [0.3, 0.3, 120], line: 'devil' };
    case 'tractor': case 'ute': case 'tank': sfx.clang(0.9, s); return { fx: 'spark', stop: 0.07, rumble: [0.5, 0.6, 160] };
    case 'wall': case 'house': sfx.thud(); return { fx: 'dust', stop: 0.05, rumble: [0.35, 0.45, 140], line: state.area === 'yard' ? 'house' : null };
    default: return { fx: 'dust', stop: 0.03 };
  }
}

// ---------- the yard's own events: the fence grabs, the grass bites, the fowl warn ----------
function yardEvent(type, data) {
  const s = data && data.x !== undefined ? spot(new THREE.Vector3(data.x, 0.5, data.z)) : { gain: 1, pan: 0 };
  const line = (key, chance = 1) => { if (busy()) return; const list = LINES[key], k = (state.flags['l-' + key] = (state.flags['l-' + key] || 0) + 1) - 1; if (k < list.length && R() < chance) bark(list[k]); };
  switch (type) {
    case 'grab': sfx.snap(); fx.hurt(0.8); player.stun = 0.9; player.vx = player.vz = 0; { const a = Math.atan2(player.z, player.x); player.x -= Math.cos(a) * 0.3; player.z -= Math.sin(a) * 0.3; } line('grab', 0.8); break;
    case 'lash': sfx.ring(); fx.hurt(0.5); line('lash', 0.7); break;
    case 'scramble': fx.swirl(3.2); sfx.hum(); rumble(0.3, 0.2, 400); line('scramble'); break;
    case 'raidWarn': fx.psychic(); line('raidWarn'); break;
    case 'raidStart': line('raidStart'); break;
    case 'hiss': sfx.hiss(s); if (R() < 0.3) line('hiss', 0.5); break;
    case 'jawGone': {
      state.yard.jaws++; line('jawFled');
      renderChecklist();
      if (state.yard.jaws >= 4) { completeChore('jaws'); bark('That’s the lot. The tractor’s still a tractor. Mostly.'); }
      break;
    }
    case 'snort': sfx.snort(s); rumble(0.4, 0.6, 400); line('snort'); break;
    case 'strider': line('strider'); break;
  }
}

// ============================================================
// The workshop: where each line and thing comes from (Canon,
// Plausible, Experimental), the idea jotter and its notebook,
// and the door between this page and the shack's.
// ============================================================
const TAG_NAME = { C: 'Canon', P: 'Plausible', X: 'Experimental' };
// most of the yard came across from the Farm of Rust sketch; until it's checked against the manuscript it stays Plausible
const FROM_FARM = 'from the Farm of Rust sketch; not yet checked against the manuscript';
const NEW_HERE = 'new in this build';
const LINE_PROV = new Map([
  ['Get a job.', ['C', 'Chapter One']],
  ['Stepping out of the farmhouse was like walking into an oven.', ['C', 'Chapter One']],
  ['Favouring your left side again. Vents puffing like a kettle.', ['C', 'Chapter One: favouring his left side, flank vents puffing fast']],
  ['Your neck scales are going grey at the edges. Mine would be too, if I had any.', ['C', 'Chapter One: neck scales greying (the joke is new)']],
  ['Rebar, sharpened to a needle point. Not much of a weapon.', ['C', 'Chapter One']],
  ['Ironbark. Burns hotter than coal, once you take a blowtorch to it. The smoke smells like burning pennies.', ['C', 'Field Guide']],
  ['Truth-Rot on the end of that log. I don’t tell lies near the woodpile.', ['P', 'Truth-Rot glowing at lies is in the Field Guide; the log is new']],
  ['Compass-weed. Inside the pen. Overnight.', ['C', 'Chapter One yard scene: compass-weed in the pen']],
  ['Don’t look him in the eye, Jacob. Rule one.', ['X', 'testing: reading Rustbucket without meeting his eye']],
  ['Dried scrub, red-shale gravel, and whatever scrap shards the junk piles coughed up. Grain’s too dear.', ['P', 'Jacob’s notes board in the shack']],
  ['Every morning. Shadow-Hoppers, Riot-Devils. The fence eats well, I’ll give it that.', ['P', 'the fence’s morning catch; check the Shadow-Hopper against the manuscript']],
  ['Goggles down. The blinding white-yellow of the morning goes a manageable amber.', ['C', 'Chapter One: polarised goggles']],
]);
const BOOK_PROV = { garden: ['C', 'Chapter One'], serpents: ['C', 'Chapter One, epigraph'], lawns: ['C', 'Chapter One, epigraph'], sunswallowed: ['C', 'Chapter One, epigraph'] };
const WHISPER_PROV = {
  '…Cogswell won’t take it…': ['C', 'Chapter One (yard)'], '…grade is too low…': ['C', 'Chapter One (yard)'],
  '…Rustbucket is sick… look at him…': ['C', 'Chapter One (yard)'], '…you’re failing your family legacy…': ['C', 'Chapter One (yard)'],
  '…bloodsucker…': ['C', 'Chapter One'], '…milk is sour…': ['C', 'Chapter One'], '…all alone out here…': ['P', 'Chapter One’s “you’re all alone”, moved outside'],
  '…the fence is hungry…': ['P', FROM_FARM],
};
// the things in the yard, by what they are rather than which copy: every cow is a Mooeow, every junk pile a junk pile
const ITEM_PROV = {
  rustbucket: ['C', 'Chapter One'], cow: ['C', 'Mooeows and their milk: Chapter One; the herd’s names are from the Farm of Rust sketch'],
  penweed: ['C', 'Chapter One yard scene'], fowl: ['C', 'Chapter One'], coop: ['P', FROM_FARM], tractor: ['C', 'Chapter One'],
  woodpile: ['C', 'Field Guide: Ironbark'], truthrot: ['P', 'Field Guide: Truth-Rot; growing on the woodpile is new'], devil: ['P', 'the Beggar’s Hand and its morning catch; check against the manuscript'],
  ydoor: ['C', 'three bolts: Field Guide'], hemorrhage: ['P', FROM_FARM], found: ['P', FROM_FARM],
};
const tagHTML = (tag, src) => `<span class="tag ${tag}">${TAG_NAME[tag]}</span>${src ? ` <span class="src">${esc(src)}</span>` : ''}`;
function provOf(b) {
  if (b.prov) return b.prov;
  if (b.who === 'book') return BOOK_PROV[b.key] || ['P', FROM_FARM];
  return LINE_PROV.get(b.text) || ['P', FROM_FARM];
}
function itemProv(it) {
  if (!it) return null;
  const k = it.cow ? (it.cow.bull ? 'rustbucket' : 'cow') : it.act || it.id;
  return ITEM_PROV[k] || ['P', FROM_FARM];
}
// what Jacob has said about each thing this morning, for the Workshop page
const heard = new Map();
function noteHeard(b) {
  const it = state.lastItem; if (!it || b.who === 'hint') return;
  const key = valueOf(it.name);
  if (!heard.has(key)) heard.set(key, { prov: itemProv(it), lines: new Map() });
  heard.get(key).lines.set(b.text, provOf(b));
}
function setWorkshop(on) {
  state.workshop = on;
  document.body.classList.toggle('workshop', on);
  ui.titleWs.textContent = 'Workshop view: ' + (on ? 'on' : 'off'); ui.titleWs.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('valtoria-workshop', on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}

// ---------- the jotter (N): what Jacob can see, where he's standing, and a thought ----------
const jot = { open: false, kind: 'gameplay', ctx: null, thumb: '', wantThumb: false };
const PLACES = [
  ['on the deck', () => Math.abs(player.x + 0.9) < 1.9 && player.z > -1.3 && player.z < 0.9],
  ['in the pen', () => player.x > YARD.pen.x0 && player.x < YARD.pen.x1 && player.z > YARD.pen.z0 && player.z < YARD.pen.z1],
  ['by the coop', () => Math.hypot(player.x - YARD.coop.x, player.z - YARD.coop.z) < 3.2],
  ['by the shed', () => Math.hypot(player.x - (YARD.shed.x0 + YARD.shed.x1) / 2, player.z - (YARD.shed.z0 + YARD.shed.z1) / 2) < 3.2],
  ['by the tractor', () => Math.hypot(player.x - YARD.tractor.x, player.z - YARD.tractor.z) < 3.2],
  ['by the old ute', () => Math.hypot(player.x - YARD.ute.x, player.z - YARD.ute.z) < 3.2],
  ['at the fire pit', () => Math.hypot(player.x - YARD.firepit.x, player.z - YARD.firepit.z) < 2.6],
  ['under the tank', () => Math.hypot(player.x - YARD.tank.x, player.z - YARD.tank.z) < 2.6],
  ['along the fence', () => Math.hypot(player.x, player.z) > YARD.R - 3.5],
];
const placeNow = () => (PLACES.find(([, test]) => test()) || ['in the yard'])[0];
const clockNow = () => { const m = 370 + Math.floor(state.yardTime / 30); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}am`; };
function openJot() {
  if (jot.open || !state.started || state.ended) return;
  const t = state.target;
  jot.ctx = { area: 'yard', place: placeNow(), looking: t ? valueOf(t.name).replace(/^./, c => c.toLowerCase()) : '', heat: `${temp().toFixed(1)} °C`, clock: clockNow() };
  jot.open = true; jot.wantThumb = true; jot.thumb = '';
  if (state.menu) closeMenu();
  releaseLock(); clearBark();
  ui.jotCtx.textContent = [cap(jot.ctx.place), jot.ctx.looking && 'looking at ' + jot.ctx.looking, jot.ctx.heat, jot.ctx.clock].filter(Boolean).join(' · ');
  ui.jotWhere.textContent = ideas.db ? 'Kept in this page’s notebook, where Claude can read it' : 'Kept on this computer · export from the menu';
  ui.jotKinds.innerHTML = IDEA_KINDS.map(([k, l]) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${jot.kind === k}">${l}</button>`).join('');
  ui.jotText.value = ''; ui.jotThumb.hidden = true;
  ui.jot.hidden = false; sfx.paper();
  setTimeout(() => ui.jotText.focus(), 30);
}
function closeJot() {
  if (!jot.open) return;
  jot.open = false; ui.jot.hidden = true;
  ui.canvas.focus({ preventScroll: true });
}
async function saveJot() {
  const text = ui.jotText.value.trim(), c = jot.ctx;
  closeJot();
  if (!text) return;
  const ok = await addIdea(text, jot.kind, 'yard-1', { ...c, pos: [+player.x.toFixed(2), +player.z.toFixed(2)], yaw: +player.yaw.toFixed(2) }, jot.thumb);
  toast(ok ? 'Idea kept in the notebook' : 'Idea kept on this computer');
}
// called straight after a frame is drawn, while the picture is still in the canvas
const thumbCanvas = cv(320, 180);
function grabJotThumb() {
  if (!jot.wantThumb) return;
  jot.wantThumb = false;
  try {
    const src = renderer.domElement, x = thumbCanvas.getContext('2d'), h = src.width / (16 / 9);
    x.drawImage(src, 0, Math.max(0, (src.height - h) / 2), src.width, Math.min(src.height, h), 0, 0, 320, 180);
    jot.thumb = thumbCanvas.toDataURL('image/jpeg', 0.72); ui.jotThumb.src = jot.thumb; ui.jotThumb.hidden = false;
  } catch (e) { jot.thumb = ''; }
}

// ---------- the door between pages: what the shack hands on, what the yard keeps ----------
function readHandoff() {
  try {
    const h = JSON.parse(localStorage.getItem('valtoria-handoff') || 'null');
    return h && h.from === 'shack' ? h : null;
  } catch (e) { return null; }
}
const cameFromShack = new URLSearchParams(location.search).get('from') === 'shack';
function saveYard() {
  if (!state.started || state.ended) return;
  try { localStorage.setItem('valtoria-yard-save', JSON.stringify({ v: 1, s: snapshot() })); } catch (e) { /* storage unavailable */ }
}
function loadYard() {
  try { const s = JSON.parse(localStorage.getItem('valtoria-yard-save') || 'null'); return s && s.v === 1 ? s.s : null; } catch (e) { return null; }
}
function forgetMorning() {
  for (const k of ['valtoria-yard-save', 'valtoria-shack-save', 'valtoria-handoff']) try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
}
function toShack() {
  saveYard();
  location.href = (window.__SHACK_URL || 'index.html') + '?from=yard';
}

// ---------- moving between the shack and the yard ----------
function enterArea(id, spawnKey) {
  const prev = area;
  area = AREAS[id]; state.area = id;
  area.scene.add(body.root);
  camera.far = area.far; camera.updateProjectionMatrix();
  areaLook();
  vm.setLights(area.vmLight); vm.scene.environment = area.scene.environment;
  const s = area.spawn[spawnKey];
  Object.assign(player, { x: s.x, z: s.z, yaw: s.yaw, pitch: s.pitch, vx: 0, vz: 0 });
  player.y = area.groundAt(s.x, s.z);
  body.snap(s.yaw);
  if (area.Y) { area.Y.state = state.yard; ui.fxGoggles.hidden = false; }
  else ui.fxGoggles.hidden = !state.flags.gear;
  shadowClock = 0; area.shadow.dirty = true;
  if (prev !== area) resize();
  updateHud();
}
function goOutside() {
  if (!AREAS.yard) {
    say([STAGE('The heat is building outside. One moment…')]);
    yardPromise.then(() => { if (state.area === 'shack' && !state.transition) goOutside(); });
    return;
  }
  const first = !state.flags.beenOut; state.flags.beenOut = true;
  state.transition = true;
  sfx.bolts(); setTimeout(() => sfx.door(), 500);
  ui.fxFade.classList.add('is-on');
  setTimeout(() => {
    enterArea('yard', 'door');
    if (first) { ui.fadeLine.textContent = 'Stepping out of the farmhouse was like walking into an oven.'; ui.fadeLine.hidden = false; ui.fxGoggles.classList.add('is-dropping'); }
    setTimeout(() => {
      ui.fxFade.classList.remove('is-on'); ui.fadeLine.hidden = true; state.transition = false;
      if (first) {
        setTimeout(() => ui.fxGoggles.classList.remove('is-dropping'), 1800);
        say([STAGE('Goggles down. The blinding white-yellow of the morning goes a manageable amber.'), J('The pen first. Then the dung, the milk, and the tractor before the heat gets serious.'), TIP(controlHint('run')), TIP(controlHint('menu'))]);
        state.yardTime = 0;
      }
    }, reduceMotion ? 50 : first ? 2800 : 450);
  }, reduceMotion ? 50 : 1300);
}
// the shack is its own page now: save the yard and go through
function goInside() {
  state.transition = true; sfx.door();
  ui.fxFade.classList.add('is-on', 'is-dark');
  setTimeout(toShack, reduceMotion ? 50 : 700);
}
function leaveForTown() {
  say([J('Guard the fort, Rustbucket.'), STAGE('The bull does not acknowledge him.'), DO(() => { sfx.engine(); rumble(0.6, 0.8, 1500); for (let i = 0; i < 30; i++) setTimeout(() => area.Y.smokeP.emit(YARD.tractor.x - 0.12, 2.15, YARD.tractor.z - 1.0, { vy: 1.2, vx: rand(-0.2, 0.2), life: 3, size: 0.2, size1: 1.4, alpha: 0.6, color: [0.12, 0.11, 0.1], drag: 0.6 }), i * 80); }), WAIT(2.2), DO(toRoad)]);
}
// out of the north gate: the road to Bleak Flats is its own page, and takes the clock and the load with it
function toRoad() {
  state.ended = true; releaseLock();
  const done = CHORES.filter(c => state.chores[c.key]).map(c => c.key);
  try {
    localStorage.setItem('valtoria-road-handoff', JSON.stringify({ from: 'yard', at: Date.now(), clock: 370 + Math.floor(state.yardTime / 30), heat: temp(), chores: done, milk: !!state.yard.milked, dung: state.yard.dung, owned: [...state.owned] }));
    localStorage.removeItem('valtoria-yard-save');
  } catch (e) { /* storage unavailable: the road starts with its defaults */ }
  ui.fxFade.classList.add('is-on');
  setTimeout(() => { location.href = (window.__ROAD_URL || 'road.html') + '?from=yard'; }, reduceMotion ? 50 : 1500);
}
function endMorning() {
  state.ended = true;
  releaseLock();
  ui.fxFade.classList.add('is-on');
  setTimeout(() => {
    const done = CHORES.filter(c => state.chores[c.key]).length, by = (k) => FOUND.filter(f => f.kind === k && save.found.has(f.id)).length;
    const h = state.handoff;
    ui.endStats.textContent = `Chores: ${done} of ${CHORES.length}. Echoes ${by('echo')}/14 · Curios ${by('curio')}/12 · Bits ${by('bit')}/10. Pages of the Book remembered: ${save.book.size} of ${BOOK_ORDER.length}.` +
      (h ? ` In the shack: ${h.has && h.has.toy ? 'the little green beast came out from under the floor' : 'something is still under the floor'}${h.flies && h.flies.lies ? `, and the Truth-Rot caught the flies lying ${h.flies.lies === 1 ? 'once' : words(Math.min(h.flies.lies, 99)) + ' times'}` : ''}.` : '') +
      (ideas.list.length ? ` ${cap(words(Math.min(ideas.list.length, 99)))} idea${ideas.list.length === 1 ? '' : 's'} in the notebook.` : '');
    try { localStorage.removeItem('valtoria-yard-save'); } catch (e) { /* storage unavailable */ }
    ui.end.hidden = false; ui.hud.hidden = true; ui.prompt.hidden = true; ui.reticle.hidden = true;
    ui.endBack.focus({ preventScroll: true });
  }, reduceMotion ? 50 : 1700);
}
function resumeYard() {
  ui.end.hidden = true; ui.hud.hidden = false; ui.fxFade.classList.remove('is-on');
  state.ended = false;
}
function resetMorning() {
  Object.assign(state, { routine: {}, uses: {}, flags: {}, dawn: 0, yardTime: 0, owned: new Set(), held: null, carry: null, carryFull: false, load: null, chores: {}, yard: newYard() });
  state.noticed.clear(); state.seenBook.clear();
  for (const it of W.items) W.setGlint(it, true);
  W.boardState.open = false; W.resetFlies(); W.idolState.yaw = 0; W.idolHead.rotation.y = 0; W.setRebar(true);
  vm.setTool(null, true); vm.setCarry(null); vm.setLoad(null);
  if (AREAS.yard) resetYardWorld(AREAS.yard.Y);
  enterArea('shack', 'start');
  ui.fxGoggles.hidden = true;
  updateHud();
}

// ---------- the menu: chores, the collection, the Book, settings ----------
const thumbs = { cache: new Map(), scene: null, cam: null, rt: null, buf: null };
function thumbFor(def, found) {
  const key = def.id + (found ? '' : ':s');
  if (thumbs.cache.has(key)) return thumbs.cache.get(key);
  const Y = AREAS.yard && AREAS.yard.Y; if (!Y || !renderer) return null;
  const S = 192;
  if (!thumbs.scene) {
    thumbs.scene = new THREE.Scene(); thumbs.scene.environment = AREAS.yard.scene.environment;
    thumbs.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5a3420, 1.6));
    const d = new THREE.DirectionalLight(0xffe6c8, 3.2); d.position.set(2, 3, 2); thumbs.scene.add(d);
    thumbs.cam = new THREE.PerspectiveCamera(28, 1, 0.001, 20);
    thumbs.rt = new THREE.WebGLRenderTarget(S, S); thumbs.buf = new Uint8Array(S * S * 4);
  }
  const model = buildFoundModel(def.kind === 'bit' ? 'bit' : def.id, Y.mats, Y.TY);
  model.rotation.y = 0.6;
  const box = new THREE.Box3().setFromObject(model), sph = box.getBoundingSphere(new THREE.Sphere());
  model.position.sub(sph.center);
  thumbs.scene.add(model);
  const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(14)) * 1.05;
  thumbs.cam.position.set(0, dist * 0.55, dist * 0.84); thumbs.cam.lookAt(0, 0, 0);
  const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setRenderTarget(thumbs.rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(thumbs.scene, thumbs.cam);
  renderer.readRenderTargetPixels(thumbs.rt, 0, 0, S, S, thumbs.buf);
  renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA);
  thumbs.scene.remove(model);
  const tm = (v) => { v *= 1.1; v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14); return clamp(v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055, 0, 1) * 255; };
  const b = thumbs.buf;
  for (const f of [true, false]) {
    const c = cv(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const i = ((S - 1 - yy) * S + xx) * 4, o = (yy * S + xx) * 4;
      if (f) { d[o] = tm(b[i] / 255); d[o + 1] = tm(b[i + 1] / 255); d[o + 2] = tm(b[i + 2] / 255); } else { d[o] = 52; d[o + 1] = 36; d[o + 2] = 28; }
      d[o + 3] = b[i + 3];
    }
    x.putImageData(img, 0, 0);
    thumbs.cache.set(def.id + (f ? '' : ':s'), c.toDataURL('image/png'));
  }
  return thumbs.cache.get(key);
}
function warmThumbs() {
  const todo = FOUND.filter(d => !thumbs.cache.has(d.id) && (d.kind !== 'bit' || d.id === 'bit0'));
  if (!todo.length) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 120));
  idle((dl) => { let n = 0; while (todo.length && n < 3 && (!dl || dl.timeRemaining() > 4 || n === 0)) { thumbFor(todo.shift(), true); n++; } warmThumbs(); });
}
const menuState = { sel: null, confirmReset: false, filter: 'all' };
function openMenu(tab) {
  if (!state.started || state.ended) return;
  if (state.menu && (!tab || tab === state.menuTab)) { closeMenu(); return; }
  state.menu = true; if (tab) state.menuTab = tab;
  releaseLock(); clearBark();
  ui.menu.hidden = false; renderMenu(true); sfx.paper();
}
function closeMenu() {
  if (!state.menu) return;
  state.menu = false; ui.menu.hidden = true; menuState.confirmReset = false; sfx.paper();
  ui.canvas.focus({ preventScroll: true });
}
function setTab(dir) {
  const tabs = ['chores', 'collection', 'book', 'workshop', 'ideas', 'settings'];
  state.menuTab = tabs[(tabs.indexOf(state.menuTab) + dir + tabs.length) % tabs.length];
  renderMenu(true);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function renderMenu(focusTab = false) {
  for (const b of ui.menuTabs.querySelectorAll('button')) { const on = b.dataset.tab === state.menuTab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  { const t = ui.menuTabs.querySelector('[aria-selected="true"]'); if (t && ui.menuTabs.scrollWidth > ui.menuTabs.clientWidth) { const tr = t.getBoundingClientRect(), mr = ui.menuTabs.getBoundingClientRect(); ui.menuTabs.scrollLeft += (tr.left + tr.width / 2) - (mr.left + mr.width / 2); } }   // narrow screens: keep the open tab in view
  const B = ui.menuBody; let html = '';
  if (state.menuTab === 'chores') {
    const yard = CHORES.map(c => ({ done: !!state.chores[c.key], text: c.label(), hint: c.hint }));
    const shack = ROUTINE.map(k => ({ done: !!state.routine[k], text: ROUTINE_LABEL[k], hint: k === 'gear' || k === 'rebar' ? 'Needed before you head out.' : '' }));
    const list = (rows) => rows.map(r => `<li class="${r.done ? 'done' : ''}"><span class="mc-box" aria-hidden="true"></span><span><span class="mc-text">${esc(r.text)}</span>${r.hint ? `<span class="mc-hint">${esc(r.hint)}</span>` : ''}</span></li>`).join('');
    html = `<section class="m-sec"><h3 class="m-h">Before work · the shack</h3><ul class="m-checks">${list(shack)}</ul></section>
      <section class="m-sec"><h3 class="m-h">The yard</h3><ul class="m-checks">${list(yard)}<li class="final ${state.yard.dung >= 6 && state.yard.milked ? 'ready' : ''}"><span class="mc-box" aria-hidden="true"></span><span><span class="mc-text">${esc(FINAL_CHORE.label)}</span><span class="mc-hint">${esc(FINAL_CHORE.hint)}</span></span></li></ul></section>`;
  } else if (state.menuTab === 'collection') {
    const by = (k) => FOUND.filter(f => f.kind === k), got = (k) => by(k).filter(f => save.found.has(f.id)).length;
    const filt = menuState.filter;
    const defs = FOUND.filter(f => filt === 'all' || f.kind === filt);
    if (!menuState.sel || !defs.some(d => d.id === menuState.sel)) menuState.sel = (defs.find(d => save.found.has(d.id)) || defs[0]).id;
    const sel = FOUND.find(f => f.id === menuState.sel), selFound = save.found.has(sel.id), kind = FOUND_KIND[sel.kind];
    const img = (d, f) => { const u = thumbFor(d.kind === 'bit' ? FOUND.find(x => x.id === 'bit0') : d, f); return u ? `<img src="${u}" alt="" width="96" height="96">` : `<span class="m-noimg" aria-hidden="true">?</span>`; };
    html = `<div class="m-sum">${['echo', 'curio', 'bit'].map(k => `<p><span class="m-sum-n">${got(k)}/${by(k).length}</span><span class="m-sum-l">${FOUND_KIND[k].label}</span></p>`).join('')}</div>
      <div class="m-filter" role="group" aria-label="Show">${[['all', 'All'], ['echo', 'Echoes'], ['curio', 'Curios'], ['bit', 'Bits']].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${filt === k}">${l}</button>`).join('')}</div>
      <div class="m-coll">
        <ul class="m-grid">${defs.map(d => { const f = save.found.has(d.id); return `<li><button type="button" class="m-card ${f ? 'is-found' : ''} ${d.id === sel.id ? 'is-sel' : ''}" data-sel="${d.id}" aria-label="${esc(f ? d.name : 'Not found yet')}">${img(d, f)}<span class="m-card-name">${esc(f ? (d.kind === 'bit' ? 'Bit' : d.name) : '?')}</span></button></li>`; }).join('')}</ul>
        <article class="m-detail">
          <div class="m-detail-img">${img(sel, selFound)}</div>
          <p class="m-kind">${esc(kind.one)}${selFound ? '' : ' · not found yet'}</p>
          <h3 class="m-name">${esc(selFound ? sel.name : 'Something out there')}</h3>
          ${selFound ? `<p class="m-desc">${esc(sel.desc)}</p>${sel.line ? `<p class="m-line">“${esc(sel.line)}”</p>` : ''}${sel.book ? `<blockquote class="m-book">${esc(BOOK[sel.book])}</blockquote>` : ''}` : `<p class="m-desc">Hint: ${esc(sel.hint)}</p><p class="m-blurb">${esc(kind.blurb)}</p>`}
        </article>
      </div>`;
  } else if (state.menuTab === 'workshop') {
    const rows = [...heard.entries()].map(([name, h]) => `<div class="ws-row"><div class="hd"><b>${esc(name)}</b>${tagHTML(...h.prov)}</div><ul>${[...h.lines].map(([line, p]) => `<li><span class="tag ${p[0]}">${TAG_NAME[p[0]]}</span>${esc(line)}${p[1] ? ` <span class="src">${esc(p[1])}</span>` : ''}</li>`).join('')}</ul></div>`).join('');
    html = `<section class="m-sec"><div class="m-set"><span>Workshop view: tags on every line and thing as you play</span><button type="button" id="set-ws" class="m-toggle" aria-pressed="${state.workshop}">${state.workshop ? 'On' : 'Off'}</button></div>
      <p class="m-lede" style="margin-top:12px"><span class="tag C">Canon</span> in the books · <span class="tag P">Plausible</span> fits, but isn’t in them · <span class="tag X">Experimental</span> being tested. Nothing becomes Canon until you say so. Most of the yard came across from the Farm of Rust sketch and is marked Plausible until it’s checked against the manuscript.</p></section>
      <section class="m-sec"><h3 class="m-h">What you’ve heard this morning</h3>${rows || '<p class="m-lede">Nothing yet. Use things and their lines collect here.</p>'}</section>`;
  } else if (state.menuTab === 'ideas') {
    const kindOf = (k) => (IDEA_KINDS.find(x => x[0] === k) || [0, 'Idea'])[1];
    html = `<section class="m-sec"><div class="m-set"><span class="m-lede" style="margin:0">${ideas.db ? (ideas.shared ? 'Kept in this page’s notebook. Claude can read these next session.' : 'Connecting to the notebook…') : 'Kept on this computer. Export them and send them to Claude.'} Press <kbd>N</kbd> anywhere to jot one.</span><button type="button" id="ideas-export">Export</button></div>
      ${ideas.list.length ? ideas.list.map(i => `<div class="idea">${i.thumb ? `<img src="${i.thumb}" alt="">` : '<span></span>'}<div><div class="t">${esc(i.text)}</div><div class="m">${esc([kindOf(i.kind), ideaWhere(i), i.place, i.looking && 'looking at ' + i.looking, i.heat].filter(Boolean).join(' · '))}</div></div><button type="button" class="x" data-del="${esc(i.id)}" aria-label="Delete this idea">×</button></div>`).join('') : '<p class="m-lede">No ideas yet.</p>'}</section>`;
  } else if (state.menuTab === 'book') {
    html = `<p class="m-lede">The Book of Lost Echoes. Mum’s, before the raids. Many of the pages are blank, as if the story were waiting for its author to come back and finish it. You remember ${save.book.size} of ${BOOK_ORDER.length} passages.</p>
      <ol class="m-pages">${BOOK_ORDER.map(k => save.book.has(k) ? `<li class="m-page"><p>${esc(BOOK[k])}</p></li>` : `<li class="m-page is-blank"><p>A blank page.</p></li>`).join('')}</ol>`;
  } else {
    const S0 = input.settings, V = voice.settings, q = post.key;
    const tog = (id, on, label = on ? 'On' : 'Off') => `<button type="button" id="${id}" class="m-toggle" aria-pressed="${on}">${label}</button>`;
    const slider = (id, label, min, max, step, val, out) => `<div class="m-set"><label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output id="${id}-v">${out}</output></div>`;
    const padSeen = input.padSeen || !!input.pad || input.mode === 'pad';
    html = `<section class="m-sec"><h3 class="m-h">Picture</h3>
      <div class="m-set"><span>Quality</span><span class="m-seg" role="group" aria-label="Quality">${QUALITY_ORDER.map(k => `<button type="button" data-q="${k}" aria-pressed="${k === q}" ${k !== 'low' && !post.supported ? 'disabled' : ''}>${QUALITY[k].label}</button>`).join('')}</span></div>
      ${slider('set-bright', 'Brightness', 0.7, 1.4, 0.05, S0.bright, Math.round(S0.bright * 100) + '%')}
      ${slider('set-fov', 'Field of view', 70, 104, 2, S0.fov, S0.fov + '°')}
      <div class="m-set"><span>Head bob</span>${tog('set-bob', S0.bob !== false)}</div>
      </section>
      <section class="m-sec"><h3 class="m-h">Sound and voices</h3>
      <div class="m-set"><span>Sound</span>${tog('set-sound', !audio.muted)}</div>
      ${voice.ok ? `<div class="m-set"><span>Jacob’s thoughts, spoken</span>${tog('set-voice', V.on)}</div>
      ${V.on ? `${slider('set-vvol', 'Voice volume', 0.2, 1, 0.05, V.vol, Math.round(V.vol * 100) + '%')}
      <div class="m-set"><span>Jacob’s voice</span><button type="button" id="set-vjacob" class="m-cycle">${esc(voiceLabel(V.jacob, 'jacob'))}</button></div>
      <div class="m-set"><span>The Book’s voice</span><button type="button" id="set-vbook" class="m-cycle">${esc(voiceLabel(V.book, 'book'))}</button></div>
      <div class="m-set"><span>Move on when a line ends</span>${tog('set-vauto', V.auto)}</div>
      <div class="m-set"><span>Try them</span><button type="button" id="set-vtest">Hear a line</button></div>` : ''}` : `<p class="m-note">This browser has no speech voices, so Jacob’s thoughts stay on the page.</p>`}
      </section>
      <section class="m-sec"><h3 class="m-h">Controls</h3>
      ${slider('set-sens', 'Look speed', 0.4, 2.2, 0.1, S0.sens, S0.sens.toFixed(1) + '×')}
      <div class="m-set"><span>Invert look</span>${tog('set-invert', S0.invert)}</div>
      ${padSeen ? `<div class="m-set"><span>Controller rumble</span>${tog('set-rumble', S0.rumble)}</div>` : ''}
      <div class="m-set"><span>Your collection</span>${menuState.confirmReset ? `<span class="m-confirm"><button type="button" id="set-reset-yes" class="m-danger">Forget everything</button><button type="button" id="set-reset-no">Keep it</button></span>` : `<button type="button" id="set-reset">Reset collection</button>`}</div>
      </section>
      <section class="m-sec"><h3 class="m-h">How to play</h3>
      <dl class="m-controls">
        <dt>Xbox controller</dt><dd>Left stick walk, right stick look. Outside, hold the left trigger or click the left stick to run. A use, X or right trigger swing, LB and RB swap tools, Y the Book, ☰ this menu, B back.</dd>
        <dt>Keyboard and mouse</dt><dd>WASD walk, hold Shift to run outside. Click to capture the mouse, then left-click swings and right-click uses. E use, F swing, Q or the wheel swaps, B the Book, Tab or M this menu.</dd>
        <dt>Ideas</dt><dd>N jots an idea where you stand, with a picture of what you’re looking at. They’re on the Ideas page.</dd>
      </dl>
      <p class="m-note" id="pad-status">${padStatus()}</p></section>`;
  }
  B.innerHTML = html;
  ui.menuFoot.textContent = input.mode === 'pad' ? 'LB / RB tabs · D-pad move · A select · B close' : isTouch() ? 'Tap a tab or a card' : 'Tab or Esc to close · Q and E switch tabs · arrows move';
  if (focusTab) (ui.menuTabs.querySelector('[aria-selected="true"]') || ui.menuTabs).focus({ preventScroll: true });
}
function padStatus() {
  if (input.padBlocked) return 'This page isn’t allowed to read controllers here. Open the downloaded copy of the game in Chrome or Edge on your computer and the Xbox controller will work.';
  if (input.pad) return `Controller connected: ${input.pad.id.replace(/\s*\(.*$/, '').slice(0, 60)}.`;
  return 'No controller seen yet. Connect it, then press any button on it.';
}
function onMenuClick(e) {
  const t = e.target.closest('button, input'); if (!t) return;
  if (t.dataset.tab) { state.menuTab = t.dataset.tab; renderMenu(true); sfx.paper(); return; }
  if (t.dataset.sel) { menuState.sel = t.dataset.sel; renderMenu(); const b = ui.menuBody.querySelector(`[data-sel="${t.dataset.sel}"]`); b && b.focus({ preventScroll: true }); return; }
  if (t.dataset.del) { deleteIdea(t.dataset.del); return; }
  if (t.id === 'ideas-export') { exportIdeas().then(r => toast(r === 'saved' ? 'Ideas exported' : r === 'declined' ? 'Export cancelled' : 'Couldn’t export here. The PC copy can.')); return; }
  if (t.id === 'set-ws') { setWorkshop(!state.workshop); renderMenu(); const b = $('set-ws'); b && b.focus({ preventScroll: true }); return; }
  if (t.dataset.filter) { menuState.filter = t.dataset.filter; renderMenu(); const b = ui.menuBody.querySelector(`[data-filter="${t.dataset.filter}"]`); b && b.focus({ preventScroll: true }); return; }
  const S0 = input.settings, refocus = (id) => { renderMenu(); const b = id.startsWith('[') ? ui.menuBody.querySelector(id) : $(id); b && b.focus({ preventScroll: true }); };
  if (t.dataset.q) { if (t.dataset.q !== post.key) { S0.quality = t.dataset.q; saveSettings(); applyQuality(t.dataset.q); areaLook(); } refocus(`[data-q="${t.dataset.q}"]`); return; }
  if (t.id === 'set-bob') { S0.bob = S0.bob === false; saveSettings(); refocus('set-bob'); }
  if (t.id === 'set-voice') { voice.settings.on = !voice.settings.on; saveVoice(); if (!voice.settings.on) stopVoice(); refocus('set-voice'); }
  if (t.id === 'set-vauto') { voice.settings.auto = !voice.settings.auto; saveVoice(); refocus('set-vauto'); }
  if (t.id === 'set-vjacob' || t.id === 'set-vbook') {
    const role = t.id === 'set-vjacob' ? 'jacob' : 'book', list = voiceChoices(), i = list.indexOf(voice.settings[role]);
    voice.settings[role] = list[(i + 1) % list.length]; saveVoice(); refocus(t.id);
    speak(role === 'jacob' ? 'Morning. Still here. Worse luck.' : 'And they walked in the garden without fear.', role, { muted: audio.muted });
  }
  if (t.id === 'set-vtest') { initAudio(); speak('Easy. That’s the only wall I’ve got.', 'jacob', { muted: audio.muted, onEnd: () => speak('The sun was a warm lover.', 'book', { muted: audio.muted }) }); }
  if (t.id === 'set-invert') { S0.invert = !S0.invert; saveSettings(); refocus('set-invert'); }
  if (t.id === 'set-rumble') { S0.rumble = !S0.rumble; saveSettings(); if (S0.rumble) rumble(0.4, 0.4, 200); refocus('set-rumble'); }
  if (t.id === 'set-sound') { initAudio(); setMuted(!audio.muted); refocus('set-sound'); }
  if (t.id === 'set-reset') { menuState.confirmReset = true; refocus('set-reset-no'); }
  if (t.id === 'set-reset-no') { menuState.confirmReset = false; refocus('set-reset'); }
  if (t.id === 'set-reset-yes') {
    save.found.clear(); save.book.clear(); save.firstBit = false; persist(); thumbs.cache.clear(); menuState.confirmReset = false;
    if (AREAS.yard) for (const it of AREAS.yard.Y.found) { it.model.visible = it.def.id !== 'librarycard'; AREAS.yard.setGlint(it, true); }
    state.yard.letter = false; refocus('set-reset'); toast('Collection reset. Everything’s back where you found it.');
  }
}

// ---------- picking what's under the reticle (or a tap) ----------
const raycaster = new THREE.Raycaster(), hitPoint = new THREE.Vector3(), ndcV = new THREE.Vector2();
function enabled(it) { return !it.gone && (!it.enabled || it.enabled()); }
function pickItem(nx, ny, reach) {
  ndcV.set(nx, ny); raycaster.setFromCamera(ndcV, camera);
  let best = null, bestD = 1e9;
  for (const it of area.items) {
    if (!enabled(it)) continue;
    if (raycaster.ray.intersectBox(it.box, hitPoint)) { const d = hitPoint.distanceTo(raycaster.ray.origin); if (d < (it.reach || reach) && d < bestD) { bestD = d; best = it; } }
  }
  if (best) return best;
  // a little help with small things on the ground, for thumbs and thumbsticks
  let bestA = 0.075;
  for (const it of area.items) {
    if (!enabled(it) || !(it.act === 'found' || it.act === 'dung' || it.id === 'penweed')) continue;
    _to.copy(it.center).sub(raycaster.ray.origin); const d = _to.length(); if (d > (it.reach || reach)) continue;
    const a = Math.acos(clamp(_to.dot(raycaster.ray.direction) / d, -1, 1));
    if (a < bestA) { bestA = a; best = it; }
  }
  return best;
}
function tapAt(x, y, mouse) {
  const nx = (x / innerWidth) * 2 - 1, ny = -(y / innerHeight) * 2 + 1;
  const it = pickItem(nx, ny, 2.8) || (Math.abs(nx) < 0.2 && Math.abs(ny) < 0.2 ? state.target : null);
  if (it) useItem(it); else if (mouse && state.held) attack();
}

// ---------- movement ----------
function move(dt) {
  let ix = 0, iz = 0;
  const locked = busy() || state.menu || player.stun > 0 || (player.crouchGoal > 0) || body.st.kick >= 0;
  if (!locked) { ix = input.move.x; iz = input.move.y; if (player.scramble > 0) { ix = -ix; } }
  player.stun = Math.max(0, player.stun - dt);
  if (player.scramble > 0) { player.scramble -= dt; if (player.scramble <= 0) fx.swirl(0); }
  const outdoors = state.area === 'yard', push = Math.min(1, Math.hypot(ix, iz));
  const running = outdoors && input.sprint && push > 0.3;
  player.run += ((running ? 1 : 0) - player.run) * (1 - Math.exp(-dt * 6));
  const speed = (outdoors ? SPEED.outside : SPEED.inside) * (1 + (SPEED.run - 1) * player.run) * (state.carry && state.carryFull ? 0.85 : 1);
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  const tx = (ix * c - iz * s) * speed, tz = (-ix * s - iz * c) * speed;
  // get going a little softer than stopping, so steps start smoothly and end without sliding
  const k = 1 - Math.exp(-dt * (Math.hypot(tx, tz) > Math.hypot(player.vx, player.vz) ? 9 : 13));
  player.vx += (tx - player.vx) * k; player.vz += (tz - player.vz) * k;
  const ox = player.x, oz = player.z;
  player.x += player.vx * dt; player.z += player.vz * dt;
  for (let i = 0; i < 3; i++) area.collide(player, SPEED.radius);       // a few passes settle corners between two things
  // what actually happened is the speed: leaning into a wall doesn't keep the legs pumping
  if (dt > 0) {
    const ax = (player.x - ox) / dt, az = (player.z - oz) / dt, a = Math.hypot(ax, az), v = Math.hypot(player.vx, player.vz);
    if (a < v && a < 8) { player.vx = ax; player.vz = az; }
  }
  const sp = Math.hypot(player.vx, player.vz);
  ctx.moving = sp > 0.3; ctx.sprinting = player.run > 0.5 && sp > SPEED.outside * 1.4;
  if (sp > 0.08) {
    const prev = Math.floor(player.bob / Math.PI), stride = 0.72 + 0.5 * player.run;    // metres per step, longer when running
    player.bob += dt * sp * Math.PI / stride;
    if (Math.floor(player.bob / Math.PI) !== prev) sfx.step(area.footstep === 'dirt' && player.y < 0.05 ? 'dirt' : 'wood');
  }
  const gy = area.groundAt(player.x, player.z);
  player.y += (gy - player.y) * (1 - Math.exp(-dt * 10));
}
function look() {
  const [lx, ly] = takeLook();
  if (state.menu || state.transition) return;
  player.yaw += lx * (player.scramble > 0 ? -1 : 1);
  player.pitch = clamp(player.pitch + ly, -1.3, 1.25);
  if (player.lookDown > 0) { player.lookDown -= 1 / 60; player.pitch += (-0.95 - player.pitch) * 0.12; }
}
function placeCamera(dt) {
  const sp = Math.hypot(player.vx, player.vz), bobOn = input.settings.bob !== false && !reduceMotion;
  player.crouch += (player.crouchGoal - player.crouch) * (1 - Math.exp(-dt * 5));
  body.setCrouch(player.crouch);
  const amt = Math.min(1, sp / 1.4), bobY = bobOn ? Math.sin(player.bob * 2) * (0.014 + 0.016 * player.run) * amt : 0;
  const bobX = bobOn ? Math.sin(player.bob) * (0.008 + 0.01 * player.run) * amt : 0;
  const eye = player.eye - player.crouch * 0.56;
  camera.position.set(player.x + Math.cos(player.yaw) * bobX, player.y + eye + bobY, player.z - Math.sin(player.yaw) * bobX);
  camera.rotation.set(player.pitch, player.yaw, bobOn ? Math.sin(player.bob) * 0.003 * amt : 0);
  // a touch wider when running, outside
  const fovGoal = view.baseFov + (bobOn ? 5 * player.run * Math.min(1, sp / (SPEED.outside * 1.5)) : 0);
  if (Math.abs(fovGoal - camera.fov) > 0.01) { camera.fov += (fovGoal - camera.fov) * (1 - Math.exp(-dt * 6)); camera.updateProjectionMatrix(); }
  if (player.scramble > 0 && !reduceMotion) camera.rotation.z = Math.sin(time * 2.3) * 0.08 * Math.min(1, player.scramble);
  if (shake.t > 0) {
    shake.t -= dt;
    const a = shake.amp * Math.max(0, shake.t / 0.4);
    camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a;
    camera.rotation.z += (Math.random() - 0.5) * a * 2.5;
  }
}
// is the camera looking at a point (within a cone)?
const _cl = new THREE.Vector3(), _cf = new THREE.Vector3();
ctx.camLook = (x, y, z, tol) => { if (!camera) return false; camera.getWorldDirection(_cf); _cl.set(x - camera.position.x, y - camera.position.y, z - camera.position.z); const d = _cl.length(); return _cl.dot(_cf) / d > Math.cos(Math.max(tol, Math.atan2(0.6, d))); };

// ---------- per-frame UI ----------
function updateTarget() {
  const t = state.started && !busy() && !state.menu ? pickItem(0, 0, 2.3) : null;
  state.target = t;
  ui.prompt.hidden = !t;
  ui.reticle.hidden = !state.started || busy() || state.menu;
  ui.reticle.classList.toggle('is-on', !!t);
  if (t) {
    const name = valueOf(t.name), verb = valueOf(t.verb);
    if (ui.promptName.textContent !== name) ui.promptName.textContent = name;
    if (ui.promptVerb.textContent !== verb) ui.promptVerb.textContent = verb;
    if (state.workshop && ui.promptTag.dataset.id !== t.id) { const [tag] = itemProv(t); ui.promptTag.dataset.id = t.id; ui.promptTag.innerHTML = `<span class="tag ${tag}">${TAG_NAME[tag]}</span>`; }
  }
  ui.promptKey.textContent = input.mode === 'pad' ? 'A' : 'E';
  ui.promptKey.className = input.mode === 'pad' ? 'pad-b a' : '';
}
const whisper = { t: 0, i: 0, on: false };
function updateWhisper(dt) {
  let near = false, list = WHISPERS;
  if (state.started && !busy() && !state.menu) {
    if (state.area === 'shack') near = W.flies.mode === 'home' && camera.position.distanceTo(W.windowPoint) < 2.7;
    else { near = area.Y.flies.onJacob; list = YARD_WHISPERS; }
  }
  if (near) {
    whisper.t -= dt;
    if (whisper.t <= 0) {
      whisper.on = !whisper.on;
      if (whisper.on) { const w = list[whisper.i++ % list.length], [wt, ws] = WHISPER_PROV[w] || ['P', FROM_FARM]; ui.whisper.innerHTML = `${esc(w)}<span class="tagline ws"> ${tagHTML(wt, ws)}</span>`; ui.whisper.classList.add('is-on'); whisper.t = 2.6; if (!voice.cur) speak(w, 'whisper', { muted: audio.muted }); }
      else { ui.whisper.classList.remove('is-on'); whisper.t = state.area === 'yard' ? 3.5 : 0.9; }
    }
  } else if (whisper.on) { whisper.on = false; ui.whisper.classList.remove('is-on'); whisper.t = 0.4; }
}
function updateAudio(dt) {
  if (!audio.ctx || !state.started) return;
  const T = audio.timers, now = audio.ctx.currentTime, yard = state.area === 'yard';
  audio.room.gain.setTargetAtTime(yard ? 0 : 0.04, now, 0.4);
  audio.wind.g.gain.setTargetAtTime(yard && !state.ended ? 0.05 + 0.03 * Math.sin(time * 0.23) : 0, now, 0.5);
  audio.wind.f.frequency.setTargetAtTime(520 + 220 * Math.sin(time * 0.17), now, 0.5);
  if (!yard) { if ((T.tick -= dt) < 0) { sfx.tick(); T.tick = 2.5 + Math.random() * 7 * (1 - state.dawn * 0.5); } }
  if ((T.fowl -= dt) < 0) { sfx.fowl(yard ? spot(new THREE.Vector3(YARD.coop.x, 0, YARD.coop.z), 10) : { gain: 0.8, pan: -0.3 }); T.fowl = 7 + Math.random() * 12; }
  if ((T.bellow -= dt) < 0) { sfx.bellow(yard ? spot(new THREE.Vector3(10, 0, 2), 14) : { gain: 0.8, pan: 0.5 }); T.bellow = 30 + Math.random() * 40; }
  if (yard) {
    if ((T.mill -= dt) < 0) { sfx.mill(); T.mill = 1.6; }
    if ((T.creak -= dt) < 0) { sfx.creak(); T.creak = 9 + Math.random() * 14; }
    if ((T.chew -= dt) < 0) { const c = area.Y.herd.cows[Math.floor(Math.random() * 6)]; const s = spot(new THREE.Vector3(c.x, 1, c.z), 6); if (s.gain > 0.1) sfx.chew(s); T.chew = 1.5 + Math.random() * 3; }
  }
  // the flies: at the window inside, round the dung bin (or Jacob's head) outside
  const fp = yard ? area.Y.flies.centre : W.windowPoint, d = camera.position.distanceTo(fp);
  const present = yard ? 1 : (W.flies.mode === 'home' ? 1 : 0.3), s = spot(fp, 4);
  audio.buzz.g.gain.setTargetAtTime(state.ended || state.menu ? 0 : present * 0.1 / (1 + d * d * 0.8), now, 0.15);
  if (audio.buzz.pan) audio.buzz.pan.pan.setTargetAtTime(s.pan, now, 0.1);
  audio.buzz.o1.frequency.setTargetAtTime(196 + Math.sin(time * 3.1) * 8, now, 0.05);
  audio.buzz.o2.frequency.setTargetAtTime(213 + Math.sin(time * 2.3 + 1) * 9, now, 0.05);
}

// ---------- boot ----------
const scaleUniforms = [];
const _dbs = new THREE.Vector2();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // the field of view is set across the screen (the settings slider), then held to something sensible up and down
  let vf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(clamp(input.settings.fov || 86, 70, 104)) / 2) / camera.aspect);
  vf = clamp(vf, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(92));
  view.baseFov = camera.fov = THREE.MathUtils.radToDeg(vf);
  camera.updateProjectionMatrix();
  const sc = h * renderer.getPixelRatio() / (2 * Math.tan(vf / 2));
  for (const u of scaleUniforms) u.value = sc;
  if (post) { renderer.getDrawingBufferSize(_dbs); post.setSize(_dbs.x, _dbs.y); }
}
// ---------- graphics quality ----------
// which textures get surface relief (a normal map from their own light and dark), and how much
function reliefList() {
  const T = TB.shack, Ty = TB.yard, L = new Map();
  const add = (t, strength, scale = 1) => { if (t) L.set(t, { strength, scale }); };
  add(T.wall, 1.8); add(T.floor, 2.0); add(T.wood, 1.3); add(T.tableTop, 1.1); add(T.iron, 2.2); add(T.canvas, 1.5); add(T.hessian, 2.2); add(T.brick, 2.2); add(T.crate, 1.3); add(T.enamel, 0.9, 0.6); add(T.idolBody, 1.4);
  if (Ty) { add(Ty.hide, 2.4); add(Ty.ironbark, 2.2); add(Ty.boab, 1.7); add(Ty.fur, 1.0); add(Ty.log, 2.0); add(Ty.tyre, 2.0); add(Ty.tractorPaint, 1.3, 0.8); add(Ty.utePaint, 1.1, 0.7); add(Ty.copper, 1.0); add(Ty.dirt, 2.0); add(Ty.fuzz, 1.2); }
  return L;
}
function defaultQuality() {
  if (!post || !post.supported) return 'low';
  const coarse = matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}
function setShadow(light, size, radius) {
  const s = Math.min(size, renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
  if (light.shadow.mapSize.x !== s) { light.shadow.mapSize.set(s, s); if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; } }
  light.shadow.radius = radius;
  light.shadow.normalBias = s >= 4096 ? 0.022 : 0.035;
}
function applyQuality(key) {
  post.setQuality(key);
  const q = post.q;
  for (const a of [AREAS.shack, AREAS.yard]) if (a && a.sun) setShadow(a.sun, a.id === 'yard' ? q.shadow : Math.min(2048, q.shadow), q.shadowRadius);
  perf.max = Math.min(window.devicePixelRatio || 1, q.ratio); perf.ratio = perf.max; Object.assign(perf, { cool: 3, slow: 0, upWait: 0, backoff: 8, raised: false });
  renderer.setPixelRatio(perf.ratio);
  renderer.shadowMap.needsUpdate = true;
  resize();
}
function areaLook() {
  // per-place grading: the shack is dim and close, the yard bright, hazy and wide
  // a touch more exposure through the post chain, to make up for the shade it adds in corners and at the edges
  post.setExposure(area.exposure * clamp(input.settings.bright || 1, 0.6, 1.6) * (post.on ? 1.06 : 1));
  const yard = state.area === 'yard';
  post.sunDir = yard && area.Y ? area.Y.sunDir : null;
  post.shafts = yard ? 0.42 : 0; post.shimmer = yard ? 1 : 0;
  // contact shade: tight and light in the small shack, wider outside
  post.ao = yard ? 0.75 : 0.65; post.aoRadius = yard ? 0.5 : 0.3; post.aoIntensity = yard ? 0.9 : 0.8;
  post.bloom = yard ? 0.06 : 0.07;
  post.vignette = yard ? 0.2 : 0.22; post.sat = yard ? 1.03 : 1.05; post.contrast = yard ? 1.04 : 1.03; post.split = yard ? 0.5 : 0.3;
  POSTU.uPostBase.value = yard ? 0.4 : 0.14;   // what additive glows sit on, roughly: bright dirt and sky outside, dim boards inside
}
function registerScales(a) {
  const add = (u) => { if (u && !scaleUniforms.includes(u)) scaleUniforms.push(u); };
  if (a.dustU) add(a.dustU.uScale);
  if (a.glints) add(a.glints.uniforms.uScale);
  if (a.Y) for (const p of [a.Y.steam, a.Y.smokeP, a.Y.sparks, a.Y.feathers, a.Y.dust, a.Y.water, a.Y.gold, a.Y.smoke]) add(p.u.uScale);
}
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loads = ["20px 'Special Elite'", "500 20px 'Caveat'", "800 20px 'Big Shoulders Stencil Display'"].map(f => document.fonts.load(f).catch(() => null));
  return Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 2500))]);
}
// out of the door: straight from the shack's page with what Jacob did in there, or back to a yard already half done
function begin() {
  if (state.started || !AREAS.yard) return;
  initAudio();
  state.started = true;
  ui.title.hidden = true; ui.hud.hidden = false; ui.reticle.hidden = false; ui.canvas.style.opacity = '';
  const h = state.handoff = readHandoff(), kept = loadYard();
  if (kept) restore(kept);
  // he can't get out of the shack without the gear on and the rebar on his hip
  state.routine.gear = true; state.flags.gear = true; state.routine.rebar = true; state.flags.beenOut = true;
  if (h) {
    if (h.drinks) state.routine.breakfast = true;
    if (h.splashed) state.routine.wash = true;
    if (h.flies && (h.flies.taps || h.flies.whispers)) state.routine.flies = true;
    if (h.book && h.book.reads) state.routine.book = true;
  }
  if (!state.owned.has('rebar')) takeTool('rebar', true);
  enterArea('yard', 'door');
  if (kept && kept.pos && !cameFromShack) { [player.x, player.z] = kept.pos; player.yaw = kept.yaw; player.pitch = kept.pitch; state.restore = null; }
  const tips = [TIP(input.mode === 'pad' ? 'Left stick walks, right stick looks. A uses things, X swings the rebar.' : 'WASD to walk. Click to capture the mouse and look around; left-click swings, E uses things.'), TIP(controlHint('run')), TIP(controlHint('menu')), TIP('N jots an idea wherever you are. Workshop view, on the title screen and in the menu, tags every line Canon, Plausible or Experimental.')];
  const arrive = () => {
    if (!kept) {
      ui.fxGoggles.classList.add('is-dropping'); setTimeout(() => ui.fxGoggles.classList.remove('is-dropping'), 1800);
      say([STAGE('Goggles down. The blinding white-yellow of the morning goes a manageable amber.'), J('The pen first. Then the dung, the milk, and the tractor before the heat gets serious.'), ...tips]);
    } else say([{ who: 'jacob', text: pickLine(['Back out. The heat hasn’t missed me.', 'Right. Where was I? Dung. It’s always dung.'], state.uses.ydoor || 0), prov: ['X', NEW_HERE] }]);
    state.yardTime = state.yardTime || 0;
  };
  if (ui.fxFade.classList.contains('is-on')) {
    // the white of the doorway, carried over from the shack's page: hold it a beat, then let the yard in
    ui.fadeLine.textContent = 'Stepping out of the farmhouse was like walking into an oven.'; ui.fadeLine.hidden = false;
    setTimeout(() => { ui.fxFade.style.transition = ''; ui.fxFade.classList.remove('is-on'); ui.fadeLine.hidden = true; arrive(); }, reduceMotion ? 50 : 1400);
  } else arrive();
  updateHud();
  ui.canvas.focus({ preventScroll: true });
}
function restore(data) {
  if (!data || !data.pos) return;
  state.dawn = data.dawn || 0;
  state.routine = data.routine || {}; state.uses = data.uses || {}; state.flags = data.flags || {};
  state.noticed = new Set(data.noticed || []); state.seenBook = new Set(data.seenBook || []);
  for (const it of W.items) W.setGlint(it, !state.noticed.has(it.id));
  if (data.owned) for (const t of data.owned) takeTool(t, true);
  if (data.held) equip(data.held);
  ui.fxGoggles.hidden = !state.flags.gear;
  if (data.yard) Object.assign(state.yard, data.yard, { cowTalks: data.yard.cowTalks || {} });
  state.chores = data.chores || {};
  state.restore = { area: data.area, pos: data.pos, yaw: data.yaw, pitch: data.pitch };
}
function snapshot() {
  return { started: state.started, area: state.area, dawn: state.dawn, pos: [player.x, player.z], yaw: player.yaw, pitch: player.pitch, routine: { ...state.routine }, uses: { ...state.uses }, flags: { ...state.flags }, noticed: [...state.noticed], seenBook: [...state.seenBook], owned: [...state.owned], held: state.held, chores: { ...state.chores }, yard: { ...state.yard, scooped: [...state.yard.scooped] } };
}
const perf = { acc: 0, n: 0, ratio: 1, max: 1, cool: 3, slow: 0, upWait: 0, backoff: 8, raised: false };
// keep the frame rate up by trading sharpness: two slow spells in a row before dropping the resolution,
// steady frames to win it back, and longer between tries each time a step up doesn't hold
function adaptResolution(dt) {
  perf.acc += dt; perf.n++; perf.cool -= dt; perf.upWait -= dt;
  if (perf.acc < 2) return;
  const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
  if (perf.cool > 0) return;
  perf.slow = avg > 0.026 ? perf.slow + 1 : 0;
  let r = perf.ratio;
  if (perf.slow >= 2 && r > 0.6) {
    r = Math.max(0.6, r - 0.15); perf.slow = 0;
    if (perf.raised) perf.backoff = Math.min(120, perf.backoff * 2);
    perf.upWait = perf.backoff; perf.raised = false;
  } else if (avg < 0.0185 && r < perf.max && perf.upWait <= 0) { r = Math.min(perf.max, r + 0.1); perf.raised = true; }
  else if (avg < 0.0185) perf.raised = false;
  if (r !== perf.ratio) { perf.ratio = r; renderer.setPixelRatio(r); resize(); perf.cool = 2; }
}
function loop(ts) {
  requestAnimationFrame(loop);
  const raw = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  if (document.hidden) return;
  try { frame(raw); } catch (e) { if (!loop.failed) { loop.failed = true; console.error(e); } }
  post.render(area.scene, camera, vm.scene, vm.camera, state.started && !state.ended, raw);
  grabJotThumb();
  adaptResolution(raw);
}
function frame(raw) {
  pollInput(raw);
  const paused = state.menu || !state.started;
  let dt = raw;
  if (hitStop > 0) { hitStop -= raw; dt = 0; }
  time += dt;
  ctx.busy = busy();
  if (!state.started) { const s = area.spawn.start; player.yaw = s.yaw + Math.sin(time * 0.15) * 0.22; player.pitch = s.pitch + Math.sin(time * 0.11) * 0.04; }
  else if (!paused) { look(); move(dt); }
  else takeLook();
  combat.cool = Math.max(0, combat.cool - dt);
  if (combat.pending) { combat.pending.t -= dt; if (combat.pending.t <= 0) { const t = combat.pending.tool; combat.pending = null; resolveHit(t); } }
  if (state.started && !state.ended && state.area === 'shack' && !paused) state.dawn = Math.min(1, state.dawn + dt / 420);
  if (state.area === 'yard' && !paused) state.yardTime += dt;
  if (state.started && !state.ended && (frame.saveIn = (frame.saveIn ?? 5) - raw) <= 0) { frame.saveIn = 5; saveYard(); }
  area.setDawn(state.dawn);
  ctx.temp = temp(); ctx.started = state.started;
  placeCamera(dt);
  body.update(paused ? 0 : dt, player, player.yaw, { sprint: ctx.sprinting, groundY: player.y });
  vm.update(raw, camera, { bob: player.bob, speed: Math.hypot(player.vx, player.vz), sprint: ctx.sprinting, hidden: state.menu || (busy() && dlg.cur && dlg.cur.doc) });
  if (!state.menu) area.update(dt, time, ctx);
  // dung on its way to the bin
  for (let i = fling.length - 1; i >= 0; i--) {
    const f = fling[i]; f.t += dt; const u = Math.min(1, f.t / f.dur);
    f.mesh.visible = u < 1; f.mesh.position.lerpVectors(f.from, f.to, u); f.mesh.position.y = f.from.y + (f.to.y - f.from.y) * u + Math.sin(u * Math.PI) * 1.4;
    if (u >= 1) { sfx.binClang(spot(f.to)); fling.splice(i, 1); }
  }
  shadowClock -= dt;
  const every = state.area === 'yard' ? (isTouch() ? 1 / 30 : 0) : 0.5;
  if (shadowClock <= 0 || area.shadow.dirty) { renderer.shadowMap.needsUpdate = true; area.shadow.dirty = false; shadowClock = every; }
  updateTarget();
  updateDialogue(raw);
  updateWhisper(raw);
  updateAudio(raw);
  if (!state.menu) renderChecklist();
}
function buildYardLater() {
  yardPromise = new Promise((resolve) => {
    const go = async () => {
      if (!TB.yard) TB.yard = makeYardTextures(renderer.capabilities.getMaxAnisotropy());
      const Ya = buildYard(renderer, TB.shack, TB.yard);
      applyRelief(Ya.scene, reliefList());
      setShadow(Ya.sun, post.q.shadow, post.q.shadowRadius);
      Ya.Y.state = state.yard;
      Ya.Y.emit = yardEvent;
      Ya.Y.verb = (id, arg) => (YVERB[id] ? YVERB[id](arg) : 'Look');
      Ya.Y.isFound = (id) => save.found.has(id);
      Ya.Y.owns = (t) => state.owned.has(t);
      for (const it of Ya.Y.found) { if (save.found.has(it.def.id)) { it.model.visible = false; Ya.setGlint(it, false); } else if (it.def.id === 'librarycard') it.model.visible = false; }
      registerScales(Ya); resize();
      Ya.scene.add(body.root);
      try { await renderer.compileAsync(Ya.scene, camera); } catch (e) { /* compile on first frame instead */ }
      if (area && area !== Ya) area.scene.add(body.root);
      AREAS.yard = Ya;
      if (!state.started) { enterArea('yard', 'start'); ui.canvas.style.opacity = ''; }
      ui.start.disabled = false; ui.start.textContent = loadYard() && !cameFromShack ? 'Carry on' : 'Step outside';
      setTimeout(warmThumbs, 1500);
      resolve(Ya);
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(() => go());
  });
  return yardPromise;
}
async function start(data) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    ui.start.textContent = 'This needs WebGL, and this browser has it switched off';
    return;
  }
  perf.max = Math.min(window.devicePixelRatio || 1, 2); perf.ratio = perf.max;
  renderer.setPixelRatio(perf.ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;          // PCF with a radius: soft-edged shadows
  post = makePost(renderer);
  camera = new THREE.PerspectiveCamera(60, 1, 0.03, 160);
  camera.rotation.order = 'YXZ';
  ctx.camera = camera;
  await fontsReady();
  await new Promise(r => requestAnimationFrame(() => r()));
  const aniso = renderer.capabilities.getMaxAnisotropy();
  TB = { shack: makeTextures(aniso), body: null, yard: null };
  W = AREAS.shack = buildShack(renderer, TB.shack);
  applyRelief(W.scene, reliefList());
  applyQuality(input.settings.quality in QUALITY ? input.settings.quality : defaultQuality());
  TB.body = makeBodyTextures(aniso);
  body = buildBody(TB.body);
  vm = buildViewModel(TB.body, TB.shack);
  registerScales(W);
  bindInput({
    canvas: ui.canvas, ui,
    started: () => state.started, ended: () => state.ended, busy, menuOpen: () => state.menu,
    screenOpen: () => !ui.title.hidden || !ui.end.hidden,
    onAnyInput: () => initAudio(),
    onMode: () => { updateHud(); if (state.menu) renderMenu(); if (dlg.cur && !dlg.cur.fn) ui.dlgContinue.textContent = input.mode === 'pad' ? 'Press A to continue' : isTouch() ? 'Tap to continue' : 'Click or press E to continue'; },
    onUse: () => { if (state.target) useItem(state.target); },
    jotOpen: () => jot.open, onJot: openJot, onJotClose: closeJot, onJotSave: saveJot,
    onUseAt: (x, y, mouse) => tapAt(x, y, mouse),
    onAttack: attack,
    onSwap: (d) => swapTool(d),
    onSelectTool: (i) => { const k = TOOL_ORDER[i]; if (state.owned.has(k)) equip(k); },
    onBook: readBook,
    onMenu: (tab) => openMenu(tab),
    onTab: (d) => { if (state.menu) setTab(d); },
    onMenuNav: (d) => {
      const a = document.activeElement;
      if (state.menu && a && a.type === 'range' && (d === 'left' || d === 'right')) { const st = Number(a.step) || 0.1; a.value = String(clamp(Number(a.value) + (d === 'right' ? st : -st), Number(a.min), Number(a.max))); a.dispatchEvent(new Event('input', { bubbles: true })); return; }
      const root = state.menu ? ui.menu : !ui.title.hidden ? ui.title : ui.end; navFocus(root, d);
    },
    onMenuSelect: () => { const a = document.activeElement; if (a && (a.tagName === 'BUTTON')) a.click(); else if (!ui.title.hidden && !ui.start.disabled) ui.start.click(); },
    onBack: () => { if (state.menu) closeMenu(); else if (!ui.doc.hidden || dlg.cur) advance(); },
    onAdvance: advance,
    onStart: () => { if (!ui.start.disabled) begin(); },
    onLockChange: () => updateKeysHint(),
    onPadConnect: () => { toast('Controller connected · Xbox layout'); ui.padNote.hidden = true; if (state.menu) renderMenu(); },
    onPadDisconnect: () => toast('Controller disconnected'),
  });
  ui.menu.addEventListener('click', onMenuClick);
  ui.menuBody.addEventListener('input', (e) => {
    const id = e.target.id, v = Number(e.target.value), o = $(id + '-v'), S0 = input.settings;
    if (id === 'set-sens') { S0.sens = v; if (o) o.textContent = v.toFixed(1) + '×'; }
    if (id === 'set-bright') { S0.bright = v; areaLook(); if (o) o.textContent = Math.round(v * 100) + '%'; }
    if (id === 'set-fov') { S0.fov = v; resize(); if (o) o.textContent = v + '°'; }
    if (id === 'set-vvol') { voice.settings.vol = v; saveVoice(); if (o) o.textContent = Math.round(v * 100) + '%'; return; }
    saveSettings();
  });
  ui.menuClose.addEventListener('click', closeMenu);
  ui.menu.addEventListener('pointerdown', (e) => { if (e.target === ui.menu) closeMenu(); });
  ui.dlg.addEventListener('pointerdown', (e) => { e.preventDefault(); advance(); });
  ui.doc.addEventListener('pointerdown', (e) => { e.preventDefault(); advance(); });
  addEventListener('pointerdown', () => initAudio(), { capture: true });
  ui.start.addEventListener('click', () => begin());
  ui.inside.addEventListener('click', toShack);
  ui.titleWs.addEventListener('click', () => setWorkshop(!state.workshop));
  setWorkshop(state.workshop);
  ui.jotCancel.addEventListener('click', closeJot);
  ui.jotSave.addEventListener('click', saveJot);
  ui.jotKinds.addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; jot.kind = b.dataset.kind; for (const c of ui.jotKinds.children) c.setAttribute('aria-pressed', String(c === b)); });
  ui.jot.addEventListener('pointerdown', (e) => { if (e.target === ui.jot) closeJot(); });
  ui.endIdeas.addEventListener('click', () => { resumeYard(); openMenu('ideas'); });
  addEventListener('pagehide', saveYard);
  connectIdeas({ onChange: () => { if (state.menu && state.menuTab === 'ideas') renderMenu(); }, onFull: () => toast('The notebook is full. This idea is kept on this computer.') });
  ui.book.addEventListener('click', () => readBook());
  ui.menuBtn.addEventListener('click', () => openMenu());
  ui.sound.addEventListener('click', () => { initAudio(); setMuted(!audio.muted); });
  ui.routineToggle.addEventListener('click', () => setRoutineOpen(ui.routine.dataset.open !== 'true'));
  ui.endBack.addEventListener('click', resumeYard);
  ui.endRestart.addEventListener('click', () => { forgetMorning(); location.href = window.__SHACK_URL || 'index.html'; });
  enterArea('shack', 'start');
  ui.canvas.style.opacity = '0';   // the old shack interior only exists to keep the sketch's code whole; nobody needs to see it
  resize();
  addEventListener('resize', resize);
  // the shack's sun moves slowly, so its shadows only redraw twice a second; the yard's animals redraw them every frame
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  placeCamera(0);
  try { await renderer.compileAsync(W.scene, camera); } catch (err) { /* compile on first frame instead */ }
  updateHud();
  setMuted(audio.muted);
  requestAnimationFrame(loop);
  setTimeout(() => { if (input.padBlocked) ui.padNote.textContent = 'Controllers can’t be read inside this preview. Open the downloaded PC copy in Chrome or Edge to play with an Xbox controller.'; }, 800);
  buildYardLater().then(() => { if (cameFromShack || (data && data.started)) begin(); });
  if (window.__FARM_DEBUG) {
    window.__farm = { THREE, LEG, state, player, ctx, renderer, input, get W() { return W; }, get area() { return area; }, get camera() { return camera; }, get yard() { return AREAS.yard; }, get time() { return time; }, yardReady: () => yardPromise,
      use: (id) => useItem(area.items.find(i => i.id === id)), book: readBook, advance, begin, busy, attack, openMenu, closeMenu, setTab, goOutside, goInside, enterArea, takeTool, setCarry, findThing, swapTool, body: () => body, vm: () => vm, post: () => post, quality: (k) => { applyQuality(k); areaLook(); }, voice };
  }
}

window.claude?.hot?.snapshot?.(snapshot);
const boot = (data) => start(data || {});
if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot(window.claude?.hot?.data ?? {});
