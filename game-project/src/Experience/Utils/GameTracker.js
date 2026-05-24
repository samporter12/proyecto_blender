// src/utils/GameTracker.js

export default class GameTracker {
    constructor({ modal, menu }) {
        this.modal = modal
        this.menu = menu
        this.startTime = null
        this.endTime = null
        this.finished = false
    }

    start() {
        this.startTime = Date.now()
        this._startLoop()
    }

    stop() {
        this.endTime = Date.now()
        this.finished = true
        return this.getElapsedSeconds()
    }

    getElapsedSeconds() {
        if (!this.startTime) return 0
        const end = this.finished ? this.endTime : Date.now()
        return Math.floor((end - this.startTime) / 1000)
    }

    _startLoop() {
        const update = () => {
            if (this.finished) return
            const elapsed = this.getElapsedSeconds()

            //console.log('⏱ Actualizando HUD con segundos:', elapsed)

            if (this.menu && typeof this.menu.setTimer === 'function') {
                this.menu.setTimer(elapsed)
            }

            requestAnimationFrame(update)
        }
        update()
    }

    saveTime(seconds) {
        const username = localStorage.getItem('username') || 'guest'
        const key = `bestTimes_${username}`
        const stored = JSON.parse(localStorage.getItem(key) || '[]')
        stored.push(seconds)
        stored.sort((a, b) => a - b)
        localStorage.setItem(key, JSON.stringify(stored.slice(0, 5)))
    }

    getBestTimes() {
        const username = localStorage.getItem('username') || 'guest'
        const key = `bestTimes_${username}`
        return JSON.parse(localStorage.getItem(key) || '[]')
    }

    //Modal de fin de juego
    showEndGameModal(currentTime) {
        const best = this.getBestTimes()
        const ranking = best.map((t, i) => `#${i + 1}: ${t}s`).join('\n')

        if (!this.modal || typeof this.modal.show !== 'function') {
            console.warn('⚠️ No se puede mostrar el modal de fin: modal no definido.')
            return
        }

        this.modal.show({
            icon: '🏁',
            message: `¡Felicidades!\nTerminaste todos los niveles.\n⏱ Tu tiempo: ${currentTime}s\n\n🏆 Mejores tiempos:\n${ranking}`,
            buttons: [
                {
                    text: '🎮 Jugar de nuevo',
                    onClick: () => {
                        window.experience.resetGameToFirstLevel()
                    }
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

        const cancelBtn = document.getElementById('cancel-button')
        if (cancelBtn) cancelBtn.remove()

    }

    //iniciar juego
    showReplayButton() {
        if (document.getElementById('replay-button')) return

        const btn = document.createElement('button')
        btn.id = 'replay-button'
        btn.innerText = '🎮 Volver a jugar'

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 16px',
            fontSize: '16px',
            background: '#00fff7',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 0 12px #00fff7',
            cursor: 'pointer',
            zIndex: 9999
        })

        btn.onclick = () => {
            this.hideGameButtons()
            window.experience.resetGame()
        }

        document.body.appendChild(btn)
    }




    hideGameButtons() {
        const replayBtn = document.getElementById('replay-button')
        if (replayBtn) replayBtn.remove()
    }


    destroy() {
        this.finished = true
        if (this.timerElement && this.timerElement.remove) {
            this.timerElement.remove()
            this.timerElement = null
        }
    }

    handleCancelGame() {
        if (this.finished) return

        this.modal?.show({
            icon: '⚠️',
            message: '¿Deseas cancelar la partida en curso?\nPerderás tu progreso actual.',
            buttons: [
                {
                    text: '❌ Cancelar juego',
                    onClick: () => {
                        this.hideGameButtons()
                        this.modal.hide()
                        window.experience.resetGame()
                    }
                },
                {
                    text: '↩️ Seguir jugando',
                    onClick: () => this.modal.hide()
                }
            ]
        })
    }


}