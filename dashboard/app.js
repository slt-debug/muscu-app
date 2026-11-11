'use strict';
/* Dashboard Muscu (page web) : lecture et modification des données de l'appli iPhone, directement dans
   le dépôt GitHub privé de données (data.js), avec le même jeton que l'iPhone. */

// ---------- Fichiers partagés de la même version ----------
// Le cache du navigateur peut mêler un ancien fichier partagé (program.js…) à cet app.js récent : la page plante.
// On recharge alors une fois tous les fichiers en contournant le cache ; sinon, message plutôt que page blanche.
(() => {
  const ok = typeof rangeAt === 'function' && typeof perSetPlan === 'function' && typeof SET_MODES !== 'undefined'
    && typeof TEMPLATES !== 'undefined' && typeof mergeData === 'function' && typeof CATALOG !== 'undefined' && typeof LIBRARY !== 'undefined' && typeof checkAccess === 'function' && typeof pingUsage === 'function' && typeof adherenceWeek === 'function' && typeof kgForReps === 'function' && typeof isPerso === 'function' && typeof setVolume === 'function';
  const FLAG = 'muscu.dash.refetch';
  let tried = false;
  try { tried = sessionStorage.getItem(FLAG) === '1'; if (ok) sessionStorage.removeItem(FLAG); else sessionStorage.setItem(FLAG, '1'); } catch { /* stockage indisponible */ }
  if (ok) return;
  if (!tried) {
    const urls = [location.href.split('#')[0], ...[...document.scripts].map(s => s.src), ...[...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href)].filter(Boolean);
    Promise.all(urls.map(u => fetch(u, { cache: 'reload' }).catch(() => null))).then(() => location.reload());
  } else {
    document.getElementById('app').textContent = 'Mise à jour incomplète du dashboard : appuie sur Ctrl+F5 (ou Ctrl+Maj+R) pour recharger la page.';
  }
  throw new Error('Fichiers du dashboard de versions différentes');
})();

// ---------- Utilitaires ----------
const app = document.getElementById('app');
const statusEl = document.getElementById('status');
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
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
  return el;
}
function s(tag, props, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props || {})) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
function mount(...kids) { app.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false)); }
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = str => { const d = parseYmd(str); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };
const fmtDateLong = str => { const d = parseYmd(str); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtKg = n => (n == null || n === '' ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const e1rm = (kg, reps) => Math.round(kg * (1 + reps / 30) * 10) / 10;
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const weekStartOf = str => { const d = parseYmd(str); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };

// ---------- Versions du programme (programs.json dans le dépôt privé, écrit par ce dashboard) ----------
// progDoc = { versions: [{ id, label, from, days, sessions, appliedAt, changes }], draft }
// Sans fichier, le programme intégré (program.js) fait office de « Programme 1 ».
let progDoc = { versions: [], draft: null }, progOk = false;
const BUILTIN = { id: 'p1', label: 'Programme 1', from: null, days: PROGRAM.days, sessions: PROGRAM.sessions };
const clone = o => JSON.parse(JSON.stringify(o));
function versions() {
  if (progDoc.versions.length) return progDoc.versions.slice().sort((a, b) => a.from.localeCompare(b.from));
  const first = Object.values(data.sessions).filter(r => !r.deleted).map(r => r.date).sort()[0] || today();
  return [{ ...BUILTIN, from: first }];
}
function programFor(date) {
  const vs = versions();
  return vs.filter(v => v.from <= date).pop() || vs[0];
}
const EXERCISES = {};
function fillExercises() {
  for (const k of Object.keys(EXERCISES)) delete EXERCISES[k];
  for (const p of [BUILTIN, ...versions()]) for (const list of Object.values(p.sessions)) for (const ex of list) {
    EXERCISES[ex.id] = ex;
    if (ex.group) GROUP[ex.id] = ex.group;
  }
}
const GROUP = {
  dc: 'Pecs', inc: 'Pecs', incb: 'Pecs', fly: 'Pecs',
  row: 'Dos', tv: 'Dos',
  ohp: 'Épaules', lat: 'Épaules', rear: 'Épaules',
  curl: 'Bras', curlinc: 'Bras', tri: 'Bras', tri2: 'Bras', dips: 'Bras',
  sdt: 'Jambes', presse: 'Jambes', presse2: 'Jambes', fentes: 'Jambes', lcurl: 'Jambes', lext: 'Jambes', calf: 'Jambes', squat: 'Jambes', rdl: 'Jambes', hip: 'Jambes', abd: 'Jambes',
  abs: 'Abdos',
};
for (const c of CATALOG) GROUP[c.id] = GROUP[c.id] || c.group;
const GROUPS = ['Pecs', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Abdos'];
// Groupes proposés dans l'éditeur : « Cardio » s'y ajoute mais ne compte pas dans les séries par muscle.
const EDIT_GROUPS = [...GROUPS, 'Cardio'];
const PRIORITY = new Set(['Pecs', 'Bras', 'Jambes']);

// ---------- Données et enregistrement ----------
let data = { sessions: {}, body: {} };
let steps = {}; // pas par jour importés de Withings (activity.json) : { 'AAAA-MM-JJ': { pas } }
let reminderCfg = null; // rappel mensurations (reminders.json), réglé sur l'iPhone
// Objectifs et données suivies (goals.json), réglés sur l'iPhone ; état Withings (withings.json).
let goals = null, wStatus = null;
const stepGoal = () => goals?.pas || 10000;
// Origine du poids et des pas, même règle que l'iPhone : sans choix enregistré, Withings si la balance
// est connectée, sinon poids saisi à la main et pas non suivis.
const srcOf = k => goals?.sources?.[k] || (wStatus?.connected ? 'withings' : k === 'pas' ? 'off' : 'manuel');
const perWeek = prog => Object.values(prog.days || {}).filter(Boolean).length; // séances prévues par semaine
const srcBadge = k => srcOf(k) === 'manuel' ? h('span', { class: 'wb man' }, '✎ Manuel') : srcOf(k) === 'withings' ? h('span', { class: 'wb' }, '⚖ Withings') : null;
fillExercises();
let pending = { sessions: {}, body: {} };
let saving = false, saveTimer = null;

function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = 'chip ' + (cls || ''); }
// Les demandes de la page sont traitées dans le navigateur (data.js) ; les erreurs GitHub sont expliquées.
async function api(path, opt) {
  try { return await localApi(path, opt); } catch (e) { throw new Error(explainError(String(e.message || e))); }
}
const hasPending = () => Object.keys(pending.sessions).length + Object.keys(pending.body).length > 0;
function overlayPending() {
  for (const k of ['sessions', 'body']) for (const [id, rec] of Object.entries(pending[k])) {
    if (!data[k][id] || rec.updatedAt >= (data[k][id].updatedAt || 0)) data[k][id] = rec;
  }
}
// Accès réservé (access.js) : compte GitHub du jeton vérifié à chaque ouverture du dashboard.
let refusedLogin = null;
function viewRefused() {
  document.body.classList.add('logged-out');
  mount(h('div', { class: 'card login' },
    h('h2', {}, '🔒 Dashboard réservé'),
    h('p', { class: 'sub' }, 'Le compte GitHub ', h('b', {}, refusedLogin), ' n\'est pas sur la liste des personnes autorisées. Demande l\'accès à la personne qui t\'a donné l\'appli.'),
    h('button', { class: 'btn secondary', onclick: () => { refusedLogin = null; storeDcfg({ owner: dcfg.owner, repo: dcfg.repo }); acctBtn.hidden = true; viewLogin(); } }, 'Changer de compte')));
}
async function load() {
  setStatus('Chargement…');
  try {
    const acc = await checkAccess(dcfg.token).catch(() => null); // réseau en erreur : la lecture des données dira pourquoi
    if (acc && !acc.ok) { pingUsage('refus', 'Dashboard · ordinateur'); refusedLogin = acc.login; acctBtn.hidden = true; setStatus(''); return viewRefused(); }
    if (acc) pingUsage(`dashboard/${usageLabel(acc.hash)}`, `${(document.querySelector('script[src*="app.js?v="]')?.src.match(/v=(\w+)/) || [])[1] || ''} · ${deviceKind()}`);
    const [d, p, a, r, g, w] = await Promise.all([api('/api/data'), api('/api/programs').catch(() => null), api('/api/activity').catch(() => null), api('/api/reminders').catch(() => null),
      api('/api/goals').catch(() => null), api('/api/withings').catch(() => null)]);
    data = { sessions: d.sessions || {}, body: d.body || {} };
    goals = g; wStatus = w;
    steps = a?.days || {};
    reminderCfg = r?.mensurations || null;
    // Programme illisible : on affiche le reste, mais on interdit toute modification pour ne pas écraser les versions existantes.
    progOk = !!p;
    if (p) progDoc = { versions: p.versions || [], draft: p.draft || null };
    overlayPending();
    fillExercises();
    setStatus('À jour ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 'ok');
    if (hasPending()) flush();
  } catch (e) { setStatus('Erreur : ' + e.message, 'err'); }
  render();
}
function touch(kind, rec) {
  rec.updatedAt = Date.now();
  data[kind][rec.id] = rec;
  pending[kind][rec.id] = rec;
  setStatus('Modifié, enregistrement…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}
async function flush() {
  if (saving || !hasPending()) return;
  saving = true;
  const sent = pending; pending = { sessions: {}, body: {} };
  try {
    const merged = await api('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Muscu': '1' }, body: JSON.stringify(sent) });
    data = { sessions: merged.sessions, body: merged.body };
    overlayPending();
    setStatus('Enregistré ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 'ok');
  } catch (e) {
    for (const k of ['sessions', 'body']) for (const [id, rec] of Object.entries(sent[k])) {
      if (!pending[k][id] || rec.updatedAt > pending[k][id].updatedAt) pending[k][id] = rec;
    }
    setStatus('Échec de l\'enregistrement : ' + e.message + ' (Actualiser pour réessayer)', 'err');
  }
  saving = false;
  if (hasPending() && statusEl.className.includes('ok')) flush();
}
document.getElementById('refresh').addEventListener('click', async () => { await flush(); await load(); });
window.addEventListener('beforeunload', e => { if (hasPending() || saving) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Calculs ----------
const doneSets = e => (e?.sets || []).filter(x => x.done && x.reps > 0 && x.kg != null && x.kg >= 0);
const liveSessions = () => Object.values(data.sessions).filter(r => !r.deleted);
const liveBody = () => Object.values(data.body).filter(b => !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
const setsDone = rec => Object.values(rec.entries || {}).reduce((n, e) => n + doneSets(e).length, 0);
const volume = rec => Math.round(Object.values(rec.entries || {}).reduce((v, e) => v + doneSets(e).reduce((a, x) => a + setVolume(x), 0), 0));
// Chrono de séance, même règle que l'appli iPhone : rec.clock = { start, end, pauseMs, pausedAt } en ms.
// Sans fin enregistrée, la séance s'arrête à la dernière série validée (sauf séance du jour en cours depuis moins de 30 min).
function lastSetTime(rec) {
  let t = 0;
  for (const e of Object.values(rec?.entries || {})) for (const x of e.sets || []) if (x.done && x.t > t) t = x.t;
  return t;
}
function clockEnd(rec, now = Date.now()) {
  const c = rec.clock;
  if (c.end) return c.end;
  if (c.pausedAt) return c.pausedAt;
  const last = Math.max(c.start, lastSetTime(rec));
  return rec.date === today() && now - last < 30 * 60e3 ? now : last;
}
const duration = rec => rec?.clock?.start ? Math.max(0, clockEnd(rec) - rec.clock.start - (rec.clock.pauseMs || 0)) : null;
function fmtMin(ms) { const m = Math.round(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)}` : `${m} min`; }
const fmtHour = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
function history(exId) {
  return liveSessions().filter(r => r.entries?.[exId]).sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, sets: doneSets(r.entries[exId]), load: r.entries[exId].load || null })).filter(x => x.sets.length);
}
// Flèche de jugement de la charge (même rendu que l'appli iPhone) : une seule cochée à la fois, sans effet sur les charges proposées.
function loadIcon(kind, on, onclick) {
  const up = kind === 'up';
  const svg = s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: up ? 'M12 19V5M5.5 11.5 12 5l6.5 6.5' : 'M12 5v14M5.5 12.5 12 19l6.5-6.5' }));
  return h('button', { type: 'button', class: `lchip ${kind}${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': up ? 'Charge trop légère' : 'Charge trop lourde', onclick },
    svg, h('small', {}, up ? 'Léger' : 'Lourd'));
}
const loadTag = l => l === 'up' ? h('span', { class: 'tag up' }, '↑ Légère') : l === 'down' ? h('span', { class: 'tag down' }, '↓ Lourde') : '–';
function bestE1rm(sets) { const w = sets.filter(x => x.kg > 0); return w.length ? Math.max(...w.map(x => { const b = setBest(x); return e1rm(b.kg, b.reps); })) : null; }
function e1rmPoints(exId) {
  return history(exId).map(x => ({ t: parseYmd(x.date).getTime(), v: bestE1rm(x.sets), label: x.sets.map(z => setTxt(z, fmtKg)).join(' ') })).filter(p => p.v != null);
}
function movingAvg(pts) {
  return pts.map(p => { const win = pts.filter(q => q.t <= p.t && q.t > p.t - 7 * 864e5); return { t: p.t, v: Math.round(win.reduce((a, q) => a + q.v, 0) / win.length * 10) / 10 }; });
}

// ---------- Graphiques ----------
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
// opts.target : objectif tracé en pointillés (et inclus dans l'échelle).
function lineChart(series, unit, title, W = 560, H = 240, opts = {}) {
  const pts = series.flatMap(x => x.points);
  if (!pts.length) return h('div', { class: 'chart' }, title ? h('h3', {}, title) : null, h('div', { class: 'empty' }, 'Pas encore de données.'));
  const m = { l: 44, r: 16, t: 14, b: 28 };
  let x0 = Math.min(...pts.map(p => p.t)), x1 = Math.max(...pts.map(p => p.t));
  if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
  const vs = [...pts.map(p => p.v), ...(opts.target != null ? [opts.target] : [])];
  let y0 = Math.min(...vs), y1 = Math.max(...vs);
  const span = y1 - y0 || Math.max(1, y1 * 0.05); y0 -= span * 0.2; y1 += span * 0.2;
  const step = niceStep((y1 - y0) / 4), ticks = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title || 'Graphique' });
  for (const v of ticks) svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }), s('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmtKg(v)));
  svg.append(s('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
  if (opts.target != null) svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(opts.target), y2: Y(opts.target), stroke: 'var(--series-2)', 'stroke-dasharray': '6 4', 'stroke-width': 1.5 }),
    s('text', { class: 'target-l', x: W - m.r, y: Y(opts.target) - 5, 'text-anchor': 'end' }, `objectif ${fmtKg(opts.target)}`));
  const dates = [...new Set(pts.map(p => p.t))].sort((a, b) => a - b);
  const xt = dates.length <= 3 ? dates : [dates[0], dates[Math.floor(dates.length / 3)], dates[Math.floor(dates.length * 2 / 3)], dates[dates.length - 1]];
  xt.forEach((t, i) => svg.append(s('text', { x: X(t), y: H - 9, 'text-anchor': i === 0 && xt.length > 1 ? 'start' : i === xt.length - 1 && xt.length > 1 ? 'end' : 'middle' }, fmtDate(ymd(new Date(t))))));
  for (const ser of [...series].reverse()) {
    const sorted = [...ser.points].sort((a, b) => a.t - b.t);
    if (ser.line !== false && sorted.length > 1) svg.append(s('polyline', { class: 'line', style: ser.color ? `stroke:${ser.color}` : null, points: sorted.map(p => `${X(p.t)},${Y(p.v)}`).join(' ') }));
    for (const p of sorted) svg.append(s('circle', { class: 'dot' + (ser.raw ? ' raw' : ''), style: ser.color && !ser.raw ? `fill:${ser.color}` : null, cx: X(p.t), cy: Y(p.v), r: ser.raw ? 3 : 4 }));
  }
  const cross = s('line', { class: 'cross', y1: m.t, y2: H - m.b, visibility: 'hidden' });
  svg.append(cross);
  const tip = h('div', { class: 'tip', hidden: true });
  const wrap = h('div', { class: 'chart' }, title ? h('h3', {}, title) : null, svg, tip);
  const lead = series[0].points.length ? series[0].points : pts;
  svg.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * W;
    let best = lead[0]; for (const p of lead) if (Math.abs(X(p.t) - vx) < Math.abs(X(best.t) - vx)) best = p;
    cross.setAttribute('x1', X(best.t)); cross.setAttribute('x2', X(best.t)); cross.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.textContent = `${fmtDate(ymd(new Date(best.t)))} : ${fmtKg(best.v)} ${unit}${best.label ? ' (' + best.label + ')' : ''}`;
    const wr = wrap.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(X(best.t) / W * sr.width + (sr.left - wr.left), 80), wr.width - 80) + 'px';
    tip.style.top = (Y(best.v) / H * sr.height + (sr.top - wr.top)) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  if (series.length > 1) wrap.append(h('div', { class: 'legend' }, series.map(x => h('span', {}, h('i', { style: `background:${x.raw ? 'var(--muted)' : x.color || 'var(--series-1)'}` }), x.name))));
  return wrap;
}

// ---------- Vues ----------
function setTab(name) { document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === name)); }

