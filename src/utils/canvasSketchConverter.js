/**
 * canvasSketchConverter.js
 * Conversion photo → sketch utilisant Canvas (via WebView si nécessaire)
 * Implémentation de l'algorithme Sobel pour edge detection
 */

/**
 * Code HTML/JS pour traitement d'image dans une WebView
 * Implémente edge detection Sobel en JavaScript pur
 */
export const getSketchConverterHTML = (imageBase64) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #f0f0f0;
    }
    canvas {
      max-width: 100%;
      border: 1px solid #ccc;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  
  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
      // Définir taille du canvas
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Dessiner l'image
      ctx.drawImage(img, 0, 0);
      
      // Obtenir les données pixel
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Appliquer edge detection Sobel
      const edges = sobelEdgeDetection(imageData);
      
      // Appliquer threshold pour binarisation
      const binary = applyThreshold(edges, 100);
      
      // Inverser (lignes noires sur fond blanc)
      const inverted = invertColors(binary);
      
      // Afficher le résultat
      ctx.putImageData(inverted, 0, 0);
      
      // Envoyer le résultat à React Native
      const dataUrl = canvas.toDataURL('image/png');
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'sketch_complete',
        data: dataUrl
      }));
    };
    
    img.src = '${imageBase64}';
    
    /**
     * Algorithme Sobel pour edge detection
     */
    function sobelEdgeDetection(imageData) {
      const width = imageData.width;
      const height = imageData.height;
      const data = imageData.data;
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
      
      // Convertir en niveaux de gris
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
          const value = Math.min(255, magnitude);
          
          output[index] = value;
          output[index + 1] = value;
          output[index + 2] = value;
          output[index + 3] = 255;
        }
      }
      
      return new ImageData(output, width, height);
    }
    
    /**
     * Applique un seuil (threshold) pour binarisation
     */
    function applyThreshold(imageData, threshold) {
      const data = imageData.data;
      const output = new Uint8ClampedArray(data.length);
      
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i]; // Déjà en niveaux de gris
        const value = gray > threshold ? 255 : 0;
        
        output[i] = value;
        output[i + 1] = value;
        output[i + 2] = value;
        output[i + 3] = 255;
      }
      
      return new ImageData(output, imageData.width, imageData.height);
    }
    
    /**
     * Inverse les couleurs
     */
    function invertColors(imageData) {
      const data = imageData.data;
      const output = new Uint8ClampedArray(data.length);
      
      for (let i = 0; i < data.length; i += 4) {
        output[i] = 255 - data[i];
        output[i + 1] = 255 - data[i + 1];
        output[i + 2] = 255 - data[i + 2];
        output[i + 3] = 255;
      }
      
      return new ImageData(output, imageData.width, imageData.height);
    }
  </script>
</body>
</html>
`;

/**
 * Convertit une image en base64
 * @param {string} imageUri - URI de l'image
 * @returns {Promise<string>} - Image en base64
 */
export const imageToBase64 = async (imageUri) => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Erreur conversion base64:', error);
    throw error;
  }
};

/**
 * Algorithme Canny edge detection (version simplifiée)
 * Plus sophistiqué que Sobel
 */
export const cannyEdgeDetection = {
  // Configuration des paramètres
  lowThreshold: 50,
  highThreshold: 100,
  gaussianKernelSize: 5,
  
  // Implémentation complète nécessiterait:
  // 1. Gaussian blur (réduction du bruit)
  // 2. Calcul du gradient (Sobel)
  // 3. Non-maximum suppression
  // 4. Double threshold
  // 5. Edge tracking par hystérésis
  
  description: 'Algorithme Canny non implémenté - utiliser Sobel comme alternative'
};

export default {
  getSketchConverterHTML,
  imageToBase64,
  cannyEdgeDetection
};

