// src/game/farming/GrowthConditions.ts
import { Time } from "../core/Time"
import type { Weather } from "../system/Weather"

export interface GrowthConditions {
    /** Multiplicateur final appliqué à deltaTime pour la croissance */
    readonly growthRate: number
    /** Détail pour debug/UI */
    readonly breakdown: {
        timePaused: boolean
        temperatureMult: number
        rainMult: number
        timeSpeedMult: number
    }
}

/**
 * Calcule le multiplicateur de croissance global.
 *
 * Règles :
 *  - Pause          → 0 (arrêt total)
 *  - Température    → courbe gaussienne centrée sur 18°C, min 0 à -5°C et +45°C
 *  - Pluie          → bonus +30% (l'eau aide)
 *  - Vitesse du temps → appliquée directement (x5 = pousse 5× plus vite)
 */
export function computeGrowthRate(weather: Weather | null): GrowthConditions {
    // ── Pause ──────────────────────────────────────────────────────
    if (Time.timeScale === 0) {
        return {
            growthRate: 0,
            breakdown: {
                timePaused: true,
                temperatureMult: 0,
                rainMult: 0,
                timeSpeedMult: 0,
            },
        }
    }

    // ── Température ────────────────────────────────────────────────
    // Gaussienne : optimal à 18°C, tombe à 0 en dehors de [-5, 45]
    const temp = weather?.getTemperature() ?? 18
    const temperatureMult = temperatureMultiplier(temp)

    // ── Pluie ──────────────────────────────────────────────────────
    const rainIntensity = weather?.getRainIntensity() ?? "none"
    const rainMult = rainIntensity === "none" ? 1.0
        : rainIntensity === "light" ? 1.2
            : 1.3  // heavy

    // ── Vitesse du temps ───────────────────────────────────────────
    const timeSpeedMult = Time.timeScale

    const growthRate = temperatureMult * rainMult * timeSpeedMult

    return {
        growthRate,
        breakdown: {
            timePaused: false,
            temperatureMult,
            rainMult,
            timeSpeedMult,
        },
    }
}

/**
 * Courbe gaussienne de croissance selon la température.
 *
 *  -5°C  →  0.0  (gel)
 *   5°C  →  0.5
 *  18°C  →  1.0  (optimal)
 *  35°C  →  0.6
 *  45°C  →  0.0  (trop chaud)
 */
function temperatureMultiplier(temp: number): number {
    if (temp <= -5) return 0
    if (temp >= 45) return 0

    // Deux demi-gaussiennes pour avoir des pentes asymétriques
    const optimal = 18
    if (temp <= optimal) {
        // Côté froid : de -5 à 18
        const t = (temp - (-5)) / (optimal - (-5))   // 0→1
        return smoothstep(t)
    } else {
        // Côté chaud : de 18 à 45
        const t = 1 - (temp - optimal) / (45 - optimal)  // 1→0
        return smoothstep(t)
    }
}

function smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
}