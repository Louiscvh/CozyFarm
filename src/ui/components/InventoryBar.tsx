// src/ui/components/InventoryBar.tsx
import { useState, useEffect, useRef } from "react"
import { placementStore } from "../store/PlacementStore"
import { inventoryStore } from "../store/InventoryStore"
import type { ItemDef } from "../../game/entity/ItemDef"
import { isPlaceable, isResource, isUsableOnEntity, getItemEntity } from "../../game/entity/ItemDef"
import { Tree1Entity } from "../../game/entity/entities/Tree1"
import { Tree2Entity } from "../../game/entity/entities/Tree2"
import { Rock1Entity } from "../../game/entity/entities/Rock1"
import { Flower1Entity } from "../../game/entity/entities/Flower1"
import { FarmEntity } from "../../game/entity/entities/FarmEntity"
import { WheatField } from "../../game/entity/entities/WheatField"
import { TorchEntity } from "../../game/entity/entities/torch/TorchEntity"
import { CabanaEntity } from "../../game/entity/entities/Cabana"
import { Tree3Entity } from "../../game/entity/entities/Tree3"
import { WoodPlankEntity } from "../../game/entity/entities/WoodPlank"
import { WoodFenceEntity } from "../../game/entity/entities/WoodFence"
import { TreeOrangeEntity } from "../../game/entity/entities/TreeOrange"
import { GrassEntity } from "../../game/entity/entities/Grass"
import { WindMillEntity } from "../../game/entity/entities/WindMill"
import { BenchEntity } from "../../game/entity/entities/Bench"
import { DirtSoilEntity } from "../../game/entity/entities/DirtSoil"
import { CarrotSeedItemDef } from "../../game/farming/items/CarrotSeedItem"
import { CarrotItemDef } from "../../game/farming/items/CarrotItem"
import { HoeItemDef } from "../../game/farming/items/HoeItem"
import { World } from "../../game/world/World"
import { UIButton } from "./UIButton"
import "./InventoryBar.css"

// ─── Tous les items (construction + farming) ──────────────────────────────────

const ALL_ITEMS: ItemDef[] = [
    HoeItemDef,
    { id: "tree1", label: "Pin", icon: "🌲", usage: { kind: "placeable", entity: Tree1Entity } },
    { id: "tree2", label: "Chêne", icon: "🌳", usage: { kind: "placeable", entity: Tree2Entity } },
    { id: "tree3", label: "Acacia", icon: "🌴", usage: { kind: "placeable", entity: Tree3Entity } },
    { id: "rock1", label: "Rocher", icon: "🪨", usage: { kind: "placeable", entity: Rock1Entity } },
    { id: "flower1", label: "Fleur", icon: "🌸", usage: { kind: "placeable", entity: Flower1Entity } },
    { id: "farm", label: "Ferme", icon: "🏚️", usage: { kind: "placeable", entity: FarmEntity } },
    { id: "wheatField", label: "Blé", icon: "🌾", usage: { kind: "placeable", entity: WheatField } },
    CarrotSeedItemDef,
    { id: "cabana", label: "Cabane", icon: "🛖", usage: { kind: "placeable", entity: CabanaEntity } },
    { id: "wind_mill", label: "Moulin", icon: "💨", usage: { kind: "placeable", entity: WindMillEntity } },
    { id: "torch", label: "Torche", icon: "🔥", usage: { kind: "placeable", entity: TorchEntity } },
    { id: "wood_plank", label: "Planche", icon: "🪵", usage: { kind: "placeable", entity: WoodPlankEntity } },
    { id: "wood_fence", label: "Barrière", icon: "🪜", usage: { kind: "placeable", entity: WoodFenceEntity } },
    { id: "tree_orange", label: "Oranger", icon: "🍊", usage: { kind: "placeable", entity: TreeOrangeEntity } },
    { id: "grass", label: "Herbe", icon: "🌱", usage: { kind: "placeable", entity: GrassEntity } },
    { id: "bench", label: "Banc", icon: "🪑", usage: { kind: "placeable", entity: BenchEntity } },
    { id: "dirt_soil", label: "Champ", icon: "🥔", usage: { kind: "placeable", entity: DirtSoilEntity } },
    CarrotItemDef,
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
    { id: "farm", maxQty: 4 },
    { id: "wheatField", maxQty: 16 },
    { id: "carrot_seed", maxQty: 64, initialQty: 20 },      // ← farming
    { id: "cabana", maxQty: 8 },
    { id: "torch", maxQty: 32 },
    { id: "wood_plank", maxQty: 32 },
    { id: "wood_fence", maxQty: 16 },
    { id: "grass", maxQty: 64 },
    { id: "wind_mill", maxQty: 4 },
    { id: "bench", maxQty: 8 },
    { id: "dirt_soil", maxQty: 24 },
    { id: "carrot", maxQty: 99, initialQty: 0 },      // ← farming
])

const isInfinite = (item: ItemDef): boolean =>
    !!(inventoryStore.getEntry(item.id)?.infinite)

// ─── Hotbar ───────────────────────────────────────────────────────────────────

const HOTBAR_SIZE = 9

const INITIAL_HOTBAR: (string | null)[] = [
    ...ALL_ITEMS.slice(0, HOTBAR_SIZE).map(i => i.id),
    ...Array(Math.max(0, HOTBAR_SIZE - ALL_ITEMS.length)).fill(null),
]

