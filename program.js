'use strict';
// Programme de musculation (split upper/lower). kg = charge de départ conseillée (null = à saisir la première fois, aucune charge personnelle dans le code).
// step = incrément de charge quand la fourchette de reps est atteinte. rest = repos en secondes.
const PROGRAM = {
  days: { 2: 'Upper A', 4: 'Lower A', 6: 'Upper B', 0: 'Lower B' }, // getDay() : 0 = dimanche
  sessions: {
    'Upper A': [
      { id: 'dc', name: 'Développé couché barre', sets: 4, lo: 5, hi: 6, kg: null, step: 2.5, rest: 180 },
      { id: 'row', name: 'Rowing barre penchée', sets: 3, lo: 6, hi: 8, kg: null, step: 2.5, rest: 150 },
      { id: 'inc', name: 'Développé incliné haltères', sets: 3, lo: 8, hi: 10, kg: null, step: 2, rest: 120, note: 'Charge par main' },
      { id: 'ohp', name: 'Développé épaules haltères', sets: 3, lo: 6, hi: 8, kg: null, step: 2, rest: 120, note: 'Charge par main' },
      { id: 'curl', name: 'Curl haltères', sets: 3, lo: 8, hi: 10, kg: null, step: 2, rest: 90, note: 'Charge par main' },
      { id: 'tri', name: 'Extension triceps poulie', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90 },
    ],
    'Lower A': [
      { id: 'sdt', name: 'Soulevé de terre', sets: 3, lo: 3, hi: 5, kg: null, step: 2.5, rest: 180, note: 'Seul jour de soulevé lourd' },
      { id: 'presse', name: 'Presse à cuisses', sets: 4, lo: 8, hi: 10, kg: null, step: 5, rest: 150 },
      { id: 'fentes', name: 'Fentes marchées haltères', sets: 3, lo: 10, hi: 10, kg: null, step: 2, rest: 120, note: '10 par jambe, charge par main' },
      { id: 'lcurl', name: 'Leg curl', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90 },
      { id: 'lext', name: 'Leg extension', sets: 3, lo: 12, hi: 15, kg: null, step: 2.5, rest: 90 },
      { id: 'calf', name: 'Mollets debout', sets: 4, lo: 12, hi: 15, kg: null, step: 5, rest: 60 },
      { id: 'abs', name: 'Crunch banc décliné', sets: 3, lo: 12, hi: 15, kg: 0, step: 2.5, rest: 60, note: 'Poids du corps, fin de séance' },
    ],
    'Upper B': [
      { id: 'incb', name: 'Développé incliné barre ou machine', sets: 4, lo: 8, hi: 10, kg: null, step: 2.5, rest: 150 },
      { id: 'tv', name: 'Tirage vertical', sets: 3, lo: 8, hi: 10, kg: null, step: 2.5, rest: 120, note: 'Ou tractions' },
      { id: 'fly', name: 'Butterfly ou écartés poulie', sets: 3, lo: 12, hi: 15, kg: null, step: 2.5, rest: 90, note: 'Alterner butterfly et poulie' },
      { id: 'lat', name: 'Élévations latérales', sets: 3, lo: 12, hi: 15, kg: null, step: 1, rest: 60, note: 'Charge par main' },
      { id: 'rear', name: 'Oiseau ou face pull', sets: 2, lo: 15, hi: 15, kg: null, step: 2.5, rest: 60 },
      { id: 'curlinc', name: 'Curl incliné haltères', sets: 3, lo: 10, hi: 12, kg: null, step: 2, rest: 90, note: 'Charge par main' },
      { id: 'tri2', name: 'Extension triceps au-dessus de la tête (poulie)', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90 },
      { id: 'dips', name: 'Dips assis machine (triceps)', sets: 2, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90, note: 'Superset avec le curl' },
    ],
    'Lower B': [
      { id: 'squat', name: 'Squat barre (rack)', sets: 4, lo: 6, hi: 8, kg: null, step: 2.5, rest: 180, note: 'Smith machine en alternative' },
      { id: 'rdl', name: 'Soulevé de terre roumain', sets: 3, lo: 8, hi: 10, kg: null, step: 2.5, rest: 150 },
      { id: 'presse2', name: 'Presse à cuisses (pieds hauts)', sets: 3, lo: 10, hi: 12, kg: null, step: 5, rest: 120 },
      { id: 'hip', name: 'Hip thrust machine', sets: 3, lo: 10, hi: 10, kg: null, step: 5, rest: 120 },
      { id: 'lcurl', name: 'Leg curl', sets: 3, lo: 12, hi: 12, kg: null, step: 2.5, rest: 90 },
      { id: 'calf', name: 'Mollets debout', sets: 4, lo: 12, hi: 15, kg: null, step: 5, rest: 60 },
      { id: 'abs', name: 'Crunch banc décliné', sets: 3, lo: 12, hi: 15, kg: 0, step: 2.5, rest: 60, note: 'Poids du corps, fin de séance' },
      { id: 'abd', name: 'Abduction machine (optionnel)', sets: 2, lo: 15, hi: 15, kg: null, step: 2.5, rest: 60, note: 'Si le temps le permet' },
    ],
  },
};

// ---------- Fourchettes par série (partagé par l'appli et le dashboard) ----------
// mode 'top' : top set puis −10 % à chaque série (seule la 1re série fait monter la charge).
// mode 'pyr' : pyramide, chaque série a sa charge et progresse seule.
// ranges = [[lo, hi], …], une par série ; lo/hi restent la fourchette globale (anciennes versions, statistiques).
const SET_MODES = { top: 'Top set', pyr: 'Pyramide' };
const perSet = ex => !!SET_MODES[ex.mode] && Array.isArray(ex.ranges) && ex.ranges.length > 0;
function rangeAt(ex, i) {
  if (!perSet(ex)) return [ex.lo, ex.hi];
  return ex.ranges[Math.min(i, ex.ranges.length - 1)];
}
const rangeTxt = ([lo, hi]) => lo === hi ? String(lo) : `${lo}-${hi}`;
const repsLabel = ex => perSet(ex)
  ? Array.from({ length: ex.sets }, (_, i) => rangeTxt(rangeAt(ex, i))).join(' / ')
  : `${ex.sets} × ${rangeTxt([ex.lo, ex.hi])}`;
const roundStep = (kg, step) => step > 0 ? Math.round(kg / step) * step : Math.round(kg * 10) / 10;
// Charges et reps visées série par série, d'après les séries validées de la dernière séance (dans l'ordre).
// up[i] : la série i a atteint le haut de sa fourchette la dernière fois.
function perSetPlan(ex, lastSets) {
  const sets = [], up = [];
  for (let i = 0; i < ex.sets; i++) {
    const [lo, hi] = rangeAt(ex, i), prev = lastSets?.[i];
    up.push(!!prev && prev.reps >= hi);
    if (ex.mode === 'top' && i > 0) {
      // −10 % arrondi au cran, et au moins un cran de moins (petites charges, lest), jamais sous 0.
      const base = sets[i - 1].kg, kg = base == null ? null : Math.max(0, Math.min(roundStep(base * 0.9, ex.step), base - ex.step));
      sets.push({ kg, reps: prev && kg != null && prev.kg === kg ? Math.min(hi, prev.reps + 1) : lo });
    } else if (!prev) sets.push({ kg: i === 0 ? ex.kg ?? null : sets[i - 1].kg, reps: lo });
    else if (prev.reps >= hi) sets.push({ kg: prev.kg + ex.step, reps: lo });
    else sets.push({ kg: prev.kg, reps: Math.min(hi, prev.reps + 1) });
  }
  return { sets, up };
}
