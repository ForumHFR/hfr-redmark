# Changelog

## 0.2.0 — 2026-06-14

### Nouveautés
- Blocs de code multi-lignes ```` ``` ```` (avec langue optionnelle), rendus en `<pre><code>`
- Listes à puces (`-`, `*`, `+`) et numérotées (`1.`) rendues en `<ul>`/`<ol>`
- Task lists `- [ ]` / `- [x]` rendues en cases à cocher Unicode (☐ / ☑)
- Citations Markdown `> texte` rendues en `<blockquote>` (distinctes des `[quote]` HFR)
- Le rendu bloc reconstitue les lignes logiques entre les `<br>` (spécificité HFR)
- Conservateur : pas de bloc sur une ligne unique sans saut de ligne
- Nouvelles préférences pour activer/désactiver chaque bloc

### Interne
- Suite de tests via jsdom requérant le userscript réel (source unique)

## 0.1.0 — 2026-06-14

### Nouveautés
- MVP : rendu Markdown inline à la lecture des posts HFR
- Code inline `` `code` ``, gras `**texte**`, barré `~~texte~~` (actifs par défaut)
- Gras `__texte__`, italique `*texte*` / `_texte_` (opt-in)
- Échappement des délimiteurs (`` \` ``, `\*`, `\_`, `\~`, `\\`)
- Bouton de bascule `md` par post + interrupteur global
- Préférences via le menu Tampermonkey
- Parcours DOM sûr : citations, blocs de code HFR, signatures, liens et smileys ignorés
- Compatibilité Tampermonkey / Violentmonkey / Greasemonkey v4+
