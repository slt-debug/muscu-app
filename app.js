'use strict';
/* Muscu : suivi de séances. Données en local (localStorage), synchronisées via un dépôt GitHub privé. */

// ---------- Utilitaires ----------
const APP_VERSION = '9 (Upper / Lower)';
const app = document.getElementById('app');
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, props, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props || {})) el.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
function mount(...kids) { app.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false)); }
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = str => { const d = parseYmd(str); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };
const fmtDateLong = str => { const d = parseYmd(str); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
const fmtKg = n => (n == null || n === '' ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const e1rm = (kg, reps) => Math.round(kg * (1 + reps / 30) * 10) / 10;
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);

// ---------- Stockage ----------
const KEY = 'muscu.v1', SKEY = 'muscu.settings';
function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* stockage indisponible */ } }
let db = Object.assign({ sessions: {}, body: {} }, load(KEY, {}));
let cfg = Object.assign({ owner: '', repo: '', path: 'data.json', token: '' }, load(SKEY, {}));
function save() { store(KEY, db); scheduleSync(); }

const EXERCISES = {};
for (const list of Object.values(PROGRAM.sessions)) for (const ex of list) EXERCISES[ex.id] = EXERCISES[ex.id] || ex;

function doneSets(entry) {
  return (entry?.sets || []).filter(x => x.done && x.reps > 0 && x.kg != null && x.kg >= 0);
}
// Historique d'un exercice, du plus ancien au plus récent (hors séance exclue).
function history(exId, excludeId) {
  return Object.values(db.sessions)
    .filter(r => !r.deleted && r.id !== excludeId && r.entries?.[exId])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, sets: doneSets(r.entries[exId]) }))
    .filter(x => x.sets.length);
}
function bestE1rm(sets) {
  const w = sets.filter(x => x.kg > 0);
  return w.length ? Math.max(...w.map(x => e1rm(x.kg, x.reps))) : null;
}
// Double progression : toutes les séries au haut de la fourchette => on monte la charge.
function suggest(ex, excludeId) {
  const hist = history(ex.id, excludeId);
  if (!hist.length) {
    return { kg: ex.kg, reps: ex.lo, text: ex.kg == null ? 'Première fois : trouve une charge qui laisse 1 à 2 reps en réserve.' : `Charge de départ conseillée : ${fmtKg(ex.kg)} kg.` };
  }
  const last = hist[hist.length - 1];
  const top = Math.max(...last.sets.map(x => x.kg));
  const atTop = last.sets.filter(x => x.kg === top);
  const full = atTop.length >= ex.sets && atTop.every(x => x.reps >= ex.hi);
  const summary = `${fmtDate(last.date)} : ${fmtKg(top)} kg × ${atTop.map(x => x.reps).join(', ')}`;
  if (full) {
    return { kg: top + ex.step, reps: ex.lo, text: `${summary}. Objectif : monter à ${fmtKg(top + ex.step)} kg.` };
  }
  const minReps = Math.min(...atTop.map(x => x.reps));
  const target = Math.min(ex.hi, minReps + 1);
  return { kg: top, reps: target, text: `${summary}. Objectif : ${fmtKg(top)} kg, ${target} reps sur chaque série.` };
}

// ---------- Séances ----------
function sessionId(date, name) { return `${date}_${name}`; }
function entryFor(ex, rec, sug) {
  const entry = rec?.entries?.[ex.id];
  if (entry) return entry;
  return { sets: Array.from({ length: ex.sets }, () => ({ kg: sug.kg, reps: sug.reps, rir: '', done: false })) };
}
function commit(date, name, ex, entry) {
  const id = sessionId(date, name);
  const rec = db.sessions[id] || (db.sessions[id] = { id, date, name, entries: {} });
  rec.entries[ex.id] = entry;
  rec.updatedAt = Date.now();
  rec.deleted = false;
  save();
}
function sessionVolume(rec) {
  let v = 0;
  for (const e of Object.values(rec.entries || {})) for (const x of doneSets(e)) v += x.kg * x.reps;
  return Math.round(v);
}
function setsDone(rec) {
  return Object.values(rec?.entries || {}).reduce((n, e) => n + doneSets(e).length, 0);
}

// ---------- Minuteur de repos ----------
const timerEl = document.getElementById('timer');
let timer = null, audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* pas d'audio */ }
}
function beep() {
  if (!audioCtx) return;
  [0, 0.28, 0.56].forEach(delay => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.start(t); o.stop(t + 0.22);
  });
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignoré */ }
}
function startTimer(seconds, label) {
  unlockAudio();
  timer = { end: Date.now() + seconds * 1000, label, fired: false };
  renderTimer();
}
function stopTimer() { timer = null; renderTimer(); }
function renderTimer() {
  if (!timer) { timerEl.hidden = true; timerEl.className = ''; return; }
  const left = Math.ceil((timer.end - Date.now()) / 1000);
  timerEl.hidden = false;
  if (left <= 0) {
    if (!timer.fired) { timer.fired = true; beep(); }
    timerEl.className = 'end';
    timerEl.replaceChildren(h('div', { class: 't' }, 'Repos terminé'), h('button', { onclick: stopTimer }, 'OK'));
    return;
  }
  timerEl.className = '';
  timerEl.replaceChildren(
    h('div', { class: 't' }, `${Math.floor(left / 60)}:${pad2(left % 60)}`),
    h('button', { onclick: () => { timer.end += 30000; renderTimer(); } }, '+30 s'),
    h('button', { onclick: stopTimer }, 'Stop'));
}
setInterval(() => { if (timer) renderTimer(); }, 500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (timer) renderTimer(); syncNow(); } });

