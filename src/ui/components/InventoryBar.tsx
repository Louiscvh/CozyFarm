// src/ui/components/InventoryBar.tsx
import { useState, useEffect, useRef } from "react"
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
import { WoodPlankEntity } from "../../game/entity/WoodPlank"
import { WoodFenceEntity } from "../../game/entity/WoodFence"
import { TreeOrangeEntity } from "../../game/entity/TreeOrange"
import { GrassEntity } from "../../game/entity/Grass"
import { WindMillEntity } from "../../game/entity/WindMill"

const ALL_ITEMS: InventoryItem[] = [
  { id: "tree1",      label: "Pin",      icon: "🌲", entity: Tree1Entity },
  { id: "tree2",      label: "Chêne",    icon: "🌳", entity: Tree2Entity },
  { id: "tree3",      label: "Acacia",   icon: "🌴", entity: Tree3Entity },
  { id: "rock1",      label: "Rocher",   icon: "🪨", entity: Rock1Entity },
  { id: "flower1",    label: "Fleur",    icon: "🌸", entity: Flower1Entity },
  { id: "farm",       label: "Ferme",    icon: "🏚️", entity: FarmEntity },
  { id: "wheatField", label: "Blé",      icon: "🌾", entity: WheatField },
  { id: "cabana",     label: "Cabane",   icon: "🛖", entity: CabanaEntity },
  { id: "wind_mill",  label: "Moulin",   icon: "💨", entity: WindMillEntity },
  { id: "torch",      label: "Torche",   icon: "🔥", entity: TorchEntity },
  { id: "wood_plank", label: "Planche",  icon: "🪵", entity: WoodPlankEntity },
  { id: "wood_fence", label: "Barrière", icon: "🪜", entity: WoodFenceEntity },
  { id: "tree_orange",label: "Oranger",  icon: "🍊", entity: TreeOrangeEntity },
  { id: "grass",      label: "Herbe",    icon: "🌱", entity: GrassEntity },

]

inventoryStore.register([
  { id: "tree1",      maxQty: 16 },
  { id: "tree2",      maxQty: 16 },
  { id: "tree3",      maxQty: 16 },
  { id: "tree_orange",maxQty: 4 },
  { id: "rock1",      maxQty: 32 },
  { id: "flower1",    maxQty: 64 },
  { id: "farm",       maxQty: 4  },
  { id: "wheatField", maxQty: 16 },
  { id: "cabana",     maxQty: 8  },
  { id: "torch",      maxQty: 32 },
  { id: "wood_plank", maxQty: 32 },
  { id: "wood_fence", maxQty: 16 },
  { id: "grass", maxQty: 64 },
  { id: "wind_mill", maxQty: 4 },
])

const HOTBAR_SIZE = 9

// État initial : les 9 premiers items dans la hotbar, le reste dans extra
const INITIAL_HOTBAR: (string | null)[] = [
  ...ALL_ITEMS.slice(0, HOTBAR_SIZE).map(i => i.id),
  ...Array(Math.max(0, HOTBAR_SIZE - ALL_ITEMS.length)).fill(null),
]

const itemById = (id: string | null) => id ? ALL_ITEMS.find(i => i.id === id) ?? null : null

// ── Drag state (ref partagée, pas de re-render) ───────────────────────────────
type DragSource =
  | { zone: "hotbar"; index: number }
  | { zone: "extra";  id: string    }

