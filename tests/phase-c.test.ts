import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, EXAMPLES, GenerationSchema, RecipeSchema, migrateRecipe, type Recipe } from "../lib/recipe";
import { CASTER, Simulation, type Target } from "../lib/simulation";
import { readSpells, writeSpells } from "../lib/storage";

const target = (id: number, x: number, y = CASTER.y, hp = 100): Target => ({ id, x, y, hp, radius: 8 });
const recipe = (mechanics: Partial<Recipe["mechanics"]> = {}) => RecipeSchema.parse({ mechanics: { size: 6, speed: 400, damage: 10, lifetime: 12, ...mechanics } });
function lab() { const sim = new Simulation("open-hall", 42); sim.targets = []; sim.configureEnemies({ frozen: true }); return sim; }
function run(sim: Simulation, seconds: number) { for (let i = 0; i < Math.round(seconds * 120); i++) sim.advance(1 / 120); }
function waitHit(sim: Simulation) { const hits = sim.stats.targetHits; for (let i = 0; i < 240 && sim.stats.targetHits === hits; i++) sim.advance(1 / 120); expect(sim.stats.targetHits).toBeGreaterThan(hits); }

const numericRules = [
  ["knockback", 0, 100, false], ["earthBonus", 1, 40, true], ["staggerDuration", 0.1, 1, false],
  ["weaken", 0, 1, false], ["weakenDuration", 1, 6, false], ["holyBonus", 1, 60, true],
  ["burstCount", 2, 5, true], ["burstInterval", 0.08, 1, false], ["fanCount", 2, 7, true],
  ["fanAngle", 10, 160, false], ["ringCount", 6, 16, true], ["turnRate", 15, 360, false],
  ["maxRange", 60, 700, false], ["spiralRadius", 0, 40, false], ["spiralRate", 0.5, 12, false],
  ["acceleration", -200, 400, false], ["sizeGrowth", -2, 4, false], ["gravityRadius", 20, 180, false],
  ["gravityPull", 0, 120, false], ["killChainCount", 1, 4, true], ["killChainRange", 40, 240, false],
  ["killChainDamage", 1, 50, true], ["zoneRadius", 20, 140, false], ["zoneDuration", 0.5, 8, false], ["zoneDamage", 1, 15, true],
] as const;

