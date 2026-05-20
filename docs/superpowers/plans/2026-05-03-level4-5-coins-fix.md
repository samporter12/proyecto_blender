# Level 4→5 Coin Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar monedas a los niveles 4 y 5 para que el jugador pueda progresar hasta el fin del juego.

**Architecture:** Tres cambios independientes: (1) fix lógico en ToyCarLoader para que cualquier bloque `coin_*` use el coinModel genérico sin requerir un GLB propio, (2) insertar entradas de monedas en los tres archivos de datos, (3) corregir el spawn fallback hardcodeado en World.js.

**Tech Stack:** Three.js, Cannon-es, Vite, Node.js/Express, JSON plano como fuente de datos de niveles.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `game-project/src/loaders/ToyCarLoader.js` | Modify | Mover chequeo `coin` antes del lookup de GLB |
| `backend/data/toy_car_blocks4.json` | Modify | Agregar 5 entradas de monedas para nivel 4 |
| `backend/data/toy_car_blocks5.json` | Modify | Agregar 6 entradas de monedas para nivel 5 |
| `game-project/public/data/toy_car_blocks.json` | Modify | Agregar las mismas 11 entradas (fallback local) |
| `game-project/src/Experience/World/World.js` | Modify | Fix spawn fallback de `{x:-17,z:-67}` a `{x:5,z:5}` |

---

## Task 1: Fix ToyCarLoader — mover chequeo de coin antes del GLB lookup

**Files:**
- Modify: `game-project/src/loaders/ToyCarLoader.js:178-260`

El método `_processBlocks` actualmente hace `return` si no encuentra el GLB del bloque antes de llegar al chequeo `if (block.name.startsWith('coin'))`. Esto impide crear premios para monedas con nombres nuevos (`coin_lev4_1`, etc.) que no tienen un `.glb` registrado en `sources.js`.

- [ ] **Step 1: Localizar el método y entender el bloque a mover**

Abrir `game-project/src/loaders/ToyCarLoader.js`. El método `_processBlocks` comienza en línea ~178. La secuencia actual es:

```
1. guard: sin nombre → return
2. guard: es plane → return
3. buscar GLB por nombre → return si no existe   ← PROBLEMA
4. clonar model
5. aplicar texturas / baked
6. if coin → crear Prize, return               ← DEBERÍA IR ANTES DEL 3
7. agregar al scene + física
```

- [ ] **Step 2: Reemplazar el bloque `if (block.name.startsWith('coin'))` con su nueva posición**

En `game-project/src/loaders/ToyCarLoader.js`, localizar la sección que va desde la línea con `const resourceKey = block.name;` hasta el final del bloque `if (block.name.startsWith('coin')) { ... return; }`. Reescribir `_processBlocks` con este orden:

```js
_processBlocks(blocks, precisePhysicsModels) {
    blocks.forEach(block => {
        if (!block.name) {
            console.warn('Bloque sin nombre:', block);
            return;
        }

        // Ignorar los planos de Blender para evitar doble suelo que bloquea saltos
        if (block.name.toLowerCase().includes('plane')) {
            return;
        }

        //  Si es un premio (coin) — usar coinModel directamente, sin requerir GLB propio
        if (block.name.startsWith('coin')) {
            const coinScene = this.resources.items.coinModel?.scene;
            if (!coinScene) {
                console.warn('coinModel no encontrado en resources');
                return;
            }
            const actualModel = coinScene.clone();

            const prize = new Prize({
                model: actualModel,
                position: new THREE.Vector3(block.x, block.y, block.z),
                scene: this.scene,
                role: block.role || "default"
            });

            // 🔵 MARCAR modelo del premio
            prize.model.userData.levelObject = true;

            this.prizes.push(prize);
            return;
        }

        const resourceKey = block.name;
        const glb = this.resources.items[resourceKey];

        if (!glb) {
            console.warn(`Modelo no encontrado: ${resourceKey}`);
            return;
        }

        const model = glb.scene.clone();

        //  MARCAR modelo como perteneciente al nivel
        model.userData.levelObject = true;

        // Eliminar cámaras y luces embebidas
        model.traverse((child) => {
            if (child.isCamera || child.isLight) {
                child.parent.remove(child);
            }
        });

        //  Manejo de carteles: aplicar textura a meshes
        this._applyTextureToMeshes(
            model,
            '/textures/ima1.jpg',
            (child) => child.name === 'Cylinder001' || (child.name && child.name.toLowerCase().includes('cylinder')),
            { rotation: -Math.PI / 2, center: { x: 0.5, y: 0.5 }, mirrorX: true }
        );

        //  Integración especial para modelos baked
        if (block.name.includes('baked')) {
            const bakedTexture = new THREE.TextureLoader().load('/textures/baked.jpg');
            bakedTexture.flipY = false;
            if ('colorSpace' in bakedTexture) {
                bakedTexture.colorSpace = THREE.SRGBColorSpace;
            } else {
                bakedTexture.encoding = THREE.sRGBEncoding;
            }

            model.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshBasicMaterial({ map: bakedTexture });
                    child.material.needsUpdate = true;

                    if (child.name.toLowerCase().includes('portal')) {
                        this.experience.time.on('tick', () => {
                            child.rotation.y += 0.01;
                        });
                    }
                }
            });
        }

        this.scene.add(model);

        // Físicas
        let shape;
        let position = new THREE.Vector3();

        if (precisePhysicsModels.includes(block.name)) {
            shape = createTrimeshShapeFromModel(model);
            if (!shape) {
                console.warn(`No se pudo crear Trimesh para ${block.name}`);
                return;
            }
            position.set(0, 0, 0);
        } else {
            shape = createBoxShapeFromModel(model, 0.9);
            const bbox = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            bbox.getCenter(center);
            bbox.getSize(size);
            center.y -= size.y / 2;
            position.copy(center);
        }

        const body = new CANNON.Body({
            mass: 0,
            shape: shape,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            material: this.physics.obstacleMaterial
        });

        // 🔵 MARCAR cuerpo físico
        body.userData = { levelObject: true };
        model.userData.physicsBody = body;
        body.userData.linkedModel = model;
        this.physics.world.addBody(body);
    });
}
```

