// Simulation: park state, guests, staff, the entertainer, rides, economy.
'use strict';

let G = null;
const fieldCache = new Map();
let groundDirty = true;

const SHIRTS = ['#e8434f', '#2f6fe0', '#f2b84b', '#4fd1a5', '#9b6dff', '#ff8a3d', '#ff6fb5', '#1fb3c9', '#ffffff', '#3d3d5c'];
const SKINS = ['#f6d3b3', '#e9b48f', '#c98d63', '#8d5a3b', '#5e3a24', '#f1c7a1'];
const HAIRS = ['#2b1d14', '#5a3a1e', '#d9a441', '#8c2f1b', '#1a1a1a', '#bfbfbf', '#6b4a2b'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const idx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const isPath = (x, y) => inMap(x, y) && G.path[idx(x, y)] > 0;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

// Grids derived from buildings; rebuilt when the park layout changes.
let binGrid = new Uint8Array(MAP_W * MAP_H);
let sceneryGrid = new Float32Array(MAP_W * MAP_H);
let litterGrid = new Uint16Array(MAP_W * MAP_H);

function freshDay() {
  return {
    income: { admission: 0, ride: 0, shop: 0, tips: 0, bonus: 0 },
    expenses: { wages: 0, upkeep: 0, stock: 0, prizes: 0, build: 0, staff: 0, marketing: 0 },
    guests: 0, riders: 0,
  };
}

function blankState() {
  return {
    money: 8000, lifetime: 0, day: 1, speed: 1, time: OPEN_HOUR * 60 - 20, clock: 0,
    path: new Uint8Array(MAP_W * MAP_H), occ: new Int32Array(MAP_W * MAP_H),
    buildings: [], bmap: new Map(), nextId: 1,
    guests: [], gmap: new Map(), nextGid: 1,
    staff: [], nextSid: 1,
    litter: [], nextLid: 1,
    popups: [], particles: [], fireworks: [],
    admission: 10, rating: 65, level: 0,
    guestsTotal: 0, showsDone: 0, goalsDone: {}, marketingDays: 0, buzz: 0, fireworksT: 0,
    today: freshDay(), history: [], spawnAcc: 0, tick1: 0,
    ent: null,
  };
}

function newGame() {
  G = blankState();
  G.ent = makeEntertainer();
  setupStarterPark();
  afterLayoutChange();
}

function setupStarterPark() {
  // Gate and the main boulevard.
  for (let y = 13; y < MAP_H; y++) G.path[idx(GATE_X, y)] = 1;
  G.path[idx(GATE_X, GATE_Y)] = 2;
  G.occ[idx(GATE_X - 1, GATE_Y)] = -1;
  G.occ[idx(GATE_X + 1, GATE_Y)] = -1;
  for (let x = 3; x <= 36; x++) G.path[idx(x, 13)] = 1;
  // A southern loop with space for shops.
  for (let y = 14; y <= 21; y++) { G.path[idx(8, y)] = 1; G.path[idx(32, y)] = 1; }
  for (let x = 8; x <= 32; x++) G.path[idx(x, 21)] = 1;

  const free = { free: true };
  placeBuilding('coaster', 3, 8, free);
  placeBuilding('jackpot', 13, 10, free);
  placeBuilding('train', 22, 9, free);
  placeBuilding('pool', 23, 14, free);
  placeBuilding('bin', 19, 15, free);
  placeBuilding('bin', 21, 20, free);
  placeBuilding('bin', 11, 12, free);
  placeBuilding('bench', 17, 12, free);
  placeBuilding('bench', 31, 12, free);
  placeBuilding('flowers', 19, 17, free);
  placeBuilding('flowers', 21, 17, free);
  placeBuilding('flowers', 19, 24, free);
  placeBuilding('flowers', 21, 24, free);

  // Scatter trees on the open grass.
  let n = 0, tries = 0;
  while (n < 55 && tries < 2000) {
    tries++;
    const x = randi(0, MAP_W - 1), y = randi(0, MAP_H - 1);
    if (G.path[idx(x, y)] || G.occ[idx(x, y)]) continue;
    // keep the edges of paths clear so the player has room to build
    let nearPath = false;
    for (const [dx, dy] of DIRS) if (isPath(x + dx, y + dy)) nearPath = true;
    if (nearPath && Math.random() < 0.8) continue;
    placeBuilding('tree', x, y, free);
    n++;
  }

  const ops = ['coaster', 'train', 'jackpot'];
  for (const t of ops) {
    const b = G.buildings.find(bb => bb.type === t);
    G.staff.push(makeStaff('operator', b.id));
  }
  // standby operators take over new rides as soon as they are built
  for (let i = 0; i < 4; i++) G.staff.push(makeStaff('operator'));
  for (let i = 0; i < 7; i++) G.staff.push(makeStaff('cleaner'));
}

// ---------------------------------------------------------------- agents

function baseAgent(tx, ty) {
  return {
    x: tx + 0.5, y: ty + 0.5, tx, ty, nx: -1, ny: -1, px: -1, py: -1,
    ox: 0, oy: 0, face: 1, walkT: 0,
  };
}

function makeEntertainer() {
  const a = baseAgent(GATE_X, 19);
  return Object.assign(a, { state: 'idle', goal: null, showT: 0, cooldown: 0, spd: 2.6, tipT: 0 });
}

function makeStaff(role, assign) {
  const used = new Set(G.staff.map(s => s.name));
  const names = STAFF_NAMES.filter(n => !used.has(n));
  const a = baseAgent(GATE_X, GATE_Y - 1);
  return Object.assign(a, {
    id: G.nextSid++, role, name: names.length ? pick(names) : 'Staff ' + G.nextSid,
    assign: assign || 0, atPost: false, spd: role === 'cleaner' ? 1.8 : 2.0,
    ox: rand(-0.2, 0.2), oy: rand(-0.2, 0.2),
    litter: 0, sweepT: 0, searchT: 0, swept: 0,
  });
}

function getField(tx, ty) {
  const key = idx(tx, ty);
  let f = fieldCache.get(key);
  if (f) return f;
  if (fieldCache.size > 500) fieldCache.clear();
  f = new Int16Array(MAP_W * MAP_H).fill(-1);
  if (isPath(tx, ty)) {
    const q = new Int32Array(MAP_W * MAP_H);
    let h = 0, t = 0;
    q[t++] = key; f[key] = 0;
    while (h < t) {
      const c = q[h++];
      const cx = c % MAP_W, cy = (c / MAP_W) | 0, d = f[c] + 1;
      for (const [dx, dy] of DIRS) {
        const x = cx + dx, y = cy + dy;
        if (!inMap(x, y)) continue;
        const n = idx(x, y);
        if (G.path[n] && f[n] < 0) { f[n] = d; q[t++] = n; }
      }
    }
  }
  fieldCache.set(key, f);
  return f;
}

function moveToNext(a, dt, speed) {
  const tx = a.nx + 0.5 + a.ox, ty = a.ny + 0.5 + a.oy;
  const dx = tx - a.x, dy = ty - a.y;
  const dist = Math.hypot(dx, dy), step = speed * dt;
  if (Math.abs(dx) > 0.02) a.face = dx > 0 ? 1 : -1;
  a.walkT += dt;
  if (dist <= step) {
    a.x = tx; a.y = ty; a.px = a.tx; a.py = a.ty; a.tx = a.nx; a.ty = a.ny; a.nx = -1;
  } else {
    a.x += dx / dist * step; a.y += dy / dist * step;
  }
}

// Follow a distance field downhill. Returns 'arrived' | 'moving' | 'lost'.
function stepAlong(a, field, dt, speed) {
  if (a.nx < 0) {
    const d = field[idx(a.tx, a.ty)];
    if (d === 0) return 'arrived';
    if (d < 0) return 'lost';
    let opts = [];
    for (const [dx, dy] of DIRS) {
      const x = a.tx + dx, y = a.ty + dy;
      if (inMap(x, y) && field[idx(x, y)] === d - 1) opts.push([x, y]);
    }
    if (!opts.length) return 'lost';
    // prefer to keep walking straight
    const straight = opts.find(o => o[0] - a.tx === a.tx - a.px && o[1] - a.ty === a.ty - a.py);
    const o = straight && Math.random() < 0.8 ? straight : pick(opts);
    a.nx = o[0]; a.ny = o[1];
  }
  moveToNext(a, dt, speed);
  return 'moving';
}

function wanderStep(a, dt, speed) {
  if (a.nx < 0) {
    if (!isPath(a.tx, a.ty)) { teleportToGate(a); return; }
    let opts = [];
    for (const [dx, dy] of DIRS) {
      const x = a.tx + dx, y = a.ty + dy;
      if (isPath(x, y) && !(x === a.px && y === a.py)) opts.push([x, y]);
    }
    if (!opts.length) for (const [dx, dy] of DIRS) if (isPath(a.tx + dx, a.ty + dy)) opts.push([a.tx + dx, a.ty + dy]);
    if (!opts.length) return;
    const o = pick(opts);
    a.nx = o[0]; a.ny = o[1];
  }
  moveToNext(a, dt, speed);
}

function teleportToGate(a) {
  a.tx = GATE_X; a.ty = GATE_Y; a.x = GATE_X + 0.5; a.y = GATE_Y + 0.5; a.nx = -1;
}

function placeAt(a, tx, ty) {
  a.tx = tx; a.ty = ty; a.nx = -1; a.x = tx + 0.5 + a.ox; a.y = ty + 0.5 + a.oy;
}

// ---------------------------------------------------------------- economy

function earn(amount, cat, x, y) {
  if (!amount) return;
  G.money += amount;
  G.lifetime += amount;
  G.today.income[cat] = (G.today.income[cat] || 0) + amount;
  if (x !== undefined) popup(x, y, '+' + money(amount), '#ffe066');
}

function spend(amount, cat, x, y) {
  if (!amount) return;
  G.money -= amount;
  G.today.expenses[cat] = (G.today.expenses[cat] || 0) + amount;
  if (x !== undefined) popup(x, y, '-' + money(amount), '#ff8a8a');
}

function popup(x, y, text, color) {
  if (G.popups.length > 80) G.popups.shift();
  G.popups.push({ x, y, text, color, t: 0 });
}

function particle(p) {
  if (G.particles.length > 900) return;
  G.particles.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 1, t: 0, size: 2, color: '#fff', kind: 'dot' }, p));
}

