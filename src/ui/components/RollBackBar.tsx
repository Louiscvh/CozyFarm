import { useEffect, useState } from "react"
import { UIButton } from "./UIButton"
import { historyStore, applyUndo, applyRedo } from "../store/HistoryStore"
import "./RollBackBar.css"

export const RollBackBar = () => {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    // Sync réactif via subscribe — plus de setInterval
    const unsub = historyStore.subscribe(() => {
      setCanUndo(historyStore.canUndo)
      setCanRedo(historyStore.canRedo)
    })

    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.repeat) return
      if (e.key.toLowerCase() === "z") { e.preventDefault(); applyUndo() }
      if (e.key.toLowerCase() === "y") { e.preventDefault(); applyRedo() }
    }
    window.addEventListener("keydown", onKey)

    return () => { unsub(); window.removeEventListener("keydown", onKey) }
  }, [])

  return (
    <div className="rollback-bar">
      <UIButton
        className={!canUndo ? "disabled" : ""}
        onClick={canUndo ? applyUndo : undefined}
        title="Annuler (Ctrl+Z)"
      >↩</UIButton>
      <UIButton
        className={!canRedo ? "disabled" : ""}
        onClick={canRedo ? applyRedo : undefined}
        title="Rétablir (Ctrl+Y)"
      >↪</UIButton>
    </div>
  )
}