function viewOverview() {
  setTab('overview');
  const sess = liveSessions().filter(r => setsDone(r) > 0).sort((a, b) => b.date.localeCompare(a.date));
  const ws = weekStartOf(today());
  const thisWeek = sess.filter(r => r.date >= ws).length;
  const fourWeeks = sess.filter(r => r.date >= ymd(new Date(Date.now() - 28 * 864e5))).length;
  // Séances prévues : jours d'entraînement du programme actif, sur chacune des 4 dernières semaines.
  const planned4 = [0, 1, 2, 3].reduce((n, i) => n + perWeek(programFor(ymd(new Date(Date.now() - 7 * i * 864e5)))), 0);
  const body = liveBody().filter(b => b.poids != null);
  const wPts = body.map(b => ({ t: parseYmd(b.date).getTime(), v: b.poids }));
  const avg = movingAvg(wPts);
  const lastAvg = avg[avg.length - 1];
  const weekAgo = avg.filter(p => p.t <= (lastAvg?.t || 0) - 7 * 864e5).pop();
  const delta = lastAvg && weekAgo ? Math.round((lastAvg.v - weekAgo.v) * 10) / 10 : null;
  // Pas : jours terminés seulement (le jour en cours est partiel jusqu'au soir).
  const stepDays = Object.keys(steps).filter(d => d < today()).sort();
  const last7 = stepDays.slice(-7).map(d => steps[d].pas), prev7 = stepDays.slice(-14, -7).map(d => steps[d].pas);
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const s7 = mean(last7), sPrev = mean(prev7);
  // Masse grasse : même lecture que le poids (moyenne 7 jours, la balance varie d'un jour à l'autre).
  const fPts = liveBody().filter(b => b.mg != null).map(b => ({ t: parseYmd(b.date).getTime(), v: b.mg }));
  const fAvg = movingAvg(fPts), lastF = fAvg[fAvg.length - 1];
  const fWeekAgo = fAvg.filter(p => p.t <= (lastF?.t || 0) - 7 * 864e5).pop();
  const fDelta = lastF && fWeekAgo ? Math.round((lastF.v - fWeekAgo.v) * 10) / 10 : null;
  const timed = sess.filter(r => r.clock?.start), last4 = timed.slice(0, 4), weekTimed = timed.filter(r => r.date >= ws);
  const durPts = timed.map(r => ({ t: parseYmd(r.date).getTime(), v: Math.round(duration(r) / 60e3), label: r.name }));

  // Séries par groupe et par semaine (8 dernières semaines).
  const weeks = []; { const d = parseYmd(ws); for (let i = 7; i >= 0; i--) { const w = new Date(d); w.setDate(w.getDate() - 7 * i); weeks.push(ymd(w)); } }
  const grid = Object.fromEntries(GROUPS.map(g => [g, Object.fromEntries(weeks.map(w => [w, 0]))]));
  for (const r of sess) {
    const w = weekStartOf(r.date); if (!weeks.includes(w)) continue;
    for (const [exId, e] of Object.entries(r.entries || {})) { const g = GROUP[exId]; if (grid[g]) grid[g][w] += doneSets(e).length; } // le cardio ne compte pas dans les séries par muscle
  }
  // Cible = séries prévues par semaine dans le programme actif le lundi de la semaine (un programme appliqué
  // en cours de semaine compte à partir de la suivante). Gris sous la cible, vert pile, orange au-delà.
  const wTarget = Object.fromEntries(weeks.map(w => [w, plannedSets(programFor(w))]));
  const progStart = weeks.map((w, i) => i > 0 && programFor(w).id !== programFor(weeks[i - 1]).id);
  // Lundi à partir duquel une version compte (le sien, ou le suivant si elle démarre en cours de semaine).
  const countsFrom = v => { const d = parseYmd(weekStartOf(v.from)); if (ymd(d) !== v.from) d.setDate(d.getDate() + 7); return ymd(d); };
  const Pnow = programFor(ws), tNow = plannedSets(Pnow);
  const next = versions().find(v => countsFrom(v) > ws), tNext = next ? plannedSets(next) : null;
  const sp = n => `série${n > 1 ? 's' : ''}`;
  const weekBar = (n, T) => {
    if (!T) return '';
    const grad = (wPct, base) => `background:linear-gradient(90deg,var(--h-lo2),var(--h-in));background-size:${base / wPct * 100}% 100%`;
    if (n > T) {
      const tw = T / n * 100;
      return [h('div', { class: 'wbar' }, h('span', { style: `width:${tw}%;${grad(tw, tw)}` }), h('span', { class: 'over', style: `left:${tw}%;width:${100 - tw}%` }), h('i', { style: `left:calc(${tw}% - 1px)` })),
        h('div', { class: 'wbl' }, h('b', {}, `${n} / ${T}`), ' · ', h('span', { class: 'plus' }, `+${n - T} au-delà de la cible`))];
    }
    const pct = n / T * 100;
    return [h('div', { class: 'wbar' }, n ? h('span', { class: pct >= 100 ? 'full' : '', style: `width:${pct}%;${grad(pct, 100)}` }) : null),
      h('div', { class: 'wbl' }, h('b', {}, `${n} / ${T}`), n === T ? ' · cible atteinte' : ` · reste ${T - n}`)];
  };
  const heat = h('table', { class: 'heat' },
    h('tr', {}, h('th', {}, 'Groupe'),
      weeks.map((w, i) => h('th', { class: 'num' + (progStart[i] ? ' pstart' : '') }, progStart[i] ? h('small', { class: 'plabel' }, programFor(w).label) : null, fmtDate(w), w === ws ? h('small', {}, ' (en cours)') : null)),
      h('th', { class: 'tg' }, 'Cible', h('br'), Pnow.label), h('th', {}, 'Semaine en cours')),
    GROUPS.map(g => h('tr', {}, h('td', {}, g + (PRIORITY.has(g) ? ' ★' : '')),
      weeks.map((w, i) => {
        const n = grid[g][w], T = wTarget[w][g] || 0;
        const zone = !n ? '' : !T ? 'neutral' : n > T ? 'hi' : n === T ? 'in' : 'lo';
        return h('td', { class: `cell ${zone}${w === ws ? ' now' : ''}${progStart[i] ? ' pstart' : ''}`, title: `${g}, semaine du ${fmtDate(w)} : ${n} ${sp(n)}${T ? ` sur ${T} prévues (${programFor(w).label})` : ', pas de cible'}` },
          n || '', n && T && n > T ? h('sup', {}, `+${n - T}`) : null);
      }),
      h('td', { class: 'tgt' }, tNow[g] ? [String(tNow[g]), h('small', {}, `${sp(tNow[g])} / sem.`)] : '–',
        tNext && (tNext[g] || 0) !== (tNow[g] || 0) ? h('small', { class: 'tnext' }, `${tNext[g] || 0} dès le ${fmtDate(countsFrom(next))}`) : null),
      h('td', { class: 'wcell' }, weekBar(grid[g][ws], tNow[g] || 0)))));

  mount(
    h('div', { class: 'tiles' },
      tile('Séances cette semaine', `${thisWeek}/${perWeek(Pnow)}`, `objectif ${perWeek(Pnow)} · ${Pnow.label}`),
      tile('Séances sur 4 semaines', String(fourWeeks), `sur ${planned4} prévues au programme`),
      tile('Poids (moyenne 7 jours)', lastAvg ? `${fmtKg(lastAvg.v)} kg` : '–', delta == null ? 'pas assez de pesées' : `${delta > 0 ? '+' : ''}${fmtKg(delta)} kg sur 7 jours`, delta == null ? '' : delta <= 0 ? 'up' : 'down'),
      tile('Masse grasse (moyenne 7 jours)', lastF ? `${fmtKg(lastF.v)} %` : '–', fDelta == null ? (fPts.length ? 'pas assez de mesures' : 'aucune mesure') : `${fDelta > 0 ? '+' : ''}${fmtKg(fDelta)} point${Math.abs(fDelta) >= 2 ? 's' : ''} sur 7 jours`, fDelta == null ? '' : fDelta <= 0 ? 'up' : 'down'),
      tile('Dernière séance', sess[0] ? sess[0].name : '–', sess[0] ? `${fmtDate(sess[0].date)}, ${setsDone(sess[0])} séries` : 'aucune donnée'),
      tile('Durée moyenne', last4.length ? fmtMin(last4.reduce((a, r) => a + duration(r), 0) / last4.length) : '–', last4.length ? `${last4.length} dernière${last4.length > 1 ? 's' : ''} séance${last4.length > 1 ? 's' : ''} chronométrée${last4.length > 1 ? 's' : ''}` : 'pas encore de séance chronométrée'),
      tile('Temps cette semaine', weekTimed.length ? fmtMin(weekTimed.reduce((a, r) => a + duration(r), 0)) : '–', `${weekTimed.length} séance${weekTimed.length > 1 ? 's' : ''} chronométrée${weekTimed.length > 1 ? 's' : ''}`),
      // Pas non suivis (Données suivies sur l'iPhone) : ni tuile ni graphique, 7 tuiles.
      srcOf('pas') === 'off' ? null : tile(['Pas (moyenne 7 jours) ', srcBadge('pas')], s7 != null ? fmtInt(s7) : '–', s7 != null ? `objectif ${fmtInt(stepGoal())} · ${last7.filter(x => x >= stepGoal()).length}/${last7.length} jour${last7.length > 1 ? 's' : ''} atteint${last7.length > 1 ? 's' : ''}` : srcOf('pas') === 'manuel' ? 'aucun pas saisi' : 'aucun pas importé', s7 == null ? '' : s7 >= stepGoal() ? 'up' : '')),
    h('h2', {}, 'Séries par groupe musculaire et par semaine'),
    h('div', { class: 'card' }, h('div', { style: 'overflow-x:auto' }, heat),
      h('div', { class: 'hlegend' }, [['lo2', 'cible pas encore atteinte'], ['in', 'cible atteinte'], ['hi', 'au-delà de la cible (+n dans la case)']].map(([c, l]) => h('span', {}, h('i', { style: `background:var(--h-${c})` }), l)),
        h('span', {}, h('i', { style: 'background:linear-gradient(90deg,var(--h-lo2),var(--h-in))' }), 'progression de la semaine'),
        h('span', {}, h('i', { style: 'background:transparent;box-shadow:inset 0 0 0 2px var(--ink-2)' }), 'semaine en cours')),
      h('p', { class: 'sub' }, '★ = zones prioritaires (pecs, bras, jambes). Chaque semaine est comparée au programme actif son lundi ; un trait bleu marque un changement de programme. Une série compte quand elle est validée dans l\'appli.')),
    h('h2', {}, 'Poids et masse grasse'),
    h('div', { class: 'grid2' },
      lineChart([{ name: 'Moyenne 7 jours', points: avg }, { name: 'Pesée', points: wPts, raw: true, line: false }], 'kg', 'Poids', 540, 240),
      lineChart([{ name: 'Moyenne 7 jours', points: fAvg, color: 'var(--series-2)' }, { name: 'Mesure de la balance', points: fPts, raw: true, line: false }], '%', 'Masse grasse', 540, 240)),
    srcOf('pas') === 'off' ? null : [
      h('h2', {}, 'Pas par jour'),
      stepsChart(),
      s7 != null ? h('p', { class: 'sub' }, `Moyenne 7 jours : ${fmtInt(s7)} pas${sPrev != null ? ` (${s7 >= sPrev ? '+' : '−'}${fmtInt(Math.abs(s7 - sPrev))} par rapport aux 7 jours précédents)` : ''} · objectif atteint ${(k => `${k} jour${k > 1 ? 's' : ''}`)(stepDays.filter(d => steps[d].pas >= stepGoal()).length)} sur ${stepDays.length}.`) : null],
    h('h2', {}, 'Durée des séances'),
    lineChart([{ name: 'Durée', points: durPts }], 'min', null, 1100, 220),
    h('p', { class: 'sub' }, 'Repère : séances de 45 min à 1 h. Les séances non chronométrées (avant la version 19 de l\'appli) n\'apparaissent pas.'),
    h('h2', {}, '1RM estimé, mouvements principaux'),
    h('div', { class: 'grid2' }, [['dc', 'Développé couché'], ['sdt', 'Soulevé de terre'], ['squat', 'Squat'], ['row', 'Rowing barre penchée']].map(([id, t]) => lineChart([{ name: t, points: e1rmPoints(id) }], 'kg', t, 540, 230))));
}
const fmtInt = n => Math.round(n).toLocaleString('fr-FR');
// Pas des 28 derniers jours : barre grise sous l'objectif, verte au-dessus, hachurée pour le jour en cours ;
// courbe = moyenne sur 7 jours (jours terminés), pointillé = objectif.
function stepsChart() {
  const W = 1100, H = 260, m = { l: 52, r: 12, t: 14, b: 28 }, N = 28;
  const days = []; { const d = parseYmd(today()); d.setDate(d.getDate() - (N - 1)); for (let i = 0; i < N; i++) { days.push(ymd(d)); d.setDate(d.getDate() + 1); } }
  if (!days.some(d => steps[d])) return h('div', { class: 'card chart' }, h('div', { class: 'empty' }, srcOf('pas') === 'manuel'
    ? 'Aucun pas saisi sur les 4 dernières semaines (carte Pas de la page Séance, sur l\'iPhone).' : 'Pas encore de pas importés (Withings, onglet Corps).'));
  const max = Math.max(stepGoal() * 1.2, ...days.map(d => steps[d]?.pas || 0)), step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step, slot = (W - m.l - m.r) / N, bw = Math.max(4, slot - 6);
  const X = i => m.l + (i + 0.5) * slot, Y = v => H - m.b - v / top * (H - m.t - m.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Pas par jour' },
    s('defs', {}, s('pattern', { id: 'stepToday', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 6, height: 6, fill: 'var(--field)' }), s('rect', { width: 3, height: 6, fill: 'var(--h-lo2)' }))));
  for (let v = 0; v <= top + 1e-9; v += step) svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }), s('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmtInt(v)));
  days.forEach((d, i) => {
    const v = steps[d]?.pas; if (v == null) return;
    const isToday = d === today();
    svg.append(s('rect', { x: X(i) - bw / 2, y: Y(v), width: bw, height: Y(0) - Y(v), rx: 3, fill: isToday ? 'url(#stepToday)' : v >= stepGoal() ? 'var(--h-in)' : 'var(--h-lo2)' },
      s('title', {}, `${fmtDate(d)} : ${fmtInt(v)} pas${isToday ? ' (en cours)' : v >= stepGoal() ? ' · objectif atteint' : ''}`)));
  });
  svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(stepGoal()), y2: Y(stepGoal()), stroke: 'var(--series-2)', 'stroke-dasharray': '6 4', 'stroke-width': 1.5 }));
  const done = days.map((d, i) => [d, i]).filter(([d]) => d < today() && steps[d]);
  const avgPts = done.map(([d, i]) => { const win = done.filter(([e]) => e <= d && e > ymd(new Date(parseYmd(d).getTime() - 7 * 864e5))); return `${X(i)},${Y(win.reduce((a, [e]) => a + steps[e].pas, 0) / win.length)}`; });
  if (avgPts.length > 1) svg.append(s('polyline', { class: 'line', points: avgPts.join(' ') }));
  [0, 7, 14, 21, N - 1].forEach(i => svg.append(s('text', { x: X(i), y: H - 9, 'text-anchor': 'middle' }, i === N - 1 ? 'aujourd\'hui' : fmtDate(days[i]))));
  return h('div', { class: 'card chart' }, svg,
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--h-lo2)' }), 'sous l\'objectif'), h('span', {}, h('i', { style: 'background:var(--h-in)' }), 'objectif atteint'),
      h('span', {}, h('i', { style: 'background:var(--series-1)' }), 'moyenne 7 jours'), h('span', {}, h('i', { style: 'background:transparent;border-top:2px dashed var(--series-2);border-radius:0;height:0' }), `objectif ${fmtInt(stepGoal())}`)));
}
function tile(label, value, sub, cls) { return h('div', { class: 'card' }, h('div', { class: 'sub' }, label), h('div', { class: 'big ' + (cls || '') }, value), h('div', { class: 'sub' }, sub)); }

