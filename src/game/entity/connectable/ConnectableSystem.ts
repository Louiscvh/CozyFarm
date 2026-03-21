import * as THREE from "three"
import { debugHitboxEnabled } from "../EntityFactory"
import type { Entity } from "../Entity"
import { getConnectableFamily, isConnectableEntity } from "../Entity"
import { createConnectableHitbox, createConnectableVisual, getDefaultConnectableLayout, type ConnectableDirection, type ConnectableLayout } from "./ConnectableRegistry"
import type { World } from "../../world/World"

const NEIGHBOR_OFFSETS: Array<{ direction: ConnectableDirection; dx: number; dz: number }> = [
  { direction: "north", dx: 0, dz: 1 },
  { direction: "east", dx: 1, dz: 0 },
  { direction: "south", dx: 0, dz: -1 },
  { direction: "west", dx: -1, dz: 0 },
]

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

export class ConnectableSystem {
  private readonly byCell = new Map<string, THREE.Object3D>()
  private readonly world: World

  constructor(world: World) {
    this.world = world
  }

  register(entity: THREE.Object3D): void {
    const def = entity.userData.def as Entity | undefined
    const cellX = entity.userData.cellX as number | undefined
    const cellZ = entity.userData.cellZ as number | undefined
    if (!def || cellX === undefined || cellZ === undefined || !isConnectableEntity(def)) return

    this.byCell.set(cellKey(cellX, cellZ), entity)
    this.refreshCellAndNeighbors(cellX, cellZ)
  }

  unregister(entity: THREE.Object3D): void {
    const def = entity.userData.def as Entity | undefined
    const cellX = entity.userData.cellX as number | undefined
    const cellZ = entity.userData.cellZ as number | undefined
    if (!def || cellX === undefined || cellZ === undefined || !isConnectableEntity(def)) return

    const key = cellKey(cellX, cellZ)
    if (this.byCell.get(key) === entity) this.byCell.delete(key)
    this.refreshCellAndNeighbors(cellX, cellZ)
  }

  refreshEntity(entity: THREE.Object3D): void {
    const def = entity.userData.def as Entity | undefined
    const cellX = entity.userData.cellX as number | undefined
    const cellZ = entity.userData.cellZ as number | undefined
    if (!def || cellX === undefined || cellZ === undefined || !isConnectableEntity(def)) return

    syncConnectableEntityVisual(this.world, entity, this.computeLayout(def, cellX, cellZ))
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

export function animateConnectableVariantRotation(entity: THREE.Object3D, targetRotationY: number): () => void {
  entity.userData.connectableVariantRotY = targetRotationY

  const visual = entity.getObjectByName("__connectable_visual__")
  const layout = entity.userData.connectableLayout as ConnectableLayout | undefined
  if (!visual) return () => {}

  if (!layout || !isIsolatedLayout(layout)) {
    return () => {}
  }

  let current = visual.rotation.y
  let rafId = 0

  const animate = () => {
    current += (targetRotationY - current) * 0.3
    visual.rotation.y = current
    if (Math.abs(targetRotationY - current) > 0.001) {
      rafId = requestAnimationFrame(animate)
    } else {
      visual.rotation.y = targetRotationY
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
  const variantRotationY = typeof entity.userData.connectableVariantRotY === "number" ? entity.userData.connectableVariantRotY as number : 0
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

  const nextVisual = createConnectableVisual(def, world.cellSize, nextLayout, variantRotationY)
  nextVisual.name = "__connectable_visual__"
  entity.add(nextVisual)

  attachConnectableHitbox(entity, def, world, nextLayout, variantRotationY)
}
