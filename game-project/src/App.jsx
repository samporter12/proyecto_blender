import { useEffect, useRef, useState } from 'react'
import Experience from './Experience/Experience'
import Login from './components/Login'
import './styles/loader.css'

const Game = () => {
  const canvasRef = useRef()
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [levelLoading, setLevelLoading] = useState(false)
  const [levelProgress, setLevelProgress] = useState(0)
  const [levelNum, setLevelNum] = useState(1)

  useEffect(() => {
    const experience = new Experience(canvasRef.current)

    const handleProgress = (e) => setProgress(e.detail)
    const handleComplete = () => setLoading(false)
    const handleLevelStart = (e) => { setLevelNum(e.detail); setLevelProgress(0); setLevelLoading(true) }
    const handleLevelProgress = (e) => setLevelProgress(e.detail)
    const handleLevelEnd = () => setLevelLoading(false)

    window.addEventListener('resource-progress', handleProgress)
    window.addEventListener('resource-complete', handleComplete)
    window.addEventListener('level-loading-start', handleLevelStart)
    window.addEventListener('level-loading-progress', handleLevelProgress)
    window.addEventListener('level-loading-end', handleLevelEnd)

    return () => {
      window.removeEventListener('resource-progress', handleProgress)
      window.removeEventListener('resource-complete', handleComplete)
      window.removeEventListener('level-loading-start', handleLevelStart)
      window.removeEventListener('level-loading-progress', handleLevelProgress)
      window.removeEventListener('level-loading-end', handleLevelEnd)
      if (experience) experience.destroy()
    }
  }, [])

  return (
    <>
      {loading && (
        <div id="loader-overlay">
          <div id="loader-bar" style={{ width: `${progress}%` }}></div>
          <div id="loader-text">Cargando... {progress}%</div>
        </div>
      )}
      {levelLoading && (
        <div id="loader-overlay">
          <div id="loader-bar" style={{ width: `${levelProgress}%` }}></div>
          <div id="loader-text">Cargando nivel {levelNum}... {levelProgress}%</div>
        </div>
      )}
      <canvas ref={canvasRef} className="webgl" />
    </>
  )
}

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [isGuest, setIsGuest] = useState(localStorage.getItem('isGuest') === 'true')

  const handleLogin = (newToken, guest = false) => {
    if (guest) {
      localStorage.setItem('isGuest', 'true')
      setIsGuest(true)
      setToken('guest_token') // Or we can just use isGuest
    } else {
      localStorage.setItem('token', newToken)
      localStorage.removeItem('isGuest')
      setIsGuest(false)
      setToken(newToken)
    }
  }

  if (!token && !isGuest) {
    return <Login setToken={handleLogin} />
  }

  return <Game />
}

export default App
