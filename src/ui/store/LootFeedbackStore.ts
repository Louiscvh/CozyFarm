export interface LootFeedbackEvent {
    itemId: string
    amount: number
    cellX: number
    cellZ: number
    icon?: string
    targetSelector?: string
}

class LootFeedbackStore {
    private listeners: Array<(event: LootFeedbackEvent) => void> = []

    subscribe(listener: (event: LootFeedbackEvent) => void) {
        this.listeners.push(listener)
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener)
        }
    }

    emit(event: LootFeedbackEvent) {
        this.listeners.forEach(listener => listener(event))
    }
}

export const lootFeedbackStore = new LootFeedbackStore()
