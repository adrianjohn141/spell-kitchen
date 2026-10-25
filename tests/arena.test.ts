import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three/webgpu";
import { fitCamera, floorAim } from "../components/arena-view";
import { EXAMPLE_RECIPE, RecipeSchema } from "../lib/recipe";
import { CASTER, INITIAL_AIM, ROOM, Simulation, type Obstacle } from "../lib/simulation";
import { SYSTEM_PROMPT } from "../lib/llm";
import { DEFAULT_SETTINGS, QUALITY, ROBES, SETTINGS_KEY, SettingsSchema, readSettings, writeSettings } from "../lib/settings";

function run(sim: Simulation, seconds: number) { for (let i = 0; i < seconds * 120; i++) sim.advance(1 / 120); }
function shot(response: "bounce" | "split" | "disappear" = "bounce") {
  const sim = new Simulation(); sim.targets = [];
  const pillar = sim.obstacles.find(p => p.kind === "pillar")!;
  sim.cast(RecipeSchema.parse({ mechanics: { size: 6, speed: 640, lifetime: 12, wallResponse: response } }), { x: pillar.x, y: pillar.y });
  return { sim, pillar, p: sim.projectiles[0] };
}
function distanceToBox(x: number, y: number, box: Obstacle) {
  return Math.hypot(Math.max(0, Math.abs(x - box.x) - box.halfWidth), Math.max(0, Math.abs(y - box.y) - box.halfHeight));
}

