// src/game/farming/items/HoeItem.ts
import type { ItemDef } from "../../entity/ItemDef"

export const HoeItemDef: ItemDef = {
    id: "hoe",
    label: "Houe",
    icon: "⛏️",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["grass"],
        actionId: "farming:till",
        consumeOnUse: false,
    },
}