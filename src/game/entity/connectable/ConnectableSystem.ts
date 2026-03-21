import * as THREE from "three"
import { debugHitboxEnabled } from "../EntityFactory"
import type { Entity } from "../Entity"
import { getConnectableFamily, isConnectableEntity } from "../Entity"
import { createConnectableBoxSpecs, createConnectableHitbox, createConnectableVisual, getConnectableMaterial, getDefaultConnectableLayout, type ConnectableBoxSpec, type ConnectableDirection, type ConnectableLayout } from "./ConnectableRegistry"
import type { World } from "../../world/World"

const NEIGHBOR_OFFSETS: Array<{ direction: ConnectableDirection; dx: number; dz: number }> = [
  { direction: "north", dx: 0, dz: 1 },
  { direction: "east", dx: 1, dz: 0 },
  { direction: "south", dx: 0, dz: -1 },
  { direction: "west", dx: -1, dz: 0 },
]

const dummy = new THREE.Object3D()
const zero = new THREE.Matrix4().makeScale(0, 0, 0)

interface BatchSlotRef {
  batchKey: string
  slot: number
}

interface RenderBatch {
  mesh: THREE.InstancedMesh
  active: boolean[]
  highWater: number
}

function cellKey(cellX: number, cellZ: number): string {
  return `${cellX},${cellZ}`
}

function disposeTree(root: THREE.Object3D | null): void {
  if (!root) return
  root.traverse(obj => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    if (!mesh.userData.keepGeometryAlive) mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial && material.visible === false) {
        material.dispose()
      }
    }
  })
}

function attachConnectableHitbox(entity: THREE.Object3D, def: Entity, world: World, layout: ConnectableLayout, variantRotationY: number): void {
  const hitboxSpec = createConnectableHitbox(def, world.cellSize, layout, variantRotationY)
  const geometry = new THREE.BoxGeometry(...hitboxSpec.size)

  const hitMesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ visible: false }),
  )

  const wire = new THREE.WireframeGeometry(geometry)
  const line = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
  )
  line.visible = debugHitboxEnabled
  hitMesh.add(line)

  hitMesh.position.set(...hitboxSpec.center)
  hitMesh.name = "__hitbox__"
  hitMesh.userData.isHitBox = true

  entity.add(hitMesh)
}

function batchKey(box: ConnectableBoxSpec): string {
  return `${box.materialKey}§${box.size.join("x")}`
}

function isEntityBatched(entity: THREE.Object3D): boolean {
  return !!entity.userData.connectableBatchManaged
}

class ConnectableRenderBatches {
  private readonly batches = new Map<string, RenderBatch>()
  private readonly entitySlots = new WeakMap<THREE.Object3D, BatchSlotRef[]>()
  private readonly scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  syncEntity(entity: THREE.Object3D, boxes: ConnectableBoxSpec[]): void {
    this.clearEntity(entity)

    const refs: BatchSlotRef[] = []
    for (const box of boxes) {
      const key = batchKey(box)
      const batch = this.ensureBatch(key, box)
      const slot = this.allocateSlot(batch)

      dummy.position.set(
        entity.position.x + box.position[0],
        entity.position.y + box.position[1],
        entity.position.z + box.position[2],
      )
      dummy.rotation.set(0, box.rotationY ?? 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()

      batch.mesh.setMatrixAt(slot, dummy.matrix)
      batch.mesh.instanceMatrix.needsUpdate = true
      refs.push({ batchKey: key, slot })
    }

    this.entitySlots.set(entity, refs)
    this.flushAll(refs)
  }

  clearEntity(entity: THREE.Object3D): void {
    const refs = this.entitySlots.get(entity)
    if (!refs?.length) return

    for (const ref of refs) {
      const batch = this.batches.get(ref.batchKey)
      if (!batch) continue
      batch.active[ref.slot] = false
      batch.mesh.setMatrixAt(ref.slot, zero)
      batch.mesh.instanceMatrix.needsUpdate = true
    }

    this.flushAll(refs)
    this.entitySlots.delete(entity)
  }

  private ensureBatch(key: string, box: ConnectableBoxSpec): RenderBatch {
    const existing = this.batches.get(key)
    if (existing) return existing

    const geometry = new THREE.BoxGeometry(...box.size)
    const mesh = new THREE.InstancedMesh(geometry, getConnectableMaterial(box.materialKey), 32)
    mesh.count = 0
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    for (let i = 0; i < 32; i++) mesh.setMatrixAt(i, zero)
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)

    const batch: RenderBatch = { mesh, active: new Array(32).fill(false), highWater: 0 }
    this.batches.set(key, batch)
    return batch
  }

