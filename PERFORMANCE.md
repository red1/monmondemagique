# Performance — Mon Monde Magique

Document des optimisations appliquées en **juillet 2026** pour garder l’app fluide sur tablette réelle, y compris pendant les téléchargements/extractions de packs Lunii.

---

## Objectifs

1. **Tablette utilisable** pendant download + extraction (enfant peut jouer ailleurs dans l’app)
2. **Bibliothèque rapide** avec des centaines d’histoires
3. **Lecteur fluide** sans re-render à chaque tick audio
4. **Aucune fonctionnalité retirée**

---

## 1. Pipeline téléchargement / extraction

### Avant

| Problème | Impact |
|----------|--------|
| `unzipSync()` sur HTTP | Bloque le thread JS plusieurs secondes |
| Zip entier chargé en base64 | Pic mémoire + CPU |
| 2 écritures parallèles max | Extraction lente |
| Sauvegardes partielles toutes les 2,5 s | I/O + refresh UI fréquents |
| Notifications bibliothèque toutes les 300 ms pendant download | Re-render global |

### Après (`zipExtract.js`, `megaFile.js`, `storyService.js`, `nativeZip.js`)

| Optimisation | Détail |
|--------------|--------|
| **Extraction native** | `react-native-zip-archive` (SSZipArchive / ZipInputStream) — **~5–15×** plus rapide que JS fflate sur builds dev/prod |
| **MEGA decrypt → zip → native unzip** | Packs ≤ 90 Mo : decrypt complet puis `unzip()` natif (évite des centaines d’écritures JS) |
| **Extraction streaming (fallback)** | `streamUnzipFromFile` + fflate — lecture 16 Mo/bloc, inflate incrémental |
| **16 écritures parallèles** | `MAX_WRITE_CONCURRENCY = 16`, file `getSharedWriteQueue()` partagée |
| **Cache dossiers** | `createDirCache()` — évite `makeDirectoryAsync` répétés |
| **Mode rapide** | Yield tous les 32 Mo (vs 8 Mo) pendant extraction active |
| **Yield UI** | `yieldToEventLoop()` entre blocs (fallback JS uniquement) |
| **Sauvegardes partielles** | Max 1 / 10 s ou 12 fichiers, mode `fast: true` |
| **Notify debounce** | 2 s pendant téléchargement actif (`beginActiveDownload` / `endActiveDownload`) |
| **Progress UI** | Throttle 300 ms dans `StoryDownloadContext` |

> **Note** : l’extraction native nécessite un build dev/prod (`npx expo run:android` ou EAS). Expo Go utilise le fallback JS.

---

## 2. Service bibliothèque (`storyService.js`)

### Cache mémoire

```javascript
storiesMetaCache      // évite relecture disque à chaque écran
packagesMetaCache
libraryIndexUpdatedAt // fraîcheur 5 min → skip sync/enrich inutile
```

- `getDownloadedStories({ force })` — cache chaud par défaut
- `getPackById` / `getSourceById` — `Map` O(1) au lieu de `.find()` sur 200+ packs

### Background work

- `scheduleBackgroundLibrarySync` — ignoré si bibliothèque < 5 min
- `scheduleBackgroundMp3Enrich` — ignoré si meta fraîche
- `debugLogLibraryFileSizes` — `__DEV__` uniquement

---

## 3. Écran bibliothèque (`StoriesScreen.js`)

| Changement | Bénéfice |
|------------|----------|
| **Chargement unique** au mount | 1 lecture meta au lieu de 3 |
| **`useDebouncedValue`** sur nom/artiste (280 ms) | Moins de filtrage pendant la frappe |
| **`StoryGridCard` memo** | Les cellules hors queue ne re-rendent pas |
| **Maps précalculées** | `sourceNameById`, `packThumbnailById` |
| **FlatList** | `initialNumToRender=10`, `extraData=queue`, `removeClippedSubviews` |
| **Réparation vignettes** | 1× par session app, pas à chaque focus |

---

## 4. Lecteur (`StoryPlayerScreen.js`)

| Changement | Bénéfice |
|------------|----------|
| **Throttle playback UI** | Mise à jour position/état max **4×/s** (250 ms) |
| **Refs pour position** | `positionMsRef` pour logique sans setState |
| **Suppression resolve thumbnail bloquant** | `setReady(true)` immédiat, vignettes déjà dans meta |

---

## 5. Catalogue packs (`StoryPackagesScreen.js`)

- FlatList : `initialNumToRender=12`, `windowSize=7`, `removeClippedSubviews`
- `getSourceById` au lieu de `sources.find`

---

## 6. Contextes React

### `StoryDownloadContext`

- Split **Actions** (stable) / **Progress** (volatile)
- `useStoryDownloadProgress()` pour la bannière seule
- Jeux n’ont pas besoin de s’abonner aux ticks de progression

### `SoundContext`

- `playSound` en `useCallback`
- `contextValue` en `useMemo` → moins de re-renders enfants

### `StoryCoverImage`

- `React.memo` + fallback vignette pack

---

## 7. Métriques attendues (appareil réel)

| Scénario | Avant | Après (cible) |
|----------|-------|----------------|
| Extraction pack 60 Mo HTTP | UI gelée 10–30 s | UI réactive, progression visible |
| Scroll bibliothèque 200+ items | Saccades, find() par cellule | Scroll fluide, cells memo |
| Lecteur en lecture | ~10 re-renders/s écran entier | ~4 re-renders/s zone contrôles |
| Focus bibliothèque | 40 réparations vignettes | 1× par session |

---

## 8. Pistes futures (non implémentées)

- `expo-image` avec cache disque pour vignettes catalogue
- Provider download scopé aux routes `/stories*` uniquement
- Timer parental isolé (éviter tick 1 Hz sur tout l’app)
- Module natif unzip (background thread)
- Écriture binaire sans base64 (`react-native-blob-util`)

---

## Fichiers modifiés (perf juillet 2026)

```
src/services/zipExtract.js       — streaming, queue partagée, yield
src/services/megaFile.js         — chunks 8 Mo, session streaming
src/services/storyService.js     — cache, maps, debounce notify
src/screens/StoriesScreen.js     — debounce, StoryGridCard, load unique
src/screens/StoryPlayerScreen.js — throttle playback UI
src/screens/StoryPackagesScreen.js — FlatList tuning
src/components/stories/StoryGridCard.js — nouveau, memo
src/components/shared/StoryCoverImage.js — memo
src/utils/useDebouncedValue.js — nouveau
contexts/StoryDownloadContext.js — split actions/progress
contexts/SoundContext.js       — useMemo/useCallback
```
