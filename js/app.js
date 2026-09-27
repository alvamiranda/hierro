'use strict';
/* Hierro — registro y análisis de entrenamiento de fuerza.
   Vistas renderizadas como strings + delegación de eventos (data-a = acción). */

let D = Store.load();
const $app = document.getElementById('app');

const ui = {
  view: 'home', params: {}, stack: [], root: 'home',
  sheet: null,
  draft: null, draftOrig: '',
  chart: { metric: 'e1rm', range: '10s' },
  chartPts: [],
  exQuery: '', exCat: '',
  lastRest: null,
};

const CATS = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Bíceps', 'Tríceps', 'Core', 'Otro'];
const TYPES = [['libre', 'Peso libre'], ['maquina', 'Máquina'], ['corporal', 'Peso corporal'], ['lastre', 'Peso corporal + lastre'], ['otro', 'Otro']];
const typeLabel = k => (TYPES.find(t => t[0] === k) || [])[1] || '';

const METRICS = [
  { k: 'peso', label: 'Peso', get: h => h.m.topW || null, fmt: v => Fmt.kg(v) },
  { k: 'reps', label: 'Reps', get: h => h.m.maxR, fmt: v => Fmt.n(v, 0) + ' reps' },
  { k: 'total', label: 'Reps totales', get: h => h.m.total, fmt: v => Fmt.n(v, 0) + ' reps' },
  { k: 'vol', label: 'Volumen', get: h => h.m.vol || null, fmt: v => Fmt.kg(v, 0) },
  { k: 'e1rm', label: 'e1RM', get: h => h.m.bestE, fmt: v => Fmt.kg(v, 1) },
  { k: 'rir', label: 'RIR', get: h => h.m.avgRir, fmt: v => 'RIR ' + Fmt.n(v) },
  { k: 'prod', label: 'Peso × reps', get: h => h.m.bestProd || null, fmt: v => Fmt.n(v, 1) },
  { k: 'freq', label: 'Frecuencia', bars: true },
];
const RANGES = [['5s', '5 ses.'], ['10s', '10 ses.'], ['30d', '30 días'], ['3m', '3 meses'], ['6m', '6 meses'], ['1y', '1 año'], ['all', 'Todo']];

/* ============================== datos ============================== */

const exById = id => D.exercises.find(e => e.id === id);
const routineById = id => D.routines.find(r => r.id === id);
const exName = e => (exById(e.exerciseId) || {}).name || e.name || 'Ejercicio';
const noE1rm = id => { const e = exById(id); return !!e && (e.type === 'corporal' || e.type === 'lastre'); };
const histOf = id => Stats.history(D.sessions, id, { noE1rm: noE1rm(id) });
const lastEntry = id => { const h = histOf(id); return h[h.length - 1] || null; };
const clone = o => JSON.parse(JSON.stringify(o));

function routineStats(r) {
  return { ex: r.items.length, sets: r.items.reduce((a, i) => a + (+i.sets || 0), 0) };
}

function lastDoneRoutine(rid) {
  let t = 0;
  for (const s of D.sessions) if (s.routineId === rid && s.start > t) t = s.start;
  return t || null;
}

function sessionTotals(s) {
  let sets = 0, reps = 0, vol = 0, ex = 0;
  for (const e of s.exercises) {
    const v = Stats.validSets(e.sets);
    if (v.length) ex++;
    for (const x of v) { sets++; reps += x.r; vol += x.w * x.r; }
  }
  return { sets, reps, vol, ex, dur: Math.round(((s.end || s.start) - s.start) / 1000) };
}

/** sessionId → cantidad de PRs */
function prCounts() {
  const map = {}, ids = new Set();
  D.sessions.forEach(s => s.exercises.forEach(e => ids.add(e.exerciseId)));
  ids.forEach(id => {
    const h = histOf(id), p = Stats.prs(h);
    h.forEach((x, i) => { if (p[i].length) map[x.session.id] = (map[x.session.id] || 0) + p[i].length; });
  });
  return map;
}

/** por ejercicio de una sesión: entrada, anterior, PRs y comparación */
function sessionReport(s) {
  const out = [], seen = new Set();
  for (const e of s.exercises) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    const h = histOf(e.exerciseId);
    const i = h.findIndex(x => x.session.id === s.id);
    if (i < 0) continue;
    out.push({
      exId: e.exerciseId, name: exName(e), entry: h[i], prev: i > 0 ? h[i - 1] : null,
      prs: Stats.prs(h)[i], cmp: i > 0 ? Stats.compare(h[i - 1], h[i]) : null,
    });
  }
  return out;
}

function itemSummary(it) {
  const p = [`${it.sets} ${it.sets == 1 ? 'serie' : 'series'}`];
  if (it.repMin || it.repMax) p.push(it.repMin && it.repMax && it.repMin != it.repMax ? `${it.repMin}–${it.repMax} reps` : `${it.repMin || it.repMax} reps`);
  if (it.weight) p.push(Fmt.kg(it.weight));
  p.push('desc. ' + Fmt.clock(it.rest ?? D.settings.defaultRest));
  return p.join(' · ');
}

/* ============================ navegación ============================ */

function go(view, params = {}) {
  ui.stack.push({ view: ui.view, params: ui.params });
  history.pushState({ d: ui.stack.length }, '');
  ui.view = view; ui.params = params; ui.sheet = null;
  render(); window.scrollTo(0, 0);
}

function tab(view) {
  ui.stack = []; ui.root = view;
  ui.view = view; ui.params = {}; ui.sheet = null;
  render(); window.scrollTo(0, 0);
}

function popView() {
  const p = ui.stack.pop();
  if (p) { ui.view = p.view; ui.params = p.params; }
  else { ui.view = ui.root; ui.params = {}; }
  ui.sheet = null;
  render();
}

function back() { if (ui.stack.length) history.back(); else popView(); }

window.addEventListener('popstate', () => {
  if (ui.sheet) { ui.sheet = null; history.pushState({}, ''); render(); return; }
  if (ui.view === 'routineEdit' && isDraftDirty()) {
    history.pushState({}, '');
    confirmBox({ title: '¿Descartar cambios?', text: 'Los cambios de la rutina no se guardaron.', ok: 'Descartar', danger: true, onOk: () => { ui.draft = null; popView(); } });
    return;
  }
  if (ui.stack.length) popView();
});

function openSheet(s) { ui.sheet = s; render(); }
function closeSheet(rerender = true) { ui.sheet = null; if (rerender) render(); }
function confirmBox(o) { openSheet(Object.assign({ type: 'confirm' }, o)); }

let toastT;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'show';
  clearTimeout(toastT); toastT = setTimeout(() => { el.className = ''; }, 2200);
}

/* ============================== render ============================== */

function render() {
  const v = VIEWS[ui.view] || VIEWS.home;
  const noTabs = ['workout', 'routineEdit', 'summary'].includes(ui.view);
  $app.innerHTML =
    `<main class="view v-${ui.view}${noTabs ? '' : ' with-tabs'}">${v()}</main>` +
    `<div id="timer-slot">${timerHtml()}</div>` +
    (noTabs ? '' : tabbar()) +
    sheetHtml();
  document.body.classList.toggle('has-timer', !!(D.active && D.active.timer));
  document.body.classList.toggle('no-tabs', noTabs);
  document.body.classList.toggle('sheet-open', !!ui.sheet);
  document.querySelectorAll('.chips.scroll .chip.on').forEach(c => {
    const p = c.parentElement;
    if (c.offsetLeft + c.offsetWidth > p.scrollLeft + p.clientWidth) p.scrollLeft = c.offsetLeft - 16;
  });
  tick();
}

function tabbar() {
  const t = (v, icon, label) => `<button class="tab${ui.root === v ? ' on' : ''}" data-a="tab" data-v="${v}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabbar">${t('home', I.lift, 'Entrenar')}${t('history', I.hist, 'Historial')}${t('exercises', I.list, 'Ejercicios')}${t('settings', I.gear, 'Ajustes')}</nav>`;
}

function topbar(title, right = '', sub = '') {
  return `<header class="topbar"><button class="icon" data-a="back" aria-label="Volver">${I.back}</button>
    <div class="tb-title"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><div class="tb-right">${right}</div></header>`;
}

const VIEWS = {};
const SHEETS = {};

/* ------------------------------- INICIO ------------------------------ */

VIEWS.home = () => {
  let h = `<header class="hero"><div class="eyebrow">${esc(Fmt.dLong(Date.now()))}</div><h1>Mis rutinas</h1></header>`;
  const a = D.active;
  if (a) {
    const done = a.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
    const tot = a.exercises.reduce((n, e) => n + e.sets.length, 0);
    h += `<button class="resume" data-a="resume"><span class="pulse"></span>
      <span class="resume-t"><b>Entrenamiento en curso</b><small>${esc(a.routineName)} · <span data-tick="elapsed"></span> · ${done}/${tot} series</small></span>${I.right}</button>`;
  }
  if (!D.routines.length) {
    h += `<div class="empty"><div class="empty-ic">${I.lift}</div><p><b>Todavía no tenés rutinas.</b></p>
      <p>Creá una rutina, agregale tus ejercicios y empezá a registrar.</p></div>`;
  }
  h += '<div class="cards">';
  for (const r of D.routines) {
    const st = routineStats(r);
    const last = lastDoneRoutine(r.id);
    const names = r.items.map(it => (exById(it.exerciseId) || {}).name).filter(Boolean);
    h += `<article class="rcard">
      <div class="rcard-h"><h2>${esc(r.name)}</h2><button class="icon ghost" data-a="routineMenu" data-id="${r.id}" aria-label="Opciones">${I.dots}</button></div>
      <p class="rcard-meta">${st.ex} ${st.ex === 1 ? 'ejercicio' : 'ejercicios'} · ${st.sets} series</p>
      ${names.length ? `<p class="rcard-ex">${esc(names.join(' · '))}</p>` : ''}
      <div class="rcard-f"><span class="muted sm">${last ? 'Última vez: ' + Fmt.ago(last) : 'Sin registrar'}</span>
      <button class="btn btn-primary" data-a="start" data-id="${r.id}">Iniciar</button></div>
    </article>`;
  }
  h += '</div>';
  h += `<button class="btn-dashed" data-a="newRoutine">${I.plus}<span>Nueva rutina</span></button>`;
  return h;
};

