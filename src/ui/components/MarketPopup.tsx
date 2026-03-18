import { type WheelEvent, useEffect, useState } from "react"
import type { Object3D } from "three"
import { soundManager } from "../../game/system/SoundManager"
import { toolLevelStore } from "../store/ToolLevelStore"
import { inventoryStore } from "../store/InventoryStore"
import { moneyStore } from "../store/MoneyStore"
import { lootFeedbackStore } from "../store/LootFeedbackStore"
import { UIButton } from "./UIButton"
import { ItemIcon } from "./ItemIcon"
import { WorldPopup } from "./WorldPopup"
import "./MarketPopup.css"

type BuyableItem = {
  id: string
  icon: string
  unitPrice: number
  label: string
  description: string
  kind: "stock" | "tool_upgrade"
}

type SellableItem = {
  id: "carrot" | "lettuce" | "orange" | "wood"
  icon: string
  unitPrice: number
}

type MarketMode = "buy" | "sell"

const SELLABLE_QTY_STEPS = [-1, 5, 10] as const

const BUYABLE_ITEMS: BuyableItem[] = [
  { id: "carrot_seed", icon: "🌱", unitPrice: 2, label: "Graine carotte", description: "Pour lancer une culture rentable.", kind: "stock" },
  { id: "lettuce_seed", icon: "🌱", unitPrice: 2, label: "Graine salade", description: "Parfait pour remplir les champs vite.", kind: "stock" },
  { id: "orange_sapling", icon: "🌱", unitPrice: 12, label: "Pousse d'oranger", description: "Investissement long terme pour des oranges.", kind: "stock" },
  { id: "stake", icon: "🪵", unitPrice: 4, label: "Tuteur", description: "Un support utile pour tes plantations.", kind: "stock" },
  { id: "axe", icon: "🪓", unitPrice: 140, label: "Amélioration hache", description: "Fait grimper le niveau de la hache jusqu'à 3.", kind: "tool_upgrade" },
  { id: "shovel", icon: "🛠️", unitPrice: 125, label: "Amélioration pelle", description: "Creuse et nettoie plus efficacement.", kind: "tool_upgrade" },
  { id: "watering_can", icon: "/images/icons/items/watering_can.png", unitPrice: 150, label: "Amélioration arrosoir", description: "Arrose une zone plus large après achat.", kind: "tool_upgrade" },
  { id: "hoe", icon: "⛏️", unitPrice: 110, label: "Amélioration houe", description: "Augmente la zone de labour.", kind: "tool_upgrade" },
  { id: "bench", icon: "🪑", unitPrice: 18, label: "Banc", description: "Une petite déco pour aménager la ferme.", kind: "stock" },
  { id: "flower1", icon: "🌸", unitPrice: 6, label: "Fleur", description: "Ajoute de la couleur au jardin.", kind: "stock" },
  { id: "tulip", icon: "🌷", unitPrice: 7, label: "Tulipe", description: "Une déco florale élégante.", kind: "stock" },
  { id: "torch", icon: "🔥", unitPrice: 10, label: "Torche", description: "Éclaire joliment tes allées.", kind: "stock" },
  { id: "campfire", icon: "🏕️", unitPrice: 24, label: "Feu de camp", description: "Pour une ambiance cosy le soir.", kind: "stock" },
  { id: "wood_fence", icon: "🪜", unitPrice: 8, label: "Barrière", description: "Délimite les espaces avec style.", kind: "stock" },
  { id: "grass", icon: "🌱", unitPrice: 3, label: "Herbe", description: "Cache les zones vides avec un tapis vert.", kind: "stock" },
]

const SELLABLE_ITEMS: SellableItem[] = [
  { id: "carrot", icon: "🥕", unitPrice: 3 },
  { id: "lettuce", icon: "🥬", unitPrice: 4 },
  { id: "orange", icon: "🍊", unitPrice: 5 },
  { id: "wood", icon: "🪵", unitPrice: 2 },
]

const DEFAULT_SELL_QTY: Record<SellableItem["id"], number> = {
  carrot: 1,
  lettuce: 1,
  orange: 1,
  wood: 1,
}

type MarketPopupProps = {
  open: boolean
  marketEntity: Object3D | null
  onClose: () => void
}

