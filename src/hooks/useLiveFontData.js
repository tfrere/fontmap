import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook pour gérer les données de polices en direct via UMAP Worker
 */
export function useLiveFontData() {
    const [fonts, setFonts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(null);

    // Configuration par défaut
    const [config, setConfig] = useState({
        nNeighbors: 15,
        minDist: 1.0,
        enableFontFusion: true,
        randomSeed: 42
    });

    const workerRef = useRef(null);
    const isCalculatedRef = useRef(false);

    // Initialiser le worker
    useEffect(() => {
        // Pointer vers le worker existant dans DebugUMAP
        // Note: Le chemin est relatif à ce fichier (src/hooks)
        const worker = new Worker(new URL('../components/DebugUMAP/workers/umap.worker.js', import.meta.url));

        worker.onmessage = (e) => {
            const { type, payload } = e.data;

            if (type === 'PROGRESS') {
                setProgress(payload);
            } else if (type === 'RESULT') {
                setFonts(payload.fonts);
                setLoading(false);
                setProgress(null);
                isCalculatedRef.current = true;
            } else if (type === 'ERROR') {
                setError(payload);
                setLoading(false);
                setProgress(null);
            }
        };

        workerRef.current = worker;

        // Lancer le calcul initial
        if (!isCalculatedRef.current) {
            worker.postMessage({
                type: 'CALCULATE',
                payload: config
            });
        }

        return () => {
            worker.terminate();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Exécuter une seule fois au montage

    // Mettre à jour la configuration et relancer le calcul
    const updateConfig = useCallback((newConfig) => {
        if (!workerRef.current) return;

        const mergedConfig = { ...config, ...newConfig };
        setConfig(mergedConfig);
        setLoading(true);
        setError(null);

        workerRef.current.postMessage({
            type: 'CALCULATE',
            payload: mergedConfig
        });
    }, [config]);

    return {
        fonts,
        loading,
        error,
        progress,
        config,
        updateConfig
    };
}
