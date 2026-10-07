import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Collections from './components/Collections';
import Header from './components/Header';
import Home from './components/Home';
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
          <Route path="/library/:type" element={<Library />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
