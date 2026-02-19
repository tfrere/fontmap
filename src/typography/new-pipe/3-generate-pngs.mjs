#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SVGS_DIR = path.join(__dirname, 'output', 'svgs');
const PNGS_DIR = path.join(__dirname, 'output', 'pngs');
const PNG_SIZE = 224; // Native CLIP ViT-B/32 input resolution

// Configuration de la barre de progression
const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | {fontName}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

/**
 * Analyse la qualité d'un PNG en vérifiant le contenu des pixels
 */
async function analyzePNGQuality(pngPath) {
  try {
    const image = sharp(pngPath);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    const totalPixels = width * height;
    
    let blackPixels = 0;
    let whitePixels = 0;
    let grayPixels = 0;
    let transparentPixels = 0;
    
    // Analyser chaque pixel
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels === 4 ? data[i + 3] : 255;
      
      // Vérifier la transparence
      if (a < 128) {
        transparentPixels++;
      }
      // Vérifier le noir (ou très sombre)
      else if (r < 50 && g < 50 && b < 50) {
        blackPixels++;
      }
      // Vérifier le blanc (ou très clair)
      else if (r > 200 && g > 200 && b > 200) {
        whitePixels++;
      }
      // Tout le reste est gris
      else {
        grayPixels++;
      }
    }
    
    const blackPercentage = (blackPixels / totalPixels) * 100;
    const whitePercentage = (whitePixels / totalPixels) * 100;
    const grayPercentage = (grayPixels / totalPixels) * 100;
    const transparentPercentage = (transparentPixels / totalPixels) * 100;
    
    return {
      totalPixels,
      blackPixels,
      whitePixels,
      grayPixels,
      transparentPixels,
      blackPercentage,
      whitePercentage,
      grayPercentage,
      transparentPercentage,
      hasContent: blackPixels > 0,
      isMostlyWhite: whitePercentage > 90,
      hasTransparency: transparentPixels > 0
    };
    
  } catch (error) {
    console.error(`❌ Error during l'analyse de la qualité PNG:`, error.message);
    return null;
  }
}

/**
 * Valide la qualité d'un PNG
 */
function validatePNGQuality(analysis, fontFamily) {
  const issues = [];
  
  if (!analysis) {
    issues.push('Impossible d\'analyser le PNG');
    return { valid: false, issues };
  }
  
  // Vérifier si le PNG a du contenu noir (la police réelle)
  if (!analysis.hasContent) {
    issues.push('Aucun pixel noir trouvé (police invisible)');
    return { valid: false, issues };
  }
  
  // Vérifier si le PNG est principalement blanc (peut être vide)
  if (analysis.isMostlyWhite && analysis.blackPercentage < 1) {
    issues.push('PNG presque entièrement blanc (police trop petite)');
    return { valid: false, issues };
  }
  
  // Vérifier s'il y a trop de transparence
  if (analysis.transparentPercentage > 10) {
    issues.push('Trop de transparence détectée');
    return { valid: false, issues };
  }
  
  // Vérifier s'il y a une quantité raisonnable de contenu noir
  if (analysis.blackPercentage < 0.1) {
    issues.push('Contenu noir insuffisant (police trop fine)');
    return { valid: false, issues };
  }
  
  // Vérifier s'il y a trop de noir (peut être corrompu)
  if (analysis.blackPercentage > 50) {
    issues.push('Trop de contenu noir (possiblement corrompu)');
    return { valid: false, issues };
  }
  
  return { valid: true, issues: [] };
}

/**
 * Convertit un SVG en PNG avec validation de qualité
 */
async function convertSvgToPng(svgPath, pngPath, fontFamily) {
  try {
    const svgBuffer = await fs.readFile(svgPath);

    await sharp(svgBuffer)
      .resize(PNG_SIZE, PNG_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 } // Fond blanc
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // Forcer le fond blanc
      .png()
      .toFile(pngPath);

    // Analyze quality du PNG
    const analysis = await analyzePNGQuality(pngPath);
    const validation = validatePNGQuality(analysis, fontFamily);
    
    if (!validation.valid) {
      console.warn(`⚠️  PNG de mauvaise qualité pour ${fontFamily}: ${validation.issues.join(', ')}`);
      return { success: false, analysis, issues: validation.issues };
    }
    
    return { success: true, analysis, issues: [] };
    
  } catch (error) {
    console.error(`❌ Error during la conversion ${svgPath}:`, error.message);
    return { success: false, analysis: null, issues: [error.message] };
  }
}

/**
 * Traite un fichier SVG pour conversion en PNG.
 * Accepte les SVG _embed.svg (multi-glyphes pour CLIP) ou _a.svg (fallback).
 */