SHEETS.routineMenu = s => {
  const r = routineById(s.id);
  return sheetHead(r.name) + `<div class="menu">
    <button class="menu-i" data-a="editRoutine" data-id="${r.id}">${I.edit}<span>Editar rutina</span></button>
    <button class="menu-i" data-a="dupRoutine" data-id="${r.id}">${I.copy}<span>Duplicar rutina</span></button>
    <button class="menu-i danger" data-a="delRoutine" data-id="${r.id}">${I.trash}<span>Eliminar rutina</span></button></div>`;
};

/* --------------------------- EDITAR RUTINA --------------------------- */

const isDraftDirty = () => ui.draft && JSON.stringify(ui.draft) !== ui.draftOrig;

function openRoutineEditor(r) {
  ui.draft = r ? clone(r) : { id: null, name: '', items: [] };
  ui.draftOrig = JSON.stringify(ui.draft);
  go('routineEdit');
}

VIEWS.routineEdit = () => {
  const d = ui.draft;
  if (!d) return '';
  let h = topbar(d.id ? 'Editar rutina' : 'Nueva rutina');
  h += `<label class="field"><span>Nombre de la rutina</span>
    <input id="rname" data-bind="draft.name" value="${esc(d.name)}" placeholder="Ej: Push, Pierna A, Torso…" autocomplete="off" maxlength="40"></label>`;
  h += `<div class="sec-h"><h3>Ejercicios</h3><span class="muted sm">${d.items.length ? routineStats(d).sets + ' series' : ''}</span></div>`;
  if (!d.items.length) h += `<p class="hint">Agregá los ejercicios en el orden en que los vas a hacer.</p>`;
  h += '<div class="items">';
  d.items.forEach((it, i) => {
    const ex = exById(it.exerciseId) || { name: '(ejercicio eliminado)' };
    h += `<div class="item">
      <div class="item-n">${i + 1}</div>
      <button class="item-main" data-a="editItem" data-i="${i}"><b>${esc(ex.name)}</b><small>${esc(itemSummary(it))}</small>${it.notes ? `<small class="item-note">${esc(it.notes)}</small>` : ''}</button>
      <div class="item-act">
        <button class="icon sm" data-a="moveItem" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${I.up}</button>
        <button class="icon sm" data-a="moveItem" data-i="${i}" data-d="1" ${i === d.items.length - 1 ? 'disabled' : ''} aria-label="Bajar">${I.dn}</button>
        <button class="icon sm" data-a="itemMenu" data-i="${i}" aria-label="Opciones">${I.dots}</button>
      </div></div>`;
  });
  h += '</div>';
  h += `<button class="btn-dashed" data-a="addItem">${I.plus}<span>Agregar ejercicio</span></button>`;
  h += `<div class="sticky-foot"><button class="btn btn-primary btn-block" data-a="saveRoutine">${d.id ? 'Guardar cambios' : 'Crear rutina'}</button></div>`;
  return h;
};

SHEETS.itemMenu = s => {
  const it = ui.draft.items[s.i];
  const ex = exById(it.exerciseId) || { name: 'Ejercicio' };
  return sheetHead(ex.name) + `<div class="menu">
    <button class="menu-i" data-a="editItem" data-i="${s.i}">${I.edit}<span>Editar configuración</span></button>
    <button class="menu-i" data-a="dupItem" data-i="${s.i}">${I.copy}<span>Duplicar ejercicio</span></button>
    <button class="menu-i danger" data-a="delItem" data-i="${s.i}">${I.trash}<span>Quitar de la rutina</span></button></div>`;
};

function openItemSheet(idx, ex) {
  const it = idx != null ? ui.draft.items[idx] : null;
  openSheet({
    type: 'item', idx,
    form: it ? clone(it) : { id: uid(), exerciseId: ex.id, sets: 3, repMin: 8, repMax: 12, weight: null, rest: ex.rest ?? D.settings.defaultRest, notes: '' },
  });
}

SHEETS.item = s => {
  const f = s.form, ex = exById(f.exerciseId) || { name: 'Ejercicio' };
  return sheetHead(ex.name, [ex.category, typeLabel(ex.type)].filter(Boolean).join(' · ')) + `
    <div class="form">
      <div class="row2"><span class="lbl">Series</span>${stepper('form', 'sets', f.sets)}</div>
      <div class="row2"><span class="lbl">Reps objetivo</span>
        <div class="range"><input class="inp" inputmode="numeric" data-bind="form.repMin" value="${inp(f.repMin)}" placeholder="mín">
        <span>–</span><input class="inp" inputmode="numeric" data-bind="form.repMax" value="${inp(f.repMax)}" placeholder="máx"></div></div>
      <div class="row2"><span class="lbl">Peso inicial <small>(opcional)</small></span>
        <div class="unit"><input class="inp" inputmode="decimal" data-bind="form.weight" value="${inp(f.weight)}" placeholder="—"><span>kg</span></div></div>
      <div class="row2"><span class="lbl">Descanso</span>${stepper('form', 'rest', f.rest)}</div>
      <label class="field"><span>Notas</span><textarea data-bind="form.notes" rows="2" placeholder="Agarre, tempo, altura del banco…">${esc(f.notes)}</textarea></label>
      <button class="btn btn-primary btn-block" data-a="saveItem">${s.idx != null ? 'Guardar' : 'Agregar a la rutina'}</button>
    </div>`;
};

/* ----------------------- SELECTOR DE EJERCICIOS ----------------------- */

