import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js"

export class AssetManager {
    private loader = new GLTFLoader()
    private cache = new Map<string, GLTF>()
    private inFlight = new Map<string, Promise<GLTF>>()

    async loadGLTF(path: string): Promise<GLTF> {
      const cached = this.cache.get(path)
      if (cached) {
        return cached
      }

      const pending = this.inFlight.get(path)
      if (pending) {
        return pending
      }

      const request = this.loader.loadAsync(path)
        .then((gltf) => {
          this.cache.set(path, gltf)
          this.inFlight.delete(path)
          return gltf
        })
        .catch((error) => {
          this.inFlight.delete(path)
          throw error
        })

      this.inFlight.set(path, request)
      return request
    }

    preloadGLTF(paths: string[]): Promise<GLTF[]> {
      const uniquePaths = [...new Set(paths)]
      return Promise.all(uniquePaths.map((path) => this.loadGLTF(path)))
    }
  }

  export const assetManager = new AssetManager()
