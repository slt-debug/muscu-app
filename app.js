'use strict';
/* Muscu : suivi de séances. Données en local (localStorage), synchronisées via un dépôt GitHub privé. */

// ---------- Utilitaires ----------
const APP_VERSION = '58 (Withings optionnel)';
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
let cfg = Object.assign({ owner: '', repo: '', path: 'data.json', token: '', sound: 'complet', volume: 1, timbre: 'alarme' }, load(SKEY, {}));
function save() { store(KEY, db); scheduleSync(); }

// ---------- Versions du programme ----------
// Le dashboard PC écrit programs.json dans le dépôt de données ({ versions: [{ id, label, from, days, sessions }] }).
// L'appli le lit à chaque synchro ; sans version reçue, elle utilise le programme intégré (program.js).
const PKEY = 'muscu.programs';
let programs = load(PKEY, null);
const BUILTIN = { id: 'p1', label: 'Programme 1', from: null, days: PROGRAM.days, sessions: PROGRAM.sessions };
function programFor(date) {
  const vs = (programs?.versions || []).filter(v => v.from && v.from <= date).sort((a, b) => a.from.localeCompare(b.from));
  return vs[vs.length - 1] || (programs?.versions || []).slice().sort((a, b) => a.from.localeCompare(b.from))[0] || BUILTIN;
}
// Tous les exercices connus (programme intégré puis versions, la plus récente l'emporte pour le nom).
const EXERCISES = {};
function fillExercises() {
  for (const k of Object.keys(EXERCISES)) delete EXERCISES[k];
  const all = [BUILTIN, ...(programs?.versions || []).slice().sort((a, b) => a.from.localeCompare(b.from))];
  for (const c of CATALOG) EXERCISES[c.id] = c; // réglages par défaut des remplaçants possibles
  for (const p of all) for (const list of Object.values(p.sessions)) for (const ex of list) EXERCISES[ex.id] = ex;
}
fillExercises();

function doneSets(entry) {
  return (entry?.sets || []).filter(x => x.done && x.reps > 0 && x.kg != null && x.kg >= 0);
}
// Historique d'un exercice, du plus ancien au plus récent (hors séance exclue).
function exHistory(exId, excludeId) {
  return Object.values(db.sessions)
    .filter(r => !r.deleted && r.id !== excludeId && r.entries?.[exId])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, sets: doneSets(r.entries[exId]), load: r.entries[exId].load || null }))
    .filter(x => x.sets.length);
}
function bestE1rm(sets) {
  const w = sets.filter(x => x.kg > 0);
  return w.length ? Math.max(...w.map(x => e1rm(x.kg, x.reps))) : null;
}
// Double progression : toutes les séries au haut de la fourchette => on monte la charge.
function suggest(ex, excludeId) {
  const hist = exHistory(ex.id, excludeId);
  if (!hist.length) {
    return { kg: ex.kg, reps: ex.lo, text: ex.kg == null ? 'Première fois : trouve une charge qui laisse 1 à 2 reps en réserve.' : `Charge de départ conseillée : ${fmtKg(ex.kg)} kg.` };
  }
  const last = hist[hist.length - 1];
  const top = Math.max(...last.sets.map(x => x.kg));
  const atTop = last.sets.filter(x => x.kg === top);
  const full = atTop.length >= ex.sets && atTop.every(x => x.reps >= ex.hi);
  const verdict = last.load === 'up' ? ' (jugée trop légère)' : last.load === 'down' ? ' (jugée trop lourde)' : '';
  const summary = `${fmtDate(last.date)} : ${fmtKg(top)} kg × ${atTop.map(x => x.reps).join(', ')}${verdict}`;
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

// ---------- Chrono de séance ----------
// rec.clock = { start, end, pauseMs, pausedAt } en millisecondes ; chaque série validée garde son heure dans st.t.
// Sans « Terminer », la séance s'arrête à la dernière série validée dès qu'on n'est plus dans la séance du jour depuis 30 min.
const IDLE_MS = 30 * 60e3;
function lastSetTime(rec) {
  let t = 0;
  for (const e of Object.values(rec?.entries || {})) for (const x of e.sets || []) if (x.done && x.t > t) t = x.t;
  return t;
}
function clockLive(rec, now = Date.now()) {
  const c = rec?.clock;
  return !!(c?.start && !c.end && !c.pausedAt && rec.date === today() && now - Math.max(c.start, lastSetTime(rec)) < IDLE_MS);
}
function clockEnd(rec, now = Date.now()) {
  const c = rec.clock;
  if (c.end) return c.end;
  if (c.pausedAt) return c.pausedAt;
  return clockLive(rec, now) ? now : Math.max(c.start, lastSetTime(rec));
}
function sessionDuration(rec, now = Date.now()) {
  if (!rec?.clock?.start) return null;
  return Math.max(0, clockEnd(rec, now) - rec.clock.start - (rec.clock.pauseMs || 0));
}
// 2 287 000 ms => « 38:07 » ; plus d'une heure => « 1:02:05 »
function fmtClock(ms) {
  const s = Math.floor((ms || 0) / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60;
  return hh ? `${hh}:${pad2(mm)}:${pad2(s % 60)}` : `${mm}:${pad2(s % 60)}`;
}
// 3 150 000 ms => « 52 min » ; 3 900 000 ms => « 1 h 05 »
function fmtMin(ms) {
  const m = Math.round(ms / 60e3);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)}` : `${m} min`;
}
const fmtHour = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
function editClock(date, name, fn) {
  const id = sessionId(date, name);
  const rec = db.sessions[id] || (db.sessions[id] = { id, date, name, entries: {} });
  rec.clock = rec.clock || { start: null, end: null, pauseMs: 0, pausedAt: null };
  fn(rec.clock, Date.now());
  rec.updatedAt = Date.now();
  rec.deleted = false;
  save();
}
// Le chrono affiché (en-tête de séance, bouton Terminer, barre du minuteur) avance chaque seconde.
setInterval(() => {
  document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = fmtClock(sessionDuration(db.sessions[el.dataset.clock])); });
}, 1000);

// ---------- Minuteur de repos ----------
const timerEl = document.getElementById('timer');
let timer = null, audioCtx = null, audioStale = false;
// iOS 17+ : les bips se mélangent à la musique au lieu de la couper.
try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* non pris en charge */ }
// Sur iPhone, le son ne part que si le contexte audio a été débloqué pendant un toucher.
// Après un passage en arrière-plan, il peut rester « running » mais muet : on le recrée au toucher suivant.
function unlockAudio() {
  unlockSpeech();
  try {
    if (audioCtx && audioStale) { audioCtx.close().catch(() => {}); audioCtx = null; }
    audioStale = false;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    // Un échantillon silencieux joué pendant le toucher termine le déblocage sur iOS.
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination); src.start(0);
  } catch { /* pas d'audio */ }
}
function audioState() {
  const s = audioCtx ? audioCtx.state : 'pas encore créé';
  return `Audio : ${s}${navigator.audioSession ? `, session ${navigator.audioSession.type}` : ''}`;
}
['touchend', 'click'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { audioStale = true; speechReady = false; } });
// Aperçu d'un son : « prépare-toi » à 30 s puis signal de fin (la voix a besoin de plus de temps pour parler).
function previewSound() { unlockAudio(); SOUNDS.prep(30); setTimeout(() => SOUNDS.end(), cfg.timbre === 'voix' ? 1500 : 600); }
// tone(fréquence Hz, départ s, durée s, volume, forme d'onde, options)
// Options : hold = son tenu à plein volume (plus fort qu'un son qui s'éteint), vib = [vitesse Hz, amplitude Hz] pour un trille.
function tone(freq, at, dur, vol, type = 'sine', { hold = false, vib = null } = {}) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + at;
  o.type = type; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
  // Le son le plus fort (0,45) atteint le maximum quand le curseur de volume est à 100 %.
  const peak = Math.min(1, Math.max(0.0002, vol / 0.45 * cfg.volume));
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  if (hold) { g.gain.setValueAtTime(peak, t + Math.max(0.01, dur - 0.02)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (vib) {
    const lfo = audioCtx.createOscillator(), depth = audioCtx.createGain();
    lfo.frequency.value = vib[0]; depth.gain.value = vib[1]; lfo.connect(depth); depth.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.02);
  }
  o.start(t); o.stop(t + dur + 0.02);
}
// Coup de cloche : partiels inharmoniques qui s'éteignent lentement, comme une cloche de ring.
function bell(freq, at, dur) {
  [[1, 0.2], [2, 0.11], [2.76, 0.09], [5.4, 0.05]].forEach(([m, v]) => tone(freq * m, at, dur / Math.sqrt(m), v));
}
const HOLD = { hold: true };
// Chaque son définit les 4 signaux : minute, prépare-toi, top 3-2-1, fin.
const TIMBRES = {
  doux: { label: 'Doux', help: 'Bips ronds et graves, les plus discrets.',
    min: () => tone(520, 0, 0.18, 0.3),
    prep: () => { tone(660, 0, 0.16, 0.3); tone(660, 0.22, 0.16, 0.3); },
    tick: () => tone(1200, 0, 0.06, 0.35, 'triangle'),
    end: () => { tone(880, 0, 0.16, 0.4); tone(988, 0.2, 0.16, 0.4); tone(1320, 0.4, 0.5, 0.45); } },
  clair: { label: 'Clair', help: 'Bips aigus et tenus, dans la zone où le haut-parleur de l\'iPhone porte le mieux.',
    min: () => tone(1568, 0, 0.15, 0.45, 'triangle', HOLD),
    prep: () => { tone(1976, 0, 0.13, 0.45, 'triangle', HOLD); tone(1976, 0.2, 0.13, 0.45, 'triangle', HOLD); },
    tick: () => tone(2637, 0, 0.05, 0.45, 'triangle', HOLD),
    end: () => { tone(1568, 0, 0.15, 0.45, 'triangle', HOLD); tone(1976, 0.18, 0.15, 0.45, 'triangle', HOLD); tone(2637, 0.36, 0.45, 0.45, 'triangle', HOLD); } },
  alarme: { label: 'Alarme', help: 'Bip de montre digitale, sec et perçant. Le plus audible dans une salle bruyante.',
    min: () => tone(2730, 0, 0.12, 0.45, 'square', HOLD),
    prep: () => { tone(2730, 0, 0.1, 0.45, 'square', HOLD); tone(2730, 0.16, 0.1, 0.45, 'square', HOLD); },
    tick: () => tone(2730, 0, 0.04, 0.45, 'square', HOLD),
    end: () => [0, 0.12, 0.24, 0.5, 0.62, 0.74].forEach(d => tone(2730, d, 0.08, 0.45, 'square', HOLD)) },
  sifflet: { label: 'Sifflet', help: 'Coup de sifflet d\'arbitre avec trille : court, court, long.',
    min: () => tone(2400, 0, 0.2, 0.45, 'square', { hold: true, vib: [28, 180] }),
    prep: () => { tone(2400, 0, 0.16, 0.45, 'square', { hold: true, vib: [28, 180] }); tone(2400, 0.24, 0.16, 0.45, 'square', { hold: true, vib: [28, 180] }); },
    tick: () => tone(2400, 0, 0.05, 0.45, 'square', HOLD),
    end: () => { [0, 0.24].forEach(d => tone(2400, d, 0.16, 0.45, 'square', { hold: true, vib: [28, 180] })); tone(2400, 0.48, 0.7, 0.45, 'square', { hold: true, vib: [28, 180] }); } },
  cloche: { label: 'Cloche', help: 'Cloche de ring de boxe : le son résonne longtemps.',
    min: () => bell(1047, 0, 0.8),
    prep: () => { bell(1319, 0, 0.5); bell(1319, 0.25, 0.6); },
    tick: () => tone(2637, 0, 0.06, 0.45, 'triangle', HOLD),
    end: () => [0, 0.35, 0.7].forEach(d => bell(1047, d, 1.2)) },
};
// Voix : synthèse vocale de l'appareil, en français. `left` = secondes restantes du signal.
let speechReady = false;
function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR'; u.rate = 1.1; u.volume = cfg.volume;
    const v = speechSynthesis.getVoices().find(x => x.lang === 'fr-FR') || speechSynthesis.getVoices().find(x => x.lang.startsWith('fr'));
    if (v) u.voice = v;
    // Une annonce en retard (le « 3 » encore en cours) ne doit pas décaler les suivantes.
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* pas de synthèse vocale */ }
}
if ('speechSynthesis' in window) TIMBRES.voix = { label: 'Voix', help: 'Une voix annonce le temps restant : « encore 2 minutes », « 30 secondes », « 3, 2, 1 », « repos terminé ».',
  min: left => say(left === 60 ? 'Encore 1 minute' : `Encore ${left / 60} minutes`),
  prep: left => say(`${left} secondes`),
  tick: left => say(String(left)),
  end: () => say('Repos terminé') };
// Sur iPhone, la voix doit avoir parlé une première fois pendant un toucher pour pouvoir parler ensuite.
function unlockSpeech() {
  if (speechReady || cfg.timbre !== 'voix' || !('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechReady = true; } catch { /* ignoré */ }
}
const timbre = () => TIMBRES[cfg.timbre] || TIMBRES.alarme;
const SOUNDS = { min: left => timbre().min(left), prep: left => timbre().prep(left), tick: left => timbre().tick(left), end: () => timbre().end() };
const SOUND_PROFILES = { off: 'Désactivé', discret: 'Discret', standard: 'Standard', complet: 'Complet' };
const SOUND_HELP = {
  off: 'Aucun son. La barre passe quand même à l\'orange les 10 dernières secondes.',
  discret: 'Un bip à 10 s, puis le signal de fin.',
  standard: 'Double bip à 30 s, tops à 3, 2, 1, puis le signal de fin.',
  complet: 'Un bip à chaque minute restante, double bip à 30 s et à 10 s, tops à 3, 2, 1, puis le signal de fin.',
};
// Signaux d'un profil pour un repos de `total` secondes : [{ left: secondes restantes, kind }]
function timerSignals(profile, total) {
  if (profile === 'off') return [];
  const ev = [];
  if (profile === 'complet') for (let m = 60; m < total; m += 60) ev.push({ left: m, kind: 'min' });
  if (profile !== 'discret' && total > 30) ev.push({ left: 30, kind: 'prep' });
  if (profile !== 'standard' && total > 10) ev.push({ left: 10, kind: 'prep' });
  if (profile !== 'discret') [3, 2, 1].forEach(left => ev.push({ left, kind: 'tick' }));
  ev.push({ left: 0, kind: 'end' });
  return ev;
}
function startTimer(seconds, label, sid) {
  unlockAudio();
  timer = { end: Date.now() + seconds * 1000, total: seconds, label, sid, played: new Set(), shown: null };
  tickTimer();
}
function stopTimer() { timer = null; renderTimer(); }
function addTimer30() { timer.end += 30000; timer.total += 30; timer.shown = null; tickTimer(); }
function tickTimer() {
  if (!timer) return;
  const exact = (timer.end - Date.now()) / 1000;
  for (const e of timerSignals(cfg.sound, timer.total)) {
    const key = e.kind + e.left;
    if (timer.played.has(key) || exact > e.left) continue;
    timer.played.add(key);
    // Au retour d'arrière-plan, on ne rejoue pas d'un coup les signaux manqués, sauf la fin.
    if (e.kind === 'end' || exact > e.left - 1.5) SOUNDS[e.kind](e.left);
  }
  const left = Math.ceil(exact);
  if (timer.shown !== left) { timer.shown = left; renderTimer(); }
}
function renderTimer() {
  if (!timer) { timerEl.hidden = true; timerEl.className = ''; return; }
  const left = Math.ceil((timer.end - Date.now()) / 1000);
  timerEl.hidden = false;
  if (left <= 0) {
    timerEl.className = 'end';
    timerEl.replaceChildren(h('div', { class: 't' }, 'Repos terminé'), h('button', { onclick: stopTimer }, 'OK'));
    return;
  }
  timerEl.className = left <= 10 ? 'warn' : '';
  timerEl.replaceChildren(
    h('div', { class: 't' }, `${Math.floor(left / 60)}:${pad2(left % 60)}`,
      db.sessions[timer.sid]?.clock?.start ? h('small', {}, 'Séance ', h('span', { 'data-clock': timer.sid }, fmtClock(sessionDuration(db.sessions[timer.sid])))) : null),
    h('button', { class: 'gear', 'aria-label': 'Réglages du minuteur', onclick: openRestSheet }, gearIcon()),
    h('button', { onclick: addTimer30 }, '+30 s'),
    h('button', { onclick: stopTimer }, 'Stop'));
}
setInterval(tickTimer, 100);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickTimer(); syncNow(); } });

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
// opt.target : ligne d'objectif en pointillés (comprise dans l'échelle) ; opt.color : couleur des séries.
function lineChart(series, unit, opt = {}) {
  const pts = series.flatMap(x => x.points);
  if (!pts.length) return h('p', { class: 'muted' }, 'Pas encore de données.');
  const W = 340, H = 200, m = { l: 40, r: 14, t: 14, b: 26 };
  let x0 = Math.min(...pts.map(p => p.t)), x1 = Math.max(...pts.map(p => p.t));
  if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
  const vals = pts.map(p => p.v).concat(opt.target != null ? [opt.target] : []);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
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
  if (opt.target != null) svg.append(s('line', { class: 'target', x1: m.l, x2: W - m.r, y1: Y(opt.target), y2: Y(opt.target) }),
    s('text', { class: 'target-l', x: W - m.r, y: Y(opt.target) - 5, 'text-anchor': 'end' }, `objectif ${fmtKg(opt.target)}`));
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
  const wrap = h('div', { class: 'chart', style: opt.color ? `--series-1:${opt.color}` : null }, svg);
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
  document.querySelector('#tabs a[data-tab="corps"]')?.classList.toggle('due', remShown()); // pastille du rappel mensurations
}
function nextTrainingDay() {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const n = programFor(ymd(d)).days[d.getDay()];
    if (n) return { day: JOURS[d.getDay()], name: n };
  }
}
function weekStart() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d);
}

// ---------- Adhérence au programme ----------
// Score d'une semaine (lundi ws) jusqu'au jour upTo inclus = moyenne des critères disponibles :
// séries validées ÷ séries prévues à date (plafonné à 100 %), séances faites le jour prévu (± 1 jour),
// séries dont les reps tombent dans la fourchette prévue. La séance du jour n'est due que si elle est commencée.
const addDays = (d, n) => { const x = parseYmd(d); x.setDate(x.getDate() + n); return ymd(x); };
function adherence(ws, upTo) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter(d => d <= upTo);
  const recs = Object.values(db.sessions).filter(r => !r.deleted && setsDone(r) > 0 && r.date >= ws && r.date <= addDays(ws, 6));
  let planned = 0;
  const plannedDays = [];
  for (const d of days) {
    const name = programFor(d).days[parseYmd(d).getDay()];
    if (!name) continue;
    plannedDays.push({ d, name });
    if (d === today() && d === upTo && !db.sessions[sessionId(d, name)]?.entries) continue; // pas encore commencée
    planned += (programFor(d).sessions[name] || []).reduce((n, e) => n + e.sets, 0);
  }
  const done = recs.reduce((n, r) => n + setsDone(r), 0);
  const onDay = recs.filter(r => plannedDays.some(p => p.name === r.name && Math.abs(parseYmd(p.d) - parseYmd(r.date)) <= 864e5)).length;
  let inRange = 0, ranged = 0;
  for (const r of recs) {
    const list = programFor(r.date).sessions[r.name] || [];
    for (const [exId, e] of Object.entries(r.entries || {})) {
      const ex = list.find(x => x.id === exId) || list.find(x => r.swaps?.[x.id] === exId);
      if (!ex || !(ex.hi > 0)) continue;
      for (const x of doneSets(e)) { ranged++; if (x.reps >= ex.lo && x.reps <= ex.hi) inRange++; }
    }
  }
  const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : null;
  const c = { series: pct(done, planned), jours: pct(onDay, recs.length), reps: pct(inRange, ranged) };
  const vals = Object.values(c).filter(v => v != null);
  return { ...c, score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, done, planned, onDay, nRecs: recs.length, inRange, ranged };
}
// Semaines complètes d'affilée à 80 % ou plus, avant la semaine en cours.
function adherenceStreak() {
  const first = Object.values(db.sessions).filter(r => !r.deleted && setsDone(r) > 0).map(r => r.date).sort()[0];
  let n = 0;
  for (let ws = addDays(weekStart(), -7); first && addDays(ws, 6) >= first && n < 52; ws = addDays(ws, -7)) {
    const a = adherence(ws, addDays(ws, 6));
    if (a.score == null || a.score < 80) break;
    n++;
  }
  return n;
}
const adhColor = s => s == null ? 'var(--grid)' : s >= 85 ? 'var(--good)' : s >= 60 ? 'var(--warn)' : 'var(--bad)';
// Anneau autour du compteur de séances : remplissage et couleur = score d'adhérence.
function adherenceRing(label, score) {
  const r = 29, len = 2 * Math.PI * r;
  return s('svg', { viewBox: '0 0 70 70', class: 'adh-ring', 'aria-hidden': 'true' },
    s('circle', { cx: 35, cy: 35, r, fill: 'none', stroke: 'var(--field)', 'stroke-width': 6 }),
    score ? s('circle', { cx: 35, cy: 35, r, fill: 'none', stroke: adhColor(score), 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': `${len * score / 100} ${len}`, transform: 'rotate(-90 35 35)' }) : null,
    s('text', { x: 35, y: 41, 'text-anchor': 'middle' }, label));
}
// Détail de l'adhérence, déplié sous les tuiles du haut de la page Séance.
function adherenceDetails(a) {
  const streak = adherenceStreak();
  const line = (name, v, txt) => h('div', { class: 'adh-row' },
    h('span', {}, h('b', {}, name), h('small', {}, txt)), h('span', { class: 'adh-v', style: `color:${adhColor(v)}` }, v == null ? '–' : `${v} %`));
  return h('div', { class: 'card adh-det' },
    line('Séries', a.series, a.planned ? `${a.done} sur ${a.planned} prévues à date` : 'rien de prévu pour l\'instant'),
    line('Jours', a.jours, a.nRecs ? `${a.onDay} séance${a.onDay > 1 ? 's' : ''} sur ${a.nRecs} au jour prévu (± 1 jour)` : 'aucune séance faite'),
    line('Reps', a.reps, a.ranged ? `${a.inRange} série${a.inRange > 1 ? 's' : ''} sur ${a.ranged} dans la fourchette` : 'aucune série validée'),
    h('div', { class: 'adh-row total' }, h('b', {}, 'Score'), h('span', { class: 'adh-v', style: `color:${adhColor(a.score)}` }, a.score == null ? '–' : `${a.score} %`)),
    h('p', { class: 'sub' }, `Constance : ${streak ? `${plural(streak, 'semaine')} d'affilée à 80 % ou plus` : 'pas encore de semaine complète à 80 % ou plus'}. Score = moyenne des trois critères à date ; un jour de repos ou une séance pas encore commencée ne compte pas. Vert à partir de 85 %, orange de 60 à 84 %, rouge en dessous.`));
}

function viewHome() {
  setTab('home');
  const now = new Date();
  const prog = programFor(today());
  const todayName = prog.days[now.getDay()];
  const recs = Object.values(db.sessions).filter(r => !r.deleted && setsDone(r) > 0).sort((a, b) => b.date.localeCompare(a.date));
  const ws = weekStart();
  const weekRecs = recs.filter(r => r.date >= ws);
  const weekDone = weekRecs.length, weekDup = weekDone - new Set(weekRecs.map(r => r.name)).size;
  const todayRec = todayName && db.sessions[sessionId(today(), todayName)];
  const nxt = nextTrainingDay();
  const adh = adherence(ws, today());

  // Toucher la carte du jour (hors bouton) déplie ou replie la liste des autres séances, juste dessous.
  const toggleMore = ev => { if (ev.target.closest('a')) return; ui.homeMore = !ui.homeMore; ui.homeAdh = false; viewHome(); };
  const more = h('div', { class: 'more' }, h('span', {}, 'Autre séance'), h('span', { 'aria-hidden': 'true' }, ui.homeMore ? '⌃' : '›'));
  const hero = todayName
    ? h('div', { class: 'card hero', onclick: toggleMore, role: 'button', 'aria-expanded': String(!!ui.homeMore) },
      h('div', { class: 'sub' }, `Aujourd'hui, ${JOURS[now.getDay()]}`),
      h('h1', {}, todayName),
      h('div', { class: 'sub' }, `${prog.sessions[todayName].length} exercices${todayRec ? ` · ${setsDone(todayRec)} séries faites` : ''}`),
      h('div', { style: 'height:12px' }),
      h('a', { class: 'btn', href: `#/seance/${encodeURIComponent(todayName)}/${today()}` }, todayRec ? 'Reprendre' : 'Commencer'),
      more)
    : h('div', { class: 'card hero', onclick: toggleMore, role: 'button', 'aria-expanded': String(!!ui.homeMore) },
      h('div', { class: 'sub' }, `Aujourd'hui, ${JOURS[now.getDay()]}`),
      h('h1', {}, 'Jour de repos'),
      h('div', { class: 'sub' }, `Prochaine séance : ${nxt.day}, ${nxt.name}.`),
      more);

  mount(
    h('div', { class: 'row between' }, h('h1', {}, 'Séance'), syncChip()),
    remindBanner(true),
    stepsCard(),
    // Carte du jour et compteur de la semaine côte à côte (poids dans Corps, séances passées dans Historique).
    // L'anneau autour du compteur montre l'adhérence au programme ; un toucher déplie son détail sous les tuiles
    // (un seul dépliage à la fois : il referme « Autre séance »).
    h('div', { class: 'home-top' }, hero, h('button', { class: 'card week', onclick: () => { ui.homeAdh = !ui.homeAdh; ui.homeMore = false; viewHome(); }, 'aria-expanded': String(!!ui.homeAdh), 'aria-label': `Cette semaine, adhérence ${adh.score ?? 'non calculée'}` },
      h('div', { class: 'sub' }, 'Cette semaine'), adherenceRing(`${weekDone}/${Object.values(prog.days).filter(Boolean).length}`, adh.score),
      h('div', { class: 'sub' }, adh.score == null ? 'adhérence –' : `adhérence ${adh.score} %`, weekDup ? [h('br'), `dont ${weekDup} en double`] : null),
      h('div', { class: 'more' }, h('span', {}, 'Détails'), h('span', { 'aria-hidden': 'true' }, ui.homeAdh ? '⌃' : '›')))),
    // Séances déjà faites cette semaine : grisées avec le(s) jour(s), mais toujours ouvrables.
    !ui.homeMore ? null : h('div', { class: 'grid2' }, Object.keys(prog.sessions).map(n => {
      const days = weekRecs.filter(r => r.name === n).map(r => r.date).sort().map(d => JOURS[parseYmd(d).getDay()]);
      return h('a', { class: 'btn secondary' + (days.length ? ' done' : ''), href: `#/seance/${encodeURIComponent(n)}/${today()}` }, n,
        days.length ? h('small', {}, `✓ ${days.join(', ')}`) : null);
    })),
    ui.homeAdh ? adherenceDetails(adh) : null);
}

