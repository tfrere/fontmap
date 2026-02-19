import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import DebugUMAP from './components/DebugUMAP';
import './App.css';

const FontMap = React.lazy(() => import('./components/FontMap/').then(module => ({ default: module.FontMap })));
const FontMapV2 = React.lazy(() => import('./components/FontMapV2/FontMapV2'));

function FullPageSpinner() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#fff'
    }}>
      <div style={{
        width: 32, height: 32,
        border: '3px solid #e0e0e0',
        borderTop: '3px solid #333',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/debug-umap" element={<DebugUMAP />} />
        <Route path="/v2" element={
          <React.Suspense fallback={<FullPageSpinner />}>
            <FontMapV2 />
          </React.Suspense>
        } />
        <Route path="/" element={
          <React.Suspense fallback={<FullPageSpinner />}>
            <FontMap />
          </React.Suspense>
        } />
      </Routes>
    </Router>
  );
}

export default App;
