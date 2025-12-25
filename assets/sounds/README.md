# 🔊 Sons d'Effets - Instructions

Ce dossier contient les sons d'effets pour l'application "Mon Monde Magique".

## 📁 Fichiers Requis

Les fichiers suivants sont utilisés par l'application :

1. **`pop.mp3`** - Son de clic/pop pour les boutons (100-200ms)
2. **`success.mp3`** - Son de succès/victoire pour les bonnes réponses (500ms-1s)
3. **`wrong.mp3`** - Son d'erreur pour les mauvaises réponses (300-500ms)
4. **`win.mp3`** - Son de victoire finale pour un niveau terminé (1-2s)

## 🎵 Sources de Sons Gratuits

### Option 1 : Freesound.org (Recommandé)

Visitez [Freesound.org](https://freesound.org) et cherchez :

- **Pop** : "button click", "pop sound", "ui click"
- **Success** : "success sound", "ding", "chime", "positive"
- **Wrong** : "error sound", "buzz", "wrong answer"
- **Win** : "fanfare", "victory", "win sound", "celebration"

**Filtres recommandés** :
- Licence : Creative Commons 0 (CC0 - domaine public)
- Durée : < 2 secondes
- Format : MP3 ou WAV

### Option 2 : Zapsplat.com

[ZapSplat](https://www.zapsplat.com) offre des sons gratuits pour usage commercial :

- Section : Game Sounds → UI
- Téléchargez en MP3, 44.1kHz

### Option 3 : Mixkit.co

[Mixkit Sound Effects](https://mixkit.co/free-sound-effects/) :

- Section : Game Sounds
- Tous les sons sont gratuits et libres de droits

## 🛠️ Générer Vos Propres Sons

### Avec Audacity (Gratuit)

1. Téléchargez [Audacity](https://www.audacityteam.org/)
2. Générez des tons :
   - **Pop** : Generate → Tone → Sine, 1000Hz, 0.1s
   - **Success** : Generate → Tone → Chirp, 500→1000Hz, 0.5s
   - **Wrong** : Generate → Tone → Square, 200Hz, 0.3s
   - **Win** : Combine plusieurs notes ascendantes
3. Exportez en MP3 (16-bit, 44.1kHz)

### Avec GarageBand (Mac)

1. Ouvrez GarageBand
2. Créez un projet vide
3. Ajoutez des instruments logiciels :
   - Utilisez des sons de synthé pour des effets joyeux
   - Ajoutez de la réverbération pour un effet magique
4. Exportez chaque son en MP3

## 📝 Spécifications Techniques

Pour une performance optimale :

- **Format** : MP3 (recommandé) ou WAV
- **Sample Rate** : 44.1 kHz ou 48 kHz
- **Bitrate** : 128 kbps minimum (MP3)
- **Durée** : 
  - Pop : 0.1-0.2s
  - Success : 0.5-1s
  - Wrong : 0.3-0.5s
  - Win : 1-2s
- **Volume** : Normalisé à -3dB pour éviter la saturation

## 🎨 Style Sonore Recommandé

Pour une application enfant joyeuse :

- **Tons doux et arrondis** (pas agressifs)
- **Fréquences moyennes-hautes** (500-2000Hz)
- **Pas de basses fortes** (éviter < 200Hz)
- **Effets "magiques"** : réverbération, scintillement
- **Inspiration** : sons de Super Mario, jeux Nintendo

## 🚀 Utilisation dans l'App

Une fois les fichiers ajoutés :

1. Placez les 4 fichiers MP3 dans ce dossier
2. Redémarrez l'application (`npx expo start`)
3. Les sons seront automatiquement chargés !

**Note** : Les sons sont joués uniquement si l'option "Sons" est activée dans les Paramètres.

## 📦 Sons Temporaires Inclus

Des sons de synthèse basiques sont générés automatiquement si les fichiers MP3 ne sont pas trouvés. Pour une meilleure expérience, remplacez-les par de vrais enregistrements !

---

**Astuce** : Testez vos sons dans l'app en activant/désactivant l'option "Sons 🔊" dans les Paramètres !