// ---------- Objectifs ----------
// Même lecture que la page Objectifs de l'iPhone (mêmes calculs, mêmes couleurs) : poids vers la cible,
// adhérence au programme et pas, sur 8 semaines. Onglet ouvert au lancement.
// Score d'adhérence d'une semaine et liste des écarts : calcul commun avec l'iPhone (adherenceWeek, program.js).
// Définition d'un exercice (remplaçant compris), pour juger ses séries sur la fourchette affichée en séance.
const exDef = id => EXERCISES[id] || CATALOG.find(c => c.id === id);
const adherence = (ws, upTo) => adherenceWeek(data.sessions, programFor, ws, upTo, today(), exDef);
const ADH_GOAL = 85;
const adhColor = v => v == null ? 'var(--ink-2)' : v >= 85 ? 'var(--good)' : v >= 60 ? 'var(--warn)' : 'var(--bad)';
const fmtK = n => `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')}k`;
const PERIODS = [['1m', '1 mois', 30], ['3m', '3 mois', 91], ['6m', '6 mois', 182], ['1a', '1 an', 365], ['all', 'Tout', null]];
let objPeriod = '3m';
// Moyenne des valeurs sur les 7 jours qui finissent à t (points {t, v}).
const avg7 = (pts, t) => { const w = pts.filter(p => p.t <= t && p.t > t - 7 * 864e5); return w.length ? w.reduce((a, p) => a + p.v, 0) / w.length : null; };
// Numéro de semaine ISO 8601 d'une date 'AAAA-MM-JJ'.
function isoWeek(d) {
  const x = parseYmd(d); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7);
  const jan4 = new Date(x.getFullYear(), 0, 4);
  return 1 + Math.round(((x - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
}
const last8Weeks = () => Array.from({ length: 8 }, (_, i) => addDays(weekStartOf(today()), -7 * (7 - i)));
// Barres hebdomadaires : vert à l'objectif, gris dessous, semaine en cours hachurée avec son chiffre.
function weekBars(weeks, vals, goal, max, fmt) {
  return [h('div', { class: 'wkbars', 'aria-hidden': 'true' }, weeks.map((w, i) => vals[i] == null ? h('div', { class: 'col empty' }, h('span'))
    : h('div', { class: 'col' + (vals[i] >= goal ? ' ok' : '') + (i === 7 ? ' now' : ''), title: `Semaine ${isoWeek(w)} : ${fmt(vals[i])}` },
      i === 7 ? h('b', {}, fmt(vals[i])) : null, h('span', { style: `height:${Math.max(3, vals[i] / max * 78)}%` }))),
    h('i', { style: `bottom:${goal / max * 78}%` })),
  h('div', { class: 'wkdays' }, weeks.map((w, i) => h('span', { class: i === 7 ? 'cur' : '' }, String(isoWeek(w)))))];
}
// Réglages modifiables sur place (objectifs, sources, rappel) : mêmes fichiers que l'iPhone (goals.json,
// reminders.json), donc visibles de l'autre côté à la synchronisation suivante.
let editing = null, editMsg = ''; // 'poids' | 'pas' | 'rappel' : formulaire déplié
const editLink = (key, label, redraw) => h('button', { class: 'edit-link', 'aria-expanded': String(editing === key), onclick: () => { editing = editing === key ? null : key; editMsg = ''; redraw(); } }, editing === key ? '✕ Fermer' : `✎ ${label}`);
const segBtns = (opts, cur, onPick) => h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { type: 'button', class: v === cur ? 'on' : '', onclick: () => v !== cur && onPick(v) }, t)));
async function saveGoals(patch, redraw) {
  editMsg = 'Enregistrement…'; redraw();
  try { goals = await wpost('/api/goals', patch); editMsg = 'Enregistré. L\'iPhone le prendra à sa prochaine synchronisation.'; }
  catch (e) { editMsg = `Échec : ${e.message}`; }
  redraw();
}
const setSource = (k, v) => saveGoals({ sources: { poids: srcOf('poids'), pas: srcOf('pas'), [k]: v } }, viewGoals);
function weightEditForm() {
  const iP = h('input', { class: 'n', inputmode: 'decimal', value: goals?.poids != null ? fmtKg(goals.poids) : '', placeholder: 'ex. 85' });
  const firstBody = liveBody()[0]?.date;
  const iD = h('input', { type: 'date', value: goals?.depart || firstBody || today() });
  return h('div', { class: 'editbox' },
    h('div', { class: 'row' }, h('label', { class: 'row' }, h('span', { class: 'sub' }, 'Poids cible (kg)'), iP), h('label', { class: 'row' }, h('span', { class: 'sub' }, 'Point de départ'), iD),
      h('button', { class: 'btn small', onclick: () => saveGoals({ poids: num(iP.value), depart: iD.value || null }, viewGoals) }, 'Enregistrer')),
    h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Source du poids'), segBtns([['withings', '⚖ Balance Withings'], ['manuel', '✎ Saisie manuelle']], srcOf('poids'), v => setSource('poids', v))),
    h('div', { class: 'sub' }, editMsg || 'Le point de départ sert à calculer la part du chemin faite vers le poids cible. Laisser le poids cible vide pour ne pas afficher d\'objectif.'));
}
function stepsEditForm() {
  const iS = h('input', { class: 'n', inputmode: 'numeric', value: fmtInt(stepGoal()) });
  return h('div', { class: 'editbox' },
    h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Source des pas'), segBtns([['withings', '⚖ Withings'], ['manuel', '✎ Manuel'], ['off', 'Non suivis']], srcOf('pas'), v => setSource('pas', v))),
    srcOf('pas') !== 'off' ? h('div', { class: 'row' }, h('label', { class: 'row' }, h('span', { class: 'sub' }, 'Objectif (pas / jour)'), iS),
      h('button', { class: 'btn small', onclick: () => { const n = num(iS.value.replace(/\s/g, '')); saveGoals({ pas: n ? Math.round(n) : null }, viewGoals); } }, 'Enregistrer')) : null,
    h('div', { class: 'sub' }, editMsg || { withings: 'Importés de Withings par l\'iPhone.', manuel: 'Saisis sur l\'iPhone, dans la carte Pas de la page Séance.', off: 'Les cartes et graphiques de pas disparaissent.' }[srcOf('pas')]));
}
function weightGoalCard(W) {
  const pts = liveBody().filter(b => b.poids != null).map(b => ({ t: parseYmd(b.date).getTime(), v: b.poids }));
  const target = goals?.poids ?? null;
  const head = [h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Poids ', srcBadge('poids')),
    h('span', { class: 'row' }, h('span', { class: 'sub' }, target != null ? `objectif ${fmtKg(target)} kg` : 'pas d\'objectif'), editLink('poids', 'Modifier l\'objectif', viewGoals))),
    editing === 'poids' ? weightEditForm() : null];
  const last = pts[pts.length - 1];
  if (!last) return h('div', { class: 'card goal wide' }, head, h('p', { class: 'sub' }, 'Pas encore de pesée.'));
  const cur = avg7(pts, last.t), ago = avg7(pts, last.t - 28 * 864e5);
  const depart = goals?.depart || ymd(new Date(pts[0].t));
  const start = (pts.find(p => p.t >= parseYmd(depart).getTime()) || pts[0]).v;
  const part = target != null && start !== target ? Math.max(0, Math.min(100, Math.round((start - cur) / (start - target) * 100))) : null;
  const per = (PERIODS.find(p => p[0] === objPeriod) || PERIODS[1])[2];
  const shown = per ? pts.filter(p => p.t > Date.now() - per * 864e5) : pts;
  const avgPts = shown.map(p => ({ t: p.t, v: Math.round(avg7(pts, p.t) * 10) / 10 }));
  const r1 = v => Math.round(v * 10) / 10;
  return h('div', { class: 'card goal wide' }, head,
    h('div', { class: 'row', style: 'align-items:baseline;gap:12px' }, h('div', { class: 'big' }, `${fmtKg(r1(cur))} kg`),
      h('span', { class: 'sub' }, `moyenne 7 jours${ago != null ? ` · ${cur - ago > 0 ? '+' : ''}${fmtKg(r1(cur - ago))} kg en 4 semaines` : ''}`)),
    part != null ? [h('div', { class: 'gtrack' }, h('i', { style: `width:${part}%` })),
      h('div', { class: 'sub' }, `${part} % du chemin depuis ${fmtKg(start)} kg · encore ${fmtKg(r1(Math.abs(cur - target)))} kg`)] : null,
    shown.length ? lineChart([{ name: 'Moyenne 7 jours', points: avgPts }, { name: 'Pesée', points: shown, raw: true, line: false }], 'kg', null, W, W > 600 ? 250 : 280, { target })
      : h('p', { class: 'sub' }, 'Aucune pesée sur cette période.'),
    h('div', { class: 'pills' }, PERIODS.map(([k, t]) => h('button', { type: 'button', class: objPeriod === k ? 'on' : '', onclick: () => { objPeriod = k; viewGoals(); } }, t))));
}
function adherenceGoalCard() {
  const firsts = [...versions().map(v => v.from), ...liveSessions().filter(r => setsDone(r) > 0).map(r => r.date)].filter(Boolean).sort();
  const weeks = last8Weeks();
  const scores = weeks.map((ws, i) => !firsts.length || addDays(ws, 6) < firsts[0] ? null : adherence(ws, i === 7 ? today() : addDays(ws, 6)).score);
  const cur = scores[7], a = adherence(weeks[7], today());
  const line = (name, v, txt) => [h('span', {}, h('b', {}, name), ' · ', h('span', { class: 'sub' }, txt)), h('b', { style: `color:${adhColor(v)};text-align:right` }, v == null ? '–' : `${v} %`)];
  return h('div', { class: 'card goal' },
    h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Adhérence au programme'),
      cur == null ? h('span', { class: 'sub' }, 'rien de prévu') : h('span', { class: cur >= ADH_GOAL ? 'up' : 'sub' }, cur >= ADH_GOAL ? `✓ objectif ${ADH_GOAL} %` : `${ADH_GOAL - cur} pt sous ${ADH_GOAL} %`)),
    h('div', { class: 'big' }, cur != null ? `${cur} %` : '–'),
    weekBars(weeks, scores, ADH_GOAL, 100, v => String(v)),
    // Détail de la semaine en cours, toujours affiché sur PC.
    h('div', { class: 'crit' },
      line('Séries', a.series, a.planned ? `${a.done} sur ${a.planned} prévues à date` : 'rien de prévu pour l\'instant'),
      line('Jours', a.jours, a.nRecs ? `${a.onDay} séance${a.onDay > 1 ? 's' : ''} sur ${a.nRecs} au jour prévu (± 1 jour)` : 'aucune séance faite'),
      line('Reps', a.reps, a.ranged ? `${a.inRange} série${a.inRange > 1 ? 's' : ''} sur ${a.ranged} pas sous la fourchette` : 'aucune série validée')),
    h('a', { class: 'linkbtn', href: '#/ecarts' }, (n => n ? `Voir les écarts (${n} sur 8 semaines) ›` : 'Aucun écart sur 8 semaines ›')(allGaps().length)),
    h('p', { class: 'sub' }, 'Score = moyenne des trois critères à date. Vert à partir de 85 %, orange de 60 à 84 %, rouge en dessous.'));
}
// Écarts au programme des 8 dernières semaines (adherenceWeek, program.js), filtrables, du plus récent au plus ancien.
// Comme la carte Adhérence : rien avant le premier programme daté ou la première séance.
function allGaps() {
  const first = [...versions().map(v => v.from), ...liveSessions().filter(r => setsDone(r) > 0).map(r => r.date)].filter(Boolean).sort()[0];
  if (!first) return [];
  return last8Weeks().filter(ws => addDays(ws, 6) >= first)
    .flatMap(ws => adherence(ws, addDays(ws, 6) > today() ? today() : addDays(ws, 6)).gaps.filter(g => g.date >= first))
    .sort((a, b) => b.date.localeCompare(a.date));
}
const GAP_FILTERS = { tous: ['Tous', () => true], lo: ['Reps en dessous', g => g.type === 'reps' && g.dir < 0], hi: ['Reps au-dessus', g => g.type === 'reps' && g.dir > 0],
  series: ['Séries non faites', g => g.type === 'series' || g.type === 'seance'], jour: ['Jour décalé', g => g.type === 'jour'] };
