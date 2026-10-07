import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import apiService from '../services/api';
import { legacyBookId, pageIndexFromScroll } from '../services/libraryNavigation';
import GalleryImage from './GalleryImage';
import './Library.css';

export default function Library() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const bookId = searchParams.get('book') || '';
  const [shelf, setShelf] = useState({ status: 'loading', books: [], error: '' });
  const [bookState, setBookState] = useState({ id: '', status: 'idle', pages: [] });
  const [shelfRetry, setShelfRetry] = useState(0);
  const [bookRetry, setBookRetry] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const shelfRef = useRef(null);
  const pagesRef = useRef(null);
  const backRef = useRef(null);
  const shelfHeadingRef = useRef(null);
  const requestedBookRefresh = useRef('');
  const coverRefs = useRef(new Map());
  const shelfPosition = useRef(0);
  const previousBook = useRef('');
  const openedFromShelf = useRef('');
  const hasBook = bookState.id === bookId && bookState.status === 'ready';
  const pages = hasBook ? bookState.pages : [];

  useEffect(() => {
    const controller = new AbortController();
    setShelf((previous) => ({ ...previous, status: 'loading', error: '' }));
    apiService.fetchLibraryBooks({ signal: controller.signal, refresh: shelfRetry > 0 }).then((books) => {
      if (!controller.signal.aborted) setShelf({ status: 'ready', books, error: '' });
    }).catch((error) => {
      if (!controller.signal.aborted) setShelf({ status: 'error', books: [], error: error.message });
    });
    return () => controller.abort();
  }, [shelfRetry]);

  // Old bookmarks lead to the new single-page Library, not a mixed-page book.
  useEffect(() => {
    if (!type || shelf.status !== 'ready') return;
    const params = new URLSearchParams(searchParams);
    const id = params.get('book') || legacyBookId(type, shelf.books);
    if (id) params.set('book', id);
    else params.delete('book');
    navigate(`/library${params.toString() ? `?${params}` : ''}`, { replace: true });
  }, [type, shelf.status, shelf.books, searchParams, navigate]);

  useEffect(() => {
    if (!bookId) return;
    const controller = new AbortController();
    setBookState({ id: bookId, status: 'loading', pages: [] });
    setCurrentPage(0);
    const refresh = requestedBookRefresh.current === bookId && bookRetry > 0;
    requestedBookRefresh.current = '';
    apiService.fetchLibraryBook(bookId, { signal: controller.signal, refresh }).then((data) => {
      if (!controller.signal.aborted) setBookState({ id: bookId, status: 'ready', ...data });
    }).catch((error) => {
      if (!controller.signal.aborted) setBookState({ id: bookId, status: 'error', error: error.message, pages: [] });
    });
    return () => controller.abort();
  }, [bookId, bookRetry]);

  useLayoutEffect(() => {
    const last = previousBook.current;
    previousBook.current = bookId;
    if (bookId) {
      if (last !== bookId) backRef.current?.focus({ preventScroll: true });
    } else if (last) {
      if (shelfRef.current) shelfRef.current.scrollLeft = shelfPosition.current;
      (coverRefs.current.get(last) ?? shelfRef.current ?? shelfHeadingRef.current)?.focus({ preventScroll: true });
    }
  }, [bookId]);

  useLayoutEffect(() => {
    if (hasBook && pagesRef.current) pagesRef.current.scrollLeft = 0;
  }, [hasBook]);

  const scrollToPage = useCallback((index) => {
    if (!pagesRef.current || pages.length === 0) return;
    const next = Math.max(0, Math.min(pages.length - 1, index));
    pagesRef.current.scrollTo({ left: next * pagesRef.current.clientWidth, behavior: 'auto' });
    setCurrentPage(next);
  }, [pages.length]);

  useEffect(() => {
    if (!hasBook) return;
    let width = pagesRef.current?.clientWidth;
    const resize = () => {
      const nextWidth = pagesRef.current?.clientWidth;
      // Mobile browser-bar height changes must not interrupt an ongoing swipe.
      if (nextWidth !== width) {
        width = nextWidth;
        scrollToPage(currentPage);
      }
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [hasBook, currentPage, scrollToPage]);

  useEffect(() => {
    if (!hasBook) return;
    for (const index of [currentPage - 1, currentPage + 1]) {
      const page = bookState.pages[index];
      if (page) {
        const preload = new Image();
        preload.src = page.url;
      }
    }
  }, [hasBook, bookState.pages, currentPage]);

  const openBook = (id) => {
    shelfPosition.current = shelfRef.current?.scrollLeft || 0;
    openedFromShelf.current = id;
    const params = new URLSearchParams(searchParams);
    params.set('book', id);
    setSearchParams(params);
  };

  const closeBook = () => {
    if (openedFromShelf.current === bookId) {
      navigate(-1);
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.delete('book');
    setSearchParams(params, { replace: true });
  };

  const handleReaderKeys = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBook();
      return;
    }
    if (!hasBook) return;
    let next;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') next = currentPage + 1;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') next = currentPage - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = pages.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      scrollToPage(next);
    }
  };

  const retryShelf = () => {
    shelfHeadingRef.current?.focus({ preventScroll: true });
    setShelfRetry((retry) => retry + 1);
  };

  const retryBook = () => {
    requestedBookRefresh.current = bookId;
    backRef.current?.focus({ preventScroll: true });
    setBookRetry((retry) => retry + 1);
  };

  const scrollShelf = (direction) => shelfRef.current?.scrollBy({ left: direction * shelfRef.current.clientWidth * 0.75, behavior: 'auto' });
  const readerError = bookState.id === bookId && bookState.status === 'error';

  return (
    <main className="library-page" aria-label="Library">
      <div className="library-shelf-area" hidden={Boolean(bookId)}>
        <div className="library-toolbar"><h2 ref={shelfHeadingRef} tabIndex={-1}>Library</h2><Link to="/library/symbols">Symbols ↗</Link></div>
        {shelf.status === 'loading' && <div className="library-state" role="status">Loading books…</div>}
        {shelf.status === 'error' && <div className="library-state" role="alert"><h3>Could not load Library</h3><p>{shelf.error}</p><button type="button" onClick={retryShelf}>Try again</button></div>}
        {shelf.status === 'ready' && shelf.books.length === 0 && <div className="library-state"><p>No books have been published yet.</p></div>}
        {shelf.status === 'ready' && shelf.books.length > 0 && <>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Native horizontal scrolling must be keyboard-accessible. */}
          <section className="library-shelf" ref={shelfRef} tabIndex={0} aria-label="Book covers; scroll horizontally">
            {shelf.books.map((book, index) => <button
              key={book.id} type="button" className="library-book" data-book-id={book.id}
              ref={(element) => { if (element) coverRefs.current.set(book.id, element); else coverRefs.current.delete(book.id); }}
              onClick={() => openBook(book.id)} aria-label={`Open book ${book.title}`}
            >
              <GalleryImage key={`${book.id}:${book.cover.url}`} image={{ ...book.cover, name: `${book.title} cover` }} index={index} showRetry={false} />
              <span>{book.title}</span>
            </button>)}
          </section>
          <div className="library-shelf-controls">
            {shelf.books.length > 1 && <button type="button" onClick={() => scrollShelf(-1)} aria-label="Scroll books left">←</button>}
            <span>Scroll across the covers. Open a book to see its pages.</span>
            {shelf.books.length > 1 && <button type="button" onClick={() => scrollShelf(1)} aria-label="Scroll books right">→</button>}
          </div>
        </>}
      </div>
      {bookId && <section className="library-open-book" aria-label="Open book reader" onKeyDown={handleReaderKeys}>
        <div className="library-toolbar"><button type="button" ref={backRef} onClick={closeBook}>← Back to shelf</button><h2>{hasBook ? bookState.book.title : 'Book'}</h2></div>
        {!hasBook && !readerError && <div className="library-state" role="status">Loading pages…</div>}
        {readerError && <div className="library-state" role="alert"><h3>Could not open this book</h3><p>{bookState.error}</p><button type="button" onClick={retryBook}>Try again</button></div>}
        {hasBook && <>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Native horizontal scrolling must be keyboard-accessible. */}
          <section className="library-pages" ref={pagesRef} tabIndex={0} aria-label={`${bookState.book.title} pages; swipe horizontally or use arrow keys`}
            onScroll={() => setCurrentPage(pageIndexFromScroll(pagesRef.current.scrollLeft, pagesRef.current.clientWidth, pages.length))}>
            {pages.map((page, index) => <div className="library-page-item" key={`${page.id}:${page.url}`}>
              <GalleryImage image={page} index={index === currentPage ? 0 : index + 1} />
            </div>)}
          </section>
          <div className="library-reader-controls">
            <button type="button" onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous page">←</button>
            <span role="status" aria-live="polite" aria-atomic="true">{bookState.book.title} · {currentPage + 1} / {pages.length}</span>
            <button type="button" onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage === pages.length - 1} aria-label="Next page">→</button>
          </div>
        </>}
      </section>}
    </main>
  );
}
