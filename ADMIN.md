# Administration EP FAYAK — D1 + Cloudinary

## Fonctionnement

`/admin.html` (ou `/admin`) propose un dashboard FR/AR, la modification des textes et coordonnées, l’édition des 12 services et une galerie photos/vidéos indépendante par service. Les médias peuvent être ajoutés, conservés en brouillon, publiés, légendés dans les deux langues, classés et supprimés. Seules les photos peuvent servir de couverture. Les visiteurs peuvent les agrandir et naviguer au clavier.

Le site et son API restent sur Cloudflare Workers. **Les images et vidéos sont stockées sur Cloudinary ; aucun abonnement R2 n’est nécessaire.** La base D1 `ep-fayak-cms`, déjà créée et liée dans `wrangler.jsonc`, conserve les contenus, métadonnées, sessions et historique. Ses tables actuelles sont réutilisées sans nouvelle migration de schéma.

Le tableau de bord compte des contenus réels, pas des visiteurs inventés. Les trois photos fournies (électricité, chauffage et piscine) restent les premières images de leurs galeries.

## Activer Cloudinary depuis les tableaux de bord

1. Créer un compte Cloudinary avec le plan adapté à l’usage souhaité. Vérifier les limites du plan gratuit (stockage, requêtes et transferts) ; aucun quota illimité n’est promis.
2. Dans le tableau de bord Cloudinary, ouvrir les informations du **Product environment** et les **API Keys**. Identifier **Cloud name**, **API Key** et **API Secret**. Ne pas envoyer les clés dans le chat ou les copier dans GitHub.
3. Dans Cloudflare : **Workers & Pages → st-ep-fayak-sarl → Settings → Variables and Secrets**, ajouter :

| Nom | Type | Valeur à saisir dans Cloudflare |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Text | Cloud name de votre environnement Cloudinary |
| `CLOUDINARY_API_KEY` | Secret | API Key Cloudinary |
| `CLOUDINARY_API_SECRET` | Secret | API Secret Cloudinary |
| `ADMIN_PASSWORD_HASH` | Secret | Dérivé du mot de passe administrateur, voir ci-dessous |

Enregistrer/appliquer ces paramètres au Worker de production et ouvrir `/api/admin/status`. `database`, `storage` et `password` doivent être `true` pour activer la connexion. `storage` signifie que les trois paramètres sont renseignés : une première photo confirme ensuite les droits et la connectivité réels de Cloudinary. Une mauvaise clé produit une erreur explicite sans fausse réussite.

La configuration `keep_vars: true` préserve le Cloud name défini dans le tableau de bord lors des déploiements Git suivants ; les clés restent des secrets Cloudflare. Aucune valeur de clé n’est définie dans le code ou les fichiers publics. Garder le bon Product environment Cloudinary et les mêmes secrets pour retrouver les fichiers téléversés.

Aucun upload preset public/unsigned n’est nécessaire. Ne pas activer un accès public au stockage : le backend effectue des uploads **signés**, de type **authenticated**. Les images initiales versionnées dans le dépôt restent des assets publics ; elles n’ont pas besoin de Cloudinary.

## Mot de passe administrateur

Aucun mot de passe par défaut n’est créé. **Sans terminal** : ouvrir `/admin.html` sur le site HTTPS, déplier « Créer mon mot de passe administrateur », saisir et confirmer un mot de passe de 14 caractères minimum, puis « Préparer mon empreinte » et « Copier la valeur pour Cloudflare ». Le calcul reste dans le navigateur ; ni le mot de passe ni son dérivé ne sont envoyés par cette opération. Coller la valeur copiée directement dans le Secret `ADMIN_PASSWORD_HASH` du Worker dans Cloudflare, enregistrer/appliquer et cliquer « Vérifier à nouveau ». Pour se connecter, utiliser le mot de passe choisi, pas la valeur PBKDF2. Ne partager ni la valeur copiée ni le mot de passe dans le chat. L’outil ne permet pas de définir le secret côté serveur : seules les personnes ayant accès au compte Cloudflare peuvent le faire.