function viewSession(name, date) {
  setTab('home');
  const id = sessionId(date, name);
  // Exercices du programme actif à la date de la séance, plus ceux déjà saisis qui n'y sont plus (séance commencée avant un changement).
  const planned = programFor(date).sessions[name] || [];
  const rec = db.sessions[id];
  // Remplacements pour cette séance (rec.swaps = { prévu: remplaçant }) : le remplaçant garde le nombre de séries prévu
  // (moins celles déjà faites sur l'exercice prévu) avec sa propre fourchette et son propre repos.
  const list = [];
  for (const ex of planned) {
    const to = rec?.swaps?.[ex.id] && EXERCISES[rec.swaps[ex.id]];
    if (!to) { list.push(ex); continue; }
    const k = doneSets(rec.entries?.[ex.id]).length;
    if (k) list.push({ ...ex, sets: k, stoppedFor: to.name });
    list.push({ ...to, sets: Math.max(1, ex.sets - k), swapOf: ex });
  }
  list.push(...Object.keys(rec?.entries || {}).filter(x => !list.some(e => e.id === x) && EXERCISES[x]).map(x => EXERCISES[x]));
  if (!list.length) return go('#/');
  keepAwake();
  const total = list.reduce((n, ex) => n + ex.sets, 0);
  const sugs = Object.fromEntries(list.map(ex => [ex.id, suggest(ex, id)]));
  if (ui.active && !list.some(ex => ex.id === ui.active)) ui.active = undefined;
  if (ui.active === undefined) {
    const first = list.find(ex => doneSets(rec?.entries?.[ex.id]).length < ex.sets);
    ui.active = first ? first.id : null;
  }

  const redraw = () => { const y = window.scrollY; viewSession(name, date); window.scrollTo(0, y); };
  const prs = Object.fromEntries(list.map(ex => [ex.id, prTarget(ex, sugs[ex.id], id, rec?.entries?.[ex.id])]));

  const cards = list.map(ex => {
    const entry = entryFor(ex, rec, sugs[ex.id]);
    const nDone = doneSets(entry).length;
    const open = ui.active === ex.id;
    const head = h('button', { class: 'ex-head', onclick: () => { ui.active = open ? null : ex.id; redraw(); } },
      h('div', { class: 'grow' }, h('h3', {}, ex.name, prs[ex.id] ? h('span', { class: 'pr-tag' }, 'PR') : null), h('div', { class: 'sub' }, `${ex.sets} × ${ex.lo === ex.hi ? ex.lo : ex.lo + '-' + ex.hi}${ex.note ? ' · ' + ex.note : ''}`),
        ex.swapOf ? h('span', { class: 'swaptag' }, `⇄ à la place de ${ex.swapOf.name}`) : ex.stoppedFor ? h('span', { class: 'swaptag' }, `⇄ arrêté, suite avec ${ex.stoppedFor}`) : null),
      h('span', { class: 'count' }, `${nDone}/${entry.sets.length}`));
    const card = h('div', { class: 'card' + (nDone >= ex.sets ? ' done' : ''), 'data-ex': ex.id },
      h('div', { class: 'ex-top' }, head, h('button', { class: 'qbtn', 'aria-label': `Fiche de l'exercice ${ex.name}`, onclick: () => openFiche(ex, id) }, '?')));
    if (!open) return card;
    card.append(h('div', { class: 'hint' }, sugs[ex.id].text));
    card.append(h('div', { class: 'set' }, h('span'), h('span', { class: 'head' }, 'kg'), h('span', { class: 'head' }, 'reps'), h('span', { class: 'head' }, 'réserve'), h('span')));
    // Séries de la dernière séance de cet exercice : chaque valeur qui en diffère (même numéro de série)
    // s'affiche en orange avec l'écart, pour voir ce qui change et fait un éventuel record.
    const prevSets = exHistory(ex.id, id).at(-1)?.sets || [];
    entry.sets.forEach((st, i) => {
      const save1 = () => commit(date, name, ex, entry);
      const kgIn = h('input', { type: 'text', inputmode: 'decimal', value: st.kg == null ? '' : fmtKg(st.kg), 'aria-label': 'Charge en kg' });
      const repIn = h('input', { type: 'text', inputmode: 'numeric', value: st.reps == null ? '' : String(st.reps), 'aria-label': 'Répétitions' });
      const dKg = h('span', { class: 'dlt', 'aria-hidden': 'true' }), dReps = h('span', { class: 'dlt', 'aria-hidden': 'true' });
      const markDiff = () => {
        for (const [input, d, key] of [[kgIn, dKg, 'kg'], [repIn, dReps, 'reps']]) {
          const v = num(input.value), ref = prevSets[i]?.[key];
          const diff = v != null && ref != null ? Math.round((v - ref) * 100) / 100 : 0;
          input.classList.toggle('chg', !!diff);
          d.textContent = diff ? `${diff > 0 ? '+' : '−'}${fmtKg(Math.abs(diff))}` : '';
        }
      };
      markDiff();
      kgIn.addEventListener('change', () => { st.kg = num(kgIn.value); save1(); markDiff(); });
      repIn.addEventListener('change', () => { st.reps = num(repIn.value); save1(); markDiff(); });
      const bump = (input, key, delta, min) => () => {
        const cur = num(input.value) ?? (key === 'kg' ? (ex.kg ?? 0) : 0);
        const nv = Math.max(min, Math.round((cur + delta) * 100) / 100);
        st[key] = nv; input.value = key === 'kg' ? fmtKg(nv) : String(nv); save1(); markDiff();
      };
      const rir = h('select', { class: 'rir', 'aria-label': 'Répétitions en réserve' },
        ['', '0', '1', '2', '3', '4'].map(v => h('option', { value: v, selected: String(st.rir) === v }, v === '' ? '–' : v)));
      rir.addEventListener('change', () => { st.rir = rir.value; save1(); });
      const chk = h('button', { class: 'check' + (st.done ? ' on' : ''), 'aria-label': 'Série faite', onclick: () => {
        st.kg = num(kgIn.value); st.reps = num(repIn.value);
        st.done = !st.done;
        if (st.done && !(st.reps > 0 && st.kg != null)) { st.done = false; return; }
        if (st.done) st.t = Date.now(); else delete st.t;
        commit(date, name, ex, entry);
        if (st.done) {
          // Le chrono démarre seul à la première série validée ; une série validée après « Terminer » rouvre la séance.
          const c = db.sessions[id].clock;
          if (!c?.start || c.end || c.pausedAt) editClock(date, name, (k, now) => {
            if (!k.start) k.start = now;
            if (k.pausedAt) { k.pauseMs += now - k.pausedAt; k.pausedAt = null; }
            k.end = null;
          });
          if (ex.rest > 0) startTimer(ex.rest, ex.name, id); // cardio : pas de repos, pas de minuteur
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
        h('div', { class: 'stepper' }, h('button', { onclick: bump(kgIn, 'kg', -ex.step, 0) }, '−'), h('div', { class: 'val' }, kgIn, dKg), h('button', { onclick: bump(kgIn, 'kg', ex.step, 0) }, '+')),
        h('div', { class: 'stepper' }, h('button', { onclick: bump(repIn, 'reps', -1, 0) }, '−'), h('div', { class: 'val' }, repIn, dReps), h('button', { onclick: bump(repIn, 'reps', 1, 0) }, '+')),
        rir, chk));
    });
    // Jugement de la charge : une seule flèche cochée à la fois, on la décoche en la touchant de nouveau. Aucun effet sur les charges proposées.
    const mark = kind => () => { entry.load = entry.load === kind ? null : kind; commit(date, name, ex, entry); redraw(); };
    // La rangée commence sous le bord gauche des boutons kg (colonne numéro 14 px + écart 4 px) et tout y fait 40 px de haut.
    const actRow = 'margin-top:8px;gap:6px;align-items:stretch;padding-left:18px';
    card.append(h('div', { class: 'row', style: actRow + ';flex-wrap:wrap' },
      h('button', { class: 'btn secondary small tight', onclick: () => { const last = entry.sets[entry.sets.length - 1]; entry.sets.push({ kg: last?.kg ?? null, reps: last?.reps ?? null, rir: '', done: false }); commit(date, name, ex, entry); redraw(); } }, '+ Série'),
      entry.sets.length > 1 ? h('button', { class: 'btn secondary small tight', onclick: () => { entry.sets.pop(); commit(date, name, ex, entry); redraw(); } }, '− Série') : null,
      h('a', { class: 'btn secondary small tight', href: `#/ex/${ex.id}` }, 'Historique'),
      planned.includes(ex) && nDone < ex.sets ? h('button', { class: 'btn secondary small tight', onclick: () => openSwap(ex, id, list.map(e => e.id), to => {
        swapExercise(date, name, ex, to); ui.active = to; redraw();
      }) }, '⇄ Remplacer') : null));
    // Commentaire libre de l'exercice pour cette séance : une ligne, qui s'agrandit pendant la saisie.
    // Enregistré à la sortie du champ (pas de redessin, pour ne pas perdre le clavier).
    const note = h('textarea', { class: 'ex-note', rows: 1, placeholder: '✎ Commentaire', 'aria-label': `Commentaire sur ${ex.name}` });
    note.value = entry.comment || '';
    const fit = () => { note.style.height = 'auto'; note.style.height = `${note.scrollHeight}px`; };
    note.addEventListener('focus', fit);
    note.addEventListener('input', fit);
    note.addEventListener('blur', () => { note.style.height = ''; });
    note.addEventListener('change', () => { const v = note.value.trim(); if (v) entry.comment = v; else delete entry.comment; commit(date, name, ex, entry); });
    card.append(h('div', { class: 'row', style: actRow + ';align-items:flex-start' },
      loadIcon('up', entry.load === 'up', mark('up')),
      loadIcon('down', entry.load === 'down', mark('down')),
      note));
    // Rappel du commentaire de la dernière séance de cet exercice.
    const prev = Object.values(db.sessions).filter(r => !r.deleted && r.date < date && r.entries?.[ex.id]?.comment).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (prev) card.append(h('div', { class: 'sub ex-prev' }, `${cap(fmtDateLong(prev.date))} : « ${prev.entries[ex.id].comment} »`));
    if (ex.swapOf) card.append(h('button', { class: 'linkbtn', onclick: () => { unswapExercise(date, name, ex.swapOf, ex.id); ui.active = ex.swapOf.id; redraw(); } }, `↺ Revenir à ${ex.swapOf.name}`));
    return card;
  });

  const done = setsDone(rec);
  const c = rec?.clock, ended = !!c?.end;
  const clockAct = (label, fn) => h('button', { class: 'btn secondary small tight', onclick: () => { editClock(date, name, fn); redraw(); } }, label);
  let clockSub, clockBtn;
  if (!c?.start) { clockSub = 'Le chrono démarre à ta 1re série validée'; clockBtn = clockAct('▶ Démarrer', (k, now) => { k.start = now; }); }
  else if (ended) { clockSub = `Terminée · ${fmtHour(c.start)} → ${fmtHour(c.end)}`; clockBtn = clockAct('Reprendre', k => { k.end = null; }); }
  else if (c.pausedAt) { clockSub = 'En pause'; clockBtn = clockAct('▶ Reprendre', (k, now) => { k.pauseMs += now - k.pausedAt; k.pausedAt = null; }); }
  else if (clockLive(rec)) { clockSub = `Commencée à ${fmtHour(c.start)}`; clockBtn = clockAct('⏸ Pause', (k, now) => { k.pausedAt = now; }); }
  else { clockSub = `Arrêté à la dernière série (${fmtHour(clockEnd(rec))})`; clockBtn = null; }
  const finish = () => {
    editClock(date, name, (k, now) => {
      if (!k.start) k.start = now;
      // En pause, la séance se termine au moment de la pause ; si le chrono s'était arrêté seul, à la dernière série.
      k.end = k.pausedAt || clockEnd(db.sessions[id], now); k.pausedAt = null;
    });
    stopTimer(); redraw();
  };
  mount(
    h('div', { class: 'row between' }, h('a', { href: '#/' }, '‹ Accueil'), syncChip()),
    h('h1', {}, name),
    h('div', { class: 'sub' }, `${cap(fmtDateLong(date))} · ${done}/${total} séries${rec ? ' · ' + sessionVolume(rec).toLocaleString('fr-FR') + ' kg de volume' : ''}`),
    h('div', { class: 'sclock' + (clockLive(rec) ? ' live' : '') },
      h('div', { class: 't' }, h('span', { 'data-clock': id }, fmtClock(sessionDuration(rec))), h('small', {}, clockSub)),
      clockBtn),
    cards,
    done && !ended ? h('button', { class: 'btn end', style: 'margin-top:12px', onclick: finish }, '✓ Terminer la séance · ', h('span', { 'data-clock': id }, fmtClock(sessionDuration(rec)))) : null,
    ended ? h('div', { class: 'card', style: 'text-align:center;margin-top:12px' },
      h('b', {}, 'Séance terminée'),
      h('div', { class: 'sub' }, `${fmtMin(sessionDuration(rec))} · ${done} série${done > 1 ? 's' : ''} · ${fmtHour(c.start)} → ${fmtHour(c.end)}`),
      h('div', { style: 'height:10px' }),
      h('a', { class: 'btn secondary', href: '#/' }, 'Retour à l\'accueil')) : null,
    recordsCard(list, prs, ex => { ui.active = ex.id; redraw(); document.querySelector(`[data-ex="${ex.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

// ---------- Records personnels ----------
// Un exercice vise un record quand l'objectif du jour (charge et reps proposées) dépasse, sur les séances passées,
// la charge la plus lourde validée (record de charge) ou, à une charge déjà soulevée, le meilleur nombre de reps
// à cette charge (record de reps). Battu = une série validée aujourd'hui dépasse l'un des deux.
function prTarget(ex, sug, sessionRecId, entry) {
  if (sug?.kg == null || !(sug.kg > 0)) return null;
  const sets = exHistory(ex.id, sessionRecId).flatMap(x => x.sets).filter(x => x.kg > 0);
  if (!sets.length) return null; // première fois : pas de record à battre
  const maxKg = Math.max(...sets.map(x => x.kg));
  const bestAt = kg => Math.max(-1, ...sets.filter(x => x.kg === kg).map(x => x.reps));
  const doneToday = doneSets(entry).filter(x => x.kg > 0);
  let t = null;
  if (sug.kg > maxKg) t = { type: 'charge', goal: `${fmtKg(sug.kg)} kg`, detail: `Charge : record ${fmtKg(maxKg)} kg` };
  else if (bestAt(sug.kg) >= 0 && sug.reps > bestAt(sug.kg)) t = { type: 'reps', goal: `${fmtKg(sug.kg)} kg × ${sug.reps}`, detail: `Reps à ${fmtKg(sug.kg)} kg : record ${bestAt(sug.kg)}` };
  if (!t) return null;
  const heavier = doneToday.find(x => x.kg > maxKg);
  const moreReps = doneToday.find(x => bestAt(x.kg) >= 0 && x.reps > bestAt(x.kg));
  if (heavier) Object.assign(t, { done: `✓ ${fmtKg(heavier.kg)} kg`, detail: 'Nouveau record de charge' });
  else if (moreReps) Object.assign(t, { done: `✓ ${fmtKg(moreReps.kg)} kg × ${moreReps.reps}`, detail: `Nouveau record de reps à ${fmtKg(moreReps.kg)} kg` });
  return t;
}
function recordsCard(list, prs, open) {
  const rows = list.filter(ex => prs[ex.id]);
  return h('div', { class: 'card pr-card' },
    h('h3', {}, '🏆 Records à battre aujourd\'hui'),
    rows.length ? rows.map(ex => { const p = prs[ex.id]; return h('button', { class: 'pr-row' + (p.done ? ' ok' : ''), onclick: () => open(ex) },
      h('span', { class: 'n' }, ex.name), h('span', { class: 't' }, p.done || p.goal), h('span', { class: 'd' }, p.detail)); })
      : h('p', { class: 'sub' }, 'Aucun record visé aujourd\'hui.'));
}

// Fiche d'un exercice (bibliothèque library.js) dans un volet par-dessus la séance.
function openFiche(ex, sessionRecId) {
  if (document.querySelector('.sheet-wrap')) return;
  const lib = LIBRARY[ex.id];
  const close = () => wrap.remove();
  const link = (href, label, cls) => h('a', { class: 'btn small ' + cls, href, target: '_blank', rel: 'noopener' }, label);
  const fw = fitwillUrl(lib);
  const wrap = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'dim', onclick: close }),
    h('div', { class: 'sheet fiche', role: 'dialog', 'aria-label': `Fiche ${ex.name}` },
      h('span', { class: 'grab', 'aria-hidden': 'true' }),
      lib?.machine ? h('span', { class: 'machine' }, lib.machine.toUpperCase()) : null,
      h('h2', { style: 'margin:4px 0 6px' }, ex.name),
      lib ? h('div', { class: 'mus' }, lib.muscles.map(m => h('span', {}, m)), lib.secondary.map(m => h('span', { class: 'sec' }, m))) : null,
      lib ? [h('div', { class: 'lbl' }, 'Exécution'), h('ol', {}, lib.steps.map(s => h('li', {}, s))),
        h('div', { class: 'lbl' }, 'Erreurs fréquentes'), h('ul', { class: 'err' }, lib.errors.map(s => h('li', {}, s)))]
        : h('p', { class: 'sub' }, 'Pas encore de fiche rédigée pour cet exercice.'),
      ex.note ? h('p', { class: 'sub' }, `Consigne du programme : ${ex.note}`) : null,
      h('div', { class: 'grid2', style: 'margin-top:10px' },
        fw ? link(fw, 'Fiche Fitwill ↗', '') : null,
        link(youtubeUrl(lib, ex.name), 'Vidéos YouTube ↗', 'secondary')),
      h('p', { class: 'sub', style: 'margin-top:10px' }, suggest(ex, sessionRecId).text),
      h('button', { class: 'btn secondary', style: 'margin-top:8px', onclick: close }, 'Fermer')));
  document.body.append(wrap);
}

// Remplacement pour une seule séance : les séries déjà faites restent sur l'exercice prévu, les autres passent au remplaçant.
function swapExercise(date, name, ex, toId) {
  const id = sessionId(date, name);
  const rec = db.sessions[id] || (db.sessions[id] = { id, date, name, entries: {} });
  const done = doneSets(rec.entries[ex.id]);
  if (done.length) rec.entries[ex.id].sets = rec.entries[ex.id].sets.filter(x => done.includes(x)); else delete rec.entries[ex.id];
  rec.swaps = { ...rec.swaps, [ex.id]: toId };
  rec.updatedAt = Date.now(); rec.deleted = false;
  save();
}
// Retour à l'exercice prévu : le remplaçant ne reste dans la séance que s'il a des séries faites.
function unswapExercise(date, name, ex, toId) {
  const rec = db.sessions[sessionId(date, name)];
  if (!rec?.swaps) return;
  delete rec.swaps[ex.id];
  if (!doneSets(rec.entries[toId]).length) delete rec.entries[toId];
  const e = rec.entries[ex.id];
  if (e) while (e.sets.length < ex.sets) { const l = e.sets[e.sets.length - 1]; e.sets.push({ kg: l.kg, reps: l.reps, rir: '', done: false }); }
  rec.updatedAt = Date.now();
  save();
}
// Choix du remplaçant : variantes de la fiche, puis même groupe musculaire, ou recherche dans tout le catalogue.
function openSwap(ex, sessionRecId, taken, onPick) {
  if (document.querySelector('.sheet-wrap')) return;
  const close = () => wrap.remove();
  const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const group = (CATALOG.find(c => c.id === ex.id) || ex).group;
  const variants = (LIBRARY[ex.id]?.variants || []).filter(v => EXERCISES[v] && v !== ex.id);
  const same = CATALOG.filter(c => c.group && c.group === group && c.id !== ex.id && !variants.includes(c.id));
  let showAll = !variants.length;
  const option = id => {
    const o = EXERCISES[id], busy = taken.includes(id), hist = exHistory(id, sessionRecId), last = hist[hist.length - 1];
    let perf = 'Jamais fait';
    if (last) { const top = Math.max(...last.sets.map(x => x.kg)); perf = `${fmtDate(last.date)} : ${fmtKg(top)} kg × ${last.sets.filter(x => x.kg === top).map(x => x.reps).join(', ')}`; }
    return h('button', { class: 'opt', disabled: busy, onclick: () => { close(); onPick(id); } },
      h('b', {}, o.name), h('span', { class: 'm' }, LIBRARY[id]?.machine || ''),
      h('span', { class: 'last' + (busy ? ' busy' : last ? '' : ' none') }, busy ? 'Déjà dans cette séance' : perf));
  };
  const search = h('input', { type: 'search', class: 'swapsearch', placeholder: `Chercher parmi les ${CATALOG.length} exercices`, oninput: () => fill() });
  const box = h('div');
  const fill = () => {
    const q = norm(search.value.trim());
    if (q) {
      const found = CATALOG.filter(c => c.id !== ex.id && (norm(c.name).includes(q) || norm(LIBRARY[c.id]?.machine || '').includes(q)));
      box.replaceChildren(...(found.length ? found.map(c => option(c.id)) : [h('p', { class: 'sub' }, 'Aucun exercice trouvé.')]));
      return;
    }
    box.replaceChildren(...[
      variants.length ? h('div', { class: 'lbl' }, 'Alternatives conseillées') : null, ...variants.map(option),
      !same.length ? null : showAll ? [h('div', { class: 'lbl' }, `Même groupe (${group})`), ...same.map(option)]
        : h('button', { class: 'linkbtn', onclick: () => { showAll = true; fill(); } }, `+ ${same.length} autres exercices (${group})`),
    ].flat().filter(Boolean));
  };
  fill();
  const wrap = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'dim', onclick: close }),
    h('div', { class: 'sheet swap', role: 'dialog', 'aria-label': `Remplacer ${ex.name}` },
      h('span', { class: 'grab', 'aria-hidden': 'true' }),
      h('h2', { style: 'margin:4px 0 2px' }, `Remplacer « ${ex.name} »`),
      h('div', { class: 'sub' }, `${LIBRARY[ex.id]?.muscles.join(', ') || group || ''} · seulement pour cette séance`),
      box, search,
      h('button', { class: 'btn secondary', style: 'margin-top:10px', onclick: close }, 'Annuler')));
  document.body.append(wrap);
}

// Flèche de jugement de la charge (style « teinte douce avec légende »).
function loadIcon(kind, on, onclick) {
  const up = kind === 'up';
  const svg = s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: up ? 'M12 19V5M5.5 11.5 12 5l6.5 6.5' : 'M12 5v14M5.5 12.5 12 19l6.5-6.5' }));
  return h('button', { type: 'button', class: `lchip ${kind}${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': up ? 'Charge trop légère' : 'Charge trop lourde', onclick },
    svg, h('small', {}, up ? 'Léger' : 'Lourd'));
}
const loadTag = l => l === 'up' ? h('span', { class: 'tag up' }, '↑ Légère') : l === 'down' ? h('span', { class: 'tag down' }, '↓ Lourde') : '–';

// Historique : bilan de la semaine et deux rubriques (comme Réglages) qui ouvrent leur page.
const doneRecs = () => Object.values(db.sessions).filter(r => !r.deleted && setsDone(r) > 0).sort((a, b) => b.date.localeCompare(a.date));
const exRows = () => Object.values(EXERCISES).map(ex => ({ ex, hist: exHistory(ex.id) })).filter(x => x.hist.length);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const sessionsIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }), s('path', { d: 'M4 10h16M9 3v4M15 3v4' }));
const exercisesIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12' }));
function viewHistory(sub) {
  if (sub === 'seances') return viewHistorySessions();
  if (sub === 'exercices') return viewHistoryExercises();
  setTab('hist');
  const recs = doneRecs(), rows = exRows();
  const week = recs.filter(r => r.date >= weekStart()), timed = week.filter(r => r.clock?.start);
  const weekMs = timed.reduce((a, r) => a + sessionDuration(r), 0);
  mount(
    h('h1', {}, 'Historique'),
    h('div', { class: 'card' },
      h('b', {}, 'Cette semaine'),
      h('div', { class: 'list-item' }, h('span', {}, plural(week.length, 'séance')), h('span', { class: 'sub' }, timed.length ? `${fmtMin(weekMs)} au total` : 'durée non mesurée')),
      timed.length ? h('div', { class: 'list-item' }, h('span', {}, 'Durée moyenne'), h('span', { class: 'sub' }, fmtMin(weekMs / timed.length))) : null),
    recs.length || rows.length ? h('div', { class: 'navlist' },
      navRow('#/historique/seances', sessionsIcon(), '', 'Séances', recs.length ? `${plural(recs.length, 'séance')} · dernière ${recs[0].name}, ${fmtDate(recs[0].date)}` : 'Aucune séance'),
      navRow('#/historique/exercices', exercisesIcon(), 'ex', 'Exercices', `${plural(rows.length, 'exercice')} ${rows.length > 1 ? 'suivis' : 'suivi'} · 1RM, progression`))
      : h('p', { class: 'muted' }, 'Aucune donnée. Valide une série pendant une séance pour commencer.'));
}
// Force estimée par groupe musculaire, semaine par semaine (12 dernières). Pour chaque exercice : meilleur 1RM estimé
// de la semaine, rapporté à sa toute première semaine (= 100). Indice d'un groupe = moyenne de ses exercices déjà
// commencés, la dernière valeur connue d'un exercice étant reportée les semaines où il n'est pas fait.
function strengthCard() {
  const groupOf = ex => ex.group || CATALOG.find(c => c.id === ex.id)?.group || 'Autres';
  const weekOf = d => addDays(d, -((parseYmd(d).getDay() + 6) % 7));
  const exs = exRows().map(({ ex, hist }) => {
    const byWeek = {};
    for (const x of hist) { const v = bestE1rm(x.sets), w = weekOf(x.date); if (v != null && (byWeek[w] == null || v > byWeek[w])) byWeek[w] = v; }
    const ws = Object.keys(byWeek).sort();
    return ws.length ? { grp: groupOf(ex), byWeek, ws, base: byWeek[ws[0]] } : null;
  }).filter(e => e && e.grp !== 'Cardio');
  if (!exs.length) return null;
  const first = exs.map(e => e.ws[0]).sort()[0];
  const weeks = []; for (let w = first; w <= weekStart(); w = addDays(w, 7)) weeks.push(w);
  const shown = weeks.slice(-12);
  const series = [...HIST_GROUPS, 'Autres'].map(g => {
    const mine = exs.filter(e => e.grp === g);
    if (!mine.length) return null;
    const pts = shown.map(w => {
      const idx = mine.map(e => { const k = e.ws.filter(x => x <= w).pop(); return k ? e.byWeek[k] / e.base * 100 : null; }).filter(v => v != null);
      return idx.length ? idx.reduce((a, b) => a + b, 0) / idx.length : null;
    });
    return pts.some(v => v != null) ? { g, pts } : null;
  }).filter(Boolean);
  const all = series.flatMap(s => s.pts).filter(v => v != null).concat([100]);
  const lo = Math.min(...all) - 1, hi = Math.max(...all) + 1;
  const W = 200, H = 34, X = i => shown.length > 1 ? 4 + i / (shown.length - 1) * (W - 8) : W / 2, Y = v => H - 4 - (v - lo) / (hi - lo) * (H - 8);
  return h('div', { class: 'card strength' },
    h('b', {}, 'Force estimée par groupe'),
    h('div', { class: 'sub' }, `Indice 100 = première semaine de chaque exercice · ${plural(shown.length, 'semaine')}`),
    series.map(({ g, pts }) => {
      const p = pts.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
      const gain = Math.round(pts.filter(v => v != null).pop() - 100);
      return h('div', { class: 'str-row' }, h('span', {}, g),
        s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
          s('line', { class: 'base', x1: 0, x2: W, y1: Y(100), y2: Y(100) }),
          p.length > 1 ? s('polyline', { points: p.map(q => q.join(',')).join(' ') }) : null,
          s('circle', { cx: p[p.length - 1][0], cy: p[p.length - 1][1], r: 3 })),
        h('span', { class: 'v ' + (gain > 0 ? 'up' : gain < 0 ? 'down' : '') }, `${gain > 0 ? '+' : gain < 0 ? '−' : ''}${Math.abs(gain)} %`));
    }));
}
// Toutes les séances, groupées par semaine (du lundi), avec le nombre et le temps total de chaque semaine.
function viewHistorySessions() {
  setTab('hist');
  const weekOf = str => { const d = parseYmd(str); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
  const groups = [];
  for (const r of doneRecs()) {
    const w = weekOf(r.date);
    if (!groups.length || groups[groups.length - 1].w !== w) groups.push({ w, recs: [] });
    groups[groups.length - 1].recs.push(r);
  }
  mount(
    h('a', { class: 'back', href: '#/historique' }, '‹ Historique'),
    h('h1', {}, 'Séances'),
    groups.length ? groups.map(({ w, recs }) => {
      const ms = recs.filter(r => r.clock?.start).reduce((a, r) => a + sessionDuration(r), 0);
      return [h('div', { class: 'grp-head' }, h('span', {}, `Semaine du ${fmtDate(w)}`), h('span', {}, `${recs.length}${ms ? ' · ' + fmtMin(ms) : ''}`)),
        h('div', { class: 'card' }, recs.map(r => h('a', { class: 'list-item', href: `#/seance/${encodeURIComponent(r.name)}/${r.date}` },
          h('span', {}, `${cap(JOURS[parseYmd(r.date).getDay()].slice(0, 3))}. ${fmtDate(r.date)}, ${r.name}`),
          h('span', { class: 'sub' }, r.clock?.start ? fmtMin(sessionDuration(r)) : plural(setsDone(r), 'série')))))];
    }) : h('p', { class: 'muted' }, 'Aucune séance pour l\'instant.'));
}
// Exercices regroupés par groupe musculaire, avec recherche. Valeur = 1RM estimé de la dernière séance ;
// ↑ quand il dépasse celui d'il y a jusqu'à 3 séances.
const HIST_GROUPS = ['Pecs', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Abdos', 'Cardio'];
function viewHistoryExercises() {
  setTab('hist');
  const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const groupOf = ex => ex.group || CATALOG.find(c => c.id === ex.id)?.group || 'Autres';
  const rows = exRows().map(({ ex, hist }) => {
    const e = hist.map(x => bestE1rm(x.sets)).filter(v => v != null), last = hist[hist.length - 1];
    const ref = e.length > 1 ? e[Math.max(0, e.length - 4)] : null;
    return { ex, grp: groupOf(ex), best: bestE1rm(last.sets), n: last.sets.length, up: ref != null && e[e.length - 1] > ref };
  });
  const box = h('div');
  const search = h('input', { type: 'search', class: 'swapsearch', placeholder: 'Chercher un exercice', oninput: () => fill() });
  const fill = () => {
    const q = norm(search.value.trim());
    const shown = rows.filter(r => !q || norm(r.ex.name).includes(q));
    const order = [...HIST_GROUPS, 'Autres'];
    box.replaceChildren(...(shown.length ? order.filter(g => shown.some(r => r.grp === g)).flatMap(g => [
      h('div', { class: 'grp-head' }, h('span', {}, g)),
      h('div', { class: 'card' }, shown.filter(r => r.grp === g).sort((a, b) => a.ex.name.localeCompare(b.ex.name, 'fr')).map(r => h('a', { class: 'list-item', href: `#/ex/${r.ex.id}` },
        h('span', {}, r.ex.name),
        h('span', { class: 'sub' }, r.best ? `${fmtKg(r.best)} kg` : plural(r.n, 'série'), r.up ? h('span', { class: 'up-mark', title: 'En progression' }, ' ↑') : null))))])
      : [h('p', { class: 'muted' }, rows.length ? 'Aucun exercice trouvé.' : 'Aucune donnée pour l\'instant.')]));
  };
  fill();
  mount(
    h('a', { class: 'back', href: '#/historique' }, '‹ Historique'),
    h('h1', {}, 'Exercices'),
    rows.length ? search : null,
    box,
    rows.length ? h('p', { class: 'sub' }, 'Valeur = 1RM estimé de la dernière séance ; ↑ = en progression sur les dernières séances.') : null);
}

function viewExercise(exId) {
  setTab('hist');
  const ex = EXERCISES[exId];
  if (!ex) return go('#/historique');
  const hist = exHistory(exId);
  const pts = hist.map(x => ({ t: parseYmd(x.date).getTime(), v: bestE1rm(x.sets), label: x.sets.map(s2 => `${fmtKg(s2.kg)}×${s2.reps}`).join(' ') })).filter(p => p.v != null);
  mount(
    // Ouvert depuis une séance ou depuis la liste des exercices : on revient d'où l'on vient.
    exFrom.startsWith('#/seance/') ? h('a', { href: exFrom }, '‹ Séance') : h('a', { href: '#/historique/exercices' }, '‹ Exercices'),
    h('h1', {}, ex.name),
    h('div', { class: 'sub' }, '1RM estimé par séance (formule d\'Epley, meilleure série)'),
    pts.length ? lineChart([{ name: '1RM estimé', points: pts }], 'kg') : h('p', { class: 'muted' }, hist.length ? 'Exercice au poids du corps : pas de courbe de 1RM.' : 'Pas encore de données.'),
    h('details', { open: true }, h('summary', {}, 'Détail des séances'),
      h('table', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Séries (kg × reps)'), h('th', {}, 'Charge')),
        [...hist].reverse().map(x => h('tr', {}, h('td', {}, fmtDate(x.date)), h('td', {}, x.sets.map(s2 => `${fmtKg(s2.kg)}×${s2.reps}`).join('  ')), h('td', {}, loadTag(x.load)))))));
}

// Mensurations suivies en plus du poids. La clé est celle stockée dans data.json.
const MEASURES = [
  { key: 'waist', label: 'Tour de taille', short: 'T. de taille', better: 'down', hint: 'au niveau du nombril, ventre relâché' },
  { key: 'chest', label: 'Tour de poitrine', short: 'Poitrine', better: 'up', hint: 'sous les aisselles, à hauteur des mamelons, après une expiration normale' },
  { key: 'biceps', label: 'Tour de biceps', short: 'Biceps', better: 'up', hint: 'bras détendu le long du corps, à l\'endroit le plus large' },
  { key: 'thigh', label: 'Tour de cuisse', short: 'Cuisse', better: 'up', hint: 'à mi-cuisse, debout, jambe détendue' },
];

// Ouvre la saisie dépliée de Corps (depuis le bandeau du rappel, y compris sur la page Séance).
function openEntry(mode = 'mesures') { ui.bodyEntry = mode; go('#/corps'); }
// Saisie dépliée sous la carte « Dernière pesée » : mensurations, ou poids et masse grasse (correction de Withings).
// Un champ vide montre en gris la dernière valeur connue, pour comparer.
function entryForm(mode) {
  const existing = d => db.body[d] && !db.body[d].deleted ? db.body[d] : null;
  const label = { poids: 'Poids (kg)', mg: 'Masse grasse (%)', ...Object.fromEntries(MEASURES.map(m => [m.key, `${m.label} (cm)`])) };
  const unit = k => k === 'poids' ? 'kg' : k === 'mg' ? '%' : 'cm';
  const lastOther = (k, d) => Object.values(db.body).filter(b => !b.deleted && b[k] != null && b.date !== d).sort((a, b) => b.date.localeCompare(a.date))[0];
  const fDate = h('input', { type: 'date', value: today() });
  const seg = h('div', { class: 'pills' });
  const body = h('div');
  let inputs = {};
  const fill = () => {
    seg.replaceChildren(...[['mesures', 'Mensurations'], ['poids', 'Poids / MG']].map(([m, t]) =>
      h('button', { type: 'button', class: m === mode ? 'on' : '', onclick: () => { mode = ui.bodyEntry = m; fill(); } }, t)));
    const e = existing(fDate.value), refDates = new Set();
    inputs = {};
    const fields = (mode === 'mesures' ? MEASURES.map(m => m.key) : ['poids', 'mg']).map(k => {
      const ref = lastOther(k, fDate.value);
      if (ref && e?.[k] == null) refDates.add(ref.date);
      inputs[k] = h('input', { type: 'text', inputmode: 'decimal', value: e?.[k] != null ? fmtKg(e[k]) : '', placeholder: ref ? fmtKg(ref[k]) : unit(k) });
      return h('label', { class: 'field' }, h('span', {}, label[k], e?.src?.[k] === 'withings' ? h('span', { class: 'wb' }, '⚖') : null), inputs[k]);
    });
    body.replaceChildren(...[h('div', { class: 'grid2' }, fields),
      refDates.size ? h('p', { class: 'sub' }, `En gris : dernière valeur (${[...refDates].sort().map(fmtDate).join(', ')}), pour comparer.`) : null,
      mode === 'poids' ? h('p', { class: 'sub' }, '⚖ = valeur importée de Withings. Une correction faite ici est conservée : l\'import ne l\'écrasera plus pour ce jour-là.') : null,
      mode === 'mesures' ? h('details', {}, h('summary', { class: 'sub' }, 'Comment mesurer'),
        h('p', { class: 'sub' }, 'Mètre ruban à plat, non serré, le matin, toujours au même endroit et du même côté du corps.'),
        h('ul', { class: 'sub' }, MEASURES.map(m => h('li', {}, `${m.label} : ${m.hint}.`)))) : null].filter(Boolean));
  };
  fDate.addEventListener('change', fill);
  fill();
  const ok = h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => {
    const vals = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, num(i.value)]));
    if (!fDate.value || Object.values(vals).every(v => v == null)) return;
    const prev = existing(fDate.value) || {};
    const rec = { ...prev, id: fDate.value, date: fDate.value, updatedAt: Date.now() };
    for (const [k, v] of Object.entries(vals)) rec[k] = v ?? prev[k] ?? null;
    // Une valeur changée à la main n'est plus « Withings » ; l'import ne l'écrasera plus pour ce jour-là.
    for (const k of ['poids', 'mg']) if (vals[k] != null && vals[k] !== prev[k]) rec.src = { ...rec.src, [k]: 'manuel' };
    db.body[fDate.value] = rec;
    ui.bodyEntry = null; save(); render();
  } }, 'Enregistrer');
  return h('div', { class: 'card entry', role: 'group', 'aria-label': 'Saisir une mesure' },
    seg, h('label', { class: 'field' }, h('span', {}, 'Date'), fDate), body, ok);
}

