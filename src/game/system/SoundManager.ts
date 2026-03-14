// src/game/system/SoundManager.ts

// ─── Assets ───────────────────────────────────────────────────────────────────

const SFX = {
    success: new URL("../../assets/click.mp3", import.meta.url).href,
    error: new URL("../../assets/click_error.mp3", import.meta.url).href,
    crop: "/sounds/crop.mp3",
    wateringCan: "/sounds/watering_can.mp3",
    axe: "/sounds/axe.mp3",
} as const

const AMBIENT_SRC = "/sounds/ambient.mp3"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playSfx(src: string, volume: number): void {
    try {
        const audio = new Audio(src)
        audio.volume = volume
        audio.play().catch(() => { })
    } catch { }
}

// ─── SoundManager ─────────────────────────────────────────────────────────────

export class SoundManager {

    private ambientAudio: HTMLAudioElement | null = null

    // ── SFX ───────────────────────────────────────────────────────────────────

    playSuccess(): void { playSfx(SFX.success, 0.6) }
    playError(): void { playSfx(SFX.error, 0.4) }
    playCrop(): void { playSfx(SFX.crop, 0.55) }
    playWateringCan(): void { playSfx(SFX.wateringCan, 0.55) }
    playAxe(): void { playSfx(SFX.axe, 0.55) }

    // ── Ambient ───────────────────────────────────────────────────────────────

    initAmbient(): void {
        const audio = new Audio(AMBIENT_SRC)
        audio.loop = true
        audio.volume = 0.5
        this.ambientAudio = audio

        const startOnce = () => audio.play().catch(() => { })
        const opts: AddEventListenerOptions = { once: true }

        window.addEventListener("pointerdown", startOnce, opts)
        window.addEventListener("keydown", startOnce, opts)
        window.addEventListener("touchstart", startOnce, opts)
    }

    setAmbientVolume(v: number): void { if (this.ambientAudio) this.ambientAudio.volume = v }
    pauseAmbient(): void { this.ambientAudio?.pause() }
    resumeAmbient(): void { this.ambientAudio?.play().catch(() => { }) }

    disposeAmbient(): void {
        if (!this.ambientAudio) return
        this.ambientAudio.pause()
        this.ambientAudio.src = ""
        this.ambientAudio = null
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const soundManager = new SoundManager()
