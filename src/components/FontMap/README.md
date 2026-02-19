# FontMap Component

## Structure

```
src/components/FontMap/
├── index.js                    # Point d'entrée principal
├── FontMap.js                  # Composant principal unifié
├── hooks/
│   ├── useFontData.js         # Gestion des données de polices
│   ├── useD3Visualization.js  # Logique D3 unifiée
│   └── useTooltip.js          # Gestion des tooltips
├── components/
│   └── controls/
│       ├── DarkModeToggle.js
│       ├── DatasetSelector.js
│       ├── FilterControls.js
│       ├── SearchBar.js
│       └── ZoomControls.js
├── utils/
│   └── fontUtils.js          # Utilitaires pour les polices
└── styles/
    └── FontMap.css           # Styles principaux
```

## Utilisation

```jsx
import { FontMap } from './components/FontMap';

function App() {
  return <FontMap />;
}
```

## Composants

### FontMap (Principal)
Composant principal qui orchestre tous les autres composants et hooks.

### Hooks

#### useFontData
- Gère le chargement des données de polices
- Supporte les datasets 'original' et 'extended'
- Retourne : `{ fonts, loading, fontMapping, error }`

#### useD3Visualization
- Gère toute la logique D3 pour la visualisation
- Inclut le zoom, la magnification, les interactions
- Retourne : `svgRef`

#### useTooltip
- Gère l'affichage et le positionnement des tooltips
- Gère les tooltips hover et sélection avec positionnement intelligent
- Retourne : `{ handleFontSelect, handleFontHover, handleFontUnhover, updateTransform, updatePositions }`

### Contrôles

Tous les composants de contrôles suivent le même pattern :
- Props : `{ value, onChange, darkMode? }`
- Styles cohérents avec le système de design

### Utilitaires

#### fontUtils.js
- `getFontSymbolId()` : Obtient l'ID du symbole SVG
- `matchesSearch()` : Vérifie si une police correspond à une recherche
- `filterFonts()` : Filtre les polices selon les critères
- `calculatePositions()` : Calcule les positions avec simulation Voronoi
- `applyVoronoiRelaxation()` : Applique la relaxation de Voronoi

## Améliorations apportées

1. **Structure claire** : Séparation logique des responsabilités
2. **Pas de duplication** : Un seul composant principal
3. **Hooks réutilisables** : Logique métier extraite
4. **Composants modulaires** : Contrôles indépendants
5. **Utilitaires centralisés** : Fonctions communes dans un module
6. **Exports cohérents** : API claire et prévisible
