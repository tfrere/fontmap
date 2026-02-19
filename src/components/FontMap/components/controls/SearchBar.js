import React from 'react';

/**
 * Composant de barre de recherche
 */
const SearchBar = ({ searchTerm, onSearchChange, darkMode, big = false, filteredCount = null, totalCount = null, filter = 'all' }) => {
  const showCounter = filteredCount !== null && totalCount !== null;
  const isFiltered = showCounter && (filteredCount !== totalCount || filter !== 'all');

  return (
    <div className={`search-bar ${big ? 'search-bar-big' : ''}`}>
      <input
        type="text"
        placeholder="Search fonts..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className={`search-input ${darkMode ? 'dark' : ''}`}
      />
      
      {/* Conteneur pour la croix et le compteur */}
      <div className="search-controls">
        {searchTerm && (
          <button
            className="search-clear"
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
        
        {/* Compteur de résultats */}
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
    </div>
  );
};

export default SearchBar;
