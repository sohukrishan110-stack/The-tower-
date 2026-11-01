'use strict';
(() => {
/* ---------- Config ---------- */
const KEY = 'perfectStack.v1', BH = 30, BASE = 110;
const CFG = { tol: 7, baseW: 200, v0: 150, vInc: 6, vMax: 420, lo: 20, hi: 380, camFrac: .55, maxParts: 150 };
const THEMES = [
  { n: 'Neon City', bg: ['#0b0f3b', '#2b1a78', '#6a1fa0'], c: ['#3b82ff', '#8b5cf6', '#e879f9', '#22d3ee'], cost: 0, m: 0 },
  { n: 'Sunset', bg: ['#3a1c71', '#d76d77', '#ffaf7b'], c: ['#ff7a18', '#ff3d81', '#ffd23f'], cost: 150, m: 15 },
  { n: 'Ocean', bg: ['#03123a', '#0369a1', '#22d3ee'], c: ['#22d3ee', '#0ea5e9', '#1d4ed8'], cost: 300, m: 30 },
  { n: 'Candy', bg: ['#ffd1ec', '#ffc2e0', '#c9b6ff'], c: ['#ff7eb6', '#ffc8a2', '#7fe3cf', '#a78bfa'], cost: 500, m: 45, ink: '#5b2a86' },
  { n: 'Emerald', bg: ['#022c22', '#065f46', '#a16207'], c: ['#10b981', '#34d399', '#fbbf24', '#d4a017'], cost: 800, m: 60 }
];
THEMES.forEach(t => t.rgb = t.c.map(h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16))));

/* ---------- Saving and loading ---------- */
const $ = id => document.getElementById(id), cv = $('c'), ctx = cv.getContext('2d');
const num = v => Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
function load() {
  const p = { best: 0, coins: 0, sound: true, theme: 0, unlocked: [0], games: 0, maxCombo: 0, blocks: 0, earned: 0, top: [] };
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || typeof d !== 'object') return p;
    ['best', 'coins', 'games', 'maxCombo', 'blocks', 'earned'].forEach(k => p[k] = num(d[k]));
    p.sound = d.sound !== false;
    if (Array.isArray(d.unlocked)) d.unlocked.forEach(i => { if (Number.isInteger(i) && i >= 0 && i < THEMES.length && !p.unlocked.includes(i)) p.unlocked.push(i); });
    if (p.unlocked.includes(d.theme)) p.theme = d.theme;
    if (Array.isArray(d.top)) p.top = d.top.filter(r => r && num(r.s) > 0).map(r => ({ s: num(r.s), c: num(r.c), d: num(r.d) })).slice(0, 10);
  } catch (e) { /* empty or corrupt storage: use defaults */ }
  return p;
}
let P = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable */ } }

/* Local leaderboard. To go global later, replace these two methods with fetch() calls to a backend. */
const Leaderboard = {
  async top() { return P.top; },
  async submit(e) { P.top.push(e); P.top.sort((a, b) => b.s - a.s); P.top = P.top.slice(0, 10); }
};

/* ---------- Sound (Web Audio, no files) ---------- */
let AC;
function tone(f, d = .12, type = 'sine', v = .15, slide = 0, delay = 0) {
  if (!P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .02);
  } catch (e) { /* audio unsupported */ }
}
const sfx = {
  click: () => tone(520, .07, 'triangle', .1),
  tick: () => tone(180, .04, 'square', .03),
  place: () => tone(160, .12, 'sine', .25, -70),
  perfect: c => { const f = 440 * Math.pow(2, Math.min(c, 12) / 12); tone(f, .15, 'triangle', .18); tone(f * 1.5, .2, 'triangle', .14, 0, .07); },
  milestone: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'square', .09, 0, i * .07)),
  coin: (d = 0) => { tone(988, .08, 'square', .06, 0, d); tone(1319, .14, 'square', .06, 0, d + .07); },
  over: () => { tone(330, .5, 'sawtooth', .16, -250); tone(165, .7, 'sine', .2, -100, .1); },
  err: () => tone(140, .15, 'square', .1)
};

