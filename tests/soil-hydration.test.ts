import test from "node:test"
import assert from "node:assert/strict"
import { decaySoilHydration, getSoilHydrationStage, increaseSoilHydration, SOIL_HYDRATION_STEP_DURATION } from "../src/game/farming/SoilHydration.ts"

test("deux arrosages montent à 2 niveaux puis sèchent progressivement", () => {
  const once = increaseSoilHydration(0)
  const twice = increaseSoilHydration(once)

  assert.equal(once, 1)
  assert.equal(twice, 2)
  assert.equal(getSoilHydrationStage(twice), 2)

  const afterOneStage = decaySoilHydration(twice, SOIL_HYDRATION_STEP_DURATION)
  assert.equal(afterOneStage, 1)
  assert.equal(getSoilHydrationStage(afterOneStage), 1)

  const dry = decaySoilHydration(afterOneStage, SOIL_HYDRATION_STEP_DURATION)
  assert.equal(dry, 0)
  assert.equal(getSoilHydrationStage(dry), 0)
})

test("la pluie force les soils à être considérés comme hydratés", () => {
  assert.equal(getSoilHydrationStage(0, true), 2)
  assert.equal(getSoilHydrationStage(0.2, true), 2)
})
