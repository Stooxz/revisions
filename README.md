# Mes révisions

Une appli de révision gratuite qui s'installe sur le téléphone : fiches, quiz et cartes recto-verso générés par l'IA Claude (Anthropic) à partir d'un thème, d'un PDF ou d'une photo de cours. Il n'y a ni serveur ni compte : tout reste sur l'appareil.

Adresse : https://stooxz.github.io/revisions/

## Installer l'appli
- **iPhone (Safari)** : ouvre le lien, touche le bouton Partager, puis « Sur l'écran d'accueil ».
- **Android (Chrome)** : ouvre le lien, menu ⋮, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».
- **Ordinateur (Chrome ou Edge)** : clique sur l'icône « Installer » dans la barre d'adresse.

Une fois installée, l'appli s'ouvre en plein écran. Les révisions déjà créées marchent hors ligne ; il faut internet seulement pour en générer de nouvelles.

## Créer la clé Claude
L'API Claude est payante à l'usage (environ quelques centimes par révision avec Opus 5.5, bien moins avec Sonnet ou Haiku). Elle est distincte d'un abonnement Claude Pro, qui ne fonctionne pas ici.
1. Va sur [console.anthropic.com](https://console.anthropic.com/settings/keys) et connecte-toi (ou crée un compte).
2. Dans **Billing**, ajoute un peu de crédit (quelques euros suffisent pour longtemps). On peut aussi y fixer une limite de dépense.
3. Dans **API keys**, clique sur « Create Key » et copie la clé (elle commence par `sk-ant-`).
4. Dans l'appli, ouvre **Réglages → Clé Claude**, colle la clé, puis touche « Tester ma clé ».

La clé est enregistrée seulement sur le téléphone et n'est envoyée qu'à Anthropic. Le modèle se choisit dans les Réglages : Claude Opus 5.5 par défaut, Sonnet 5.5 ou Haiku 5.5 pour aller plus vite et payer moins.

## Faire une sauvegarde
Les données ne sont que sur l'appareil. Si on efface les données du navigateur ou si on change de téléphone, elles sont perdues sans sauvegarde.
- **Réglages → Exporter ma sauvegarde** télécharge un fichier `.json`. Garde-le en lieu sûr : il contient aussi la clé.
- **Réglages → Importer une sauvegarde**, ou le bouton « J'ai déjà une sauvegarde » au premier lancement, restaure tout.

## Pour le développeur
```
npm install
npm run dev      # http://localhost:5173/revisions/
npm test         # tests de la logique (correction, Leitner)
npm run build
```
Le déploiement est automatique : chaque push sur `main` lance `.github/workflows/deploy.yml`. À faire une seule fois : **Settings → Pages → Source : GitHub Actions**.

Les matières suggérées reprennent les 3 blocs de compétences du BTS Commerce international (France compétences, fiche RNCP41759) et les enseignements généraux du BTS. On peut les modifier dans le profil.
