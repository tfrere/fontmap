// Structural font categories (see build_typography_data.py): Google's usage-based
// "display" category is split by Latin structure into the text categories,
// plus decorative and blackletter.
export const CATEGORIES = ['sans-serif', 'serif', 'handwriting', 'monospace', 'decorative', 'blackletter'];

export const CATEGORY_COLORS = {
  'sans-serif': '#3498db',
  'serif':      '#e74c3c',
  'handwriting':'#9b59b6',
  'monospace':  '#2ecc71',
  'decorative': '#f39c12',
  'blackletter':'#e84393',
};

export const FALLBACK_CATEGORY_COLOR = '#95a5a6';

export const sortCategories = (categories) =>
  [...categories].sort((a, b) => {
    const ia = CATEGORIES.indexOf(a);
    const ib = CATEGORIES.indexOf(b);
    return (ia < 0 ? CATEGORIES.length : ia) - (ib < 0 ? CATEGORIES.length : ib);
  });

export const formatGoogleCategory = (category) =>
  category ? category.charAt(0).toUpperCase() + category.slice(1) : '';
