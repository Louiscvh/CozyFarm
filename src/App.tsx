// src/App.tsx
import "./ui/App.css"
import { GameClock } from "./ui/components/GameClock"
import { HomeButton } from "./ui/components/HomeButton"
import { LoaderOverlay } from "./ui/components/LoaderOverlay"
import { LoaderProvider } from "./ui/store/LoaderContext"

export const App = () => {
  return (
    <LoaderProvider>
      <LoaderOverlay />
      <div id="ui-root">
          <header>
              <HomeButton />
              <GameClock />
          </header>
      </div>
    </LoaderProvider>
  )
}