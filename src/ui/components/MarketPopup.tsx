import { useEffect, useState } from "react"
import type { Object3D } from "three"
import { soundManager } from "../../game/system/SoundManager"
import { inventoryStore } from "../store/InventoryStore"
import { moneyStore } from "../store/MoneyStore"
import { lootFeedbackStore } from "../store/LootFeedbackStore"
import { UIButton } from "./UIButton"
import { WorldPopup } from "./WorldPopup"
import "./MarketPopup.css"

type BuyableItem = {
  id: "carrot_seed" | "lettuce_seed" | "orange_sapling" | "stake"
  icon: string
  unitPrice: number
  label: string
}

type SellableItem = {
  id: "carrot" | "lettuce" | "orange"
  icon: string
  unitPrice: number
}

type MarketMode = "buy" | "sell"

const SELLABLE_QTY_STEPS = [-1, 5, 10] as const

const BUYABLE_ITEMS: BuyableItem[] = [
  { id: "carrot_seed", icon: "🌱", unitPrice: 2, label: "Graine carotte" },
  { id: "lettuce_seed", icon: "🌱", unitPrice: 2, label: "Graine salade" },
  { id: "orange_sapling", icon: "🌱", unitPrice: 12, label: "Pousse d'oranger" },
  { id: "stake", icon: "🪵", unitPrice: 4, label: "Tuteur" },
]

const SELLABLE_ITEMS: SellableItem[] = [
  { id: "carrot", icon: "🥕", unitPrice: 3 },
  { id: "lettuce", icon: "🥬", unitPrice: 4 },
  { id: "orange", icon: "🍊", unitPrice: 5 },
]

const DEFAULT_SELL_QTY: Record<SellableItem["id"], number> = {
  carrot: 1,
  lettuce: 1,
  orange: 1,
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

    inventoryStore.produce(item.id, 1)
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
      <div>
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
              const stock = inventoryStore.getQty(item.id)
              const canAfford = money >= item.unitPrice

              return (
                <div key={item.id} className="market-popup-row">
                  <div className="market-popup-item">
                    <div className="market-popup-icon" aria-label={item.id}>{item.icon}
                      <span>{stock}</span>
                    </div>
                    <div className="market-popup-labels">
                      <strong>{item.label}</strong>
                      <span>{item.unitPrice} 💵 / unité</span>
                    </div>
                  </div>
                  <UIButton onClick={() => buyItem(item)} disabled={!canAfford}>Acheter</UIButton>
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
                  <div className="market-popup-icon" aria-label={item.id}>{item.icon}
                    <span>{stock}</span>
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
                  <UIButton onClick={() => sellItem(item)} disabled={stock <= 0}>💰</UIButton>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </WorldPopup>
  )
}
