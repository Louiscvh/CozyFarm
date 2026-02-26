// src/App.tsx
import "./ui/App.css"
import { useEffect } from "react"
import { GameClock } from "./ui/components/GameClock"
import { HomeButton } from "./ui/components/HomeButton"
import { LoaderOverlay } from "./ui/components/LoaderOverlay"
import { LoaderProvider } from "./ui/store/LoaderContext"
import { DevToolBar } from "./ui/components/DevToolBar"
import { InventoryBar } from "./ui/components/InventoryBar"
import { usePlacement } from "./ui/hooks/usePlacement"
import { placementStore } from "./ui/store/PlacementStore"
import { Renderer } from "./render/Renderer"

export const App = () => {
  return (
    <LoaderProvider>
      <LoaderOverlay />
      <PlacementBridge />

      <div id="ui-root">
        <header>
          <HomeButton />
          <GameClock />
        </header>

        <DevToolBar />
        <InventoryBar />
      </div>
    </LoaderProvider>
  )
}

/**
 * Pont entre React et le Renderer Three.js.
 * Renderer.instance est garanti non-null ici car le Renderer
 * est instancié avant le montage React.
 */
function PlacementBridge() {
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