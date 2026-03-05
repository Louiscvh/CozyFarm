// src/game/interaction/ItemActionRegistry.ts

/**
 * Contexte fourni au handler lors d'un "use_on_entity".
 */
export interface UseOnEntityContext {
    /** ID de l'entité cible (userData.id) */
    targetEntityId: string
    /** Coordonnées de cellule de l'entité cible */
    cellX: number
    cellZ: number
    /** ID de l'item utilisé */
    itemId: string
}

/**
 * Contexte fourni au handler lors d'un "use_on_tile".
 */
export interface UseOnTileContext {
    tileType: string
    cellX: number
    cellZ: number
    itemId: string
}

export type EntityActionHandler = (ctx: UseOnEntityContext) => boolean  // true = succès, consomme l'item
export type TileActionHandler = (ctx: UseOnTileContext) => boolean

class ItemActionRegistry {
    private entityHandlers = new Map<string, EntityActionHandler>()
    private tileHandlers = new Map<string, TileActionHandler>()

    registerEntityAction(actionId: string, handler: EntityActionHandler): void {
        if (this.entityHandlers.has(actionId)) {
            console.warn(`[ItemActionRegistry] Écrasement du handler "${actionId}"`)
        }
        this.entityHandlers.set(actionId, handler)
    }

    registerTileAction(actionId: string, handler: TileActionHandler): void {
        this.tileHandlers.set(actionId, handler)
    }

    executeEntityAction(actionId: string, ctx: UseOnEntityContext): boolean {
        const handler = this.entityHandlers.get(actionId)
        if (!handler) {
            console.warn(`[ItemActionRegistry] Handler introuvable: "${actionId}"`)
            return false
        }
        return handler(ctx)
    }

    executeTileAction(actionId: string, ctx: UseOnTileContext): boolean {
        const handler = this.tileHandlers.get(actionId)
        if (!handler) return false
        return handler(ctx)
    }
}

export const itemActionRegistry = new ItemActionRegistry()