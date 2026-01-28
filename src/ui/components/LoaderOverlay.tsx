// LoaderOverlay.tsx
import { useEffect, useState } from "react"
import "./LoaderOverlay.css"

export const LoaderOverlay = () => {
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      setReveal(true)
    }, 100) // petit délai pour voir le blanc

    return () => clearTimeout(id)
  }, [])

  return (
    <div className={`loader-overlay ${reveal ? "reveal" : ""}`} />
  )
}
