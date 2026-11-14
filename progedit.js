'use strict';
/* Éditeur de programme : règles communes au dashboard et au téléphone (v75).
   programs.json = { versions: [{ id, label, from, days, sessions, appliedAt, changes }], draft, updatedAt }.
   Un seul brouillon, partagé : on peut commencer sur le téléphone et finir sur le dashboard (ou l'inverse).
   Chaque écriture vérifie que le fichier n'a pas changé depuis sa lecture (updatedAt) : sinon elle est refusée
   (PROG_STALE) et l'appareil recharge le programme, pour ne jamais écraser le travail fait sur l'autre. */

const PROG_DAYS = [1, 2, 3, 4, 5, 6, 0];
const PROG_STALE = 'Le programme a été modifié sur un autre appareil';
const progClone = o => JSON.parse(JSON.stringify(o));

// ---------- Contrôles avant écriture ----------
// Un programme mal formé rendrait l'appli inutilisable.
function validProgram(p, needDate) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.label !== 'string') return false;
  if (needDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.from || '')) return false;
  if (!p.days || typeof p.days !== 'object' || !p.sessions || typeof p.sessions !== 'object') return false;
  for (const n of Object.values(p.days)) if (n && !p.sessions[n]) return false;
  for (const list of Object.values(p.sessions)) {
    if (!Array.isArray(list)) return false;
    for (const e of list) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.name !== 'string') return false;
      for (const k of ['sets', 'lo', 'hi', 'rest', 'step']) if (typeof e[k] !== 'number' || !(e[k] >= 0)) return false;
      if (e.sets < 1 || e.lo > e.hi) return false;
      // Fourchettes par série (program.js) : un mode connu et une paire [lo, hi] par série.
      if (e.mode != null && (!SET_MODES[e.mode] || !Array.isArray(e.ranges) || e.ranges.length !== e.sets
        || !e.ranges.every(r => Array.isArray(r) && r.length === 2 && r.every(n => typeof n === 'number' && n >= 0) && r[0] <= r[1]))) return false;
      // Perso : une liste de charges (nombre ≥ 0 ou null) par série, longueur = reps de la série.
      if (e.mode === 'perso' && (!Array.isArray(e.loads) || e.loads.length !== e.sets
        || !e.loads.every((l, i) => Array.isArray(l) && l.length >= 1 && l.length <= 30 && l.length === e.ranges[i][0] && l.length === e.ranges[i][1]
          && l.every(v => v === null || (typeof v === 'number' && v >= 0))))) return false;
    }
  }
  return true;
}
function validPrograms(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.versions)) return false;
  if (!x.versions.every(v => validProgram(v, true))) return false;
  return x.draft == null || validProgram(x.draft, false);
}

