// src/game/entity/TorchEntity.ts
import type { Entity } from "./Entity"

export const TorchEntity: Entity  = {
  id: "torch",
  model: "procedural:torch",  // flag spécial intercepté par EntityFactory
  modelSize: 1,
  castShadow: false,
  receiveShadow: false,
}