let wakeLock = null;
async function keepAwake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* refusé */ }
}

// ---------- Graphiques ----------
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
// series : [{name, cls, markers, points: [{t, v, label}]}] ; la 1re série pilote le survol.
function lineChart(series, unit) {
  const pts = series.flatMap(x => x.points);
  if (!pts.length) return h('p', { class: 'muted' }, 'Pas encore de données.');
  const W = 340, H = 200, m = { l: 40, r: 14, t: 14, b: 26 };
  let x0 = Math.min(...pts.map(p => p.t)), x1 = Math.max(...pts.map(p => p.t));
  if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
  let y0 = Math.min(...pts.map(p => p.v)), y1 = Math.max(...pts.map(p => p.v));
  const span = y1 - y0 || Math.max(1, y1 * 0.05);
  y0 -= span * 0.2; y1 += span * 0.2;
  const step = niceStep((y1 - y0) / 4);
  const ticks = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Graphique' });
  for (const v of ticks) {
    svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }),
      s('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmtKg(v)));
  }
  svg.append(s('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
  const dates = [...new Set(pts.map(p => p.t))].sort((a, b) => a - b);
  const xt = dates.length <= 2 ? dates : [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];
  xt.forEach((t, i) => svg.append(s('text', { x: X(t), y: H - 8, 'text-anchor': i === 0 && xt.length > 1 ? 'start' : i === xt.length - 1 && xt.length > 1 ? 'end' : 'middle' }, fmtDate(ymd(new Date(t))))));
  for (const ser of [...series].reverse()) { // la série principale est dessinée en dernier, donc au-dessus
    const sorted = [...ser.points].sort((a, b) => a.t - b.t);
    if (ser.line !== false && sorted.length > 1) svg.append(s('polyline', { class: 'line', points: sorted.map(p => `${X(p.t)},${Y(p.v)}`).join(' ') }));
    for (const p of sorted) svg.append(s('circle', { class: 'dot' + (ser.raw ? ' raw' : ''), cx: X(p.t), cy: Y(p.v), r: ser.raw ? 3 : 4 }));
  }
  const cross = s('line', { class: 'cross', y1: m.t, y2: H - m.b, visibility: 'hidden' });
  svg.append(cross);
  const wrap = h('div', { class: 'chart' }, svg);
  const tip = h('div', { class: 'tip', hidden: true });
  wrap.append(tip);
  const lead = series[0].points.length ? series[0].points : pts;
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const vx = (ev.clientX - r.left) / r.width * W;
    let best = lead[0];
    for (const p of lead) if (Math.abs(X(p.t) - vx) < Math.abs(X(best.t) - vx)) best = p;
    cross.setAttribute('x1', X(best.t)); cross.setAttribute('x2', X(best.t)); cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${fmtDate(ymd(new Date(best.t)))} : ${fmtKg(best.v)} ${unit}${best.label ? ' (' + best.label + ')' : ''}`;
    const left = X(best.t) / W * r.width + 8;
    tip.style.left = Math.min(Math.max(left, 70), r.width - 70) + 'px';
    tip.style.top = (Y(best.v) / H * r.height + 8) + 'px';
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  if (series.length > 1) {
    wrap.append(h('div', { class: 'legend' }, series.map(x => h('span', {}, h('i', { style: `background:${x.raw ? 'var(--muted)' : 'var(--series-1)'}` }), x.name))));
  }
  return wrap;
}

// ---------- Vues ----------
let ui = { active: undefined }; // undefined = pas encore choisi, null = tout replié
function setTab(name) {
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
}
function nextTrainingDay() {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    if (PROGRAM.days[d.getDay()]) return { day: JOURS[d.getDay()], name: PROGRAM.days[d.getDay()] };
  }
}
function weekStart() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d);
}

function viewHome() {
  setTab('home');
  const now = new Date();
  const todayName = PROGRAM.days[now.getDay()];
  const recs = Object.values(db.sessions).filter(r => !r.deleted && setsDone(r) > 0).sort((a, b) => b.date.localeCompare(a.date));
  const ws = weekStart();
  const weekDone = recs.filter(r => r.date >= ws).length;
  const todayRec = todayName && db.sessions[sessionId(today(), todayName)];
  const nxt = nextTrainingDay();
  const body = Object.values(db.body).filter(b => !b.deleted).sort((a, b) => b.date.localeCompare(a.date));

  const hero = todayName
    ? h('div', { class: 'card' },
      h('div', { class: 'sub' }, `Aujourd'hui, ${JOURS[now.getDay()]}`),
      h('h1', {}, todayName),
      h('div', { class: 'sub' }, `${PROGRAM.sessions[todayName].length} exercices${todayRec ? ` · ${setsDone(todayRec)} séries faites` : ''}`),
      h('div', { style: 'height:12px' }),
      h('a', { class: 'btn', href: `#/seance/${encodeURIComponent(todayName)}/${today()}` }, todayRec ? 'Reprendre la séance' : 'Commencer la séance'))
    : h('div', { class: 'card' },
      h('div', { class: 'sub' }, `Aujourd'hui, ${JOURS[now.getDay()]}`),
      h('h1', {}, 'Jour de repos'),
      h('div', { class: 'sub' }, `Prochaine séance : ${nxt.day}, ${nxt.name}.`));

  mount(
    h('div', { class: 'row between' }, h('h1', {}, 'Muscu'), syncChip()),
    hero,
    h('h2', {}, 'Autre séance'),
    h('div', { class: 'grid2' }, Object.keys(PROGRAM.sessions).map(n =>
      h('a', { class: 'btn secondary', href: `#/seance/${encodeURIComponent(n)}/${today()}` }, n))),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'sub' }, 'Cette semaine'), h('div', { class: 'big' }, `${weekDone}/4`), h('div', { class: 'sub' }, 'séances')),
      h('div', { class: 'card' }, h('div', { class: 'sub' }, 'Poids'), h('div', { class: 'big' }, body[0]?.poids != null ? fmtKg(body[0].poids) : '–'), h('div', { class: 'sub' }, body[0] ? `kg, ${fmtDate(body[0].date)}` : 'à saisir dans Corps'))),
    h('h2', {}, 'Dernières séances'),
    recs.length ? h('div', { class: 'card' }, recs.slice(0, 6).map(r => h('a', { class: 'list-item', href: `#/seance/${encodeURIComponent(r.name)}/${r.date}` },
      h('span', {}, `${cap(fmtDateLong(r.date))}, ${r.name}`),
      h('span', { class: 'sub' }, `${setsDone(r)} séries · ${sessionVolume(r).toLocaleString('fr-FR')} kg`)))) : h('p', { class: 'muted' }, 'Aucune séance enregistrée pour l\'instant.'));
}