/* ---------- State ---------- */
let W = 0, H = 0, VS = 1, OX = 0, VH = 760, DPR = 1, last = 0, S;
const TH = () => THEMES[P.theme];
const stars = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.5, s: .01 + Math.random() * .03, a: .15 + Math.random() * .3 }));
const base = (mode, stack) => ({ mode, stack, cur: null, dir: 1, n: 0, score: 0, combo: 0, maxCombo: 0, runCoins: 0, cam: 0, tap: 0, dt: 0, shake: 0, flash: 0, t: 0, parts: [], deb: [], rings: [], fl: [] });
function demo() {
  const st = []; let x = 100, w = 200;
  for (let i = 0; i < 8; i++) { st.push({ x, w }); w = Math.max(90, w - (Math.random() < .3 ? 0 : 6 + Math.random() * 14)); x += (Math.random() - .5) * 16; }
  return base('menu', st);
}

/* ---------- Colour helpers ---------- */
function colorAt(th, i) {
  let t = (i * .09) % 2; if (t > 1) t = 2 - t;
  const n = th.rgb.length - 1, p = t * n, k = Math.min(n - 1, p | 0), f = p - k, a = th.rgb[k], b = th.rgb[k + 1];
  return a.map((v, j) => Math.round(v + (b[j] - v) * f));
}
const sh = (c, f) => `rgb(${Math.min(255, c[0] * f | 0)},${Math.min(255, c[1] * f | 0)},${Math.min(255, c[2] * f | 0)})`;

/* ---------- Initialization and screens ---------- */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  VS = Math.min(W / 400, H / 760); OX = (W - 400 * VS) / 2; VH = H / VS;
}
const SCR = ['menu', 'themeScr', 'scoreScr', 'over'];
function show(id) {
  SCR.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('hud').classList.toggle('hidden', S.mode !== 'play' && S.mode !== 'dying');
}
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2200); }
function updMenu() {
  $('mBest').textContent = P.best; $('mCoins').textContent = P.coins;
  $('snd').textContent = 'Sound: ' + (P.sound ? 'On' : 'Off'); $('hsnd').textContent = P.sound ? '🔊' : '🔇';
}
function toMenu() { S = demo(); show('menu'); updMenu(); }
function startGame() {
  S = base('play', [{ x: 100, w: CFG.baseW }]); S.tap = performance.now() + 200;
  show(null); spawn(); hud();
}
function hud() {
  document.documentElement.style.setProperty('--hud', TH().ink || '#fff');
  const s = $('score'); s.textContent = S.score; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
  $('combo').textContent = S.combo > 1 ? 'Combo x' + S.combo : ''; $('combo').classList.toggle('hidden', S.combo < 2);
  $('hcoins').textContent = '🪙 ' + P.coins;
}

/* ---------- Moving, overlap, placing ---------- */
const speed = () => Math.min(CFG.vMax, CFG.v0 + S.n * CFG.vInc);
function spawn() {
  const t = S.stack[S.stack.length - 1], left = S.stack.length % 2 === 0, cx = left ? CFG.lo : CFG.hi;
  S.dir = left ? 1 : -1; S.cur = { w: t.w, cx, x: cx - t.w / 2 };
}
function moveBlock(dt) {
  const c = S.cur; if (!c) return;
  c.cx += S.dir * speed() * dt;
  if (c.cx > CFG.hi) { c.cx = CFG.hi; S.dir = -1; sfx.tick(); }
  else if (c.cx < CFG.lo) { c.cx = CFG.lo; S.dir = 1; sfx.tick(); }
  c.x = c.cx - c.w / 2;
}
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
const isPerfect = err => err <= CFG.tol;
const mkDebris = (x, w, i) => ({ x, w, ly: (i + 1) * BH, vy: 0, vx: (Math.random() - .5) * 40, i });

