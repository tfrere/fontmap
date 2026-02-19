/**
 * Hook pour calculer UMAP en direct via Web Worker
 */

import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook pour gérer le calcul UMAP en direct
 */
export function useLiveUMAP() {
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const workerRef = useRef(null);
  const resolveRef = useRef(null);
  const rejectRef = useRef(null);

  // Initialiser le worker
  useEffect(() => {
    // Création du worker
    // Note: CRA v5 gère automatiquement l'import avec cette syntaxe
    const worker = new Worker(new URL('../workers/umap.worker.js', import.meta.url));

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'PROGRESS') {
        setProgress(payload);
      } else if (type === 'RESULT') {
        setResult(payload);
        setIsCalculating(false);
        if (resolveRef.current) {
          resolveRef.current(payload);
          resolveRef.current = null;
        }
      } else if (type === 'ERROR') {
        setError(payload);
        setIsCalculating(false);
        if (rejectRef.current) {
          rejectRef.current(new Error(payload));
          rejectRef.current = null;
        }
      }
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  /**
   * Calcule UMAP avec les paramètres donnés
   */
  const calculate = useCallback((config) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker non initialisé'));
        return;
      }

      setIsCalculating(true);
      setError(null);
      setProgress({ stage: 'starting', progress: 0 });

      resolveRef.current = resolve;
      rejectRef.current = reject;

      workerRef.current.postMessage({
        type: 'CALCULATE',
        payload: config
      });
    });
  }, []);

  /**
   * Réinitialise l'état
   */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
    setIsCalculating(false);
  }, []);

  return {
    calculate,
    reset,
    isCalculating,
    progress,
    error,
    result
  };
}
