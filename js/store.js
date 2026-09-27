'use strict';
/* Persistencia local (sin conexión). Todo vive en localStorage bajo una sola clave. */

const Store = (() => {
  const KEY = 'hierro:data:v1';

  const blank = () => ({
    version: 1,
    exercises: [],   // {id, name, category, type, rest, notes, createdAt}
    routines: [],    // {id, name, items:[{id, exerciseId, sets, repMin, repMax, weight, rest, notes}], createdAt}
    sessions: [],    // {id, routineId, routineName, start, end, exercises:[{exerciseId, name, target, note, sets:[{weight, reps, rir, note, doubtful, done, at}]}]}
    active: null,    // entrenamiento en curso (misma forma que una sesión + timer)
    settings: { defaultRest: 120, theme: 'auto', sound: true, vibrate: true, importedPacks: [], useRir: false },
  });

  let data = blank();
  let pending = null;

  function normalize(d) {
    const b = blank();
    d = Object.assign(b, d || {});
    d.settings = Object.assign(blank().settings, d.settings || {});
    for (const k of ['exercises', 'routines', 'sessions']) if (!Array.isArray(d[k])) d[k] = [];
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = normalize(JSON.parse(raw));
    } catch (e) { console.error('No se pudieron leer los datos', e); }
    return data;
  }

  function save() {
    clearTimeout(pending); pending = null;
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  /** guardado diferido para lo que se escribe tecla a tecla */
  function saveSoon() { clearTimeout(pending); pending = setTimeout(save, 400); }

  const flush = () => { if (pending) save(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  function exportJSON() { flush(); return JSON.stringify(data); }

  function importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.sessions) || !Array.isArray(d.exercises) || !Array.isArray(d.routines))
      throw new Error('El archivo no es una copia válida');
    data = normalize(d);
    save();
    return data;
  }

  /** Suma datos sin borrar nada. Ejercicios/rutinas con el mismo nombre se reutilizan;
      sesiones ya importadas (mismo id) se saltean. */
  function merge(d) {
    if (typeof d === 'string') d = JSON.parse(d);
    if (!d || !Array.isArray(d.sessions)) throw new Error('El archivo no es una copia válida');
    const key = s => String(s || '').trim().toLowerCase();
    const exMap = {}, rtMap = {}, r = { ex: 0, rt: 0, ses: 0 };
    for (const e of d.exercises || []) {
      const hit = data.exercises.find(x => x.id === e.id) || data.exercises.find(x => key(x.name) === key(e.name));
      if (hit) exMap[e.id] = hit.id; else { data.exercises.push(e); exMap[e.id] = e.id; r.ex++; }
    }
    const mapEx = id => exMap[id] || id;
    for (const rt of d.routines || []) {
      const hit = data.routines.find(x => x.id === rt.id) || data.routines.find(x => key(x.name) === key(rt.name));
      if (hit) { rtMap[rt.id] = hit.id; continue; }
      rt.items.forEach(it => { it.exerciseId = mapEx(it.exerciseId); });
      data.routines.push(rt); rtMap[rt.id] = rt.id; r.rt++;
    }
    for (const s of d.sessions) {
      if (data.sessions.some(x => x.id === s.id)) continue;
      s.routineId = rtMap[s.routineId] || s.routineId;
      s.exercises.forEach(e => { e.exerciseId = mapEx(e.exerciseId); });
      data.sessions.push(s); r.ses++;
    }
    save();
    return r;
  }

  function reset() { data = blank(); save(); return data; }

  // pedirle al navegador que no borre los datos por falta de espacio
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  return { load, save, saveSoon, exportJSON, importJSON, merge, reset, get data() { return data; } };
})();
