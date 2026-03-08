// src/ui/components/GameClock.tsx
import { useEffect, useState } from "react"
import { useGameTime } from "../hooks/useGameTime"
import "./GameClock.css"

type RollingDigitProps = {
  digit: number
}

const RollingDigit = ({ digit }: RollingDigitProps) => {
  const [startDigit, setStartDigit] = useState(digit)
  const [steps, setSteps] = useState(0)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (digit === startDigit) return

    const nextSteps = (digit - startDigit + 10) % 10

    setAnimate(false)
    setSteps(0)

    const id = window.requestAnimationFrame(() => {
      setAnimate(true)
      setSteps(nextSteps)
    })

    return () => window.cancelAnimationFrame(id)
  }, [digit, startDigit])

  const handleTransitionEnd = () => {
    if (!animate) return
    setAnimate(false)
    setSteps(0)
    setStartDigit(digit)
  }

  return (
    <span className="digit-window" aria-hidden="true">
      <span
        className={`digit-strip ${animate ? "is-animating" : ""}`}
        style={{ transform: `translateY(-${steps * 100}%)` }}
        onTransitionEnd={handleTransitionEnd}
      >
        {Array.from({ length: 11 }, (_, i) => (
          <span key={`${startDigit}-${i}`} className="digit-cell">
            {(startDigit + i) % 10}
          </span>
        ))}
      </span>
    </span>
  )
}

export const GameClock = () => {
  const elapsed = useGameTime(50, true)
  const totalMinutes = Math.floor(elapsed * 24 * 60)

  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60

  const hh = hours.toString().padStart(2, "0")
  const mm = minutes.toString().padStart(2, "0")

  return (
    <p className="game-clock" aria-label={`Heure du jeu ${hh}:${mm}`}>
      <RollingDigit digit={Number(hh[0])} />
      <RollingDigit digit={Number(hh[1])} />
      <span className="clock-separator">:</span>
      <RollingDigit digit={Number(mm[0])} />
      <RollingDigit digit={Number(mm[1])} />
    </p>
  )
}