function fairPrice(type) {
  const base = DEFS[type].price || 0;
  return base * (0.85 + G.rating / 220);
}

function maxGuests() {
  let cap = 30;
  for (const b of G.buildings) {
    const d = DEFS[b.type];
    if (d.cat === 'ride') cap += d.capacity * 1.3;
    else if (d.cat === 'shop') cap += 4;
  }
  return Math.round(cap);
}

function parkAppeal() {
  let a = 0;
  for (const b of G.buildings) {
    const d = DEFS[b.type];
    if (d.cat === 'ride' && b.ex >= 0) a += d.excitement;
  }
  return a;
}

function spawnRate() {
  const appeal = parkAppeal();
  const base = 0.35 + Math.min(appeal, 140) / 140 * 1.4;
  const ratingF = 0.35 + G.rating / 100;
  const priceF = clamp(1.5 - G.admission / (14 + appeal * 0.45), 0.05, 1.3);
  const mk = (G.marketingDays > 0 ? 1.6 : 1) * (1 + G.buzz);
  const cap = maxGuests();
  const capF = G.guests.length >= cap ? 0 : 1 - (G.guests.length / cap) * 0.6;
  return base * ratingF * priceF * mk * capF;
}

// ---------------------------------------------------------------- layout

function footprintTiles(type, x, y) {
  const d = DEFS[type], out = [];
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) out.push([x + i, y + j]);
  return out;
}

function isRemovableScenery(id) {
  const b = G.bmap.get(id);
  return b && (b.type === 'tree' || b.type === 'flowers');
}

function adjacentPath(x, y, w, h) {
  for (let i = 0; i < w; i++) { if (isPath(x + i, y - 1) || isPath(x + i, y + h)) return true; }
  for (let j = 0; j < h; j++) { if (isPath(x - 1, y + j) || isPath(x + w, y + j)) return true; }
  return false;
}

