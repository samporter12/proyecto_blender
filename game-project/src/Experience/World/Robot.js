import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Sound from './Sound.js'

export default class Robot {
    constructor(experience) {
        this.experience = experience
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.physics = this.experience.physics
        this.keyboard = this.experience.keyboard
        this.debug = this.experience.debug
        this.points = 0

        this.setModel()
        this.setSounds()
        this.setPhysics()
        this.setAnimation()
    }

    setModel() {
        this.model = this.resources.items.robotModel.scene
        this.model.scale.set(0.6, 0.6, 0.6)
        this.model.position.set(0, -0.6, 0) // Centrar respecto al cuerpo físico

        this.group = new THREE.Group()
        this.group.add(this.model)
        this.scene.add(this.group)

        this.model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
            }
        })
    }

    setPhysics() {
        const shape = new CANNON.Sphere(0.6)

        this.body = new CANNON.Body({
            mass: 2,
            shape: shape,
            position: new CANNON.Vec3(0, 1.2, 0),
            linearDamping: 0.1, // 🛡️ Aumentado de 0.05 para mayor estabilidad
            angularDamping: 0.9
        })

        this.body.angularFactor.set(0, 1, 0)

        // Estabilización inicial
        this.body.velocity.setZero()
        this.body.angularVelocity.setZero()
        this.body.sleep()
        this.body.material = this.physics.robotMaterial
        //console.log(' Robot material:', this.body.material.name)


        this.physics.world.addBody(this.body)
        //console.log(' Posición inicial del robot:', this.body.position)
        // Activar cuerpo después de que el mundo haya dado al menos un paso de simulación
        setTimeout(() => {
            this.body.wakeUp()
        }, 100) // 100 ms ≈ 6 pasos de simulación si step = 1/60
    }


    setSounds() {
        this.walkSound = new Sound('/sounds/robot/walking.mp3', { loop: true, volume: 0.5 })
        this.jumpSound = new Sound('/sounds/robot/jump.mp3', { volume: 0.8 })
    }

    setAnimation() {
        this.animation = {}
        this.animation.mixer = new THREE.AnimationMixer(this.model)

        this.animation.actions = {}
        this.animation.actions.dance = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[0])
        this.animation.actions.death = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[1])
        this.animation.actions.idle = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[2])
        this.animation.actions.jump = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[3])
        this.animation.actions.walking = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[10])
        this.animation.actions.running = this.animation.mixer.clipAction(this.resources.items.robotModel.animations[16])

        this.animation.actions.current = this.animation.actions.idle
        this.animation.actions.current.play()

        this.animation.actions.jump.setLoop(THREE.LoopOnce)
        this.animation.actions.jump.clampWhenFinished = true
        this.animation.actions.jump.onFinished = () => {
            this.animation.play('idle')
        }

        this.animation.play = (name) => {
            const newAction = this.animation.actions[name]
            const oldAction = this.animation.actions.current

            newAction.reset()
            newAction.play()
            newAction.crossFadeFrom(oldAction, 0.3)
            this.animation.actions.current = newAction

            if (name === 'walking' || name === 'running') {
                this.walkSound.play()
            } else {
                this.walkSound.stop()
            }

            if (name === 'jump') {
                this.jumpSound.play()
            }
        }
    }

    update() {
        if (this.animation.actions.current === this.animation.actions.death) return
        const delta = this.time.delta * 0.001
        this.animation.mixer.update(delta)

        const keys = this.keyboard.getState()
        const isRunning = keys.shift
        const moveForce = isRunning ? 250 : 80
        const turnSpeed = 2.5
        let isMoving = false

        // Limitar velocidad si es demasiado alta en todos los ejes
        const maxSpeed = isRunning ? 25 : 12 // 🛡️ Ajustado para ser más controlado
        this.body.velocity.x = Math.max(Math.min(this.body.velocity.x, maxSpeed), -maxSpeed)
        this.body.velocity.z = Math.max(Math.min(this.body.velocity.z, maxSpeed), -maxSpeed)
        this.body.velocity.y = Math.max(Math.min(this.body.velocity.y, 20), -20) // 🛡️ Limitar velocidad vertical


        // Salto
        // Dirección hacia adelante, independientemente del salto o movimiento
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)

        // Salto (radio de esfera es 0.6, el centro al descansar está en ~0.6)
        if (keys.space && this.body.position.y <= 0.7) {
            this.body.applyImpulse(new CANNON.Vec3(forward.x * 0.5, 5, forward.z * 0.5))
            this.animation.play('jump')
            return
        }
        // 🛡️ No permitir que el robot salga del escenario (Aumentado a 25 para evitar falsos positivos)
        if (this.body.position.y > 25 || this.body.position.y < -5) {
            console.warn('⚠️ Robot fuera del escenario. Reubicando...')
            this.body.position.set(0, 1.2, 0)
            this.body.velocity.set(0, 0, 0)
            this.body.angularVelocity.set(0, 0, 0)
        }


        // Movimiento hacia adelante
        if (keys.up) {
            const forward = new THREE.Vector3(0, 0, 1)
            forward.applyQuaternion(this.group.quaternion)
            this.body.applyForce(
                new CANNON.Vec3(forward.x * moveForce, 0, forward.z * moveForce),
                this.body.position
            )
            isMoving = true
        }

        // Movimiento hacia atrás
        if (keys.down) {
            const backward = new THREE.Vector3(0, 0, -1)
            backward.applyQuaternion(this.group.quaternion)
            this.body.applyForce(
                new CANNON.Vec3(backward.x * moveForce, 0, backward.z * moveForce),
                this.body.position
            )
            isMoving = true
        }

        // Rotación
        if (keys.left) {
            this.group.rotation.y += turnSpeed * delta
        }
        if (keys.right) {
            this.group.rotation.y -= turnSpeed * delta
        }
        
        // 🛡️ Sincronizar el cuerpo físico con la rotación visual de forma segura
        this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.group.rotation.y)
        this.body.angularVelocity.set(0, 0, 0) // Evitar rotaciones locas inducidas por colisiones


        // Animaciones según movimiento
        if (isMoving) {
            if (isRunning) {
                if (this.animation.actions.current !== this.animation.actions.running) {
                    this.animation.play('running')
                }
            } else {
                if (this.animation.actions.current !== this.animation.actions.walking) {
                    this.animation.play('walking')
                }
            }
        } else {
            if (this.animation.actions.current !== this.animation.actions.idle) {
                this.animation.play('idle')
            }
        }

        // Sincronización física → visual
        this.group.position.copy(this.body.position)

    }

    // Método para mover el robot desde el exterior VR
    moveInDirection(dir, speed) {
        if (!window.userInteracted || !this.experience.renderer.instance.xr.isPresenting) {
            return
        }

        // Si hay controles móviles activos
        const mobile = window.experience?.mobileControls
        if (mobile?.intensity > 0) {
            const dir2D = mobile.directionVector
            const dir3D = new THREE.Vector3(dir2D.x, 0, dir2D.y).normalize()

            const adjustedSpeed = 250 * mobile.intensity // velocidad más fluida
            const force = new CANNON.Vec3(dir3D.x * adjustedSpeed, 0, dir3D.z * adjustedSpeed)

            this.body.applyForce(force, this.body.position)

            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking')
            }

            // Rotar suavemente en dirección de avance
            const angle = Math.atan2(dir3D.x, dir3D.z)
            this.group.rotation.y = angle
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }
    }
    die() {
        if (this.animation.actions.current !== this.animation.actions.death) {
            this.isDead = true
            this.animation.actions.current.fadeOut(0.2)
            this.animation.actions.death.reset().fadeIn(0.2).play()
            this.animation.actions.current = this.animation.actions.death

            this.walkSound.stop()

            // 💥 Eliminar cuerpo del mundo para evitar errores
            if (this.physics.world.bodies.includes(this.body)) {
                this.physics.world.removeBody(this.body)
            }
            this.body = null  // prevenir referencias rotas

            // Ajustes visuales (opcional)
            this.group.position.y -= 0.5
            this.group.rotation.x = -Math.PI / 2

            console.log(' Robot ha muerto')
        }
    }

    respawn(position) {
        this.isDead = false
        this.group.rotation.x = 0
        this.group.position.copy(position)
        
        // Recrear física si se había eliminado
        if (!this.body) {
            this.setPhysics()
        }
        
        this.body.position.copy(position)
        this.body.velocity.set(0, 0, 0)
        this.body.angularVelocity.set(0, 0, 0)
        this.body.quaternion.setFromEuler(0, 0, 0)
        
        this.animation.play('idle')
    }



}
