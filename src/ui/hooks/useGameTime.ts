// src/ui/hooks/useGameTime.ts
import { useEffect, useState } from "react"
import { Time } from "../../game/core/Time"

export function useGameTime(updateInterval = 100) {
    const [t, setT] = useState(Time.getLogicalDayT())
  
    useEffect(() => {
      const id = setInterval(() => {
        setT(Time.getLogicalDayT())
      }, updateInterval)
  
      return () => clearInterval(id)
    }, [updateInterval])
  
    return t
  }
  
  

export function formatGameTime(t: number) {
    const hours = Math.floor(t * 24)
    const minutes = Math.floor((t * 24 * 60) % 60)
  
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`
}
  
  