function viewBody() {
  setTab('corps');
  const list = Object.values(db.body).filter(b => !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
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
    remindBanner(),
    // Carte de la dernière pesée ; sa ligne « Saisir » déplie le formulaire de saisie juste dessous.
    h('div', { class: 'card fold' },
      last ? [h('div', { class: 'row between' }, h('span', { class: 'sub' }, `Dernière pesée, ${fmtDate(last.date)}${last.src?.poids === 'withings' && last.withings?.at ? ' ' + fmtHour(last.withings.at) : ''}`),
        last.src?.poids === 'withings' ? h('span', { class: 'wb' }, '⚖ Withings') : srcOf('poids') === 'manuel' ? h('span', { class: 'wb man' }, '✎ Manuel') : null),
      h('div', { class: 'row', style: 'align-items:baseline;gap:18px' }, h('div', { class: 'big' }, `${fmtKg(last.poids)} kg`),
        last.mg != null ? h('div', { class: 'mid' }, `${fmtKg(last.mg)} %`) : null),
      prevW ? h('div', { class: 'sub delta ' + (last.poids <= prevW.poids ? 'up' : 'down') }, `${last.poids - prevW.poids > 0 ? '+' : ''}${fmtKg(Math.round((last.poids - prevW.poids) * 10) / 10)} kg depuis ${fmtDate(prevW.date)}`) : null]
        : h('div', { class: 'sub' }, 'Aucune pesée pour l\'instant.'),
      h('button', { class: 'more', 'aria-expanded': String(!!ui.bodyEntry), onclick: () => { ui.bodyEntry = ui.bodyEntry ? null : 'mesures'; viewBody(); } },
        h('span', {}, 'Saisir'), h('span', { 'aria-hidden': 'true' }, ui.bodyEntry ? '⌃' : '›'))),
    ui.bodyEntry ? entryForm(ui.bodyEntry) : null,
    summaryRows.length ? [h('h2', {}, 'Évolution des mensurations'),
      h('div', { class: 'card' }, h('table', {}, h('tr', {}, h('th', {}, 'Mesure'), h('th', {}, 'Dernière'), h('th', {}, 'Depuis la 1re')), summaryRows))] : null,
    h('h2', {}, 'Poids'),
    wPts.length ? lineChart([{ name: 'Moyenne 7 jours', points: avg }, { name: 'Pesée', points: wPts, raw: true, line: false }], 'kg') : h('p', { class: 'muted' }, 'Aucune pesée.'),
    pts('mg').length ? [h('h2', {}, 'Masse grasse'), lineChart([{ name: 'Masse grasse', points: pts('mg') }], '%')] : null,
    MEASURES.map(m => pts(m.key).length ? [h('h2', {}, m.label), lineChart([{ name: m.label, points: pts(m.key) }], 'cm')] : null),
    h('details', {}, h('summary', {}, 'Toutes les mesures'),
      h('table', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'kg'), h('th', {}, '% gras'), MEASURES.map(m => h('th', {}, m.short)), h('th', {})),
        [...list].reverse().map(b => h('tr', {}, h('td', {}, fmtDate(b.date)), h('td', {}, fmtKg(b.poids) || '–'), h('td', {}, fmtKg(b.mg) || '–'), MEASURES.map(m => h('td', {}, fmtKg(b[m.key]) || '–')),
          h('td', {}, Object.values(b.src || {}).includes('withings') ? h('span', { class: 'wb' }, '⚖') : b.poids != null || b.mg != null ? h('span', { class: 'mb' }, '✎') : ''))))));
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
  const label = { off: 'Local seulement', idle: 'Synchro en attente', busy: sync.phase === 'withings' ? 'Withings…' : 'Synchro…', ok: `Synchronisé ${sync.at || ''}`, err: 'Erreur de synchro' }[sync.state];
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
  const sum = document.getElementById('sync-sum');
  if (sum) sum.replaceChildren(...syncSummary());
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

