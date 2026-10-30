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

if (typeof module !== 'undefined') module.exports = { REMINDER_DEFAULT, REMINDER_DAYS, reminderStatus };
