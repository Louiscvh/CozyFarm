import test from "node:test"
import assert from "node:assert/strict"
import { decaySoilHydration, easeSoilHydration, getSoilDryingMultiplier, getSoilHydrationStage, increaseSoilHydration, saturateSoilHydration, SOIL_HYDRATION_MAX, SOIL_HYDRATION_STEP_DURATION } from "../src/game/farming/SoilHydration.ts"

test("deux arrosages montent à 2 niveaux puis sèchent progressivement", () => {
  const once = increaseSoilHydration(0)
  const twice = increaseSoilHydration(once)

  assert.equal(once, 1)
  assert.equal(twice, 2)
  assert.equal(getSoilHydrationStage(twice), 2)

  const afterOneStage = decaySoilHydration(twice, SOIL_HYDRATION_STEP_DURATION, 18)
  assert.ok(afterOneStage < 1.05)
  assert.ok(afterOneStage > 0.9)
  assert.equal(getSoilHydrationStage(afterOneStage), 1)

  const dry = decaySoilHydration(afterOneStage, SOIL_HYDRATION_STEP_DURATION, 18)
  assert.equal(dry, 0)
  assert.equal(getSoilHydrationStage(dry), 0)
})

test("plus il fait chaud, plus le soil sèche vite", () => {
  const mild = decaySoilHydration(2, SOIL_HYDRATION_STEP_DURATION, 18)
  const hot = decaySoilHydration(2, SOIL_HYDRATION_STEP_DURATION, 32)

  assert.ok(getSoilDryingMultiplier(32) > getSoilDryingMultiplier(18))
  assert.ok(hot < mild)
})

test("la pluie sature le sol au niveau max puis laisse la décrue continuer", () => {
  const rainHydrated = saturateSoilHydration()
  assert.equal(rainHydrated, SOIL_HYDRATION_MAX)
  assert.equal(getSoilHydrationStage(rainHydrated), 2)

  const afterRainStops = decaySoilHydration(rainHydrated, SOIL_HYDRATION_STEP_DURATION, 18)
  assert.ok(afterRainStops < SOIL_HYDRATION_MAX)
  assert.equal(getSoilHydrationStage(afterRainStops), 1)
})

test("le rendu d'hydratation se fait avec un easing et non un saut instantané", () => {
  const firstStep = easeSoilHydration(0, SOIL_HYDRATION_MAX, 0.05)
  assert.ok(firstStep > 0)
  assert.ok(firstStep < SOIL_HYDRATION_MAX)

  const nearTarget = easeSoilHydration(firstStep, SOIL_HYDRATION_MAX, 0.8)
  assert.ok(nearTarget > firstStep)
  assert.ok(nearTarget <= SOIL_HYDRATION_MAX)
})
