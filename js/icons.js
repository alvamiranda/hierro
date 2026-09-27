'use strict';
/* Íconos SVG inline (trazo = currentColor) */
const I = (() => {
  const s = p => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  return {
    plus: s('<path d="M12 5v14M5 12h14"/>'),
    check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    dots: s('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    back: s('<path d="M15 5l-7 7 7 7"/>'),
    right: s('<path d="M9 5l7 7-7 7"/>'),
    down: s('<path d="M5 9l7 7 7-7"/>'),
    up: s('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    dn: s('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    x: s('<path d="M6 6l12 12M18 6L6 18"/>'),
    trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>'),
    copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
    edit: s('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'),
    timer: s('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
    play: s('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
    pause: s('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>'),
    chart: s('<path d="M4 19h16M6 15l4-5 3.5 3L18 7"/>'),
    lift: s('<path d="M2.5 12h19M5 8v8M8 6v12M16 6v12M19 8v8"/>'),
    hist: s('<path d="M3.5 12a8.5 8.5 0 102.5-6"/><path d="M3 4v4h4M12 8v4l3 2"/>'),
    list: s('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
    gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    search: s('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    note: s('<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>'),
    trophy: s('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4a3 3 0 003 3M17 6h3a3 3 0 01-3 3"/>'),
  };
})();
