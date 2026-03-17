import "./Temperature.css"
import { useEffect, useRef, useState } from "react"
import { Renderer } from "../../render/Renderer"
import { UIButton } from "./UIButton"
import { Time } from "../../game/core/Time"
import { getSeasonState } from "../../game/system/Season"

export const Temperature = () => {
  const [temperature, setTemperature] = useState(20)

  const dayRotatorRef = useRef<HTMLDivElement>(null)
  const seasonRotatorRef = useRef<HTMLDivElement>(null)

  const prevDayT = useRef(Time.getVisualDayT())
  const totalDayAngle = useRef(Time.getVisualDayT() * 360)

  const prevYearT = useRef(getSeasonState().yearProgress)
  const totalSeasonAngle = useRef(getSeasonState().yearProgress * 360)
  const seasonTargetAngle = useRef(totalSeasonAngle.current)
  const seasonDisplayAngle = useRef(totalSeasonAngle.current)

  const rafRef = useRef<number>(0)

  useEffect(() => {
    const loop = () => {
      const dayT = Time.getVisualDayT()
      let dayDelta = dayT - prevDayT.current
      if (dayDelta > 0.5) dayDelta -= 1
      if (dayDelta < -0.5) dayDelta += 1

      if (Math.abs(dayDelta) > 0.0001) {
        totalDayAngle.current += dayDelta * 360
        prevDayT.current = dayT
        if (dayRotatorRef.current) {
          dayRotatorRef.current.style.transform =
            `translateY(50%) rotate(${totalDayAngle.current}deg)`
        }
      }

      const yearT = getSeasonState().yearProgress
      let yearDelta = yearT - prevYearT.current
      if (yearDelta > 0.5) yearDelta -= 1
      if (yearDelta < -0.5) yearDelta += 1

      if (Math.abs(yearDelta) > 0.0001) {
        totalSeasonAngle.current += yearDelta * 360
        seasonTargetAngle.current = totalSeasonAngle.current
        prevYearT.current = yearT
      }

      const seasonSmoothing = 0.16
      const seasonAngleDiff = seasonTargetAngle.current - seasonDisplayAngle.current
      if (Math.abs(seasonAngleDiff) > 0.01) {
        seasonDisplayAngle.current += seasonAngleDiff * seasonSmoothing
        if (seasonRotatorRef.current) {
          seasonRotatorRef.current.style.transform =
            `translateY(50%) rotate(${seasonDisplayAngle.current}deg)`
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else {
        prevDayT.current = Time.getVisualDayT()
        prevYearT.current = getSeasonState().yearProgress
        totalSeasonAngle.current = prevYearT.current * 360
        seasonTargetAngle.current = totalSeasonAngle.current
        seasonDisplayAngle.current = totalSeasonAngle.current
        if (seasonRotatorRef.current) {
          seasonRotatorRef.current.style.transform =
            `translateY(50%) rotate(${seasonDisplayAngle.current}deg)`
        }
        rafRef.current = requestAnimationFrame(loop)
      }
    }

    if (dayRotatorRef.current) {
      dayRotatorRef.current.style.transform =
        `translateY(50%) rotate(${totalDayAngle.current}deg)`
    }
    if (seasonRotatorRef.current) {
      seasonRotatorRef.current.style.transform =
        `translateY(50%) rotate(${seasonDisplayAngle.current}deg)`
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
      if (document.hidden) return
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
          <div ref={dayRotatorRef} className="cycle-rotator">
            <div className="sun">☀️</div>
            <div className="moon">🌚</div>
          </div>
        </div>
      </UIButton>

      <UIButton className="temperature-widget static">
        {temperature}°C
      </UIButton>

      <UIButton className="season-cycle-widget static">
        <div className="cycle-mask">
          <div ref={seasonRotatorRef} className="season-cycle-rotator">
            <div className="season-icon autumn">🍂</div>
            <div className="season-icon winter">❄️</div>
            <div className="season-icon spring">🌸</div>
            <div className="season-icon summer">🌻</div>
          </div>
        </div>
      </UIButton>
    </div>
  )
}
