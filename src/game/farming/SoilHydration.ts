export const SOIL_HYDRATION_MAX = 2
export const SOIL_HYDRATION_STEP_DURATION = 28
export const SOIL_HYDRATION_VISUAL_SMOOTHING = 0.22
export const SOIL_HYDRATION_REFERENCE_TEMPERATURE = 18

export type SoilHydrationStage = 0 | 1 | 2

export function clampSoilHydration(value: number): number {
    return Math.max(0, Math.min(SOIL_HYDRATION_MAX, value))
}

export function increaseSoilHydration(current: number, levels: number = 1): number {
    return clampSoilHydration(current + Math.max(0, levels))
}

export function saturateSoilHydration(): number {
    return SOIL_HYDRATION_MAX
}

export function getSoilDryingMultiplier(temperature: number = SOIL_HYDRATION_REFERENCE_TEMPERATURE): number {
    const delta = temperature - SOIL_HYDRATION_REFERENCE_TEMPERATURE
    return Math.max(0.7, Math.min(2.2, 1 + delta * 0.045))
}

export function decaySoilHydration(current: number, deltaTime: number, temperature: number = SOIL_HYDRATION_REFERENCE_TEMPERATURE): number {
    if (deltaTime <= 0) return clampSoilHydration(current)
    const dryingMultiplier = getSoilDryingMultiplier(temperature)
    return clampSoilHydration(current - (deltaTime * dryingMultiplier) / SOIL_HYDRATION_STEP_DURATION)
}

export function easeSoilHydration(current: number, target: number, deltaTime: number): number {
    const from = clampSoilHydration(current)
    const to = clampSoilHydration(target)
    if (deltaTime <= 0) return from
    if (Math.abs(to - from) <= 1e-4) return to

    const rawT = 1 - Math.exp(-deltaTime / SOIL_HYDRATION_VISUAL_SMOOTHING)
    const easedT = rawT * rawT * (3 - 2 * rawT)
    const next = from + (to - from) * easedT
    return Math.abs(next - to) <= 1e-3 ? to : next
}

export function getSoilHydrationStage(current: number): SoilHydrationStage {
    if (current > 1e-4) return current > 1 ? 2 : 1
    return 0
}
