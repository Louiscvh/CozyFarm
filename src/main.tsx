import { Game } from "./game/core/Game"
import { Renderer } from "./render/Renderer"
import { createRoot } from "react-dom/client"
import { App } from "./App"

const game = new Game()
const renderer = new Renderer()

let lastTime = performance.now()

function loop(time: number) {
  const dt = (time - lastTime) / 1000 // secondes
  lastTime = time

  game.update(dt)
  renderer.render()

  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)

createRoot(document.getElementById("root")!).render(<App />)