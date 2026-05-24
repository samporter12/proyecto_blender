import * as THREE from 'three'
import Environment from './Environment.js'
import Fox from './Fox.js'
import Robot from './Robot.js'
import ToyCarLoader from '../../loaders/ToyCarLoader.js'
import Floor from './Floor.js'
import ThirdPersonCamera from './ThirdPersonCamera.js'
import Sound from './Sound.js'
import AmbientSound from './AmbientSound.js'
import MobileControls from '../../controls/MobileControls.js'
import LevelManager from './LevelManager.js';
import BlockPrefab from './BlockPrefab.js'
import FinalPrizeParticles from '../Utils/FinalPrizeParticles.js'
import Enemy from './Enemy.js'


export default class World {
    constructor(experience) {
        this.experience = experience
        this.scene = this.experience.scene
        this.blockPrefab = new BlockPrefab(this.experience)
        this.resources = this.experience.resources
        this.levelManager = new LevelManager(this.experience);
        this.finalPrizeActivated = false
        this.defeatTriggered = false
        this.winTriggered = false
        this.gameStarted = false
        this.enemies = []
        this.distanceCheckFrame = 0

        this.coinSound = new Sound('/sounds/coin.ogg')
        this.ambientSound = new AmbientSound('/sounds/ambiente.mp3')
        this.winner = new Sound('/sounds/winner.mp3')
        this.portalSound = new Sound('/sounds/portal.mp3')
        this.loseSound = new Sound('/sounds/lose.ogg')


        this.allowPrizePickup = false
        this.hasMoved = false
        this.levelPhysicsObjects = []

        setTimeout(() => {
            this.allowPrizePickup = true
        }, 2000)

        this.resources.on('ready', async () => {
            this.floor = new Floor(this.experience)
            this.environment = new Environment(this.experience)

            this.loader = new ToyCarLoader(this.experience)
            await this.loader.loadFromAPI()

            this.fox = new Fox(this.experience)
            this.robot = new Robot(this.experience)

            this.enemyTemplate = this.resources.items.zombieModel.scene
            this.enemyAnimations = this.resources.items.zombieModel.animations
            this.spawnEnemies(3)

            this.experience.vr.bindCharacter(this.robot)
            this.thirdPersonCamera = new ThirdPersonCamera(this.experience, this.robot.group)

            this.mobileControls = new MobileControls({
                onUp: (pressed) => { this.experience.keyboard.keys.up = pressed },
                onDown: (pressed) => { this.experience.keyboard.keys.down = pressed },
                onLeft: (pressed) => { this.experience.keyboard.keys.left = pressed },
                onRight: (pressed) => { this.experience.keyboard.keys.right = pressed }
            })

            if (!this.experience.physics || !this.experience.physics.world) {
                console.error("🚫 Sistema de físicas no está inicializado al cargar el mundo.");
                return;
            }

            // Si se está en modo VR, ocultar el robot
            this._checkVRMode()

            this.experience.renderer.instance.xr.addEventListener('sessionstart', () => {
                this._checkVRMode()
            })


        })
    }

    // Crear varios enemigos en posiciones alejadas del jugador para evitar atascos iniciales
    spawnEnemies(count = 3) {
        if (this.enemies?.length) {
            this.enemies.forEach(e => e?.destroy?.())
            this.enemies = []
        }
        if (this._enemySpawnTimer) {
            clearTimeout(this._enemySpawnTimer)
            this._enemySpawnTimer = null
        }

        const level = this.levelManager?.currentLevel || 1
        const firstDelay = Math.max(2000, 5000 - (level - 1) * 750)
        const betweenDelay = Math.max(3000, 8000 - (level - 1) * 1250)

        const spawnOne = (i) => {
            if (i >= count) return
            const playerPos = this.robot?.body?.position
            if (!playerPos) return

            const angle = Math.random() * Math.PI * 2
            const radius = 5 + Math.random() * 5
            const x = playerPos.x + Math.cos(angle) * radius
            const z = playerPos.z + Math.sin(angle) * radius

            const enemy = new Enemy({
                scene: this.scene,
                physicsWorld: this.experience.physics.world,
                playerRef: this.robot,
                model: this.enemyTemplate,
                animations: this.enemyAnimations,
                position: new THREE.Vector3(x, 1.5, z),
                experience: this.experience
            })
            enemy.delayActivation = 2.0
            this.enemies.push(enemy)

            this._enemySpawnTimer = setTimeout(() => spawnOne(i + 1), betweenDelay)
        }

        this._enemySpawnTimer = setTimeout(() => spawnOne(0), firstDelay)
    }

