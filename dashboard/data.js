'use strict';
/* Dashboard Muscu, version web : accès direct au dépôt GitHub privé de données, depuis le navigateur,
   avec le même jeton que l'appli iPhone (gardé dans ce navigateur seulement). Ce fichier reprend le rôle
   de l'ancien serveur PC : la page lui adresse les mêmes demandes (`api('/api/…')`), il lit, contrôle,
   fusionne (merge.js, la règle de l'iPhone) et écrit les fichiers du dépôt. */

const DKEY = 'muscu.dash.settings';
let dcfg = (() => { try { return JSON.parse(localStorage.getItem(DKEY)) || {}; } catch { return {}; } })();
const dcfgOk = () => !!(dcfg.owner && dcfg.repo && dcfg.token);
function storeDcfg(c) { dcfg = c || {}; try { if (c) localStorage.setItem(DKEY, JSON.stringify(c)); else localStorage.removeItem(DKEY); } catch { /* stockage indisponible */ } }

const GH_API = 'https://api.github.com';
const ghHead = (accept = 'application/vnd.github+json') => ({ Authorization: `Bearer ${dcfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' });
const fileUrl = file => `${GH_API}/repos/${dcfg.owner}/${dcfg.repo}/contents/${file}`;
// Délai maximum : 60 s pour data.json (il grossit avec les années), 15 s pour les petits fichiers.
async function ghFetch(url, opt = {}, ms = 15000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { cache: 'no-store', ...opt, signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? `délai dépassé (${ms / 1000} s sans réponse de GitHub)` : e.message); }
  finally { clearTimeout(t); }
}
const msFor = file => file === 'data.json' ? 60000 : 15000;
const b64decode = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
const b64encode = s => btoa(unescape(encodeURIComponent(s)));

// Fichier JSON du dépôt. Au-delà de 1 Mo, GitHub renvoie un contenu vide (encoding « none ») : on le
// redemande au format brut (jusqu'à 100 Mo).
async function readJson(file, fallback) {
  const r = await ghFetch(fileUrl(file), { headers: ghHead() }, msFor(file));
  if (r.status === 404) return { sha: null, data: fallback };
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  if (j.encoding === 'none' || !j.content) {
    const raw = await ghFetch(fileUrl(file), { headers: ghHead('application/vnd.github.raw+json') }, msFor(file));
    if (!raw.ok) throw new Error(`GitHub ${raw.status}`);
    return { sha: j.sha, data: JSON.parse(await raw.text()) };
  }
  return { sha: j.sha, data: JSON.parse(b64decode(j.content)) };
}
// Lecture, transformation, écriture ; relue et refaite si l'iPhone a écrit entre-temps (409 / 422).
// data.json est écrit sans indentation (il grossit presque deux fois moins vite).
async function updateJson(file, fallback, fn, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { sha, data } = await readJson(file, fallback);
    const next = fn(data);
    const text = file === 'data.json' ? JSON.stringify(next) : JSON.stringify(next, null, 1);
    const put = { message: `${message} ${new Date().toISOString()}`, content: b64encode(text) };
    if (sha) put.sha = sha;
    const r = await ghFetch(fileUrl(file), { method: 'PUT', headers: ghHead(), body: JSON.stringify(put) }, msFor(file));
    if (r.status === 409 || r.status === 422) continue;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return next;
  }
  throw new Error('conflit persistant avec l\'iPhone, réessaie');
}

// ---------- Contrôles avant écriture (repris de l'ancien serveur) ----------
// Un programme mal formé rendrait l'appli iPhone inutilisable.
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
function validIncoming(x) {
  if (!x || typeof x !== 'object') return false;
  for (const k of ['sessions', 'body']) {
    if (x[k] == null) continue;
    if (typeof x[k] !== 'object' || Array.isArray(x[k])) return false;
    for (const [id, rec] of Object.entries(x[k])) {
      if (!rec || typeof rec !== 'object' || rec.id !== id || typeof rec.updatedAt !== 'number') return false;
      if (!/^\d{4}-\d{2}-\d{2}/.test(id)) return false;
    }
  }
  return true;
}
// Objectifs et données suivies (goals.json), lus aussi par l'iPhone.
function validGoals(g) {
  if (!g || typeof g !== 'object') return false;
  const numOrNull = (v, lo, hi) => v === null || (typeof v === 'number' && v >= lo && v <= hi);
  if ('poids' in g && !numOrNull(g.poids, 30, 300)) return false;
  if ('pas' in g && !(g.pas === null || (Number.isInteger(g.pas) && g.pas >= 1000 && g.pas <= 50000))) return false;
  if ('depart' in g && !(g.depart === null || /^\d{4}-\d{2}-\d{2}$/.test(g.depart))) return false;
  if ('sources' in g) {
    const s = g.sources;
    if (!s || typeof s !== 'object' || !['withings', 'manuel'].includes(s.poids) || !['withings', 'manuel', 'off'].includes(s.pas)) return false;
  }
  return Object.keys(g).every(k => ['poids', 'pas', 'depart', 'sources'].includes(k));
}
// Rappel mensurations (reminders.json, clé mensurations) : mêmes réglages que l'iPhone.
function validReminder(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.on !== 'boolean' || ![1, 2, 3, 4].includes(r.weeks) || !(Number.isInteger(r.day) && r.day >= 0 && r.day <= 6)) return false;
  if (!Array.isArray(r.measures) || !r.measures.length || !r.measures.every(m => ['waist', 'chest', 'biceps', 'thigh'].includes(m))) return false;
  return r.notifyHour === null || (Number.isInteger(r.notifyHour) && r.notifyHour >= 6 && r.notifyHour <= 21);
}

// ---------- Les demandes de la page ----------
async function readRemote() {
  const { data } = await readJson('data.json', null);
  return { sessions: migrateSessions(data && data.sessions), body: (data && data.body) || {} };
}
// Fusion avec data.json (règle de l'iPhone, merge.js) puis écriture.
async function saveData(incoming) {
  if (!Object.keys(incoming.sessions || {}).length && !Object.keys(incoming.body || {}).length) return readRemote();
  return updateJson('data.json', null, d => ({
    sessions: mergeColl(migrateSessions(d && d.sessions), migrateSessions(incoming.sessions), mergeSession),
    body: mergeColl((d && d.body) || {}, incoming.body),
  }), 'dashboard');
}
async function localApi(path, opt = {}) {
  const post = (opt.method || 'GET') === 'POST', body = post ? JSON.parse(opt.body || '{}') : null;
  if (!post) {
    if (path === '/api/data') return { ...(await readRemote()), repo: `${dcfg.owner}/${dcfg.repo}` };
    if (path === '/api/programs') { const { data } = await readJson('programs.json', null); return { versions: (data && data.versions) || [], draft: (data && data.draft) || null }; }
    if (path === '/api/activity') return (await readJson('activity.json', { days: {} })).data || { days: {} };
    if (path === '/api/reminders') return (await readJson('reminders.json', {})).data || {};
    if (path === '/api/goals') return (await readJson('goals.json', {})).data || {};
    if (path === '/api/withings') return (await readJson('withings.json', {})).data || {};
  } else {
    if (path === '/api/save') { if (!validIncoming(body)) throw new Error('données invalides'); return saveData(body); }
    if (path === '/api/programs') {
      if (!validPrograms(body)) throw new Error('programme invalide');
      return updateJson('programs.json', null, () => ({ versions: body.versions, draft: body.draft || null, updatedAt: Date.now() }), 'programme');
    }
    if (path === '/api/withings/auto') { await updateJson('withings.json', {}, d => ({ ...d, auto: !!body.auto, autoAt: Date.now() }), 'withings réglage'); return { ok: true }; }
    if (path === '/api/goals') { if (!validGoals(body)) throw new Error('objectifs invalides'); return updateJson('goals.json', {}, d => ({ ...d, ...body, updatedAt: Date.now() }), 'objectifs'); }
    if (path === '/api/reminders') {
      if (!validReminder(body)) throw new Error('rappel invalide');
      return updateJson('reminders.json', {}, d => ({ ...d, mensurations: { ...(d.mensurations || {}), ...body, updatedAt: Date.now() } }), 'rappel');
    }
  }
  throw new Error('introuvable');
}

// Messages d'erreur, les mêmes que sur l'iPhone.
function explainError(msg) {
  if (/Load failed|Failed to fetch|NetworkError/i.test(msg)) return 'impossible de joindre GitHub (vérifie ta connexion).';
  if (/401/.test(msg)) return 'jeton refusé (401) : vérifie qu\'il est copié en entier et qu\'il n\'a pas expiré.';
  if (/403/.test(msg)) return 'accès refusé (403) : le jeton doit avoir la permission « Contents : Read and write » sur le dépôt.';
  if (/404/.test(msg)) return 'dépôt introuvable (404) : vérifie le compte et le nom du dépôt, et que le jeton couvre bien ce dépôt.';
  return msg;
}
// Vérifie le compte, le dépôt et le jeton avant de les garder.
async function checkConnection(c) {
  const r = await fetch(`${GH_API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { cache: 'no-store', headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}
