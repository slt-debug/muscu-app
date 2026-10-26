'use strict';
// Programme de musculation (split haut/bas). kg = charge de départ conseillée (null = à saisir la première fois, aucune charge personnelle dans le code).
// step = incrément de charge quand la fourchette de reps est atteinte. rest = repos en secondes.
const PROGRAM = {
  days: { 2: 'Haut A', 4: 'Bas A', 6: 'Haut B', 0: 'Bas B' }, // getDay() : 0 = dimanche
  sessions: {
    'Haut A': [
      { id: 'dc', name: 'Développé couché barre', sets: 4, lo: 5, hi: 6, kg: null, step: 2.5, rest: 180 },
      { id: 'row', name: 'Rowing barre penchée', sets: 3, lo: 6, hi: 8, kg: null, step: 2.5, rest: 150 },
      { id: 'inc', name: 'Développé incliné haltères', sets: 3, lo: 8, hi: 10, kg: null, step: 2, rest: 120, note: 'Charge par main' },
      { id: 'ohp', name: 'Développé épaules haltères', sets: 3, lo: 6, hi: 8, kg: null, step: 2, rest: 120, note: 'Charge par main' },
      { id: 'curl', name: 'Curl haltères', sets: 3, lo: 8, hi: 10, kg: null, step: 2, rest: 90, note: 'Charge par main' },
      { id: 'tri', name: 'Extension triceps poulie', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90 },
    ],
    'Bas A': [
      { id: 'sdt', name: 'Soulevé de terre', sets: 3, lo: 3, hi: 5, kg: null, step: 2.5, rest: 180, note: 'Seul jour de soulevé lourd' },
      { id: 'presse', name: 'Presse à cuisses', sets: 4, lo: 8, hi: 10, kg: null, step: 5, rest: 150 },
      { id: 'fentes', name: 'Fentes marchées haltères', sets: 3, lo: 10, hi: 10, kg: null, step: 2, rest: 120, note: '10 par jambe, charge par main' },
      { id: 'lcurl', name: 'Leg curl', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90 },
      { id: 'lext', name: 'Leg extension', sets: 3, lo: 12, hi: 15, kg: null, step: 2.5, rest: 90 },
      { id: 'calf', name: 'Mollets debout', sets: 4, lo: 12, hi: 15, kg: null, step: 5, rest: 60 },
      { id: 'abs', name: 'Crunch banc décliné', sets: 3, lo: 12, hi: 15, kg: 0, step: 2.5, rest: 60, note: 'Poids du corps, fin de séance' },
    ],
    'Haut B': [
      { id: 'incb', name: 'Développé incliné barre ou machine', sets: 4, lo: 8, hi: 10, kg: null, step: 2.5, rest: 150 },
      { id: 'tv', name: 'Tirage vertical', sets: 3, lo: 8, hi: 10, kg: null, step: 2.5, rest: 120, note: 'Ou tractions' },
      { id: 'fly', name: 'Butterfly ou écartés poulie', sets: 3, lo: 12, hi: 15, kg: null, step: 2.5, rest: 90, note: 'Alterner butterfly et poulie' },
      { id: 'lat', name: 'Élévations latérales', sets: 3, lo: 12, hi: 15, kg: null, step: 1, rest: 60, note: 'Charge par main' },
      { id: 'rear', name: 'Oiseau ou face pull', sets: 2, lo: 15, hi: 15, kg: null, step: 2.5, rest: 60 },
      { id: 'curlinc', name: 'Curl incliné haltères', sets: 3, lo: 10, hi: 12, kg: null, step: 2, rest: 90, note: 'Charge par main' },
      { id: 'tri2', name: 'Extension triceps au-dessus de la tête (poulie)', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90 },
      { id: 'dips', name: 'Dips assis machine (triceps)', sets: 2, lo: 10, hi: 12, kg: null, step: 2.5, rest: 90, note: 'Superset avec le curl' },
    ],
    'Bas B': [
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
