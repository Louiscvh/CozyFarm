// src/ui/components/GameClock.tsx
import { useEffect, useState } from "react"
import { useGameTime } from "../hooks/useGameTime"
import "./GameClock.css"

type RollingDigitProps = {
  digit: number
}

const RollingDigit = ({ digit }: RollingDigitProps) => {
  const [displayDigit, setDisplayDigit] = useState(digit)
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (digit === displayDigit) return

    const nextOffset = ((displayDigit - digit + 10) % 10) * 100

    setAnimate(false)
    setOffset(nextOffset)

    const id = window.requestAnimationFrame(() => {
      setAnimate(true)
      setOffset(0)
      setDisplayDigit(digit)
    })

    return () => window.cancelAnimationFrame(id)
  }, [digit, displayDigit])

  return (
    <span className="digit-window" aria-hidden="true">
      <span
        className={`digit-strip ${animate ? "is-animating" : ""}`}
        style={{ transform: `translateY(-${offset}%)` }}
      >
        {Array.from({ length: 11 }, (_, i) => (
          <span key={`${digit}-${i}`} className="digit-cell">
            {(digit + i) % 10}
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