let gapFilter = 'tous';
function viewGaps() {
  setTab('goals');
  const gaps = allGaps(), shown = gaps.filter(GAP_FILTERS[gapFilter][1]);
  const day = d => `${JOURS[parseYmd(d).getDay()].slice(0, 3)}. ${fmtDate(d)}`;
  const row = g => {
    const reps = g.sets && [...new Set(g.sets.map(x => x.reps))].join(', '), kgs = g.sets && [...new Set(g.sets.map(x => fmtKg(x.kg)))];
    const cells = g.type === 'reps'
      ? [g.exName, h('span', { class: g.dir < 0 ? 'gap-lo' : 'gap-hi' }, g.dir < 0 ? '↓ reps' : '↑ reps'), `${g.sets.length} × ${reps}${kgs.length === 1 ? ` à ${kgs[0]} kg` : ''}`,
        [...new Set(g.sets.map(x => rangeTxt(x.range)))].join(' / '), g.dir < 0 ? 'baisse le critère Reps' : 'aucun']
      : g.type === 'series' ? [g.exName, 'séries non faites', `${g.done} série${g.done > 1 ? 's' : ''}`, `${g.of}`, 'baisse le critère Séries']
      : g.type === 'seance' ? ['–', 'séance non faite', '–', `prévue ${day(g.date)}`, 'baisse le critère Séries']
      : ['–', 'jour décalé', `faite ${day(g.date)}`, g.plannedDate ? day(g.plannedDate) : 'hors des jours prévus', 'baisse le critère Jours'];
    const id = `${g.date}_${g.name}`, link = g.type !== 'seance' && data.sessions[id];
    return h('tr', { class: link ? 'click' : '', onclick: link ? () => { location.hash = '#/seances/' + encodeURIComponent(id); } : null },
      h('td', {}, day(g.date)), h('td', {}, g.name), cells.map(c => h('td', {}, c)));
  };
  mount(
    h('a', { class: 'back', href: '#/' }, '‹ Objectifs'),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Écarts au programme · 8 dernières semaines'),
        h('span', { class: 'sub' }, `${new Set(gaps.map(g => `${g.date}_${g.name}`)).size} séance(s) concernée(s)`)),
      h('div', { class: 'pfilters' }, Object.entries(GAP_FILTERS).map(([k, [label]]) => h('button', { class: 'pill' + (gapFilter === k ? ' on' : ''), onclick: () => { gapFilter = k; viewGaps(); } }, label))),
      shown.length ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 'ptable' },
        h('tr', {}, ['Date', 'Séance', 'Exercice', 'Écart', 'Fait', 'Prévu', 'Effet sur le score'].map(t => h('th', {}, t))),
        shown.map(row))) : h('p', { class: 'sub' }, 'Aucun écart de ce type.'),
      h('p', { class: 'sub' }, 'Une série au-dessus de sa fourchette est signalée mais ne baisse pas le score : la charge montera à la prochaine séance. Clic sur une ligne : la séance, séries hors fourchette marquées.')));
}
function stepsGoalCard() {
  const goal = stepGoal(), weeks = last8Weeks();
  const avgOf = ws => { const v = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter(d => d < today() && steps[d]).map(d => steps[d].pas); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const avgs = weeks.map(avgOf), cur = avgs[7];
  const max = Math.max(goal * 1.25, ...avgs.map(v => v || 0));
  return h('div', { class: 'card goal' },
    h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Pas · moyenne par jour ', srcBadge('pas')),
      h('span', { class: 'row' }, h('span', { class: 'sub' }, `objectif ${fmtInt(goal)}`), editLink('pas', 'Objectif et source', viewGoals))),
    editing === 'pas' ? stepsEditForm() : null,
    h('div', { class: 'row', style: 'align-items:baseline;gap:12px' }, h('div', { class: 'big' }, cur != null ? fmtInt(cur) : '–'),
      cur == null ? h('span', { class: 'sub' }, 'aucun jour terminé cette semaine') : h('span', { class: cur >= goal ? 'up' : 'sub' }, cur >= goal ? '✓ objectif' : `${fmtInt(goal - cur)} sous l'objectif`)),
    weekBars(weeks, avgs, goal, max, fmtK),
    h('p', { class: 'sub' }, 'Moyenne des jours terminés de chaque semaine ; la semaine en cours est hachurée.'));
}
// Force estimée par groupe, semaine par semaine (12 dernières), même calcul que l'iPhone : pour chaque exercice,
// meilleur 1RM estimé de la semaine rapporté à sa toute première semaine (= 100). Indice d'un groupe = moyenne de
// ses exercices déjà commencés, la dernière valeur connue étant reportée les semaines où l'exercice n'est pas fait.
let strengthOpen = null; // groupe dont les exercices sont dépliés
function strengthGoalCard() {
  // Exercices des programmes (comme l'iPhone) : un remplaçant ponctuel ne compte pas.
  const exs = Object.keys(EXERCISES).map(id => {
    const byWeek = {};
    for (const x of history(id)) { const v = bestE1rm(x.sets), w = weekStartOf(x.date); if (v != null && (byWeek[w] == null || v > byWeek[w])) byWeek[w] = v; }
    const ws = Object.keys(byWeek).sort();
    return ws.length ? { id, grp: GROUP[id] || 'Autres', byWeek, ws, base: byWeek[ws[0]] } : null;
  }).filter(e => e && e.grp !== 'Cardio');
  if (!exs.length) return null;
  const weeks = []; for (let w = exs.map(e => e.ws[0]).sort()[0]; w <= weekStartOf(today()); w = addDays(w, 7)) weeks.push(w);
  const shown = weeks.slice(-12);
  const idxAt = (e, w) => { const k = e.ws.filter(x => x <= w).pop(); return k ? e.byWeek[k] / e.base * 100 : null; };
  const series = [...GROUPS, 'Autres'].map(g => {
    const mine = exs.filter(e => e.grp === g);
    if (!mine.length) return null;
    const pts = shown.map(w => { const v = mine.map(e => idxAt(e, w)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
    return pts.some(v => v != null) ? { g, pts, mine } : null;
  }).filter(Boolean);
  const all = series.flatMap(x => x.pts).filter(v => v != null).concat([100]);
  const lo = Math.min(...all) - 1, hi = Math.max(...all) + 1;
  const W = 300, H = 34, X = i => shown.length > 1 ? 4 + i / (shown.length - 1) * (W - 8) : W / 2, Y = v => H - 4 - (v - lo) / (hi - lo) * (H - 8);
  const gain = v => { const g = Math.round(v - 100); return `${g > 0 ? '+' : ''}${g} %`; };
  const name = id => (EXERCISES[id] || CATALOG.find(c => c.id === id))?.name || id;
  return h('div', { class: 'card goal' },
    h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Force estimée par groupe'), h('span', { class: 'sub' }, `indice 100 = première semaine · ${shown.length} semaine${shown.length > 1 ? 's' : ''}`)),
    series.map(({ g, pts, mine }) => {
      const p = pts.map((v, i) => v == null ? null : [i, v]).filter(Boolean), lastV = p[p.length - 1][1];
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-label': `${g} : ${gain(lastV)} en ${shown.length} semaines` },
        s('line', { x1: 0, x2: W, y1: Y(100), y2: Y(100), stroke: 'var(--grid)', 'stroke-dasharray': '3 3' }),
        s('polyline', { fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', points: p.map(([i, v]) => `${X(i)},${Y(v)}`).join(' ') }),
        // Zones de survol invisibles : indice de chaque semaine.
        p.map(([i, v]) => s('rect', { x: X(i) - W / shown.length / 2, y: 0, width: W / shown.length, height: H, fill: 'transparent' }, s('title', {}, `Semaine ${isoWeek(shown[i])} : indice ${Math.round(v)}`))));
      const open = strengthOpen === g;
      return [h('button', { class: 'grp', 'aria-expanded': String(open), onclick: () => { strengthOpen = open ? null : g; viewGoals(); } },
        h('span', {}, open ? '▾ ' : '▸ ', g), svg, h('b', { class: lastV >= 100 ? 'up' : 'down' }, gain(lastV))),
        open ? h('div', { class: 'grp-ex' }, mine.map(e => ({ e, v: idxAt(e, shown[shown.length - 1]) })).sort((a, b) => b.v - a.v)
          .map(({ e, v }) => [h('span', {}, gdot(e.id), name(e.id)), h('span', { class: 'sub' }, `${fmtKg(Math.round(e.base * 10) / 10)} → ${fmtKg(Math.round(e.byWeek[e.ws[e.ws.length - 1]] * 10) / 10)} kg`), h('b', { class: v >= 100 ? 'up' : 'down' }, gain(v))])) : null];
    }),
    h('p', { class: 'sub' }, 'Survole une courbe pour lire l\'indice d\'une semaine ; clique sur un groupe pour voir ses exercices (1RM estimé, formule d\'Epley).'));
}
function viewGoals() {
  setTab('goals');
  const showSteps = srcOf('pas') !== 'off', strength = strengthGoalCard();
  mount(
    // 1re ligne, même ordre que l'iPhone : pas puis adhérence (adhérence seule en pleine largeur si pas non suivis).
    h('div', { class: showSteps ? 'grid2 goals2' : 'goals1', style: 'margin-bottom:14px' }, showSteps ? stepsGoalCard() : null, adherenceGoalCard()),
    // Pas non suivis : la carte disparaît, ce lien permet de les réactiver.
    showSteps ? null : h('div', { class: 'card', style: 'margin-bottom:14px' }, h('div', { class: 'row between' }, h('span', { class: 'sub' }, 'Pas non suivis'), editLink('pas', 'Suivre les pas', viewGoals)),
      editing === 'pas' ? stepsEditForm() : null),
    // Poids et force côte à côte (poids seul en pleine largeur tant qu'aucune série n'est validée).
    strength ? h('div', { class: 'grid2 goals2' }, weightGoalCard(560), strength) : weightGoalCard(1100));
}

function sessionTable(list) {
  if (!list.length) return h('div', { class: 'card empty' }, 'Aucune séance enregistrée pour l\'instant.');
  return h('div', { class: 'card' }, h('table', {},
    h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Séance'), h('th', { class: 'num' }, 'Séries'), h('th', { class: 'num' }, 'Volume (kg)'), h('th', { class: 'num' }, 'Durée'), h('th', {}, 'Horaires'), h('th', {}, 'Commentaires')),
    list.map(r => {
      const nc = Object.values(r.entries || {}).filter(e => e.comment?.trim()).length;
      return h('tr', { class: 'click', onclick: () => { location.hash = '#/seances/' + encodeURIComponent(r.id); } },
        h('td', {}, cap(fmtDateLong(r.date))), h('td', {}, r.name), h('td', { class: 'num' }, setsDone(r)), h('td', { class: 'num' }, volume(r).toLocaleString('fr-FR')),
        h('td', { class: 'num' }, r.clock?.start ? fmtMin(duration(r)) : '–'),
        h('td', { class: 'sub' }, r.clock?.start ? `${fmtHour(r.clock.start)} → ${fmtHour(clockEnd(r))}` : ''),
        h('td', { class: 'sub' }, nc ? `💬 ${nc} commentaire${nc > 1 ? 's' : ''}` : ''));
    })));
}

function viewSessions() {
  setTab('sessions');
  const all = liveSessions().sort((a, b) => b.date.localeCompare(a.date));
  const fDate = h('input', { type: 'date', value: today() });
  const fName = h('select', {}, [...new Set(versions().flatMap(v => Object.keys(v.sessions)).reverse())].map(n => h('option', { value: n }, n)));
  const add = h('button', { class: 'btn', onclick: () => {
    if (!fDate.value) return;
    const id = `${fDate.value}_${fName.value}`;
    const rec = data.sessions[id] ? { ...data.sessions[id], deleted: false } : { id, date: fDate.value, name: fName.value, entries: {} };
    touch('sessions', rec);
    location.hash = '#/seances/' + encodeURIComponent(id);
  } }, 'Créer / ouvrir');
  mount(
    h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Séances'),
      h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Ajouter une séance oubliée :'), fDate, fName, add)),
    h('div', { style: 'height:12px' }), sessionTable(all));
}

function viewSessionEdit(id) {
  setTab('sessions');
  const rec = data.sessions[id];
  if (!rec || rec.deleted) { location.hash = '#/seances'; return; }
  // Un remplaçant choisi sur l'iPhone (rec.swaps = { prévu: remplaçant }) prend la place de l'exercice prévu.
  const swaps = rec.swaps || {}, swappedFrom = Object.fromEntries(Object.entries(swaps).map(([a, b]) => [b, a]));
  const programIds = (programFor(rec.date).sessions[rec.name] || []).flatMap(e => swaps[e.id] ? [e.id, swaps[e.id]] : [e.id]);
  const ids = [...programIds.filter(x => rec.entries[x]), ...Object.keys(rec.entries).filter(x => !programIds.includes(x))];
  const exName = x => (EXERCISES[x] || CATALOG.find(c => c.id === x))?.name || x;
  const save = () => touch('sessions', rec);
  const redraw = () => viewSessionEdit(id);
  const blocks = ids.map(exId => {
    const ex = EXERCISES[exId] || CATALOG.find(c => c.id === exId), entry = rec.entries[exId];
    // Chaque modification date l'exercice, et un retrait laisse une trace datée : la fusion avec l'iPhone se fait
    // exercice par exercice (merge.js de l'appli), sans écraser ce qui a été saisi entre-temps sur le téléphone.
    const save = () => { if (rec.entries[exId]) rec.entries[exId].u = Date.now(); touch('sessions', rec); };
    const removeEx = () => { delete rec.entries[exId]; rec.removed = { ...rec.removed, [exId]: Date.now() }; touch('sessions', rec); };
    // Commentaire saisi sur l'iPhone (même ligne que Léger / Lourd) et rappel de celui de la séance précédente
    // qui contenait cet exercice.
    const comment = h('input', { class: 'cmt', value: entry.comment || '', placeholder: 'Commentaire', 'aria-label': `Commentaire, ${ex ? ex.name : exId}` });
    comment.addEventListener('change', () => { const t = comment.value.trim(); if (t) entry.comment = t; else delete entry.comment; save(); });
    const prevRec = liveSessions().filter(r => r.date < rec.date && r.entries?.[exId]).sort((a, b) => b.date.localeCompare(a.date))[0];
    const prevNote = prevRec?.entries[exId].comment?.trim() ? { date: prevRec.date, text: prevRec.entries[exId].comment.trim() } : null;
    // Cardio : Durée (min) dans reps (charge 0), plus Pente (%) et Vitesse (km/h) pour la marche ; mêmes libellés que l'iPhone.
    const cd = ex && (ex.group || GROUP[exId]) === 'Cardio', cdSlope = cd && !!CATALOG.find(c => c.id === exId)?.slope, cdSpeed = cd && !!CATALOG.find(c => c.id === exId)?.speed;
    const rows = cd ? entry.sets.map((st, i) => {
      const field = (key, mode) => {
        const inp = h('input', { class: 'n', value: st[key] == null ? '' : fmtKg(st[key]), inputmode: mode });
        inp.addEventListener('change', () => { st[key] = num(inp.value); if (key === 'reps') st.kg = 0; save(); });
        return h('td', {}, inp);
      };
      const done = h('input', { type: 'checkbox', checked: !!st.done });
      done.addEventListener('change', () => { st.done = done.checked; if (st.kg == null) st.kg = 0; save(); });
      return h('tr', {}, h('td', { class: 'sub' }, i + 1), field('reps', 'numeric'), cdSlope ? field('pente', 'numeric') : null, cdSpeed ? field('vitesse', 'decimal') : null, h('td', {}, done),
        h('td', {}, h('button', { class: 'btn small secondary', title: 'Supprimer la série', onclick: () => { entry.sets.splice(i, 1); if (entry.sets.length) save(); else removeEx(); redraw(); } }, '×')));
    }) : entry.sets.map((st, i) => {
      // Série Perso : la case kg liste la charge de chaque rep (« 100 100 95 »), kg = la plus lourde des reps faites.
      const pl = Array.isArray(st.loads);
      const kg = h('input', { class: 'n' + (pl ? ' loads' : ''), value: pl ? st.loads.map(v => v == null ? '–' : fmtKg(v)).join(' ') : st.kg == null ? '' : fmtKg(st.kg), inputmode: pl ? 'text' : 'decimal', title: pl ? 'Charge de chaque rep, séparées par des espaces' : '' });
      const reps = h('input', { class: 'n', value: st.reps == null ? '' : String(st.reps), inputmode: 'numeric' });
      const rir = h('select', {}, ['', '0', '1', '2', '3', '4'].map(v => h('option', { value: v, selected: String(st.rir ?? '') === v }, v === '' ? '–' : v)));
      const done = h('input', { type: 'checkbox', checked: !!st.done });
      kg.addEventListener('change', () => {
        if (pl) { const l = kg.value.trim().split(/\s+/).filter(Boolean).map(v => { const n = num(v); return n != null && n >= 0 ? n : null; }); if (l.length) st.loads = l; persoSync(st); }
        else st.kg = num(kg.value);
        save();
      });
      reps.addEventListener('change', () => { st.reps = num(reps.value); if (pl) persoSync(st); save(); });
      rir.addEventListener('change', () => { st.rir = rir.value; save(); });
      done.addEventListener('change', () => { st.done = done.checked; save(); });
      // Série validée hors de sa fourchette (setDev, program.js) : même flèche que sur l'iPhone.
      const dev = st.done ? setDev(planEx(programFor(rec.date).sessions[rec.name] || [], rec, exId, exDef) || ex, i, st.reps) : 0;
      const flag = dev ? h('span', { class: 'flag ' + (dev < 0 ? 'gap-lo' : 'gap-hi'), title: dev < 0 ? 'Sous la fourchette' : 'Au-dessus de la fourchette' }, dev < 0 ? ' ↓' : ' ↑') : null;
      return h('tr', {}, h('td', { class: 'sub' }, i + 1), h('td', {}, kg), h('td', {}, reps, flag), h('td', {}, rir), h('td', {}, done),
        h('td', {}, h('button', { class: 'btn small secondary', title: 'Supprimer la série', onclick: () => { entry.sets.splice(i, 1); if (entry.sets.length) save(); else removeEx(); redraw(); } }, '×')));
    });
    return h('div', { class: 'card ex' },
      h('h3', {}, ex ? ex.name : exId, ' ', entry.extra ? h('span', { class: 'extra-tag' }, '+ Complément') : null, h('span', {}, ex ? `${repsLabel(ex)}` : ''),
        swappedFrom[exId] ? h('span', { class: 'swaptag' }, `⇄ remplace ${exName(swappedFrom[exId])}`) : swaps[exId] ? h('span', { class: 'swaptag' }, `⇄ arrêté, suite avec ${exName(swaps[exId])}`) : null),
      h('table', { class: 'sets' }, cd
        ? h('tr', {}, h('th', {}, '#'), h('th', {}, 'Durée (min)'), cdSlope ? h('th', {}, 'Pente (%)') : null, cdSpeed ? h('th', {}, 'Vitesse (km/h)') : null, h('th', {}, 'faite'), h('th', {}))
        : h('tr', {}, h('th', {}, '#'), h('th', {}, 'kg'), h('th', {}, 'reps'), h('th', {}, 'réserve'), h('th', {}, 'faite'), h('th', {})), rows),
      h('div', { class: 'row', style: 'margin-top:8px;align-items:stretch' },
        h('button', { class: 'btn small secondary', onclick: () => { const l = entry.sets[entry.sets.length - 1]; entry.sets.push({ kg: l?.kg ?? null, reps: l?.reps ?? null, rir: '', done: true, ...(l?.loads ? { loads: [...l.loads] } : {}) }); save(); redraw(); } }, '+ Série'),
        h('button', { class: 'btn small danger', onclick: () => { if (confirm('Supprimer cet exercice de la séance ?')) { removeEx(); redraw(); } } }, 'Retirer l\'exercice'),
        comment,
        loadIcon('up', entry.load === 'up', () => { entry.load = entry.load === 'up' ? null : 'up'; save(); redraw(); }),
        loadIcon('down', entry.load === 'down', () => { entry.load = entry.load === 'down' ? null : 'down'; save(); redraw(); })),
      prevNote ? h('div', { class: 'sub prev-cmt' }, `${cap(fmtDateLong(prevNote.date))} : « ${prevNote.text} »`) : null);
  });
  const choices = Object.values(EXERCISES).filter(e => !rec.entries[e.id]);
  const sel = h('select', {}, choices.map(e => h('option', { value: e.id }, e.name)));
  // Durée corrigeable à la main (chrono oublié) : on enregistre un début et une fin sans pause.
  const curMin = rec.clock?.start ? Math.round(duration(rec) / 60e3) : null;
  const startIn = h('input', { type: 'time', value: rec.clock?.start ? fmtHour(rec.clock.start) : '' });
  const durIn = h('input', { class: 'n', inputmode: 'numeric', value: curMin == null ? '' : String(curMin), placeholder: 'min' });
  const saveClock = () => {
    const m = num(durIn.value);
    rec.clockU = Date.now(); // heure de modification du chrono, pour la fusion avec l'iPhone
    if (m == null || m <= 0) { delete rec.clock; save(); redraw(); return; }
    const [hh, mm] = (startIn.value || '18:00').split(':').map(Number);
    const d = parseYmd(rec.date); d.setHours(hh, mm, 0, 0);
    rec.clock = { start: d.getTime(), end: d.getTime() + m * 60e3, pauseMs: 0, pausedAt: null };
    save(); redraw();
  };
  startIn.addEventListener('change', () => { if (num(durIn.value)) saveClock(); });
  durIn.addEventListener('change', saveClock);
  mount(
    h('a', { href: '#/seances' }, '‹ Toutes les séances'),
    h('div', { class: 'row between' },
      h('h2', { style: 'margin:6px 0' }, `${rec.name}, ${fmtDateLong(rec.date)}`),
      h('button', { class: 'btn small danger', onclick: () => { if (confirm('Supprimer toute la séance ? Elle disparaîtra aussi de l\'iPhone.')) { rec.deleted = true; save(); location.hash = '#/seances'; } } }, 'Supprimer la séance')),
    // Bandeau : séries de muscu et volume sans le cardio, puis les minutes de cardio s'il y en a.
    ((muscu, mins) => h('div', { class: 'sub' }, [
      muscu ? `${muscu} série${muscu > 1 ? 's' : ''} validée${muscu > 1 ? 's' : ''}, ${volume(rec).toLocaleString('fr-FR')} kg de volume` : null,
      mins ? `${mins} min de cardio` : null].filter(Boolean).join(', ') + '. Les modifications partent vers l\'iPhone à sa prochaine synchronisation.'))(
      Object.entries(rec.entries || {}).filter(([x]) => (exDef(x)?.group || GROUP[x]) !== 'Cardio').reduce((n, [, e]) => n + doneSets(e).length, 0),
      Object.entries(rec.entries || {}).filter(([x]) => (exDef(x)?.group || GROUP[x]) === 'Cardio').reduce((n, [, e]) => n + Math.max(0, ...doneSets(e).map(s => s.reps)), 0)),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('span', { class: 'sub' }, 'Début :'), startIn, h('span', { class: 'sub' }, 'Durée :'), durIn, h('span', { class: 'sub' }, 'min'),
      h('span', { class: 'sub' }, rec.clock?.start ? `(${fmtHour(rec.clock.start)} → ${fmtHour(clockEnd(rec))}${rec.clock.pauseMs ? `, pauses ${fmtMin(rec.clock.pauseMs)}` : ''})` : '(non chronométrée : saisis la durée pour l\'ajouter)')),
    blocks.length ? blocks : h('div', { class: 'card empty' }, 'Aucun exercice dans cette séance.'),
    h('div', { class: 'row', style: 'margin-top:14px' }, h('span', { class: 'sub' }, 'Ajouter un exercice :'), sel,
      h('button', { class: 'btn small', onclick: () => { const ex = EXERCISES[sel.value]; if (!ex) return; rec.entries[ex.id] = { sets: Array.from({ length: ex.sets }, (_, i) => isPerso(ex) ? persoSync({ loads: [...loadsAt(ex, i)], reps: loadsAt(ex, i).length, rir: '', done: true }) : ({ kg: ex.kg, reps: rangeAt(ex, i)[0], rir: '', done: true })), u: Date.now() };
        // Hors programme de la séance : complément, comme sur l'iPhone (hors score d'adhérence).
        if (!(programFor(rec.date).sessions[rec.name] || []).some(p => p.id === ex.id)) rec.entries[ex.id].extra = true; save(); redraw(); } }, 'Ajouter')));
}

// Mensurations suivies en plus du poids (mêmes clés que l'appli iPhone).
const MEASURES = [
  { key: 'waist', label: 'Tour de taille', short: 'T. de taille', better: 'down', hint: 'au niveau du nombril, ventre relâché' },
  { key: 'chest', label: 'Tour de poitrine', short: 'Poitrine', better: 'up', hint: 'sous les aisselles, à hauteur des mamelons, après une expiration normale' },
  { key: 'biceps', label: 'Tour de biceps', short: 'Biceps', better: 'up', hint: 'bras détendu le long du corps, à l\'endroit le plus large' },
  { key: 'thigh', label: 'Tour de cuisse', short: 'Cuisse', better: 'up', hint: 'à mi-cuisse, debout, jambe détendue' },
];

// ---------- Balance Withings (import fait par le serveur, réglage partagé avec l'iPhone) ----------
// Une valeur de poids ou de masse grasse modifiée à la main n'est plus considérée comme venant de Withings.
function markManual(rec, vals, prev) {
  for (const k of ['poids', 'mg']) if (vals[k] != null && vals[k] !== prev[k]) rec.src = { ...rec.src, [k]: 'manuel' };
}
function sourceCell(b) {
  const s = Object.values(b.src || {});
  const w = s.includes('withings'), m = s.includes('manuel') || (!w && (b.poids != null || b.mg != null));
  if (!w && !m) return '';
  const rep = b.withings?.replaced;
  return [w ? h('span', { class: 'wb' }, `⚖ Withings${b.withings?.at ? ' ' + fmtHour(b.withings.at) : ''}`) : null, m ? h('span', { class: 'mb' }, '✎ Manuel') : null,
    rep ? h('small', { class: 'sub' }, ` remplace ta saisie ${[rep.poids != null ? fmtKg(rep.poids) + ' kg' : '', rep.mg != null ? fmtKg(rep.mg) + ' %' : ''].filter(Boolean).join(', ')}`) : null];
}
let wst = null, wBusy = false, wMsg = '';
async function loadWithings() {
  try { wst = await api('/api/withings'); } catch (e) { wst = { error: e.message }; }
  if (location.hash.startsWith('#/corps')) viewBody();
}
const wpost = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Muscu': '1' }, body: JSON.stringify(body || {}) });
function withingsPanel() {
  const card = (...kids) => h('div', { class: 'card wpanel' }, h('h3', {}, 'Withings · pesées et pas'), ...kids, wMsg ? h('div', { class: 'sub' }, wMsg) : null);
  if (!wst) { loadWithings(); return card(h('div', { class: 'sub' }, 'Chargement…')); }
  if (wst.error) return card(h('div', { class: 'sub err' }, `État illisible : ${wst.error}`));
  // Lecture seule : connexion et import se font sur l'iPhone. Seul le réglage automatique (partagé) se change ici.
  if (wst.by !== 'iphone' || !wst.connected) {
    return card(h('p', { class: 'sub' }, 'Non connectée. La connexion se fait sur l\'iPhone : Réglages › Balance Withings.'));
  }
  const auto = h('input', { type: 'checkbox', checked: wst.auto !== false });
  auto.addEventListener('change', async () => {
    if (wBusy) return;
    wBusy = true; wMsg = 'En cours…'; viewBody();
    try { await wpost('/api/withings/auto', { auto: auto.checked }); wMsg = auto.checked ? 'Récupération automatique activée.' : 'Récupération automatique désactivée : saisie manuelle uniquement.'; }
    catch (e) { wMsg = `Échec : ${e.message}`; }
    wBusy = false;
    await loadWithings();
  });
  const when = ms => `${fmtDate(ymd(new Date(ms)))} ${fmtHour(ms)}`;
  return card(
    h('div', { class: 'row' }, h('span', { class: 'wdot' }), h('b', {}, 'Connectée sur l\'iPhone'), h('span', { class: 'sub' }, '· import à chaque ouverture de l\'appli')),
    h('div', { class: 'kv' },
      h('span', {}, 'Dernier import'), h('span', {}, wst.lastImport ? `${when(wst.lastImport)}${wst.lastCount ? ` · ${wst.lastCount} pesée${wst.lastCount > 1 ? 's' : ''} importée${wst.lastCount > 1 ? 's' : ''}` : ''}` : 'aucun'),
      h('span', {}, 'Pesées depuis le'), h('span', {}, fmtDate(wst.since))),
    wst.lastError ? h('div', { class: 'sub err' }, `Dernière erreur : ${wst.lastError}`) : null,
    wst.lastStepsError ? h('div', { class: 'sub err' }, `Pas : ${wst.lastStepsError}`) : null,
    h('label', { class: 'row' }, auto, h('span', {}, 'Récupération automatique'), h('span', { class: 'sub' }, '(réglage partagé avec l\'iPhone)')),
    h('div', { class: 'sub' }, 'Dernier import mis à jour ici au plus une fois par heure s\'il n\'y a rien de nouveau.'));
}

// Rappel mensurations : état, et réglage dépliable (même réglage que l'iPhone, Réglages › Rappel mensurations).
// Chaque changement est enregistré aussitôt, comme sur l'iPhone.
function reminderCard() {
  const r = { ...REMINDER_DEFAULT, ...(reminderCfg || {}) }, s = reminderStatus(data.body, r, today());
  const freq = `toutes les ${r.weeks > 1 ? `${r.weeks} semaines` : 'semaines'}, le ${REMINDER_DAYS[r.day]}${r.notifyHour != null ? `, notification à ${r.notifyHour} h` : ''}`;
  const last = s.last ? `dernière mesure le ${fmtDate(s.last)} (il y a ${s.daysSince} jour${s.daysSince > 1 ? 's' : ''})` : 'aucune mensuration enregistrée';
  const apply = async patch => {
    editMsg = 'Enregistrement…'; viewBody();
    try { reminderCfg = (await wpost('/api/reminders', { ...r, ...patch, updatedAt: undefined })).mensurations; editMsg = 'Enregistré.'; }
    catch (e) { editMsg = `Échec : ${e.message}`; }
    viewBody();
  };
  const form = editing === 'rappel' ? (() => {
    const on = h('input', { type: 'checkbox', checked: r.on }); on.addEventListener('change', () => apply({ on: on.checked }));
    const hour = h('select', {}, h('option', { value: '' }, 'Pas de notification'), Array.from({ length: 16 }, (_, i) => i + 6).map(x => h('option', { value: String(x), selected: r.notifyHour === x }, `${x} h`)));
    if (r.notifyHour == null) hour.value = '';
    hour.addEventListener('change', () => apply({ notifyHour: hour.value === '' ? null : Number(hour.value) }));
    return h('div', { class: 'editbox' },
      h('label', { class: 'row' }, on, h('span', {}, 'Rappel activé')),
      r.on ? [h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Fréquence'), segBtns([1, 2, 3, 4].map(w => [w, `${w} sem.`]), r.weeks, w => apply({ weeks: w })),
        h('span', { class: 'sub' }, 'le'), segBtns([1, 2, 3, 4, 5, 6, 0].map(d => [d, REMINDER_DAYS[d][0].toUpperCase()]), r.day, d => apply({ day: d }))),
      h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Mesures à faire'), MEASURES.map(m => {
        const c = h('input', { type: 'checkbox', checked: r.measures.includes(m.key) });
        c.addEventListener('change', () => {
          const next = MEASURES.map(x => x.key).filter(k => k === m.key ? c.checked : r.measures.includes(k));
          if (!next.length) { c.checked = true; editMsg = 'Garde au moins une mesure.'; viewBody(); return; }
          apply({ measures: next });
        });
        return h('label', { class: 'row', style: 'gap:4px' }, c, m.short);
      })),
      h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Notification sur le téléphone'), hour)] : null,
      h('div', { class: 'sub' }, editMsg || 'Partagé avec l\'iPhone et la notification du téléphone.'));
  })() : null;
  return h('div', { class: 'card remindcard' + (r.on && s.isDue ? ' due' : '') },
    h('div', { class: 'row between' },
      r.on ? h('b', {}, s.isDue ? '⌀ Mensurations à mettre à jour' : `Prochain rappel mensurations : ${JOURS[parseYmd(s.due).getDay()]} ${fmtDate(s.due)}`) : h('b', {}, 'Rappel mensurations désactivé'),
      editLink('rappel', 'Modifier le rappel', viewBody)),
    r.on ? h('span', { class: 'sub' }, `${cap(last)} · ${freq}`) : null,
    form);
}

