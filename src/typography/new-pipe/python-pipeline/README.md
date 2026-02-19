# Python Pipeline (alternative haute qualité)

Pipeline Python alternative pour les étapes 4 (embeddings) et 5 (UMAP) du pipeline FontMap.

## Avantages vs pipeline JS

| | Pipeline JS | Pipeline Python |
|---|---|---|
| **Modèle** | CLIP ViT-B/32 vanilla | CLIP ou **FontCLIP** (fine-tuné typographie) |
| **UMAP** | `umap-js` (init aléatoire) | `umap-learn` (**init spectrale**, référence) |
| **PCA** | EVD custom | `scikit-learn` (optimisé, LAPACK) |
| **k-NN** | Brute-force JS | `scikit-learn` NearestNeighbors |

## Installation

```bash
cd src/typography/new-pipe/python-pipeline
pip install -r requirements.txt
```

## Utilisation

```bash
# Avec CLIP standard
python generate_embeddings_and_umap.py \
  --pngs-dir ../output/pngs \
  --output-dir ../output/data \
  --font-index ../input/font-index.json \
  --device mps  # ou cpu, cuda

# Avec FontCLIP (si les poids sont disponibles)
python generate_embeddings_and_umap.py \
  --pngs-dir ../output/pngs \
  --output-dir ../output/data \
  --font-index ../input/font-index.json \
  --fontclip \
  --device mps
```

## FontCLIP

Pour utiliser FontCLIP :
1. Cloner https://github.com/yukistavailable/FontCLIP
2. Entraîner ou récupérer les poids fine-tunés
3. Placer le fichier `.pt` dans `weights/fontclip_vit_b32.pt`

## Options

| Flag | Défaut | Description |
|------|--------|-------------|
| `--pca` | 50 | Nombre de composantes PCA |
| `--umap-neighbors` | 15 | UMAP n_neighbors |
| `--umap-min-dist` | 0.3 | UMAP min_dist |
| `--knn-k` | 8 | Nombre de voisins k-NN |
| `--fontclip` | false | Utiliser FontCLIP |
| `--device` | cpu | cpu, cuda, mps |

## Sortie

Le script produit un fichier `typography_data_python_*.json` compatible avec le format existant.
Pour déployer : copier vers `public/data/typography_data.json`.
