import { useEffect, useState } from "react"
import "./LoaderOverlay.css"

type Phase = "start" | "reveal" | "logo-bounce" | "logo-gone" | "done"

export const LoaderOverlay = () => {
  const [phase, setPhase] = useState<Phase>("start")

  useEffect(() => {
    const timers: number[] = []

    timers.push(
      window.setTimeout(() => {
        setPhase("reveal")
      }, 100)
    )

    timers.push(
      window.setTimeout(() => {
        setPhase("logo-bounce")
      }, 2000)
    )

    // juste après la fin de l'animation du logo (0.9s)
    timers.push(
      window.setTimeout(() => {
        setPhase("logo-gone")
      }, 2500)
    )

    timers.push(
      window.setTimeout(() => {
        setPhase("done")
      }, 3000)
    )

    return () => timers.forEach(clearTimeout)
  }, [])

  if (phase === "done") return null

  return (
    <div className="loader-root">
      <div className="loader-logo-wrap">
        <img
          src="/images/logo_CF.png"
          alt="Cozy Farm"
          className={[
            "loader-logo",
            phase === "logo-bounce" ? "bounce" : "",
            phase === "logo-gone" ? "gone" : "",
          ].join(" ")}
        />
      </div>

      <div
        className={`loader-overlay ${
          phase === "reveal" || phase === "logo-bounce" || phase === "logo-gone"
            ? "reveal"
            : ""
        } ${phase === "logo-bounce" || phase === "logo-gone" ? "hidden" : ""}`}
      />
    </div>
  )
}