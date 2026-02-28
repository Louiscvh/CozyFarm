// src/entity/utils/placeOnCell.ts
import * as THREE from "three"

/**
 * Place un objet au centre d'une zone de cellules en coordonnées monde.
 *
 * @param obj              - L'objet à positionner
 * @param cellX            - Index X de la cellule de départ (coin haut-gauche)
 * @param cellZ            - Index Z de la cellule de départ (coin haut-gauche)
 * @param cellSize         - Taille d'une cellule en unités monde (= tileSize / 2)
 * @param worldSizeInCells - Nombre de cellules sur un axe (= worldSize * 2)
 * @param sizeInCells      - Taille de l'entité en cellules (défaut: 1)
 */
export function placeOnCell(
  obj: THREE.Object3D,
  cellX: number,
  cellZ: number,
  cellSize: number,
  worldSizeInCells: number,
  sizeInCells: number = 1
) {
  const halfWorld = worldSizeInCells / 2

  // (cellX - halfWorld) * cellSize = bord gauche de la cellule de départ
  // + (sizeInCells / 2) * cellSize = centre de la zone occupée
  //
  // Exemples :
  //   sizeInCells=1 → offset = 0.5 × cellSize  (centre de 1 cellule)
  //   sizeInCells=2 → offset = 1.0 × cellSize  (centre de 2 cellules = 1 tile)
  //   sizeInCells=4 → offset = 2.0 × cellSize  (centre de 4 cellules = 2 tiles)
  const centerOffset = (sizeInCells / 2) * cellSize

  obj.position.set(
    (cellX - halfWorld) * cellSize + centerOffset,
    obj.position.y,
    (cellZ - halfWorld) * cellSize + centerOffset
  )
}