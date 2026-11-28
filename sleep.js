'use strict';
// Nuits venues d'Apple Santé par le raccourci iOS « Nuits Muscu » (v88, plan B : Withings ne transmet pas les nuits de l'Apple Watch).
// Le raccourci dépose dans muscu-data un fichier sleep/inbox/<jour>.csv (ou <jour>-<HHmm>.csv si la nuit du jour manque encore),
// une ligne par échantillon d'« Analyse du sommeil » des 8 derniers jours : début;fin;valeur;source.
// Ces fonctions en tirent des nuits au même format que l'import Withings (sleep.json, nights[date du réveil]).

// Valeur Santé → phase. 0 éveillé, 1 léger (« Essentiel » chez Apple), 2 profond, 3 paradoxal ; 'asleep' = endormi sans phase ;
// 'inbed' = au lit. Reconnaît les libellés français et anglais, avec ou sans accents.
function sleepPhase(v) {
  const t = String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!t) return null;
  if (/profond|deep/.test(t)) return 2;
  if (/paradox|\brem\b/.test(t)) return 3;
  if (/essentiel|core|leger|light/.test(t)) return 1;
  if (/eveill|awake/.test(t)) return 0;
  if (/\blit\b|\bbed\b|inbed/.test(t)) return 'inbed';
  if (/endormi|asleep|sommeil|unspecified|non specifie/.test(t)) return 'asleep';
  return null;
}
// Date du raccourci : ISO 8601 (2026-11-27T07:12:03+01:00), « 2026-11-27 07:12 » ou « 27/11/2026 07:12 » (heure locale).
function sleepWhen(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(.*)$/);
  if (m) {
    if (/[zZ]|[+-]\d{2}:?\d{2}/.test(m[7])) { const t = Date.parse(s.replace(' ', 'T')); return isNaN(t) ? null : t; }
    return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2})[:h](\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
  return null;
}
// Texte du fichier → { samples: [{ s, e, p, src }], bad: lignes illisibles, unknown: valeurs non reconnues }
function parseSleepCsv(text) {
  const samples = [], unknown = [];
  let bad = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const f = line.split(sep).map(x => x.trim());
    if (/^(debut|début|start)/i.test(f[0])) continue; // en-tête
    const s = sleepWhen(f[0]), e = sleepWhen(f[1]), p = sleepPhase(f[2]);
    if (s == null || e == null || e <= s) { bad++; continue; }
    if (p == null) { if (!unknown.includes(f[2])) unknown.push(f[2]); continue; }
    samples.push({ s, e, p, src: f.slice(3).join(sep).trim() || null });
  }
  return { samples, bad, unknown };
}
const sleepYmd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Échantillons → nuits { date du réveil: nuit }. Durées en secondes, heures en ms, comme l'import Withings.
// Un écart de plus de 3 h sépare deux nuits. Plusieurs sources (montre, iPhone) : on garde celle qui a les phases.
// Les chevauchements d'une même source sont coupés (l'Apple Watch en écrit parfois). Moins de 30 min de sommeil : ignoré.
// Deux nuits le même jour (sieste) : la plus longue. minDate : nuits plus anciennes ignorées (début du fichier, peut-être coupée).
function sleepNights(samples, minDate) {
  const sl = samples.filter(x => x.p !== 'inbed').sort((a, b) => a.s - b.s), beds = samples.filter(x => x.p === 'inbed');
  const sessions = [];
  for (const x of sl) {
    const cur = sessions[sessions.length - 1];
    if (cur && x.s <= cur.end + 3 * 3600e3) { cur.list.push(x); cur.end = Math.max(cur.end, x.e); }
    else sessions.push({ list: [x], end: x.e });
  }
  const nights = {};
  for (const ses of sessions) {
    const by = {};
    for (const x of ses.list) {
      const k = x.src || '', b = by[k] || (by[k] = { staged: 0, asleep: 0 });
      if (x.p === 1 || x.p === 2 || x.p === 3) b.staged += x.e - x.s; else if (x.p === 'asleep') b.asleep += x.e - x.s;
    }
    const src = Object.keys(by).sort((a, b) => (by[b].staged * 10 + by[b].asleep) - (by[a].staged * 10 + by[a].asleep))[0];
    const blocks = [];
    let cursor = -Infinity;
    for (const x of ses.list.filter(x => (x.src || '') === src)) {
      const s = Math.max(x.s, cursor);
      if (x.e <= s) continue;
      blocks.push({ s, e: x.e, p: x.p }); cursor = x.e;
    }
    const isSleep = b => b.p !== 0;
    const first = blocks.findIndex(isSleep);
    if (first < 0) continue;
    let last = blocks.length - 1;
    while (!isSleep(blocks[last])) last--;
    const sec = list => Math.round(list.reduce((a, b) => a + b.e - b.s, 0) / 1000);
    const mid = blocks.slice(first, last + 1);
    const total = sec(mid.filter(isSleep));
    if (total < 1800) continue;
    const staged = mid.some(b => b.p === 1 || b.p === 2 || b.p === 3);
    const start = blocks[0].s, end = blocks[blocks.length - 1].e, date = sleepYmd(end);
    if (minDate && date < minDate) continue;
    // Au lit : union des plages « au lit » qui touchent la nuit, sinon du premier au dernier échantillon.
    const bed = beds.filter(b => b.e > start - 2 * 3600e3 && b.s < end + 2 * 3600e3).sort((a, b) => a.s - b.s);
    let inbed = 0, bc = -Infinity;
    for (const b of bed) { const s = Math.max(b.s, bc); if (b.e > s) { inbed += b.e - s; bc = b.e; } }
    inbed = bed.length ? Math.round(inbed / 1000) : Math.round((end - start) / 1000);
    const hypS = [];
    if (staged) for (const b of blocks) {
      const st = b.p === 'asleep' ? 1 : b.p, m0 = Math.round((b.s - start) / 60e3), d = Math.round((b.e - b.s) / 60e3);
      const prev = hypS[hypS.length - 1];
      if (prev && prev[2] === st && Math.abs(prev[0] + prev[1] - m0) <= 1) prev[1] += d;
      else if (d > 0) hypS.push([m0, d, st]);
    }
    const n = {
      start, end, total, inbed,
      deep: staged ? sec(mid.filter(b => b.p === 2)) : null,
      light: staged ? sec(mid.filter(b => b.p === 1 || b.p === 'asleep')) : null,
      rem: staged ? sec(mid.filter(b => b.p === 3)) : null,
      awake: sec(mid.filter(b => b.p === 0)),
      wakeups: mid.filter((b, i) => b.p === 0 && i > 0 && mid[i - 1].p !== 0).length,
      latency: sec(blocks.slice(0, first)), outLatency: sec(blocks.slice(last + 1)),
      score: null, hr: null, hrMin: null, rr: null,
      model: src || null, src: 'sante',
      hyp: { t0: start, s: hypS },
    };
    if (!nights[date] || nights[date].total < n.total) nights[date] = n;
  }
  return nights;
}
if (typeof module !== 'undefined') module.exports = { sleepPhase, sleepWhen, parseSleepCsv, sleepNights, sleepYmd };
