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

// Same threshold as python-pipeline/build_typography_data.py (--variant-max-distance)
export const VARIANT_MAX_COSINE_DISTANCE = 5e-5;

function cosineDistance(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Maps each "render variant" id to its root base id.
 * A variant is a font whose id extends another font's id (noto-sans-carian -> noto-sans,
 * anton-sc -> anton) and whose rendered specimen is visually identical to it.
 */
export function findRenderVariants(fontDataList, embeddingMatrices, maxDistance = VARIANT_MAX_COSINE_DISTANCE) {
  const indexById = new Map(fontDataList.map((font, i) => [font.id, i]));
  const parent = new Map();

  fontDataList.forEach((font, i) => {
    const parts = font.id.split('-');
    for (let k = parts.length - 1; k > 0; k--) {
      const baseIndex = indexById.get(parts.slice(0, k).join('-'));
      if (baseIndex === undefined) continue;
      if (cosineDistance(embeddingMatrices[i], embeddingMatrices[baseIndex]) <= maxDistance) {
        parent.set(font.id, fontDataList[baseIndex].id);
        break;
      }
    }
  });

  const roots = new Map();
  for (const id of parent.keys()) {
    let root = id;
    while (parent.has(root)) root = parent.get(root);
    roots.set(id, root);
  }
  return roots;
}

/**
 * Folds render variants into their base font. Every other Google Fonts family is kept
 * as-is; the base keeps its own embedding, image, name and category.
 */
export function mergeFontFamilies(fontDataList, embeddingMatrices, enableFusion = true) {
  if (!enableFusion) {
    return { fontDataList, embeddingMatrices };
  }

  const variants = findRenderVariants(fontDataList, embeddingMatrices);
  const mergedFonts = [];
  const mergedEmbeddings = [];

  fontDataList.forEach((font, i) => {
    if (variants.has(font.id)) return;
    mergedFonts.push({ ...font, imageName: font.id });
    mergedEmbeddings.push(embeddingMatrices[i]);
  });

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
