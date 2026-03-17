import type { ItemDef } from "../entity/ItemDef"

export const ScannerItemDef: ItemDef = {
    id: "scanner",
    label: "Scanner",
    icon: "🩺",
    usageHint: "Cliquer sur une culture pour analyser sa pousse",
    usage: {
        kind: "use_on_tile",
        targetTileTypes: ["soil", "grass"],
        actionId: "scanner:inspect",
        consumeOnUse: false,
        allowOnCrop: true,
    },
}
