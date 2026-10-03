// Boot, game loop, camera and input.
'use strict';

const keys = new Set();
let lastSpeed = 1;

function viewSize() { return [canvas.clientWidth, canvas.clientHeight]; }

function clampCamera() {
  const [w, h] = viewSize();
  const vw = w / cam.zoom, vh = h / cam.zoom;
  cam.x = clamp(cam.x, -vw * 0.5, MAP_W * TILE - vw * 0.5);
  cam.y = clamp(cam.y, -vh * 0.5, MAP_H * TILE - vh * 0.4);
}

function centerCamera() {
  const [w, h] = viewSize();
  const fit = Math.min(w / (MAP_W * TILE), (h - 220) / (MAP_H * TILE));
  cam.zoom = clamp(fit * 1.12, 0.62, 1.6);
  const focusX = (GATE_X + 0.5) * TILE, focusY = 15 * TILE;
  cam.x = focusX - w / cam.zoom / 2;
  cam.y = focusY - (h + 40) / cam.zoom / 2;
  clampCamera();
}

function zoomAt(sx, sy, factor) {
  const [wx, wy] = [sx / cam.zoom + cam.x, sy / cam.zoom + cam.y];
  cam.zoom = clamp(cam.zoom * factor, 0.4, 3);
  cam.x = wx - sx / cam.zoom;
  cam.y = wy - sy / cam.zoom;
  clampCamera();
}

function tileAt(sx, sy) {
  const wx = sx / cam.zoom + cam.x, wy = sy / cam.zoom + cam.y;
  return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE), wx: wx / TILE, wy: wy / TILE };
}

function buildOrigin(type, t) {
  const d = DEFS[type];
  return [t.tx - Math.floor((d.w - 1) / 2), t.ty - Math.floor((d.h - 1) / 2)];
}

// ---------------------------------------------------------------- clicks

function pickAt(t) {
  const e = G.ent;
  if (Math.hypot(e.x - t.wx, e.y - 0.15 - t.wy) < 0.6) return { kind: 'ent' };
  let best = null, bd = 0.5;
  for (const s of G.staff) {
    const d = Math.hypot(s.x - t.wx, s.y - 0.15 - t.wy);
    if (d < bd) { bd = d; best = { kind: 'staff', id: s.id }; }
  }
  for (const g of G.guests) {
    if (g.state === 'inside') continue;
    const [px, py] = guestDrawPos(g);
    const d = Math.hypot(px / TILE - t.wx, py / TILE - 0.15 - t.wy);
    if (d < bd) { bd = d; best = { kind: 'guest', id: g.id }; }
  }
  if (best) return best;
  if (inMap(t.tx, t.ty)) {
    const o = G.occ[idx(t.tx, t.ty)];
    if (o > 0) return { kind: 'building', id: o };
  }
  return null;
}

function handleClick(t) {
  const tool = UI.tool;
  if (tool.kind === 'build') {
    const [x, y] = buildOrigin(tool.type, t);
    const d = DEFS[tool.type];
    const res = canPlace(tool.type, x, y);
    if (!res.ok) { UI.toast(res.reason, 'warn'); return; }
    const b = placeBuilding(tool.type, x, y);
    UI.toast(`${d.name} built for ${money(d.cost)}.` + (d.needsOp && !G.staff.some(s => s.assign === b.id) ? ' It needs an operator. Hire one in Staff.' : ''), d.cat === 'ride' ? 'goal' : '');
    if (d.cat === 'ride' || G.money < d.cost) { UI.setTool({ kind: 'select' }); UI.select({ kind: 'building', id: b.id }); }
    UI.renderBuildList();
  } else if (tool.kind === 'move') {
    if (sendEntertainer(t.tx, t.ty)) UI.setTool({ kind: 'select' });
    else UI.toast(G.ent.state === 'show' ? 'Finish your show first!' : 'Pick a spot on or next to a path.', 'warn');
  } else if (tool.kind === 'bulldoze') {
    if (!inMap(t.tx, t.ty)) return;
    const o = G.occ[idx(t.tx, t.ty)];
    if (o > 0) UI.confirmDemolish(G.bmap.get(o));
    else if (G.path[idx(t.tx, t.ty)] === 2) UI.toast("You can't remove the park gate.", 'warn');
  } else if (tool.kind === 'select') {
    UI.select(pickAt(t));
  }
}

