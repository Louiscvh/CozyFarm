export const TOOL_IDS = ["hoe", "watering_can", "axe", "shovel"] as const
export type ToolId = typeof TOOL_IDS[number]

const DEFAULT_TOOL_LEVEL = 1
const MAX_TOOL_LEVEL = 4

function isToolId(value: string): value is ToolId {
    return (TOOL_IDS as readonly string[]).includes(value)
}

class ToolLevelStore {
    private readonly levels = new Map<ToolId, number>()
    private listeners: (() => void)[] = []

    constructor() {
        for (const id of TOOL_IDS) this.levels.set(id, DEFAULT_TOOL_LEVEL)
    }

    subscribe(fn: () => void) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter(l => l !== fn) }
    }

    private notify() {
        this.listeners.forEach(fn => fn())
    }

    getLevel(toolId: string): number {
        if (!isToolId(toolId)) return DEFAULT_TOOL_LEVEL
        return this.levels.get(toolId) ?? DEFAULT_TOOL_LEVEL
    }

    setLevel(toolId: string, level: number): number {
        if (!isToolId(toolId)) return DEFAULT_TOOL_LEVEL
        const next = Math.max(DEFAULT_TOOL_LEVEL, Math.min(MAX_TOOL_LEVEL, Math.round(level)))
        if (next === this.getLevel(toolId)) return next
        this.levels.set(toolId, next)
        this.notify()
        return next
    }

    increase(toolId: string): number { return this.setLevel(toolId, this.getLevel(toolId) + 1) }
    decrease(toolId: string): number { return this.setLevel(toolId, this.getLevel(toolId) - 1) }
}

export function getAreaOffsetsForLevel(level: number): Array<{ x: number; z: number }> {
    if (level <= 1) return [{ x: 0, z: 0 }]
    if (level === 2) {
        return [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: -1, z: 0 },
            { x: 0, z: 1 },
            { x: 0, z: -1 },
        ]
    }
    if (level === 3) {
        const offsets: Array<{ x: number; z: number }> = []
        for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) offsets.push({ x, z })
        return offsets
    }

    const offsets: Array<{ x: number; z: number }> = []
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) offsets.push({ x, z })
    return offsets
}

export const toolLevelStore = new ToolLevelStore()
