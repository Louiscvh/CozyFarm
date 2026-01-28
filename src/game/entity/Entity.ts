export interface Entity {
    id: string
    model: string
    sizeInTiles: number
    rotation?: {
      x?: number
      y?: number
      z?: number
    }
  
    castShadow?: boolean
    receiveShadow?: boolean
}
