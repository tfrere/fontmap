// Export du composant principal
export { default as FontMap } from './FontMap';

// Export des composants de contrôles
export { default as DarkModeToggle } from './components/controls/DarkModeToggle';
export { default as DatasetSelector } from './components/controls/DatasetSelector';
export { default as FilterControls } from './components/controls/FilterControls';
export { default as SearchBar } from './components/controls/SearchBar';
export { default as ZoomControls } from './components/controls/ZoomControls';

// Export des hooks personnalisés
export { useFontData } from './hooks/useFontData';
export { useD3Visualization } from './hooks/useD3Visualization';
export { useTooltipOptimized } from './hooks/useTooltipOptimized';

// Export des utilitaires
export * from './utils/fontUtils';