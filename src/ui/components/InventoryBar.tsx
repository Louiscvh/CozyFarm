// src/ui/components/InventoryBar.tsx
import { useState, useEffect } from "react"
import { placementStore, type InventoryItem } from "../store/PlacementStore"
import { inventoryStore } from "../store/InventoryStore"
import { Tree1Entity } from "../../game/entity/Tree1"
import { Tree2Entity } from "../../game/entity/Tree2"
import { Rock1Entity } from "../../game/entity/Rock1"
import { Flower1Entity } from "../../game/entity/Flower1"
import { FarmEntity } from "../../game/entity/FarmEntity"
import { WheatField } from "../../game/entity/WheatField"
import { TorchEntity } from "../../game/entity/TorchEntity"
import { CabanaEntity } from "../../game/entity/Cabana"
import "./InventoryBar.css"
import { UIButton } from "./UIButton"
import { Tree3Entity } from "../../game/entity/Tree3"

const INVENTORY_ITEMS: InventoryItem[] = [
  { id: "tree1",  label: "Pin",  icon: "🌲", entity: Tree1Entity },
  { id: "tree2",  label: "Chêne",    icon: "🌳", entity: Tree2Entity },
  { id: "tree3",  label: "Acacia",  icon: "🌴", entity: Tree3Entity },
  { id: "rock1",   label: "Rocher", icon: "🪨", entity: Rock1Entity },
  { id: "flower1", label: "Fleur",  icon: "🌸", entity: Flower1Entity },
  { id: "farm",   label: "Ferme",  icon: "🏚️", entity: FarmEntity },
  { id: "wheatField",  label: "Blé",    icon: "🌾", entity: WheatField },
  { id: "cabana", label: "Cabane", icon: "🛖", entity: CabanaEntity },
  { id: "torch",  label: "Torche", icon: "🔥", entity: TorchEntity },
]

// Enregistrement des quantités max — exécuté une seule fois au load du module
inventoryStore.register([
  { id: "tree2",  maxQty: 16 },
  { id: "tree1",  maxQty: 16 },
  { id: "tree3",  maxQty: 16 },
  { id: "rock1",   maxQty: 32 },
  { id: "flower1", maxQty: 64 },
  { id: "farm",   maxQty: 4  },
  { id: "wheatField",  maxQty: 16 },
  { id: "cabana", maxQty: 8  },
  { id: "torch",  maxQty: 32 },
])

const SLOT_CODES = INVENTORY_ITEMS.map((_, i) => `Digit${i + 1}`)

export function InventoryBar() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rotation, setRotation]     = useState(0)
  const [, forceUpdate]             = useState(0)

  useEffect(() => {
    return placementStore.subscribe(() => {
      setSelectedId(placementStore.selectedItem?.id ?? null)
      setRotation(placementStore.rotation)
    })
  }, [])

  // Re-render à chaque changement de quantité
  useEffect(() => {
    return inventoryStore.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === "Escape") {
        placementStore.cancel()
        return
      }

      const index = SLOT_CODES.indexOf(e.code)
      if (index === -1) return
      const item = INVENTORY_ITEMS[index]
      if (!item || inventoryStore.getQty(item.id) <= 0) return

      if (selectedId === item.id) placementStore.cancel()
      else placementStore.select(item)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId])

  function handleSelect(item: InventoryItem) {
    if (inventoryStore.getQty(item.id) <= 0) return
    if (selectedId === item.id) placementStore.cancel()
    else placementStore.select(item)
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
        {INVENTORY_ITEMS.map((item, i) => {
          const qty   = inventoryStore.getQty(item.id)
          const empty = qty <= 0

          return (
            <UIButton
              key={item.id}
              className={[
                "inv-slot",
                selectedId === item.id ? "selected" : ""
              ].filter(Boolean).join(" ")}
              onClick={() => handleSelect(item)}
              title={item.label}
              disabled={empty}
            >
              <span className="inv-slot-key">{i + 1}</span>
              <span className="inv-slot-icon">{item.icon}</span>
              <span className="inv-slot-label">{item.label}</span>
              <span className="inv-slot-qty">
                {qty}
              </span>
            </UIButton>
          )
        })}
      </div>
    </div>
  )
}