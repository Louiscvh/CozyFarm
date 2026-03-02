import "./Temperature.css"
import { useEffect, useRef, useState } from "react"
import { Renderer } from "../../render/Renderer"
import { UIButton } from "./UIButton"
import { Time } from "../../game/core/Time"

export const Temperature = () => {
  const [temperature, setTemperature] = useState(20)
  const rotatorRef = useRef<HTMLDivElement>(null)
  const prevT      = useRef(Time.getVisualDayT())
  const totalAngle = useRef(prevT.current * 360)
  const rafRef     = useRef<number>(0)

  useEffect(() => {
    const loop = () => {
      const t = Time.getVisualDayT()
      let delta = t - prevT.current
      if (delta >  0.5) delta -= 1
      if (delta < -0.5) delta += 1

      // Skip DOM write if angle moved less than 0.01° — saves style recalc
      if (Math.abs(delta) > 0.0001) {
        totalAngle.current += delta * 360
        prevT.current = t
        if (rotatorRef.current)
          rotatorRef.current.style.transform =
            `translateY(50%) rotate(${totalAngle.current}deg)`
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else {
        // Reset prevT so the first delta after coming back is 0, not the whole absence
        prevT.current = Time.getVisualDayT()
        rafRef.current = requestAnimationFrame(loop)
      }
    }

    document.addEventListener("visibilitychange", onVisibility)
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return   // no point updating while tab is hidden
      const weather = Renderer.instance?.world?.weather
      if (!weather) return
      setTemperature(Math.round(weather.getTemperature()))
    }, 300)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="temperature-bar">
      <UIButton className="cycle-widget static">
        <div className="cycle-mask">
          <div ref={rotatorRef} className="cycle-rotator">
            <div className="sun">☀️</div>
            <div className="moon">🌚</div>
          </div>
        </div>
      </UIButton>
      <UIButton className="temperature-widget static">
        {temperature}°C
      </UIButton>
    </div>
  )
}