function paintTile(tx, ty) {
  if (UI.tool.kind === 'path') {
    if (!canPath(tx, ty) && inMap(tx, ty) && !G.path[idx(tx, ty)] && G.money < PATH_COST) UI.toast('Not enough cash for more path.', 'warn');
    placePath(tx, ty);
  } else if (UI.tool.kind === 'bulldoze') {
    if (G.path[idx(tx, ty)] === 2) return;
    removePath(tx, ty);
  }
}

// ---------------------------------------------------------------- pointer input

function bindInput() {
  const pointers = new Map();
  let drag = null, pinch = null;

  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
      drag = null;
      return;
    }
    const t = tileAt(x, y);
    const paint = e.button === 0 && (UI.tool.kind === 'path' || UI.tool.kind === 'bulldoze');
    drag = { sx: x, sy: y, cx: cam.x, cy: cam.y, moved: false, paint, last: [t.tx, t.ty], pan: !paint || e.button !== 0 };
    if (paint) paintTile(t.tx, t.ty);
  });

  canvas.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    const t = tileAt(x, y);
    hover = e.pointerType === 'touch' && UI.tool.kind === 'select' ? null : { tx: t.tx, ty: t.ty };
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomAt(mx, my, (pinch.zoom * d / pinch.d) / cam.zoom);
      return;
    }
    if (!drag) return;
    const dx = x - drag.sx, dy = y - drag.sy;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.paint) {
      let [lx, ly] = drag.last;
      // walk from the last painted tile to this one so paths stay connected
      while (lx !== t.tx || ly !== t.ty) {
        if (lx !== t.tx) lx += Math.sign(t.tx - lx); else ly += Math.sign(t.ty - ly);
        paintTile(lx, ly);
      }
      drag.last = [t.tx, t.ty];
    } else if (drag.moved) {
      cam.x = drag.cx - dx / cam.zoom;
      cam.y = drag.cy - dy / cam.zoom;
      clampCamera();
    }
  });

  const end = e => {
    const [x, y] = pos(e);
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (drag && !drag.moved && e.type === 'pointerup' && e.button !== 2) handleClick(tileAt(x, y));
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hover = null; });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); UI.setTool({ kind: 'select' }); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [x, y] = pos(e);
    zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (UI.modalOpen && UI.modalDismissable) UI.closeModal();
      else { UI.setTool({ kind: 'select' }); UI.select(null); }
      return;
    }
    if (UI.modalOpen) return;
    if (k === ' ') {
      e.preventDefault();
      if (G.speed) { lastSpeed = G.speed; UI.setSpeed(0); } else UI.setSpeed(lastSpeed || 1);
    } else if (k === '1') UI.setSpeed(1);
    else if (k === '2') UI.setSpeed(2);
    else if (k === '3') UI.setSpeed(4);
    else if (k === 'p') { UI.tab = 'tools'; UI.renderTabs(); UI.setTool({ kind: 'path' }); }
    else if (k === 'b') { UI.tab = 'tools'; UI.renderTabs(); UI.setTool({ kind: 'bulldoze' }); }
    else if (k === '+' || k === '=') { const [w, h] = viewSize(); zoomAt(w / 2, h / 2, 1.2); }
    else if (k === '-') { const [w, h] = viewSize(); zoomAt(w / 2, h / 2, 1 / 1.2); }
    else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', clampCamera);
}

// ---------------------------------------------------------------- loop

let lastFrame = performance.now(), acc = 0;
const STEP = 1 / 30;

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (keys.size) {
    const sp = 500 * dt / cam.zoom;
    if (keys.has('arrowleft') || keys.has('a')) cam.x -= sp;
    if (keys.has('arrowright') || keys.has('d')) cam.x += sp;
    if (keys.has('arrowup') || keys.has('w')) cam.y -= sp;
    if (keys.has('arrowdown') || keys.has('s')) cam.y += sp;
    clampCamera();
  }
  if (G.speed > 0) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) {
      for (let i = 0; i < G.speed; i++) update(STEP);
      acc -= STEP; n++;
    }
    if (n >= 6) acc = 0;
  }
  render(G.speed > 0 ? dt : 0);
  requestAnimationFrame(frame);
}

function start(data) {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  let restored = false;
  if (data && data.save) {
    try { deserialize(data.save); restored = true; } catch (e) { restored = false; }
  }
  if (!restored) newGame();
  UI.init();
  bindInput();
  centerCamera();
  if (restored) UI.setSpeed(data.speed || 1);
  else { UI.setSpeed(1); UI.welcome(); }
  requestAnimationFrame(frame);
}

window.claude?.hot?.snapshot?.(() => ({ save: serialize(), speed: G.speed || 1 }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
