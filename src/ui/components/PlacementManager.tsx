// src/ui/components/PlacementManager.tsx
import { useEffect } from "react"
import { Renderer } from "../../render/Renderer"
import { usePlacement } from "../hooks/usePlacement"
import { placementStore } from "../store/PlacementStore"
import { useFarming } from "../hooks/useFarming"
import { useItemAction } from "../hooks/useItemAction"

export function PlacementManager() {
    const r = Renderer.instance!
    const camera = r.camera
    const renderer = r.renderer

    usePlacement({ camera, renderer })
    useItemAction({ camera, renderer })
    useFarming()

    useEffect(() => {
        const canvas = renderer.domElement

        const updateCursor = () => {
            if (placementStore.selectedItem) {
                canvas.style.cursor = "crosshair"
            } else {
                canvas.style.cursor = "default"
            }
        }

        updateCursor()
        const unsub = placementStore.subscribe(updateCursor)

        return () => {
            unsub()
            canvas.style.cursor = "default"
        }
    }, [renderer])

    return null
}