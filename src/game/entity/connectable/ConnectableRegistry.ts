import * as THREE from "three"
import type { Entity } from "../Entity"

export type ConnectableDirection = "north" | "east" | "south" | "west"

export interface ConnectableLayout {
  north: boolean
  east: boolean
  south: boolean
  west: boolean
}

export interface ConnectableBuildContext {
  cellSize: number
  entity: Entity
  layout: ConnectableLayout
}

export interface ConnectableFamilyDefinition {
  readonly family: string
  createVisual(ctx: ConnectableBuildContext): THREE.Object3D
}

const FENCE_WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0x8b5a2b,
  roughness: 0.9,
  metalness: 0.02,
})

const FENCE_METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0xcaa472,
  roughness: 0.5,
  metalness: 0.15,
})

function createBox(size: THREE.Vector3Tuple, material: THREE.Material, position: THREE.Vector3Tuple): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function addFenceRail(group: THREE.Group, cellSize: number, direction: ConnectableDirection): void {
  const postThickness = cellSize * 0.16
  const railThickness = cellSize * 0.08
  const railLength = cellSize * 0.5 - postThickness * 0.55
  const capLength = railThickness * 0.65
  const yLevels = [cellSize * 0.3, cellSize * 0.56]

  const isVertical = direction === "north" || direction === "south"
  const sign = direction === "north" || direction === "east" ? 1 : -1
  const axisOffset = postThickness * 0.3 + railLength * 0.5

  for (const y of yLevels) {
    const size: THREE.Vector3Tuple = isVertical
      ? [railThickness, railThickness, railLength]
      : [railLength, railThickness, railThickness]

    const pos: THREE.Vector3Tuple = isVertical
      ? [0, y, sign * axisOffset]
      : [sign * axisOffset, y, 0]

    group.add(createBox(size, FENCE_WOOD_MAT, pos))
  }

  const capSize: THREE.Vector3Tuple = isVertical
    ? [postThickness * 0.7, cellSize * 0.7, capLength]
    : [capLength, cellSize * 0.7, postThickness * 0.7]

  const capPos: THREE.Vector3Tuple = isVertical
    ? [0, cellSize * 0.35, sign * (cellSize * 0.5 - capLength * 0.5)]
    : [sign * (cellSize * 0.5 - capLength * 0.5), cellSize * 0.35, 0]

  group.add(createBox(capSize, FENCE_WOOD_MAT, capPos))
}

function createFenceVisual({ cellSize, layout }: ConnectableBuildContext): THREE.Object3D {
  const group = new THREE.Group()
  const postWidth = cellSize * 0.16
  const postHeight = cellSize * 0.84
  const capHeight = cellSize * 0.06
  const activeDirections = (Object.entries(layout) as Array<[ConnectableDirection, boolean]>)
    .filter(([, connected]) => connected)
    .map(([direction]) => direction)

  group.add(createBox([postWidth, postHeight, postWidth], FENCE_WOOD_MAT, [0, postHeight / 2, 0]))
  group.add(createBox([postWidth * 1.55, capHeight, postWidth * 1.55], FENCE_METAL_MAT, [0, postHeight + capHeight / 2, 0]))

  if (activeDirections.length === 0) {
    const stubLength = cellSize * 0.18
    const yLevels = [cellSize * 0.3, cellSize * 0.56]
    for (const y of yLevels) {
      group.add(createBox([stubLength, cellSize * 0.07, cellSize * 0.07], FENCE_WOOD_MAT, [0, y, 0]))
      group.add(createBox([cellSize * 0.07, cellSize * 0.07, stubLength], FENCE_WOOD_MAT, [0, y, 0]))
    }
    return group
  }

  for (const direction of activeDirections) addFenceRail(group, cellSize, direction)
  return group
}

const families = new Map<string, ConnectableFamilyDefinition>([
  ["wood_fence", { family: "wood_fence", createVisual: createFenceVisual }],
])

export function getDefaultConnectableLayout(): ConnectableLayout {
  return { north: false, east: false, south: false, west: false }
}

export function getConnectableFamilyDefinition(family: string): ConnectableFamilyDefinition {
  const definition = families.get(family)
  if (!definition) throw new Error(`[ConnectableRegistry] Famille inconnue: ${family}`)
  return definition
}

export function createConnectableVisual(entity: Entity, cellSize: number, layout: ConnectableLayout): THREE.Object3D {
  const family = entity.connectable?.family
  if (!family) throw new Error(`[ConnectableRegistry] L'entité ${entity.id} n'est pas connectable.`)
  return getConnectableFamilyDefinition(family).createVisual({ cellSize, entity, layout })
}