function pickList(q) {
  q = (q || '').trim().toLowerCase();
  const list = D.exercises.filter(e => !q || e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  let h = '';
  for (const e of list) {
    const meta = [e.category, typeLabel(e.type)].filter(Boolean).join(' · ');
    h += `<button class="pick-i" data-a="pickEx" data-id="${e.id}"><b>${esc(e.name)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</button>`;
  }
  if (!list.length && !q) h += `<p class="hint">Todavía no creaste ejercicios.</p>`;
  const exact = D.exercises.some(e => e.name.toLowerCase() === q);
  h += `<button class="pick-new" data-a="pickCreate">${I.plus}<span>${q && !exact ? `Crear «${esc(q)}»` : 'Crear ejercicio'}</span></button>`;
  return h;
}

SHEETS.pick = s => sheetHead('Agregar ejercicio') + `
  <div class="search">${I.search}<input id="pickq" value="${esc(s.q || '')}" placeholder="Buscar o escribir un nombre nuevo" autocomplete="off"></div>
  <div id="picklist" class="pick-list">${pickList(s.q)}</div>`;

/* ------------------------- FORM DE EJERCICIO ------------------------- */

function openExForm(ex, onSave) {
  openSheet({
    type: 'exForm', id: ex ? ex.id : null, onSave,
    form: ex ? clone(ex) : { name: '', category: '', type: '', rest: D.settings.defaultRest, notes: '' },
  });
}

SHEETS.exForm = s => {
  const f = s.form;
  const chips = (k, opts) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip${f[k] === v ? ' on' : ''}" data-a="chip" data-k="${k}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  return sheetHead(s.id ? 'Editar ejercicio' : 'Crear ejercicio') + `
    <div class="form">
      <label class="field"><span>Nombre</span><input id="exname" data-bind="form.name" value="${esc(f.name)}" placeholder="Ej: Press banca" autocomplete="off" maxlength="50"></label>
      <div class="field"><span>Categoría <small>(opcional)</small></span>${chips('category', CATS.map(c => [c, c]))}</div>
      <div class="field"><span>Tipo <small>(opcional)</small></span>${chips('type', TYPES)}</div>
      <div class="row2"><span class="lbl">Descanso predeterminado</span>${stepper('form', 'rest', f.rest)}</div>
      <label class="field"><span>Notas</span><textarea data-bind="form.notes" rows="2">${esc(f.notes)}</textarea></label>
      <button class="btn btn-primary btn-block" data-a="saveEx">${s.id ? 'Guardar' : 'Crear ejercicio'}</button>
      ${s.id ? `<button class="btn btn-text danger btn-block" data-a="delEx">Eliminar ejercicio</button>` : ''}
    </div>`;
};

/* ---------------------------- ENTRENAMIENTO ---------------------------- */

function buildActiveEx(exId, target) {
  const ex = exById(exId);
  const last = lastEntry(exId);
  const n = Math.max(1, +target.sets || (last ? last.sets.length : 3));
  const sets = [];
  for (let i = 0; i < n; i++) {
    const ls = last && (last.sets[i] || last.sets[last.sets.length - 1]);
    const w = ls ? ls.w : target.weight;
    sets.push({ weight: w > 0 ? inp(w) : '', reps: '', rir: '', note: '', doubtful: false, done: false });
  }
  return { key: uid(), exerciseId: exId, name: ex ? ex.name : '', target: clone(target), note: '', sets };
}

function startWorkout(rid) {
  const r = routineById(rid);
  if (!r) return;
  if (D.active) {
    confirmBox({
      title: 'Ya hay un entrenamiento en curso', text: D.active.routineName,
      ok: 'Continuarlo', onOk: () => go('workout'),
      alt: 'Descartarlo y empezar ' + r.name, altDanger: true, onAlt: () => { D.active = null; startWorkout(rid); },
    });
    return;
  }
  D.active = {
    id: uid(), routineId: r.id, routineName: r.name, start: Date.now(), timer: null,
    exercises: r.items.filter(it => exById(it.exerciseId)).map(it => buildActiveEx(it.exerciseId, {
      sets: it.sets, repMin: it.repMin, repMax: it.repMax, weight: it.weight, rest: it.rest ?? D.settings.defaultRest, notes: it.notes || '', itemId: it.id,
    })),
  };
  Store.save();
  go('workout');
}

VIEWS.workout = () => {
  const a = D.active;
  if (!a) { setTimeout(() => tab('home')); return ''; }
  const done = a.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const tot = a.exercises.reduce((n, e) => n + e.sets.length, 0);
  let h = `<header class="wk-top">
    <button class="icon" data-a="minimize" aria-label="Minimizar">${I.down}</button>
    <div class="wk-title"><b>${esc(a.routineName)}</b><span><span data-tick="elapsed"></span> · ${done}/${tot} series</span></div>
    <button class="icon" data-a="manualTimer" aria-label="Temporizador">${I.timer}</button>
    <button class="btn btn-primary btn-sm" data-a="finish">Terminar</button></header>
    <div class="wk-prog"><i style="width:${tot ? done / tot * 100 : 0}%"></i></div>`;

  a.exercises.forEach((e, ei) => {
    const ex = exById(e.exerciseId) || { name: e.name, type: '' };
    const prev = lastEntry(e.exerciseId);
    const t = e.target;
    const tgt = [`${e.sets.length} ${e.sets.length === 1 ? 'serie' : 'series'}`];
    if (t.repMin || t.repMax) tgt.push(t.repMin && t.repMax && t.repMin != t.repMax ? `${t.repMin}–${t.repMax} reps` : `${t.repMin || t.repMax} reps`);
    tgt.push('desc. ' + Fmt.clock(t.rest ?? D.settings.defaultRest));
    const wLabel = ex.type === 'lastre' ? '+KG' : 'KG';
    const allDone = e.sets.length && e.sets.every(s => s.done);

    h += `<section class="wex${allDone ? ' complete' : ''}" id="wex-${ei}">
      <div class="wex-h"><h2>${esc(ex.name)}</h2><button class="icon ghost" data-a="exMenu" data-ei="${ei}" aria-label="Opciones">${I.dots}</button></div>
      <div class="wex-t">${esc(tgt.join(' · '))}</div>
      <div class="wex-prev">${prev ? `<span>Anterior</span><b>${esc(Stats.setsStr(prev.sets))}</b><em>${Fmt.dShort(prev.date)}</em>` : '<span>Primera vez · sin registros previos</span>'}</div>
      ${t.notes ? `<div class="wex-note">${I.note}<span>${esc(t.notes)}</span></div>` : ''}
      ${e.note ? `<div class="wex-note mine">${I.note}<span>${esc(e.note)}</span></div>` : ''}
      <div class="sets">
        <div class="set-h"><span>SERIE</span><span>ANTERIOR</span><span>${wLabel}</span><span>REPS</span><span>RIR</span><span></span></div>`;
    e.sets.forEach((s, si) => {
      const ps = prev && prev.sets[si];
      const wPh = ps ? inp(ps.w) : (t.weight ? inp(t.weight) : '0');
      const rPh = ps ? String(ps.r) : (t.repMin && t.repMax && t.repMin != t.repMax ? `${t.repMin}-${t.repMax}` : (t.repMin || t.repMax || ''));
      h += `<div class="set-row${s.done ? ' done' : ''}" data-ei="${ei}" data-si="${si}">
        <button class="set-n${s.doubtful ? ' dub' : ''}${s.note ? ' has-note' : ''}" data-a="setMenu" data-ei="${ei}" data-si="${si}" aria-label="Opciones de la serie">${si + 1}</button>
        <span class="set-prev">${ps ? (ps.w > 0 ? Fmt.n(ps.w, 2) + '×' : '') + ps.r : '—'}</span>
        <input class="inp" inputmode="decimal" data-f="weight" value="${esc(s.weight)}" placeholder="${esc(wPh)}" aria-label="Peso">
        <input class="inp" inputmode="numeric" enterkeyhint="done" data-f="reps" value="${esc(s.reps)}" placeholder="${esc(rPh)}" aria-label="Reps">
        <input class="inp rir" inputmode="numeric" data-f="rir" value="${esc(s.rir)}" placeholder="–" aria-label="RIR">
        <button class="chk" data-a="toggleSet" data-ei="${ei}" data-si="${si}" aria-label="Completar serie">${I.check}</button>
      </div>`;
      if (s.note || s.doubtful) h += `<div class="set-sub">${s.doubtful ? '<span class="tag">Dudosa · no cuenta para PR</span>' : ''}${s.note ? esc(s.note) : ''}</div>`;
    });
    h += `</div><button class="btn-add-set" data-a="addSet" data-ei="${ei}">${I.plus}<span>Serie</span></button>`;

    // comparación en vivo cuando ya se hicieron al menos tantas series como la vez anterior
    const doneSets = Stats.validSets(e.sets);
    if (prev && doneSets.length && doneSets.length >= prev.sets.length) {
      const cur = { sets: doneSets, m: Stats.metrics(doneSets, { noE1rm: noE1rm(e.exerciseId) }) };
      h += cmpBlock(Stats.compare(prev, cur), 'Hoy vs anterior');
    }
    h += '</section>';
  });

  h += `<button class="btn-dashed" data-a="wkAddEx">${I.plus}<span>Agregar ejercicio</span></button>
    <button class="btn btn-text danger btn-block" data-a="cancelWorkout">Descartar entrenamiento</button>`;
  return h;
};

function cmpBlock(items, title) {
  if (!items || !items.length) return '';
  return `<div class="cmp">${title ? `<div class="cmp-t">${esc(title)}</div>` : ''}${items.map(it =>
    `<div class="cmp-r t-${it.tone}"><span>${esc(it.label)}</span><b>${esc(it.text)}</b></div>`).join('')}</div>`;
}

SHEETS.setMenu = s => {
  const e = D.active.exercises[s.ei], st = e.sets[s.si];
  const rir = num(st.rir);
  return sheetHead(`Serie ${s.si + 1}`, exName(e)) + `
    <div class="form">
      <div class="field"><span>RIR <small>(reps en reserva)</small></span><div class="chips">
        ${[0, 1, 2, 3, 4, 5].map(v => `<button class="chip num${rir === v ? ' on' : ''}" data-a="setRir" data-v="${v}">${v}</button>`).join('')}
        <button class="chip${rir == null ? ' on' : ''}" data-a="setRir" data-v="">—</button></div></div>
      <button class="toggle${st.doubtful ? ' on' : ''}" data-a="setDoubt"><span class="tg"></span><span><b>Serie dudosa</b><small>Técnica o rango dudosos: se guarda pero no cuenta para PRs</small></span></button>
      <label class="field"><span>Nota</span><textarea id="setnote" data-bind="set.note" rows="2" placeholder="Opcional">${esc(st.note)}</textarea></label>
      <button class="btn btn-primary btn-block" data-a="closeSheet">Listo</button>
      <button class="btn btn-text danger btn-block" data-a="delSet">Eliminar serie</button>
    </div>`;
};

SHEETS.exMenu = s => {
  const a = D.active, e = a.exercises[s.ei];
  const fromRoutine = e.target.itemId && routineById(a.routineId);
  return sheetHead(exName(e)) + `
    <div class="form">
      <div class="row2"><span class="lbl">Descanso</span>${stepper('wk', 'rest', e.target.rest ?? D.settings.defaultRest)}</div>
      ${fromRoutine ? `<button class="btn btn-ghost btn-block" data-a="restToRoutine">Guardar este descanso en la rutina</button>` : ''}
      <label class="field"><span>Nota del ejercicio (hoy)</span><textarea data-bind="wkex.note" rows="2" placeholder="Opcional">${esc(e.note)}</textarea></label>
    </div>
    <div class="menu">
      ${exById(e.exerciseId) ? `<button class="menu-i" data-a="openAnalysis" data-id="${e.exerciseId}">${I.chart}<span>Ver análisis del ejercicio</span></button>` : ''}
      <button class="menu-i" data-a="wkMove" data-d="-1" ${s.ei === 0 ? 'disabled' : ''}>${I.up}<span>Mover arriba</span></button>
      <button class="menu-i" data-a="wkMove" data-d="1" ${s.ei === a.exercises.length - 1 ? 'disabled' : ''}>${I.dn}<span>Mover abajo</span></button>
      <button class="menu-i danger" data-a="wkRemoveEx">${I.trash}<span>Quitar del entrenamiento</span></button>
    </div>`;
};

/* ------------------------------ temporizador ------------------------------ */

let actx = null;
function ensureAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* sin audio */ }
}
function beep() {
  if (!D.settings.sound || !actx) return;
  [0, 0.22, 0.44].forEach((t, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = i === 2 ? 1320 : 880;
    o.connect(g); g.connect(actx.destination);
    const st = actx.currentTime + t;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.35, st + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.16);
    o.start(st); o.stop(st + 0.18);
  });
}

function startTimer(sec) {
  if (!D.active) return;
  D.active.timer = { dur: sec, end: Date.now() + sec * 1000, paused: false, left: 0, fired: false };
  Store.save();
  renderTimer();
}
const timerLeftMs = t => t.paused ? t.left : Math.max(0, t.end - Date.now());

function timerHtml() {
  const t = D.active && D.active.timer;
  if (!t) return '';
  const left = timerLeftMs(t);
  const fin = t.fired;
  return `<div class="timer${t.paused ? ' paused' : ''}${fin ? ' fin' : ''}">
    <div class="timer-bar"><i data-tick="tbar" style="width:${t.dur ? left / (t.dur * 1000) * 100 : 0}%"></i></div>
    <div class="timer-row">
      <button class="t-btn" data-a="tAdd" data-s="-15">−15</button>
      <div class="timer-c"><small>${fin ? 'Descanso terminado' : t.paused ? 'En pausa' : 'Descanso'}</small><b data-tick="timer">${Fmt.clock(Math.ceil(left / 1000))}</b></div>
      <button class="t-btn" data-a="tAdd" data-s="15">+15</button>
      <button class="t-btn icon-b" data-a="tPause" aria-label="${t.paused ? 'Reanudar' : 'Pausar'}">${t.paused ? I.play : I.pause}</button>
      <button class="t-btn wide" data-a="tSkip">${fin ? 'Cerrar' : 'Saltar'}</button>
    </div></div>`;
}

