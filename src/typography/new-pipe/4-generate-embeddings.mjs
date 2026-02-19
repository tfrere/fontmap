#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from '@huggingface/transformers';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PNGS_DIR = path.join(__dirname, 'output', 'pngs');
const DATA_DIR = path.join(__dirname, 'output', 'data');
const FONT_INDEX_PATH = path.join(__dirname, 'input', 'font-index.json');
const OUTPUT_FILENAME = 'embeddings.json';
const FULL_OUTPUT_PATH = path.join(DATA_DIR, OUTPUT_FILENAME);

// Modèle CLIP
let clipExtractor = null;

// Configuration GPU
const USE_GPU = true; // Activer WebGPU si disponible (10-100× plus rapide)

// Configuration de la barre de progression avec ETA
const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | ' + 
          chalk.yellow('⏱️  {eta_formatted}') + ' | ' +
          chalk.blue('{speed} pol/s') + ' | {fontName}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  etaBuffer: 50 // Moyenne glissante sur 50 éléments
}, cliProgress.Presets.shades_classic);

/**
 * Initialise le modèle CLIP/SigLIP
 */
async function initializeCLIP() {
  console.log(chalk.blue('🔄 Chargement du modèle vision...'));
  
  // Modèle CLIP optimisé pour polices
  const model = { 
    name: 'Xenova/clip-vit-base-patch32', 
    label: 'CLIP ViT-B/32',
    dims: 512,
    desc: 'Optimal pour polices typographiques'
  };
  
  try {
    console.log(chalk.cyan(`   🔄 Chargement ${model.label} (${model.dims}D)...`));
    console.log(chalk.gray(`      ${model.desc}`));
    
    // Essayer avec GPU si activé
    if (USE_GPU) {
      try {
        clipExtractor = await pipeline('image-feature-extraction', model.name, {
          device: 'webgpu'
        });
        console.log(chalk.green(`✅ ${model.label} chargé avec WebGPU !`));
        return true;
      } catch (gpuError) {
        console.log(chalk.yellow(`   ⚠️  WebGPU non disponible, essai CPU...`));
      }
    }
    
    // Essayer CPU
    clipExtractor = await pipeline('image-feature-extraction', model.name);
    console.log(chalk.green(`✅ ${model.label} chargé avec succès (CPU) - ${model.dims}D`));
    return true;
    
  } catch (error) {
    console.error(chalk.red(`❌ Erreur: ${error.message}`));
    return false;
  }
}

/**
 * Génère un embedding CLIP pour une image de police
 */
async function generateCLIPEmbedding(pngPath, fontId) {
  try {
    // Extraire l'embedding CLIP
    const output = await clipExtractor(pngPath, {
      pooling: 'mean',    // Moyenne de tous les patches
      normalize: true     // Normalisation L2
    });
    
    // Extraire le vecteur final
    const embedding = Array.from(output.data);
    
    return embedding;
    
  } catch (error) {
    console.error(`❌ Erreur lors de la génération de l'embedding CLIP pour ${fontId}:`, error.message);
    return null;
  }
}

/**
 * Extrait les informations de police à partir du nom de fichier et du fichier d'index
 */
function extractFontInfoFromFilename(filename, fontIndexData) {
  const fontId = filename.replace('.png', '').replace('_embed', '').replace('_a', '');
  const fontData = fontIndexData[fontId];
  
  if (!fontData) {
    console.warn(`⚠️  Police non trouvée dans l'index: ${fontId}`);
    const fontName = fontId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const googleFontsUrl = `https://fonts.google.com/specimen/${fontName.replace(/\s+/g, '+')}`;
    
    return {
      name: fontName,
      id: fontId,
      imageName: fontId,
      family: "sans-serif",
      google_fonts_url: googleFontsUrl
    };
  }
  
  const fontName = fontId;
  const category = fontData.category;
  const googleFontsUrl = `https://fonts.google.com/specimen/${fontData.family.replace(/\s+/g, '+')}`;
  
  return {
    name: fontName,
    id: fontId,
    imageName: fontId,
    family: category,
    google_fonts_url: googleFontsUrl,
    weights: fontData.weights || [],
    styles: fontData.styles || [],
    subsets: fontData.subsets || [],
    unicodeRange: fontData.unicodeRange || {}
  };
}

/**
 * Charge toutes les données de polices et génère les embeddings CLIP
 */
