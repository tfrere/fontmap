#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemins
const RESULTS_DIR = path.join(__dirname, 'batch-testing', 'results');
const PUBLIC_DEBUG_DIR = path.join(__dirname, '../../..', 'public', 'debug-umap');

/**
 * Copie les résultats UMAP dans le dossier public pour l'accès web
 */
async function copyResultsToPublic() {
  try {
    console.log(chalk.blue.bold('📁 Copie des résultats UMAP vers public/debug-umap\n'));
    
    // Créer le dossier de destination
    await fs.mkdir(PUBLIC_DEBUG_DIR, { recursive: true });
    
    // Lister tous les fichiers de résultats
    const files = await fs.readdir(RESULTS_DIR);
    const resultFiles = files.filter(file => file.endsWith('.json'));
    
    if (resultFiles.length === 0) {
      console.log(chalk.yellow('⚠️  Aucun résultat trouvé. Exécutez d\'abord: npm run batch-test'));
      return;
    }
    
    console.log(chalk.blue(`📋 ${resultFiles.length} fichiers à copier...`));
    
    // Copier chaque fichier
    for (const file of resultFiles) {
      const sourcePath = path.join(RESULTS_DIR, file);
      const destPath = path.join(PUBLIC_DEBUG_DIR, file);
      
      await fs.copyFile(sourcePath, destPath);
      console.log(chalk.green(`✅ ${file}`));
    }
    
    // Créer un fichier index avec la liste des configurations
    const configs = [];
    for (const file of resultFiles) {
      const content = await fs.readFile(path.join(RESULTS_DIR, file), 'utf8');
      const data = JSON.parse(content);
      configs.push({
        filename: file,
        testName: data.config?.testName || 'unknown',
        config: data.config,
        metadata: data.metadata,
        timestamp: data.metadata?.generated_at || new Date().toISOString()
      });
    }
    
    // Trier par nom de test puis par timestamp
    configs.sort((a, b) => {
      if (a.testName !== b.testName) {
        return a.testName.localeCompare(b.testName);
      }
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    const indexContent = {
      generated_at: new Date().toISOString(),
      total_configs: configs.length,
      configs: configs
    };
    
    await fs.writeFile(
      path.join(PUBLIC_DEBUG_DIR, 'index.json'),
      JSON.stringify(indexContent, null, 2)
    );
    
    console.log(chalk.green(`\n✅ ${resultFiles.length} résultats copiés vers public/debug-umap/`));
    console.log(chalk.blue(`📊 Index créé: public/debug-umap/index.json`));
    console.log(chalk.gray(`\n💡 Accessible via: http://localhost:3000/debug-umap`));
    
  } catch (error) {
    console.error(chalk.red('💥 Erreur lors de la copie:'), error.message);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  copyResultsToPublic();
}