function viewBody() {
  setTab('body');
  const list = liveBody();
  const fDate = h('input', { type: 'date', value: today() });
  const fP = h('input', { class: 'n', placeholder: 'kg', inputmode: 'decimal' });
  const fG = h('input', { class: 'n', placeholder: '%', inputmode: 'decimal' });
  const fMeas = Object.fromEntries(MEASURES.map(m => [m.key, h('input', { class: 'n', placeholder: 'cm', inputmode: 'decimal' })]));
  const existing = d => data.body[d] && !data.body[d].deleted ? data.body[d] : null;
  fDate.addEventListener('change', () => {
    const e = existing(fDate.value);
    fP.value = e?.poids != null ? fmtKg(e.poids) : ''; fG.value = e?.mg != null ? fmtKg(e.mg) : '';
    for (const m of MEASURES) fMeas[m.key].value = e?.[m.key] != null ? fmtKg(e[m.key]) : '';
  });
  const add = h('button', { class: 'btn', onclick: () => {
    const vals = { poids: num(fP.value), mg: num(fG.value), ...Object.fromEntries(MEASURES.map(m => [m.key, num(fMeas[m.key].value)])) };
    if (!fDate.value || Object.values(vals).every(v => v == null)) return;
    const prev = existing(fDate.value) || {};
    const rec = { ...prev, id: fDate.value, date: fDate.value };
    for (const [k, v] of Object.entries(vals)) rec[k] = v ?? prev[k] ?? null;
    markManual(rec, vals, prev);
    touch('body', rec);
    viewBody();
  } }, 'Enregistrer');

  const pts = key => list.filter(b => b[key] != null).map(b => ({ t: parseYmd(b.date).getTime(), v: b[key] }));
  const field = (b, key) => {
    const i = h('input', { class: 'n', value: b[key] == null ? '' : fmtKg(b[key]), inputmode: 'decimal' });
    i.addEventListener('change', () => { const prev = { ...b }; b[key] = num(i.value); markManual(b, { [key]: b[key] }, prev); touch('body', b); });
    return i;
  };

  // Bilan : dernière valeur et évolution depuis la première mesure.
  const tiles = MEASURES.map(m => {
    const p = pts(m.key); if (!p.length) return null;
    const first = p[0].v, lastV = p[p.length - 1].v, d = Math.round((lastV - first) * 10) / 10;
    const good = d === 0 ? '' : (m.better === 'down' ? d < 0 : d > 0) ? 'up' : 'down';
    return tile(m.label, `${fmtKg(lastV)} cm`, p.length > 1 ? `${d > 0 ? '+' : ''}${fmtKg(d)} cm depuis le ${fmtDate(ymd(new Date(p[0].t)))}` : 'première mesure', good);
  }).filter(Boolean);

  const charts = [
    pts('poids').length ? lineChart([{ name: 'Moyenne 7 jours', points: movingAvg(pts('poids')) }, { name: 'Pesée', points: pts('poids'), raw: true, line: false }], 'kg', 'Poids', 540, 240) : null,
    pts('mg').length ? lineChart([{ name: 'Masse grasse', points: pts('mg') }], '%', 'Masse grasse', 540, 240) : null,
    ...MEASURES.map(m => pts(m.key).length ? lineChart([{ name: m.label, points: pts(m.key) }], 'cm', m.label, 540, 240) : null),
  ].filter(Boolean);

  mount(
    h('h2', { style: 'margin-top:0' }, 'Corps'),
    reminderCard(),
    withingsPanel(),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('label', { class: 'sub' }, 'Date '), fDate,
        h('label', { class: 'sub' }, 'Poids'), fP, h('label', { class: 'sub' }, 'Gras'), fG),
      h('div', { class: 'row', style: 'margin-top:10px' }, MEASURES.map(m => [h('label', { class: 'sub' }, m.label), fMeas[m.key]]), add),
      h('details', { style: 'margin-top:8px' }, h('summary', { class: 'sub' }, 'Comment mesurer'),
        h('p', { class: 'sub' }, 'Mètre ruban à plat, non serré, le matin, toujours au même endroit et du même côté du corps.'),
        h('ul', { class: 'sub' }, MEASURES.map(m => h('li', {}, `${m.label} : ${m.hint}.`))))),
    tiles.length ? [h('h2', {}, 'Évolution des mensurations'), h('div', { class: 'tiles' }, tiles)] : null,
    h('h2', {}, 'Courbes'),
    charts.length ? h('div', { class: 'grid2' }, charts) : h('div', { class: 'card empty' }, 'Aucune mesure pour le moment.'),
    h('h2', {}, 'Toutes les mesures'),
    list.length ? h('div', { class: 'card' }, h('table', {},
      h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Poids (kg)'), h('th', {}, 'Gras (%)'), h('th', {}, 'Source'), MEASURES.map(m => h('th', {}, m.short + ' (cm)')), h('th', {})),
      [...list].reverse().map(b => h('tr', { class: b.withings?.replaced ? 'replaced' : '' }, h('td', {}, fmtDate(b.date) + ' ' + b.date.slice(0, 4)), h('td', {}, field(b, 'poids')), h('td', {}, field(b, 'mg')),
        h('td', {}, sourceCell(b)),
        MEASURES.map(m => h('td', {}, field(b, m.key))),
        h('td', {}, h('button', { class: 'btn small danger', onclick: () => { if (confirm('Supprimer cette mesure ?')) { touch('body', { id: b.id, date: b.date, deleted: true }); viewBody(); } } }, 'Supprimer')))))) : h('div', { class: 'card empty' }, 'Aucune mesure.'));
}

// ---------- Bibliothèque d'exercices (library.js, partagée avec l'appli iPhone) ----------
// Tous les exercices connus : programmes (avec leur historique) et catalogue.
function allExercises() {
  const out = {};
  for (const c of CATALOG) out[c.id] = c;
  for (const e of Object.values(EXERCISES)) out[e.id] = { ...out[e.id], ...e };
  return out;
}
// Fiche : machine, muscles, consignes, erreurs, liens Fitwill et YouTube.
function ficheNode(id, ex) {
  const lib = LIBRARY[id], fw = fitwillUrl(lib);
  return h('div', { class: 'fiche' },
    lib?.machine ? h('span', { class: 'machine' }, lib.machine.toUpperCase()) : null,
    h('h3', {}, gdot(id), ex.name),
    lib ? [h('div', { class: 'mus' }, lib.muscles.map(m => h('span', {}, m)), lib.secondary.map(m => h('span', { class: 'sec' }, m))),
      h('div', { class: 'lbl' }, 'Exécution'), h('ol', {}, lib.steps.map(s => h('li', {}, s))),
      h('div', { class: 'lbl' }, 'Erreurs fréquentes'), h('ul', { class: 'err' }, lib.errors.map(s => h('li', {}, s)))]
      : h('p', { class: 'sub' }, 'Pas encore de fiche rédigée pour cet exercice.'),
    h('div', { class: 'row', style: 'margin-top:12px' },
      fw ? h('a', { class: 'btn', href: fw, target: '_blank', rel: 'noopener' }, 'Fiche Fitwill ↗') : null,
      h('a', { class: 'btn secondary', href: youtubeUrl(lib, ex.name), target: '_blank', rel: 'noopener' }, 'Vidéos YouTube ↗')));
}
function showFicheModal(id) {
  const ex = allExercises()[id] || { name: id };
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'modal-wrap', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'card modal' }, h('button', { class: 'ico', style: 'float:right', title: 'Fermer', onclick: close }, '✕'), ficheNode(id, ex)));
  document.body.append(wrap);
}

let exSearch = '';
// Cardio (marche inclinée, vélo, natation) : minutes rangées dans reps (charge 0), pente en % (st.pente) et vitesse
// en km/h (st.vitesse) pour la marche. Même lecture que l'iPhone : minutes des 12 dernières séances en barres, total
// du mois, tableau Durée (min) / Pente (%) / Vitesse (km/h) (mêmes libellés que l'iPhone).
const cardioMin = sets => Math.max(0, ...sets.map(x => x.reps || 0));
const cardioPente = sets => sets.map(x => x.pente).filter(v => v != null).pop() ?? null;
const cardioVitesse = sets => sets.map(x => x.vitesse).filter(v => v != null).pop() ?? null;
function cardioBlock(id, hist) {
  const slope = !!CATALOG.find(c => c.id === id)?.slope, speed = !!CATALOG.find(c => c.id === id)?.speed;
  const last = hist.slice(-12), mins = last.map(x => cardioMin(x.sets)), max = Math.max(...mins, 1);
  const month = today().slice(0, 7), inMonth = hist.filter(x => x.date.startsWith(month));
  const total = inMonth.reduce((a, x) => a + cardioMin(x.sets), 0);
  return [h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Minutes par séance'), h('span', { class: 'sub' }, `ce mois-ci : ${total} min sur ${inMonth.length} séance${inMonth.length > 1 ? 's' : ''}`)),
    h('div', { class: 'mbars', 'aria-label': `Minutes des ${last.length} dernières séances` }, last.map((x, i) => h('div', { class: 'col', title: `${fmtDate(x.date)} : ${mins[i]} min` }, h('b', {}, String(mins[i])), h('span', { style: `height:${Math.max(4, mins[i] / max * 80)}%` })))),
    h('div', { class: 'mdays' }, last.map(x => h('span', {}, fmtDate(x.date))))),
  h('div', { class: 'card', style: 'margin-top:12px' }, h('table', {},
    h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'num' }, 'Durée (min)'), slope ? h('th', { class: 'num' }, 'Pente (%)') : null, speed ? h('th', { class: 'num' }, 'Vitesse (km/h)') : null),
    [...hist].reverse().map(x => { const p = cardioPente(x.sets), v = cardioVitesse(x.sets); return h('tr', {}, h('td', {}, fmtDate(x.date)), h('td', { class: 'num' }, String(cardioMin(x.sets))),
      slope ? h('td', { class: 'num' }, p != null ? fmtKg(p) : '–') : null, speed ? h('td', { class: 'num' }, v != null ? fmtKg(v) : '–') : null); })))];
}
function viewExercises(selected) {
  setTab('exercises');
  const all = allExercises();
  const id = selected && all[selected] ? selected : 'dc';
  const ex = all[id], active = programFor(today());
  const inProg = new Set(Object.values(active.sessions).flat().map(e => e.id));
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Liste groupée par muscle, filtrée par la recherche (nom français ou nom de machine)
  const listBox = h('div', {});
  const drawList = () => {
    const q = norm(exSearch);
    listBox.replaceChildren(...EDIT_GROUPS.flatMap(g => {
      const items = Object.values(all).filter(e => (e.group || GROUP[e.id]) === g && (!q || norm(e.name).includes(q) || norm(LIBRARY[e.id]?.machine || '').includes(q)))
        .sort((a, b) => (inProg.has(b.id) - inProg.has(a.id)) || a.name.localeCompare(b.name, 'fr'));
      return items.length ? [h('div', { class: 'xg' }, g), ...items.map(e => h('a', { class: 'xi' + (e.id === id ? ' on' : ''), href: '#/exercices/' + e.id },
        h('span', {}, e.name), g === 'Cardio' && history(e.id).length ? h('small', { title: 'Durée de la dernière séance' }, `${cardioMin(history(e.id).at(-1).sets)} min`) : null,
        inProg.has(e.id) ? h('small', { title: `Dans ${active.label}` }, 'P') : null))] : [];
    }));
  };
  const search = h('input', { placeholder: 'Rechercher (français ou nom machine)', value: exSearch });
  search.addEventListener('input', () => { exSearch = search.value; drawList(); });
  drawList();

  // Place dans le programme actif, variantes, historique
  const where = Object.entries(active.sessions).filter(([, l]) => l.some(e => e.id === id)).map(([n, l]) => { const e = l.find(x => x.id === id); return `${n} (${DAY_ORDER.filter(d => active.days[d] === n).map(d => JOURS[d]).join(', ') || 'aucun jour'}) · ${repsLabel(e)} · repos ${fmtRest(e.rest)}`; });
  const variants = (LIBRARY[id]?.variants || []).filter(v => all[v]);
  const hist = history(id);
  const histBlock = !hist.length ? h('div', { class: 'card empty' }, 'Pas encore de données.')
    : (ex.group || GROUP[id]) === 'Cardio' ? cardioBlock(id, hist)
    : [ex.kg === 0 || !e1rmPoints(id).length ? h('div', { class: 'card empty' }, 'Exercice au poids du corps : pas de courbe de 1RM.') : lineChart([{ name: '1RM estimé', points: e1rmPoints(id) }], 'kg', '1RM estimé (formule d\'Epley, meilleure série)', 760, 260),
      h('div', { class: 'card', style: 'margin-top:12px' }, h('table', {},
        h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Séries (kg × reps)'), h('th', {}, 'Charge'), h('th', { class: 'num' }, '1RM estimé')),
        [...hist].reverse().map(x => h('tr', {}, h('td', {}, fmtDate(x.date)), h('td', {}, x.sets.map(z => setTxt(z, fmtKg)).join('   ')), h('td', {}, loadTag(x.load)), h('td', { class: 'num' }, bestE1rm(x.sets) ? fmtKg(bestE1rm(x.sets)) : '–')))))];
  mount(h('div', { class: 'xlayout' },
    h('div', { class: 'card xlist' }, search, listBox),
    h('div', { class: 'xdetail' },
      h('div', { class: 'xtop' },
        h('div', { class: 'card' }, ficheNode(id, ex)),
        h('div', { class: 'card xside' },
          h('div', { class: 'lbl' }, `Dans ${active.label}`),
          where.length ? where.map(w => h('div', {}, w)) : h('div', { class: 'sub' }, 'Pas dans le programme actif.'),
          h('div', { class: 'lbl' }, 'Variantes et remplaçants'),
          variants.length ? h('div', { class: 'row' }, variants.map(v => h('a', { class: 'pill', href: '#/exercices/' + v }, all[v].name))) : h('div', { class: 'sub' }, '–'),
          h('div', { class: 'lbl' }, 'Conseillé'),
          h('div', { class: 'sub' }, `${repsLabel(ex)} · repos ${fmtRest(ex.rest)} · pas de ${fmtKg(ex.step)} kg${ex.note ? ' · ' + ex.note : ''}`))),
      h('h2', {}, 'Historique'), histBlock)));
  // Garde la ligne choisie visible dans la liste
  listBox.querySelector('.xi.on')?.scrollIntoView({ block: 'nearest' });
}

