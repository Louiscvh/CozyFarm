import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader"

export class AssetManager {
    private loader = new GLTFLoader()
    private cache = new Map<string, GLTF>()
  
    async loadGLTF(path: string): Promise<GLTF> {
      if (this.cache.has(path)) {
        return this.cache.get(path)!
      }
  
      const gltf = await this.loader.loadAsync(path)
      this.cache.set(path, gltf)
      return gltf
    }
  }

  export const assetManager = new AssetManager()
