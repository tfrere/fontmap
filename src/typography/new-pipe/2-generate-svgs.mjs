#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import opentype from 'opentype.js';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const FONTS_DIR = path.join(__dirname, 'output', 'fonts');
const SVGS_DIR = path.join(__dirname, 'output', 'svgs');
const FONT_INDEX_PATH = path.join(__dirname, 'input', 'font-index.json');

// Progress bar configuration
const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | {fontName}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

/**
 * Valide la qualité d'un SVG
 */
function validateSVGQuality(svg, fontFamily) {
  const issues = [];
  
  if (!svg || svg.trim().length === 0) {
    issues.push('Empty SVG');
    return { valid: false, issues };
  }
  
  if (!svg.includes('<path')) {
    issues.push('No path elements found');
    return { valid: false, issues };
  }
  
  const pathMatch = svg.match(/<path[^>]*d=["']([^"']+)["']/);
  if (!pathMatch || !pathMatch[1] || pathMatch[1].trim().length === 0) {
    issues.push('Empty path data');
    return { valid: false, issues };
  }
  
  const pathData = pathMatch[1];
  if (pathData.length < 10) {
    issues.push('Path data too simple');
    return { valid: false, issues };
  }
  
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    issues.push('Structure SVG invalide');
    return { valid: false, issues };
  }
  
  return { valid: true, issues: [] };
}

/**
 * Génère un SVG de la lettre A à partir d'une police (pour le sprite d'affichage)
 */
