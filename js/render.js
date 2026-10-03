// Rendering: ground, attractions, people, effects and day/night lighting.
'use strict';

const cam = { x: 0, y: 0, zoom: 1 };
let canvas, ctx, groundCanvas;
let hover = null; // {tx, ty}
let renderT = 0;

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }

function emoji(c, ch, x, y, size) {
  c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(ch, x, y + size * 0.05);
}

function shadow(c, x, y, w, h, r) {
  c.fillStyle = 'rgba(20,30,10,0.22)';
  rr(c, x + 4, y + 5, w, h, r);
  c.fill();
}

// ---------------------------------------------------------------- ground

function drawGround() {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  if (!groundCanvas) { groundCanvas = document.createElement('canvas'); groundCanvas.width = W; groundCanvas.height = H; }
  const c = groundCanvas.getContext('2d');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const h = hash(x, y);
    const px = x * TILE, py = y * TILE;
    c.fillStyle = (x + y) % 2 ? '#7ec85e' : '#79c259';
    if (h < 0.18) c.fillStyle = '#84cd63';
    c.fillRect(px, py, TILE, TILE);
    // grass tufts
    c.strokeStyle = 'rgba(40,110,30,0.35)';
    c.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const gx = px + hash(x * 3 + k, y) * TILE, gy = py + hash(x, y * 3 + k) * TILE;
      c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - 1.5, gy - 3); c.moveTo(gx, gy); c.lineTo(gx + 1.5, gy - 3); c.stroke();
    }
    if (h > 0.97) { c.fillStyle = '#fff6a8'; circle(c, px + 10, py + 12, 1.6); c.fill(); }
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!G.path[idx(x, y)]) continue;
    const px = x * TILE, py = y * TILE;
    c.fillStyle = '#c8b28c';
    c.fillRect(px - 1, py - 1, TILE + 2, TILE + 2);
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!G.path[idx(x, y)]) continue;
    const px = x * TILE, py = y * TILE;
    c.fillStyle = '#ecdcb8';
    const l = isPath(x - 1, y) ? 0 : 2, r = isPath(x + 1, y) ? 0 : 2, t = isPath(x, y - 1) ? 0 : 2, bt = isPath(x, y + 1) ? 0 : 2;
    c.fillRect(px + l, py + t, TILE - l - r, TILE - t - bt);
    // cobbles
    c.fillStyle = 'rgba(160,130,90,0.18)';
    for (let k = 0; k < 4; k++) {
      const cx = px + 4 + hash(x + k * 7, y) * (TILE - 8), cy = py + 4 + hash(x, y + k * 5) * (TILE - 8);
      rr(c, cx - 3, cy - 2, 6, 4, 2); c.fill();
    }
  }
  // gate plaza
  c.fillStyle = '#e2c98f';
  c.fillRect(GATE_X * TILE + 2, GATE_Y * TILE, TILE - 4, TILE);
  // fence along the edge
  c.strokeStyle = '#7a5a3a'; c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, W - 3, H - 3);
  groundDirty = false;
}

// ---------------------------------------------------------------- people

function drawPerson(c, x, y, o) {
  const s = o.scale || 1;
  const walk = o.walk || 0;
  const bob = Math.abs(Math.sin(walk * 10)) * 1.4 * s;
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(0, 5 * s, 4.6 * s, 2 * s, 0, 0, Math.PI * 2); c.fill();
  c.translate(0, -bob);
  // legs
  const sw = Math.sin(walk * 10) * 1.6 * s;
  c.strokeStyle = o.legs || '#2d2a40'; c.lineWidth = 1.8 * s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-1.5 * s, 2 * s); c.lineTo(-1.5 * s + sw, 5 * s); c.moveTo(1.5 * s, 2 * s); c.lineTo(1.5 * s - sw, 5 * s); c.stroke();
  // body
  c.fillStyle = o.shirt;
  rr(c, -3.8 * s, -3.5 * s, 7.6 * s, 7 * s, 3 * s); c.fill();
  if (o.coat) { c.fillStyle = o.coat; rr(c, -3.8 * s, -3.5 * s, 2.6 * s, 7 * s, 1.5 * s); c.fill(); rr(c, 1.2 * s, -3.5 * s, 2.6 * s, 7 * s, 1.5 * s); c.fill(); }
  // head
  c.fillStyle = o.skin;
  circle(c, 0, -6.6 * s, 3.4 * s); c.fill();
  c.fillStyle = o.hair;
  c.beginPath(); c.arc(0, -7.2 * s, 3.5 * s, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  // eyes
  c.fillStyle = '#1b1630';
  c.fillRect((o.face > 0 ? 0.6 : -1.8) * s, -6.8 * s, 0.9 * s, 0.9 * s);
  c.fillRect((o.face > 0 ? 2 : -0.4) * s, -6.8 * s, 0.9 * s, 0.9 * s);
  if (o.hat === 'top') {
    c.fillStyle = '#141018';
    c.fillRect(-4.2 * s, -9.8 * s, 8.4 * s, 1.4 * s);
    c.fillRect(-2.6 * s, -15 * s, 5.2 * s, 5.6 * s);
    c.fillStyle = '#e8434f'; c.fillRect(-2.6 * s, -11.2 * s, 5.2 * s, 1.1 * s);
  } else if (o.hat === 'cap') {
    c.fillStyle = o.capColor || '#2f6fe0';
    c.beginPath(); c.arc(0, -8 * s, 3.5 * s, Math.PI, 0); c.fill();
    c.fillRect(o.face > 0 ? 0 : -5 * s, -8.4 * s, 5 * s, 1.2 * s);
  }
  if (o.broom) {
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 1.3 * s;
    const sweep = Math.sin(renderT * 12) * (o.sweeping ? 2.5 : 0.4);
    c.beginPath(); c.moveTo(4 * s, -3 * s); c.lineTo(6 * s + sweep, 5 * s); c.stroke();
    c.fillStyle = '#e6c35a'; c.fillRect(4.5 * s + sweep, 4 * s, 3.5 * s, 2 * s);
  }
  if (o.mic) {
    c.strokeStyle = '#333'; c.lineWidth = 1.2 * s;
    c.beginPath(); c.moveTo(3.5 * s, -1 * s); c.lineTo(5.5 * s, -5 * s); c.stroke();
    c.fillStyle = '#bbb'; circle(c, 5.8 * s, -5.6 * s, 1.3 * s); c.fill();
  }
  if (o.item === 'balloon') {
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(3 * s, -2 * s); c.quadraticCurveTo(6 * s, -10 * s, 4 * s, -16 * s); c.stroke();
    c.fillStyle = o.balloonColor || '#ff5f6d';
    c.beginPath(); c.ellipse(4 * s, -19 * s, 3.2 * s, 3.8 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; circle(c, 3 * s, -20.2 * s, 0.9 * s); c.fill();
  } else if (o.item === 'teddy') {
    c.fillStyle = '#a0683a'; circle(c, 4.2 * s, 0, 2.2 * s); c.fill(); circle(c, 4.2 * s, -2.6 * s, 1.6 * s); c.fill();
  } else if (o.item === 'icecream') {
    c.fillStyle = '#e0a458'; c.beginPath(); c.moveTo(3 * s, -2 * s); c.lineTo(5.6 * s, -2 * s); c.lineTo(4.3 * s, 1.5 * s); c.fill();
    c.fillStyle = '#ffb7d5'; circle(c, 4.3 * s, -3 * s, 1.7 * s); c.fill();
  }
  c.restore();
}

function drawBubble(c, x, y, e, scale) {
  const s = scale || 1;
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.strokeStyle = 'rgba(27,22,48,0.25)'; c.lineWidth = 1;
  rr(c, -8 * s, -18 * s, 16 * s, 14 * s, 6 * s); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-2 * s, -4.5 * s); c.lineTo(0, -1 * s); c.lineTo(2 * s, -4.5 * s); c.fill();
  emoji(c, e, 0, -11 * s, 10 * s);
  c.restore();
}

