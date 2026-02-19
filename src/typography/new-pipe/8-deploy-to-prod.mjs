#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemins
const RESULTS_DIR = path.join(__dirname, 'batch-testing', 'results');
const OUTPUT_DIR = path.join(__dirname, 'output');
const PUBLIC_DIR = path.join(__dirname, '../../..', 'public');
const PUBLIC_DATA_DIR = path.join(PUBLIC_DIR, 'data');

/**
 * Déploie une configuration en production
 */
async function deployConfig(configName) {
  try {
    console.log(chalk.blue.bold(`🚀 Déploiement de la config "${configName}" en production\n`));
    
    // 1. Trouver le fichier de résultat le plus récent
    const files = await fs.readdir(RESULTS_DIR);
    const matchingFiles = files
      .filter(f => f.startsWith(configName + '_'))
      .sort()
      .reverse();
    const resultFile = matchingFiles[0];
    
    if (!resultFile) {
      console.error(chalk.red(`❌ Config "${configName}" non trouvée dans les résultats`));
      console.log(chalk.yellow('\n💡 Configs disponibles:'));
      const availableConfigs = [...new Set(files.map(f => f.split('_')[0]))];
      availableConfigs.forEach(c => console.log(chalk.white(`   - ${c}`)));
      process.exit(1);
    }
    
    console.log(chalk.green(`✅ Config trouvée: ${resultFile}`));
    
    // 2. Charger les données
    const resultPath = path.join(RESULTS_DIR, resultFile);
    const resultData = JSON.parse(await fs.readFile(resultPath, 'utf8'));
    
    console.log(chalk.cyan(`📊 ${resultData.fonts.length} polices`));
    console.log(chalk.blue(`⚙️  Params: n=${resultData.config.nNeighbors}, d=${resultData.config.minDist}, metric=${resultData.config.metric}`));
    
    // 3. Créer le dossier public/data
    await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
    
    // 4. Copier typography_data.json
    const typographyDataPath = path.join(PUBLIC_DATA_DIR, 'typography_data.json');
    await fs.writeFile(typographyDataPath, JSON.stringify(resultData, null, 2), 'utf8');
    console.log(chalk.green(`✅ typography_data.json déployé`));
    
    // 5. Copier le sprite SVG
    const spriteSrc = path.join(OUTPUT_DIR, 'sprites', 'font-sprite.svg');
    const spriteDest = path.join(PUBLIC_DATA_DIR, 'font-sprite.svg');
    
    try {
      await fs.copyFile(spriteSrc, spriteDest);
      console.log(chalk.green(`✅ font-sprite.svg déployé`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Sprite non trouvé (générez avec: npm run generate-sprite)`));
    }
    
    // 6. Copier les SVG sentences
    const sentencesSrc = path.join(OUTPUT_DIR, 'svgs');
    const sentencesDest = path.join(PUBLIC_DATA_DIR, 'sentences');
    
    try {
      await fs.mkdir(sentencesDest, { recursive: true });
      const files = await fs.readdir(sentencesSrc);
      const sentenceFiles = files.filter(f => f.endsWith('_sentence.svg'));
      
      console.log(chalk.blue(`📁 Copie de ${sentenceFiles.length} sentences...`));
      
      for (const file of sentenceFiles) {
        await fs.copyFile(
          path.join(sentencesSrc, file),
          path.join(sentencesDest, file)
        );
      }
      console.log(chalk.green(`✅ ${sentenceFiles.length} sentences déployées`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Sentences non trouvées`));
    }
    
    // 7. Copier les SVG char
    const charDest = path.join(PUBLIC_DATA_DIR, 'char');
    
    try {
      await fs.mkdir(charDest, { recursive: true });
      const files = await fs.readdir(sentencesSrc);
      const charFiles = files.filter(f => f.endsWith('_a.svg'));
      
      console.log(chalk.blue(`📁 Copie de ${charFiles.length} chars...`));
      
      for (const file of charFiles) {
        await fs.copyFile(
          path.join(sentencesSrc, file),
          path.join(charDest, file)
        );
      }
      console.log(chalk.green(`✅ ${charFiles.length} chars déployés`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Chars non trouvés`));
    }
    
    // 8. Résumé
    console.log(chalk.green.bold('\n🎉 Déploiement terminé !'));
    console.log(chalk.cyan('📦 Fichiers déployés:'));
    console.log(chalk.white('   - public/data/typography_data.json'));
    console.log(chalk.white('   - public/data/font-sprite.svg'));
    console.log(chalk.white('   - public/data/sentences/'));
    console.log(chalk.white('   - public/data/char/'));
    
  } catch (error) {
    console.error(chalk.red('💥 Erreur:'), error.message);
    process.exit(1);
  }
}

// Récupérer le nom de config depuis les arguments
const configName = process.argv[2];

if (!configName) {
  console.error(chalk.red('❌ Nom de config requis'));
  console.log(chalk.yellow('\n💡 Usage:'));
  console.log(chalk.white('   npm run deploy <nom-config>'));
  console.log(chalk.white('\n   Exemple: npm run deploy base-reference'));
  process.exit(1);
}

deployConfig(configName);