describe("phase C strict boundaries and migration", () => {
  it.each(numericRules)("enforces %s in schema and actual cast boundary", (key, min, max, integer) => {
    const sim = lab();
    for (const value of [min, max]) expect(RecipeSchema.safeParse({ mechanics: { [key]: value } }).success).toBe(true);
    for (const value of [min - 0.01, max + 0.01, NaN, Infinity, "2", ...(integer ? [min + 0.5] : [])]) {
      expect(RecipeSchema.safeParse({ mechanics: { [key]: value } }).success).toBe(false);
      expect(sim.cast({ mechanics: { [key]: value } }, { x: 500, y: 285 })).toBe(false);
    }
    expect(sim.projectiles).toEqual([]); expect(sim.scheduledShots).toBe(0);
  });
  it.each([["glow", 4], ["trailLength", 2], ["particleDensity", 2], ["lightIntensity", 2]] as const)("bounds cosmetic %s independently", (key, max) => {
    for (const value of [0, max]) expect(RecipeSchema.safeParse({ appearance: { [key]: value } }).success).toBe(true);
    for (const value of [-0.01, max + 0.01, NaN, Infinity]) expect(RecipeSchema.safeParse({ appearance: { [key]: value } }).success).toBe(false);
  });
  it("strictly separates visual fields, gameplay fields and enums", () => {
    for (const input of [{ mechanics: { glow: 2 } }, { appearance: { damage: 30 } }, { mechanics: { flight: "teleport" } }, { mechanics: { pattern: "infinite" } }, { appearance: { secondaryColor: "red" } }, { appearance: { meshDetail: "ultra" } }]) expect(RecipeSchema.safeParse(input).success).toBe(false);
    expect(RecipeSchema.parse({}).version).toBe(3);
  });
  it("migrates every historical version and preserves a mixed shelf through a save", () => {
    const v1 = { version: 1, kind: "orb", appearance: { color: "#123456" }, mechanics: { size: 17, speed: 91, damage: 37, lifetime: 11, wallResponse: "split", splitCount: 4, bounceLimit: 5 } };
    const v2 = { version: 2, kind: "shard", appearance: { color: "#abcdef" }, mechanics: { ...v1.mechanics, element: "poison", onHit: "pierce", poisonDamage: 7, poisonDuration: 9, pierceCount: 5, explosionDamage: 53, chainCount: 4 } };
    const spells = [v1, v2, DEFAULT_RECIPE].map((r, i) => ({ id: `id-${i}`, name: `Favorite ${i}`, recipe: r }));
    const raw = JSON.stringify(spells), migrated = readSpells(raw);
    expect(migrated.map(s => [s.id, s.name])).toEqual(spells.map(s => [s.id, s.name]));
    for (let i = 0; i < 2; i++) {
      expect(migrated[i].recipe).toMatchObject({ ...spells[i].recipe, version: 3 });
      expect(migrated[i].recipe.mechanics).toMatchObject({ flight: "straight", pattern: "single", acceleration: 0, zone: "none", gravityPull: 0, chainOnKill: false });
    }
    let saved = ""; writeSpells({ setItem: (_, value) => { saved = value; } }, migrated);
    expect(readSpells(saved)).toEqual(migrated); expect(JSON.stringify(spells)).toBe(raw);
    for (const old of [{ ...v1, mechanics: { ...v1.mechanics, flight: "arc" } }, { ...v2, mechanics: { element: "wind" } }, { ...v2, mechanics: { speed: 999 } }]) expect(() => migrateRecipe(old)).toThrow();
  });
  it.each(EXAMPLES)("validates labeled example $name as full model output", example => {
    expect(GenerationSchema.parse({ status: "ok", recipe: example.recipe, explanation: example.name })).toMatchObject({ recipe: example.recipe });
  });
});

describe("new elemental hits", () => {
  it("wind pushes away from caster, bounded and blocked by room walls", () => {
    const sim = lab(), e = sim.spawnEnemy("skeleton", { x: 700, y: 285 })!;
    sim.cast(recipe({ element: "wind", knockback: 100, speed: 640 }), e); waitHit(sim);
    expect(e.x).toBeGreaterThan(700); expect(e.x).toBeLessThanOrEqual(800 - e.radius);
    expect(e.x - 700).toBeLessThanOrEqual(100);
    const blocked = new Simulation("workshop"); blocked.targets = []; blocked.configureEnemies({ frozen: true });
    const near = blocked.spawnEnemy("skeleton", { x: 285, y: 245 })!;
    blocked.cast(recipe({ element: "wind", knockback: 100 }), near); waitHit(blocked);
    expect(near.x + near.radius).toBeLessThan(316); // West pillar begins at x=316.
  });
  it("earth is slower, adds impact damage and briefly stops movement/touches", () => {
    const sim = lab(), e = sim.spawnEnemy("skeleton", { x: 190, y: 285 })!;
    sim.cast(recipe({ element: "earth", earthBonus: 30, staggerDuration: 0.5 }), e);
    expect(sim.projectiles[0].speed).toBe(260); waitHit(sim); expect(e.hp).toBe(30);
    sim.configureEnemies({ frozen: false }); const x = e.x; run(sim, 0.25); expect(e.x).toBe(x);
    run(sim, 0.3); expect(e.x).toBeLessThan(x); expect(e.statuses?.stagger).toBeUndefined();
  });
  it("shadow amplifies other spells and status/zone damage, refreshes without stacking, then expires", () => {
    const sim = lab(), t = target(1, 175, 285, 500); sim.targets = [t];
    sim.cast(recipe({ element: "shadow", weaken: 0.5, weakenDuration: 2 }), t); waitHit(sim); expect(t.hp).toBe(490);
    sim.cast(recipe({ element: "fire", burnDamage: 4, burnDuration: 1 }), t); waitHit(sim); expect(t.hp).toBe(475);
    run(sim, 0.5); expect(t.hp).toBe(469);
    sim.cast(recipe({ element: "shadow", weaken: 0.5, weakenDuration: 1 }), t); waitHit(sim);
    expect(t.statuses?.weaken?.damage).toBe(0.5);
    run(sim, 1.1); expect(t.statuses?.weaken).toBeUndefined();
    const before = t.hp; sim.cast(recipe(), t); waitHit(sim); expect(t.hp).toBe(before - 10);
  });
  it.each(["skeleton", "wraith", "golem"] as const)("holy adds bonus only against undead: %s", type => {
    const sim = lab(), e = sim.spawnEnemy(type, { x: 175, y: 285 })!;
    sim.cast(recipe({ element: "holy", holyBonus: 30 }), e); waitHit(sim);
    expect(e.hp).toBe(e.maxHp - (type === "golem" ? 5 : 40));
    expect(sim.events.some(event => event.element === "holy" && event.targetId === e.id)).toBe(true);
  });
});

