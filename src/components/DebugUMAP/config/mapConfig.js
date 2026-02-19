/**
 * Configuration centralisée pour la DebugUMAP
 * Ce fichier contient toutes les constantes et paramètres de l'interface
 */

// ============================================================================
// CONFIGURATION DU ZOOM ET NAVIGATION
// ============================================================================
export const ZOOM_CONFIG = {
  // Limites de zoom
  scaleExtent: [0.4, 10.0], // Zoom min/max plus étendu
  
  // Zoom initial
  initialScale: 0.8, // 80% par défaut
  
  // Animation
  transitionDuration: 750, // Durée des transitions en ms
  
  // Comportement
  wheelDelta: 0.002, // Sensibilité de la molette
  doubleClickZoom: true // Zoom sur double-clic
};

// ============================================================================
// CONFIGURATION DES GLYPHES
// ============================================================================
export const GLYPH_CONFIG = {
  // Taille des glyphes
  size: {
    min: 0.05,
    max: 1.0,
    step: 0.05,
    default: 0.25
  },
  
  // Chargement par batch
  batchLoading: {
    enabled: true,
    batchSize: 40, // Nombre de glyphes par batch
    delay: 10, // Délai entre les batches en ms
    maxConcurrent: 5 // Nombre max de requêtes simultanées
  },
  
  // Performance
  performance: {
    enableVirtualization: false, // Virtualisation pour de très gros datasets
    renderThreshold: 1000, // Seuil pour activer l'optimisation
    debounceDelay: 100 // Délai de debounce pour les updates
  }
};

// ============================================================================
// CONFIGURATION DES CENTROÏDES
// ============================================================================
export const CENTROID_CONFIG = {
  // Style du texte
  text: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Arial, Helvetica, sans-serif',
    strokeWidth: 4
  },
  
  // Couleurs
  colors: {
    stroke: {
      light: '#ffffff', // Bordure en mode clair
      dark: '#000000'   // Bordure en mode sombre
    },
    fallback: '#95a5a6' // Couleur par défaut si pas de catégorie
  },
  
  // Comportement
  behavior: {
    showOnLoad: true, // Afficher par défaut
    adaptiveSize: true, // Taille adaptative au zoom
    minFontSize: 8, // Taille minimum
    maxFontSize: 24 // Taille maximum
  }
};

// ============================================================================
// CONFIGURATION DES COULEURS
// ============================================================================
export const COLOR_CONFIG = {
  // Couleurs par catégorie
  categories: {
    'sans-serif': '#3498db',
    'serif': '#e74c3c',
    'display': '#f39c12',
    'handwriting': '#9b59b6',
    'monospace': '#2ecc71'
  },
  
  // Couleurs par défaut (mode noir/blanc)
  defaults: {
    light: '#333333',
    dark: '#ffffff'
  },
  
  // Thème
  theme: {
    autoDetect: true, // Détection automatique du thème système
    defaultMode: 'light' // Mode par défaut si pas de détection
  }
};

// ============================================================================
// CONFIGURATION DE L'INTERFACE
// ============================================================================
export const UI_CONFIG = {
  // Positions des éléments
  positions: {
    leva: { top: 20, left: 20 },
    configDisplay: { top: 20, right: 20 },
    loading: { top: '50%', left: '50%' } // Centré
  },
  
  // Tailles
  sizes: {
    leva: { width: 280 },
    configDisplay: { maxWidth: 300 },
    loading: { size: 40 }
  },
  
  // Animations
  animations: {
    fadeIn: 300,
    fadeOut: 200,
    slideIn: 400
  },
  
  // Responsive
  responsive: {
    breakpoints: {
      mobile: 768,
      tablet: 1024,
      desktop: 1200
    },
    adaptiveUI: true // Adapter l'UI selon la taille d'écran
  }
};

// ============================================================================
// CONFIGURATION DES DONNÉES
// ============================================================================
export const DATA_CONFIG = {
  // Chemins des fichiers
  paths: {
    configs: '/debug-umap/',
    glyphs: '/data/char/',
    fallback: '/debug-umap/glyphs/'
  },
  
  // Cache
  cache: {
    enabled: true,
    maxSize: 50, // Nombre max d'éléments en cache
    ttl: 300000 // Time to live en ms (5 minutes)
  },
  
  // Validation
  validation: {
    strictMode: false, // Mode strict pour la validation des données
    logErrors: true // Logger les erreurs de validation
  }
};

// ============================================================================
// CONFIGURATION DES PERFORMANCES
// ============================================================================
export const PERFORMANCE_CONFIG = {
  // Monitoring
  monitoring: {
    enabled: true,
    logLevel: 'warn', // 'debug', 'info', 'warn', 'error'
    trackMetrics: true // Suivre les métriques de performance
  },
  
  // Optimisations
  optimizations: {
    enableRAF: true, // RequestAnimationFrame pour les animations
    enableIntersectionObserver: true, // Observer pour la virtualisation
    enableWebWorkers: false // Web Workers pour le traitement (expérimental)
  },
  
  // Limites
  limits: {
    maxGlyphs: 10000, // Nombre max de glyphes à afficher
    maxConfigs: 100, // Nombre max de configurations
    memoryThreshold: 100 * 1024 * 1024 // 100MB en bytes
  }
};

// ============================================================================
// CONFIGURATION GLOBALE
// ============================================================================
export const MAP_CONFIG = {
  zoom: ZOOM_CONFIG,
  glyph: GLYPH_CONFIG,
  centroid: CENTROID_CONFIG,
  color: COLOR_CONFIG,
  ui: UI_CONFIG,
  data: DATA_CONFIG,
  performance: PERFORMANCE_CONFIG,
  
  // Version de la config (pour la compatibilité)
  version: '1.0.0',
  
  // Mode debug
  debug: {
    enabled: process.env.NODE_ENV === 'development',
    verbose: false,
    showMetrics: false
  }
};

// ============================================================================
// UTILITAIRES DE CONFIGURATION
// ============================================================================

/**
 * Obtenir une valeur de configuration avec fallback
 * @param {string} path - Chemin vers la valeur (ex: 'zoom.scaleExtent')
 * @param {any} fallback - Valeur par défaut
 * @returns {any} La valeur de configuration
 */
export function getConfig(path, fallback = null) {
  const keys = path.split('.');
  let value = MAP_CONFIG;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return fallback;
    }
  }
  
  return value;
}

/**
 * Mettre à jour une valeur de configuration
 * @param {string} path - Chemin vers la valeur
 * @param {any} newValue - Nouvelle valeur
 */
export function setConfig(path, newValue) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let target = MAP_CONFIG;
  
  for (const key of keys) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }
  
  target[lastKey] = newValue;
}

/**
 * Valider la configuration
 * @returns {Object} Résultat de la validation
 */
export function validateConfig() {
  const errors = [];
  const warnings = [];
  
  // Validation des valeurs critiques
  if (MAP_CONFIG.zoom.scaleExtent[0] >= MAP_CONFIG.zoom.scaleExtent[1]) {
    errors.push('scaleExtent: min doit être inférieur à max');
  }
  
  if (MAP_CONFIG.glyph.size.min >= MAP_CONFIG.glyph.size.max) {
    errors.push('glyph.size: min doit être inférieur à max');
  }
  
  if (MAP_CONFIG.glyph.batchLoading.batchSize <= 0) {
    errors.push('glyph.batchLoading.batchSize doit être positif');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Export par défaut
export default MAP_CONFIG;
