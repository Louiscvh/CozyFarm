// src/game/store/HistoryStore.ts
import * as THREE from "three"
import { World } from "../../game/world/World"
import { placementStore } from "./PlacementStore"
import { animateRemove, animateAppear, animateRotate } from "../../game/entity/EntityAnimation"

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

export type HistoryAction = PlaceAction | DeleteAction | RotateAction

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
    animateRemove(w, action.entityObject)
  }

  if (action.type === "rotate") {
    animateRotate(w, action.entityObject, action.prevRotY)
  }

  if (action.type === "delete") {
    action.cancelAnimation()
    const { entityObject: en, occupiedCells, sizeInCells, savedHoveredCell, originalY, originalScale, originalRotation } = action

    if (action.onRestore) {
      w.scene.add(en)
      w.entities.push(en)
      action.onRestore(w)
    } else {
      addToScene(w, en, originalY)
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
    addToScene(w, e, originalY)
    w.tilesFactory.markOccupied(action.cellX, action.cellZ, action.sizeInCells)
    animateAppear(w, e, originalY, originalScale, originalRotation)
  }

  if (action.type === "rotate") {
    animateRotate(w, action.entityObject, action.nextRotY)
  }

  if (action.type === "delete") {
    const { entityObject: e, occupiedCells } = action
    w.entities = w.entities.filter(en => en !== e)
    occupiedCells.forEach(c => w.tilesFactory.markFree(c.x, c.z, 1))
    if (action.onRemove) {
      action.onRemove(w)
    } else {
      action.cancelAnimation = animateRemove(w, e)
    }
  }
}