# Diseño: Fix Transición Mundo 4→5 y Fin de Juego

**Fecha**: 2026-05-03  
**Proyecto**: proyecto_blender (juego 3D Three.js + Cannon.js)  
**Rama**: develop  

---

## Problema reportado

El jugador no puede pasar del mundo 4 al mundo 5. El juego queda bloqueado en el nivel 4 indefinidamente.

---

## Causa raíz

### Bug 1 — Niveles 4 y 5 no tienen datos de monedas

La lógica de avance de nivel (`World.js` línea 205) se dispara cuando se colecciona cualquier moneda:

```js
if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
    this.levelManager.nextLevel()
```

Sin monedas en el nivel 4, nunca se dispara el avance. Verificado en los archivos de datos:

| Nivel | Monedas |
|-------|---------|
| 1 | 2 (default) |
| 2 | 5+ (default) |
| 3 | 6+ (default) |
| **4** | **0 — BUG** |
| **5** | **0 — BUG** |

### Bug 2 — ToyCarLoader rechaza monedas con nombres no registrados

`ToyCarLoader._processBlocks()` busca el GLB específico por nombre ANTES de verificar si el bloque es una moneda. Si el nombre no existe en `sources.js`, retorna sin crear el premio:

```js
const glb = this.resources.items[resourceKey];
if (!glb) {
    return;  // Retorna aquí — nunca llega al chequeo de coin
}
// ...
if (block.name.startsWith('coin')) { ... }  // Nunca ejecuta
```

Esto impide agregar monedas con nombres nuevos (`coin_lev4_1`, etc.) sin modificar `sources.js`.

### Bug 3 — Spawn fallback hardcodeado incorrecto

En `World.js loadLevel()`, cuando la API no está disponible, el spawn fallback es:

```js
spawnPoint: { x: -17, y: 1.5, z: -67 }
```

Este valor es solo válido para el nivel 1. El nivel 4 tiene su mapa en Z: -12.8 a 8.8, por lo que el robot aparecería 55 unidades fuera del mapa.

---

## Diseño de la solución (Enfoque 1 — Fix mínimo)

### Cambio 1: `ToyCarLoader.js` — Mover chequeo de coin antes del lookup de GLB

**Archivo**: `game-project/src/loaders/ToyCarLoader.js`  
**Líneas afectadas**: ~178–260 (dentro de `_processBlocks`)

Mover el bloque `if (block.name.startsWith('coin'))` al inicio del forEach, antes de buscar el GLB. Así cualquier bloque con nombre que empiece en `coin` usa `coinModel` (modelo genérico, ya cargado) sin necesitar un `.glb` dedicado.

### Cambio 2: Datos de monedas nivel 4

**Archivos**:
- `backend/data/toy_car_blocks4.json` — agregar al final del array
- `game-project/public/data/toy_car_blocks.json` — agregar al final del array

5 monedas distribuidas en el mapa (rango: X: -8.6→9.8, Z: -12.8→8.8):

```json
{ "name": "coin_lev4_1", "x": 5.0,  "y": 2.0, "z": 0.0,  "level": 4, "role": "default" },
{ "name": "coin_lev4_2", "x": -5.0, "y": 2.0, "z": 0.0,  "level": 4, "role": "default" },
{ "name": "coin_lev4_3", "x": 0.0,  "y": 2.0, "z": -8.0, "level": 4, "role": "default" },
{ "name": "coin_lev4_4", "x": 8.0,  "y": 2.0, "z": 6.0,  "level": 4, "role": "default" },
{ "name": "coin_lev4_5", "x": -6.0, "y": 2.0, "z": 6.0,  "level": 4, "role": "default" }
```

### Cambio 3: Datos de monedas nivel 5

**Archivos**:
- `backend/data/toy_car_blocks5.json` — agregar al final del array
- `game-project/public/data/toy_car_blocks.json` — agregar al final del array

6 monedas distribuidas en el mapa más grande (rango: X: -54.9→58.4, Z: -40.3→44.3):

```json
{ "name": "coin_lev5_1", "x": 0.0,   "y": 3.0, "z": 0.0,   "level": 5, "role": "default" },
{ "name": "coin_lev5_2", "x": 25.0,  "y": 3.0, "z": 0.0,   "level": 5, "role": "default" },
{ "name": "coin_lev5_3", "x": -25.0, "y": 3.0, "z": 0.0,   "level": 5, "role": "default" },
{ "name": "coin_lev5_4", "x": 0.0,   "y": 3.0, "z": 25.0,  "level": 5, "role": "default" },
{ "name": "coin_lev5_5", "x": 0.0,   "y": 3.0, "z": -25.0, "level": 5, "role": "default" },
{ "name": "coin_lev5_6", "x": 30.0,  "y": 3.0, "z": 30.0,  "level": 5, "role": "default" }
```

### Cambio 4: `World.js` — Fix spawn fallback

**Archivo**: `game-project/src/Experience/World/World.js`  
**Línea**: ~369

```js
// Antes (incorrecto para niveles 2-5):
spawnPoint: { x: -17, y: 1.5, z: -67 }

// Después (seguro como fallback genérico):
spawnPoint: { x: 5, y: 1.5, z: 5 }
```

---

## Flujo de juego después del fix

```
Nivel 1: coleccionar moneda → avanza a 2
Nivel 2: coleccionar moneda → avanza a 3
Nivel 3: coleccionar moneda → avanza a 4
Nivel 4: coleccionar moneda (NEW) → avanza a 5  ← bug corregido
Nivel 5: coleccionar moneda (NEW) → FIN DEL JUEGO (modal de victoria)
```

El modal de fin de juego ya existe en `GameTracker.showEndGameModal()` y se dispara correctamente por la lógica del else en `World.js` cuando `currentLevel === totalLevels === 5`.

---

## Archivos modificados (resumen)

| Archivo | Tipo | Líneas aprox. |
|---------|------|--------------|
| `game-project/src/loaders/ToyCarLoader.js` | Fix lógica | ~15 |
| `backend/data/toy_car_blocks4.json` | Datos nuevos | 5 entradas |
| `backend/data/toy_car_blocks5.json` | Datos nuevos | 6 entradas |
| `game-project/public/data/toy_car_blocks.json` | Datos nuevos | 11 entradas |
| `game-project/src/Experience/World/World.js` | Fix spawn | 1 línea |

**Total: 5 archivos, ~50 cambios entre código y datos.**

---

## Comportamiento del fin de juego (ya implementado)

Cuando el jugador colecciona una moneda en el nivel 5, el código existente ejecuta:

```js
// World.js líneas 210-221
const elapsed = this.experience.tracker.stop()
this.experience.tracker.saveTime(elapsed)
this.experience.tracker.showEndGameModal(elapsed)  // modal de victoria
this.experience.obstacleWavesDisabled = true
this.winner.play()
```

El modal muestra tiempo del jugador, ranking de mejores tiempos, y botones de reintentar/salir. No requiere cambios.
