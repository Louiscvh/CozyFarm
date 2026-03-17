// src/ui/hooks/useWoodcutting.ts
import { useEffect } from "react"
import { itemActionRegistry } from "../../game/interaction/ItemActionRegistry"
import { inventoryStore } from "../store/InventoryStore"
import { historyStore, animateAppear } from "../store/HistoryStore"
import { placementStore } from "../store/PlacementStore"
import { animateChop } from "../../game/entity/animations/ChopAnimation"
import { World } from "../../game/world/World"
import { TREE_ENTITY_IDS, TREE_MIN_AXE_LEVEL } from "../../game/items/AxeItem"
import { toolLevelStore } from "../store/ToolLevelStore"

const WOOD_BY_TREE: Record<string, number> = {
    tree1: 2,
    tree2: 3,
    tree3: 2,
    tree_orange: 1,
}

const AXE_LEVEL_WOOD_BONUS = [0, 0, 1, 2, 4]

export function useWoodcutting() {
    useEffect(() => {
        itemActionRegistry.registerEntityAction("woodcutting:chop", (ctx) => {
            const { targetEntityId, cellX, cellZ } = ctx
            if (!(TREE_ENTITY_IDS as readonly string[]).includes(targetEntityId)) return false

            const world = World.current
            if (!world) return false

            const axeLevel = toolLevelStore.getLevel("axe")
            if (axeLevel < (TREE_MIN_AXE_LEVEL[targetEntityId as keyof typeof TREE_MIN_AXE_LEVEL] ?? 1)) return false

            const entity = world.entities.find(e =>
                e.userData.id === targetEntityId &&
                e.userData.cellX === cellX &&
                e.userData.cellZ === cellZ,
            )
            if (!entity) return false

            const footprint = (entity.userData.sizeInCells as number) ?? 1
            const baseQty = WOOD_BY_TREE[targetEntityId] ?? 1
            const qty = baseQty + (AXE_LEVEL_WOOD_BONUS[axeLevel] ?? 0)
            const originalY = entity.position.y
            const originalScale = entity.scale.clone()
            const originalRotation = entity.rotation.clone()
            const instanceSlot = entity.userData.instanceSlot as number
            const instanceDef = entity.userData.def

            // ── Suppression ───────────────────────────────────────────────────
            world.entities.splice(world.entities.indexOf(entity), 1)
            world.tilesFactory.markFree(cellX, cellZ, footprint)

            // ── Animation chute (cache le slot instancié elle-même) ───────────
            animateChop(world, entity)
            world.tilesFactory.playTreeChopAnimation(cellX, cellZ)

            // ── Bois ──────────────────────────────────────────────────────────
            inventoryStore.produce("wood", qty, { cellX, cellZ })

            // ── Historique ────────────────────────────────────────────────────
            const occupiedCells: { x: number; z: number }[] = []
            for (let dx = 0; dx < footprint; dx++)
                for (let dz = 0; dz < footprint; dz++)
                    occupiedCells.push({ x: cellX + dx, z: cellZ + dz })

            historyStore.push({
                type: "delete",
                entityObject: entity,
                occupiedCells,
                sizeInCells: footprint,
                savedHoveredCell: placementStore.hoveredCell,
                originalY,
                originalScale,
                originalRotation,
                cancelAnimation: () => { },

                onRestore: (w) => {
                    inventoryStore.consume("wood", Math.min(qty, inventoryStore.getQty("wood")))

                    entity.position.y = originalY - 2
                    entity.scale.setScalar(0)

                    if (entity.userData.isInstanced) {
                        w.instanceManager.reserveSlot(instanceDef, instanceSlot)
                        w.instanceManager.setTransform(
                            instanceDef, instanceSlot,
                            entity.position,
                            entity.userData.rotY ?? 0,
                            0,
                        )
                    }

                    animateAppear(w, entity, originalY, originalScale, originalRotation)
                },

                onRemove: (w) => {
                    inventoryStore.produce("wood", qty, { cellX, cellZ })
                    animateChop(w, entity)
                    w.tilesFactory.playTreeChopAnimation(cellX, cellZ)
                },
            })

            return true
        })
    }, [])
}