function canPlace(type, x, y) {
  const d = DEFS[type];
  if (d.level > G.level) return { ok: false, reason: `Unlocks at park level ${d.level}` };
  for (const [tx, ty] of footprintTiles(type, x, y)) {
    if (!inMap(tx, ty)) return { ok: false, reason: 'Outside the park' };
    const i = idx(tx, ty);
    if (G.path[i]) return { ok: false, reason: 'Blocked by a path' };
    if (G.occ[i] && !(G.occ[i] > 0 && isRemovableScenery(G.occ[i]) && type !== 'tree' && type !== 'flowers'))
      return { ok: false, reason: 'Something is already here' };
  }
  if (G.money < d.cost) return { ok: false, reason: `Need ${money(d.cost)}` };
  if (!d.passive && !adjacentPath(x, y, d.w, d.h)) return { ok: false, reason: 'Must touch a path' };
  return { ok: true };
}

function placeBuilding(type, x, y, opts = {}) {
  const d = DEFS[type];
  for (const [tx, ty] of footprintTiles(type, x, y)) {
    const o = G.occ[idx(tx, ty)];
    if (o > 0) removeBuilding(G.bmap.get(o), true);
  }
  const b = {
    id: G.nextId++, type, x, y, w: d.w, h: d.h,
    price: d.price || 0, open: true, queue: [], riders: [], serving: [],
    state: 'idle', timer: 0, load: 0, anim: Math.random() * 100, runs: 0,
    income: 0, totalRiders: 0, ex: -1, ey: -1, opHere: false, seed: Math.random(),
  };
  for (const [tx, ty] of footprintTiles(type, x, y)) G.occ[idx(tx, ty)] = b.id;
  G.buildings.push(b);
  G.bmap.set(b.id, b);
  computeEntrance(b);
  if (!opts.free) {
    spend(d.cost, 'build', x + d.w / 2, y + d.h / 2);
    for (let k = 0; k < 24; k++) particle({
      x: x + rand(0, d.w), y: y + rand(0, d.h), vx: rand(-1, 1), vy: rand(-2.5, -0.5), g: 3,
      life: rand(0.6, 1.2), color: pick(['#f2b84b', '#e8434f', '#4fd1a5', '#ffffff']), size: 2.5, kind: 'confetti',
    });
    if (d.cat === 'ride' && d.needsOp) autoAssignOperator(b);
  }
  rebuildAreaGrids();
  return b;
}

function removeBuilding(b, silent) {
  if (!b) return;
  const d = DEFS[b.type];
  for (const gid of [...b.queue, ...b.riders, ...b.serving.map(s => s.gid)]) {
    const g = G.gmap.get(gid);
    if (!g) continue;
    if (b.ex >= 0) placeAt(g, b.ex, b.ey); else teleportToGate(g);
    g.state = 'choose';
  }
  for (const s of G.staff) if (s.assign === b.id) { s.assign = 0; s.atPost = false; }
  for (const [tx, ty] of footprintTiles(b.type, b.x, b.y)) G.occ[idx(tx, ty)] = 0;
  G.buildings.splice(G.buildings.indexOf(b), 1);
  G.bmap.delete(b.id);
  if (!silent) {
    const refund = Math.round(d.cost * 0.5);
    earnRefund(refund, b.x + d.w / 2, b.y + d.h / 2);
    for (let k = 0; k < 30; k++) particle({
      x: b.x + rand(0, d.w), y: b.y + rand(0, d.h), vx: rand(-1.5, 1.5), vy: rand(-1.5, 0.5), g: 1,
      life: rand(0.5, 1), color: 'rgba(160,140,120,0.8)', size: rand(3, 6), kind: 'dust',
    });
  }
  rebuildAreaGrids();
}

// Refunds go straight back to cash but don't count as earnings.
function earnRefund(amount, x, y) {
  G.money += amount;
  G.today.expenses.build -= amount;
  popup(x, y, '+' + money(amount), '#b6f5d8');
}

function computeEntrance(b) {
  const d = DEFS[b.type];
  b.ex = -1; b.ey = -1;
  if (d.passive) return;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let best = 1e9;
  const consider = (x, y, bias) => {
    if (!isPath(x, y)) return;
    const s = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + bias;
    if (s < best) { best = s; b.ex = x; b.ey = y; }
  };
  for (let i = 0; i < b.w; i++) { consider(b.x + i, b.y + b.h, -2); consider(b.x + i, b.y - 1, 0); }
  for (let j = 0; j < b.h; j++) { consider(b.x - 1, b.y + j, 0); consider(b.x + b.w, b.y + j, 0); }
}

function canPath(x, y) {
  if (!inMap(x, y)) return false;
  const i = idx(x, y);
  if (G.path[i]) return false;
  if (G.occ[i] < 0) return false;
  if (G.occ[i] > 0 && !isRemovableScenery(G.occ[i])) return false;
  return G.money >= PATH_COST;
}

function placePath(x, y) {
  if (!canPath(x, y)) return false;
  const i = idx(x, y);
  if (G.occ[i] > 0) removeBuilding(G.bmap.get(G.occ[i]), true);
  G.path[i] = 1;
  spend(PATH_COST, 'build');
  afterLayoutChange();
  return true;
}

function removePath(x, y) {
  if (!isPath(x, y) || G.path[idx(x, y)] === 2) return false;
  G.path[idx(x, y)] = 0;
  G.litter = G.litter.filter(l => !(l.tx === x && l.ty === y));
  litterGrid[idx(x, y)] = 0;
  afterLayoutChange();
  return true;
}

function afterLayoutChange() {
  fieldCache.clear();
  G.buildings.forEach(computeEntrance);
  for (const s of G.staff) s.atPost = false;
  groundDirty = true;
  rebuildAreaGrids();
}

function rebuildAreaGrids() {
  binGrid.fill(0); sceneryGrid.fill(0);
  for (const b of G.buildings) {
    const d = DEFS[b.type];
    if (b.type === 'bin') stamp(b, 3, (i) => { binGrid[i] = 1; });
    if (d.scenery) stamp(b, 2, (i) => { sceneryGrid[i] += d.scenery; });
  }
}

