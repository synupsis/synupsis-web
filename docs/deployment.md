# Déploiement

Synupsis tourne comme **un seul serveur Node toujours allumé** : pages, API et worker de génération des récaps (`server/plugins/recap-generation-worker.ts`). Les réponses OpenAI vivent dans la mémoire de ce processus : un hébergement serverless (Netlify) ou qui met le serveur en veille (Render Free) coupe les générations en cours.

| Environnement | Hébergement | Branche | Supabase | Accès |
|---|---|---|---|---|
| Développement | Dokploy sur le NAS, publié par Pangolin | `develop` | projet de dev | réservé (authentification Pangolin) |
| Production | Render, plan Starter ou plus | `main` | projet de prod | public |

Chaque environnement a son propre projet Supabase, ses propres clés et, idéalement, son propre projet OpenAI avec un plafond de dépenses.

## Image Docker

Le `Dockerfile` à la racine sert aux deux hébergements : build en deux étapes, Node 24, seul `.output` est copié dans l'image finale, qui tourne sans root (`node`) sur le port `3000`.

**Arguments de build** (publics, lus par `nuxt.config.ts` pendant le build) :

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_KEY` (clé anon / publishable)

Changer l'un d'eux demande un nouveau build, pas seulement un redémarrage.

**Variables d'environnement à l'exécution** (secrets, jamais en argument de build) :

| Variable | Rôle |
|---|---|
| `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY` | mêmes valeurs que les arguments de build |
| `NUXT_SUPABASE_SECRET_KEY` | clé service role : écritures serveur et worker de génération |
| `OPENAI_API_KEY`, `OPENAI_RECAP_MODEL` (optionnel) | génération des récaps |
| `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET` | catalogue des séries |
| `TMDB_API_READ_ACCESS_TOKEN` | images et synopsis TMDB |
| `RECAP_SOURCE_POLICY_MODE` | `audit` tant que les licences des sources ne sont pas validées |
| `RECAP_GENERATION_WORKER` | `false` pour couper le worker (laissez-le actif) |

Sans `NUXT_SUPABASE_SECRET_KEY`, le serveur démarre mais le worker se désactive (« The recap generation worker is off ») et les générations ne démarrent pas.

Tester l'image en local :

```bash
docker build -t synupsis-web \
  --build-arg NUXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co \
  --build-arg NUXT_PUBLIC_SUPABASE_KEY=<clé anon> .
docker run --rm -p 3000:3000 --env-file .env.docker synupsis-web
```

## Développement : Dokploy + Pangolin

### Dokploy

1. **Create Application**, source GitHub `synupsis/synupsis-web`, branche `develop`.
2. **Build Type : Dockerfile** (chemin `Dockerfile`, contexte `.`).
3. **Build arguments** : `NUXT_PUBLIC_SUPABASE_URL` et `NUXT_PUBLIC_SUPABASE_KEY` du projet Supabase de dev.
4. **Environment** : toutes les variables du tableau ci-dessus.
5. **Port** : publiez le port du conteneur `3000` sur le NAS (onglet Advanced → Ports), sans redirection de port sur la box : seul Pangolin y accède, depuis le réseau local.
6. **Auto Deploy** : activez-le et ajoutez le webhook de Dokploy au dépôt GitHub, pour redéployer à chaque push sur `develop`.

Isolation, car le serveur tourne chez vous :

- n'exposez **jamais** l'interface de Dokploy par Pangolin ou par la box : accès local ou VPN uniquement ;
- aucun volume ni dossier du NAS monté dans l'application, pas de socket Docker ;
- si la box ou le NAS le permettent, placez le NAS (ou Dokploy) dans un VLAN séparé ;
- tenez à jour le NAS, Dokploy et Pangolin.

### Pangolin

1. Le **site** Newt du NAS ouvre un tunnel sortant vers le serveur Pangolin : aucun port n'est ouvert chez vous.
2. Créez une **ressource HTTP** sur un sous-domaine (par exemple `dev.synupsis.<domaine>`) qui pointe vers `http://<IP locale du NAS>:3000`. Le HTTPS est terminé par Pangolin.
3. Activez l'**authentification** de la ressource (liste d'emails autorisés, SSO ou lien de partage) : seuls vos testeurs voient le site et peuvent lancer des générations.
4. Lancer une génération répond en 20 à 25 s : si Pangolin renvoie un 504 à ce moment, augmentez le délai d'attente de la ressource.

### Supabase (projet de dev)

- **Auth → URL Configuration** : Site URL `https://dev.synupsis.<domaine>` et `https://dev.synupsis.<domaine>/**` dans les Redirect URLs. Les liens de confirmation passent d'abord par l'authentification Pangolin : les testeurs doivent y être autorisés.
- **Emails** : l'envoi intégré est limité à quelques messages par heure ; branchez un SMTP (Resend, par exemple) ou désactivez la confirmation par email pour les tests.
- **Migrations** : `supabase link --project-ref <ref de dev>` puis `supabase db push`. Appliquez une migration en dev avant la prod, et déployez le code qui ne dépend plus d'une règle avant la migration qui la retire.

## Production : Render

1. Service web en **runtime Docker**, branche `main`, plan **Starter** ou plus (le plan Free met le serveur en veille et coupe les générations).
2. Render transmet les variables d'environnement du service comme arguments de build Docker : déclarez-y toutes les variables du tableau, `NUXT_PUBLIC_SUPABASE_URL` et `NUXT_PUBLIC_SUPABASE_KEY` comprises.
3. Installez l'**app GitHub de Render** sur l'organisation `synupsis` : sans elle, un push ne déclenche aucun déploiement.
4. Supabase de prod : mêmes réglages que le dev, avec l'URL publique de Render ou votre domaine.
5. Plafond de dépenses sur le projet OpenAI de prod avant d'ouvrir les inscriptions.

## Vérifier un déploiement

- La page d'accueil et une page série répondent 200.
- Les logs ne contiennent pas « The recap generation worker is off ».
- Une génération lancée, puis la page rafraîchie, reprend au même pourcentage ; elle se termine aussi page fermée.
- Une insertion anonyme dans `show` par l'API REST de Supabase est refusée (`permission denied`).
