// src/ui/components/CursorItem.tsx
import { useEffect, useRef, useState } from "react"
import { placementStore } from "../store/PlacementStore"
import { isPlaceable, type ItemDef } from "../../game/entity/ItemDef"
import "./CursorItem.css"

export function CursorItem() {
    const [item, setItem] = useState<ItemDef | null>(null)
    const [pos, setPos] = useState({ x: -999, y: -999 })
    const [visible, setVisible] = useState(false)

    const targetPos = useRef({ x: -999, y: -999 })
    const currentPos = useRef({ x: -999, y: -999 })
    const rafRef = useRef(0)

    // ── Suit le curseur avec lerp ─────────────────────────────────────────────
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            targetPos.current = { x: e.clientX, y: e.clientY }
        }
        window.addEventListener("mousemove", onMouseMove)
        return () => window.removeEventListener("mousemove", onMouseMove)
    }, [])

    useEffect(() => {
        const loop = () => {
            rafRef.current = requestAnimationFrame(loop)
            const tx = targetPos.current.x
            const ty = targetPos.current.y
            const cx = currentPos.current.x
            const cy = currentPos.current.y

            const nx = cx + (tx - cx) * 0.18
            const ny = cy + (ty - cy) * 0.18

            currentPos.current = { x: nx, y: ny }
            setPos({ x: nx, y: ny })
        }
        loop()
        return () => cancelAnimationFrame(rafRef.current)
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
