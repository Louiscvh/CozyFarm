// src/game/interaction/useItemAction.ts
import { useEffect } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import { ItemActionController } from "../../game/interaction/ItemActionController"


interface UseItemActionOptions {
    camera: THREE.Camera
    renderer: THREE.WebGLRenderer
}

export function useItemAction({ camera, renderer }: UseItemActionOptions): void {
    useEffect(() => {
        const world = World.current
        if (!world) return

        const controller = new ItemActionController(camera, renderer, world)
        controller.init()

        return () => controller.dispose()
    }, [camera, renderer])
}