// ---------- Routage ----------
// ---------- Onglet Programme : semaine type, équilibre musculaire, progression par exercice, règles ----------
const GCOLOR = { Pecs: 'var(--g-pecs)', Dos: 'var(--g-dos)', 'Épaules': 'var(--g-epaules)', Bras: 'var(--g-bras)', Jambes: 'var(--g-jambes)', Abdos: 'var(--g-abdos)', Cardio: 'var(--ink-2)' };
const gdot = exId => h('span', { class: 'gdot', style: `background:${GCOLOR[GROUP[exId]] || 'var(--muted)'}` });
const LEG_PARTS = { quadriceps: ['presse', 'presse2', 'fentes', 'lext', 'squat'], ischios: ['lcurl', 'rdl', 'sdt'], fessiers: ['hip', 'abd'], mollets: ['calf'] };
const fmtRest = s => s >= 60 ? (s % 60 ? `${Math.floor(s / 60)} min ${s % 60}` : `${s / 60} min`) : `${s} s`;
// Durée estimée d'une séance : séries × (repos + 40 s d'effort).
// Cardio : la durée est le haut de la fourchette (en minutes).
const estMinutes = list => Math.round(list.reduce((a, e) => a + ((e.group || GROUP[e.id]) === 'Cardio' ? e.sets * e.hi * 60 : e.sets * (e.rest + 40)), 0) / 60);
// Séries prévues par groupe sur une semaine (chaque séance du programme une fois).
function plannedSets(prog, filter = () => true) {
  const out = {};
  for (const n of Object.values(prog.days)) if (n) for (const e of prog.sessions[n] || []) if (filter(e)) { const g = e.group || GROUP[e.id] || 'Jambes'; if (g !== 'Cardio') out[g] = (out[g] || 0) + e.sets; }
  return out;
}
// Exercices distincts d'un programme, dans l'ordre des séances.
function progExercises(prog) {
  const seen = new Map();
  for (const list of Object.values(prog.sessions)) for (const e of list) if (!seen.has(e.id)) seen.set(e.id, e);
  return [...seen.values()];
}
// Même règle que l'appli : toutes les séries à la charge max au haut de la fourchette => prêt à monter.
function exStatus(ex) {
  const hist = history(ex.id);
  if (!hist.length) return { st: 'new' };
  const last = hist[hist.length - 1];
  const top = Math.max(...last.sets.map(x => x.kg)), atTop = last.sets.filter(x => x.kg === top);
  // Fourchettes par série : top set => la 1re série décide ; pyramide => prêt dès qu'une série a atteint le haut de la sienne.
  if (perSet(ex)) {
    const plan = perSetPlan(ex, last.sets), up = ex.mode === 'top' ? plan.up[0] : plan.up.some(Boolean);
    const next = ex.mode === 'top' ? plan.sets[0].kg : Math.max(...plan.sets.map(x => x.kg ?? 0));
    return { st: up ? 'up' : 'go', top, reps: last.sets.map(x => x.reps), nTop: plan.up.filter(Boolean).length, next, load: last.load, date: last.date, plan };
  }
  const full = atTop.length >= ex.sets && atTop.every(x => x.reps >= ex.hi);
  const base = { top, reps: atTop.map(x => x.reps), nTop: atTop.filter(x => x.reps >= ex.hi).length, load: last.load, date: last.date };
  // Sous la fourchette : même règle que l'appli, on allège pour y revenir (kgForReps, program.js).
  const minReps = Math.min(...atTop.map(x => x.reps));
  if (!full && minReps < ex.lo && top > 0) return { ...base, st: 'down', next: kgForReps(top, minReps, ex.lo, ex.step) };
  return { ...base, st: full ? 'up' : 'go', next: full ? top + ex.step : top };
}
// Record d'un exercice (mêmes règles que l'iPhone) : charge la plus lourde validée et meilleur nombre de reps à
// cette charge, avec sa date (↑ si établi ces 30 derniers jours). PR visé = l'objectif que l'appli proposera à la
// prochaine séance (double progression) s'il dépasse le record de charge, ou le record de reps à cette charge.
function exRecord(ex, st) {
  // Série Perso : la charge la plus lourde et les reps faites à cette charge (setBest, program.js).
  const sets = history(ex.id).flatMap(x => x.sets.map(y => ({ ...y, ...setBest(y), date: x.date }))).filter(x => x.kg > 0);
  if (!sets.length) return null;
  const kg = Math.max(...sets.map(x => x.kg)), atMax = sets.filter(x => x.kg === kg);
  const reps = Math.max(...atMax.map(x => x.reps)), date = atMax.filter(x => x.reps === reps).map(x => x.date).sort()[0];
  const bestAt = k => Math.max(-1, ...sets.filter(x => x.kg === k).map(x => x.reps));
  let pr = null;
  if (st.st === 'up' && st.next > kg) pr = `${fmtKg(st.next)} kg`;
  else if (st.st !== 'new' && !isPerso(ex)) { // Perso : pas de progression, donc pas de record de reps visé
    const sug = st.plan ? st.plan.sets.reduce((a, b) => (b.kg ?? -1) > (a.kg ?? -1) ? b : a) : st.st === 'up' || st.st === 'down' ? { kg: st.next, reps: ex.lo } : { kg: st.top, reps: Math.min(ex.hi, Math.min(...st.reps) + 1) };
    if (bestAt(sug.kg) >= 0 && sug.reps > bestAt(sug.kg)) pr = sug.kg === kg ? `× ${sug.reps}` : `${fmtKg(sug.kg)} kg × ${sug.reps}`;
  }
  return { kg, reps, date, fresh: date >= ymd(new Date(Date.now() - 30 * 864e5)), pr };
}
function spark(exId) {
  const p = e1rmPoints(exId).slice(-8);
  if (p.length < 2) return '';
  const v = p.map(x => x.v), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  return s('svg', { class: 'spark', viewBox: '0 0 80 22', 'aria-label': `1RM estimé de ${fmtKg(v[0])} à ${fmtKg(v[v.length - 1])} kg` },
    s('polyline', { points: v.map((y, i) => `${i * 80 / (v.length - 1)},${20 - (y - lo) / r * 18}`).join(' ') }));
}
const STATUS = { up: ['Prêt à monter', 0], down: ['À alléger', 1], go: ['En cours', 2], new: ['À tester', 3] };
let progFilter = 'Toutes', progSort = 'st', balWeek = 'this';

function viewProgram() {
  setTab('program');
  const sess = liveSessions().filter(r => setsDone(r) > 0);
  const P = programFor(today());

  // A. Semaine type, du lundi au dimanche
  const week = h('div', { class: 'pweek' }, [1, 2, 3, 4, 5, 6, 0].map(d => {
    const n = P.days[d];
    if (!n) return h('div', { class: 'pday rest' }, h('span', { class: 'dn' }, cap(JOURS[d])), 'Repos');
    const list = P.sessions[n], est = estMinutes(list);
    const timed = sess.filter(r => r.name === n && r.clock?.start);
    const real = timed.length ? fmtMin(timed.reduce((a, r) => a + duration(r), 0) / timed.length) : null;
    return h('div', { class: 'pday' },
      h('span', { class: 'dn' }, cap(JOURS[d])), h('span', { class: 'sn' }, n),
      h('span', { class: 'est' + (est > 60 ? ' over' : '') }, `${list.reduce((a, e) => a + e.sets, 0)} séries · `, h('b', {}, `≈ ${est} min`), real ? ` · réel ${real}` : ''),
      list.map(e => h('div', { class: 'pex' }, gdot(e.id),
        h('span', { class: 'nm' }, e.name),
        h('span', { class: 'dt' }, `${repsLabel(e)} · repos ${fmtRest(e.rest)}${e.note ? ' · ' + e.note : ''}`))));
  }));

  // B. Équilibre musculaire : prévu (barre) et réel de la semaine choisie (trait)
  const plan = plannedSets(P);
  const thisWs = weekStartOf(today());
  const lastWs = (() => { const d = parseYmd(thisWs); d.setDate(d.getDate() - 7); return ymd(d); })();
  const from = balWeek === 'last' ? lastWs : thisWs, to = balWeek === 'last' ? thisWs : '9999';
  const real = {};
  for (const r of sess) if (r.date >= from && r.date < to) for (const [exId, e] of Object.entries(r.entries || {})) { const g = GROUP[exId]; if (g) real[g] = (real[g] || 0) + doneSets(e).length; }
  const weekLabel = balWeek === 'last' ? `la semaine dernière (du ${fmtDate(lastWs)})` : `cette semaine (depuis le ${fmtDate(thisWs)})`;
  // Le prévu est celui du programme actif cette semaine-là.
  const wplan = plannedSets(programFor(from));
  const MAX = Math.max(45, ...Object.values(wplan), ...Object.values(real));
  const pct = v => Math.min(100, v / MAX * 100);
  const bal = h('div', { class: 'card pbal' },
    h('div', { class: 'pfilters' }, [['this', 'Cette semaine'], ['last', 'Semaine dernière']].map(([k, label]) =>
      h('button', { class: 'pill' + (balWeek === k ? ' on' : ''), onclick: () => { balWeek = k; const y = window.scrollY; viewProgram(); window.scrollTo(0, y); } }, label))),
    GROUPS.map(g => {
      const p = wplan[g] || 0, r = real[g] || 0, low = g !== 'Abdos' && p < 10;
      return h('div', { class: 'brow' },
        h('span', { class: 'lbl' }, h('span', { class: 'gdot', style: `background:${GCOLOR[g]}` }), g + (PRIORITY.has(g) ? ' ★' : '')),
        h('div', { class: 'track', title: `${g} : ${p} séries prévues, ${r} faites ${weekLabel}` },
          h('span', { class: 'band', style: `left:${pct(10)}%;width:${pct(20) - pct(10)}%` }),
          h('span', { class: 'bar', style: `width:${pct(p)}%;background:${GCOLOR[g]}` }),
          h('span', { class: 'real', style: `left:calc(${pct(r)}% - 1.5px)` })),
        h('span', { class: 'val' + (low ? ' low' : '') }, `${p} prévues`, h('small', {}, `${r} faites`)));
    }),
    h('div', { class: 'axis' }, h('span'), h('div', { class: 'ticks' }, [0, 10, 20, 30, 40].filter(t => t <= MAX).map(t => h('span', { style: `left:${pct(t)}%` }, t))), h('span')),
    h('div', { class: 'plegend' },
      h('span', {}, h('i', { class: 'k-bar' }), 'Séries prévues par semaine'),
      h('span', {}, h('i', { class: 'k-real' }), `Faites ${weekLabel}`),
      h('span', {}, h('i', { class: 'k-band' }), 'Zone conseillée : 10 à 20 séries')),
    h('p', { class: 'sub' }, 'Jambes détaillées : ', Object.entries(LEG_PARTS).map(([k, ids]) => `${k} ${Object.values(plannedSets(P, e => ids.includes(e.id))).reduce((a, v) => a + v, 0)}`).join(' · '),
      ' séries prévues. Le soulevé de terre et le roumain sollicitent aussi le dos sans être comptés dans « Dos ».'));

  // C. Progression par exercice (tableau unique, filtrable et triable)
  const where = {};
  for (const [n, list] of Object.entries(P.sessions)) for (const e of list) (where[e.id] = where[e.id] || []).push(n);
  // Dernier remplacement en séance (iPhone) de chaque exercice prévu.
  const swappedOn = {};
  for (const r of liveSessions()) for (const from of Object.keys(r.swaps || {})) if (!swappedOn[from] || r.date > swappedOn[from]) swappedOn[from] = r.date;
  const all = progExercises(P).map(ex => ({ ex, s: exStatus(ex), where: where[ex.id] }));
  const filters = ['Toutes', ...Object.keys(P.sessions), '|', ...GROUPS];
  let rows = all.filter(x => progFilter === 'Toutes' || x.where.includes(progFilter) || GROUP[x.ex.id] === progFilter);
  const order = Object.keys(P.sessions);
  rows = rows.slice().sort((a, b) => progSort === 'st' ? STATUS[a.s.st][1] - STATUS[b.s.st][1] || order.indexOf(a.where[0]) - order.indexOf(b.where[0])
    : progSort === 's' ? order.indexOf(a.where[0]) - order.indexOf(b.where[0]) : a.ex.name.localeCompare(b.ex.name, 'fr'));
  const up = rows.filter(x => x.s.st === 'up').length;
  const sortTh = (k, label) => h('th', { class: 'sortable' + (progSort === k ? ' on' : ''), onclick: () => { progSort = k; viewProgram(); } }, label);
  const table = h('div', { class: 'card' },
    h('div', { class: 'pfilters' },
      filters.map(f => f === '|' ? h('span', { class: 'sep' }) : h('button', { class: 'pill' + (progFilter === f ? ' on' : ''), onclick: () => { progFilter = f; viewProgram(); } }, f)),
      h('span', { class: 'sub', style: 'margin-left:auto' }, `${rows.length} exercice${rows.length > 1 ? 's' : ''} · ${up} prêt${up > 1 ? 's' : ''} à monter`)),
    h('div', { style: 'overflow-x:auto' }, h('table', { class: 'ptable' },
      h('tr', {}, sortTh('s', 'Séance'), sortTh('n', 'Exercice'), h('th', {}, 'Objectif'), h('th', { class: 'num' }, 'Charge'), h('th', {}, 'Dernière fois'), h('th', {}, 'Haut de fourchette'), sortTh('st', 'Statut'), h('th', { class: 'num' }, 'Prochaine charge'), h('th', {}, 'Tendance 1RM'),
        h('th', { class: 'num', title: 'Charge la plus lourde validée, avec le meilleur nombre de reps à cette charge' }, 'Record'), h('th', { title: 'Record visé à la prochaine séance, d\'après l\'objectif que proposera l\'appli' }, 'PR visé')),
      rows.map(({ ex, s: st, where: w }) => { const rc = exRecord(ex, st); return h('tr', { class: 'click', onclick: () => { location.hash = '#/exercices/' + ex.id; } },
        h('td', {}, w.join(', ')),
        h('td', { class: 'exn' }, gdot(ex.id), ex.name),
        h('td', {}, `${repsLabel(ex)}`),
        h('td', { class: 'num' }, st.top != null ? `${fmtKg(st.top)} kg` : '–'),
        h('td', {}, st.reps ? [st.reps.join(' · '), h('small', {}, fmtDate(st.date))] : '–',
          swappedOn[ex.id] && !(st.date >= swappedOn[ex.id]) ? h('small', { class: 'swapnote' }, `⇄ remplacé le ${fmtDate(swappedOn[ex.id])}`) : null),
        h('td', {}, h('span', { class: 'prog', title: st.nTop != null ? `${st.nTop} série(s) sur ${ex.sets} au haut de ${perSet(ex) ? 'leur fourchette' : `la fourchette (${ex.hi} reps)`}` : '' },
          Array.from({ length: ex.sets }, (_, i) => h('i', { class: i < (st.nTop || 0) ? 'ok' : '' })))),
        h('td', {}, h('span', { class: 'st ' + st.st }, STATUS[st.st][0]),
          st.load === 'up' ? h('span', { class: 'tag up' }, ' ↑ jugée légère') : st.load === 'down' ? h('span', { class: 'tag down' }, ' ↓ jugée lourde') : null),
        h('td', { class: 'num' }, st.st === 'new' ? 'à trouver' : st.st === 'up' ? h('b', {}, `${fmtKg(st.next)} kg`) : `${fmtKg(st.next)} kg`),
        h('td', {}, spark(ex.id)),
        h('td', { class: 'num', title: rc ? `Établi le ${fmtDate(rc.date)}` : '' }, rc ? [`${fmtKg(rc.kg)} × ${rc.reps}`, rc.fresh ? h('span', { class: 'up' }, ' ↑') : null] : '–'),
        h('td', {}, rc?.pr ? [h('span', { class: 'prtag' }, 'PR'), ' ', rc.pr] : h('span', { class: 'sub' }, '–'))); }))));

  // D. Règles du programme
  const steps = [...new Set(progExercises(P).map(e => e.step))].sort((a, b) => a - b);
  const rule = (tag, title, text) => h('div', { class: 'card prule' }, h('span', { class: 'ptag' }, tag), h('b', {}, title), h('span', { class: 'sub' }, text));
  const days = [1, 2, 3, 4, 5, 6, 0].filter(d => P.days[d]).map(d => `${JOURS[d]} ${P.days[d]}`).join(', ');
  const rules = h('div', { class: 'prules' },
    rule('Structure', `${Object.keys(P.sessions).length} séances, ${Object.values(P.days).filter(Boolean).length} jours par semaine`, `${cap(days)}.`),
    rule('Progression', 'Double progression', `Monter les reps jusqu'au haut de la fourchette sur toutes les séries, puis la charge (pas de ${steps.map(fmtKg).join(', ')} kg selon l'exercice).`),
    rule('Intensité', '1 à 2 reps en réserve', 'Chaque série s\'arrête 1 à 2 répétitions avant l\'échec (colonne « réserve » de l\'appli).'),
    rule('Repos', `${fmtRest(Math.min(...progExercises(P).map(e => e.rest)))} à ${fmtRest(Math.max(...progExercises(P).map(e => e.rest)))}`, 'Repos longs sur les gros mouvements, courts sur l\'isolation.'),
    rule('Priorités', 'Pecs, bras, jambes', `${plan.Pecs} séries pecs, ${plan.Bras} bras, ${plan.Jambes} jambes par semaine.`),
    // Objectifs réglés (Objectifs ou iPhone), jamais écrits dans le code : la page sert à chacun.
    rule('Objectifs', [goals?.poids != null ? `${fmtKg(goals.poids)} kg` : null, srcOf('pas') !== 'off' ? `${fmtInt(stepGoal())} pas / jour` : null].filter(Boolean).join(' · ') || 'Aucun objectif réglé',
      'Réglés dans l\'onglet Objectifs ou sur l\'iPhone.'));

  mount(
    versionBar(),
    h('h2', {}, `Règles du programme · ${P.label}`), rules,
    h('h2', {}, 'Semaine type'),
    h('div', { style: 'overflow-x:auto' }, week),
    h('div', { class: 'plegend' }, GROUPS.map(g => h('span', {}, h('span', { class: 'gdot', style: `background:${GCOLOR[g]}` }), g)),
      h('span', { class: 'sub' }, 'Durée estimée = séries × (repos + 40 s d\'effort) ; « réel » = moyenne de tes séances chronométrées.')),
    h('h2', {}, 'Équilibre musculaire : prévu et réel'), bal,
    h('h2', {}, 'Où j\'en suis sur chaque exercice'), table);
}

