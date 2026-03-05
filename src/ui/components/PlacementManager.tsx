// src/ui/components/PlacementManager.tsx
import { useEffect } from "react"
import { Renderer } from "../../render/Renderer"
import { usePlacement } from "../hooks/usePlacement"
import { placementStore } from "../store/PlacementStore"
import { useItemAction } from "../../game/interaction/useItemAction"
import { useFarming } from "../../game/farming/useFarming"

export function PlacementManager() {
    const r = Renderer.instance!
    const camera = r.camera
    const renderer = r.renderer

    usePlacement({ camera, renderer })
    useItemAction({ camera, renderer })
    useFarming()

    useEffect(() => {
        const unsub = placementStore.subscribe(() => {
            document.body.classList.toggle("placing", !!placementStore.selectedItem)
        })
        return unsub
    }, [])

    return null
}