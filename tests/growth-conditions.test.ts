import test from "node:test"
import assert from "node:assert/strict"
import { Time } from "../src/game/core/Time.ts"
import { computeGrowthRate } from "../src/game/farming/GrowthConditions.ts"

type MockWeather = {
  getTemperature: () => number
  getRainIntensity: () => "none" | "light" | "moderate" | "heavy"
}

function resetTime() {
  Time.delta = 0
  Time.elapsed = 0
  Time.timeScale = 1
}

test("computeGrowthRate retourne 0 en pause", () => {
  resetTime()
  Time.timeScale = 0

  const result = computeGrowthRate(null)

  assert.equal(result.growthRate, 0)
  assert.equal(result.breakdown.timePaused, true)
  assert.equal(result.wateredMult, 1.5)
})

test("computeGrowthRate combine température, pluie, vitesse et saison", () => {
  resetTime()
  Time.elapsed = Time.cycleSeconds * 12
  Time.timeScale = 2

  const weather: MockWeather = {
    getTemperature: () => 18,
    getRainIntensity: () => "heavy",
  }

  const result = computeGrowthRate(weather as never)

  assert.ok(Math.abs(result.growthRate - 3.12) < 1e-9)
  assert.equal(result.breakdown.seasonMult, 1.2)
})

test("computeGrowthRate annule la croissance à température extrême", () => {
  resetTime()
  const weather: MockWeather = {
    getTemperature: () => -10,
    getRainIntensity: () => "none",
  }

  const result = computeGrowthRate(weather as never)

  assert.equal(result.growthRate, 0)
  assert.equal(result.breakdown.temperatureMult, 0)
})
