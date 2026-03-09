import type { ItemDef } from "../entity/ItemDef"

export const StakeItemDef: ItemDef = {
    id: "stake",
    label: "Tuteur",
    icon: "🪵",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["grass"],
        actionId: "farming:add_stake",
        allowOnCrop: true,
    },
}
