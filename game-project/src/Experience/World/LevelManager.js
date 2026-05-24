export default class LevelManager {
    constructor(experience) {
        this.experience = experience;
        this.currentLevel = 1;
        this.totalLevels = 5;

        // Monedas necesarias para pasar de nivel
        this.pointsToComplete = {
            1: 2,
            2: 3,
            3: 4,
            4: 5,
            5: 5
        };

        // Spawn del jugador por nivel (coordenadas Three.js)
        this.spawnPoints = {
            1: { x:  0, y: 1.5, z:  0 },
            2: { x:  0, y: 1.5, z:  0 },
            3: { x:  0, y: 1.5, z:  0 },
            4: { x:  0, y: 1.5, z:  0 },
            5: { x:  0, y: 1.5, z:  0 },
        };
    }

    nextLevel() {
        if (this.currentLevel < this.totalLevels) {
            this.currentLevel++;
            this.experience.world.clearCurrentScene();
            this.experience.world.loadLevel(this.currentLevel);

            setTimeout(() => {
                const spawn = this.spawnPoints[this.currentLevel] || { x: 0, y: 1.5, z: 0 };
                this.experience.world.resetRobotPosition(spawn);
            }, 1000);
        }
    }

    resetLevel() {
        this.currentLevel = 1;
        this.experience.world.loadLevel(this.currentLevel);
    }

    getCurrentLevelTargetPoints() {
        return this.pointsToComplete[this.currentLevel] || 3;
    }
}
