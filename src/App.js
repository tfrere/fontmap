import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';

const FontMap = React.lazy(() => import('./components/FontMap/').then(module => ({ default: module.FontMap })));

function FullPageSpinner() {
  return (
    <div className="app-loader" role="status" aria-label="Loading FontMap">
      <div className="app-loader-spinner" />
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <React.Suspense fallback={<FullPageSpinner />}>
            <FontMap />
          </React.Suspense>
        } />
        {/* Same element as "/" so switching between the two keeps the map mounted */}
        <Route path="/how-it-works" element={
          <React.Suspense fallback={<FullPageSpinner />}>
            <FontMap />
          </React.Suspense>
        } />
      </Routes>
    </Router>
  );
}

export default App;