En cas de mot de passe incorrect ou oublié, la même préparation locale est disponible sur la page de connexion via « Réinitialiser mon mot de passe ». Elle ne modifie pas le serveur et ne contourne jamais la connexion : il faut encore remplacer le secret dans le compte Cloudflare avec **Rotate**, enregistrer/appliquer et recharger le site. Ne pas coller l’empreinte dans le champ de connexion ; saisir le mot de passe choisi.

**Alternative en terminal**, depuis une machine personnelle connectée au compte Cloudflare :

```sh
npm ci
npx wrangler login
npm run admin:password
```

La saisie du mot de passe (14 à 256 caractères) est masquée ; le script calcule un dérivé PBKDF2 SHA-256 avec sel aléatoire et l’envoie au secret `ADMIN_PASSWORD_HASH`, sans afficher ou enregistrer le mot de passe dans le dépôt. Ne pas saisir un mot de passe en clair dans ce secret à la place du dérivé. Le secret ne doit pas devenir une variable publique dans `wrangler.jsonc` ou le JavaScript du navigateur.

Les sessions utilisent des jetons aléatoires dont seul le hash est stocké en D1 : cookie HttpOnly / Secure / SameSite=Strict, expiration 8 heures, révocation à la déconnexion et à la rotation du mot de passe. Les mutations vérifient Origin et un en-tête dédié. Les connexions sont limitées à 5 tentatives par IP sur 15 minutes.

## Photos, confidentialité et suppression

- Images JPG/PNG/WebP : 8 Mo maximum. Vidéos MP4/WebM : 20 Mo maximum. Jusqu’à 10 fichiers par envoi. Contrôle du type de fichier et limite de lecture côté serveur ; Cloudinary décode les médias via la ressource image ou video correspondante. Aucun SVG ou fichier arbitraire.
- Le Worker transmet les fichiers à l’API Cloudinary via HTTPS et une signature serveur. La clé secrète n’est jamais communiquée au navigateur.
- Les brouillons et originaux Cloudinary sont de type `authenticated`. L’URL publique du site reste `/media/service/identifiant.ext` ; le Worker contrôle la publication en D1 et la session pour les brouillons.
- La livraison utilise l’API officielle `private_download_url` de Cloudinary, avec une signature valable 60 secondes. Cette URL reste côté serveur ; le Worker transmet les octets au navigateur sans redirection et sans exposer une URL permanente du fournisseur. Pas de requête Cloudinary depuis le navigateur, pas de CORS à configurer.
- Les réponses média du site sont `no-store` pour respecter rapidement les changements de publication. Les téléchargements Cloudinary, le transfert et les appels API comptent dans les quotas de votre offre.
- La suppression est signée et confirmée par Cloudinary avant le retrait de la ligne D1. Si le fournisseur échoue, la photo reste dans la liste et l’administrateur peut réessayer. Un échec D1 après upload déclenche une suppression compensatoire du fichier.
- Les photos initiales dans `assets/services` restent les couvertures d’origine : leur retrait de la galerie ne supprime pas les fichiers historiques dans GitHub. Conserver les originaux avant toute suppression. Un fichier déjà téléchargé par un visiteur ne peut pas être révoqué rétroactivement.

## Vidéos dans les galeries

Dans « Photos & vidéos », sélectionner un service, choisir les fichiers MP4/WebM et renseigner les légendes FR/AR. Les mêmes commandes de brouillon, publication, ordre et suppression s’appliquent. La galerie publique affiche un bouton de lecture ; le lecteur intégré dispose de commandes et s’arrête quand on ferme la fenêtre ou change de média. Les miniatures proches de la zone visible chargent une courte portion du média pour extraire une vraie image (autour de la première demi-seconde), puis affichent ce poster local sans lecture automatique. La lecture du fichier reste arrêtée ; la vidéo complète s’ouvre à la demande. Les posters sont recalculés depuis les vidéos existantes, sans nouvelle migration ou téléversement.

Préférer MP4 avec codec H.264 (et AAC si audio) pour une compatibilité large. WebM dépend aussi des codecs pris en charge par le navigateur. La limite de 20 Mo côté site s’ajoute aux quotas et limites du plan Cloudinary ; le traitement, le stockage et la livraison vidéo consomment les crédits de l’offre. Les vidéos restent de type authenticated et les clés ne vont pas dans le navigateur. La livraison transmet les requêtes HTTP Range et les réponses partielles du fournisseur pour permettre le déplacement dans la vidéo.

