import { useEffect, useState } from "react"
import { Time } from "../../game/core/Time"
import { UIButton } from "./UIButton"
import { World } from "../../game/world/World"
import "./DevToolBar.css"

export const DevToolBar = () => {
  const [visible, setVisible] = useState(false)

  // toggle toolbar avec @
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "@") {
        setVisible(v => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const toggleDebugMarkers = () => World.current?.toggleDebugMarkers()
  const setSpeed = (v: number) => Time.setSpeed(v)
  const goDay = () => Time.jumpToDayT(0.5, 2)
  const goNight = () => Time.jumpToDayT(0.0, 2)

  return (
    <div className={`dev-toolbar ${visible ? "visible" : ""}`}>
      <section>
        {[1, 4, 10].map(v => (
          <UIButton
            key={v}
            className={Time.timeScale === v ? "active" : ""}
            onClick={() => setSpeed(v)}
          >
            x{v}
          </UIButton>
        ))}
      </section>

      <section>
        <UIButton onClick={goDay}>12h</UIButton>
        <UIButton onClick={goNight}>00h</UIButton>
      </section>
      <section>
        <UIButton onClick={toggleDebugMarkers}>Tile</UIButton>
      </section>
    </div>
  )
}
