import React from 'react';

// Crisp SVG piece definitions for high DPI rendering
const SVG_PIECES = {
  wP: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <path d="M 22.5,9 C 20.01,9 18,11.01 18,13.5 C 18,14.6 18.4,15.6 19,16.4 C 16.5,17.4 14.7,19.8 14.5,22.7 C 16.7,22.7 18.5,24.5 18.5,26.7 C 18.5,27 18.4,27.3 18.4,27.6 C 17.1,28.8 16.3,30.5 16.3,32.5 L 28.7,32.5 C 28.7,30.5 27.9,28.8 26.6,27.6 C 26.6,27.3 26.5,27 26.5,26.7 C 26.5,24.5 28.3,22.7 30.5,22.7 C 30.3,19.8 28.5,17.4 26,16.4 C 26.6,15.6 27,14.6 27,13.5 C 27,11.01 24.99,9 22.5,9 z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 12.5,36 L 32.5,36 L 32.5,34 L 12.5,34 z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
    </svg>
  ),
  wN: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#ffffff" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 24,18 C 24.3,22.3 22,25.3 19,27 C 16,28.7 12,28.5 10,25 C 8,21.5 10.5,17.5 14,16.5 C 17.5,15.5 23.7,13.7 24,18 z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
      <circle cx="15" cy="19.5" r="1.5" fill="#000000" />
    </svg>
  ),
  wB: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="none" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <g fill="#ffffff">
          <path d="M 9,36 C 12.39,35.03 19.11,36.46 22.5,34 C 25.89,36.46 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 37.35,38.99 L 7.65,38.99 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z" />
          <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,22 30,22 C 30,14 25,12 22.5,12 C 20,12 15,14 15,22 C 15,22 14.5,30.5 15,32 z" />
          <circle cx="22.5" cy="10" r="2.5" />
        </g>
        <path d="M 17.5,26 L 27.5,26 M 22.5,21 L 22.5,31" />
      </g>
    </svg>
  ),
  wR: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="#ffffff" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 9,36 L 36,36 L 36,32 L 9,32 z" />
        <path d="M 12,32 L 12,25 L 33,25 L 33,32 z" />
        <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z" />
        <path d="M 12,25 L 10,14 L 35,14 L 33,25 z" />
      </g>
    </svg>
  ),
  wQ: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="#ffffff" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 22.5,10 L 14,25 L 7,14 z" />
        <path d="M 9,26 L 11,36 L 34,36 L 36,26 z" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="14" cy="9" r="2" />
        <circle cx="22.5" cy="6" r="2" />
        <circle cx="31" cy="9" r="2" />
        <circle cx="39" cy="12" r="2" />
      </g>
    </svg>
  ),
  wK: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="#ffffff" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 22.5,11.63 L 22.5,6 M 20,8 L 25,8" />
        <path d="M 22.5,25 C 22.5,25 27,17.5 27,14 C 27,11.5 25,9.5 22.5,9.5 C 20,9.5 18,11.5 18,14 C 18,17.5 22.5,25 22.5,25 z" />
        <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 L 33.5,30 C 33.5,30 31,25.5 27.5,27.5 C 24,29.5 21,29.5 17.5,27.5 C 14,25.5 11.5,30 11.5,30 z" />
        <path d="M 11.5,30 L 33.5,30" />
      </g>
    </svg>
  ),
  bP: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <path d="M 22.5,9 C 20.01,9 18,11.01 18,13.5 C 18,14.6 18.4,15.6 19,16.4 C 16.5,17.4 14.7,19.8 14.5,22.7 C 16.7,22.7 18.5,24.5 18.5,26.7 C 18.5,27 18.4,27.3 18.4,27.6 C 17.1,28.8 16.3,30.5 16.3,32.5 L 28.7,32.5 C 28.7,30.5 27.9,28.8 26.6,27.6 C 26.6,27.3 26.5,27 26.5,26.7 C 26.5,24.5 28.3,22.7 30.5,22.7 C 30.3,19.8 28.5,17.4 26,16.4 C 26.6,15.6 27,14.6 27,13.5 C 27,11.01 24.99,9 22.5,9 z" fill="#333333" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 12.5,36 L 32.5,36 L 32.5,34 L 12.5,34 z" fill="#333333" stroke="#000000" strokeWidth="1.5" />
    </svg>
  ),
  bN: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#333333" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 24,18 C 24.3,22.3 22,25.3 19,27 C 16,28.7 12,28.5 10,25 C 8,21.5 10.5,17.5 14,16.5 C 17.5,15.5 23.7,13.7 24,18 z" fill="#333333" stroke="#000000" strokeWidth="1.5" />
      <circle cx="15" cy="19.5" r="1.5" fill="#ffffff" />
    </svg>
  ),
  bB: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="none" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <g fill="#333333">
          <path d="M 9,36 C 12.39,35.03 19.11,36.46 22.5,34 C 25.89,36.46 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 37.35,38.99 L 7.65,38.99 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z" />
          <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,22 30,22 C 30,14 25,12 22.5,12 C 20,12 15,14 15,22 C 15,22 14.5,30.5 15,32 z" />
          <circle cx="22.5" cy="10" r="2.5" />
        </g>
        <path d="M 17.5,26 L 27.5,26 M 22.5,21 L 22.5,31" stroke="#ffffff" />
      </g>
    </svg>
  ),
  bR: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="#333333" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 9,36 L 36,36 L 36,32 L 9,32 z" />
        <path d="M 12,32 L 12,25 L 33,25 L 33,32 z" />
        <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z" />
        <path d="M 12,25 L 10,14 L 35,14 L 33,25 z" />
      </g>
    </svg>
  ),
  bQ: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="#333333" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 22.5,10 L 14,25 L 7,14 z" />
        <path d="M 9,26 L 11,36 L 34,36 L 36,26 z" />
        <circle cx="6" cy="12" r="2" fill="#ffffff" />
        <circle cx="14" cy="9" r="2" fill="#ffffff" />
        <circle cx="22.5" cy="6" r="2" fill="#ffffff" />
        <circle cx="31" cy="9" r="2" fill="#ffffff" />
        <circle cx="39" cy="12" r="2" fill="#ffffff" />
      </g>
    </svg>
  ),
  bK: (
    <svg viewBox="0 0 45 45" className="piece-svg">
      <g fill="#333333" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 22.5,11.63 L 22.5,6 M 20,8 L 25,8" stroke="#ffffff" />
        <path d="M 22.5,25 C 22.5,25 27,17.5 27,14 C 27,11.5 25,9.5 22.5,9.5 C 20,9.5 18,11.5 18,14 C 18,17.5 22.5,25 22.5,25 z" />
        <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 L 33.5,30 C 33.5,30 31,25.5 27.5,27.5 C 24,29.5 21,29.5 17.5,27.5 C 14,25.5 11.5,30 11.5,30 z" />
        <path d="M 11.5,30 L 33.5,30" stroke="#ffffff" />
      </g>
    </svg>
  )
};

export function renderPieceSvg(color, type) {
  if (!color || !type) return null;
  const key = `${color}${type.toUpperCase()}`;
  return SVG_PIECES[key] || null;
}
