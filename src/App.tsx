// src/App.tsx
import "./ui/App.css"
import { GameClock } from "./ui/components/GameClock"
import { HomeButton } from "./ui/components/HomeButton"
import { LoaderOverlay } from "./ui/components/LoaderOverlay"
import { LoaderProvider } from "./ui/store/LoaderContext"

import { useEffect, useState } from "react"
import { DevToolBar } from "./ui/components/DevToolBar"

export const App = () => {
  const [showDev, setShowDev] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "@") {
        setShowDev(v => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <LoaderProvider>
      <LoaderOverlay />

      <div id="ui-root">
        <header>
          <HomeButton />
          <GameClock />
        </header>

        {showDev && <DevToolBar />}
      </div>
    </LoaderProvider>
  )
}