describe("expanded deterministic world", () => {
  it("lets the initial example reach a wall and split in either layout", () => {
    for (const layout of ["workshop", "open-hall"]) {
      const sim = new Simulation(layout); sim.cast(EXAMPLE_RECIPE, INITIAL_AIM);
      for (let i = 0; i < 1200 && sim.stats.wallHits === 0; i++) sim.advance(1 / 120);
      expect(sim.stats.targetHits).toBe(0); expect(sim.stats.splits).toBe(1); expect(sim.projectiles).toHaveLength(3);
    }
  });
  it("keeps model instructions consistent with the world and unsupported rules", () => {
    expect(SYSTEM_PROMPT).toContain("800 x 600"); expect(SYSTEM_PROMPT).not.toContain("480 by 400");
    for (const word of ["Workshop", "Open hall", "pillars", "settings", "bounceLimit", "splitCount", "unsupported"]) expect(SYSTEM_PROMPT).toContain(word);
  });
  it("uses the expanded room and matching floor obstacles", () => {
    expect(ROOM).toEqual({ width: 800, height: 600 });
    const workshop = new Simulation(), hall = new Simulation("open-hall");
    expect(workshop.layout).toBe("workshop");
    expect(workshop.obstacles.filter(p => p.kind === "pillar")).toHaveLength(2);
    expect(hall.obstacles.some(p => p.kind === "pillar")).toBe(false);
    expect(hall.obstacles.map(p => p.kind)).toEqual(["crate", "cauldron"]);
    for (const t of workshop.targets) {
      expect(t.x - t.radius).toBeGreaterThan(0); expect(t.x + t.radius).toBeLessThan(ROOM.width);
      expect(t.y - t.radius).toBeGreaterThan(0); expect(t.y + t.radius).toBeLessThan(ROOM.height);
      expect(workshop.obstacles.every(o => distanceToBox(t.x, t.y, o) > t.radius)).toBe(true);
    }
    expect(() => new Simulation("unknown")).toThrow();
  });
  it.each(["disappear", "bounce", "split"] as const)("applies %s at the first pillar face", response => {
    const { sim, pillar, p } = shot(response);
    p.x = pillar.x - pillar.halfWidth - p.radius - 1; p.y = pillar.y; p.vx = 640; p.vy = 0; p.headingX = 1; p.headingY = 0;
    sim.advance(1 / 120);
    expect(sim.stats.wallHits).toBe(1); expect(sim.events.some(e => e.kind === "wall" || e.kind === "split")).toBe(true);
    expect(sim.projectiles).toHaveLength(response === "disappear" ? 0 : response === "split" ? 3 : 1);
    for (const child of sim.projectiles) {
      expect(child.vx).toBeLessThan(0); expect(distanceToBox(child.x, child.y, pillar)).toBeGreaterThanOrEqual(child.radius);
      if (response === "split") expect(child.child).toBe(true);
    }
  });
  it.each([-1, 1])("reflects accurate rounded pillar corners at maximum speed (side %i)", side => {
    const { sim, pillar, p } = shot();
    const cx = pillar.x + side * pillar.halfWidth, cy = pillar.y - pillar.halfHeight;
    p.x = cx + side * 7; p.y = cy - 7;
    p.vx = -side * 640 / Math.SQRT2; p.vy = 640 / Math.SQRT2; p.headingX = -side / Math.SQRT2; p.headingY = 1 / Math.SQRT2;
    sim.advance(1 / 120);
    expect(sim.stats.wallHits).toBe(1); expect(Math.sign(p.vx)).toBe(side); expect(p.vy).toBeLessThan(0);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(640, 8);
    expect(distanceToBox(p.x, p.y, pillar)).toBeGreaterThanOrEqual(p.radius);
    sim.advance(1 / 120); expect(sim.stats.wallHits).toBe(1);
  });
  it("sweeps a sub-tick corner chord without tunneling or a false expanded-box hit", () => {
    const { sim, pillar, p } = shot("disappear");
    const cx = pillar.x - pillar.halfWidth, cy = pillar.y - pillar.halfHeight;
    p.x = cx - 2.5; p.y = cy - 5.99; p.vx = 640; p.vy = 0;
    sim.advance(1 / 120); expect(sim.stats.wallHits).toBe(1); expect(sim.projectiles).toHaveLength(0);
    const miss = shot("disappear"); miss.p.x = cx - 5; miss.p.y = cy - 5; miss.p.vx = 200; miss.p.vy = 0;
    miss.sim.advance(1 / 120); expect(miss.sim.stats.wallHits).toBe(0); expect(miss.sim.projectiles).toHaveLength(1);
  });
  it.each(["bounce", "split", "disappear"] as const)("keeps all circles outside floor props throughout %s", response => {
    for (const obstacle of new Simulation().obstacles) {
      const { sim } = shot(response); sim.projectiles = [];
      sim.cast(RecipeSchema.parse({ kind: "wisp", mechanics: { size: 22, speed: 640, lifetime: 12, bounceLimit: 6, wallResponse: response } }), obstacle);
      for (let i = 0; i < 1440; i++) {
        sim.advance(1 / 120);
        for (const p of sim.projectiles) for (const box of sim.obstacles) expect(distanceToBox(p.x, p.y, box)).toBeGreaterThanOrEqual(p.radius - 1e-6);
      }
    }
  });
  it("resolves earlier target/pillar contacts and explodes using the existing bounded splash", () => {
    const { sim, pillar, p } = shot("disappear");
    p.x = pillar.x - 70; p.y = pillar.y; p.vx = 640; p.vy = 0;
    p.mechanics = { ...p.mechanics, onHit: "explode", explosionRadius: 75, explosionDamage: 23 };
    sim.targets = [{ id: 1, x: pillar.x - 24, y: pillar.y + 55, radius: 5, hp: 100 }];
    sim.advance(0.1); expect(sim.events.filter(e => e.kind === "explosion")).toHaveLength(1); expect(sim.targets[0].hp).toBe(77);
    const before = shot(); before.sim.targets = [{ id: 1, x: CASTER.x + 45, y: CASTER.y - 7, radius: 16, hp: 100 }];
    before.sim.advance(0.1); expect(before.sim.stats.targetHits).toBe(1); expect(before.sim.stats.wallHits).toBe(0);
  });
  it.each(["workshop", "open-hall"])("repeats layout %s identically across frame chunks and resets", layout => {
    const a = new Simulation(layout), b = new Simulation(layout);
    const recipe = RecipeSchema.parse({ kind: "wisp", mechanics: { speed: 640, wallResponse: "split", element: "fire" } });
    a.cast(recipe, { x: 340, y: 245 }); b.cast(recipe, { x: 340, y: 245 });
    run(a, 5); for (let i = 0; i < 100; i++) b.advance(0.05);
    expect(a.projectiles).toEqual(b.projectiles); expect(a.events).toEqual(b.events); expect(a.targets).toEqual(b.targets); expect(a.stats).toEqual(b.stats);
    a.reset(); expect(a.layout).toBe(layout); expect(a.obstacles).toEqual(b.obstacles);
  });
  it("changes collisions when the same shot uses Open hall", () => {
    const a = new Simulation(), b = new Simulation("open-hall"); a.targets = []; b.targets = [];
    for (const sim of [a, b]) sim.cast(RecipeSchema.parse({ mechanics: { speed: 640 } }), { x: 340, y: 245 });
    run(a, 0.5); run(b, 0.5); expect(a.stats.wallHits).toBe(1); expect(b.stats.wallHits).toBe(0);
  });
});