function place() {
  if (!S || S.mode !== 'play' || !S.cur) return;
  const now = performance.now(); if (now - S.tap < 90) return; S.tap = now; // ignores rapid repeat taps
  const t = S.stack[S.stack.length - 1], c = S.cur, i = S.stack.length;
  const ov = overlap(c, t), err = Math.abs(c.x - t.x);
  if (ov <= 0) { S.deb.push(mkDebris(c.x, c.w, i)); S.cur = null; S.combo = 0; gameOver(); return; }
  const perfect = isPerfect(err); let nb;
  if (perfect) nb = { x: t.x, w: t.w };
  else {
    const L = Math.max(c.x, t.x); nb = { x: L, w: ov }; S.combo = 0;
    S.deb.push(c.x < t.x ? mkDebris(c.x, t.x - c.x, i) : mkDebris(L + ov, c.x + c.w - (L + ov), i));
  }
  S.stack.push(nb); S.n++; P.blocks++;
  const [pts, coins] = award(perfect);
  const col = colorAt(TH(), i), ly = (i + 1) * BH, cx = nb.x + nb.w / 2, fx = Math.min(340, Math.max(60, cx));
  if (perfect) {
    S.rings.push({ x: nb.x, ly, w: nb.w, t: 0 });
    burst(cx, ly, [sh(col, 1.4), '#fff', '#22d3ee', '#ff5fa8', '#ffc83d'], 18 + Math.min(S.combo, 10) * 3, 240);
    S.shake = Math.max(S.shake, 3 + Math.min(S.combo, 8));
    sfx.perfect(S.combo); sfx.coin(.14);
    const m = S.combo >= 10 ? 'LEGENDARY!' : S.combo >= 6 ? 'UNSTOPPABLE!' : S.combo >= 3 ? 'AMAZING!' : 'PERFECT!';
    S.fl.push({ x: fx, ly: ly + 75, txt: m + (S.combo > 1 ? ' x' + S.combo : ''), col: '#ffe27a', s: S.combo >= 6 ? 34 : 28, life: 1 });
    if (S.combo === 3 || S.combo === 6 || S.combo === 10) { S.flash = 1; S.shake = 14; sfx.milestone(); }
    else if (S.combo > 10 && S.combo % 5 === 0) S.flash = .7;
  } else { burst(cx, ly, [sh(col, 1.2)], 8, 120); S.shake = Math.max(S.shake, 2); sfx.place(); }
  S.fl.push({ x: fx, ly: ly + 38, txt: `+${pts}  +${coins}🪙`, col: '#fff', s: 20, life: 1 });
  spawn(); hud();
}
function award(perfect) { // scoring and coin rewards
  let pts = 1, coins = 1;
  if (perfect) {
    S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
    pts = 2 + Math.min(S.combo, 10); coins = 3 + (S.combo >= 5 ? 2 : 0) + (S.combo >= 10 ? 3 : 0);
  }
  S.score += pts; S.runCoins += coins; P.coins += coins; P.earned += coins;
  return [pts, coins];
}

/* ---------- Game over ---------- */
function gameOver() { S.mode = 'dying'; S.dt = 0; S.shake = 16; sfx.over(); hud(); }
function showOver() {
  S.mode = 'over';
  const isBest = S.score > P.best; if (isBest) P.best = S.score;
  P.games++; P.maxCombo = Math.max(P.maxCombo, S.maxCombo);
  if (S.score > 0) Leaderboard.submit({ s: S.score, c: S.maxCombo, d: Date.now() });
  checkMilestones(); save();
  $('oScore').textContent = S.score; $('oBest').textContent = P.best; $('oCombo').textContent = S.maxCombo;
  $('oCoins').textContent = '+' + S.runCoins; $('oNew').classList.toggle('hidden', !isBest);
  show('over'); updMenu();
}

