'use strict';
/* Motor de análisis: métricas por sesión, PRs, comparación y tendencias.
   Nunca se evalúa el progreso con una sola serie ni con una sola métrica. */

const Stats = (() => {

  /** e1RM (Epley). Solo aplicable con carga y entre 1 y 12 reps. */
  function e1rm(w, r) {
    if (!(w > 0) || !(r > 0) || r > 12) return null;
    return r === 1 ? w : w * (1 + r / 30);
  }

  /** Series completadas con reps > 0, normalizadas a {w, r, rir, doubtful, note} */
  function validSets(sets) {
    return (sets || [])
      .filter(s => s.done && num(s.reps) > 0)
      .map(s => ({ w: num(s.weight) || 0, r: num(s.reps), rir: num(s.rir), doubtful: !!s.doubtful, note: s.note || '' }));
  }

  /** compara dos series: mejor e1RM, luego más peso, luego más reps */
  function cmpSet(a, b) {
    const ea = e1rm(a.w, a.r), eb = e1rm(b.w, b.r);
    if (ea != null && eb != null && Math.abs(ea - eb) > 1e-9) return ea - eb;
    if (a.w !== b.w) return a.w - b.w;
    return a.r - b.r;
  }

  /** Métricas de un conjunto de series de una sesión */
  function metrics(sets, opts = {}) {
    if (!sets || !sets.length) return null;
    let total = 0, vol = 0, maxR = 0, topW = 0, bestE = null, bestSet = null, bestProd = 0, rirSum = 0, rirN = 0;
    const byW = {}, wCount = {};
    for (const s of sets) {
      total += s.r;
      vol += s.w * s.r;
      if (s.r > maxR) maxR = s.r;
      if (s.w > topW) topW = s.w;
      const e = opts.noE1rm ? null : e1rm(s.w, s.r);
      if (e != null && (bestE == null || e > bestE)) bestE = e;
      if (!bestSet || cmpSet(s, bestSet) > 0) bestSet = s;
      if (s.w * s.r > bestProd) bestProd = s.w * s.r;
      if (s.rir != null) { rirSum += s.rir; rirN++; }
      byW[s.w] = Math.max(byW[s.w] || 0, s.r);
      wCount[s.w] = (wCount[s.w] || 0) + 1;
    }
    const n = sets.length, avgR = total / n;
    const sd = Math.sqrt(sets.reduce((a, s) => a + (s.r - avgR) ** 2, 0) / n);
    // carga principal = la más usada (empate: la más alta)
    let mainW = 0, mc = -1;
    for (const w of Object.keys(wCount)) {
      const c = wCount[w];
      if (c > mc || (c === mc && +w > mainW)) { mc = c; mainW = +w; }
    }
    return {
      n, total, vol, volPerSet: vol / n, maxR, avgR, topW, bestE, bestSet, bestProd,
      avgRir: rirN ? rirSum / rirN : null,
      firstLast: sets[0].r - sets[n - 1].r,
      cv: avgR ? sd / avgR : 0,
      mainW, byW,
    };
  }

  /** Historial cronológico de un ejercicio: [{session, date, sets, m (todas), c (sin dudosas)}] */
  /** opts.noE1rm: ejercicios de peso corporal (la carga registrada no es la carga total) */
  function history(sessions, exId, opts = {}) {
    const out = [];
    const sorted = sessions.slice().sort((a, b) => a.start - b.start);
    for (const s of sorted) {
      const entries = s.exercises.filter(e => e.exerciseId === exId);
      if (!entries.length) continue;
      const sets = validSets(entries.flatMap(e => e.sets));
      if (!sets.length) continue;
      out.push({ session: s, date: s.start, sets, m: metrics(sets, opts), c: metrics(sets.filter(x => !x.doubtful), opts) });
    }
    return out;
  }

  /** PRs de cada sesión (alineado con history). Las series dudosas no cuentan.
      La primera sesión es la línea base: no genera PRs. */
  function prs(hist) {
    const best = { w: 0, r: 0, t: 0, v: 0, e: 0, atW: {} };
    let seen = false;
    return hist.map(h => {
      const c = h.c, list = [];
      if (!c) return list;
      if (seen) {
        if (c.topW > 0 && c.topW > best.w)
          list.push({ k: 'peso', label: 'PR de peso', val: Fmt.kg(c.topW), prev: best.w ? Fmt.kg(best.w) : null });
        if (c.bestE && c.bestE > best.e + 0.05)
          list.push({ k: 'e1rm', label: 'PR de e1RM', val: Fmt.kg(c.bestE, 1), prev: best.e ? Fmt.kg(best.e, 1) : null });
        if (c.maxR > best.r)
          list.push({ k: 'reps', label: 'PR de reps en una serie', val: c.maxR + ' reps', prev: best.r + ' reps' });
        if (c.total > best.t)
          list.push({ k: 'total', label: 'PR de reps totales', val: c.total + ' reps', prev: best.t + ' reps' });
        if (c.vol > 0 && c.vol > best.v)
          list.push({ k: 'vol', label: 'PR de volumen', val: Fmt.kg(c.vol, 0), prev: best.v ? Fmt.kg(best.v, 0) : null });
        for (const w of Object.keys(c.byW)) {
          if (+w > 0 && best.atW[w] != null && c.byW[w] > best.atW[w])
            list.push({ k: 'atw', label: 'Mejor marca con ' + Fmt.kg(+w), val: c.byW[w] + ' reps', prev: best.atW[w] + ' reps' });
        }
      }
      seen = true;
      best.w = Math.max(best.w, c.topW);
      best.r = Math.max(best.r, c.maxR);
      best.t = Math.max(best.t, c.total);
      best.v = Math.max(best.v, c.vol);
      if (c.bestE) best.e = Math.max(best.e, c.bestE);
      for (const w of Object.keys(c.byW)) best.atW[w] = Math.max(best.atW[w] || 0, c.byW[w]);
      return list;
    });
  }

  /** "25 kg — 9 / 8 / 8" o "25×9 · 22,5×10" */
  function setsStr(sets, sep = ' / ') {
    if (!sets.length) return '—';
    const same = sets.every(s => s.w === sets[0].w);
    if (same) {
      const reps = sets.map(s => s.r).join(sep);
      return sets[0].w > 0 ? `${Fmt.n(sets[0].w, 2)} kg — ${reps}` : `${reps} reps`;
    }
    return sets.map(s => `${Fmt.n(s.w, 2)}×${s.r}`).join(' · ');
  }

  const reps = d => Math.abs(d) === 1 ? 'rep' : 'reps';
  const tone = d => d > 0 ? 'up' : d < 0 ? 'down' : 'eq';

  /** Comparación multidimensional entre dos sesiones de un ejercicio */
  function compare(prev, cur) {
    const P = prev.m, C = cur.m, out = [];
    const dW = round(C.mainW - P.mainW, 2);
    const dT = C.total - P.total;

    if (dW !== 0) {
      // cambió la carga: no se reduce a "−6 reps"
      out.push({ label: 'Carga', text: `${Fmt.signed(dW, 2, ' kg')}  (${Fmt.n(P.mainW, 2)} → ${Fmt.n(C.mainW, 2)} kg)`, tone: tone(dW) });
      const dR = round(C.avgR - P.avgR, 1);
      out.push({
        label: 'Reps por serie',
        text: dR === 0 ? `iguales (prom. ${Fmt.n(C.avgR)})` : `${Fmt.signed(dR, 1)} por serie  (prom. ${Fmt.n(P.avgR)} → ${Fmt.n(C.avgR)})`,
        tone: tone(dR),
      });
      if (dW > 0 && dR <= 0) out.push({ label: 'Lectura', text: 'Nueva fase de carga: más peso, menos reps', tone: 'info' });
      else if (dW < 0 && dR > 0) out.push({ label: 'Lectura', text: 'Menos peso, más reps', tone: 'info' });
      // rendimiento con un peso que se usó en ambas sesiones
      for (const w of Object.keys(C.byW)) {
        if (+w > 0 && P.byW[w] != null) {
          const d = C.byW[w] - P.byW[w];
          out.push({
            label: 'Con ' + Fmt.kg(+w),
            text: d === 0 ? `mismas reps en la mejor serie (${C.byW[w]})` : `${Fmt.signed(d, 0)} ${reps(d)} en la mejor serie (${P.byW[w]} → ${C.byW[w]})`,
            tone: tone(d),
          });
        }
      }
    } else {
      out.push({ label: 'Reps totales', text: dT === 0 ? `iguales (${C.total})` : `${Fmt.signed(dT, 0)}  (${P.total} → ${C.total})`, tone: tone(dT) });
      const dMax = C.maxR - P.maxR;
      if (dMax !== 0) out.push({ label: 'Mejor serie', text: `${Fmt.signed(dMax, 0)} ${reps(dMax)}  (${P.maxR} → ${C.maxR})`, tone: tone(dMax) });
    }

    if (C.vol > 0 || P.vol > 0) {
      const dV = C.vol - P.vol;
      out.push({ label: 'Volumen', text: dV === 0 ? `igual (${Fmt.kg(C.vol, 0)})` : `${Fmt.signed(dV, 0, ' kg')}${P.vol ? '  (' + Fmt.pct(dV / P.vol) + ')' : ''}`, tone: tone(dV) });
    }
    if (C.bestE && P.bestE) {
      const dE = round(C.bestE - P.bestE, 1);
      out.push({ label: 'e1RM', text: dE === 0 ? `igual (${Fmt.kg(C.bestE, 1)})` : `${Fmt.signed(dE, 1, ' kg')}  (${Fmt.n(P.bestE, 1)} → ${Fmt.n(C.bestE, 1)})`, tone: tone(dE) });
    }
    if (C.avgRir != null && P.avgRir != null) {
      const dRir = C.avgRir - P.avgRir;
      if (Math.abs(dRir) < 0.25 && dW === 0 && dT !== 0)
        out.push({ label: 'A igual RIR', text: `${Fmt.signed(dT, 0)} ${reps(dT)} totales con RIR ~${Fmt.n(C.avgRir)}`, tone: tone(dT) });
      else
        out.push({ label: 'RIR medio', text: `${Fmt.n(P.avgRir)} → ${Fmt.n(C.avgRir)}`, tone: 'eq' });
    }
    if (C.n !== P.n) out.push({ label: 'Nº de series', text: `${P.n} → ${C.n}`, tone: 'eq' });
    return out;
  }

  /** pendiente por regresión lineal (unidades por sesión) */
  function slope(ys) {
    const n = ys.length;
    if (n < 2) return 0;
    const mx = (n - 1) / 2, my = mean(ys);
    let a = 0, b = 0;
    ys.forEach((y, i) => { a += (i - mx) * (y - my); b += (i - mx) ** 2; });
    return a / b;
  }

  /** Tendencia de una métrica: actual, mejor, promedio reciente y dirección de las últimas n sesiones */
  function trend(hist, get, n = 6) {
    const vals = hist.map(get).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    const last = vals.slice(-n);
    const sl = slope(last);
    const base = Math.abs(mean(last)) || 1;
    const rel = sl / base;
    return {
      cur: vals[vals.length - 1],
      best: Math.max(...vals),
      avg: mean(vals.slice(-5)),
      slope: sl,
      rel,
      n: last.length,
      dir: last.length < 3 ? 'insuf' : rel > 0.01 ? 'up' : rel < -0.01 ? 'down' : 'flat',
    };
  }

  return { e1rm, validSets, metrics, history, prs, compare, trend, setsStr, cmpSet };
})();