const itemById = (id: string | null): ItemDef | null =>
    id ? ALL_ITEMS.find(i => i.id === id) ?? null : null

type DragSource =
    | { zone: "hotbar"; index: number }
    | { zone: "extra"; id: string }

// ─── Composant ────────────────────────────────────────────────────────────────

export function InventoryBar() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [rotation, setRotation] = useState(0)
    const [, forceUpdate] = useState(0)
    const [expanded, setExpanded] = useState(false)
    const [hotbar, setHotbar] = useState<(string | null)[]>(INITIAL_HOTBAR)

    const extraItems = ALL_ITEMS.filter(i => !hotbar.includes(i.id))
    const dragSrc = useRef<DragSource | null>(null)
    const [dragOver, setDragOver] = useState<
    { zone: "hotbar"; index: number } | { zone: "extra"; id: string } | null
        >(null)



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

    useEffect(() => inventoryStore.subscribe(() => forceUpdate(n => n + 1)), [])

    // ── Clavier ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return
            if (e.key === "Escape") { placementStore.cancel(); return }
            if (e.key === "e" || e.key === "E") { if (hasExtra) setExpanded(v => !v); return }

            const index = parseInt(e.code.replace("Digit", "")) - 1
            if (isNaN(index) || index < 0 || index >= HOTBAR_SIZE) return

            const item = itemById(hotbar[index])
            if (!item || isResource(item) || inventoryStore.getQty(item.id) <= 0) return

            if (selectedId === item.id) placementStore.cancel()
            else placementStore.select(item)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [selectedId, hotbar])

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
        setHotbar(prev => {
            const next = [...prev]
            if (src.zone === "hotbar") {
                const tmp = next[targetIndex]; next[targetIndex] = next[src.index]; next[src.index] = tmp
            } else {
                next[targetIndex] = src.id
            }
            return next
        })
        setDragOver(null); dragSrc.current = null
    }

    function onDropExtra() {
        const src = dragSrc.current
        if (!src) return
        if (src.zone === "hotbar") {
            setHotbar(prev => { const next = [...prev]; next[src.index] = null; return next })
        }
        setDragOver(null); dragSrc.current = null
    }

    function cancelDrag() { setDragOver(null); dragSrc.current = null }

    // ── Hint ───────────────────────────────────────────────────────────────────

    function renderHint() {
        const item = placementStore.selectedItem
        if (!item) return null

        if (isPlaceable(item)) {
            return (
                <div id="placement-hint">
                    <span className="hint-key">R</span> Rotation {rotation}°
                    <span className="hint-sep">·</span>
                    <span className="hint-key">Échap</span> Annuler
                </div>
            )
        }

        if (isUsableOnEntity(item)) {
            return (
                <div id="placement-hint">
                    {item.icon} Mode utilisation · Cliquez sur un champ 🥔
                    <span className="hint-sep">·</span>
                    <span className="hint-key">Échap</span> Annuler
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
        const noStock = !isResource(item ?? undefined as any) && qty <= 0

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
                        className={[
                            "inv-slot",
                            selectedId === item.id ? "selected" : "",
                            noStock ? "empty" : "",
                            isResource(item) ? "inv-slot--resource" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => handleItemClick(item)}
                        title={item.label}
                        onMouseDown={e => e.stopPropagation()}
                        disabled={isResource(item) || (!isInfinite(item) && qty <= 0)}
                        draggable
                        onDragStart={() => onDragStartHotbar(index)}
                        onDragEnd={cancelDrag}
                    >
                        <span className="inv-slot-key">{index + 1}</span>
                        <span className="inv-slot-icon">{item.icon}</span>
                        <span className="inv-slot-label">{item.label}</span>
                        {!isInfinite(item) && (
                            <span className="inv-slot-qty">{qty}</span>
                        )}
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
        const noStock = !isResource(item) && qty <= 0

        return (
            <div
                key={item.id}
                className={["inv-slot-wrap", over ? "drag-over" : ""].filter(Boolean).join(" ")}
                onDragOver={e => { e.preventDefault(); setDragOver({ zone: "extra", id: item.id }) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={onDropExtra}
            >
                <UIButton
                    className={[
                        "inv-slot",
                        selectedId === item.id ? "selected" : "",
                        noStock ? "empty" : "",
                        isResource(item) ? "inv-slot--resource" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => handleItemClick(item)}
                    title={item.label}
                    onMouseDown={e => e.stopPropagation()}
                    disabled={isResource(item) || (!isInfinite(item) && qty <= 0)}
                    draggable
                    onDragStart={() => onDragStartExtra(item.id)}
                    onDragEnd={cancelDrag}
                >
                    <span className="inv-slot-icon">{item.icon}</span>
                    <span className="inv-slot-label">{item.label}</span>
                    {!isInfinite(item) && (
                        <span className="inv-slot-qty">{qty}</span>
                    )}
                </UIButton>
            </div>
        )
    }

    const hasExtra = extraItems.length > 0

    return (
        <div id="inventory-bar">
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
                        <div
                            id="inventory-extra-rows"
                            className={expanded ? "open" : ""}
                            onDragOver={e => { e.preventDefault(); setDragOver({ zone: "extra", id: "__zone__" }) }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={onDropExtra}
                        >
                            <div className="extra-drop-hint">Glisser déposer ici pour modifier</div>
                            <div className="inventory-row extra-row">
                                {extraItems.map(renderExtraItem)}
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