// src/App.tsx
import "./ui/App.css"
import { GameClock } from "./ui/components/GameClock"
import { HomeButton } from "./ui/components/HomeButton"
export const App = () => {
  return (
    <div id="ui-root">
      <header>
          <HomeButton />
          <GameClock />
      </header>
    </div>
  )
}