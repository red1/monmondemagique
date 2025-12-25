import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * GlitterBrush - Composant pour simuler un effet paillettes
 * Utilise des gradients radiaux et des cercles colorés pour créer un effet scintillant
 * SOLUTION SIMPLE ET PERFORMANTE sans shaders natifs complexes
 */

/**
 * Génère des "particules de paillettes" le long d'un trait
 * @param {Array} points - Points du trait [{x, y}]
 * @param {string} color - Couleur de base
 * @returns {Array} - Tableau de particules avec position et taille
 */
export const generateGlitterParticles = (points, color) => {
  const particles = [];
  const density = 0.3; // Densité des paillettes
  
  for (let i = 0; i < points.length; i += Math.floor(1 / density)) {
    const point = points[i];
    const size = Math.random() * 3 + 1; // Taille aléatoire entre 1 et 4
    const offset = {
      x: (Math.random() - 0.5) * 10, // Dispersion autour du trait
      y: (Math.random() - 0.5) * 10,
    };
    
    particles.push({
      x: point.x + offset.x,
      y: point.y + offset.y,
      size,
      opacity: Math.random() * 0.5 + 0.5, // Opacité entre 0.5 et 1
      color: getGlitterColor(color),
    });
  }
  
  return particles;
};

/**
 * Retourne une variation scintillante de la couleur de base
 * Ajoute des reflets dorés/argentés pour l'effet paillettes
 */
const getGlitterColor = (baseColor) => {
  const glitterColors = [
    baseColor,
    '#FFD700', // Or
    '#FFFFFF', // Blanc brillant
    '#FFF8DC', // Cornsilk (or pâle)
    baseColor,
  ];
  
  return glitterColors[Math.floor(Math.random() * glitterColors.length)];
};

/**
 * Composant GlitterPath - Rendu SVG d'un trait avec effet paillettes
 */
export const GlitterPath = ({ path, color, particles }) => {
  return (
    <Svg>
      <Defs>
        <RadialGradient id="glitterGradient">
          <Stop offset="0%" stopColor={color} stopOpacity="1" />
          <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </RadialGradient>
      </Defs>
      
      {/* Trait principal */}
      <Path
        d={path}
        stroke={`url(#glitterGradient)`}
        strokeWidth={40}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Particules de paillettes */}
      {particles && particles.map((particle, index) => (
        <Circle
          key={`glitter-${index}`}
          cx={particle.x}
          cy={particle.y}
          r={particle.size}
          fill={particle.color}
          opacity={particle.opacity}
        />
      ))}
    </Svg>
  );
};

/**
 * Effet paillettes CSS (alternative pour les vues non-SVG)
 * Peut être appliqué via un style overlay
 */
export const glitterOverlayStyle = {
  shadowColor: '#FFD700',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.8,
  shadowRadius: 10,
  elevation: 5,
};

const styles = StyleSheet.create({
  glitterContainer: {
    position: 'relative',
  },
  sparkle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFD700',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
});

export default { generateGlitterParticles, GlitterPath, glitterOverlayStyle };

