# 🎨 FontMap Pipeline - Workflow

## 📋 Architecture décorrélée

Le pipeline sépare maintenant **la génération des embeddings** (lent) de **la projection UMAP** (rapide).

### **Avantages** ✨
- ✅ Embeddings générés **1 seule fois** (2-3h pour CLIP)
- ✅ Projections UMAP **multiples** en quelques secondes
- ✅ Test de différents paramètres UMAP **sans recalculer** les embeddings
- ✅ Parfait pour le **batch testing**

---

## 🚀 Workflow complet

### **Étape 1 : Télécharger les polices**
```bash
npm run download
```
📂 Sortie : `output/fonts/{fontId}/`

---

### **Étape 2 : Générer les SVG**
```bash
npm run generate-svgs
```
📂 Sortie : 
- `output/svgs/{fontId}_a.svg` (lettre A)
- `output/svgs/{fontId}_sentence.svg` (phrase)
- `output/font_manifest.json`

---

### **Étape 3 : Générer les PNG**
```bash
npm run generate-pngs
```
📂 Sortie : `output/pngs/{fontId}_a.png` (40×40px)

---

### **Étape 3.5 : Générer les embeddings CLIP** ⭐ NOUVEAU
```bash
npm run generate-embeddings
```

**Ce que ça fait** :
- Charge tous les PNG 40×40
- Utilise CLIP Vision Transformer (ViT-B/32) pour extraire des embeddings sémantiques
- Génère 512 dimensions par police (vs 1600 pixels bruts)
- Sauvegarde dans `output/data/embeddings.json`

📂 Sortie : `output/data/embeddings.json`

```json
{
  "metadata": {
    "generated_at": "2024-10-18T...",
    "method": "clip_visual_embeddings",
    "model": "Xenova/clip-vit-base-patch32",
    "total_fonts": 1234,
    "embedding_dimensions": 512
  },
  "fonts": [
    {
      "id": "roboto",
      "name": "roboto",
      "family": "sans-serif",
      "embedding": [0.154, -0.16, ..., 0.24],  // 512 dimensions (CLIP)
      "weights": [100, 300, 400, ...],
      "styles": ["normal", "italic"]
    }
  ]
}
```

**Durée** : ~2-3h pour 1000 polices (CPU) - Une fois pour toutes !

---

### **Étape 4 : Générer la projection UMAP** ⭐ NOUVEAU
```bash
npm run generate-umap
```

**Ce que ça fait** :
- Charge `embeddings.json`
- Fusionne les familles de polices (optionnel)
- Encode les catégories (serif, sans-serif, etc.)
- Combine embeddings (90%) + catégories (10%)
- Applique UMAP → 2D (X, Y)
- Sauvegarde dans `output/data/typography_data.json`

📂 Sortie : `output/data/typography_data.json`

```json
{
  "metadata": {
    "generated_at": "2024-10-18T...",
    "method": "umap_from_precomputed_embeddings",
    "umap_params": {
      "nNeighbors": 15,
      "minDist": 1.0,
      "metric": "euclidean"
    },
    "weights": {
      "embedding_weight": 0.9,
      "category_weight": 0.1
    }
  },
  "fonts": [
    {
      "id": "roboto",
      "name": "Roboto",
      "family": "sans-serif",
      "x": 12.34,
      "y": -5.67
    }
  ]
}
```

**Durée** : ~30 secondes pour 1000 polices

---

### **Étape 5-7 : Génération finale**
```bash
npm run generate-sprite  # Sprite SVG
npm run copy-to-app      # Copie vers public/
```

---

## 🔧 Personnalisation des paramètres UMAP

### **Modifier les paramètres dans `4-generate-umap.mjs`** :

```javascript
// Paramètres UMAP
const UMAP_PARAMS = {
  nNeighbors: 15,    // 5-50 : clusters locaux vs globaux
  minDist: 1.0,      // 0.1-5.0 : compacité
  metric: 'euclidean' // euclidean, cosine, manhattan
};

// Pondération
const EMBEDDING_WEIGHT = 0.9;  // 90% apparence visuelle
const CATEGORY_WEIGHT = 0.1;   // 10% catégorie

// Fusion des familles
const ENABLE_FONT_FUSION = true;
const FUSION_PREFIX_LENGTH = 2;
```

### **Tester différentes configurations** :

```bash
# 1. Générer les embeddings UNE FOIS
npm run generate-embeddings

# 2. Tester différents UMAP à volonté
# Modifier les paramètres dans 4-generate-umap.mjs
npm run generate-umap  # Config 1
# Modifier à nouveau
npm run generate-umap  # Config 2
# etc.
```

---

## 📊 Batch Testing

Pour tester plusieurs configurations automatiquement :

```bash
npm run batch-test
```

Voir `batch-testing/configs/test-configs.json` pour les configurations.

---

## 🎯 Pipeline recommandé

### **Production** :
```bash
# 1× lent (5 min)
npm run download
npm run generate-svgs
npm run generate-pngs
npm run generate-embeddings

# N× rapide (30s chacun)
npm run generate-umap  # Test config 1
npm run generate-umap  # Test config 2
# ... choisir la meilleure

# Finaliser
npm run generate-sprite
npm run copy-to-app
```

### **Développement** :
```bash
# Embeddings déjà générés
npm run generate-umap  # Tester paramètres
# Modifier 4-generate-umap.mjs
npm run generate-umap  # Re-tester
# Itérer rapidement !
```

---

---

## 📁 Structure des fichiers

```
output/
├── fonts/           # Polices téléchargées (étape 1)
├── svgs/            # SVG générés (étape 2)
├── pngs/            # PNG 40×40 (étape 3)
├── data/
│   ├── embeddings.json        # ⭐ Embeddings bruts (étape 3.5)
│   └── typography_data.json   # ⭐ Projection UMAP (étape 4)
└── sprites/         # Sprite SVG (étape 5)
```

---

## 🎨 Résumé

| Étape | Commande | Durée | Fréquence |
|-------|----------|-------|-----------|
| **1-3** | Download, SVG, PNG | 10 min | 1× |
| **3.5** | Embeddings CLIP | 2-3h | 1× |
| **4** | UMAP | 30s | N× |
| **5-7** | Sprite, Copy | 1 min | 1× |

**Total** : ~3h la première fois, puis **30s par test UMAP** ! 🚀

