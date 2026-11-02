# Administration EP FAYAK

## Capacités

`/admin.html` (ou `/admin`) propose un tableau de bord FR/AR, la modification des informations générales, coordonnées, titres et descriptions, l’édition des 12 services, et la gestion d’une galerie indépendante par service. Les photos peuvent être ajoutées (jusqu’à 10 par envoi), conservées en brouillon, publiées, légendées en deux langues, classées, utilisées comme couverture et supprimées. Les visiteurs peuvent agrandir les images, naviguer au clavier et fermer avec Échap.

Le tableau de bord affiche des données réelles : nombre de services, photos publiées/brouillons, taille des fichiers ajoutés, état des bindings et dernières modifications. Il n’invente pas de visiteurs ou de trafic. Les trois photographies fournies (électricité, chauffage et piscine) démarrent les galeries correspondantes. Aucun projet, date, client ou lieu n’est inventé.

## Architecture

- Worker `server/worker.mjs` : API même origine, authentification, publication et service des images.
- D1, binding **DB** : textes, services, métadonnées des photos, sessions et historique.
- R2 privé, binding **PHOTOS** : fichiers téléversés. Aucun accès public R2 ni CORS R2 à activer ; les fichiers passent par `/media/…` et seuls les éléments publiés sont visibles sans connexion.
- Secret Worker **ADMIN_PASSWORD_HASH** : dérivé PBKDF2 SHA-256 (100 000 itérations, sel aléatoire) ; jamais de mot de passe dans le code ou le navigateur.
- Cookie de session HttpOnly / Secure / SameSite=Strict, expiration 8 h, révocation à la déconnexion. Une modification du secret invalide les sessions existantes.
- Mutations protégées par session, contrôle Origin et en-tête dédié ; limitation des connexions (5 tentatives par IP / 15 minutes). SQL paramétré ; textes rendus sans HTML utilisateur.
- Photos JPG/PNG/WebP seulement, signatures de fichiers vérifiées ; 8 Mo maximum, lecture du corps limitée côté serveur. Pas de SVG ou de fichiers arbitraires. Les images ne sont pas redimensionnées automatiquement ; préparer des photos raisonnables pour le web.

Le site public reste fonctionnel et affiche les galeries initiales tant que le backend n’est pas activé. La page admin indique les éléments manquants et n’accepte aucune connexion fictive. Une indisponibilité DB conduit à l’affichage du contenu versionné d’origine côté public ; les écritures échouent explicitement.

## Activation initiale sur votre compte Cloudflare

Ces opérations créent des ressources dans **votre compte**. R2 doit être activé dans Cloudflare ; consulter les tarifs/quotas de votre offre. Ne partagez aucun mot de passe ou token dans le chat. Le dépôt est prêt, mais aucun compte Cloudflare ni secret de production n’est fourni par ce code.

Dans un terminal où vous avez accès à votre compte Cloudflare, depuis le checkout :

```sh
npm ci
npx wrangler login
npx wrangler d1 create ep-fayak-cms --location weur --update-config --binding DB
npx wrangler r2 bucket create ep-fayak-photos --location weur --update-config --binding PHOTOS
npx wrangler d1 migrations apply ep-fayak-cms --remote
npm run admin:password
```

