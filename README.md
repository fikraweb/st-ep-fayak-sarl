# Sté EP FAYAK SARL — site corporate FR/AR

Site multipage HTML/CSS/JavaScript, avec Worker Cloudflare, espace administrateur, D1 et galeries Cloudinary. Pages : accueil, entreprise, 12 services et leurs détails/galeries, portfolio illustratif, demande de devis, contact, mentions légales et administration.

## Développement

Node 22+ et npm ; depuis le checkout existant (ne pas créer de worktree) :

```sh
npm ci
npm run db:local
npm run admin:password -- --local
npm run dev
```

Le serveur tourne sur le port 3000. Les bindings de `env.local` sont uniquement locaux. Pour simplement inspecter le site sans backend : `npm run dev:static`. Les tâches cloud sont déjà isolées ; les fichiers utilisateurs existants et secrets locaux doivent être conservés.

## Administration et galeries

Voir **[ADMIN.md](ADMIN.md)** pour l’activation, les bindings, le mot de passe sécurisé, les tests et les sauvegardes. Accès : `/admin.html`. Les modifications de contenu et les nouvelles photos sont persistées en D1/Cloudinary et s’affichent au rechargement du site, sans nouveau déploiement.

Avant activation, le site public reste utilisable avec le contenu versionné et les trois photos de services fournies. La page admin signale la configuration manquante ; il n’y a pas de backend fictif ni de mot de passe par défaut. Le tableau de bord affiche des nombres de contenus réels, pas de trafic inventé.

## Cloudflare

Le fichier `wrangler.jsonc` définit le Worker `st-ep-fayak-sarl`. Cloudflare Builds : dépôt `fikraweb/st-ep-fayak-sarl`, production `main`, commande de build du tableau de bord vide, commande de déploiement **`npx wrangler deploy`**. Ne pas utiliser `--assets .`. Wrangler lance `npm run build`, qui copie uniquement les fichiers publics dans `dist/`. Les scripts, tests, sources Worker, fichiers Git et secrets ne sont pas des assets publics.

D1 (binding `DB`) est lié à la base créée pour ce site. Les paramètres `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` et le secret `ADMIN_PASSWORD_HASH` doivent être configurés dans les paramètres du Worker pour activer l’administration. Les clés API sont des secrets, pas du code public. Aucun abonnement R2 n’est nécessaire. Les quotas Cloudinary dépendent du plan choisi. `keep_vars: true` préserve le Cloud name saisi dans le tableau de bord lors des prochains déploiements. Un push réussi ne prouve pas la réussite d’un déploiement : vérifier son statut dans Cloudflare.

## Contenu et identité

Le contenu initial est dans `assets/app.js`, les métadonnées de services/galeries initiales dans `server/defaults.mjs`. Le CMS remplace ces valeurs lorsqu’un contenu est enregistré. Le logo du document fourni a été nettoyé, rendu transparent et conservé dans ses couleurs rouge et violet. Les visuels d’illustration sont générés par IA ; les trois photos d’électricité, chauffage central et piscine ont été fournies pour leurs services. La galerie générale reste illustrative. Aucun client, projet, date ou ancienneté n’est inventé.

Polices locales DM Sans, Manrope, Noto Sans Arabic (licences OFL dans `assets/fonts`). Pas de publicité ni de mesure de trafic. L’administration utilise un cookie de session strictement nécessaire. Les services externes Maps/WhatsApp s’ouvrent uniquement depuis leurs liens. La localisation Maps reste une recherche indicative.

## Demande de devis

Le formulaire prépare un email : le visiteur doit ouvrir sa messagerie, envoyer le message et joindre son fichier manuellement. Aucun envoi automatique ni stockage serveur des devis n’est activé. Pour une réception directe, configurer `quoteEndpoint` dans `assets/config.js` avec une API HTTPS acceptant multipart/form-data : `name`, `phone`, `email`, `city`, `service`, `description`, `attachment`, `consent`. Côté API : destinataire, validation, taille 10 Mo, CORS, antispam et rétention. Aucun secret ne doit être placé dans le frontend. Tester la réception réelle avant publication de cette option. Les coordonnées administrables actualisent la destination du mailto.

## SEO et validations

Le domaine officiel doit être confirmé : `SITE_URL=https://DOMAINE-OFFICIEL node scripts/seo.mjs` génère sitemap.xml et robots.txt. Le sitemap initial est vide, sans domaine inventé. Compléter l’hébergeur dans les mentions légales et confirmer les identifiants officiels avant publication. Titres et descriptions sont bilingues. Après une modification du frontend, `node scripts/prerender.cjs` (serveur local actif, Playwright requis) actualise le HTML français de départ ; ne pas utiliser une base de production pour pré-rendre des contenus dans Git.

```sh
npm run build
npm test
```

La suite admin utilise un vrai D1 local, Chromium et un simulateur isolé du protocole signé Cloudinary (aucun compte de production) ; elle inclut les contrôles publics FR/AR desktop/mobile, formulaires, navigation et upload/publication de photos. Les photos originales et les données de production ne sont jamais modifiées par les tests. Playwright et Chromium sont déjà présents dans cet environnement ; sur une nouvelle machine, installer ces outils pour les contrôles navigateur.
