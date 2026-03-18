import test from "node:test"
import assert from "node:assert/strict"
import { initTerrain, tileTypeAt, type TileType } from "../src/game/world/tile/Tile.ts"
import { getFixedEntities, reserveFixedEntityTerrainGrid } from "../src/game/world/tile/TileFactory.ts"

function withFixedRandom<T>(value: number, run: () => T): T {
  const originalRandom = Math.random
  Math.random = () => value
  try {
    return run()
  } finally {
    Math.random = originalRandom
  }
}

test("les entités fixes réservent un terrain non aquatique sous leur empreinte", () => {
  const worldSize = 50

  withFixedRandom(0, () => {
    const fixed = getFixedEntities(Math.floor(worldSize / 2))

    let reservedGrid: TileType[][] | null = null
    let seedWithWater: number | null = null

    for (let seed = 1; seed <= 5000; seed++) {
      initTerrain(seed)
      const rawGrid = Array.from({ length: worldSize }, (_, x) =>
        Array.from({ length: worldSize }, (_, z) => tileTypeAt(x, z))
      )

      const hasWaterUnderFixedEntity = fixed.some((entity) => {
        const sizeInTiles = Math.max(1, Math.ceil(entity.size / 2))
        for (let x = entity.tileX; x < entity.tileX + sizeInTiles; x++) {
          for (let z = entity.tileZ; z < entity.tileZ + sizeInTiles; z++) {
            if (rawGrid[x]?.[z] === "water") return true
          }
        }
        return false
      })

      if (!hasWaterUnderFixedEntity) continue

      const adjustedGrid = rawGrid.map((column) => [...column])
      reserveFixedEntityTerrainGrid(adjustedGrid, worldSize)

      seedWithWater = seed
      reservedGrid = adjustedGrid
      break
    }

    assert.notEqual(seedWithWater, null, "aucune seed de test ne place d'eau sous une entité fixe")
    assert.ok(reservedGrid)

    for (const entity of fixed) {
      const sizeInTiles = Math.max(1, Math.ceil(entity.size / 2))
      for (let x = entity.tileX; x < entity.tileX + sizeInTiles; x++) {
        for (let z = entity.tileZ; z < entity.tileZ + sizeInTiles; z++) {
          assert.notEqual(reservedGrid![x][z], "water")
        }
      }
    }
  })
})
