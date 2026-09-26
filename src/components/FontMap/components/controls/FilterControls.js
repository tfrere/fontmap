import React from 'react';
import { sortCategories } from '../../utils/categories';

/**
 * Filter controls
 */
const FilterControls = ({ fonts, filter, onFilterChange }) => {
  const categories = sortCategories(new Set(fonts.map(f => f.family)));

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
            <span className="filter-label" title={family}>{family}</span>
            <span className="filter-count">{fonts.filter(f => f.family === family).length}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default FilterControls;
