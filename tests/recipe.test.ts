import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, EXAMPLE_RECIPE, GenerationSchema, RecipeSchema, STYLE_DEFAULTS } from "../lib/recipe";
import { STORAGE_KEY, readSpells, writeSpells } from "../lib/storage";

describe("shared recipe boundary", () => {
  it("fills consistent visible defaults at every nesting level", () => {
    expect(RecipeSchema.parse({})).toEqual(DEFAULT_RECIPE);
    expect(RecipeSchema.parse({ mechanics: { speed: 90 } }).mechanics).toEqual({ ...DEFAULT_RECIPE.mechanics, speed: 90 });
    expect(EXAMPLE_RECIPE.mechanics).toMatchObject({ speed: 90, wallResponse: "split", splitCount: 3, lifetime: 10 });
  });
  it.each([
    { version: 1 }, { version: 4 }, { kind: "beam" }, { explosion: true }, { appearance: { color: "purple" } },
    { appearance: { color: "#b998ff", effect: "poison" } },
    ...[{ size: 0 }, { size: 23 }, { speed: 39 }, { speed: 641 }, { speed: Infinity }, { speed: "90" }, { damage: 0 }, { damage: 101 }, { damage: 2.5 }, { lifetime: 0 }, { lifetime: 13 }, { bounceLimit: 7 }, { bounceLimit: -1 }, { splitCount: 1 }, { splitCount: 6 }, { splitCount: 2.5 }, { wallResponse: "reverse-time" }, { homing: true }].map(mechanics => ({ mechanics })),
  ])("rejects unsafe or unsupported input %j", input => { expect(RecipeSchema.safeParse(input).success).toBe(false); });
  it("keeps unsupported explanations separate from executable recipes", () => {
    expect(GenerationSchema.parse({ status: "unsupported", explanation: "Time reversal is not supported. Try bouncing." })).not.toHaveProperty("recipe");
    expect(GenerationSchema.safeParse({ status: "ok", explanation: "Magic", recipe: { mechanics: { reverseTime: true } } }).success).toBe(false);
  });
  it.each(Object.entries(STYLE_DEFAULTS))("applies %s defaults while preserving explicit size and speed", (kind, defaults) => {
    expect(RecipeSchema.parse({ kind }).mechanics).toMatchObject(defaults);
    expect(RecipeSchema.parse({ kind, mechanics: { size: 20, speed: 123 } }).mechanics).toMatchObject({ size: 20, speed: 123 });
  });
  it.each([
    ["burnDamage", 1, 12, true], ["burnDuration", 1, 5, false], ["poisonDamage", 1, 8, true],
    ["poisonDuration", 3, 10, false], ["chillDuration", 1, 5, false], ["frostBonus", 1, 30, true],
    ["chainCount", 1, 4, true], ["chainRange", 40, 240, false], ["pierceCount", 1, 5, true],
    ["explosionRadius", 20, 140, false], ["explosionDamage", 1, 60, true],
  ] as const)("enforces %s limits", (key, min, max, integer) => {
    for (const value of [min, max]) expect(RecipeSchema.safeParse({ mechanics: { [key]: value } }).success).toBe(true);
    for (const value of [min - 0.1, max + 0.1, NaN, Infinity, "3", ...(integer ? [min + 0.5] : [])]) {
      expect(RecipeSchema.safeParse({ mechanics: { [key]: value } }).success).toBe(false);
    }
  });
  it("validates gameplay enums separately from cosmetic color", () => {
    for (const mechanics of [{ element: "water" }, { onHit: "summon" }]) expect(RecipeSchema.safeParse({ mechanics }).success).toBe(false);
    expect(RecipeSchema.parse({ appearance: { color: "#90c8ff" }, mechanics: { element: "fire" } }).mechanics.element).toBe("fire");
  });
});

describe("saved recipes", () => {
  it("migrates mixed v1/v2 shelves without losing ids, names, colors, mechanics or order", () => {
    const legacy = { version: 1, kind: "orb", appearance: { color: "#123abc" }, mechanics: { size: 17, speed: 90, damage: 42, lifetime: 10, wallResponse: "split", bounceLimit: 5, splitCount: 4 } };
    const current = { id: "new", name: "New", recipe: DEFAULT_RECIPE };
    const migrated = readSpells(JSON.stringify([{ id: "old", name: "Old favorite", recipe: legacy }, current]));
    expect(migrated.map(s => s.id)).toEqual(["old", "new"]);
    expect(migrated[0]).toMatchObject({ name: "Old favorite", recipe: { version: 3, kind: "orb", appearance: legacy.appearance,
      mechanics: { ...legacy.mechanics, element: "arcane", onHit: "consume" } } });
    expect(migrated[1]).toEqual(current);
    let raw = "";
    writeSpells({ setItem: (_, value) => { raw = value; } }, migrated);
    expect(readSpells(raw)).toEqual(migrated);
  });
  it("validates legacy input before migration and v2 output afterwards", () => {
    for (const recipe of [{ version: 1, mechanics: { speed: 9999 } }, { version: 1, mechanics: { element: "fire" } }, { version: 1, kind: "beam" }, { version: 9 }]) {
      expect(() => readSpells(JSON.stringify([{ id: "old", name: "Old", recipe }]))).toThrow();
    }
  });
  it("round trips named recipes through the browser storage boundary", () => {
    let raw = "";
    const spells = [{ id: "one", name: "Amethyst bloom", recipe: EXAMPLE_RECIPE }];
    writeSpells({ setItem: (key, value) => { expect(key).toBe(STORAGE_KEY); raw = value; } }, spells);
    expect(readSpells(raw)).toEqual(spells);
    expect(readSpells(null)).toEqual([]);
  });
  it("rejects corrupted, oversized, duplicate, or mechanically invalid saves", () => {
    for (const raw of ["{broken", "{}", '[{"id":"x","name":"","recipe":{}}]', '[{"id":"x","name":"Bad","recipe":{"mechanics":{"speed":9999}}}]']) expect(() => readSpells(raw)).toThrow();
    const spell = { id: "x", name: "One", recipe: DEFAULT_RECIPE };
    expect(() => readSpells(JSON.stringify([spell, spell]))).toThrow();
    expect(() => readSpells(JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ ...spell, id: String(i) }))))).toThrow();
  });
  it("surfaces quota failures without reporting a save", () => {
    expect(() => writeSpells({ setItem: () => { throw new Error("QuotaExceededError"); } }, [])).toThrow("QuotaExceededError");
  });
});
