#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { UMAP } from 'umap-js';
import { Matrix, EVD } from 'ml-matrix';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration des chemins
const EMBEDDINGS_PATH = path.join(__dirname, 'output', 'data', 'embeddings.json');
const RESULTS_DIR = path.join(__dirname, 'batch-testing', 'results');
const CONFIGS_DIR = path.join(__dirname, 'batch-testing', 'configs');

// Charger les configurations depuis le fichier JSON
let TEST_CONFIGS = [];

async function loadTestConfigs() {
  try {
    const configPath = path.join(CONFIGS_DIR, 'test-configs.json');
    const configData = await fs.readFile(configPath, 'utf8');
    TEST_CONFIGS = JSON.parse(configData);
    console.log(chalk.blue(`📋 ${TEST_CONFIGS.length} configurations chargées depuis test-configs.json`));
  } catch (error) {
    throw new Error('Impossible de charger test-configs.json');
  }
}

// Barre de progression
const progressBar = new cliProgress.SingleBar({
  format: '🔄 {testName} | {bar} | {percentage}% | {value}/{total} configs',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

/**
 * Charge les embeddings depuis le fichier JSON
 */
async function loadEmbeddings() {
  console.log(chalk.blue('📖 Chargement des embeddings CLIP...'));
  
  try {
    const data = JSON.parse(await fs.readFile(EMBEDDINGS_PATH, 'utf8'));
    
    const fontDataList = data.fonts.map(font => ({
      id: font.id,
      name: font.name,
      imageName: font.imageName,
      family: font.family,
      google_fonts_url: font.google_fonts_url,
      weights: font.weights,
      styles: font.styles,
      subsets: font.subsets,
      unicodeRange: font.unicodeRange
    }));
    
    const embeddingMatrices = data.fonts.map(font => font.embedding);
    
    console.log(chalk.green(`✅ ${fontDataList.length} polices chargées`));
    console.log(chalk.cyan(`📊 Embeddings CLIP: ${embeddingMatrices[0]?.length || 0} dimensions`));
    
    return { fontDataList, embeddingMatrices, metadata: data.metadata };
  } catch (error) {
    console.error(chalk.red('❌ Erreur lors du chargement des embeddings:'), error.message);
    console.log(chalk.yellow('\n💡 Générez d\'abord les embeddings CLIP avec:'));
    console.log(chalk.white('   npm run generate-embeddings'));
    throw error;
  }
}

/**
 * Extrait le préfixe pour la fusion (longueur fixe à 3)
 */
function extractFusionPrefix(fontId, fontData) {
  const fusionPrefixLength = 3;
  const parts = fontId.split('-');
  if (parts.length <= 1) {
    return fontId;
  }
  
  if (fontData && fontData.subsets && Array.isArray(fontData.subsets)) {
    for (const subset of fontData.subsets) {
      if (['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext'].includes(subset)) {
        continue;
      }
      
      if (fontId.includes(subset)) {
        const baseName = fontId.replace(`-${subset}`, '').replace(subset, '');
        if (baseName && baseName !== fontId) {
          return baseName;
        }
      }
    }
  }
  
  const specialCases = {
    'baloo': ['baloo-2', 'baloo-bhai-2', 'baloo-bhaijaan-2', 'baloo-bhaina-2', 'baloo-chettan-2', 'baloo-da-2', 'baloo-paaji-2', 'baloo-tamma-2', 'baloo-tammudu-2', 'baloo-thambi-2'],
    'ibm-plex': ['ibm-plex'],
    'playwrite': ['playwrite']
  };
  
  for (const [familyPrefix, patterns] of Object.entries(specialCases)) {
    for (const pattern of patterns) {
      if (fontId.startsWith(pattern)) {
        return familyPrefix;
      }
    }
  }
  
  if (fontId.startsWith('noto-serif-')) return 'noto-serif';
  if (fontId.startsWith('noto-')) return 'noto';
  
  const secondWord = parts[1];
  if (secondWord === 'sans' || secondWord === 'serif' || secondWord === 'plex') {
    return parts.slice(0, 2).join('-');
  }
  
  return parts[0];
}

/**
 * Fusionne les familles
 */
function mergeFontFamilies(fontDataList, embeddingMatrices, config) {
  if (!config.enableFontFusion) {
    return { fontDataList, embeddingMatrices };
  }
  
  const prefixGroups = {};
  const prefixEmbeddingGroups = {};
  
  for (let i = 0; i < fontDataList.length; i++) {
    const font = fontDataList[i];
    const prefix = extractFusionPrefix(font.id, font);
    
      if (!prefixGroups[prefix]) {
        prefixGroups[prefix] = [];
        prefixEmbeddingGroups[prefix] = [];
      }
    
    prefixGroups[prefix].push(font);
      prefixEmbeddingGroups[prefix].push(embeddingMatrices[i]);
  }
  
  const mergedFonts = [];
  const mergedEmbeddings = [];
  
  for (const [prefix, fonts] of Object.entries(prefixGroups)) {
    if (fonts.length > 1) {
      let representativeFont = fonts[0];
      
      if (prefix === 'noto') {
        representativeFont = fonts.find(f => f.id === 'noto-sans-arabic') || fonts[0];
      } else if (prefix === 'noto-serif') {
        representativeFont = fonts.find(f => f.id === 'noto-serif-latin') || fonts[0];
      } else if (prefix === 'ibm-plex') {
        representativeFont = fonts.find(f => f.id === 'ibm-plex-sans') || fonts[0];
      } else if (prefix === 'baloo') {
        representativeFont = fonts.find(f => f.id === 'baloo-2') || fonts[0];
      }
      
      const representativeIndex = fonts.findIndex(f => f.id === representativeFont.id);
      const representativeEmbedding = prefixEmbeddingGroups[prefix][representativeIndex];
      
      const mergedFont = {
        ...representativeFont,
        id: prefix,
        name: prefix.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        imageName: representativeFont.id
      };
      
      mergedFonts.push(mergedFont);
      mergedEmbeddings.push(representativeEmbedding);
    } else {
      mergedFonts.push({ ...fonts[0], imageName: fonts[0].id });
      mergedEmbeddings.push(prefixEmbeddingGroups[prefix][0]);
    }
  }
  
  return {
    fontDataList: mergedFonts,
    embeddingMatrices: mergedEmbeddings
  };
}

/**
 * Normalise les données (Z-score par colonne)
 */
function normalizeData(data) {
  const matrix = new Matrix(data);
  const means = matrix.mean('column');
  const stds = matrix.standardDeviation('column');
  
  for (let i = 0; i < stds.length; i++) {
    if (stds[i] === 0) stds[i] = 1;
  }
  
  const normalized = matrix.clone();
  for (let i = 0; i < normalized.rows; i++) {
    for (let j = 0; j < normalized.columns; j++) {
      normalized.set(i, j, (normalized.get(i, j) - means[j]) / stds[j]);
    }
  }
  
  return normalized;
}

/**
 * Réduction PCA: 512D → nComponents (défaut 50).
 * Réduit le bruit, accélère le k-NN, et concentre la variance utile.
 */
function applyPCA(matrix, nComponents = 50) {
  const rows = matrix.rows;
  const cols = matrix.columns;
  const target = Math.min(nComponents, cols, rows);
  
  // Centrer les données (nécessaire pour PCA)
  const means = matrix.mean('column');
  const centered = matrix.clone();
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      centered.set(i, j, centered.get(i, j) - means[j]);
    }
  }
  
  // Covariance: (1/n) * X^T * X
  const cov = centered.transpose().mmul(centered).div(rows - 1);
  
  // Eigen decomposition
  const evd = new EVD(cov);
  const eigenvalues = evd.realEigenvalues;
  const eigenvectors = evd.eigenvectorMatrix;
  
  // Trier par valeur propre décroissante
  const indices = eigenvalues
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => b.val - a.val)
    .map(item => item.idx);
  
  // Garder les top nComponents eigenvectors
  const topIndices = indices.slice(0, target);
  const projectionMatrix = new Matrix(cols, target);
  for (let j = 0; j < target; j++) {
    for (let i = 0; i < cols; i++) {
      projectionMatrix.set(i, j, eigenvectors.get(i, topIndices[j]));
    }
  }
  
  // Projeter
  const projected = centered.mmul(projectionMatrix);
  
  // Variance expliquée
  const totalVariance = eigenvalues.reduce((sum, v) => sum + Math.max(0, v), 0);
  const explainedVariance = topIndices.reduce((sum, idx) => sum + Math.max(0, eigenvalues[idx]), 0);
  const varianceRatio = totalVariance > 0 ? (explainedVariance / totalVariance * 100) : 0;
  
  console.log(chalk.cyan(`   📐 PCA: ${cols}D → ${target}D (${varianceRatio.toFixed(1)}% variance conservée)`));
  
  return projected.to2DArray();
}

