// src/ui/components/GameClock.tsx
import { UIButton } from "./UIButton"
import { useGameTime, formatGameTime } from "../hooks/useGameTime"
import "./GameClock.css"

export const GameClock = () => {
  const elapsed = useGameTime({ source: "visual", smooth: true })
  const timeStr = formatGameTime(elapsed)

  return (
    <UIButton className="game-clock static" aria-label={`Heure en jeu : ${timeStr}`}>
      <span className="game-clock__label">🕒</span>
      <span>{timeStr}</span>
    </UIButton>
  )
}
