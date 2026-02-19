#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createWriteStream } from 'fs';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(__dirname, 'input', 'font-index.json');
const OUTPUT_DIR = path.join(__dirname, 'output', 'fonts');

// Progress bar configuration
const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | {fontName}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

// Create output directory if it doesn't exist
async function ensureOutputDir() {
  try {
    await fs.access(OUTPUT_DIR);
  } catch {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(chalk.green(`📁 Directory created: ${OUTPUT_DIR}`));
  }
}

// Download a file
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(filePath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlink(filePath).catch(() => {}); // Remove partial file
        reject(new Error(`HTTP Error ${response.statusCode} for ${url}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlink(filePath).catch(() => {}); // Remove partial file
      reject(err);
    });
  });
}

// Download all fonts from a family
async function downloadFontFamily(fontId, fontData, currentIndex, totalFamilies) {
  const fontDir = path.join(OUTPUT_DIR, fontId);
  
  // Create directory for this font family
  try {
    await fs.access(fontDir);
  } catch {
    await fs.mkdir(fontDir, { recursive: true });
  }

  let downloadedCount = 0;
  const totalFiles = countTotalFiles(fontData);
  const allFiles = getAllFiles(fontData, fontId);

  // Start progress bar for this family
  progressBar.start(totalFiles, 0, { fontName: fontData.family });

  // Process all files
  for (const fileInfo of allFiles) {
    const { fileName, filePath, url } = fileInfo;
    
    try {
      // Check if file already exists
      try {
        await fs.access(filePath);
        downloadedCount++;
        progressBar.update(downloadedCount, { fontName: fontData.family });
        continue;
      } catch {
        // File doesn't exist, download it
      }

      await downloadFile(url, filePath);
      downloadedCount++;
      progressBar.update(downloadedCount, { fontName: fontData.family });
    } catch (error) {
      // On error, continue but don't increment counter
      console.log(chalk.red(`\n❌ Error for ${fileName}: ${error.message}`));
    }
  }

  progressBar.stop();
  return downloadedCount;
}

// Count total number of files for a family
function countTotalFiles(fontData) {
  let count = 0;
  for (const weightData of Object.values(fontData.variants)) {
    for (const styleData of Object.values(weightData)) {
      for (const subsetData of Object.values(styleData)) {
        count += Object.keys(subsetData.url).length;
      }
    }
  }
  return count;
}

// Get main files from a family (weight 400, normal style, default subset)
function getAllFiles(fontData, fontId) {
  const files = [];
  const fontDir = path.join(OUTPUT_DIR, fontId);
  
  // Look for main variant: weight 400, normal style
  const mainWeight = fontData.variants['400'];
  if (!mainWeight) {
    // If no weight 400, take first available weight
    const firstWeight = Object.keys(fontData.variants)[0];
    const firstWeightData = fontData.variants[firstWeight];
    const normalStyle = firstWeightData['normal'];
    
    if (normalStyle) {
      // Use default subset or first available
      const defaultSubset = fontData.defSubset || Object.keys(normalStyle)[0];
      const subsetData = normalStyle[defaultSubset];
      
      if (subsetData) {
        for (const [format, url] of Object.entries(subsetData.url)) {
          const fileName = `${fontId}-${firstWeight}-normal-${defaultSubset}.${format}`;
          const filePath = path.join(fontDir, fileName);
          files.push({ fileName, filePath, url });
        }
      }
    }
    return files;
  }
  
  const normalStyle = mainWeight['normal'];
  if (!normalStyle) {
    // Si pas de style normal, prendre le premier style disponible
    const firstStyle = Object.keys(mainWeight)[0];
    const firstStyleData = mainWeight[firstStyle];
    const defaultSubset = fontData.defSubset || Object.keys(firstStyleData)[0];
    const subsetData = firstStyleData[defaultSubset];
    
    if (subsetData) {
      for (const [format, url] of Object.entries(subsetData.url)) {
        const fileName = `${fontId}-400-${firstStyle}-${defaultSubset}.${format}`;
        const filePath = path.join(fontDir, fileName);
        files.push({ fileName, filePath, url });
      }
    }
    return files;
  }
  
  // Utiliser le subset par défaut ou le premier disponible
  const defaultSubset = fontData.defSubset || Object.keys(normalStyle)[0];
  const subsetData = normalStyle[defaultSubset];
  
  if (subsetData) {
    for (const [format, url] of Object.entries(subsetData.url)) {
      const fileName = `${fontId}-400-normal-${defaultSubset}.${format}`;
      const filePath = path.join(fontDir, fileName);
      files.push({ fileName, filePath, url });
    }
  }
  
  return files;
}

// Main function
async function main() {
  try {
    console.log(chalk.blue.bold('🚀 Starting download of main fonts...\n'));

    // Check that input file exists
    try {
      await fs.access(INPUT_FILE);
    } catch {
      throw new Error(`Input file not found: ${INPUT_FILE}`);
    }

    // Create output directory
    await ensureOutputDir();

    // Read font index file
    console.log(chalk.yellow('📖 Reading font-index.json file...'));
    const fontIndexData = JSON.parse(await fs.readFile(INPUT_FILE, 'utf8'));
    
    const fontIds = Object.keys(fontIndexData);
    console.log(chalk.cyan(`📊 ${fontIds.length} font families found`));
    console.log(chalk.yellow('📝 Mode: Download main variants only (weight 400, normal style)\n'));

    let totalDownloaded = 0;
    let processedFamilies = 0;

    // Télécharger chaque famille de polices
    for (let i = 0; i < fontIds.length; i++) {
      const fontId = fontIds[i];
      const fontData = fontIndexData[fontId];
      
      console.log(chalk.magenta(`\n🔤 [${i + 1}/${fontIds.length}] Traitement de "${fontData.family}" (${fontId})`));
      
      const downloaded = await downloadFontFamily(fontId, fontData, i, fontIds.length);
      totalDownloaded += downloaded;
      processedFamilies++;

      // Afficher le progrès global
      const progress = ((processedFamilies / fontIds.length) * 100).toFixed(1);
      console.log(chalk.green(`✅ ${downloaded} fichiers téléchargés pour "${fontData.family}"`));
      console.log(chalk.blue(`📈 Progrès global : ${processedFamilies}/${fontIds.length} familles (${progress}%)`));
      console.log(chalk.blue(`📊 Total téléchargé : ${totalDownloaded} fichiers\n`));
    }

    console.log(chalk.green.bold('🎉 Téléchargement terminé !'));
    console.log(chalk.cyan('📊 Summary :'));
    console.log(chalk.white(`   - ${processedFamilies} familles de polices traitées`));
    console.log(chalk.white(`   - ${totalDownloaded} fichiers téléchargés`));
    console.log(chalk.white(`   - Dossier de sortie : ${OUTPUT_DIR}`));

  } catch (error) {
    console.error(chalk.red('❌ Erreur :'), error.message);
    process.exit(1);
  }
}

// Lancer le script
main();
