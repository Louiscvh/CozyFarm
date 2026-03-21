// src/ui/components/PlacementManager.tsx
import { Renderer } from "../../render/Renderer"
import { usePlacement } from "../hooks/usePlacement"
import { useFarming } from "../hooks/useFarming"
import { useItemAction } from "../hooks/useItemAction"
import { CursorItem } from "./CursorItem"
import { useWoodcutting } from "../hooks/useWoodcutting"
import { useScanner } from "../hooks/useScanner"

export function PlacementManager() {
    const r = Renderer.instance!
    const camera = r.camera
    const renderer = r.renderer

    usePlacement({ camera, renderer })
    useItemAction({ camera, renderer })
    useFarming()
    useWoodcutting()
    useScanner()

    return <CursorItem />
}
