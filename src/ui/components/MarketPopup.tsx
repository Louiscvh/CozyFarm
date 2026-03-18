import { useEffect, useState } from "react"
import type { Object3D } from "three"
import { inventoryStore } from "../store/InventoryStore"
import { moneyStore } from "../store/MoneyStore"
import { lootFeedbackStore } from "../store/LootFeedbackStore"
import { UIButton } from "./UIButton"
import { WorldPopup } from "./WorldPopup"
import "./MarketPopup.css"

type SellableItem = {
  id: "carrot" | "lettuce" | "orange"
  label: string
  icon: string
  unitPrice: number
}

const SELLABLE_ITEMS: SellableItem[] = [
  { id: "carrot", label: "Carotte", icon: "🥕", unitPrice: 3 },
  { id: "lettuce", label: "Salade", icon: "🥬", unitPrice: 4 },
  { id: "orange", label: "Orange", icon: "🍊", unitPrice: 5 },
]

type MarketPopupProps = {
  open: boolean
  marketEntity: Object3D | null
  onClose: () => void
}

export function MarketPopup({ open, marketEntity, onClose }: MarketPopupProps) {
  const [revision, setRevision] = useState(0)
  const [sellQtyById, setSellQtyById] = useState<Record<SellableItem["id"], number>>({
    carrot: 1,
    lettuce: 1,
    orange: 1,
  })

  useEffect(() => inventoryStore.subscribe(() => setRevision(v => v + 1)), [])

  useEffect(() => {
    setSellQtyById((prev) => {
      const next = { ...prev }
      for (const item of SELLABLE_ITEMS) {
        const stock = inventoryStore.getQty(item.id)
        next[item.id] = Math.max(1, Math.min(prev[item.id] ?? 1, stock || 1))
      }
      return next
    })
  }, [revision])

  if (!open) return null

  const updateSellQty = (itemId: SellableItem["id"], nextQty: number) => {
    const stock = inventoryStore.getQty(itemId)
    const clamped = Math.max(1, Math.min(nextQty, stock || 1))
    setSellQtyById((prev) => ({ ...prev, [itemId]: clamped }))
  }

  const sellItem = (item: SellableItem) => {
    const stock = inventoryStore.getQty(item.id)
    if (stock <= 0) return

    const qty = Math.max(1, Math.min(sellQtyById[item.id] ?? 1, stock))
    inventoryStore.consume(item.id, qty)
    const earned = qty * item.unitPrice
    moneyStore.add(earned)

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

    setRevision(v => v + 1)
  }

  return (
    <WorldPopup
      open={open}
      anchorObject={marketEntity}
      onClose={onClose}
      anchorResolver={(entityObject) => entityObject.getObjectByName("__hitbox__") ?? entityObject}
      offsetY={0.38}
      className="market-popup"
    >
      <div>
        <h3>🛒 Marché</h3>
        <p>Choisis la quantité à vendre pour chaque produit.</p>

        <div className="market-popup-list">
          {SELLABLE_ITEMS.map(item => {
            const stock = inventoryStore.getQty(item.id)
            const sellQty = Math.max(1, Math.min(sellQtyById[item.id] ?? 1, stock || 1))
            const total = sellQty * item.unitPrice

            return (
              <div key={item.id} className="market-popup-row">
                <span>{item.icon} {item.label}</span>
                <span className="market-popup-stock">stock: {stock}</span>
                <div className="market-popup-qty">
                  <UIButton onClick={() => updateSellQty(item.id, sellQty - 1)} disabled={stock <= 0 || sellQty <= 1}>−</UIButton>
                  <input
                    className="market-popup-qty-input"
                    type="number"
                    min={1}
                    max={Math.max(1, stock)}
                    value={sellQty}
                    onChange={(e) => updateSellQty(item.id, Number(e.target.value || 1))}
                    disabled={stock <= 0}
                  />
                  <UIButton onClick={() => updateSellQty(item.id, sellQty + 1)} disabled={stock <= 0 || sellQty >= stock}>+</UIButton>
                </div>
                <span>{total} 💵</span>
                <UIButton onClick={() => sellItem(item)} disabled={stock <= 0}>💰</UIButton>
              </div>
            )
          })}
        </div>
      </div>
    </WorldPopup>
  )
}
