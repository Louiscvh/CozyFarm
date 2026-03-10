// src/ui/components/CursorItem.tsx
import { useEffect, useState } from "react"
import { placementStore } from "../store/PlacementStore"
import { isPlaceable, type ItemDef } from "../../game/entity/ItemDef"
import "./CursorItem.css"

export function CursorItem() {
    const [item, setItem] = useState<ItemDef | null>(null)
    const [pos, setPos] = useState({ x: -999, y: -999 })
    const [visible, setVisible] = useState(false)

    // ── Suit le curseur sans lerp (suivi immédiat) ───────────────────────────
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            setPos({ x: e.clientX, y: e.clientY })
        }
        window.addEventListener("mousemove", onMouseMove)
        return () => window.removeEventListener("mousemove", onMouseMove)
    }, [])

    // ── Souscriptions store ───────────────────────────────────────────────────
    useEffect(() => placementStore.subscribe(() => {
        const selected = placementStore.selectedItem
        // Affiche pour les outils (showCursorItem) et les entités plaçables
        if (selected && (selected.showCursorItem || isPlaceable(selected))) {
            setItem(selected)
            setVisible(true)
        } else {
            setVisible(false)
            setItem(null)
        }
    }), [])

    if (!visible || !item) return null

    return (
        <div
            className="cursor-item"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        >
            <span className="inv-slot-icon">{item.icon}</span>

        </div>
    )
}
