# Hierro — registro de fuerza e hipertrofia

App web instalable (PWA) para registrar entrenamientos y analizar el progreso.
Funciona sin conexión y guarda todo en el dispositivo. Sin dependencias ni build.

## Probar en la PC
```
python -m http.server 5178
```
y abrir http://localhost:5178

## Instalar en el celular
Tiene que servirse por **HTTPS** (requisito del modo sin conexión). Cualquier hosting estático gratis sirve:
GitHub Pages, Netlify, Cloudflare Pages. Se sube la carpeta tal cual.
Después, en el celular: abrir la URL → menú del navegador → **Agregar a pantalla de inicio**.

## Estructura
- `js/stats.js` — motor de análisis: métricas por sesión, e1RM (Epley, ≤12 reps), PRs (ignora series dudosas), comparación multidimensional, tendencias.
- `js/app.js` — vistas (inicio, editor de rutinas, entrenamiento, resumen, historial, ejercicios/análisis, ajustes) y temporizador.
- `js/charts.js` — gráficos SVG propios (sin librerías, offline).
- `js/store.js` — persistencia en localStorage + exportar/importar copia JSON.
- `sw.js` — service worker (red primero, caché como respaldo). Subir `CACHE` al publicar cambios.

## Datos
Viven solo en el navegador del dispositivo. Usar **Ajustes → Exportar copia de seguridad** periódicamente.
