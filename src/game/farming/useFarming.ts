// src/game/farming/useFarming.ts
import { useEffect } from "react"
import { World } from "../world/World"
import { itemActionRegistry } from "../interaction/ItemActionRegistry"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { CarrotCrop } from "./CropDefinition"
import type { UseOnEntityContext } from "../interaction/ItemActionRegistry"

export function useFarming() {
    useEffect(() => {

        // ── Bêcher une case de grass ───────────────────────────────────
        itemActionRegistry.registerTileAction("farming:till", (ctx) => {
            const world = World.current
            if (!world) return false
            return world.tilesFactory.tillCell(ctx.cellX, ctx.cellZ)
        })

        // ── Planter une carotte sur une case bêchée ────────────────────
        itemActionRegistry.registerTileAction("farming:plant_carrot", (ctx) => {
            const world = World.current
            if (!world) return false
            if (!world.tilesFactory.isSoil(ctx.cellX, ctx.cellZ)) return false
            if (world.cropManager.hasCrop(ctx.cellX, ctx.cellZ)) return false
            return world.cropManager.plant(CarrotCrop, ctx.cellX, ctx.cellZ) !== null
        })

        // ── Récolte (clic libre sur un crop mesh mûr) ──────────────────
        itemActionRegistry.registerEntityAction(
            "farming:harvest",
            (ctx: UseOnEntityContext): boolean => {
                const world = World.current
                if (!world) return false
                const harvested = world.cropManager.harvest(ctx.cellX, ctx.cellZ)
                if (!harvested) return false
                // La case redevient juste bêchée (pas de tile, prête pour replanter)
                // world.tilledLayer.untill(ctx.cellX, ctx.cellZ) // ← décommenter si on veut reset
                inventoryStore.produce(harvested.def.harvestItemId, harvested.def.harvestQty)
                return true
            }
        )

    }, [])
}