// src/ui/hooks/useGameTime.ts
import { useCallback, useEffect, useState } from "react"
import { Time } from "../../game/core/Time"

type TimeSource = "logical" | "visual"

interface UseGameTimeOptions {
  source?: TimeSource
  smooth?: boolean
  updateInterval?: number
}

export function useGameTime(options: UseGameTimeOptions = {}) {
  const { source = "logical", smooth = false, updateInterval = 100 } = options

  const readTime = useCallback(
    () => source === "visual" ? Time.getVisualDayT() : Time.getLogicalDayT(),
    [source],
  )

  const [t, setT] = useState(readTime)

  useEffect(() => {
    if (smooth) {
      let rafId = 0

      const tick = () => {
        setT(readTime())
        rafId = requestAnimationFrame(tick)
      }

      rafId = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(rafId)
    }

    const id = setInterval(() => {
      setT(readTime())
    }, updateInterval)

    return () => clearInterval(id)
  }, [readTime, smooth, updateInterval])

  return t
}

export function formatGameTime(t: number) {
  const hours = Math.floor(t * 24)
  const minutes = Math.floor((t * 24 * 60) % 60)

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`
}