**Aucun ALTER TABLE ni nouvelle migration D1 n’est nécessaire.** Le type du média est déterminé à partir de son extension validée dans la référence stockée (`.mp4` ou `.webm`), et le champ existant `object_key` reste compatible avec toutes les images déjà ajoutées. Une vidéo ne peut pas être choisie comme couverture d’image d’un service.

## D1 et déploiement

La base de production `ep-fayak-cms` est déjà liée dans le dépôt et les tables ont été créées depuis la console Cloudflare. Ne pas recréer la base et ne pas supprimer les tables. Si l’on démarre sur un autre compte, il faut lier une base réelle sous le nom `DB` et appliquer `migrations/0001_admin.sql`.

Cloudflare Builds : branche **main**, commande de build du tableau de bord vide, commande de déploiement **`npx wrangler deploy`**, sans `--assets .`. Wrangler lance le build et ne publie que `dist/`. Les paramètres locaux de `env.local` ne doivent jamais remplacer le binding D1 de production.

La bascule depuis R2 ne change pas le schéma D1 : les nouvelles références Cloudinary sont préfixées `cloudinary:` dans `object_key`. Aucun fichier R2 réel n’a été fourni à cette intégration. Si une ancienne installation contient effectivement des fichiers R2, les sauvegarder et les migrer explicitement avant de retirer cet ancien stockage ; ils ne sont pas supprimés ni réinterprétés comme fichiers Cloudinary.

## Vérifier l’activation

1. Ouvrir `/admin.html` et se connecter une fois les trois prérequis affichés comme configurés.
2. Ajouter une photo en brouillon et vérifier qu’elle est absente de la page publique dans une fenêtre privée.
3. La publier et vérifier son affichage/agrandissement en FR et AR, puis la sélectionner comme couverture si souhaité.
4. Masquer la photo et vérifier que son URL `/media/…` n’est plus accessible sans connexion.
5. Vérifier la suppression d’une photo de test et la déconnexion. Les nouvelles photos et textes ne nécessitent ensuite aucun push GitHub ni redéploiement.

## Développement et tests

```sh
npm ci
npm run db:local
npm run admin:password -- --local
npm run dev
```

La base D1 locale persiste dans `.wrangler/`. Les variables locales Cloudinary doivent être ajoutées dans `.dev.vars.local` **en dehors de Git**, sans écraser son contenu existant. Une utilisation interactive avec de vrais identifiants téléverse de vraies images Cloudinary même si D1 est local : préférer un Product environment séparé pour le développement. Les tâches cloud sont isolées ; utiliser le checkout existant sans créer de worktree.

```sh
npm run build
npm test
```

La suite utilise un vrai D1 local et Chromium, avec un **simulateur de protocole Cloudinary isolé** : vérification indépendante des signatures d’upload image/vidéo, téléchargement privé, plages HTTP et suppression ; authentification, CSRF, limites, publication, erreurs fournisseur, persistance des métadonnées après redémarrage, XSS et interfaces FR/AR desktop/mobile. Des clips MP4/H.264 et WebM/VP9 réellement lisibles, générés uniquement pour les tests, vérifient la lecture, le déplacement dans le clip, la fermeture et l’ajout de vidéo depuis le dashboard. Les 32 contrôles publics existants sont également exécutés. Aucun compte, secret ou fichier Cloudinary réel n’est utilisé par ces tests ; ils ne constituent pas une validation du compte de production. Playwright et Chromium sont déjà disponibles dans l’environnement de développement.

`npm run dev:static` ne fournit pas l’API admin. Le pré-rendu français se fait avec `node scripts/prerender.cjs` sur un serveur local utilisant le contenu d’origine ; ne pas pré-rendre une base de production dans Git. Le frontend charge les contenus enregistrés à chaque ouverture de page.

Conserver les photos originales, sauvegarder D1 et prévoir une sauvegarde des médias adaptée aux options Cloudinary du compte. Garder les secrets exclusivement dans le gestionnaire Cloudflare et renouveler toute clé exposée accidentellement.