function viewSession(name, date) {
  setTab('home');
  const list = PROGRAM.sessions[name];
  if (!list) return go('#/');
  keepAwake();
  const id = sessionId(date, name);
  const rec = db.sessions[id];
  const total = list.reduce((n, ex) => n + ex.sets, 0);
  const sugs = Object.fromEntries(list.map(ex => [ex.id, suggest(ex, id)]));
  if (ui.active && !list.some(ex => ex.id === ui.active)) ui.active = undefined;
  if (ui.active === undefined) {
    const first = list.find(ex => doneSets(rec?.entries?.[ex.id]).length < ex.sets);
    ui.active = first ? first.id : null;
  }

  const redraw = () => { const y = window.scrollY; viewSession(name, date); window.scrollTo(0, y); };

  const cards = list.map(ex => {
    const entry = entryFor(ex, rec, sugs[ex.id]);
    const nDone = doneSets(entry).length;
    const open = ui.active === ex.id;
    const head = h('button', { class: 'ex-head', onclick: () => { ui.active = open ? null : ex.id; redraw(); } },
      h('div', { class: 'grow' }, h('h3', {}, ex.name), h('div', { class: 'sub' }, `${ex.sets} × ${ex.lo === ex.hi ? ex.lo : ex.lo + '-' + ex.hi}${ex.note ? ' · ' + ex.note : ''}`)),
      h('span', { class: 'count' }, `${nDone}/${entry.sets.length}`));
    const card = h('div', { class: 'card' + (nDone >= ex.sets ? ' done' : '') }, head);
    if (!open) return card;
    card.append(h('div', { class: 'hint' }, sugs[ex.id].text));
    card.append(h('div', { class: 'set' }, h('span'), h('span', { class: 'head' }, 'kg'), h('span', { class: 'head' }, 'reps'), h('span', { class: 'head' }, 'réserve'), h('span')));
    entry.sets.forEach((st, i) => {
      const save1 = () => commit(date, name, ex, entry);
      const kgIn = h('input', { type: 'text', inputmode: 'decimal', value: st.kg == null ? '' : fmtKg(st.kg), 'aria-label': 'Charge en kg' });
      const repIn = h('input', { type: 'text', inputmode: 'numeric', value: st.reps == null ? '' : String(st.reps), 'aria-label': 'Répétitions' });
      kgIn.addEventListener('change', () => { st.kg = num(kgIn.value); save1(); });
      repIn.addEventListener('change', () => { st.reps = num(repIn.value); save1(); });
      const bump = (input, key, delta, min) => () => {
        const cur = num(input.value) ?? (key === 'kg' ? (ex.kg ?? 0) : 0);
        const nv = Math.max(min, Math.round((cur + delta) * 100) / 100);
        st[key] = nv; input.value = key === 'kg' ? fmtKg(nv) : String(nv); save1();
      };
      const rir = h('select', { class: 'rir', 'aria-label': 'Répétitions en réserve' },
        ['', '0', '1', '2', '3', '4'].map(v => h('option', { value: v, selected: String(st.rir) === v }, v === '' ? '–' : v)));
      rir.addEventListener('change', () => { st.rir = rir.value; save1(); });
      const chk = h('button', { class: 'check' + (st.done ? ' on' : ''), 'aria-label': 'Série faite', onclick: () => {
        st.kg = num(kgIn.value); st.reps = num(repIn.value);
        st.done = !st.done;
        if (st.done && !(st.reps > 0 && st.kg != null)) { st.done = false; return; }
        commit(date, name, ex, entry);
        if (st.done) {
          startTimer(ex.rest, ex.name);
          if (doneSets(entry).length >= entry.sets.length) {
            const idx = list.indexOf(ex);
            const nxt = list.slice(idx + 1).find(e => doneSets(db.sessions[id]?.entries?.[e.id]).length < e.sets);
            ui.active = nxt ? nxt.id : null;
          }
        }
        redraw();
      } }, st.done ? '✓' : '○');
      card.append(h('div', { class: 'set' },
        h('span', { class: 'n' }, i + 1),
        h('div', { class: 'stepper' }, h('button', { onclick: bump(kgIn, 'kg', -ex.step, 0) }, '−'), kgIn, h('button', { onclick: bump(kgIn, 'kg', ex.step, 0) }, '+')),
        h('div', { class: 'stepper' }, h('button', { onclick: bump(repIn, 'reps', -1, 0) }, '−'), repIn, h('button', { onclick: bump(repIn, 'reps', 1, 0) }, '+')),
        rir, chk));
    });
    card.append(h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btn secondary small', onclick: () => { const last = entry.sets[entry.sets.length - 1]; entry.sets.push({ kg: last?.kg ?? null, reps: last?.reps ?? null, rir: '', done: false }); commit(date, name, ex, entry); redraw(); } }, '+ Série'),
      entry.sets.length > 1 ? h('button', { class: 'btn secondary small', onclick: () => { entry.sets.pop(); commit(date, name, ex, entry); redraw(); } }, '− Série') : null,
      h('a', { class: 'btn secondary small', href: `#/ex/${ex.id}` }, 'Historique')));
    return card;
  });

  const done = setsDone(rec);
  mount(
    h('div', { class: 'row between' }, h('a', { href: '#/' }, '‹ Accueil'), syncChip()),
    h('h1', {}, name),
    h('div', { class: 'sub' }, `${cap(fmtDateLong(date))} · ${done}/${total} séries${rec ? ' · ' + sessionVolume(rec).toLocaleString('fr-FR') + ' kg de volume' : ''}`),
    cards,
    done ? h('a', { class: 'btn', href: '#/', style: 'margin-top:12px' }, 'Terminer la séance') : null);
}

