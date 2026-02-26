// src/game/placement/PlacementStore.ts
import * as THREE from "three"
import type { Entity } from "../../game/entity/Entity"

export interface InventoryItem {
  id: string
  label: string
  icon: string       // emoji ou chemin vers une icône
  entity: Entity
}

type PlacementListener = () => void

class PlacementStore {
  selectedItem: InventoryItem | null = null
  rotation: number = 0          // 0, 90, 180, 270
  ghostMesh: THREE.Object3D | null = null
  hoveredTile: { tileX: number; tileZ: number } | null = null
  canPlace: boolean = false

  private listeners = new Set<PlacementListener>()

  subscribe(fn: PlacementListener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  notify() {
    for (const fn of this.listeners) fn()
  }

  select(item: InventoryItem | null) {
    this.selectedItem = item
    this.rotation = 0
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
    this.selectedItem = null
    this.rotation = 0
    this.notify()
  }
}

export const placementStore = new PlacementStore()