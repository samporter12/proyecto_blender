import { useEffect, useRef, useState } from 'react'
import Experience from './Experience/Experience'
import Login from './components/Login'
import './styles/loader.css'

const Game = () => {
  const canvasRef = useRef()
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const experience = new Experience(canvasRef.current)

    const handleProgress = (e) => setProgress(e.detail)
    const handleComplete = () => setLoading(false)

    window.addEventListener('resource-progress', handleProgress)
    window.addEventListener('resource-complete', handleComplete)

    return () => {
      window.removeEventListener('resource-progress', handleProgress)
      window.removeEventListener('resource-complete', handleComplete)
      if (experience) {
        experience.destroy();
      }
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
