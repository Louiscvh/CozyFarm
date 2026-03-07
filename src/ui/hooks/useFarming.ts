// src/game/farming/useFarming.ts
import { useEffect } from "react"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { ALL_CROPS } from "../../game/farming/CropDefinition"
import { itemActionRegistry, type UseOnEntityContext } from "../../game/interaction/ItemActionRegistry"
import { World } from "../../game/world/World"

export function useFarming() {

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

        itemActionRegistry.registerTileAction("farming:water", ({ cellX, cellZ }) => {
            const world = World.current
            if (!world) return false

            // waterCell retourne false si déjà arrosé → on refuse l'action
            return world.tilesFactory.waterCell(cellX, cellZ)
        })

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