function renderTimer() {
  const slot = document.getElementById('timer-slot');
  if (slot) slot.innerHTML = timerHtml();
  document.body.classList.toggle('has-timer', !!(D.active && D.active.timer));
}

function tick() {
  const a = D.active;
  if (a) {
    const el = Fmt.clock((Date.now() - a.start) / 1000);
    document.querySelectorAll('[data-tick="elapsed"]').forEach(n => { n.textContent = el; });
    const t = a.timer;
    if (t) {
      const left = timerLeftMs(t);
      const tn = document.querySelector('[data-tick="timer"]');
      if (tn) tn.textContent = Fmt.clock(Math.ceil(left / 1000));
      const tb = document.querySelector('[data-tick="tbar"]');
      if (tb) tb.style.width = (t.dur ? left / (t.dur * 1000) * 100 : 0) + '%';
      if (!t.paused && left <= 0 && !t.fired) {
        t.fired = true; t.firedAt = Date.now();
        if (D.settings.vibrate && navigator.vibrate) navigator.vibrate([250, 120, 250]);
        beep();
        Store.save();
        renderTimer();
      } else if (t.fired && Date.now() - (t.firedAt || 0) > 6000) {
        a.timer = null; Store.save(); renderTimer();
      }
    }
  }
}
setInterval(tick, 250);

/* ------------------------------ finalizar ------------------------------ */

function finishWorkout() {
  const a = D.active;
  const done = a.exercises.reduce((n, e) => n + Stats.validSets(e.sets).length, 0);
  const pending = a.exercises.reduce((n, e) => n + e.sets.filter(s => !s.done).length, 0);
  if (!done) {
    confirmBox({ title: 'No hay series completadas', text: 'Marcá las series con ✓ para registrarlas. ¿Descartar el entrenamiento?', ok: 'Descartar', danger: true, onOk: discardWorkout });
    return;
  }
  confirmBox({
    title: '¿Terminar entrenamiento?',
    text: pending ? `${pending} ${pending === 1 ? 'serie sin completar no se guardará' : 'series sin completar no se guardarán'}.` : 'Se guardarán todas las series.',
    ok: 'Terminar y guardar', onOk: doFinish,
  });
}

function doFinish() {
  const a = D.active;
  const session = {
    id: a.id, routineId: a.routineId, routineName: a.routineName, start: a.start, end: Date.now(),
    exercises: a.exercises.map(e => ({
      exerciseId: e.exerciseId, name: exName(e), target: e.target, note: e.note || '',
      sets: e.sets.filter(s => s.done && num(s.reps) > 0).map(s => ({
        weight: num(s.weight) || 0, reps: num(s.reps), rir: num(s.rir), note: s.note || '', doubtful: !!s.doubtful, done: true, at: s.at || null,
      })),
    })).filter(e => e.sets.length),
  };
  D.sessions.push(session);
  D.active = null;
  Store.save();
  ui.stack = []; ui.root = 'home';
  ui.view = 'summary'; ui.params = { id: session.id }; ui.sheet = null;
  render(); window.scrollTo(0, 0);
}

function discardWorkout() { D.active = null; Store.save(); tab('home'); }

/* ------------------------------ RESUMEN ------------------------------ */

function statGrid(tt) {
  return `<div class="stats">
    <div><small>Duración</small><b>${Fmt.clock(tt.dur)}</b></div>
    <div><small>Ejercicios</small><b>${tt.ex}</b></div>
    <div><small>Series</small><b>${tt.sets}</b></div>
    <div><small>Reps totales</small><b>${tt.reps}</b></div>
    <div class="span2"><small>Volumen total</small><b>${Fmt.n(tt.vol, 0)}<em> kg</em></b></div>
  </div>`;
}

function prBlock(rep) {
  const withPr = rep.filter(r => r.prs.length);
  if (!withPr.length) return '';
  const n = withPr.reduce((a, r) => a + r.prs.length, 0);
  const lbl = t => { t = t.replace(/^PR de /, ''); return t.startsWith('e1RM') ? t : t.charAt(0).toUpperCase() + t.slice(1); };
  return `<div class="sec-h"><h3>PRs <span class="count">${n}</span></h3></div><div class="prs">${withPr.map(r =>
    `<div class="pr">${I.trophy}<div><b>${esc(r.name)}</b>${r.prs.map(p =>
      `<span>${esc(lbl(p.label))}: <strong>${esc(p.val)}</strong>${p.prev ? ` <em>(antes ${esc(p.prev)})</em>` : ''}</span>`).join('')}</div></div>`).join('')}</div>`;
}

VIEWS.summary = () => {
  const s = D.sessions.find(x => x.id === ui.params.id);
  if (!s) return '';
  const rep = sessionReport(s);
  let h = `<header class="hero done"><div class="eyebrow">${esc(s.routineName)} · ${esc(Fmt.dLong(s.start))}</div><h1>Entrenamiento completado</h1></header>`;
  h += statGrid(sessionTotals(s));
  h += prBlock(rep);
  h += `<div class="sec-h"><h3>Cambios respecto a la sesión anterior</h3></div>`;
  for (const r of rep) {
    h += `<div class="card"><div class="card-h"><b>${esc(r.name)}</b><span class="muted sm">${esc(Stats.setsStr(r.entry.sets))}</span></div>
      ${r.cmp ? cmpBlock(r.cmp, r.prev ? 'vs ' + Fmt.date(r.prev.date) + ' · ' + Stats.setsStr(r.prev.sets) : '') : '<p class="hint">Primera sesión registrada: queda como referencia.</p>'}</div>`;
  }
  h += `<div class="sticky-foot"><button class="btn btn-primary btn-block" data-a="tab" data-v="home">Listo</button></div>`;
  return h;
};

/* ------------------------------ HISTORIAL ------------------------------ */

VIEWS.history = () => {
  let h = `<header class="hero"><h1>Historial</h1></header>`;
  const list = D.sessions.slice().sort((a, b) => b.start - a.start);
  if (!list.length) return h + `<div class="empty"><div class="empty-ic">${I.hist}</div><p><b>Sin sesiones todavía.</b></p><p>Cuando termines un entrenamiento aparece acá.</p></div>`;
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const month1 = new Date(now.getFullYear(), now.getMonth(), 1);
  h += `<div class="stats three">
    <div><small>Esta semana</small><b>${list.filter(s => s.start >= +monday).length}</b></div>
    <div><small>Este mes</small><b>${list.filter(s => s.start >= +month1).length}</b></div>
    <div><small>Total</small><b>${list.length}</b></div></div>`;
  const prc = prCounts();
  let curM = '';
  for (const s of list) {
    const m = Fmt.month(s.start);
    if (m !== curM) { curM = m; h += `<div class="month">${esc(m)}</div>`; }
    const tt = sessionTotals(s);
    const names = s.exercises.map(exName);
    h += `<button class="scard" data-a="openSession" data-id="${s.id}">
      <div class="scard-h"><b>${esc(s.routineName)}</b>${prc[s.id] ? `<span class="badge">${I.trophy}${prc[s.id]} PR</span>` : ''}</div>
      <div class="scard-d">${esc(Fmt.dLong(s.start))} · ${Fmt.time(s.start)} · ${Fmt.dur(tt.dur)}</div>
      <div class="scard-n"><span><b>${tt.ex}</b> ejercicios</span><span><b>${tt.sets}</b> series</span><span><b>${tt.reps}</b> reps</span><span><b>${Fmt.n(tt.vol, 0)}</b> kg</span></div>
      <div class="scard-x">${esc(names.join(' · '))}</div></button>`;
  }
  return h;
};

VIEWS.session = () => {
  const s = D.sessions.find(x => x.id === ui.params.id);
  if (!s) return topbar('Sesión') + '<p class="hint">La sesión no existe.</p>';
  const rep = sessionReport(s);
  const repById = Object.fromEntries(rep.map(r => [r.exId, r]));
  let h = topbar(s.routineName, `<button class="icon" data-a="delSession" data-id="${s.id}" aria-label="Eliminar">${I.trash}</button>`,
    `${Fmt.date(s.start)} · ${Fmt.time(s.start)}–${Fmt.time(s.end || s.start)}`);
  h += statGrid(sessionTotals(s));
  h += prBlock(rep);
  for (const e of s.exercises) {
    const r = repById[e.exerciseId];
    const ex = exById(e.exerciseId);
    const vol = e.sets.reduce((a, x) => a + (x.weight || 0) * (x.reps || 0), 0);
    h += `<div class="card"><div class="card-h"><b>${esc(exName(e))}</b>${ex ? `<button class="link" data-a="openAnalysis" data-id="${ex.id}">Análisis ${I.right}</button>` : ''}</div>
      <table class="tbl"><thead><tr><th>Serie</th><th>Peso</th><th>Reps</th><th>RIR</th><th>Vol.</th></tr></thead><tbody>
      ${e.sets.map((x, i) => `<tr class="${x.doubtful ? 'dub' : ''}"><td>${i + 1}${x.doubtful ? ' <span class="tag">dudosa</span>' : ''}</td><td>${Fmt.kg(x.weight)}</td><td>${x.reps}</td><td>${x.rir != null ? Fmt.n(x.rir) : '—'}</td><td>${Fmt.n((x.weight || 0) * x.reps, 0)}</td></tr>
        ${x.note ? `<tr class="note-r"><td colspan="5">${esc(x.note)}</td></tr>` : ''}`).join('')}
      </tbody><tfoot><tr><td>Total</td><td></td><td>${e.sets.reduce((a, x) => a + x.reps, 0)}</td><td></td><td>${Fmt.n(vol, 0)}</td></tr></tfoot></table>
      ${e.note ? `<p class="wex-note mine">${I.note}<span>${esc(e.note)}</span></p>` : ''}
      ${r && r.cmp ? cmpBlock(r.cmp, 'vs sesión anterior (' + Fmt.date(r.prev.date) + ')') : ''}</div>`;
  }
  return h;
};