/**
 * Calcule la similarité cosine entre deux vecteurs
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Pré-calcule les k plus proches voisins dans l'espace haute dimension.
 * Utilise la distance cosine (1 - similarité) sur les embeddings originaux (avant PCA).
 */
function computeHighDimKNN(embeddingMatrices, k = 8) {
  const n = embeddingMatrices.length;
  console.log(chalk.cyan(`   🔍 Calcul k-NN (k=${k}) dans l'espace ${embeddingMatrices[0].length}D...`));
  
  const neighbors = new Array(n);
  
  for (let i = 0; i < n; i++) {
    const distances = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const sim = cosineSimilarity(embeddingMatrices[i], embeddingMatrices[j]);
      distances.push({ index: j, distance: 1 - sim });
    }
    distances.sort((a, b) => a.distance - b.distance);
    neighbors[i] = distances.slice(0, k).map(d => d.index);
  }
  
  return neighbors;
}

// Configuration PCA
const PCA_COMPONENTS = 50;
const KNN_NEIGHBORS = 8;

/**
 * Génère l'embedding UMAP avec une config donnée, incluant PCA et k-NN
 */
function generateUMAPWithConfig(config, embeddingMatrices) {
  console.log(chalk.blue(`   🔄 Normalisation Z-score...`));
  const normalizedMatrix = normalizeData(embeddingMatrices);
  
  console.log(chalk.blue(`   🔄 Réduction PCA...`));
  const pcaData = applyPCA(normalizedMatrix, PCA_COMPONENTS);
  
  let randomFn = Math.random;
  if (config.randomSeed) {
    let seed = config.randomSeed;
    randomFn = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  
  const umapParams = {
    nComponents: 2,
    nNeighbors: config.nNeighbors,
    minDist: config.minDist,
    metric: 'cosine',
    random: randomFn
  };
  
  console.log(chalk.blue(`   🔄 UMAP (n=${config.nNeighbors}, d=${config.minDist})...`));
  const umap = new UMAP(umapParams);
  const embedding = umap.fit(pcaData);
  
  return embedding;
}


/**
 * Sauvegarde les résultats avec les voisins pré-calculés
 */
async function saveResults(fontDataList, embedding, config, knnNeighbors) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const resultPath = path.join(RESULTS_DIR, `${config.testName}_${timestamp}.json`);
  
  const finalData = fontDataList.map((font, i) => ({
    ...font,
    x: embedding[i][0],
    y: embedding[i][1],
    neighbors: knnNeighbors ? knnNeighbors[i].map(idx => fontDataList[idx].id) : []
  }));
  
  const result = {
    config,
    metadata: {
      generated_at: new Date().toISOString(),
      total_fonts: finalData.length,
      method: "umap_from_clip_embeddings_enhanced",
      pca_components: PCA_COMPONENTS,
      knn_neighbors: KNN_NEIGHBORS,
      note: "Multi-glyph CLIP embeddings, PCA-reduced, with high-dim k-NN pre-computed"
    },
    fonts: finalData
  };
  
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
  
  return resultPath;
}

