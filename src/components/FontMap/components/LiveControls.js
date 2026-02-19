import React, { useState, useEffect, useRef } from 'react';
import './LiveControls.css'; // On créera ce fichier CSS aussi

const LiveControls = ({ config, onUpdate, progress }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [localConfig, setLocalConfig] = useState(config);
    const timeoutRef = useRef(null);

    // Mettre à jour la config locale quand la prop change (init)
    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    // Gérer les changements locaux
    const handleChange = (key, value) => {
        const newConfig = { ...localConfig, [key]: value };
        setLocalConfig(newConfig);

        // Debounce pour l'auto-calcul (toujours actif)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            onUpdate(newConfig);
        }, 600);
    };

    return (
        <div className={`live-controls ${isOpen ? 'open' : ''}`}>
            <button
                className="live-controls-toggle"
                onClick={() => setIsOpen(!isOpen)}
                title="Live UMAP Settings"
            >
                🧪
            </button>

            {isOpen && (
                <div className="live-controls-panel">
                    <h3>Live UMAP</h3>

                    <div className="control-group">
                        <label>
                            Neighbors: {localConfig.nNeighbors}
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="1"
                                value={localConfig.nNeighbors}
                                onChange={(e) => handleChange('nNeighbors', parseInt(e.target.value))}
                            />
                        </label>
                        <span className="help-text">Structure locale vs globale</span>
                    </div>

                    <div className="control-group">
                        <label>
                            Min Dist: {localConfig.minDist}
                            <input
                                type="range"
                                min="0.1"
                                max="2.0"
                                step="0.1"
                                value={localConfig.minDist}
                                onChange={(e) => handleChange('minDist', parseFloat(e.target.value))}
                            />
                        </label>
                        <span className="help-text">Compacité</span>
                    </div>

                    <div className="control-group checkbox">
                        <label>
                            <input
                                type="checkbox"
                                checked={localConfig.enableFontFusion}
                                onChange={(e) => handleChange('enableFontFusion', e.target.checked)}
                            />
                            Fusionner familles
                        </label>
                    </div>

                    {progress && (
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${progress.progress}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LiveControls;