describe("camera floor mapping", () => {
  it.each([[1440, 900], [768, 1024], [375, 812], [844, 390]])("fits full room and round trips floor rays at %i × %i", (width, height) => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000); fitCamera(camera, width, height);
    for (const x of [0, ROOM.width]) for (const z of [0, ROOM.height]) for (const y of [0, 135]) {
      const ndc = new Vector3(x, y, z).project(camera); expect(Math.abs(ndc.x)).toBeLessThan(1); expect(Math.abs(ndc.y)).toBeLessThan(1);
    }
    for (const point of [CASTER, { x: 400, y: 300 }, { x: 799, y: 599 }]) {
      const ndc = new Vector3(point.x, 0, point.y).project(camera), world = floorAim(camera, ndc.x, ndc.y);
      expect(world?.x).toBeCloseTo(point.x, 8); expect(world?.y).toBeCloseTo(point.y, 8);
    }
    expect(floorAim(camera, 20, 20)).toBeNull();
  });
});

describe("graphics settings contract", () => {
  it("defaults, validates strict settings, and writes only the settings key", () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(() => readSettings('{"quality":"ultra"}')).toThrow(); expect(() => readSettings('{broken')).toThrow();
    expect(SettingsSchema.safeParse({ recipe: {} }).success).toBe(false);
    const writes: Record<string, string> = {};
    const valid = writeSettings({ setItem: (key, value) => { writes[key] = value; } }, { quality: "high", lighting: "arcane", layout: "open-hall" });
    expect(Object.keys(writes)).toEqual([SETTINGS_KEY]); expect(readSettings(writes[SETTINGS_KEY])).toEqual(valid);
    for (const profile of Object.values(QUALITY)) {
      expect(profile.lights).toBeGreaterThanOrEqual(1); expect(profile.lights).toBeLessThanOrEqual(8);
      expect(profile.particles).toBeLessThanOrEqual(512); expect(profile.shadowSize).toBeLessThanOrEqual(2048);
    }
    expect(QUALITY.low.bloom).toBe(false);
  });
});

describe("cosmetic settings", () => {
  it("defaults older saved settings, drops removed post-effect keys, and validates options", () => {
    expect(readSettings(JSON.stringify({ quality: "high", lighting: "arcane", layout: "open-hall" }))).toEqual({ ...DEFAULT_SETTINGS, quality: "high", lighting: "arcane", layout: "open-hall" });
    expect(readSettings(JSON.stringify({ quality: "low", grade: "noir", vignette: true, aberration: true, grain: true }))).toEqual({ ...DEFAULT_SETTINGS, quality: "low" });
    expect(() => readSettings(JSON.stringify({ hat: "<script>" }))).toThrow();
    for (const robe of SettingsSchema.shape.robe.unwrap().options) expect(ROBES[robe]).toBeGreaterThan(0);
  });
});
