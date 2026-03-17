import test from "node:test"
import assert from "node:assert/strict"
import { itemActionRegistry } from "../src/game/interaction/ItemActionRegistry.ts"
import { registerFarmingActions } from "../src/ui/hooks/useFarming.ts"
import { World } from "../src/game/world/World.ts"
import { toolLevelStore } from "../src/ui/store/ToolLevelStore.ts"
import { inventoryStore } from "../src/ui/store/InventoryStore.ts"

type Cell = `${number}|${number}`

function key(x: number, z: number): Cell {
  return `${x}|${z}`
}

function createFakeWorld() {
  const tilled = new Set<Cell>()
  const watered = new Set<Cell>()
  const planted = new Set<Cell>()

  const tilesFactory = {
    tillCell(cellX: number, cellZ: number) {
      const k = key(cellX, cellZ)
      if (tilled.has(k)) return false
      tilled.add(k)
      return true
    },
    untillCell(cellX: number, cellZ: number) {
      const k = key(cellX, cellZ)
      if (!tilled.has(k)) return false
      if (planted.has(k)) return false
      tilled.delete(k)
      watered.delete(k)
      return true
    },
    waterCell(cellX: number, cellZ: number) {
      const k = key(cellX, cellZ)
      if (!tilled.has(k) || watered.has(k)) return false
      watered.add(k)
      return true
    },
    clearSnowCell() {
      return false
    },
    playPlantAnimation() {
      return
    },
    isWatered(cellX: number, cellZ: number) {
      return watered.has(key(cellX, cellZ))
    },
  }

  const cropManager = {
    hasCrop(cellX: number, cellZ: number) {
      return planted.has(key(cellX, cellZ))
    },
    getCrop() {
      return null
    },
    addStake() {
      return null
    },
    removeLooseStake() {
      return false
    },
    uproot(cellX: number, cellZ: number) {
      const k = key(cellX, cellZ)
      if (!planted.has(k)) return null
      planted.delete(k)
      return { def: { harvestItemId: "carrot", harvestQty: 1 } }
    },
    plant(def: { id: string; harvestItemId: string; harvestQty: number }, cellX: number, cellZ: number) {
      const k = key(cellX, cellZ)
      if (!tilled.has(k) || planted.has(k)) return null
      planted.add(k)
      return {
        def,
        isReady: false,
      }
    },
    harvest(cellX: number, cellZ: number) {
      const k = key(cellX, cellZ)
      if (!planted.has(k)) return null
      planted.delete(k)
      return {
        def: {
          harvestItemId: "carrot",
          harvestQty: 1,
        },
        mesh: null,
      }
    },
  }

  return { world: { tilesFactory, cropManager }, tilled, watered, planted }
}

test("parcours joueur: bêcher -> planter -> arroser -> récolter", () => {
  toolLevelStore.setLevel("hoe", 1)
  toolLevelStore.setLevel("watering_can", 1)
  toolLevelStore.setLevel("shovel", 1)

  const { world, tilled, watered, planted } = createFakeWorld()
  World.current = world as never

  const produced: Array<{ id: string; amount: number }> = []
  const originalProduce = inventoryStore.produce.bind(inventoryStore)
  inventoryStore.produce = ((id: string, amount = 1) => {
    produced.push({ id, amount })
  }) as typeof inventoryStore.produce

  try {
    registerFarmingActions()

    const tilledOk = itemActionRegistry.executeTileAction("farming:till", {
      itemId: "hoe",
      tileType: "grass",
      cellX: 10,
      cellZ: 12,
    })
    assert.equal(tilledOk, true)
    assert.equal(tilled.has("10|12"), true)

    const plantedOk = itemActionRegistry.executeTileAction("farming:plant_carrot", {
      itemId: "carrot_seed",
      tileType: "soil",
      cellX: 10,
      cellZ: 12,
    })
    assert.equal(plantedOk, true)
    assert.equal(planted.has("10|12"), true)

    const wateredOk = itemActionRegistry.executeTileAction("farming:water", {
      itemId: "watering_can",
      tileType: "soil",
      cellX: 10,
      cellZ: 12,
    })
    assert.equal(wateredOk, true)
    assert.equal(watered.has("10|12"), true)

    const harvestedOk = itemActionRegistry.executeEntityAction("farming:harvest", {
      itemId: "carrot",
      targetEntityId: "carrot_crop",
      cellX: 10,
      cellZ: 12,
    })
    assert.equal(harvestedOk, true)
    assert.equal(planted.has("10|12"), false)
    assert.deepEqual(produced, [
      { id: "carrot", amount: 1 },
      { id: "carrot", amount: 1 },
    ])
  } finally {
    inventoryStore.produce = originalProduce
    World.current = null
  }
})



test("pelle niveau 2: retire la neige en zone 2x2", () => {
  toolLevelStore.setLevel("shovel", 2)

  const snowCells = new Set<Cell>(["10|12", "9|12", "10|11", "9|11"])
  const cleared: Cell[] = []

  const { world } = createFakeWorld()
  const originalClearSnow = world.tilesFactory.clearSnowCell
  world.tilesFactory.clearSnowCell = ((cellX: number, cellZ: number) => {
    const k = key(cellX, cellZ)
    if (!snowCells.has(k)) return false
    snowCells.delete(k)
    cleared.push(k)
    return true
  }) as typeof originalClearSnow

  World.current = world as never

  try {
    registerFarmingActions()

    const ok = itemActionRegistry.executeTileAction("farming:uproot_or_untill", {
      itemId: "shovel",
      tileType: "grass",
      cellX: 10,
      cellZ: 12,
    })

    assert.equal(ok, true)
    assert.deepEqual(cleared.sort(), ["10|12", "9|12", "10|11", "9|11"].sort())
  } finally {
    World.current = null
    toolLevelStore.setLevel("shovel", 1)
  }
})

test("parcours joueur: impossible de planter sans labour", () => {
  const { world } = createFakeWorld()
  World.current = world as never

  try {
    registerFarmingActions()
    const plantedOk = itemActionRegistry.executeTileAction("farming:plant_carrot", {
      itemId: "carrot_seed",
      tileType: "grass",
      cellX: 5,
      cellZ: 5,
    })
    assert.equal(plantedOk, false)
  } finally {
    World.current = null
  }
})
