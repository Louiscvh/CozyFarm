// src/entity/Entity.ts
export interface ConnectableEntityConfig {
    family: string
}

export interface Entity {
    id: string
    model: string

    // Taille visuelle — le modèle 3D est scalé pour tenir dans modelSize × modelSize cellules
    modelSize: number

    // Empreinte au sol en cellules (zone d'occupation sur la grille)
    // Si absent, égal à modelSize (cas le plus courant)
    // Utile quand l'empreinte doit être différente de la taille visuelle
    footprint?: number
    yOffset?: number  // valeur explicite, défaut 0

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
    connectable?: ConnectableEntityConfig
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


export function isConnectableEntity(entity: Entity | null | undefined): entity is Entity & { connectable: ConnectableEntityConfig } {
  return !!entity?.connectable
}

export function getConnectableFamily(entity: Entity | null | undefined): string | null {
  return entity?.connectable?.family ?? null
}

export function supportsManualRotation(entity: Entity | null | undefined): boolean {
  void entity
  return true
}
