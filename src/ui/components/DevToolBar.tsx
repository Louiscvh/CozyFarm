// src/ui/components/DevToolBar.tsx
import "./DevToolBar.css"
import { Time } from "../../game/core/Time"
import { useEffect, useState } from "react"
import { UIButton } from "./UIButton"

export const DevToolBar = () => {

    const [, forceUpdate] = useState(0)

  // permet de rafraîchir l’UI si le mode change ailleurs
  useEffect(() => {
    const id = setInterval(() => {
      forceUpdate(v => v + 1)
    }, 300)

    return () => clearInterval(id)
  }, [])

  const setSpeed = (v: number) => Time.setSpeed(v)

  const goDay = () => Time.jumpToDayT(0.5, 2)
  const goNight = () => Time.jumpToDayT(0.0, 2)

  return (
    <div className="dev-toolbar">
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
        <UIButton onClick={goDay}>Midi</UIButton>
        <UIButton onClick={goNight}>Minuit</UIButton>
        </section>
    </div>
  )
}
