import { useEffect, useMemo, useState } from "react"
import { World } from "../../game/world/World"
import { WorldPopup } from "./WorldPopup"
import { scannerPopupStore } from "../store/ScannerPopupStore"
import { placementStore } from "../store/PlacementStore"
import "./ScannerPopup.css"

export function ScannerPopup() {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const unsub = scannerPopupStore.subscribe(() => setVersion(v => v + 1))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = placementStore.subscribe(() => {
      if (placementStore.selectedItem?.id !== "scanner") scannerPopupStore.close()
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setVersion(v => v + 1), 200)
    return () => clearInterval(id)
  }, [])

  const snapshot = scannerPopupStore.getSnapshot()
  const crop = useMemo(() => {
    if (!snapshot.open) return null
    const world = World.current
    if (!world) return null
    return world.cropManager.getCrop(snapshot.cellX, snapshot.cellZ) ?? null
  }, [snapshot, version])

  if (snapshot.open && !crop) scannerPopupStore.close()
  if (!snapshot.open || !crop) return null

  const phaseNumber = crop.phaseIndex + 1
  const phaseCount = crop.phaseCount
  const progressPct = Math.round(crop.phaseProgress * 100)
  const remaining = Math.ceil(crop.phaseRemainingSeconds)
  const isWatered = World.current?.tilesFactory.isWatered(crop.cellX, crop.cellZ) ?? false

  return (
    <WorldPopup
      open={snapshot.open}
      anchorObject={crop.mesh}
      onClose={() => scannerPopupStore.close()}
      className="scanner-popup"
      offsetY={0.35}
    >
      <div className="scanner-popup-title">🩺 {crop.def.label}</div>
      <div className="scanner-popup-line">Phase: {phaseNumber}/{phaseCount}</div>
      <div className="scanner-popup-line">Progression: {progressPct}%</div>
      <div className="scanner-popup-line">Temps restant: {crop.isReady ? "Prête" : `${remaining}s`}</div>
      <div className="scanner-popup-line">Arrosée: {isWatered ? "Oui" : "Non"}</div>
    </WorldPopup>
  )
}