function viewHistory() {
  setTab('hist');
  const rows = Object.values(EXERCISES).map(ex => ({ ex, hist: history(ex.id) })).filter(x => x.hist.length);
  mount(
    h('h1', {}, 'Historique'),
    rows.length ? h('div', { class: 'card' }, rows.map(({ ex, hist }) => {
      const last = hist[hist.length - 1], best = bestE1rm(last.sets);
      return h('a', { class: 'list-item', href: `#/ex/${ex.id}` },
        h('span', {}, ex.name),
        h('span', { class: 'sub' }, best ? `${fmtKg(best)} kg (1RM est.)` : `${last.sets.length} séries`));
    })) : h('p', { class: 'muted' }, 'Aucune donnée. Valide une série pendant une séance pour commencer.'));
}

function viewExercise(exId) {
  setTab('hist');
  const ex = EXERCISES[exId];
  if (!ex) return go('#/historique');
  const hist = history(exId);
  const pts = hist.map(x => ({ t: parseYmd(x.date).getTime(), v: bestE1rm(x.sets), label: x.sets.map(s2 => `${fmtKg(s2.kg)}×${s2.reps}`).join(' ') })).filter(p => p.v != null);
  mount(
    h('a', { href: '#/historique' }, '‹ Historique'),
    h('h1', {}, ex.name),
    h('div', { class: 'sub' }, '1RM estimé par séance (formule d\'Epley, meilleure série)'),
    pts.length ? lineChart([{ name: '1RM estimé', points: pts }], 'kg') : h('p', { class: 'muted' }, hist.length ? 'Exercice au poids du corps : pas de courbe de 1RM.' : 'Pas encore de données.'),
    h('details', { open: true }, h('summary', {}, 'Détail des séances'),
      h('table', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Séries (kg × reps)')),
        [...hist].reverse().map(x => h('tr', {}, h('td', {}, fmtDate(x.date)), h('td', {}, x.sets.map(s2 => `${fmtKg(s2.kg)}×${s2.reps}`).join('  ')))))));
}

// Mensurations suivies en plus du poids. La clé est celle stockée dans data.json.
const MEASURES = [
  { key: 'waist', label: 'Tour de taille', short: 'T. de taille', better: 'down', hint: 'au niveau du nombril, ventre relâché' },
  { key: 'chest', label: 'Tour de poitrine', short: 'Poitrine', better: 'up', hint: 'sous les aisselles, à hauteur des mamelons, après une expiration normale' },
  { key: 'biceps', label: 'Tour de biceps', short: 'Biceps', better: 'up', hint: 'bras détendu le long du corps, à l\'endroit le plus large' },
  { key: 'thigh', label: 'Tour de cuisse', short: 'Cuisse', better: 'up', hint: 'à mi-cuisse, debout, jambe détendue' },
];