// Programme : lecture seule de programs.json (écrit par le dashboard PC, à côté du fichier de données).
// Renvoie true si une nouvelle version est arrivée. Un échec ici ne fait pas échouer la synchro des séances.
async function pullPrograms() {
  try {
    const url = ghUrl().replace(/[^/]+$/, 'programs.json');
    const r = await ghFetch(url, { headers: ghHeaders(), cache: 'no-store' });
    if (r.status === 404 || !r.ok) return false;
    const j = await r.json();
    const p = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, '')))));
    if (!Array.isArray(p.versions) || JSON.stringify(p.versions) === JSON.stringify(programs?.versions)) return false;
    programs = { versions: p.versions }; store(PKEY, programs); fillExercises();
    slog(`Programme reçu : ${programFor(today()).label}`);
    return true;
  } catch (e) { slog(`Programme non lu : ${e.message}`); return false; }
}
async function syncNow(manual, forceWithings) {
  const isManual = manual === true;
  slog(isManual ? 'Appui sur « Synchroniser maintenant »' : 'Synchro automatique');
  if (!cfgOk()) { slog(`Annulé : il manque ${missingFields().join(', ')}`); sync.state = 'off'; if (isManual) go('#/sync'); return; }
  // Une synchro bloquée depuis plus de 20 s ne doit pas empêcher les suivantes.
  if (syncing && Date.now() - syncStartedAt < 20000) { slog('Une synchro est déjà en cours, appui ignoré'); return; }
  if (!navigator.onLine) { slog('Annulé : le téléphone indique « hors ligne »'); if (isManual) { sync.state = 'err'; sync.msg = 'hors ligne'; refreshChips(); } return; }
  syncing = true; syncStartedAt = Date.now(); sync.state = 'busy'; refreshChips();
  let localChanged = false;
  try {
    await pullWithings(); // réglage « automatique » à jour avant l'import
    const wi = await withingsFetch(forceWithings === true, isManual);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const remote = await ghGet();
        const merged = merge(db, remote.data);
        if (wi?.days) { const r = applyDays(merged.body, wi.days, Date.now()); Object.assign(merged.body, r.out); wi.count = r.count; }
        const changedRemote = JSON.stringify(merged) !== JSON.stringify({ sessions: remote.data?.sessions || {}, body: remote.data?.body || {} });
        localChanged = JSON.stringify(merged) !== JSON.stringify(db);
        db = merged; store(KEY, db);
        if (changedRemote) await ghPut(merged, remote.sha);
        break;
      } catch (e) { if (!e.conflict || attempt) throw e; }
    }
    if (wi) {
      const before = activity;
      try { await withingsSave(wi); } catch (e) { slog(`État Withings non écrit : ${e.message}`); }
      if (activity !== before) localChanged = true;
    }
    if (await pullPrograms()) localChanged = true;
    if (await pullReminder()) localChanged = true;
    if (await pullGoals()) localChanged = true;
    if (!wi?.stepDays && await pullActivity()) localChanged = true;
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
  // (la page Exercices garde sa recherche en cours : pas de redessin.)
  // (Corps n'est pas redessiné pendant une saisie dépliée : les champs en cours seraient perdus.)
  const readOnlyView = ['', '#/', '#/historique', '#/historique/seances'].includes(location.hash) || (location.hash === '#/corps' && !ui.bodyEntry)
    || location.hash === '#/objectifs' || location.hash.startsWith('#/ex/');
  if (localChanged && readOnlyView) render();
  if (location.hash === '#/withings' && wConnected()) render(); // résultat de l'import
}

