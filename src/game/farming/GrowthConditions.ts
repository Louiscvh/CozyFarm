// src/game/farming/GrowthConditions.ts
import { Time } from "../core/Time"
import type { Weather } from "../system/Weather"
import { getSeasonState } from "../system/Season"

export interface GrowthConditions {
    /** Multiplicateur final appliqué à deltaTime pour la croissance (hors arrosage) */
    readonly growthRate: number
    /** Bonus appliqué par cellule si le sol est arrosé */
    readonly wateredMult: number
    /** Détail pour debug/UI */
    readonly breakdown: {
        timePaused: boolean
        temperatureMult: number
        rainMult: number
        timeSpeedMult: number
        seasonMult: number
        wateredMult: number
    }
}

/** Bonus de croissance quand le sol est arrosé */
const WATERED_MULT = 1.5

/**
 * Calcule le multiplicateur de croissance global (météo + temps).
 * Le bonus d'arrosage (wateredMult) est retourné séparément car il
 * s'applique par cellule dans CropManager.update().
 *
 * Règles :
 *  - Pause        → 0 (arrêt total)
 *  - Température  → courbe gaussienne centrée sur 18°C, min 0 à -5°C et +45°C
 *  - Pluie        → bonus +20-30% (l'eau aide)
 *  - Arrosage     → bonus +50% si le sol est arrosé
 *  - Vitesse      → appliquée directement (x5 = pousse 5× plus vite)
 */
export function computeGrowthRate(weather: Weather | null): GrowthConditions {
    // ── Pause ──────────────────────────────────────────────────────
    if (Time.timeScale === 0) {
        return {
            growthRate: 0,
            wateredMult: WATERED_MULT,
            breakdown: {
                timePaused: true,
                temperatureMult: 0,
                rainMult: 0,
                timeSpeedMult: 0,
                seasonMult: 0,
                wateredMult: WATERED_MULT,
            },
        }
    }

    // ── Température ────────────────────────────────────────────────
    const temp = weather?.getTemperature() ?? 18
    const temperatureMult = temperatureMultiplier(temp)

    // ── Pluie ──────────────────────────────────────────────────────
    const rainIntensity = weather?.getRainIntensity() ?? "none"
    const rainMult = rainIntensity === "none" ? 1.0
        : rainIntensity === "light" ? 1.2
            : 1.3  // heavy

    // ── Vitesse du temps ───────────────────────────────────────────
    const timeSpeedMult = Time.timeScale
    const seasonMult = getSeasonState().season.growthMultiplier

    const growthRate = temperatureMult * rainMult * timeSpeedMult * seasonMult

    return {
        growthRate,
        wateredMult: WATERED_MULT,
        breakdown: {
            timePaused: false,
            temperatureMult,
            rainMult,
            timeSpeedMult,
            seasonMult,
            wateredMult: WATERED_MULT,
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
    const optimal = 18
    if (temp <= optimal) {
        const t = (temp - (-5)) / (optimal - (-5))
        return smoothstep(t)
    } else {
        const t = 1 - (temp - optimal) / (45 - optimal)
        return smoothstep(t)
    }
}

function smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
}