async function processEmbedSVG(svgFile, currentIndex, totalFiles) {
  const svgPath = path.join(SVGS_DIR, svgFile);
  
  const pngFile = svgFile.replace('.svg', '.png');
  const pngPath = path.join(PNGS_DIR, pngFile);
  
  const fontId = svgFile.replace('_embed.svg', '').replace('_a.svg', '');
  const fontFamily = fontId.replace(/-/g, ' ');
  
  try {
    const result = await convertSvgToPng(svgPath, pngPath, fontFamily);
    
    if (result.success) {
      return {
        success: true,
        fontFamily,
        fontId,
        pngPath: pngPath,
        dimensions: {
          width: PNG_SIZE,
          height: PNG_SIZE
        },
        quality: result.analysis
      };
    } else {
      return {
        success: false,
        fontFamily,
        fontId,
        error: `Qualité insuffisante: ${result.issues.join(', ')}`,
        quality: result.analysis
      };
    }
    
  } catch (error) {
    return {
      success: false,
      fontFamily,
      fontId,
      error: error.message
    };
  }
}

/**
 * Fonction principale
 */
async function main() {
  try {
    console.log(chalk.blue.bold(`🖼️  Génération des PNG ${PNG_SIZE}x${PNG_SIZE} multi-glyphes pour CLIP...\n`));

    // Create directory PNG si nécessaire
    await fs.mkdir(PNGS_DIR, { recursive: true });
    console.log(chalk.green(`📁 Directory created : ${PNGS_DIR}`));

    // Lire tous les fichiers SVG — préférer les _embed.svg (multi-glyphes), fallback sur _a.svg
    const svgFiles = await fs.readdir(SVGS_DIR);
    const embedSvgFiles = svgFiles.filter(file => file.endsWith('_embed.svg'));
    const letterASvgFiles = svgFiles.filter(file => file.endsWith('_a.svg'));

    // Construire la liste: utiliser _embed quand disponible, sinon _a
    const embedIds = new Set(embedSvgFiles.map(f => f.replace('_embed.svg', '')));
    const fallbackFiles = letterASvgFiles.filter(f => !embedIds.has(f.replace('_a.svg', '')));
    const targetSvgFiles = [...embedSvgFiles, ...fallbackFiles];

    if (targetSvgFiles.length === 0) {
      throw new Error('Aucun fichier SVG trouvé dans ' + SVGS_DIR);
    }

    console.log(chalk.cyan(`📁 ${embedSvgFiles.length} SVG embed (multi-glyphes) + ${fallbackFiles.length} fallback (lettre A)`));
    console.log(chalk.cyan(`📁 ${targetSvgFiles.length} fichiers SVG à traiter\n`));

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < targetSvgFiles.length; i++) {
      const svgFile = targetSvgFiles[i];
      
      console.log(chalk.magenta(`\n🔤 [${i + 1}/${targetSvgFiles.length}] Traitement de "${svgFile}"`));
      
      progressBar.start(1, 0, { fontName: svgFile });
      
      const result = await processEmbedSVG(svgFile, i, targetSvgFiles.length);
      
      progressBar.update(1, { fontName: svgFile });
      progressBar.stop();
      
      results.push(result);
      
      if (result.success) {
        successCount++;
        console.log(chalk.green(`✅ PNG généré : ${result.fontFamily} (${result.dimensions.width}x${result.dimensions.height}) - ${result.quality.blackPercentage.toFixed(1)}% noir`));
      } else {
        errorCount++;
        console.log(chalk.red(`❌ PNG rejeté : ${result.fontFamily} - ${result.error}`));
      }
      
      const progress = ((i + 1) / targetSvgFiles.length) * 100;
      console.log(chalk.blue(`📈 Progrès global : ${i + 1}/${targetSvgFiles.length} fichiers (${progress.toFixed(1)}%)`));
      console.log(chalk.blue(`📊 Success: ${successCount}, Erreurs: ${errorCount}\n`));
    }

    console.log(chalk.green.bold('🎉 Génération des PNG terminée !'));
    console.log(chalk.cyan('📊 Summary :'));
    console.log(chalk.white(`   - ${successCount} PNG générés avec succès`));
    console.log(chalk.white(`   - ${errorCount} erreurs`));
    console.log(chalk.white(`   - ${targetSvgFiles.length} fichiers traités`));
    console.log(chalk.white(`   - Résolution: ${PNG_SIZE}x${PNG_SIZE} (résolution native CLIP)`));
    console.log(chalk.white(`   - Dossier de sortie : ${PNGS_DIR}`));

    if (errorCount > 0) {
      console.log(chalk.red('\n❌ Polices avec erreurs :'));
      results
        .filter(r => !r.success)
        .forEach(r => console.log(chalk.red(`   - ${r.fontFamily}: ${r.error}`)));
    }

  } catch (error) {
    console.error(chalk.red('❌ Erreur :'), error.message);
    process.exit(1);
  }
}

// Lancer le script
main();