describe("casting and capacity", () => {
  it.each([["single", 1], ["fan", 7], ["ring", 16]] as const)("%s creates %i distinct directions immediately", (pattern, count) => {
    const sim = lab(); sim.cast(recipe({ pattern, fanCount: 7, ringCount: 16, fanAngle: 90 }), { x: 500, y: 285 });
    expect(sim.projectiles).toHaveLength(count);
    const angles = sim.projectiles.map(p => Math.atan2(p.vy, p.vx)); expect(new Set(angles).size).toBe(count);
    if (pattern === "fan") expect(angles.at(-1)! - angles[0]).toBeCloseTo(Math.PI / 2, 10);
    if (pattern === "ring") for (let i = 1; i < count; i++) expect(Math.atan2(Math.sin(angles[i] - angles[i - 1]), Math.cos(angles[i] - angles[i - 1]))).toBeCloseTo(Math.PI * 2 / count, 10);
  });
  it("burst schedules only its bounded count, at the requested intervals", () => {
    const sim = lab(); sim.cast(recipe({ pattern: "burst", burstCount: 5, burstInterval: 0.2, speed: 40 }), { x: 700, y: 285 });
    expect(sim.projectiles).toHaveLength(1); expect(sim.scheduledShots).toBe(4);
    run(sim, 0.2 - 1 / 120); expect(sim.projectiles).toHaveLength(1);
    run(sim, 1 / 120); expect(sim.projectiles).toHaveLength(2);
    run(sim, 0.6); expect(sim.projectiles).toHaveLength(5); expect(sim.scheduledShots).toBe(0);
  });
  it("64 cap includes burst reservations, fans, rings, splits and kill children", () => {
    const sim = lab();
    for (let i = 0; i < 12; i++) sim.cast(recipe({ pattern: "burst", burstCount: 5, speed: 40 }), { x: 700, y: 285 });
    sim.cast(recipe({ pattern: "ring", ringCount: 16 }), { x: 700, y: 285 });
    expect(sim.projectiles.length + sim.scheduledShots).toBe(64);
    expect(sim.cast(recipe(), { x: 700, y: 285 })).toBe(false);
    run(sim, 0.5); expect(sim.projectiles.length + sim.scheduledShots).toBeLessThanOrEqual(64);
    sim.reset(); expect(sim.scheduledShots).toBe(0); expect(sim.projectiles).toEqual([]);
    for (let i = 0; i < 64; i++) sim.cast(recipe({ wallResponse: "split", chainOnKill: true }), { x: 800, y: 285 });
    for (let i = 0; i < 400; i++) { sim.advance(1 / 120); expect(sim.projectiles.length + sim.scheduledShots).toBeLessThanOrEqual(64); }
  });
});

