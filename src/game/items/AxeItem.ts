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

const TREE_ORDER_BY_VALUE: readonly (typeof TREE_ENTITY_IDS)[number][] = ["tree2", "tree3", "tree1", "tree_orange"]
const TREE_LABELS: Record<(typeof TREE_ENTITY_IDS)[number], string> = {
    tree2: "Chêne",
    tree3: "Acacia",
    tree1: "Pin",
    tree_orange: "Oranger",
}

export function getBestTreeLabelForAxeLevel(level: number): string {
    const bestTree = TREE_ORDER_BY_VALUE.find(treeId => (TREE_MIN_AXE_LEVEL[treeId] ?? 1) <= level) ?? "tree_orange"
    return TREE_LABELS[bestTree]
}

export const AxeItemDef: ItemDef = {
    id: "axe",
    label: "Hache",
    icon: "🪓",
    showCursorItem: true,
    usageHint: "Cliquer sur un arbre pour le couper",
    usage: {
        kind: "use_on_entity",
        targetEntityIds: [...TREE_ENTITY_IDS],
        actionId: "woodcutting:chop",
        consumeOnUse: false,   // outil infini
    },
}
