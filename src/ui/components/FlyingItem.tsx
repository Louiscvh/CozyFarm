// src/ui/components/FlyingItem.tsx
import { useEffect, useState } from "react"

interface FlyingItemProps {
    icon: string
    from: { x: number, y: number }  // coords écran du point de départ
    to: { x: number, y: number }    // coords écran du slot inventaire
    onComplete?: () => void
}

export function FlyingItem({ icon, from, to, onComplete }: FlyingItemProps) {
    const [pos, setPos] = useState(from)

    useEffect(() => {
        const duration = 400 // ms
        const start = performance.now()

        const animate = (time: number) => {
            const t = Math.min((time - start) / duration, 1)
            // ease out
            const ease = t * (2 - t)
            setPos({
                x: from.x + (to.x - from.x) * ease,
                y: from.y + (to.y - from.y) * ease
            })
            if (t < 1) requestAnimationFrame(animate)
            else onComplete?.()
        }
        requestAnimationFrame(animate)
    }, [from, to, onComplete])

    return (
        <div
            style={{
                position: "fixed",
                pointerEvents: "none",
                left: pos.x,
                top: pos.y,
                fontSize: 24,
                transform: "translate(-50%, -50%)",
                transition: "transform 0.1s"
            }}
        >
            {icon}
        </div>
    )
}