/* ------------------------------ EJERCICIOS ------------------------------ */

VIEWS.exercises = () => {
  let h = `<header class="hero row"><h1>Ejercicios</h1><button class="btn btn-primary btn-sm" data-a="newEx">${I.plus}<span>Crear</span></button></header>`;
  if (!D.exercises.length) return h + `<div class="empty"><div class="empty-ic">${I.list}</div><p><b>Sin ejercicios.</b></p><p>Creá tus ejercicios acá o directamente al armar una rutina.</p></div>`;
  h += `<div class="search">${I.search}<input id="exq" value="${esc(ui.exQuery)}" placeholder="Buscar ejercicio" autocomplete="off"></div>`;
  const usedCats = CATS.filter(c => D.exercises.some(e => e.category === c));
  if (usedCats.length) h += `<div class="chips scroll"><button class="chip${!ui.exCat ? ' on' : ''}" data-a="exCat" data-v="">Todos</button>${usedCats.map(c => `<button class="chip${ui.exCat === c ? ' on' : ''}" data-a="exCat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
  h += `<div id="exlist" class="exlist">${exListHtml()}</div>`;
  return h;
};

function exListHtml() {
  const q = ui.exQuery.trim().toLowerCase();
  const list = D.exercises
    .filter(e => (!q || e.name.toLowerCase().includes(q)) && (!ui.exCat || e.category === ui.exCat))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!list.length) return '<p class="hint">Sin resultados.</p>';
  return list.map(e => {
    const hst = histOf(e.id);
    const last = hst[hst.length - 1];
    const meta = [e.category, typeLabel(e.type)].filter(Boolean).join(' · ');
    const best = hst.reduce((b, x) => Math.max(b, (x.c && x.c.bestE) || 0), 0);
    return `<button class="ex-i" data-a="openAnalysis" data-id="${e.id}">
      <div><b>${esc(e.name)}</b><small>${esc(meta || 'Sin categoría')} · ${hst.length} ${hst.length === 1 ? 'sesión' : 'sesiones'}${last ? ' · ' + Fmt.ago(last.date) : ''}</small></div>
      <div class="ex-r">${last ? `<b>${esc(Stats.setsStr(last.sets, '/'))}</b>${best ? `<small>e1RM ${Fmt.kg(best, 1)}</small>` : ''}` : ''}</div></button>`;
  }).join('');
}

/* ------------------------- ANÁLISIS DE EJERCICIO ------------------------- */

function applyRange(h, r) {
  if (r === '5s') return h.slice(-5);
  if (r === '10s') return h.slice(-10);
  const d = { '30d': 30, '3m': 91, '6m': 182, '1y': 365 }[r];
  if (d) { const from = Date.now() - d * DAY; return h.filter(x => x.date >= from); }
  return h;
}

function freqBuckets(hist, range) {
  const now = Date.now();
  const d = { '30d': 30, '3m': 91, '6m': 182, '1y': 365 }[range];
  let from;
  if (d) from = now - d * DAY;
  else { const sub = applyRange(hist, range); from = sub.length ? sub[0].date : now; }
  const monthly = (now - from) / DAY > 200;
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  if (monthly) start.setDate(1); else start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const out = [];
  const cur = new Date(start);
  while (+cur <= now && out.length < 60) {
    const next = new Date(cur);
    if (monthly) next.setMonth(next.getMonth() + 1); else next.setDate(next.getDate() + 7);
    const v = hist.filter(x => x.date >= +cur && x.date < +next).length;
    out.push({
      x: +cur, v,
      label: monthly ? cur.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) : Fmt.dShort(+cur),
      desc: (monthly ? Fmt.month(+cur) : 'Semana del ' + Fmt.dShort(+cur)) + ': ' + v + (v === 1 ? ' sesión' : ' sesiones'),
    });
    cur.setTime(+next);
  }
  return out;
}

