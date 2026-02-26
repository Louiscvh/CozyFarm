// src/game/entity/TorchEntity.ts
import type { Entity } from "./Entity"

export const TorchEntity: Entity & { sizeInTiles: number } = {
  id: "torch",
  model: "procedural:torch",  // flag spécial intercepté par EntityFactory
  sizeInTiles: 1,
  castShadow: false,
  receiveShadow: false,
}