# 🎨 FontMap Pipeline - Architecture unifiée

## 📋 Pipeline complet

```
1. download-font          → Fonts TTF Google Fonts
2. generate-svgs          → SVG lettre A + phrases
3. generate-pngs          → PNG 40×40
4. generate-embeddings    → CLIP 512D (1-2h, 1× seulement)
5. batch-umap             → 7 configs UMAP testées (40s)
6. copy-to-debug          → Copie vers /debug-umap/
7. generate-sprite        → Sprite SVG
8. deploy-to-prod [nom]   → Déploie config choisie
```

---

## 🚀 Workflow complet

### **Phase 1 : Setup initial (1× au début)**

```bash
npm run download              # Télécharge ~1900 polices
npm run generate-svgs         # Génère SVG
npm run generate-pngs         # Convertit en PNG
npm run generate-embeddings   # CLIP 512D → embeddings.json (1-2h)
npm run generate-sprite       # Sprite SVG
```

**Durée** : ~2-3h la première fois  
**Output** : `output/data/embeddings.json` (27 MB)

---

### **Phase 2 : Testing UMAP (N× rapide)**

```bash
npm run batch-umap       # Teste 7 configs (40s)
npm run copy-to-debug    # Copie vers public/debug-umap/
```

**Durée** : ~1 min  
**Output** : `batch-testing/results/*.json` + `public/debug-umap/*.json`

Ouvre http://localhost:3000/debug-umap pour **comparer visuellement** !

---

### **Phase 3 : Déploiement production (1×)**

Une fois la meilleure config choisie :

```bash
npm run deploy base-reference
# OU
npm run deploy balanced-compact
# OU
npm run deploy global-spread
```

**Durée** : ~5s  
**Output** : 
- `public/data/typography_data.json` (config choisie)
- `public/data/font-sprite.svg`
- `public/data/sentences/`
- `public/data/char/`

---

## 🎯 Configurations disponibles

| Config | nNeighbors | minDist | Description |
|--------|-----------|---------|-------------|
| **local-tight** | 5 | 0.1 | Micro-clusters très serrés |
| **local-medium** | 8 | 0.3 | Petits groupes distincts |
| **balanced-compact** | 15 | 0.5 | Équilibré compact ⭐ |
| **base-reference** | 15 | 1.0 | Standard espacé ⭐ |
| **global-medium** | 25 | 0.8 | Groupes larges |
| **global-spread** | 30 | 1.0 | Vue panoramique |
| **very-spread** | 20 | 1.5 | Maximum d'espace |

**Toutes les configs** :
- ✅ Métrique cosine (similarité sémantique)
- ✅ Fusion des familles (prefix=3)
- ✅ 100% visuel (pas de catégories)

---

## 📊 Architecture des données

### **embeddings.json** (27 MB)
```json
{
  "metadata": {
    "method": "clip_visual_embeddings",
    "model": "Xenova/clip-vit-base-patch32",
    "embedding_dimensions": 512
  },
  "fonts": [
    {
      "id": "roboto",
      "family": "sans-serif",
      "embedding": [0.154, -0.16, ..., 0.24]  // 512D
    }
  ]
}
```

### **typography_data.json** (production)
```json
{
  "metadata": {
    "method": "umap_from_clip_embeddings_pure_visual",
    "umap_params": { "nNeighbors": 15, "minDist": 1.0 }
  },
  "fonts": [
    {
      "id": "roboto",
      "family": "sans-serif",
      "x": 12.34,
      "y": -5.67
    }
  ]
}
```

---

## 🔧 Personnalisation

### **Ajouter une config de test**

Édite `batch-testing/configs/test-configs.json` :

```json
{
  "nNeighbors": 20,
  "minDist": 0.7,
  "metric": "cosine",
  "enableFontFusion": true,
  "testName": "ma-config-custom",
  "randomSeed": 42
}
```

Puis :
```bash
npm run batch-umap
npm run copy-to-debug
# Teste dans /debug-umap/
npm run deploy ma-config-custom
```

---

## 🎨 Résumé

**3 phases distinctes** :
1. **Setup** → Embeddings CLIP (lent, 1×)
2. **Test** → Plusieurs UMAP (rapide, N×)
3. **Deploy** → Config choisie en prod (instantané)

**Séparation claire** :
- Embeddings ≠ UMAP ≠ Production
- Test autant que tu veux sans recalculer
- Déploiement en 1 commande

🚀 **Pipeline optimisé pour l'itération rapide !**


