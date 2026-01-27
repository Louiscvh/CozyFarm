// src/ui/hooks/useGameTime.ts
import { useEffect, useState } from "react"
import { Time } from "../../game/core/Time"

export function useGameTime(updateInterval: number = 100) {
  const [elapsed, setElapsed] = useState(Time.elapsed)

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Time.elapsed)
    }, updateInterval)

    return () => clearInterval(id)
  }, [updateInterval])

  return elapsed
}

export function formatGameTime(elapsedSeconds: number) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      return "00:00"
    }
  
    const cycleSeconds = 5 * 60
    const t = (elapsedSeconds % cycleSeconds) / cycleSeconds
  
    const hours = Math.floor(t * 24)
    const minutes = Math.floor((t * 24 * 60) % 60)
  
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`
  }
  
  