function stamp(b, r, fn) {
  for (let y = b.y - r; y < b.y + b.h + r; y++)
    for (let x = b.x - r; x < b.x + b.w + r; x++)
      if (inMap(x, y)) fn(idx(x, y));
}

// ---------------------------------------------------------------- staff

function autoAssignOperator(b) {
  if (G.staff.some(s => s.assign === b.id)) return;
  const free = G.staff.find(s => s.role === 'operator' && !s.assign);
  if (free) { free.assign = b.id; free.atPost = false; }
}

function hireStaff(role) {
  const t = STAFF_TYPES[role];
  if (G.money < t.hire) return null;
  spend(t.hire, 'staff');
  const s = makeStaff(role);
  if (role === 'operator') {
    const need = G.buildings.find(b => DEFS[b.type].needsOp && !G.staff.some(o => o.assign === b.id));
    if (need) s.assign = need.id;
  }
  G.staff.push(s);
  return s;
}

function fireStaff(s) {
  G.staff.splice(G.staff.indexOf(s), 1);
  if (s.litter) { const l = G.litter.find(l => l.id === s.litter); if (l) l.claimed = 0; }
}

function updateStaff(s, dt) {
  if (s.role === 'operator') {
    const b = s.assign ? G.bmap.get(s.assign) : null;
    if (s.assign && !b) { s.assign = 0; s.atPost = false; }
    if (!b || b.ex < 0) { wanderStep(s, dt, s.spd * 0.6); return; }
    if (s.atPost) { b.opHere = true; return; }
    const r = stepAlong(s, getField(b.ex, b.ey), dt, s.spd);
    if (r === 'arrived') {
      s.atPost = true; b.opHere = true;
      // stand to the side of the entrance
      s.x = b.ex + 0.5 + (b.ex >= b.x + b.w ? -0.3 : 0.32);
      s.y = b.ey + 0.5 - 0.28;
    } else if (r === 'lost') wanderStep(s, dt, s.spd);
    return;
  }
  // cleaner
  if (s.sweepT > 0) {
    s.sweepT -= dt;
    if (s.sweepT <= 0) {
      const i = G.litter.findIndex(l => l.id === s.litter);
      if (i >= 0) {
        const l = G.litter[i];
        litterGrid[idx(l.tx, l.ty)] = Math.max(0, litterGrid[idx(l.tx, l.ty)] - 1);
        G.litter.splice(i, 1);
        s.swept++;
        for (let k = 0; k < 5; k++) particle({ x: l.x, y: l.y, vx: rand(-0.6, 0.6), vy: rand(-0.8, -0.2), life: 0.5, color: '#fff', size: 1.5, kind: 'spark' });
      }
      s.litter = 0;
    }
    return;
  }
  const target = s.litter ? G.litter.find(l => l.id === s.litter) : null;
  if (target) {
    const r = stepAlong(s, getField(target.tx, target.ty), dt, s.spd);
    if (r === 'arrived') s.sweepT = 1.1;
    else if (r === 'lost') { target.claimed = 0; s.litter = 0; }
    return;
  }
  s.litter = 0;
  s.searchT -= dt;
  if (s.searchT <= 0 && s.nx < 0) {
    s.searchT = 0.8;
    const f = getField(s.tx, s.ty);
    let best = null, bd = 1e9;
    for (const l of G.litter) {
      if (l.claimed) continue;
      const d = f[idx(l.tx, l.ty)];
      if (d >= 0 && d < bd) { bd = d; best = l; }
    }
    if (best) { best.claimed = s.id; s.litter = best.id; return; }
  }
  wanderStep(s, dt, s.spd * 0.6);
}

// ---------------------------------------------------------------- entertainer

function sendEntertainer(tx, ty) {
  // snap to the nearest path tile
  let best = null, bd = 1e9;
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
    if (!isPath(x, y)) continue;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  if (!best) return false;
  const e = G.ent;
  if (e.state === 'show') return false;
  e.goal = best; e.state = 'walk';
  return true;
}

function stageNearEnt() {
  const e = G.ent;
  return G.buildings.some(b => b.type === 'stage' &&
    e.x > b.x - 2 && e.x < b.x + b.w + 2 && e.y > b.y - 2 && e.y < b.y + b.h + 2);
}

function startShow() {
  const e = G.ent;
  if (e.state === 'show' || e.cooldown > 0) return false;
  e.state = 'show'; e.showT = 14; e.nx = -1;
  if (e.tx >= 0) { e.x = e.tx + 0.5; e.y = e.ty + 0.5; }
  G.showsDone++;
  // nearby guests come to watch
  for (const g of G.guests) {
    if (!['walk', 'wander', 'choose'].includes(g.state)) continue;
    if (Math.hypot(g.x - e.x, g.y - e.y) < 9 && Math.random() < 0.75) g.state = 'watch';
  }
  return true;
}

function updateEntertainer(dt) {
  const e = G.ent;
  if (e.cooldown > 0) e.cooldown -= dt;
  if (e.state === 'walk') {
    const r = stepAlong(e, getField(e.goal[0], e.goal[1]), dt, e.spd);
    if (r !== 'moving') e.state = 'idle';
  } else if (e.state === 'show') {
    e.showT -= dt;
    e.tipT -= dt;
    if (Math.random() < dt * 6) particle({
      x: e.x + rand(-0.4, 0.4), y: e.y - 0.6, vx: rand(-0.5, 0.5), vy: rand(-1.4, -0.8), life: 1.4,
      color: pick(['#f2b84b', '#ff6fb5', '#4fd1a5', '#9b6dff']), size: 9, kind: 'note', ch: pick(['♪', '♫', '★']),
    });
    if (e.tipT <= 0) {
      e.tipT = 0.5;
      const mult = stageNearEnt() ? 2 : 1;
      for (const g of G.guests) {
        if (g.state === 'inside') continue;
        const d = Math.hypot(g.x - e.x, g.y - e.y);
        if (d > 4.5) continue;
        g.happy = Math.min(100, g.happy + 2.5);
        if (Math.random() < 0.09 && g.cash > 3) {
          const amt = randi(1, 4) * mult;
          g.cash -= amt;
          earn(amt, 'tips', g.x, g.y - 0.6);
        }
        if (Math.random() < 0.05) think(g, pick(['👏', '🤩', '😂']), pick(['Bravo!', 'What a show!', 'Encore!', 'This entertainer is amazing!']));
      }
    }
    if (e.showT <= 0) {
      e.state = 'idle'; e.cooldown = 40;
      for (const g of G.guests) if (g.state === 'watch') g.state = 'choose';
    }
  }
}

