// src/game/placement/usePlacement.ts
import { useEffect } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import { PlacementController } from "../../game/interaction/PlacementController"

interface UsePlacementOptions {
    camera: THREE.Camera
    renderer: THREE.WebGLRenderer
}

export function usePlacement({ camera, renderer }: UsePlacementOptions): void {
    useEffect(() => {
        const world = World.current
        if (!world) return

        const controller = new PlacementController(camera, renderer, world)
        controller.init()

        return () => controller.dispose()
    }, [camera, renderer])
}