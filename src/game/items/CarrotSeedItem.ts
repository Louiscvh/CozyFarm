// src/game/farming/items/CarrotSeedItem.ts
import type { ItemDef } from "../entity/ItemDef";

export const CarrotSeedItemDef: ItemDef = {
    id: "carrot_seed",
    label: "Graine carotte",
    icon: "🌱",
    usageHint: "Cliquer sur une terre labourée pour planter.",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["soil"],
        actionId: "farming:plant_carrot",
    },
}