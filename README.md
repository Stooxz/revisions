# Mes révisions

Une appli de révision gratuite qui s'installe sur le téléphone : fiches, quiz et cartes recto-verso générés par l'IA Gemini à partir d'un thème, d'un PDF ou d'une photo de cours. Il n'y a ni serveur ni compte : tout reste sur l'appareil.

Adresse : `https://<pseudo>.github.io/revisions/`

## Installer l'appli
- **iPhone (Safari)** : ouvre le lien, touche le bouton Partager, puis « Sur l'écran d'accueil ».
- **Android (Chrome)** : ouvre le lien, menu ⋮, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».
- **Ordinateur (Chrome ou Edge)** : clique sur l'icône « Installer » dans la barre d'adresse.

Une fois installée, l'appli s'ouvre en plein écran. Les révisions déjà créées marchent hors ligne ; il faut internet seulement pour en générer de nouvelles.

## Créer la clé Gemini (gratuite)
1. Va sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey) avec un compte Google.
2. Clique sur « Create API key » et copie la clé.
3. Dans l'appli, ouvre **Réglages → Clé Gemini**, colle la clé, puis touche « Tester ma clé ».

La clé est enregistrée seulement sur le téléphone. Le modèle « Flash » le plus récent est choisi automatiquement. La formule gratuite a des limites : si l'appli affiche « limite gratuite atteinte », il suffit d'attendre quelques minutes.

## Faire une sauvegarde
Les données ne sont que sur l'appareil. Si on efface les données du navigateur ou si on change de téléphone, elles sont perdues sans sauvegarde.
- **Réglages → Exporter ma sauvegarde** télécharge un fichier `.json`. Garde-le en lieu sûr : il contient aussi la clé.
- **Réglages → Importer une sauvegarde**, ou le bouton « J'ai déjà une sauvegarde » au premier lancement, restaure tout.

## Pour le développeur
```
npm install
npm run dev      # http://localhost:5173/revisions/
npm test         # tests de la logique (correction, Leitner, choix du modèle)
npm run build
```
Le déploiement est automatique : chaque push sur `main` lance `.github/workflows/deploy.yml`. À faire une seule fois : **Settings → Pages → Source : GitHub Actions**.

Les matières suggérées reprennent les 3 blocs de compétences du BTS Commerce international (France compétences, fiche RNCP41759) et les enseignements généraux du BTS. On peut les modifier dans le profil.