// ---------- Brouillon ----------
// Copie de la dernière version (ou de la version à corriger), avec le groupe musculaire écrit sur chaque exercice.
function progNewDraft(vs, fixOf, groupOf) {
  const base = fixOf ? vs.find(v => v.id === fixOf) : vs[vs.length - 1];
  const n = Math.max(0, ...vs.map(v => parseInt(String(v.id).replace(/\D/g, ''), 10) || 0)) + 1;
  const d = { id: fixOf || `p${n}`, label: fixOf ? base.label : `Programme ${n}`, days: progClone(base.days), sessions: progClone(base.sessions), baseId: base.id, fixOf: fixOf || null, updatedAt: Date.now() };
  for (const list of Object.values(d.sessions)) for (const e of list) e.group = e.group || groupOf(e);
  return d;
}
// Fourchettes d'un exercice après un changement de mode ou de nombre de séries : une seule (Identique),
// une par série (Top set, Pyramide), ou une charge par rep (Perso, ranges = [[n, n]] suit le nombre de cases).
// kept garde de côté les fourchettes et charges d'un mode quitté, le temps de l'édition.
function progFixRanges(e, kept) {
  if (e.mode !== 'perso' && e.loads) { kept.loads.set(e.id, e.loads); delete e.loads; }
  if (!SET_MODES[e.mode]) { if (e.ranges) kept.ranges.set(e.id, e.ranges); delete e.mode; delete e.ranges; return; }
  if (e.mode === 'perso') {
    const n = Math.max(1, Math.min(30, e.hi || e.lo || 8));
    const src = Array.isArray(e.loads) && e.loads.length ? e.loads : kept.loads.get(e.id) || [Array.from({ length: n }, () => e.kg ?? null)];
    e.loads = Array.from({ length: e.sets }, (_, i) => [...(src[i] || src[src.length - 1])]);
    e.ranges = e.loads.map(l => [l.length, l.length]);
  } else {
    const r = Array.isArray(e.ranges) && e.ranges.length ? e.ranges : kept.ranges.get(e.id) || [[e.lo, e.hi]];
    e.ranges = Array.from({ length: e.sets }, (_, i) => [...(r[i] || r[r.length - 1])]);
  }
  e.lo = Math.min(...e.ranges.map(x => x[0])); e.hi = Math.max(...e.ranges.map(x => x[1]));
}
// Ce qui a changé entre deux programmes, en phrases (affiché avant d'appliquer, gardé dans l'historique).
function progDiff(a, b, groupOf) {
  const out = [], rng = e => e.lo === e.hi ? String(e.lo) : `${e.lo}-${e.hi}`;
  for (const d of PROG_DAYS) if ((a.days[d] || '') !== (b.days[d] || '')) out.push(`${cap(JOURS[d])} : ${a.days[d] || 'repos'} → ${b.days[d] || 'repos'}`);
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
      if (groupOf(o) !== groupOf(e)) ch.push(`groupe ${groupOf(e)}`);
      if (ch.length) out.push(`${n} : ${o.name}, ${ch.join(', ')}`);
    }
    const keep = (X, Y) => X.filter(e => Y.some(x => x.id === e.id)).map(e => e.id).join();
    if (keep(A, B) !== keep(B, A)) out.push(`${n} : ordre des exercices modifié`);
  }
  return out;
}
// Applique le brouillon à partir d'une date (ou enregistre la correction d'une version). Renvoie { doc } ou { error }.
// vs = versions triées (le programme intégré, sans fichier, compte comme la première).
function progApply(doc, vs, from, label, groupOf) {
  const D = doc.draft, last = vs[vs.length - 1];
  if (!D.fixOf && (!from || from <= last.from)) return { error: `La date doit être après le ${fmtDate(last.from)} (début de ${last.label}).` };
  if (!Object.values(D.days).some(Boolean)) return { error: 'Le programme n\'a aucun jour d\'entraînement.' };
  const base = vs.find(v => v.id === D.baseId) || last, changes = progDiff(base, D, groupOf);
  const out = progClone(doc);
  if (!out.versions.length) out.versions = progClone(vs).map(v => ({ ...v, appliedAt: Date.now(), changes: ['Programme de départ'] }));
  const clean = { days: Object.fromEntries(Object.entries(D.days).filter(([, n]) => n)), sessions: progClone(D.sessions) };
  if (D.fixOf) {
    const v = out.versions.find(x => x.id === D.fixOf);
    Object.assign(v, clean, { label: label || v.label, changes: [...(v.changes || []), ...changes.map(c => `Correction : ${c}`)] });
  } else if (!out.versions.some(x => x.id === D.id)) {
    out.versions.push({ id: D.id, label: label || D.label, from, ...clean, appliedAt: Date.now(), changes });
  }
  out.draft = null;
  return { doc: out };
}

// ---------- Estimations ----------
// Durée d'une séance : séries × (repos + 40 s d'effort) ; cardio : le haut de la fourchette, en minutes.
const progEstMinutes = (list, groupOf) => Math.round(list.reduce((a, e) => a + (groupOf(e) === 'Cardio' ? e.sets * e.hi * 60 : e.sets * (e.rest + 40)), 0) / 60);
// Séries prévues par groupe sur une semaine (chaque séance du programme une fois), sans le cardio.
function progPlannedSets(prog, groupOf, filter = () => true) {
  const out = {};
  for (const n of Object.values(prog.days)) if (n) for (const e of prog.sessions[n] || []) if (filter(e)) { const g = groupOf(e); if (g !== 'Cardio') out[g] = (out[g] || 0) + e.sets; }
  return out;
}
// Lundi qui suit une date (AAAA-MM-JJ), jamais la date elle-même.
function progNextMonday(day) {
  const [y, m, d] = day.split('-').map(Number), x = new Date(y, m - 1, d);
  x.setDate(x.getDate() + ((8 - x.getDay()) % 7 || 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
