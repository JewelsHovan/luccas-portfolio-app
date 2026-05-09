import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Library.css';

const SPINES = [
  { title: "J'24",        slug: 'j24',         width: 600, height: 64 },
  { title: 'Sketchbooks', slug: 'sketchbooks', width: 600, height: 78 },
  { title: 'Symbols',     slug: 'symbols',     width: 600, height: 92 },
];

const BookSpine = ({ title, width, height, onClick }) => (
  <button
    type="button"
    className="book-spine"
    onClick={onClick}
    aria-label={`Open ${title}`}
    style={{ '--spine-w': `${width}px`, '--spine-h': `${height}px` }}
  >
    <span className="spine-title">{title.toUpperCase()}</span>
  </button>
);

const Library = () => {
  const navigate = useNavigate();
  return (
    <main className="library-page">
      <div className="library-stack">
        {SPINES.map((b) => (
          <BookSpine
            key={b.slug}
            title={b.title}
            width={b.width}
            height={b.height}
            onClick={() => navigate(`/library/${b.slug}`)}
          />
        ))}
      </div>
    </main>
  );
};

export default Library;
