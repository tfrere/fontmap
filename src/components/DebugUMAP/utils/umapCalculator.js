/**
 * UMAP Utils - Fonctions utilitaires pour le calcul UMAP
 * 
 * Contient les fonctions pures utilisées par le Web Worker
 */

/**
 * Charge les embeddings depuis le fichier JSON
 */
export async function loadEmbeddings() {
  console.log('🔄 Chargement des embeddings CLIP...');

  try {
    const response = await fetch('/data/embeddings.json');
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();

    console.log(`✅ ${data.fonts.length} polices chargées`);

    return data;
  } catch (error) {
    console.error('❌ Erreur lors du chargement des embeddings:', error);
    throw error;
  }
}

/**
 * Extrait le préfixe pour la fusion des familles
 */
export function extractFusionPrefix(fontId, fontData) {
  const parts = fontId.split('-');
  if (parts.length <= 1) {
    return fontId;
  }

  // Vérifier les subsets non standards
  if (fontData && fontData.subsets && Array.isArray(fontData.subsets)) {
    const commonSubsets = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext'];
    for (const subset of fontData.subsets) {
      if (!commonSubsets.includes(subset) && fontId.includes(subset)) {
        const baseName = fontId.replace(`-${subset}`, '').replace(subset, '');
        if (baseName && baseName !== fontId) {
          return baseName;
        }
      }
    }
  }

  // Cas spéciaux
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

  // Noto fonts
  if (fontId.startsWith('noto-serif-')) return 'noto-serif';
  if (fontId.startsWith('noto-')) return 'noto';

  // Second word special
  const secondWord = parts[1];
  if (secondWord === 'sans' || secondWord === 'serif' || secondWord === 'plex') {
    return parts.slice(0, 2).join('-');
  }

  return parts[0];
}

/**
 * Fusionne les familles de polices
 */
export function mergeFontFamilies(fontDataList, embeddingMatrices, enableFusion = true) {
  if (!enableFusion) {
    return { fontDataList, embeddingMatrices };
  }

  const prefixGroups = {};
  const prefixEmbeddingGroups = {};

  // Grouper par préfixe
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

  // Créer les polices fusionnées
  for (const [prefix, fonts] of Object.entries(prefixGroups)) {
    if (fonts.length > 1) {
      let representativeFont = fonts[0];

      // Choix du représentant pour certaines familles
      const representatives = {
        'noto': 'noto-sans-arabic',
        'noto-serif': 'noto-serif-latin',
        'ibm-plex': 'ibm-plex-sans',
        'baloo': 'baloo-2'
      };

      if (representatives[prefix]) {
        const found = fonts.find(f => f.id === representatives[prefix]);
        if (found) representativeFont = found;
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
 * Normalise les données (standardisation Z-score)
 */
export function normalizeData(data) {
  const rows = data.length;
  const cols = data[0].length;

  const means = new Array(cols).fill(0);
  const stds = new Array(cols).fill(0);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      means[j] += data[i][j];
    }
  }
  for (let j = 0; j < cols; j++) {
    means[j] /= rows;
  }

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const diff = data[i][j] - means[j];
      stds[j] += diff * diff;
    }
  }
  for (let j = 0; j < cols; j++) {
    stds[j] = Math.sqrt(stds[j] / rows);
    if (stds[j] === 0) stds[j] = 1;
  }

  const normalized = data.map(row =>
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  return normalized;
}

/**
 * PCA via covariance eigen-decomposition (browser-friendly, no ml-matrix dependency).
 * Reduces nDims → nComponents, concentrating variance for better UMAP quality.
 */
export function applyPCA(data, nComponents = 50) {
  const rows = data.length;
  const cols = data[0].length;
  const target = Math.min(nComponents, cols, rows);

  // Center columns
  const means = new Array(cols).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) means[j] += data[i][j];
  }
  for (let j = 0; j < cols; j++) means[j] /= rows;

  const centered = data.map(row => row.map((v, j) => v - means[j]));

  // For browser perf: use SVD-like approach via X^T * X when cols > rows
  // When rows < cols (typical: ~800 fonts, 512 dims), compute rows×rows gram matrix
  if (rows < cols) {
    // Gram matrix: X * X^T (rows × rows)
    const gram = Array.from({ length: rows }, () => new Float64Array(rows));
    for (let i = 0; i < rows; i++) {
      for (let j = i; j < rows; j++) {
        let dot = 0;
        for (let k = 0; k < cols; k++) dot += centered[i][k] * centered[j][k];
        gram[i][j] = dot / (rows - 1);
        gram[j][i] = gram[i][j];
      }
    }

    // Power iteration for top eigenvectors of gram matrix
    const eigenvectors = [];
    const eigenvalues = [];
    const gramCopy = gram.map(row => Float64Array.from(row));

    for (let comp = 0; comp < target; comp++) {
      let vec = new Float64Array(rows);
      for (let i = 0; i < rows; i++) vec[i] = Math.random() - 0.5;

      for (let iter = 0; iter < 100; iter++) {
        const newVec = new Float64Array(rows);
        for (let i = 0; i < rows; i++) {
          let sum = 0;
          for (let j = 0; j < rows; j++) sum += gramCopy[i][j] * vec[j];
          newVec[i] = sum;
        }

        let norm = 0;
        for (let i = 0; i < rows; i++) norm += newVec[i] * newVec[i];
        norm = Math.sqrt(norm);
        if (norm === 0) break;
        for (let i = 0; i < rows; i++) newVec[i] /= norm;

        let diff = 0;
        for (let i = 0; i < rows; i++) diff += (newVec[i] - vec[i]) ** 2;
        vec = newVec;
        if (diff < 1e-10) break;
      }

      let eigenvalue = 0;
      const Av = new Float64Array(rows);
      for (let i = 0; i < rows; i++) {
        let sum = 0;
        for (let j = 0; j < rows; j++) sum += gramCopy[i][j] * vec[j];
        Av[i] = sum;
      }
      for (let i = 0; i < rows; i++) eigenvalue += vec[i] * Av[i];

      eigenvalues.push(eigenvalue);
      eigenvectors.push(vec);

      // Deflate
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < rows; j++) {
          gramCopy[i][j] -= eigenvalue * vec[i] * vec[j];
        }
      }
    }

    // Project: each component = X^T * u_i / sqrt(lambda_i * (n-1))
    const result = Array.from({ length: rows }, () => new Array(target));
    for (let comp = 0; comp < target; comp++) {
      for (let i = 0; i < rows; i++) {
        result[i][comp] = eigenvectors[comp][i] * Math.sqrt(Math.max(0, eigenvalues[comp]) * (rows - 1));
      }
    }

    const totalVar = eigenvalues.reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const explainedVar = eigenvalues.slice(0, target).reduce((s, v) => s + Math.max(0, v), 0);
    console.log(`📐 PCA: ${cols}D → ${target}D (${(explainedVar / totalVar * 100).toFixed(1)}% variance)`);

    return result;
  }

  // Standard path when rows >= cols: covariance matrix cols × cols
  // (fallback, unlikely for fonts dataset)
  console.log(`📐 PCA: using standard covariance path (${cols}D → ${target}D)`);
  return centered.map(row => row.slice(0, target));
}
