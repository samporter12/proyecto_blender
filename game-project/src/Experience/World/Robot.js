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
        this.isDead = false

        this.setModel()
        this.setSounds()
        this.setPhysics()
        this.setAnimation()
    }

    setModel() {
        this.model = this.resources.items.robotModel.scene
        this.model.scale.set(0.3, 0.3, 0.3)
        this.model.position.set(0, -0.1, 0)

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
        const shape = new CANNON.Sphere(0.4)

        this.body = new CANNON.Body({
            mass: 1,
            shape: shape,
            position: new CANNON.Vec3(0, 1.2, 0),
            linearDamping: 0.0,
            angularDamping: 1.0
        })

        this.body.angularFactor.set(0, 1, 0)
        this.body.allowSleep = false
        this.body.velocity.setZero()
        this.body.angularVelocity.setZero()
        this.body.material = this.physics.robotMaterial

        this.physics.world.addBody(this.body)
    }

    setSounds() {
        this.walkSound = new Sound('/sounds/robot/walking.mp3', { loop: true, volume: 0.5 })
        this.jumpSound = new Sound('/sounds/robot/jump.mp3', { volume: 0.8 })
    }

    setAnimation() {
        this.animation = {}
        this.animation.mixer = new THREE.AnimationMixer(this.model)

        const clips = this.resources.items.robotModel.animations
        console.log('Animaciones disponibles:', clips.map((c, i) => `[${i}] ${c.name}`))

        const findClip = (...names) => {
            for (const name of names) {
                const clip = clips.find(c => c.name.toLowerCase().includes(name.toLowerCase()))
                if (clip) return clip
            }
            return clips[0]
        }

        this.animation.actions = {}
        this.animation.actions.dance   = this.animation.mixer.clipAction(findClip('dance', 'Dance'))
        this.animation.actions.death   = this.animation.mixer.clipAction(findClip('death', 'Death', 'die'))
        this.animation.actions.idle    = this.animation.mixer.clipAction(findClip('idle', 'Idle', 'stand'))
        this.animation.actions.jump    = this.animation.mixer.clipAction(findClip('jump', 'Jump'))
        this.animation.actions.walking = this.animation.mixer.clipAction(findClip('walk', 'Walk', 'run', 'Run'))

        this.animation.actions.current = this.animation.actions.idle
        this.animation.actions.current.play()

        this.animation.actions.jump.setLoop(THREE.LoopOnce)
        this.animation.actions.jump.clampWhenFinished = true

        this.animation.play = (name) => {
            const newAction = this.animation.actions[name]
            const oldAction = this.animation.actions.current

            newAction.reset()
            newAction.play()
            newAction.crossFadeFrom(oldAction, 0.3)
            this.animation.actions.current = newAction

            if (name === 'walking') {
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
        if (this.isDead) return
        const delta = this.time.delta * 0.001
        this.animation.mixer.update(delta)

        const keys = this.keyboard.getState()
        const isSprinting = keys.shift

        const moveSpeed = isSprinting ? 12 : 6
        const turnSpeed = 2.0
        let isMoving = false

        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)

        if (!keys.space) {
            this.body.velocity.y = Math.min(this.body.velocity.y, 1.0)
        }

        const isGrounded = Math.abs(this.body.velocity.y) < 0.5
        if (keys.space && isGrounded) {
            this.body.velocity.y = 5
            this.animation.play('jump')
            return
        }

        if (this.body.position.y < -10) {
            const spawn = this.experience.world?.levelManager?.spawnPoints?.[
                this.experience.world?.levelManager?.currentLevel
            ] || { x: 0, y: 1.5, z: 0 }
            this.body.position.set(spawn.x, spawn.y, spawn.z)
            this.body.velocity.set(0, 0, 0)
        }

        if (keys.up) {
            this.body.velocity.x = forward.x * moveSpeed
            this.body.velocity.z = forward.z * moveSpeed
            isMoving = true
        } else if (keys.down) {
            this.body.velocity.x = -forward.x * moveSpeed
            this.body.velocity.z = -forward.z * moveSpeed
            isMoving = true
        } else {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
        }

        if (keys.left) {
            this.group.rotation.y += turnSpeed * delta
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }
        if (keys.right) {
            this.group.rotation.y -= turnSpeed * delta
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }

        if (isMoving) {
            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking')
            }
        } else {
            if (this.animation.actions.current !== this.animation.actions.idle) {
                this.animation.play('idle')
            }
        }

        this.group.position.copy(this.body.position)

        const fox = this.experience.world?.fox
        if (fox?.model) {
            const target = this.group.position
            const foxPos = fox.model.position

            const behind = new THREE.Vector3(
                target.x - Math.sin(this.group.rotation.y) * 3,
                target.y,
                target.z - Math.cos(this.group.rotation.y) * 3
            )

            foxPos.x += (behind.x - foxPos.x) * 0.05
            foxPos.z += (behind.z - foxPos.z) * 0.05
            foxPos.y  = target.y

            const dx = target.x - foxPos.x
            const dz = target.z - foxPos.z
            if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                fox.model.rotation.y = Math.atan2(dx, dz)
            }
        }
    }

    moveInDirection(dir, speed) {
        if (!window.userInteracted || !this.experience.renderer.instance.xr.isPresenting) return

        const mobile = window.experience?.mobileControls
        if (mobile?.intensity > 0) {
            const dir2D = mobile.directionVector
            const dir3D = new THREE.Vector3(dir2D.x, 0, dir2D.y).normalize()
            const force = new CANNON.Vec3(dir3D.x * 250 * mobile.intensity, 0, dir3D.z * 250 * mobile.intensity)
            this.body.applyForce(force, this.body.position)

            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking')
            }

            const angle = Math.atan2(dir3D.x, dir3D.z)
            this.group.rotation.y = angle
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }
    }

    die() {
        if (this.isDead) return
        this.isDead = true

        this.walkSound.stop()

        const deathAction   = this.animation.actions.death
        const currentAction = this.animation.actions.current
        if (deathAction && deathAction !== currentAction) {
            currentAction.fadeOut(0.2)
            deathAction.reset().fadeIn(0.2).play()
            this.animation.actions.current = deathAction
        }

        if (this.body && this.physics.world.bodies.includes(this.body)) {
            this.physics.world.removeBody(this.body)
        }
        this.body = null

        this.group.position.y -= 0.5
        this.group.rotation.x = -Math.PI / 2

        console.log('Robot ha muerto')
    }

    respawn(position) {
        this.isDead = false

        this.group.rotation.set(0, 0, 0)
        this.group.scale.set(1, 1, 1)

        if (!this.body) {
            this.setPhysics()
        }

        const p = position || { x: 0, y: 1.5, z: 0 }
        this.body.position.set(p.x, p.y, p.z)
        this.body.velocity.set(0, 0, 0)
        this.body.angularVelocity.set(0, 0, 0)
        this.body.quaternion.setFromEuler(0, 0, 0)

        const idle = this.animation.actions.idle
        if (idle && this.animation.actions.current !== idle) {
            this.animation.actions.current?.stop()
            idle.reset().play()
            this.animation.actions.current = idle
        }

        this.points = 0
        console.log('Robot respawneado en', p)
    }
}