// ---------- Réglages, export / import ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function toCsv() {
  const lines = ['date;seance;exercice;serie;kg;reps;reserve;charge;duree_seance_min'];
  for (const r of Object.values(db.sessions).filter(x => !x.deleted).sort((a, b) => a.date.localeCompare(b.date))) {
    const dur = r.clock?.start ? Math.round(sessionDuration(r) / 60e3) : '';
    for (const [exId, e] of Object.entries(r.entries || {})) {
      doneSets(e).forEach((x, i) => lines.push([r.date, r.name, EXERCISES[exId]?.name || exId, i + 1, String(x.kg).replace('.', ','), x.reps, x.rir, e.load === 'up' ? 'trop legere' : e.load === 'down' ? 'trop lourde' : '', dur].join(';')));
    }
  }
  return lines.join('\n');
}
// Ligne de liste qui ouvre une rubrique de Réglages
function navRow(href, icon, icCls, title, summary, summaryId) {
  return h('a', { class: 'navrow', href },
    h('span', { class: 'ic ' + icCls }, icon),
    h('span', {}, h('b', {}, title), h('small', { id: summaryId }, summary)),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
}
const syncIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4' }));
const saveIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M12 3v12M7 10l5 5 5-5M4 20h16' }));
function syncSummary() {
  const st = { off: ['', 'Non configurée'], idle: ['', 'Prête'], busy: ['', 'Synchronisation…'], ok: ['ok', `Synchronisé à ${sync.at || ''}`], err: ['err', 'Erreur de synchro'] }[sync.state];
  return [h('span', { class: 'dot ' + st[0] }), st[1]];
}
// ---------- Balance Withings ----------
// L'iPhone importe lui-même pesées et pas à chaque synchro (ouverture de l'appli, retour dessus), au plus toutes les 2 min.
// Identifiants et jetons Withings : seulement dans cet iPhone (muscu.withings.auth), ni OneDrive ni GitHub.
// withings.json du dépôt privé : réglage « récupération automatique » partagé avec le dashboard, et état du dernier import.
const WKEY = 'muscu.withings', WAUTH = 'muscu.withings.auth';
let wstate = load(WKEY, null), wauth = load(WAUTH, {}), wMsg = '';
const W_API = load('muscu.wapi', null) || 'https://wbsapi.withings.net'; // surchargé uniquement pour les tests
const W_AUTH_URL = 'https://account.withings.com/oauth2_user/authorize2';
// Page relais déclarée chez Withings comme adresse de retour : elle renvoie la réponse vers l'appli.
const W_RELAY = location.origin + location.pathname.replace(/[^/]*$/, '') + 'withings-callback.html';
const W_SINCE = '2026-10-26'; // date de départ de l'import
const W_YEAR = 365 * 864e5, W_EVERY = 120e3;
const wConnected = () => !!wauth.refreshToken;
const hasStepsScope = () => /user\.activity/.test(wauth.scope || '');
const decodeContent = j => JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, '')))));
async function pullWithings() {
  try {
    const r = await ghFetch(ghUrl().replace(/[^/]+$/, 'withings.json'), { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return; // 404 : Withings jamais connecté
    wstate = decodeContent(await r.json()); store(WKEY, wstate);
  } catch (e) { slog(`État Withings non lu : ${e.message}`); }
}
// Lit un fichier JSON du dépôt privé, le transforme et le réécrit. fn renvoie null : rien à écrire.
async function updateRepoJson(name, fn, message) {
  const url = ghUrl().replace(/[^/]+$/, name);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ghFetch(url, { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status}`);
    const j = r.status === 404 ? null : await r.json();
    const next = fn(j ? decodeContent(j) : {});
    if (!next) return null;
    const body = { message: `${message} ${new Date().toISOString()}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(next, null, 1)))) };
    if (j) body.sha = j.sha;
    const p = await ghFetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (p.status === 409 || p.status === 422) continue;
    if (!p.ok) throw new Error(`GitHub ${p.status}`);
    return next;
  }
  throw new Error('conflit, réessaie');
}
// Le jeton passe dans le corps de la requête : un en-tête Authorization serait bloqué par Safari (CORS de Withings).
async function wpost(p, params) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(W_API + p, { method: 'POST', body: new URLSearchParams(params), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (j.status !== 0) throw new Error(`Withings : erreur ${j.status ?? r.status}${j.error ? ` (${j.error})` : ''}`);
    return j.body;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'Withings : délai dépassé (15 s)' : e.message); }
  finally { clearTimeout(t); }
}
function keepTokens(b) {
  Object.assign(wauth, { accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt: Date.now() + (b.expires_in || 10800) * 1000, refreshedAt: Date.now(), scope: b.scope || wauth.scope });
  store(WAUTH, wauth);
}
async function wToken() {
  if (wauth.accessToken && wauth.expiresAt > Date.now() + 60e3) return wauth.accessToken;
  // Withings remplace le jeton de rafraîchissement à chaque usage : le nouveau est enregistré aussitôt.
  keepTokens(await wpost('/v2/oauth2', { action: 'requesttoken', grant_type: 'refresh_token', client_id: wauth.clientId, client_secret: wauth.clientSecret, refresh_token: wauth.refreshToken }));
  return wauth.accessToken;
}
function withingsConnect(clientId, clientSecret) {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => pad2(b.toString(16))).join('');
  Object.assign(wauth, { clientId, clientSecret, state }); store(WAUTH, wauth);
  location.href = `${W_AUTH_URL}?${new URLSearchParams({ response_type: 'code', client_id: clientId, scope: 'user.metrics,user.activity', redirect_uri: W_RELAY, state })}`;
}
// Retour de la page d'accord Withings, via la page relais : ?code=…&state=…
async function finishWithingsAuth(q) {
  try {
    if (q.get('error')) throw new Error(`accès refusé (${q.get('error')})`);
    if (!wauth.state || q.get('state') !== wauth.state) throw new Error('réponse Withings inattendue, recommence la connexion');
    delete wauth.state;
    keepTokens(await wpost('/v2/oauth2', { action: 'requesttoken', grant_type: 'authorization_code', client_id: wauth.clientId, client_secret: wauth.clientSecret, code: q.get('code'), redirect_uri: W_RELAY }));
    wMsg = 'Connectée. Premier import en cours…';
  } catch (e) { wMsg = `Connexion impossible : ${e.message}`; store(WAUTH, wauth); }
  if (location.hash === '#/withings') render();
  syncNow(false, wConnected());
}
async function withingsDisconnect() {
  for (const k of ['accessToken', 'refreshToken', 'expiresAt', 'refreshedAt', 'lastError', 'lastStepsError', 'lastTry']) delete wauth[k];
  store(WAUTH, wauth);
  const next = await updateRepoJson('withings.json', d => ({ ...d, connected: false, by: 'iphone', statusAt: Date.now() }), 'withings');
  if (next) { wstate = next; store(WKEY, wstate); }
}

