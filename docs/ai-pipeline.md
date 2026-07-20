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
   - `ai:needs-approval` : la demande vient d’un compte externe.

Cette étape ne lance encore aucun modèle, ne modifie pas le code et ne déploie rien.

Un mainteneur peut aussi relancer manuellement le workflow avec le numéro d’une Issue depuis l’onglet **Actions**, par exemple après la correction d’un workflow ou d’une configuration.

## Sécurité

Les Issues du dépôt étant publiques, l’appartenance de l’auteur est contrôlée avant de déclarer une demande prête. Ce garde-fou devra aussi être vérifié par tous les futurs workflows qui consommeront des crédits IA ou disposeront de droits d’écriture.

## Test local

```bash
yarn test:pipeline
```

## Prochaine étape

Un agent de spécification consommera les Issues portant le label `ai:ready-for-spec`, analysera le dépôt et proposera une spécification technique et fonctionnelle soumise à validation humaine.
