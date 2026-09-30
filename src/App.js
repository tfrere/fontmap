import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

const FontMap = React.lazy(() => import('./components/FontMap/').then(module => ({ default: module.FontMap })));
const ExperimentsIndex = React.lazy(() => import('./experiments/pages/ExperimentsIndex'));
const SizeByUse = React.lazy(() => import('./experiments/pages/SizeByUse'));
const Designers = React.lazy(() => import('./experiments/pages/Designers'));

function FullPageSpinner() {
  return (
    <div className="app-loader" role="status" aria-label="Loading FontMap">
      <div className="app-loader-spinner" />
    </div>
  );
}

const lazy = (element) => <React.Suspense fallback={<FullPageSpinner />}>{element}</React.Suspense>;

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={lazy(<FontMap />)} />
        {/* Same element as "/" so switching between the two keeps the map mounted */}
        <Route path="/how-it-works" element={lazy(<FontMap />)} />
        <Route path="/experiments" element={lazy(<ExperimentsIndex />)} />
        <Route path="/experiments/size-by-use" element={lazy(<SizeByUse />)} />
        <Route path="/experiments/designers/:name?" element={lazy(<Designers />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