- [ ] **Step 3: Verificar que el archivo no tiene errores de sintaxis**

Abrir el archivo y confirmar que el método cierra correctamente con `}` y que no quedaron fragmentos duplicados del bloque `if (block.name.startsWith('coin'))` más abajo en el método.

- [ ] **Step 4: Commit**

```bash
git add game-project/src/loaders/ToyCarLoader.js
git commit -m "fix: move coin check before GLB lookup in ToyCarLoader to allow generic coin names"
```

---

## Task 2: Agregar monedas al nivel 4 en backend

**Files:**
- Modify: `backend/data/toy_car_blocks4.json`

El archivo es un array JSON. Los bloques del nivel 4 cubren X: -8.6 a 9.8, Z: -12.8 a 8.8. Las monedas se colocan a Y=2.0 (flotando sobre el terreno plano, cuyo Y máximo es 0.6).

- [ ] **Step 1: Abrir `backend/data/toy_car_blocks4.json` y agregar las 5 monedas al final del array**

Localizar el cierre del array `]` al final del archivo. Antes del `]` final, agregar una coma al último elemento existente si no la tiene, y luego insertar:

```json
    ,
    {
        "name": "coin_lev4_1",
        "x": 5.0,
        "y": 2.0,
        "z": 0.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_2",
        "x": -5.0,
        "y": 2.0,
        "z": 0.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_3",
        "x": 0.0,
        "y": 2.0,
        "z": -8.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_4",
        "x": 8.0,
        "y": 2.0,
        "z": 6.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_5",
        "x": -6.0,
        "y": 2.0,
        "z": 6.0,
        "level": 4,
        "role": "default"
    }
```

- [ ] **Step 2: Validar que el JSON es válido**

```bash
node -e "JSON.parse(require('fs').readFileSync('backend/data/toy_car_blocks4.json','utf8')); console.log('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/data/toy_car_blocks4.json
git commit -m "data: add 5 coins to level 4"
```

---

## Task 3: Agregar monedas al nivel 5 en backend

**Files:**
- Modify: `backend/data/toy_car_blocks5.json`

El nivel 5 es el más grande: X: -54.9 a 58.4, Z: -40.3 a 44.3, Y: -3.2 a 12.0. Las monedas se colocan a Y=3.0 para estar por encima del terreno en la mayoría de zonas.

- [ ] **Step 1: Abrir `backend/data/toy_car_blocks5.json` y agregar las 6 monedas al final del array**

```json
    ,
    {
        "name": "coin_lev5_1",
        "x": 0.0,
        "y": 3.0,
        "z": 0.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_2",
        "x": 25.0,
        "y": 3.0,
        "z": 0.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_3",
        "x": -25.0,
        "y": 3.0,
        "z": 0.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_4",
        "x": 0.0,
        "y": 3.0,
        "z": 25.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_5",
        "x": 0.0,
        "y": 3.0,
        "z": -25.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_6",
        "x": 30.0,
        "y": 3.0,
        "z": 30.0,
        "level": 5,
        "role": "default"
    }
```

- [ ] **Step 2: Validar JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('backend/data/toy_car_blocks5.json','utf8')); console.log('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/data/toy_car_blocks5.json
git commit -m "data: add 6 coins to level 5"
```

---

## Task 4: Agregar las mismas monedas al fallback local del frontend

**Files:**
- Modify: `game-project/public/data/toy_car_blocks.json`

Este archivo es el fallback que usa el frontend cuando el backend (Docker) no está disponible. Debe tener exactamente las mismas entradas que los archivos de backend. El archivo ya tiene entries para niveles 1, 2 y 3.

- [ ] **Step 1: Abrir `game-project/public/data/toy_car_blocks.json` y agregar las 11 monedas al final del array**

Localizar el `]` de cierre, y antes de él agregar:

```json
    ,
    {
        "name": "coin_lev4_1",
        "x": 5.0,
        "y": 2.0,
        "z": 0.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_2",
        "x": -5.0,
        "y": 2.0,
        "z": 0.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_3",
        "x": 0.0,
        "y": 2.0,
        "z": -8.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_4",
        "x": 8.0,
        "y": 2.0,
        "z": 6.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev4_5",
        "x": -6.0,
        "y": 2.0,
        "z": 6.0,
        "level": 4,
        "role": "default"
    },
    {
        "name": "coin_lev5_1",
        "x": 0.0,
        "y": 3.0,
        "z": 0.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_2",
        "x": 25.0,
        "y": 3.0,
        "z": 0.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_3",
        "x": -25.0,
        "y": 3.0,
        "z": 0.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_4",
        "x": 0.0,
        "y": 3.0,
        "z": 25.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_5",
        "x": 0.0,
        "y": 3.0,
        "z": -25.0,
        "level": 5,
        "role": "default"
    },
    {
        "name": "coin_lev5_6",
        "x": 30.0,
        "y": 3.0,
        "z": 30.0,
        "level": 5,
        "role": "default"
    }