async function generateLetterASVG(fontPath, fontFamily) {
  try {
    const fontBuffer = await fs.readFile(fontPath);
    const font = opentype.parse(fontBuffer.buffer);

    const glyph = font.charToGlyph('A');
    if (!glyph || !glyph.path) {
      throw new Error('Glyph A not found or without path');
    }

    const SVG_SIZE = 80;
    const fontSize = 60;

    const tempPath = glyph.getPath(0, 0, fontSize);
    const bbox = tempPath.getBoundingBox();

    if (!bbox || bbox.x1 === undefined || bbox.x2 === undefined || 
        bbox.y1 === undefined || bbox.y2 === undefined) {
      throw new Error('Bounding box invalide');
    }

    const glyphWidth = bbox.x2 - bbox.x1;
    const glyphHeight = bbox.y2 - bbox.y1;

    if (glyphWidth <= 0 || glyphHeight <= 0) {
      throw new Error('Dimensions de glyphe invalides');
    }

    if (glyphWidth < 5 || glyphHeight < 5) {
      throw new Error('Glyphe trop petit (possiblement vide)');
    }

    const centerX = SVG_SIZE / 2;
    const centerY = SVG_SIZE / 2;

    const offsetX = centerX - (bbox.x1 + glyphWidth / 2);
    const offsetY = centerY - (bbox.y1 + glyphHeight / 2);

    const adjustedPath = glyph.getPath(offsetX, offsetY, fontSize);
    const svgPathData = adjustedPath.toPathData(2);
    
    if (!svgPathData || svgPathData.trim().length === 0) {
      throw new Error('Empty path data après génération');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}">
  <path d="${svgPathData}" fill="currentColor"/>
</svg>`;

    const validation = validateSVGQuality(svg, fontFamily);
    if (!validation.valid) {
      throw new Error(`SVG de mauvaise qualité: ${validation.issues.join(', ')}`);
    }

    return {
      svg,
      width: SVG_SIZE,
      height: SVG_SIZE,
      fontMetrics: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender
      }
    };

  } catch (error) {
    console.error(`❌ Error generating SVG for ${fontFamily}:`, error.message);
    return null;
  }
}

/**
 * Génère un SVG multi-glyphes optimisé pour CLIP embedding.
 * 
 * Rend "Hamburgefons" sur 2 lignes dans un carré 224×224, capturant :
 * - Majuscules/minuscules, ascenders (b,f,h), descenders (g), 
 *   courbes (o,e,s), diagonales (H,n), empattements, contraste de traits
 */
async function generateEmbeddingSVG(fontPath, fontFamily) {
  const EMBED_LINES = ['Hamburge', 'fonstiv'];
  const SVG_SIZE = 224;
  const PADDING = 12;

  try {
    const fontBuffer = await fs.readFile(fontPath);
    const font = opentype.parse(fontBuffer.buffer);

    const lineCount = EMBED_LINES.length;
    const availableHeight = SVG_SIZE - PADDING * 2;
    const lineHeight = availableHeight / lineCount;
    const fontSize = Math.floor(lineHeight * 0.75);

    let allPathsData = '';

    for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
      const text = EMBED_LINES[lineIdx];
      const textPath = font.getPath(text, 0, 0, fontSize);
      const bbox = textPath.getBoundingBox();

      if (!bbox || bbox.x2 - bbox.x1 <= 0 || bbox.y2 - bbox.y1 <= 0) continue;

      const textWidth = bbox.x2 - bbox.x1;
      const textHeight = bbox.y2 - bbox.y1;

      const scale = Math.min(
        (SVG_SIZE - PADDING * 2) / textWidth,
        lineHeight * 0.85 / textHeight,
        1.0
      );

      const scaledWidth = textWidth * scale;
      const offsetX = (SVG_SIZE - scaledWidth) / 2 - bbox.x1 * scale;
      const lineY = PADDING + lineIdx * lineHeight + lineHeight / 2;
      const offsetY = lineY - (bbox.y1 + textHeight / 2) * scale;

      if (scale !== 1.0) {
        const adjusted = font.getPath(text, 0, 0, fontSize * scale);
        const adjBbox = adjusted.getBoundingBox();
        const adjW = adjBbox.x2 - adjBbox.x1;
        const adjH = adjBbox.y2 - adjBbox.y1;
        const ox = (SVG_SIZE - adjW) / 2 - adjBbox.x1;
        const oy = lineY - (adjBbox.y1 + adjH / 2);
        const final = font.getPath(text, ox, oy, fontSize * scale);
        allPathsData += ` ${final.toPathData(2)}`;
      } else {
        const final = font.getPath(text, offsetX, offsetY, fontSize);
        allPathsData += ` ${final.toPathData(2)}`;
      }
    }

    allPathsData = allPathsData.trim();
    if (!allPathsData || allPathsData.length < 10) {
      throw new Error('Embedding SVG paths trop simples ou vides');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}">
  <rect width="${SVG_SIZE}" height="${SVG_SIZE}" fill="white"/>
  <path d="${allPathsData}" fill="black"/>
</svg>`;

    return {
      svg,
      width: SVG_SIZE,
      height: SVG_SIZE,
      lines: EMBED_LINES,
      fontMetrics: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender
      }
    };

  } catch (error) {
    console.error(`❌ Error generating embedding SVG for ${fontFamily}:`, error.message);
    return null;
  }
}

/**
 * Génère un SVG de phrase à partir d'une police (vectorisé)
 */
