import React from 'react';
import './Symbols.css';

const SYMBOL_GLYPHS = [
  '𓆉','𓃹','𓆗','𓆜','𓅣','𓇬','𓇽','𓆝','𓁹','𓂂',
  '𓂎','𓄅','𓄋','𓄓','𓄝','𓄰','𓄼','𓅌','𓇄','𓇓',
  '𓇜','𓇠','𓇦','𓇩','𓊐','𓊑','𓊒','𓊗','𓊤','𓊮',
  '𓊸','𓇣','𓆺','𓈕','𓋙','𓋜','𓋝','𓋩','𓋯','𓋭',
  '𓌅','𓌗','𓌸','𓍢','𓍭','𓍼','𓎂','𓎕','𓎤',
  '𓏲','𓏋','𓐜','𓐬','𓐮','𓎾','𓎷','𓍳','𓍮','𓍛',
  '𓍔','𓍕','𓌴','𓌪','𓌕','𓋻','𓋛','𓋐','𓊽','𓊶',
  '𓉾','𓉵','𓈞','𓇸','𓇝','𓍶','𓂪','𓄔','𓄢','𓄽',
  '𓇠','𓊃','𓋎','𓋤','𓌽','𓍓','𓍡','𓎦','𓏉','𓏊',
  '𓏖','𓏡','𓏯','𓏴','𓐢','𓐧','𓂄','𓂇','𓂈','𓄨',
  '𓇞','𓌥','𓊇','𓌆','𓍬','𓎘',
];

const ROWS = 21;
const COLS = 5;

const Symbols = () => {
  const columns = Array.from({ length: COLS }, (_, c) =>
    SYMBOL_GLYPHS.slice(c * ROWS, c * ROWS + ROWS)
  );

  return (
    <main className="symbols-page">
      <div className="symbols-grid">
        <section className="symbols-panel">
          {columns.map((col, i) => (
            <div className="symbols-column" key={`u-${i}`}>
              {col.map((g, j) => (
                <span className="glyph" key={j}>{g}</span>
              ))}
            </div>
          ))}
        </section>

        <section className="symbols-panel">
          {columns.map((col, i) => (
            <div className="symbols-column" key={`r-${i}`}>
              {col.map((g, j) => (
                <span className="glyph glyph-rotated" key={j}>{g}</span>
              ))}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
};

export default Symbols;
