import { useEffect } from "react"
import { itemActionRegistry } from "../../game/interaction/ItemActionRegistry"
import { World } from "../../game/world/World"
import { scannerPopupStore } from "../store/ScannerPopupStore"

export function useScanner() {
  useEffect(() => {
    itemActionRegistry.registerTileAction("scanner:inspect", ({ cellX, cellZ }) => {
      const world = World.current
      if (!world) return false
      const crop = world.cropManager.getCrop(cellX, cellZ)
      if (!crop) return false
      scannerPopupStore.openAt(cellX, cellZ)
      return true
    })
  }, [])
}
