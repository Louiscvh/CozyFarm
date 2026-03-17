import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { World } from "../../game/world/World"
import { computeGrowthRate } from "../../game/farming/GrowthConditions"
import { WorldPopup } from "./WorldPopup"
import { scannerPopupStore } from "../store/ScannerPopupStore"
import { placementStore } from "../store/PlacementStore"
import "./ScannerPopup.css"

const STAGE_BLOCKS = 4

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
  const normalizedStageProgress = phaseCount <= 1
    ? 1
    : Math.max(0, Math.min(1, (crop.phaseIndex + crop.phaseProgress) / (phaseCount - 1)))

  const conditions = computeGrowthRate(World.current?.weather ?? null)
  const isWatered = World.current?.tilesFactory.isWatered(crop.cellX, crop.cellZ) ?? false
  const growthBonus = conditions.breakdown.timePaused
    ? 0
    : conditions.breakdown.temperatureMult
      * conditions.breakdown.rainMult
      * conditions.breakdown.seasonMult
      * (isWatered ? conditions.wateredMult : 1)

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
      <div className="scanner-popup-stage-grid" aria-hidden>
        {Array.from({ length: STAGE_BLOCKS }, (_, index) => {
          const blockFill = Math.max(0, Math.min(1, normalizedStageProgress * STAGE_BLOCKS - index))
          return (
            <div key={index} className="scanner-popup-stage-cell">
              <div className="scanner-popup-stage-fill" style={{ transform: `scaleX(${blockFill})` }} />
            </div>
          )
        })}
      </div>

      <div className="scanner-popup-line">Progression: {progressPct}%</div>
      <div className="scanner-popup-progress">
        <div className="scanner-popup-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="scanner-popup-line">Coeff. pousse: {formatMult(growthBonus)}</div>
    </WorldPopup>
  )
}
