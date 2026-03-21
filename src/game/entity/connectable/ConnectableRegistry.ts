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
  variantRotationY: number
}

export interface ConnectableFamilyDefinition {
  readonly family: string
  createVisual(ctx: ConnectableBuildContext): THREE.Object3D
}

const FENCE_BROWN_MAT = new THREE.MeshStandardMaterial({
  color: 0x8b5a2b,
  roughness: 0.9,
  metalness: 0.02,
})

const BUSH_MAT = new THREE.MeshStandardMaterial({
  color: 0x497a36,
  roughness: 1,
  metalness: 0,
})

function createBox(size: THREE.Vector3Tuple, material: THREE.Material, position: THREE.Vector3Tuple): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createSphere(radius: number, material: THREE.Material, position: THREE.Vector3Tuple): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createFenceStandalone(cellSize: number, variantRotationY: number): THREE.Object3D {
  const group = new THREE.Group()
  const postWidth = cellSize * 0.14
  const postHeight = cellSize * 0.82
  const railThickness = cellSize * 0.08
  const halfSpan = cellSize * 0.28

  group.add(createBox([postWidth, postHeight, postWidth], FENCE_BROWN_MAT, [-halfSpan, postHeight / 2, 0]))
  group.add(createBox([postWidth, postHeight, postWidth], FENCE_BROWN_MAT, [halfSpan, postHeight / 2, 0]))
  group.add(createBox([halfSpan * 2, railThickness, railThickness], FENCE_BROWN_MAT, [0, cellSize * 0.3, 0]))
  group.add(createBox([halfSpan * 2, railThickness, railThickness], FENCE_BROWN_MAT, [0, cellSize * 0.56, 0]))
  group.rotation.y = variantRotationY
  return group
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

    group.add(createBox(size, FENCE_BROWN_MAT, pos))
  }

  const capSize: THREE.Vector3Tuple = isVertical
    ? [postThickness * 0.7, cellSize * 0.7, capLength]
    : [capLength, cellSize * 0.7, postThickness * 0.7]

  const capPos: THREE.Vector3Tuple = isVertical
    ? [0, cellSize * 0.35, sign * (cellSize * 0.5 - capLength * 0.5)]
    : [sign * (cellSize * 0.5 - capLength * 0.5), cellSize * 0.35, 0]

  group.add(createBox(capSize, FENCE_BROWN_MAT, capPos))
}

function createFenceVisual({ cellSize, layout, variantRotationY }: ConnectableBuildContext): THREE.Object3D {
  const activeDirections = (Object.entries(layout) as Array<[ConnectableDirection, boolean]>)
    .filter(([, connected]) => connected)
    .map(([direction]) => direction)

  if (activeDirections.length === 0) return createFenceStandalone(cellSize, variantRotationY)

  const group = new THREE.Group()
  const postWidth = cellSize * 0.16
  const postHeight = cellSize * 0.84
  const capHeight = cellSize * 0.06

  group.add(createBox([postWidth, postHeight, postWidth], FENCE_BROWN_MAT, [0, postHeight / 2, 0]))
  group.add(createBox([postWidth * 1.55, capHeight, postWidth * 1.55], FENCE_BROWN_MAT, [0, postHeight + capHeight / 2, 0]))

  for (const direction of activeDirections) addFenceRail(group, cellSize, direction)
  return group
}

function addBushArm(group: THREE.Group, cellSize: number, direction: ConnectableDirection): void {
  const sign = direction === "north" || direction === "east" ? 1 : -1
  const isVertical = direction === "north" || direction === "south"
  const armLength = cellSize * 0.32
  const armThickness = cellSize * 0.18

  const size: THREE.Vector3Tuple = isVertical
    ? [armThickness * 1.1, armThickness, armLength]
    : [armLength, armThickness, armThickness * 1.1]

  const pos: THREE.Vector3Tuple = isVertical
    ? [0, cellSize * 0.22, sign * cellSize * 0.2]
    : [sign * cellSize * 0.2, cellSize * 0.22, 0]

  group.add(createBox(size, BUSH_MAT, pos))

  const puffPos: THREE.Vector3Tuple = isVertical
    ? [0, cellSize * 0.3, sign * cellSize * 0.34]
    : [sign * cellSize * 0.34, cellSize * 0.3, 0]

  group.add(createSphere(cellSize * 0.18, BUSH_MAT, puffPos))
}

function createBushVisual({ cellSize, layout }: ConnectableBuildContext): THREE.Object3D {
  const group = new THREE.Group()
  group.add(createSphere(cellSize * 0.28, BUSH_MAT, [0, cellSize * 0.28, 0]))
  group.add(createSphere(cellSize * 0.22, BUSH_MAT, [-cellSize * 0.14, cellSize * 0.18, cellSize * 0.08]))
  group.add(createSphere(cellSize * 0.2, BUSH_MAT, [cellSize * 0.12, cellSize * 0.18, -cellSize * 0.1]))

  for (const [direction, connected] of Object.entries(layout) as Array<[ConnectableDirection, boolean]>) {
    if (!connected) continue
    addBushArm(group, cellSize, direction)
  }

  return group
}

const families = new Map<string, ConnectableFamilyDefinition>([
  ["wood_fence", { family: "wood_fence", createVisual: createFenceVisual }],
  ["bush", { family: "bush", createVisual: createBushVisual }],
])

export function getDefaultConnectableLayout(): ConnectableLayout {
  return { north: false, east: false, south: false, west: false }
}

export function getConnectableFamilyDefinition(family: string): ConnectableFamilyDefinition {
  const definition = families.get(family)
  if (!definition) throw new Error(`[ConnectableRegistry] Famille inconnue: ${family}`)
  return definition
}

export function createConnectableVisual(entity: Entity, cellSize: number, layout: ConnectableLayout, variantRotationY = 0): THREE.Object3D {
  const family = entity.connectable?.family
  if (!family) throw new Error(`[ConnectableRegistry] L'entité ${entity.id} n'est pas connectable.`)
  return getConnectableFamilyDefinition(family).createVisual({ cellSize, entity, layout, variantRotationY })
}
