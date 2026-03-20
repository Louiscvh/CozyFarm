// src/ui/components/InventoryBar.tsx
import { useState, useEffect, useRef } from "react"
import { placementStore } from "../store/PlacementStore"
import { inventoryStore } from "../store/InventoryStore"
import type { ItemDef } from "../../game/entity/ItemDef"
import { isPlaceable, isResource, isUsableOnEntity, isUsableOnTile, getItemEntity } from "../../game/entity/ItemDef"
import { Tree1Entity } from "../../game/entity/entities/Tree1"
import { Tree2Entity } from "../../game/entity/entities/Tree2"
import { Rock1Entity } from "../../game/entity/entities/Rock1"
import { Flower1Entity } from "../../game/entity/entities/Flower1"
import { FarmEntity } from "../../game/entity/entities/FarmEntity"
import { WheatField } from "../../game/entity/entities/WheatField"
import { TorchEntity } from "../../game/entity/entities/torch/TorchEntity"
import { CampfireEntity } from "../../game/entity/entities/campfire/CampfireEntity"
import { CabanaEntity } from "../../game/entity/entities/Cabana"
import { Tree3Entity } from "../../game/entity/entities/Tree3"
import { WoodPlankEntity } from "../../game/entity/entities/WoodPlank"
import { WoodFenceEntity } from "../../game/entity/entities/WoodFence"
import { TreeOrangeEntity } from "../../game/entity/entities/TreeOrange"
import { GrassEntity } from "../../game/entity/entities/Grass"
import { WindMillEntity } from "../../game/entity/entities/WindMill"
import { BenchEntity } from "../../game/entity/entities/Bench"
import { DirtSoilEntity } from "../../game/entity/entities/DirtSoil"
import { CarrotSeedItemDef } from "../../game/items/CarrotSeedItem"
import { CarrotItemDef } from "../../game/items/CarrotItem"
import { HoeItemDef } from "../../game/items/HoeItem"
import { World } from "../../game/world/World"
import { UIButton } from "./UIButton"
import "./InventoryBar.css"
import { LettuceSeedItemDef } from "../../game/items/LettuceSeedItem"
import { LettuceItemDef } from "../../game/items/LettuceItem"
import { ShovelItemDef } from "../../game/items/ShovelItem"
import { WateringCanItemDef } from "../../game/items/WateringCanItem"
import { TulipEntity } from "../../game/entity/entities/Tulip"
import { AxeItemDef, getBestTreeLabelForAxeLevel } from "../../game/items/AxeItem"
import { WoodItemDef } from "../../game/items/WoodItem"
import { LootAnimationLayer } from "./LootAnimationLayer"
import { OrangeSaplingItemDef } from "../../game/items/OrangeSaplingItem"
import { OrangeItemDef } from "../../game/items/OrangeItem"
import { StakeItemDef } from "../../game/items/StakeItem"
import { toolLevelStore, type ToolId } from "../store/ToolLevelStore"
import { ItemIcon } from "./ItemIcon"
import { ScannerItemDef } from "../../game/items/ScannerItem"
import { PlanterItemDef } from "../../game/items/PlanterItem"

// ─── Tous les items (construction + farming) ──────────────────────────────────