/**
 * Teste une configuration
 */
async function testConfiguration(config, fontDataList, embeddingMatrices) {
  const startTime = Date.now();
  
  // Fusion
  const { fontDataList: mergedFonts, embeddingMatrices: mergedEmbeddings } = 
    mergeFontFamilies(fontDataList, embeddingMatrices, config);
  
  // Pré-calculer k-NN dans l'espace haute dimension (avant PCA/UMAP)
  const knnNeighbors = computeHighDimKNN(mergedEmbeddings, KNN_NEIGHBORS);
  
  // Générer UMAP (avec PCA)
  const embedding = generateUMAPWithConfig(config, mergedEmbeddings);
  
  // Sauvegarder avec les voisins
  const resultPath = await saveResults(mergedFonts, embedding, config, knnNeighbors);
  
  const duration = (Date.now() - startTime) / 1000;
  
  return {
    testName: config.testName,
    duration,
    fontsCount: mergedFonts.length,
    resultPath
  };
}

/**
 * Fonction principale
 */
async function main() {
  try {
    console.log(chalk.blue.bold('🧪 Batch Testing UMAP avec embeddings CLIP\n'));
    
    // Créer le dossier de sortie
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    // Charger les configs
    await loadTestConfigs();
    
    // Charger les embeddings CLIP
    const { fontDataList, embeddingMatrices, metadata } = await loadEmbeddings();
    
    console.log(chalk.yellow(`\n🔬 Lancement de ${TEST_CONFIGS.length} tests...\n`));
    
    progressBar.start(TEST_CONFIGS.length, 0, { testName: 'Démarrage...' });
    
    const results = [];
    
    for (let i = 0; i < TEST_CONFIGS.length; i++) {
      const config = TEST_CONFIGS[i];
      
      progressBar.update(i, { testName: config.testName });
      
      const result = await testConfiguration(config, fontDataList, embeddingMatrices);
      results.push(result);
      
      progressBar.update(i + 1, { testName: config.testName });
    }
    
    progressBar.stop();
    
    // Afficher les résultats
    console.log(chalk.green.bold('\n\n✅ Tous les tests terminés !\n'));
    console.log(chalk.cyan('📊 Résumé des tests:\n'));
    
    for (const result of results) {
      console.log(chalk.white(`  ${result.testName}:`));
      console.log(chalk.gray(`    Polices: ${result.fontsCount}`));
      console.log(chalk.gray(`    Durée: ${result.duration.toFixed(1)}s`));
      console.log(chalk.blue(`    Fichier: ${path.basename(result.resultPath)}\n`));
    }
    
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    console.log(chalk.yellow(`⏱️  Temps total: ${Math.floor(totalDuration / 60)}min ${Math.floor(totalDuration % 60)}s`));
    console.log(chalk.cyan(`📁 Résultats: ${RESULTS_DIR}`));
    console.log(chalk.blue('\n💡 Pour tester dans l\'app:'));
    console.log(chalk.white('   1. Copiez un fichier JSON vers public/debug-umap/'));
    console.log(chalk.white('   2. Ou utilisez: npm run copy-to-app'));
    
  } catch (error) {
    console.error(chalk.red('💥 Erreur:'), error.message);
    process.exit(1);
  }
}

  main();

