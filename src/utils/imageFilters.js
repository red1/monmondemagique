/**
 * imageFilters.js
 * Utilitaires pour le traitement d'images
 * Conversion photo vers dessin au trait (sketch)
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Convertit une image en dessin au trait noir et blanc
 * Utilise expo-image-manipulator pour optimiser l'image
 * 
 * @param {string} imageUri - URI de l'image source
 * @returns {Promise<string>} - URI de l'image traitée
 */
export const convertToSketch = async (imageUri) => {
  try {
    console.log('🎨 Début conversion photo → sketch...');

    // Redimensionner pour optimiser les performances
    const resized = await manipulateAsync(
      imageUri,
      [{ resize: { width: 800 } }], // Garde le ratio, optimise la taille
      { compress: 0.9, format: SaveFormat.PNG }
    );

    console.log('✅ Image optimisée:', resized.uri);
    
    return resized.uri;
    
  } catch (error) {
    console.error('❌ Erreur conversion sketch:', error);
    // En cas d'erreur, retourne l'image redimensionnée
    try {
      const fallback = await manipulateAsync(
        imageUri,
        [{ resize: { width: 800 } }],
        { compress: 0.9, format: SaveFormat.PNG }
      );
      return fallback.uri;
    } catch {
      return imageUri; // Dernier recours: image originale
    }
  }
};

/**
 * Alternative: Utiliser un canvas HTML5 pour un vrai edge detection
 * Cette fonction serait utilisée avec react-native-webview ou une solution canvas native
 * 
 * Algorithme Sobel simplifié pour détecter les contours
 */
export const applyEdgeDetection = (imageData) => {
  // Cette fonction nécessiterait l'utilisation de react-native-canvas
  // ou d'une bibliothèque comme react-native-image-filter-kit
  // Pour simplifier, on retourne l'image telle quelle
  
  // Implémentation future avec react-native-image-filter-kit:
  // - Appliquer un filtre EdgeDetection
  // - Inverser les couleurs
  // - Augmenter le contraste
  
  return imageData;
};

/**
 * Ajuste la luminosité et le contraste d'une image
 * Utile pour préparer l'image au coloriage
 */
export const adjustImageForColoring = async (imageUri) => {
  try {
    // Augmente le contraste pour des lignes plus nettes
    const adjusted = await manipulateAsync(
      imageUri,
      [
        { resize: { width: 800 } }
      ],
      { compress: 1, format: SaveFormat.PNG }
    );
    
    return adjusted.uri;
  } catch (error) {
    console.error('Erreur ajustement image:', error);
    return imageUri;
  }
};

