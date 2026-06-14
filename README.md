# [HFR] RedMark

Userscript pour [forum.hardware.fr](https://forum.hardware.fr) qui **rend le Markdown à la lecture** des posts. Tapez `` `du code` ``, `**du gras**` ou `~~du barré~~` dans vos messages : RedMark les affiche formatés, côté navigateur, sans rien changer au contenu stocké sur HFR.

> Le rendu est **purement local et côté lecture**. RedMark ne modifie jamais vos posts sur le serveur : il transforme uniquement l'affichage dans votre navigateur. Les autres lecteurs voient le Markdown rendu seulement s'ils ont aussi le script.

## Installation

1. Installer [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Opera) ou [Violentmonkey](https://violentmonkey.github.io/)
2. [Cliquer ici pour installer le script](https://github.com/ForumHFR/hfr-redmark/raw/refs/heads/master/hfr-redmark.user.js)
3. Tampermonkey propose l'installation — confirmer
4. Naviguer sur un topic HFR — les posts sont rendus automatiquement

Les mises à jour sont automatiques via Tampermonkey.

## Syntaxes supportées

Référence : un sous-ensemble sûr de **GitHub Flavored Markdown (GFM)**.

### En ligne

| Syntaxe | Rendu | Activé par défaut |
|---|---|---|
| `` `code` `` | code inline | Oui |
| `**gras**` | **gras** | Oui |
| `~~barré~~` | ~~barré~~ | Oui |
| `__gras__` | **gras** | Non (opt-in) |
| `*italique*` | *italique* | Non (opt-in) |
| `_italique_` | *italique* | Non (opt-in) |

L'italique et le gras `__` sont **désactivés par défaut** : ils génèrent trop de faux positifs sur du texte normal (`snake_case`, multiplications `a * b`, mots censurés…). Activez-les dans les préférences si vous en avez besoin.

### Blocs (multi-lignes)

| Syntaxe | Rendu | Activé par défaut |
|---|---|---|
| ```` ```lang ``` … ``` ```` | bloc de code (`<pre>`) | Oui |
| `- item` / `* item` / `+ item` | liste à puces | Oui |
| `1. item` | liste numérotée | Oui |
| `- [ ] tâche` / `- [x] fait` | case à cocher ☐ / ☑ | Oui |
| `> citation` | bloc de citation (`<blockquote>`) | Oui |

La citation `>` est distincte du `[quote]` de HFR (qui reste rendu par HFR). Les blocs ne sont détectés que dans un **contexte multi-lignes** : une ligne unique (un post sans saut de ligne) commençant par `-` ou un nombre n'est jamais transformée. Le contenu d'un bloc de code n'est jamais réinterprété (le `**` y reste littéral).

Échappement : `` \` ``, `\*`, `\_`, `\~`, `\\` permettent d'afficher le caractère littéral.

## Intégration propre

RedMark est conçu pour **ne jamais casser une page HFR**. Les garde-fous :

- **Texte brut uniquement** : le rendu ne touche que les nœuds texte du message (`div#para{N}`). Le HTML déjà produit par HFR est laissé intact.
- **Contextes ignorés** : citations (`[quote]`), blocs de code HFR (`[code]`), spoilers, signatures, smileys (`<img>`) et liens (`<a>`) ne sont jamais réinterprétés.
- **Le code protège le reste** : `` `**texte**` `` reste du code brut, le `**` n'est pas transformé en gras.
- **Pas de double rendu** : chaque post est marqué une fois traité (idempotent).
- **Construction DOM** : le rendu crée de vrais nœuds (`<code>`, `<strong>`…), pas d'injection `innerHTML` — pas de risque d'altérer le balisage existant.
- **Réversible** : un bouton `md` sur chaque post bascule entre rendu et original.

## Préférences

Accessible via le menu Tampermonkey → **RedMark: Préférences**.

- **Activer le rendu Markdown** — interrupteur global
- **Syntaxes** — cocher/décocher chaque règle (code, gras, barré, italique…)
- **Bouton de bascule** — afficher ou non le bouton `md` sur chaque post

Raccourci : **RedMark: Activer / désactiver** dans le menu Tampermonkey.

## Comment ça marche

1. Au chargement de la page, le script parcourt chaque post (`table.messagetable`).
2. Pour chaque message, il récupère le contenu (`div#para{numreponse}`).
3. Un `TreeWalker` ne sélectionne que les nœuds texte hors contextes interdits.
4. Chaque nœud texte est transformé en fragment DOM selon les règles actives.
5. Le bouton `md` permet de revenir à l'affichage d'origine post par post.

Aucun appel réseau, aucun stockage distant : tout se passe dans le navigateur.

## Compatibilité

| Moteur | Support |
|---|---|
| Tampermonkey | Complet (cible principale) |
| Violentmonkey | Complet |
| Greasemonkey v4+ | Complet (shims GM.* intégrés) |

## Roadmap

Voir [ROADMAP.md](ROADMAP.md) : blocs de code multi-lignes, titres, listes, citations Markdown, tableaux GFM, intégration au kit commun [hfr-redkit](https://github.com/XaaT/hfr-redkit)…

## Releases

Les releases sont publiées via des tags Git. Voir les [releases](https://github.com/ForumHFR/hfr-redmark/releases) et le [CHANGELOG.md](CHANGELOG.md).

## Famille HFR red*

RedMark fait partie des userscripts HFR :

- [hfr-redflag](https://github.com/XaaT/hfr-redflag) — met en évidence les posts alertés à la modération
- [hfr-redkit](https://github.com/XaaT/hfr-redkit) — kit commun (UI, config, utilitaires)
- **hfr-redmark** — rendu Markdown à la lecture

## Licence

[MIT](LICENSE)
