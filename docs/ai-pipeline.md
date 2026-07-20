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

Un mainteneur peut aussi relancer manuellement le workflow avec le numéro d’une Issue depuis l’onglet **Actions**, par exemple après la correction d’un workflow ou d’une configuration.

## Sécurité

Les Issues du dépôt étant publiques, l’appartenance de l’auteur est contrôlée avant la collecte puis à nouveau avant l’appel au modèle. Le contenu de l’Issue est traité comme une donnée non fiable, les commentaires HTML sont retirés et l’agent ne peut pas écrire dans le dépôt. Le job qui publie dans GitHub est isolé du job Codex et ne reçoit pas la clé OpenAI.

## Test local

```bash
yarn test:pipeline
```

## Relance manuelle

Les deux workflows acceptent un numéro d’Issue depuis l’onglet **Actions**. Relancer `AI feature intake` rejoue toute la chaîne si la demande est complète. Relancer directement `AI feature specification` ne rejoue que l’analyse.

## Prochaine étape

Après validation humaine de la spécification, un agent de développement pourra créer une branche dédiée, implémenter la fonctionnalité et ouvrir une Pull Request vers `develop`.