async function loadAllFontDataWithEmbeddings() {
  console.log(chalk.blue('🔄 Chargement des données de polices et génération des embeddings CLIP...'));
  
  // Créer le répertoire de données si nécessaire
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  // Charger l'index des polices
  console.log(chalk.yellow('📖 Chargement de l\'index des polices...'));
  const fontIndexData = JSON.parse(await fs.readFile(FONT_INDEX_PATH, 'utf8'));
  console.log(chalk.green(`✅ Index chargé: ${Object.keys(fontIndexData).length} polices`));
  
  // Trouver les PNG d'embedding — préférer _embed.png (multi-glyphes), fallback _a.png
  const files = await fs.readdir(PNGS_DIR);
  const embedPngs = files.filter(file => file.endsWith('_embed.png'));
  const letterPngs = files.filter(file => file.endsWith('_a.png'));
  const embedIds = new Set(embedPngs.map(f => f.replace('_embed.png', '')));
  const fallbackPngs = letterPngs.filter(f => !embedIds.has(f.replace('_a.png', '')));
  const pngFiles = [...embedPngs, ...fallbackPngs];
  
  console.log(chalk.cyan(`📊 ${embedPngs.length} multi-glyphes + ${fallbackPngs.length} fallback lettre A`));
  
  if (pngFiles.length === 0) {
    throw new Error(`Aucun fichier PNG trouvé dans ${PNGS_DIR}`);
  }
  
  console.log(chalk.cyan(`📁 ${pngFiles.length} fichiers PNG trouvés`));
  
  const fontDataList = [];
  const embeddingMatrices = [];
  let rejectedCount = 0;
  
  // Variables pour le calcul du temps restant
  const startTime = Date.now();
  let lastUpdateTime = startTime;
  const timeSamples = [];
  
  // Démarrer la barre de progression
  progressBar.start(pngFiles.length, 0, { 
    fontName: 'Démarrage...', 
    eta_formatted: 'Calcul...',
    speed: '0.0'
  });
  
  // Traiter chaque fichier PNG
  for (let i = 0; i < pngFiles.length; i++) {
    const filename = pngFiles[i];
    const pngPath = path.join(PNGS_DIR, filename);
    
    // Extraire les informations de police
    const fontInfo = extractFontInfoFromFilename(filename, fontIndexData);
    
    // Générer l'embedding CLIP
    const embedding = await generateCLIPEmbedding(pngPath, fontInfo.id);
    
    if (embedding) {
      fontDataList.push(fontInfo);
      embeddingMatrices.push(embedding);
    } else {
      rejectedCount++;
    }
    
    // Calculer le temps restant
    const now = Date.now();
    const elapsed = (now - startTime) / 1000; // en secondes
    const processed = i + 1;
    const remaining = pngFiles.length - processed;
    
    // Vitesse moyenne
    const speed = processed / elapsed;
    const eta = remaining / speed; // en secondes
    
    // Formatter ETA
    let etaFormatted;
    if (eta > 3600) {
      etaFormatted = `${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}min`;
    } else if (eta > 60) {
      etaFormatted = `${Math.floor(eta / 60)}min ${Math.floor(eta % 60)}s`;
    } else {
      etaFormatted = `${Math.floor(eta)}s`;
    }
    
    // Mettre à jour la barre (toutes les secondes ou tous les 10 items)
    if (now - lastUpdateTime > 1000 || (i + 1) % 10 === 0 || i === pngFiles.length - 1) {
      progressBar.update(processed, { 
        fontName: fontInfo.id.substring(0, 20),
        eta_formatted: etaFormatted,
        speed: speed.toFixed(1)
      });
      lastUpdateTime = now;
    }
  }
  
  progressBar.update(pngFiles.length, { 
    fontName: 'Terminé',
    eta_formatted: '0s',
    speed: '0.0'
  });
  progressBar.stop();
  
  // Afficher les statistiques finales
  const totalTime = (Date.now() - startTime) / 1000;
  const avgSpeed = fontDataList.length / totalTime;
  
  console.log(chalk.green(`\n✅ ${fontDataList.length} polices chargées avec succès`));
  console.log(chalk.red(`❌ ${rejectedCount} polices rejetées pour erreurs d'embedding`));
  console.log(chalk.blue(`📊 Matrice finale: ${embeddingMatrices.length} polices × ${embeddingMatrices[0]?.length || 0} dimensions d'embedding`));
  console.log(chalk.yellow(`⏱️  Temps total: ${Math.floor(totalTime / 60)}min ${Math.floor(totalTime % 60)}s`));
  console.log(chalk.cyan(`⚡ Vitesse moyenne: ${avgSpeed.toFixed(2)} polices/s`));
  
  return { fontDataList, embeddingMatrices };
}

