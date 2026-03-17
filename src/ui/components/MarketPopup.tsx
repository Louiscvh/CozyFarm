import { useEffect, useMemo, useState } from "react"
import { inventoryStore } from "../store/InventoryStore"
import { moneyStore } from "../store/MoneyStore"
import { lootFeedbackStore } from "../store/LootFeedbackStore"
import { UIButton } from "./UIButton"
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
  marketCell: { cellX: number; cellZ: number } | null
  onClose: () => void
}

export function MarketPopup({ open, marketCell, onClose }: MarketPopupProps) {
  const [revision, setRevision] = useState(0)

  useEffect(() => inventoryStore.subscribe(() => setRevision(v => v + 1)), [])

  const totalStockValue = useMemo(
    () => SELLABLE_ITEMS.reduce((sum, item) => sum + inventoryStore.getQty(item.id) * item.unitPrice, 0),
    [revision],
  )

  if (!open) return null

  const sellItem = (item: SellableItem) => {
    const qty = inventoryStore.getQty(item.id)
    if (qty <= 0) return

    inventoryStore.consume(item.id, qty)
    const earned = qty * item.unitPrice
    moneyStore.add(earned)

    if (marketCell) {
      lootFeedbackStore.emit({
        itemId: "money",
        icon: "💰",
        targetSelector: "[data-money-counter='true']",
        amount: Math.min(earned, 8),
        cellX: marketCell.cellX,
        cellZ: marketCell.cellZ,
      })
    }

    setRevision(v => v + 1)
  }

  const sellAll = () => {
    SELLABLE_ITEMS.forEach(sellItem)
  }

  return (
    <div className="market-popup-overlay" onClick={onClose}>
      <div className="market-popup" onClick={(e) => e.stopPropagation()}>
        <h3>🛒 Marché</h3>
        <p>Vends tes légumes pour gagner de l'argent.</p>

        <div className="market-popup-list">
          {SELLABLE_ITEMS.map(item => {
            const qty = inventoryStore.getQty(item.id)
            const total = qty * item.unitPrice
            return (
              <div key={item.id} className="market-popup-row">
                <span>{item.icon} {item.label}</span>
                <span>x{qty}</span>
                <span>{total} 💰</span>
                <UIButton onClick={() => sellItem(item)} disabled={qty <= 0}>Vendre</UIButton>
              </div>
            )
          })}
        </div>

        <div className="market-popup-footer">
          <strong>Total possible: {totalStockValue} 💰</strong>
          <div style={{ display: "flex", gap: 6 }}>
            <UIButton onClick={sellAll}>Tout vendre</UIButton>
            <UIButton onClick={onClose}>Fermer</UIButton>
          </div>
        </div>
      </div>
    </div>
  )
}
