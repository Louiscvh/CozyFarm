// src/ui/components/DevToolBar.tsx
import { useEffect, useState } from "react"
import { Time } from "../../game/core/Time"
import { UIButton } from "./UIButton"
import { World } from "../../game/world/World"
import "./DevToolBar.css"
import { toggleDebugHitbox } from "../../game/entity/EntityFactory"
import { PerfMonitor } from "./PerfMonitor"
import { toggleDebugGrid } from "../../game/system/Grid"
import { getSeasonState, shiftSeason } from "../../game/system/Season"

export const DevToolBar = () => {
  const [visible, setVisible]                   = useState(false)
  const [, forceUpdate]                         = useState(0)
  const [isRaining, setIsRaining]               = useState(World.current?.weather.getRainIntensity() != 'none')
  const [lastSpeed, setLastSpeed]               = useState(1)
  const [footprintVisible, setFootprintVisible] = useState(false)
  const [hitboxVisible, setHitboxVisible]       = useState(false)
  const [gridVisible, setGridVisible]           = useState(false)
  const [perfOpen, setPerfOpen]                 = useState(false)
  const [isWinterIcon, setIsWinterIcon]         = useState(getSeasonState().season.id === "winter")

  const toggleHitbox = () => {
    toggleDebugHitbox()
    setHitboxVisible(v => !v)
  }

  const handleToggleGrid = () => {
    toggleDebugGrid()
    setGridVisible(v => !v)
  }

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

  useEffect(() => {
    const id = setInterval(() => {
      const weather = World.current?.weather
      if (!weather) return
      setIsRaining(weather.getRainIntensity() !== "none")
      setIsWinterIcon(getSeasonState().season.id === "winter")
    }, 250)
    return () => clearInterval(id)
  }, [])

  const toggleDebugMarkers = () => {
    World.current?.tilesFactory.toggleDebugMarkers()
    setFootprintVisible(v => !v)
  }
  const goDay   = () => Time.jumpToDayT(0.5, 1.2)
  const goNight = () => Time.jumpToDayT(0.0, 1.2)

  const toggleRain = () => {
    World.current?.weather.toggleRain()
    setIsRaining(World.current?.weather.getRainIntensity() !== "none")
  }

  const isPaused = Time.timeScale === 0
  const isWinter = isWinterIcon

  return (
    <>
      <div className={`dev-toolbar ${visible ? "visible" : ""}`}>
        <div className="line">
          <section>
            <UIButton className={isPaused ? "selected" : ""} onClick={togglePause}>
              {isPaused ? "▶️" : "⏸️"}
            </UIButton>
            {[1, 5, 10].map(v => (
              <UIButton key={v} className={Time.timeScale === v ? "selected" : ""} onClick={() => setSpeed(v)}>
                x{v}
              </UIButton>
            ))}
          </section>

          <section>
            <UIButton onClick={goDay}>🌞</UIButton>
            <UIButton onClick={goNight}>🌙</UIButton>
            <UIButton onClick={toggleRain} className={isRaining ? "selected" : ""}>{isWinter ? "❄️" : "☔️"}</UIButton>
          </section>
        </div>

        <div className="line">
          <section>
            <UIButton onClick={toggleDebugMarkers} className={footprintVisible ? "selected" : ""}>🚧</UIButton>
            <UIButton onClick={toggleHitbox} className={hitboxVisible ? "selected" : ""}>📦</UIButton>
            <UIButton onClick={handleToggleGrid} className={gridVisible ? "selected" : ""} title="Afficher grille complète">🔲</UIButton>
            <UIButton onClick={() => setPerfOpen(v => !v)} className={perfOpen ? "selected" : ""} title="Moniteur performances">📊</UIButton>
          </section>

          <section>
            <UIButton onClick={() => shiftSeason(1)} title="Saison suivante">⏭️</UIButton>
          </section>
        </div>

      </div>

      {perfOpen && <PerfMonitor onClose={() => setPerfOpen(false)} />}
    </>
  )
}