```

- [ ] **Step 2: Validar JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('game-project/public/data/toy_car_blocks.json','utf8')); console.log('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Verificar que hay entradas nivel 4 y 5**

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('game-project/public/data/toy_car_blocks.json','utf8'));
const l4 = d.filter(b => b.level === 4 && b.name.startsWith('coin'));
const l5 = d.filter(b => b.level === 5 && b.name.startsWith('coin'));
console.log('Level 4 coins:', l4.length, '(esperado: 5)');
console.log('Level 5 coins:', l5.length, '(esperado: 6)');
"
```

Resultado esperado:
```
Level 4 coins: 5 (esperado: 5)
Level 5 coins: 6 (esperado: 6)
```

- [ ] **Step 4: Commit**

```bash
git add game-project/public/data/toy_car_blocks.json
git commit -m "data: add level 4 and 5 coins to public fallback data"
```

---

## Task 5: Fix spawn fallback en World.js

**Files:**
- Modify: `game-project/src/Experience/World/World.js:363-371`

El spawn fallback `{x: -17, y: 1.5, z: -67}` es válido solo para nivel 1. Para niveles 2-5, este valor pone al robot fuera del mapa. Se cambia a `{x: 5, y: 1.5, z: 5}`, que es el mismo default que usa la ruta API cuando no hay `spawnPoint` en la respuesta.

- [ ] **Step 1: Localizar y cambiar el spawn fallback en `World.js`**

Buscar en `game-project/src/Experience/World/World.js` el siguiente bloque (dentro de la función `loadLevel`):

```js
                data = {
                    blocks: filteredBlocks,
                    spawnPoint: { x: -17, y: 1.5, z: -67 } // valor por defecto si no viene en JSON
                };
```

Reemplazarlo con:

```js
                data = {
                    blocks: filteredBlocks,
                    spawnPoint: { x: 5, y: 1.5, z: 5 }
                };
```

- [ ] **Step 2: Verificar que no hay otras referencias al spawn hardcodeado incorrecto**

```bash
grep -n "\-67" game-project/src/Experience/World/World.js
```

Resultado esperado: sin output (ninguna línea debe contener `-67`).

- [ ] **Step 3: Commit**

```bash
git add game-project/src/Experience/World/World.js
git commit -m "fix: use safe generic spawn fallback for all levels in loadLevel"
```

---

## Task 6: Verificación manual end-to-end

No hay suite de tests automatizados en este proyecto. La verificación es manual en el navegador.

- [ ] **Step 1: Levantar el servidor de desarrollo**

```bash
cd game-project && npm run dev
```

Abrir `http://localhost:5173` (o el puerto que muestre Vite).

- [ ] **Step 2: Verificar nivel 4**

1. Iniciar juego → llegar a nivel 4 (recoger monedas de niveles 1, 2 y 3)
2. En nivel 4 debe aparecer el HUD mostrando `🎖️ Nivel: 4`
3. Deben ser visibles monedas girando en el mapa
4. Recoger una moneda → HUD cambia a `🎖️ Nivel: 5` → nivel 5 carga

En consola del navegador deben verse mensajes como:
```
📦 Datos del nivel 5 cargados desde API
✅ Nivel 5 cargado con spawn en { x: 5, y: 1.5, z: 5 }
```

- [ ] **Step 3: Verificar nivel 5 y fin de juego**

1. En nivel 5 deben ser visibles monedas
2. Recoger una moneda → debe aparecer el modal de victoria con tiempo y ranking
3. El botón "🔁 Reintentar" debe reiniciar el juego

- [ ] **Step 4: Verificar fallback local (sin backend)**

Detener el backend (o asegurarse de que Docker no esté corriendo). Recargar el juego y navegar hasta nivel 4.

En consola debe verse:
```
⚠️ No se pudo conectar con el backend. Usando datos locales para nivel 4...
🎯 Total de monedas default para el nivel 4: 5
✅ Nivel 4 cargado con spawn en { x: 5, y: 1.5, z: 5 }
```

- [ ] **Step 5: Commit final si todo funciona**

```bash
git add -A
git status  # Confirmar que no hay archivos sin stagear
git commit -m "fix: complete level 4-5 progression and end-game flow" --allow-empty
```
