import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DebugUMAP from './components/DebugUMAP';
import './App.css';

// Import direct pour debug-umap, lazy pour le reste
const FontMap = React.lazy(() => import('./components/FontMap/').then(module => ({ default: module.FontMap })));
const FontMapV2 = React.lazy(() => import('./components/FontMapV2/FontMapV2'));

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/debug-umap" element={<DebugUMAP />} />
        <Route path="/v2" element={
          <React.Suspense fallback={<div>Loading FontMapV2...</div>}>
            <FontMapV2 />
          </React.Suspense>
        } />
        <Route path="/" element={
          <React.Suspense fallback={<div>Chargement...</div>}>
            <FontMap />
          </React.Suspense>
        } />
      </Routes>
    </Router>
  );
}

export default App;
