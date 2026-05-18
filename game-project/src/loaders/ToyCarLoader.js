import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { createBoxShapeFromModel, createTrimeshShapeFromModel } from '../Experience/Utils/PhysicsShapeFactory.js';
import Prize from '../Experience/World/Prize.js';

export default class ToyCarLoader {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;
        this.physics = this.experience.physics;
        this.prizes = [];
        this.portalModels = [];
    }

    _applyTextureToMeshes(root, imagePath, matcher, options = {}) {
        // Pre-chequeo: buscar meshes objetivo antes de cargar la textura
        const matchedMeshes = [];
        root.traverse((child) => {
            if (child.isMesh && (!matcher || matcher(child))) {
                matchedMeshes.push(child);
            }
        });

        if (matchedMeshes.length === 0) {
            return;
        }

        // 🛡️ Caché de texturas para evitar duplicar 6GB de RAM
        if (!this.textureCache) this.textureCache = {};
        const cacheKey = `${imagePath}_${JSON.stringify(options)}`;
        
        if (this.textureCache[cacheKey]) {
            const texture = this.textureCache[cacheKey];
            let applied = 0;
            matchedMeshes.forEach((child) => {
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat) => {
                        mat.map = texture;
                        mat.needsUpdate = true;
                    });
                } else if (child.material) {
                    child.material.map = texture;
                    child.material.needsUpdate = true;
                } else {
                    child.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
                }
                applied++;
            });
            return;
        }

        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            imagePath,
            (texture) => {
                this.textureCache[cacheKey] = texture; // Guardar en caché
                if ('colorSpace' in texture) {
                    texture.colorSpace = THREE.SRGBColorSpace;
                } else {
                    texture.encoding = THREE.sRGBEncoding;
                }
                texture.flipY = false;
                const wrapS = options.wrapS || THREE.ClampToEdgeWrapping;
                const wrapT = options.wrapT || THREE.ClampToEdgeWrapping;
                texture.wrapS = wrapS;
                texture.wrapT = wrapT;
                const maxAniso = this.experience?.renderer?.instance?.capabilities?.getMaxAnisotropy?.();
                if (typeof maxAniso === 'number' && maxAniso > 0) {
                    texture.anisotropy = maxAniso;
                }
                const center = options.center || { x: 0.5, y: 0.5 };
                texture.center.set(center.x, center.y);
                if (typeof options.rotation === 'number') {
                    texture.rotation = options.rotation;
                }
                if (options.repeat) {
                    texture.repeat.set(options.repeat.x || 1, options.repeat.y || 1);
                }
                // Espejado opcional
                if (options.mirrorX) {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.repeat.x = -Math.abs(texture.repeat.x || 1);
                    texture.offset.x = 1;
                }
                if (options.mirrorY) {
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.y = -Math.abs(texture.repeat.y || 1);
                    texture.offset.y = 1;
                }
                if (options.offset) {
                    texture.offset.set(
                        options.offset.x ?? texture.offset.x,
                        options.offset.y ?? texture.offset.y
                    );
                }
                texture.needsUpdate = true;

                let applied = 0;
                matchedMeshes.forEach((child) => {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((mat) => {
                            mat.map = texture;
                            mat.needsUpdate = true;
                        });
                    } else if (child.material) {
                        child.material.map = texture;
                        child.material.needsUpdate = true;
                    } else {
                        child.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
                    }
                    applied++;
                });

                if (applied === 0) {
                    // console.debug(`Sin meshes para aplicar textura: ${imagePath}`);
                } else {
                    console.log(`🖼️ Textura aplicada (${imagePath}) a ${applied} mesh(es)`);
                }
            },
            undefined,
            (err) => {
                console.error('❌ Error cargando textura', imagePath, err);
            }
        );
    }

    async loadFromAPI() {
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();

            let blocks = [];

            try {
                const apiUrl = import.meta.env.VITE_API_URL + '/api/blocks';
                const res = await fetch(apiUrl);

                if (!res.ok) throw new Error('Conexión fallida');

                blocks = await res.json();
                if (blocks.length === 0) throw new Error('Cero bloques en DB, forzando carga local');
                console.log('Datos cargados desde la API:', blocks.length);
                //console.log('🧩 Lista de bloques:', blocks.map(b => b.name))
            } catch (apiError) {
                console.warn('No se pudo conectar con la API. Cargando desde archivo local...');
                const localRes = await fetch('/data/toy_car_blocks.json');
                const allBlocks = await localRes.json();

                // 🔍 Filtrar solo nivel 1
                blocks = allBlocks.filter(b => b.level === 1);
                console.log(`Datos cargados desde archivo local (nivel 1): ${blocks.length}`);

            }

            await this._processBlocks(blocks, precisePhysicsModels);
        } catch (err) {
            console.error('Error al cargar bloques o lista Trimesh:', err);
        }
    }

    async loadFromURL(apiUrl) {
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();

            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error('Conexión fallida al cargar bloques de nivel.');

            const blocks = await res.json();
            console.log(`📦 Bloques cargados (${blocks.length}) desde ${apiUrl}`);

            await this._processBlocks(blocks, precisePhysicsModels);
        } catch (err) {
            console.error('Error al cargar bloques desde URL:', err);
        }
    }

    async _loadMissingModels(names) {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const total = names.length;
        let done = 0;

        await Promise.all(names.map(name => new Promise((resolve) => {
            loader.load(
                `/models/toycar/${name}.glb`,
                (gltf) => {
                    this.resources.items[name] = gltf;
                    done++;
                    window.dispatchEvent(new CustomEvent('level-loading-progress', {
                        detail: Math.floor((done / total) * 100)
                    }));
                    resolve();
                },
                undefined,
                () => {
                    done++;
                    resolve();
                }
            );
        })));
    }

    async _processBlocks(blocks, precisePhysicsModels) {
        const missingModels = new Set();
        blocks.forEach(block => {
            if (block.name && !block.name.startsWith('coin') && !block.name.toLowerCase().includes('plane')) {
                if (!this.resources.items[block.name]) {
                    missingModels.add(block.name);
                }
            }
        });

        if (missingModels.size > 0) {
            console.log(`📦 Cargando ${missingModels.size} modelos bajo demanda para este nivel...`);
            await this._loadMissingModels([...missingModels]);
        }

        const CHUNK_SIZE = 50;
        for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
            const chunk = blocks.slice(i, i + CHUNK_SIZE);
            this._processChunk(chunk, precisePhysicsModels);

            if (i + CHUNK_SIZE < blocks.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    }

    _processChunk(blocks, precisePhysicsModels) {
        blocks.forEach(block => {
            if (!block.name) {
                return;
            }

            if (block.name.toLowerCase().includes('plane')) {
                return;
            }

            if (block.name.startsWith('coin')) {
                const coinScene = this.resources.items.coinModel?.scene;
                if (!coinScene) {
                    return;
                }
                const actualModel = coinScene.clone();

                const prize = new Prize({
                    model: actualModel,
                    position: new THREE.Vector3(block.x, block.y, block.z),
                    scene: this.scene,
                    role: block.role || "default"
                });

                prize.model.userData.levelObject = true;
                this.prizes.push(prize);
                return;
            }

            const resourceKey = block.name;
            const glb = this.resources.items[resourceKey];

            if (!glb) {
                return;
            }

            const model = glb.scene.clone();
            model.userData.levelObject = true;

            model.traverse((child) => {
                if (child.isCamera || child.isLight) {
                    child.parent.remove(child);
                }
            });

            this._applyTextureToMeshes(
                model,
                '/textures/ima1.jpg',
                (child) => child.name === 'Cylinder001' || (child.name && child.name.toLowerCase().includes('cylinder')),
                { rotation: -Math.PI / 2, center: { x: 0.5, y: 0.5 }, mirrorX: true }
            );

            if (block.name.includes('baked')) {
                if (!this._bakedTexture) {
                    this._bakedTexture = new THREE.TextureLoader().load('/textures/baked.jpg');
                    this._bakedTexture.flipY = false;
                    if ('colorSpace' in this._bakedTexture) {
                        this._bakedTexture.colorSpace = THREE.SRGBColorSpace;
                    } else {
                        this._bakedTexture.encoding = THREE.sRGBEncoding;
                    }
                }
                const bakedTexture = this._bakedTexture;

                model.traverse(child => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshBasicMaterial({ map: bakedTexture });
                        child.material.needsUpdate = true;

                        if (child.name.toLowerCase().includes('portal')) {
                            this.portalModels.push(child);
                        }
                    }
                });
            }

            this.scene.add(model);

            let shape;
            let position = new THREE.Vector3();

            if (precisePhysicsModels.includes(block.name)) {
                shape = createTrimeshShapeFromModel(model);
                if (!shape) {
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

            body.userData = { levelObject: true };
            model.userData.physicsBody = body;
            body.userData.linkedModel = model;
            this.physics.world.addBody(body);

            if (this.experience.world && this.experience.world.levelPhysicsObjects) {
                this.experience.world.levelPhysicsObjects.push(model);
            }
        });
    }

}
