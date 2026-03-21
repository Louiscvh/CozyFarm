import * as THREE from "three"
import { attachHitBox } from "../EntityFactory"
import type { Entity } from "../Entity"
import { getConnectableFamily, isConnectableEntity } from "../Entity"
import { createConnectableVisual, getDefaultConnectableLayout, type ConnectableDirection, type ConnectableLayout } from "./ConnectableRegistry"
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
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial && material.visible === false) {
        material.dispose()
      }
    }
  })
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

export function syncConnectableEntityVisual(world: World, entity: THREE.Object3D, layout?: ConnectableLayout): void {
  const def = entity.userData.def as Entity | undefined
  if (!def || !isConnectableEntity(def)) return

  entity.rotation.y = 0
  entity.userData.rotY = 0
  entity.userData.baseRotY = 0

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

  const nextVisual = createConnectableVisual(def, world.cellSize, layout ?? getDefaultConnectableLayout())
  nextVisual.name = "__connectable_visual__"
  entity.add(nextVisual)
  attachHitBox(entity, def.yOffset ?? 0)
}
