# Pipeline IA Synupsis

Le pipeline permet à un membre non développeur de proposer une fonctionnalité, de faire produire et reviewer son implémentation, puis de tester une Deploy Preview avant son intégration dans l’environnement de développement partagé.

La production n’est pas encore configurée. Aucune commande décrite ici ne déploie sur `main` ou en production.

## Vue d’ensemble

1. créer une Issue avec le formulaire **Fonctionnalité assistée par IA** ;
2. laisser l’agent produire une spécification ;
3. approuver cette spécification avec `/approve-spec` ;
4. laisser l’agent développeur créer une Pull Request brouillon ;
5. laisser la CI, Netlify et l’agent reviewer analyser la proposition ;
6. si nécessaire, autoriser les corrections avec `/apply-review-fixes` ;
7. tester manuellement la Deploy Preview Netlify ;
8. accepter son intégration dans `develop` avec `/approve-preview`.

## Étape 1 — Collecte de la demande

La demande se crée depuis **GitHub → Issues → New issue → Fonctionnalité assistée par IA**. Le formulaire demande le problème à résoudre, les utilisateurs concernés, le parcours attendu, des critères de validation observables, l’impact probable sur les données et les contraintes éventuelles.

Le workflow `AI feature intake` vérifie l’auteur et les champs indispensables, normalise le brief et applique l’un de ces labels :

- `ai:ready-for-spec` : la demande est complète ;
- `ai:needs-info` : des informations obligatoires manquent ;
- `ai:needs-approval` : la demande vient d’un compte externe.

Une demande complète et autorisée est automatiquement transmise à l’agent de spécification.

## Étape 2 — Spécification assistée par IA

Le workflow `AI feature specification` fournit le brief et le dépôt à Codex dans un environnement en lecture seule. Il exige une réponse JSON structurée, puis publie une spécification en français sur l’Issue.

La proposition couvre notamment le comportement, les fichiers concernés, l’approche technique, Supabase et les règles RLS, l’accessibilité et les tests. Elle reçoit `ai:spec-ready` ou `ai:spec-needs-info` et reste soumise à validation humaine.

## Étape 3 — Approbation de la spécification

Un propriétaire, membre ou collaborateur approuve la spécification en commentant exactement ceci sur l’Issue :

```text
/approve-spec
```

Le workflow `AI feature approval` revalide l’auteur, la cible, le label et la présence de la spécification du bot. Il ajoute ensuite `ai:spec-approved` et déclenche l’implémentation.

## Étape 4 — Implémentation isolée

L’agent développeur travaille à partir de `develop` et de la spécification approuvée. Il peut modifier le code applicatif dans sa copie de travail, mais ne possède aucun jeton GitHub en écriture.

Les chemins sensibles sont interdits : workflows GitHub, Supabase, fichiers d’environnement, dépendances et configuration Netlify. Si une fonctionnalité exige l’un de ces changements, l’agent signale un blocage.

Le patch produit est réappliqué sur une copie propre dans un job sans secret, puis soumis au lint, au typecheck, aux tests du pipeline et au build. Un autre job ne disposant pas des secrets applicatifs crée alors `codex/issue-<numéro>`, pousse le patch validé et ouvre une Pull Request brouillon vers `develop`.

## Étape 5 — CI, Deploy Preview et review IA

La Pull Request déclenche trois contrôles indépendants :

- la CI GitHub `Lint, typecheck and build` ;
- une Deploy Preview Netlify isolée ;
- le workflow `AI feature review` en lecture seule.

Le reviewer compare la spécification, l’Issue et le diff. Son verdict est attaché au SHA exact du dernier commit afin qu’une ancienne review ne puisse pas valider une nouvelle version.

Il applique l’un des labels suivants :

- `ai:review-passed` : aucun défaut actionnable n’a été trouvé ;
- `ai:review-changes` : des corrections sont demandées ;
- `ai:review-blocked` : la review ne peut pas conclure de manière fiable.

