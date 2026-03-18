import * as THREE from "three"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ItemDef } from "../../game/entity/ItemDef"
import { World } from "../../game/world/World"
import { soundManager } from "../../game/system/SoundManager"
import { lootFeedbackStore } from "../store/LootFeedbackStore"
import { ItemIcon } from "./ItemIcon"

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
const LOOT_FLIGHT_DURATION_MS = 580
const LOOT_RECEIVE_BUMP_OVERLAP_MS = 180

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


function getMouseStartPosition(
    mousePos: { x: number; y: number } | null,
    cellX: number,
    cellZ: number,
) {
    return mousePos ?? worldCellToScreen(cellX, cellZ)
}

function centerOf(el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function isElementVisible(el: HTMLElement | null) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
}

function getInventoryBumpTarget(targetAnchor: HTMLElement | null, targetSlot: HTMLElement | null) {
    if (targetSlot) return targetSlot
    return targetAnchor?.closest<HTMLElement>(".inv-slot") ?? targetAnchor
}

function bump(el: HTMLElement | null, className: string, durationMs = 420) {
    if (!el) return
    el.classList.remove(className)
    void el.offsetWidth
    el.classList.add(className)
    window.setTimeout(() => el.classList.remove(className), durationMs)
}

export function LootAnimationLayer({ items }: LootAnimationLayerProps) {
    const [particles, setParticles] = useState<LootParticle[]>([])
    const mousePosRef = useRef<{ x: number; y: number } | null>(null)
    const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items])

    useEffect(() => {
        const updateMouse = (e: PointerEvent | MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY }
        }

        window.addEventListener("pointermove", updateMouse)
        window.addEventListener("mousemove", updateMouse)

        let idSeed = 1

        const unsubscribe = lootFeedbackStore.subscribe((event) => {
            const item = itemById.get(event.itemId)
            const icon = event.icon ?? item?.icon
            if (!icon) return

            const from = getMouseStartPosition(mousePosRef.current, event.cellX, event.cellZ)
            const slotButton = event.targetSelector
                ? document.querySelector<HTMLElement>(event.targetSelector)
                : document.querySelector<HTMLElement>(`[data-inv-slot-id="${event.itemId}"]`)
                    ?? document.querySelector<HTMLElement>(`[data-inv-item-id="${event.itemId}"]`)
            const targetAnchor = slotButton
                ?? (event.targetSelector
                    ? document.querySelector<HTMLElement>(event.targetSelector)
                    : null)
            const targetSlot = targetAnchor?.closest<HTMLElement>(".inv-slot") ?? null
            const inventoryShell = document.querySelector<HTMLElement>("#inventory-slots")
            const inventoryExpandBtn = document.querySelector<HTMLElement>("#inventory-expand-btn")
            const inventoryBumpTarget = isElementVisible(targetAnchor) || isElementVisible(targetSlot)
                ? getInventoryBumpTarget(targetAnchor, targetSlot)
                : null
            const visibleTargetAnchor = isElementVisible(targetAnchor) ? targetAnchor : null
            const visibleTargetSlot = isElementVisible(targetSlot) ? targetSlot : null

            const to = visibleTargetAnchor
                ? centerOf(visibleTargetAnchor)
                : visibleTargetSlot
                    ? centerOf(visibleTargetSlot)
                    : inventoryShell
                        ? centerOf(inventoryShell)
                        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }

            const clampedAmount = Math.max(1, Math.min(event.amount, 5))
            const isMoneyCounterTarget = event.targetSelector === "[data-money-counter='true']"

            if (isMoneyCounterTarget) {
                soundManager.playMoneyPickup()
            }
            const newParticles: LootParticle[] = Array.from({ length: clampedAmount }).map((_, i) => ({
                id: idSeed++,
                icon,
                from,
                to,
                delayMs: i * 65,
            }))

            setParticles(prev => [...prev, ...newParticles])

            const bumpDelay = Math.max(0, LOOT_FLIGHT_DURATION_MS - LOOT_RECEIVE_BUMP_OVERLAP_MS + (clampedAmount - 1) * 65)
            window.setTimeout(() => {
                if (inventoryBumpTarget) {
                    bump(inventoryBumpTarget, targetSlot ? "inv-slot-bump" : "inventory-receive-bump")
                    return
                }

                bump(inventoryShell, "inventory-receive-bump")
                bump(inventoryExpandBtn, "inventory-receive-bump")
            }, bumpDelay)
        })

        return () => {
            unsubscribe()
            window.removeEventListener("pointermove", updateMouse)
            window.removeEventListener("mousemove", updateMouse)
        }
    }, [itemById])

    return createPortal(
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
                    <ItemIcon icon={particle.icon} alt="Loot item" className="loot-fly-icon" />
                </div>
            ))}
        </>,
        document.body,
    )
}
