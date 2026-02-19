import React from 'react';

/**
 * Composant de sélection du dataset
 */
const DatasetSelector = ({ dataset, onDatasetChange, fontCount }) => {
  return (
    <div className="dataset-selector">
      <select 
        value={dataset} 
        onChange={(e) => onDatasetChange(e.target.value)}
        className="dataset-select"
      >
        <option value="original">Original Dataset ({fontCount} fonts)</option>
        <option value="extended">Extended Dataset (493 fonts)</option>
      </select>
    </div>
  );
};

export default DatasetSelector;
