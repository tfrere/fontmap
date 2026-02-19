#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SVGS_DIR = path.join(__dirname, 'output', 'svgs');
const DATA_DIR = path.join(__dirname, 'output', 'data');
const SPRITES_DIR = path.join(__dirname, 'output', 'sprites');
const OUTPUT_SPRITE = path.join(SPRITES_DIR, 'font-sprite.svg');

// Configuration de la barre de progression
const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | {fileName}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

/**
 * Génère le sprite SVG à partir de tous les fichiers SVG
 */
async function generateSvgSprite() {
  console.log(chalk.blue.bold('🎨 Génération du sprite SVG...\n'));

  try {
    // Lire tous les fichiers SVG (seulement les lettres A)
    const files = await fs.readdir(SVGS_DIR);
    const svgFiles = files.filter(file => file.endsWith('_a.svg'));

    if (svgFiles.length === 0) {
      throw new Error(`Aucun fichier SVG trouvé dans ${SVGS_DIR}`);
    }

    console.log(chalk.cyan(`📁 ${svgFiles.length} fichiers SVG trouvés\n`));

    let sprites = [];
    let processedCount = 0;
    let errorCount = 0;

    // Traiter chaque SVG
    for (let i = 0; i < svgFiles.length; i++) {
      const file = svgFiles[i];
      
      // Démarrer la barre de progression
      progressBar.start(1, 0, { fileName: file });
      
      try {
        const filePath = path.join(SVGS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');

        // Extraire le contenu SVG (sans les balises <svg>)
        const match = content.match(/<svg[^>]*>(.*?)<\/svg>/s);
        if (!match) {
          errorCount++;
          progressBar.update(1, { fileName: file });
          progressBar.stop();
          console.warn(chalk.yellow(`⚠️  Contenu SVG invalide: ${file}`));
          continue;
        }

        const innerContent = match[1].trim();
        if (!innerContent) {
          errorCount++;
          progressBar.update(1, { fileName: file });
          progressBar.stop();
          console.warn(chalk.yellow(`⚠️  Contenu Empty SVG: ${file}`));
          continue;
        }

        // Créer l'ID du symbole à partir du nom de fichier
        const symbolId = file.replace('.svg', '');

        // Extraire le viewBox s'il est présent
        const viewBoxMatch = content.match(/viewBox=["']([^"']+)["']/);
        const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 80 80';

        // Créer le symbole
        sprites.push(`  <symbol id="${symbolId}" viewBox="${viewBox}">
    ${innerContent}
  </symbol>`);

        processedCount++;
        progressBar.update(1, { fileName: file });
        progressBar.stop();

        // Afficher le progrès
        if (processedCount % 100 === 0) {
          console.log(chalk.yellow(`⚡ ${processedCount}/${svgFiles.length} SVG traités...`));
        }

      } catch (error) {
        errorCount++;
        progressBar.update(1, { fileName: file });
        progressBar.stop();
        console.warn(chalk.red(`⚠️  Erreur avec ${file}:`), error.message);
      }
    }

    // Créer le sprite final
    const spriteContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display: none;">
  <defs>
${sprites.join('\n')}
  </defs>
</svg>`;

    // Create output directory si nécessaire
    await fs.mkdir(path.dirname(OUTPUT_SPRITE), { recursive: true });
    console.log(chalk.green(`📁 Directory created : ${SPRITES_DIR}`));

    // Write file sprite
    await fs.writeFile(OUTPUT_SPRITE, spriteContent, 'utf-8');

    console.log(chalk.green(`✅ Sprite SVG généré avec ${sprites.length} symboles`));
    console.log(chalk.blue(`📍 Fichier : ${OUTPUT_SPRITE}`));
    console.log(chalk.blue(`📊 Taille : ${(spriteContent.length / 1024).toFixed(1)} KB`));

    // Plus besoin de mapping - on utilise directement fontId + "_a"
    console.log(chalk.green(`🗺️  Mapping supprimé - utilisation directe des IDs`));

    // Statistics finales
    console.log(chalk.cyan('\n📊 Summary :'));
    console.log(chalk.white(`   - ${processedCount} symboles générés avec succès`));
    console.log(chalk.white(`   - ${errorCount} erreurs`));
    console.log(chalk.white(`   - ${svgFiles.length} fichiers traités`));
    console.log(chalk.white(`   - Taille du sprite : ${(spriteContent.length / 1024).toFixed(1)} KB`));

  } catch (error) {
    console.error(chalk.red('❌ Error during la génération :'), error.message);
    process.exit(1);
  }
}

// Lancer le script
generateSvgSprite();