  private allocateSlot(batch: RenderBatch): number {
    for (let i = 0; i < batch.active.length; i++) {
      if (!batch.active[i]) {
        batch.active[i] = true
        batch.highWater = Math.max(batch.highWater, i + 1)
        return i
      }
    }

    const oldCount = batch.active.length
    const newCount = Math.ceil(oldCount * 1.5)
    const grown = new THREE.InstancedMesh(batch.mesh.geometry, batch.mesh.material, newCount)
    grown.castShadow = batch.mesh.castShadow
    grown.receiveShadow = batch.mesh.receiveShadow
    grown.frustumCulled = false

    for (let i = 0; i < oldCount; i++) {
      const matrix = new THREE.Matrix4()
      batch.mesh.getMatrixAt(i, matrix)
      grown.setMatrixAt(i, matrix)
    }
    for (let i = oldCount; i < newCount; i++) grown.setMatrixAt(i, zero)
    grown.count = batch.mesh.count
    grown.instanceMatrix.needsUpdate = true

    this.scene.remove(batch.mesh)
    this.scene.add(grown)
    batch.mesh = grown
    batch.active.push(...new Array(newCount - oldCount).fill(false))

    batch.active[oldCount] = true
    batch.highWater = Math.max(batch.highWater, oldCount + 1)
    return oldCount
  }

  private flushAll(refs: BatchSlotRef[]): void {
    const touched = new Set(refs.map(ref => ref.batchKey))
    for (const key of touched) {
      const batch = this.batches.get(key)
      if (!batch) continue
      let hw = 0
      for (let i = 0; i < batch.active.length; i++) if (batch.active[i]) hw = i + 1
      batch.highWater = hw
      batch.mesh.count = hw
      batch.mesh.instanceMatrix.needsUpdate = true
    }
  }
}

export class ConnectableSystem {
  private readonly byCell = new Map<string, THREE.Object3D>()
  private readonly world: World
  private readonly renderBatches: ConnectableRenderBatches

  constructor(world: World) {
    this.world = world
    this.renderBatches = new ConnectableRenderBatches(world.scene ?? new THREE.Scene())
  }

  register(entity: THREE.Object3D): void {
    const def = entity.userData.def as Entity | undefined
    const cellX = entity.userData.cellX as number | undefined
    const cellZ = entity.userData.cellZ as number | undefined
    if (!def || cellX === undefined || cellZ === undefined || !isConnectableEntity(def)) return

    entity.userData.connectableBatchManaged = true
    this.byCell.set(cellKey(cellX, cellZ), entity)
    this.refreshCellAndNeighbors(cellX, cellZ)
  }

  unregister(entity: THREE.Object3D): void {
    const def = entity.userData.def as Entity | undefined
    const cellX = entity.userData.cellX as number | undefined
    const cellZ = entity.userData.cellZ as number | undefined
    if (!def || cellX === undefined || cellZ === undefined || !isConnectableEntity(def)) return

    this.renderBatches.clearEntity(entity)
    const key = cellKey(cellX, cellZ)
    if (this.byCell.get(key) === entity) this.byCell.delete(key)
    this.refreshCellAndNeighbors(cellX, cellZ)
  }

  refreshEntity(entity: THREE.Object3D): void {
    const def = entity.userData.def as Entity | undefined
    const cellX = entity.userData.cellX as number | undefined
    const cellZ = entity.userData.cellZ as number | undefined
    if (!def || cellX === undefined || cellZ === undefined || !isConnectableEntity(def)) return

    const layout = this.computeLayout(def, cellX, cellZ)
    const variantRotationY = typeof entity.userData.connectableVariantRotY === "number" ? entity.userData.connectableVariantRotY as number : 0
    entity.userData.connectableLayout = layout

    if (isEntityBatched(entity)) {
      const visual = entity.getObjectByName("__connectable_visual__")
      if (visual) {
        entity.remove(visual)
        disposeTree(visual)
      }
      const hitbox = entity.getObjectByName("__hitbox__")
      if (hitbox) {
        entity.remove(hitbox)
        disposeTree(hitbox)
      }
      this.renderBatches.syncEntity(entity, createConnectableBoxSpecs(def, this.world.cellSize, layout, variantRotationY))
      attachConnectableHitbox(entity, def, this.world, layout, variantRotationY)
      return
    }

    syncConnectableEntityVisual(this.world, entity, layout)
  }

