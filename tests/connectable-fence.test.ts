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