// ---------- Éditeur de programme : brouillon, application datée, historique ----------
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const rng = e => e.lo === e.hi ? String(e.lo) : `${e.lo}-${e.hi}`;
const addDays = (str, n) => { const d = parseYmd(str); d.setDate(d.getDate() + n); return ymd(d); };
const keptRanges = new Map(), keptLoads = new Map();
let editSession = null, applyOpen = false, replacing = null, histOpen = null, progSaveTimer = null;

async function saveProgDoc() {
  clearTimeout(progSaveTimer);
  setStatus('Enregistrement du programme…');
  try {
    await api('/api/programs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Muscu': '1' }, body: JSON.stringify(progDoc) });
    setStatus('Programme enregistré ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 'ok');
    return true;
  } catch (e) { setStatus('Échec de l\'enregistrement du programme : ' + e.message, 'err'); return false; }
}
const saveDraftSoon = () => { clearTimeout(progSaveTimer); progSaveTimer = setTimeout(saveProgDoc, 800); };

// Brouillon = copie de la dernière version (ou de la version à corriger), avec le groupe musculaire écrit sur chaque exercice.
function newDraft(fixOf) {
  const vs = versions(), base = fixOf ? vs.find(v => v.id === fixOf) : vs[vs.length - 1];
  const n = Math.max(0, ...vs.map(v => parseInt(String(v.id).replace(/\D/g, ''), 10) || 0)) + 1;
  progDoc.draft = { id: fixOf || `p${n}`, label: fixOf ? base.label : `Programme ${n}`, days: clone(base.days), sessions: clone(base.sessions), baseId: base.id, fixOf: fixOf || null, updatedAt: Date.now() };
  for (const list of Object.values(progDoc.draft.sessions)) for (const e of list) e.group = e.group || GROUP[e.id] || 'Jambes';
  editSession = null; applyOpen = false;
  saveDraftSoon();
}

function diffPrograms(a, b) {
  const out = [];
  for (const d of DAY_ORDER) if ((a.days[d] || '') !== (b.days[d] || '')) out.push(`${cap(JOURS[d])} : ${a.days[d] || 'repos'} → ${b.days[d] || 'repos'}`);
  for (const n of Object.keys(a.sessions)) if (!b.sessions[n]) out.push(`Séance ${n} supprimée`);
  for (const n of Object.keys(b.sessions)) {
    const A = a.sessions[n], B = b.sessions[n];
    if (!A) { out.push(`Séance ${n} ajoutée (${B.length} exercice${B.length > 1 ? 's' : ''})`); continue; }
    for (const e of A) if (!B.some(x => x.id === e.id)) out.push(`${n} : − ${e.name}`);
    for (const e of B) {
      const o = A.find(x => x.id === e.id);
      if (!o) { out.push(`${n} : + ${e.name} ${repsLabel(e)}`); continue; }
      const ch = [];
      if (o.name !== e.name) ch.push(`renommé « ${e.name} »`);
      if (o.sets !== e.sets) ch.push(`séries ${o.sets} → ${e.sets}`);
      const rl = x => perSet(x) ? `${SET_MODES[x.mode].toLowerCase()} ${repsLabel(x)}` : rng(x);
      if (rl(o) !== rl(e)) ch.push(`reps ${rl(o)} → ${rl(e)}`);
      if (o.rest !== e.rest) ch.push(`repos ${o.rest} → ${e.rest} s`);
      if (o.step !== e.step) ch.push(`pas ${fmtKg(o.step)} → ${fmtKg(e.step)} kg`);
      if ((o.kg ?? null) !== (e.kg ?? null)) ch.push(`charge de départ ${o.kg == null ? '–' : fmtKg(o.kg)} → ${e.kg == null ? '–' : fmtKg(e.kg)} kg`);
      if ((o.note || '') !== (e.note || '')) ch.push('consigne modifiée');
      if ((o.group || GROUP[o.id]) !== (e.group || GROUP[e.id])) ch.push(`groupe ${e.group}`);
      if (ch.length) out.push(`${n} : ${o.name}, ${ch.join(', ')}`);
    }
    const keep = (X, Y) => X.filter(e => Y.some(x => x.id === e.id)).map(e => e.id).join();
    if (keep(A, B) !== keep(B, A)) out.push(`${n} : ordre des exercices modifié`);
  }
  return out;
}

function versionBar() {
  const vs = versions(), active = programFor(today()), D = progDoc.draft;
  return h('div', { class: 'card vbar' },
    vs.slice(-3).map(v => h('div', { class: 'vchip' + (v.id === active.id ? ' active' : v.from > today() ? ' future' : ' old') },
      h('b', {}, v.label), h('span', {}, v.from > today() ? `à partir du ${fmtDate(v.from)}` : `depuis le ${fmtDate(v.from)}`))),
    D ? h('div', { class: 'vchip dr' }, h('b', {}, D.fixOf ? `Correction de ${D.label}` : `${D.label} · brouillon`), h('span', {}, 'non appliqué')) : null,
    h('span', { style: 'flex:1' }),
    !progOk ? h('span', { class: 'sub', style: 'color:var(--bad)' }, 'Versions du programme illisibles (relance le dashboard) : modification désactivée.') :
    h('a', { class: 'btn' + (D ? ' draft' : ''), href: '#/programme/modifier', onclick: () => { if (!progDoc.draft) newDraft(); } }, D ? 'Continuer le brouillon' : 'Modifier le programme'),
    h('a', { class: 'btn secondary', href: '#/programme/historique' }, 'Historique des versions'));
}

function viewProgramEdit() {
  setTab('program');
  const D = progDoc.draft;
  if (!D || !progOk) { location.hash = '#/programme'; return; }
  const base = versions().find(v => v.id === D.baseId) || programFor(today());
  const names = Object.keys(D.sessions);
  if (!names.includes(editSession)) editSession = names[0] || null;
  const redraw = () => { const y = window.scrollY; viewProgramEdit(); window.scrollTo(0, y); };
  const changed = (refresh = true) => { D.updatedAt = Date.now(); saveDraftSoon(); if (refresh) redraw(); };

  // Jours d'entraînement
  const days = h('div', { class: 'edays' }, DAY_ORDER.map(d => {
    const sel = h('select', {}, h('option', { value: '' }, 'Repos'), names.map(n => h('option', { value: n, selected: D.days[d] === n }, n)));
    sel.addEventListener('change', () => { if (sel.value) D.days[d] = sel.value; else delete D.days[d]; changed(); });
    return h('label', { class: 'eday' + (D.days[d] ? '' : ' off') }, h('span', {}, cap(JOURS[d])), sel);
  }));

  // Onglets des séances et actions
  const renameSession = () => {
    const nn = (prompt('Nouveau nom de la séance', editSession) || '').trim();
    if (!nn || nn === editSession) return;
    if (D.sessions[nn]) { alert('Ce nom existe déjà.'); return; }
    D.sessions = Object.fromEntries(Object.entries(D.sessions).map(([k, v]) => [k === editSession ? nn : k, v]));
    for (const k of Object.keys(D.days)) if (D.days[k] === editSession) D.days[k] = nn;
    editSession = nn; changed();
  };
  // Modèles (templates.js) : remplacent les jours et les séances du brouillon, sans toucher à l'historique.
  const tplSelect = () => {
    const sel = h('select', { class: 'tplsel', title: 'Remplacer le brouillon par un modèle de programme' }, h('option', { value: '' }, 'Partir d\'un modèle…'),
      TEMPLATES.map(t => h('option', { value: t.id }, `${t.label} (${t.desc})`)));
    sel.addEventListener('change', () => {
      const t = TEMPLATES.find(x => x.id === sel.value);
      if (!t || !confirm(`Remplacer tout le brouillon par le modèle « ${t.label} » ? Les séances déjà faites restent dans l'historique.`)) { sel.value = ''; return; }
      D.days = clone(t.days); D.sessions = clone(t.sessions); editSession = null; replacing = null;
      for (const list of Object.values(D.sessions)) for (const e of list) GROUP[e.id] = e.group || GROUP[e.id];
      changed();
    });
    return sel;
  };
  const tabs = h('div', { class: 'stabs' },
    names.map(n => h('button', { class: 'pill' + (n === editSession ? ' on' : ''), onclick: () => { editSession = n; replacing = null; redraw(); } }, n)),
    h('button', { class: 'pill add', onclick: () => {
      const nn = (prompt('Nom de la nouvelle séance (par exemple « Full body »)') || '').trim();
      if (!nn) return; if (D.sessions[nn]) { alert('Ce nom existe déjà.'); return; }
      D.sessions[nn] = []; editSession = nn; changed();
    } }, '+ Séance'),
    tplSelect(),
    h('span', { style: 'flex:1' }),
    editSession ? [
      h('button', { class: 'btn small secondary', onclick: renameSession }, 'Renommer'),
      h('button', { class: 'btn small secondary', onclick: () => { let nn = `${editSession} (copie)`; while (D.sessions[nn]) nn += ' bis'; D.sessions[nn] = clone(D.sessions[editSession]); editSession = nn; changed(); } }, 'Dupliquer'),
      h('button', { class: 'btn small danger', onclick: () => {
        if (!confirm(`Supprimer la séance « ${editSession} » du brouillon ? Les séances déjà faites restent dans l'historique.`)) return;
        delete D.sessions[editSession];
        for (const k of Object.keys(D.days)) if (D.days[k] === editSession) delete D.days[k];
        editSession = null; changed();
      } }, 'Supprimer')] : null);

  // Tableau des exercices de la séance choisie
  const list = D.sessions[editSession] || [];
  const baseEx = id => Object.values(base.sessions).flat().find(e => e.id === id);
  const field = (e, k, opts = {}) => {
    const b = baseEx(e.id), isNum = k !== 'name' && k !== 'note';
    const cur = e[k] == null ? '' : isNum ? fmtKg(e[k]) : e[k];
    const was = b ? (b[k] == null ? '' : isNum ? fmtKg(b[k]) : b[k]) : cur;
    const i = h('input', { class: 'ein' + (isNum ? ' n' : '') + (cur !== was ? ' chg' : ''), value: cur, placeholder: opts.ph || '', title: cur !== was ? `Avant : ${was === '' ? '–' : was}` : String(cur), style: opts.w ? `width:${opts.w}px` : '' });
    i.addEventListener('change', () => {
      if (!isNum) e[k] = i.value.trim();
      else {
        const v = num(i.value);
        if (k === 'kg') e.kg = v;
        else if (v != null && v >= 0) e[k] = k === 'sets' ? Math.max(1, Math.round(v)) : v;
        if (e.lo > e.hi) { if (k === 'lo') e.hi = e.lo; else e.lo = e.hi; }
        if (k === 'sets') fixRanges(e);
      }
      if (k === 'note' && !e.note) delete e.note;
      changed();
    });
    return i;
  };
  // Fourchettes : une seule (Identique) ou une par série (Top set, Pyramide) ; lo/hi suivent les extrêmes.
  // Repasser en « Identique » garde les fourchettes de côté (keptRanges) le temps de l'édition.
  // Perso : une liste de charges par série (une case par rep) ; ranges = [[n, n]] suit le nombre de cases.
  const fixRanges = e => {
    if (e.mode !== 'perso' && e.loads) { keptLoads.set(e.id, e.loads); delete e.loads; }
    if (!SET_MODES[e.mode]) { if (e.ranges) keptRanges.set(e.id, e.ranges); delete e.mode; delete e.ranges; return; }
    if (e.mode === 'perso') {
      const n = Math.max(1, Math.min(30, e.hi || e.lo || 8));
      const src = Array.isArray(e.loads) && e.loads.length ? e.loads : keptLoads.get(e.id) || [Array.from({ length: n }, () => e.kg ?? null)];
      e.loads = Array.from({ length: e.sets }, (_, i) => [...(src[i] || src[src.length - 1])]);
      e.ranges = e.loads.map(l => [l.length, l.length]);
    } else {
      const r = Array.isArray(e.ranges) && e.ranges.length ? e.ranges : keptRanges.get(e.id) || [[e.lo, e.hi]];
      e.ranges = Array.from({ length: e.sets }, (_, i) => [...(r[i] || r[r.length - 1])]);
    }
    e.lo = Math.min(...e.ranges.map(x => x[0])); e.hi = Math.max(...e.ranges.map(x => x[1]));
  };
  // Case de charge d'une rep (Perso) : vide = à saisir en séance.
  const loadIn = (e, i, j) => {
    const b = baseEx(e.id), was = b && isPerso(b) ? loadsAt(b, i)?.[j] : undefined, cur = e.loads[i][j];
    const inp = h('input', { class: 'ein n' + (cur !== was ? ' chg' : ''), value: cur == null ? '' : fmtKg(cur), placeholder: '–', title: `Série ${i + 1}, rep ${j + 1}`, 'aria-label': `Série ${i + 1}, rep ${j + 1}, kg`, style: 'width:42px' });
    inp.addEventListener('change', () => { const v = num(inp.value); e.loads[i][j] = v != null && v >= 0 ? v : null; changed(); });
    return inp;
  };
  const persoRows = e => [
    h('div', { class: 'rgl pl' }, h('small', {}), ...Array.from({ length: Math.max(...e.loads.map(l => l.length)) }, (_, j) => h('small', { class: 'rh' }, `r${j + 1}`))),
    ...e.loads.map((l, i) => h('div', { class: 'rgl pl' }, h('small', {}, `S${i + 1}`), ...l.map((_, j) => loadIn(e, i, j)),
      h('button', { class: 'btn small secondary', title: 'Ajouter une rep (reprend la charge de la case précédente)', disabled: l.length >= 30, onclick: () => { l.push(l[l.length - 1] ?? null); fixRanges(e); changed(); } }, '+ rep'),
      h('button', { class: 'btn small secondary', title: 'Retirer la dernière rep', disabled: l.length <= 1, onclick: () => { l.pop(); fixRanges(e); changed(); } }, '− rep'))),
  ];
  const rangeIn = (e, i, j) => {
    const b = baseEx(e.id), was = b ? rangeAt(b, i)[j] : e.ranges[i][j], cur = e.ranges[i][j];
    const inp = h('input', { class: 'ein n' + (cur !== was || !perSet(b || {}) ? ' chg' : ''), value: cur, title: `Série ${i + 1}`, style: 'width:34px' });
    inp.addEventListener('change', () => {
      const v = num(inp.value);
      if (v != null && v >= 0) { const r = e.ranges[i]; r[j] = Math.round(v); if (r[0] > r[1]) r[j ? 0 : 1] = r[j]; }
      fixRanges(e); changed();
    });
    return inp;
  };
  const repsCell = e => {
    const msel = h('select', { class: 'ein mode', title: 'Fourchette identique pour toutes les séries, une par série (Top set, Pyramide), ou une charge par rep (Perso)' },
      [['', 'Identique'], ...Object.entries(SET_MODES)].map(([v, l]) => h('option', { value: v, selected: (e.mode || '') === v }, l)));
    msel.addEventListener('change', () => { if (msel.value) e.mode = msel.value; else delete e.mode; fixRanges(e); changed(); });
    // Perso : le résumé ici, la grille des charges sur une ligne pleine largeur sous l'exercice (persoSubRow).
    if (isPerso(e)) return [msel, ' ', h('span', { class: 'sub' }, persoRepsTxt(e))];
    return [msel, perSet(e) ? e.ranges.map((_, i) => h('div', { class: 'rgl' }, h('small', {}, `S${i + 1}`), rangeIn(e, i, 0), '–', rangeIn(e, i, 1)))
      : h('div', { class: 'rgl' }, field(e, 'lo', { w: 40 }), '–', field(e, 'hi', { w: 40 }))];
  };
  // Choix d'un exercice : catalogue des machines groupé par muscle, plus les exercices déjà utilisés hors catalogue.
  const exerciseSelect = (exclude, firstLabel) => {
    const known = [...CATALOG, ...Object.values(EXERCISES).filter(e => !CATALOG.some(c => c.id === e.id))];
    return h('select', {}, h('option', { value: '' }, firstLabel),
      EDIT_GROUPS.map(g => h('optgroup', { label: g }, known.filter(e => (e.group || GROUP[e.id]) === g && !exclude.includes(e.id)).map(e => h('option', { value: e.id }, `${e.name} · ${repsLabel(e)}`)))),
      h('option', { value: '__new' }, '➕ Créer un nouvel exercice…'));
  };
  const pick = id => {
    if (id === '__new') {
      const name = (prompt('Nom du nouvel exercice') || '').trim();
      if (!name) return null;
      return { id: `u_${Date.now().toString(36)}`, name, group: 'Pecs', sets: 3, lo: 8, hi: 12, rest: 90, step: 2.5, kg: null };
    }
    const src = CATALOG.find(c => c.id === id) || EXERCISES[id];
    if (!src) return null;
    const e = clone(src); e.group = e.group || GROUP[e.id] || 'Jambes'; if (e.kg === undefined) e.kg = null;
    return e;
  };
  const rows = list.map((e, i) => {
    const b = baseEx(e.id);
    const gsel = h('select', { class: 'ein' + (b && (b.group || GROUP[b.id]) !== e.group ? ' chg' : '') }, EDIT_GROUPS.map(g => h('option', { selected: e.group === g }, g)));
    gsel.addEventListener('change', () => { e.group = gsel.value; GROUP[e.id] = gsel.value; changed(); });
    let nameCell = [gdot(e.id), field(e, 'name', { w: 125 }), h('button', { class: 'ico q', title: 'Fiche de l\'exercice', onclick: () => showFicheModal(e.id) }, '?'), b ? null : h('span', { class: 'badge n' }, 'nouveau')];
    if (replacing === e.id) {
      const sel = exerciseSelect(list.map(x => x.id), `Remplacer « ${e.name} » par…`);
      sel.addEventListener('change', () => { const ne = sel.value && pick(sel.value); if (!ne) return; list[i] = ne; GROUP[ne.id] = ne.group; replacing = null; changed(); });
      nameCell = [sel, h('button', { class: 'btn small secondary', onclick: () => { replacing = null; redraw(); } }, 'Annuler')];
    }
    const move = dir => () => { const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); };
    const row = h('tr', { class: (b ? '' : 'new') + (isPerso(e) ? ' has-perso' : '') },
      h('td', { class: 'ord' }, h('button', { class: 'ico', title: 'Monter', disabled: i === 0, onclick: move(-1) }, '↑'), h('button', { class: 'ico', title: 'Descendre', disabled: i === list.length - 1, onclick: move(1) }, '↓')),
      h('td', { class: 'exn' }, nameCell),
      h('td', {}, gsel),
      h('td', {}, field(e, 'sets', { w: 40 })),
      h('td', { class: 'reps' }, repsCell(e)),
      h('td', {}, field(e, 'rest', { w: 44 })),
      h('td', {}, field(e, 'step', { w: 42 })),
      h('td', {}, isPerso(e) ? h('span', { class: 'sub', style: 'font-style:italic' }, 'par rep') : field(e, 'kg', { w: 44, ph: '–' })),
      h('td', {}, field(e, 'note', { w: 90, ph: 'consigne' })),
      h('td', { class: 'acts' },
        h('button', { class: 'ico', title: 'Remplacer par un autre exercice (nouvel historique)', onclick: () => { replacing = e.id; redraw(); } }, '⇄'),
        h('button', { class: 'ico del', title: 'Retirer de la séance', onclick: () => { list.splice(i, 1); changed(); } }, '✕')));
    if (!isPerso(e)) return row;
    return [row, h('tr', { class: 'perso-sub' }, h('td'), h('td', { colspan: '9' },
      h('div', { class: 'pgrid' }, h('div', { class: 'sub' }, 'Charges par rep (kg)'), persoRows(e))))];
  });
  const addSel = exerciseSelect(list.map(x => x.id), 'Ajouter un exercice…');
  addSel.addEventListener('change', () => { const ne = addSel.value && pick(addSel.value); if (!ne) { addSel.value = ''; return; } list.push(ne); GROUP[ne.id] = ne.group; changed(); });
  const removed = Object.values(base.sessions[editSession] || []).filter(e => !list.some(x => x.id === e.id));

  const editor = h('div', { class: 'card', style: 'display:grid;gap:10px;min-width:0' }, tabs,
    editSession ? [
      h('div', { style: 'overflow-x:auto' }, h('table', { class: 'etable' },
        h('tr', {}, h('th', {}), h('th', {}, 'Exercice'), h('th', {}, 'Groupe'), h('th', {}, 'Séries'), h('th', {}, 'Reps'), h('th', {}, 'Repos (s)'), h('th', {}, 'Pas (kg)'), h('th', {}, 'Départ (kg)'), h('th', {}, 'Consigne'), h('th', {})),
        rows,
        removed.map(e => h('tr', { class: 'rm' }, h('td'), h('td', { class: 'exn' }, e.name, h('span', { class: 'badge r' }, 'retiré')), h('td', { colspan: 7 }), h('td', { class: 'acts' },
          h('button', { class: 'ico', title: 'Remettre', onclick: () => { list.push(clone(e)); changed(); } }, '↺')))))),
      h('div', { class: 'row' }, addSel, h('span', { class: 'sub' }, 'Remplacer (⇄) donne au nouvel exercice son propre historique ; renommer un exercice garde le sien. Survole une case colorée pour voir l\'ancienne valeur.'))]
      : h('div', { class: 'empty' }, 'Aucune séance : crée-en une avec « + Séance ».'));

  // Impact en direct
  const pd = plannedSets(D), pb = plannedSets(base), M = Math.max(45, ...Object.values(pd));
  const changes = diffPrograms(base, D);
  const impact = h('div', { class: 'card impact' },
    h('h3', {}, 'Impact du brouillon'),
    GROUPS.map(g => { const v = pd[g] || 0, o = pb[g] || 0, dv = v - o; return h('div', { class: 'irow' }, h('span', {}, g),
      h('div', { class: 'itrack' }, h('span', { class: 'band', style: `left:${10 / M * 100}%;width:${10 / M * 100}%` }), h('span', { class: 'b', style: `width:${Math.min(100, v / M * 100)}%;background:${GCOLOR[g]}` }), dv ? h('span', { class: 'ghost', style: `left:${Math.min(100, o / M * 100)}%` }) : null),
      h('span', { class: 'ival' + (g !== 'Abdos' && v < 10 ? ' low' : '') }, v, dv ? h('small', { class: dv > 0 ? 'up' : 'down' }, ` ${dv > 0 ? '+' : ''}${dv}`) : null)); }),
    h('p', { class: 'sub' }, 'Séries par semaine ; trait gris = version de départ ; zone verte = 10 à 20.'),
    h('div', { class: 'dur' }, Object.entries(D.sessions).map(([n, l]) => { const m = estMinutes(l), o = base.sessions[n] ? estMinutes(base.sessions[n]) : null;
      return [h('span', {}, n, Object.values(D.days).includes(n) ? '' : h('small', {}, ' (aucun jour)')), h('span', { class: m > 60 ? 'over' : '' }, `≈ ${m} min${o != null && o !== m ? ` (${m > o ? '+' : ''}${m - o})` : ''}`)]; })),
    h('div', { class: 'diff' }, h('b', {}, `Changements (${changes.length})`), changes.length ? changes.map(c => h('span', {}, c)) : h('span', { class: 'sub' }, 'Aucun pour l\'instant.')));

  // Application datée (ou enregistrement d'une correction)
  const vs = versions(), last = vs[vs.length - 1];
  const nextMonday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return ymd(d); })();
  let applyBox = null;
  if (applyOpen) {
    const dateIn = h('input', { type: 'date', value: nextMonday > last.from ? nextMonday : addDays(last.from, 1) });
    const labelIn = h('input', { value: D.label, style: 'width:280px' });
    const err = h('div', { class: 'sub', style: 'color:var(--bad)' });
    const choose = h('div', { class: 'row' },
      h('button', { class: 'btn small secondary', onclick: () => { dateIn.value = nextMonday; } }, `Lundi prochain (${fmtDate(nextMonday)})`),
      h('button', { class: 'btn small secondary', onclick: () => { dateIn.value = today(); } }, `Aujourd'hui (${fmtDate(today())})`),
      h('span', { class: 'sub' }, 'ou une date :'), dateIn);
    // Un double clic pendant l'enregistrement créait deux versions identiques.
    let applying = false;
    const doApply = async () => {
      if (applying) return;
      applying = true;
      try { await applyNow(); } finally { applying = false; }
    };
    const applyNow = async () => {
      const from = dateIn.value;
      if (!D.fixOf && (!from || from <= last.from)) { err.textContent = `La date doit être après le ${fmtDate(last.from)} (début de ${last.label}).`; return; }
      if (!Object.values(D.days).some(Boolean)) { err.textContent = 'Le programme n\'a aucun jour d\'entraînement.'; return; }
      // Le programme intégré devient une vraie version la première fois.
      if (!progDoc.versions.length) progDoc.versions = clone(vs).map(v => ({ ...v, appliedAt: Date.now(), changes: ['Programme de départ'] }));
      const clean = { days: Object.fromEntries(Object.entries(D.days).filter(([, n]) => n)), sessions: clone(D.sessions) };
      if (D.fixOf) {
        const v = progDoc.versions.find(x => x.id === D.fixOf);
        Object.assign(v, clean, { label: labelIn.value.trim() || v.label, changes: [...(v.changes || []), ...changes.map(c => `Correction : ${c}`)] });
      } else if (!progDoc.versions.some(x => x.id === D.id)) {
        progDoc.versions.push({ id: D.id, label: labelIn.value.trim() || D.label, from, ...clean, appliedAt: Date.now(), changes });
      }
      const keep = progDoc.draft; progDoc.draft = null;
      if (!(await saveProgDoc())) { progDoc.draft = keep; err.textContent = 'Échec de l\'enregistrement, rien n\'a été appliqué.'; return; }
      applyOpen = false; fillExercises(); location.hash = '#/programme';
    };
    applyBox = h('div', { class: 'card applybox' },
      h('h3', {}, D.fixOf ? `Enregistrer la correction de « ${D.label} »` : 'Appliquer le brouillon'),
      D.fixOf ? h('p', { class: 'sub' }, 'La version garde sa date de début ; le changement s\'applique aussi aux semaines déjà passées de cette version.')
        : [h('p', { class: 'sub' }, `À partir de quelle date ? Les séances faites avant cette date restent rattachées à ${last.label}.`), choose],
      h('label', { class: 'row' }, h('span', { class: 'sub' }, 'Nom de la version'), labelIn),
      err,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: doApply }, D.fixOf ? 'Enregistrer la correction' : 'Appliquer'), h('button', { class: 'btn secondary', onclick: () => { applyOpen = false; redraw(); } }, 'Annuler')));
  }

  mount(
    h('a', { href: '#/programme' }, '‹ Programme'),
    h('div', { class: 'banner' },
      h('b', {}, D.fixOf ? `Correction de « ${D.label} »` : `Brouillon « ${D.label} »`),
      h('span', {}, 'Rien n\'est envoyé à l\'iPhone tant que tu n\'as pas appliqué. Enregistré automatiquement dans ton dépôt privé.'),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn small danger', onclick: () => { if (!confirm('Abandonner le brouillon ? Toutes ses modifications seront perdues.')) return; progDoc.draft = null; saveProgDoc(); location.hash = '#/programme'; } }, 'Abandonner'),
      h('button', { class: 'btn small', onclick: () => { applyOpen = true; redraw(); } }, D.fixOf ? 'Enregistrer…' : 'Appliquer…')),
    applyBox,
    h('div', { class: 'card', style: 'display:grid;gap:8px' }, h('h3', {}, 'Jours d\'entraînement'), days),
    h('div', { class: 'elayout' }, editor, impact));
}

