'use strict';
/* Fusion de deux versions des données (téléphone, GitHub, dashboard). Partagé par l'appli et par le serveur
   du dashboard, qui le lit depuis ../muscu-app : une seule règle des deux côtés.

   Séances : fusion exercice par exercice, pour que deux appareils qui modifient la même séance ne
   s'écrasent pas. Chaque exercice garde l'heure de sa dernière modification (entry.u) ; un exercice retiré
   laisse une trace datée (rec.removed) ; le chrono et les remplacements gardent la leur (clockU, swapsU).
   Sans ces heures (données d'avant), c'est la version la plus récente de la séance qui l'emporte.
   Mesures du corps : la fiche la plus récente l'emporte. */

function mergeSession(a, b) {
  const ua = a.updatedAt || 0, ub = b.updatedAt || 0;
  const newer = ub > ua ? b : a;
  // Séance supprimée d'un côté : la version la plus récente l'emporte en entier (suppression ou reprise).
  if (a.deleted || b.deleted) return newer;
  const out = { ...newer, entries: {}, updatedAt: Math.max(ua, ub) };
  const removed = { ...(a.removed || {}) };
  for (const [k, t] of Object.entries(b.removed || {})) removed[k] = Math.max(removed[k] || 0, t);
  const ea = a.entries || {}, eb = b.entries || {};
  for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
    const x = ea[k], y = eb[k];
    let pick = x || y;
    if (x && y) { const tx = x.u || 0, ty = y.u || 0; pick = tx > ty ? x : ty > tx ? y : (newer === a ? x : y); }
    // Retiré après sa dernière modification : il reste retiré.
    if (removed[k] && removed[k] >= (pick.u || 0)) continue;
    out.entries[k] = pick;
  }
  if (Object.keys(removed).length) out.removed = removed;
  for (const f of ['clock', 'swaps']) {
    const ta = a[f + 'U'] || 0, tb = b[f + 'U'] || 0;
    if (ta === tb) continue; // même heure (ou aucune) : celle de la version la plus récente, déjà dans out
    const src = ta > tb ? a : b;
    if (src[f] === undefined) delete out[f]; else out[f] = src[f];
    out[f + 'U'] = Math.max(ta, tb);
  }
  return out;
}

// Fusionne deux collections { id: fiche } ; `one` fusionne deux fiches de même id (sinon la plus récente gagne).
function mergeColl(a, b, one) {
  const out = { ...(a || {}) };
  for (const [id, rec] of Object.entries(b || {})) {
    if (!rec || typeof rec !== 'object') continue;
    const cur = out[id];
    if (!cur || typeof cur !== 'object') { out[id] = rec; continue; }
    out[id] = one ? one(cur, rec) : (rec.updatedAt || 0) > (cur.updatedAt || 0) ? rec : cur;
  }
  return out;
}

// Anciens noms de séances (avant le passage en anglais) : les fiches déjà enregistrées sont renommées à la volée.
const LEGACY_NAMES = { 'Haut A': 'Upper A', 'Haut B': 'Upper B', 'Bas A': 'Lower A', 'Bas B': 'Lower B' };
function migrateSessions(coll) {
  const out = {};
  for (const [id, rec] of Object.entries(coll || {})) {
    if (!rec || typeof rec !== 'object') continue;
    const m = /^(\d{4}-\d{2}-\d{2})_(.+)$/.exec(id);
    const to = m && LEGACY_NAMES[m[2]];
    const nid = to ? `${m[1]}_${to}` : id, nrec = to ? { ...rec, id: nid, name: to } : rec;
    out[nid] = out[nid] ? mergeSession(out[nid], nrec) : nrec;
  }
  return out;
}

function mergeData(local, remote) {
  return {
    sessions: mergeColl(migrateSessions(local && local.sessions), migrateSessions(remote && remote.sessions), mergeSession),
    body: mergeColl(local && local.body, remote && remote.body),
  };
}

if (typeof module !== 'undefined') module.exports = { mergeSession, mergeColl, migrateSessions, mergeData };
