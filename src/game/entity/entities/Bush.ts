import type { Entity } from "../Entity"

export const BushEntity: Entity = {
  id: "bush",
  model: "procedural:bush_connectable",
  modelSize: 1,
  footprint: 1,
  connectable: { family: "bush" },
}
