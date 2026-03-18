import type { ItemDef } from "../entity/ItemDef"

export const PlanterItemDef: ItemDef = {
    id: "planter",
    label: "Plantoir",
    icon: "🧺",
    showCursorItem: true,
    usageHint: "Maintiens le clic pour planter avec la dernière graine choisie ou récolter en zone",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["soil", "grass"],
        actionId: "farming:bulk_plant_or_harvest",
        consumeOnUse: false,
        allowOnCrop: true,
    },
}
