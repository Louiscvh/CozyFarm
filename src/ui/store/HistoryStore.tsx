// src/game/store/HistoryStore.ts
import * as THREE from "three"
import { World } from "../../game/world/World"
import { placementStore } from "./PlacementStore"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaceAction {
  type: "place"
  entityObject: THREE.Object3D
  tileX: number
  tileZ: number
  tileSize: number
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

// ─── Store ────────────────────────────────────────────────────────────────────

class HistoryStore {
  private undoStack: HistoryAction[] = []
  private redoStack: HistoryAction[] = []

  push(action: HistoryAction) {
    this.undoStack.push(action)
    // Toute nouvelle action efface le redo
    this.redoStack = []
  }

  undo(): HistoryAction | undefined {
    const action = this.undoStack.pop()
    if (action) this.redoStack.push(action)
    return action
  }

  redo(): HistoryAction | undefined {
    const action = this.redoStack.pop()
    if (action) this.undoStack.push(action)
    return action
  }

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo()  { return this.redoStack.length > 0 }
}

export const historyStore = new HistoryStore()

// ─── Helpers d'animation ──────────────────────────────────────────────────────

function animateRemove(w: NonNullable<typeof World.current>, e: THREE.Object3D) {
  const startY     = e.position.y
  const startScale = e.scale.x
  const duration   = 400
  const startTime  = performance.now()

  function animate(now: number) {
    const t = Math.min((now - startTime) / duration, 1)
    e.position.y = startY + Math.sin(t * Math.PI) * 0.3 + t * t * -3
    e.scale.setScalar(startScale * (1 - t * 0.7))
    if (t < 1) requestAnimationFrame(animate)
    else w.scene.remove(e)
  }
  requestAnimationFrame(animate)
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
    else {
      en.scale.copy(originalScale)
      en.position.y = originalY
    }
  }
  requestAnimationFrame(animateIn)
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

export function applyUndo() {
  const w = World.current
  if (!w) return
  const action = historyStore.undo()
  if (!action) return

  if (action.type === "place") {
    const e = action.entityObject
    w.entities = w.entities.filter(en => en !== e)
    w.tilesFactory.markFree(action.tileX, action.tileZ, action.tileSize)
    animateRemove(w, e)
  }

  if (action.type === "delete") {
    const { entityObject: en, occupiedTiles, savedHoveredTile,
            cancelAnimation, originalY, originalScale, originalRotation } = action

    cancelAnimation()
    w.scene.add(en)
    w.entities.push(en)
    occupiedTiles.forEach(t => w.tilesFactory.markOccupied(t.x, t.z, t.size))

    placementStore.hoveredTile = savedHoveredTile
    if (savedHoveredTile) {
      const { tileX, tileZ } = savedHoveredTile
      placementStore.canPlace = w.tilesFactory.canSpawn(tileX, tileZ, 1)
    }

    animateAppear(en, originalY, originalScale, originalRotation)
  }
}

// ─── Redo ─────────────────────────────────────────────────────────────────────

export function applyRedo() {
  const w = World.current
  if (!w) return

  const action = historyStore.redo()
  if (!action) return

  if (action.type === "place") {
    // Remet l'entité dans la scène
    w.scene.add(action.entityObject)
    w.entities.push(action.entityObject)
    w.tilesFactory.markOccupied(action.tileX, action.tileZ, action.tileSize)
    animateAppear(
      action.entityObject,
      action.entityObject.position.y,
      action.entityObject.scale.clone(),
      action.entityObject.rotation.clone(),
    )
  }

  if (action.type === "delete") {
    const e = action.entityObject
    w.entities = w.entities.filter(en => en !== e)
    action.occupiedTiles.forEach(t => w.tilesFactory.markFree(t.x, t.z, t.size))

    // Réinitialise le cancelAnimation pour la nouvelle anim
    const duration   = 400
    const startTime  = performance.now()
    let   cancelled  = false
    let   rafId      = 0

    action.cancelAnimation = () => { cancelled = true; cancelAnimationFrame(rafId) }

    const startY     = e.position.y
    const startScale = e.scale.x

    function animate(now: number) {
      if (cancelled) return
      const t = Math.min((now - startTime) / duration, 1)
      e.position.y = startY + Math.sin(t * Math.PI) * 0.3 + t * t * -3
      e.scale.setScalar(startScale * (1 - t * 0.7))
      if (t < 1) { rafId = requestAnimationFrame(animate) }
      else w?.scene.remove(e)
    }
    rafId = requestAnimationFrame(animate)
  }
}