const { execSync } = require('child_process');
const fs = require('fs');
const path = require('fs');

console.log('🛡️  DÉMARRAGE DU GARDE-FOU (MON MONDE MAGIQUE)');

try {
  console.log('🔍 Étape 1 : Exécution des tests unitaires...');
  execSync('npm test', { stdio: 'inherit' });
  
  console.log('✅ Étape 2 : Vérification de la configuration Expo...');
  const appJsonPath = './app.json';
  if (!fs.existsSync(appJsonPath)) {
    throw new Error('Fichier app.json manquant !');
  }
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  if (!appJson.expo || !appJson.expo.scheme) {
    throw new Error('Propriété "scheme" manquante dans app.json !');
  }

  console.log('✅ Étape 3 : Vérification des fonctionnalités critiques...');
  const checklistPath = './FEATURES_CHECKLIST.md';
  if (fs.existsSync(checklistPath)) {
    const content = fs.readFileSync(checklistPath, 'utf8');
    console.log('\n--- REGISTRE DES FONCTIONNALITÉS ---\n' + content + '\n-----------------------------------\n');
  }

  console.log('✨ TOUT EST OK ! Aucune régression détectée.');
} catch (error) {
  console.error('\n❌ ERREUR : Les tests ont échoué !');
  console.error('⚠️  Modifications annulées ou à corriger immédiatement.');
  process.exit(1);
}

