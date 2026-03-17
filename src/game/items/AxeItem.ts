// src/game/items/AxeItem.ts
import type { ItemDef } from "../entity/ItemDef"

// IDs de tous les arbres ciblables
export const TREE_ENTITY_IDS = ["tree1", "tree2", "tree3", "tree_orange"] as const
export const TREE_MIN_AXE_LEVEL: Record<(typeof TREE_ENTITY_IDS)[number], number> = {
    tree_orange: 1,
    tree1: 1,
    tree3: 2,
    tree2: 3,
}

export const AxeItemDef: ItemDef = {
    id: "axe",
    label: "Hache",
    icon: "🪓",
    showCursorItem: true,
    usageHint: "Cliquer sur un arbre · Niv2: acacia · Niv3: chêne",
    usage: {
        kind: "use_on_entity",
        targetEntityIds: [...TREE_ENTITY_IDS],
        actionId: "woodcutting:chop",
        consumeOnUse: false,   // outil infini
    },
}
