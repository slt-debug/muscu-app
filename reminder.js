'use strict';
/* Rappel de mise à jour des mensurations : date du prochain rappel. Partagé par l'appli et le dashboard
   (l'automate de notification du dépôt de données en garde une copie). Réglage dans reminders.json. */
const REMINDER_DEFAULT = { on: true, weeks: 2, day: 0, measures: ['waist', 'chest', 'biceps', 'thigh'], notifyHour: 8 };
const REMINDER_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// body : fiches Corps ; r : réglage ; todayStr : 'AAAA-MM-JJ'.
// Le rappel tombe le premier jour choisi (r.day, 0 = dimanche) au moins r.weeks semaines après la dernière mesure,
// et reste affiché jusqu'à la saisie. Sans aucune mesure : rappel dû tout de suite.
function reminderStatus(body, r, todayStr) {
  r = { ...REMINDER_DEFAULT, ...(r || {}) };
  const keys = r.measures && r.measures.length ? r.measures : REMINDER_DEFAULT.measures;
  const dates = Object.values(body || {}).filter(b => b && !b.deleted && keys.some(k => b[k] != null)).map(b => b.date).sort();
  const last = dates[dates.length - 1] || null;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let due = todayStr;
  if (last) {
    const d = parse(last); d.setDate(d.getDate() + r.weeks * 7);
    while (d.getDay() !== r.day) d.setDate(d.getDate() + 1);
    due = fmt(d);
  }
  const daysSince = last ? Math.round((parse(todayStr) - parse(last)) / 864e5) : null;
  return { on: !!r.on, last, due, isDue: !!r.on && todayStr >= due, daysSince };
}

/* Compléments alimentaires (v81) : règles partagées par l'appli (Corps › Nutrition) et l'automate de notification
   (copie dans .github/scripts/rappel.js du dépôt de données : garder les deux identiques). Fichier supplements.json :
   { items: { id: { id, name, dose, unit, moment, days, note, remind, off: [[du, au | null]], from, deleted, u } },
     log: { 'AAAA-MM-JJ': { id: { on, u } } }, trainDays: [jours de séance du programme, 0 = dimanche], updatedAt }
   days : 'all' | 'train' (jours de séance) | 'rest' (jours de repos). remind : heure du rappel ntfy, ou null.
   off : périodes de pause (au = jour de reprise, exclu ; null = toujours en pause). */
const SUPP_MOMENTS = [['matin', 'Matin', 'du matin'], ['midi', 'Midi', 'du midi'], ['avant', 'Avant la séance', 'avant la séance'], ['apres', 'Après la séance', 'après la séance'], ['soir', 'Soir', 'du soir']];
const SUPP_DAYS = [['all', 'Tous les jours'], ['train', 'Jours de séance'], ['rest', 'Jours de repos']];
const suppPaused = (it, d) => (it.off || []).some(([a, b]) => d >= a && (b == null || d < b));
// Prise prévue ce jour-là ? isTrain : jour de séance prévu au programme.
function suppDue(it, d, isTrain) {
  if (!it || it.deleted || (it.from && d < it.from) || suppPaused(it, d)) return false;
  return it.days === 'train' ? !!isTrain : it.days === 'rest' ? !isTrain : true;
}
const suppTaken = (s, d, id) => !!(s && s.log && s.log[d] && s.log[d][id] && s.log[d][id].on);
const suppDoseTxt = it => [it.dose != null ? Number(it.dose).toLocaleString('fr-FR') : '', it.unit || ''].filter(Boolean).join(' ');
// Fusion de deux copies : la modification la plus récente l'emporte, fiche par fiche et prise par prise.
function suppMerge(a, b) {
  a = a || {}; b = b || {};
  const pick = (x, y) => !x ? y : !y ? x : (y.u || 0) > (x.u || 0) ? y : x;
  const items = { ...(a.items || {}) };
  for (const [k, v] of Object.entries(b.items || {})) items[k] = pick(items[k], v);
  const log = {};
  for (const d of new Set([...Object.keys(a.log || {}), ...Object.keys(b.log || {})])) {
    const day = { ...((a.log || {})[d] || {}) };
    for (const [k, v] of Object.entries((b.log || {})[d] || {})) day[k] = pick(day[k], v);
    log[d] = day;
  }
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  return { items, log, trainDays: newer.trainDays || a.trainDays || b.trainDays || null, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}
// Rappel à envoyer à l'heure `hour` du jour d : une seule notification qui regroupe les prises prévues, non cochées,
// dont l'heure de rappel est passée et pas encore signalée (sent : clés 'AAAA-MM-JJ@heure' déjà envoyées). null : rien.
function suppReminder(s, d, hour, isTrain, sent) {
  const list = Object.values((s && s.items) || {})
    .filter(it => it.remind != null && it.remind <= hour && suppDue(it, d, isTrain) && !suppTaken(s, d, it.id) && !(sent || []).includes(`${d}@${it.remind}`))
    .sort((x, y) => x.remind - y.remind || SUPP_MOMENTS.findIndex(m => m[0] === x.moment) - SUPP_MOMENTS.findIndex(m => m[0] === y.moment));
  if (!list.length) return null;
  const moments = [...new Set(list.map(it => it.moment))];
  const m = moments.length === 1 && SUPP_MOMENTS.find(x => x[0] === moments[0]);
  return {
    keys: [...new Set(list.map(it => `${d}@${it.remind}`))],
    title: m ? `Compléments ${m[2]}` : 'Compléments à prendre',
    message: `Pas encore coché${list.length > 1 ? 's' : ''} : ${list.map(it => [it.name, suppDoseTxt(it)].filter(Boolean).join(' ')).join(', ')}.`,
  };
}

if (typeof module !== 'undefined') module.exports = { REMINDER_DEFAULT, REMINDER_DAYS, reminderStatus, SUPP_MOMENTS, SUPP_DAYS, suppPaused, suppDue, suppTaken, suppDoseTxt, suppMerge, suppReminder };
