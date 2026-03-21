import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { ConnectableSystem } from "../src/game/entity/connectable/ConnectableSystem.ts"
import type { World } from "../src/game/world/World.ts"
import { WoodFenceEntity } from "../src/game/entity/entities/WoodFence.ts"

function createEntity(cellX: number, cellZ: number) {
  const root = new THREE.Group()
  root.userData.def = WoodFenceEntity
  root.userData.cellX = cellX
  root.userData.cellZ = cellZ
  root.userData.sizeInCells = 1
  return root
}

test("ConnectableSystem connecte les barrières sur les quatre directions cardinales", () => {
  const world = {
    cellSize: 1,
  } as unknown as World

  const system = new ConnectableSystem(world)
  const center = createEntity(10, 10)
  const north = createEntity(10, 11)
  const east = createEntity(11, 10)
  const south = createEntity(10, 9)
  const west = createEntity(9, 10)

  system.register(center)
  system.register(north)
  system.register(east)
  system.register(south)
  system.register(west)

  assert.deepEqual(system.computePlacementLayout(WoodFenceEntity, 10, 10), {
    north: true,
    east: true,
    south: true,
    west: true,
  })
})

test("ConnectableSystem ignore les diagonales", () => {
  const world = {
    cellSize: 1,
  } as unknown as World

  const system = new ConnectableSystem(world)
  system.register(createEntity(4, 4))
  system.register(createEntity(5, 5))

  assert.deepEqual(system.computePlacementLayout(WoodFenceEntity, 4, 4), {
    north: false,
    east: false,
    south: false,
    west: false,
  })
})


test("le registre supporte aussi la famille bush", async () => {
  const { createConnectableVisual, getDefaultConnectableLayout } = await import("../src/game/entity/connectable/ConnectableRegistry.ts")
  const { BushEntity } = await import("../src/game/entity/entities/Bush.ts")

  const visual = createConnectableVisual(BushEntity, 1, getDefaultConnectableLayout())
  assert.equal(visual.children.length > 0, true)
})


test("une clôture isolée conserve la rotation de variante et génère une hitbox exploitable", async () => {
  const world = {
    cellSize: 1,
  } as unknown as World

  const { syncConnectableEntityVisual } = await import("../src/game/entity/connectable/ConnectableSystem.ts")
  const root = createEntity(2, 2)
  root.userData.connectableVariantRotY = Math.PI / 2

  syncConnectableEntityVisual(world, root)

  const visual = root.getObjectByName("__connectable_visual__")
  const hitbox = root.getObjectByName("__hitbox__") as THREE.Mesh | null

  assert.ok(visual)
  assert.equal(visual?.rotation.y, Math.PI / 2)
  assert.ok(hitbox)
  assert.ok(hitbox?.geometry instanceof THREE.BoxGeometry)
  assert.ok((hitbox?.geometry as THREE.BoxGeometry).parameters.width >= 0.68)
})
