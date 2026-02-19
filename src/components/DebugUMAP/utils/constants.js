// Constantes pour DebugUMAP - DÉPRÉCIÉ
// Utilisez maintenant src/components/DebugUMAP/config/mapConfig.js

// Import pour créer les aliases
import { COLOR_CONFIG, UI_CONFIG } from '../config/mapConfig.js';

// Re-exports pour la compatibilité
export { 
  MAP_CONFIG,
  ZOOM_CONFIG,
  GLYPH_CONFIG,
  COLOR_CONFIG,
  UI_CONFIG,
  CENTROID_CONFIG,
  DATA_CONFIG,
  PERFORMANCE_CONFIG,
  getConfig,
  setConfig,
  validateConfig
} from '../config/mapConfig.js';

// Aliases pour la compatibilité
export const CATEGORY_COLORS = COLOR_CONFIG.categories;
export const DEFAULT_COLORS = COLOR_CONFIG.defaults;
export const LAYOUT_CONFIG = UI_CONFIG;
