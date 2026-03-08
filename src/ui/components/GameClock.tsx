// src/ui/components/GameClock.tsx
import { useGameTime, formatGameTime } from "../hooks/useGameTime"
import "./GameClock.css"

export const GameClock = () => {
  // Temps visuel + raf pour rendre le défilement perçu plus fluide
  const elapsed = useGameTime(50, true)
  const timeStr = formatGameTime(elapsed)

  return <p className="game-clock">{timeStr}</p>
}
