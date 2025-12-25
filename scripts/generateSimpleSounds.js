/**
 * generateSimpleSounds.js
 * Script Node.js pour générer des sons d'effets simples
 * Utilise la Web Audio API pour créer des tons synthétiques
 * 
 * USAGE:
 * node scripts/generateSimpleSounds.js
 * 
 * NOTE: Ce script nécessite un environnement Node.js avec accès à l'API audio
 * Pour une meilleure qualité, utilisez des sons professionnels depuis Freesound.org
 */

const fs = require('fs');
const path = require('path');

console.log('🔊 Génération de sons d\'effets simples...\n');

// Configuration des sons
const sounds = {
  pop: {
    duration: 0.1,
    frequency: 800,
    type: 'sine',
    description: 'Son pop/clic court'
  },
  success: {
    duration: 0.5,
    frequency: [523, 659, 784], // Do - Mi - Sol (accord majeur)
    type: 'sine',
    description: 'Son de succès (3 notes ascendantes)'
  },
  wrong: {
    duration: 0.3,
    frequency: 200,
    type: 'square',
    description: 'Son d\'erreur (buzzer)'
  },
  win: {
    duration: 1.5,
    frequency: [523, 587, 659, 698, 784], // Gamme montante
    type: 'sine',
    description: 'Fanfare de victoire'
  }
};

console.log('📋 Sons à générer:');
Object.entries(sounds).forEach(([name, config]) => {
  console.log(`  - ${name}.mp3: ${config.description}`);
});

console.log('\n⚠️  LIMITATION TECHNIQUE:');
console.log('Ce script nécessite des dépendances audio natives pour Node.js.');
console.log('Les bibliothèques comme "node-wav" ou "audiobuffer-to-wav" peuvent être utilisées.\n');

console.log('🎵 ALTERNATIVE RECOMMANDÉE:');
console.log('Pour des sons de haute qualité, visitez:');
console.log('  • https://freesound.org (sons gratuits CC0)');
console.log('  • https://mixkit.co/free-sound-effects/ (sons libres de droits)');
console.log('  • https://www.zapsplat.com (sons professionnels gratuits)\n');

console.log('📂 Placez les fichiers MP3 dans:');
console.log(`  ${path.join(__dirname, '../assets/sounds/')}\n`);

console.log('✅ Fichiers requis:');
console.log('  ├── pop.mp3      (100-200ms)');
console.log('  ├── success.mp3  (500ms-1s)');
console.log('  ├── wrong.mp3    (300-500ms)');
console.log('  └── win.mp3      (1-2s)\n');

// Générer des fichiers placeholder (silences)
const soundsDir = path.join(__dirname, '../assets/sounds/');

if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
  console.log('✅ Dossier assets/sounds/ créé');
}

// Créer un fichier README avec instructions
const readmePath = path.join(soundsDir, 'HOWTO.txt');
const readmeContent = `
COMMENT AJOUTER DES SONS D'EFFETS À MON MONDE MAGIQUE
=====================================================

1. TÉLÉCHARGEZ DES SONS GRATUITS
   
   Sites recommandés:
   • Freesound.org (cherchez: "button click", "success", "error", "fanfare")
   • Mixkit.co (section Game Sounds)
   • Zapsplat.com (section UI Sounds)

2. RENOMMEZ LES FICHIERS
   
   Vous devez avoir exactement ces noms:
   ✓ pop.mp3
   ✓ success.mp3
   ✓ wrong.mp3
   ✓ win.mp3

3. PLACEZ LES FICHIERS ICI
   
   Copiez les 4 fichiers MP3 dans ce dossier:
   ${soundsDir}

4. REDÉMARREZ L'APP
   
   Arrêtez et relancez Expo:
   npx expo start --clear

5. TESTEZ LES SONS
   
   Ouvrez Paramètres dans l'app et activez "Sons 🔊"
   Les sons joueront quand vous cliquez sur les boutons !

CARACTÉRISTIQUES RECOMMANDÉES
------------------------------
• Format: MP3 (128 kbps minimum)
• Sample rate: 44.1 kHz
• Durée: 
  - pop: 0.1-0.2 secondes
  - success: 0.5-1 seconde
  - wrong: 0.3-0.5 secondes
  - win: 1-2 secondes
• Volume: Normalisé, pas trop fort !

ASTUCE
------
Utilisez Audacity (gratuit) pour éditer vos sons:
• Couper au bon timing
• Normaliser le volume
• Exporter en MP3

Bon amusement ! 🎵
`;

fs.writeFileSync(readmePath, readmeContent.trim());
console.log(`✅ Instructions créées: ${readmePath}\n`);

console.log('🎉 TERMINÉ!');
console.log('Consultez assets/sounds/HOWTO.txt pour les instructions complètes.\n');

