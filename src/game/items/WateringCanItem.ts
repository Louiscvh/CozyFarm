// src/game/farming/items/WateringCanItem.ts
import type { ItemDef } from "../entity/ItemDef";

export const WATERING_CAN_MAX_CHARGES = 10

export const WateringCanItemDef: ItemDef = {
    id: "watering_can",
    label: "Arrosoir",
    icon: "💧",
    showCursorItem: true,
    usage: {
        kind: 'use_on_tile',
        targetTileTypes: ["soil"],
        actionId: "farming:water",
        consumeOnUse: false,   // décrémente les charges à chaque utilisation
        allowOnCrop: true,
    },
}