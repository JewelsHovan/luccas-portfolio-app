import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './components/Home';
import Collections from './components/Collections';
import Library from './components/Library';
import Symbols from './components/Symbols';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:type" element={<Collections />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/symbols" element={<Symbols />} />
          <Route path="/library/:type" element={<Collections />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
