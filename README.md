# Mon Monde Magique

Application éducative et ludique pour enfants (5–10 ans), en **français** et **anglais**, optimisée pour **tablettes** Android et iOS.

---

## Fonctionnalités

### Jeux et activités

| Module | Description |
|--------|-------------|
| **Coloriage magique** | Photos → dessin au trait, palette 12 couleurs, paillettes, gomme, galerie |
| **Calculs** | Mathématiques progressives avec tutoriels |
| **Logique & formes** | Glisser-déposer, reconnaissance des formes |
| **7 différences** | Trouver les différences entre deux images |
| **Pendu** | Mots en français |
| **Connect 4** | Puissance 4 |
| **Puzzles** | Plusieurs niveaux de difficulté |
| **Blagues & lecture** | Contenus ludiques |

### Histoires et musiques (Lunii)

Module complet de **bibliothèque audio** avec plus de **200 packs** téléchargeables :

- **Catalogue** : packs « Raconte moi une histoire » (MEGA), vignettes, tailles, filtres
- **Téléchargement** : MEGA natif + extraction en streaming (décryptage + dézip par blocs)
- **Bibliothèque locale** : histoires et chansons extraites des packs Lunii (`story.json` + MP3)
- **Filtres** : nom, source, type (histoire/chanson), artiste, album, genre, **pack**, durée
- **File d’attente** : sélection multiple, réordonnancement, lecture séquentielle
- **Lecteur** : timeline cliquable, pochette, précédent/suivant, pause, reprise
- **Progression** : sauvegarde **par histoire** dans une playlist (reprendre où on s’est arrêté)
- **Playlists nommées** : enregistrer, lister, supprimer, reprendre une playlist sauvegardée
- **Contrôle parental** : limite d’histoires, minuterie, verrouillage PIN, compteur remis à zéro sur nouvelle playlist
- **Vignettes** : extraction locale depuis MP3 / pack, réparation automatique des URLs expirées

### Audio et interface

- Musique de fond en boucle, sons d’effets (clic, succès, erreur, victoire)
- Fond animé pastel, police **Fredoka-SemiBold**, boutons glossy
- Bilingue FR/EN (`constants/Strings.js`)

---

## Architecture

```
MonMondeMagique/
├── app/                      # Routes Expo Router
│   ├── stories.js            # Bibliothèque locale
│   ├── story_packages.js     # Catalogue / téléchargements
│   ├── story_player.js       # Lecteur audio
│   └── …                     # Jeux (math, hangman, coloring, …)
├── src/
│   ├── screens/              # Écrans principaux
│   ├── components/
│   │   ├── shared/           # Header, StoryCoverImage, bannières…
│   │   └── stories/          # Queue, modales playlists, StoryGridCard
│   ├── services/
│   │   ├── storyService.js   # Bibliothèque, téléchargements, progression
│   │   ├── megaFile.js       # Pipeline MEGA (download → decrypt → unzip)
│   │   ├── zipExtract.js     # Extraction zip streaming + file d’écriture
│   │   ├── mp3Metadata.js    # Durée, tags ID3, pochettes MP3
│   │   └── luniiStoryParser.js
│   └── utils/
├── contexts/
│   ├── SoundContext.js
│   ├── LanguageContext.js
│   ├── ParentalControlContext.js
│   └── StoryDownloadContext.js
├── assets/
│   ├── stories/catalog.json  # ~200 packs Lunii
│   ├── coloriages/
│   ├── music/
│   └── sounds/
└── constants/Strings.js
```

### Flux histoires

```
catalog.json → StoryPackagesScreen → downloadPackage()
    → MEGA (pack.enc) ou HTTP (pack.zip)
    → extraction streaming (fflate, 8 Mo/bloc, 8 écritures parallèles)
    → story.json + assets/*.mp3
    → AsyncStorage + library-index.json
    → StoriesScreen → StoryPlayerScreen
```

---

## Installation

### Prérequis

- Node.js 18+
- npm ou yarn
- Expo CLI (`npx expo`)

### Démarrage

```bash
cd MonMondeMagique
npm install
npx expo start
```

- `a` → Android | `i` → iOS | QR code → Expo Go

### Build production (EAS)

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

Configuration : `eas.json`, projet Expo `clevercontent-llc/magic-world`.

### Scripts utiles

```bash
npm test                    # Jest
npm run guard               # Tests + validation
npm run extract-stories     # Régénérer catalog.json depuis la source Lunii
```

---

## Téléchargements et performances

Les téléchargements s’exécutent en **arrière-plan** avec :

- Téléchargement natif (`expo-file-system` resumable)
- Décryptage/dézip **par blocs de 8 Mo** (pas de chargement complet en RAM)
- **8 écritures fichiers en parallèle** (file partagée)
- `yieldToEventLoop()` entre blocs → **tablette utilisable** pendant l’extraction
- Progression UI limitée à **300 ms** pour éviter les re-renders

Voir **[PERFORMANCE.md](./PERFORMANCE.md)** pour le détail des optimisations UI et bibliothèque.

---

## Stockage des histoires

| Clé / fichier | Contenu |
|---------------|---------|
| `{documentDirectory}stories/` | Packs extraits par `packId` |
| `library-index.json` | Index rapide de la bibliothèque |
| `STORIES_META` (AsyncStorage) | Métadonnées par histoire |
| `STORIES_PACKAGES_META` | Packs installés |
| `STORIES_PROGRESS` | Progression lecture (par histoire) |
| `STORIES_SAVED_PLAYLISTS` | Playlists nommées + progression |

---

## Technologies

| Domaine | Stack |
|---------|--------|
| Framework | Expo SDK 50, React Native 0.73 |
| Navigation | Expo Router 3 |
| Audio | expo-av, slider timeline |
| Fichiers | expo-file-system, fflate, megajs |
| Dessin | react-native-svg |
| Stockage | AsyncStorage |
| Tests | Jest, React Native Testing Library |

---

## Personnalisation

### Coloriages

Ajoutez des PNG dans `assets/coloriages/` (traits noirs sur fond blanc).

### Sons

Placez dans `assets/sounds/` : `click.mp3`, `success.mp3`, `wrong.mp3`, `win.mp3`  
(voir `assets/sounds/README.md`).

### Catalogue histoires

`assets/stories/catalog.json` — généré via `scripts/extract-conty-catalog.js`.

---

## Documentation complémentaire

- [IMPROVEMENTS.md](./IMPROVEMENTS.md) — améliorations avancées (sons, shaders, etc.)
- [CHANGELOG.md](./CHANGELOG.md) — historique des versions
- [PERFORMANCE.md](./PERFORMANCE.md) — optimisations performances (juillet 2026)

---

## Licence

© Mon Monde Magique — application éducative pour enfants.
