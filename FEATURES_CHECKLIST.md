# 🛡️ MON MONDE MAGIQUE - FEATURE PROTECTION REGISTRY

Ce fichier sert de garde-fou pour éviter de supprimer des fonctionnalités lors des futures modifications. **NE PAS SUPPRIMER CE REGISTRE.**

## 🤖 INSTRUCTIONS POUR L'IA (CURSOR)
Avant de terminer chaque tour de modification, tu **DOIS** impérativement :
1. Lancer les tests : `npm test`
2. Lancer le garde-fou : `node guard.js`
3. Si un test échoue, tu ne dois pas rendre ton travail avant d'avoir corrigé la régression.

## 🏠 ACCUEIL (HomeScreen.js)
- [x] **Layout** : Grille 4x2 compacte centrée sur 50% de la hauteur.
- [x] **Background** : Bulles animées (tailles aléatoires + fade out) et étoiles flottantes.

## 🎨 COLORIAGE (SimpleColoringCanvas.js)
- [x] **Glitter Effect** : Support multi-paillettes persisted per path (previous glitters stay unchanged).
- [x] **Default State** : Effet magique désactivé par défaut.
- [x] **Magic Wand (Bucket)** : Algorithme Flood Fill via `Path.addRect` (fonctionne aussi sur Page Blanche).
- [x] **Layering** : Fond blanc -> Dessins -> Image de contours (mode Multiply).
- [x] **Persistence** : État `paths` conservé entre les changements de couleurs.
- [x] **Undo/Redo** : Possibilité d'annuler et de rétablir les actions de dessin.
- [x] **Zoom & Pan** : Zoom multi-touch (pinch) et boutons +/- pour plus de précision.
- [x] **Eraser & Shapes** : Outils gomme et formes (Cercle, Carré, Étoile) fonctionnels.

## 📚 BIBLIOTHÈQUE (library.js / puzzle.js)
- [x] **Auto-Loading** : Chargement dynamique depuis `assets/coloriages`.
- [x] **User Content** : Persistance via `AsyncStorage`.
- [x] **Management** : Suppression (individuelle/totale), Partage et Épinglage.
- [x] **Device Import** : Chargement d'images depuis la galerie (ImagePicker).

## 🎮 JEUX & ACTIVITÉS
- [x] **Blagues & Devinettes** : 100+ blagues de qualité pour enfants.
- [x] **TTS** : Text-to-Speech fonctionnel sur toutes les activités.
- [x] **Pendu** : 10 étapes, clavier virtuel/physique.
- [x] **Lecture** : Mots jumeaux sans doublons, progression.
- [x] **Puzzle** : Pièces traditionnelles emboîtables, structure persistante, 2 colonnes (vrac/plateau), ombres portées au drag & drop.
- [x] **Puissance 4** : Jeu contre l'ordinateur (IA simple) ou à 2 joueurs, animations Skia fluides.

## 🌍 LOCALISATION
- [x] **Multi-langues** : FR, AR, AR_DZ (Oran), EN, ES.
- [x] **RTL** : Support de l'Arabe et du Darija.
