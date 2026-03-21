export const SOIL_HYDRATION_MAX = 2
export const SOIL_HYDRATION_STEP_DURATION = 45

export type SoilHydrationStage = 0 | 1 | 2

export function clampSoilHydration(value: number): number {
    return Math.max(0, Math.min(SOIL_HYDRATION_MAX, value))
}

export function increaseSoilHydration(current: number, levels: number = 1): number {
    return clampSoilHydration(current + Math.max(0, levels))
}

export function decaySoilHydration(current: number, deltaTime: number): number {
    if (deltaTime <= 0) return clampSoilHydration(current)
    return clampSoilHydration(current - deltaTime / SOIL_HYDRATION_STEP_DURATION)
}

export function getSoilHydrationStage(current: number, isRaining: boolean = false): SoilHydrationStage {
    if (isRaining) return 2
    if (current > 1e-4) return current > 1 ? 2 : 1
    return 0
}