// ---------------------------------------------------------------- guests

function spawnGuest() {
  const g = baseAgent(GATE_X, GATE_Y);
  Object.assign(g, {
    id: G.nextGid++, name: pick(GUEST_NAMES), state: 'choose', target: 0,
    ox: rand(-0.26, 0.26), oy: rand(-0.22, 0.22),
    cash: randi(35, 150), happy: randi(62, 84), hunger: rand(0, 40), thirst: rand(0, 45),
    bladder: rand(0, 35), energy: rand(70, 100), thrill: randi(2, 10),
    visits: {}, tried: {}, trash: 0, item: null, thought: null, thoughtT: 0,
    timeIn: 0, stay: rand(170, 340), spent: 0, wanderT: 0, qT: 0, envT: 0, envMod: 0,
    shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS), kid: Math.random() < 0.3,
    rides: 0,
  });
  g.spd = g.kid ? 1.9 : 1.6;
  g.spent += G.admission;
  earn(G.admission, 'admission');
  G.guests.push(g);
  G.gmap.set(g.id, g);
  G.guestsTotal++;
  G.today.guests++;
}

function think(g, emoji, text) {
  g.thought = { e: emoji, text };
  g.thoughtT = 2.5;
}

function goHome(g, emoji, text) {
  if (emoji) think(g, emoji, text);
  g.state = 'leave';
}

function nearestServing(g, need) {
  let best = null, bd = 1e9;
  for (const b of G.buildings) {
    const d = DEFS[b.type];
    if (!d.serves || !d.serves.includes(need) || !isOpen(b)) continue;
    if (b.price > g.cash) continue;
    if (g.tried[b.id] && G.clock - g.tried[b.id] < 25) continue;
    const dist = getField(b.ex, b.ey)[idx(g.tx, g.ty)];
    if (dist < 0) continue;
    const score = dist + b.queue.length * 1.5;
    if (score < bd) { bd = score; best = b; }
  }
  return best;
}

function pickRide(g) {
  let best = null, bs = 0;
  for (const b of G.buildings) {
    const d = DEFS[b.type];
    if (d.cat !== 'ride' || !isOpen(b) || b.price > g.cash) continue;
    if (g.tried[b.id] && G.clock - g.tried[b.id] < 20) continue;
    if (d.intensity > g.thrill + 2) continue;
    const dist = getField(b.ex, b.ey)[idx(g.tx, g.ty)];
    if (dist < 0) continue;
    const v = g.visits[b.id] || 0;
    let s = (d.excitement + 2) / (1 + v * 1.6) * rand(0.6, 1.4) / (1 + dist / 30);
    if (d.wet && g.energy < 45) s *= 1.6;
    s /= 1 + b.queue.length / (d.capacity * 2);
    if (s > bs) { bs = s; best = b; }
  }
  return best;
}

const NEED_TEXT = {
  bladder: ['🚽', "I really need a toilet!"],
  thirst: ['🥵', "I'm so thirsty..."],
  hunger: ['😋', "I'm starving!"],
  energy: ['😴', 'My feet hurt. Where can I sit?'],
};

function chooseTarget(g) {
  const hour = G.time / 60;
  if (hour >= LEAVE_HOUR || hour < OPEN_HOUR - 1) return goHome(g, '🌙', 'Park is closing. Time to go home!');
  if (g.happy < 18) return goHome(g, '😞', "This park is no fun. I'm leaving.");
  if (g.timeIn > g.stay) return goHome(g, '😊', 'What a day! Heading home.');
  if (g.cash < 2) return goHome(g, '💸', 'Out of money. Heading home.');

  const needs = [
    ['bladder', g.bladder, 62], ['thirst', g.thirst, 60], ['hunger', g.hunger, 58], ['energy', 100 - g.energy, 68],
  ].sort((a, b) => b[1] - a[1]);
  for (const [need, v, th] of needs) {
    if (v < th) continue;
    const b = nearestServing(g, need);
    if (b) { g.target = b.id; g.state = 'walk'; return; }
    if (Math.random() < 0.3) { think(g, NEED_TEXT[need][0], NEED_TEXT[need][1]); g.happy -= 2; }
  }
  if (!g.item && g.cash > 12 && Math.random() < 0.12) {
    const b = nearestServing(g, 'toy');
    if (b) { g.target = b.id; g.state = 'walk'; return; }
  }
  if (g.hunger > 35 && Math.random() < 0.2) {
    const b = nearestServing(g, 'hunger');
    if (b) { g.target = b.id; g.state = 'walk'; return; }
  }
  const r = pickRide(g);
  if (r) { g.target = r.id; g.state = 'walk'; return; }
  g.state = 'wander';
  g.wanderT = rand(3, 7);
  if (Math.random() < 0.15) think(g, '🤔', "Hmm, what should I do next?");
}

function isOpen(b) {
  const d = DEFS[b.type];
  if (d.passive || !b.open || b.ex < 0) return false;
  if (d.needsOp && !b.opHere) return false;
  return true;
}

function maxQueue(b) {
  const d = DEFS[b.type];
  return Math.max(6, d.capacity * 2);
}

function arriveAt(g, b) {
  const d = DEFS[b.type];
  g.tried[b.id] = G.clock;
  if (!isOpen(b)) { think(g, '🚫', `${d.name} is closed!`); g.happy -= 2; g.state = 'choose'; return; }
  if (b.queue.length >= maxQueue(b)) { think(g, '😤', 'That queue is way too long!'); g.happy -= 3; g.state = 'choose'; return; }
  if (b.price > g.cash) { think(g, '💸', "I can't afford that."); g.state = 'choose'; return; }
  const fair = fairPrice(b.type);
  if (b.price > 0 && b.price > fair * 2) {
    think(g, '💸', `${money(b.price)} for ${d.name}? No way!`);
    g.happy -= 4; g.state = 'choose'; return;
  }
  if (b.price > 0) {
    g.cash -= b.price; g.spent += b.price; b.income += b.price;
    earn(b.price, d.cat === 'ride' ? 'ride' : 'shop', b.ex + 0.5, b.ey + 0.1);
    if (b.price > fair * 1.3) { g.happy -= 4; if (Math.random() < 0.5) think(g, '😒', 'That was a bit pricey.'); }
    else if (b.price < fair * 0.7) { g.happy += 2; if (Math.random() < 0.3) think(g, '👍', 'What a bargain!'); }
  }
  b.queue.push(g.id);
  g.state = 'queue'; g.qT = 0;
}

