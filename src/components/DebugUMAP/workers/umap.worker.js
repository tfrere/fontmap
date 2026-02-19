/* eslint-disable no-restricted-globals */
import { UMAP } from 'umap-js';
import { loadEmbeddings, mergeFontFamilies, normalizeData, applyPCA } from '../utils/umapCalculator';

// Cache pour les embeddings
let cachedData = null;

// Cache pour les résultats KNN (pour éviter de recalculer si nNeighbors ne change pas)
let cachedKNN = {
  nNeighbors: null,
  enableFontFusion: null,
  indices: null,
  distances: null
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'CALCULATE') {
    await calculateUMAP(payload);
  }
};

async function calculateUMAP(config) {
  const {
    nNeighbors = 15,
    minDist = 1.0,
    enableFontFusion = true,
    randomSeed = 42
  } = config;

  try {
    // 1. Charger les embeddings (ou utiliser le cache)
    if (!cachedData) {
      self.postMessage({ type: 'PROGRESS', payload: { stage: 'loading', progress: 0 } });
      cachedData = await loadEmbeddings();
    }

    // 2. Préparer les données
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'preparing', progress: 20 } });

    // Deep copy pour éviter de muter le cache
    const fontDataList = cachedData.fonts.map(font => ({
      id: font.id,
      name: font.name,
      imageName: font.imageName || font.id,
      family: font.family,
      google_fonts_url: font.google_fonts_url,
      weights: font.weights,
      styles: font.styles,
      subsets: font.subsets,
      unicodeRange: font.unicodeRange
    }));

    const embeddingMatrices = cachedData.fonts.map(font => font.embedding);

    // 3. Fusion des familles
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'merging', progress: 40 } });
    const { fontDataList: mergedFonts, embeddingMatrices: mergedEmbeddings } =
      mergeFontFamilies(fontDataList, embeddingMatrices, enableFontFusion);

    // 4. Normalisation + PCA
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'normalizing', progress: 45 } });
    const normalizedData = normalizeData(mergedEmbeddings);

    self.postMessage({ type: 'PROGRESS', payload: { stage: 'pca', progress: 52 } });
    const pcaData = applyPCA(normalizedData, 50);

    // 5. UMAP (on PCA-reduced data)
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'umap', progress: 60 } });

    // Générateur aléatoire avec seed
    let seed = randomSeed;
    const randomFn = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const umapParams = {
      nComponents: 2,
      nNeighbors,
      minDist,
      metric: 'cosine',
      random: randomFn
    };

    const umap = new UMAP(umapParams);

    console.log('🚀 Starting UMAP calculation...');
    const t1 = performance.now();

    // 5a. KNN & Initialization
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'umap_knn', progress: 65 } });

    // Vérifier si on peut réutiliser le KNN en cache
    // Le KNN dépend uniquement des données (fusion) et de nNeighbors
    // Il NE dépend PAS de minDist, spread, etc.
    const canReuseKNN = cachedKNN.indices &&
      cachedKNN.nNeighbors === nNeighbors &&
      cachedKNN.enableFontFusion === enableFontFusion;

    if (canReuseKNN) {
      console.log('♻️ Reusing cached KNN results');
      umap.setPrecomputedKNN(cachedKNN.indices, cachedKNN.distances);
      umap.initializeFit(pcaData);
    } else {
      console.log('🆕 Calculating new KNN');
      umap.initializeFit(pcaData);

      // Sauvegarder le KNN pour la prochaine fois
      // Note: initializeFit ne retourne pas le KNN, on doit ruser ou espérer que umap-js expose l'état
      // Heureusement, UMAP stocke knnIndices et knnDistances en interne
      // Mais ils sont privés en TypeScript... en JS on peut y accéder si on a de la chance
      // Ou on utilise initializeFit qui fait le boulot.
      // Attends, umap-js n'expose pas de getter pour KNN.
      // Mais on peut regarder si on peut l'extraire.
      // En JS, les propriétés privées sont souvent accessibles.

      // Hack: accès aux propriétés internes (si pas minifiées/privées par #)
      if (umap.knnIndices && umap.knnDistances) {
        cachedKNN = {
          nNeighbors,
          enableFontFusion,
          indices: umap.knnIndices,
          distances: umap.knnDistances
        };
      }
    }

    const t2 = performance.now();
    console.log(`⏱️ KNN & Init took: ${(t2 - t1).toFixed(2)}ms ${canReuseKNN ? '(Cached)' : ''}`);

    // 5b. Optimization (SGD)
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'umap_optimize', progress: 70 } });
    const t3 = performance.now();
    umap.optimizeLayout();
    const t4 = performance.now();
    console.log(`⏱️ Optimization took: ${(t4 - t3).toFixed(2)}ms`);
    console.log(`⏱️ Total UMAP took: ${(t4 - t1).toFixed(2)}ms`);

    const embedding = umap.getEmbedding();

    // 6. Créer le résultat final
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'finalizing', progress: 90 } });

    const finalData = mergedFonts.map((font, i) => ({
      ...font,
      x: embedding[i][0],
      y: embedding[i][1]
    }));

    const result = {
      config: {
        nNeighbors,
        minDist,
        metric: 'cosine',
        enableFontFusion,
        testName: `live-n${nNeighbors}-d${minDist}`,
        randomSeed
      },
      metadata: {
        generated_at: new Date().toISOString(),
        total_fonts: finalData.length,
        method: "umap_from_clip_embeddings_pure_visual_frontend",
        note: "100% visual embeddings, calculated in browser worker"
      },
      fonts: finalData
    };

    self.postMessage({ type: 'PROGRESS', payload: { stage: 'complete', progress: 100 } });
    self.postMessage({ type: 'RESULT', payload: result });

  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: error.message || 'Erreur inconnue dans le worker'
    });
  }
}
