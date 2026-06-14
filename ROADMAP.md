# Roadmap — [HFR] RedMark

Objectif : amener un rendu Markdown progressif et **sûr** à la lecture des posts HFR, sans jamais casser une page ni dépendre d'un serveur.

Principe directeur : **chaque nouvelle syntaxe doit pouvoir être désactivée** et ne jamais produire de faux positif silencieux. On préfère ne rien rendre plutôt que rendre à tort.

## v0.1 — MVP inline (livré)

- [x] Moteur inline construisant de vrais nœuds DOM (pas d'`innerHTML`)
- [x] Code inline `` `code` ``, gras `**`, barré `~~`
- [x] Gras `__`, italique `*` / `_` (opt-in, faux positifs)
- [x] Échappement `\` `` ` `` `\* \_ \~ \\`
- [x] Parcours DOM safe (skip citations, code HFR, signatures, liens, smileys)
- [x] Le code protège les délimiteurs internes
- [x] Bascule `md` par post + interrupteur global
- [x] Préférences (menu Tampermonkey)
- [x] Sélecteurs DOM vérifiés sur page HFR réelle (citation/signature dans `#para`)
- [x] Suite de tests sans dépendance + CI (`node test/redmark.test.js`)

## v0.2 — Blocs (livré)

Le défi (résolu) : HFR sépare les lignes par `<br>`, pas par `\n`. Le rendu bloc
reconstitue des « lignes logiques » entre les `<br>` d'un hôte de lignes, en
excluant citations/code/signatures.

- [x] Blocs de code multi-lignes ```` ``` ```` (fence) avec langue optionnelle
- [x] Listes `- ` / `* ` / `+ ` / `1. ` (à puces et numérotées)
- [x] Task lists `- [ ]` / `- [x]` (cases à cocher Unicode)
- [x] Citations Markdown `> ` (distinctes des `[quote]` HFR)
- [x] Détection conservatrice (contexte multi-lignes requis)
- [ ] Titres `#`, `##`, `###` (rendus discrets, taille mesurée)
- [ ] Règle horizontale `---`
- [ ] Listes imbriquées (indentation)
- [ ] Aperçu live dans la zone de réponse (textarea) avant envoi

## v0.3 — GitHub Flavored Markdown

- [ ] Tableaux GFM (`| a | b |`)
- [ ] Listes de tâches `- [ ]` / `- [x]`
- [ ] Liens `[texte](url)` (en complément de l'auto-lien HFR)
- [ ] Images `![alt](url)` (opt-in, via politique de rehost — voir hfr-redhost)
- [ ] Coloration syntaxique légère dans les blocs de code

## v0.4 — Intégration & robustesse

- [ ] **Intégration [hfr-redkit](https://github.com/XaaT/hfr-redkit)** : UI de
      préférences, stockage config et utilitaires partagés avec la famille red*
- [ ] `MutationObserver` pour les posts injectés dynamiquement (aperçu, édition inline)
- [ ] Mode « strict » : ne rendre que les posts contenant un marqueur explicite
      (ex. première ligne `[md]`) pour une intégration ultra-discrète
- [ ] Préférence « rendre seulement mes posts » / « tous les posts »
- [ ] Fixtures HTML synthétiques (anonymisées) de posts HFR — citations, code,
      spoilers, multi-`<br>` — pour test d'intégration via jsdom (au-delà du
      predicat déjà couvert sans dépendance)

## Idées d'intégration propre (backlog)

- **Détection d'intention** : n'activer une syntaxe bruyante (italique) que si le
  post « ressemble » à du Markdown (plusieurs marqueurs cohérents), sinon laisser brut.
- **Coexistence BBCode/Markdown** : ne pas entrer en conflit avec le BBCode déjà
  rendu par HFR ; le Markdown ne s'applique qu'au texte resté brut.
- **Bouton d'aide à l'écriture** : insérer les délimiteurs Markdown depuis la
  barre d'outils de la zone de réponse (parité avec les boutons BBCode HFR).
- **Respect des thèmes HFR** : styles du code/citations adaptés au thème clair/sombre.
- **Accessibilité** : balisage sémantique (`<code>`, `<del>`, `<strong>`) plutôt
  que purement visuel.
- **Performance mode impression** (~1000 posts/page) : rendu paresseux à l'écran
  (IntersectionObserver) plutôt que tout d'un coup.

## Non-objectifs

- Pas de serveur, pas de cache distant, pas d'appel réseau (contrairement à RedFlag).
- Pas de modification du contenu envoyé à HFR (rendu lecture uniquement).
- Pas de réécriture du BBCode existant.
