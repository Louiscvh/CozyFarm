// src/ui/hooks/useGameTime.ts
import { useEffect, useState } from "react"
import { Time } from "../../game/core/Time"

/**
 * Horloge "lissée" via RAF pour éviter l'effet saccadé de setInterval.
 * updateInterval permet de réduire la fréquence de setState si besoin.
 */
export function useGameTime(updateInterval = 100, useVisualTime = false) {
  const readTime = () => (useVisualTime ? Time.getVisualDayT() : Time.getLogicalDayT())
  const [t, setT] = useState(readTime)

  useEffect(() => {
    let rafId = 0
    let lastEmit = 0

    const tick = (now: number) => {
      if (now - lastEmit >= updateInterval) {
        setT(readTime())
        lastEmit = now
      }
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [updateInterval, useVisualTime])

  return t
}

export function formatGameTime(t: number) {
  const hours = Math.floor(t * 24)
  const minutes = Math.floor((t * 24 * 60) % 60)

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}
