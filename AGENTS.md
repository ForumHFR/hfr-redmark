# HFR RedMark

Userscript Tampermonkey pour forum.hardware.fr (HFR) qui rend le **Markdown à la
lecture** des posts, côté navigateur, sans modifier le contenu stocké sur HFR.

## Projet

- Fichier livré : `hfr-redmark.user.js`
- Aucun backend : 100 % client, aucun appel réseau, aucun stockage distant.
- Famille HFR red* : voir aussi [hfr-redflag](https://github.com/XaaT/hfr-redflag)
  (alertes modo) et [hfr-redkit](https://github.com/XaaT/hfr-redkit) (kit commun, à intégrer).

## DOM HFR (référence)

Structure d'un post (vérifiée via le parser de `hfr-mcp`) :

| Élément | Sélecteur | Rôle |
|---|---|---|
| Post | `table.messagetable` | un post (les pubs n'ont pas d'ancre) |
| Ancre | `td.messCase1 a[name^="t"]` | `name="t{numreponse}"` → identifiant du post |
| Auteur | `td.messCase1 b.s2` | pseudo |
| Barre d'outils | `td.messCase2 div.toolbar` (`.left` date, `.right` actions) | date + boutons |
| **Contenu** | **`div#para{numreponse}`** | corps du message (cible du rendu) |

Clé unique d'un post sur HFR : `(cat, numreponse)`. Le `numreponse` est un
auto-increment **par catégorie**, pas global.

## Architecture du rendu

```
Page HFR (document-end)
   │
   ▼
processAll()  → pour chaque table.messagetable
   │
   ├─ setupPost(): récupère num via l'ancre, cible div#para{num}
   │     ├─ renderPost(para)  (si rendu global activé)
   │     └─ injectToggle(table, para)  (bouton "md")
   │
   ▼
renderPost(para)
   ├─ TreeWalker SHOW_TEXT sur le para
   ├─ inSkippableContext(): rejette A, CODE, PRE, TABLE (citations), .sig, .cita…
   ├─ pour chaque nœud texte retenu :
   │     maskEscapes() → emitInline() → fragment DOM → replaceChild()
   └─ marque data-redmark="on" + garde l'innerHTML d'origine (__redmarkOrig)
```

### Moteur inline

- `RULES` : liste ordonnée par **priorité** (le code d'abord, puis gras, barré, italique).
  Chaque règle a une regex non-greedy exigeant un contenu non vide sans espace au bord.
- `firstMatch()` : choisit le motif le plus à gauche ; à position égale, l'ordre de
  `RULES` tranche (donc `**` l'emporte sur `*`, le code protège tout).
- `emitInline()` : récursif ; les règles `literal` (code) ne récursent pas → le
  contenu du code reste brut.
- **Échappements** : `maskEscapes()` remplace `\x` par un caractère de zone privée
  Unicode (U+E000–U+E004) invisible des regex, `unmask()` restitue le littéral à
  l'émission. Ne jamais « voir » un délimiteur échappé.

### Garde-fous (intégration propre)

- Construire des nœuds DOM, **jamais d'`innerHTML`** pour le rendu (l'`innerHTML`
  d'origine n'est conservé que pour la restauration via le bouton `md`).
- Ne transformer **que** les nœuds texte hors `SKIP_TAGS` / `SKIP_CLASS`.
- Idempotent : `data-redmark` évite le double rendu.
- Réversible : `restorePost()` réinjecte `__redmarkOrig`.
- Italique et gras `__` **désactivés par défaut** (faux positifs : snake_case,
  multiplications, mots censurés).

## Conventions de code

- **`.user.js`** : commentaires en français **sans accents** (ASCII). Les chaînes
  d'interface affichées à l'utilisateur utilisent des **échappements `\uXXXX`**
  pour les accents (ex. `'Préférences'` → `Préférences`). Même convention
  que `hfr-redflag.user.js`.
- **`.md`** (README, CHANGELOG, ROADMAP, ce fichier) : français complet avec accents.
- Style : IIFE `'use strict'`, `var`, bloc `CONFIG` en tête, shims GM.* en tête.
- Pas de dépendance externe, pas de build : le `.user.js` est le livrable direct.

## Identité Git/GitHub

- Repo : **ForumHFR/hfr-redmark** (org ForumHFR ; les userscripts perso sont sous XaaT).
- Branche par défaut : `master` (cohérent avec la famille red* et l'`@updateURL`).
- Commits/PR via l'identité **xat / xat@azora.fr** (config locale, jamais `--global`).
- Ne jamais divulguer l'identité réelle de l'utilisateur.

## Release

Tag `vX.Y.Z` → workflow `.github/workflows/release.yml` :
1. extrait la section de version de `CHANGELOG.md`,
2. génère le BBCode prêt à coller sur HFR,
3. crée la GitHub Release.

Penser à incrémenter `@version` dans le `.user.js` **et** la ligne de changelog en
tête de fichier, en plus de `CHANGELOG.md`.

## Tests

Le moteur inline est testable hors navigateur avec un DOM stub (createTextNode /
createElement / DocumentFragment) en sérialisant le fragment produit. Couvrir :
flagship `` `test` ``, protection du code, imbrication, anti-faux-positifs
(italique off), échappements, multi-occurrences. À embarquer dans le repo + CI (roadmap).
