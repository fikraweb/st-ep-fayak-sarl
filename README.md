# Sté EP FAYAK SARL — site corporate

Site statique multipage français/arabe, sans dépendances de production. HTML sémantique, CSS responsive et JavaScript natif. Aucun npm install nécessaire.

## Démarrer

Depuis ce dépôt : `npm run dev`, puis ouvrir le port 3000. Python 3 et Node 18+ suffisent. Le serveur Python est uniquement destiné au développement ; publier les fichiers sur un hébergeur statique HTTPS.

Pages : accueil, entreprise, 12 services et leurs détails, galerie filtrable, devis, contact, mentions légales. `?lang=ar` active l’arabe et le RTL, `?lang=fr` le français. Les liens conservent la langue. Aucun framework ou changement de stack existante (le dépôt initial ne contenait qu’un README).

## Contenu et identité

Le contenu bilingue et les 12 services sont centralisés dans `assets/app.js`. Styles dans `assets/style.css`. Logo issu du PDF commercial fourni, nettoyé pour retirer le trait noir parasite au-dessus du monogramme EF et agrandi dans l’en-tête et le pied de page. Les visuels locaux WebP sont des illustrations générées par IA, sans aucune prétention de représenter les réalisations de l’entreprise. Remplacer la galerie uniquement avec des photos et références autorisées. La planche d’illustrations est cadrée par CSS en 6 vignettes ; aucun chargement d’image externe.

Polices libres locales DM Sans, Manrope et Noto Sans Arabic ; licences OFL incluses dans `assets/fonts`. Aucun tracking ni service tiers automatiquement chargé. Google Maps et WhatsApp ne s’ouvrent que via leurs liens. L’adresse est une recherche indicative, pas un emplacement précis certifié.

## Réception des demandes de devis

Par défaut, le formulaire valide les champs, prépare un lien `mailto:` et ouvre la messagerie du visiteur. **Le visiteur doit envoyer le message et joindre son fichier manuellement.** Aucune confirmation de réception fictive, aucun stockage ou backend intégré. Les coordonnées restent dans le formulaire en cas d’échec API.

Pour un envoi direct, créer un point de réception HTTPS (API ou service acceptant multipart/form-data et les pièces jointes), puis renseigner `quoteEndpoint` dans `assets/config.js`. Il doit accepter `name`, `phone`, `email`, `city`, `service`, `description`, `attachment`, `consent`, autoriser l’origine du site (CORS), et renvoyer une réponse HTTP 2xx uniquement après réception réelle. Configurer côté service le destinataire EP.FAYAK@GMAIL.COM, la validation, la limite de fichiers de 10 Mo, la protection antispam, les types autorisés, la rétention et les notifications. Ne placer aucun secret dans le frontend. Tester une demande réelle et la réception du fichier avant publication. Le navigateur bloque les fichiers > 10 Mo ; le serveur doit aussi les valider.

## SEO et publication

Les pages ont des titres, descriptions et Open Graph traduits. Pour les robots sans JavaScript, exécuter le pré-rendu après modification du contenu : `node scripts/prerender.cjs` (serveur actif sur le port 3000 ; Playwright requis). Le HTML français rendu reste présent avant hydratation et l’arabe est activé via la langue demandée.

Le domaine officiel n’a pas été fourni : aucun domaine n’est inventé. Le `sitemap.xml` initial est volontairement vide. **Avant publication**, exécuter `SITE_URL=https://DOMAINE-OFFICIEL node scripts/seo.mjs` pour générer les 38 URL bilingues et les liens hreflang, ainsi que robots.txt. Configurer également l’URL absolue de l’image Open Graph sur l’hébergeur. Fournir le nom et les coordonnées de l’hébergeur dans les mentions légales et confirmer les identifiants administratifs avec la société. Ils sont issus des informations fournies et concordent avec le PDF, sans vérification dans un registre officiel.

## Validation

`npm test` utilise Playwright et `/usr/bin/chromium` (déjà présents dans cet environnement ; à installer séparément sur une autre machine). Vérifie les 8 pages en FR/AR sur desktop et mobile, le débordement horizontal, les filtres, l’ouverture de l’email, le menu et le changement de langue. Les commandes ne transmettent aucune demande réelle. Vérification de syntaxe : `node --check assets/app.js`.

Aucun secret requis pour développer. Ne pas créer de worktree : travailler dans le checkout isolé existant.

## Cloudflare Workers — déploiement automatique depuis GitHub

Le fichier `wrangler.jsonc` configure le Worker `st-ep-fayak-sarl` et ses fichiers statiques. Dans Cloudflare : dépôt `fikraweb/st-ep-fayak-sarl`, branche de production `main`, builds activés, répertoire racine du dépôt, commande de build du tableau de bord vide et commande de déploiement **`npx wrangler deploy`**. Wrangler exécute automatiquement `npm run build`, qui prépare uniquement les fichiers publics dans `dist/`. Les scripts, tests et fichiers Git ne sont pas publiés.

Retirer une éventuelle option `--assets .` saisie précédemment : elle remplace le répertoire défini par la configuration. Après connexion GitHub et sauvegarde de ces réglages, chaque push sur main déclenche le build Cloudflare. Vérifier le statut du deployment et son commit dans le tableau de bord ; un push Git réussi ne prouve pas que Cloudflare a publié la version.
