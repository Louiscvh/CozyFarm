// src/game/store/HistoryStore.ts
import * as THREE from "three"
import { World } from "../../game/world/World"
import { placementStore } from "./PlacementStore"

interface PlaceAction {
  type: "place"
  entityObject: THREE.Object3D
  tileX: number
  tileZ: number
  tileSize: number
  originalY: number
  originalScale: THREE.Vector3
  originalRotation: THREE.Euler
}

interface DeleteAction {
  type: "delete"
  entityObject: THREE.Object3D
  occupiedTiles: { x: number; z: number; size: number }[]
  savedHoveredTile: { tileX: number; tileZ: number } | null
  cancelAnimation: () => void
  originalY: number
  originalScale: THREE.Vector3
  originalRotation: THREE.Euler
}

export type HistoryAction = PlaceAction | DeleteAction

class HistoryStore {
  private undoStack: HistoryAction[] = []
  private redoStack: HistoryAction[] = []
  private listeners: (() => void)[] = []

  private notify() { this.listeners.forEach(fn => fn()) }

  subscribe(fn: () => void) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }

  push(action: HistoryAction) {
    this.undoStack.push(action)
    this.redoStack = []
    this.notify()
  }

  undo(): HistoryAction | undefined {
    const action = this.undoStack.pop()
    if (action) { this.redoStack.push(action); this.notify() }
    return action
  }

  redo(): HistoryAction | undefined {
    const action = this.redoStack.pop()
    if (action) { this.undoStack.push(action); this.notify() }
    return action
  }

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo()  { return this.redoStack.length > 0 }
}

export const historyStore = new HistoryStore()

// ─── Animations ───────────────────────────────────────────────────────────────

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

function animateAppear(en: THREE.Object3D, originalY: number, originalScale: THREE.Vector3, originalRotation: THREE.Euler) {
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

// ─── Helpers partagés ─────────────────────────────────────────────────────────

function restoreEntity(
  w: NonNullable<typeof World.current>,
  action: DeleteAction
) {
  action.cancelAnimation()
  const { entityObject: en, occupiedTiles, savedHoveredTile, originalY, originalScale, originalRotation } = action

  en.scale.setScalar(0)
  en.position.y = originalY - 2
  w.scene.add(en)
  w.entities.push(en)
  occupiedTiles.forEach(t => w.tilesFactory.markOccupied(t.x, t.z, t.size))

  placementStore.hoveredTile = savedHoveredTile
  if (savedHoveredTile) {
    placementStore.canPlace = w.tilesFactory.canSpawn(savedHoveredTile.tileX, savedHoveredTile.tileZ, 1)
  }

  animateAppear(en, originalY, originalScale, originalRotation)
}

function removeEntity(
  w: NonNullable<typeof World.current>,
  action: DeleteAction
) {
  const e = action.entityObject
  w.entities = w.entities.filter(en => en !== e)
  action.occupiedTiles.forEach(t => w.tilesFactory.markFree(t.x, t.z, t.size))
  action.cancelAnimation = animateRemove(w, e)
}

// ─── Undo / Redo ──────────────────────────────────────────────────────────────

export function applyUndo() {
  const w = World.current
  if (!w) return
  const action = historyStore.undo()
  if (!action) return

  if (action.type === "place") {
    w.entities = w.entities.filter(en => en !== action.entityObject)
    w.tilesFactory.markFree(action.tileX, action.tileZ, action.tileSize)
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
    e.scale.setScalar(0)
    e.position.y = originalY - 2
    w.scene.add(e)
    w.entities.push(e)
    w.tilesFactory.markOccupied(action.tileX, action.tileZ, action.tileSize)
    animateAppear(e, originalY, originalScale, originalRotation)
  }

  if (action.type === "delete") removeEntity(w, action)
}