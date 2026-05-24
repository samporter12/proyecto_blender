import * as THREE from 'three'
import isMobileDevice from '../Utils/Device.js'

export default class ThirdPersonCamera {
    constructor(experience, target) {
        this.experience = experience
        this.camera = experience.camera.instance
        this.target = target

        const isMobile = isMobileDevice()

        // Distancia y altura adaptada
        this.offset = isMobile
            ? new THREE.Vector3(0, 3.5, -7)  // móvil: más alto y atrás
            : new THREE.Vector3(0, 2.5, -5)

        // Fijar altura para evitar sacudidas
        this.fixedY = isMobile ? 3.5 : 2.5
    }

    update() {
        if (!this.target) return

        // Inicializar suavizadores la primera vez
        if (!this.smoothedDir) {
            this.smoothedDir = new THREE.Vector3(0, 0, 1).applyEuler(this.target.rotation)
            this.smoothedLookAt = this.target.position.clone()
        }

        // Suavizar dirección de giro — evita que la cámara salte bruscamente al girar
        const rawDir = new THREE.Vector3(0, 0, 1).applyEuler(this.target.rotation).normalize()
        this.smoothedDir.lerp(rawDir, 0.12).normalize()

        // Posición deseada desde la posición REAL del robot (sin lag = sin zoom al correr)
        const robotPos = this.target.position
        const desiredPos = new THREE.Vector3(
            robotPos.x + this.smoothedDir.x * this.offset.z,
            this.fixedY,
            robotPos.z + this.smoothedDir.z * this.offset.z
        )

        this.camera.position.lerp(desiredPos, 0.12)

        // LookAt suavizado para absorber micro-vibraciones verticales
        const rawLookAt = new THREE.Vector3(robotPos.x, robotPos.y + 1.2, robotPos.z)
        this.smoothedLookAt.lerp(rawLookAt, 0.12)
        this.camera.lookAt(this.smoothedLookAt)
    }
}
