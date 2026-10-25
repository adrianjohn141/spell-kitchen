import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, EXAMPLE_RECIPE, RecipeSchema } from "../lib/recipe";
import { Simulation, TICK } from "../lib/simulation";
import { parseRecipeJson, recipeFromHash, recipeToHash, recipeToJson, SHARE_PREFIX } from "../lib/share";
import { EMPTY_HOTBAR, pruneHotbar, readHotbar } from "../lib/hotbar";

const fire = RecipeSchema.parse({ mechanics: { element: "fire", speed: 640, lifetime: 12 } });

describe("recipe sharing", () => {
  it("round-trips through JSON and URL hashes", () => {
    for (const recipe of [EXAMPLE_RECIPE, fire]) {
      expect(parseRecipeJson(recipeToJson(recipe))).toEqual(recipe);
      const hash = recipeToHash(recipe);
      expect(hash.startsWith(SHARE_PREFIX)).toBe(true);
      expect(hash).toMatch(/^#spell=[A-Za-z0-9_-]+$/);
      expect(recipeFromHash(hash)).toEqual(recipe);
    }
  });
  it("accepts saved-spell shaped objects and migrates older versions", () => {
    const legacy = { version: 1, kind: "orb", mechanics: { speed: 93, damage: 19 }, appearance: { color: "#112233" } };
    expect(parseRecipeJson(JSON.stringify(legacy))).toMatchObject({ version: 3, mechanics: { speed: 93, damage: 19 }, appearance: { color: "#112233" } });
    expect(parseRecipeJson(JSON.stringify({ id: "x", name: "Saved", recipe: DEFAULT_RECIPE }))).toEqual(DEFAULT_RECIPE);
  });
  it.each([
    ["not json", "That is not valid JSON."],
    [JSON.stringify({ mechanics: { speed: 99999 } }), "Invalid recipe at mechanics.speed"],
    [JSON.stringify({ mechanics: { reverseTime: true } }), "Invalid recipe"],
    [JSON.stringify({ appearance: { color: "url(javascript:alert(1))" } }), "Invalid recipe at appearance.color"],
    [JSON.stringify({ __proto__: { polluted: true }, kind: "beam" }), "Invalid recipe"],
    ["x".repeat(20_000), "too large"],
  ])("rejects invalid or hostile recipe text %#", (text, message) => {
    expect(() => parseRecipeJson(text)).toThrow(message);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("rejects damaged and oversized links, and ignores unrelated hashes", () => {
    expect(recipeFromHash("#other")).toBeNull();
    expect(() => recipeFromHash("#spell=!!!")).toThrow("damaged");
    expect(() => recipeFromHash("#spell=" + "A".repeat(20_000))).toThrow("too long");
    expect(() => recipeFromHash(SHARE_PREFIX + btoa(JSON.stringify({ mechanics: { damage: 0 } })).replace(/=+$/, ""))).toThrow("Invalid recipe");
  });
});

describe("hotbar persistence", () => {
  it("clears slots whose saved spells no longer exist", () => {
    expect(pruneHotbar(["a", "gone", null, "b"], ["a", "b"])).toEqual(["a", null, null, "b"]);
    expect(readHotbar(JSON.stringify(["a", "gone", null, null]), ["a"])).toEqual(["a", null, null, null]);
  });
  it("falls back to an empty hotbar for missing or invalid data", () => {
    for (const raw of [null, "nope", "[1,2,3,4]", JSON.stringify(["a"]), JSON.stringify([null, null, null, null, null])]) expect(readHotbar(raw, ["a"])).toEqual(EMPTY_HOTBAR);
  });
});

describe("sandbox time and combat stats", () => {
  function state(sim: Simulation) { return { p: sim.projectiles.map(p => [p.x, p.y]), t: sim.targets.map(t => t.hp), s: sim.stats, c: sim.combat, time: sim.time }; }
  it("stays deterministic when the same game time arrives at different time scales", () => {
    const frames = (scale: number) => {
      const sim = new Simulation("workshop", 7); sim.cast(fire, { x: 175, y: 105 });
      // 120 render frames of 1/60 s each; scale only changes how much game time each frame feeds in.
      for (let i = 0; i < 480 / scale; i++) sim.advance(1 / 60 * scale);
      return state(sim);
    };
    const normal = frames(1);
    for (const scale of [0.25, 0.5, 2]) expect(frames(scale)).toEqual(normal);
  });
  it("advances exactly one fixed tick per step", () => {
    const sim = new Simulation(); sim.cast(fire, { x: 700, y: 285 });
    const before = sim.time; sim.advance(TICK); expect(sim.time - before).toBeCloseTo(TICK, 10);
  });
  it("tracks damage per element, hits, DPS and peak projectiles, and reset clears them", () => {
    const sim = new Simulation("open-hall"); sim.cast(fire, { x: 175, y: 105 });
    for (let i = 0; i < 600 && sim.combat.hits === 0; i++) sim.advance(TICK);
    expect(sim.combat.hits).toBeGreaterThan(0);
    expect(sim.combat.damage.fire).toBeGreaterThan(0);
    expect(sim.combat.peakActive).toBe(1);
    expect(sim.combat.dps).toBeCloseTo((sim.combat.damage.fire ?? 0) / 5, 5);
    const total = 100 * 3 - sim.targets.reduce((sum, t) => sum + t.hp, 0);
    expect(Object.values(sim.combat.damage).reduce((a, b) => a + (b ?? 0), 0)).toBe(total);
    sim.reset(); expect(sim.combat).toEqual({ damage: {}, hits: 0, peakActive: 0, dps: 0, reactions: {} });
  });
  it("drops damage older than five seconds from DPS", () => {
    const sim = new Simulation("open-hall"); sim.cast(fire, { x: 175, y: 105 });
    for (let i = 0; i < 120 * 20; i++) sim.advance(TICK);
    expect(sim.combat.damage.fire).toBeGreaterThan(0); expect(sim.combat.dps).toBe(0);
  });
});
