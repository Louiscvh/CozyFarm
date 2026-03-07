// src/game/items/AxeItem.ts
import type { ItemDef } from "../entity/ItemDef"

// IDs de tous les arbres ciblables
export const TREE_ENTITY_IDS = ["tree1", "tree2", "tree3", "tree_orange"] as const

export const AxeItemDef: ItemDef = {
    id: "axe",
    label: "Hache",
    icon: "🪓",
    showCursorItem: true,
    usage: {
        kind: "use_on_entity",
        targetEntityIds: [...TREE_ENTITY_IDS],
        actionId: "woodcutting:chop",
        consumeOnUse: false,   // outil infini
    },
}