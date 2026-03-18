import { useEffect, useMemo, useState } from "react"
import { placementStore } from "../store/PlacementStore"
import { toolLevelStore, type ToolId } from "../store/ToolLevelStore"
import { isPlaceable, isUsableOnEntity, isUsableOnTile } from "../../game/entity/ItemDef"
import "./MobileControls.css"

const MOBILE_QUERY = "(max-width: 900px), (pointer: coarse)"

const isLevelableTool = (itemId: string | null): itemId is ToolId =>
  itemId === "hoe" || itemId === "watering_can" || itemId === "axe" || itemId === "shovel" || itemId === "planter"

export function MobileControls() {
  const [selectedId, setSelectedId] = useState<string | null>(placementStore.selectedItem?.id ?? null)
  const [rotation, setRotation] = useState(placementStore.rotation)
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  const [, forceRefresh] = useState(0)

  useEffect(() => placementStore.subscribe(() => {
    setSelectedId(placementStore.selectedItem?.id ?? null)
    setRotation(placementStore.rotation)
  }), [])

  useEffect(() => toolLevelStore.subscribe(() => {
    forceRefresh(value => value + 1)
  }), [])

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const sync = () => setMobile(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  const selectedItem = placementStore.selectedItem
  const showRotate = !!selectedItem && isPlaceable(selectedItem)
  const showLevel = isLevelableTool(selectedId)
  const levelLabel = showLevel
    ? `${toolLevelStore.getLevel(selectedId)}/${toolLevelStore.getUnlockedLevel(selectedId)}`
    : null

  const actionLabel = useMemo(() => {
    if (!selectedItem) return "Tape sur une culture prête pour récolter."
    if (isPlaceable(selectedItem)) return "Tape sur le terrain pour placer l'objet."
    if (isUsableOnEntity(selectedItem) || isUsableOnTile(selectedItem)) return "Tape sur le terrain ou un objet du monde pour agir."
    return "Choisis un objet dans la barre d'inventaire."
  }, [selectedItem])

  if (!mobile) return null

  return (
    <div className="mobile-controls" aria-label="Contrôles mobile">
      <div className="mobile-controls__tips">
        <strong>Mobile</strong>
        <span>1 doigt: caméra</span>
        <span>2 doigts: déplacer + zoom</span>
        <span>{actionLabel}</span>
      </div>

      <div className="mobile-controls__actions">
        {showRotate && (
          <button type="button" className="mobile-controls__button" onClick={() => placementStore.rotate()}>
            Rotation {rotation}°
          </button>
        )}

        {showLevel && levelLabel && (
          <div className="mobile-controls__group">
            <button type="button" className="mobile-controls__button mobile-controls__button--small" onClick={() => toolLevelStore.decrease(selectedId)}>
              −
            </button>
            <span className="mobile-controls__badge">Niveau {levelLabel}</span>
            <button type="button" className="mobile-controls__button mobile-controls__button--small" onClick={() => toolLevelStore.increase(selectedId)}>
              +
            </button>
          </div>
        )}

        {selectedItem && (
          <button type="button" className="mobile-controls__button mobile-controls__button--secondary" onClick={() => placementStore.cancel()}>
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}
