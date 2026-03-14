import { useEffect, useMemo, useState } from "react"
import "./LoaderOverlay.css"

type Phase = "start" | "reveal" | "logo-bounce" | "logo-gone" | "done"

export const LoaderOverlay = () => {
  const [phase, setPhase] = useState<Phase>("start")
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: index,
        variant: Math.floor(Math.random() * 3),
        top: 4 + Math.random() * 92,
        delay: -Math.random() * 5,
        duration: 5 + Math.random() * 2.4,
        drift: 18 + Math.random() * 24,
      })),
    []
  )

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
            key={particle.id}
            className={`loader-particle variant-${particle.variant}`}
            style={{
              top: `${particle.top}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              ["--wind-drift" as string]: `${particle.drift}px`,
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
