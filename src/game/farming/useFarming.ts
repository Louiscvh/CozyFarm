// src/game/farming/useFarming.ts
import { useEffect } from "react"
import { World } from "../world/World"
import { itemActionRegistry } from "../interaction/ItemActionRegistry"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { ALL_CROPS } from "./CropDefinition"
import type { UseOnEntityContext } from "../interaction/ItemActionRegistry"

/**
 * Enregistre une action de plantation générique pour chaque CropDefinition.
 * Pour ajouter un nouveau légume :
 *   1. Crée sa CropDefinition dans CropDefinition.ts
 *   2. Ajoute-la dans ALL_CROPS
 *   3. Crée son ItemDef avec actionId: `farming:plant_${def.id}`
 * C'est tout — aucune modification ici requise.
 */
function registerPlantActions() {
    for (const def of ALL_CROPS) {
        itemActionRegistry.registerTileAction(
            `farming:plant_${def.id}`,
            (ctx) => {
                const world = World.current
                if (!world) return false
                if (!world.tilesFactory.isSoil(ctx.cellX, ctx.cellZ)) return false
                if (world.cropManager.hasCrop(ctx.cellX, ctx.cellZ)) return false
                return world.cropManager.plant(def, ctx.cellX, ctx.cellZ) !== null
            }
        )
    }
}

export function useFarming() {
    useEffect(() => {

        // ── Bêcher ────────────────────────────────────────────────────
        itemActionRegistry.registerTileAction("farming:till", (ctx) => {
            const world = World.current
            if (!world) return false
            return world.tilesFactory.tillCell(ctx.cellX, ctx.cellZ)
        })

        itemActionRegistry.registerTileAction("farming:untill", (ctx) => {
            const world = World.current
            if (!world) return false
            // Bloqué si une plante est dessus
            if (world.cropManager.hasCrop(ctx.cellX, ctx.cellZ)) return false
            world.tilesFactory.untillCell(ctx.cellX, ctx.cellZ)
            return true
        })

        // ── Plantation — une action par crop, générée automatiquement ─
        registerPlantActions()

        // ── Récolte ───────────────────────────────────────────────────
        itemActionRegistry.registerEntityAction(
            "farming:harvest",
            (ctx: UseOnEntityContext): boolean => {
                const world = World.current
                if (!world) return false
                const harvested = world.cropManager.harvest(ctx.cellX, ctx.cellZ)
                if (!harvested) return false
                inventoryStore.produce(harvested.def.harvestItemId, harvested.def.harvestQty)
                return true
            }
        )

    }, [])
}