  computePlacementLayout(def: Entity, cellX: number, cellZ: number): ConnectableLayout {
    if (!isConnectableEntity(def)) return getDefaultConnectableLayout()
    return this.computeLayout(def, cellX, cellZ)
  }

  private refreshCellAndNeighbors(cellX: number, cellZ: number): void {
    const refreshed = new Set<string>()

    const tryRefresh = (targetX: number, targetZ: number) => {
      const key = cellKey(targetX, targetZ)
      if (refreshed.has(key)) return
      refreshed.add(key)
      const entity = this.byCell.get(key)
      if (!entity) return
      this.refreshEntity(entity)
    }

    tryRefresh(cellX, cellZ)
    for (const offset of NEIGHBOR_OFFSETS) tryRefresh(cellX + offset.dx, cellZ + offset.dz)
  }

  private computeLayout(def: Entity, cellX: number, cellZ: number): ConnectableLayout {
    const family = getConnectableFamily(def)
    if (!family) return getDefaultConnectableLayout()

    const layout = getDefaultConnectableLayout()
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = this.byCell.get(cellKey(cellX + offset.dx, cellZ + offset.dz))
      const neighborDef = neighbor?.userData.def as Entity | undefined
      layout[offset.direction] = !!neighborDef && getConnectableFamily(neighborDef) === family
    }

    return layout
  }
}

function isIsolatedLayout(layout: ConnectableLayout): boolean {
  return !layout.north && !layout.east && !layout.south && !layout.west
}

export function animateConnectableVariantRotation(world: World, entity: THREE.Object3D, targetRotationY: number): () => void {
  entity.userData.connectableVariantRotY = targetRotationY

  const layout = entity.userData.connectableLayout as ConnectableLayout | undefined
  if (!layout || !isIsolatedLayout(layout)) {
    if (isEntityBatched(entity)) world.connectableSystem.refreshEntity(entity)
    else {
      const visual = entity.getObjectByName("__connectable_visual__")
      if (visual) visual.rotation.y = targetRotationY
    }
    return () => {}
  }

  let current = isEntityBatched(entity)
    ? ((entity.userData.connectableAnimatedRotY as number | undefined) ?? (entity.userData.connectableVariantRotY as number | undefined) ?? 0)
    : (entity.getObjectByName("__connectable_visual__")?.rotation.y ?? 0)
  let rafId = 0

  const animate = () => {
    current += (targetRotationY - current) * 0.3
    entity.userData.connectableAnimatedRotY = current

    if (isEntityBatched(entity)) {
      world.connectableSystem.refreshEntity(entity)
    } else {
      const visual = entity.getObjectByName("__connectable_visual__")
      if (visual) visual.rotation.y = current
    }

    if (Math.abs(targetRotationY - current) > 0.001) {
      rafId = requestAnimationFrame(animate)
    } else {
      entity.userData.connectableAnimatedRotY = undefined
      if (isEntityBatched(entity)) world.connectableSystem.refreshEntity(entity)
      else {
        const visual = entity.getObjectByName("__connectable_visual__")
        if (visual) visual.rotation.y = targetRotationY
      }
    }
  }

  animate()
  return () => cancelAnimationFrame(rafId)
}

export function syncConnectableEntityVisual(world: World, entity: THREE.Object3D, layout?: ConnectableLayout): void {
  const def = entity.userData.def as Entity | undefined
  if (!def || !isConnectableEntity(def)) return

  entity.rotation.y = 0
  entity.userData.rotY = 0
  entity.userData.baseRotY = 0

  const nextLayout = layout ?? getDefaultConnectableLayout()
  const rawVariantRotationY = typeof entity.userData.connectableVariantRotY === "number" ? entity.userData.connectableVariantRotY as number : 0
  const animatedRotationY = typeof entity.userData.connectableAnimatedRotY === "number" ? entity.userData.connectableAnimatedRotY as number : rawVariantRotationY
  entity.userData.connectableLayout = nextLayout

  const visual = entity.getObjectByName("__connectable_visual__")
  if (visual) {
    entity.remove(visual)
    disposeTree(visual)
  }

  const hitbox = entity.getObjectByName("__hitbox__")
  if (hitbox) {
    entity.remove(hitbox)
    disposeTree(hitbox)
  }

  const nextVisual = createConnectableVisual(def, world.cellSize, nextLayout, animatedRotationY)
  nextVisual.name = "__connectable_visual__"
  entity.add(nextVisual)

  attachConnectableHitbox(entity, def, world, nextLayout, rawVariantRotationY)
}