/**
 * Sauvegarde les embeddings
 */
async function saveEmbeddings(fontDataList, embeddingMatrices) {
  console.log(chalk.blue('💾 Sauvegarde des embeddings...'));
  
  // Métadonnées
  const metadata = {
    generated_at: new Date().toISOString(),
    method: "clip_visual_embeddings",
    model: "Xenova/clip-vit-base-patch32",
    total_fonts: fontDataList.length,
    embedding_dimensions: embeddingMatrices[0]?.length || 0,
    feature_extraction: "CLIP Vision Transformer",
    pooling: "mean",
    normalize: true,
    data_source: "CLIP ViT-B/32 embeddings from PNG images (40x40)"
  };
  
  // Structure finale
  const outputData = {
    metadata,
    fonts: fontDataList.map((font, i) => ({
      ...font,
      embedding: embeddingMatrices[i]
    }))
  };
  
  // Sauvegarder en streaming pour éviter les limites de taille de string
  console.log(chalk.cyan('📦 Sauvegarde en streaming...'));
  
  const stream = (await import('fs')).createWriteStream(FULL_OUTPUT_PATH);
  
  // Écrire l'en-tête
  stream.write('{"metadata":');
  stream.write(JSON.stringify(metadata));
  stream.write(',"fonts":[');
  
  // Écrire chaque police individuellement
  for (let i = 0; i < fontDataList.length; i++) {
    if (i > 0) stream.write(',');
    
    const fontData = {
      ...fontDataList[i],
      embedding: embeddingMatrices[i]
    };
    
    stream.write(JSON.stringify(fontData));
    
    // Progress indication
    if ((i + 1) % 500 === 0) {
      console.log(chalk.gray(`   📝 ${i + 1}/${fontDataList.length} polices écrites...`));
    }
  }
  
  // Fermer le JSON
  stream.write(']}');
  stream.end();
  
  // Attendre la fin de l'écriture
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  
  // Afficher la taille finale
  const stats = await fs.stat(FULL_OUTPUT_PATH);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  
  console.log(chalk.green(`✅ Embeddings sauvegardés dans ${FULL_OUTPUT_PATH}`));
  console.log(chalk.cyan(`📦 Taille du fichier: ${sizeMB} MB`));
  
  // Statistiques par catégorie
  const categoryStats = {};
  for (const font of fontDataList) {
    const cat = font.family;
    categoryStats[cat] = (categoryStats[cat] || 0) + 1;
  }
  
  console.log(chalk.cyan('\n📊 Distribution par catégorie:'));
  for (const [cat, count] of Object.entries(categoryStats).sort(([,a], [,b]) => b - a)) {
    const percentage = ((count / fontDataList.length) * 100).toFixed(1);
    console.log(chalk.white(`  ${cat}: ${count} polices (${percentage}%)`));
  }
}

/**
 * Fonction principale
 */
async function main() {
  try {
    console.log(chalk.blue.bold('🎨 Génération des embeddings CLIP pour toutes les polices\n'));
    
    // 1. Initialiser CLIP
    const clipReady = await initializeCLIP();
    if (!clipReady) {
      throw new Error('Impossible d\'initialiser le modèle CLIP');
    }
    
    // 2. Charger les données et générer les embeddings CLIP
    const { fontDataList, embeddingMatrices } = await loadAllFontDataWithEmbeddings();
    
    if (fontDataList.length === 0) {
      throw new Error('Aucune donnée de police valide chargée');
    }
    
    // 3. Sauvegarder les embeddings CLIP bruts
    await saveEmbeddings(fontDataList, embeddingMatrices);
    
    console.log(chalk.green.bold('\n🎉 Génération des embeddings CLIP terminée avec succès !'));
    console.log(chalk.cyan('💡 Vous pouvez maintenant générer différentes projections UMAP avec:'));
    console.log(chalk.white('   npm run generate-umap'));
    console.log(chalk.blue(`\n📊 Embeddings: ${embeddingMatrices[0]?.length || 0} dimensions (CLIP ViT-B/32)`));
    
  } catch (error) {
    console.error(chalk.red('💥 Erreur fatale:'), error.message);
    process.exit(1);
  }
}

// Lancer le script
main();
