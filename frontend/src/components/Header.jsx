import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ selectedCollection, setSelectedCollection }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleCollectionClick = (collection) => {
    if (location.pathname !== '/collections') {
      navigate('/collections');
    }
    if (setSelectedCollection) {
      setSelectedCollection(collection);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo-link">
          <h1 className="logo">LUCCAS BOOTH</h1>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="desktop-nav">
          <button 
            className={`nav-link ${location.pathname === '/collections' && selectedCollection === 'paintings' ? 'active' : ''}`}
            onClick={() => handleCollectionClick('paintings')}
          >
            Paintings
          </button>
          <button 
            className={`nav-link ${location.pathname === '/collections' && selectedCollection === 'photo' ? 'active' : ''}`}
            onClick={() => handleCollectionClick('photo')}
          >
            Photo
          </button>
          <button 
            className={`nav-link ${location.pathname === '/collections' && selectedCollection === 'sketchbooks' ? 'active' : ''}`}
            onClick={() => handleCollectionClick('sketchbooks')}
          >
            Sketchbooks
          </button>
        </nav>

      </div>
    </header>
  );
};

export default Header;