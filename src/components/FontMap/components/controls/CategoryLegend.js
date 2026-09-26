import React from 'react';
import { useFontMapStore } from '../../../../store/fontMapStore';

const CategoryLegend = () => {
  const useCategoryColors = useFontMapStore(s => s.useCategoryColors);
  const setUseCategoryColors = useFontMapStore(s => s.setUseCategoryColors);

  return (
    <div className="category-legend">
      <label className="map-control category-legend-toggle">
        <input
          type="checkbox"
          checked={useCategoryColors}
          onChange={(e) => setUseCategoryColors(e.target.checked)}
        />
        <span>Category colors</span>
      </label>
    </div>
  );
};

export default CategoryLegend;
