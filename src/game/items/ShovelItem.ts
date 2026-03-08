import type { ItemDef } from "../entity/ItemDef";

export const ShovelItemDef: ItemDef = {
    id: "shovel",
    label: "Pelle",
    icon: "🛠️",
    showCursorItem: true,
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["soil"],
        actionId: "farming:uproot_or_untill",
        consumeOnUse: false,
        allowOnCrop: true,
    },
}
