// src/entity/utils/placeOnTile.ts
import * as THREE from "three"

/**
 * Place un objet au centre d'une tile donnée en coordonnées de grille (tile index).
 *
 * @param obj       - L'objet à positionner
 * @param tileX     - Index X de la tile (0 à worldSize-1)
 * @param tileZ     - Index Z de la tile (0 à worldSize-1)
 * @param tileSize  - Taille d'une tile en unités monde
 * @param worldSize - Nombre de tiles sur un axe (ex: 120). Nécessaire pour centrer le monde sur (0,0).
 * @param entitySize - Taille de l'entité en tiles (défaut: 1). Centre automatiquement les entités multi-tiles.
 */
export function placeOnTile(
  obj: THREE.Object3D,
  tileX: number,
  tileZ: number,
  tileSize: number,
  worldSize: number = 120,
  entitySize: number = 1
) {
  // Offset pour centrer le monde sur (0,0), identique à generateTiles :
  //   position monde d'une tile = (tileIndex - worldSize/2) * tileSize
  //
  // Pour une entité multi-tiles, on ajoute (entitySize - 1) / 2 * tileSize
  // pour que l'origine de l'objet soit au centre géométrique de la zone occupée.
  const halfWorld = worldSize / 2
  const centerOffset = ((entitySize - 1) / 2) * tileSize

  obj.position.set(
    (tileX - halfWorld) * tileSize + centerOffset,
    obj.position.y,
    (tileZ - halfWorld) * tileSize + centerOffset
  )
}