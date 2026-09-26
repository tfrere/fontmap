import { CATEGORIES } from './categories';

// Search over font names and styles. Styles are Google Fonts tags ("Sans/Humanist",
// "Theme/Pixel", ...; see `tags` in build_typography_data.py) and our structural
// categories. Matching is case- and diacritics-insensitive, on word starts.

const MIN_STYLE_QUERY_LENGTH = 3;

export const normalizeText = (text) =>
  (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toWords = (text) => {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ') : [];
};

// "sans serif" / "sans-serif" means the Sans group, not Serif.
const queryTokens = (query) =>
  toWords(normalizeText(query).replace(/\bsans ?serif\b/g, 'sans'));

// Every query token is the start of some word.
const tokensMatchWords = (tokens, words) =>
  tokens.length > 0 && tokens.every(token => words.some(word => word.startsWith(token)));

// ── Font names ──

// Word-start match on the name, or on the name without spaces from a word
// boundary ("plexsans" finds IBM Plex Sans).
const nameMatchRank = (name, tokens, compactQuery) => {
  const normalized = normalizeText(name);
  const words = normalized.split(' ');
  const compactName = words.join('');
  if (compactName === compactQuery) return 0;
  if (compactName.startsWith(compactQuery)) return 1;
  if (tokensMatchWords(tokens, words)) return 2;
  let offset = 0;
  for (const word of words) {
    if (compactName.startsWith(compactQuery, offset)) return 3;
    offset += word.length;
  }
  return -1;
};

const fontNameRank = (font, tokens, compactQuery) => {
  let best = nameMatchRank(font.name, tokens, compactQuery);
  for (const alias of font.aliases || []) {
    const rank = nameMatchRank(alias, tokens, compactQuery);
    // Alias hits rank after hits on the font's own name
    if (rank >= 0 && (best < 0 || rank + 4 < best)) best = rank + 4;
  }
  return best;
};

export const searchFontsByName = (fonts, query, limit = 8) => {
  const tokens = queryTokens(query);
  const compactQuery = toWords(query).join('');
  if (!compactQuery) return [];
  const hits = [];
  for (const font of fonts) {
    const rank = fontNameRank(font, tokens, compactQuery);
    if (rank >= 0) hits.push({ font, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.font.name.length - b.font.name.length
    || a.font.name.localeCompare(b.font.name));
  return hits.slice(0, limit).map(hit => hit.font);
};

// ── Styles ──

const CATEGORY_WORDS = {
  'sans-serif': ['sans', 'sansserif'],
  'serif': ['serif'],
  'handwriting': ['handwriting', 'script', 'cursive'],
  'monospace': ['monospace', 'mono', 'code'],
  'decorative': ['decorative', 'display', 'fancy'],
  'blackletter': ['blackletter', 'gothic', 'fraktur'],
};

// Extra words for tag parts, so common spellings find them
const TAG_SYNONYMS = {
  monospace: ['mono', 'code'],
  grotesque: ['grotesk'],
  handwritten: ['handwriting'],
  blackletter: ['gothic', 'fraktur'],
  old: ['oldstyle'],
  pixel: ['bitmap'],
};

export const formatCategory = (category) =>
  category ? category.charAt(0).toUpperCase() + category.slice(1) : '';

export const formatTag = (tag) => {
  const [group, name = group] = tag.split('/');
  if (group === 'Theme' || group === name) return name;
  return `${group} / ${name}`;
};

// Real tags plus the predicted dominant one for fonts Google hasn't tagged
export const getFontStyleTags = (font) => {
  const tags = (font.tags || []).map(tag => ({ tag, predicted: false }));
  if (font.style_tag && font.style_tag_predicted && !(font.tags || []).includes(font.style_tag)) {
    tags.push({ tag: font.style_tag, predicted: true });
  }
  return tags;
};

export const fontHasStyleTag = (font, tag) =>
  (font.tags || []).includes(tag) || (font.style_tag_predicted && font.style_tag === tag);

const tagEntry = (tag) => {
  const [group, name = group] = tag.split('/');
  const nameWords = toWords(name);
  const extra = nameWords.flatMap(word => TAG_SYNONYMS[word] || []);
  return {
    key: `tag:${tag}`,
    kind: group === 'Theme' ? 'theme' : 'style',
    value: tag,
    label: formatTag(tag),
    primaryWords: [...nameWords, ...extra],
    words: [...new Set([...toWords(group), ...nameWords, ...extra])],
    count: 0,
  };
};

export const buildStyleIndex = (fonts) => {
  const tags = new Map();
  const categories = new Map();
  for (const font of fonts) {
    for (const { tag } of getFontStyleTags(font)) {
      if (!tags.has(tag)) tags.set(tag, tagEntry(tag));
      tags.get(tag).count += 1;
    }
    if (font.family) {
      if (!categories.has(font.family)) {
        const words = CATEGORY_WORDS[font.family] || toWords(font.family);
        categories.set(font.family, {
          key: `category:${font.family}`,
          kind: 'category',
          value: font.family,
          label: formatCategory(font.family),
          primaryWords: words,
          words,
          count: 0,
        });
      }
      categories.get(font.family).count += 1;
    }
  }
  const ordered = [...categories.values()].sort(
    (a, b) => CATEGORIES.indexOf(a.value) - CATEGORIES.indexOf(b.value));
  // "Monospace/Monospace" would duplicate the Monospace family
  const categoryLabels = new Set(ordered.map(entry => entry.label.toLowerCase()));
  return [...ordered, ...[...tags.values()].filter(entry => !categoryLabels.has(entry.label.toLowerCase()))];
};

// Entries whose own name matches rank before group-only matches
// ("sans" -> Sans-serif family first, then the Sans / * styles), then by size.
export const searchStyles = (styleIndex, query, limit = 6) => {
  const tokens = queryTokens(query);
  if (tokens.join('').length < MIN_STYLE_QUERY_LENGTH) return [];
  const hits = [];
  for (const entry of styleIndex) {
    if (!tokensMatchWords(tokens, entry.words)) continue;
    const onPrimary = tokens.some(token => entry.primaryWords.some(word => word.startsWith(token)));
    const exact = tokens.filter(token => entry.words.includes(token)).length;
    hits.push({ entry, score: (onPrimary ? 100 : 0) + exact * 10 });
  }
  hits.sort((a, b) => b.score - a.score || b.entry.count - a.entry.count);
  return hits.slice(0, limit).map(hit => hit.entry);
};

// ── Map filtering ──

const tagWordsCache = new Map();
const tagWords = (tag) => {
  if (!tagWordsCache.has(tag)) tagWordsCache.set(tag, tagEntry(tag).words);
  return tagWordsCache.get(tag);
};

// Live filter while typing: the name, or one of the font's styles, matches
export const matchesSearch = (font, searchTerm) => {
  if (!searchTerm) return true;
  const compactQuery = toWords(searchTerm).join('');
  if (!compactQuery) return true;
  const tokens = queryTokens(searchTerm);
  if (fontNameRank(font, tokens, compactQuery) >= 0) return true;
  if (tokens.join('').length < MIN_STYLE_QUERY_LENGTH) return false;
  const categoryWords = CATEGORY_WORDS[font.family] || toWords(font.family);
  if (tokensMatchWords(tokens, categoryWords)) return true;
  return getFontStyleTags(font).some(({ tag }) => tokensMatchWords(tokens, tagWords(tag)));
};
