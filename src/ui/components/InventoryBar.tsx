// src/ui/components/InventoryBar.tsx
import { useState, useEffect } from "react"
import { placementStore, type InventoryItem } from "../store/PlacementStore"
import { Tree1Entity } from "../../game/entity/Tree1"
import { Tree2Entity } from "../../game/entity/Tree2"
import { Rock1Entity } from "../../game/entity/Rock1"
import { Flower1Entity } from "../../game/entity/Flower1"
import { FarmEntity } from "../../game/entity/FarmEntity"
import { WheatField } from "../../game/entity/WheatField"
import "./InventoryBar.css"
import { UIButton } from "./UIButton"

const INVENTORY_ITEMS: InventoryItem[] = [
  { id: "tree2",  label: "Pin",    icon: "🌲", entity: Tree1Entity },
  { id: "tree1",  label: "Chêne",  icon: "🌳", entity: Tree2Entity },
  { id: "rock",   label: "Rocher", icon: "🪨", entity: Rock1Entity },
  { id: "flower", label: "Fleur",  icon: "🌸", entity: Flower1Entity },
  { id: "farm",   label: "Ferme",  icon: "🏚️", entity: FarmEntity },
  { id: "wheat",  label: "Blé",    icon: "🌾", entity: WheatField },
]

export function InventoryBar() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const unsub = placementStore.subscribe(() => {
      setSelectedId(placementStore.selectedItem?.id ?? null)
      setRotation(placementStore.rotation)
    })
    return unsub
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null)
        placementStore.cancel()
      }

      // Sélection via touches 1-6
      if (/^[1-6]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1
        const item = INVENTORY_ITEMS[index]
        if (item) {
          if (selectedId === item.id) {
            placementStore.cancel()
          } else {
            placementStore.select(item)
          }
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId])

  function handleSelect(item: InventoryItem) {
    if (selectedId === item.id) {
      placementStore.cancel()
    } else {
      placementStore.select(item)
    }
  }

  return (
    <div id="inventory-bar">
      {selectedId && (
        <div id="placement-hint">
          <span className="hint-key">R</span> Rotation {rotation}°
          <span className="hint-sep">·</span>
          <span className="hint-key">Échap</span> Annuler
        </div>
      )}

      <div id="inventory-slots">
        {INVENTORY_ITEMS.map((item, i) => (
          <UIButton
            key={item.id}
            className={`inv-slot ${selectedId === item.id ? "selected" : ""}`}
            onClick={() => handleSelect(item)}
            title={item.label}
          >
            <span className="inv-slot-key">{i + 1}</span>
            <span className="inv-slot-icon">{item.icon}</span>
            <span className="inv-slot-label">{item.label}</span>
          </UIButton>
        ))}
      </div>
    </div>
  )
}