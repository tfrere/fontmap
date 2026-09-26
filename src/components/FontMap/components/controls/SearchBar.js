import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatTag, searchFontsByName, searchStyles } from '../../utils/fontSearch';
import { getFontSymbolId } from '../../utils/fontUtils';

const KIND_BADGES = { category: 'family', theme: 'theme' };

/**
 * Search bar
 * Dropdown with matching styles (Google Fonts tags, families) and font names.
 */
const SearchBar = ({
  searchTerm,
  onSearchChange,
  darkMode,
  big = false,
  filteredCount = null,
  totalCount = null,
  filter = 'all',
  fonts = [],
  styleIndex = [],
  styleTag = null,
  styleCount = 0,
  onStyleSelect,
  onCategorySelect,
  onFontSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const showCounter = filteredCount !== null && totalCount !== null;
  const isFiltered = showCounter && (filteredCount !== totalCount || filter !== 'all' || !!styleTag);

  const styleHits = useMemo(() => searchStyles(styleIndex, searchTerm), [styleIndex, searchTerm]);
  const fontHits = useMemo(() => searchFontsByName(fonts, searchTerm), [fonts, searchTerm]);
  const items = useMemo(() => [
    ...styleHits.map(entry => ({ type: 'style', key: entry.key, entry })),
    ...fontHits.map(font => ({ type: 'font', key: `font:${font.id}`, font })),
  ], [styleHits, fontHits]);

  const hasQuery = searchTerm.trim().length > 0;
  const dropdownOpen = open && hasQuery;

  useEffect(() => { setActiveIndex(-1); }, [searchTerm]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (item) => {
    if (!item) return;
    setOpen(false);
    inputRef.current?.blur();
    if (item.type === 'font') {
      onFontSelect?.(item.font);
    } else if (item.entry.kind === 'category') {
      onSearchChange('');
      onCategorySelect?.(item.entry.value);
    } else {
      onSearchChange('');
      onStyleSelect?.(item.entry.value);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(i => {
        if (!dropdownOpen || i < 0) return step > 0 ? 0 : items.length - 1;
        return (i + step + items.length) % items.length;
      });
    } else if (e.key === 'Enter') {
      if (!dropdownOpen || !items.length) return;
      e.preventDefault();
      choose(items[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (dropdownOpen) setOpen(false);
      else if (searchTerm) onSearchChange('');
      else inputRef.current?.blur();
    }
  };

  const renderItem = (item, index) => {
    const active = index === activeIndex;
    const common = {
      key: item.key,
      id: `search-option-${index}`,
      'data-index': index,
      role: 'option',
      'aria-selected': active,
      className: `search-option ${active ? 'active' : ''}`,
      // Keep focus in the input so blur doesn't close the list before the click
      onMouseDown: (e) => e.preventDefault(),
      onMouseEnter: () => setActiveIndex(index),
      onClick: () => choose(item),
    };
    if (item.type === 'style') {
      const { entry } = item;
      const badge = KIND_BADGES[entry.kind];
      return (
        <li {...common}>
          <span className="search-option-label">
            {entry.label}
            {badge && <span className="search-option-badge">{badge}</span>}
          </span>
          <span className="search-option-count">{entry.count} fonts</span>
        </li>
      );
    }
    const { font } = item;
    return (
      <li {...common}>
        <span className="search-option-glyph" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 80 80">
            <use href={`#${getFontSymbolId(font.imageName || font.id)}`} fill="currentColor" />
          </svg>
        </span>
        <span className="search-option-label">{font.name}</span>
        <span className="search-option-count">{font.family}</span>
      </li>
    );
  };

  return (
    <div className={`search-bar-wrapper ${darkMode ? 'dark' : ''}`}>
      <div className={`search-bar ${big ? 'search-bar-big' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search fonts or styles..."
          value={searchTerm}
          onChange={(e) => { onSearchChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          className={`search-input ${darkMode ? 'dark' : ''}`}
          role="combobox"
          aria-expanded={dropdownOpen}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-activedescendant={dropdownOpen && activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
        />

        {/* Container for the clear button and the counter */}
        <div className="search-controls">
          {searchTerm && (
            <button
              className="search-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSearchChange('')}
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}

          {/* Result counter */}
          {showCounter && (
            <div className={`search-counter ${darkMode ? 'dark' : ''} ${isFiltered ? 'filtered' : ''}`}>
              {isFiltered ? (
                <span className="counter-text">
                  {filteredCount} of {totalCount}
                </span>
              ) : (
                <span className="counter-text">
                  {totalCount} fonts
                </span>
              )}
            </div>
          )}
        </div>

        {dropdownOpen && (
          <div className="search-dropdown" ref={listRef}>
            {items.length === 0 ? (
              <div className="search-empty">No font or style matches "{searchTerm.trim()}"</div>
            ) : (
              <ul id="search-results" role="listbox" aria-label="Search results">
                {styleHits.length > 0 && <li className="search-section-title" role="presentation">Styles</li>}
                {items.slice(0, styleHits.length).map((item, i) => renderItem(item, i))}
                {fontHits.length > 0 && <li className="search-section-title" role="presentation">Fonts</li>}
                {items.slice(styleHits.length).map((item, i) => renderItem(item, i + styleHits.length))}
              </ul>
            )}
          </div>
        )}
      </div>

      {styleTag && (
        <div className="search-style-chip">
          <span className="search-style-chip-label">
            Style: <strong>{formatTag(styleTag)}</strong>
            <span className="search-style-chip-count">{styleCount}</span>
          </span>
          <button
            type="button"
            className="search-style-chip-remove"
            onClick={() => onStyleSelect?.(null)}
            aria-label={`Remove style filter ${formatTag(styleTag)}`}
            title="Remove style filter"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
