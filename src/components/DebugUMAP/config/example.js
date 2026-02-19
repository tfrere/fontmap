/**
 * Exemple d'utilisation de la configuration DebugUMAP
 * Ce fichier montre comment personnaliser la configuration
 */

import { setConfig, getConfig, validateConfig } from './mapConfig.js';

// ============================================================================
// EXEMPLES D'UTILISATION
// ============================================================================

// 1. Lire une valeur de configuration
const zoomMin = getConfig('zoom.scaleExtent.0', 0.3); // Premier élément du tableau
const zoomMax = getConfig('zoom.scaleExtent.1', 3.0); // Deuxième élément du tableau
console.log(`Zoom range: ${zoomMin} - ${zoomMax}`);

// 2. Modifier une valeur de configuration
setConfig('zoom.initialScale', 0.9); // Zoom initial à 90%
setConfig('glyph.batchLoading.batchSize', 50); // Charger 50 glyphes par batch

// 3. Ajouter une nouvelle couleur de catégorie
const currentColors = getConfig('color.categories', {});
setConfig('color.categories', {
  ...currentColors,
  'script': '#e67e22' // Nouvelle catégorie
});

// 4. Personnaliser les centroïdes
setConfig('centroid.text.fontSize', 18); // Taille de police plus grande
setConfig('centroid.text.strokeWidth', 6); // Bordure plus épaisse

// 5. Activer le mode debug
setConfig('debug.enabled', true);
setConfig('debug.verbose', true);

// ============================================================================
// CONFIGURATIONS PRÉDÉFINIES
// ============================================================================

/**
 * Configuration pour un affichage haute performance
 */
export function setHighPerformanceConfig() {
  setConfig('glyph.batchLoading.batchSize', 100);
  setConfig('glyph.batchLoading.delay', 5);
  setConfig('performance.monitoring.enabled', false);
  setConfig('centroid.behavior.adaptiveSize', false);
}

/**
 * Configuration pour un affichage haute qualité
 */
export function setHighQualityConfig() {
  setConfig('glyph.batchLoading.batchSize', 20);
  setConfig('glyph.batchLoading.delay', 20);
  setConfig('centroid.text.strokeWidth', 6);
  setConfig('zoom.transitionDuration', 1000);
}

/**
 * Configuration pour mobile
 */
export function setMobileConfig() {
  setConfig('ui.responsive.adaptiveUI', true);
  setConfig('glyph.batchLoading.batchSize', 30);
  setConfig('centroid.text.fontSize', 14);
  setConfig('ui.positions.leva', { top: 10, left: 10 });
}

/**
 * Configuration pour le développement
 */
export function setDevelopmentConfig() {
  setConfig('debug.enabled', true);
  setConfig('debug.verbose', true);
  setConfig('performance.monitoring.logLevel', 'debug');
  setConfig('data.validation.strictMode', true);
}

// ============================================================================
// VALIDATION ET DIAGNOSTIC
// ============================================================================

/**
 * Valider la configuration actuelle
 */
export function validateCurrentConfig() {
  const result = validateConfig();
  
  if (!result.valid) {
    console.error('Configuration invalide:', result.errors);
    return false;
  }
  
  if (result.warnings.length > 0) {
    console.warn('Avertissements de configuration:', result.warnings);
  }
  
  console.log('Configuration valide ✅');
  return true;
}

/**
 * Afficher un résumé de la configuration
 */
export function showConfigSummary() {
  console.log('=== RÉSUMÉ DE LA CONFIGURATION ===');
  console.log('Zoom:', getConfig('zoom.scaleExtent', []));
  console.log('Glyphes par batch:', getConfig('glyph.batchLoading.batchSize', 40));
  console.log('Taille de police centroïdes:', getConfig('centroid.text.fontSize', 16));
  console.log('Mode debug:', getConfig('debug.enabled', false));
  console.log('================================');
}

// ============================================================================
// UTILITAIRES AVANCÉS
// ============================================================================

/**
 * Sauvegarder la configuration dans localStorage
 */
export function saveConfigToStorage() {
  try {
    const config = getConfig('', {});
    localStorage.setItem('debugUMAP_config', JSON.stringify(config));
    console.log('Configuration sauvegardée dans localStorage');
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
  }
}

/**
 * Charger la configuration depuis localStorage
 */
export function loadConfigFromStorage() {
  try {
    const saved = localStorage.getItem('debugUMAP_config');
    if (saved) {
      const config = JSON.parse(saved);
      // Appliquer la configuration sauvegardée
      Object.keys(config).forEach(key => {
        setConfig(key, config[key]);
      });
      console.log('Configuration chargée depuis localStorage');
      return true;
    }
  } catch (error) {
    console.error('Erreur lors du chargement:', error);
  }
  return false;
}

/**
 * Réinitialiser la configuration aux valeurs par défaut
 */
export function resetConfigToDefaults() {
  // Recharger le module pour réinitialiser
  window.location.reload();
}
