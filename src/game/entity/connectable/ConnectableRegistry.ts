import * as THREE from "three"
import type { Entity } from "../Entity"

export type ConnectableDirection = "north" | "east" | "south" | "west"
export type ConnectableMaterialKey = "wood_fence" | "bush"

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

export interface ConnectableBoxSpec {
  materialKey: ConnectableMaterialKey
  size: THREE.Vector3Tuple
  position: THREE.Vector3Tuple
  rotationY?: number
}

export interface ConnectableFamilyDefinition {
  readonly family: string
  createBoxes(ctx: ConnectableBuildContext): ConnectableBoxSpec[]
  createHitbox(ctx: ConnectableBuildContext): ConnectableHitboxSpec
}

const boxGeometryCache = new Map<string, THREE.BoxGeometry>()
const dummy = new THREE.Object3D()

const FENCE_BROWN_MAT = new THREE.MeshStandardMaterial({
  color: 0x8b5a2b,
  roughness: 0.9,
  metalness: 0.02,
})

const BUSH_MAT = new THREE.MeshStandardMaterial({
  color: 0x264d21,
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
      ctx.fillStyle = "#24451f"
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
        ctx.fillStyle = i % 3 === 0 ? "#325f29" : i % 3 === 1 ? "#3d7031" : "#487f3a"
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
    36, 69, 31, 255, 61, 112, 49, 255, 50, 95, 41, 255, 74, 128, 58, 255,
    40, 76, 34, 255, 67, 118, 53, 255, 44, 82, 36, 255, 78, 134, 61, 255,
    38, 72, 32, 255, 59, 107, 47, 255, 47, 88, 38, 255, 71, 123, 55, 255,
    34, 65, 29, 255, 54, 100, 44, 255, 43, 80, 35, 255, 65, 115, 51, 255,
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

function getMaterial(materialKey: ConnectableMaterialKey): THREE.Material {
  return materialKey === "wood_fence" ? FENCE_BROWN_MAT : BUSH_MAT
}

function rotatePosition(position: THREE.Vector3Tuple, rotationY: number): THREE.Vector3Tuple {
  if (Math.abs(rotationY) < 1e-6) return position
  const vector = new THREE.Vector3(...position)
  vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)
  return [vector.x, vector.y, vector.z]
}

function createInstancedBoxes(boxes: ConnectableBoxSpec[]): THREE.Group {
  const group = new THREE.Group()
  const buckets = new Map<string, ConnectableBoxSpec[]>()

  for (const box of boxes) {
    const key = `${box.materialKey}§${geometryKey(box.size)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(box)
    else buckets.set(key, [box])
  }

  for (const [key, batch] of buckets) {
    const mesh = new THREE.InstancedMesh(getBoxGeometry(batch[0].size), getMaterial(batch[0].materialKey), batch.length)
    mesh.name = `__instanced_boxes__:${key}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.userData.keepGeometryAlive = true

    for (let i = 0; i < batch.length; i++) {
      dummy.position.set(...batch[i].position)
      dummy.rotation.set(0, batch[i].rotationY ?? 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  return group
}

function pushBox(boxes: ConnectableBoxSpec[], materialKey: ConnectableMaterialKey, size: THREE.Vector3Tuple, position: THREE.Vector3Tuple, rotationY = 0): void {
  boxes.push({ materialKey, size, position, rotationY })
}

function createFenceStandaloneBoxes(cellSize: number, variantRotationY: number): ConnectableBoxSpec[] {
  const postWidth = cellSize * 0.14
  const postHeight = cellSize * 0.86
  const railThickness = cellSize * 0.08
  const railSpan = cellSize * 0.58
  const postOffset = railSpan * 0.5
  const boxes: ConnectableBoxSpec[] = []

  const specs: Array<{ size: THREE.Vector3Tuple; position: THREE.Vector3Tuple }> = [
    { size: [postWidth, postHeight, postWidth], position: [-postOffset, postHeight / 2, 0] },
    { size: [postWidth, postHeight, postWidth], position: [postOffset, postHeight / 2, 0] },
    { size: [railSpan, railThickness, railThickness], position: [0, cellSize * 0.28, 0] },
    { size: [railSpan, railThickness, railThickness], position: [0, cellSize * 0.53, 0] },
  ]

  for (const spec of specs) {
    pushBox(boxes, "wood_fence", spec.size, rotatePosition(spec.position, variantRotationY), variantRotationY)
  }

  return boxes
}

function addFenceRail(boxes: ConnectableBoxSpec[], cellSize: number, direction: ConnectableDirection): void {
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

    pushBox(boxes, "wood_fence", size, pos)
  }
}

function addFenceJoinPost(boxes: ConnectableBoxSpec[], cellSize: number, direction: ConnectableDirection): void {
  if (direction !== "north" && direction !== "east") return

  const postWidth = cellSize * 0.12
  const postHeight = cellSize * 0.6
  const edgeOffset = cellSize * 0.5

  if (direction === "north") {
    pushBox(boxes, "wood_fence", [postWidth, postHeight, postWidth], [0, postHeight / 2, edgeOffset])
    return
  }

  pushBox(boxes, "wood_fence", [postWidth, postHeight, postWidth], [edgeOffset, postHeight / 2, 0])
}

function createFenceBoxes({ cellSize, layout, variantRotationY }: ConnectableBuildContext): ConnectableBoxSpec[] {
  const activeDirections = (Object.entries(layout) as Array<[ConnectableDirection, boolean]>)
    .filter(([, connected]) => connected)
    .map(([direction]) => direction)

  if (activeDirections.length === 0) return createFenceStandaloneBoxes(cellSize, variantRotationY)

  const postWidth = cellSize * 0.15
  const postHeight = cellSize * 0.86
  const boxes: ConnectableBoxSpec[] = []

  pushBox(boxes, "wood_fence", [postWidth, postHeight, postWidth], [0, postHeight / 2, 0])

  for (const direction of activeDirections) {
    addFenceRail(boxes, cellSize, direction)
    addFenceJoinPost(boxes, cellSize, direction)
  }

  return boxes
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
    size: [maxX - minX, cellSize * 0.96, maxZ - minZ],
    center: [(minX + maxX) / 2, cellSize * 0.48, (minZ + maxZ) / 2],
  }
}

function addHedgeSegment(boxes: ConnectableBoxSpec[], cellSize: number, direction: ConnectableDirection): void {
  const isVertical = direction === "north" || direction === "south"
  const sign = direction === "north" || direction === "east" ? 1 : -1
  const length = cellSize * 0.42
  const thickness = cellSize * 0.58
  const centerOffset = cellSize * 0.29

  const size: THREE.Vector3Tuple = isVertical
    ? [thickness, cellSize * 0.9, length]
    : [length, cellSize * 0.9, thickness]

  const pos: THREE.Vector3Tuple = isVertical
    ? [0, cellSize * 0.45, sign * centerOffset]
    : [sign * centerOffset, cellSize * 0.45, 0]

  pushBox(boxes, "bush", size, pos)
}

function createBushBoxes({ cellSize, layout }: ConnectableBuildContext): ConnectableBoxSpec[] {
  const boxes: ConnectableBoxSpec[] = []
  pushBox(boxes, "bush", [cellSize * 0.58, cellSize * 0.92, cellSize * 0.58], [0, cellSize * 0.46, 0])

  for (const [direction, connected] of Object.entries(layout) as Array<[ConnectableDirection, boolean]>) {
    if (!connected) continue
    addHedgeSegment(boxes, cellSize, direction)
  }

  return boxes
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
  ["wood_fence", { family: "wood_fence", createBoxes: createFenceBoxes, createHitbox: createFenceHitbox }],
  ["bush", { family: "bush", createBoxes: createBushBoxes, createHitbox: createBushHitbox }],
])

export function getDefaultConnectableLayout(): ConnectableLayout {
  return { north: false, east: false, south: false, west: false }
}

export function getConnectableFamilyDefinition(family: string): ConnectableFamilyDefinition {
  const definition = families.get(family)
  if (!definition) throw new Error(`[ConnectableRegistry] Famille inconnue: ${family}`)
  return definition
}

export function createConnectableBoxSpecs(entity: Entity, cellSize: number, layout: ConnectableLayout, variantRotationY = 0): ConnectableBoxSpec[] {
  const family = entity.connectable?.family
  if (!family) throw new Error(`[ConnectableRegistry] L'entité ${entity.id} n'est pas connectable.`)
  return getConnectableFamilyDefinition(family).createBoxes({ cellSize, entity, layout, variantRotationY })
}


export function getConnectableMaterial(materialKey: ConnectableMaterialKey): THREE.Material {
  return getMaterial(materialKey)
}

export function createConnectableVisual(entity: Entity, cellSize: number, layout: ConnectableLayout, variantRotationY = 0): THREE.Object3D {
  return createInstancedBoxes(createConnectableBoxSpecs(entity, cellSize, layout, variantRotationY))
}

export function createConnectableHitbox(entity: Entity, cellSize: number, layout: ConnectableLayout, variantRotationY = 0): ConnectableHitboxSpec {
  const family = entity.connectable?.family
  if (!family) throw new Error(`[ConnectableRegistry] L'entité ${entity.id} n'est pas connectable.`)
  return getConnectableFamilyDefinition(family).createHitbox({ cellSize, entity, layout, variantRotationY })
}