/* ---------- Themes ---------- */
function checkMilestones() {
  const got = [];
  THEMES.forEach((t, i) => { if (!P.unlocked.includes(i) && P.best >= t.m) { P.unlocked.push(i); got.push(t.n); } });
  if (got.length) toast(got.join(', ') + ' unlocked!');
}
function renderThemes() {
  $('tCoins').textContent = P.coins;
  $('themeList').innerHTML = THEMES.map((t, i) => {
    const un = P.unlocked.includes(i), sel = P.theme === i;
    const prev = `<div class="prev" style="background:linear-gradient(${t.bg.join(',')})">${t.c.map(c => `<i style="background:${c}"></i>`).join('')}</div>`;
    const btn = sel ? '<button class="btn sm" disabled>Selected</button>'
      : un ? `<button class="btn sm" data-sel="${i}">Select</button>`
      : `<button class="btn sm gold" data-buy="${i}">Unlock ${t.cost} coins</button>`;
    return `<div class="card${sel ? ' on' : ''}">${prev}<div class="info"><b>${t.n}</b><small>${un ? 'Unlocked' : 'Locked: score ' + t.m + ' or pay coins'}</small></div>${btn}</div>`;
  }).join('');
}
$('themeList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.sel != null) { const i = +b.dataset.sel; if (P.unlocked.includes(i)) { P.theme = i; sfx.click(); } }
  else if (b.dataset.buy != null) {
    const i = +b.dataset.buy, t = THEMES[i];
    if (!t || P.unlocked.includes(i)) return;
    if (P.coins < t.cost) { toast('Not enough coins'); sfx.err(); return; }
    P.coins -= t.cost; P.unlocked.push(i); P.theme = i; sfx.coin();
  }
  save(); renderThemes(); updMenu();
});

/* ---------- High scores ---------- */
async function renderScores() {
  const top = await Leaderboard.top();
  $('stats').innerHTML = [['Best score', P.best], ['Games played', P.games], ['Highest combo', P.maxCombo], ['Blocks placed', P.blocks], ['Coins earned', P.earned]]
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('board').innerHTML = top.length
    ? top.map((r, i) => `<li><span>${i + 1}</span><b>${r.s}</b><small>combo ${r.c}, ${new Date(r.d).toLocaleDateString()}</small></li>`).join('')
    : '<li class="empty">Play a round to set your first score.</li>';
}

/* ---------- Effects ---------- */
function burst(x, ly, cols, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = spd * (.3 + Math.random() * .7);
    S.parts.push({ x, ly, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v * .9, life: .7, max: .7, r: 2 + Math.random() * 3, col: cols[(Math.random() * cols.length) | 0] });
  }
  if (S.parts.length > CFG.maxParts) S.parts.splice(0, S.parts.length - CFG.maxParts);
}
function sweep(a, f) { let j = 0; for (let i = 0; i < a.length; i++) if (f(a[i])) a[j++] = a[i]; a.length = j; }

/* ---------- Update loop and camera ---------- */
function camera(dt) {
  const tgt = Math.max(0, (S.stack.length + 1) * BH + BASE - VH * CFG.camFrac);
  S.cam += (tgt - S.cam) * (1 - Math.exp(-dt * 4));
}
function update(dt) {
  S.t += dt; S.shake *= Math.exp(-dt * 9); S.flash = Math.max(0, S.flash - dt * 2.5);
  stars.forEach(p => { p.y -= p.s * dt; if (p.y < -.02) p.y = 1.02; });
  if (S.mode === 'play') moveBlock(dt);
  if (S.mode !== 'menu') camera(dt);
  sweep(S.deb, d => { d.vy += 1500 * dt; d.ly -= d.vy * dt; d.x += d.vx * dt; return d.ly > S.cam - BASE - 80; });
  sweep(S.parts, p => { p.life -= dt; p.vy -= 700 * dt; p.x += p.vx * dt; p.ly += p.vy * dt; return p.life > 0; });
  sweep(S.rings, r => (r.t += dt * 2.2) < 1);
  sweep(S.fl, f => { f.life -= dt / 1.1; f.ly += 50 * dt; return f.life > 0; });
  if (S.mode === 'dying' && (S.dt += dt) > .9) showOver();
}

