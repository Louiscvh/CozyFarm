import test from "node:test"
import assert from "node:assert/strict"
import { Time } from "../src/game/core/Time.ts"
import { getBlendedSeasonValue, getSeasonState, shiftSeason } from "../src/game/system/Season.ts"

function resetTime() {
  Time.delta = 0
  Time.elapsed = 0
  Time.timeScale = 1
}

test("getSeasonState retourne la bonne saison selon le jour", () => {
  resetTime()

  Time.elapsed = Time.cycleSeconds * 30
  assert.equal(getSeasonState().season.id, "winter")

  Time.elapsed = Time.cycleSeconds * 60
  assert.equal(getSeasonState().season.id, "spring")

  Time.elapsed = Time.cycleSeconds * 90
  assert.equal(getSeasonState().season.id, "summer")
})

test("shiftSeason conserve la progression journalière et ne descend pas sous 0", () => {
  resetTime()
  Time.elapsed = Time.cycleSeconds * 30.25

  shiftSeason(1)
  assert.equal(getSeasonState().season.id, "spring")
  assert.ok(Math.abs(Time.getLogicalDayT() - 0.25) < 1e-9)

  Time.elapsed = Time.cycleSeconds * 0.4
  shiftSeason(-1)
  assert.ok(Time.elapsed >= 0)
  assert.equal(getSeasonState().season.id, "autumn")
})


test("getBlendedSeasonValue interpole en douceur entre les saisons", () => {
  const colorAtBoundary = getBlendedSeasonValue(0.25, season => season.treeFoliageTint, (current, next, alpha) => ({ current, next, alpha }))
  assert.deepEqual(colorAtBoundary, { current: "#f7f9fd", next: "#82df72", alpha: 0 })

  const midway = getBlendedSeasonValue(0.125, season => season.treeFoliageTint, (current, next, alpha) => ({ current, next, alpha }))
  assert.deepEqual(midway, { current: "#8b5a2b", next: "#f7f9fd", alpha: 0.5 })
})
