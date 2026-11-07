'use strict';
// Modèles de programme proposés au premier lancement (appli) et dans l'éditeur du dashboard.
// Aucune charge (kg null, ou 0 pour un lest) : rien de personnel. Même format que les versions de programs.json.
// Fourchettes par série (mode, ranges) : voir program.js.
const TEMPLATES = [
  {
    id: 'ppl', label: 'Push / Pull / Leg', desc: '3 séances + natation · top sets et pyramides',
    days: { 1: 'Push', 3: 'Pull', 5: 'Jambes', 6: 'Natation' }, // getDay() : 0 = dimanche
    sessions: {
      'Push': [
        { id: 'c_dips', name: 'Dips (pectoraux)', sets: 3, lo: 8, hi: 12, kg: 0, step: 2.5, rest: 120, note: 'Buste penché en avant pour cibler les pectoraux. Charge = lest' },
        { id: 'fly', name: 'Pec fly (haltères ou machine)', sets: 3, lo: 10, hi: 15, kg: null, step: 2.5, rest: 90, note: 'Bras légèrement fléchis, descendre jusqu\'à l\'étirement' },
        { id: 'dc', name: 'Développé couché', sets: 3, lo: 4, hi: 10, mode: 'top', ranges: [[4, 6], [6, 8], [8, 10]], kg: null, step: 2.5, rest: 120, note: 'Top set puis −10 % à chaque série' },
        { id: 'c_latfront', name: 'Élévations latérales et frontales', sets: 3, lo: 12, hi: 15, kg: null, step: 1, rest: 60, note: 'Haltères. Contrôler la descente, ne pas monter au-dessus des épaules' },
        { id: 'tri', name: 'Triceps poulie (corde)', sets: 3, lo: 10, hi: 15, kg: null, step: 2.5, rest: 60, note: 'Écarter la corde en bas, coudes collés au corps' },
      ],
      'Pull': [
        { id: 'c_tractions', name: 'Tractions lestées', sets: 3, lo: 4, hi: 10, mode: 'top', ranges: [[4, 6], [6, 8], [8, 10]], kg: 0, step: 2.5, rest: 120, note: 'Top set puis −10 % à chaque série. Charge = lest' },
        { id: 'c_rowpb', name: 'Tirage horizontal (poulie assis, prise serrée)', sets: 3, lo: 8, hi: 12, kg: null, step: 2.5, rest: 90, note: 'Serrer les omoplates en fin de mouvement' },
        { id: 'tv', name: 'Tirage vertical (prise large)', sets: 3, lo: 8, hi: 12, kg: null, step: 2.5, rest: 90, note: 'Tirer la barre vers le haut de la poitrine' },
        { id: 'curlinc', name: 'Curl incliné haltères', sets: 3, lo: 8, hi: 12, kg: null, step: 2, rest: 90, note: 'Charge par main' },
        { id: 'c_pupitre', name: 'Curl pupitre (barre EZ ou haltère)', sets: 3, lo: 10, hi: 12, kg: null, step: 2.5, rest: 60, note: 'Descendre lentement jusqu\'à l\'extension' },
      ],
      'Jambes': [
        { id: 'squat', name: 'High bar squat', sets: 4, lo: 6, hi: 10, kg: null, step: 2.5, rest: 120, note: 'Ou deadlift (bouton Remplacer)' },
        { id: 'rdl', name: 'Romanian deadlift', sets: 4, lo: 10, hi: 15, kg: null, step: 2.5, rest: 90, note: 'Ou fentes (bouton Remplacer)' },
        { id: 'c_bulgare', name: 'Fentes bulgares haltères', sets: 3, lo: 8, hi: 12, kg: null, step: 2, rest: 90, note: 'Reps par jambe. Buste légèrement penché pour plus de fessiers' },
        { id: 'lcurl', name: 'Leg curl (assis de préférence)', sets: 3, lo: 8, hi: 12, kg: null, step: 2.5, rest: 30, note: 'Superset avec leg extension : 30″ entre les deux' },
        { id: 'lext', name: 'Leg extension', sets: 3, lo: 8, hi: 12, kg: null, step: 2.5, rest: 30, note: 'Superset avec leg curl' },
        { id: 'calf', name: 'Extensions mollets', sets: 3, lo: 6, hi: 15, mode: 'pyr', ranges: [[12, 15], [8, 12], [6, 10]], kg: null, step: 5, rest: 60, note: 'Dernière série puis dégressive AMRAP. Tempo 1-2-2-1' },
        { id: 'c_upright', name: 'Upright row penché', sets: 3, lo: 6, hi: 20, mode: 'pyr', ranges: [[15, 20], [10, 15], [6, 10]], kg: null, step: 2.5, rest: 60, note: 'Augmenter le poids à chaque série. Dernière série puis dégressive AMRAP' },
      ],
      'Natation': [
        { id: 'c_natation', name: 'Natation', group: 'Cardio', sets: 1, lo: 30, hi: 60, kg: 0, step: 0, rest: 0, note: 'Reps = minutes' },
      ],
    },
  },
  { id: 'ul4', label: 'Haut / Bas, 4 jours', desc: '4 séances · double progression classique', days: PROGRAM.days, sessions: PROGRAM.sessions },
];
