# Demandes de devis envoyées directement par email

Le navigateur poste le formulaire et la pièce jointe vers `/api/quotes`. Le Worker valide la demande et l’envoie à Brevo, qui la transmet à **EP.FAYAK@GMAIL.COM**. Le client n’a plus besoin d’ouvrir sa messagerie. Le champ Reply-To contient son adresse ; « Répondre » dans Gmail répond au client.

## Activation sur le compte de la société

1. Créer/configurer un compte Brevo et activer son service d’emails transactionnels. Vérifier les quotas et conditions de l’offre choisie ; aucune limite illimitée ni gratuité permanente n’est promise.
2. Ajouter et **confirmer un expéditeur autorisé** dans Brevo (rubrique Senders / Expéditeurs). Utiliser l’adresse de la société si Brevo l’autorise et qu’elle est validée. Si Brevo demande l’authentification d’un domaine, suivre ses étapes ou choisir un expéditeur approuvé par le service. L’adresse de réception reste le Gmail de la société, indépendamment de l’expéditeur.
3. Générer une clé **API v3** dans Brevo (SMTP & API → API Keys). Ne pas confondre avec une clé SMTP.
4. Dans **Cloudflare → Workers & Pages → st-ep-fayak-sarl → Settings → Variables and Secrets**, ajouter :

| Nom | Type | Valeur |
| --- | --- | --- |
| `BREVO_API_KEY` | **Secret** | Clé API v3 Brevo ; ne jamais la mettre dans GitHub ou le chat |
| `BREVO_SENDER_EMAIL` | Text | Adresse de l’expéditeur confirmé dans Brevo |

L’expéditeur par défaut est `EP.FAYAK@GMAIL.COM` si `BREVO_SENDER_EMAIL` n’est pas renseigné ; cette adresse doit tout de même être autorisée dans Brevo. Le destinataire est fixé côté serveur à `EP.FAYAK@GMAIL.COM`. Le paramètre serveur optionnel `QUOTE_TO_EMAIL` permet au propriétaire de changer la réception ; aucun champ du formulaire public ne peut changer cette destination. Modifier l’email de contact dans le CMS ne modifie pas automatiquement l’adresse de réception des devis.

Enregistrer/appliquer les paramètres sur le Worker, puis vérifier « Envoi des demandes de devis » dans le dashboard. Ce statut indique que les paramètres sont configurés, pas que Brevo a validé le compte. Envoyer ensuite une demande de test volontaire depuis le site et vérifier la boîte Gmail, les indésirables et les logs transactionnels de Brevo. Une réponse API positive signifie que le fournisseur a accepté l’email ; elle ne prouve pas à elle seule son arrivée dans la boîte de réception.

Aucun ajout de table D1 n’est nécessaire : les compteurs et références techniques utilisent les tables existantes. Les nouveaux déploiements conservent les secrets Cloudflare et les variables définies dans le tableau de bord (`keep_vars: true`). Le Worker tourne sur la même origine ; aucun CORS public à ouvrir.

## Fonctionnement et limites

- Nom, téléphone, email, ville, un des 12 services et description obligatoires ; consentement requis. Les noms de services sont retrouvés côté serveur, pas acceptés comme destinataires libres.
- PDF, JPG ou PNG jusqu’à **10 Mo** ; le serveur vérifie la taille, la signature du fichier et son extension. Le fichier est joint à l’email en base64. Les fichiers ne sont ni publiés dans Cloudinary ni conservés dans D1. Les pièces jointes restent soumises aux limites du fournisseur et de Gmail.
- Origin et en-tête dédiés, champ piège antispam et limite de 5 tentatives par IP sur 15 minutes. Les compteurs n’utilisent que des empreintes d’IP temporaires ; aucune nouvelle mesure de trafic ou cookie public.
- Un identifiant par demande, une empreinte du contenu et le `idempotencyKey` Brevo évitent les doubles clics/réessais identiques. Les références techniques sont nettoyées lors des nouvelles soumissions après 48 heures ; aucun nom, email, texte ou fichier client n’est enregistré dans ces références.
- Le formulaire se vide uniquement après confirmation d’acceptation par le fournisseur. En cas de configuration manquante, refus ou limite, il garde ses champs et affiche une erreur dans la langue choisie.
- Si la connexion s’interrompt au moment où le fournisseur a pu accepter l’email, le site affiche une confirmation impossible et empêche un renvoi automatique identique. Le client est invité à contacter la société pour éviter un doublon.
- Le message inclut les coordonnées, le service, le projet et une référence ; les contenus HTML sont échappés. L’API Brevo est appelée uniquement depuis le serveur avec son secret, jamais depuis le navigateur.
- La réception et conservation des emails et pièces jointes dans Brevo/Gmail sont gérées par la société selon ses besoins et sa politique de confidentialité.

Sans clé et expéditeur validés, l’envoi direct n’est pas activé. Les liens de contact téléphone/email/WhatsApp restent utilisables ; le site ne simule pas une réussite ni une livraison.

## Validation

`npm run build && npm test` vérifie un vrai D1 local avec un **simulateur Brevo isolé** : destinataire imposé, Reply-To, pièce jointe exacte, échappement HTML, consentement, champs, origine, doublons, erreurs fournisseur, limites et parcours navigateur FR/AR. Aucun email réel n’est envoyé par les tests. Le compte Brevo et la livraison réelle nécessitent la validation d’activation décrite ci-dessus.

## Contrôler la version publiée

Le site construit ajoute une empreinte de contenu aux URLs JavaScript/CSS pour actualiser les fichiers navigateur après une modification. `/version.json` expose la révision du build et l’empreinte des assets, sans secrets. `/api/quotes/status` est une vérification en lecture seule : `mode: "direct"`, `destination` et `configured`. `configured: true` indique la présence des tables et paramètres nécessaires, pas l’acceptation du compte par Brevo ni une preuve de livraison Gmail. Ces deux routes n’envoient aucun email. Si le site affiche encore « Préparer ma demande par email », vérifier le deployment actif de Cloudflare et sa révision Git, puis recharger la page sans cache.
