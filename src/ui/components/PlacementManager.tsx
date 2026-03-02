import { useEffect } from "react"
import { Renderer } from "../../render/Renderer"
import { usePlacement } from "../hooks/usePlacement"
import { placementStore } from "../store/PlacementStore"

/**
 * Pont entre React et le Renderer Three.js.
 * Renderer.instance est garanti non-null ici car le Renderer
 * est instancié avant le montage React.
 */
export function PlacementManager() {
    const r = Renderer.instance!
  
    usePlacement({
      camera: r.camera,
      renderer: r.renderer,
    })
  
    // Curseur crosshair quand un item est sélectionné
    useEffect(() => {
      const unsub = placementStore.subscribe(() => {
        document.body.classList.toggle("placing", !!placementStore.selectedItem)
      })
      return unsub
    }, [])
  
    return null
  }