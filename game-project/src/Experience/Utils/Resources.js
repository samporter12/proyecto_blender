import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import EventEmitter from './EventEmitter.js'

export default class Resources extends EventEmitter {
    constructor(sources) {
        super()

        this.sources = sources
        this.items = {}
        this.toLoad = this.sources.length
        this.loaded = 0

        this.setLoaders()
        this.startLoading()
    }

    setLoaders() {
        this.loaders = {}
        this.loaders.gltfLoader = new GLTFLoader()
        this.loaders.textureLoader = new THREE.TextureLoader()
        this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader()
    }

    startLoading() {
        const concurrency = 10;
        let currentIndex = 0;

        const loadNext = () => {
            if (currentIndex >= this.sources.length) return;
            
            const source = this.sources[currentIndex++];

            const onLoad = (file) => {
                this.sourceLoaded(source, file);
                loadNext(); // load next item when this one finishes
            };

            if (source.type === 'gltfModel') {
                this.loaders.gltfLoader.load(
                    source.path,
                    onLoad,
                    undefined,
                    (error) => {
                        console.error(`❌ Error al cargar modelo ${source.name} desde ${source.path}`);
                        console.error(error);
                        loadNext(); // continue even if error
                    }
                );
            } else if (source.type === 'texture') {
                this.loaders.textureLoader.load(
                    source.path,
                    onLoad,
                    undefined,
                    (error) => {
                        console.error(`❌ Error al cargar textura ${source.name} desde ${source.path}`);
                        console.error(error);
                        loadNext();
                    }
                );
            } else if (source.type === 'cubeTexture') {
                this.loaders.cubeTextureLoader.load(
                    source.path,
                    onLoad,
                    undefined,
                    (error) => {
                        console.error(`❌ Error al cargar cubemap ${source.name} desde ${source.path}`);
                        console.error(error);
                        loadNext();
                    }
                );
            }
        };

        // Start initial batch
        const initialBatchSize = Math.min(concurrency, this.sources.length);
        for (let i = 0; i < initialBatchSize; i++) {
            loadNext();
        }
    }

    sourceLoaded(source, file) {
        this.items[source.name] = file
        this.loaded++

        const percent = Math.floor((this.loaded / this.toLoad) * 100)
        window.dispatchEvent(new CustomEvent('resource-progress', { detail: percent }))

        if (this.loaded === this.toLoad) {
            window.dispatchEvent(new CustomEvent('resource-complete'))
            this.trigger('ready')
        }
    }
}
