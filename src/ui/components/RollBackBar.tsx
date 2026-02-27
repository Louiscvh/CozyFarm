import { useEffect, useState } from "react"
import { UIButton } from "./UIButton"
import { historyStore, applyUndo, applyRedo } from "../store/HistoryStore"
import "./RollBackBar.css"

export const RollBackBar = () => {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo]  = useState(false)

  const sync = () => {
    setCanUndo(historyStore.canUndo)
    setCanRedo(historyStore.canRedo)
  }

  useEffect(() => {
    // Sync sur les touches clavier aussi
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (!e.repeat) { applyUndo(); sync() }
      }
      if (e.key.toLowerCase() === "y") {
        e.preventDefault()
        if (!e.repeat) { applyRedo(); sync() }
      }
    }
    window.addEventListener("keydown", onKey)

    const interval = setInterval(sync, 100)
    return () => {
      window.removeEventListener("keydown", onKey)
      clearInterval(interval)
    }
  }, [])

  const handleUndo = () => { applyUndo(); sync() }
  const handleRedo = () => { applyRedo(); sync() }

  return (
    <div className="rollback-bar">
      <UIButton
          className={!canUndo ? "disabled" : ""}
          onClick={canUndo ? handleUndo : undefined}
          title="Annuler (Ctrl+Z)"
        >
          ↩
        </UIButton>
        <UIButton
          className={!canRedo ? "disabled" : ""}
          onClick={canRedo ? handleRedo : undefined}
          title="Rétablir (Ctrl+Y)"
        >
          ↪
        </UIButton>
    </div>
  )
}