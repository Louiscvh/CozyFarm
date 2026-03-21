// src/game/store/HistoryStore.ts
import * as THREE from "three"
import { World } from "../../game/world/World"
import { placementStore } from "./PlacementStore"
import { animateRemove, animateAppear, animateRotate, animateMove } from "../../game/entity/EntityAnimation"
import { isConnectableEntity } from "../../game/entity/Entity"
import { animateConnectableVariantRotation } from "../../game/entity/connectable/ConnectableSystem"
import type { Entity } from "../../game/entity/Entity"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaceAction {
  type: "place"
  entityObject: THREE.Object3D
  cellX: number
  cellZ: number
  sizeInCells: number
  originalY: number
  originalScale: THREE.Vector3
  originalRotation: THREE.Euler
}

interface DeleteAction {
  type: "delete"
  entityObject: THREE.Object3D
  occupiedCells: { x: number; z: number }[]
  sizeInCells: number
  savedHoveredCell: { cellX: number; cellZ: number } | null
  cancelAnimation: () => void
  originalY: number
  originalScale: THREE.Vector3
  originalRotation: THREE.Euler
  onRestore?: (w: NonNullable<typeof World.current>) => void
  onRemove?:  (w: NonNullable<typeof World.current>) => void
}

interface RotateAction {
  type: "rotate"
  entityObject: THREE.Object3D
  prevRotY: number
  nextRotY: number
}

interface MoveAction {
  type: "move"
  entityObject: THREE.Object3D
  fromCell: { x: number, z: number }
  toCell: { x: number, z: number }
  fromRot: number
  toRot: number
  size: number
}

export type HistoryAction = PlaceAction | DeleteAction | RotateAction | MoveAction

// ─── Store ────────────────────────────────────────────────────────────────────

class HistoryStore {
  private _undoStack: HistoryAction[] = []
  private _redoStack: HistoryAction[] = []
  private listeners: (() => void)[]   = []

  private notify() { this.listeners.forEach(fn => fn()) }

  subscribe(fn: () => void) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }

  get undoStack(): readonly HistoryAction[] { return this._undoStack }
  get canUndo() { return this._undoStack.length > 0 }
  get canRedo()  { return this._redoStack.length > 0 }

  push(action: HistoryAction) {
    this._undoStack.push(action)
    this._redoStack = []
    this.notify()
  }

  undo() {
    const action = this._undoStack.pop()
    if (action) { this._redoStack.push(action); this.notify() }
    return action
  }

  redo() {
    const action = this._redoStack.pop()
    if (action) { this._undoStack.push(action); this.notify() }
    return action
  }
}

export const historyStore = new HistoryStore()
export { animateRemove, animateAppear, animateRotate }

// ─── Delete helper ────────────────────────────────────────────────────────────

