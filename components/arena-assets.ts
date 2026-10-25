import * as T from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export const PBR_ASSETS = {
  floor: ["stone_tiles_02", "diff"], wall: ["brick_wall_001", "diffuse"], wood: ["wood_planks", "diff"],
} as const;
export const MODEL_NAMES = ["column", "chest", "pot", "potion", "banner"] as const;
export type AssetProgress = { loaded: number; total: number; failed: number; done: boolean };
export type PBRMaps = { map?: T.Texture; normalMap?: T.Texture; roughnessMap?: T.Texture };

/** Presentation only: normalize an authored model to the simulation's existing footprint. */
export function fitModel(source: T.Object3D, width: number, height: number, depth: number) {
  const object = source.clone(true), bounds = new T.Box3().setFromObject(object);
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) throw new Error("Empty model bounds");
  object.scale.multiply(new T.Vector3(width / size.x, height / size.y, depth / size.z));
  object.position.set(-center.x * width / size.x, -bounds.min.y * height / size.y, -center.z * depth / size.z);
  const root = new T.Group(); root.add(object);
  root.traverse(child => { if (child instanceof T.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
  return root;
}

/** Independent failures retain procedural visuals. Late loads never attach after disposal or timeout. */
export function loadArenaAssets(onProgress: (progress: AssetProgress) => void) {
  const manager = new T.LoadingManager(), loader = new T.TextureLoader(manager), gltf = new GLTFLoader(manager);
  // TextureLoader lets three.js own image decoding; the GLB atlas uses the same path.
  manager.addHandler(/\.png$/i, loader);
  const maps: Record<keyof typeof PBR_ASSETS, PBRMaps> = { floor: {}, wall: {}, wood: {} };
  const models = new Map<string, T.Object3D>(), resources: (T.Texture | T.Object3D)[] = [];
  let environment: T.Texture | undefined, disposed = false, loaded = 0, failed = 0;
  const total = 15;
  function release(value: T.Texture | T.Object3D) {
    const textures = new Set<T.Texture>(), materials = new Set<T.Material>(), geometries = new Set<T.BufferGeometry>();
    if (value instanceof T.Texture) textures.add(value);
    else value.traverse(child => {
      if (!(child instanceof T.Mesh)) return;
      geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(material);
        for (const item of Object.values(material)) if (item instanceof T.Texture) textures.add(item);
      }
    });
    for (const item of textures) item.dispose();
    for (const item of materials) item.dispose();
    for (const item of geometries) item.dispose();
  }
  async function load<V extends T.Texture | T.Object3D>(pending: Promise<V>, apply: (value: V) => void) {
    let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([pending.then(value => {
        if (expired) release(value);
        return value;
      }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Asset timeout")), 12_000); })]);
      if (disposed) release(value);
      else { resources.push(value); apply(value); }
    } catch { failed++; }
    finally {
      expired = true; clearTimeout(timer); loaded++;
      if (!disposed) onProgress({ loaded, total, failed, done: loaded === total });
    }
  }
  onProgress({ loaded, total, failed, done: false });
  const tasks: Promise<void>[] = [];
  for (const [surface, [name, diffuse]] of Object.entries(PBR_ASSETS)) {
    for (const [slot, suffix] of [["map", diffuse], ["normalMap", "nor_gl"], ["roughnessMap", "rough"]] as const) {
      tasks.push(load(loader.loadAsync(`/assets/polyhaven/${name}/${name}_${suffix}_1k.jpg`), texture => {
        texture.colorSpace = slot === "map" ? T.SRGBColorSpace : T.NoColorSpace;
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.repeat.set(surface === "floor" ? 4 : surface === "wall" ? 4 : 1, surface === "floor" ? 3 : 1);
        maps[surface as keyof typeof maps][slot] = texture;
      }));
    }
  }
  tasks.push(load(new HDRLoader(manager).loadAsync("/assets/polyhaven/studio_small_09/studio_small_09_1k.hdr"), texture => {
    texture.mapping = T.EquirectangularReflectionMapping; environment = texture;
  }));
  for (const name of MODEL_NAMES) tasks.push(load(gltf.loadAsync(`/assets/kenney/mini-dungeon/${name}.glb`).then(result => result.scene), model => {
    // GLTFLoader can resolve a model even when its external atlas failed.
    let missingAtlas = false;
    model.traverse(child => {
      if (child instanceof T.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (!(material as T.MeshStandardMaterial).map) missingAtlas = true;
      }
    });
    if (missingAtlas) throw new Error("Model atlas unavailable");
    models.set(name, model);
  }));
  return { maps, models, get environment() { return environment; }, ready: Promise.all(tasks), dispose() {
    if (disposed) return;
    disposed = true; manager.abort(); for (const resource of resources) release(resource); resources.length = 0;
  } };
}
