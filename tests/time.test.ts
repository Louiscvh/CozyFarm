import test from "node:test"
import assert from "node:assert/strict"
import { Time } from "../src/game/core/Time.ts"

function resetTime() {
  Time.delta = 0
  Time.elapsed = Time.cycleSeconds / 2
  Time.timeScale = 1
}

test("Time.update cap le delta et applique la vitesse", () => {
  resetTime()
  Time.setSpeed(2)

  Time.update(0.2)

  assert.equal(Time.delta, 0.2)
  assert.equal(Time.elapsed, Time.cycleSeconds / 2 + 0.2)
})

test("Time.jumpToDayT recale le temps logique et conserve une transition visuelle", () => {
  resetTime()
  const beforeVisual = Time.getVisualDayT()

  Time.jumpToDayT(0.1, 1)

  assert.equal(Time.getLogicalDayT(), 0.1)
  assert.notEqual(Time.getVisualDayT(), 0.1)

  Time.update(1)
  const afterTransition = Time.getVisualDayT()
  assert.ok(Math.abs(afterTransition - Time.getLogicalDayT()) < 1e-9)
  assert.notEqual(beforeVisual, 0.1)
})
