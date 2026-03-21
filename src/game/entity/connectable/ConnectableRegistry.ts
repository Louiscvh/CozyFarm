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

export interface ConnectableHitboxSpec {
  size: THREE.Vector3Tuple
  center: THREE.Vector3Tuple
}

export interface ConnectableFamilyDefinition {
  readonly family: string
  createVisual(ctx: ConnectableBuildContext): THREE.Object3D
  createHitbox(ctx: ConnectableBuildContext): ConnectableHitboxSpec
}

interface BoxInstanceSpec {
  size: THREE.Vector3Tuple
  position: THREE.Vector3Tuple
}

const boxGeometryCache = new Map<string, THREE.BoxGeometry>()
const dummy = new THREE.Object3D()

const FENCE_BROWN_MAT = new THREE.MeshStandardMaterial({
  color: 0x8b5a2b,
  roughness: 0.9,
  metalness: 0.02,
})

const BUSH_MAT = new THREE.MeshStandardMaterial({
  color: 0x4d7f38,
  roughness: 1,
  metalness: 0,
})

function createLeafTexture(): THREE.Texture {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext("2d")

    if (ctx) {
      ctx.fillStyle = "#3f6f2e"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (let i = 0; i < 85; i++) {
        const x = Math.random() * canvas.width
        const y = Math.random() * canvas.height
        const w = 10 + Math.random() * 20
        const h = 5 + Math.random() * 12
        const rot = Math.random() * Math.PI

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.fillStyle = i % 3 === 0 ? "#6ea851" : i % 3 === 1 ? "#5d9545" : "#87bf64"
        ctx.beginPath()
        ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(2, 2)
      return texture
    }
  }

  const size = 4
  const data = new Uint8Array([
    63, 111, 46, 255, 97, 149, 69, 255, 88, 136, 62, 255, 120, 175, 83, 255,
    92, 140, 65, 255, 134, 190, 92, 255, 73, 119, 52, 255, 109, 165, 77, 255,
    78, 125, 55, 255, 114, 170, 81, 255, 87, 133, 62, 255, 128, 184, 90, 255,
    69, 115, 49, 255, 100, 154, 72, 255, 84, 130, 60, 255, 118, 176, 82, 255,
  ])
  const texture = new THREE.DataTexture(data, size, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.needsUpdate = true
  return texture
}

const LEAF_TEXTURE = createLeafTexture()
BUSH_MAT.map = LEAF_TEXTURE
BUSH_MAT.color.setHex(0xffffff)
BUSH_MAT.needsUpdate = true

function geometryKey(size: THREE.Vector3Tuple): string {
  return size.join("x")
}

function getBoxGeometry(size: THREE.Vector3Tuple): THREE.BoxGeometry {
  const key = geometryKey(size)
  let geometry = boxGeometryCache.get(key)
  if (!geometry) {
    geometry = new THREE.BoxGeometry(...size)
    boxGeometryCache.set(key, geometry)
  }
  return geometry
}

function createInstancedBoxes(instances: BoxInstanceSpec[], material: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const buckets = new Map<string, BoxInstanceSpec[]>()

  for (const instance of instances) {
    const key = geometryKey(instance.size)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(instance)
    else buckets.set(key, [instance])
  }

  for (const [key, batch] of buckets) {
    const mesh = new THREE.InstancedMesh(getBoxGeometry(batch[0].size), material, batch.length)
    mesh.name = `__instanced_boxes__:${key}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.userData.keepGeometryAlive = true

    for (let i = 0; i < batch.length; i++) {
      dummy.position.set(...batch[i].position)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  return group
}

function pushBox(instances: BoxInstanceSpec[], size: THREE.Vector3Tuple, position: THREE.Vector3Tuple): void {
  instances.push({ size, position })
}

function createFenceStandalone(cellSize: number, variantRotationY: number): THREE.Object3D {
  const postWidth = cellSize * 0.14
  const postHeight = cellSize * 0.82
  const railThickness = cellSize * 0.08
  const railSpan = cellSize * 0.58
  const postOffset = railSpan * 0.5
  const instances: BoxInstanceSpec[] = []

  pushBox(instances, [postWidth, postHeight, postWidth], [-postOffset, postHeight / 2, 0])
  pushBox(instances, [postWidth, postHeight, postWidth], [postOffset, postHeight / 2, 0])
  pushBox(instances, [railSpan, railThickness, railThickness], [0, cellSize * 0.28, 0])
  pushBox(instances, [railSpan, railThickness, railThickness], [0, cellSize * 0.53, 0])

  const group = createInstancedBoxes(instances, FENCE_BROWN_MAT)
  group.rotation.y = variantRotationY
  return group
}

function addFenceRail(instances: BoxInstanceSpec[], cellSize: number, direction: ConnectableDirection): void {
  const postThickness = cellSize * 0.15
  const railThickness = cellSize * 0.08
  const railLength = cellSize * 0.5 - postThickness * 0.7
  const yLevels = [cellSize * 0.28, cellSize * 0.53]

  const isVertical = direction === "north" || direction === "south"
  const sign = direction === "north" || direction === "east" ? 1 : -1
  const axisOffset = postThickness * 0.35 + railLength * 0.5

  for (const y of yLevels) {
    const size: THREE.Vector3Tuple = isVertical
      ? [railThickness, railThickness, railLength]
      : [railLength, railThickness, railThickness]

    const pos: THREE.Vector3Tuple = isVertical
      ? [0, y, sign * axisOffset]
      : [sign * axisOffset, y, 0]

    pushBox(instances, size, pos)
  }
}

function addFenceJoinPost(instances: BoxInstanceSpec[], cellSize: number, direction: ConnectableDirection): void {
  if (direction !== "north" && direction !== "east") return

  const postWidth = cellSize * 0.12
  const postHeight = cellSize * 0.54
  const edgeOffset = cellSize * 0.5 - postWidth * 0.5

  if (direction === "north") {
    pushBox(instances, [postWidth, postHeight, postWidth], [0, postHeight / 2, edgeOffset])
    return
  }

  pushBox(instances, [postWidth, postHeight, postWidth], [edgeOffset, postHeight / 2, 0])
}

function createFenceVisual({ cellSize, layout, variantRotationY }: ConnectableBuildContext): THREE.Object3D {
  const activeDirections = (Object.entries(layout) as Array<[ConnectableDirection, boolean]>)
    .filter(([, connected]) => connected)
    .map(([direction]) => direction)

  if (activeDirections.length === 0) return createFenceStandalone(cellSize, variantRotationY)

  const postWidth = cellSize * 0.15
  const postHeight = cellSize * 0.84
  const instances: BoxInstanceSpec[] = []

  pushBox(instances, [postWidth, postHeight, postWidth], [0, postHeight / 2, 0])

  for (const direction of activeDirections) {
    addFenceRail(instances, cellSize, direction)
    addFenceJoinPost(instances, cellSize, direction)
  }

  return createInstancedBoxes(instances, FENCE_BROWN_MAT)
}

function createFenceHitbox({ cellSize, layout }: ConnectableBuildContext): ConnectableHitboxSpec {
  const halfCell = cellSize * 0.5
  const minExtent = cellSize * 0.34

  let minX = -minExtent
  let maxX = minExtent
  let minZ = -minExtent
  let maxZ = minExtent

  if (layout.west) minX = -halfCell
  if (layout.east) maxX = halfCell
  if (layout.south) minZ = -halfCell
  if (layout.north) maxZ = halfCell

  return {
    size: [maxX - minX, cellSize * 0.92, maxZ - minZ],
    center: [(minX + maxX) / 2, cellSize * 0.46, (minZ + maxZ) / 2],
  }
}

function addHedgeSegment(instances: BoxInstanceSpec[], cellSize: number, direction: ConnectableDirection): void {
  const isVertical = direction === "north" || direction === "south"
  const sign = direction === "north" || direction === "east" ? 1 : -1
  const length = cellSize * 0.34
  const thickness = cellSize * 0.42
  const centerOffset = cellSize * 0.29

  const size: THREE.Vector3Tuple = isVertical
    ? [thickness, cellSize * 0.9, length]
    : [length, cellSize * 0.9, thickness]

  const pos: THREE.Vector3Tuple = isVertical
    ? [0, cellSize * 0.45, sign * centerOffset]
    : [sign * centerOffset, cellSize * 0.45, 0]

  pushBox(instances, size, pos)
}

function createBushVisual({ cellSize, layout }: ConnectableBuildContext): THREE.Object3D {
  const instances: BoxInstanceSpec[] = []
  pushBox(instances, [cellSize * 0.58, cellSize * 0.92, cellSize * 0.58], [0, cellSize * 0.46, 0])

  for (const [direction, connected] of Object.entries(layout) as Array<[ConnectableDirection, boolean]>) {
    if (!connected) continue
    addHedgeSegment(instances, cellSize, direction)
  }

  return createInstancedBoxes(instances, BUSH_MAT)
}

function createBushHitbox({ cellSize, layout }: ConnectableBuildContext): ConnectableHitboxSpec {
  const halfCell = cellSize * 0.5
  const coreHalf = cellSize * 0.29

  let minX = -coreHalf
  let maxX = coreHalf
  let minZ = -coreHalf
  let maxZ = coreHalf

  if (layout.west) minX = -halfCell
  if (layout.east) maxX = halfCell
  if (layout.south) minZ = -halfCell
  if (layout.north) maxZ = halfCell

  return {
    size: [maxX - minX, cellSize * 0.96, maxZ - minZ],
    center: [(minX + maxX) / 2, cellSize * 0.48, (minZ + maxZ) / 2],
  }
}

const families = new Map<string, ConnectableFamilyDefinition>([
  ["wood_fence", { family: "wood_fence", createVisual: createFenceVisual, createHitbox: createFenceHitbox }],
  ["bush", { family: "bush", createVisual: createBushVisual, createHitbox: createBushHitbox }],
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

export function createConnectableHitbox(entity: Entity, cellSize: number, layout: ConnectableLayout, variantRotationY = 0): ConnectableHitboxSpec {
  const family = entity.connectable?.family
  if (!family) throw new Error(`[ConnectableRegistry] L'entité ${entity.id} n'est pas connectable.`)
  return getConnectableFamilyDefinition(family).createHitbox({ cellSize, entity, layout, variantRotationY })
}