function releaseGuest(g, b) {
  if (b.ex >= 0) placeAt(g, b.ex, b.ey); else teleportToGate(g);
  g.state = 'choose';
}

const RIDE_LINES = ['That was AMAZING!', 'Again! Again!', 'Best ride ever!', 'Wheee!', 'My heart is racing!', 'So much fun!'];

function finishRide(b) {
  const d = DEFS[b.type];
  for (const gid of b.riders) {
    const g = G.gmap.get(gid);
    if (!g) continue;
    g.visits[b.id] = (g.visits[b.id] || 0) + 1;
    g.rides++;
    let joy = d.excitement * 2.4 + rand(0, 6);
    if (d.wet) g.energy = Math.min(100, g.energy + 25); else g.energy -= d.intensity * 1.1;
    if (d.gamble) {
      const r = Math.random();
      if (r < 0.025) {
        spend(40, 'prizes', b.x + b.w / 2, b.y);
        joy += 35; g.item = 'teddy';
        think(g, '🤑', 'MEGA JACKPOT!!!');
        for (let k = 0; k < 40; k++) particle({
          x: b.x + b.w / 2, y: b.y + b.h / 2, vx: rand(-3, 3), vy: rand(-4, -1), g: 4, life: rand(0.8, 1.6),
          color: pick(['#f2b84b', '#ffe066', '#fff']), size: 3, kind: 'confetti',
        });
      } else if (r < 0.24) {
        spend(8, 'prizes');
        joy += 14;
        think(g, '🎉', 'I won a prize!');
      } else {
        think(g, '🎰', 'So close! One more try...');
      }
    } else if (d.intensity >= 8 && g.thrill < 7 && Math.random() < 0.5) {
      joy -= 12;
      think(g, '🤢', 'I feel a bit sick...');
    } else {
      think(g, pick(['😍', '🤩', '😄', '🥳']), pick(RIDE_LINES));
    }
    g.happy = clamp(g.happy + joy, 0, 100);
    releaseGuest(g, b);
  }
  b.totalRiders += b.riders.length;
  G.today.riders += b.riders.length;
  b.riders = [];
  b.state = 'idle';
  b.load = 0;
}

function finishService(b, g) {
  const d = DEFS[b.type];
  for (const need of d.serves) {
    const amt = (d.amount && d.amount[need]) || 0;
    if (need === 'energy') g.energy = Math.min(100, g.energy + amt);
    else if (need !== 'toy') g[need] = Math.max(0, g[need] - amt);
  }
  g.happy = clamp(g.happy + (d.happy || 4), 0, 100);
  if (d.itemCost) spend(d.itemCost, 'stock');
  if (d.item) g.item = d.item;
  if (d.trash) g.trash = rand(6, 16);
  b.totalRiders++;
  if (b.type === 'restroom') think(g, '😌', 'Phew, much better.');
  else if (d.cat === 'shop' && Math.random() < 0.5) think(g, d.icon, pick(['Delicious!', 'Yum!', 'Just what I needed.', 'Love it!']));
  releaseGuest(g, b);
}

function dropLitter(x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!isPath(tx, ty) || G.litter.length > 400) return;
  G.litter.push({ id: G.nextLid++, x: tx + rand(0.15, 0.85), y: ty + rand(0.2, 0.85), tx, ty, kind: randi(0, 3), rot: rand(0, 6), claimed: 0 });
  litterGrid[idx(tx, ty)]++;
}

function environmentAt(g) {
  let lit = 0;
  for (let y = g.ty - 2; y <= g.ty + 2; y++) for (let x = g.tx - 2; x <= g.tx + 2; x++) if (inMap(x, y)) lit += litterGrid[idx(x, y)];
  const scen = inMap(g.tx, g.ty) ? sceneryGrid[idx(g.tx, g.ty)] : 0;
  let mod = -0.32 * Math.min(lit, 6) + 0.07 * Math.min(scen, 8);
  if (lit >= 3 && Math.random() < 0.08) think(g, '🤢', 'This path is disgusting!');
  else if (scen >= 5 && Math.random() < 0.02) think(g, '🌸', 'Such a pretty park!');
  const e = G.ent;
  if (Math.hypot(g.x - e.x, g.y - e.y) < 2.5) {
    mod += 0.8;
    if (Math.random() < 0.03) think(g, '👋', 'Hey, it\'s the Entertainer!');
  }
  return mod;
}

