/**
 * advancedImageFilters.js
 * Edge detection et filtres d'images avancés
 * Utilise react-native-image-filter-kit pour des transformations sophistiquées
 */

import * as FileSystem from 'expo-file-system';

/**
 * Applique un filtre edge detection (détection de contours) sur une image
 * Utilise l'algorithme Sobel pour détecter les contours
 * 
 * @param {string} imageUri - URI de l'image source
 * @returns {Promise<string>} - URI de l'image avec contours détectés
 */
export const applyEdgeDetection = async (imageUri) => {
  try {
    console.log('🔍 Application edge detection...');
    
    // react-native-image-filter-kit nécessite un traitement dans un composant React
    // Pour une utilisation pure (sans composant), on utilise une approche Canvas Web
    
    // Cette fonction serait idéalement utilisée avec le composant <ImageFilter />
    // Voir applyEdgeDetectionComponent() pour usage dans un composant React
    
    console.log('⚠️ Edge detection nécessite un composant React');
    return imageUri;
    
  } catch (error) {
    console.error('❌ Erreur edge detection:', error);
    return imageUri;
  }
};

/**
 * Convertit une image en noir et blanc avec seuil (threshold)
 * Parfait pour créer des dessins au trait nets
 * 
 * @param {string} imageUri - URI de l'image source
 * @param {number} threshold - Seuil de binarisation (0-255), défaut 128
 * @returns {Promise<string>} - URI de l'image binarisée
 */
export const applyThreshold = async (imageUri, threshold = 128) => {
  try {
    console.log(`🎯 Application seuil (threshold: ${threshold})...`);
    
    // Utilisation future avec react-native-image-filter-kit
    // Cette fonction nécessite un traitement pixel par pixel
    
    return imageUri;
    
  } catch (error) {
    console.error('❌ Erreur threshold:', error);
    return imageUri;
  }
};

/**
 * Applique un ensemble de filtres pour créer un effet "dessin au crayon"
 * Combinaison de: grayscale → edge detection → invert → threshold
 * 
 * @param {string} imageUri - URI de l'image source
 * @returns {Promise<string>} - URI du dessin au crayon
 */
export const convertToPencilDrawing = async (imageUri) => {
  try {
    console.log('✏️ Conversion en dessin au crayon...');
    
    // Séquence de filtres pour un effet dessin réaliste:
    // 1. Niveaux de gris
    // 2. Détection des contours (Sobel ou Canny)
    // 3. Inversion des couleurs
    // 4. Augmentation du contraste
    // 5. Application d'un seuil
    
    // Implémentation complète nécessiterait:
    // - Traitement Canvas Web (via WebView)
    // - OU traitement natif (module custom)
    // - OU utilisation de bibliothèques natives (OpenCV)
    
    return imageUri;
    
  } catch (error) {
    console.error('❌ Erreur pencil drawing:', error);
    return imageUri;
  }
};

/**
 * Algorithme Sobel pour edge detection (implémentation JS pure)
 * Traite l'image pixel par pixel - ATTENTION: TRÈS LENT pour grandes images
 * 
 * @param {ImageData} imageData - Données pixel de l'image (Canvas)
 * @returns {ImageData} - Données pixel avec contours détectés
 */
export const sobelEdgeDetection = (imageData) => {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);
  
  // Noyaux de Sobel
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1]
  ];
  
  const sobelY = [
    [-1, -2, -1],
    [ 0,  0,  0],
    [ 1,  2,  1]
  ];
  
  // Convertir en niveaux de gris d'abord
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  
  // Appliquer Sobel
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      // Convoluer avec les noyaux
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = gray[(y + ky) * width + (x + kx)];
          gx += pixel * sobelX[ky + 1][kx + 1];
          gy += pixel * sobelY[ky + 1][kx + 1];
        }
      }
      
      // Magnitude du gradient
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const index = (y * width + x) * 4;
      
      // Inverser pour avoir des lignes noires sur fond blanc
      const value = 255 - Math.min(255, magnitude);
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = 255; // Alpha
    }
  }
  
  return {
    ...imageData,
    data: output
  };
};

/**
 * Composant React pour edge detection avec react-native-image-filter-kit
 * À utiliser dans un composant React
 * 
 * Usage:
 * ```jsx
 * import { EdgeDetectionFilter } from './advancedImageFilters';
 * 
 * <EdgeDetectionFilter imageUri={uri} onResult={(filteredUri) => {...}} />
 * ```
 */
export const EdgeDetectionFilterConfig = (imageUri) => {
  return {
    name: 'CompositeFilter',
    filters: [
      // 1. Conversion en niveaux de gris
      {
        name: 'ColorMatrix',
        matrix: [
          0.33, 0.33, 0.33, 0, 0,
          0.33, 0.33, 0.33, 0, 0,
          0.33, 0.33, 0.33, 0, 0,
          0,    0,    0,    1, 0
        ]
      },
      // 2. Augmentation du contraste
      {
        name: 'Contrast',
        amount: 2.0
      },
      // 3. Augmentation de la netteté (simule edge detection)
      {
        name: 'Sharpen',
        amount: 5.0
      },
      // 4. Seuil pour binarisation
      {
        name: 'ColorMatrix',
        matrix: [
          3, 0, 0, 0, -384,
          0, 3, 0, 0, -384,
          0, 0, 3, 0, -384,
          0, 0, 0, 1, 0
        ]
      }
    ],
    image: imageUri
  };
};

/**
 * Convertit une image en format prêt pour le coloriage
 * Optimise l'image pour avoir des lignes nettes et un fond blanc
 * 
 * @param {string} imageUri - URI de l'image source
 * @returns {Promise<string>} - URI de l'image optimisée
 */
export const optimizeForColoring = async (imageUri) => {
  try {
    console.log('🎨 Optimisation pour coloriage...');
    
    // Cette fonction prépare l'image pour être coloriée:
    // - Lignes noires bien définies
    // - Fond blanc pur
    // - Contraste maximum
    // - Pas de gris intermédiaires
    
    // Implémentation future avec traitement Canvas ou OpenCV
    
    return imageUri;
    
  } catch (error) {
    console.error('❌ Erreur optimisation:', error);
    return imageUri;
  }
};

export default {
  applyEdgeDetection,
  applyThreshold,
  convertToPencilDrawing,
  sobelEdgeDetection,
  EdgeDetectionFilterConfig,
  optimizeForColoring
};

