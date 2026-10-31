'use strict';
/* Exportar el progreso a Excel (.xlsx).
   Usa ExcelJS (js/vendor/exceljs.min.js, MIT), que se carga recién al exportar
   para no hacer más pesada la app. Funciona sin conexión: el service worker lo
   tiene guardado. */

const Export = (() => {
  let cargando = null;

  function cargar() {
    if (window.ExcelJS) return Promise.resolve();
    if (!cargando) {
      cargando = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/exceljs.min.js';
        s.onload = ok;
        s.onerror = () => { cargando = null; mal(new Error('No se pudo cargar el generador de Excel')); };
        document.head.appendChild(s);
      });
    }
    return cargando;
  }

  // 1RM estimado (Epley), tal cual: peso × (1 + reps / 30)
  const epley = (w, r) => w * (1 + r / 30);
  const diaDe = ms => { const d = new Date(ms); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
  const kg = v => Number.isInteger(v) ? String(v) : String(v).replace('.', ',');

  /** Las filas de las hojas, a partir de los datos de la app. desde/hasta: 'AAAA-MM-DD' inclusive. */
  function armar(D, desde, hasta) {
    const d1 = new Date(desde + 'T00:00:00').getTime();
    const d2 = new Date(hasta + 'T23:59:59').getTime();
    const exById = id => D.exercises.find(e => e.id === id);
    const nombre = e => (exById(e.exerciseId) || {}).name || e.name || 'Ejercicio';
    const conLastre = id => { const x = exById(id); return !!x && (x.type === 'lastre' || x.type === 'corporal'); };
    const todas = D.sessions.slice().sort((a, b) => a.start - b.start);

    const series = [], resumen = [];
    const ultimo1RM = {};                      // por ejercicio, a lo largo de TODO el historial
    const lastres = new Set();

    for (const s of todas) {
      const enRango = s.start >= d1 && s.start <= d2;
      const fecha = diaDe(s.start);
      const vistos = new Set();
      for (const e of s.exercises) {
        const hechas = (e.sets || []).filter(x => x.done !== false && Number(x.reps) > 0);
        if (!hechas.length) continue;
        const ex = nombre(e);
        if (conLastre(e.exerciseId)) lastres.add(ex);

        // ---- hoja Series: todas las series, con el calentamiento marcado
        if (enRango) {
          let n = 0;
          hechas.forEach((x, i) => {
            const notas = [];
            if (x.doubtful) notas.push('Serie dudosa');
            if (x.note) notas.push(x.note);
            if (i === 0 && e.note) notas.push('Nota del ejercicio: ' + e.note);
            series.push({
              fecha, dia: s.routineName || '', ejercicio: ex,
              n: x.warmup ? 'C' : ++n, peso: Number(x.weight) || 0, reps: Number(x.reps),
              tipo: x.warmup ? 'Calentamiento' : 'Principal', notas: notas.join(' · '),
            });
          });
        }

        // ---- hoja Resumen: una fila por ejercicio y sesión (sin calentamientos)
        if (vistos.has(e.exerciseId)) continue;      // mismo ejercicio dos veces en la sesión: se junta
        vistos.add(e.exerciseId);
        const trabajo = s.exercises.filter(o => o.exerciseId === e.exerciseId)
          .flatMap(o => (o.sets || []).filter(x => x.done !== false && Number(x.reps) > 0 && !x.warmup))
          .map(x => ({ w: Number(x.weight) || 0, r: Number(x.reps) }));
        if (!trabajo.length) continue;
        let mejor = trabajo[0];
        for (const x of trabajo) {
          const a = epley(x.w, x.r), b = epley(mejor.w, mejor.r);
          if (a > b || (a === b && (x.w > mejor.w || (x.w === mejor.w && x.r > mejor.r)))) mejor = x;
        }
        const rm = mejor.w > 0 ? epley(mejor.w, mejor.r) : null;   // sin carga no hay 1RM
        const previo = ultimo1RM[e.exerciseId];
        if (enRango) {
          resumen.push({
            fecha, ejercicio: ex,
            mejor: (mejor.w > 0 ? kg(mejor.w) : 'PC') + ' × ' + mejor.r,
            reps: trabajo.reduce((t, x) => t + x.r, 0),
            volumen: trabajo.reduce((t, x) => t + x.w * x.r, 0),
            rm, dif: rm != null && previo ? rm / previo - 1 : null,
          });
        }
        if (rm != null) ultimo1RM[e.exerciseId] = rm;
      }
    }
    return { series, resumen, lastres: [...lastres] };
  }

  function hoja(wb, titulo, columnas, filas) {
    const ws = wb.addWorksheet(titulo, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columnas.map(c => ({ header: c.t, key: c.k, style: c.fmt ? { numFmt: c.fmt } : {} }));
    filas.forEach(f => ws.addRow(f));
    ws.getRow(1).font = { bold: true };
    // ancho "automático": el dato más largo de cada columna. Un encabezado largo
    // no ensancha la columna de más: se parte en renglones.
    let renglones = 1;
    columnas.forEach((c, i) => {
      let ancho = 0;
      for (const f of filas) {
        const v = f[c.k];
        const txt = v == null ? '' : v instanceof Date ? '00/00/0000'
          : typeof v === 'number' ? (c.fmt === '0.0%' ? '-00,0%' : String(Math.round(v * 10) / 10)) : String(v);
        ancho = Math.max(ancho, txt.length);
      }
      ancho = Math.min(Math.max(ancho, Math.min(c.t.length, 22), 6) + 2, 60);
      ws.getColumn(i + 1).width = ancho;
      renglones = Math.max(renglones, Math.ceil(c.t.length / (ancho - 1)));
    });
    ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(1).height = 15 * renglones + 3;
    return ws;
  }

  /** Genera el archivo y lo descarga. Devuelve {series, resumen} con la cantidad de filas. */
  async function descargar(D, desde, hasta) {
    await cargar();
    const datos = armar(D, desde, hasta);
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'Hierro';
    wb.created = new Date();
    const fecha = 'dd/mm/yyyy';
    hoja(wb, 'Series', [
      { t: 'Fecha', k: 'fecha', fmt: fecha }, { t: 'Día', k: 'dia' }, { t: 'Ejercicio', k: 'ejercicio' },
      { t: 'N° de serie', k: 'n' }, { t: 'Peso / lastre (kg)', k: 'peso' },
      { t: 'Reps', k: 'reps', fmt: '0' }, { t: 'Tipo de serie', k: 'tipo' }, { t: 'Notas', k: 'notas' },
    ], datos.series);
    const nota = datos.lastres.length ? ' — en ' + datos.lastres.join(', ') + ' es el lastre' : '';
    hoja(wb, 'Resumen por ejercicio', [
      { t: 'Fecha', k: 'fecha', fmt: fecha }, { t: 'Ejercicio', k: 'ejercicio' },
      { t: 'Mejor serie (kg × reps' + nota + ')', k: 'mejor' },
      { t: 'Reps totales', k: 'reps', fmt: '0' }, { t: 'Volumen total (kg)', k: 'volumen' },
      { t: '1RM estimado (kg, Epley)', k: 'rm', fmt: '0.0' },
      { t: 'Dif. 1RM vs sesión anterior (%)', k: 'dif', fmt: '0.0%' },
    ], datos.resumen);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const hoy = new Date();
    const pad = n => String(n).padStart(2, '0');
    const nombre = 'progreso_%s-%s-%s.xlsx'.replace('%s', hoy.getFullYear()).replace('%s', pad(hoy.getMonth() + 1))
      .replace('%s', pad(hoy.getDate()));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { series: datos.series.length, resumen: datos.resumen.length, nombre };
  }

  return { armar, descargar, cargar };
})();
