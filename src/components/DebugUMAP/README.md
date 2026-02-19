# DebugUMAP - Structure Modulaire

Ce composant a été refactorisé pour améliorer la maintenabilité et permettre l'ajout de fonctionnalités complexes sans compromettre les performances.

## Structure

```
DebugUMAP/
├── components/           # Composants UI réutilisables
│   ├── ConfigDisplay.js  # Affichage des informations de configuration
│   ├── MapContainer.js   # Conteneur SVG pour la carte
│   ├── ErrorDisplay.js   # Affichage des erreurs
│   ├── LoadingDisplay.js # Affichage du chargement
│   └── index.js         # Export centralisé
├── hooks/               # Hooks personnalisés
│   ├── useConfigs.js    # Gestion des configurations UMAP
│   ├── useVisualState.js # État visuel (couleurs, taille, mode sombre)
│   ├── useTweakpane.js  # Interface Tweakpane
│   ├── useZoom.js       # Comportement de zoom D3
│   ├── useGlyphRenderer.js # Rendu des glyphes
│   └── index.js         # Export centralisé
├── utils/               # Utilitaires
│   ├── constants.js     # Constantes de l'application
│   ├── mappingUtils.js  # Fonctions de mapping des coordonnées
│   ├── colorUtils.js    # Gestion des couleurs
│   └── index.js         # Export centralisé
├── styles/              # Styles CSS
│   └── index.css        # Styles principaux
├── DebugUMAP.js         # Composant principal
├── index.js             # Point d'entrée du module
└── README.md            # Cette documentation
```

## Avantages de cette structure

### 🚀 Performance
- **Hooks séparés** : Chaque hook gère une responsabilité spécifique
- **Rendu optimisé** : Les effets sont isolés et ne se déclenchent que quand nécessaire
- **Composants légers** : Chaque composant a une responsabilité unique

### 🔧 Maintenabilité
- **Séparation des responsabilités** : Chaque fichier a un rôle clair
- **Réutilisabilité** : Les hooks et composants peuvent être réutilisés
- **Testabilité** : Chaque partie peut être testée indépendamment

### 📈 Extensibilité
- **Ajout facile de fonctionnalités** : Nouveaux hooks/composants sans impact
- **Optimisations ciblées** : Amélioration des performances par module
- **Configuration flexible** : Constantes centralisées et modifiables

## Utilisation

```jsx
import DebugUMAP from './components/DebugUMAP';

// Le composant est prêt à l'emploi
<DebugUMAP />
```

## Ajout de nouvelles fonctionnalités

### Nouveau hook
1. Créer le fichier dans `hooks/`
2. Exporter dans `hooks/index.js`
3. Utiliser dans `DebugUMAP.js`

### Nouveau composant
1. Créer le fichier dans `components/`
2. Exporter dans `components/index.js`
3. Utiliser dans `DebugUMAP.js`

### Nouvelle constante
1. Ajouter dans `utils/constants.js`
2. Importer où nécessaire

## Optimisations futures possibles

- **Virtualisation** : Rendu uniquement des glyphes visibles
- **Web Workers** : Traitement des données en arrière-plan
- **Memoization** : Cache des calculs coûteux
- **Lazy loading** : Chargement progressif des glyphes
- **Canvas rendering** : Alternative SVG pour de meilleures performances
