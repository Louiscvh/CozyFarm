import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { ConnectableSystem, syncConnectableEntityVisual } from "../src/game/entity/connectable/ConnectableSystem.ts"
import { createConnectableVisual, getDefaultConnectableLayout } from "../src/game/entity/connectable/ConnectableRegistry.ts"
import type { World } from "../src/game/world/World.ts"
import { WoodFenceEntity } from "../src/game/entity/entities/WoodFence.ts"
import { BushEntity } from "../src/game/entity/entities/Bush.ts"

function createEntity(cellX: number, cellZ: number) {
  const root = new THREE.Group()
  root.userData.def = WoodFenceEntity
  root.userData.cellX = cellX
  root.userData.cellZ = cellZ
  root.userData.sizeInCells = 1
  return root
}

function getInstanceCount(root: THREE.Object3D): number {
  let count = 0
  root.traverse(obj => {
    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      count += (obj as THREE.InstancedMesh).count
    }
  })
  return count
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

test("le registre supporte aussi la famille bush en instanced mesh texturé", () => {
  const visual = createConnectableVisual(BushEntity, 1, getDefaultConnectableLayout())
  const instancedChildren = visual.children.filter(child => (child as THREE.InstancedMesh).isInstancedMesh)

  assert.equal(instancedChildren.length > 0, true)
  assert.equal(((instancedChildren[0] as THREE.InstancedMesh).material as THREE.MeshStandardMaterial).map !== null, true)
})

test("une clôture connectée ajoute un poteau de jonction centré pour combler l'espace", () => {
  const visual = createConnectableVisual(WoodFenceEntity, 1, {
    north: false,
    east: true,
    south: false,
    west: false,
  })
  const box = new THREE.Box3().setFromObject(visual)

  assert.equal(getInstanceCount(visual), 4)
  assert.ok(box.max.x > 0.54)
})

test("un buisson connecté prolonge le volume principal jusqu'au bord de cellule", () => {
  const visual = createConnectableVisual(BushEntity, 1, {
    north: false,
    east: true,
    south: false,
    west: false,
  })
  const box = new THREE.Box3().setFromObject(visual)

  assert.ok(Math.abs(box.max.x - 0.5) < 1e-6)
  assert.ok(Math.abs(box.max.z - 0.29) < 1e-6)
})

test("une clôture isolée conserve la rotation de variante et génère une hitbox exploitable", () => {
  const world = {
    cellSize: 1,
  } as unknown as World

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