`wrangler login` se fait dans votre navigateur sur votre machine, pas en échangeant un token ici. Si la base ou le bucket existent déjà, réutilisez-les ; ajoutez leurs bindings dans la configuration ci-dessous au lieu de recréer les ressources. Après création, vérifiez que les bindings ont été ajoutés **au niveau principal** de `wrangler.jsonc`, et pas à `env.local` :

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "ep-fayak-cms",
  "database_id": "UUID-REEL-FOURNI-PAR-CLOUDFLARE",
  "migrations_dir": "migrations"
}],
"r2_buckets": [{
  "binding": "PHOTOS",
  "bucket_name": "ep-fayak-photos"
}]
```

Le UUID D1 est un identifiant de ressource, pas un mot de passe. Les valeurs de `env.local` ne s’utilisent jamais en production. `npm run admin:password` demande deux fois un mot de passe fort de 14 caractères minimum, sans écho, et envoie uniquement son dérivé au secret Cloudflare via Wrangler. Aucun compte ou mot de passe par défaut n’existe. Aucun besoin de `SESSION_SECRET` supplémentaire : les sessions utilisent des jetons aléatoires dont seul le hash est conservé en D1.

Enregistrez ensuite **uniquement la configuration sans secret** dans GitHub et poussez-la sur main. Cloudflare Builds doit utiliser :

- Branche : `main`.
- Commande de build du tableau de bord : vide (la configuration Wrangler lance le build).
- Commande de déploiement : **`npx wrangler deploy`**, sans `--assets .`.
- Le Worker garde le nom `st-ep-fayak-sarl` et sert uniquement le dossier `dist`.

Si vous préférez déployer directement depuis le terminal après activation : `npx wrangler deploy`. Les migrations de la base doivent être appliquées **avant** l’utilisation de l’administration. Les migrations futures sont additives ; ne supprimez pas les tables pour mettre à jour le site.

## Vérifier après activation

1. Ouvrir `/admin.html` : les trois prérequis doivent être actifs ; se connecter avec le mot de passe choisi.
2. Ajouter une photo en brouillon à un service ; vérifier qu’elle est absente de la page publique dans une fenêtre privée.
3. La publier et vérifier son affichage/agrandissement sur `service.html?id=…&lang=fr` et `lang=ar`.
4. Enregistrer un texte, recharger la page publique et vérifier sa mise à jour.
5. Se déconnecter ; l’API admin doit refuser l’accès. Les mises à jour ultérieures des contenus et photos ne nécessitent plus de push GitHub ni de redéploiement.

Les anciennes photos versionnées dans `assets/services` restent des assets publics et couvertures d’origine : leur suppression du catalogue retire la vignette de la galerie, pas le fichier historique dans GitHub. La suppression d’une photo téléversée supprime aussi son objet R2 ; gardez une copie originale avant suppression. Un fichier déjà téléchargé par un visiteur ne peut pas être révoqué rétroactivement.

## Développement et tests locaux

```sh
npm ci
npm run db:local
npm run admin:password -- --local
npm run dev
```

La base et le bucket sont simulés localement par le runtime Cloudflare et persistent dans `.wrangler/`. Le secret local est écrit dans `.dev.vars.local` ignoré par Git (le script refuse d’écraser un fichier existant). Les données locales ne sont pas les données de production. Chaque tâche cloud est déjà isolée : utiliser le checkout existant, sans créer de worktree.

```sh
npm run build
npm test
```

La suite utilise les vrais moteurs locaux D1/R2 et Chromium. Elle vérifie les connexions, cookies, CSRF, throttling, textes, fichiers invalides, confidentialité des brouillons, publication/couverture, navigation des galeries, upload depuis le dashboard, XSS, FR/AR et mobile, conservation après redémarrage, suppression et déconnexion. Puis elle exécute les contrôles publics existants. Aucun envoi ou secret réel de production n’est utilisé. Playwright et `/usr/bin/chromium` sont disponibles dans l’environnement préparé ; sur une autre machine, les installer avant les tests.

`npm run dev:static` permet seulement d’inspecter les pages statiques ; l’administration nécessite `npm run dev` et ses bindings locaux. Après modification du frontend public, le pré-rendu français peut être actualisé avec `node scripts/prerender.cjs` quand le serveur local est lancé. Ne pré-rendez pas une base de production dans les fichiers Git : le pré-rendu doit utiliser le contenu local d’origine. Les données récentes sont chargées à l’ouverture de chaque page.

## Sauvegarde et maintenance

Conserver les originaux des photos. Utiliser les fonctions de sauvegarde/export D1 du compte et une politique de sauvegarde R2 adaptée. La suppression depuis la galerie est définitive pour les fichiers R2. La rotation du mot de passe se fait via `npm run admin:password`, puis le secret doit rester présent dans le Worker lors des prochains déploiements. Le secret n’est jamais un champ `vars` de wrangler.jsonc.
