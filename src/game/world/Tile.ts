// src/world/Tile.ts

export type TileType = "grass" | "water" | "sand" | "stone"

export interface TileVisual {
  color: string
  roughness: number
  metalness: number
}

export const TILE_VISUALS: Record<TileType, TileVisual> = {
  grass: { color: "#4a8c52", roughness: 0.95, metalness: 0.0 },
  water: { color: "#1a6fa8", roughness: 0.1,  metalness: 0.3 },
  sand:  { color: "#d4a96a", roughness: 0.9,  metalness: 0.0 },
  stone: { color: "#7a7470", roughness: 0.85, metalness: 0.05 },
}

export const TILE_TYPES: TileType[] = ["grass", "water", "sand", "stone"]

// Hiérarchie des biomes — un coin prend le type le plus prioritaire
// parmi les tiles qui le touchent. Évite que l'eau envahisse la plage.
export const BIOME_PRIORITY: Record<TileType, number> = {
  water: 0,
  sand:  1,
  grass: 2,
  stone: 3,
}

// ─── Perlin Noise ─────────────────────────────────────────────────────────────

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number) { return a + t * (b - a) }

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
}

class PerlinNoise {
  private perm: number[]

  constructor(seed: number = Math.random() * 65536) {
    const p: number[] = Array.from({ length: 256 }, (_, i) => i)
    let s = Math.floor(seed)
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) & 0x7fffffff
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]]
    }
    this.perm = [...p, ...p]
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const a  = this.perm[X]     + Y
    const b  = this.perm[X + 1] + Y
    return lerp(
      lerp(grad(this.perm[a],     x,     y    ), grad(this.perm[b],     x - 1, y    ), u),
      lerp(grad(this.perm[a + 1], x,     y - 1), grad(this.perm[b + 1], x - 1, y - 1), u),
      v
    )
  }

  octaves(x: number, y: number, octs: number = 4, persistence: number = 0.5): number {
    let value = 0
    let amplitude = 1
    let frequency = 1
    let max = 0
    for (let i = 0; i < octs; i++) {
      value     += this.noise(x * frequency, y * frequency) * amplitude
      max       += amplitude
      amplitude *= persistence
      frequency *= 2
    }
    return value / max
  }
}

// ─── Génération terrain ───────────────────────────────────────────────────────

const THRESHOLDS = {
  water: -0.30,
  sand:  -0.05,
  stone:  0.55,
}

let _perlin: PerlinNoise | null = null
let _scale = 0.06

export function initTerrain(seed?: number, scale: number = 0.06) {
  _perlin = new PerlinNoise(seed)
  _scale  = scale
}

export function tileTypeAt(tileX: number, tileZ: number): TileType {
  if (!_perlin) _perlin = new PerlinNoise()
  const elevation = _perlin.octaves(tileX * _scale, tileZ * _scale, 4, 0.5)
  if (elevation < THRESHOLDS.water) return "water"
  if (elevation < THRESHOLDS.sand)  return "sand"
  if (elevation > THRESHOLDS.stone) return "stone"
  return "grass"
}

// ─── Corner-based ─────────────────────────────────────────────────────────────

// [TL, TR, BL, BR] — top-left, top-right, bottom-left, bottom-right
export type TileCorners = [TileType, TileType, TileType, TileType]

/**
 * Calcule les 4 coins de chaque tile à partir de la grille de types.
 * Chaque coin est partagé par 4 tiles (le tile lui-même + 3 voisins).
 * Il prend le type de plus haute priorité parmi ces 4 tiles.
 */
export function computeAllCorners(
  typeGrid: TileType[][],   // typeGrid[x][z]
  worldSize: number
): TileCorners[][] {        // corners[x][z]

  const get = (x: number, z: number): TileType => {
    if (x < 0 || z < 0 || x >= worldSize || z >= worldSize) return "water"
    return typeGrid[x][z]
  }

  const dominant = (...types: TileType[]): TileType =>
    types.reduce((best, t) => BIOME_PRIORITY[t] > BIOME_PRIORITY[best] ? t : best)

  const corners: TileCorners[][] = []

  for (let x = 0; x < worldSize; x++) {
    corners[x] = []
    for (let z = 0; z < worldSize; z++) {
      // Chaque coin regarde les 4 tiles qui se rejoignent en ce point
      // TL : tile(x,z), tile(x-1,z), tile(x,z-1), tile(x-1,z-1)
      // TR : tile(x,z), tile(x+1,z), tile(x,z-1), tile(x+1,z-1)
      // BL : tile(x,z), tile(x-1,z), tile(x,z+1), tile(x-1,z+1)
      // BR : tile(x,z), tile(x+1,z), tile(x,z+1), tile(x+1,z+1)
      corners[x][z] = [
        dominant(get(x, z), get(x-1, z), get(x, z-1), get(x-1, z-1)), // TL
        dominant(get(x, z), get(x+1, z), get(x, z-1), get(x+1, z-1)), // TR
        dominant(get(x, z), get(x-1, z), get(x, z+1), get(x-1, z+1)), // BL
        dominant(get(x, z), get(x+1, z), get(x, z+1), get(x+1, z+1)), // BR
      ]
    }
  }

  return corners
}

// ─── Structure de données ─────────────────────────────────────────────────────

export interface Tile {
  type: TileType          // type dominant — utilisé pour la logique gameplay
  corners: TileCorners    // types des 4 coins — utilisés pour le rendu
  tileX: number
  tileZ: number
}