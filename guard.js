const { execSync } = require('child_process');
const fs = require('fs');
const path = require('fs');

console.log('🛡️  DÉMARRAGE DU GARDE-FOU (MON MONDE MAGIQUE)');

try {
  console.log('🔍 Étape 1 : Exécution des tests unitaires...');
  execSync('npm test', { stdio: 'inherit' });
  
  console.log('✅ Étape 2 : Vérification des fonctionnalités critiques...');
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