function viewBody() {
  setTab('corps');
  const list = Object.values(db.body).filter(b => !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const fDate = h('input', { type: 'date', value: today() });
  const fP = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'kg' });
  const fM = h('input', { type: 'text', inputmode: 'decimal', placeholder: '%' });
  const fMeas = Object.fromEntries(MEASURES.map(m => [m.key, h('input', { type: 'text', inputmode: 'decimal', placeholder: 'cm' })]));
  const existing = d => db.body[d] && !db.body[d].deleted ? db.body[d] : null;
  const fill = () => {
    const e = existing(fDate.value);
    fP.value = e?.poids != null ? fmtKg(e.poids) : ''; fM.value = e?.mg != null ? fmtKg(e.mg) : '';
    for (const m of MEASURES) fMeas[m.key].value = e?.[m.key] != null ? fmtKg(e[m.key]) : '';
  };
  fDate.addEventListener('change', fill);
  const add = h('button', { class: 'btn', onclick: () => {
    const vals = { poids: num(fP.value), mg: num(fM.value), ...Object.fromEntries(MEASURES.map(m => [m.key, num(fMeas[m.key].value)])) };
    if (!fDate.value || Object.values(vals).every(v => v == null)) return;
    const prev = existing(fDate.value) || {};
    const rec = { ...prev, id: fDate.value, date: fDate.value, updatedAt: Date.now() };
    for (const [k, v] of Object.entries(vals)) rec[k] = v ?? prev[k] ?? null;
    db.body[fDate.value] = rec;
    save(); viewBody();
  } }, 'Enregistrer');

  const pts = key => list.filter(b => b[key] != null).map(b => ({ t: parseYmd(b.date).getTime(), v: b[key] }));
  const wPts = pts('poids');
  const avg = wPts.map(p => {
    const win = wPts.filter(q => q.t <= p.t && q.t > p.t - 7 * 864e5);
    return { t: p.t, v: Math.round(win.reduce((a, q) => a + q.v, 0) / win.length * 10) / 10 };
  });
  const last = [...list].reverse().find(b => b.poids != null);
  const prevW = [...list].reverse().filter(b => b.poids != null)[1];

  // Bilan des mensurations : dernière valeur et évolution depuis la première mesure.
  const summaryRows = MEASURES.map(m => {
    const p = pts(m.key); if (!p.length) return null;
    const first = p[0].v, lastV = p[p.length - 1].v, d = Math.round((lastV - first) * 10) / 10;
    const good = d === 0 ? '' : (m.better === 'down' ? d < 0 : d > 0) ? 'up' : 'down';
    return h('tr', {}, h('td', {}, m.short), h('td', {}, `${fmtKg(lastV)} cm`),
      h('td', { class: 'delta ' + good }, p.length > 1 ? `${d > 0 ? '+' : ''}${fmtKg(d)} cm` : 'première mesure'));
  }).filter(Boolean);

  mount(
    h('div', { class: 'row between' }, h('h1', {}, 'Corps'), syncChip()),
    last ? h('div', { class: 'card' },
      h('div', { class: 'sub' }, `Dernière pesée, ${fmtDate(last.date)}`),
      h('div', { class: 'big' }, `${fmtKg(last.poids)} kg`),
      prevW ? h('div', { class: 'sub delta ' + (last.poids <= prevW.poids ? 'up' : 'down') }, `${last.poids - prevW.poids > 0 ? '+' : ''}${fmtKg(Math.round((last.poids - prevW.poids) * 10) / 10)} kg depuis ${fmtDate(prevW.date)}`) : null) : null,
    h('div', { class: 'card' },
      h('label', { class: 'field' }, h('span', {}, 'Date'), fDate),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, 'Poids (kg)'), fP),
        h('label', { class: 'field' }, h('span', {}, 'Masse grasse (%)'), fM)),
      h('div', { class: 'grid2' }, MEASURES.map(m => h('label', { class: 'field' }, h('span', {}, `${m.label} (cm)`), fMeas[m.key]))),
      add,
      h('details', { style: 'margin-top:10px' }, h('summary', { class: 'sub' }, 'Comment mesurer'),
        h('p', { class: 'sub' }, 'Mètre ruban à plat, non serré, le matin, toujours au même endroit et du même côté du corps.'),
        h('ul', { class: 'sub' }, MEASURES.map(m => h('li', {}, `${m.label} : ${m.hint}.`))))),
    summaryRows.length ? [h('h2', {}, 'Évolution des mensurations'),
      h('div', { class: 'card' }, h('table', {}, h('tr', {}, h('th', {}, 'Mesure'), h('th', {}, 'Dernière'), h('th', {}, 'Depuis la 1re')), summaryRows))] : null,
    h('h2', {}, 'Poids'),
    wPts.length ? lineChart([{ name: 'Moyenne 7 jours', points: avg }, { name: 'Pesée', points: wPts, raw: true, line: false }], 'kg') : h('p', { class: 'muted' }, 'Aucune pesée.'),
    pts('mg').length ? [h('h2', {}, 'Masse grasse'), lineChart([{ name: 'Masse grasse', points: pts('mg') }], '%')] : null,
    MEASURES.map(m => pts(m.key).length ? [h('h2', {}, m.label), lineChart([{ name: m.label, points: pts(m.key) }], 'cm')] : null),
    h('details', {}, h('summary', {}, 'Toutes les mesures'),
      h('table', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'kg'), h('th', {}, '% gras'), MEASURES.map(m => h('th', {}, m.short))),
        [...list].reverse().map(b => h('tr', {}, h('td', {}, fmtDate(b.date)), h('td', {}, fmtKg(b.poids) || '–'), h('td', {}, fmtKg(b.mg) || '–'), MEASURES.map(m => h('td', {}, fmtKg(b[m.key]) || '–')))))));
}

