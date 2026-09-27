'use strict';
/* Gráficos SVG propios (sin librerías: funcionan offline). */

const Charts = (() => {
  const W = 340, H = 190, L = 46, R = 14, T = 16, B = 26;

  function yScale(ys, zeroBase) {
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    else { const p = (hi - lo) * 0.15; lo -= p; hi += p; }
    if (zeroBase || (lo < 0 && Math.min(...ys) >= 0)) lo = Math.min(0, lo < 0 ? 0 : lo);
    return [lo, hi];
  }

  function grid(lo, hi, fmt) {
    let g = '';
    [hi, (hi + lo) / 2, lo].forEach((v, i) => {
      const y = T + i / 2 * (H - T - B);
      g += `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/>`;
      g += `<text class="c-lbl" x="${L - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    });
    return g;
  }

  /** pts: [{x (ms), y, label}] */
  function line(pts, fmt) {
    if (!pts.length) return '<div class="chart-empty">Sin datos en este rango</div>';
    const n = pts.length;
    const [lo, hi] = yScale(pts.map(p => p.y));
    const x0 = pts[0].x, span = pts[n - 1].x - x0;
    const X = (p, i) => n === 1 ? (L + W - R) / 2 : span > 0 ? L + (p.x - x0) / span * (W - L - R) : L + i / (n - 1) * (W - L - R);
    const Y = y => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    const xy = pts.map((p, i) => [X(p, i), Y(p.y)]);
    const d = 'M' + xy.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
    const area = `${d}L${xy[n - 1][0].toFixed(1)},${H - B}L${xy[0][0].toFixed(1)},${H - B}Z`;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Gráfico">`;
    s += `<defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="c-stop1"/><stop offset="1" class="c-stop2"/></linearGradient></defs>`;
    s += grid(lo, hi, fmt);
    if (n > 1) s += `<path class="c-area" d="${area}" fill="url(#cg)"/><path class="c-line" d="${d}"/>`;
    xy.forEach((q, i) => {
      const last = i === n - 1;
      if (n <= 40 || last) s += `<circle class="c-dot${last ? ' sel' : ''}" data-i="${i}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${last ? 4.5 : 3.2}"/>`;
      s += `<circle class="c-hit" data-a="chartPt" data-i="${i}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="13"/>`;
    });
    s += `<text class="c-lbl" x="${L}" y="${H - 6}">${Fmt.dShort(pts[0].x)}</text>`;
    if (n > 1) s += `<text class="c-lbl" x="${W - R}" y="${H - 6}" text-anchor="end">${Fmt.dShort(pts[n - 1].x)}</text>`;
    return s + '</svg>';
  }

  /** buckets: [{label, v, x}] */
  function bars(buckets, fmt) {
    if (!buckets.length) return '<div class="chart-empty">Sin datos en este rango</div>';
    const n = buckets.length;
    let hi = Math.max(2, ...buckets.map(b => b.v));
    if (hi % 2) hi++; // ejes enteros: 0, hi/2, hi
    const lo = 0;
    const bw = (W - L - R) / n;
    const Y = y => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Frecuencia">`;
    s += grid(lo, hi, fmt);
    buckets.forEach((b, i) => {
      const x = L + i * bw + bw * 0.15, w = Math.max(1.5, bw * 0.7), y = Y(b.v);
      s += `<rect class="c-bar${i === n - 1 ? ' sel' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y).toFixed(1)}" rx="2"/>`;
      s += `<rect class="c-hit" data-a="chartPt" data-i="${i}" x="${(L + i * bw).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}"/>`;
    });
    s += `<text class="c-lbl" x="${L}" y="${H - 6}">${esc(buckets[0].label)}</text>`;
    if (n > 1) s += `<text class="c-lbl" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(buckets[n - 1].label)}</text>`;
    return s + '</svg>';
  }

  return { line, bars };
})();
