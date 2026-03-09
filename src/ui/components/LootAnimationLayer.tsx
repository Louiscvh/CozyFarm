import * as THREE from "three"
import { useEffect, useMemo, useState } from "react"
import type { ItemDef } from "../../game/entity/ItemDef"
import { World } from "../../game/world/World"
import { lootFeedbackStore } from "../store/LootFeedbackStore"

interface LootParticle {
    id: number
    icon: string
    from: { x: number; y: number }
    to: { x: number; y: number }
    delayMs: number
}

interface LootAnimationLayerProps {
    items: ItemDef[]
}

const worldProjectVector = new THREE.Vector3()

function worldCellToScreen(cellX: number, cellZ: number) {
    const world = World.current
    if (!world || !world.camera) {
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }

    const half = world.sizeInCells / 2
    const worldX = (cellX - half + 0.5) * world.cellSize
    const worldZ = (cellZ - half + 0.5) * world.cellSize

    worldProjectVector.set(worldX, 0.45, worldZ).project(world.camera)
    return {
        x: (worldProjectVector.x * 0.5 + 0.5) * window.innerWidth,
        y: (-worldProjectVector.y * 0.5 + 0.5) * window.innerHeight,
    }
}

export function LootAnimationLayer({ items }: LootAnimationLayerProps) {
    const [particles, setParticles] = useState<LootParticle[]>([])
    const [bumpToken, setBumpToken] = useState(0)

    const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items])

    useEffect(() => {
        let idSeed = 1
        return lootFeedbackStore.subscribe((event) => {
            const item = itemById.get(event.itemId)
            if (!item) return

            const from = worldCellToScreen(event.cellX, event.cellZ)
            const targetEl = document.querySelector<HTMLElement>(`[data-inv-item-id="${event.itemId}"]`)
            if (!targetEl) return
            const rect = targetEl.getBoundingClientRect()
            const to = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }

            const clampedAmount = Math.max(1, Math.min(event.amount, 5))
            const newParticles: LootParticle[] = Array.from({ length: clampedAmount }).map((_, i) => ({
                id: idSeed++,
                icon: item.icon,
                from,
                to,
                delayMs: i * 65,
            }))

            setParticles(prev => [...prev, ...newParticles])

            const bumpDelay = 440 + (clampedAmount - 1) * 65
            window.setTimeout(() => {
                targetEl.classList.remove("inv-slot-bump")
                void targetEl.offsetWidth
                targetEl.classList.add("inv-slot-bump")
                setBumpToken(t => t + 1)
            }, bumpDelay)
        })
    }, [itemById])

    useEffect(() => {
        if (!bumpToken) return
        const tid = window.setTimeout(() => {
            document.querySelectorAll(".inv-slot-bump").forEach(el => el.classList.remove("inv-slot-bump"))
        }, 220)
        return () => window.clearTimeout(tid)
    }, [bumpToken])

    return (
        <>
            {particles.map((particle) => (
                <div
                    key={particle.id}
                    className="loot-fly"
                    style={{
                        left: `${particle.from.x}px`,
                        top: `${particle.from.y}px`,
                        ["--loot-to-x" as string]: `${particle.to.x - particle.from.x}px`,
                        ["--loot-to-y" as string]: `${particle.to.y - particle.from.y}px`,
                        animationDelay: `${particle.delayMs}ms`,
                    }}
                    onAnimationEnd={() => {
                        setParticles(prev => prev.filter(p => p.id !== particle.id))
                    }}
                >
                    {particle.icon}
                </div>
            ))}
        </>
    )
}