// ---------- Synchronisation GitHub ----------
const sync = { state: cfgOk() ? 'idle' : 'off', at: null, msg: '', log: [] };
let syncTimer = null, syncing = false, syncStartedAt = 0;
// Journal visible dans Réglages : permet de voir ce que fait la synchro sur le téléphone.
function slog(msg) {
  const d = new Date();
  sync.log.unshift(`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}  ${msg}`);
  sync.log.length = Math.min(sync.log.length, 10);
  const el = document.getElementById('sync-log');
  if (el) el.textContent = sync.log.join('\n');
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function cfgOk() { return !!(cfg.owner && cfg.repo && cfg.token); }
function syncChip() {
  const label = { off: 'Local seulement', idle: 'Synchro en attente', busy: 'Synchro…', ok: `Synchronisé ${sync.at || ''}`, err: 'Erreur de synchro' }[sync.state];
  return h('span', { class: 'chip sync ' + (sync.state === 'ok' ? 'ok' : sync.state === 'err' ? 'err' : ''), onclick: () => syncNow(true) }, label);
}
function explainError(msg) {
  if (/Load failed|Failed to fetch|NetworkError/i.test(msg)) return 'impossible de joindre GitHub (vérifie ta connexion).';
  if (/401/.test(msg)) return 'jeton refusé (401). Vérifie qu\'il est bien copié en entier et qu\'il n\'a pas expiré.';
  if (/403/.test(msg)) return 'accès refusé (403). Le jeton doit avoir la permission « Contents : Read and write » sur le dépôt muscu-data.';
  if (/404/.test(msg)) return 'dépôt introuvable (404). Vérifie le compte et le nom du dépôt, et que le jeton couvre bien muscu-data.';
  if (msg === 'hors ligne') return 'pas de réseau pour le moment.';
  return msg;
}
const FIELD_LABELS = { owner: 'Compte GitHub', repo: 'Dépôt de données', path: 'Fichier', token: 'Jeton d\'accès' };
const missingFields = () => Object.keys(FIELD_LABELS).filter(k => !cfg[k]).map(k => FIELD_LABELS[k]);
function syncMessage() {
  if (sync.state === 'off') { const m = missingFields(); return m.length ? `Il manque : ${m.join(', ')}. Les textes gris sont des exemples, pas des valeurs saisies.` : 'Renseigne les 4 champs pour activer la synchro.'; }
  if (sync.state === 'busy') return 'Synchronisation en cours…';
  if (sync.state === 'ok') return `Synchronisé à ${sync.at}. ${sync.info || ''}`;
  if (sync.state === 'err') return `Échec : ${explainError(sync.msg)}`;
  return 'Prêt. Touche le bouton pour synchroniser.';
}
function refreshChips() {
  document.querySelectorAll('.chip.sync').forEach(c => c.replaceWith(syncChip()));
  const line = document.getElementById('sync-line');
  if (line) { line.textContent = syncMessage(); line.className = 'sync-line ' + (sync.state === 'ok' ? 'ok' : sync.state === 'err' ? 'err' : ''); }
  const btn = document.getElementById('sync-btn');
  if (btn) {
    const busy = sync.state === 'busy', flash = Date.now() < (sync.flashUntil || 0);
    btn.disabled = busy;
    btn.classList.toggle('busy', busy);
    btn.classList.toggle('success', !busy && flash && sync.state === 'ok');
    btn.classList.toggle('fail', !busy && flash && sync.state === 'err');
    btn.textContent = busy ? 'Synchronisation…' : flash && sync.state === 'ok' ? '✓ Synchronisé' : flash && sync.state === 'err' ? '✕ Échec' : 'Synchroniser maintenant';
  }
}
function scheduleSync() {
  if (!cfgOk()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 4000);
}
const ghUrl = () => `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
const ghHeaders = () => ({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
// fetch avec délai maximum : sans lui, une requête bloquée laisserait la synchro « en cours » indéfiniment.
async function ghFetch(url, opt) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'délai dépassé (15 s sans réponse de GitHub)' : e.message); }
  finally { clearTimeout(t); }
}
async function ghGet() {
  slog('Lecture du fichier sur GitHub…');
  const r = await ghFetch(ghUrl(), { headers: ghHeaders(), cache: 'no-store' });
  slog(`Lecture : réponse ${r.status}`);
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  const txt = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
  return { sha: j.sha, data: JSON.parse(txt) };
}
async function ghPut(data, sha) {
  const body = { message: `sync ${new Date().toISOString()}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 1)))) };
  if (sha) body.sha = sha;
  slog('Envoi des données vers GitHub…');
  const r = await ghFetch(ghUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  slog(`Envoi : réponse ${r.status}`);
  if (r.status === 409 || r.status === 422) { const e = new Error('conflit'); e.conflict = true; throw e; }
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}
const setCount = r => Object.values(r?.entries || {}).reduce((n, e) => n + (e.sets || []).filter(x => x.done).length, 0);
function mergeColl(a, b) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b || {})) {
    const cur = out[id];
    if (!cur) { out[id] = rec; continue; }
    // Une fiche vide ne remplace jamais une séance qui contient des séries validées (sauf suppression explicite).
    if (!rec.deleted && !cur.deleted) {
      if (setCount(rec) === 0 && setCount(cur) > 0) continue;
      if (setCount(cur) === 0 && setCount(rec) > 0) { out[id] = rec; continue; }
    }
    if ((rec.updatedAt || 0) > (cur.updatedAt || 0)) out[id] = rec;
  }
  return out;
}
// Anciens noms de séances (avant le passage en anglais) : les fiches déjà enregistrées sont renommées à la volée.
const LEGACY_NAMES = { 'Haut A': 'Upper A', 'Haut B': 'Upper B', 'Bas A': 'Lower A', 'Bas B': 'Lower B' };
function migrateSessions(coll) {
  const out = {};
  for (const [id, rec] of Object.entries(coll || {})) {
    const m = /^(\d{4}-\d{2}-\d{2})_(.+)$/.exec(id);
    const to = m && LEGACY_NAMES[m[2]];
    const nid = to ? `${m[1]}_${to}` : id, nrec = to ? { ...rec, id: nid, name: to } : rec;
    out[nid] = out[nid] ? mergeColl({ [nid]: out[nid] }, { [nid]: nrec })[nid] : nrec;
  }
  return out;
}
const merge = (local, remote) => ({
  sessions: mergeColl(migrateSessions(local.sessions), migrateSessions(remote?.sessions)),
  body: mergeColl(local.body, remote?.body),
});

