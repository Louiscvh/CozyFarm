// src/game/farming/useFarming.ts
import { useEffect } from "react"
import * as THREE from "three"
import { inventoryStore } from "../../ui/store/InventoryStore"
import { ALL_CROPS } from "../../game/farming/CropDefinition"
import { itemActionRegistry, type UseOnEntityContext } from "../../game/interaction/ItemActionRegistry"
import { World } from "../../game/world/World"
import { getAreaOffsetsForLevel, getAreaOffsetsForTool, toolLevelStore } from "../store/ToolLevelStore"
import { placementStore } from "../store/PlacementStore"

export function useFarming() {
    useEffect(() => {
        registerFarmingActions()
    }, [])
}

function registerPlantActions() {
        for (const def of ALL_CROPS) {
            itemActionRegistry.registerTileAction(
                `farming:plant_${def.id}`,
                (ctx) => {
                    const world = World.current
                    if (!world) return false
                    const allowedTiles = def.plantTileTypes ?? ["soil"]
                    if (!allowedTiles.includes(ctx.tileType)) return false
                    if (world.cropManager.hasCrop(ctx.cellX, ctx.cellZ)) return false

                    const planted = world.cropManager.plant(def, ctx.cellX, ctx.cellZ)
                    if (!planted) return false

                    world.tilesFactory.playPlantAnimation(ctx.cellX, ctx.cellZ)
                    return true
                }
            )
        }
    }

export function registerFarmingActions(): void {
        // ── Bêcher ────────────────────────────────────────────────────
        itemActionRegistry.registerTileAction("farming:till", (ctx) => {
            const world = World.current
            if (!world) return false
            const level = toolLevelStore.getLevel("hoe")
            let changed = false
            for (const offset of getAreaOffsetsForLevel(level)) {
                changed = world.tilesFactory.tillCell(ctx.cellX + offset.x, ctx.cellZ + offset.z) || changed
            }
            return changed
        })

        itemActionRegistry.registerTileAction("farming:untill", (ctx) => {
            const world = World.current
            if (!world) return false
            // Bloqué si une plante est dessus
            if (world.cropManager.hasCrop(ctx.cellX, ctx.cellZ)) return false
            return world.tilesFactory.untillCell(ctx.cellX, ctx.cellZ)
        })

        itemActionRegistry.registerTileAction("farming:uproot_or_untill", (ctx) => {
            const world = World.current
            if (!world) return false

            const level = toolLevelStore.getLevel("shovel")
            let changed = false

            for (const offset of getAreaOffsetsForLevel(level)) {
                const cellX = ctx.cellX + offset.x
                const cellZ = ctx.cellZ + offset.z

                if (world.tilesFactory.clearSnowCell(cellX, cellZ)) { changed = true; continue }

                const uprooted = world.cropManager.uproot(cellX, cellZ, true)
                if (uprooted) { changed = true; continue }

                if (world.cropManager.removeLooseStake(cellX, cellZ)) { changed = true; continue }

                changed = world.tilesFactory.untillCell(cellX, cellZ) || changed
            }

            return changed
        })

        itemActionRegistry.registerTileAction("farming:add_stake", (ctx) => {
            const world = World.current
            if (!world) return false
            const crop = world.cropManager.getCrop(ctx.cellX, ctx.cellZ)
            if (!crop?.def.supportsStake) return false
            return !!world.cropManager.addStake(ctx.cellX, ctx.cellZ)
        })

        itemActionRegistry.registerTileAction("farming:water", ({ cellX, cellZ }) => {
            const world = World.current
            if (!world) return false
            const level = toolLevelStore.getLevel("watering_can")
            let changed = false

            for (const offset of getAreaOffsetsForLevel(level)) {
                changed = world.tilesFactory.waterCell(cellX + offset.x, cellZ + offset.z) || changed
            }

            // waterCell retourne false si déjà arrosé → on refuse l'action
            return changed
        })

        registerPlantActions()

        itemActionRegistry.registerTileAction("farming:bulk_plant_or_harvest", (ctx) => {
            const world = World.current
            if (!world) return false

            const offsets = getAreaOffsetsForTool("planter", toolLevelStore.getLevel("planter"))
            let changed = false

            for (const offset of offsets) {
                const cellX = ctx.cellX + offset.x
                const cellZ = ctx.cellZ + offset.z
                const crop = world.cropManager.getCrop(cellX, cellZ)

                if (crop?.isReady) {
                    const harvested = world.cropManager.harvest(cellX, cellZ)
                    if (!harvested) continue
                    inventoryStore.produce(harvested.def.harvestItemId, harvested.def.harvestQty, { cellX, cellZ })
                    inventoryStore.produce(harvested.def.harvestItemId, harvested.def.harvestQty)
                    changed = true
                    continue
                }

                if (crop) continue

                const tileType = world.tilesFactory.isSoil(cellX, cellZ) ? "soil" : world.tilesFactory.getTileTypeAtCell(cellX, cellZ)
                const preferredSeedId = placementStore.preferredBulkSeedId
                const cropDef = ALL_CROPS.find(def =>
                    def.seedItemId === preferredSeedId
                    && inventoryStore.getQty(def.seedItemId) > 0
                    && (def.plantTileTypes ?? ["soil"]).includes(tileType ?? "")
                ) ?? ALL_CROPS.find(def =>
                    inventoryStore.getQty(def.seedItemId) > 0
                    && (def.plantTileTypes ?? ["soil"]).includes(tileType ?? "")
                )

                if (!cropDef) continue
                if (!(cropDef.plantTileTypes ?? ["soil"]).includes(tileType ?? "")) continue
                if (!world.cropManager.plant(cropDef, cellX, cellZ)) continue

                inventoryStore.consume(cropDef.seedItemId)
                world.tilesFactory.playPlantAnimation(cellX, cellZ)
                changed = true
            }

            return changed
        })

        // ── Récolte ───────────────────────────────────────────────────
        itemActionRegistry.registerEntityAction(
            "farming:harvest",
            (ctx: UseOnEntityContext): boolean => {
                const world = World.current
                if (!world) return false
                const harvested = world.cropManager.harvest(ctx.cellX, ctx.cellZ)
                if (!harvested) return false
                inventoryStore.produce(harvested.def.harvestItemId, harvested.def.harvestQty, { cellX: ctx.cellX, cellZ: ctx.cellZ })
                inventoryStore.produce(harvested.def.harvestItemId, harvested.def.harvestQty)
                if (harvested.def.fruitRegrowSeconds) {
                    const mesh = harvested.mesh as THREE.Object3D | null
                    if (mesh) {
                        const box = new THREE.Box3().setFromObject(mesh)
                        const foliageY = THREE.MathUtils.lerp(box.min.y, box.max.y, 0.6)
                        world.tilesFactory.playPlantAnimation(ctx.cellX, ctx.cellZ, foliageY, 1.8)
                    } else {
                        world.tilesFactory.playPlantAnimation(ctx.cellX, ctx.cellZ)
                    }
                }
                return true
            }
        )

}
