import { afterEach, expect, it, vi } from "vitest";
import * as T from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { loadArenaAssets } from "../components/arena-assets";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function loaders() {
  const textures: T.Texture[] = [], models: T.Group[] = [];
  vi.spyOn(T.TextureLoader.prototype, "loadAsync").mockImplementation(async () => {
    const texture = new T.Texture<HTMLImageElement>(); vi.spyOn(texture, "dispose"); textures.push(texture); return texture;
  });
  vi.spyOn(HDRLoader.prototype, "loadAsync").mockImplementation(async () => {
    const texture = new T.DataTexture(); vi.spyOn(texture, "dispose"); textures.push(texture); return texture;
  });
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async () => {
    const atlas = new T.Texture(); vi.spyOn(atlas, "dispose"); textures.push(atlas);
    const scene = new T.Group(), geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial({ map: atlas });
    vi.spyOn(geometry, "dispose"); vi.spyOn(material, "dispose"); scene.add(new T.Mesh(geometry, material)); models.push(scene);
    return { scene } as Awaited<ReturnType<GLTFLoader["loadAsync"]>>;
  });
  return { textures, models };
}
it("loads independent assets, marks data maps correctly, and releases shared model resources once", async () => {
  const { textures, models } = loaders(), progress = vi.fn(), assets = loadArenaAssets(progress);
  await assets.ready;
  expect(progress).toHaveBeenLastCalledWith({ loaded: 15, total: 15, failed: 0, done: true });
  expect(assets.models.size).toBe(5); expect(assets.maps.floor.map?.colorSpace).toBe(T.SRGBColorSpace);
  expect(assets.maps.wall.normalMap?.colorSpace).toBe(T.NoColorSpace);
  expect(assets.maps.wood.roughnessMap?.colorSpace).toBe(T.NoColorSpace);
  expect(assets.environment?.mapping).toBe(T.EquirectangularReflectionMapping);
  assets.dispose(); assets.dispose();
  for (const texture of textures) expect(texture.dispose).toHaveBeenCalledOnce();
  for (const model of models) {
    const mesh = model.children[0] as T.Mesh<T.BufferGeometry, T.Material>;
    expect(mesh.geometry.dispose).toHaveBeenCalledOnce(); expect(mesh.material.dispose).toHaveBeenCalledOnce();
  }
});
it("keeps successful resources when texture, model and HDR requests fail", async () => {
  loaders();
  vi.mocked(T.TextureLoader.prototype.loadAsync).mockRejectedValueOnce(new Error("404"));
  vi.mocked(GLTFLoader.prototype.loadAsync).mockRejectedValueOnce(new Error("GLB decode"));
  vi.mocked(HDRLoader.prototype.loadAsync).mockRejectedValueOnce(new Error("HDR unavailable"));
  const progress = vi.fn(), assets = loadArenaAssets(progress); await assets.ready;
  expect(assets.maps.floor.map).toBeUndefined(); expect(assets.maps.wall.map).toBeInstanceOf(T.Texture);
  expect(assets.models.has("column")).toBe(false); expect(assets.models.has("pot")).toBe(true);
  expect(assets.environment).toBeUndefined();
  expect(progress).toHaveBeenLastCalledWith({ loaded: 15, total: 15, failed: 3, done: true }); assets.dispose();
});
it("retains the procedural prop when GLTFLoader resolves without its atlas", async () => {
  loaders();
  const scene = new T.Group(); scene.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial()));
  vi.mocked(GLTFLoader.prototype.loadAsync).mockResolvedValueOnce({ scene } as Awaited<ReturnType<GLTFLoader["loadAsync"]>>);
  const progress = vi.fn(), assets = loadArenaAssets(progress); await assets.ready;
  expect(assets.models.has("column")).toBe(false);
  expect(progress).toHaveBeenLastCalledWith({ loaded: 15, total: 15, failed: 1, done: true }); assets.dispose();
});
it.each([false, true])("disposes late images without applying them after %s (false=timeout, true=unmount)", async unmount => {
  vi.useFakeTimers(); loaders();
  let resolve!: (value: T.Texture<HTMLImageElement>) => void;
  vi.mocked(T.TextureLoader.prototype.loadAsync).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const progress = vi.fn(), assets = loadArenaAssets(progress);
  if (unmount) assets.dispose();
  await vi.advanceTimersByTimeAsync(12_000); await assets.ready;
  const calls = progress.mock.calls.length, texture = new T.Texture<HTMLImageElement>(), dispose = vi.spyOn(texture, "dispose");
  resolve(texture); await Promise.resolve(); await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce(); expect(assets.maps.floor.map).toBeUndefined();
  expect(progress.mock.calls.length).toBe(calls);
  if (!unmount) expect(progress).toHaveBeenLastCalledWith({ loaded: 15, total: 15, failed: 1, done: true });
  assets.dispose();
});
