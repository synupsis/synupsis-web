# Stratégie de vérité et de richesse des recaps

## La vérité actuelle

Le modèle n'est jamais une source de vérité. Il est un moteur de transformation : il sélectionne et reformule des éléments présents dans un Evidence Pack figé au moment de la génération.

Le socle obligatoire est actuellement Trakt. Il fournit l'identité de la série, les épisodes, leurs synopsis et une image éventuelle. TMDB enrichit les résumés français et anglais lorsqu'une clé est configurée. TVmaze est interrogé comme second référentiel lorsque Trakt fournit un identifiant TVDB ou IMDb compatible.

Chaque fragment narratif possède :

- un identifiant stable cité par le récit ;
- son fournisseur, sa langue et son URL ;
- l'épisode auquel il appartient ;
- un niveau de confiance (`reference`, `editorial`, `official`, `licensed-transcript`).

Le recap publié conserve son Evidence Pack. Cela permet d'expliquer une slide, de régénérer avec une nouvelle version du prompt et de mesurer la densité des sources.

Cette évolution améliore fortement la provenance, mais Trakt, TMDB et TVmaze restent principalement des bases de synopsis. Trois synopsis courts ne deviennent pas automatiquement une description scène par scène, et plusieurs bases peuvent reprendre le même texte d'origine.

## Ce qui rend réellement un recap détaillé

Il faut intercaler un graphe d'événements entre les documents et les slides. Un événement devrait contenir au minimum :

```text
id, épisode, position approximative
personnages, lieu
action, cause, conséquence
arc narratif, importance
preuves, confiance, contradictions
```

Le pipeline cible devient :

```text
documents autorisés
  -> fragments sourcés et dédupliqués
  -> faits et événements par épisode
  -> graphe de saison (arcs, causes, révélations)
  -> sélection des moments
  -> narration avec citations
  -> vérification phrase par phrase
  -> choix image + layout
  -> publication ou revue humaine
```

La séparation est essentielle. Demander directement « résume cette saison » oblige le modèle à faire simultanément recherche, compréhension, hiérarchisation, rédaction et mise en page. Un graphe d'événements permet de tester chaque étape et de produire plusieurs recaps depuis la même vérité : version courte, longue, centrée sur un personnage ou rappel avant la saison suivante.

## Niveaux atteignables

### Niveau 1 — recap de référence

Sources : Trakt + TMDB + TVmaze. Cinq à dix moments, couvrant les grands événements explicitement présents dans les synopsis.

Atteignable maintenant. Bon sur les titres, la chronologie générale et les événements principaux. Limité sur les motivations, les intrigues secondaires et les actions silencieuses.

### Niveau 2 — recap narratif

Sources : synopsis officiels détaillés, source éditoriale licenciée ou contenu Wikimedia compatible, plus le graphe d'événements et une passe de vérification.

Objectif recommandé pour le produit. On peut raconter causes, décisions, conséquences, arcs de personnages, mystères et révélations sans transformer chaque slide en résumé d'épisode.

### Niveau 3 — recap cinématographique

Sources : timed text et visuels épisodiques licenciés, éventuellement analyse de la vidéo autorisée. On ajoute scènes, dialogues, actions visuelles, reconnaissance de personnages, OCR, temporalité et correspondance précise entre moment et image.

C'est le niveau qui rend possibles quinze à vingt-cinq slides réellement détaillées. Le principal obstacle n'est plus le modèle, mais l'accès contractuel aux textes, vidéos et images.

### Niveau 4 — qualité quasi éditoriale

Même pipeline, avec revue humaine ciblée selon le score de confiance, l'audience attendue et les contradictions détectées. Les corrections validées enrichissent une base de faits réutilisable au lieu de modifier seulement le canvas final.

## Ordre d'intégration conseillé

1. Stabiliser l'Evidence Pack multi-source déjà amorcé et afficher les attributions dans le lecteur.
2. Ajouter une table de documents et de fragments avec hash, licence, langue et historique d'ingestion.
3. Ajouter la passe `fragments -> événements`, puis composer les slides uniquement depuis ces événements.
4. Ajouter un vérificateur indépendant : chaque phrase doit être supportée, contredite ou déclarée insuffisamment prouvée.
5. Construire une banque de plusieurs images candidates par épisode avec provenance, dimensions, personnages visibles et zone de recadrage sûre.
6. Brancher les sources officielles ou commerciales après validation juridique ; tester les sous-titres uniquement avec des droits explicites.
7. Créer un jeu d'évaluation de saisons connues et noter factualité, couverture, chronologie, lisibilité et pertinence image/texte.

## Règles produit recommandées

- Un événement important demande une source autoritative ou deux sources réellement indépendantes.
- Une absence de preuve doit raccourcir le recap, jamais déclencher une invention.
- Une contradiction doit être conservée et visible dans le rapport qualité.
- Une image générique ne doit pas être présentée comme l'image exacte d'une scène.
- Les droits et l'attribution font partie de la donnée, au même titre que le texte et l'URL.
- Le contenu généré est un dérivé éditorial, jamais une preuve.