/* ---------- Drawing ---------- */
function drawBlock(x, y, w, c, a = 1) {
  const d = 9, h = BH; ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, sh(c, 1.18)); g.addColorStop(1, sh(c, .82));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = sh(c, 1.4); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d, y - d); ctx.lineTo(x + w + d, y - d); ctx.lineTo(x + w, y); ctx.fill();
  ctx.fillStyle = sh(c, .6); ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + d, y - d); ctx.lineTo(x + w + d, y + h - d); ctx.lineTo(x + w, y + h); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, y, w, 2.5); ctx.globalAlpha = 1;
}
function draw() {
  const th = S.mode === 'menu' ? THEMES[0] : TH(), cur = TH();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H); th.bg.forEach((c, i) => g.addColorStop(i / 2, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const p of stars) { ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, 6.283); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${S.flash * .2})`; ctx.fillRect(0, 0, W, H); }
  const sx = (Math.random() - .5) * S.shake, sy = (Math.random() - .5) * S.shake;
  ctx.setTransform(DPR * VS, 0, 0, DPR * VS, DPR * (OX + sx), DPR * sy);
  const Y = ly => VH - BASE - ly + S.cam, menu = S.mode === 'menu';
  S.stack.forEach((b, i) => {
    const y = Y((i + 1) * BH); if (y < -40 || y > VH + 40) return;
    drawBlock(b.x + (menu ? Math.sin(S.t * 1.2 + i * .6) * 3 : 0), y, b.w, colorAt(cur, i), menu ? .4 : 1);
  });
  if (S.mode === 'play' && S.cur) {
    drawBlock(S.cur.x, Y((S.stack.length + 1) * BH), S.cur.w, colorAt(cur, S.stack.length));
    if (S.combo >= 3) { const t = S.stack[S.stack.length - 1]; ctx.strokeStyle = `rgba(255,255,255,${.5 + .3 * Math.sin(S.t * 8)})`; ctx.lineWidth = 2.5; ctx.strokeRect(t.x, Y(S.stack.length * BH), t.w, BH); }
  }
  for (const d of S.deb) drawBlock(d.x, Y(d.ly), d.w, colorAt(cur, d.i));
  for (const r of S.rings) { const p = r.t * 18; ctx.strokeStyle = `rgba(255,255,255,${1 - r.t})`; ctx.lineWidth = 3; ctx.strokeRect(r.x - p, Y(r.ly) - p, r.w + p * 2, BH + p * 2); }
  for (const p of S.parts) { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, Y(p.ly), p.r, 0, 6.283); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const f of S.fl) {
    ctx.globalAlpha = Math.min(1, f.life * 2); ctx.font = `900 ${f.s}px "Avenir Next",system-ui,sans-serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,10,60,.55)'; ctx.strokeText(f.txt, f.x, Y(f.ly)); ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, Y(f.ly));
  }
  ctx.globalAlpha = 1;
}
function loop(ts) {
  last = last || ts; const dt = Math.min(.05, (ts - last) / 1000); last = ts;
  update(dt); draw(); requestAnimationFrame(loop);
}

/* ---------- Input ---------- */
cv.addEventListener('pointerdown', e => { e.preventDefault(); place(); });
document.addEventListener('keydown', e => { if (e.code === 'Space' && S.mode === 'play') { e.preventDefault(); place(); } });
document.addEventListener('touchmove', e => { if (S.mode === 'play' || S.mode === 'dying') e.preventDefault(); }, { passive: false });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'sound') { P.sound = !P.sound; save(); updMenu(); sfx.click(); return; }
  sfx.click();
  if (a === 'play' || a === 'restart') startGame();
  else if (a === 'menu') toMenu();
  else if (a === 'themes') { renderThemes(); show('themeScr'); }
  else if (a === 'scores') { renderScores(); show('scoreScr'); }
});
addEventListener('resize', resize); addEventListener('orientationchange', resize);
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ---------- Init ---------- */
resize(); S = demo(); show('menu'); updMenu();
requestAnimationFrame(loop);
})();