async function syncNow(manual) {
  const isManual = manual === true;
  slog(isManual ? 'Appui sur « Synchroniser maintenant »' : 'Synchro automatique');
  if (!cfgOk()) { slog(`Annulé : il manque ${missingFields().join(', ')}`); sync.state = 'off'; if (isManual) go('#/reglages'); return; }
  // Une synchro bloquée depuis plus de 20 s ne doit pas empêcher les suivantes.
  if (syncing && Date.now() - syncStartedAt < 20000) { slog('Une synchro est déjà en cours, appui ignoré'); return; }
  if (!navigator.onLine) { slog('Annulé : le téléphone indique « hors ligne »'); if (isManual) { sync.state = 'err'; sync.msg = 'hors ligne'; refreshChips(); } return; }
  syncing = true; syncStartedAt = Date.now(); sync.state = 'busy'; refreshChips();
  let localChanged = false;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const remote = await ghGet();
        const merged = merge(db, remote.data);
        const changedRemote = JSON.stringify(merged) !== JSON.stringify({ sessions: remote.data?.sessions || {}, body: remote.data?.body || {} });
        localChanged = JSON.stringify(merged) !== JSON.stringify(db);
        db = merged; store(KEY, db);
        if (changedRemote) await ghPut(merged, remote.sha);
        break;
      } catch (e) { if (!e.conflict || attempt) throw e; }
    }
    sync.state = 'ok'; const d = new Date(); sync.at = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; sync.msg = '';
    const nS = Object.values(db.sessions).filter(r => !r.deleted).length, nB = Object.values(db.body).filter(b => !b.deleted).length;
    sync.info = `${nS} séance${nS > 1 ? 's' : ''} et ${nB} mesure${nB > 1 ? 's' : ''} sur GitHub.`;
  } catch (e) { sync.state = 'err'; sync.msg = String(e.message || e); slog(`Échec : ${sync.msg}`); }
  // L'état « en cours » reste visible au moins 0,8 s, même si la réponse de GitHub est très rapide.
  if (isManual) await wait(Math.max(0, 800 - (Date.now() - syncStartedAt)));
  syncing = false;
  if (sync.state === 'ok') slog(`Terminé : ${sync.info}`);
  if (isManual) { sync.flashUntil = Date.now() + 2000; setTimeout(refreshChips, 2100); }
  refreshChips();
  // Des données distantes sont arrivées : on redessine les vues de lecture (pas la séance en cours de saisie).
  const readOnlyView = ['', '#/', '#/historique'].includes(location.hash) || location.hash.startsWith('#/ex/');
  if (localChanged && readOnlyView) render();
}