// ---------------------------------------------------------------- attractions

function plaza(c, X, Y, W, H, fill, edge) {
  shadow(c, X + 2, Y + 2, W - 4, H - 4, 8);
  c.fillStyle = fill; rr(c, X + 2, Y + 2, W - 4, H - 4, 8); c.fill();
  c.strokeStyle = edge; c.lineWidth = 2; c.stroke();
}

function rideProgress(b) {
  if (b.state !== 'running') return 0;
  return 1 - b.timer / DEFS[b.type].duration;
}

function drawRiders(c, x, y, n, spread) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = SKINS[i % SKINS.length];
    circle(c, x + (i - (n - 1) / 2) * spread, y, 1.8); c.fill();
  }
}

function carAt(c, P, th, w, h, color, riders) {
  const [x, y] = P(th), [x2, y2] = P(th + 0.01);
  c.save();
  c.translate(x, y);
  c.rotate(Math.atan2(y2 - y, x2 - x));
  c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, -w / 2 + 2, -h / 2 + 3, w, h, 3); c.fill();
  c.fillStyle = color; rr(c, -w / 2, -h / 2, w, h, 3); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.stroke();
  if (riders) drawRiders(c, 0, 0, Math.min(riders, 2), 4);
  c.restore();
}

function tracePath(c, P, n) {
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = P(i / n * Math.PI * 2);
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
}

