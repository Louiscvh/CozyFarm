// src/game/farming/items/LettuceSeedItem.ts
import type { ItemDef } from "../entity/ItemDef";

export const LettuceSeedItemDef: ItemDef = {
    id: "lettuce_seed",
    label: "Graine salade",
    icon: "🌱",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["soil"],
        actionId: "farming:plant_lettuce",
    },
}