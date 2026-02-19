import React from 'react';

/**
 * Composant de contrôles de filtrage
 */
const FilterControls = ({ fonts, filter, onFilterChange }) => {
  // Obtenir les catégories uniques
  const categories = [...new Set(fonts.map(f => f.family))];

  return (
    <div className="filters-container">
      <div className="filters-label">Families</div>
      <div className="filters-inline">
        {categories.map(family => (
          <span 
            key={family}
            className={`filter-link ${filter === family ? 'active' : ''}`} 
            onClick={() => onFilterChange(filter === family ? 'all' : family)}
          >
            {family} <span className="filter-count">{fonts.filter(f => f.family === family).length}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default FilterControls;