function updateGuest(g, dt) {
  g.timeIn += dt;
  if (g.state !== 'inside') {
    g.hunger = Math.min(100, g.hunger + 0.32 * dt);
    g.thirst = Math.min(100, g.thirst + 0.45 * dt);
    g.bladder = Math.min(100, g.bladder + 0.28 * dt);
    g.energy = Math.max(0, g.energy - 0.22 * dt);
  }
  g.envT -= dt;
  if (g.envT <= 0) { g.envT = 0.6; g.envMod = g.state === 'inside' ? 0 : environmentAt(g); }
  let dh = g.envMod;
  if (g.hunger > 85) dh -= 0.35;
  if (g.thirst > 85) dh -= 0.45;
  if (g.bladder > 88) dh -= 0.7;
  if (g.energy < 12) dh -= 0.3;
  g.happy = clamp(g.happy + dh * dt, 0, 100);
  if (g.thoughtT > 0) g.thoughtT -= dt;

  if (g.trash > 0) {
    g.trash -= dt;
    if (g.trash <= 0) {
      if (g.item === 'icecream') g.item = null;
      if (!binGrid[idx(g.tx, g.ty)] && Math.random() < 0.7) dropLitter(g.x, g.y);
    }
  }

  switch (g.state) {
    case 'choose': chooseTarget(g); break;
    case 'walk': {
      const b = G.bmap.get(g.target);
      if (!b || b.ex < 0) { g.state = 'choose'; break; }
      const r = stepAlong(g, getField(b.ex, b.ey), dt, g.spd);
      if (r === 'arrived') arriveAt(g, b);
      else if (r === 'lost') { g.tried[b.id] = G.clock; g.state = 'wander'; g.wanderT = 2; }
      break;
    }
    case 'wander':
      wanderStep(g, dt, g.spd * 0.75);
      g.wanderT -= dt;
      if (g.wanderT <= 0 && g.nx < 0) g.state = 'choose';
      break;
    case 'watch': {
      const e = G.ent;
      if (e.state !== 'show') { g.state = 'choose'; break; }
      if (g.nx < 0 && Math.hypot(g.x - e.x, g.y - e.y) < 2.2) { g.face = e.x > g.x ? 1 : -1; break; }
      const r = stepAlong(g, getField(e.tx, e.ty), dt, g.spd);
      if (r !== 'moving') g.face = e.x > g.x ? 1 : -1;
      break;
    }
    case 'leave': {
      const r = stepAlong(g, getField(GATE_X, GATE_Y), dt, g.spd);
      if (r === 'arrived') g.dead = true;
      else if (r === 'lost') { if (!isPath(g.tx, g.ty)) teleportToGate(g); else g.dead = true; }
      break;
    }
    case 'queue': {
      g.qT += dt;
      if (g.qT > 25) g.happy -= 0.25 * dt;
      if (g.qT > 75) {
        const b = G.bmap.get(g.target);
        if (b) b.queue = b.queue.filter(id => id !== g.id);
        think(g, '😤', 'This queue is taking forever!');
        g.state = 'choose';
      }
      break;
    }
    case 'inside': break;
  }
}

// ---------------------------------------------------------------- buildings

function updateBuilding(b, dt) {
  const d = DEFS[b.type];
  if (d.passive) { b.anim += dt; return; }
  if (b.queue.length) b.queue = b.queue.filter(id => { const g = G.gmap.get(id); return g && g.state === 'queue'; });
  if (d.cat === 'ride') {
    if (b.state === 'idle') {
      b.anim += dt * 0.15;
      if (b.queue.length && isOpen(b)) {
        b.load += dt;
        if (b.queue.length >= d.capacity || b.load > 3) {
          b.riders = b.queue.splice(0, d.capacity);
          for (const gid of b.riders) { const g = G.gmap.get(gid); if (g) g.state = 'inside'; }
          b.state = 'running'; b.timer = d.duration; b.runs++;
        }
      } else b.load = 0;
    } else {
      b.timer -= dt; b.anim += dt;
      if (b.timer <= 0) finishRide(b);
    }
  } else {
    b.anim += dt;
    for (let i = b.serving.length - 1; i >= 0; i--) {
      const s = b.serving[i];
      s.t -= dt;
      if (s.t <= 0) {
        b.serving.splice(i, 1);
        const g = G.gmap.get(s.gid);
        if (g) finishService(b, g);
      }
    }
    while (b.serving.length < d.capacity && b.queue.length && isOpen(b)) {
      const gid = b.queue.shift();
      const g = G.gmap.get(gid);
      if (!g) continue;
      g.state = 'inside';
      b.serving.push({ gid, t: d.duration });
    }
  }
}

// ---------------------------------------------------------------- special actions

const FIREWORKS_COST = 1500;
const AD_COST = 2000;

function launchFireworks() {
  if (G.money < FIREWORKS_COST || G.fireworksT > 0) return false;
  spend(FIREWORKS_COST, 'marketing');
  G.fireworksT = 16;
  G.buzz = Math.min(0.6, G.buzz + 0.25);
  for (const g of G.guests) { g.happy = Math.min(100, g.happy + 18); if (Math.random() < 0.3) think(g, '🎆', 'Ooooh! Fireworks!'); }
  return true;
}

function startAdCampaign() {
  if (G.money < AD_COST) return false;
  spend(AD_COST, 'marketing');
  G.marketingDays += 3;
  return true;
}

function updateFireworks(dt) {
  if (G.fireworksT > 0) {
    G.fireworksT -= dt;
    if (Math.random() < dt * 2.2) {
      G.fireworks.push({ x: rand(4, MAP_W - 4), y: MAP_H - 2, ty: rand(3, MAP_H * 0.5), vy: -14, color: pick(['#ff5f6d', '#ffe066', '#4fd1a5', '#9b6dff', '#58c4f6', '#ff9f43']) });
    }
  }
  for (let i = G.fireworks.length - 1; i >= 0; i--) {
    const f = G.fireworks[i];
    f.y += f.vy * dt;
    if (Math.random() < 0.5) particle({ x: f.x, y: f.y, life: 0.4, color: '#ffd9a0', size: 1.5, kind: 'spark' });
    if (f.y <= f.ty) {
      G.fireworks.splice(i, 1);
      const n = 46;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, sp = rand(3, 5.5);
        particle({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1.5, life: rand(1, 1.6), color: f.color, size: 2.4, kind: 'spark', drag: 1.6 });
      }
    }
  }
}

// ---------------------------------------------------------------- main update

function update(dt) {
  G.clock += dt;
  const hour = G.time / 60;
  const mps = hour >= OPEN_HOUR - 0.5 && hour < LEAVE_HOUR + 1 ? 5 : 40;
  G.time += dt * mps;
  if (G.time >= 1440) { G.time -= 1440; endOfDay(); }

  if (hour >= OPEN_HOUR && hour < CLOSE_HOUR) {
    G.spawnAcc += spawnRate() * dt;
    while (G.spawnAcc >= 1) { G.spawnAcc -= 1; spawnGuest(); }
  }

  for (const b of G.buildings) b.opHere = false;
  for (const s of G.staff) updateStaff(s, dt);
  updateEntertainer(dt);
  for (const b of G.buildings) updateBuilding(b, dt);
  for (const g of G.guests) updateGuest(g, dt);
  if (G.guests.some(g => g.dead)) {
    G.guests = G.guests.filter(g => { if (g.dead) G.gmap.delete(g.id); return !g.dead; });
  }
  updateFireworks(dt);

  for (let i = G.popups.length - 1; i >= 0; i--) { const p = G.popups[i]; p.t += dt; if (p.t > 1.5) G.popups.splice(i, 1); }
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.t += dt;
    if (p.t >= p.life) { G.particles.splice(i, 1); continue; }
    if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }

  G.tick1 += dt;
  if (G.tick1 >= 1) { G.tick1 -= 1; everySecond(); }
}

