'use strict';
// Accès réservé : seuls les comptes GitHub de cette liste peuvent utiliser l'appli et le dashboard.
// On publie l'empreinte SHA-256 du nom GitHub en minuscules, pas le nom lui-même.
// Ajouter quelqu'un : node -e "console.log(require('crypto').createHash('sha256').update('nom-github'.toLowerCase()).digest('hex'))"
// Limite : le code est public, quelqu'un de technique peut le copier sans ce contrôle. Ça bloque les inconnus.
const ALLOWED = [
  '07a0d956d9b58f8d6d4bbbe69df56ff65c64f38857eb3569438ea7d90a8ae087', // propriétaire
];
async function loginHash(login) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(login).toLowerCase()));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const hashAllowed = hash => ALLOWED.includes(hash);
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