// ---------- Réglages, export / import ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function toCsv() {
  const lines = ['date;seance;exercice;serie;kg;reps;reserve'];
  for (const r of Object.values(db.sessions).filter(x => !x.deleted).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [exId, e] of Object.entries(r.entries || {})) {
      doneSets(e).forEach((x, i) => lines.push([r.date, r.name, EXERCISES[exId]?.name || exId, i + 1, String(x.kg).replace('.', ','), x.reps, x.rir].join(';')));
    }
  }
  return lines.join('\n');
}
function viewSettings() {
  setTab('set');
  const fieldInputs = {};
  const f = (key, label, type = 'text', ph = '') => {
    const i = h('input', { type, value: cfg[key], placeholder: ph, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    fieldInputs[key] = i;
    i.addEventListener('change', () => { cfg[key] = i.value.trim(); store(SKEY, cfg); sync.state = cfgOk() ? 'idle' : 'off'; });
    return h('label', { class: 'field' }, h('span', {}, label), i);
  };
  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true });
  fileIn.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await fileIn.files[0].text());
      db = merge(db, data); save(); alert('Import terminé.'); viewSettings();
    } catch { alert('Fichier invalide.'); }
  });
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  mount(
    h('div', { class: 'row between' }, h('h1', {}, 'Réglages'), syncChip()),
    h('h2', {}, 'Synchronisation GitHub'),
    h('p', { class: 'sub' }, 'Tes données sont enregistrées sur le téléphone, puis copiées dans un dépôt GitHub privé pour les retrouver sur ton PC.'),
    h('div', { class: 'card' },
      f('owner', 'Compte GitHub (à saisir)', 'text', 'Exemple : ton-pseudo'),
      f('repo', 'Dépôt de données (à saisir)', 'text', 'Exemple : muscu-data'),
      f('path', 'Fichier', 'text', 'Exemple : data.json'),
      f('token', 'Jeton d\'accès (à saisir)', 'password', 'Colle le jeton ici'),
      h('button', { class: 'btn', id: 'sync-btn', onclick: (ev) => {
        // Retour immédiat à l'appui : l'animation et la vibration partent avant tout le reste.
        const b = ev.currentTarget;
        b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
        try { navigator.vibrate?.(30); } catch { /* iOS ne vibre pas */ }
        try {
          // On relit les champs ici : sur iPhone l'événement « change » peut ne pas être parti avant le toucher.
          for (const [k, inp] of Object.entries(fieldInputs)) cfg[k] = inp.value.trim();
          store(SKEY, cfg);
          sync.state = cfgOk() ? 'idle' : 'off';
          if (!cfg.path) { cfg.path = 'data.json'; store(SKEY, cfg); }
          if (!cfgOk()) { slog(`Appui sur « Synchroniser maintenant ». Annulé : il manque ${missingFields().join(', ')}`); sync.flashUntil = Date.now() + 2000; sync.state = 'off'; refreshChips(); return; }
          syncNow(true);
        } catch (e) { sync.state = 'err'; sync.msg = String(e.message || e); sync.flashUntil = Date.now() + 2000; refreshChips(); }
      } }, 'Synchroniser maintenant'),
      h('div', { class: 'sync-line ' + (sync.state === 'ok' ? 'ok' : sync.state === 'err' ? 'err' : ''), id: 'sync-line', role: 'status' }, syncMessage()),
      h('details', { open: true }, h('summary', { class: 'sub' }, 'Journal de la synchro'),
        h('pre', { id: 'sync-log', class: 'sync-log' }, sync.log.length ? sync.log.join('\n') : 'Aucune tentative pour l\'instant.'))),
    h('h2', {}, 'Sauvegarde'),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn secondary', onclick: () => download(`muscu-${today()}.json`, JSON.stringify(db, null, 1), 'application/json') }, 'Exporter JSON'),
      h('button', { class: 'btn secondary', onclick: () => download(`muscu-${today()}.csv`, toCsv(), 'text/csv') }, 'Exporter CSV')),
    h('div', { style: 'height:10px' }),
    h('button', { class: 'btn secondary', onclick: () => fileIn.click() }, 'Importer un JSON'), fileIn,
    standalone ? null : [h('h2', {}, 'Installer sur l\'iPhone'),
      h('p', { class: 'sub' }, 'Dans Safari : bouton Partager, puis « Sur l\'écran d\'accueil ». L\'appli s\'ouvrira ensuite en plein écran et fonctionnera sans réseau.')],
    h('h2', {}, 'À propos'),
    h('p', { class: 'sub' }, `Version ${APP_VERSION}`),
    h('p', { class: 'sub' }, `Double progression : quand toutes les séries atteignent le haut de la fourchette de reps, l'appli propose de monter la charge. ${Object.keys(db.sessions).length} séances et ${Object.keys(db.body).length} mesures enregistrées.`));
  refreshChips(); // aligne le bouton sur l'état réel (par exemple une synchro déjà en cours)
}

// ---------- Routage ----------
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  window.scrollTo(0, 0);
  switch (parts[0]) {
    case 'seance': return viewSession(parts[1], parts[2] || today());
    case 'historique': return viewHistory();
    case 'ex': return viewExercise(parts[1]);
    case 'corps': return viewBody();
    case 'reglages': return viewSettings();
    default: return viewHome();
  }
}
window.addEventListener('hashchange', () => { ui.active = undefined; render(); });
window.addEventListener('online', () => syncNow());
document.addEventListener('click', unlockAudio, { once: true });
db.sessions = migrateSessions(db.sessions); store(KEY, db); // renomme les anciennes fiches (Haut/Bas => Upper/Lower)
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
syncNow();
