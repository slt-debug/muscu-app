# Muscu

Appli web installable (PWA) de suivi du programme de musculation : séance du jour, saisie des séries, progression automatique (double progression), minuteur de repos, historique et suivi corporel. Fonctionne sans réseau.

## Architecture

- Pas de build : `index.html`, `app.js`, `program.js`, `style.css`, `sw.js` (cache hors ligne), `manifest.webmanifest`.
- Programme dans `program.js` (exercices, séries, fourchettes de reps, repos).
- Données : `localStorage` sur le téléphone, copiées dans un fichier `data.json` d'un dépôt GitHub **privé** via l'API Contents (jeton fine-grained stocké uniquement sur le téléphone).
- Ce dépôt (le code) ne contient aucune donnée personnelle.

## Mise en ligne (GitHub Pages)

1. Créer le dépôt `muscu-app` (public, requis par Pages en offre gratuite) et y pousser ce dossier.
2. Settings > Pages > Source : branche `main`, dossier `/ (root)`.
3. L'appli est servie sur `https://<compte>.github.io/muscu-app/`.

## Synchronisation avec le PC

1. Créer un dépôt **privé** `muscu-data` (vide).
2. Créer un jeton : GitHub > Settings > Developer settings > Fine-grained tokens, limité au dépôt `muscu-data`, permission Contents : Read and write.
3. Dans l'appli : Réglages, renseigner compte, dépôt, fichier (`data.json`) et jeton.
4. Sur le PC, `git clone` de `muscu-data` donne accès à `data.json` (séances et mesures).

## Test local

```
python -m http.server 8123
```
puis ouvrir http://127.0.0.1:8123/. Le service worker met l'appli en cache : pour voir une modification, désinscrire le service worker (DevTools > Application) ou incrémenter `CACHE` dans `sw.js`.
