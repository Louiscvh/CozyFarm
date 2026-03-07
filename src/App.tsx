// src/App.tsx
import "./ui/App.css"
import { GameClock } from "./ui/components/GameClock"
import { HomeButton } from "./ui/components/HomeButton"
import { LoaderOverlay } from "./ui/components/LoaderOverlay"
import { LoaderProvider } from "./ui/store/LoaderContext"
import { DevToolBar } from "./ui/components/DevToolBar"
import { InventoryBar } from "./ui/components/InventoryBar"
import { EntityPopups } from "./ui/components/EntityPopup"
import { RollBackBar } from "./ui/components/RollBackBar"
import { Temperature } from "./ui/components/Temperature"
import { PlacementManager } from "./ui/components/PlacementManager"
import { CursorItem } from "./ui/components/CursorItem"

export const App = () => {
  return (
    <LoaderProvider>
      {/* System */}
      <LoaderOverlay />
      <PlacementManager />

      <div id="ui-root">
        <header>
          <HomeButton />
          <GameClock />
          <Temperature />
        </header>
        <EntityPopups />
        <CursorItem />

        <footer>
          <RollBackBar/>
          <DevToolBar />
          <InventoryBar />
        </footer>
      </div>
    </LoaderProvider>
  )
}

