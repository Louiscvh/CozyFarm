// src/game/store/HistoryStore.ts
import * as THREE from "three"
import { World } from "../../game/world/World"
import { placementStore } from "./PlacementStore"

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

  /**
   * Instanced-entity: owns the visual APPEAR animation on undo-delete.
   * Called AFTER the proxy is re-added to scene + entities.
   */
  onRestore?: (w: NonNullable<typeof World.current>) => void

  /**
   * Instanced-entity: owns the visual REMOVE animation on redo-delete.
   * Called AFTER the proxy is removed from entities + cells freed.
   */
  onRemove?: (w: NonNullable<typeof World.current>) => void
}

export type HistoryAction = PlaceAction | DeleteAction

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

  push(action: HistoryAction) {
    this._undoStack.push(action)
    this._redoStack = []
    this.notify()
  }

  undo(): HistoryAction | undefined {
    const action = this._undoStack.pop()
    if (action) { this._redoStack.push(action); this.notify() }
    return action
  }

  redo(): HistoryAction | undefined {
    const action = this._redoStack.pop()
    if (action) { this._undoStack.push(action); this.notify() }
    return action
  }

  get canUndo() { return this._undoStack.length > 0 }
  get canRedo()  { return this._redoStack.length > 0 }
}

export const historyStore = new HistoryStore()

// ─── Standard mesh animations ─────────────────────────────────────────────────

function animateRemove(w: NonNullable<typeof World.current>, e: THREE.Object3D): () => void {
  const startY     = e.position.y
  const startScale = e.scale.x
  const duration   = 400
  const startTime  = performance.now()
  let cancelled    = false
  let rafId        = 0

  function animate(now: number) {
    if (cancelled) return
    const t = Math.min((now - startTime) / duration, 1)
    e.position.y = startY + Math.sin(t * Math.PI) * 0.3 + t * t * -3
    e.scale.setScalar(startScale * (1 - t * 0.7))
    if (t < 1) { rafId = requestAnimationFrame(animate) }
    else w.scene.remove(e)
  }
  rafId = requestAnimationFrame(animate)

  return () => { cancelled = true; cancelAnimationFrame(rafId) }
}

function animateAppear(
  en: THREE.Object3D,
  originalY: number,
  originalScale: THREE.Vector3,
  originalRotation: THREE.Euler
) {
  // Caller guarantees en.scale is already 0 and en.position.y is below target
  const duration  = 350
  const startTime = performance.now()
  const fromScale = en.scale.x
  const fromY     = en.position.y
  en.rotation.copy(originalRotation)

  function animateIn(now: number) {
    const t         = Math.min((now - startTime) / duration, 1)
    const ease      = 1 - Math.pow(1 - t, 3)
    const overshoot = Math.sin(t * Math.PI) * 0.2
    en.scale.setScalar(fromScale + (originalScale.x - fromScale) * ease)
    en.position.y = fromY + (originalY - fromY) * ease + overshoot
    if (t < 1) requestAnimationFrame(animateIn)
    else { en.scale.copy(originalScale); en.position.y = originalY }
  }
  requestAnimationFrame(animateIn)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function restoreEntity(w: NonNullable<typeof World.current>, action: DeleteAction) {
  action.cancelAnimation()
  const {
    entityObject: en, occupiedCells, sizeInCells,
    savedHoveredCell, originalY, originalScale, originalRotation,
  } = action

  if (action.onRestore) {
    // ── Instanced path ──────────────────────────────────────────────────────
    // The callback owns both the visual restore AND the appear animation.
    // We only handle bookkeeping here.
    w.scene.add(en)
    w.entities.push(en)
    occupiedCells.forEach(c => w.tilesFactory.markOccupied(c.x, c.z, 1))
    placementStore.hoveredCell = savedHoveredCell
    if (savedHoveredCell) {
      placementStore.canPlace = w.tilesFactory.canSpawn(
        savedHoveredCell.cellX, savedHoveredCell.cellZ, sizeInCells
      )
    }
    action.onRestore(w)
  } else {
    // ── Standard (full-mesh) path ───────────────────────────────────────────
    // Set scale to 0 BEFORE scene.add so the entity never flashes at old scale.
    en.scale.setScalar(0)
    en.position.y = originalY - 2
    w.scene.add(en)
    w.entities.push(en)
    occupiedCells.forEach(c => w.tilesFactory.markOccupied(c.x, c.z, 1))
    placementStore.hoveredCell = savedHoveredCell
    if (savedHoveredCell) {
      placementStore.canPlace = w.tilesFactory.canSpawn(
        savedHoveredCell.cellX, savedHoveredCell.cellZ, sizeInCells
      )
    }
    animateAppear(en, originalY, originalScale, originalRotation)
  }
}

function removeEntity(w: NonNullable<typeof World.current>, action: DeleteAction) {
  const e = action.entityObject
  w.entities = w.entities.filter(en => en !== e)
  action.occupiedCells.forEach(c => w.tilesFactory.markFree(c.x, c.z, 1))

  if (action.onRemove) {
    // Instanced path: callback owns the visual animation
    action.onRemove(w)
  } else {
    // Standard path: animate the full mesh shrinking + disappearing
    action.cancelAnimation = animateRemove(w, e)
  }
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

  if (action.type === "delete") restoreEntity(w, action)
}

export function applyRedo() {
  const w = World.current
  if (!w) return
  const action = historyStore.redo()
  if (!action) return

  if (action.type === "place") {
    const { entityObject: e, originalY, originalScale, originalRotation } = action
    // Scale to 0 BEFORE scene.add — no flash frame
    e.scale.setScalar(0)
    e.position.y = originalY - 2
    w.scene.add(e)
    w.entities.push(e)
    w.tilesFactory.markOccupied(action.cellX, action.cellZ, action.sizeInCells)
    animateAppear(e, originalY, originalScale, originalRotation)
  }

  if (action.type === "delete") removeEntity(w, action)
}