// src/game/entity/ItemDef.ts
import type { Entity } from "./Entity"

// ─── Usage — comment cet item s'utilise ───────────────────────────────────────

/**
 * Item classique : spawn un ghost + grille, clic place l'entité dans le monde.
 */
export interface PlaceableUsage {
  readonly kind: "placeable"
  readonly entity: Entity
}

/**
 * Item utilisable sur une entité déjà dans le monde (ex: graine sur dirt_soil).
 * Le raycasting cible les proxies / meshes dont userData.id est dans targetEntityIds.
 */
export interface UseOnEntityUsage {
    readonly kind: "use_on_entity"
    readonly targetEntityIds: readonly string[]
    readonly actionId: string
    readonly consumeOnUse?: boolean  // défaut true
}

/**
 * Item utilisable sur un type de terrain (ex: arroser une case de grass).
 */
export interface UseOnTileUsage {
    readonly kind: "use_on_tile"
    readonly targetTileTypes: readonly string[]
    readonly actionId: string
    readonly consumeOnUse?: boolean  // défaut true
    readonly allowOnCrop?: boolean   // ← ajout
}

/**
 * Ressource passive — obtenue par récolte, ne s'utilise pas activement.
 * Affichée en lecture seule dans l'inventaire.
 */
export interface ResourceUsage {
  readonly kind: "resource"
}

export type ItemUsage =
  | PlaceableUsage
  | UseOnEntityUsage
  | UseOnTileUsage
  | ResourceUsage

// ─── ItemDef — définition complète d'un item inventaire ──────────────────────

export interface ItemDef {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly usage: ItemUsage
}

// ─── Helpers de type ─────────────────────────────────────────────────────────

export function isPlaceable(item: ItemDef | null | undefined): item is ItemDef & { usage: PlaceableUsage } {
    return item?.usage?.kind === "placeable"
}

export function isUsableOnEntity(item: ItemDef | null | undefined): item is ItemDef & { usage: UseOnEntityUsage } {
    return item?.usage?.kind === "use_on_entity"
}

export function isUsableOnTile(item: ItemDef | null | undefined): item is ItemDef & { usage: UseOnTileUsage } {
    return item?.usage?.kind === "use_on_tile"
}

export function isResource(item: ItemDef | null | undefined): item is ItemDef & { usage: ResourceUsage } {
    return item?.usage?.kind === "resource"
}

export function isActivelyUsable(item: ItemDef | null | undefined): boolean {
    return item?.usage?.kind !== "resource" && item?.usage !== undefined
}

export function getItemEntity(item: ItemDef): Entity {
    if (item?.usage?.kind !== "placeable") {
        throw new Error(`[ItemDef] getItemEntity: "${item?.id}" n'est pas un item plaçable.`)
    }
    return item.usage.entity
}