import type { Entity } from "../Entity"

export const WoodFenceEntity: Entity = {
  id: "wood_fence",
  model: "procedural:wood_fence_connectable",
  modelSize: 1,
  footprint: 1,
  connectable: { family: "wood_fence" },
}