const DRAW = {
  coaster(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#9dd37e', '#6ea956');
    const cx = X + W / 2, cy = Y + H / 2 - 8, rx = W / 2 - 22, ry = H / 2 - 24;
    const P = th => [cx + rx * Math.cos(th) + rx * 0.16 * Math.cos(3 * th), cy + ry * Math.sin(th) + ry * 0.32 * Math.sin(2 * th)];
    // supports
    c.fillStyle = 'rgba(30,40,20,0.3)';
    for (let i = 0; i < 40; i++) { const [x, y] = P(i / 40 * Math.PI * 2); circle(c, x + 5, y + 7, 2.2); c.fill(); }
    c.lineJoin = 'round';
    tracePath(c, P, 140);
    c.setLineDash([2, 3]); c.lineWidth = 11; c.strokeStyle = '#6b4a35'; c.stroke(); c.setLineDash([]);
    c.lineWidth = 5; c.strokeStyle = '#c62f3b'; c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = '#ff9aa2'; c.stroke();
    // the vertical loop
    const [lx, ly] = P(0.15);
    c.lineWidth = 5; c.strokeStyle = '#c62f3b';
    c.beginPath(); c.ellipse(lx, ly, 8, 20, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = '#ff9aa2'; c.stroke();
    // station
    const [sx, sy] = P(Math.PI / 2);
    c.fillStyle = '#4b3b6b'; rr(c, sx - 30, sy + 6, 60, 14, 3); c.fill();
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fff' : '#e8434f'; c.fillRect(sx - 30 + i * 10, sy + 6, 10, 5); }
    // cars
    const p = rideProgress(b);
    const th = Math.PI / 2 + Math.PI * 4 * p + 0.3 * Math.sin(p * Math.PI * 8) * (p > 0 ? 1 : 0);
    const riders = b.riders.length;
    for (let k = 0; k < 4; k++) carAt(c, P, th - k * 0.13, 12, 8, k === 0 ? '#ffd23f' : '#ffe066', riders ? Math.ceil(riders / 4) : 0);
    if (b.state === 'running' && Math.sin(p * Math.PI * 8) > 0.9 && Math.random() < 0.3) {
      const [px, py] = P(th);
      particle({ x: px / TILE, y: py / TILE - 0.3, vy: -0.6, life: 0.9, kind: 'text', ch: pick(['AAAH!', 'WHEE!']), color: '#fff', size: 9 });
    }
  },

  train(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#a9d98d', '#78b060');
    const cx = X + W / 2, cy = Y + H / 2 - 4, rx = W / 2 - 18, ry = H / 2 - 18;
    const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    const P = th => [cx + rx * sp(Math.cos(th), 0.45), cy + ry * sp(Math.sin(th), 0.45)];
    // inner lawn with trees
    c.fillStyle = '#93cc75'; rr(c, cx - rx + 14, cy - ry + 12, rx * 2 - 28, ry * 2 - 24, 10); c.fill();
    for (let i = 0; i < 6; i++) { const tx = cx - rx + 30 + i * (rx * 2 - 60) / 5; c.fillStyle = '#3f8f3a'; circle(c, tx, cy, 6); c.fill(); c.fillStyle = '#58ad4c'; circle(c, tx - 1.5, cy - 1.5, 4); c.fill(); }
    tracePath(c, P, 160);
    c.setLineDash([2, 4]); c.lineWidth = 12; c.strokeStyle = '#7a5c3c'; c.stroke(); c.setLineDash([]);
    const rail = (o) => { const Q = th => { const [x, y] = P(th); const d = Math.hypot(x - cx, (y - cy) * rx / ry) || 1; return [x + (x - cx) / d * o, y + (y - cy) / d * o * ry / rx]; }; tracePath(c, Q, 160); c.lineWidth = 2; c.strokeStyle = '#9aa0b0'; c.stroke(); };
    rail(-4); rail(4);
    // station
    c.fillStyle = '#d9d2c3'; rr(c, cx - 40, Y + H - 16, 80, 10, 3); c.fill();
    c.fillStyle = '#2f6fe0'; rr(c, cx - 40, Y + H - 16, 80, 4, 2); c.fill();
    const p = rideProgress(b);
    const e = p < 0.15 ? (p / 0.15) ** 2 * 0.15 : p > 0.85 ? 1 - ((1 - p) / 0.15) ** 2 * 0.15 : p;
    const th = Math.PI / 2 - Math.PI * 2 * 3 * e;
    const riders = b.riders.length;
    for (let k = 4; k >= 0; k--) carAt(c, P, th + k * 0.2, k === 0 ? 18 : 15, 9, k === 0 ? '#ffffff' : '#e8f1ff', riders ? Math.ceil(riders / 5) : 0);
    // nose stripe on the locomotive
    const [hx, hy] = P(th), [hx2, hy2] = P(th - 0.01);
    c.save(); c.translate(hx, hy); c.rotate(Math.atan2(hy2 - hy, hx2 - hx));
    c.fillStyle = '#e8434f'; rr(c, 3, -4.5, 6, 9, 3); c.fill();
    c.restore();
    if (b.state === 'running' && p > 0.1 && p < 0.9 && Math.random() < 0.4) particle({ x: hx / TILE, y: hy / TILE, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), life: 0.5, color: 'rgba(255,255,255,0.7)', size: 3, kind: 'dust' });
  },

  jackpot(c, b, X, Y, W, H) {
    shadow(c, X + 3, Y + 3, W - 6, H - 6, 8);
    c.fillStyle = '#5b2a86'; rr(c, X + 3, Y + 3, W - 6, H - 6, 8); c.fill();
    c.fillStyle = '#3d1a5e'; rr(c, X + 10, Y + 10, W - 20, H - 26, 6); c.fill();
    // bulbs
    const n = 22, on = Math.floor(renderT * 5) % 2;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let bx, by;
      const per = 2 * (W - 12) + 2 * (H - 12);
      let d = t * per;
      if (d < W - 12) { bx = X + 6 + d; by = Y + 6; }
      else if ((d -= W - 12) < H - 12) { bx = X + W - 6; by = Y + 6 + d; }
      else if ((d -= H - 12) < W - 12) { bx = X + W - 6 - d; by = Y + H - 6; }
      else { d -= W - 12; bx = X + 6; by = Y + H - 6 - d; }
      c.fillStyle = (i + on) % 2 ? '#ffe066' : '#b8860b';
      circle(c, bx, by, 2); c.fill();
    }
    c.fillStyle = '#f2b84b';
    c.font = 'bold 11px "Shrikhand", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('JACKPOT', X + W / 2, Y + 20);
    const syms = ['🍒', '🔔', '7️⃣', '⭐', '💎', '🍋'];
    const spinning = b.state === 'running' && rideProgress(b) < 0.7;
    for (let i = 0; i < 3; i++) {
      const rx = X + W / 2 - 22 + i * 15, ry = Y + 32;
      c.fillStyle = '#fffaf0'; rr(c, rx, ry, 14, 18, 3); c.fill();
      const s = spinning ? syms[Math.floor(renderT * 14 + i * 2 + b.seed * 10) % syms.length] : syms[(Math.floor(b.runs * 7 + i * (b.runs % 3)) + 2) % syms.length];
      emoji(c, s, rx + 7, ry + 9, 10);
    }
    // lever
    c.strokeStyle = '#ccc'; c.lineWidth = 2;
    const lv = spinning ? 8 : -6;
    c.beginPath(); c.moveTo(X + W - 12, Y + 46); c.lineTo(X + W - 8, Y + 40 + lv); c.stroke();
    c.fillStyle = '#e8434f'; circle(c, X + W - 8, Y + 40 + lv, 3); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 8px "Barlow Semi Condensed", sans-serif';
    c.fillText('PRIZES', X + W / 2, Y + H - 15);
  },

  pool(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#f3e3c3', '#d6c09a');
    // deck tiles
    c.strokeStyle = 'rgba(180,150,110,0.25)'; c.lineWidth = 1;
    for (let x = X + 10; x < X + W; x += 10) { c.beginPath(); c.moveTo(x, Y + 3); c.lineTo(x, Y + H - 3); c.stroke(); }
    const px = X + 14, py = Y + 18, pw = W - 34, ph = H - 34;
    const grd = c.createLinearGradient(px, py, px, py + ph);
    grd.addColorStop(0, '#6fd3fb'); grd.addColorStop(1, '#1e88e5');
    c.fillStyle = '#fff'; rr(c, px - 3, py - 3, pw + 6, ph + 6, 14); c.fill();
    c.fillStyle = grd; rr(c, px, py, pw, ph, 12); c.fill();
    c.save(); rr(c, px, py, pw, ph, 12); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      for (let x = 0; x <= pw; x += 4) {
        const y = py + 8 + k * (ph / 6) + Math.sin(x * 0.12 + renderT * 2 + k) * 2;
        if (x) c.lineTo(px + x, y); else c.moveTo(px, y);
      }
      c.stroke();
    }
    // swimmers
    const n = b.riders.length;
    for (let i = 0; i < n; i++) {
      const a = renderT * 0.4 + i * 2.39 + b.seed * 6;
      const sx = px + pw / 2 + Math.cos(a) * (pw / 2 - 12) * (0.4 + (i % 3) * 0.25);
      const sy = py + ph / 2 + Math.sin(a * 1.3) * (ph / 2 - 10) * (0.4 + (i % 2) * 0.4);
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1; circle(c, sx, sy, 5 + Math.sin(renderT * 4 + i) * 1); c.stroke();
      c.fillStyle = SKINS[i % SKINS.length]; circle(c, sx, sy, 2.6); c.fill();
    }
    // float ring
    const fx = px + pw * 0.7 + Math.sin(renderT * 0.5) * 8, fy = py + ph * 0.35 + Math.cos(renderT * 0.4) * 5;
    c.lineWidth = 3.5; c.strokeStyle = '#ff6fb5'; circle(c, fx, fy, 5); c.stroke();
    c.restore();
    // slide
    c.lineCap = 'round';
    c.strokeStyle = '#ffd23f'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(X + W - 10, Y + 10); c.bezierCurveTo(X + W - 4, Y + H / 2, X + W - 30, Y + 12, px + pw - 8, py + ph / 2); c.stroke();
    c.strokeStyle = '#ff9f43'; c.lineWidth = 2; c.stroke();
    // umbrellas
    for (const [ux, uy] of [[X + 12, Y + H - 10], [X + 34, Y + 10]]) {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = k % 2 ? '#fff' : '#e8434f';
        c.beginPath(); c.moveTo(ux, uy); c.arc(ux, uy, 8, k * Math.PI / 4, (k + 1) * Math.PI / 4); c.fill();
      }
    }
  },

  carousel(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#f6e7c8', '#d9c296');
    const cx = X + W / 2, cy = Y + H / 2, r = W / 2 - 8;
    const rot = b.anim * (b.state === 'running' ? 1.2 : 0.2);
    c.fillStyle = 'rgba(0,0,0,0.2)'; circle(c, cx + 3, cy + 4, r); c.fill();
    for (let k = 0; k < 12; k++) {
      c.fillStyle = k % 2 ? '#fff4d6' : '#e8434f';
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, rot + k * Math.PI / 6, rot + (k + 1) * Math.PI / 6); c.fill();
    }
    c.strokeStyle = '#f2b84b'; c.lineWidth = 3; circle(c, cx, cy, r); c.stroke();
    for (let k = 0; k < 8; k++) {
      const a = -rot * 1.0 + k * Math.PI / 4, hr = r * 0.66;
      const bob = b.state === 'running' ? Math.sin(renderT * 4 + k) * 1.5 : 0;
      c.fillStyle = k % 2 ? '#ffffff' : '#ffe066';
      c.beginPath(); c.ellipse(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr + bob, 5, 3, a + Math.PI / 2, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#f2b84b'; circle(c, cx, cy, 7); c.fill();
    c.fillStyle = '#b8860b'; circle(c, cx, cy, 3); c.fill();
  },

  ferris(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#dfe8f0', '#b7c6d4');
    const cx = X + W / 2, cy = Y + H / 2 - 4, r = W / 2 - 14;
    c.strokeStyle = '#7d8aa0'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - 22, Y + H - 8); c.moveTo(cx, cy); c.lineTo(cx + 22, Y + H - 8); c.stroke();
    const rot = b.anim * (b.state === 'running' ? 0.5 : 0.05);
    c.strokeStyle = '#ffffff'; c.lineWidth = 2;
    for (let k = 0; k < 10; k++) { const a = rot + k * Math.PI / 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    c.strokeStyle = '#ff6fb5'; c.lineWidth = 3; circle(c, cx, cy, r); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; circle(c, cx, cy, r - 6); c.stroke();
    const cols = ['#e8434f', '#f2b84b', '#4fd1a5', '#2f6fe0', '#9b6dff'];
    for (let k = 0; k < 10; k++) {
      const a = rot + k * Math.PI / 5;
      const gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r;
      c.fillStyle = cols[k % 5]; rr(c, gx - 5, gy - 1, 10, 9, 3); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(gx - 3, gy + 1, 6, 3);
    }
    c.fillStyle = '#5c6b82'; circle(c, cx, cy, 5); c.fill();
  },

  bumper(c, b, X, Y, W, H) {
    shadow(c, X + 2, Y + 2, W - 4, H - 4, 6);
    c.fillStyle = '#ffd23f'; rr(c, X + 2, Y + 2, W - 4, H - 4, 6); c.fill();
    c.fillStyle = '#33374d'; rr(c, X + 7, Y + 7, W - 14, H - 14, 4); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1;
    for (let x = X + 14; x < X + W - 7; x += 8) { c.beginPath(); c.moveTo(x, Y + 7); c.lineTo(x, Y + H - 7); c.stroke(); }
    const cols = ['#e8434f', '#2f6fe0', '#4fd1a5', '#f2b84b', '#9b6dff', '#ff6fb5', '#ff9f43', '#1fb3c9'];
    const run = b.state === 'running';
    for (let k = 0; k < 8; k++) {
      let x, y, a;
      if (run) {
        const t = b.anim;
        x = X + W / 2 + Math.sin(t * (0.9 + k * 0.13) + k * 1.7) * (W / 2 - 18);
        y = Y + H / 2 + Math.sin(t * (1.1 + k * 0.17) + k) * (H / 2 - 16);
        a = t * (1 + k * 0.2) + k;
      } else { x = X + 18 + (k % 4) * ((W - 36) / 3); y = Y + 20 + Math.floor(k / 4) * (H - 40); a = 0; }
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = '#111'; rr(c, -7, -5, 14, 10, 4); c.fill();
      c.fillStyle = cols[k]; rr(c, -6, -4, 12, 8, 3); c.fill();
      if (run) { c.fillStyle = SKINS[k % 6]; circle(c, 0, 0, 2.2); c.fill(); }
      c.restore();
      if (run && Math.random() < 0.02) particle({ x: x / TILE, y: y / TILE, vx: rand(-1, 1), vy: rand(-1, 1), life: 0.3, color: '#ffe066', size: 2, kind: 'spark' });
    }
  },

  haunted(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#4b5a3a', '#34402a');
    // tombstones
    for (let i = 0; i < 4; i++) { c.fillStyle = '#9aa0a8'; rr(c, X + 8 + i * 12, Y + H - 16, 7, 9, 3); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.3)'; rr(c, X + 18, Y + 12, W - 30, H - 34, 4); c.fill();
    c.fillStyle = '#3d2c4f'; rr(c, X + 14, Y + 8, W - 30, H - 34, 4); c.fill();
    c.fillStyle = '#2a1e38';
    c.beginPath(); c.moveTo(X + 14, Y + 8); c.lineTo(X + W / 2 - 1, Y + 2); c.lineTo(X + W - 16, Y + 8); c.closePath(); c.fill();
    c.strokeStyle = '#1b1226'; c.lineWidth = 2; c.beginPath(); c.moveTo(X + W / 2 - 1, Y + 8); c.lineTo(X + W / 2 - 1, Y + H - 26); c.stroke();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const fl = hash(i + Math.floor(renderT * 3), j + b.id) > 0.35;
      c.fillStyle = fl ? '#ffd86b' : '#2a1e38';
      c.fillRect(X + 22 + i * ((W - 50) / 3), Y + 16 + j * ((H - 50) / 3), 5, 6);
    }
    // ghost
    const gx = X + W / 2 + Math.sin(renderT * 0.8 + b.seed * 6) * (W / 2 - 14), gy = Y + H / 2 + Math.cos(renderT * 1.1) * (H / 2 - 18);
    c.globalAlpha = 0.75 + Math.sin(renderT * 3) * 0.15;
    c.fillStyle = '#f4f6ff';
    c.beginPath(); c.arc(gx, gy, 7, Math.PI, 0); c.lineTo(gx + 7, gy + 8);
    for (let k = 0; k < 4; k++) c.lineTo(gx + 7 - (k + 0.5) * 3.5, gy + (k % 2 ? 8 : 5));
    c.lineTo(gx - 7, gy + 8); c.closePath(); c.fill();
    c.fillStyle = '#1b1630'; circle(c, gx - 2.5, gy - 1, 1.3); c.fill(); circle(c, gx + 2.5, gy - 1, 1.3); c.fill();
    c.globalAlpha = 1;
    // dead tree
    c.strokeStyle = '#2b1d14'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X + W - 10, Y + H - 8); c.lineTo(X + W - 12, Y + H - 24); c.lineTo(X + W - 18, Y + H - 30); c.moveTo(X + W - 12, Y + H - 22); c.lineTo(X + W - 6, Y + H - 28); c.stroke();
  },

  droptower(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#d8dde8', '#aab3c5');
    const cx = X + W / 2, cy = Y + H / 2;
    const p = rideProgress(b);
    let h = 0;
    if (b.state === 'running') h = p < 0.55 ? p / 0.55 : p < 0.7 ? 1 : p < 0.78 ? 1 - (p - 0.7) / 0.08 : Math.max(0, 0.1 - (p - 0.78));
    c.strokeStyle = '#e8434f'; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); c.stroke(); }
    c.fillStyle = `rgba(0,0,0,${0.25 - h * 0.12})`; circle(c, cx + 4 + h * 18, cy + 6 + h * 22, 18 + h * 2); c.fill();
    const rr2 = 16 + h * 14;
    c.fillStyle = '#2f6fe0'; circle(c, cx, cy - h * 6, rr2); c.fill();
    c.fillStyle = '#ffd23f'; circle(c, cx, cy - h * 6, rr2 - 5); c.fill();
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = k * Math.PI * 2 / n;
      c.fillStyle = b.riders.length > k ? SKINS[k % 6] : '#c9d2e0';
      circle(c, cx + Math.cos(a) * (rr2 - 2.5), cy - h * 6 + Math.sin(a) * (rr2 - 2.5), 2 + h); c.fill();
    }
    c.fillStyle = '#e4e8f0'; circle(c, cx, cy - h * 6, 7 + h * 5); c.fill();
    c.fillStyle = Math.floor(renderT * 2) % 2 ? '#ff3b3b' : '#7a1010'; circle(c, cx, cy - h * 6, 2.5 + h * 2); c.fill();
  },

  logflume(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#9ccf7c', '#6ea956');
    const cx = X + W / 2, cy = Y + H / 2, rx = W / 2 - 18, ry = H / 2 - 18;
    const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    const P = th => [cx + rx * sp(Math.cos(th), 0.6), cy + ry * sp(Math.sin(th), 0.6) + Math.sin(th * 2) * 4];
    // hill
    c.fillStyle = '#a07a52'; c.beginPath(); c.ellipse(cx + rx * 0.55, cy - ry * 0.3, 26, 18, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b8916a'; c.beginPath(); c.ellipse(cx + rx * 0.5, cy - ry * 0.36, 16, 10, 0, 0, Math.PI * 2); c.fill();
    tracePath(c, P, 120);
    c.lineWidth = 15; c.strokeStyle = '#7a5c3c'; c.stroke();
    c.lineWidth = 11; c.strokeStyle = '#3aa0e0'; c.stroke();
    c.setLineDash([3, 6]); c.lineDashOffset = -renderT * 20; c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    const p = rideProgress(b);
    const th = Math.PI / 2 + p * Math.PI * 4;
    for (let k = 0; k < 3; k++) carAt(c, P, th - k * 0.5 - (b.state === 'running' ? 0 : -k * 0.35), 14, 7, '#8b5a2b', b.riders.length ? 2 : 0);
    if (b.state === 'running' && Math.sin(th) < -0.9 && Math.random() < 0.6) {
      const [sx, sy] = P(th);
      for (let k = 0; k < 4; k++) particle({ x: sx / TILE, y: sy / TILE, vx: rand(-1.5, 1.5), vy: rand(-2.5, -1), g: 6, life: 0.6, color: '#bfe8ff', size: 2.2, kind: 'dot' });
    }
  },

  rocket(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#cfd3da', '#a2a8b3');
    const cx = X + W / 2, cy = Y + H / 2 + 6;
    c.strokeStyle = '#ffd23f'; c.lineWidth = 4; c.setLineDash([6, 6]); circle(c, cx, cy, 34); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#9aa0ab'; circle(c, cx, cy, 26); c.fill();
    // gantry
    c.strokeStyle = '#e8434f'; c.lineWidth = 2;
    c.strokeRect(X + W - 26, Y + 12, 10, H - 30);
    for (let y = Y + 14; y < Y + H - 20; y += 8) { c.beginPath(); c.moveTo(X + W - 26, y); c.lineTo(X + W - 16, y + 8); c.stroke(); }
    const p = rideProgress(b);
    let lift = 0;
    if (b.state === 'running') {
      if (p < 0.15) lift = 0;
      else if (p < 0.5) lift = ((p - 0.15) / 0.35) ** 2;
      else if (p < 0.6) lift = 1;
      else lift = 1 - Math.min(1, (p - 0.6) / 0.35);
    }
    const ry = cy - lift * 260, scale = 1 - lift * 0.4;
    if (b.state === 'running' && (p < 0.5 || p > 0.6)) {
      for (let k = 0; k < 3; k++) particle({ x: cx / TILE + rand(-0.2, 0.2), y: (ry + 20 * scale) / TILE, vx: rand(-0.4, 0.4), vy: rand(0.5, 1.5), life: 0.5, color: pick(['#ff9f43', '#ffe066', '#ff5f6d']), size: 3, kind: 'dot' });
      if (p < 0.2 || lift < 0.1) for (let k = 0; k < 2; k++) particle({ x: cx / TILE + rand(-0.6, 0.6), y: cy / TILE + 0.3, vx: rand(-1.5, 1.5), vy: rand(-0.4, 0.2), life: 1.2, color: 'rgba(230,230,235,0.8)', size: 6, kind: 'dust' });
    }
    c.save(); c.translate(cx, ry); c.scale(scale, scale);
    c.fillStyle = '#e8434f';
    c.beginPath(); c.moveTo(-10, 12); c.lineTo(-16, 22); c.lineTo(-6, 18); c.fill();
    c.beginPath(); c.moveTo(10, 12); c.lineTo(16, 22); c.lineTo(6, 18); c.fill();
    c.fillStyle = '#f5f5f7'; rr(c, -8, -18, 16, 38, 7); c.fill();
    c.beginPath(); c.moveTo(-8, -12); c.quadraticCurveTo(0, -36, 8, -12); c.fill();
    c.fillStyle = '#e8434f'; c.beginPath(); c.moveTo(-6, -18); c.quadraticCurveTo(0, -34, 6, -18); c.fill();
    c.fillStyle = '#58c4f6'; circle(c, 0, -4, 4); c.fill();
    c.strokeStyle = '#2f6fe0'; c.lineWidth = 1.5; c.stroke();
    c.restore();
  },

  dragon(c, b, X, Y, W, H) {
    plaza(c, X, Y, W, H, '#6b3a3a', '#4a2424');
    const cx = X + W / 2, cy = Y + H / 2;
    c.fillStyle = '#8a4b3a'; circle(c, cx, cy, W / 2 - 12); c.fill();
    c.strokeStyle = '#f2b84b'; c.lineWidth = 2; c.setLineDash([4, 4]); circle(c, cx, cy, W / 2 - 16); c.stroke(); c.setLineDash([]);
    const run = b.state === 'running';
    const a = run ? b.anim * 2.4 : Math.sin(renderT * 0.5) * 0.2;
    const len = W / 2 - 22;
    const flip = run ? 1 + 0.25 * Math.sin(b.anim * 5) : 1;
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.fillStyle = '#3a3a48'; rr(c, -len, -4, len * 2, 8, 4); c.fill();
    c.fillStyle = '#555'; circle(c, -len, 0, 8); c.fill();
    c.translate(len, 0); c.scale(flip, flip);
    // wings
    c.fillStyle = '#2e8b57';
    c.beginPath(); c.moveTo(-4, 0); c.quadraticCurveTo(-12, -22, 6, -16); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-4, 0); c.quadraticCurveTo(-12, 22, 6, 16); c.closePath(); c.fill();
    c.fillStyle = '#3cb371'; c.beginPath(); c.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3cb371'; c.beginPath(); c.ellipse(13, 0, 7, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe066'; circle(c, 15, -2.5, 1.5); c.fill(); circle(c, 15, 2.5, 1.5); c.fill();
    if (b.riders.length) drawRiders(c, -2, 0, 3, 4);
    c.restore();
    if (run && Math.random() < 0.5) {
      const hx = cx + Math.cos(a) * (len + 18), hy = cy + Math.sin(a) * (len + 18);
      particle({ x: hx / TILE, y: hy / TILE, vx: Math.cos(a + 1.57) * 2, vy: Math.sin(a + 1.57) * 2, life: 0.5, color: pick(['#ff9f43', '#ff5f6d', '#ffe066']), size: 3.5, kind: 'dot' });
    }
    c.fillStyle = '#f2b84b'; circle(c, cx, cy, 6); c.fill();
  },

  restroom(c, b, X, Y, W, H) {
    shadow(c, X + 3, Y + 3, W - 6, H - 6, 6);
    c.fillStyle = '#e9f1fb'; rr(c, X + 3, Y + 3, W - 6, H - 6, 6); c.fill();
    c.fillStyle = '#4a90d9'; rr(c, X + 3, Y + 3, W - 6, 12, 6); c.fill();
    emoji(c, '🚻', X + W / 2, Y + H / 2 + 5, 20);
  },

  bench(c, b, X, Y) {
    c.fillStyle = 'rgba(0,0,0,0.2)'; rr(c, X + 6, Y + 14, 24, 10, 2); c.fill();
    c.fillStyle = '#8a5a2b'; rr(c, X + 4, Y + 10, 24, 11, 2); c.fill();
    c.strokeStyle = '#6b4220'; c.lineWidth = 1;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(X + 4, Y + 13.5 + k * 3); c.lineTo(X + 28, Y + 13.5 + k * 3); c.stroke(); }
    b.serving.forEach((s, i) => {
      const g = G.gmap.get(s.gid);
      if (g) drawPerson(c, X + 10 + i * 12, Y + 14, { shirt: g.shirt, skin: g.skin, hair: g.hair, face: 1, scale: g.kid ? 0.8 : 1 });
    });
  },

  bin(c, b, X, Y) {
    c.fillStyle = 'rgba(0,0,0,0.2)'; circle(c, X + 18, Y + 19, 8); c.fill();
    c.fillStyle = '#2e9e5b'; circle(c, X + 16, Y + 16, 8); c.fill();
    c.fillStyle = '#1f6e3f'; circle(c, X + 16, Y + 16, 5); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♻', X + 16, Y + 16);
  },

  tree(c, b, X, Y) {
    const v = b.seed;
    const r = 11 + v * 4;
    c.fillStyle = 'rgba(20,40,10,0.25)'; circle(c, X + 19, Y + 21, r); c.fill();
    c.fillStyle = v > 0.5 ? '#2f7d32' : '#3a8a2e'; circle(c, X + 16, Y + 16, r); c.fill();
    c.fillStyle = v > 0.5 ? '#43a047' : '#57a83f'; circle(c, X + 13, Y + 13, r * 0.65); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.15)'; circle(c, X + 11, Y + 10, r * 0.3); c.fill();
    if (v > 0.8) { c.fillStyle = '#e8434f'; circle(c, X + 20, Y + 18, 1.8); c.fill(); circle(c, X + 12, Y + 20, 1.8); c.fill(); }
  },

  flowers(c, b, X, Y) {
    c.fillStyle = '#6b4a2b'; rr(c, X + 3, Y + 3, TILE - 6, TILE - 6, 6); c.fill();
    const cols = ['#ff6fb5', '#ffe066', '#ffffff', '#e8434f', '#9b6dff'];
    for (let k = 0; k < 7; k++) {
      const fx = X + 8 + hash(b.id, k) * 16, fy = Y + 8 + hash(k, b.id) * 16;
      c.fillStyle = '#3f8f3a'; circle(c, fx, fy, 3); c.fill();
      c.fillStyle = cols[(k + b.id) % cols.length]; circle(c, fx, fy, 2); c.fill();
    }
  },

  fountain(c, b, X, Y, W, H) {
    const cx = X + W / 2, cy = Y + H / 2;
    c.fillStyle = 'rgba(0,0,0,0.2)'; circle(c, cx + 3, cy + 4, W / 2 - 3); c.fill();
    c.fillStyle = '#c9c4bb'; circle(c, cx, cy, W / 2 - 3); c.fill();
    c.fillStyle = '#4fb6ec'; circle(c, cx, cy, W / 2 - 8); c.fill();
    for (let k = 0; k < 3; k++) {
      const ph = (renderT * 0.7 + k / 3) % 1;
      c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`; c.lineWidth = 1.2; circle(c, cx, cy, 5 + ph * (W / 2 - 14)); c.stroke();
    }
    c.fillStyle = '#e6e1d8'; circle(c, cx, cy, 6); c.fill();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + renderT, ph = (renderT * 1.5 + k * 0.13) % 1;
      c.fillStyle = 'rgba(220,245,255,0.9)';
      circle(c, cx + Math.cos(a) * ph * 14, cy + Math.sin(a) * ph * 14 - Math.sin(ph * Math.PI) * 10, 1.5); c.fill();
    }
  },

  stage(c, b, X, Y, W, H) {
    shadow(c, X + 2, Y + 2, W - 4, H - 4, 4);
    c.fillStyle = '#9b6a3e'; rr(c, X + 2, Y + 2, W - 4, H - 4, 4); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1;
    for (let x = X + 10; x < X + W - 4; x += 8) { c.beginPath(); c.moveTo(x, Y + 12); c.lineTo(x, Y + H - 2); c.stroke(); }
    c.fillStyle = '#b3212e'; rr(c, X + 2, Y + 2, W - 4, 12, 3); c.fill();
    for (let k = 0; k < 8; k++) { c.fillStyle = '#8c1822'; c.fillRect(X + 6 + k * ((W - 12) / 8), Y + 2, 2, 12); }
    c.fillStyle = '#f2b84b'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('★', X + W / 2, Y + H / 2 + 6);
  },
};

// Generic food/shop building with a striped awning and an icon sign.
function drawShop(c, b, X, Y, W, H) {
  const d = DEFS[b.type];
  if (b.w === 1 && b.h === 1) {
    // cart with umbrella
    c.fillStyle = 'rgba(0,0,0,0.22)'; circle(c, X + 18, Y + 19, 12); c.fill();
    for (let k = 0; k < 8; k++) {
      c.fillStyle = k % 2 ? d.color2 : d.color;
      c.beginPath(); c.moveTo(X + 16, Y + 15); c.arc(X + 16, Y + 15, 13, k * Math.PI / 4, (k + 1) * Math.PI / 4); c.fill();
    }
    if (b.type === 'balloon') {
      const cols = ['#ff5f6d', '#ffe066', '#58c4f6', '#4fd1a5', '#ff6fb5'];
      for (let k = 0; k < 5; k++) {
        const bx = X + 8 + k * 4, by = Y + 2 + Math.sin(renderT * 2 + k) * 1.5 - (k % 2) * 3;
        c.fillStyle = cols[k]; c.beginPath(); c.ellipse(bx, by, 3.5, 4.2, 0, 0, Math.PI * 2); c.fill();
      }
    }
    c.fillStyle = '#fff'; circle(c, X + 16, Y + 15, 6.5); c.fill();
    emoji(c, d.icon, X + 16, Y + 15, 9);
    return;
  }
  shadow(c, X + 3, Y + 3, W - 6, H - 6, 6);
  c.fillStyle = d.color; rr(c, X + 3, Y + 3, W - 6, H - 6, 6); c.fill();
  // roof highlight
  c.fillStyle = 'rgba(255,255,255,0.18)'; rr(c, X + 6, Y + 6, W - 12, H - 22, 4); c.fill();
  // awning
  const ay = Y + H - 16, stripes = Math.max(4, Math.round((W - 6) / 8));
  const sw = (W - 6) / stripes;
  for (let k = 0; k < stripes; k++) {
    c.fillStyle = k % 2 ? d.color2 : d.color;
    c.fillRect(X + 3 + k * sw, ay, sw, 8);
    c.beginPath(); c.arc(X + 3 + k * sw + sw / 2, ay + 8, sw / 2, 0, Math.PI); c.fill();
  }
  c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1; c.strokeRect(X + 3, ay, W - 6, 8);
  // sign
  const sr = Math.min(W, H) * 0.24;
  c.fillStyle = '#fffaf0'; circle(c, X + W / 2, Y + (H - 16) / 2 + 3, sr); c.fill();
  c.strokeStyle = d.color2; c.lineWidth = 2; c.stroke();
  emoji(c, d.icon, X + W / 2, Y + (H - 16) / 2 + 3, sr * 1.25);
  if (b.type === 'restaurant') {
    c.fillStyle = '#f2b84b'; c.font = 'bold 9px "Shrikhand", cursive'; c.textAlign = 'center';
    c.fillText('Grand', X + 22, Y + 14); c.fillText('Dining', X + W - 22, Y + 14);
  }
}

function drawBuilding(c, b) {
  const X = b.x * TILE, Y = b.y * TILE, W = b.w * TILE, H = b.h * TILE;
  const fn = DRAW[b.type];
  if (fn) fn(c, b, X, Y, W, H); else drawShop(c, b, X, Y, W, H);
}

function drawEntranceSign(c, b) {
  const d = DEFS[b.type];
  if (d.passive || b.ex < 0 || d.cat === 'facility') return;
  const x = b.ex * TILE + TILE / 2, y = b.ey * TILE + TILE / 2;
  // small ticket booth flag on the path edge nearest the building
  const dx = Math.sign((b.x + b.w / 2) - (b.ex + 0.5)), dy = Math.sign((b.y + b.h / 2) - (b.ey + 0.5));
  const fx = x + (Math.abs(dx) > Math.abs(dy) ? dx * 13 : 10), fy = y + (Math.abs(dy) >= Math.abs(dx) ? dy * 13 : -10);
  c.strokeStyle = '#5a4630'; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 10); c.stroke();
  c.fillStyle = isOpen(b) ? '#4fd1a5' : '#e8434f';
  c.beginPath(); c.moveTo(fx, fy - 10); c.lineTo(fx + 7, fy - 7.5); c.lineTo(fx, fy - 5); c.fill();
}

function drawStatusIcon(c, b) {
  const d = DEFS[b.type];
  if (d.passive) return;
  let icon = null;
  if (b.ex < 0) icon = '🛤️';
  else if (!b.open) icon = '🚫';
  else if (d.needsOp && !b.opHere) icon = G.staff.some(s => s.assign === b.id) ? '⏳' : '👷';
  if (!icon) return;
  const x = (b.x + b.w / 2) * TILE, y = b.y * TILE - 4 + Math.sin(renderT * 3) * 2;
  c.fillStyle = 'rgba(27,22,48,0.85)'; circle(c, x, y, 10); c.fill();
  c.strokeStyle = '#f2b84b'; c.lineWidth = 1.5; c.stroke();
  emoji(c, icon, x, y, 11);
}

function drawGate(c) {
  const x = GATE_X * TILE, y = GATE_Y * TILE;
  // pillars
  for (const px of [x - TILE + 6, x + TILE + 6]) {
    c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, px + 3, y + 6, 20, 24, 4); c.fill();
    c.fillStyle = '#e8434f'; rr(c, px, y + 2, 20, 26, 4); c.fill();
    c.fillStyle = '#f2b84b'; rr(c, px + 3, y + 5, 14, 4, 2); c.fill();
  }
  // arch banner
  c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, x - TILE + 4, y - 10, TILE * 3, 20, 8); c.fill();
  c.fillStyle = '#1b1630'; rr(c, x - TILE + 2, y - 14, TILE * 3 - 4, 20, 8); c.fill();
  c.strokeStyle = '#f2b84b'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#f2b84b'; c.font = '12px "Shrikhand", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('Showtime Park', x + TILE / 2, y - 4);
  const on = Math.floor(renderT * 4) % 2;
  for (let k = 0; k < 9; k++) { c.fillStyle = (k + on) % 2 ? '#ffe066' : '#8a6a1a'; circle(c, x - TILE + 8 + k * 11, y + 6, 1.6); c.fill(); }
}

function drawLitter(c) {
  for (const l of G.litter) {
    const x = l.x * TILE, y = l.y * TILE;
    c.save(); c.translate(x, y); c.rotate(l.rot);
    if (l.kind === 0) { c.fillStyle = '#f4f4f4'; circle(c, 0, 0, 2.6); c.fill(); c.strokeStyle = '#bbb'; c.lineWidth = 0.6; c.stroke(); }
    else if (l.kind === 1) { c.fillStyle = '#e8434f'; c.fillRect(-1.8, -3, 3.6, 5); c.fillStyle = '#fff'; c.fillRect(-1.8, -1, 3.6, 1); }
    else if (l.kind === 2) { c.fillStyle = '#ffd23f'; c.fillRect(-3, -1.5, 6, 3); }
    else { c.fillStyle = '#8a5a2b'; circle(c, 0, 0, 2.2); c.fill(); }
    c.restore();
  }
}

// ---------------------------------------------------------------- characters

function guestDrawPos(g) {
  if (g.state === 'queue') {
    const b = G.bmap.get(g.target);
    if (b && b.ex >= 0) {
      const i = Math.max(0, b.queue.indexOf(g.id));
      const col = i % 4, row = Math.floor(i / 4);
      return [(b.ex + 0.2 + col * 0.2) * TILE, (b.ey + 0.3 + (row % 4) * 0.17) * TILE];
    }
  }
  return [g.x * TILE, g.y * TILE];
}

function drawCharacters(c) {
  const list = [];
  for (const g of G.guests) {
    if (g.state === 'inside') continue;
    const [x, y] = guestDrawPos(g);
    list.push({ y, draw: () => {
      const moving = g.state === 'walk' || g.state === 'wander' || g.state === 'leave' || (g.state === 'watch' && g.nx >= 0);
      drawPerson(c, x, y, { shirt: g.shirt, skin: g.skin, hair: g.hair, face: g.face, scale: g.kid ? 0.78 : 1, walk: moving ? g.walkT : 0, item: g.item, balloonColor: SHIRTS[g.id % 6] });
      if (g.thoughtT > 0 && g.thought) drawBubble(c, x, y - (g.kid ? 9 : 12), g.thought.e, 0.9);
      if (UI.sel && UI.sel.kind === 'guest' && UI.sel.id === g.id) selRing(c, x, y);
    } });
  }
  for (const s of G.staff) {
    const x = s.x * TILE, y = s.y * TILE;
    list.push({ y, draw: () => {
      const t = STAFF_TYPES[s.role];
      const moving = !(s.atPost || s.sweepT > 0) && s.nx >= 0;
      drawPerson(c, x, y, { shirt: t.color, skin: SKINS[s.id % 6], hair: HAIRS[s.id % 7], face: s.face, walk: moving ? s.walkT : 0, hat: 'cap', capColor: s.role === 'cleaner' ? '#1f6e3f' : '#f2b84b', broom: s.role === 'cleaner', sweeping: s.sweepT > 0, legs: '#1b1630' });
      if (UI.sel && UI.sel.kind === 'staff' && UI.sel.id === s.id) selRing(c, x, y);
    } });
  }
  const e = G.ent;
  list.push({ y: e.y * TILE, draw: () => {
    const x = e.x * TILE, y = e.y * TILE;
    if (e.state === 'show') {
      const grd = c.createRadialGradient(x, y + 4, 2, x, y + 4, 4.5 * TILE);
      grd.addColorStop(0, 'rgba(255,230,120,0.35)'); grd.addColorStop(1, 'rgba(255,230,120,0)');
      c.fillStyle = grd; circle(c, x, y + 4, 4.5 * TILE); c.fill();
    }
    // star under the entertainer
    c.fillStyle = 'rgba(242,184,75,0.5)';
    starPath(c, x, y + 5, 9, 4, renderT * 0.8); c.fill();
    const dance = e.state === 'show' ? Math.sin(renderT * 8) * 2 : 0;
    drawPerson(c, x + dance, y, { shirt: '#ffffff', coat: '#6a2fb8', skin: '#e9b48f', hair: '#2b1d14', face: e.state === 'show' ? (Math.sin(renderT * 3) > 0 ? 1 : -1) : e.face, scale: 1.35, walk: e.state === 'walk' ? e.walkT : (e.state === 'show' ? renderT * 0.6 : 0), hat: 'top', mic: true, legs: '#141018' });
    if (UI.sel && UI.sel.kind === 'ent') selRing(c, x, y, 1.4);
  } });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.draw();
}

function starPath(c, x, y, R, r, rot) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5, rad = i % 2 ? r : R;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.5;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}

function selRing(c, x, y, s) {
  s = s || 1;
  c.strokeStyle = '#f2b84b'; c.lineWidth = 2;
  c.setLineDash([3, 3]); c.lineDashOffset = -renderT * 10;
  c.beginPath(); c.ellipse(x, y + 4 * s, 9 * s, 4.5 * s, 0, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]); c.lineDashOffset = 0;
}

// ---------------------------------------------------------------- effects & lighting

function drawPopups(c) {
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const p of G.popups) {
    const a = 1 - p.t / 1.5;
    c.globalAlpha = Math.max(0, a);
    c.font = 'bold 11px "Barlow Semi Condensed", sans-serif';
    const x = p.x * TILE, y = p.y * TILE - p.t * 22;
    c.lineWidth = 3; c.strokeStyle = 'rgba(27,22,48,0.8)'; c.strokeText(p.text, x, y);
    c.fillStyle = p.color; c.fillText(p.text, x, y);
  }
  c.globalAlpha = 1;
}

function drawParticles(c, additive) {
  for (const p of G.particles) {
    const isAdd = p.kind === 'spark';
    if (isAdd !== additive) continue;
    const a = 1 - p.t / p.life;
    c.globalAlpha = Math.max(0, a);
    const x = p.x * TILE, y = p.y * TILE;
    if (p.kind === 'note' || p.kind === 'text') {
      c.font = `bold ${p.size}px "Barlow Semi Condensed", sans-serif`; c.textAlign = 'center';
      if (p.kind === 'text') { c.lineWidth = 3; c.strokeStyle = 'rgba(27,22,48,0.7)'; c.strokeText(p.ch, x, y); }
      c.fillStyle = p.color; c.fillText(p.ch, x, y);
    } else if (p.kind === 'confetti') {
      c.fillStyle = p.color; c.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size * 0.6);
    } else if (p.kind === 'dust') {
      c.fillStyle = p.color; circle(c, x, y, p.size * (1 + p.t)); c.fill();
    } else {
      c.fillStyle = p.color; circle(c, x, y, p.size); c.fill();
    }
  }
  c.globalAlpha = 1;
}

function darkness() {
  const h = G.time / 60;
  if (h >= 7.5 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3 * 0.7;
  if (h >= 20.5 || h < 5) return 0.7;
  return 0.7 * (1 - (h - 5) / 2.5);
}

function drawLighting(c) {
  const dk = darkness();
  if (dk <= 0) return;
  c.fillStyle = `rgba(16,12,52,${dk})`;
  c.fillRect(-TILE * 10, -TILE * 10, (MAP_W + 20) * TILE, (MAP_H + 20) * TILE);
  c.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col, a) => {
    const grd = c.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, col.replace('A', (a * dk).toFixed(3))); grd.addColorStop(1, col.replace('A', '0'));
    c.fillStyle = grd; c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const b of G.buildings) {
    const d = DEFS[b.type];
    if (b.type === 'tree' || b.type === 'flowers' || b.type === 'bin' || b.type === 'bench') continue;
    const cx = (b.x + b.w / 2) * TILE, cy = (b.y + b.h / 2) * TILE;
    const col = d.cat === 'ride' ? 'rgba(255,200,120,A)' : 'rgba(255,230,170,A)';
    glow(cx, cy, Math.max(b.w, b.h) * TILE * 0.75, col, 0.5);
    if (b.type === 'ferris' || b.type === 'carousel') {
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2 + renderT * 0.5;
        const cols = ['rgba(255,95,109,A)', 'rgba(255,224,102,A)', 'rgba(88,196,246,A)', 'rgba(155,109,255,A)'];
        glow(cx + Math.cos(a) * b.w * TILE * 0.38, cy + Math.sin(a) * b.h * TILE * 0.38, 7, cols[k % 4], 1.2);
      }
    }
  }
  // lamps along the paths
  for (let y = 0; y < MAP_H; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < MAP_W; x += 3) {
    if (isPath(x, y)) glow(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 1.4, 'rgba(255,214,140,A)', 0.55);
  }
  glow(GATE_X * TILE + TILE / 2, GATE_Y * TILE, TILE * 2.5, 'rgba(255,214,140,A)', 0.8);
  if (G.ent.state === 'show') glow(G.ent.x * TILE, G.ent.y * TILE, TILE * 4, 'rgba(255,236,160,A)', 1.2);
  c.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- tool previews

function drawToolPreview(c) {
  if (!hover) return;
  const tool = UI.tool;
  if (tool.kind === 'build') {
    const d = DEFS[tool.type];
    const x = hover.tx - Math.floor((d.w - 1) / 2), y = hover.ty - Math.floor((d.h - 1) / 2);
    const res = canPlace(tool.type, x, y);
    c.globalAlpha = 0.65;
    drawBuilding(c, { type: tool.type, x, y, w: d.w, h: d.h, riders: [], serving: [], queue: [], state: 'idle', anim: renderT, seed: 0.5, runs: 0, id: 0 });
    c.globalAlpha = 1;
    c.fillStyle = res.ok ? 'rgba(79,209,165,0.28)' : 'rgba(232,67,79,0.35)';
    c.fillRect(x * TILE, y * TILE, d.w * TILE, d.h * TILE);
    c.strokeStyle = res.ok ? '#4fd1a5' : '#e8434f'; c.lineWidth = 2;
    c.strokeRect(x * TILE, y * TILE, d.w * TILE, d.h * TILE);
    if (!res.ok) {
      c.font = 'bold 12px "Barlow Semi Condensed", sans-serif'; c.textAlign = 'center';
      const tx = (x + d.w / 2) * TILE, ty = y * TILE - 8;
      c.lineWidth = 3; c.strokeStyle = '#1b1630'; c.strokeText(res.reason, tx, ty);
      c.fillStyle = '#fff'; c.fillText(res.reason, tx, ty);
    }
  } else if (tool.kind === 'path') {
    const ok = canPath(hover.tx, hover.ty);
    c.fillStyle = ok ? 'rgba(236,220,184,0.7)' : 'rgba(232,67,79,0.3)';
    c.fillRect(hover.tx * TILE, hover.ty * TILE, TILE, TILE);
    c.strokeStyle = ok ? '#fff' : '#e8434f'; c.lineWidth = 2; c.strokeRect(hover.tx * TILE, hover.ty * TILE, TILE, TILE);
  } else if (tool.kind === 'bulldoze') {
    const o = inMap(hover.tx, hover.ty) ? G.occ[idx(hover.tx, hover.ty)] : 0;
    const b = o > 0 ? G.bmap.get(o) : null;
    c.fillStyle = 'rgba(232,67,79,0.35)'; c.strokeStyle = '#e8434f'; c.lineWidth = 2;
    if (b) { c.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE); c.strokeRect(b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE); }
    else { c.fillRect(hover.tx * TILE, hover.ty * TILE, TILE, TILE); c.strokeRect(hover.tx * TILE, hover.ty * TILE, TILE, TILE); }
  } else if (tool.kind === 'move') {
    c.strokeStyle = '#f2b84b'; c.lineWidth = 2; c.setLineDash([4, 3]);
    c.strokeRect(hover.tx * TILE + 2, hover.ty * TILE + 2, TILE - 4, TILE - 4); c.setLineDash([]);
  }
}

function drawSelection(c) {
  if (!UI.sel || UI.sel.kind !== 'building') return;
  const b = G.bmap.get(UI.sel.id);
  if (!b) return;
  c.strokeStyle = '#f2b84b'; c.lineWidth = 2.5; c.setLineDash([6, 4]); c.lineDashOffset = -renderT * 12;
  rr(c, b.x * TILE - 2, b.y * TILE - 2, b.w * TILE + 4, b.h * TILE + 4, 8); c.stroke();
  c.setLineDash([]); c.lineDashOffset = 0;
  if (b.ex >= 0) { c.strokeStyle = 'rgba(242,184,75,0.8)'; c.lineWidth = 1.5; c.strokeRect(b.ex * TILE + 3, b.ey * TILE + 3, TILE - 6, TILE - 6); }
}

// ---------------------------------------------------------------- frame

function render(dt) {
  renderT += dt;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  if (groundDirty) drawGround();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3d6b34';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(groundCanvas, 0, 0);
  drawLitter(ctx);
  const sorted = [...G.buildings].sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const b of sorted) drawBuilding(ctx, b);
  for (const b of sorted) drawEntranceSign(ctx, b);
  drawSelection(ctx);
  drawCharacters(ctx);
  drawGate(ctx);
  drawParticles(ctx, false);
  drawLighting(ctx);
  ctx.globalCompositeOperation = 'lighter';
  drawParticles(ctx, true);
  ctx.globalCompositeOperation = 'source-over';
  for (const b of sorted) drawStatusIcon(ctx, b);
  drawPopups(ctx);
  drawToolPreview(ctx);
}