function everySecond() {
  // rating
  const gs = G.guests;
  const avgHappy = gs.length ? gs.reduce((s, g) => s + g.happy, 0) / gs.length : 70;
  let pathCount = 0;
  for (let i = 0; i < G.path.length; i++) if (G.path[i]) pathCount++;
  const clean = clamp(1 - G.litter.length / (pathCount * 0.07 + 4), 0, 1);
  const rides = G.buildings.filter(b => DEFS[b.type].cat === 'ride').length;
  const shops = G.buildings.filter(b => DEFS[b.type].cat === 'shop').length;
  let scen = 0;
  for (const b of G.buildings) scen += DEFS[b.type].scenery || 0;
  const target = avgHappy * 0.5 + clean * 20 + Math.min(1, rides / 8) * 12 + Math.min(1, shops / 5) * 10 + Math.min(1, scen / 70) * 8;
  G.rating += (target - G.rating) * 0.08;

  // level ups
  let lvl = 0;
  for (let i = 0; i < LEVELS.length; i++) if (G.lifetime >= LEVELS[i]) lvl = i;
  if (lvl > G.level) {
    G.level = lvl;
    const unlocked = Object.values(DEFS).filter(d => d.level === lvl).map(d => d.name);
    UI.toast(`Park level ${lvl}! Unlocked: ${unlocked.join(', ')}`, 'level');
    UI.renderBuildList();
  }

  // goals
  for (const goal of GOALS) {
    if (G.goalsDone[goal.id]) continue;
    if (goal.check(G)) {
      G.goalsDone[goal.id] = true;
      earn(goal.reward, 'bonus');
      UI.toast(`Goal complete: ${goal.text}. Reward ${money(goal.reward)}`, 'goal');
    }
  }

  // nudges
  const unstaffed = G.buildings.find(b => DEFS[b.type].needsOp && !G.staff.some(s => s.assign === b.id));
  if (unstaffed && Math.floor(G.clock) % 45 === 0) UI.toast(`${DEFS[unstaffed.type].name} has no operator. Hire one in Staff.`, 'warn');
  if (G.litter.length > 40 && Math.floor(G.clock) % 60 === 0) UI.toast('The paths are getting dirty. Hire more cleaners!', 'warn');
}

function endOfDay() {
  const wages = G.staff.reduce((s, st) => s + STAFF_TYPES[st.role].wage, 0);
  const upkeep = G.buildings.reduce((s, b) => s + (DEFS[b.type].upkeep || 0), 0);
  spend(wages, 'wages');
  spend(upkeep, 'upkeep');
  const inc = Object.values(G.today.income).reduce((a, b) => a + b, 0);
  const exp = Object.values(G.today.expenses).reduce((a, b) => a + b, 0);
  const report = { day: G.day, income: { ...G.today.income }, expenses: { ...G.today.expenses }, totalIn: inc, totalOut: exp, guests: G.today.guests, riders: G.today.riders, rating: G.rating, money: G.money };
  G.history.push(report);
  if (G.history.length > 14) G.history.shift();
  G.day++;
  G.today = freshDay();
  if (G.marketingDays > 0) G.marketingDays--;
  G.buzz *= 0.5;
  saveGame();
  UI.showDayReport(report);
}

// ---------------------------------------------------------------- save / load

const SAVE_KEY = 'showtime-park-save-v1';

function serialize() {
  return JSON.stringify({
    v: 1, money: G.money, lifetime: G.lifetime, day: G.day, admission: G.admission, rating: G.rating, level: G.level,
    guestsTotal: G.guestsTotal, showsDone: G.showsDone, goalsDone: G.goalsDone, marketingDays: G.marketingDays,
    history: G.history, path: Array.from(G.path),
    buildings: G.buildings.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, price: b.price, open: b.open, income: b.income, runs: b.runs, totalRiders: b.totalRiders })),
    staff: G.staff.map(s => ({ role: s.role, name: s.name, assign: s.assign, swept: s.swept })),
  });
}

function deserialize(str) {
  const d = JSON.parse(str);
  if (!d || d.v !== 1) throw new Error('bad save');
  G = blankState();
  G.ent = makeEntertainer();
  Object.assign(G, {
    money: d.money, lifetime: d.lifetime, day: d.day, admission: d.admission, rating: d.rating, level: d.level,
    guestsTotal: d.guestsTotal, showsDone: d.showsDone, goalsDone: d.goalsDone || {}, marketingDays: d.marketingDays || 0,
    history: d.history || [],
  });
  G.path = Uint8Array.from(d.path);
  G.occ[idx(GATE_X - 1, GATE_Y)] = -1;
  G.occ[idx(GATE_X + 1, GATE_Y)] = -1;
  let maxId = 0;
  for (const sb of d.buildings) {
    const b = placeBuilding(sb.type, sb.x, sb.y, { free: true });
    const newId = sb.id;
    // keep original ids so staff assignments still match
    G.bmap.delete(b.id);
    for (const [tx, ty] of footprintTiles(b.type, b.x, b.y)) G.occ[idx(tx, ty)] = newId;
    b.id = newId; G.bmap.set(newId, b);
    Object.assign(b, { price: sb.price, open: sb.open, income: sb.income || 0, runs: sb.runs || 0, totalRiders: sb.totalRiders || 0 });
    maxId = Math.max(maxId, newId);
  }
  G.nextId = maxId + 1;
  for (const ss of d.staff) {
    const s = makeStaff(ss.role, ss.assign);
    s.name = ss.name; s.swept = ss.swept || 0;
    G.staff.push(s);
  }
  afterLayoutChange();
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, serialize()); return true; } catch (e) { return false; }
}

function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function loadGame() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return false;
    deserialize(s);
    return true;
  } catch (e) { return false; }
}