    toggleAudio() {
        this.ambientSound.toggle()
    }

    update(delta) {
        this.fox?.update()
        this.robot?.update()
        this.blockPrefab?.update()

        // 🧟‍♂️ Solo actualizar enemigos si el juego ya comenzó
        if (this.gameStarted) {
            this.enemies?.forEach(e => e.update(delta))

            // 💀 Verificar si algún enemigo atrapó al jugador
            if (this.robot?.isDead && !this.defeatTriggered) {
                this.defeatTriggered = true  // Previene múltiples disparos

                if (window.userInteracted && this.loseSound) {
                    this.loseSound.play()
                }

                const firstEnemy = this.enemies?.[0]
                const enemyMesh = firstEnemy?.model || firstEnemy?.group
                if (enemyMesh) {
                    enemyMesh.scale.set(1.3, 1.3, 1.3)
                    setTimeout(() => {
                        enemyMesh.scale.set(1, 1, 1)
                    }, 500)
                }

                this.experience.modal.show({
                    icon: '💀',
                    message: '¡El enemigo te atrapó!\n¿Quieres intentarlo otra vez?',
                    buttons: [
                        {
                            text: '🔁 Reintentar',
                            onClick: () => this.experience.resetGameToFirstLevel()
                        },
                        {
                            text: '❌ Salir',
                            onClick: () => {
                                localStorage.removeItem('token')
                                localStorage.removeItem('isGuest')
                                localStorage.removeItem('username')
                                window.location.reload()
                            }
                        }
                    ]
                })

                return
            }
        }

        if (this.thirdPersonCamera && this.experience.isThirdPerson && !this.experience.renderer.instance.xr.isPresenting) {
            this.thirdPersonCamera.update()
        }

        this.loader?.prizes?.forEach(p => p.update(delta))
        this.loader?.portalModels?.forEach(m => m.rotation.y += delta * 0.6)

        if (!this.allowPrizePickup || !this.loader || !this.robot || !this.robot.body) return


        let pos = null

        if (this.experience.renderer.instance.xr.isPresenting) {
            pos = this.experience.camera.instance.position
        } else if (this.robot?.body?.position) {
            pos = this.robot.body.position
        } else {
            return // No hay posición válida, salimos del update
        }


        const speedSq = this.robot?.body?.velocity?.lengthSquared?.() || 0
        const moved = speedSq > 0.25

        this.loader.prizes.forEach((prize) => {
            if (!prize.pivot) return

            const distSq = prize.pivot.position.distanceToSquared(pos)
            if (distSq < 1.44 && moved && !prize.collected) {
                prize.collect()
                prize.collected = true
                this.robot.points++

                if (window.userInteracted) this.coinSound.play()

                const required = this.levelManager.getCurrentLevelTargetPoints()
                this.experience.menu.setStatus?.(`🪙 ${this.robot.points}/${required}`)

                if (!this.winTriggered && this.robot.points >= required) {
                    if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
                        this.levelManager.nextLevel()
                        this.points = 0
                        this.robot.points = 0
                    } else {
                        this.winTriggered = true
                        this.gameStarted = false
                        this.enemies?.forEach(e => { try { e.body?.velocity?.setZero?.() } catch(_){} })
                        console.log('🏁 Nivel 5 completado — mostrando fin de juego')
                        const elapsed = this.experience.tracker?.stop?.() ?? 0
                        this.experience.tracker?.saveTime?.(elapsed)
                        this.experience.tracker?.showEndGameModal?.(elapsed)

                        this.experience.obstacleWavesDisabled = true
                        clearTimeout(this.experience.obstacleWaveTimeout)
                        this.experience.raycaster?.removeAllObstacles?.()

                        if (window.userInteracted) this.winner.play()
                    }
                }
            }
        })

