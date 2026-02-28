// src/ui/store/InventoryStore.ts
import { historyStore } from "./HistoryStore"
import { placementStore } from "./PlacementStore"

export interface InventoryEntry {
  id: string
  maxQty: number
}

class InventoryStore {
  private entries    = new Map<string, InventoryEntry>()
  private quantities = new Map<string, number>()
  private listeners: (() => void)[] = []

  private notify() { this.listeners.forEach(fn => fn()) }

  subscribe(fn: () => void) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }

  /** À appeler une fois au démarrage avec tous les items et leurs max */
  register(entries: InventoryEntry[]) {
    for (const e of entries) {
      this.entries.set(e.id, e)
      this.quantities.set(e.id, e.maxQty)
    }
    historyStore.subscribe(() => this.syncFromHistory())
  }

  /**
   * Recompte les quantités depuis undoStack.
   * Chaque "place" encore dans le stack = un objet posé non undone.
   * Undo et redo se répercutent automatiquement.
   */
  private syncFromHistory() {
    const placed = new Map<string, number>()

    for (const action of historyStore.undoStack) {
      if (action.type !== "place") continue
      const id = action.entityObject.userData.id as string | undefined
      if (!id) continue
      placed.set(id, (placed.get(id) ?? 0) + 1)
    }

    for (const [id, entry] of this.entries) {
      this.quantities.set(id, entry.maxQty - (placed.get(id) ?? 0))
    }

    this.notify()

    // Désélectionne si le slot actif tombe à 0
    const selId = placementStore.selectedItem?.id
    if (selId && (this.quantities.get(selId) ?? 0) <= 0) {
      placementStore.cancel()
    }
  }

  getQty(id: string): number { return this.quantities.get(id) ?? 0 }
  getMax(id: string): number { return this.entries.get(id)?.maxQty ?? 0 }
}

export const inventoryStore = new InventoryStore()