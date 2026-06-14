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

**Vérifié sur page réelle (2026-06-14)** : à l'intérieur du `div#para{N}`,
- une **citation** `[quote]` est rendue en `div.container > table.citation > tr > td`
  → ignorée par le skip de toute balise `<table>` imbriquée ;
- une **signature** est un `<span class="signature">` présent *dans* le `para`
  → ignorée par `SKIP_CLASS` (alternative `signature`).
Les deux mécanismes de skip sont donc nécessaires. Couvert par `test/redmark.test.js`.

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
   ├─ processBlocks(para)  (si fence/list activés) — AVANT l'inline
   ├─ TreeWalker SHOW_TEXT sur le para
   ├─ inSkippableContext(): rejette A, CODE, PRE, TABLE (citations), .sig, .cita…
   ├─ pour chaque nœud texte retenu :
   │     maskEscapes() → emitInline() → fragment DOM → replaceChild()
   └─ marque data-redmark="on" + garde l'innerHTML d'origine (__redmarkOrig)
```

### Moteur bloc (`processBlocks`)

HFR sépare les lignes par `<br>`, pas par `\n`. Le rendu bloc tourne **avant**
l'inline (pour que le contenu des fences ne soit pas réinterprété et que l'inline
s'applique dans les `<li>`).

- **Hôtes de lignes** : HFR enveloppe chaque paragraphe (séparé par une ligne vide)
  dans un `<p>`, les `<p>` étant séparés par des nœuds texte `&nbsp;`. Les hôtes sont
  donc : le `para` **s'il a un `<br>` direct** (posts sans `<p>`) **+ chaque `<p>`**
  (hôte même sans `<br>` → un paragraphe d'une seule ligne comme `> cite` est traité),
  hors contextes ignorés (`hostExcluded` : citation/`<table>`/signature/code).
- `segmentLines(host)` : découpe les enfants directs en lignes (séparateur `<br>`).
  Les **éléments-frontière** (`isBoundaryEl` : `p`/`div`/`ul`/`ol`/`pre`/`blockquote`/
  `table`/titres + classes skip) sont exclus des lignes et **coupent les runs** — ainsi
  le niveau `para` n'avale jamais un `<p>` dans une liste/citation.
- `processHost` détecte des **runs** : fence (ligne ```` ``` ```` → ligne ```` ``` ````),
  suite de lignes de même type de liste (`listType`), ou suite de lignes `> ` (quote).
  Les ops sont appliquées **de la fin vers le début** pour garder les références valides.
- `applyOp` construit `<pre><code>` (texte brut joint par `\n`), `<ul>/<ol>` de `<li>`
  (marqueur retiré du 1er nœud texte, task list → `<span class="redmark-check">` ☐/☑),
  ou `<blockquote>` (marqueur `>` retiré, lignes séparées par des `<br>` neufs).
  La citation `>` est **distincte** du `[quote]` HFR (table, exclue des hôtes).
  `replaceLines` insère le bloc puis retire les nœuds/`<br>` consommés.
- **Conservateur** : pas de bloc sans contexte multi-lignes (un `para` sans `<br>`
  n'est jamais un hôte) → un post d'une ligne « - bof » reste du texte.

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

`npm test` (ou `node test/redmark.test.js`) — **jsdom**, exécuté en CI via
`.github/workflows/test.yml` (`npm ci` + `npm test`).

Le test **requiert le userscript réel** : un hook `module.exports` gardé par
`typeof module` (inerte dans le navigateur) expose l'API interne (`emitInline`,
`processBlocks`, `inSkippableContext`, `renderPost`, `setPrefs`…). **Source unique,
aucune copie** → pas de dérive possible. Avant le `require`, le test pose
`document`/`NodeFilter`/`GM_*` en globals (jsdom) ; au chargement `processAll`
tourne sur un DOM vide (no-op).

Couvre :
1. **moteur inline** — flagship `` `test` ``, protection du code, imbrication,
   anti-faux-positifs (italique off), échappements ;
2. **blocs** — fences (langue, multi-lignes, non fermée, échappement HTML),
   listes (`-`/`*`/`+`/`1.`, frontières, ul→ol), task lists ☐/☑, blockquotes `>`,
   gating, conservateur ;
3. **intégration `renderPost`** — blocs+inline composés, fence non touché par l'inline,
   citation inchangée ;
4. **`inSkippableContext`** — citations/signatures/liens/code ignorés ;
5. **cohérence** — `@version` du `.user.js` présent comme `## X.Y.Z` dans `CHANGELOG.md`.

Une fixture HTML synthétique + test d'intégration multi-`<br>` plus poussé restent en roadmap.
