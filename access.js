'use strict';
// Accès réservé : seuls les comptes GitHub de cette liste peuvent utiliser l'appli et le dashboard.
// On publie l'empreinte SHA-256 du nom GitHub en minuscules, pas le nom lui-même, avec un libellé
// sans nom (« ami-1 ») qui sert au suivi d'usage. La correspondance libellé / personne reste hors du dépôt.
// Ajouter quelqu'un : node -e "console.log(require('crypto').createHash('sha256').update('nom-github'.toLowerCase()).digest('hex'))"
// Limite : le code est public, quelqu'un de technique peut le copier sans ce contrôle. Ça bloque les inconnus.
const ALLOWED = {
  '07a0d956d9b58f8d6d4bbbe69df56ff65c64f38857eb3569438ea7d90a8ae087': 'proprietaire',
  '2bd28b3a4b751da7a7810032daeba340daa566ebbee4626bc1deeb6038b89021': 'ami-1', // 07/11/2026
};
async function loginHash(login) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(login).toLowerCase()));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const hashAllowed = hash => Object.prototype.hasOwnProperty.call(ALLOWED, hash);
// Compte GitHub du jeton et autorisation : { login, hash, ok }. Erreur « GitHub 401 » si le jeton est refusé.
async function checkAccess(token) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('https://api.github.com/user', { cache: 'no-store', signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const login = (await r.json()).login, hash = await loginHash(login);
    return { login, hash, ok: hashAllowed(hash) };
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'délai dépassé (15 s sans réponse de GitHub)' : e.message); }
  finally { clearTimeout(t); }
}

// ---------- Suivi d'usage (GoatCounter, tableau de bord privé de l'auteur) ----------
// Au plus un signal par jour et par appareil pour chaque libellé : « ouverture/ami-1 », « dashboard/ami-1 »,
// « refus ». Image de 1 pixel, sans script extérieur ni cookie ; rien sur les séances, le poids ou les mesures.
// Le jour n'est noté qu'une fois le signal reçu (hors ligne, il repart à l'ouverture suivante).
// Hors du site publié (tests en local), rien n'est envoyé : le signal est seulement noté dans usagePings.
const STATS_URL = 'https://slt-debug.goatcounter.com/count';
const usagePings = [];
const usageLabel = hash => ALLOWED[hash] || 'inconnu';
const deviceKind = () => /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone' : 'ordinateur';
function pingUsage(path, title) {
  try {
    const key = `muscu.ping.${path}`, day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key) === day) return;
    usagePings.push({ path, title });
    if (location.hostname !== 'slt-debug.github.io') return;
    const img = new Image();
    img.onload = () => { try { localStorage.setItem(key, day); } catch { /* stockage indisponible */ } };
    img.src = `${STATS_URL}?p=${encodeURIComponent('/' + path)}&t=${encodeURIComponent(title)}&e=true&rnd=${Math.random().toString(36).slice(2)}`;
  } catch { /* le suivi ne doit jamais gêner l'appli */ }
}
