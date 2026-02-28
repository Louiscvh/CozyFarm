// src/entity/Entity.ts
export interface Entity {
    id: string
    model: string

    // Taille visuelle — le modèle 3D est scalé pour tenir dans modelSize × modelSize cellules
    modelSize: number

    // Empreinte au sol en cellules (zone d'occupation sur la grille)
    // Si absent, égal à modelSize (cas le plus courant)
    // Utile quand l'empreinte doit être différente de la taille visuelle
    footprint?: number
    // Taille d'occupation en cellules (1 tile = 2x2 cellules)
    // Si absent, calculé automatiquement : max(1, round(sizeInTiles * 2))
    // Exemples :
    //   sizeInTiles: 0.4  → sizeInCells: 1  (1 coin de tile)
    //   sizeInTiles: 1    → sizeInCells: 2  (1 tile entier)
    //   sizeInTiles: 2    → sizeInCells: 4  (2x2 tiles)
    rotation?: {
      x?: number
      y?: number
      z?: number
    }
  
    castShadow?: boolean
    receiveShadow?: boolean
}

/**
 * Retourne la taille en cellules d'une entité.
 * Utilise sizeInCells si défini, sinon le dérive de sizeInTiles.
 */
export function getSizeInCells(entity: Entity): number {
  if (entity.modelSize !== undefined) return entity.modelSize
  return Math.max(1, Math.round(entity.modelSize * 2))
}


/**
 * Retourne l'empreinte au sol de l'entité en cellules.
 * Utilise footprint si défini, sinon modelSize.
 */
export function getFootprint(entity: Entity): number {
  return entity.footprint ?? entity.modelSize
}
