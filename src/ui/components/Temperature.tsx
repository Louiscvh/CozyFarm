import "./Temperature.css"
import { useEffect, useRef, useState } from "react"
import { Renderer } from "../../render/Renderer"
import { UIButton } from "./UIButton"
import { Time } from "../../game/core/Time"
import { DAYS_PER_SEASON, getSeasonState } from "../../game/system/Season"

export const Temperature = () => {
  const [temperature, setTemperature] = useState(20)
  const [calendarDay, setCalendarDay] = useState(1)
  const [calendarMonth, setCalendarMonth] = useState(getSeasonState().season.label)

  const dayRotatorRef = useRef<HTMLDivElement>(null)

  const prevDayT = useRef(Time.getVisualDayT())
  const totalDayAngle = useRef(Time.getVisualDayT() * 360)

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

      rafRef.current = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else {
        prevDayT.current = Time.getVisualDayT()
        rafRef.current = requestAnimationFrame(loop)
      }
    }

    if (dayRotatorRef.current) {
      dayRotatorRef.current.style.transform =
        `translateY(50%) rotate(${totalDayAngle.current}deg)`
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

      const seasonState = getSeasonState()
      const currentDay = Math.floor(seasonState.seasonProgress * DAYS_PER_SEASON) + 1

      setTemperature(Math.round(weather.getTemperature()))
      setCalendarDay(currentDay)
      setCalendarMonth(seasonState.season.label)
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

      <UIButton className="calendar-widget static" aria-label={`Date: ${calendarDay} ${calendarMonth}`}>
        <div className="calendar-day">{calendarDay}</div>
        <div className="calendar-month">{calendarMonth}</div>
      </UIButton>
    </div>
  )
}
