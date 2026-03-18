// src/game/system/SoundManager.ts

// ─── Assets ───────────────────────────────────────────────────────────────────

const SFX = {
    success: new URL("../../assets/click.mp3", import.meta.url).href,
    error: new URL("../../assets/click_error.mp3", import.meta.url).href,
    crop: "/sounds/crop.mp3",
    wateringCan: "/sounds/watering_can.mp3",
    axe: "/sounds/axe.mp3",
    moneyPickup: "/sounds/money_pickup.mp3",
} as const

const AMBIENT_SRC = "/sounds/ambient.mp3"
const AUDIO_PRELOAD_DELAY_MS = 1200

type SfxKey = keyof typeof SFX

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAudio(src: string): HTMLAudioElement {
    const audio = new Audio(src)
    audio.preload = "auto"
    return audio
}

// ─── SoundManager ─────────────────────────────────────────────────────────────

export class SoundManager {

    private ambientAudio: HTMLAudioElement | null = null
    private sfxPool = new Map<SfxKey, HTMLAudioElement>()
    private ambientInitialized = false
    private audioWarmupScheduled = false

    // ── SFX ───────────────────────────────────────────────────────────────────

    private playSfx(key: SfxKey, volume: number): void {
        try {
            const baseAudio = this.sfxPool.get(key) ?? createAudio(SFX[key])
            if (!this.sfxPool.has(key)) this.sfxPool.set(key, baseAudio)

            const audio = baseAudio.paused ? baseAudio : baseAudio.cloneNode(true) as HTMLAudioElement
            audio.volume = volume
            audio.currentTime = 0
            audio.play().catch(() => { })
        } catch { }
    }

    playSuccess(): void { this.playSfx("success", 0.6) }
    playError(): void { this.playSfx("error", 0.4) }
    playCrop(): void { this.playSfx("crop", 0.55) }
    playWateringCan(): void { this.playSfx("wateringCan", 0.55) }
    playAxe(): void { this.playSfx("axe", 0.55) }
    playMoneyPickup(): void { this.playSfx("moneyPickup", 0.65) }

    scheduleWarmup(): void {
        if (this.audioWarmupScheduled || typeof window === "undefined") return
        this.audioWarmupScheduled = true

        window.setTimeout(() => {
            for (const key of Object.keys(SFX) as SfxKey[]) {
                if (this.sfxPool.has(key)) continue
                const audio = createAudio(SFX[key])
                audio.load()
                this.sfxPool.set(key, audio)
            }
        }, AUDIO_PRELOAD_DELAY_MS)
    }

    // ── Ambient ───────────────────────────────────────────────────────────────

    initAmbient(): void {
        if (this.ambientInitialized || typeof window === "undefined") return
        this.ambientInitialized = true

        const activateAmbient = () => {
            if (!this.ambientAudio) {
                const audio = createAudio(AMBIENT_SRC)
                audio.loop = true
                audio.volume = 0.5
                this.ambientAudio = audio
            }

            this.ambientAudio.play().catch(() => { })
        }

        const opts: AddEventListenerOptions = { once: true, passive: true }

        window.addEventListener("pointerdown", activateAmbient, opts)
        window.addEventListener("keydown", activateAmbient, { once: true })
        window.addEventListener("touchstart", activateAmbient, opts)
    }

    setAmbientVolume(v: number): void { if (this.ambientAudio) this.ambientAudio.volume = v }
    pauseAmbient(): void { this.ambientAudio?.pause() }
    resumeAmbient(): void { this.ambientAudio?.play().catch(() => { }) }

    disposeAmbient(): void {
        if (!this.ambientAudio) return
        this.ambientAudio.pause()
        this.ambientAudio.src = ""
        this.ambientAudio = null
        this.ambientInitialized = false
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const soundManager = new SoundManager()