const ALL_ITEMS: ItemDef[] = [
    HoeItemDef,
    ShovelItemDef,
    WateringCanItemDef,
    AxeItemDef,
    PlanterItemDef,
    ScannerItemDef,
    WoodItemDef,

    { id: "tree1", label: "Pin", icon: "🌲", usage: { kind: "placeable", entity: Tree1Entity } },
    { id: "tree2", label: "Chêne", icon: "🌳", usage: { kind: "placeable", entity: Tree2Entity } },
    { id: "tree3", label: "Acacia", icon: "🌴", usage: { kind: "placeable", entity: Tree3Entity } },
    { id: "rock1", label: "Rocher", icon: "🪨", usage: { kind: "placeable", entity: Rock1Entity } },
    { id: "tulip", label: "Tulipe", icon: "🌷", usage: { kind: "placeable", entity: TulipEntity } },
    { id: "farm", label: "Ferme", icon: "🏚️", usage: { kind: "placeable", entity: FarmEntity } },
    CarrotSeedItemDef,
    LettuceSeedItemDef,
    OrangeSaplingItemDef,
    StakeItemDef,
    { id: "wheatField", label: "Blé", icon: "🌾", usage: { kind: "placeable", entity: WheatField } },
    { id: "cabana", label: "Cabane", icon: "🛖", usage: { kind: "placeable", entity: CabanaEntity } },
    { id: "wind_mill", label: "Moulin", icon: "💨", usage: { kind: "placeable", entity: WindMillEntity } },
    { id: "torch", label: "Torche", icon: "🔥", usage: { kind: "placeable", entity: TorchEntity } },
    { id: "campfire", label: "Feu de camp", icon: "🏕️", usage: { kind: "placeable", entity: CampfireEntity } },
    { id: "wood_plank", label: "Planche", icon: "🪵", usage: { kind: "placeable", entity: WoodPlankEntity } },
    { id: "wood_fence", label: "Barrière", icon: "🪜", usage: { kind: "placeable", entity: WoodFenceEntity } },
    { id: "tree_orange", label: "Oranger", icon: "🍊", usage: { kind: "placeable", entity: TreeOrangeEntity } },
    { id: "grass", label: "Herbe", icon: "🌱", usage: { kind: "placeable", entity: GrassEntity } },
    { id: "bench", label: "Banc", icon: "🪑", usage: { kind: "placeable", entity: BenchEntity } },
    { id: "dirt_soil", label: "Champ", icon: "🥔", usage: { kind: "placeable", entity: DirtSoilEntity } },
    { id: "flower1", label: "Fleur", icon: "🌸", usage: { kind: "placeable", entity: Flower1Entity } },
    CarrotItemDef,
    LettuceItemDef,
    OrangeItemDef
]

// ─── Pool defs (plaçables uniquement) ────────────────────────────────────────

const POOL_DEFS = ALL_ITEMS
    .filter(i => i.id !== "torch" && isPlaceable(i))
    .map(i => ({ entity: getItemEntity(i), maxQty: inventoryStore.getMax(i.id) || 64 }))

// ─── Enregistrement inventaire ────────────────────────────────────────────────

inventoryStore.register([
    { id: "hoe", maxQty: 1, infinite: true },       // ← outil
    { id: "tree1", maxQty: 16 },
    { id: "tree2", maxQty: 16 },
    { id: "tree3", maxQty: 16 },
    { id: "tree_orange", maxQty: 4 },
    { id: "rock1", maxQty: 32 },
    { id: "flower1", maxQty: 64 },
    { id: "tulip", maxQty: 64 },
    { id: "farm", maxQty: 4 },
    { id: "wheatField", maxQty: 16 },
    { id: "lettuce_seed", maxQty: 64, initialQty: 20 },      // ← farming
    { id: "carrot_seed", maxQty: 64, initialQty: 20 },      // ← farming
    { id: "orange_sapling", maxQty: 32, initialQty: 5 },
    { id: "stake", maxQty: 64, initialQty: 0 },
    { id: "cabana", maxQty: 8 },
    { id: "torch", maxQty: 32 },
    { id: "campfire", maxQty: 16 },
    { id: "wood_plank", maxQty: 32 },
    { id: "wood_fence", maxQty: 16 },
    { id: "grass", maxQty: 64 },
    { id: "wind_mill", maxQty: 4 },
    { id: "bench", maxQty: 8 },
    { id: "dirt_soil", maxQty: 24 },
    { id: "carrot", maxQty: 9999, initialQty: 0 },
    { id: "lettuce", maxQty: 9999, initialQty: 64 },      // ← farming
    { id: "orange", maxQty: 99, initialQty: 0 },
    { id: "shovel", maxQty: 1, infinite: true },
    { id: "watering_can", maxQty: 1, initialQty: 0, infinite: true },
    { id: "axe", maxQty: 1, initialQty: 0, infinite: true },
    { id: "planter", maxQty: 1, initialQty: 0, infinite: true },
    { id: "scanner", maxQty: 1, initialQty: 0, infinite: true },
    { id: "wood", maxQty: 64, initialQty: 24 },
])