        // ✅ Verificar si todas las monedas se han recogido y aún no se activó el finalPrize
        // ✅ Activar finalPrize si todas las monedas default fueron recolectadas (desde VR o PC)
        if (!this.finalPrizeActivated && this.loader?.prizes) {
            const totalDefault = this.loader.prizes.filter(p => p.role === 'default').length
            const collectedDefault = this.loader.prizes.filter(p => p.role === 'default' && p.collected).length

            if (totalDefault > 0 && collectedDefault === totalDefault) {
                const finalCoin = this.loader.prizes.find(p => p.role === "finalPrize")
                if (finalCoin && !finalCoin.collected && finalCoin.pivot) {
                    finalCoin.pivot.visible = true
                    if (finalCoin.model) finalCoin.model.visible = true
                    this.finalPrizeActivated = true

                    new FinalPrizeParticles({
                        scene: this.scene,
                        targetPosition: finalCoin.pivot.position,
                        sourcePosition: this.experience.vrDolly?.position ?? this.experience.camera.instance.position,
                        experience: this.experience
                    })

                    // Faro visual
                    this.discoRaysGroup = new THREE.Group()
                    this.scene.add(this.discoRaysGroup)

                    const rayMaterial = new THREE.MeshBasicMaterial({
                        color: 0xaa00ff,
                        transparent: true,
                        opacity: 0.25,
                        side: THREE.DoubleSide
                    })

                    const rayCount = 4
                    for (let i = 0; i < rayCount; i++) {
                        const cone = new THREE.ConeGeometry(0.2, 4, 6, 1, true)
                        const ray = new THREE.Mesh(cone, rayMaterial)

                        ray.position.set(0, 2, 0)
                        ray.rotation.x = Math.PI / 2
                        ray.rotation.z = (i * Math.PI * 2) / rayCount

                        const spot = new THREE.SpotLight(0xaa00ff, 2, 12, Math.PI / 7, 0.2, 0.5)
                        spot.castShadow = false
                        spot.shadow.mapSize.set(1, 1)
                        spot.position.copy(ray.position)
                        spot.target.position.set(
                            Math.cos(ray.rotation.z) * 10,
                            2,
                            Math.sin(ray.rotation.z) * 10
                        )

                        ray.userData.spot = spot
                        this.discoRaysGroup.add(ray)
                        this.discoRaysGroup.add(spot)
                        this.discoRaysGroup.add(spot.target)
                    }

                    this.discoRaysGroup.position.copy(finalCoin.pivot.position)

                    if (window.userInteracted) {
                        this.portalSound.play()
                    }

                    console.log("🪙 FinalPrize activado automáticamente desde VR.")
                }
            }
        }


        // Faro rotación
        if (this.discoRaysGroup) {
            this.discoRaysGroup.rotation.y += delta * 0.5
        }

