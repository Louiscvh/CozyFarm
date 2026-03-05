// src/ui/store/PlacementStore.ts
import * as THREE from "three"
import type { ItemDef } from "../../game/entity/ItemDef"
import type { Entity } from "../../game/entity/Entity"

export type { ItemDef }
export type InventoryItem = ItemDef

interface MoveOrigin {
    cellX: number
    cellZ: number
    rotY: number
}

class PlacementStore {
    selectedItem: ItemDef | null = null
    hoveredCell: { cellX: number; cellZ: number } | null = null
    canPlace: boolean = false
    rotation: number = 0
    ghostMesh: THREE.Object3D | null = null

    moveEntity: THREE.Object3D | null = null
    moveOrigin: MoveOrigin | null = null

    private _onCancelMove: (() => void) | null = null

    private listeners: (() => void)[] = []

    subscribe(fn: () => void): () => void {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter(l => l !== fn) }
    }

    private notify(): void {
        this.listeners.forEach(fn => fn())
    }

    // ─── Actions ───────────────────────────────────────────────────────────────

    select(item: ItemDef): void {
        this.selectedItem = item
        this.rotation = 0
        this.notify()
    }

    cancel(): void {
        // Si on annule un déplacement, restaure l'entité
        if (this._onCancelMove) {
            this._onCancelMove()
            this._onCancelMove = null
        }

        this.selectedItem = null
        this.hoveredCell = null
        this.canPlace = false
        this.rotation = 0
        this.moveEntity = null
        this.moveOrigin = null
        this.notify()
    }

    rotate(): void {
        this.rotation = (this.rotation + 90) % 360
        this.notify()
    }

    /**
     * Lance le mode déplacement d'une entité existante.
     * Signature alignée avec EntityPopup.tsx.
     */
    startMove(
        def: Entity,
        entityObject: THREE.Object3D,
        cellX: number,
        cellZ: number,
        rotY: number,
        onCancel: () => void,
    ): void {
        this.moveEntity = entityObject
        this.moveOrigin = { cellX, cellZ, rotY }
        this._onCancelMove = onCancel

        // Construit un ItemDef minimal pour que usePlacement puisse créer le ghost
        this.selectedItem = {
            id: def.id,
            label: def.id,
            icon: "",
            usage: { kind: "placeable", entity: def },
        }

        this.notify()
    }

    completeMove(): void {
        this._onCancelMove = null
        this.moveEntity = null
        this.moveOrigin = null
        this.selectedItem = null
        this.notify()
    }
}

export const placementStore = new PlacementStore()