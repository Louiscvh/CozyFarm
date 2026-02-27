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

export function randomTileType(): TileType {
  const r = Math.random()
  if (r < 0.70) return "grass"
  if (r < 0.72) return "water"
  if (r < 0.95) return "sand"
  return "stone"
}

// Structure de données légère — plus de Mesh individuel
export interface Tile {
  type: TileType
  tileX: number
  tileZ: number
}