        // Optimización física por distancia (cada 10 frames)
        this.distanceCheckFrame++
        if (this.distanceCheckFrame % 10 === 0) {
            const playerPos = this.experience.renderer.instance.xr.isPresenting
                ? this.experience.camera.instance.position
                : this.robot?.body?.position

            if (playerPos && this.levelPhysicsObjects) {
                for (const obj of this.levelPhysicsObjects) {
                    if (obj.visible) {
                        const distSq = obj.position.distanceToSquared(playerPos)
                        const shouldEnable = distSq < 1600

                        const body = obj.userData.physicsBody
                        if (shouldEnable && !body.enabled) {
                            body.enabled = true
                        } else if (!shouldEnable && body.enabled) {
                            body.enabled = false
                        }
                    }
                }
            }
        }
    }


    async loadLevel(level) {
        window.dispatchEvent(new CustomEvent('level-loading-start', { detail: level }));
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const apiUrl = `${backendUrl}/api/blocks?level=${level}`;

            let data;
            try {
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('Error desde API');
                // Asegurar que la respuesta sea JSON
                const ct = res.headers.get('content-type') || '';
                if (!ct.includes('application/json')) {
                    const preview = (await res.text()).slice(0, 120);
                    throw new Error(`Respuesta no-JSON desde API (${apiUrl}): ${preview}`);
                }
                data = await res.json();
                if (Array.isArray(data) && data.length === 0) {
                    throw new Error('0 bloques en la API, forzando local');
                }
                console.log(`📦 Datos del nivel ${level} cargados desde API`);
            } catch (error) {
                console.warn(`⚠️ No se pudo conectar con el backend. Usando datos locales para nivel ${level}...`);
                const publicPath = (p) => {
                    const base = import.meta.env.BASE_URL || '/';
                    return `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
                };

                let localUrl = publicPath(`models/toycar/toy_car_blocks${level}.json`);
                let localRes = await fetch(localUrl);
                
                if (!localRes.ok) {
                    localUrl = publicPath('data/toy_car_blocks.json');
                    localRes = await fetch(localUrl);
                }

                if (!localRes.ok) {
                    const preview = (await localRes.text()).slice(0, 120);
                    throw new Error(`No se pudo cargar ${localUrl} (HTTP ${localRes.status}). Vista previa: ${preview}`);
                }
                const localCt = localRes.headers.get('content-type') || '';
                if (!localCt.includes('application/json')) {
                    const preview = (await localRes.text()).slice(0, 120);
                    throw new Error(`Contenido no JSON en ${localUrl}. Vista previa: ${preview}`);
                }
                const allBlocks = await localRes.json();

                // if we loaded the specific level file, we just use it directly, 
                // but if we loaded the combined one, we filter by level.
                const filteredBlocks = localUrl.includes(`toy_car_blocks${level}.json`) ? allBlocks : allBlocks.filter(b => b.level === level);

                data = {
                    blocks: filteredBlocks,
                };
            }

            const spawnPoint = this.levelManager.spawnPoints?.[level] || { x: 0, y: 1.5, z: 0 };
            this.points = 0;
            this.robot.points = 0;
            this.finalPrizeActivated = false;
            this.defeatTriggered = false;
            this.winTriggered = false;
            this.allowPrizePickup = false;
            setTimeout(() => { this.allowPrizePickup = true; }, 2000);
            this.experience.menu.setStatus?.(`🎖️ Puntos: ${this.points}`);

            if (data.blocks) {
                const publicPath = (p) => {
                    const base = import.meta.env.BASE_URL || '/';
                    return `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
                };
                const preciseUrl = publicPath('config/precisePhysicsModels.json');
                const preciseRes = await fetch(preciseUrl);
                if (!preciseRes.ok) {
                    const preview = (await preciseRes.text()).slice(0, 120);
                    throw new Error(`No se pudo cargar ${preciseUrl} (HTTP ${preciseRes.status}). Vista previa: ${preview}`);
                }
                const preciseCt = preciseRes.headers.get('content-type') || '';
                if (!preciseCt.includes('application/json')) {
                    const preview = (await preciseRes.text()).slice(0, 120);
                    throw new Error(`Contenido no JSON en ${preciseUrl}. Vista previa: ${preview}`);
                }
                const preciseModels = await preciseRes.json();
                await this.loader._processBlocks(data.blocks, preciseModels);
            } else {
                await this.loader.loadFromURL(apiUrl);
            }


            this.loader.prizes.forEach(p => {
                if (p.model) p.model.visible = (p.role !== 'finalPrize');
                p.collected = false;
            });

            this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length;
            console.log(`🎯 Total de monedas default para el nivel ${level}: ${this.totalDefaultCoins}`);

            this.resetRobotPosition(spawnPoint);

            this.spawnEnemies(3);

            console.log(`✅ Nivel ${level} cargado con spawn en`, spawnPoint);
        } catch (error) {
            console.error('❌ Error cargando nivel:', error);
        } finally {
            window.dispatchEvent(new CustomEvent('level-loading-end'));
        }
    }

    clearCurrentScene() {
        if (!this.experience || !this.scene || !this.experience.physics || !this.experience.physics.world) {
            console.warn('⚠️ No se puede limpiar: sistema de físicas no disponible.');
            return;
        }

        // Liberar modelos GLB del nivel anterior de resources.items para recuperar RAM
        if (this.loader) {
            this.loader.disposeLevelModels();
        }

        let visualObjectsRemoved = 0;
        let physicsBodiesRemoved = 0;

        const childrenToRemove = [];

        this.scene.children.forEach((child) => {
            if (child.userData && child.userData.levelObject) {
                childrenToRemove.push(child);
            }
        });

        this.levelPhysicsObjects = [];

        childrenToRemove.forEach((child) => {
            // 🛡️ Liberación profunda de memoria
            child.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => {
                            if (mat.map) mat.map.dispose();
                            mat.dispose();
                        });
                    } else {
                        if (obj.material.map) obj.material.map.dispose();
                        obj.material.dispose();
                    }
                }
            });

            this.scene.remove(child);

            if (child.userData.physicsBody) {
                this.experience.physics.world.removeBody(child.userData.physicsBody);
            }

            visualObjectsRemoved++;
        });

        const bodiesToRemove = this.experience.physics.world.bodies.filter(
            body => body.userData && body.userData.levelObject
        );
        bodiesToRemove.forEach(body => {
            this.experience.physics.world.removeBody(body);
            physicsBodiesRemoved++;
        });

        console.log(`🧹 Escena limpiada: ${visualObjectsRemoved} objetos 3D, ${physicsBodiesRemoved} cuerpos físicos eliminados. Restantes en world: ${this.experience.physics.world.bodies.length}`);

        if (this._enemySpawnTimer) {
            clearTimeout(this._enemySpawnTimer)
            this._enemySpawnTimer = null
        }

        if (this.enemies?.length) {
            this.enemies.forEach(e => e?.destroy?.());
            this.enemies = [];
            console.log('🎯 Enemigos del nivel anterior eliminados correctamente.');
        }

        if (this.loader && this.loader.prizes.length > 0) {
            this.loader.prizes.forEach(prize => {
                if (prize.pivot) {
                    this.scene.remove(prize.pivot);
                }
                if (prize.model) {
                    if (prize.model.geometry) prize.model.geometry.dispose();
                    if (prize.model.material) {
                        if (Array.isArray(prize.model.material)) {
                            prize.model.material.forEach(mat => mat.dispose());
                        } else {
                            prize.model.material.dispose();
                        }
                    }
                }
            });
            this.loader.prizes = [];
            console.log('🎯 Premios del nivel anterior eliminados correctamente.');
        }

        if (this.loader) {
            this.loader.portalModels = [];
        }

        this.finalPrizeActivated = false
        this.loader?.prizes?.forEach(p => {
            if (p.role === "finalPrize" && p.pivot) {
                p.pivot.visible = false;
                if (p.model) p.model.visible = false;
                p.collected = false;
            }
        })


        /** Esto es de faro para limpienza */
        if (this.discoRaysGroup) {
            this.discoRaysGroup.children.forEach(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            this.scene.remove(this.discoRaysGroup);
            this.discoRaysGroup = null;
        }

        /** Fin faro para limpianza */

    }

    resetRobotPosition(spawn = { x: 5, y: 1.5, z: 5 }) {
        if (!this.robot) return
        this.robot.respawn(new THREE.Vector3(spawn.x, spawn.y, spawn.z))
    }

    async _processLocalBlocks(blocks) {
        const preciseRes = await fetch('/config/precisePhysicsModels.json');
        const preciseModels = await preciseRes.json();
        await this.loader._processBlocks(blocks, preciseModels);

        this.loader.prizes.forEach(p => {
            if (p.model) p.model.visible = (p.role !== 'finalPrize');
            p.collected = false;
        });

        this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length;
        console.log(`🎯 Total de monedas default para el nivel local: ${this.totalDefaultCoins}`);
    }

    _checkVRMode() {
        const isVR = this.experience.renderer.instance.xr.isPresenting

        if (isVR) {
            if (this.robot?.group) {
                this.robot.group.visible = false
            }

            // 🔁 Delay de 3s para que no ataque de inmediato en VR
            if (this.enemy) {
                this.enemy.delayActivation = 10.0
            }

            // 🧠 Posicionar cámara correctamente
            this.experience.camera.instance.position.set(5, 1.6, 5)
            this.experience.camera.instance.lookAt(new THREE.Vector3(5, 1.6, 4))
        } else {
            if (this.robot?.group) {
                this.robot.group.visible = true
            }
        }
    }


}