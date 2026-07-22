# Stratégie de vérité et de richesse des recaps

## La vérité actuelle

Le modèle n'est jamais une source de vérité. Il est un moteur de transformation : il sélectionne et reformule des éléments présents dans un Evidence Pack figé au moment de la génération.

Le socle obligatoire est actuellement Trakt. Il fournit l'identité de la série, les épisodes, leurs synopsis et une image éventuelle. TMDB enrichit les résumés français et anglais lorsqu'une clé est configurée. TVmaze est interrogé comme second référentiel lorsque Trakt fournit un identifiant TVDB ou IMDb compatible. Wikidata confirme l'identité et les articles de saison Wikipédia français ou anglais enrichissent le corpus lorsqu'ils existent.

Chaque fragment narratif possède :

- un identifiant stable cité par le récit ;
- son fournisseur, sa langue et son URL ;
- l'épisode auquel il appartient ;
- un niveau de confiance (`reference`, `editorial`, `official`, `licensed-transcript`).
- sa licence, sa date de collecte et, quand elle existe, sa révision.

Le recap publié conserve son Evidence Pack et son graphe d'événements. Le lecteur affiche les événements, la confiance, la source, la licence et la révision utilisés pour chaque slide. Cela permet d'expliquer une slide, de régénérer avec une nouvelle version du prompt et de mesurer la densité des sources.

Un registre de sources versionné accompagne chaque snapshot. En mode `audit`, une condition commerciale non résolue est conservée comme avertissement pour faciliter le développement. En mode `enforce`, elle empêche la publication jusqu'à ce que le fournisseur soit explicitement listé dans `RECAP_SOURCE_APPROVALS` après revue. Ce registre est un garde-fou technique, pas un avis juridique : les conditions Trakt/TMDB et les obligations CC BY-SA doivent être validées avant lancement.

Cette évolution améliore fortement la provenance, mais Trakt, TMDB et TVmaze restent principalement des bases de synopsis. Trois synopsis courts ne deviennent pas automatiquement une description scène par scène, et plusieurs bases peuvent reprendre le même texte d'origine.

## Ce qui rend réellement un recap détaillé

Le pipeline intercale maintenant un graphe d'événements entre les documents et les slides. Un événement contient :

```text
id, épisode, position approximative
personnages, lieu
action, cause, conséquence
arc narratif, importance
preuves, confiance, contradictions
```

Le pipeline devient :

```text
documents autorisés
  -> fragments sourcés et dédupliqués
  -> faits et événements par épisode (passe 1)
  -> graphe de saison (arcs, causes, révélations)
  -> sélection des moments
  -> narration citant uniquement ces événements (passe 2)
  -> vérification structurelle automatique
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

1. Construire un jeu d'évaluation de 10–20 saisons connues et noter les événements et slides produits par la v4.
2. Ajouter une table de documents et de fragments avec hash, licence, langue et historique d'ingestion pour remplacer progressivement les gros snapshots JSON.
3. Ajouter un vérificateur indépendant : chaque phrase doit être supportée, contredite ou déclarée insuffisamment prouvée.
5. Construire une banque de plusieurs images candidates par épisode avec provenance, dimensions, personnages visibles et zone de recadrage sûre.
6. Brancher les sources officielles ou commerciales après validation juridique ; tester les sous-titres uniquement avec des droits explicites.
7. Déporter l'orchestration vers un worker durable afin que la finalisation ne dépende plus du polling du navigateur.

## Règles produit recommandées

- Un événement important demande une source autoritative ou deux sources réellement indépendantes.
- Une absence de preuve doit raccourcir le recap, jamais déclencher une invention.
- Une contradiction doit être conservée et visible dans le rapport qualité.
- Une image générique ne doit pas être présentée comme l'image exacte d'une scène.
- Les droits et l'attribution font partie de la donnée, au même titre que le texte et l'URL.
- Le contenu généré est un dérivé éditorial, jamais une preuve.
