# 🧪 Live UMAP Calculator - Frontend

## Vue d'ensemble

Le **Live UMAP Calculator** permet de calculer les projections UMAP **directement dans le navigateur** au lieu de les pré-calculer dans le pipeline backend.

### Avantages

- ✅ **Itération rapide** : Testez différents paramètres sans relancer le pipeline
- ✅ **Feedback immédiat** : Voyez le résultat en ~10-20 secondes
- ✅ **Pas de rebuild** : Aucun besoin de regénérer les fichiers
- ✅ **Exploratio interactive** : Ajustez les sliders et calculez instantanément

## Architecture

```
embeddings.json (27 MB)
    ↓
umapCalculator.js (charge + calcule UMAP)
    ↓
useLiveUMAP.js (hook React)
    ↓
LiveUMAPPanel.js (UI)
    ↓
DebugUMAP.js (intégration)
```

## Fichiers créés

### 1. `umapCalculator.js`
**Rôle** : Logique de calcul UMAP pure

**Fonctions principales** :
- `loadEmbeddings()` : Charge `/data/embeddings.json`
- `calculateUMAP(config)` : Calcule UMAP avec les paramètres
- `mergeFontFamilies()` : Fusion des familles (identique au backend)
- `normalizeData()` : Standardisation Z-score

**Configuration** :
```javascript
{
  nNeighbors: 15,      // 5-50 : structure locale vs globale
  minDist: 1.0,        // 0.0-2.0 : compacité vs espacement
  enableFontFusion: true,  // Fusion des familles
  randomSeed: 42,      // Reproductibilité
  onProgress: (info) => { ... }  // Callback progression
}
```

### 2. `useLiveUMAP.js`
**Rôle** : Hook React pour gérer l'état du calcul

**Retour** :
```javascript
{
  calculate: (config) => Promise<result>,
  reset: () => void,
  isCalculating: boolean,
  progress: { stage, progress },
  error: string | null,
  result: object | null
}
```

### 3. `LiveUMAPPanel.js`
**Rôle** : Interface utilisateur pour le calcul

**Features** :
- Sliders pour `n_neighbors` et `min_dist`
- Checkbox pour la fusion des familles
- Barre de progression en temps réel
- Bouton "Calculate UMAP"
- Affichage des erreurs

### 4. Intégration dans `DebugUMAP.js`
**Modifications** :
- Import du `LiveUMAPPanel`
- Fonction `handleLiveResult()` pour recevoir le résultat
- `setLiveResult()` du store pour remplacer les configs
- Bouton toggle pour afficher/masquer le panneau

### 5. Store Zustand (`useDebugUMAPStore.js`)
**Nouvelle action** :
```javascript
setLiveResult: (result) => {
  // Remplace les configs par le résultat calculé
  set({
    configs: [result],
    currentConfigIndex: 0,
    error: null
  });
}
```

## Utilisation

### 1. Ouvrir DebugUMAP

```bash
npm start
# Naviguer vers http://localhost:3000/debug-umap
```

### 2. Interface Live UMAP

Un panneau apparaît en haut à droite avec :
- **n_neighbors** : Slider 5-50 (structure locale/globale)
- **min_dist** : Slider 0.0-2.0 (compacité/espacement)
- **Font fusion** : Checkbox pour fusionner les familles
- **Calculate UMAP** : Bouton pour lancer le calcul

### 3. Calculer

1. Ajuster les paramètres avec les sliders
2. Cliquer sur "Calculate UMAP"
3. Attendre ~10-20 secondes
4. Le résultat s'affiche automatiquement sur la carte

### 4. Étapes de progression

Le panneau affiche la progression :
- **Chargement des embeddings** (0-20%)
- **Préparation des données** (20-40%)
- **Fusion des familles** (40-50%)
- **Normalisation** (50-60%)
- **Calcul UMAP** (60-90%)
- **Finalisation** (90-100%)
- **Terminé** (100%)

## Comparaison avec le pipeline backend

| Aspect | Backend (5-batch-umap.mjs) | Frontend (Live UMAP) |
|--------|----------------------------|----------------------|
| **Temps** | ~40s pour 7 configs | ~10-20s par config |
| **Dépendances** | Node.js, npm run | Navigateur seulement |
| **Itération** | Modifier JSON → relancer | Sliders → Calculate |
| **Sauvegarde** | Fichiers JSON | RAM seulement |
| **Batch** | 7 configs en parallèle | 1 config à la fois |

## Paramètres UMAP

### n_neighbors (5-50)

**Impact** : Structure locale vs globale

- **5-10** : Micro-clusters très détaillés
- **15** : Équilibre (défaut)
- **30-50** : Vue d'ensemble, groupes larges

### min_dist (0.0-2.0)

**Impact** : Compacité vs espacement

- **0.1-0.3** : Clusters très serrés
- **1.0** : Espacé (défaut)
- **1.5-2.0** : Maximum d'espace

### Fusion des familles

**Activé** : Fusionne les variantes d'une même famille (ex: Roboto Light, Regular, Bold → Roboto)

**Résultat** : ~1900 polices → ~1200 polices

## Performance

### Temps de calcul

- **Premier chargement** : ~3-5s (téléchargement embeddings.json 27MB)
- **Calculs suivants** : ~10-15s (cache navigateur)
- **UMAP seul** : ~8-12s

### Optimisations

- ✅ Embeddings en cache navigateur
- ✅ Normalisation optimisée (pas de ml-matrix côté frontend)
- ✅ Seed fixe pour reproductibilité
- ✅ Progression en temps réel

## Limitations

1. **Pas de sauvegarde** : Le résultat est en RAM uniquement
2. **Un calcul à la fois** : Pas de batch processing
3. **RAM** : ~100 MB pour les embeddings + calcul
4. **CPU** : Bloque le thread principal pendant le calcul

## Développement futur

### Améliorations possibles

1. **Web Workers** : Calcul en arrière-plan sans bloquer l'UI
2. **Batch mode** : Calculer plusieurs configs d'affilée
3. **Export JSON** : Sauvegarder le résultat
4. **Presets** : Boutons rapides pour configs communes
5. **Compare mode** : Comparer 2 configs côte à côte

### Exemple avec Web Worker

```javascript
// Futur : umapWorker.js
self.onmessage = async (e) => {
  const { config } = e.data;
  const result = await calculateUMAP(config);
  self.postMessage(result);
};
```

## Debug

### Console logs

Le calculateur affiche des logs détaillés :

```
🔄 Chargement des embeddings CLIP...
✅ 1877 polices chargées
📊 Dimensions: 512D
🔄 Fusion des familles en cours...
✅ Fusion: 1877 → 1234 polices
🧪 Calcul UMAP avec config: { nNeighbors: 15, minDist: 1.0, ... }
🔄 Exécution UMAP...
✅ UMAP calculé avec succès!
📊 1234 polices positionnées
```

### Erreurs communes

**❌ Embeddings non trouvés**
- Vérifier que `/public/data/embeddings.json` existe
- Copier depuis `src/typography/new-pipe/public/data/`

**❌ UMAP échoue**
- Vérifier que `umap-js` est installé (`npm install umap-js`)
- Vérifier la version : `^1.4.0`

**❌ Résultat ne s'affiche pas**
- Vérifier la console pour les erreurs
- Vérifier que `setLiveResult` est appelé
- Vérifier que le store est mis à jour

## Conclusion

Le **Live UMAP Calculator** permet de tester rapidement différentes configurations UMAP sans relancer le pipeline backend. C'est parfait pour l'exploration interactive et l'itération rapide ! 🚀