export function pushDeleteAction(
  w: NonNullable<typeof World.current>,
  e: THREE.Object3D,
  savedHoveredCell: { cellX: number; cellZ: number } | null
) {
  const cellX       = e.userData.cellX       as number
  const cellZ       = e.userData.cellZ       as number
  const sizeInCells = (e.userData.sizeInCells as number) ?? 1
  const originalY        = e.position.y
  const originalScale    = e.scale.clone()
  const originalRotation = e.rotation.clone()

  const occupiedCells: { x: number; z: number }[] = []
  for (let dx = 0; dx < sizeInCells; dx++)
    for (let dz = 0; dz < sizeInCells; dz++)
      occupiedCells.push({ x: cellX + dx, z: cellZ + dz })

  w.entities = w.entities.filter(en => en !== e)
  occupiedCells.forEach(c => w.tilesFactory.markFree(c.x, c.z, 1))

  const action: DeleteAction = {
    type: "delete", entityObject: e, occupiedCells, sizeInCells,
    savedHoveredCell, originalY, originalScale, originalRotation,
    cancelAnimation: () => {},
  }

  action.cancelAnimation = animateRemove(w, e)
  historyStore.push(action)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addToScene(w: NonNullable<typeof World.current>, e: THREE.Object3D, originalY: number) {
  e.scale.setScalar(0)
  e.position.y = originalY - 2
  if (e.userData.isInstanced) {
    w.instanceManager.setTransform(e.userData.def, e.userData.instanceSlot, e.position, e.userData.rotY ?? 0, 0)
  }
  w.scene.add(e)
  w.entities.push(e)
}

// ─── Undo / Redo ──────────────────────────────────────────────────────────────

export function applyUndo() {
  const w = World.current
  if (!w) return
  const action = historyStore.undo()
  if (!action) return

  if (action.type === "place") {
    w.entities = w.entities.filter(en => en !== action.entityObject)
    w.tilesFactory.markFree(action.cellX, action.cellZ, action.sizeInCells)
    w.connectableSystem.unregister(action.entityObject)
    animateRemove(w, action.entityObject)
  }

  if (action.type === "rotate") {
    if (isConnectableEntity(action.entityObject.userData.def as Entity | undefined)) {
      animateConnectableVariantRotation(w, action.entityObject, action.prevRotY)
    } else {
      animateRotate(w, action.entityObject, action.prevRotY)
    }
  }

  if (action.type === "move") {
    const { entityObject: e, fromCell, toCell, size, fromRot } = action
    // Libérer la nouvelle position, occuper l'ancienne
    w.tilesFactory.markFree(toCell.x, toCell.z, size)
    w.tilesFactory.markOccupied(fromCell.x, fromCell.z, size)
    
    // Calculer la position world d'origine
    const half = w.sizeInCells / 2
    const worldX = (fromCell.x - half + size / 2) * w.cellSize
    const worldZ = (fromCell.z - half + size / 2) * w.cellSize
    const targetPos = new THREE.Vector3(worldX, e.position.y, worldZ)
  
    w.connectableSystem.unregister(e)
    e.userData.cellX = fromCell.x
    e.userData.cellZ = fromCell.z
    w.connectableSystem.register(e)
    animateMove(w, e, targetPos, fromRot)
  }

  if (action.type === "delete") {
    action.cancelAnimation()
    const { entityObject: en, occupiedCells, sizeInCells, savedHoveredCell, originalY, originalScale, originalRotation } = action
      const allFree = occupiedCells.every(c =>
          !w.tilesFactory.isOccupied(c.x, c.z)
      )

      if (!allFree) {
          return
      }

    if (action.onRestore) {
      w.scene.add(en)
      w.entities.push(en)
      action.onRestore(w)
    } else {
      addToScene(w, en, originalY)
      w.connectableSystem.register(en)
      animateAppear(w, en, originalY, originalScale, originalRotation)
    }

    occupiedCells.forEach(c => w.tilesFactory.markOccupied(c.x, c.z, 1))
    placementStore.hoveredCell = savedHoveredCell
    if (savedHoveredCell) {
      placementStore.canPlace = w.tilesFactory.canSpawn(savedHoveredCell.cellX, savedHoveredCell.cellZ, sizeInCells)
    }
  }
}

export function applyRedo() {
  const w = World.current
  if (!w) return
  const action = historyStore.redo()
  if (!action) return

    if (action.type === "place") {
        const { entityObject: e, originalY, originalScale, originalRotation } = action

        // ← Vérifie que toutes les cellules sont libres avant de replacer
        const allFree = Array.from({ length: action.sizeInCells }, (_, dx) =>
            Array.from({ length: action.sizeInCells }, (_, dz) =>
                !w.tilesFactory.isOccupied(action.cellX + dx, action.cellZ + dz)
            )
        ).flat().every(Boolean)

        if (!allFree) return

        addToScene(w, e, originalY)
        w.tilesFactory.markOccupied(action.cellX, action.cellZ, action.sizeInCells)
        w.connectableSystem.register(e)
        animateAppear(w, e, originalY, originalScale, originalRotation)
    }

  if (action.type === "rotate") {
    if (isConnectableEntity(action.entityObject.userData.def as Entity | undefined)) {
      animateConnectableVariantRotation(w, action.entityObject, action.nextRotY)
    } else {
      animateRotate(w, action.entityObject, action.nextRotY)
    }
  }

  if (action.type === "move") {
    const { entityObject: e, fromCell, toCell, size, toRot } = action
    w.tilesFactory.markFree(fromCell.x, fromCell.z, size)
    w.tilesFactory.markOccupied(toCell.x, toCell.z, size)
  
    const half = w.sizeInCells / 2
    const worldX = (toCell.x - half + size / 2) * w.cellSize
    const worldZ = (toCell.z - half + size / 2) * w.cellSize
    const targetPos = new THREE.Vector3(worldX, e.position.y, worldZ)
  
    w.connectableSystem.unregister(e)
    e.userData.cellX = toCell.x
    e.userData.cellZ = toCell.z
    w.connectableSystem.register(e)
    animateMove(w, e, targetPos, toRot)
  }

  if (action.type === "delete") {
    const { entityObject: e, occupiedCells } = action
    w.entities = w.entities.filter(en => en !== e)
    occupiedCells.forEach(c => w.tilesFactory.markFree(c.x, c.z, 1))
    w.connectableSystem.unregister(e)
    if (action.onRemove) {
      action.onRemove(w)
    } else {
      action.cancelAnimation = animateRemove(w, e)
    }
  }
}