function viewProgramHistory() {
  setTab('program');
  const vs = versions(), active = programFor(today());
  const items = vs.map((v, i) => ({ v, to: vs[i + 1] ? addDays(vs[i + 1].from, -1) : null })).reverse();
  mount(
    h('a', { href: '#/programme' }, '‹ Programme'),
    h('h2', {}, 'Historique des versions'),
    h('div', { class: 'card hist' }, items.map(({ v, to }) => h('div', { class: 'hrow' },
      h('div', {}, h('b', {}, v.label, v.id === active.id ? h('span', { class: 'badge n' }, 'active') : v.from > today() ? h('span', { class: 'badge f' }, 'à venir') : null),
        h('small', {}, to ? `${fmtDate(v.from)} → ${fmtDate(to)}` : `${v.from > today() ? 'à partir du' : 'depuis le'} ${fmtDate(v.from)}`)),
      h('div', { class: 'sub' }, (v.changes && v.changes.length ? v.changes : ['Programme de départ']).join(' ; '),
        histOpen === v.id ? h('div', { class: 'hdetail' }, Object.entries(v.sessions).map(([n, l]) => h('div', {},
          h('b', {}, n, ' '), h('span', { class: 'sub' }, `(${DAY_ORDER.filter(d => v.days[d] === n).map(d => JOURS[d]).join(', ') || 'aucun jour'})`),
          h('div', { class: 'sub' }, l.map(e => `${e.name} ${repsLabel(e)}`).join(' · '))))) : null),
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('button', { class: 'btn small secondary', onclick: () => { histOpen = histOpen === v.id ? null : v.id; viewProgramHistory(); } }, histOpen === v.id ? 'Masquer' : 'Voir'),
        progOk && v.id === active.id ? h('button', { class: 'btn small secondary', title: 'Pour une erreur de saisie, sans créer de nouvelle version', onclick: () => {
          if (progDoc.draft && !confirm('Un brouillon est en cours : il sera remplacé par la correction. Continuer ?')) return;
          newDraft(v.id); location.hash = '#/programme/modifier';
        } }, 'Corriger') : null,
        progOk && v.from > today() && progDoc.versions.length ? h('button', { class: 'btn small danger', onclick: async () => {
          // La version annulée redevient le brouillon (sauf si un brouillon existe déjà) : rien n'est perdu.
          const back = !progDoc.draft;
          if (!confirm(`Annuler « ${v.label} », prévue à partir du ${fmtDate(v.from)} ?${back ? '\nElle redeviendra le brouillon.' : '\nUn brouillon existe déjà : cette version sera supprimée définitivement.'}`)) return;
          progDoc.versions = progDoc.versions.filter(x => x.id !== v.id);
          if (back) progDoc.draft = { id: v.id, label: v.label, days: clone(v.days), sessions: clone(v.sessions), baseId: progDoc.versions.length ? progDoc.versions[progDoc.versions.length - 1].id : 'p1', fixOf: null, updatedAt: Date.now() };
          await saveProgDoc(); fillExercises(); viewProgramHistory();
        } }, 'Annuler cette version') : null)))));
}

// ---------- Connexion au dépôt de données ----------
// Les mêmes réglages que l'iPhone (compte, dépôt, jeton), vérifiés auprès de GitHub puis gardés dans ce navigateur.
function viewLogin(msg) {
  document.body.classList.add('logged-out');
  const f = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const owner = h('input', { value: dcfg.owner || '', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
  const repo = h('input', { value: dcfg.repo || 'muscu-data', autocapitalize: 'off', spellcheck: 'false' });
  const token = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Colle le jeton ici' });
  const err = h('div', { class: 'login-err', role: 'alert', hidden: !msg }, msg || '');
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Se connecter');
  const form = h('form', { class: 'card login', onsubmit: async ev => {
    ev.preventDefault();
    const c = { owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() };
    if (!c.owner || !c.repo || !c.token) { err.textContent = 'Renseigne les trois champs.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Vérification…'; err.hidden = true;
    try {
      const acc = await checkAccess(c.token);
      if (!acc.ok) { pingUsage('refus', 'Dashboard · ordinateur'); refusedLogin = acc.login; storeDcfg({ owner: c.owner, repo: c.repo }); return viewRefused(); }
      await checkConnection(c);
    }
    catch (e) { err.textContent = cap(explainError(String(e.message || e))); err.hidden = false; btn.disabled = false; btn.textContent = 'Se connecter'; return; }
    storeDcfg(c); document.body.classList.remove('logged-out'); showAccount(); load();
  } },
    h('h2', {}, 'Connecte ton dashboard'),
    h('p', { class: 'sub' }, 'Mêmes réglages que sur l\'iPhone (Réglages › Synchronisation GitHub).'),
    f('Compte GitHub', owner), f('Dépôt de données', repo), f('Jeton d\'accès', token), err, btn,
    h('p', { class: 'sub' }, 'Le jeton reste dans ce navigateur. Sur un ordinateur partagé, pense à te déconnecter (menu du compte, en haut à droite).'));
  mount(form);
  (dcfg.owner ? token : owner).focus();
}
// Menu du compte, en haut à droite : dépôt connecté, changement de jeton, déconnexion.
const acctBtn = document.getElementById('acct'), acctMenu = document.getElementById('acct-menu');
function showAccount() {
  acctBtn.hidden = !dcfgOk();
  acctBtn.textContent = `${dcfg.owner}/${dcfg.repo} ▾`;
}
function closeAccount() { acctMenu.hidden = true; acctBtn.setAttribute('aria-expanded', 'false'); }
acctBtn.addEventListener('click', ev => {
  ev.stopPropagation();
  if (!acctMenu.hidden) return closeAccount();
  acctMenu.replaceChildren(
    h('b', {}, `Connecté à ${dcfg.owner}/${dcfg.repo}`),
    h('span', { class: 'sub' }, 'Jeton gardé dans ce navigateur.'),
    h('button', { class: 'linkbtn', onclick: () => { closeAccount(); storeDcfg({ owner: dcfg.owner, repo: dcfg.repo }); acctBtn.hidden = true; viewLogin(); } }, 'Changer de dépôt ou de jeton'),
    h('button', { class: 'linkbtn danger', onclick: () => {
      if (hasPending() && !confirm('Des modifications ne sont pas encore enregistrées sur GitHub. Te déconnecter quand même ?')) return;
      closeAccount(); storeDcfg(null); location.reload();
    } }, 'Se déconnecter (efface le jeton de ce navigateur)'));
  acctMenu.hidden = false; acctBtn.setAttribute('aria-expanded', 'true');
});
document.addEventListener('click', ev => { if (!acctMenu.hidden && !acctMenu.contains(ev.target)) closeAccount(); });

function render() {
  if (refusedLogin) return viewRefused();
  if (!dcfgOk()) return viewLogin();
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  window.scrollTo(0, 0);
  switch (parts[0]) {
    case 'seances': return parts[1] ? viewSessionEdit(parts[1]) : viewSessions();
    case 'corps': return viewBody();
    case 'exercices': return viewExercises(parts[1]);
    case 'programme': return parts[1] === 'modifier' ? viewProgramEdit() : parts[1] === 'historique' ? viewProgramHistory() : viewProgram();
    case 'vue': return viewOverview();
    case 'ecarts': return viewGaps();
    default: return viewGoals(); // Objectifs : page ouverte au lancement, comme sur l'iPhone
  }
}
window.addEventListener('hashchange', () => { editing = null; render(); }); // un formulaire déplié se referme en changeant d'onglet
showAccount();
if (dcfgOk()) load(); else viewLogin();
