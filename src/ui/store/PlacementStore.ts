// src/game/store/PlacementStore.ts
import * as THREE from "three"
import type { Entity } from "../../game/entity/Entity"

export interface InventoryItem {
  id: string
  label: string
  icon: string
  entity: Entity
}

type PlacementListener = () => void

class PlacementStore {
  selectedItem: InventoryItem | null = null
  rotation:     number               = 0
  ghostMesh:    THREE.Object3D | null = null
  hoveredCell:  { cellX: number; cellZ: number } | null = null
  canPlace:     boolean              = false

  // ── Move mode ─────────────────────────────────────────────────────────────
  /** The Object3D being moved (null when not in move mode) */
  moveEntity:   THREE.Object3D | null = null
  /** Snapshot of cell / position / rotation before the move started */
  moveOrigin: {
    cellX: number; cellZ: number
    pos:   THREE.Vector3
    rotY:  number
  } | null = null
  private _onMoveCancel: (() => void) | null = null

  private listeners = new Set<PlacementListener>()

  subscribe(fn: PlacementListener) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  notify() { for (const fn of this.listeners) fn() }

  select(item: InventoryItem | null) {
    this.selectedItem = item
    this.rotation = 0
    this.notify()
  }

  /**
   * Enter move mode for an entity that is already placed in the world.
   * The caller is responsible for removing the entity from the scene / tiles
   * before calling this.
   */
  startMove(
    def:      Entity,
    entity:   THREE.Object3D,
    cellX:    number,
    cellZ:    number,
    rotY:     number,
    onCancel: () => void
  ) {
    this._onMoveCancel = onCancel
    this.moveEntity    = entity
    this.moveOrigin    = { cellX, cellZ, pos: entity.position.clone(), rotY }
    this.selectedItem  = {
      id    : entity.uuid,  // uuid unique par instance → force buildGhost à se reconstruire
      label : "",
      icon  : "",
      entity: def,
    }
    // Keep exact degrees so buildGhost initialises ghost at the right angle
    const degrees = Math.round(THREE.MathUtils.radToDeg(rotY));
    this.rotation = ((degrees % 360) + 360) % 360;
    this.notify()
  }

  /** Called after a successful move placement — clears move state. */
  completeMove() {
    this._onMoveCancel = null
    this.moveEntity    = null
    this.moveOrigin    = null
    this.selectedItem  = null
    this.rotation      = 0
    this.notify()
  }

  rotate() {
    this.rotation = (this.rotation + 90) % 360
    if (this.ghostMesh) {
      this.ghostMesh.rotation.y = THREE.MathUtils.degToRad(this.rotation)
    }
    this.notify()
  }

  cancel() {
    if (this._onMoveCancel) {
      this._onMoveCancel()
      this._onMoveCancel = null
    }
    this.moveEntity   = null
    this.moveOrigin   = null
    this.selectedItem = null
    this.rotation     = 0
    this.notify()
  }
}

export const placementStore = new PlacementStore()