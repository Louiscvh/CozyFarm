// src/ui/components/GameClock.tsx
import { useGameTime } from "../hooks/useGameTime"
import { formatGameTime } from "../hooks/useGameTime"
import "./GameClock.css"
import { UIButton } from "./UIButton"

export const GameClock = () => {
  const elapsed = useGameTime(200) // update toutes les 200ms
  const timeStr = formatGameTime(elapsed)

  return <UIButton className="game-clock">{timeStr}</UIButton>
}
