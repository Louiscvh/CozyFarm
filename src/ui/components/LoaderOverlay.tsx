import { useEffect, useState } from "react"
import "./LoaderOverlay.css"

type Phase = "start" | "reveal" | "logo-bounce" | "logo-gone" | "done"

export const LoaderOverlay = () => {
  const [phase, setPhase] = useState<Phase>("start")
  const particles = Array.from({ length: 18 }, (_, index) => index)

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
      <div
        className={`loader-particles ${
          phase === "logo-gone" ? "fade-out" : ""
        }`}
      >
        {particles.map((particle) => (
          <span
            key={particle}
            className={`loader-particle variant-${particle % 3}`}
            style={{
              left: `${(particle * 17) % 100}%`,
              animationDelay: `${(particle % 6) * -0.7}s`,
              animationDuration: `${5.2 + (particle % 5) * 0.8}s`,
            }}
          />
        ))}
      </div>

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
