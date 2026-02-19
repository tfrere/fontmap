#!/usr/bin/env node

import { pipeline } from '@huggingface/transformers';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test de compatibilité CLIP sur MacBook Pro
 */
async function testCLIPCompatibility() {
  console.log(chalk.blue.bold('🧪 Test de compatibilité CLIP sur MacBook Pro\n'));
  
  try {
    console.log(chalk.yellow('🔄 Chargement du modèle CLIP Vision...'));
    console.log(chalk.gray('   (Première exécution: téléchargement du modèle ~500MB)'));
    
    const featureExtractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    
    console.log(chalk.green('✅ Modèle CLIP chargé avec succès !'));
    
    // Test avec une vraie image PNG si disponible
    console.log(chalk.yellow('\n🔄 Test d\'extraction d\'embedding...'));
    
    const pngsDir = path.join(__dirname, 'output', 'pngs');
    let pngPath;
    try {
      // Chercher un fichier PNG existant
      const files = await fs.readdir(pngsDir);
      const pngFile = files.find(f => f.endsWith('_a.png'));
      
      if (pngFile) {
        pngPath = path.join(pngsDir, pngFile);
        console.log(chalk.blue(`   📁 Utilisation de l'image: ${pngFile}`));
      } else {
        throw new Error('Aucun PNG trouvé');
      }
    } catch (error) {
      console.log(chalk.yellow('   ⚠️  Aucune image PNG trouvée, utilisation d\'une URL de test...'));
      // Utiliser une URL de test
      pngPath = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/bread_small.png';
    }
    
    // Passer directement le chemin (CLIP gère le chargement)
    const result = await featureExtractor(pngPath, {
      pooling: 'mean',
      normalize: true
    });
    
    console.log(chalk.green(`✅ Embedding généré: ${result.data.length} dimensions`));
    console.log(chalk.blue(`📊 Premières valeurs: [${result.data.slice(0, 5).map(v => v.toFixed(3)).join(', ')}, ...]`));
    
    console.log(chalk.green.bold('\n🎉 CLIP est compatible avec votre MacBook Pro !'));
    console.log(chalk.cyan('\n💡 Recommandations:'));
    console.log(chalk.white('   - Le modèle sera téléchargé une seule fois (~500MB)'));
    console.log(chalk.white('   - Les embeddings sont de 512 dimensions'));
    console.log(chalk.white('   - Performance: ~100-200ms par image'));
    console.log(chalk.white('   - Mémoire: ~2-3GB pendant l\'exécution'));
    
    return true;
    
  } catch (error) {
    console.error(chalk.red('❌ Erreur avec CLIP:'), error.message);
    
    console.log(chalk.yellow('\n🔄 Test avec ResNet (fallback)...'));
    
    try {
      const resnetExtractor = await pipeline('image-feature-extraction', 'Xenova/resnet-50');
      
      // Utiliser la même image de test
      const testPngPath = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/bread_small.png';
      const resnetResult = await resnetExtractor(testPngPath, {
        pooling: 'mean',
        normalize: true
      });
      
      console.log(chalk.green(`✅ ResNet fonctionne comme fallback ! (${resnetResult.data.length} dimensions)`));
      console.log(chalk.cyan('💡 Le script utilisera ResNet si CLIP échoue'));
      return true;
    } catch (fallbackError) {
      console.error(chalk.red('❌ ResNet échoue aussi:'), fallbackError.message);
      
      console.log(chalk.red.bold('\n💥 Problème de compatibilité détecté !'));
      console.log(chalk.yellow('\n🔧 Solutions possibles:'));
      console.log(chalk.white('   1. Mettre à jour Node.js vers la dernière version'));
      console.log(chalk.white('   2. Vérifier la connexion internet (téléchargement du modèle)'));
      console.log(chalk.white('   3. Utiliser la méthode pixel-based à la place'));
      console.log(chalk.white('   4. Essayer sur un autre environnement'));
      
      return false;
    }
  }
}

/**
 * Fonction principale
 */
async function main() {
  try {
    const isCompatible = await testCLIPCompatibility();
    
    if (isCompatible) {
      console.log(chalk.green.bold('\n✅ Vous pouvez utiliser le script d\'embeddings !'));
      console.log(chalk.cyan('   Commande: npm run generate-umap-embeddings'));
    } else {
      console.log(chalk.red.bold('\n❌ Utilisez la méthode pixel-based à la place'));
      console.log(chalk.cyan('   Commande: npm run generate-umap'));
    }
    
  } catch (error) {
    console.error(chalk.red('💥 Erreur fatale:'), error.message);
    process.exit(1);
  }
}

// Lancer le test
main();
