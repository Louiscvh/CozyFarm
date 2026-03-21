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

  const phaseDurations = crop.def.phases.map(phase => Math.max(0, phase.durationSeconds))
  const growthStageCount = Math.max(1, phaseDurations.length - 1)
  const growthDurations = phaseDurations.slice(0, growthStageCount)

  const visualWeightsRaw = (() => {
    const positive = growthDurations.filter(value => value > 0)
    if (positive.length === 0) return growthDurations.map(() => 1)
    return growthDurations.map(value => Math.max(value, 0))
  })()

  const totalDuration = growthDurations.reduce((acc, value) => acc + value, 0)
  const totalVisualWeight = visualWeightsRaw.reduce((acc, value) => acc + value, 0)

  const elapsedDuration = crop.isReady
    ? totalDuration
    : growthDurations
      .slice(0, crop.phaseIndex)
      .reduce((acc, value) => acc + value, 0) + (growthDurations[crop.phaseIndex] ?? 0) * crop.phaseProgress

  const normalizedStageProgress = totalDuration <= 0
    ? (crop.isReady ? 1 : Math.max(0, Math.min(1, (crop.phaseIndex + crop.phaseProgress) / growthStageCount)))
    : Math.max(0, Math.min(1, elapsedDuration / totalDuration))

  const stageTiles = visualWeightsRaw.map((visualWeight, index) => {
    const widthWeight = totalVisualWeight <= 0 ? 1 / Math.max(1, visualWeightsRaw.length) : visualWeight / totalVisualWeight
    const start = totalVisualWeight <= 0
      ? index / Math.max(1, visualWeightsRaw.length)
      : visualWeightsRaw.slice(0, index).reduce((acc, value) => acc + value, 0) / totalVisualWeight
    const end = totalVisualWeight <= 0
      ? (index + 1) / Math.max(1, visualWeightsRaw.length)
      : start + widthWeight

    const fill = end - start <= 0
      ? (normalizedStageProgress >= end ? 1 : 0)
      : Math.max(0, Math.min(1, (normalizedStageProgress - start) / (end - start)))

    return {
      widthPct: Math.max(0, widthWeight * 100),
      fill,
    }
  })

  const conditions = computeGrowthRate(World.current?.weather ?? null)
  const hydrationLevel = World.current?.tilesFactory.getHydrationLevel(crop.cellX, crop.cellZ) ?? 0
  const isWatered = hydrationLevel > 0.0001
  const hydrationTiles = [0, 1].map(index => ({
    fill: Math.max(0, Math.min(1, hydrationLevel - index)),
  }))
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
        {stageTiles.map((tile, index) => (
          <div key={index} className="scanner-popup-stage-cell" style={{ width: `${tile.widthPct}%` }}>
            <div className="scanner-popup-stage-fill" style={{ transform: `scaleX(${tile.fill})` }} />
          </div>
        ))}
      </div>

      <div className="scanner-popup-line">Progression: {progressPct}%</div>
      <div className="scanner-popup-progress">
        <div className="scanner-popup-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="scanner-popup-line">Hydratation: {hydrationLevel.toFixed(1)}/2</div>
      <div className="scanner-popup-hydration-grid" aria-hidden>
        {hydrationTiles.map((tile, index) => (
          <div key={index} className="scanner-popup-hydration-cell">
            <div className="scanner-popup-hydration-fill" style={{ transform: `scaleX(${tile.fill})` }} />
          </div>
        ))}
      </div>

      <div className="scanner-popup-line">Coeff. pousse: {formatMult(growthBonus)}</div>
    </WorldPopup>
  )
}
