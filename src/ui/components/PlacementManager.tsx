// src/ui/components/PlacementManager.tsx
import { useEffect } from "react"
import { Renderer } from "../../render/Renderer"
import { usePlacement } from "../hooks/usePlacement"
import { placementStore } from "../store/PlacementStore"
import { useFarming } from "../hooks/useFarming"
import { useItemAction } from "../hooks/useItemAction"
import { isPlaceable } from "../../game/entity/ItemDef"
import { CursorItem } from "./CursorItem"
import { ALL_CROPS } from "../../game/farming/CropDefinition"
import { useWoodcutting } from "../hooks/useWoodcutting"

export function PlacementManager() {
    const r = Renderer.instance!
    const camera = r.camera
    const renderer = r.renderer

    usePlacement({ camera, renderer })
    useItemAction({ camera, renderer })
    useFarming()
    useWoodcutting()


    useEffect(() => {
        const canvas = renderer.domElement

        const updateCursor = () => {
            const item = placementStore.selectedItem
            const isSeedGhost = !!ALL_CROPS.find(c => c.seedItemId === item?.id)?.usePlacementGhost
            canvas.style.cursor = item
                ? (isPlaceable(item) || isSeedGhost ? "crosshair" : "none")
                : "default"
        }

        updateCursor()
        const unsub = placementStore.subscribe(updateCursor)

        return () => {
            unsub()
            canvas.style.cursor = "default"
        }
    }, [renderer])

    return <CursorItem />
}