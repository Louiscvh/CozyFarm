// src/ui/components/GameClock.tsx
import { useGameTime } from "../hooks/useGameTime"
import { formatGameTime } from "../hooks/useGameTime"
import "./GameClock.css"

export const GameClock = () => {
  const elapsed = useGameTime(500)
  const timeStr = formatGameTime(elapsed)

  return <p className="game-clock">{timeStr}</p>
}