async function generateSentenceSVG(fontPath, fontFamily) {
  try {
    const fontBuffer = await fs.readFile(fontPath);
    const font = opentype.parse(fontBuffer.buffer);
    
    const loremText = 'Lorem Ipsum';
    const fontSize = 24;
    const padding = 10;
    
    // Vectoriser le texte complet en une seule opération
    const textPath = font.getPath(loremText, 0, 0, fontSize);
    const bbox = textPath.getBoundingBox();
    
    if (!bbox || bbox.x1 === undefined || bbox.x2 === undefined || 
        bbox.y1 === undefined || bbox.y2 === undefined) {
      throw new Error('Bounding box invalide pour le texte');
    }
    
    const textWidth = bbox.x2 - bbox.x1;
    const textHeight = bbox.y2 - bbox.y1;
    
    if (textWidth <= 0 || textHeight <= 0) {
      throw new Error('Dimensions de texte invalides');
    }
    
    // Calculer les dimensions du SVG avec padding
    const margin = padding;
    const svgWidth = Math.ceil(textWidth) + (margin * 2);
    const svgHeight = Math.ceil(textHeight) + (margin * 2);
    
    // Centrer le texte dans le SVG
    const offsetX = margin - bbox.x1;
    const offsetY = margin - bbox.y1;
    
    // Ajuster le chemin avec les offsets
    const adjustedPath = font.getPath(loremText, offsetX, offsetY, fontSize);
    const svgPathData = adjustedPath.toPathData(2);
    
    if (!svgPathData || svgPathData.trim().length === 0) {
      throw new Error('Empty path data après génération');
    }
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <path d="${svgPathData}" fill="currentColor"/>
</svg>`;

    // Valider la qualité du SVG
    const validation = validateSVGQuality(svg, fontFamily);
    if (!validation.valid) {
      throw new Error(`SVG de mauvaise qualité: ${validation.issues.join(', ')}`);
    }

    return {
      svg,
      width: svgWidth,
      height: svgHeight,
      text: loremText,
      measuredWidth: textWidth,
      fontMetrics: {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender
      }
    };

  } catch (error) {
    console.error(`❌ Error generating sentence SVG for ${fontFamily}:`, error.message);
    return null;
  }
}

/**
 * Traite une famille de polices
 */
async function processFontFamily(fontId, fontData, currentIndex, totalFamilies) {
  const fontDir = path.join(FONTS_DIR, fontId);
  
  try {
    // Chercher le fichier TTF principal (peut être .ttf ou .truetype)
    const files = await fs.readdir(fontDir);
    const ttfFile = files.find(f => f.endsWith('.ttf') || f.endsWith('.truetype'));
    
    if (!ttfFile) {
      throw new Error('TTF file not found');
    }
    
    const fontPath = path.join(fontDir, ttfFile);
    
    // Générer le SVG de la lettre A (pour l'affichage sprite)
    const letterResult = await generateLetterASVG(fontPath, fontData.family);
    if (!letterResult) {
      throw new Error('Failed de génération du SVG de la lettre A');
    }
    
    // Sauvegarder le SVG de la lettre A
    const letterSvgPath = path.join(SVGS_DIR, `${fontId}_a.svg`);
    await fs.writeFile(letterSvgPath, letterResult.svg, 'utf-8');

    // Générer le SVG multi-glyphes pour CLIP embedding (224×224, "Hamburgefons")
    const embedResult = await generateEmbeddingSVG(fontPath, fontData.family);
    if (!embedResult) {
      throw new Error('Failed de génération du SVG embedding multi-glyphes');
    }

    const embedSvgPath = path.join(SVGS_DIR, `${fontId}_embed.svg`);
    await fs.writeFile(embedSvgPath, embedResult.svg, 'utf-8');
    
    // Générer le SVG de la phrase
    const sentenceResult = await generateSentenceSVG(fontPath, fontData.family);
    if (!sentenceResult) {
      throw new Error('Failed de génération du SVG de la phrase');
    }
    
    // Sauvegarder le SVG de la phrase
    const sentenceSvgPath = path.join(SVGS_DIR, `${fontId}_sentence.svg`);
    await fs.writeFile(sentenceSvgPath, sentenceResult.svg, 'utf-8');
    
    return {
      success: true,
      fontId,
      fontFamily: fontData.family,
      letterSvg: letterSvgPath,
      embedSvg: embedSvgPath,
      sentenceSvg: sentenceSvgPath,
      letterDimensions: {
        width: letterResult.width,
        height: letterResult.height
      },
      embedDimensions: {
        width: embedResult.width,
        height: embedResult.height
      },
      sentenceDimensions: {
        width: sentenceResult.width,
        height: sentenceResult.height,
        measuredWidth: sentenceResult.measuredWidth
      },
      fontMetrics: letterResult.fontMetrics,
      sentenceFontMetrics: sentenceResult.fontMetrics
    };
    
  } catch (error) {
    return {
      success: false,
      fontId,
      fontFamily: fontData.family,
      error: error.message
    };
  }
}

/**
 * Fonction principale
 */
async function main() {
  try {
    console.log(chalk.blue.bold('🎨 Generating SVGs pour toutes les polices...\n'));

    // Check that file d'index existe
    try {
      await fs.access(FONT_INDEX_PATH);
    } catch {
      throw new Error(`Fichier d'index non trouvé : ${FONT_INDEX_PATH}`);
    }

    // Create output directory
    await fs.mkdir(SVGS_DIR, { recursive: true });
    console.log(chalk.green(`📁 Directory created : ${SVGS_DIR}`));

    // Read file d'index des polices
    console.log(chalk.yellow('📖 Reading file font-index.json...'));
    const fontIndexData = JSON.parse(await fs.readFile(FONT_INDEX_PATH, 'utf8'));
    
    const fontIds = Object.keys(fontIndexData);
    console.log(chalk.cyan(`📊 ${fontIds.length} familles de polices trouvées\n`));

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Traiter chaque famille de polices
    for (let i = 0; i < fontIds.length; i++) {
      const fontId = fontIds[i];
      const fontData = fontIndexData[fontId];
      
      console.log(chalk.magenta(`\n🔤 [${i + 1}/${fontIds.length}] Traitement de "${fontData.family}" (${fontId})`));
      
      // Démarrer la barre de progression
      progressBar.start(3, 0, { fontName: fontData.family });
      
      const result = await processFontFamily(fontId, fontData, i, fontIds.length);
      
      progressBar.update(3, { fontName: fontData.family });
      progressBar.stop();
      
      results.push(result);
      
      if (result.success) {
        successCount++;
        console.log(chalk.green(`✅ SVGs générés pour "${fontData.family}"`));
        console.log(chalk.blue(`   - Lettre A: ${result.letterDimensions.width}x${result.letterDimensions.height}`));
        console.log(chalk.blue(`   - Embed: ${result.embedDimensions.width}x${result.embedDimensions.height} (multi-glyphes pour CLIP)`));
        console.log(chalk.blue(`   - Phrase: ${result.sentenceDimensions.width}x${result.sentenceDimensions.height} (largeur mesurée: ${result.sentenceDimensions.measuredWidth.toFixed(1)}px)`));
      } else {
        errorCount++;
        console.log(chalk.red(`❌ Error for "${fontData.family}": ${result.error}`));
      }
      
      // Afficher le progrès global
      const progress = ((i + 1) / fontIds.length) * 100;
      console.log(chalk.blue(`📈 Progrès global : ${i + 1}/${fontIds.length} familles (${progress.toFixed(1)}%)`));
      console.log(chalk.blue(`📊 Success: ${successCount}, Erreurs: ${errorCount}\n`));
    }

    // Créer le manifest des résultats
    const manifest = {};
    const successfulResults = results.filter(r => r.success);
    
    for (const result of successfulResults) {
      manifest[result.fontFamily] = {
        id: result.fontId,
        family: 'sans-serif', // Par défaut
        images: {
          A: `svgs/${result.fontId}_a.svg`,
          sentence: `svgs/${result.fontId}_sentence.svg`
        },
        svg: {
          A: {
            path: `svgs/${result.fontId}_a.svg`,
            width: result.letterDimensions.width,
            height: result.letterDimensions.height,
            viewBox: `0 0 ${result.letterDimensions.width} ${result.letterDimensions.height}`
          },
          sentence: {
            path: `svgs/${result.fontId}_sentence.svg`,
            width: result.sentenceDimensions.width,
            height: result.sentenceDimensions.height,
            viewBox: `0 0 ${result.sentenceDimensions.width} ${result.sentenceDimensions.height}`,
            measuredWidth: result.sentenceDimensions.measuredWidth
          }
        },
        fontMetrics: result.fontMetrics,
        sentenceFontMetrics: result.sentenceFontMetrics
      };
    }

    // Sauvegarder le manifest
    const manifestPath = path.join(__dirname, 'output', 'font_manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    console.log(chalk.green.bold('🎉 Génération des SVGs terminée !'));
    console.log(chalk.cyan('📊 Summary :'));
    console.log(chalk.white(`   - ${successCount} familles traitées avec succès`));
    console.log(chalk.white(`   - ${errorCount} erreurs`));
    console.log(chalk.white(`   - ${successCount * 3} fichiers SVG générés (lettre A + embed + phrase)`));
    console.log(chalk.white(`   - Dossier de sortie : ${SVGS_DIR}`));
    console.log(chalk.white(`   - Manifest : ${manifestPath}`));

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
