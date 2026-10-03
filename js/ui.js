// Interface: HUD, build tray, inspector, modals and toasts.
'use strict';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const UI = {
  tool: { kind: 'select' },
  sel: null,
  tab: 'ride',
  modalOpen: false,
  pausedByModal: false,
  insRefresh: null,

  init() {
    this.renderTabs();
    this.renderBuildList();
    document.querySelectorAll('.speed button').forEach(btn => btn.addEventListener('click', () => this.setSpeed(+btn.dataset.speed)));
    $('#btn-staff').onclick = () => this.openStaff();
    $('#btn-finance').onclick = () => this.openFinance();
    $('#btn-goals').onclick = () => this.openGoals();
    $('#btn-menu').onclick = () => this.openMenu();
    $('#btn-show').onclick = () => {
      if (startShow()) { this.toast('Showtime! Guests gather round to watch you perform.', 'goal'); this.select({ kind: 'ent' }); }
    };
    $('#btn-move').onclick = () => this.setTool(this.tool.kind === 'move' ? { kind: 'select' } : { kind: 'move' });
    $('#btn-fireworks').onclick = () => {
      if (G.fireworksT > 0) return;
      if (launchFireworks()) this.toast('Fireworks! Every guest in the park is cheering. Word will spread.', 'level');
      else this.toast(`Fireworks cost ${money(FIREWORKS_COST)}.`, 'warn');
    };
    $('#btn-ads').onclick = () => {
      if (startAdCampaign()) this.toast(`Ad campaign running for ${G.marketingDays} days. Expect more guests.`, 'goal');
      else this.toast(`An ad campaign costs ${money(AD_COST)}.`, 'warn');
    };
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && this.modalDismissable) this.closeModal(); });
    const tip = $('#tooltip');
    $('#build-items').addEventListener('pointerover', e => {
      const el = e.target.closest('.item');
      if (!el || e.pointerType === 'touch') return;
      const d = DEFS[el.dataset.type] || { name: el.dataset.name, desc: el.dataset.desc };
      let meta = '';
      if (d.cat === 'ride') meta = `Excitement ${d.excitement}/12 · Intensity ${d.intensity}/10 · ${d.capacity} riders · Upkeep ${money(d.upkeep)}/day${d.needsOp ? ' · Needs operator' : ''}`;
      else if (d.cat) meta = `Size ${d.w}×${d.h}${d.upkeep ? ` · Upkeep ${money(d.upkeep)}/day` : ''}`;
      tip.innerHTML = `<b>${esc(d.name)}</b>${esc(d.desc || '')}${meta ? `<div class="meta">${meta}</div>` : ''}`;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 250, Math.max(8, r.left)) + 'px';
      tip.style.top = (r.top - tip.offsetHeight - 8) + 'px';
    });
    $('#build-items').addEventListener('pointerout', () => { tip.hidden = true; });
    setInterval(() => this.updateHud(), 200);
    setInterval(() => this.refreshInspector(), 250);
  },

  // ---------- speed ----------
  setSpeed(s) {
    G.speed = s;
    document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  },

  // ---------- build tray ----------
  renderTabs() {
    $('#build-tabs').innerHTML = CATEGORIES.map(c => `<button role="tab" data-tab="${c.id}" class="${c.id === this.tab ? 'on' : ''}">${c.label}</button>`).join('');
    $('#build-tabs').querySelectorAll('button').forEach(b => b.onclick = () => {
      this.tab = b.dataset.tab;
      this.renderTabs();
      this.renderBuildList();
    });
  },

  renderBuildList() {
    if (!G) return;
    const box = $('#build-items');
    let html = '';
    if (this.tab === 'tools') {
      const tools = [
        { kind: 'path', icon: '🟫', name: 'Path', pr: `${money(PATH_COST)} / tile`, desc: 'Click or drag to lay footpath. Guests and staff can only walk on paths.' },
        { kind: 'bulldoze', icon: '🚜', name: 'Bulldoze', pr: '50% refund', desc: 'Remove a path tile or demolish a building. Drag to clear paths.' },
        { kind: 'select', icon: '👆', name: 'Inspect', pr: 'Esc', desc: 'Click anything to see details. Drag to move around the park.' },
      ];
      html = tools.map(t => `<button class="item ${this.tool.kind === t.kind ? 'on' : ''}" data-tool="${t.kind}" data-name="${esc(t.name)}" data-desc="${esc(t.desc)}"><span class="ic">${t.icon}</span><span class="nm">${t.name}</span><span class="pr">${t.pr}</span></button>`).join('');
    } else {
      html = BUILD_ORDER[this.tab].map(type => {
        const d = DEFS[type];
        const locked = d.level > G.level;
        const poor = !locked && G.money < d.cost;
        const on = this.tool.kind === 'build' && this.tool.type === type;
        const owned = G.buildings.filter(b => b.type === type).length;
        return `<button class="item ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-type="${type}" ${locked ? 'aria-disabled="true"' : ''}>
          ${owned && d.cat !== 'facility' ? `<span class="tag">×${owned}</span>` : ''}
          <span class="ic">${locked ? '🔒' : d.icon}</span><span class="nm">${esc(d.name)}</span>
          <span class="pr">${locked ? `Level ${d.level} · ${money(LEVELS[d.level])} earned` : money(d.cost)}</span></button>`;
      }).join('');
    }
    box.innerHTML = html;
    box.querySelectorAll('.item').forEach(el => el.onclick = () => {
      if (el.dataset.tool) { this.setTool({ kind: el.dataset.tool }); return; }
      const type = el.dataset.type, d = DEFS[type];
      if (d.level > G.level) { this.toast(`${d.name} unlocks at park level ${d.level}. Earn ${money(LEVELS[d.level])} in total to get there.`, 'warn'); return; }
      if (this.tool.kind === 'build' && this.tool.type === type) this.setTool({ kind: 'select' });
      else this.setTool({ kind: 'build', type });
    });
  },

  setTool(t) {
    this.tool = t;
    $('#game').classList.toggle('tool', t.kind !== 'select');
    $('#btn-move').classList.toggle('on', t.kind === 'move');
    this.renderBuildList();
  },

  // ---------- HUD ----------
  updateHud() {
    if (!G) return;
    const m = $('#hud-money');
    m.textContent = money(G.money);
    m.classList.toggle('neg', G.money < 0);
    $('#hud-guests').textContent = `${G.guests.length} / ${maxGuests()}`;
    $('#hud-rating').textContent = Math.round(G.rating) + '%';
    const stars = Math.round(G.rating / 20);
    $('#hud-stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    const h = Math.floor(G.time / 60), mi = Math.floor(G.time % 60);
    const open = h >= OPEN_HOUR && h < LEAVE_HOUR;
    $('#hud-day').textContent = `Day ${G.day} · ${open ? 'Open' : 'Closed'}`;
    $('#hud-time').textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    $('#hud-level').textContent = G.level >= LEVELS.length - 1 ? `${G.level} (max)` : G.level;
    const next = LEVELS[G.level + 1];
    $('#hud-lvlfill').style.width = next ? Math.min(100, (G.lifetime - LEVELS[G.level]) / (next - LEVELS[G.level]) * 100) + '%' : '100%';
    const left = GOALS.filter(g => !G.goalsDone[g.id]).length;
    $('#goal-count').textContent = left || '';

    const e = G.ent;
    const showBtn = $('#btn-show');
    showBtn.disabled = e.state === 'show' || e.cooldown > 0;
    showBtn.textContent = e.state === 'show' ? 'Performing…' : e.cooldown > 0 ? `Rest ${Math.ceil(e.cooldown)}s` : 'Perform show';
    $('#star-status').textContent = e.state === 'show' ? `On stage · ${Math.ceil(e.showT)}s left${stageNearEnt() ? ' · stage bonus ×2' : ''}`
      : e.state === 'walk' ? 'Walking through the park' : e.cooldown > 0 ? 'Catching your breath' : 'Ready to perform';
    $('#btn-fireworks').disabled = G.fireworksT > 0;
    $('#btn-ads').innerHTML = G.marketingDays > 0 ? `Ads: ${G.marketingDays} day${G.marketingDays > 1 ? 's' : ''} <small>+$2,000 for 3 more</small>` : 'Ad campaign <small>$2,000</small>';

    // refresh affordability in the tray when money crosses a price
    const sig = this.tab + ':' + BUILD_ORDER[this.tab]?.map(t => G.money >= DEFS[t].cost ? 1 : 0).join('');
    if (sig !== this.traySig) { this.traySig = sig; this.renderBuildList(); }
  },

  // ---------- toasts ----------
  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    const box = $('#toasts');
    if ([...box.children].some(c => c.textContent === msg && !c.classList.contains('out'))) return;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 4200);
  },

  // ---------- inspector ----------
  select(sel) {
    this.sel = sel;
    const box = $('#inspector');
    if (!sel) { box.hidden = true; box.innerHTML = ''; this.insRefresh = null; return; }
    box.hidden = false;
    if (sel.kind === 'building') this.inspectBuilding(G.bmap.get(sel.id));
    else if (sel.kind === 'guest') this.inspectGuest(G.gmap.get(sel.id));
    else if (sel.kind === 'staff') this.inspectStaff(G.staff.find(s => s.id === sel.id));
    else if (sel.kind === 'ent') this.inspectEnt();
    const close = box.querySelector('.ins-close');
    if (close) close.onclick = () => this.select(null);
    this.refreshInspector();
  },

  refreshInspector() {
    if (!this.sel || !this.insRefresh) return;
    const ok = this.insRefresh();
    if (ok === false) this.select(null);
  },

  bind(map) {
    const box = $('#inspector');
    for (const [k, v] of Object.entries(map)) {
      const el = box.querySelector(`[data-k="${k}"]`);
      if (el && el.innerHTML !== String(v)) el.innerHTML = v;
    }
  },

  bar(name, label) {
    return `<div class="bar"><span>${label}</span><span class="track"><span class="fill" data-bar="${name}"></span></span><b data-k="${name}"></b></div>`;
  },

  setBar(name, v, invert) {
    const el = $(`#inspector [data-bar="${name}"]`);
    if (!el) return;
    v = clamp(v, 0, 100);
    el.style.width = v + '%';
    const good = invert ? 100 - v : v;
    el.className = 'fill' + (good < 30 ? ' low' : good < 60 ? ' mid' : '');
  },

  inspectBuilding(b) {
    if (!b) return this.select(null);
    const d = DEFS[b.type];
    const box = $('#inspector');
    const ops = G.staff.filter(s => s.role === 'operator');
    let html = `<div class="ins-head"><span class="ic">${d.icon}</span><div><h3>${esc(d.name)}</h3><span class="status" data-k="status"></span></div><button class="ins-close" aria-label="Close">✕</button></div>
      <p class="desc">${esc(d.desc)}</p>`;
    if (!d.passive) {
      if (d.price || d.cat !== 'facility') {
        html += `<div class="price"><button data-act="pm" aria-label="Lower price">−</button><b data-k="price"></b><button data-act="pp" aria-label="Raise price">+</button><span class="hint" data-k="fair"></span></div>`;
      }
      html += `<dl class="kv">
        <dt>Queue</dt><dd data-k="queue"></dd>
        <dt>${d.cat === 'ride' ? 'Riders served' : 'Customers served'}</dt><dd data-k="served"></dd>
        <dt>Total income</dt><dd data-k="income"></dd>
        ${d.cat === 'ride' ? `<dt>Excitement / Intensity</dt><dd>${d.excitement} / ${d.intensity}</dd><dt>Capacity</dt><dd>${d.capacity} per ride</dd>` : ''}
        <dt>Upkeep</dt><dd>${money(d.upkeep || 0)} / day</dd>
      </dl>`;
      if (d.needsOp) {
        html += `<label class="field">Operator<select id="ins-op"><option value="0">Nobody assigned</option>${ops.map(s => {
          const cur = s.assign && s.assign !== b.id ? ` (now at ${esc(DEFS[G.bmap.get(s.assign)?.type]?.name || '?')})` : '';
          return `<option value="${s.id}" ${s.assign === b.id ? 'selected' : ''}>${esc(s.name)}${cur}</option>`;
        }).join('')}</select></label>`;
        if (!ops.length) html += `<p class="desc">You have no ride operators. Hire one from Staff.</p>`;
      }
      html += `<div class="row"><button data-act="toggle" data-k="toggle"></button><button class="danger" data-act="demolish">Demolish <small>+${money(d.cost * 0.5)}</small></button></div>`;
    } else {
      html += `<div class="row"><button class="danger" data-act="demolish">Remove <small>+${money(d.cost * 0.5)}</small></button></div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
      const a = el.dataset.act;
      if (a === 'pm') b.price = Math.max(0, b.price - 1);
      if (a === 'pp') b.price = Math.min(99, b.price + 1);
      if (a === 'toggle') b.open = !b.open;
      if (a === 'demolish') return this.confirmDemolish(b);
      this.refreshInspector();
    });
    const sel = $('#ins-op');
    if (sel) sel.onchange = () => {
      for (const s of G.staff) if (s.assign === b.id) { s.assign = 0; s.atPost = false; }
      const s = G.staff.find(s => s.id === +sel.value);
      if (s) { s.assign = b.id; s.atPost = false; this.toast(`${s.name} is heading to ${d.name}.`); }
    };
    this.insRefresh = () => {
      if (!G.bmap.has(b.id)) return false;
      let st, cls;
      if (d.passive) { st = d.scenery ? 'Scenery' : 'Working'; cls = 'ok'; }
      else if (b.ex < 0) { st = 'No path access'; cls = 'bad'; }
      else if (!b.open) { st = 'Closed'; cls = 'bad'; }
      else if (d.needsOp && !b.opHere) { st = G.staff.some(s => s.assign === b.id) ? 'Operator on the way' : 'Needs an operator'; cls = 'warn'; }
      else if (b.state === 'running') { st = `Running · ${Math.ceil(b.timer)}s`; cls = 'ok'; }
      else if (b.serving.length) { st = 'Serving'; cls = 'ok'; }
      else { st = b.queue.length ? 'Loading' : 'Open'; cls = 'ok'; }
      const el = $('#inspector [data-k="status"]');
      if (el) el.className = 'status ' + cls;
      const fair = fairPrice(b.type);
      this.bind({
        status: st,
        price: b.price ? money(b.price) : 'Free',
        fair: d.price ? `Guests think ~${money(fair)} is fair` : '',
        queue: `${b.queue.length} / ${maxQueue(b)}`,
        served: b.totalRiders.toLocaleString('en-US'),
        income: money(b.income),
        toggle: b.open ? 'Close' : 'Open',
      });
      return true;
    };
  },

  confirmDemolish(b) {
    const d = DEFS[b.type];
    const doIt = () => {
      removeBuilding(b);
      this.select(null);
      this.toast(`${d.name} demolished. Refunded ${money(d.cost * 0.5)}.`);
      this.renderBuildList();
    };
    if (d.cost < 1000) return doIt();
    this.modal(`<h2>Demolish ${esc(d.name)}?</h2><p>You get ${money(d.cost * 0.5)} back. Anyone inside is sent back to the path.</p>
      <div class="actions"><button data-close>Keep it</button><button class="danger" id="m-yes">Demolish</button></div>`, true);
    $('#m-yes').onclick = () => { this.closeModal(); doIt(); };
  },

  inspectGuest(g) {
    if (!g) return this.select(null);
    $('#inspector').innerHTML = `<div class="ins-head"><span class="ic" data-k="face"></span><div><h3>${esc(g.name)}</h3><span class="status ok" data-k="doing"></span></div><button class="ins-close" aria-label="Close">✕</button></div>
      <div class="thought" data-k="thought"></div>
      <div class="bars">${this.bar('happy', 'Happiness')}${this.bar('hunger', 'Hunger')}${this.bar('thirst', 'Thirst')}${this.bar('bladder', 'Toilet')}${this.bar('energy', 'Energy')}</div>
      <dl class="kv"><dt>Cash</dt><dd data-k="cash"></dd><dt>Spent here</dt><dd data-k="spent"></dd><dt>Rides taken</dt><dd data-k="rides"></dd><dt>Thrill tolerance</dt><dd>${g.thrill}/10</dd><dt>Carrying</dt><dd data-k="item"></dd></dl>`;
    const items = { balloon: 'Balloon 🎈', teddy: 'Teddy bear 🧸', icecream: 'Ice cream 🍦' };
    this.insRefresh = () => {
      if (!G.gmap.has(g.id)) return false;
      const target = G.bmap.get(g.target);
      const doing = { walk: target ? `Heading to ${DEFS[target.type].name}` : 'Walking', wander: 'Strolling around', queue: 'Waiting in line', inside: target ? `At ${DEFS[target.type].name}` : 'Busy', leave: 'Heading home', watch: 'Watching your show', choose: 'Deciding' }[g.state];
      this.bind({
        face: g.happy > 75 ? '😄' : g.happy > 50 ? '🙂' : g.happy > 30 ? '😐' : '😠',
        doing, thought: g.thought ? `${g.thought.e} ${esc(g.thought.text)}` : '🙂 Having a nice time.',
        happy: Math.round(g.happy), hunger: Math.round(g.hunger), thirst: Math.round(g.thirst), bladder: Math.round(g.bladder), energy: Math.round(g.energy),
        cash: money(g.cash), spent: money(g.spent), rides: g.rides, item: items[g.item] || 'Nothing',
      });
      this.setBar('happy', g.happy); this.setBar('hunger', g.hunger, true); this.setBar('thirst', g.thirst, true);
      this.setBar('bladder', g.bladder, true); this.setBar('energy', g.energy);
      return true;
    };
  },

  inspectStaff(s) {
    if (!s) return this.select(null);
    const t = STAFF_TYPES[s.role];
    const rides = G.buildings.filter(b => DEFS[b.type].needsOp);
    $('#inspector').innerHTML = `<div class="ins-head"><span class="ic">${t.icon}</span><div><h3>${esc(s.name)}</h3><span class="status ok">${t.label}</span></div><button class="ins-close" aria-label="Close">✕</button></div>
      <dl class="kv"><dt>Doing</dt><dd data-k="doing"></dd><dt>Wage</dt><dd>${money(t.wage)} / day</dd>${s.role === 'cleaner' ? '<dt>Litter swept</dt><dd data-k="swept"></dd>' : ''}</dl>
      ${s.role === 'operator' ? `<label class="field">Assigned ride<select id="ins-assign"><option value="0">None</option>${rides.map(b => `<option value="${b.id}" ${s.assign === b.id ? 'selected' : ''}>${esc(DEFS[b.type].name)}</option>`).join('')}</select></label>` : ''}
      <div class="row"><button class="danger" id="ins-fire">Let ${esc(s.name)} go</button></div>`;
    const sel = $('#ins-assign');
    if (sel) sel.onchange = () => assignOperator(s, +sel.value);
    $('#ins-fire').onclick = () => { fireStaff(s); this.select(null); this.toast(`${s.name} has left the team.`); };
    this.insRefresh = () => {
      if (!G.staff.includes(s)) return false;
      const b = G.bmap.get(s.assign);
      const doing = s.role === 'operator'
        ? (b ? (s.atPost ? `Running ${DEFS[b.type].name}` : `Walking to ${DEFS[b.type].name}`) : 'Waiting for a ride')
        : (s.sweepT > 0 ? 'Sweeping' : s.litter ? 'Heading to litter' : 'Patrolling');
      this.bind({ doing, swept: s.swept });
      return true;
    };
  },

  inspectEnt() {
    $('#inspector').innerHTML = `<div class="ins-head"><span class="ic">🎩</span><div><h3>You, the Entertainer</h3><span class="status ok" data-k="doing"></span></div><button class="ins-close" aria-label="Close">✕</button></div>
      <p class="desc">This is your park. Walk the paths and put on shows: guests nearby cheer up, gather round and throw tips. Perform next to a Show Stage for double tips.</p>
      <dl class="kv"><dt>Shows performed</dt><dd data-k="shows"></dd><dt>Tips today</dt><dd data-k="tips"></dd></dl>
      <div class="row"><button class="primary" data-act="show">Perform show</button><button data-act="move">Walk to…</button></div>`;
    $('#inspector [data-act="show"]').onclick = () => $('#btn-show').click();
    $('#inspector [data-act="move"]').onclick = () => this.setTool({ kind: 'move' });
    this.insRefresh = () => {
      const e = G.ent;
      this.bind({ doing: e.state === 'show' ? 'Performing' : e.state === 'walk' ? 'Walking' : 'Idle', shows: G.showsDone, tips: money(G.today.income.tips) });
      return true;
    };
  },

  // ---------- modals ----------
  modal(html, dismissable = true, pause = true) {
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
    this.modalOpen = true;
    this.modalDismissable = dismissable;
    if (pause && G.speed !== 0) { this.pausedByModal = G.speed; this.setSpeed(0); }
    $('#modal-card').querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closeModal());
  },

  closeModal() {
    $('#modal').hidden = true;
    this.modalOpen = false;
    if (this.pausedByModal) { this.setSpeed(this.pausedByModal); this.pausedByModal = false; }
  },

  welcome() {
    const canContinue = hasSave();
    this.modal(`<div class="marquee"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <h2>Welcome to Showtime <span class="red">Park</span></h2>
      <p class="lead">You're the Entertainer, and this park is your business. The gates open at 08:00.</p>
      <p>You start with a <b>Thunder Coaster</b>, a <b>Speed Train</b>, <b>Jackpot Games</b> and a <b>Splash Pool</b>, plus a team of fourteen: seven ride operators (three at work, four on standby for your next rides) and seven cleaners.</p>
      <h4>How to play</h4>
      <ul>
        <li>Guests pay to enter, ride, eat and shop. Keep them happy and they'll stay longer and spend more.</li>
        <li>Build from the tray at the bottom. Every attraction must touch a path.</li>
        <li>Hungry, thirsty guests need food stalls; everyone needs <b>Restrooms</b>. Bins keep paths clean.</li>
        <li>Press <b>Perform show</b> to gather a crowd, lift their mood and collect tips.</li>
        <li>Total earnings raise your park level and unlock bigger, crazier rides.</li>
      </ul>
      <div class="actions">${canContinue ? '<button id="m-continue">Continue saved park</button>' : ''}<button class="primary" id="m-start">Open the gates</button></div>`, false);
    $('#m-start').onclick = () => { this.closeModal(); this.setSpeed(1); };
    if (canContinue) $('#m-continue').onclick = () => {
      if (loadGame()) { this.afterLoad(); this.toast(`Welcome back! Day ${G.day} is about to begin.`, 'goal'); }
      this.closeModal(); this.setSpeed(1);
    };
  },

  afterLoad() {
    groundDirty = true;
    this.select(null);
    this.setTool({ kind: 'select' });
    this.renderBuildList();
    centerCamera();
  },

  showDayReport(r) {
    const rows = (obj, labels) => Object.entries(labels).filter(([k]) => obj[k]).map(([k, l]) => `<tr><td>${l}</td><td>${money(obj[k])}</td></tr>`).join('');
    const inc = rows(r.income, { admission: 'Admission', ride: 'Ride tickets', shop: 'Food & shops', tips: 'Show tips', bonus: 'Goal rewards' });
    const exp = rows(r.expenses, { wages: 'Staff wages', upkeep: 'Ride upkeep', stock: 'Food & stock', prizes: 'Jackpot prizes', build: 'Construction', staff: 'Hiring', marketing: 'Marketing' });
    const profit = r.totalIn - r.totalOut;
    this.modal(`<h2>Day ${r.day} is a wrap</h2>
      <p class="lead">${r.guests} guests visited and took ${r.riders} rides. Park rating ${Math.round(r.rating)}%.</p>
      <div class="split">
        <div><h4>Income</h4><table class="ledger">${inc || '<tr><td>None</td><td>$0</td></tr>'}<tr class="total"><td>Total</td><td class="pos">${money(r.totalIn)}</td></tr></table></div>
        <div><h4>Expenses</h4><table class="ledger">${exp || '<tr><td>None</td><td>$0</td></tr>'}<tr class="total"><td>Total</td><td class="neg">${money(r.totalOut)}</td></tr></table></div>
      </div>
      <h4>Profit today</h4><div class="big ${profit >= 0 ? 'pos' : 'neg'}">${money(profit)}</div>
      ${G.money < 0 ? '<p class="neg">You\'re in the red. Cut costs, raise prices a little or perform more shows.</p>' : ''}
      <p><small>Park saved automatically.</small></p>
      <div class="actions"><button class="primary" data-close>Start day ${r.day + 1}</button></div>`, true);
  },

  openStaff() {
    const ops = G.staff.filter(s => s.role === 'operator').length;
    const cleaners = G.staff.length - ops;
    const wages = G.staff.reduce((s, st) => s + STAFF_TYPES[st.role].wage, 0);
    const rides = G.buildings.filter(b => DEFS[b.type].needsOp);
    const unstaffed = rides.filter(b => !G.staff.some(s => s.assign === b.id));
    const rows = G.staff.map(s => {
      const t = STAFF_TYPES[s.role];
      const assign = s.role === 'operator'
        ? `<select data-assign="${s.id}" aria-label="Ride for ${esc(s.name)}"><option value="0">No ride</option>${rides.map(b => `<option value="${b.id}" ${s.assign === b.id ? 'selected' : ''}>${esc(DEFS[b.type].name)}</option>`).join('')}</select>`
        : `<small>Sweeping paths · ${s.swept} cleaned</small>`;
      return `<div class="staff-row"><div class="who"><b>${t.icon} ${esc(s.name)}</b><small>${t.label}</small></div><div>${assign}</div><span class="wage">${money(t.wage)}/day</span><button class="danger" data-fire="${s.id}">Fire</button></div>`;
    }).join('');
    this.modal(`<h2>Your team</h2>
      <p>${G.staff.length} staff: ${ops} operator${ops === 1 ? '' : 's'}, ${cleaners} cleaner${cleaners === 1 ? '' : 's'}. Wages ${money(wages)} per day.</p>
      ${unstaffed.length ? `<p class="neg">No operator: ${unstaffed.map(b => esc(DEFS[b.type].name)).join(', ')}. These rides stay closed.</p>` : ''}
      <h4>Hire</h4>
      <div class="hire">
        <button data-hire="operator"><b>🎟️ Ride Operator</b><small>${money(STAFF_TYPES.operator.hire)} to hire · ${money(STAFF_TYPES.operator.wage)}/day. Runs one ride.</small></button>
        <button data-hire="cleaner"><b>🧹 Cleaner</b><small>${money(STAFF_TYPES.cleaner.hire)} to hire · ${money(STAFF_TYPES.cleaner.wage)}/day. Sweeps litter.</small></button>
      </div>
      <h4>Staff</h4><div class="staff-list">${rows || '<p>No staff yet.</p>'}</div>
      <div class="actions"><button class="primary" data-close>Done</button></div>`);
    const card = $('#modal-card');
    card.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => {
      const s = hireStaff(b.dataset.hire);
      if (!s) { this.toast(`Not enough cash to hire.`, 'warn'); return; }
      const at = s.assign ? ` and will run the ${DEFS[G.bmap.get(s.assign).type].name}` : '';
      this.toast(`${s.name} joined as a ${STAFF_TYPES[s.role].label}${at}.`, 'goal');
      this.openStaff();
    });
    card.querySelectorAll('[data-fire]').forEach(b => b.onclick = () => {
      const s = G.staff.find(x => x.id === +b.dataset.fire);
      if (s) { fireStaff(s); this.toast(`${s.name} has left the team.`); }
      this.openStaff();
    });
    card.querySelectorAll('[data-assign]').forEach(sel => sel.onchange = () => {
      const s = G.staff.find(x => x.id === +sel.dataset.assign);
      if (s) assignOperator(s, +sel.value);
      this.openStaff();
    });
  },

  openFinance() {
    const t = G.today;
    const inc = Object.values(t.income).reduce((a, b) => a + b, 0);
    const exp = Object.values(t.expenses).reduce((a, b) => a + b, 0);
    const hist = G.history.slice(-10);
    const maxV = Math.max(1, ...hist.map(h => Math.max(h.totalIn, h.totalOut)));
    const chart = hist.length ? `<div class="chart">${hist.map(h => `<div class="col" title="Day ${h.day}: in ${money(h.totalIn)}, out ${money(h.totalOut)}"><i class="in" style="height:${h.totalIn / maxV * 100}%"></i><i class="out" style="height:${h.totalOut / maxV * 100}%"></i></div>`).join('')}</div>
      <div class="chart-x">${hist.map(h => `<span>D${h.day}</span>`).join('')}</div>
      <div class="legend"><span><i class="in" style="background:var(--mint)"></i>Income</span><span><i style="background:var(--cherry)"></i>Expenses</span><span>Peak ${money(maxV)}</span></div>`
      : '<p><small>Your first daily report arrives at midnight.</small></p>';
    const upkeep = G.buildings.reduce((s, b) => s + (DEFS[b.type].upkeep || 0), 0);
    const wages = G.staff.reduce((s, st) => s + STAFF_TYPES[st.role].wage, 0);
    this.modal(`<h2>Finances</h2>
      <div class="split">
        <div><h4>Cash</h4><div class="big">${money(G.money)}</div><small>Total earned: ${money(G.lifetime)}</small></div>
        <div><h4>Park entry fee</h4>
          <div class="price"><button id="adm-m" aria-label="Lower entry fee">−</button><b id="adm">${money(G.admission)}</b><button id="adm-p" aria-label="Raise entry fee">+</button></div>
          <small>Higher fees earn more per guest but fewer people come. More exciting rides justify a higher fee.</small></div>
      </div>
      <div class="split">
        <div><h4>Today so far</h4><table class="ledger"><tr><td>Income</td><td class="pos">${money(inc)}</td></tr><tr><td>Expenses</td><td class="neg">${money(exp)}</td></tr><tr class="total"><td>Profit</td><td>${money(inc - exp)}</td></tr></table></div>
        <div><h4>Due at midnight</h4><table class="ledger"><tr><td>Staff wages</td><td>${money(wages)}</td></tr><tr><td>Upkeep</td><td>${money(upkeep)}</td></tr><tr class="total"><td>Total</td><td class="neg">${money(wages + upkeep)}</td></tr></table></div>
      </div>
      <h4>Recent days</h4>${chart}
      <div class="actions"><button class="primary" data-close>Done</button></div>`);
    const upd = d => { G.admission = clamp(G.admission + d, 0, 99); $('#adm').textContent = money(G.admission); };
    $('#adm-m').onclick = () => upd(-1);
    $('#adm-p').onclick = () => upd(1);
  },

  openGoals() {
    const done = GOALS.filter(g => G.goalsDone[g.id]).length;
    this.modal(`<h2>Goals</h2><p>${done} of ${GOALS.length} complete. Each one pays a cash reward.</p>
      <ul class="goal-list">${GOALS.map(g => `<li class="${G.goalsDone[g.id] ? 'done' : ''}"><span class="ck">${G.goalsDone[g.id] ? '✓' : ''}</span><span class="t">${esc(g.text)}</span><span class="rw">${money(g.reward)}</span></li>`).join('')}</ul>
      <h4>Park levels</h4><p>${LEVELS.slice(1).map((v, i) => `Level ${i + 1} at ${money(v)}`).join(' · ')}</p>
      <div class="actions"><button class="primary" data-close>Back to the park</button></div>`);
  },

  openMenu() {
    this.modal(`<h2>Menu</h2>
      <h4>Controls</h4>
      <div class="keys">
        <span><kbd>Drag</kbd></span><span>Move around the park (or arrow keys / WASD)</span>
        <span><kbd>Wheel</kbd> <kbd>Pinch</kbd></span><span>Zoom in and out</span>
        <span><kbd>Space</kbd></span><span>Pause or resume</span>
        <span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span><span>Game speed</span>
        <span><kbd>Esc</kbd></span><span>Cancel the current tool</span>
        <span><kbd>P</kbd> <kbd>B</kbd></span><span>Path tool, bulldozer</span>
      </div>
      <div class="actions">
        <button id="m-save">Save park</button>
        <button id="m-load" ${hasSave() ? '' : 'disabled'}>Load last save</button>
        <button class="danger" id="m-new">New park</button>
        <button class="primary" data-close>Resume</button>
      </div>`);
    $('#m-save').onclick = () => { const ok = saveGame(); this.toast(ok ? 'Park saved.' : 'Saving is unavailable in this browser.', ok ? 'goal' : 'warn'); this.closeModal(); };
    $('#m-load').onclick = () => {
      if (loadGame()) { this.afterLoad(); this.toast(`Loaded your park on day ${G.day}.`, 'goal'); }
      this.closeModal();
    };
    $('#m-new').onclick = () => {
      this.modal(`<h2>Start a new park?</h2><p>Your current park will be replaced. Your last save stays in this browser until you save again.</p>
        <div class="actions"><button data-close>Cancel</button><button class="danger" id="m-new-yes">Start over</button></div>`);
      $('#m-new-yes').onclick = () => { newGame(); this.afterLoad(); this.closeModal(); this.setSpeed(1); this.toast('A fresh park. Break a leg!', 'goal'); };
    };
  },
};

function assignOperator(s, bid) {
  for (const o of G.staff) if (o !== s && bid && o.assign === bid) { o.assign = 0; o.atPost = false; }
  s.assign = bid || 0;
  s.atPost = false;
}
