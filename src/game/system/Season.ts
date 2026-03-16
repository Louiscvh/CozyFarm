import { Time } from "../core/Time"

export type SeasonId = "autumn" | "winter" | "spring" | "summer"

export interface SeasonConfig {
  id: SeasonId
  label: string
  shortLabel: string
  skyColor: string
  lightTint: string
  terrainTint: string
  temperatureOffset: number
  growthMultiplier: number
}

export interface SeasonState {
  season: SeasonConfig
  seasonIndex: number
  seasonProgress: number
  yearProgress: number
  nextSeasonLabel: string
}

const DAYS_PER_SEASON = 3
const SEASONS: SeasonConfig[] = [
  { id: "autumn", label: "Automne", shortLabel: "A", skyColor: "#f4b184", lightTint: "#ffd2b0", terrainTint: "#d59f72", temperatureOffset: -2, growthMultiplier: 0.9 },
  { id: "winter", label: "Hiver", shortLabel: "H", skyColor: "#cfe4ff", lightTint: "#e6f1ff", terrainTint: "#e5edf7", temperatureOffset: -8, growthMultiplier: 0.55 },
  { id: "spring", label: "Printemps", shortLabel: "P", skyColor: "#b7e6c9", lightTint: "#e0ffd9", terrainTint: "#8ccd7b", temperatureOffset: 1, growthMultiplier: 1.2 },
  { id: "summer", label: "Été", shortLabel: "E", skyColor: "#8fd4ff", lightTint: "#fff2c2", terrainTint: "#95cc66", temperatureOffset: 5, growthMultiplier: 1.05 },
]

const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length

function wrap01(v: number): number {
  return ((v % 1) + 1) % 1
}

export function getSeasonState(): SeasonState {
  const totalDays = Time.elapsed / Time.cycleSeconds
  const yearProgress = wrap01(totalDays / DAYS_PER_YEAR)
  const yearDay = yearProgress * DAYS_PER_YEAR
  const seasonIndex = Math.min(SEASONS.length - 1, Math.floor(yearDay / DAYS_PER_SEASON))
  const seasonProgress = (yearDay - seasonIndex * DAYS_PER_SEASON) / DAYS_PER_SEASON

  return {
    season: SEASONS[seasonIndex],
    seasonIndex,
    seasonProgress,
    yearProgress,
    nextSeasonLabel: SEASONS[(seasonIndex + 1) % SEASONS.length].label,
  }
}

export function shiftSeason(step: -1 | 1): void {
  const totalDays = Time.elapsed / Time.cycleSeconds
  const dayProgress = Time.getLogicalDayT()
  const absoluteSeason = Math.floor(totalDays / DAYS_PER_SEASON)
  const targetAbsoluteSeason = Math.max(0, absoluteSeason + step)
  const targetTotalDays = targetAbsoluteSeason * DAYS_PER_SEASON + dayProgress
  Time.elapsed = targetTotalDays * Time.cycleSeconds
}