const isInfinite = (item: ItemDef): boolean =>
    !!(inventoryStore.getEntry(item.id)?.infinite)

// ─── Hotbar ───────────────────────────────────────────────────────────────────

const HOTBAR_SIZE = 9

const STARTER_HOTBAR_IDS = [
    "hoe",
    "shovel",
    "wood",
    "tree1",
    "tree2",
    "tree3",
    "rock1",
    "flower1",
    "tulip",
] as const

const INITIAL_HOTBAR: (string | null)[] = [
    ...STARTER_HOTBAR_IDS.slice(0, HOTBAR_SIZE),
    ...Array(Math.max(0, HOTBAR_SIZE - STARTER_HOTBAR_IDS.length)).fill(null),
]

const itemById = (id: string | null): ItemDef | null =>
    id ? ALL_ITEMS.find(i => i.id === id) ?? null : null

type DragSource =
    | { zone: "hotbar"; index: number }
    | { zone: "extra"; id: string }

const isLevelableTool = (itemId: string | null): itemId is ToolId =>
    itemId === "hoe" || itemId === "watering_can" || itemId === "axe" || itemId === "shovel" || itemId === "planter"

function renderToolLevelBars(itemId: ToolId) {
    const level = toolLevelStore.getLevel(itemId)
    const maxLevel = toolLevelStore.getMaxLevel(itemId)
    return (
        <span className="inv-slot-level" title={`Niveau ${level}/${maxLevel}`}>
            {Array.from({ length: maxLevel }, (_, index) => maxLevel - index).map(step => (
                <span key={step} className={["inv-slot-level-bar", level >= step ? "active" : ""].filter(Boolean).join(" ")} />
            ))}
        </span>
    )
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function InventoryBar() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [rotation, setRotation] = useState(0)
    const [, forceUpdate] = useState(0)
    const [expanded, setExpanded] = useState(false)
    const [hotbar, setHotbar] = useState<(string | null)[]>(INITIAL_HOTBAR)
    const [extraOrder, setExtraOrder] = useState<string[]>(() =>
        ALL_ITEMS.map(item => item.id).filter(id => !INITIAL_HOTBAR.includes(id))
    )

    const extraItems = extraOrder
        .map(id => itemById(id))
        .filter((item): item is ItemDef => item !== null)
        .filter(item => inventoryStore.getQty(item.id) > 0)
    const hasExtra = extraItems.length > 0
    const dragSrc = useRef<DragSource | null>(null)
    const [dragOver, setDragOver] = useState<
    { zone: "hotbar"; index: number } | { zone: "extra"; id: string } | null
        >(null)
    const itemNodeRefs = useRef(new Map<string, HTMLElement>())

    const runInventoryMoveAnimation = (update: () => void) => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        const beforeRects = new Map<string, DOMRect>()

        itemNodeRefs.current.forEach((node, itemId) => {
            beforeRects.set(itemId, node.getBoundingClientRect())
        })

        update()

        if (reduceMotion) return

        requestAnimationFrame(() => {
            itemNodeRefs.current.forEach((node, itemId) => {
                const before = beforeRects.get(itemId)
                if (!before) return

                const after = node.getBoundingClientRect()
                const deltaX = before.left - after.left
                const deltaY = before.top - after.top
                if (!deltaX && !deltaY) return

                node.style.transition = "none"
                node.style.transform = `translate(${deltaX}px, ${deltaY}px)`
                node.getBoundingClientRect()
                node.style.transition = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)"
                node.style.transform = "translate(0px, 0px)"

                const cleanup = () => {
                    node.style.transition = ""
                    node.style.transform = ""
                    node.removeEventListener("transitionend", cleanup)
                }
                node.addEventListener("transitionend", cleanup)
            })
        })
    }

    const setItemNodeRef = (itemId: string) => (node: HTMLElement | null) => {
        if (!node) {
            itemNodeRefs.current.delete(itemId)
            return
        }
        itemNodeRefs.current.set(itemId, node)
    }

    const setDragOverHotbar = (index: number) => {
        setDragOver(prev => prev?.zone === "hotbar" && prev.index === index ? prev : { zone: "hotbar", index })
    }

    const setDragOverExtra = (id: string) => {
        setDragOver(prev => prev?.zone === "extra" && prev.id === id ? prev : { zone: "extra", id })
    }



    // ── Pre-warm pools ─────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        async function prepare() {
            let w = World.current
            while (!w) {
                if (cancelled) return
                await new Promise(r => setTimeout(r, 50))
                w = World.current
            }
            if (cancelled) return
            await w.preparePoolsForEntities(POOL_DEFS)
        }
        prepare()
        return () => { cancelled = true }
    }, [])

    // ── Souscriptions ──────────────────────────────────────────────────────────
    useEffect(() => placementStore.subscribe(() => {
        setSelectedId(placementStore.selectedItem?.id ?? null)
        setRotation(placementStore.rotation)
    }), [])

    useEffect(() => {
        let raf = 0
        const bump = () => {
            if (raf) return
            raf = requestAnimationFrame(() => {
                raf = 0
                forceUpdate(n => n + 1)
            })
        }

        const unsubscribeInventory = inventoryStore.subscribe(bump)
        const unsubscribeToolLevel = toolLevelStore.subscribe(bump)

        return () => {
            if (raf) cancelAnimationFrame(raf)
            unsubscribeInventory()
            unsubscribeToolLevel()
        }
    }, [])

    // ── Clavier ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return
            if (e.key === "Escape") { placementStore.cancel(); return }
            if (e.key === "e" || e.key === "E") { if (hasExtra) setExpanded(v => !v); return }

            if ((e.key === "ArrowUp" || e.key === "ArrowDown") && isLevelableTool(selectedId)) {
                e.preventDefault()
                if (e.key === "ArrowUp") toolLevelStore.increase(selectedId)
                else toolLevelStore.decrease(selectedId)
                return
            }

            const index = parseInt(e.code.replace("Digit", "")) - 1
            if (isNaN(index) || index < 0 || index >= HOTBAR_SIZE) return

            const item = itemById(hotbar[index])
            if (!item || isResource(item) || inventoryStore.getQty(item.id) <= 0) return

            if (selectedId === item.id) placementStore.cancel()
            else placementStore.select(item)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [selectedId, hotbar, hasExtra])

    // ── Sélection ──────────────────────────────────────────────────────────────

    function handleItemClick(item: ItemDef) {
        if (isResource(item)) return
        if (inventoryStore.getQty(item.id) <= 0) return
        if (selectedId === item.id) placementStore.cancel()
        else placementStore.select(item)
    }

    // ── Drag & drop ────────────────────────────────────────────────────────────

    function onDragStartHotbar(index: number) { dragSrc.current = { zone: "hotbar", index } }
    function onDragStartExtra(id: string) { dragSrc.current = { zone: "extra", id } }

    function onDropHotbar(targetIndex: number) {
        const src = dragSrc.current
        if (!src) return

        runInventoryMoveAnimation(() => {
            if (src.zone === "hotbar") {
                setHotbar(prev => {
                    const next = [...prev]
                    const tmp = next[targetIndex]
                    next[targetIndex] = next[src.index]
                    next[src.index] = tmp
                    return next
                })
            } else {
                setHotbar(prev => {
                    const next = [...prev]
                    const replacedId = next[targetIndex]
                    next[targetIndex] = src.id

                    setExtraOrder(extraPrev => {
                        const srcPos = extraPrev.indexOf(src.id)
                        if (srcPos === -1) return extraPrev

                        const extraNext = [...extraPrev]
                        if (replacedId) extraNext[srcPos] = replacedId
                        else extraNext.splice(srcPos, 1)
                        return extraNext
                    })

                    return next
                })
            }

            setDragOver(null)
            dragSrc.current = null
        })
    }

    function onDropExtra(targetId?: string) {
        const src = dragSrc.current
        if (!src) return

        runInventoryMoveAnimation(() => {
            if (src.zone === "hotbar") {
                setHotbar(prev => {
                    const next = [...prev]
                    const movedId = next[src.index]
                    if (!movedId) return next

                    if (!targetId) {
                        next[src.index] = null
                        setExtraOrder(extraPrev => extraPrev.includes(movedId) ? extraPrev : [...extraPrev, movedId])
                        return next
                    }

                    next[src.index] = targetId
                    setExtraOrder(extraPrev => {
                        const targetPos = extraPrev.indexOf(targetId)
                        if (targetPos === -1) return extraPrev
                        const extraNext = [...extraPrev]
                        extraNext[targetPos] = movedId
                        return extraNext
                    })
                    return next
                })
            } else if (targetId) {
                setExtraOrder(prev => {
                    const srcPos = prev.indexOf(src.id)
                    const targetPos = prev.indexOf(targetId)
                    if (srcPos === -1 || targetPos === -1 || srcPos === targetPos) return prev
                    const next = [...prev]
                    const tmp = next[targetPos]
                    next[targetPos] = next[srcPos]
                    next[srcPos] = tmp
                    return next
                })
            }

            setDragOver(null)
            dragSrc.current = null
        })
    }

    function cancelDrag() { setDragOver(null); dragSrc.current = null }

    // ── Hint ───────────────────────────────────────────────────────────────────

    function renderHint() {
        const item = placementStore.selectedItem
        if (!item) return null

        const renderEscapeHint = () => (
            <>
                <button
                    type="button"
                    className="hint-key hint-key-button"
                    onClick={() => placementStore.cancel()}
                    aria-label="Annuler l'action en cours"
                >
                    Échap
                </button>
                Annuler
            </>
        )

        if (isPlaceable(item)) {
            return (
                <div id="placement-hint">
                    <span className="hint-key">R</span> Rotation {rotation}°
                    <span className="hint-sep">·</span>
                    {renderEscapeHint()}
                </div>
            )
        }

        if (isUsableOnEntity(item) || isUsableOnTile(item)) {
            const showLevel = isLevelableTool(item.id)
            const level = showLevel ? toolLevelStore.getLevel(item.id) : 1
            const unlockedLevel = showLevel ? toolLevelStore.getUnlockedLevel(item.id) : 1
            const maxLevel = showLevel ? toolLevelStore.getMaxLevel(item.id) : 1

            if (item.id === "axe") {
                return (
                    <div id="placement-hint">
                        Clique pour couper un arbre - Max: {getBestTreeLabelForAxeLevel(level)}
                        <span className="hint-sep">·</span>
                        <span className="hint-key">↑</span>/<span className="hint-key">↓</span>
                        {level}/{unlockedLevel}
                        <span className="hint-sep">·</span>
                        {renderEscapeHint()}
                    </div>
                )
            }

            return (
                <div id="placement-hint">
                    {item.usageHint && (
                        <>
                            {item.usageHint}
                            <span className="hint-sep">·</span>
                        </>
                    )}
                    {showLevel && (
                        <>
                            <span className="hint-key">↑</span>/<span className="hint-key">↓</span>
                            {level}/{unlockedLevel} max {maxLevel}
                            <span className="hint-sep">·</span>
                        </>
                    )}
                    {renderEscapeHint()}
                </div>
            )
        }

        return null
    }

    // ── Rendu slot ─────────────────────────────────────────────────────────────

    function renderSlot(id: string | null, index: number) {
        const item = itemById(id)
        const qty = item ? inventoryStore.getQty(item.id) : 0
        const over = dragOver?.zone === "hotbar" && dragOver.index === index
        const noStock = !!item && !isInfinite(item) && qty <= 0
        const isDisabled = !item || isResource(item) || (!isInfinite(item) && qty <= 0)

        return (
            <div
                key={index}
                ref={item ? setItemNodeRef(item.id) : null}
                className={["inv-slot-wrap", over ? "drag-over" : ""].filter(Boolean).join(" ")}
                onDragOver={e => { e.preventDefault(); setDragOverHotbar(index) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => onDropHotbar(index)}
            >
                {item ? (
                    <UIButton
                        data-inv-slot-id={item.id}
                        className={[
                            "inv-slot",
                            selectedId === item.id ? "selected" : "",
                            noStock ? "empty" : "",
                            isResource(item) ? "inv-slot--resource" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => handleItemClick(item)}
                        title={item.label}
                        onMouseDown={e => e.stopPropagation()}
                        disabled={isDisabled}
                        draggable
                        onDragStart={() => onDragStartHotbar(index)}
                        onDragEnd={cancelDrag}
                    >
                        <span className="inv-slot-hit" data-inv-item-id={item.id} />
                        <span className="inv-slot-key">{index + 1}</span>
                        <ItemIcon icon={item.icon} alt={item.label} />
                        <span className="inv-slot-label">{item.label}</span>
                        {!isInfinite(item) && (
                            <span className="inv-slot-qty">{qty}</span>
                        )}
                        {isLevelableTool(item.id) && renderToolLevelBars(item.id)}
                    </UIButton>
                ) : (
                    <div className="inv-slot inv-slot-empty">
                        <span className="inv-slot-key">{index + 1}</span>
                    </div>
                )}
            </div>
        )
    }

    function renderExtraItem(item: ItemDef) {
        const qty = inventoryStore.getQty(item.id)
        const over = dragOver?.zone === "extra" && dragOver.id === item.id
        const noStock = !isInfinite(item) && qty <= 0
        const isDisabled = isResource(item) || (!isInfinite(item) && qty <= 0)

        return (
            <div
                key={item.id}
                ref={setItemNodeRef(item.id)}
                className={["inv-slot-wrap", over ? "drag-over" : ""].filter(Boolean).join(" ")}
                onDragOver={e => { e.preventDefault(); setDragOverExtra(item.id) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => onDropExtra(item.id)}
            >
                <UIButton
                    data-inv-slot-id={item.id}
                    className={[
                        "inv-slot",
                        selectedId === item.id ? "selected" : "",
                        noStock ? "empty" : "",
                        isResource(item) ? "inv-slot--resource" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => handleItemClick(item)}
                    title={item.label}
                    onMouseDown={e => e.stopPropagation()}
                    disabled={isDisabled}
                    draggable
                    onDragStart={() => onDragStartExtra(item.id)}
                    onDragEnd={cancelDrag}
                >
                    <span className="inv-slot-hit" data-inv-item-id={item.id} />
                    <ItemIcon icon={item.icon} alt={item.label} />
                    <span className="inv-slot-label">{item.label}</span>
                    {!isInfinite(item) && (
                        <span className="inv-slot-qty">{qty}</span>
                    )}
                    {isLevelableTool(item.id) && renderToolLevelBars(item.id)}
                </UIButton>
            </div>
        )
    }

    return (
        <div id="inventory-bar">
            <LootAnimationLayer items={ALL_ITEMS} />
            {renderHint()}

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
                    <div className="inventory-row">
                        {INITIAL_HOTBAR.map((_, i) => renderSlot(hotbar[i], i))}
                    </div>

                    {hasExtra && (
                        <div id="inventory-extra-rows" className={expanded ? "open" : ""}>
                            {expanded && (
                                <>
                                    <div className="extra-drop-hint">Glisser déposer ici pour modifier</div>
                                    <div
                                        className="inventory-row extra-row"
                                        onDragOver={e => { e.preventDefault(); setDragOverExtra("__zone__") }}
                                        onDragLeave={() => setDragOver(null)}
                                        onDrop={() => onDropExtra()}
                                    >
                                        {extraItems.map(renderExtraItem)}
                                        {extraItems.length === 0 && (
                                            <div className="inv-slot inv-slot-empty extra-empty-hint">
                                                <span style={{ fontSize: 10, opacity: 0.4 }}>vide</span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                            </div>
                    )}
                </div>
            </div>
        </div>
    )
}