const kv = (label, val, sub = '') => `<div class="kv"><span>${esc(label)}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

function argBest(hist, get) {
  let v = null, at = null;
  for (const h of hist) { const x = get(h); if (x != null && (v == null || x > v)) { v = x; at = h; } }
  return { v, at };
}

VIEWS.exercise = () => {
  const ex = exById(ui.params.id);
  if (!ex) return topbar('Ejercicio') + '<p class="hint">El ejercicio no existe.</p>';
  const hist = histOf(ex.id);
  const meta = [ex.category, typeLabel(ex.type)].filter(Boolean).join(' · ');
  let h = topbar(ex.name, `<button class="icon" data-a="editEx" data-id="${ex.id}" aria-label="Editar">${I.edit}</button>`, meta);
  if (ex.notes) h += `<p class="wex-note">${I.note}<span>${esc(ex.notes)}</span></p>`;
  if (!hist.length) return h + `<div class="empty"><div class="empty-ic">${I.chart}</div><p><b>Sin sesiones registradas.</b></p><p>Las métricas y gráficos aparecen al registrar este ejercicio.</p></div>`;

  const clean = hist.filter(x => x.c);
  const cSets = hist.flatMap(x => x.sets.filter(s => !s.doubtful).map(s => ({ ...s, date: x.date })));
  const allSets = hist.flatMap(x => x.sets);
  const last = hist[hist.length - 1], first = hist[0];
  const hasW = allSets.some(s => s.w > 0);
  const wName = ex.type === 'lastre' ? 'Lastre' : 'Peso';

  const bW = argBest(clean, x => x.c.topW || null);
  const bE = argBest(clean, x => x.c.bestE);
  const bR = argBest(clean, x => x.c.maxR);
  const bT = argBest(clean, x => x.c.total);
  const bV = argBest(clean, x => x.c.vol || null);
  let bestSet = null;
  for (const s of cSets) if (!bestSet || Stats.cmpSet(s, bestSet) > 0) bestSet = s;
  const bestR = cSets.reduce((b, s) => (!b || s.r > b.r || (s.r === b.r && s.w > b.w)) ? s : b, null);

  // ---- mosaico principal
  h += `<div class="stats">
    ${hasW ? `<div><small>${wName} máx.</small><b>${bW.v != null ? Fmt.n(bW.v, 2) : '—'}<em> kg</em></b></div>` : `<div><small>Reps máx.</small><b>${bR.v ?? '—'}</b></div>`}
    <div><small>e1RM</small><b>${bE.v ? Fmt.n(bE.v, 1) + '<em> kg</em>' : '—'}</b></div>
    <div><small>Mejor serie</small><b class="sm">${bestSet ? (bestSet.w > 0 ? Fmt.n(bestSet.w, 2) + '×' : '') + bestSet.r : '—'}</b></div>
    <div><small>Sesiones</small><b>${hist.length}</b></div></div>`;

  // ---- gráfico
  const mDef = METRICS.find(m => m.k === ui.chart.metric) || METRICS[0];
  h += `<div class="card chart-card"><div class="chips scroll">${METRICS.map(m => `<button class="chip${m.k === mDef.k ? ' on' : ''}" data-a="chartMetric" data-v="${m.k}">${m.label}</button>`).join('')}</div>`;
  let svg, pts;
  if (mDef.bars) {
    const b = freqBuckets(hist, ui.chart.range);
    pts = b.map(x => ({ desc: x.desc }));
    svg = Charts.bars(b, v => Fmt.n(v, 0));
  } else {
    const sub = applyRange(hist, ui.chart.range).map(x => ({ x: x.date, y: mDef.get(x), h: x })).filter(p => p.y != null);
    pts = sub.map(p => ({ desc: `${Fmt.date(p.x)} · ${mDef.fmt(p.y)} · ${Stats.setsStr(p.h.sets)}` }));
    svg = mDef.k === 'e1rm' && noE1rm(ex.id)
      ? '<div class="chart-empty">El e1RM no se calcula en ejercicios de peso corporal</div>'
      : Charts.line(sub, v => Fmt.n(v, v >= 100 ? 0 : 1));
  }
  ui.chartPts = pts;
  h += `<div class="readout" id="readout">${pts.length ? esc(pts[pts.length - 1].desc) : ''}</div><div class="chart">${svg}</div>
    <div class="chips seg">${RANGES.map(([k, l]) => `<button class="chip${k === ui.chart.range ? ' on' : ''}" data-a="chartRange" data-v="${k}">${l}</button>`).join('')}</div></div>`;

  // ---- tendencia
  const TR = [
    ['e1RM', x => x.m.bestE, v => Fmt.n(v, 1), 1],
    [wName + ' máx.', x => x.m.topW || null, v => Fmt.n(v, 2), 1],
    ['Reps totales', x => x.m.total, v => Fmt.n(v, 0), 1],
    ['Reps máx.', x => x.m.maxR, v => Fmt.n(v, 0), 1],
    ['Volumen', x => x.m.vol || null, v => Fmt.n(v, 0), 1],
    ['Reps/serie', x => x.m.avgR, v => Fmt.n(v, 1), 1],
    ['RIR medio', x => x.m.avgRir, v => Fmt.n(v, 1), 0],
  ];
  let trRows = '';
  for (const [label, get, f, directional] of TR) {
    const t = Stats.trend(hist, get);
    if (!t) continue;
    let dir = '<span class="muted">—</span>';
    if (t.dir !== 'insuf') {
      const arrow = t.dir === 'up' ? '↗' : t.dir === 'down' ? '↘' : '→';
      const cls = !directional ? 'eq' : t.dir === 'up' ? 'up' : t.dir === 'down' ? 'down' : 'eq';
      dir = `<span class="t-${cls}">${arrow} ${t.dir === 'flat' ? 'estable' : Fmt.signed(t.slope, Math.abs(t.slope) >= 10 ? 0 : Math.abs(t.slope) >= 1 ? 1 : 2) + '/ses'}</span>`;
    }
    trRows += `<tr><td>${esc(label)}</td><td>${f(t.cur)}</td><td>${f(t.best)}</td><td>${f(t.avg)}</td><td>${dir}</td></tr>`;
  }
  h += `<div class="sec-h"><h3>Tendencia</h3><span class="muted sm">últimas ${Math.min(6, hist.length)} sesiones</span></div>
    <div class="card"><table class="tbl trend"><thead><tr><th></th><th>Actual</th><th>Mejor</th><th>Prom.</th><th>Tendencia</th></tr></thead><tbody>${trRows}</tbody></table>
    <p class="hint sm">Prom. = promedio de las últimas 5 sesiones. Tendencia = pendiente por sesión. Cada dimensión se muestra por separado: ninguna métrica sola define el progreso.</p></div>`;

  // ---- fuerza
  const byW = {};
  for (const s of cSets) if (!byW[s.w] || s.r > byW[s.w].r) byW[s.w] = s;
  const weights = Object.keys(byW).map(Number).sort((a, b) => b - a);
  h += `<div class="sec-h"><h3>Fuerza</h3></div><div class="card kvs">
    ${hasW ? kv(wName + ' máximo', Fmt.kg(bW.v), bW.at ? Fmt.date(bW.at.date) : '') : ''}
    ${kv('e1RM estimado', bE.v ? Fmt.kg(bE.v, 1) : 'No aplica', bE.at ? Fmt.date(bE.at.date) : (noE1rm(ex.id) ? 'no se calcula en ejercicios de peso corporal' : 'requiere carga y ≤12 reps'))}
    ${kv('Mejor serie (peso × reps)', bestSet ? (bestSet.w > 0 ? Fmt.kg(bestSet.w) + ' × ' : '') + bestSet.r + ' reps' : '—', bestSet ? Fmt.date(bestSet.date) : '')}
    ${hasW ? kv('Mayor producto peso × reps', Fmt.n(Math.max(...cSets.map(s => s.w * s.r), 0), 1)) : ''}
  </div>`;
  if (hasW && weights.length) {
    h += `<div class="card"><div class="card-h"><b>Mejor rendimiento por peso</b></div><table class="tbl"><thead><tr><th>Peso</th><th>Reps</th><th>RIR</th><th>e1RM</th><th>Fecha</th></tr></thead><tbody>
      ${weights.slice(0, 12).map(w => { const s = byW[w]; const e = Stats.e1rm(s.w, s.r); return `<tr><td>${Fmt.kg(w)}</td><td><b>${s.r}</b></td><td>${s.rir != null ? Fmt.n(s.rir) : '—'}</td><td>${e ? Fmt.n(e, 1) : '—'}</td><td>${Fmt.dShort(s.date)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  // ---- repeticiones
  const totSets = allSets.length, totReps = allSets.reduce((a, s) => a + s.r, 0);
  h += `<div class="sec-h"><h3>Repeticiones</h3></div><div class="card kvs">
    ${kv('Máximo en una serie', bestR ? bestR.r + ' reps' : '—', bestR ? (bestR.w > 0 ? 'con ' + Fmt.kg(bestR.w) + ' · ' : '') + Fmt.date(bestR.date) : '')}
    ${kv('Reps totales (última sesión)', last.m.total, Fmt.date(last.date))}
    ${kv('Mejor cantidad de reps totales', bT.v ?? '—', bT.at ? Fmt.date(bT.at.date) : '')}
    ${kv('Promedio de reps por serie', Fmt.n(totReps / totSets, 1), 'histórico')}
    ${kv('Promedio de reps totales por sesión', Fmt.n(mean(hist.map(x => x.m.total)), 1))}
  </div>`;

  // ---- volumen
  if (hasW) {
    const vols = hist.map(x => x.m.vol);
    h += `<div class="sec-h"><h3>Volumen</h3><span class="muted sm">peso × reps</span></div><div class="card kvs">
      ${kv('Volumen última sesión', Fmt.kg(last.m.vol, 0), Fmt.date(last.date))}
      ${kv('Volumen por serie (última)', Fmt.kg(last.m.volPerSet, 0))}
      ${kv('Volumen promedio por sesión', Fmt.kg(mean(vols), 0))}
      ${kv('Volumen promedio por serie', Fmt.kg(allSets.reduce((a, s) => a + s.w * s.r, 0) / totSets, 0))}
      ${kv('Mayor volumen histórico', Fmt.kg(bV.v, 0), bV.at ? Fmt.date(bV.at.date) : '')}
    </div>`;

    // ---- carga
    const fw = first.m.topW, lw = last.m.topW;
    h += `<div class="sec-h"><h3>Carga${ex.type === 'lastre' ? ' (lastre)' : ''}</h3></div><div class="card kvs">
      ${kv(wName + ' máximo utilizado', Fmt.kg(bW.v))}
      ${kv('Evolución', `${Fmt.kg(fw)} → ${Fmt.kg(lw)}`, `${Fmt.date(first.date)} → ${Fmt.date(last.date)}`)}
      ${kv('Incremento de carga', fw > 0 ? `${Fmt.signed(lw - fw, 2, ' kg')} <em>(${Fmt.pct((lw - fw) / fw)})</em>` : (lw > 0 ? Fmt.signed(lw, 2, ' kg') : '—'), 'primera vs última sesión')}
      ${kv('Carga principal (última)', Fmt.kg(last.m.mainW), 'la más usada en la sesión')}
    </div>`;
  }

  // ---- consistencia
  const rirs = allSets.filter(s => s.rir != null).map(s => s.rir);
  const multi = hist.filter(x => x.m.n >= 2);
  const totals5 = hist.slice(-5).map(x => x.m.total);
  const m5 = mean(totals5);
  const cv5 = totals5.length >= 2 && m5 ? Math.sqrt(mean(totals5.map(v => (v - m5) ** 2))) / m5 : null;
  h += `<div class="sec-h"><h3>Consistencia</h3></div><div class="card kvs">
    ${kv('RIR promedio', rirs.length ? Fmt.n(mean(rirs), 1) : '—', rirs.length ? `${rirs.length} series con RIR` : 'sin RIR registrado')}
    ${kv('Reps promedio por serie', Fmt.n(totReps / totSets, 1))}
    ${kv('Diferencia 1ª vs última serie', multi.length ? Fmt.signed(-mean(multi.map(x => x.m.firstLast)), 1, ' reps') : '—', 'promedio por sesión (caída de reps)')}
    ${kv('Variación entre series', multi.length ? Fmt.n(mean(multi.map(x => x.m.cv)) * 100, 1) + ' %' : '—', 'coef. de variación de reps dentro de la sesión')}
    ${kv('Variación entre sesiones', cv5 != null ? Fmt.n(cv5 * 100, 1) + ' %' : '—', 'reps totales, últimas 5 sesiones')}
  </div>`;

  // ---- frecuencia
  const weeks = Math.max(1, (Date.now() - first.date) / (7 * DAY));
  h += `<div class="sec-h"><h3>Frecuencia</h3></div><div class="card kvs">
    ${kv('Sesiones realizadas', hist.length, 'desde ' + Fmt.date(first.date))}
    ${kv('Frecuencia semanal promedio', Fmt.n(hist.length / weeks, 1) + ' / sem')}
    ${kv('Días desde la última sesión', Fmt.daysSince(last.date), Fmt.date(last.date))}
  </div>`;

  // ---- PRs
  const prs = Stats.prs(hist);
  const prList = [];
  hist.forEach((x, i) => prs[i].forEach(p => prList.push({ ...p, date: x.date })));
  h += `<div class="sec-h"><h3>PRs <span class="count">${prList.length}</span></h3></div>`;
  h += prList.length ? `<div class="card"><div class="prs flat">${prList.reverse().slice(0, 20).map(p =>
    `<div class="pr">${I.trophy}<div><b>${esc(p.label)}: ${esc(p.val)}</b><span>${Fmt.date(p.date)}${p.prev ? ' · antes ' + esc(p.prev) : ''}</span></div></div>`).join('')}</div></div>`
    : `<p class="hint">Los PRs se detectan desde la segunda sesión (las series dudosas no cuentan).</p>`;

  // ---- historial del ejercicio
  h += `<div class="sec-h"><h3>Sesiones</h3></div><div class="card">`;
  hist.slice().reverse().forEach((x, j) => {
    const i = hist.length - 1 - j;
    h += `<button class="hrow" data-a="openSession" data-id="${x.session.id}"><div><b>${Fmt.date(x.date)}</b><small>${esc(x.session.routineName)}</small></div>
      <div class="hrow-r"><span>${esc(Stats.setsStr(x.sets))}</span><small>${x.m.vol ? Fmt.kg(x.m.vol, 0) : x.m.total + ' reps'}${x.m.bestE ? ' · e1RM ' + Fmt.n(x.m.bestE, 1) : ''}${prs[i].length ? ` · <b class="t-up">${prs[i].length} PR</b>` : ''}</small></div></button>`;
  });
  h += '</div>';
  return h;
};

/* ------------------------------ AJUSTES ------------------------------ */

VIEWS.settings = () => {
  const st = D.settings;
  const nSets = D.sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  return `<header class="hero"><h1>Ajustes</h1></header>
    <div class="sec-h"><h3>Entrenamiento</h3></div>
    <div class="card form">
      <div class="row2"><span class="lbl">Descanso predeterminado</span>${stepper('settings', 'defaultRest', st.defaultRest)}</div>
      <button class="toggle${st.sound ? ' on' : ''}" data-a="setToggle" data-k="sound"><span class="tg"></span><span><b>Sonido al terminar el descanso</b></span></button>
      <button class="toggle${st.vibrate ? ' on' : ''}" data-a="setToggle" data-k="vibrate"><span class="tg"></span><span><b>Vibración</b></span></button>
    </div>
    <div class="sec-h"><h3>Apariencia</h3></div>
    <div class="card"><div class="chips seg">${[['auto', 'Automático'], ['dark', 'Oscuro'], ['light', 'Claro']].map(([k, l]) => `<button class="chip${st.theme === k ? ' on' : ''}" data-a="setTheme" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="sec-h"><h3>Datos</h3></div>
    <div class="card">
      <p class="hint">Todo se guarda en este dispositivo y funciona sin conexión. Hacé copias de seguridad de vez en cuando.</p>
      <div class="stats three flat"><div><small>Rutinas</small><b>${D.routines.length}</b></div><div><small>Ejercicios</small><b>${D.exercises.length}</b></div><div><small>Sesiones</small><b>${D.sessions.length}</b></div></div>
      <p class="muted sm">${nSets} series registradas</p>
      <button class="btn btn-ghost btn-block" data-a="exportData">Exportar copia de seguridad</button>
      <label class="btn btn-ghost btn-block">Importar copia<input type="file" id="importFile" accept="application/json,.json" hidden></label>
      <button class="btn btn-text danger btn-block" data-a="resetData">Borrar todos los datos</button>
    </div>
    <p class="foot-note">Hierro · v1</p>`;
};

/* ============================== sheets ============================== */

function sheetHead(title, sub = '') {
  return `<div class="sheet-grab"></div><div class="sheet-h"><div><h3>${esc(title)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    <button class="icon ghost" data-a="closeSheet" aria-label="Cerrar">${I.x}</button></div>`;
}

SHEETS.confirm = s => `<div class="sheet-grab"></div><div class="sheet-h"><div><h3>${esc(s.title)}</h3></div></div>
  ${s.text ? `<p class="sheet-p">${esc(s.text)}</p>` : ''}
  <div class="form">
    <button class="btn ${s.danger ? 'btn-danger' : 'btn-primary'} btn-block" data-a="confirmOk">${esc(s.ok || 'Aceptar')}</button>
    ${s.alt ? `<button class="btn btn-ghost btn-block${s.altDanger ? ' danger' : ''}" data-a="confirmAlt">${esc(s.alt)}</button>` : ''}
    <button class="btn btn-text btn-block" data-a="closeSheet">Cancelar</button></div>`;

function sheetHtml() {
  if (!ui.sheet) return '';
  const f = SHEETS[ui.sheet.type];
  return `<div class="sheet-back" data-a="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true">${f ? f(ui.sheet) : ''}</div>`;
}

/* stepper: t = destino (form | settings | wk), k = clave */
const STEP = { sets: [1, 1, 20, v => v], rest: [15, 0, 900, Fmt.clock], defaultRest: [15, 0, 900, Fmt.clock] };
function stepper(t, k, v) {
  const f = STEP[k][3];
  return `<div class="stepper"><button data-a="step" data-t="${t}" data-k="${k}" data-d="-1" aria-label="Menos">−</button>
    <span data-stepval="${t}.${k}">${f(v)}</span><button data-a="step" data-t="${t}" data-k="${k}" data-d="1" aria-label="Más">+</button></div>`;
}
function stepTarget(t) {
  if (t === 'form') return ui.sheet.form;
  if (t === 'settings') return D.settings;
  if (t === 'wk') return D.active.exercises[ui.sheet.ei].target;
}

/* ============================== acciones ============================== */

const A = {
  tab: el => tab(el.dataset.v),
  back: () => {
    if (ui.view === 'routineEdit' && isDraftDirty()) {
      confirmBox({ title: '¿Descartar cambios?', text: 'Los cambios de la rutina no se guardaron.', ok: 'Descartar', danger: true, onOk: () => { ui.draft = null; ui.draftOrig = ''; back(); } });
      return;
    }
    back();
  },
  closeSheet: () => closeSheet(),
  confirmOk: () => { const f = ui.sheet.onOk; closeSheet(); f && f(); },
  confirmAlt: () => { const f = ui.sheet.onAlt; closeSheet(); f && f(); },

  // --- rutinas
  newRoutine: () => openRoutineEditor(null),
  routineMenu: el => openSheet({ type: 'routineMenu', id: el.dataset.id }),
  editRoutine: el => { closeSheet(false); openRoutineEditor(routineById(el.dataset.id)); },
  dupRoutine: el => {
    const r = clone(routineById(el.dataset.id));
    r.id = uid(); r.name = r.name + ' (copia)'; r.createdAt = Date.now();
    r.items.forEach(it => { it.id = uid(); });
    const idx = D.routines.findIndex(x => x.id === el.dataset.id);
    D.routines.splice(idx + 1, 0, r);
    Store.save(); closeSheet(); toast('Rutina duplicada');
  },
  delRoutine: el => {
    const r = routineById(el.dataset.id);
    confirmBox({
      title: `¿Eliminar «${r.name}»?`, text: 'El historial de sesiones se conserva.', ok: 'Eliminar', danger: true,
      onOk: () => { D.routines = D.routines.filter(x => x.id !== r.id); Store.save(); render(); toast('Rutina eliminada'); },
    });
  },
  start: el => startWorkout(el.dataset.id),
  resume: () => go('workout'),

  addItem: () => openSheet({ type: 'pick', q: '', onPick: ex => openItemSheet(null, ex) }),
  editItem: el => openItemSheet(+el.dataset.i),
  itemMenu: el => openSheet({ type: 'itemMenu', i: +el.dataset.i }),
  moveItem: el => {
    const i = +el.dataset.i, j = i + +el.dataset.d, it = ui.draft.items;
    if (j < 0 || j >= it.length) return;
    [it[i], it[j]] = [it[j], it[i]];
    render();
  },
  dupItem: el => {
    const i = +el.dataset.i, c = clone(ui.draft.items[i]);
    c.id = uid(); ui.draft.items.splice(i + 1, 0, c);
    closeSheet();
  },
  delItem: el => { ui.draft.items.splice(+el.dataset.i, 1); closeSheet(); },
  saveItem: () => {
    const s = ui.sheet, f = s.form;
    f.sets = Math.max(1, +f.sets || 1);
    f.repMin = num(f.repMin); f.repMax = num(f.repMax);
    if (f.repMin && f.repMax && f.repMin > f.repMax) [f.repMin, f.repMax] = [f.repMax, f.repMin];
    f.weight = num(f.weight);
    if (s.idx != null) ui.draft.items[s.idx] = f; else ui.draft.items.push(f);
    closeSheet();
  },
  saveRoutine: () => {
    const d = ui.draft;
    d.name = (d.name || '').trim();
    if (!d.name) { toast('Poné un nombre a la rutina'); document.getElementById('rname')?.focus(); return; }
    if (!d.items.length) { toast('Agregá al menos un ejercicio'); return; }
    if (d.id) {
      const i = D.routines.findIndex(r => r.id === d.id);
      D.routines[i] = d;
    } else {
      d.id = uid(); d.createdAt = Date.now();
      D.routines.push(d);
    }
    Store.save();
    const isNew = ui.draftOrig.includes('"id":null');
    ui.draft = null; ui.draftOrig = '';
    back();
    toast(isNew ? 'Rutina creada' : 'Rutina guardada');
  },

  // --- selector / ejercicios
  pickEx: el => { const f = ui.sheet.onPick; f(exById(el.dataset.id)); },
  pickCreate: () => {
    const q = (ui.sheet.q || '').trim(), onPick = ui.sheet.onPick;
    const ex = D.exercises.find(e => e.name.toLowerCase() === q.toLowerCase());
    if (ex) { onPick(ex); return; }
    openExForm(null, onPick);
    if (q) { ui.sheet.form.name = q.charAt(0).toUpperCase() + q.slice(1); render(); }
  },
  newEx: () => openExForm(null, ex => { closeSheet(false); go('exercise', { id: ex.id }); }),
  editEx: el => openExForm(exById(el.dataset.id), () => closeSheet()),
  chip: el => {
    const f = ui.sheet.form, k = el.dataset.k, v = el.dataset.v;
    f[k] = f[k] === v ? '' : v;
    el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', f[k] === c.dataset.v));
  },
  saveEx: () => {
    const s = ui.sheet, f = s.form;
    f.name = (f.name || '').trim();
    if (!f.name) { toast('Escribí un nombre'); document.getElementById('exname')?.focus(); return; }
    let ex;
    if (s.id) { ex = exById(s.id); Object.assign(ex, f); }
    else { ex = { ...f, id: uid(), createdAt: Date.now() }; D.exercises.push(ex); }
    Store.save();
    s.onSave && s.onSave(ex);
  },
  delEx: () => {
    const id = ui.sheet.id, ex = exById(id);
    const used = D.routines.filter(r => r.items.some(it => it.exerciseId === id)).length;
    confirmBox({
      title: `¿Eliminar «${ex.name}»?`,
      text: (used ? `Se quitará de ${used} ${used === 1 ? 'rutina' : 'rutinas'}. ` : '') + 'Las sesiones ya registradas se conservan en el historial.',
      ok: 'Eliminar', danger: true,
      onOk: () => {
        D.exercises = D.exercises.filter(e => e.id !== id);
        D.routines.forEach(r => { r.items = r.items.filter(it => it.exerciseId !== id); });
        Store.save(); tab('exercises'); toast('Ejercicio eliminado');
      },
    });
  },
  exCat: el => { ui.exCat = el.dataset.v; render(); },
  openAnalysis: el => { closeSheet(false); go('exercise', { id: el.dataset.id }); },
  chartMetric: el => { ui.chart.metric = el.dataset.v; render(); },
  chartRange: el => { ui.chart.range = el.dataset.v; render(); },
  chartPt: el => {
    const i = +el.dataset.i, p = ui.chartPts[i];
    if (!p) return;
    document.getElementById('readout').textContent = p.desc;
    document.querySelectorAll('.c-dot, .c-bar').forEach(n => n.classList.remove('sel'));
    const svg = el.closest('svg');
    const dot = svg.querySelector(`.c-dot[data-i="${i}"]`) || svg.querySelectorAll('.c-bar')[i];
    if (dot) dot.classList.add('sel');
  },

  // --- entrenamiento
  minimize: () => tab('home'),
  finish: () => finishWorkout(),
  cancelWorkout: () => confirmBox({ title: '¿Descartar entrenamiento?', text: 'No se guardará nada de esta sesión.', ok: 'Descartar', danger: true, onOk: discardWorkout }),
  toggleSet: el => {
    const ei = +el.dataset.ei, si = +el.dataset.si;
    const e = D.active.exercises[ei], s = e.sets[si];
    if (s.done) { s.done = false; delete s.at; Store.save(); render(); return; }
    const row = el.closest('.set-row');
    const ph = f => row.querySelector(`[data-f="${f}"]`).placeholder;
    if (num(s.reps) == null || num(s.reps) <= 0) {
      const p = num(ph('reps'));
      if (p != null && p > 0) s.reps = String(p);
      else {
        const r = row.querySelector('[data-f="reps"]');
        r.focus(); row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
        return;
      }
    }
    if (num(s.weight) == null) { const p = num(ph('weight')); s.weight = p ? inp(p) : ''; }
    s.done = true; s.at = Date.now();
    ensureAudio();
    const rest = e.target.rest ?? D.settings.defaultRest;
    ui.lastRest = rest;
    if (rest > 0) D.active.timer = { dur: rest, end: Date.now() + rest * 1000, paused: false, left: 0, fired: false };
    Store.save();
    if (document.activeElement) document.activeElement.blur();
    render();
  },
  addSet: el => {
    const e = D.active.exercises[+el.dataset.ei];
    const l = e.sets[e.sets.length - 1];
    e.sets.push({ weight: l ? l.weight : '', reps: '', rir: '', note: '', doubtful: false, done: false });
    Store.save(); render();
  },
  setMenu: el => openSheet({ type: 'setMenu', ei: +el.dataset.ei, si: +el.dataset.si }),
  setRir: el => {
    const s = ui.sheet, st = D.active.exercises[s.ei].sets[s.si];
    st.rir = el.dataset.v;
    Store.save();
    el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el));
  },
  setDoubt: el => {
    const s = ui.sheet, st = D.active.exercises[s.ei].sets[s.si];
    st.doubtful = !st.doubtful; Store.save();
    el.classList.toggle('on', st.doubtful);
  },
  delSet: () => {
    const s = ui.sheet, e = D.active.exercises[s.ei];
    e.sets.splice(s.si, 1); Store.save(); closeSheet();
  },
  exMenu: el => openSheet({ type: 'exMenu', ei: +el.dataset.ei }),
  restToRoutine: () => {
    const e = D.active.exercises[ui.sheet.ei];
    const r = routineById(D.active.routineId);
    const it = r && r.items.find(x => x.id === e.target.itemId);
    if (it) { it.rest = e.target.rest; Store.save(); toast('Descanso guardado en la rutina'); }
  },
  wkMove: el => {
    const ex = D.active.exercises, i = ui.sheet.ei, j = i + +el.dataset.d;
    if (j < 0 || j >= ex.length) return;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    Store.save(); closeSheet();
  },
  wkRemoveEx: () => {
    const i = ui.sheet.ei, e = D.active.exercises[i];
    confirmBox({
      title: `¿Quitar ${exName(e)}?`, text: 'Se pierden las series de hoy de este ejercicio.', ok: 'Quitar', danger: true,
      onOk: () => { D.active.exercises.splice(i, 1); Store.save(); render(); },
    });
  },
  wkAddEx: () => openSheet({
    type: 'pick', q: '', onPick: ex => {
      const last = lastEntry(ex.id);
      D.active.exercises.push(buildActiveEx(ex.id, { sets: last ? last.sets.length : 3, repMin: null, repMax: null, weight: null, rest: ex.rest ?? D.settings.defaultRest, notes: '' }));
      Store.save(); closeSheet();
      setTimeout(() => document.getElementById('wex-' + (D.active.exercises.length - 1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    },
  }),
  manualTimer: () => { ensureAudio(); startTimer(ui.lastRest ?? D.settings.defaultRest); },

  // --- temporizador
  tAdd: el => {
    const t = D.active && D.active.timer; if (!t) return;
    const d = +el.dataset.s;
    if (t.fired) {
      D.active.timer = d > 0 ? { dur: d, end: Date.now() + d * 1000, paused: false, left: 0, fired: false } : null;
    } else {
      if (t.paused) t.left = Math.max(0, t.left + d * 1000); else t.end += d * 1000;
      t.dur = Math.max(1, t.dur + d);
      if (timerLeftMs(t) <= 0) D.active.timer = null;
    }
    Store.save(); renderTimer();
  },
  tPause: () => {
    const t = D.active && D.active.timer; if (!t || t.fired) return;
    if (t.paused) { t.end = Date.now() + t.left; t.paused = false; }
    else { t.left = timerLeftMs(t); t.paused = true; }
    Store.save(); renderTimer();
  },
  tSkip: () => { if (D.active) { D.active.timer = null; Store.save(); renderTimer(); } },

  // --- historial
  openSession: el => go('session', { id: el.dataset.id }),
  delSession: el => confirmBox({
    title: '¿Eliminar esta sesión?', text: 'Se borra del historial y de las estadísticas. No se puede deshacer.', ok: 'Eliminar', danger: true,
    onOk: () => { D.sessions = D.sessions.filter(s => s.id !== el.dataset.id); Store.save(); back(); toast('Sesión eliminada'); },
  }),

  // --- ajustes
  step: el => {
    const t = el.dataset.t, k = el.dataset.k, [st, lo, hi, f] = STEP[k];
    const o = stepTarget(t);
    o[k] = Math.min(hi, Math.max(lo, (+o[k] || 0) + st * +el.dataset.d));
    const out = document.querySelector(`[data-stepval="${t}.${k}"]`);
    if (out) out.textContent = f(o[k]);
    if (t !== 'form') Store.save();
  },
  setToggle: el => { const k = el.dataset.k; D.settings[k] = !D.settings[k]; Store.save(); el.classList.toggle('on', D.settings[k]); },
  setTheme: el => { D.settings.theme = el.dataset.v; Store.save(); applyTheme(); render(); },
  exportData: () => {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `hierro-copia-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  resetData: () => confirmBox({
    title: '¿Borrar todos los datos?', text: 'Rutinas, ejercicios y todo el historial. Exportá una copia antes si la querés conservar.', ok: 'Borrar todo', danger: true,
    onOk: () => { D = Store.reset(); applyTheme(); tab('home'); toast('Datos borrados'); },
  }),
};

/* ============================== eventos ============================== */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const f = A[el.dataset.a];
  if (f) { e.preventDefault(); f(el, e); }
});

document.addEventListener('input', e => {
  const el = e.target;
  // campos de series del entrenamiento
  if (el.dataset.f) {
    const row = el.closest('.set-row');
    const ei = +row.dataset.ei, si = +row.dataset.si;
    const sets = D.active.exercises[ei].sets;
    const old = sets[si][el.dataset.f];
    let v = el.value;
    if (el.dataset.f === 'weight') {
      v = v.replace(/[^\d.,]/g, '');
      // arrastrar el peso a las series siguientes que tenían el mismo valor
      for (let j = si + 1; j < sets.length; j++) {
        if (!sets[j].done && sets[j].weight === old) {
          sets[j].weight = v;
          const n = document.querySelector(`.set-row[data-ei="${ei}"][data-si="${j}"] [data-f="weight"]`);
          if (n) n.value = v;
        } else break;
      }
    } else v = v.replace(/[^\d]/g, '').slice(0, el.dataset.f === 'rir' ? 2 : 3);
    if (v !== el.value) el.value = v;
    sets[si][el.dataset.f] = v;
    Store.saveSoon();
    return;
  }
  // bindings de formularios
  const b = el.dataset.bind;
  if (b) {
    const [scope, k] = b.split('.');
    if (scope === 'draft') ui.draft[k] = el.value;
    else if (scope === 'form') ui.sheet.form[k] = el.value;
    else if (scope === 'set') { D.active.exercises[ui.sheet.ei].sets[ui.sheet.si][k] = el.value; Store.saveSoon(); }
    else if (scope === 'wkex') { D.active.exercises[ui.sheet.ei][k] = el.value; Store.saveSoon(); }
    return;
  }
  if (el.id === 'pickq') {
    ui.sheet.q = el.value;
    document.getElementById('picklist').innerHTML = pickList(el.value);
    return;
  }
  if (el.id === 'exq') {
    ui.exQuery = el.value;
    document.getElementById('exlist').innerHTML = exListHtml();
  }
});

// Enter en reps = completar serie
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (el.dataset && (el.dataset.f === 'reps' || el.dataset.f === 'rir' || el.dataset.f === 'weight')) {
    e.preventDefault();
    if (el.dataset.f === 'weight') { el.closest('.set-row').querySelector('[data-f="reps"]').focus(); return; }
    A.toggleSet(el.closest('.set-row').querySelector('.chk'));
  }
});

// al enfocar un número, seleccionarlo para reemplazarlo de una
document.addEventListener('focusin', e => {
  if (e.target.classList && e.target.classList.contains('inp')) setTimeout(() => { try { e.target.select(); } catch (_) { } }, 0);
});

document.addEventListener('change', e => {
  if (e.target.id !== 'importFile') return;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    confirmBox({
      title: '¿Importar esta copia?', text: 'Reemplaza todos los datos actuales por los del archivo.', ok: 'Importar', danger: true,
      onOk: () => {
        try { D = Store.importJSON(reader.result); applyTheme(); tab('home'); toast('Copia importada'); }
        catch (err) { toast(err.message || 'Archivo no válido'); }
      },
    });
  };
  reader.readAsText(file);
});

/* ============================== inicio ============================== */

function applyTheme() {
  const t = D.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0d0e10' : '#f3f3ef');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

applyTheme();
history.replaceState({ d: 0 }, '');
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
