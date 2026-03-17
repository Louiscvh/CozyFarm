import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import { computeGrowthRate } from "../../game/farming/GrowthConditions"
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

  const anchorWorldPosition = useMemo(() => {
    if (!snapshot.open) return null

    const world = World.current
    if (!world) return null

    if (crop?.mesh) {
      const box = new THREE.Box3().setFromObject(crop.mesh)
      return new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.max.y + 0.35,
        (box.min.z + box.max.z) / 2,
      )
    }

    const half = world.sizeInCells / 2
    return new THREE.Vector3(
      (snapshot.cellX - half + 0.5) * world.cellSize,
      world.cellSize * 0.75,
      (snapshot.cellZ - half + 0.5) * world.cellSize,
    )
  }, [crop, snapshot, version])

  if (snapshot.open && !crop) scannerPopupStore.close()
  if (!snapshot.open || !crop) return null

  const phaseNumber = crop.phaseIndex + 1
  const phaseCount = crop.phaseCount
  const progressPct = Math.round(crop.phaseProgress * 100)
  const remaining = Math.ceil(crop.phaseRemainingSeconds)
  const isWatered = World.current?.tilesFactory.isWatered(crop.cellX, crop.cellZ) ?? false
  const conditions = computeGrowthRate(World.current?.weather ?? null)
  const baseGrowth = conditions.growthRate
  const effectiveGrowth = isWatered ? baseGrowth * conditions.wateredMult : baseGrowth

  const formatMult = (value: number) => `x${value.toFixed(2)}`

  return (
    <WorldPopup
      open={snapshot.open}
      anchorObject={crop.mesh ?? null}
      anchorWorldPosition={anchorWorldPosition}
      onClose={() => scannerPopupStore.close()}
      className="scanner-popup"
      offsetY={0.35}
    >
      <div className="scanner-popup-title">🩺 {crop.def.label}</div>
      <div className="scanner-popup-line">Phase: {phaseNumber}/{phaseCount}</div>
      <div className="scanner-popup-line">Progression: {progressPct}%</div>
      <div className="scanner-popup-line">Temps restant: {crop.isReady ? "Prête" : `${remaining}s`}</div>
      <div className="scanner-popup-line">Arrosée: {isWatered ? "Oui" : "Non"}</div>
      <div className="scanner-popup-line">Coeff. pousse: {formatMult(effectiveGrowth)}{conditions.breakdown.timePaused ? " (pause)" : ""}</div>
      <div className="scanner-popup-line scanner-popup-line--muted">Base {formatMult(baseGrowth)} · Arrosage {formatMult(conditions.wateredMult)}</div>
      <div className="scanner-popup-line scanner-popup-line--muted">Temp {formatMult(conditions.breakdown.temperatureMult)} · Pluie {formatMult(conditions.breakdown.rainMult)} · Vitesse {formatMult(conditions.breakdown.timeSpeedMult)} · Saison {formatMult(conditions.breakdown.seasonMult)}</div>
    </WorldPopup>
  )
}
