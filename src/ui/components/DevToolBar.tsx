import { useEffect, useState } from "react"
import { Time } from "../../game/core/Time"
import { UIButton } from "./UIButton"
import { World } from "../../game/world/World"
import "./DevToolBar.css"

export const DevToolBar = () => {
  const [visible, setVisible] = useState(false)
  const [, forceUpdate] = useState(0)
  const [isRaining, setIsRaining] = useState(World.current?.weather.getRainIntensity() != 'none')
  const [lastSpeed, setLastSpeed] = useState(1)

  const setSpeed = (v: number) => {
    Time.setSpeed(v)
    forceUpdate(n => n + 1)
  }

  const togglePause = () => {
    if (Time.timeScale === 0) {
      setSpeed(lastSpeed)
    } else {
      setLastSpeed(Time.timeScale)
      setSpeed(0)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "@") setVisible(v => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const toggleDebugMarkers = () => World.current?.toggleDebugMarkers()
  const goDay   = () => Time.jumpToDayT(0.5, 2)
  const goNight = () => Time.jumpToDayT(0.0, 2)

  const toggleRain = () => {
    World.current?.weather.toggleRain()
    setIsRaining(World.current?.weather.getRainIntensity() !== "none")
  }

  const isPaused = Time.timeScale === 0

  return (
    <div className={`dev-toolbar ${visible ? "visible" : ""}`}>
      <section>
        <UIButton
          className={isPaused ? "selected" : ""}
          onClick={togglePause}
        >
          {isPaused ? "▶️" : "⏸️"}
        </UIButton>

        {[1, 5, 10].map(v => (
          <UIButton
            key={v}
            className={Time.timeScale === v ? "selected" : ""}
            onClick={() => setSpeed(v)}
          >
            x{v}
          </UIButton>
        ))}
      </section>

      <section>
        <UIButton onClick={goDay}>🌞</UIButton>
        <UIButton onClick={goNight}>🌙</UIButton>
        <UIButton onClick={toggleRain} className={isRaining ? "selected" : ""}>☔️</UIButton>
      </section>

      <section>
        <UIButton onClick={toggleDebugMarkers}>🚧</UIButton>
      </section>
    </div>
  )
}