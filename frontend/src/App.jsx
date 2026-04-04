import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './components/Home';
import Collections from './components/Collections';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function App() {
  const [selectedCollection, setSelectedCollection] = useState('');

  return (
    <Router>
      <div className="app">
        <Header selectedCollection={selectedCollection} setSelectedCollection={setSelectedCollection} />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/collections" element={<Collections selectedCollection={selectedCollection} setSelectedCollection={setSelectedCollection} />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </Router>
  );
}

export default App;