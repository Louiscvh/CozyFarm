import type { ItemDef } from "../entity/ItemDef"

export const OrangeSaplingItemDef: ItemDef = {
    id: "orange_sapling",
    label: "Pousse d'oranger",
    icon: "🌱",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["soil"],
        actionId: "farming:plant_orange_tree",
    },
}