export function MarketPopup({ open, marketEntity, onClose }: MarketPopupProps) {
  const [, forceRefresh] = useState(0)
  const [mode, setMode] = useState<MarketMode>("buy")
  const [sellQtyById, setSellQtyById] = useState<Record<SellableItem["id"], number>>(DEFAULT_SELL_QTY)

  useEffect(() => inventoryStore.subscribe(() => forceRefresh(v => v + 1)), [])
  useEffect(() => moneyStore.subscribe(() => forceRefresh(v => v + 1)), [])
  useEffect(() => toolLevelStore.subscribe(() => forceRefresh(v => v + 1)), [])

  const emitPurchaseFeedback = (itemId: string, icon?: string) => {
    const cellX = marketEntity?.userData.cellX as number | undefined
    const cellZ = marketEntity?.userData.cellZ as number | undefined
    if (cellX === undefined || cellZ === undefined) return

    lootFeedbackStore.emit({
      itemId,
      icon,
      amount: 1,
      cellX,
      cellZ,
    })
  }

  const handleClose = () => {
    setMode("buy")
    setSellQtyById(DEFAULT_SELL_QTY)
    onClose()
  }

  if (!open) return null

  const updateSellQty = (itemId: SellableItem["id"], nextQty: number) => {
    const stock = inventoryStore.getQty(itemId)
    const clamped = Math.max(1, Math.min(nextQty, stock || 1))
    setSellQtyById((prev) => ({ ...prev, [itemId]: clamped }))
  }

  const buyItem = (item: BuyableItem) => {
    const success = moneyStore.spend(item.unitPrice)
    if (!success) {
      soundManager.playError()
      return
    }

    if (item.kind === "tool_upgrade") {
      const unlockedLevel = toolLevelStore.getUnlockedLevel(item.id)
      if (unlockedLevel >= 3) {
        moneyStore.add(item.unitPrice)
        soundManager.playError()
        return
      }

      toolLevelStore.purchaseUpgrade(item.id)
      emitPurchaseFeedback(item.id, item.icon)
      soundManager.playSuccess()
      forceRefresh(v => v + 1)
      return
    }

    inventoryStore.grant(item.id, 1)
    emitPurchaseFeedback(item.id, item.icon)
    soundManager.playSuccess()
    forceRefresh(v => v + 1)
  }

  const sellItem = (item: SellableItem) => {
    const stock = inventoryStore.getQty(item.id)
    if (stock <= 0) {
      soundManager.playError()
      return
    }

    const qty = Math.max(1, Math.min(sellQtyById[item.id] ?? 1, stock))
    inventoryStore.consume(item.id, qty)
    const earned = qty * item.unitPrice
    moneyStore.add(earned)
    soundManager.playSuccess()

    const cellX = marketEntity?.userData.cellX as number | undefined
    const cellZ = marketEntity?.userData.cellZ as number | undefined

    if (cellX !== undefined && cellZ !== undefined) {
      lootFeedbackStore.emit({
        itemId: "money",
        icon: "💰",
        targetSelector: "[data-money-counter='true']",
        amount: Math.min(earned, 8),
        cellX,
        cellZ,
      })
    }

    forceRefresh(v => v + 1)
  }

  const money = moneyStore.getAmount()

  const handlePopupWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.scrollTop += e.deltaY
  }

  return (
    <WorldPopup
      open={open}
      anchorObject={marketEntity}
      onClose={handleClose}
      anchorResolver={(entityObject) => entityObject.getObjectByName("__hitbox__") ?? entityObject}
      offsetY={0.38}
      className="market-popup"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="market-popup-content" onWheel={handlePopupWheel}>
        <h3>🛒 Marché</h3>
        <p>{mode === "buy" ? "Choisis ce que tu veux acheter." : "Choisis rapidement la quantité à vendre pour chaque produit."}</p>

        <div className="market-popup-tabs">
          <UIButton className={mode === "buy" ? "market-popup-tab is-active" : "market-popup-tab"} onClick={() => setMode("buy")}>Acheter</UIButton>
          <UIButton className={mode === "sell" ? "market-popup-tab is-active" : "market-popup-tab"} onClick={() => setMode("sell")}>Vendre</UIButton>
          <span className="market-popup-money">{money} 💵</span>
        </div>

        {mode === "buy" ? (
          <div className="market-popup-list">
            {BUYABLE_ITEMS.map(item => {
              const canAfford = money >= item.unitPrice
              const unlockedLevel = item.kind === "tool_upgrade" ? toolLevelStore.getUnlockedLevel(item.id) : null
              const isMaxLevel = unlockedLevel !== null && unlockedLevel >= 3

              return (
                <div key={item.id} className="market-popup-row market-popup-buy-row">
                  <div className="market-popup-item">
                    <div className="market-popup-icon" aria-label={item.id}><ItemIcon icon={item.icon} alt={item.label} className="market-popup-icon-asset" />
                      {unlockedLevel !== null  && <span className="market-popup-icon-count">
                        <span>Niv.</span>
                        <span>{`${unlockedLevel}`}</span>
                      </span>}
                      
                    </div>
                    <div className="market-popup-labels">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </div>
                  </div>
                  <div className="market-popup-buy-meta">
                    <UIButton playClickSound={false} onClick={() => buyItem(item)} disabled={!canAfford || isMaxLevel}>{isMaxLevel ? "Max" : item.unitPrice + " 💵"}</UIButton>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="market-popup-list">
            {SELLABLE_ITEMS.map(item => {
              const stock = inventoryStore.getQty(item.id)
              const sellQty = Math.max(1, Math.min(sellQtyById[item.id] ?? 1, stock || 1))
              const total = sellQty * item.unitPrice

              return (
                <div key={item.id} className="market-popup-row">
                  <div className="market-popup-icon" aria-label={item.id}>
                    <ItemIcon icon={item.icon} alt={item.id} className="market-popup-icon-asset" />
                    <span className="market-popup-icon-count">{stock}</span>
                  </div>
                  <div className="market-popup-qty">
                    <span className="market-popup-qty-value">x{sellQty}</span>
                    <div className="market-popup-step-buttons">
                      {SELLABLE_QTY_STEPS.map(step => {
                        const nextQty = sellQty + step
                        const isDisabled = stock <= 0 || nextQty < 1 || nextQty > stock
                        const label = step > 0 ? `+${step}` : `${step}`

                        return (
                          <UIButton key={step} onClick={() => updateSellQty(item.id, nextQty)} disabled={isDisabled}>
                            {label}
                          </UIButton>
                        )
                      })}
                    </div>
                  </div>
                  <span className="market-popup-total">{total} 💵</span>
                  <UIButton playClickSound={false} onClick={() => sellItem(item)} disabled={stock <= 0}>💰</UIButton>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </WorldPopup>
  )
}