describe("flight paths and modifiers", () => {
  it.each(["straight", "arc", "homing", "spiral", "boomerang"] as const)("%s stays deterministic across frame chunks and seeded enemy input", flight => {
    const a = lab(), b = lab(), r = recipe({ flight, speed: 150, pattern: "fan", gravityPull: 20, element: "shadow", zone: "poison" });
    for (const sim of [a, b]) { sim.targets = [target(1, 350, 200)]; sim.startWaves({ mix: ["imp", "skeleton"], count: 3, interval: 2 }); sim.cast(r, { x: 650, y: 285 }); }
    run(a, 4); for (let i = 0; i < 80; i++) b.advance(0.05);
    expect(a.projectiles).toEqual(b.projectiles); expect(a.enemies).toEqual(b.enemies); expect(a.targets).toEqual(b.targets);
    expect(a.events).toEqual(b.events); expect(a.zones).toEqual(b.zones); expect(a.stats).toEqual(b.stats);
  });
  it("homing bounds every heading change by turnRate times dt and selects nearest solid target", () => {
    const sim = lab(); sim.targets = [target(9, 400, 100), target(1, 400, 470)];
    sim.cast(recipe({ flight: "homing", turnRate: 15, speed: 40 }), { x: 700, y: 285 });
    let previous = 0;
    for (let i = 0; i < 90; i++) {
      sim.advance(1 / 120); const p = sim.projectiles[0], heading = Math.atan2(p.vy, p.vx);
      expect(Math.abs(Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous)))).toBeLessThanOrEqual(15 * Math.PI / 180 / 120 + 1e-10);
      expect(p.targetId).toBe(1); previous = heading;
    }
    expect(previous).toBeGreaterThan(0);
  });
  it("arc ignores airborne targets and impacts exactly at aim on landing", () => {
    const sim = lab(); sim.targets = [target(1, 195), target(2, 295), target(3, 295, 325)];
    sim.cast(recipe({ flight: "arc", speed: 200, onHit: "explode", explosionRadius: 60, explosionDamage: 20, zone: "fire" }), { x: 295, y: 285 });
    run(sim, 0.75); expect(sim.targets.map(t => t.hp)).toEqual([100, 100, 100]); expect(sim.zones).toEqual([]);
    run(sim, 0.25); expect(sim.projectiles).toHaveLength(0); expect(sim.targets.map(t => t.hp)).toEqual([100, 90, 80]);
    expect(sim.events.find(e => e.kind === "explosion")).toMatchObject({ x: 295, y: 285 }); expect(sim.zones[0]).toMatchObject({ x: 295, y: 285 });
  });
  it.each(["disappear", "bounce", "split"] as const)("arc impacts solid props regardless of wall response %s, and expires without premature landing damage", wallResponse => {
    const sim = new Simulation(); sim.targets = [target(1, 450, 245)];
    sim.cast(recipe({ flight: "arc", wallResponse, onHit: "explode", zone: "fire" }), sim.targets[0]); run(sim, 2); expect(sim.targets[0].hp).toBe(100); expect(sim.stats.wallHits).toBe(1); expect(sim.projectiles).toEqual([]); expect(sim.stats.splits).toBe(0);
    const early = lab(); early.targets = [target(1, 700)]; early.cast(recipe({ flight: "arc", speed: 40, lifetime: 1, zone: "frost" }), early.targets[0]);
    run(early, 1); expect(early.targets[0].hp).toBe(100); expect(early.zones).toHaveLength(1); expect(early.zones[0].x).toBeCloseTo(135);
  });
  it("boomerang reaches range then returns without repeating direct damage", () => {
    const sim = lab(); sim.targets = [target(1, 175)];
    sim.cast(recipe({ flight: "boomerang", speed: 300, maxRange: 150, onHit: "pierce" }), { x: 700, y: 285 });
    run(sim, 0.5); expect(sim.projectiles[0]).toMatchObject({ returning: true }); expect(sim.projectiles[0].x).toBeCloseTo(245, 8);
    run(sim, 0.25); expect(sim.projectiles[0].x).toBeCloseTo(170, 8);
    run(sim, 0.25); expect(sim.projectiles).toEqual([]); expect(sim.targets[0].hp).toBe(90); expect(sim.stats.targetHits).toBe(1);
  });
  it("boomerang returns early at a wall and still respects lifetime", () => {
    const sim = lab(); sim.cast(recipe({ flight: "boomerang", speed: 300, maxRange: 700 }), { x: 0, y: 285 });
    run(sim, 0.75); expect(sim.projectiles).toEqual([]);
    sim.cast(recipe({ flight: "boomerang", speed: 40, lifetime: 1 }), { x: 700, y: 285 }); run(sim, 1); expect(sim.projectiles).toEqual([]);
  });
  it("spiral loops along forward travel with bounded velocity", () => {
    const sim = lab(); sim.cast(recipe({ flight: "spiral", speed: 100, spiralRadius: 40, spiralRate: 12 }), { x: 700, y: 285 });
    let backwards = false;
    for (let i = 0; i < 100; i++) { sim.advance(1 / 120); const p = sim.projectiles[0]; backwards ||= p.vx < 0; expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(640 + 1e-9); }
    expect(backwards).toBe(true);
  });
  it.each([[-200, -2, 40, 3], [400, 4, 640, 44]] as const)("clamps acceleration %s and growth %s over lifetime", (acceleration, sizeGrowth, speed, radius) => {
    const sim = lab(); sim.cast(recipe({ acceleration, sizeGrowth, wallResponse: "bounce", bounceLimit: 6, speed: 300, size: 22 }), { x: 700, y: 285 });
    // Follow the real integration for five seconds; speed/growth saturate within this interval.
    run(sim, 5); const p = sim.projectiles[0]; expect(p.speed).toBe(speed);
    expect(p.radius).toBeCloseTo(sizeGrowth < 0 ? 12 : 42, 8);
    run(sim, sizeGrowth < 0 ? 4.5 : 0.6); expect(sim.projectiles[0].radius).toBeCloseTo(radius, 8);
  });
  it("combined gravity wells obey the global pull cap and cannot cross a prop", () => {
    const sim = new Simulation("workshop"); sim.targets = []; sim.configureEnemies({ frozen: true });
    const e = sim.spawnEnemy("skeleton", { x: 285, y: 245 })!;
    for (let i = 0; i < 16; i++) sim.cast(recipe({ gravityPull: 120, gravityRadius: 180, speed: 40 }), { x: 700, y: 245 });
    const before = { x: e.x, y: e.y }; sim.advance(1 / 120);
    expect(Math.hypot(e.x - before.x, e.y - before.y)).toBeLessThanOrEqual(1 + 1e-9);
    run(sim, 2); expect(e.x + e.radius).toBeLessThan(316);
    expect(e.x).toBeLessThan(before.x);
  });
  it("kill spawns one bounded nonrecursive child aimed at a nearby living target", () => {
    const sim = lab(); sim.targets = [target(1, 175, 285, 10), target(2, 240, 285, 10), target(3, 300, 285, 100)];
    sim.cast(recipe({ chainOnKill: true, killChainCount: 1, killChainDamage: 15 }), sim.targets[0]); waitHit(sim);
    expect(sim.projectiles).toHaveLength(1); const child = sim.projectiles[0];
    expect(child).toMatchObject({ child: true, kind: "orb", damage: 15, response: "disappear", mechanics: { chainOnKill: false, onHit: "consume", zone: "none" } });
    expect(child.radius).toBeCloseTo(3.48); expect(child.life).toBeLessThanOrEqual(3);
    run(sim, 1); expect(sim.targets.map(t => t.hp)).toEqual([0, 0, 100]); expect(sim.projectiles).toEqual([]);
  });
  it("shares the kill child budget across a burst and rejects excess children", () => {
    const sim = lab(); sim.targets = [target(1, 175, 285, 10), target(2, 240, 285, 20), target(3, 320, 285, 10), target(4, 420, 285, 100)];
    sim.cast(recipe({ pattern: "burst", burstCount: 5, burstInterval: 0.3, chainOnKill: true, killChainCount: 1, killChainDamage: 1 }), sim.targets[0]);
    const childIds = new Set<number>();
    for (let i = 0; i < 240; i++) { sim.advance(1 / 120); for (const p of sim.projectiles) if (p.child) childIds.add(p.id); }
    expect(childIds.size).toBe(1); expect(sim.targets.filter(t => t.hp === 0).length).toBeGreaterThan(1);
  });
  it("cosmetics cannot alter gameplay", () => {
    const a = lab(), b = lab(), base = recipe({ flight: "spiral", element: "fire", zone: "frost" });
    a.targets = [target(1, 300)]; b.targets = [target(1, 300)];
    a.cast(base, { x: 700, y: 285 }); b.cast({ ...base, appearance: { color: "#000000", secondaryColor: "#ffffff", glow: 4, lightIntensity: 0, particleDensity: 2, trailLength: 2, meshDetail: "high" } }, { x: 700, y: 285 });
    run(a, 1); run(b, 1);
    expect(a.targets.map(t => t.hp)).toEqual(b.targets.map(t => t.hp)); expect(a.stats).toEqual(b.stats);
    expect(a.projectiles.map(p => [p.x, p.y, p.vx, p.vy])).toEqual(b.projectiles.map(p => [p.x, p.y, p.vx, p.vy]));
  });
});

