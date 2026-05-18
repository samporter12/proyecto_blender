// Experience/Utils/Physics.js
import * as CANNON from 'cannon-es'

export default class Physics {
    constructor() {
        this.world = new CANNON.World()
        this.world.gravity.set(0, -9.82, 0)
        this.world.broadphase = new CANNON.SAPBroadphase(this.world)
        this.world.allowSleep = true

        this.defaultMaterial = new CANNON.Material('default')
        const defaultContact = new CANNON.ContactMaterial(
            this.defaultMaterial,
            this.defaultMaterial,
            {
                friction: 0.4,
                restitution: 0.0
            }
        )
        this.world.defaultContactMaterial = defaultContact
        this.world.addContactMaterial(defaultContact)

        this.robotMaterial = new CANNON.Material('robot')
        this.obstacleMaterial = new CANNON.Material('obstacle')
        this.wallMaterial = new CANNON.Material('wall')

        const robotObstacleContact = new CANNON.ContactMaterial(
            this.robotMaterial,
            this.obstacleMaterial,
            {
                friction: 0.6,
                restitution: 0.0,
                contactEquationStiffness: 1e6, // 🛡️ Aún más bajo para máxima estabilidad
                contactEquationRelaxation: 5, // 🛡️ Más suave
                frictionEquationStiffness: 1e6,
                frictionEquationRelaxation: 3
            }
        )
        this.world.addContactMaterial(robotObstacleContact)

        const robotWallContact = new CANNON.ContactMaterial(
            this.robotMaterial,
            this.wallMaterial,
            {
                friction: 0.6,
                restitution: 0.0,
                contactEquationStiffness: 1e6,
                contactEquationRelaxation: 6, // 🛡️ Máxima amortiguación en bordes
                frictionEquationStiffness: 1e6,
                frictionEquationRelaxation: 3
            }
        )
        this.world.addContactMaterial(robotWallContact)
    }

    update(delta) {
        // ✅ Intenta avanzar la simulación sin romper
        try {
            // 🛡️ Reducido de 10 a 4 sub-pasos para mejor rendimiento con muchos bloques estáticos
            const maxSubSteps = (delta < 1 / 30) ? 4 : 8;
            this.world.step(1 / 60, delta, maxSubSteps)
        } catch (err) {
            if (err?.message?.includes('wakeUpAfterNarrowphase')) {
                console.warn('⚠️ Cannon encontró un shape corrupto residual. Ignorado.')
            } else {
                console.error('🚫 Cannon step error:', err)
            }
        }
    }



}
