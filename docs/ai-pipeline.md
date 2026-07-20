# Pipeline IA Synupsis

Le pipeline doit permettre à un membre non développeur de proposer une fonctionnalité, d’obtenir une preview testable, puis de demander sa mise en production sans manipuler le code.

## Étape 1 — Collecte de la demande

Cette première étape est disponible depuis **GitHub → Issues → New issue → Fonctionnalité assistée par IA**.

Le formulaire demande :

- le problème à résoudre ;
- les utilisateurs concernés ;
- le résultat et le parcours attendus ;
- des critères de validation observables ;
- l’impact probable sur les données ;
- les contraintes et références éventuelles.

À la création ou à la modification de l’Issue, le workflow `AI feature intake` :

1. vérifie que les champs indispensables sont présents ;
2. vérifie que l’auteur est propriétaire, membre ou collaborateur du dépôt ;
3. transforme les réponses en brief initial normalisé ;
4. maintient un commentaire de statut unique sur l’Issue ;
5. applique l’un des labels suivants :
   - `ai:ready-for-spec` : la demande peut être envoyée à l’agent de spécification ;
   - `ai:needs-info` : des informations obligatoires manquent ;
   - `ai:needs-approval` : la demande vient d’un compte externe ;
6. transmet automatiquement une demande complète à l’agent de spécification.

## Étape 2 — Spécification assistée par IA

Lorsqu’une demande reçoit le statut `ai:ready-for-spec`, le workflow `AI feature specification` :

1. contrôle à nouveau l’auteur et le label de l’Issue avant de consommer des crédits ;
2. fournit à Codex le brief et le dépôt dans un environnement en lecture seule ;
3. demande une spécification structurée en français, fondée sur les fichiers réellement présents ;
4. valide la réponse avec un schéma JSON ;
5. publie ou met à jour un commentaire unique sur l’Issue ;
6. applique `ai:spec-ready` ou `ai:spec-needs-info`.

La spécification couvre le comportement, les fichiers concernés, l’approche technique, l’impact Supabase/RLS, l’accessibilité, les étapes d’implémentation et les tests. Elle reste soumise à validation humaine. Aucun code ni déploiement n’est encore produit.

## Étape 3 — Validation humaine

Un propriétaire, membre ou collaborateur du dépôt approuve la proposition en ajoutant exactement ce commentaire dans l’Issue :

```text
/approve-spec
```

Le workflow `AI feature approval` contrôle que :

- la commande vient d’un compte autorisé ;
- la cible est bien une Issue et non une Pull Request ;
- le label `ai:spec-ready` est encore présent ;
- une spécification a réellement été publiée par le bot.

Après validation, il ajoute `ai:spec-approved`, publie une confirmation et transmet l’Issue à l’agent de développement.

## Étape 4 — Implémentation isolée

L’agent développeur utilise la spécification approuvée et le dépôt `develop` pour produire un patch Git structuré. Il peut modifier le code applicatif dans sa copie de travail, mais n’a aucun jeton GitHub lui permettant de pousser ou de créer une PR.

Les chemins sensibles sont interdits dans cette première version : workflows GitHub, Supabase, fichiers d’environnement, dépendances et configuration Netlify. Si le besoin exige l’un de ces changements, l’agent publie un blocage au lieu de contourner la protection.

Le patch traverse ensuite deux environnements distincts :

1. un job sans secret et avec le dépôt en lecture seule réapplique le patch sur une copie propre, puis exécute lint, typecheck, tests du pipeline et build ;
2. uniquement si tout réussit, un job séparé disposant des droits GitHub réapplique le même patch sans exécuter le code, crée `codex/issue-<numéro>`, pousse un commit et ouvre une Pull Request brouillon vers `develop`.

L’Issue reçoit alors `ai:implementation-pr` et un lien vers la PR. La fusion et la mise en production restent manuelles.

Un mainteneur peut aussi relancer manuellement le workflow avec le numéro d’une Issue depuis l’onglet **Actions**, par exemple après la correction d’un workflow ou d’une configuration.

## Sécurité

Les Issues du dépôt étant publiques, l’appartenance de l’auteur est contrôlée avant la collecte puis à nouveau avant chaque appel au modèle. Le contenu de l’Issue est traité comme une donnée non fiable et les commentaires HTML sont retirés.

Les agents de spécification et de développement ne disposent jamais d’un jeton GitHub en écriture. Pour l’implémentation, le code généré est en plus testé dans un job sans secret. Le job autorisé à pousser ne fait qu’appliquer le patch déjà validé et n’exécute aucun code généré.

## Test local

```bash
yarn test:pipeline
```

## Relance manuelle

Les workflows de collecte et de spécification acceptent un numéro d’Issue depuis l’onglet **Actions**. Relancer `AI feature intake` rejoue toute la chaîne si la demande est complète. Relancer directement `AI feature specification` ne rejoue que l’analyse. L’approbation, elle, exige volontairement la commande publique `/approve-spec` afin de conserver une trace humaine explicite dans l’Issue.

## Prochaine étape

Un agent de revue analysera la Pull Request, ses checks et le diff. Il pourra proposer ou appliquer des corrections avant que la PR soit présentée pour validation humaine et test de la preview Netlify.