describe("lingering zones and falloff", () => {
  it.each(["fire", "frost", "poison"] as const)("%s zone ticks at 0.5 seconds, includes final tick, then expires", zone => {
    const sim = lab(); sim.targets = [target(1, 175), target(2, 161, 335), target(3, 161, 335.01)];
    sim.cast(recipe({ zone, zoneRadius: 50, zoneDuration: 1, zoneDamage: 7 }), sim.targets[0]); waitHit(sim);
    expect(sim.zones).toHaveLength(1); expect(sim.targets.map(t => t.hp)).toEqual([90, 100, 100]);
    run(sim, 0.5 - 1 / 120); expect(sim.targets[1].hp).toBe(100);
    run(sim, 1 / 120); expect(sim.targets.map(t => t.hp)).toEqual([83, 93, 100]);
    if (zone === "frost") expect(sim.targets[1].statuses?.chill).toBeDefined();
    run(sim, 0.5); expect(sim.targets.map(t => t.hp)).toEqual([76, 86, 100]); expect(sim.zones).toEqual([]);
    run(sim, 1); expect(sim.targets[1].hp).toBe(86);
  });
  it("zone ticks honor weaken, resistance and phase immunity without reapplying elemental hits", () => {
    const sim = lab(), golem = sim.spawnEnemy("golem", { x: 190, y: 350 })!, wraith = sim.spawnEnemy("wraith", { x: 250, y: 350 })!;
    golem.statuses = { weaken: { remaining: 5, nextTick: Infinity, damage: 1, color: "#ffffff" } };
    sim.targets = [target(1, 200)]; sim.cast(recipe({ zone: "poison", zoneRadius: 140, zoneDuration: 2, zoneDamage: 10 }), sim.targets[0]); waitHit(sim);
    run(sim, 0.5); expect(golem.hp).toBe(390); expect(wraith.hp).toBe(50); expect(wraith.statuses?.poison).toBeUndefined();
    run(sim, 0.5); expect(golem.hp).toBe(380); expect(wraith.hp).toBe(50);
  });
  it("expiry creates one capped zone and reset clears all zones", () => {
    const sim = lab();
    for (let i = 0; i < 64; i++) sim.cast(recipe({ zone: "fire", lifetime: 1, speed: 40 }), { x: 700, y: 285 });
    run(sim, 1); expect(sim.zones).toHaveLength(64);
    sim.cast(recipe({ zone: "fire", lifetime: 1, speed: 40 }), { x: 700, y: 285 }); run(sim, 1); expect(sim.zones).toHaveLength(64);
    sim.reset(); expect(sim.zones).toEqual([]);
  });
  it.each(["flat", "linear"] as const)("%s explosion applies center-distance falloff without double hits", explosionFalloff => {
    const sim = lab(); sim.targets = [target(1, 175), target(2, 161, 335), target(3, 161, 385)];
    sim.cast(recipe({ onHit: "explode", explosionRadius: 100, explosionDamage: 40, explosionFalloff }), sim.targets[0]); waitHit(sim);
    expect(sim.targets.map(t => t.hp)).toEqual(explosionFalloff === "flat" ? [90, 60, 60] : [90, 80, 100]);
  });
});
