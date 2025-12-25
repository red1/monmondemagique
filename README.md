# 🎨 Mon Monde Magique ✨

Application éducative et ludique en français pour enfants de 5 ans, optimisée pour tablettes et mobiles Android/iOS.

## 📋 Description

**Mon Monde Magique** est une application Expo/React Native conçue pour offrir une expérience éducative joyeuse avec :

- 🖍️ **Coloriage Magique** : Transformez des photos en dessins au trait et coloriez avec des effets paillettes
- ➕ **Jeu de Calculs** : Apprendre les mathématiques de manière progressive et ludique
- 🧩 **Logique & Formes** : Jeu de glisser-déposer pour reconnaître les formes
- 🔍 **7 Différences** : Trouver les différences entre deux images
- 📝 **Le Pendu** : Deviner des mots en français

## 🏗️ Architecture du Projet

```
MonMondeMagique/
├── app/                    # Routes Expo Router
│   ├── _layout.js         # Configuration navigation + fonts
│   ├── index.js           # Route principale (→ HomeScreen)
│   ├── coloring.js        # Route coloriage refactorisé
│   ├── math.js            # Jeu de calculs
│   ├── logic.js           # Jeu de logique
│   ├── diff.js            # Jeu des différences
│   ├── hangman.js         # Jeu du pendu
│   └── library.js         # Bibliothèque d'images
│
├── src/
│   ├── components/
│   │   ├── shared/
│   │   │   ├── GlossyButton.js      # Bouton brillant réutilisable
│   │   │   └── Header.js            # En-tête avec retour
│   │   └── coloring/
│   │       ├── SimpleColoringCanvas.js  # Canvas SVG performant
│   │       └── GlitterBrush.js          # Effets paillettes
│   │
│   ├── screens/
│   │   ├── HomeScreen.js             # Écran d'accueil principal
│   │   ├── ColoringScreen.js         # Écran de coloriage
│   │   └── PlaceholderScreen.js      # Écrans temporaires
│   │
│   └── utils/
│       └── imageFilters.js           # Traitement d'images
│
├── contexts/
│   └── SoundContext.js    # Gestion globale du son/musique
│
├── assets/
│   ├── fonts/            # Fredoka-SemiBold.ttf
│   ├── music/            # music.ai.mp3
│   └── coloriages/       # Images PNG pour coloriage
│
└── constants/
    └── Strings.js        # Textes en français
```

## 🚀 Installation et Démarrage

### Prérequis

- Node.js (v16+)
- npm ou yarn
- Expo CLI : `npm install -g expo-cli`

### Installation

```bash
cd MonMondeMagique
npm install
```

### Lancement

```bash
npx expo start
```

Puis :
- Pressez `i` pour iOS Simulator
- Pressez `a` pour Android Emulator
- Scannez le QR code avec Expo Go sur votre appareil

## 🎨 Fonctionnalités Principales

### 1. Coloriage Magique 🖍️

- **Transformation Photo → Sketch** : Convertit automatiquement une photo en dessin au trait
- **Effet Paillettes** : Brosse de coloriage avec texture scintillante (sans shaders complexes)
- **Sélection d'image** :
  - Prendre une photo
  - Choisir depuis la galerie
  - Page blanche pour dessin libre
  - Bibliothèque d'images pré-chargées
- **Sauvegarde** : Enregistre dans la galerie et la bibliothèque de l'app

### 2. Jeux Éducatifs 🎮

- **Progression automatique** : Difficulté croissante par paliers
- **Tutoriels intégrés** : Explications à chaque nouvelle étape
- **Sons et animations** : Feedback visuel et sonore encourageant

### 3. Design & UX

- **Interface pastel joyeuse** : Dégradés roses/pêche avec étoiles scintillantes
- **Boutons brillants** : Effet glossy avec animations bounce
- **Police personnalisée** : Fredoka-SemiBold pour une ambiance ludique
- **Musique de fond** : Loop continu avec contrôle dans les paramètres

## 🔧 Technologies Utilisées

- **Framework** : Expo SDK ~50.0
- **Navigation** : Expo Router ~3.4
- **Dessin** : react-native-svg (performant, évite les shaders)
- **Images** : expo-image-picker, expo-image-manipulator
- **Audio** : expo-av
- **Stockage** : @react-native-async-storage/async-storage
- **Animations** : React Native Animated API

## 🐛 Corrections Apportées

### ❌ Erreur Corrigée : `Cannot find native module 'ExpoLinking'`

**Solution** : Installation de `expo-linking` via npm

```bash
npm install expo-linking
```

### ❌ Erreur Corrigée : `Uniforms size differs` (Shader)

**Solution** : Remplacement des shaders complexes par **react-native-svg**

- Utilisation de SVG Path pour le dessin
- Effets visuels via gradients et ombres CSS
- Bien plus stable et performant

### ✅ Architecture Refactorisée

- Séparation claire des responsabilités
- Composants réutilisables
- Code commenté et maintenable
- Navigation simplifiée

## 📱 Compatibilité

- ✅ **iOS** : iPhone & iPad (iOS 13+)
- ✅ **Android** : Smartphones & Tablettes (Android 5.0+)
- ✅ **Optimisé** : Tablettes (écran large)

## 🎵 Assets Requis

### Sons (à ajouter dans `assets/sounds/`)

Créez les fichiers audio suivants (MP3, 1-2 secondes) :

- `pop.mp3` : Clic de bouton
- `success.mp3` : Bonne réponse
- `wrong.mp3` : Mauvaise réponse
- `win.mp3` : Victoire/niveau terminé

### Musique

- ✅ `assets/music/music.ai.mp3` (déjà présent)

## 🎨 Personnalisation

### Ajouter des Images de Coloriage

1. Ajoutez vos fichiers PNG dans `assets/coloriages/`
2. L'app les chargera automatiquement au démarrage
3. Format recommandé : dessins au trait noir sur fond blanc

### Modifier les Couleurs

Éditez `src/screens/ColoringScreen.js`, section `colors` :

```javascript
const colors = [
  '#FF69B4', // Rose
  '#FFD700', // Or
  // ... ajoutez vos couleurs
];
```

## 📝 Notes de Développement

### Solution Technique : Coloriage sans Shaders

Au lieu d'utiliser `@shopify/react-native-skia` avec des shaders GLSL complexes (source d'erreurs), nous avons opté pour **react-native-svg** :

**Avantages** :
- ✅ Stable et bien maintenu
- ✅ Performant pour le dessin vectoriel
- ✅ Pas de problèmes d'uniformes ou de compatibilité GPU
- ✅ Effets visuels simples (gradients, ombres)

**Compromis** :
- ⚠️ Effet "paillettes" simulé (pas de vraie texture procédurale)
- ⚠️ Animation des particules plus simple

### Photo-to-Sketch

La conversion photo → dessin utilise `expo-image-manipulator` pour optimiser l'image. Pour un vrai effet sketch (edge detection), une bibliothèque tierce comme `react-native-image-filter-kit` pourrait être ajoutée.

## 🤝 Contribution

Pour toute question ou amélioration :

1. Créez une branche : `git checkout -b feature/ma-fonctionnalite`
2. Committez vos changements : `git commit -m "Ajout: ..."`
3. Pushez : `git push origin feature/ma-fonctionnalite`

## 📄 Licence

© 2024 Mon Monde Magique - Application éducative

---

**Développé avec ❤️ pour rendre l'apprentissage magique !** ✨

