import "./PrecipitationOverlay.css"
import { useEffect, useState } from "react"
import { Renderer } from "../../render/Renderer"
import { getSeasonState } from "../../game/system/Season"

type OverlayMode = "none" | "rain" | "snow"

interface Particle {
  id: number
  left: number
  delay: number
  duration: number
  drift: number
  scale: number
}

export const PrecipitationOverlay = () => {
  const [mode, setMode] = useState<OverlayMode>("none")
  const [intensity, setIntensity] = useState(0)

  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 120 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: -Math.random() * 6,
      duration: 3.6 + Math.random() * 2.2,
      drift: (Math.random() - 0.5) * 18,
      scale: 0.7 + Math.random() * 1.1,
    })),
  )

  useEffect(() => {
    const id = setInterval(() => {
      const weather = Renderer.instance?.world?.weather
      if (!weather) return
      const rainIntensity = weather.getRainIntensity()
      if (rainIntensity === "none") {
        setMode("none")
        setIntensity(0)
        return
      }

      const isWinter = getSeasonState().season.id === "winter"
      setMode(isWinter ? "snow" : "rain")
      setIntensity(rainIntensity === "light" ? 0.45 : rainIntensity === "moderate" ? 0.75 : 1)
    }, 150)

    return () => clearInterval(id)
  }, [])

  if (mode === "none") return null

  return (
    <div className={`precip-overlay ${mode}`} aria-hidden>
      {particles.map(p => (
        <span
          key={p.id}
          className="precip-particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${Math.max(1.2, p.duration / Math.max(0.35, intensity))}s`,
            ["--drift" as string]: `${p.drift}px`,
            ["--scale" as string]: `${p.scale}`,
            opacity: 0.35 + intensity * 0.55,
          }}
        />
      ))}
    </div>
  )
}
