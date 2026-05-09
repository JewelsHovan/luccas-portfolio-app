import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Header.css';

const NAV_ITEMS = [
  { label: 'Photo', key: 'photo', to: '/collections/photo' },
  { label: 'Assemblage', key: 'assemblage', to: '/collections/assemblage' },
  { label: 'Drawings', key: 'drawings', to: '/collections/drawings' },
  { label: 'Paintings', key: 'paintings', to: '/collections/paintings' },
  { label: 'Library', key: 'library', to: '/library' },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);

  const activeKey = (() => {
    const p = location.pathname;
    if (p.startsWith('/collections/')) return p.split('/')[2];
    if (p.startsWith('/library')) return 'library';
    return null;
  })();

  const toggleMenu = () => setIsMenuOpen(o => !o);
  const closeMenu = () => setIsMenuOpen(false);

  const handleNav = (to) => {
    navigate(to);
    closeMenu();
  };

  useEffect(() => {
    if (!isMenuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  useEffect(() => { closeMenu(); }, [location.pathname]);

  return (
    <header className="header" ref={menuRef}>
      <div className="header-content">
        <Link to="/" className="logo-link">
          <h1 className="logo">LUCCAS BOOTH</h1>
        </Link>

        <button
          className={`hamburger ${isMenuOpen ? 'open' : ''}`}
          onClick={toggleMenu}
          aria-label="Menu"
          aria-expanded={isMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      {isMenuOpen && (
        <div className="hamburger-dropdown">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item.key}
              type="button"
              className={`dropdown-link ${activeKey === item.key ? 'active' : ''}`}
              onClick={() => handleNav(item.to)}
              style={{ borderBottom: i < NAV_ITEMS.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};

export default Header;