export function InventoryBar() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rotation, setRotation]     = useState(0)
  const [, forceUpdate]             = useState(0)
  const [expanded, setExpanded]     = useState(false)

  // hotbar : 9 slots, chaque slot = id ou null
  const [hotbar, setHotbar] = useState<(string | null)[]>(INITIAL_HOTBAR)

  // extra : items pas dans la hotbar
  const extraItems = ALL_ITEMS.filter(i => !hotbar.includes(i.id))

  // drag
  const dragSrc = useRef<DragSource | null>(null)
  const [dragOver, setDragOver] = useState<{ zone: "hotbar"; index: number } | { zone: "extra"; id: string } | null>(null)

  useEffect(() => placementStore.subscribe(() => {
    setSelectedId(placementStore.selectedItem?.id ?? null)
    setRotation(placementStore.rotation)
  }), [])

  useEffect(() => inventoryStore.subscribe(() => forceUpdate(n => n + 1)), [])

  // Raccourcis clavier → hotbar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === "Escape") { placementStore.cancel(); return }
      if (e.key === "e" || e.key === "E") {
        if (hasExtra) setExpanded(v => !v)
        return
      }

      const index = parseInt(e.code.replace("Digit", "")) - 1
      if (isNaN(index) || index < 0 || index >= HOTBAR_SIZE) return

      const id   = hotbar[index]
      const item = itemById(id)
      if (!item || inventoryStore.getQty(item.id) <= 0) return

      if (selectedId === item.id) placementStore.cancel()
      else placementStore.select(item)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, hotbar])

  function handleSelect(item: InventoryItem) {
    if (inventoryStore.getQty(item.id) <= 0) return
    if (selectedId === item.id) placementStore.cancel()
    else placementStore.select(item)
  }

  // ── Drag handlers ────────────────────────────────────────────────────────

  function onDragStartHotbar(index: number) {
    dragSrc.current = { zone: "hotbar", index }
  }

  function onDragStartExtra(id: string) {
    dragSrc.current = { zone: "extra", id }
  }

  function onDropHotbar(targetIndex: number) {
    const src = dragSrc.current
    if (!src) return

    setHotbar(prev => {
      const next = [...prev]

      if (src.zone === "hotbar") {
        // Hotbar → Hotbar : swap
        const tmp = next[targetIndex]
        next[targetIndex] = next[src.index]
        next[src.index]   = tmp
      } else {
        // Extra → Hotbar : place l'item dans le slot
        // Si le slot était occupé, l'ancien item retourne en extra (disparaît de hotbar)
        next[targetIndex] = src.id
      }

      return next
    })

    setDragOver(null)
    dragSrc.current = null
  }

  function onDropExtra() {
    const src = dragSrc.current
    if (!src) return

    if (src.zone === "hotbar") {
      // Hotbar → Extra : vide le slot
      setHotbar(prev => {
        const next = [...prev]
        next[src.index] = null
        return next
      })
    }
    // Extra → Extra : pas d'action nécessaire

    setDragOver(null)
    dragSrc.current = null
  }

  function cancelDrag() {
    setDragOver(null)
    dragSrc.current = null
  }

  // ── Render slot ──────────────────────────────────────────────────────────

  function renderHotbarSlot(id: string | null, index: number) {
    const item  = itemById(id)
    const qty   = item ? inventoryStore.getQty(item.id) : 0
    const over  = dragOver?.zone === "hotbar" && dragOver.index === index

    return (
      <div
        key={index}
        className={["inv-slot-wrap", over ? "drag-over" : ""].filter(Boolean).join(" ")}
        onDragOver={e => { e.preventDefault(); setDragOver({ zone: "hotbar", index }) }}
        onDragLeave={() => setDragOver(null)}
        onDrop={() => onDropHotbar(index)}
      >
        {item ? (
          <UIButton
            className={["inv-slot", selectedId === item.id ? "selected" : "", qty <= 0 ? "empty" : ""].filter(Boolean).join(" ")}
            onClick={() => handleSelect(item)}
            title={item.label}
            onMouseDown={e => e.stopPropagation()}   // ← bloque la caméra
            disabled={qty <= 0}
            draggable
            onDragStart={() => onDragStartHotbar(index)}
            onDragEnd={cancelDrag}
          >
            <span className="inv-slot-key">{index + 1}</span>
            <span className="inv-slot-icon">{item.icon}</span>
            <span className="inv-slot-label">{item.label}</span>
            <span className="inv-slot-qty">{qty}</span>
          </UIButton>
        ) : (
          <div className="inv-slot inv-slot-empty">
            <span className="inv-slot-key">{index + 1}</span>
          </div>
        )}
      </div>
    )
  }

  function renderExtraItem(item: InventoryItem) {
    const qty  = inventoryStore.getQty(item.id)
    const over = dragOver?.zone === "extra" && dragOver.id === item.id

    return (
      <div
        key={item.id}
        className={["inv-slot-wrap", over ? "drag-over" : ""].filter(Boolean).join(" ")}
        onDragOver={e => { e.preventDefault(); setDragOver({ zone: "extra", id: item.id }) }}
        onDragLeave={() => setDragOver(null)}
        onDrop={onDropExtra}
      >
        <UIButton
          className={["inv-slot", selectedId === item.id ? "selected" : "", qty <= 0 ? "empty" : ""].filter(Boolean).join(" ")}
          onClick={() => handleSelect(item)}
          title={item.label}
          onMouseDown={e => e.stopPropagation()}   // ← bloque la caméra
          disabled={qty <= 0}
          draggable
          onDragStart={() => onDragStartExtra(item.id)}
          onDragEnd={cancelDrag}
        >
          <span className="inv-slot-icon">{item.icon}</span>
          <span className="inv-slot-label">{item.label}</span>
          <span className="inv-slot-qty">{qty}</span>
        </UIButton>
      </div>
    )
  }

  const hasExtra = extraItems.length > 0

  return (
    <div id="inventory-bar">
      {selectedId && (
        <div id="placement-hint">
          <span className="hint-key">R</span> Rotation {rotation}°
          <span className="hint-sep">·</span>
          <span className="hint-key">Échap</span> Annuler
        </div>
      )}

      <div id="inventory-wrapper">
        {hasExtra && (
          <button
            id="inventory-expand-btn"
            className={expanded ? "expanded" : ""}
            onClick={() => setExpanded(v => !v)}
            title={expanded ? "Réduire" : "Plus d'items"}
          >
            E
          </button>
        )}

        <div id="inventory-slots">
          {/* Hotbar — toujours visible */}
          <div className="inventory-row">
            {INITIAL_HOTBAR.map((_, i) => renderHotbarSlot(hotbar[i], i))}
          </div>

          {/* Extra items — zone droppable + révélable */}
          {hasExtra && (
            <div
              id="inventory-extra-rows"
              className={expanded ? "open" : ""}
              onDragOver={e => { e.preventDefault(); setDragOver({ zone: "extra", id: "__zone__" }) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={onDropExtra}
            >
              <div className="extra-drop-hint">Glisser déposer ici pour modifier</div>
              <div className="inventory-row extra-row">
                {extraItems.map(item => renderExtraItem(item))}
                {/* Slot vide pour accueillir un drop quand extra est vide */}
                {extraItems.length === 0 && (
                  <div className="inv-slot inv-slot-empty extra-empty-hint">
                    <span style={{ fontSize: 10, opacity: 0.4 }}>vide</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}