const r1 = v => Math.round(v * 10) / 10;
// Pesées depuis W_SINCE, une par jour : la première du matin, avec la masse grasse de cette même pesée
// (sinon la première masse grasse du jour).
async function wFetchDays(token) {
  const groups = [];
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const b = await wpost('/measure', {
      action: 'getmeas', meastypes: '1,6', category: '1', access_token: token,
      startdate: String(Math.floor(parseYmd(W_SINCE).getTime() / 1000)), enddate: String(Math.floor(Date.now() / 1000)),
      ...(offset ? { offset: String(offset) } : {}),
    });
    groups.push(...(b.measuregrps || []));
    if (!b.more) break;
    offset = b.offset;
  }
  const days = {};
  for (const g of groups.sort((a, b) => a.date - b.date)) {
    const val = t => { const m = (g.measures || []).find(x => x.type === t); return m ? r1(m.value * 10 ** m.unit) : null; };
    const d = ymd(new Date(g.date * 1000)), w = val(1), f = val(6);
    if (d < W_SINCE) continue;
    const cur = days[d] || (days[d] = { at: null, poids: null, mg: null });
    if (w != null && cur.poids == null) { cur.poids = w; cur.at = g.date * 1000; if (f != null) cur.mg = f; }
    else if (f != null && cur.mg == null) cur.mg = f;
    if (cur.at == null) cur.at = g.date * 1000;
  }
  return days;
}
// Priorité à Withings : une pesée remplace la saisie manuelle du même jour, sauf si la saisie a été corrigée
// après un import précédent de ce jour-là. Une journée supprimée après import n'est pas recréée.
function applyDays(body, days, now) {
  const out = {};
  let count = 0;
  for (const [d, w] of Object.entries(days)) {
    const raw = body[d];
    if (raw && raw.deleted && raw.withings && raw.withings.at === w.at) continue;
    const cur = raw && !raw.deleted ? raw : null;
    const prevW = cur && cur.withings;
    if (prevW && prevW.at === w.at && prevW.poids === w.poids && prevW.mg === w.mg) continue;
    const rec = { ...(cur || {}), id: d, date: d, deleted: false };
    const src = { ...((cur && cur.src) || {}) }, replaced = { ...((prevW && prevW.replaced) || {}) };
    let changed = false;
    for (const k of ['poids', 'mg']) {
      if (w[k] == null) continue;
      if (prevW && cur[k] != null && cur[k] !== prevW[k]) continue; // corrigé à la main après l'import
      if (!prevW && cur && cur[k] != null && cur[k] !== w[k]) replaced[k] = cur[k];
      if (rec[k] !== w[k] || src[k] !== 'withings') changed = true;
      rec[k] = w[k];
      src[k] = 'withings';
    }
    rec.src = src;
    rec.withings = { at: w.at, poids: w.poids, mg: w.mg, importedAt: now, ...(Object.keys(replaced).length ? { replaced } : {}) };
    rec.updatedAt = now;
    out[d] = rec;
    if (changed) count++;
  }
  return { out, count };
}
// Pas quotidiens depuis W_SINCE (le jour en cours est partiel).
async function wFetchSteps(token) {
  const days = {};
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const b = await wpost('/v2/measure', {
      action: 'getactivity', startdateymd: W_SINCE, enddateymd: today(), data_fields: 'steps', access_token: token,
      ...(offset ? { offset: String(offset) } : {}),
    });
    for (const a of b.activities || []) if (a.date >= W_SINCE && a.steps != null) days[a.date] = { pas: Math.round(a.steps) };
    if (!b.more) break;
    offset = b.offset;
  }
  return days;
}
// Étape Withings de la synchro. force : « Importer maintenant » (ignore le réglage automatique et le délai) ;
// manual : appui sur la pastille de synchro (ignore seulement le délai). Renvoie null s'il n'y a rien à faire.
async function withingsFetch(force, manual) {
  if (!wConnected()) return null;
  const wPoids = srcOf('poids') === 'withings', wPas = srcOf('pas') === 'withings';
  if (!wPoids && !wPas) return null; // Données suivies : rien ne vient de Withings
  if (!force && wstate?.auto === false) return null;
  if (!force && !manual && Date.now() - (wauth.lastTry || 0) < W_EVERY) return null;
  wauth.lastTry = Date.now(); store(WAUTH, wauth);
  slog('Import Withings…'); sync.phase = 'withings'; refreshChips();
  try {
    const token = await wToken();
    const days = wPoids ? await wFetchDays(token) : {};
    let steps = null, stepsError = null;
    // Pas : un échec ne fait pas échouer l'import des pesées.
    if (wPas && hasStepsScope()) { try { steps = await wFetchSteps(token); } catch (e) { stepsError = String(e.message || e); } }
    return { days, steps, stepsError, count: 0, stepDays: 0 };
  } catch (e) { const error = String(e.message || e); slog(error); return { error }; }
  finally { sync.phase = ''; refreshChips(); }
}
// Après l'envoi de data.json : pas dans activity.json, puis état du dernier import (pour le dashboard).
async function withingsSave(wi) {
  const now = Date.now();
  if (wi.steps) {
    const next = await updateRepoJson('activity.json', d => {
      const old = d.days || {};
      wi.stepDays = Object.keys(wi.steps).filter(k => old[k]?.pas !== wi.steps[k].pas).length;
      return wi.stepDays ? { days: { ...old, ...wi.steps }, since: W_SINCE, updatedAt: now } : null;
    }, 'withings pas');
    if (next) { activity = next; store(AKEY, activity); }
  }
  if (wi.error) wauth.lastError = wi.error;
  else Object.assign(wauth, { lastImport: now, lastCount: wi.count, lastStepDays: wi.stepDays, lastError: null, lastStepsError: wi.stepsError });
  store(WAUTH, wauth);
  wMsg = wi.error ? `Échec : ${wi.error}` : `Import terminé : ${importTxt(wi.count, wi.stepDays)}.`;
  const patch = wi.error ? { lastError: wi.error }
    : { connected: true, by: 'iphone', steps: hasStepsScope(), lastImport: now, lastCount: wi.count, lastError: null, lastStepsError: wi.stepsError, since: W_SINCE, validUntil: wauth.refreshedAt + W_YEAR };
  // Écrit quand quelque chose change, sinon au plus une fois par heure (évite un commit à chaque ouverture).
  const next = await updateRepoJson('withings.json', d => {
    const changed = (d.lastError ?? null) !== (patch.lastError ?? null) || (d.lastStepsError ?? null) !== (patch.lastStepsError ?? d.lastStepsError ?? null)
      || (!wi.error && d.connected !== true) || wi.count > 0 || wi.stepDays > 0 || now - (d.statusAt || 0) > 3600e3;
    return changed ? { ...d, ...patch, statusAt: now } : null;
  }, 'withings');
  if (next) { wstate = next; store(WKEY, wstate); }
}
const importTxt = (count, stepDays) => `${count ? `${plural(count, 'pesée')} importée${count > 1 ? 's' : ''}` : 'aucune nouvelle pesée'}${stepDays ? `, pas sur ${plural(stepDays, 'jour')}` : ''}`;
// Pas quotidiens (activity.json), écrits par l'import Withings ci-dessus.
const AKEY = 'muscu.activity';
let activity = load(AKEY, { days: {} });
async function pullActivity() {
  try {
    const r = await ghFetch(ghUrl().replace(/[^/]+$/, 'activity.json'), { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return false;
    const next = decodeContent(await r.json());
    if (JSON.stringify(next) === JSON.stringify(activity)) return false;
    activity = next; store(AKEY, activity);
    return true; // nouveaux pas : la page Séance est redessinée
  } catch (e) { slog(`Pas non lus : ${e.message}`); return false; }
}
const stepGoal = () => goals?.pas || 10000; // objectif de pas réglé dans la page Objectifs
const fmtInt = n => Math.round(n).toLocaleString('fr-FR');
const fmtK = n => `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')}k`;
// Numéro de semaine ISO 8601 d'une date 'AAAA-MM-JJ' (la semaine 1 contient le premier jeudi de l'année).
function isoWeek(d) {
  const x = parseYmd(d); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7);
  const jan4 = new Date(x.getFullYear(), 0, 4);
  return 1 + Math.round(((x - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
}
// Tuile d'adhérence de la page Objectifs : même modèle et mêmes couleurs que la tuile des pas
// (gris sous 85 %, vert à partir de 85 %). Semaine passée calculée sur ses 7 jours, semaine en cours à date.
// Les semaines d'avant le début du suivi (premier programme daté ou première séance) restent vides.
const ADH_GOAL = 85;
function weeklyAdherenceCard(full) {
  const firsts = [...(programs?.versions || []).map(v => v.from), ...Object.values(db.sessions).filter(r => !r.deleted && setsDone(r) > 0).map(r => r.date)].filter(Boolean).sort();
  if (!firsts.length) return null;
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(), -7 * (7 - i)));
  const scores = weeks.map((ws, i) => addDays(ws, 6) < firsts[0] ? null : adherence(ws, i === 7 ? today() : addDays(ws, 6)).score);
  const cur = scores[7], H = 78;
  // Demi-largeur, à côté des pas (pleine largeur si les pas ne sont pas suivis) : chiffre seulement sur
  // la semaine en cours, numéros de semaine seuls.
  return h('div', { class: full ? 'card adh-full' : 'card half' },
    h('b', { class: 'tt' }, 'Adhérence'),
    h('div', { class: 'big' }, cur != null ? `${cur} %` : '–'),
    cur == null ? h('div', { class: 'sub' }, 'rien de prévu')
      : h('div', { class: cur >= ADH_GOAL ? 'steps-ok' : 'sub' }, cur >= ADH_GOAL ? '✓ objectif' : `${ADH_GOAL - cur} pt${ADH_GOAL - cur > 1 ? 's' : ''} sous ${ADH_GOAL} %`),
    h('div', { class: 'stepbars', 'aria-hidden': 'true' }, weeks.map((ws, i) => scores[i] == null ? h('div', { class: 'col empty' }, h('span'))
      : h('div', { class: 'col' + (scores[i] >= ADH_GOAL ? ' ok' : '') + (i === 7 ? ' now' : '') }, i === 7 ? h('b', {}, String(scores[i])) : null, h('span', { style: `height:${Math.max(3, scores[i] / 100 * H)}%` }))),
      h('i', { style: `bottom:${ADH_GOAL / 100 * H}%` })),
    h('div', { class: 'stepdays' }, weeks.map((ws, i) => h('span', { class: i === 7 ? 'today' : '' }, String(isoWeek(ws))))));
}
// Tuile des pas de la page Objectifs : une barre par semaine (lundi → dimanche, 8 dernières semaines),
// hauteur = moyenne de pas par jour sur les jours terminés ; la semaine en cours est hachurée.
function weeklyStepsCard() {
  const all = activity?.days || {}, goal = stepGoal();
  if (srcOf('pas') === 'off' || !Object.keys(all).length) return null;
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(), -7 * (7 - i)));
  const avgOf = ws => { const v = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter(d => d < today() && all[d]).map(d => all[d].pas); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const avgs = weeks.map(avgOf), cur = avgs[7];
  const M = Math.max(goal * 1.25, ...avgs.map(v => v || 0)), H = 78;
  // Demi-largeur, à côté de l'adhérence : chiffre seulement sur la semaine en cours, numéros de semaine seuls.
  return h('div', { class: 'card half' },
    h('div', { class: 'row between' }, h('b', { class: 'tt' }, 'Pas · moy./jour'),
      srcOf('pas') === 'manuel' ? h('span', { class: 'wb man', title: 'Saisie manuelle' }, '✎') : h('span', { class: 'wb', title: 'Withings' }, '⚖')),
    h('div', { class: 'big' }, cur != null ? fmtInt(cur) : '–'),
    cur == null ? h('div', { class: 'sub' }, 'aucun jour terminé')
      : h('div', { class: cur >= goal ? 'steps-ok' : 'sub' }, cur >= goal ? '✓ objectif' : `${fmtInt(goal - cur)} sous l'objectif`),
    h('div', { class: 'stepbars', 'aria-hidden': 'true' }, weeks.map((ws, i) => avgs[i] == null ? h('div', { class: 'col empty' }, h('span'))
      : h('div', { class: 'col' + (avgs[i] >= goal ? ' ok' : '') + (i === 7 ? ' now' : '') }, i === 7 ? h('b', {}, fmtK(avgs[i])) : null, h('span', { style: `height:${Math.max(3, avgs[i] / M * H)}%` }))),
      h('i', { style: `bottom:${goal / M * H}%` })),
    h('div', { class: 'stepdays' }, weeks.map((ws, i) => h('span', { class: i === 7 ? 'today' : '' }, String(isoWeek(ws))))));
}
// Pas saisis à la main (Données suivies › Manuel) : ceux de la veille, journée complète. Un appui sur une barre
// de la semaine corrige ce jour-là. Écrits dans activity.json comme ceux de Withings, avec src: 'manuel'.
let stepMsg = '';
function manualStepsCard() {
  const all = activity?.days || {}, goal = stepGoal(), yest = addDays(today(), -1);
  const day = ui.stepDay && ui.stepDay < today() ? ui.stepDay : yest, v = all[day]?.pas;
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(), i));
  const M = Math.max(goal * 1.25, ...week.map(d => all[d]?.pas || 0)), H = 78;
  const inp = h('input', { type: 'text', inputmode: 'numeric', placeholder: v != null ? fmtInt(v) : 'ex. 8 432', 'aria-label': `Pas du ${fmtDate(day)}` });
  const save = async () => {
    const n = num(inp.value.replace(/\s/g, ''));
    if (n == null || n < 0 || n > 150000) { stepMsg = 'Indique un nombre de pas.'; return viewHome(); }
    const rec = { pas: Math.round(n), src: 'manuel', at: Date.now() };
    stepMsg = 'Enregistrement…'; viewHome();
    try {
      // Sans synchro GitHub, les pas restent sur cet iPhone.
      activity = cfgOk() ? await updateRepoJson('activity.json', d => ({ ...d, days: { ...(d.days || {}), [day]: rec }, updatedAt: Date.now() }), 'pas')
        : { ...activity, days: { ...all, [day]: rec } };
      store(AKEY, activity); ui.stepDay = null; stepMsg = '';
    } catch (e) { stepMsg = `Non enregistré : ${e.message}`; }
    viewHome();
  };
  const col = d => {
    const x = d < today() ? all[d]?.pas : null;
    const attrs = d < today() ? { onclick: () => { ui.stepDay = d; stepMsg = ''; viewHome(); } } : {};
    const sel = d === day ? ' sel' : '';
    if (x == null) return h('div', { class: 'col empty' + sel, ...attrs }, h('span'));
    return h('div', { class: 'col' + (x >= goal ? ' ok' : '') + sel, ...attrs }, h('b', {}, fmtK(x)), h('span', { style: `height:${Math.max(3, x / M * H)}%` }));
  };
  const editing = v == null || !!ui.stepDay;
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('span', { class: 'sub' }, day === yest ? `Pas d'hier, ${JOURS[parseYmd(day).getDay()]}` : `Pas du ${fmtDateLong(day)}`), h('span', { class: 'wb man' }, '✎ Manuel')),
    h('div', { class: 'row', style: 'align-items:baseline;gap:12px' }, h('div', { class: 'big' }, v != null ? fmtInt(v) : '–'),
      v == null ? h('span', { class: 'sub' }, 'pas encore saisis')
        : h('span', { class: v >= goal ? 'steps-ok' : 'sub' }, v >= goal ? '✓ objectif atteint' : `${fmtInt(goal - v)} sous l'objectif`)),
    editing ? [h('form', { class: 'step-in', onsubmit: e => { e.preventDefault(); save(); } }, inp, h('button', { class: 'btn small' }, 'OK')),
      h('div', { class: 'sub' }, stepMsg || 'Le chiffre est dans l\'app Santé de l\'iPhone (Parcourir › Activité › Pas).')] : null,
    h('div', { class: 'stepbars' }, week.map(col), h('i', { style: `bottom:${goal / M * H}%` })),
    h('div', { class: 'stepdays' }, week.map((d, i) => h('span', { class: d === day ? 'today' : '' }, ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'][i]))));
}
// Carte des pas de la page Séance : le jour en cours (partiel, mis à jour à chaque import Withings), puis la semaine
// du lundi au dimanche avec le nombre de pas en milliers sur chaque barre (jour en cours hachuré, jours à venir vides).
function stepsCard() {
  const mode = srcOf('pas');
  if (mode === 'off') return null;
  if (mode === 'manuel') return manualStepsCard();
  const all = activity?.days || {};
  if (!Object.keys(all).length) return null;
  const t = all[today()]?.pas, y = all[ymd(new Date(Date.now() - 864e5))]?.pas;
  const at = wauth.lastImport || activity.updatedAt;
  const week = []; { const d = parseYmd(weekStart()); for (let i = 0; i < 7; i++) { week.push(ymd(d)); d.setDate(d.getDate() + 1); } }
  const wDone = week.filter(d => d < today() && all[d]).map(d => all[d].pas);
  const M = Math.max(stepGoal() * 1.25, ...week.map(d => all[d]?.pas || 0));
  const H = 78; // part de la colonne laissée à la barre, le reste pour le chiffre
  const col = d => {
    const v = d > today() ? null : all[d]?.pas;
    if (v == null) return h('div', { class: 'col empty' }, h('span'));
    return h('div', { class: 'col' + (v >= stepGoal() ? ' ok' : '') + (d === today() ? ' now' : '') },
      h('b', {}, fmtK(v)), h('span', { style: `height:${Math.max(3, v / M * H)}%` }));
  };
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('span', { class: 'sub' }, `Pas aujourd'hui${t != null && at && ymd(new Date(at)) === today() ? ` · mis à jour à ${fmtHour(at)}` : ''}`), h('span', { class: 'wb' }, '⚖ Withings')),
    h('div', { class: 'row', style: 'align-items:baseline;gap:12px' }, h('div', { class: 'big' }, t != null ? fmtInt(t) : '–'),
      t == null ? h('span', { class: 'sub' }, `pas encore de données${y != null ? ` · hier ${fmtInt(y)}${y >= stepGoal() ? ' ✓' : ''}` : ''}`)
        : h('span', { class: t >= stepGoal() ? 'steps-ok' : 'sub' }, t >= stepGoal() ? '✓ objectif atteint' : `encore ${fmtInt(stepGoal() - t)} pour ${fmtInt(stepGoal())}`)),
    h('div', { class: 'sub' }, wDone.length
      ? `Cette semaine : ${(k => `${k} jour${k > 1 ? 's' : ''}`)(wDone.filter(x => x >= stepGoal()).length)} sur ${wDone.length} à ${fmtInt(stepGoal())} · moyenne ${fmtInt(wDone.reduce((a, b) => a + b, 0) / wDone.length)}`
      : 'La semaine commence aujourd\'hui.'),
    h('div', { class: 'stepbars', 'aria-hidden': 'true' }, week.map(col), h('i', { style: `bottom:${stepGoal() / M * H}%` })),
    h('div', { class: 'stepdays' }, week.map(d => h('span', { class: d === today() ? 'today' : '' }, ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'][week.indexOf(d)]))));
}
async function setWithingsAuto(auto) {
  wstate = await updateRepoJson('withings.json', d => ({ ...d, auto, autoAt: Date.now() }), 'withings réglage');
  store(WKEY, wstate);
}
const scaleIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('rect', { x: 4, y: 4, width: 16, height: 16, rx: 4 }), s('path', { d: 'M8.5 10a5 5 0 0 1 7 0M12 10.5 13.5 8' }));
const lastWithings = () => Object.values(db.body).filter(b => !b.deleted && b.withings?.at).sort((a, b) => b.withings.at - a.withings.at)[0];
const whenTxt = ms => `${fmtDate(ymd(new Date(ms)))} ${fmtHour(ms)}`;
function withingsSummary() {
  if (!wConnected()) return 'Non connectée';
  if (wstate?.auto === false) return 'Désactivée · saisie manuelle';
  const l = lastWithings();
  return `Automatique${l ? ` · dernière pesée ${whenTxt(l.withings.at)}` : ''}`;
}
function viewWithings() {
  setTab('set');
  const head = [h('div', { class: 'row between' }, h('a', { href: '#/sources' }, '‹ Données suivies'), syncChip()), h('h1', {}, 'Balance Withings')];
  const note = wMsg ? h('p', { class: 'sub', role: 'status' }, wMsg) : null;
  if (!wConnected()) {
    const field = (label, inp) => h('label', { class: 'field' }, h('span', {}, label), inp);
    const id = h('input', { value: wauth.clientId || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const secret = h('input', { type: 'password', placeholder: wauth.clientSecret ? 'Laisser vide pour garder l\'actuel' : '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const err = h('div', { class: 'sub' });
    const connect = () => {
      const cid = id.value.trim(), cs = secret.value.trim() || wauth.clientSecret || '';
      if (!cid || !cs) { err.textContent = 'Renseigne le Client ID et le Secret.'; return; }
      wMsg = ''; withingsConnect(cid, cs);
    };
    return mount(head,
      h('div', { class: 'card' },
        h('b', {}, 'Connecter la balance'),
        h('div', { class: 'sub' }, 'Identifiants de ton application sur developer.withings.com. Ils restent sur cet iPhone.'),
        field('Client ID', id), field('Secret', secret),
        h('button', { class: 'btn', disabled: !cfgOk(), onclick: connect }, 'Se connecter à Withings'),
        cfgOk() ? h('div', { class: 'sub' }, 'Ouvre la page Withings : choisis le compte de la balance, accepte, l\'appli revient ici.')
          : h('div', { class: 'sub' }, 'Configure d\'abord la synchronisation GitHub.'),
        err),
      note,
      h('div', { class: 'card sub' }, 'Adresse de retour à déclarer chez Withings : ', h('b', {}, W_RELAY)));
  }
  const st = wstate || {}, l = lastWithings();
  const msg = h('div', { class: 'sub' });
  const tog = h('input', { type: 'checkbox', class: 'switch', checked: st.auto !== false, disabled: !cfgOk(), 'aria-label': 'Récupération automatique' });
  tog.addEventListener('change', async () => {
    tog.disabled = true; msg.textContent = 'Enregistrement…';
    try {
      await setWithingsAuto(tog.checked);
      msg.textContent = tog.checked ? 'Activée : pesées et pas importés à chaque ouverture de l\'appli.' : 'Désactivée : plus rien n\'est importé, la saisie reste manuelle.';
    } catch (e) { tog.checked = !tog.checked; msg.textContent = `Échec : ${e.message}`; }
    tog.disabled = false;
  });
  const lastStep = Object.keys(activity?.days || {}).sort().pop();
  const kv = (k, v) => [h('span', { class: 'sub' }, k), h('span', {}, v)];
  let confirmOff = false;
  const offBtn = h('button', { class: 'btn danger', onclick: async () => {
    if (!confirmOff) { confirmOff = true; offBtn.textContent = 'Confirmer la déconnexion'; return; }
    offBtn.disabled = true;
    try { await withingsDisconnect(); wMsg = 'Déconnectée : plus rien n\'est importé.'; } catch (e) { wMsg = `Échec : ${e.message}`; }
    viewWithings();
  } }, 'Déconnecter');
  mount(head,
    h('div', { class: 'card' },
      h('label', { class: 'row between' }, h('span', {}, h('b', {}, 'Récupération automatique'), h('div', { class: 'sub' }, 'À chaque ouverture de l\'appli')), tog),
      cfgOk() ? msg : h('div', { class: 'sub' }, 'Configure d\'abord la synchronisation GitHub.')),
    h('div', { class: 'card' },
      h('div', { class: 'kvg' },
        kv('État', 'Connectée sur cet iPhone'),
        l ? kv('Dernière pesée', `${whenTxt(l.withings.at)} · ${fmtKg(l.withings.poids)} kg${l.withings.mg != null ? ` · ${fmtKg(l.withings.mg)} %` : ''}`) : null,
        lastStep ? kv('Pas', `${fmtInt(activity.days[lastStep].pas)} le ${fmtDate(lastStep)}`) : null,
        wauth.lastImport ? kv('Dernier import', `${whenTxt(wauth.lastImport)} · ${importTxt(wauth.lastCount || 0, wauth.lastStepDays || 0)}`) : null,
        kv('Depuis le', fmtDate(W_SINCE)),
        wauth.lastError ? kv('Erreur', wauth.lastError) : null,
        wauth.lastStepsError ? kv('Erreur pas', wauth.lastStepsError) : null)),
    note,
    h('button', { class: 'btn', disabled: !cfgOk(), onclick: () => { wMsg = 'Import en cours…'; viewWithings(); syncNow(true, true); } }, 'Importer maintenant'),
    offBtn,
    h('p', { class: 'sub' }, 'Désactivée, plus rien n\'est importé et la saisie reste manuelle. Sans réseau, l\'import se fera à la prochaine ouverture.'));
}

// ---------- Rappel mensurations ----------
// Réglage partagé dans reminders.json du dépôt privé : lu par le dashboard et par l'automate qui envoie
// la notification ntfy. « Demain » ne masque le rappel que sur cet iPhone, jusqu'au lendemain.
const RKEY = 'muscu.reminder', RSNOOZE = 'muscu.reminder.snooze';
let reminder = load(RKEY, null);
const remCfg = () => ({ ...REMINDER_DEFAULT, ...(reminder?.mensurations || {}) });
const remStatus = () => reminderStatus(db.body, remCfg(), today());
const remShown = () => remStatus().isDue && load(RSNOOZE, '') !== today();
async function pullReminder() {
  try {
    const r = await ghFetch(ghUrl().replace(/[^/]+$/, 'reminders.json'), { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return false; // 404 : jamais réglé, valeurs par défaut
    const next = decodeContent(await r.json());
    if (JSON.stringify(next) === JSON.stringify(reminder)) return false;
    reminder = next; store(RKEY, reminder);
    return true;
  } catch (e) { slog(`Rappel non lu : ${e.message}`); return false; }
}
async function saveReminder(patch) {
  reminder = await updateRepoJson('reminders.json', d => ({ ...d, mensurations: { ...REMINDER_DEFAULT, ...(d.mensurations || {}), ...patch, updatedAt: Date.now() } }), 'rappel');
  store(RKEY, reminder);
}
function remindBanner(long) {
  if (!remShown()) return null;
  const s = remStatus();
  return h('div', { class: 'remind', role: 'status' },
    h('b', {}, '⌀ Mensurations à mettre à jour'),
    h('div', { class: 'sub' }, s.last ? `Dernière mesure il y a ${plural(s.daysSince, 'jour')}${long ? ` (${fmtDate(s.last)}). Le matin à jeun, avant la séance.` : '.'}` : 'Aucune mensuration enregistrée pour l\'instant.'),
    h('div', { class: 'acts' },
      h('button', { class: 'btn small', onclick: () => openEntry('mesures') }, 'Saisir'),
      h('button', { class: 'btn small secondary', onclick: () => { store(RSNOOZE, today()); render(); } }, 'Demain')));
}
const remindSummary = () => { const r = remCfg(); return r.on ? `Toutes les ${r.weeks > 1 ? `${r.weeks} semaines` : 'semaines'}, le ${REMINDER_DAYS[r.day]}` : 'Désactivé'; };
function viewReminder() {
  setTab('set');
  const r = remCfg(), s = remStatus();
  const msg = h('p', { class: 'sub', role: 'status' });
  const apply = async patch => {
    if (!cfgOk()) { msg.textContent = 'Configure d\'abord la synchronisation GitHub.'; return; }
    msg.textContent = 'Enregistrement…';
    try { await saveReminder(patch); viewReminder(); } catch (e) { msg.textContent = `Échec : ${e.message}`; }
  };
  const pills = (cls, opts, cur, key) => h('div', { class: 'pills ' + cls },
    opts.map(([v, t]) => h('button', { type: 'button', class: v === cur ? 'on' : '', onclick: () => v !== cur && apply({ [key]: v }) }, t)));
  const tog = h('input', { type: 'checkbox', class: 'switch', checked: r.on, 'aria-label': 'Rappel activé' });
  tog.addEventListener('change', () => apply({ on: tog.checked }));
  const checks = h('div', { class: 'checks' }, MEASURES.map(m => {
    const c = h('input', { type: 'checkbox', checked: r.measures.includes(m.key) });
    c.addEventListener('change', () => {
      const next = MEASURES.map(x => x.key).filter(k => k === m.key ? c.checked : r.measures.includes(k));
      if (!next.length) { c.checked = true; msg.textContent = 'Garde au moins une mesure.'; return; }
      apply({ measures: next });
    });
    return h('label', {}, c, m.short);
  }));
  const hour = h('select', {}, h('option', { value: '' }, 'Pas de notification'),
    Array.from({ length: 16 }, (_, i) => i + 6).map(x => h('option', { value: String(x), selected: r.notifyHour === x }, `${x} h`)));
  if (r.notifyHour == null) hour.value = '';
  hour.addEventListener('change', () => apply({ notifyHour: hour.value === '' ? null : Number(hour.value) }));
  const next = s.isDue ? 'maintenant' : fmtDateLong(s.due);
  mount(
    h('a', { class: 'back', href: '#/reglages' }, '‹ Réglages'),
    h('h1', {}, 'Rappel mensurations'),
    h('div', { class: 'card' }, h('label', { class: 'row between' }, h('b', {}, 'Rappel activé'), tog)),
    r.on ? h('div', { class: 'card' },
      h('div', { class: 'sub' }, 'Fréquence'),
      pills('p4', [1, 2, 3, 4].map(w => [w, `${w} sem.`]), r.weeks, 'weeks'),
      h('div', { class: 'sub' }, 'Jour du rappel'),
      pills('p7', [1, 2, 3, 4, 5, 6, 0].map(d => [d, REMINDER_DAYS[d][0].toUpperCase()]), r.day, 'day'),
      h('div', { class: 'sub' }, 'Mesures à faire'), checks,
      h('label', { class: 'field', style: 'margin-top:14px' }, h('span', {}, 'Notification sur le téléphone (ntfy), ce jour-là'), hour)) : null,
    msg,
    h('div', { class: 'card sub' }, s.last ? `Dernière mesure : ${fmtDate(s.last)}` : 'Aucune mensuration enregistrée.',
      r.on ? [h('br'), h('b', { style: 'color:var(--ink)' }, `Prochain rappel : ${next}`)] : null),
    h('p', { class: 'sub' }, 'Le rappel apparaît en haut de Séance et de Corps, avec une pastille sur l\'onglet Corps, jusqu\'à la saisie. Si rien n\'est saisi, la notification revient chaque semaine le même jour.'));
}

// ---------- Objectifs ----------
// Objectifs de poids, masse grasse et pas, saisis dans l'appli et partagés dans goals.json du dépôt privé.
// Chaque carte : valeur actuelle (moyenne 7 jours), objectif, part du chemin faite depuis le point de départ, courbe.
const GKEY = 'muscu.goals';
let goals = load(GKEY, null);
async function pullGoals() {
  try {
    const r = await ghFetch(ghUrl().replace(/[^/]+$/, 'goals.json'), { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return false; // 404 : aucun objectif saisi
    const next = decodeContent(await r.json());
    if (JSON.stringify(next) === JSON.stringify(goals)) return false;
    goals = next; store(GKEY, goals);
    return true;
  } catch (e) { slog(`Objectifs non lus : ${e.message}`); return false; }
}
async function saveGoals(patch) {
  goals = await updateRepoJson('goals.json', d => ({ ...d, ...patch, updatedAt: Date.now() }), 'objectifs');
  store(GKEY, goals);
}

// ---------- Données suivies ----------
// Origine du poids et des pas, partagée dans goals.json (sources). Sans réglage : tout vient de Withings
// si la balance est connectée, sinon poids saisi à la main et pas non suivis.
const SRC_LABEL = { withings: 'Withings', manuel: 'manuel', off: 'non suivis' };
function srcOf(k) {
  const v = goals?.sources?.[k];
  if (v) return v;
  return wConnected() || wstate?.connected ? 'withings' : k === 'pas' ? 'off' : 'manuel';
}
const sourcesSummary = () => `Poids : ${SRC_LABEL[srcOf('poids')]} · Pas : ${SRC_LABEL[srcOf('pas')]}`;
function viewSources() {
  setTab('set');
  const msg = h('p', { class: 'sub', role: 'status' });
  const apply = async (k, v) => {
    if (!cfgOk()) { msg.textContent = 'Configure d\'abord la synchronisation GitHub.'; return; }
    msg.textContent = 'Enregistrement…';
    try {
      await saveGoals({ sources: { poids: srcOf('poids'), pas: srcOf('pas'), [k]: v } });
      viewSources();
      if (v === 'withings' && wConnected()) syncNow(false, true); // premier import de la donnée choisie
    } catch (e) { msg.textContent = `Échec : ${e.message}`; }
  };
  const pills = (k, opts) => h('div', { class: `pills src p${opts.length}` },
    opts.map(([v, t]) => h('button', { type: 'button', class: srcOf(k) === v ? 'on' : '', onclick: () => srcOf(k) !== v && apply(k, v) }, t)));
  const needW = srcOf('poids') === 'withings' || srcOf('pas') === 'withings';
  mount(
    h('a', { class: 'back', href: '#/reglages' }, '‹ Réglages'),
    h('h1', {}, 'Données suivies'),
    h('div', { class: 'card' }, h('b', {}, 'Poids et masse grasse'),
      pills('poids', [['withings', '⚖ Balance Withings'], ['manuel', '✎ Saisie manuelle']]),
      h('div', { class: 'sub' }, srcOf('poids') === 'withings'
        ? 'Chaque pesée de la balance est importée à l\'ouverture de l\'appli. Une correction reste possible dans Corps › Saisir.'
        : 'Tu saisis ta pesée dans Corps › Saisir. La courbe utilise la moyenne sur 7 jours, même avec une pesée par semaine.')),
    h('div', { class: 'card' }, h('b', {}, 'Pas quotidiens'),
      pills('pas', [['withings', '⚖ Withings'], ['manuel', '✎ Manuel'], ['off', 'Non suivis']]),
      h('div', { class: 'sub' }, {
        withings: 'Importés de Withings à chaque ouverture de l\'appli.',
        manuel: 'Tu saisis les pas de la veille dans la carte Pas de la page Séance.',
        off: 'Les cartes de pas disparaissent et l\'objectif de pas n\'est plus demandé.',
      }[srcOf('pas')])),
    msg,
    h('div', { class: 'navlist' }, navRow('#/withings', scaleIcon(), 'scale', 'Balance Withings',
      needW ? withingsSummary() : `${withingsSummary()} · inutile avec ces choix`)));
}
const PERIODS = [['1m', '1 mois', 30], ['3m', '3 mois', 91], ['6m', '6 mois', 182], ['1a', '1 an', 365], ['all', 'Tout', null]];
// Moyenne des valeurs sur les 7 jours qui finissent à t (points {t, v}).
const avg7 = (pts, t) => { const w = pts.filter(p => p.t <= t && p.t > t - 7 * 864e5); return w.length ? w.reduce((a, p) => a + p.v, 0) / w.length : null; };
function goalCard(title, unit, pts, target, color, fmt) {
  const last = pts[pts.length - 1];
  if (!last) return h('div', { class: 'card goal' }, h('div', { class: 'row between' }, h('b', {}, title), target != null ? h('span', { class: 'sub' }, `objectif ${fmt(target)} ${unit}`) : null), h('p', { class: 'sub' }, 'Pas encore de mesure.'));
  const cur = avg7(pts, last.t), ago = avg7(pts, last.t - 28 * 864e5);
  const depart = goals?.depart || ymd(new Date(pts[0].t));
  const start = (pts.find(p => p.t >= parseYmd(depart).getTime()) || pts[0]).v;
  const part = target != null && start !== target ? Math.max(0, Math.min(100, Math.round((start - cur) / (start - target) * 100))) : null;
  const per = (PERIODS.find(p => p[0] === ui.objPeriod) || PERIODS[1])[2];
  const shown = per ? pts.filter(p => p.t > Date.now() - per * 864e5) : pts;
  const avgPts = shown.map(p => ({ t: p.t, v: r1(avg7(pts, p.t)) }));
  return h('div', { class: 'card goal' },
    h('div', { class: 'row between' }, h('b', {}, title), h('span', { class: 'sub' }, target != null ? `objectif ${fmt(target)} ${unit}` : 'pas d\'objectif')),
    h('div', { class: 'row', style: 'align-items:baseline;gap:10px;flex-wrap:wrap' }, h('div', { class: 'big' }, `${fmt(r1(cur))} ${unit}`),
      h('span', { class: 'sub' }, `moyenne 7 jours${ago != null ? ` · ${cur - ago > 0 ? '+' : ''}${fmt(r1(cur - ago))} en 4 sem.` : ''}`)),
    part != null ? [h('div', { class: 'track' }, h('i', { style: `width:${part}%;background:${color || 'var(--series-1)'}` })),
      h('div', { class: 'sub' }, `${part} % du chemin depuis ${fmt(start)} ${unit} · encore ${fmt(r1(Math.abs(cur - target)))} ${unit === '%' ? 'pt' : unit}`)] : null,
    shown.length ? lineChart([{ name: 'Moyenne 7 jours', points: avgPts }, { name: 'Mesure', points: shown, raw: true, line: false }], unit, { target, color }) : h('p', { class: 'sub' }, 'Aucune mesure sur cette période.'),
    // Choix de la période de la courbe, sous celle-ci (il ne concerne que cette carte).
    h('div', { class: 'pills p5', style: 'margin:6px 0 0' }, PERIODS.map(([k, t]) => h('button', { type: 'button', class: (ui.objPeriod || '3m') === k ? 'on' : '', onclick: () => { ui.objPeriod = k; viewGoals(); } }, t))));
}
// Réglages › Objectifs : poids cible, pas par jour et point de départ (la masse grasse n'est plus suivie dans Objectifs).
const goalsSummary = () => [goals?.poids != null ? `poids ${fmtKg(goals.poids)} kg` : null, srcOf('pas') !== 'off' ? `${fmtInt(stepGoal())} pas / jour` : null].filter(Boolean).join(' · ');
function viewGoalSettings() {
  setTab('set');
  const g = goals || {};
  const firstBody = Object.values(db.body).filter(b => !b.deleted).map(b => b.date).sort()[0];
  const fld = (label, key, ph) => { const i = h('input', { type: 'text', inputmode: 'decimal', value: g[key] != null ? fmtKg(g[key]) : '', placeholder: ph }); return [h('label', { class: 'field' }, h('span', {}, label), i), i]; };
  const [fP, iP] = fld('Poids cible (kg)', 'poids', 'ex. 90'), [fS, iS] = fld('Pas / jour', 'pas', '10000');
  const iD = h('input', { type: 'date', value: g.depart || firstBody || today() });
  const msg = h('p', { class: 'sub', role: 'status' });
  mount(
    h('a', { class: 'back', href: '#/reglages' }, '‹ Réglages'),
    h('h1', {}, 'Objectifs'),
    h('div', { class: 'card entry' },
      h('div', { class: 'grid2' }, fP, srcOf('pas') !== 'off' ? fS : null), // pas non suivis : pas d'objectif de pas
      h('label', { class: 'field' }, h('span', {}, 'Point de départ'), iD),
      h('p', { class: 'sub' }, 'Le point de départ sert à calculer la part du chemin faite vers le poids cible. Un objectif de poids laissé vide n\'est pas affiché.'),
      msg,
      h('button', { class: 'btn', onclick: async () => {
        if (!cfgOk()) { msg.textContent = 'Configure d\'abord la synchronisation GitHub.'; return; }
        msg.textContent = 'Enregistrement…';
        try { await saveGoals({ poids: num(iP.value), pas: srcOf('pas') === 'off' ? (g.pas ?? null) : num(iS.value) ? Math.round(num(iS.value)) : null, depart: iD.value || null }); msg.textContent = 'Objectifs enregistrés.'; }
        catch (e) { msg.textContent = `Échec : ${e.message}`; }
      } }, 'Enregistrer')));
}
function viewGoals() {
  setTab('obj');
  const list = Object.values(db.body).filter(b => !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const pts = key => list.filter(b => b[key] != null).map(b => ({ t: parseYmd(b.date).getTime(), v: b[key] }));
  mount(
    h('div', { class: 'row between' }, h('h1', {}, 'Objectifs'), syncChip()),
    // Pas et adhérence sur la même ligne ; sans pas, l'adhérence prend toute la largeur.
    (ws => ws ? h('div', { class: 'duo' }, ws, weeklyAdherenceCard()) : weeklyAdherenceCard(true))(weeklyStepsCard()),
    goalCard(['Poids', srcOf('poids') === 'manuel' ? h('span', { class: 'wb man', style: 'margin-left:8px' }, '✎ Manuel') : null], 'kg', pts('poids'), goals?.poids ?? null, null, fmtKg),
    strengthCard());
}

function viewSettings() {
  setTab('set');
  syncEditing = false; // une modification de connexion abandonnée n'est pas reprise au retour
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  mount(
    h('div', { class: 'row between' }, h('h1', {}, 'Réglages'), syncChip()),
    h('div', { class: 'navlist' },
      navRow('#/repos', timerIcon(), '', 'Minuteur de repos', restSummary()),
      navRow('#/sync', syncIcon(), 'gh', 'Synchronisation GitHub', syncSummary(), 'sync-sum'),
      navRow('#/sources', scaleIcon(), 'scale', 'Données suivies', sourcesSummary()),
      navRow('#/rappel', '⌀', 'remind-ic', 'Rappel mensurations', remindSummary()),
      navRow('#/cibles', '◎', 'goal-ic', 'Objectifs', goalsSummary()),
      navRow('#/sauvegarde', saveIcon(), 'data', 'Sauvegarde', 'Exporter, importer')),
    standalone ? null : [h('h2', {}, 'Installer sur l\'iPhone'),
      h('p', { class: 'sub' }, 'Dans Safari : bouton Partager, puis « Sur l\'écran d\'accueil ». L\'appli s\'ouvrira ensuite en plein écran et fonctionnera sans réseau.')],
    h('h2', {}, 'À propos'),
    h('p', { class: 'sub' }, `Version ${APP_VERSION}`),
    h('p', { class: 'sub' }, (p => `${p.label}${p.from ? ` · depuis le ${fmtDate(p.from)}` : ''}`)(programFor(today()))),
    h('p', { class: 'sub' }, `Double progression : quand toutes les séries atteignent le haut de la fourchette de reps, l'appli propose de monter la charge. ${Object.keys(db.sessions).length} séances et ${Object.keys(db.body).length} mesures enregistrées.`));
}
// Connexion GitHub : champs modifiables au premier réglage ou après « Modifier la connexion », sinon résumé en lecture seule.
let syncEditing = false;
function viewSync() {
  setTab('set');
  const editing = syncEditing || !cfgOk();
  const fieldInputs = {};
  const f = (key, label, type = 'text', ph = '') => {
    // En modification, le jeton n'est pas réaffiché : champ vide = on garde l'actuel.
    const keepToken = key === 'token' && cfgOk();
    const i = h('input', { type, value: keepToken ? '' : cfg[key], placeholder: keepToken ? 'Laisser vide pour garder l\'actuel' : ph, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    fieldInputs[key] = i;
    // Premier réglage : chaque champ est enregistré dès qu'il est rempli, comme avant.
    if (!cfgOk()) i.addEventListener('change', () => { cfg[key] = i.value.trim(); store(SKEY, cfg); sync.state = cfgOk() ? 'idle' : 'off'; });
    return h('label', { class: 'field' }, h('span', {}, label), i);
  };
  const readFields = () => {
    for (const [k, inp] of Object.entries(fieldInputs)) { const v = inp.value.trim(); if (k !== 'token' || v) cfg[k] = v; }
    if (!cfg.path) cfg.path = 'data.json';
    store(SKEY, cfg);
    sync.state = cfgOk() ? 'idle' : 'off';
  };
  const syncBtn = h('button', { class: 'btn', id: 'sync-btn', onclick: (ev) => {
    // Retour immédiat à l'appui : l'animation et la vibration partent avant tout le reste.
    const b = ev.currentTarget;
    b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
    try { navigator.vibrate?.(30); } catch { /* iOS ne vibre pas */ }
    try {
      // Premier réglage : on relit les champs, sur iPhone l'événement « change » peut ne pas être parti avant le toucher.
      if (Object.keys(fieldInputs).length) readFields();
      if (!cfgOk()) { slog(`Appui sur « Synchroniser maintenant ». Annulé : il manque ${missingFields().join(', ')}`); sync.flashUntil = Date.now() + 2000; sync.state = 'off'; refreshChips(); return; }
      syncNow(true);
    } catch (e) { sync.state = 'err'; sync.msg = String(e.message || e); sync.flashUntil = Date.now() + 2000; refreshChips(); }
  } }, 'Synchroniser maintenant');
  const fields = [
    f('owner', 'Compte GitHub (à saisir)', 'text', 'Exemple : ton-pseudo'),
    f('repo', 'Dépôt de données (à saisir)', 'text', 'Exemple : muscu-data'),
    f('path', 'Fichier', 'text', 'Exemple : data.json'),
    f('token', 'Jeton d\'accès (à saisir)', 'password', 'Colle le jeton ici')];
  let card;
  if (!cfgOk()) card = h('div', { class: 'card' }, fields, syncBtn);
  else if (editing) card = h('div', { class: 'card' }, fields,
    h('div', { class: 'grid2' },
      h('button', { class: 'btn secondary', onclick: () => { syncEditing = false; viewSync(); } }, 'Annuler'),
      h('button', { class: 'btn', onclick: () => { readFields(); syncEditing = false; viewSync(); syncNow(true); } }, 'Enregistrer')));
  else card = [
    h('div', { class: 'card' },
      h('dl', { class: 'kv' },
        h('dt', {}, 'Compte'), h('dd', {}, cfg.owner), h('dt', {}, 'Dépôt'), h('dd', {}, cfg.repo),
        h('dt', {}, 'Fichier'), h('dd', {}, cfg.path), h('dt', {}, 'Jeton'), h('dd', {}, 'enregistré ✓')),
      h('button', { class: 'btn secondary', onclick: () => { syncEditing = true; viewSync(); } }, 'Modifier la connexion')),
    syncBtn];
  mount(
    h('div', { class: 'row between' }, h('a', { class: 'back', href: '#/reglages' }, '‹ Réglages'), syncChip()),
    h('h1', {}, 'Synchronisation GitHub'),
    h('p', { class: 'sub' }, 'Tes données sont enregistrées sur le téléphone, puis copiées dans un dépôt GitHub privé pour les retrouver sur ton PC.'),
    card,
    editing && cfgOk() ? null : h('div', { class: 'sync-line ' + (sync.state === 'ok' ? 'ok' : sync.state === 'err' ? 'err' : ''), id: 'sync-line', role: 'status' }, syncMessage()),
    h('details', {}, h('summary', { class: 'sub' }, 'Journal de la synchro'),
      h('pre', { id: 'sync-log', class: 'sync-log' }, sync.log.length ? sync.log.join('\n') : 'Aucune tentative pour l\'instant.')));
  refreshChips(); // aligne le bouton sur l'état réel (par exemple une synchro déjà en cours)
}
function viewBackup() {
  setTab('set');
  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true });
  fileIn.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await fileIn.files[0].text());
      db = merge(db, data); save(); alert('Import terminé.'); viewBackup();
    } catch { alert('Fichier invalide.'); }
  });
  mount(
    h('a', { class: 'back', href: '#/reglages' }, '‹ Réglages'),
    h('h1', {}, 'Sauvegarde'),
    h('p', { class: 'sub' }, 'Copie de toutes tes séances et mesures dans un fichier, indépendamment de GitHub. Le CSV s\'ouvre dans Excel.'),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn secondary', onclick: () => download(`muscu-${today()}.json`, JSON.stringify(db, null, 1), 'application/json') }, 'Exporter JSON'),
      h('button', { class: 'btn secondary', onclick: () => download(`muscu-${today()}.csv`, toCsv(), 'text/csv') }, 'Exporter CSV')),
    h('div', { style: 'height:10px' }),
    h('button', { class: 'btn secondary', onclick: () => fileIn.click() }, 'Importer un JSON'), fileIn,
    h('p', { class: 'sub', style: 'margin-top:8px' }, 'L\'import fusionne le fichier avec tes données : rien n\'est effacé, la version la plus récente de chaque séance l\'emporte.'));
}

// ---------- Réglages du minuteur de repos (page dédiée et volet ouvert depuis le minuteur) ----------
const timerIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('circle', { cx: 12, cy: 13, r: 8 }), s('path', { d: 'M12 9v4l2.5 2M9 2h6' }));
// Icône « curseurs de réglage » (trois glissières)
const gearIcon = () => s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M3 6h11M18 6h3M3 12h4M11 12h10M3 18h13M20 18h1' }),
  s('circle', { cx: 16, cy: 6, r: 2 }), s('circle', { cx: 9, cy: 12, r: 2 }), s('circle', { cx: 18, cy: 18, r: 2 }));
function restSummary() {
  return cfg.sound === 'off' ? 'Désactivé' : `${SOUND_PROFILES[cfg.sound]} · ${timbre().label} · ${Math.round(cfg.volume * 100)} %`;
}
// compact = volet du minuteur : pas de textes d'aide ni de test, pour tenir sur un écran.
function restControls(compact = false) {
  const radios = (entries, isOn, pick, cls) => {
    const btns = entries.map(([k, label]) => h('button', { type: 'button', role: 'radio', 'data-k': k, onclick: () => { pick(k); paint(); } }, label));
    const paint = () => { for (const b of btns) { const on = isOn(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } help(); };
    return { el: h('div', { class: cls, role: 'radiogroup' }, btns), paint };
  };
  const soundHelp = h('p', { class: 'sub' }), timbreHelp = h('p', { class: 'sub' });
  const help = () => { soundHelp.textContent = SOUND_HELP[cfg.sound]; timbreHelp.textContent = timbre().help; };
  const profiles = radios(Object.entries(SOUND_PROFILES), k => k === cfg.sound, k => {
    cfg.sound = k; store(SKEY, cfg);
    // Aperçu : on fait entendre le signal de fin, sauf si le son est désactivé.
    unlockAudio(); if (k !== 'off') SOUNDS.end();
  }, 'seg');
  const timbres = radios(Object.entries(TIMBRES).map(([k, t]) => [k, t.label]), k => TIMBRES[k] === timbre(), k => {
    cfg.timbre = k; store(SKEY, cfg); previewSound();
  }, 'seg seg3');
  profiles.paint(); timbres.paint();
  const volLabel = h('span', {}, `Volume : ${Math.round(cfg.volume * 100)} %`);
  const volIn = h('input', { type: 'range', min: '10', max: '100', step: '5', value: String(Math.round(cfg.volume * 100)) });
  volIn.addEventListener('input', () => { cfg.volume = volIn.value / 100; volLabel.textContent = `Volume : ${volIn.value} %`; });
  // Au relâchement du curseur : on enregistre et on fait entendre le signal de fin au nouveau volume.
  volIn.addEventListener('change', () => { store(SKEY, cfg); unlockAudio(); SOUNDS.end(); });
  const audioLine = h('p', { class: 'sub', role: 'status' }, audioState());
  return [
    h('h3', { class: 'sub3' }, 'Signaux'), compact ? null : soundHelp, profiles.el,
    h('h3', { class: 'sub3' }, 'Son'), compact ? null : timbreHelp, timbres.el,
    h('label', { class: 'vol' }, volLabel, volIn),
    compact ? null : [
      h('button', { class: 'btn secondary', onclick: () => {
        previewSound();
        // L'état se lit après un court délai, le temps que le contexte audio démarre.
        setTimeout(() => { audioLine.textContent = audioState(); }, 400);
      } }, 'Tester le son'),
      audioLine],
  ];
}
function viewRest() {
  setTab('set');
  mount(
    h('a', { class: 'back', href: '#/reglages' }, '‹ Réglages'),
    h('h1', {}, 'Minuteur de repos'),
    h('p', { class: 'sub' }, 'Ces réglages s\'ouvrent aussi pendant un repos, avec le bouton de réglage de la barre du minuteur.'),
    restControls());
}
function openRestSheet() {
  if (document.querySelector('.sheet-wrap')) return;
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'dim', onclick: close }),
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Minuteur de repos' },
      h('span', { class: 'grab', 'aria-hidden': 'true' }),
      h('h2', { style: 'margin:0' }, 'Minuteur de repos'),
      restControls(true),
      h('button', { class: 'btn', onclick: close }, 'OK')));
  document.body.append(wrap);
}

// ---------- Routage ----------
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
// Page d'où l'on a ouvert le détail d'un exercice (pour son lien de retour).
let lastHash = '', exFrom = '';
function render() {
  if (location.hash.startsWith('#/ex/') && !lastHash.startsWith('#/ex/')) exFrom = lastHash;
  lastHash = location.hash;
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  window.scrollTo(0, 0);
  switch (parts[0]) {
    case 'seance': return viewSession(parts[1], parts[2] || today());
    case 'historique': return viewHistory(parts[1]);
    case 'ex': return viewExercise(parts[1]);
    case 'corps': return viewBody();
    case 'reglages': return viewSettings();
    case 'repos': return viewRest();
    case 'sync': return viewSync();
    case 'sauvegarde': return viewBackup();
    case 'sources': return viewSources();
    case 'withings': return viewWithings();
    case 'rappel': return viewReminder();
    case 'objectifs': return viewGoals();
    case 'cibles': return viewGoalSettings();
    default: return viewHome();
  }
}
let slideFrom = 0; // sens du glissement de la page qui arrive après un balayage (1 = depuis la droite, -1 = depuis la gauche)
window.addEventListener('hashchange', () => {
  ui.active = undefined;
  if (location.hash !== '#/corps') ui.bodyEntry = null; // la saisie dépliée se referme en quittant Corps
  render();
  if (slideFrom) { app.animate?.([{ transform: `translateX(${slideFrom * 28}%)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'ease-out' }); slideFrom = 0; }
});

// ---------- Balayage entre les pages ----------
// Sur les 4 pages principales : gauche = page suivante de la barre du bas, droite = précédente.
// Sur une sous-page : droite = retour à la page parente. Rien pendant une séance, sur un champ, un curseur,
// un élément qui défile de côté, ni avec un volet ouvert.
const MAIN_PAGES = ['#/objectifs', '#/', '#/historique', '#/corps', '#/reglages'];
function parentPage(hash) {
  if (hash.startsWith('#/historique/')) return '#/historique';
  if (hash.startsWith('#/ex/')) return exFrom.startsWith('#/seance/') ? exFrom : '#/historique/exercices';
  if (hash === '#/withings') return '#/sources';
  if (['#/repos', '#/sync', '#/sauvegarde', '#/sources', '#/rappel', '#/cibles'].includes(hash)) return '#/reglages';
  return null;
}
function swipeTarget(dir) { // dir = 1 : balayage vers la gauche (suivante), -1 : vers la droite
  const hash = location.hash === '' ? '#/' : location.hash;
  if (hash.startsWith('#/seance/')) return null;
  const i = MAIN_PAGES.indexOf(hash);
  if (i >= 0) return MAIN_PAGES[i + dir] || null;
  return dir < 0 ? parentPage(hash) : null;
}
const scrollsSideways = el => { for (; el && el.nodeType === 1; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true; return false; };
let swipe = null;
document.addEventListener('touchstart', e => {
  const t = e.touches[0];
  swipe = e.touches.length !== 1 || document.querySelector('.sheet-wrap') || e.target.closest('input, textarea, select, #tabs, #timer') || scrollsSideways(e.target)
    ? null : { x: t.clientX, y: t.clientY, at: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  const quick = Date.now() - swipe.at < 800;
  swipe = null;
  if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
  const dir = dx < 0 ? 1 : -1, to = swipeTarget(dir);
  if (!to) return;
  slideFrom = dir;
  go(to);
}, { passive: true });
window.addEventListener('online', () => syncNow());
db.sessions = migrateSessions(db.sessions); store(KEY, db); // renomme les anciennes fiches (Haut/Bas => Upper/Lower)
// Retour de la connexion Withings (page relais) : ?code=…&state=… On nettoie l'adresse avant d'afficher.
const wReturn = new URLSearchParams(location.search);
const isWReturn = wReturn.has('code') || wReturn.has('error');
if (isWReturn) history.replaceState(null, '', location.pathname + '#/withings');
else if (!location.hash) history.replaceState(null, '', location.pathname + '#/objectifs'); // page d'ouverture de l'appli
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
if (isWReturn) finishWithingsAuth(wReturn); // lance lui-même la synchro avec le premier import
else syncNow();
