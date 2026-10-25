// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { describe, expect, it } from "vitest";
import * as T from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fitModel, MODEL_NAMES, PBR_ASSETS } from "../components/arena-assets";
import { obstaclesFor } from "../lib/simulation";

const root = resolve("public/assets");
function walk(path: string): string[] {
  return readdirSync(path).flatMap(name => statSync(resolve(path, name)).isDirectory() ? walk(resolve(path, name)) : [resolve(path, name)]);
}
const files = walk(root);
function dimensions(buffer: Buffer, extension: string): number[] {
  if (extension === ".png") return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  if (extension === ".hdr") {
    const match = buffer.toString("latin1").match(/-Y (\d+) \+X (\d+)/)!;
    return [Number(match[2]), Number(match[1])];
  }
  for (let offset = 2; offset < buffer.length;) {
    if (buffer[offset] !== 255) throw new Error("Invalid JPEG marker");
    const marker = buffer[offset + 1], length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    offset += length + 2;
  }
  throw new Error("Missing image dimensions");
}

describe("bundled CC0 asset contract", () => {
  it("lists every file exactly once with approved source, author and CC0 license, below 40 MB", () => {
    const rows = readFileSync("docs/ASSETS.md", "utf8").split("\n").filter(line => line.includes("`public/assets/"));
    const listed = rows.map(row => {
      const columns = row.split("|").map(column => column.trim());
      expect(new URL(columns[2]).hostname).toMatch(/^(polyhaven\.com|kenney\.nl)$/);
      expect(columns[3].length).toBeGreaterThan(2); expect(columns[4]).toBe("CC0");
      const path = resolve(columns[5].replaceAll("`", ""));
      expect(path.startsWith(root)).toBe(true); expect(statSync(path).size).toBeGreaterThan(0); return path;
    });
    expect(new Set(listed).size).toBe(listed.length); expect(listed.sort()).toEqual([...files].sort());
    expect(files.reduce((sum, file) => sum + statSync(file).size, 0)).toBeLessThan(40_000_000);
    for (const file of files) {
      expect(extname(file)).toMatch(/^\.(jpg|png|webp|gltf|glb|hdr|exr)$/);
      if ([".jpg", ".png", ".hdr"].includes(extname(file))) for (const size of dimensions(readFileSync(file), extname(file))) {
        expect(size).toBeGreaterThan(0); expect(size).toBeLessThanOrEqual(1024);
      }
    }
    for (const [name, diffuse] of Object.values(PBR_ASSETS)) for (const suffix of [diffuse, "nor_gl", "rough"]) {
      expect(files).toContain(resolve(root, "polyhaven", name, `${name}_${suffix}_1k.jpg`));
    }
  });

  it("parses actual GLBs, resolves every external resource locally, and fits solid visuals to gameplay bounds", async () => {
    const manager = new T.LoadingManager();
    // Mock only browser image decoding. Geometry, GLB parsing and transforms remain real.
    manager.addHandler(/\.png$/, { load(url: string, onLoad: (texture: T.Texture) => void) {
      expect(files).toContain(resolve(root, "kenney/mini-dungeon", url));
      const texture = new T.Texture(); queueMicrotask(() => onLoad(texture)); return texture;
    } } as unknown as T.Loader);
    for (const name of MODEL_NAMES) {
      const bytes = readFileSync(resolve(root, "kenney/mini-dungeon", `${name}.glb`));
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      for (const buffer of json.buffers) expect(buffer.uri).toBeUndefined();
      for (const image of json.images) expect(files).toContain(resolve(root, "kenney/mini-dungeon", image.uri));
      const data = new ArrayBuffer(bytes.length); new Uint8Array(data).set(bytes);
      const { scene } = await new GLTFLoader(manager).parseAsync(data, "");
      const obstacle = obstaclesFor("workshop").find(p => (name === "column" ? p.kind === "pillar" : name === "chest" ? p.kind === "crate" : name === "pot" ? p.kind === "cauldron" : false));
      const [width, height, depth] = obstacle ? [obstacle.halfWidth * 2, obstacle.height, obstacle.halfHeight * 2] : [14, 28, 14];
      const original = new T.Box3().setFromObject(scene), model = fitModel(scene, width, height, depth);
      const bounds = new T.Box3().setFromObject(model), size = bounds.getSize(new T.Vector3());
      expect(size.x).toBeCloseTo(width); expect(size.y).toBeCloseTo(height); expect(size.z).toBeCloseTo(depth);
      expect(bounds.min.y).toBeCloseTo(0); expect(bounds.getCenter(new T.Vector3()).x).toBeCloseTo(0);
      expect(new T.Box3().setFromObject(scene)).toEqual(original);
    }
    expect(() => fitModel(new T.Group(), 1, 1, 1)).toThrow("Empty model bounds");
  });
});
