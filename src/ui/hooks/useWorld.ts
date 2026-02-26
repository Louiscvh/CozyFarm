// src/ui/hooks/useWorld.ts
import { useEffect, useState } from "react"
import { World } from "../../game/world/World"

export function useWorld(): World | null {
  const [world, setWorld] = useState<World | null>(World.current)

  useEffect(() => {
    if (World.current) return
    const id = setInterval(() => {
      if (World.current) {
        setWorld(World.current)
        clearInterval(id)
      }
    }, 100)
    return () => clearInterval(id)
  }, [])

  return world
}