Une review IA réussie n’est pas une validation produit : la preview doit encore être testée par un humain.

## Étape 6 — Corrections autorisées

Si la review demande des changements, un membre autorisé peut commenter exactement ceci sur la Pull Request :

```text
/apply-review-fixes
```

L’agent correcteur ne peut modifier que les fichiers déjà touchés par l’implémentation. Son patch repasse dans un environnement sans secret et dans les mêmes validations. En cas de succès, il est poussé sur la même branche, puis la CI et le reviewer sont explicitement relancés sur le nouveau SHA.

Cette commande n’est acceptée que si la review courante demande réellement des changements.

## Étape 7 — Acceptation humaine de la preview

Lorsque la PR porte `ai:review-passed` et que Netlify affiche une Deploy Preview fonctionnelle, un membre autorisé doit ouvrir le lien, tester les critères de l’Issue et vérifier notamment le comportement mobile, les erreurs visibles et l’absence de régression évidente.

Après ce test manuel, il peut commenter exactement ceci sur la Pull Request :

```text
/approve-preview
```

Le workflow `AI feature preview acceptance` revalide alors :

- l’identité de la personne ayant commenté ;
- la branche `codex/issue-<numéro>` et la cible `develop` ;
- les labels de spécification, d’implémentation et de review ;
- l’absence de correction ou de blocage en cours ;
- une review positive attachée au SHA courant ;
- la réussite de la CI sur ce SHA ;
- la réussite de la Deploy Preview Netlify propre à cette PR ;
- une URL de la forme `deploy-preview-<PR>--dev-synupsis.netlify.app`.

Si tout est encore valide, la PR est passée hors brouillon, fusionnée par squash dans `develop`, l’Issue est clôturée avec `ai:integrated-dev` et la CI de `develop` est relancée explicitement.

`/approve-preview` signifie donc « intégrer dans l’environnement de développement partagé ». Cette commande ne signifie jamais « mettre en production ».

## Sécurité

Les Issues étant publiques, l’appartenance de l’auteur est contrôlée avant chaque opération sensible et avant chaque appel au modèle. Les textes produits par les utilisateurs sont traités comme des données non fiables et neutralisés avant leur insertion dans les prompts ou commentaires.

Les agents de spécification et de review sont en lecture seule. Les agents développeur et correcteur écrivent uniquement dans un espace isolé, sans droit GitHub en écriture. Le code généré est validé sans secret ; les jobs disposant d’un droit d’écriture ne font qu’appliquer un patch déjà contrôlé ou effectuer une opération GitHub déterministe.

Chaque approbation humaine est une commande exacte et publique. Les reviews, corrections et acceptations sont liées au SHA complet afin d’empêcher qu’une autorisation ancienne soit réutilisée après modification du code.

## Tests et relances

Les scripts déterministes du pipeline se testent localement avec :

```bash
yarn test:pipeline
```

Les workflows de collecte, spécification, développement et review peuvent aussi être relancés manuellement depuis l’onglet **Actions** avec le numéro d’Issue ou de Pull Request demandé. Les commandes `/approve-spec`, `/apply-review-fixes` et `/approve-preview` restent volontairement publiques et humaines afin de conserver une trace d’autorisation explicite.

## Frontière avec la production

À ce stade, Netlify déploie automatiquement `develop` vers l’environnement de développement partagé et crée une Deploy Preview pour chaque Pull Request. Aucun environnement GitHub Production, aucun déploiement automatique de `main` et aucune promotion vers la production ne font partie de ce pipeline.

La prochaine étape sera de créer une fondation de production séparée : environnement Netlify dédié, secrets et Supabase de production distincts, remise à niveau contrôlée de `main`, règles de protection et commande de promotion indépendante. Cette étape devra conserver une validation humaine supplémentaire et ne réutilisera pas `/approve-preview`.
