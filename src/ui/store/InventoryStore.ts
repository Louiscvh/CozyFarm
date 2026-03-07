// src/ui/store/InventoryStore.ts
import { historyStore } from "./HistoryStore"
import { placementStore } from "./PlacementStore"


export interface InventoryEntry {
    id: string
    maxQty: number
    initialQty?: number   // si absent → maxQty (items de construction)
    infinite?: boolean  // outil non consommable
}


class InventoryStore {
    private entries = new Map<string, InventoryEntry>()
    private quantities = new Map<string, number>()

    private farmingItems = new Set<string>()
    private farmingQty = new Map<string, number>()
    private farmingMax = new Map<string, number>()

    private listeners: (() => void)[] = []
    private notify() { this.listeners.forEach(fn => fn()) }

    subscribe(fn: () => void) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter(l => l !== fn) }
    }

    // ─── Enregistrement ──────────────────────────────────────────────────────

    register(entries: InventoryEntry[]): void {
        for (const e of entries) {
            this.entries.set(e.id, e)

            if (e.infinite) {
                // Outil non consommable — ne passe jamais par l'historique
                this.farmingItems.add(e.id)
                this.farmingQty.set(e.id, 1)
                this.farmingMax.set(e.id, 1)
            } else if (e.initialQty !== undefined) {
                // Item farming avec stock initial explicite
                this.farmingItems.add(e.id)
                this.farmingQty.set(e.id, e.initialQty)
                this.farmingMax.set(e.id, e.maxQty)
            } else {
                // Item de construction — géré par l'historique undo/redo
                this.quantities.set(e.id, e.maxQty)
            }
        }
        historyStore.subscribe(() => this.syncFromHistory())
        this.notify()
    }

    

    // ─── Lecture ─────────────────────────────────────────────────────────────

    getQty(id: string): number {
        if (this.farmingItems.has(id)) return this.farmingQty.get(id) ?? 0
        return this.quantities.get(id) ?? 0
    }

    getMax(id: string): number {
        return this.entries.get(id)?.maxQty ?? 0
    }

    // ─── Actions ─────────────────────────────────────────────────────────────

    /**
     * Consomme 1 unité d'un item farming.
     * Retourne true si la consommation a réussi.
     * Les items de construction ne passent pas par ici (ils sont gérés par l'historique undo/redo).
     */
    consume(id: string, amount = 1): boolean {
        if (!this.farmingItems.has(id)) {
            console.warn(`[InventoryStore] consume("${id}") : cet item n'est pas un item farming.`)
            return false
        }
        const current = this.farmingQty.get(id) ?? 0
        if (current < amount) return false
        this.farmingQty.set(id, current - amount)
        this.notify()
        return true
    }

    /**
     * Produit `amount` unités d'un item farming (ex: carotte récoltée).
     * Plafonnée au maxQty.
     */
    produce(id: string, amount = 1): void {
        if (!this.farmingItems.has(id)) {
            console.warn(`[InventoryStore] produce("${id}") : cet item n'est pas un item farming.`)
            return
        }
        const max = this.farmingMax.get(id) ?? Infinity
        const current = this.farmingQty.get(id) ?? 0
        this.farmingQty.set(id, Math.min(max, current + amount))
        this.notify()
    }

    getEntry(id: string): InventoryEntry | undefined {
        return this.entries.get(id)
    }

    // ─── Sync historique ──────────────────────────────────────────────────────

    private syncFromHistory() {
        const placed = new Map<string, number>()
        for (const action of historyStore.undoStack) {
            if (action.type !== "place") continue
            const id = action.entityObject.userData.id as string | undefined
            if (!id) continue
            placed.set(id, (placed.get(id) ?? 0) + 1)
        }

        for (const [id, entry] of this.entries) {
            if (this.farmingItems.has(id)) continue
            this.quantities.set(id, entry.maxQty - (placed.get(id) ?? 0))
        }

        this.notify()

        const selId = placementStore.selectedItem?.id
        if (
            selId &&
            !placementStore.moveEntity &&              // ← ne pas annuler pendant un move
            (this.quantities.get(selId) ?? 0) <= 0
        ) {
            placementStore.cancel()
        }
    }
}

export const inventoryStore = new InventoryStore()