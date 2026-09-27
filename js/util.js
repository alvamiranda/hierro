'use strict';
/* Utilidades de formato y parseo (es-AR) */

const _nf = d => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d });
const NF = [_nf(0), _nf(1), _nf(2)];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Convierte lo que escribe el usuario ("27,5", "27.5", "") a número o null */
const num = v => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return isNaN(n) ? null : n;
};

/** Número → texto para un input ("27,5") */
const inp = v => (v == null || v === '') ? '' : String(v).replace('.', ',');

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

const DAY = 864e5;

const Fmt = {
  n: (v, d = 1) => (v == null || isNaN(v)) ? '—' : NF[d].format(v),
  kg: (v, d = 2) => (v == null || isNaN(v)) ? '—' : NF[d].format(v) + ' kg',
  /** con signo: +2,5 / −3 / 0 */
  signed: (v, d = 1, unit = '') => {
    if (v == null || isNaN(v)) return '—';
    const r = round(v, d);
    if (r === 0) return '0' + unit;
    return (r > 0 ? '+' : '−') + NF[d].format(Math.abs(r)) + unit;
  },
  pct: v => {
    if (v == null || !isFinite(v)) return '—';
    const r = round(v * 100, 1);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + NF[1].format(Math.abs(r)) + ' %';
  },
  date: ms => new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  dShort: ms => new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
  dLong: ms => {
    const s = new Date(ms).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  month: ms => {
    const s = new Date(ms).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  time: ms => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
  /** segundos → m:ss o h:mm:ss */
  clock: sec => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const pad = x => String(x).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  },
  /** duración legible: "1 h 05 min", "48 min" */
  dur: sec => {
    const m = Math.round(sec / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
  },
  ago: ms => {
    const a = new Date(ms); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    const d = Math.round((b - a) / DAY);
    if (d <= 0) return 'hoy';
    if (d === 1) return 'ayer';
    return `hace ${d} días`;
  },
  daysSince: ms => {
    const a = new Date(ms); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((b - a) / DAY));
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
