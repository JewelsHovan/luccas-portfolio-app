import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ selectedCollection, setSelectedCollection }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLinkClick = () => {
    setIsMenuOpen(false);
  };

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

        {/* Mobile Hamburger Menu */}
        {/* <button 
          className={`hamburger ${isMenuOpen ? 'open' : ''}`}
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button> */}
      </div>

      {/* Mobile Navigation */}
      {/* <nav className={`mobile-nav ${isMenuOpen ? 'open' : ''}`}>
        <Link 
          to="/" 
          className={`mobile-nav-link ${location.pathname === '/' ? 'active' : ''}`}
          onClick={handleLinkClick}
        >
          Home
        </Link>
        <Link 
          to="/collections" 
          className={`mobile-nav-link ${location.pathname === '/collections' ? 'active' : ''}`}
          onClick={handleLinkClick}
        >
          Collections
        </Link>
      </nav> */}
    </header>
  );
};

export default Header;