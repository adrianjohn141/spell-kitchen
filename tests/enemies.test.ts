import { describe, expect, it } from "vitest";
import { LIMITS, RecipeSchema, type Recipe } from "../lib/recipe";
import { DEFAULT_SPAWN_SETTINGS, ENEMY_STATS, EnemyTypeSchema, SpawnSettingsSchema } from "../lib/settings";
import { CASTER, ROOM, Simulation, type Enemy } from "../lib/simulation";

function run(sim: Simulation, seconds: number, chunk = 1 / 120) { for (let i = 0; i < Math.round(seconds / chunk); i++) sim.advance(chunk); }
function setup(type: Enemy["type"] = "skeleton", frozen = true) {
  const sim = new Simulation("open-hall", 42); sim.targets = []; sim.configureEnemies({ frozen });
  const enemy = sim.spawnEnemy(type, { x: 210, y: CASTER.y })!;
  expect(enemy).toBeTruthy(); return { sim, enemy };
}
function fire(sim: Simulation, mechanics: Partial<Recipe["mechanics"]> = {}) {
  sim.cast(RecipeSchema.parse({ mechanics: { size: 6, speed: 640, damage: 10, ...mechanics } }), { x: ROOM.width, y: CASTER.y }); run(sim, 0.2);
}
function contained(sim: Simulation) {
  for (const e of sim.enemies) {
    expect(e.x).toBeGreaterThanOrEqual(e.radius); expect(e.x).toBeLessThanOrEqual(ROOM.width - e.radius);
    expect(e.y).toBeGreaterThanOrEqual(e.radius); expect(e.y).toBeLessThanOrEqual(ROOM.height - e.radius);
    for (const o of sim.obstacles) {
      const dx = Math.max(0, Math.abs(e.x - o.x) - o.halfWidth), dy = Math.max(0, Math.abs(e.y - o.y) - o.halfHeight);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(e.radius - 1e-6);
    }
  }
}

describe("enemy movement and runtime boundaries", () => {
  it("imp zig-zags while skeleton follows a straight unobstructed route", () => {
    const a = setup("imp", false), b = setup("skeleton", false);
    run(a.sim, 0.3); run(b.sim, 0.3);
    expect(Math.abs(a.enemy.y - CASTER.y)).toBeGreaterThan(1); expect(b.enemy.y).toBe(CASTER.y);
  });
  it.each(EnemyTypeSchema.options)("spawns %s safely at every door at both difficulty bounds", type => {
    for (const door of ["north", "east", "south", "west"] as const) for (const difficulty of [0.5, 3]) {
      const sim = new Simulation(); expect(sim.spawnEnemy(type, door, difficulty)).toBeTruthy(); contained(sim);
    }
  });
  it("repeats seeded movement, waves, and inputs across frame chunking; different seeds vary", () => {
    const create = (seed: number) => { const s = new Simulation("workshop", seed); s.startWaves({ mix: ["imp"], count: 3, interval: 2 }); return s; };
    const a = create(17), b = create(17), c = create(18); run(a, 6); run(b, 6, 1 / 60); run(c, 6);
    expect(a.enemies).toEqual(b.enemies); expect(a.stats).toEqual(b.stats); expect(a.wave).toEqual(b.wave);
    expect(a.enemies).not.toEqual(c.enemies); expect(() => new Simulation("workshop", NaN)).toThrow();
    a.reset(); const fresh = create(17); a.startWaves({ mix: ["imp"], count: 3, interval: 2 });
    expect(a.enemies).toEqual(fresh.enemies);
  });
  it.each(EnemyTypeSchema.options)("%s routes around pillars, never overlaps solids, reaches caster, then stops", type => {
    const sim = new Simulation("workshop", 5); sim.targets = [];
    const enemy = sim.spawnEnemy(type, { x: 620, y: 245 }, 3)!; expect(enemy).toBeTruthy();
    expect(enemy.path.length).toBeGreaterThan(1);
    for (let i = 0; i < 2400; i++) { sim.advance(1 / 60); contained(sim); }
    expect(sim.stats.casterHits).toBeGreaterThan(0); expect(Math.hypot(enemy.x - CASTER.x, enemy.y - CASTER.y)).toBeLessThanOrEqual(enemy.radius + 18.001);
    const position = { x: enemy.x, y: enemy.y }; run(sim, 2); expect({ x: enemy.x, y: enemy.y }).toEqual(position);
    expect(sim.drainEvents().some(e => e.kind === "caster")).toBe(true);
  });
  it("rejects invalid placement, settings, difficulty, type, and excess enemies at runtime", () => {
    const sim = new Simulation();
    expect(sim.spawnEnemy("dragon")).toBeNull(); expect(sim.spawnEnemy("imp", "north", 4)).toBeNull();
    expect(sim.spawnEnemy("slime", { x: 340, y: 245 })).toBeNull(); expect(sim.spawnEnemy("slime", { x: 2, y: 300 })).toBeNull();
    expect(sim.spawnEnemy("imp", { x: NaN, y: 300 })).toBeNull(); expect(sim.configureEnemies({ count: 13 })).toBe(false);
    for (let i = 0; i < 24; i++) expect(sim.spawnEnemy("imp", { x: 200 + i % 8 * 65, y: 420 + Math.floor(i / 8) * 60 })).toBeTruthy();
    expect(sim.enemies).toHaveLength(LIMITS.enemies); expect(sim.spawnEnemy("slime", "east")).toBeNull(); contained(sim);
  });
  it("freezes movement and touching without freezing statuses or the wraith phase", () => {
    const { sim, enemy } = setup("wraith"); fire(sim, { element: "fire" }); const x = enemy.x;
    run(sim, 2); expect(enemy.x).toBe(x); expect(enemy.hp).toBeLessThan(50); expect(sim.stats.casterHits).toBe(0);
    sim.configureEnemies({ frozen: false }); run(sim, 0.5); expect(enemy.x).toBeLessThan(x);
  });
});

describe("shared enemy spell mechanics", () => {
  it.each(["fire", "poison"] as const)("%s damages and refreshes enemies without stacking", element => {
    const { sim, enemy } = setup("slime"); fire(sim, { element }); fire(sim, { element });
    expect(Object.keys(enemy.statuses!)).toEqual([element === "fire" ? "burn" : "poison"]);
    const hp = enemy.hp; run(sim, 1); expect(enemy.hp).toBeLessThan(hp);
  });
  it("chill halves movement and repeated frost gets the existing vulnerability bonus", () => {
    const { sim, enemy } = setup(); fire(sim, { element: "frost" }); fire(sim, { element: "frost" }); expect(enemy.hp).toBe(40);
    sim.configureEnemies({ frozen: false }); const x = enemy.x; run(sim, 0.5); expect(x - enemy.x).toBeCloseTo(ENEMY_STATS.skeleton.speed * 0.5 * 0.5, 5);
  });
  it("lightning chains from a target through enemies and back to a target, with unique IDs", () => {
    const { sim, enemy } = setup(); sim.targets = [{ id: 1, x: 155, y: CASTER.y, hp: 100, radius: 8 }, { id: 2, x: 270, y: CASTER.y, hp: 100, radius: 8 }];
    fire(sim, { element: "lightning", chainCount: 2, chainRange: 70 });
    expect(sim.targets.map(t => t.hp)).toEqual([90, 96]); expect(enemy.hp).toBe(64);
    expect(sim.events.filter(e => e.kind === "chain").map(e => e.targetId)).toEqual([enemy.id, 2]);
  });
  it("pierces enemies then targets; explosion splashes enemies once and applies statuses", () => {
    const { sim, enemy } = setup(); sim.targets = [{ id: 1, x: 270, y: CASTER.y, hp: 100, radius: 8 }];
    fire(sim, { onHit: "pierce", pierceCount: 2 }); run(sim, 0.2); expect(enemy.hp).toBe(60); expect(sim.targets[0].hp).toBe(90);
    const nearby = sim.spawnEnemy("slime", { x: 250, y: 330 })!;
    fire(sim, { onHit: "explode", element: "poison", explosionRadius: 100, explosionDamage: 23 });
    expect(enemy.hp).toBe(50); expect(nearby.hp).toBe(97); expect(nearby.statuses?.poison).toBeDefined();
  });
  it("golem halves direct, chain and status damage; explosion splash bypasses resistance", () => {
    const { sim, enemy } = setup("golem"); fire(sim, { element: "fire", burnDamage: 4 }); expect(enemy.hp).toBe(395);
    run(sim, 0.5); expect(enemy.hp).toBe(393);
    sim.targets = [{ id: 1, x: 155, y: CASTER.y, hp: 100, radius: 8 }]; fire(sim, { onHit: "explode", explosionDamage: 25, explosionRadius: 100 }); expect(enemy.hp).toBe(368);
  });
  it("wraith alternates each second; direct projectiles, chains, splash and status ticks respect immunity", () => {
    const { sim, enemy } = setup("wraith"); fire(sim, { element: "fire" }); run(sim, 0.8); expect(enemy.phased).toBe(true);
    const hp = enemy.hp; fire(sim, { element: "lightning", onHit: "explode" }); expect(enemy.hp).toBe(hp); expect(sim.projectiles.length).toBe(1);
    run(sim, 0.8); expect(enemy.phased).toBe(false); fire(sim); expect(enemy.hp).toBeLessThan(hp);
  });
  it("phased wraith is excluded from chain and splash candidates, with no status application", () => {
    const { sim, enemy } = setup("wraith"); run(sim, 1);
    sim.targets = [{ id: 1, x: 155, y: CASTER.y, radius: 8, hp: 100 }];
    fire(sim, { element: "lightning", chainCount: 4, chainRange: 240 }); expect(enemy.hp).toBe(60);
    fire(sim, { element: "poison", onHit: "explode", explosionRadius: 140 }); expect(enemy.hp).toBe(60); expect(enemy.statuses).toBeUndefined();
    expect(sim.events.filter(e => e.targetId === enemy.id)).toEqual([]);
  });
  it("slime splits twice, children never split, and splits cannot exceed the living cap", () => {
    const { sim, enemy } = setup("slime"); fire(sim, { damage: 100 }); fire(sim, { damage: 100 });
    expect(enemy.hp).toBe(0); expect(sim.stats.kills).toBe(1); expect(sim.enemies).toHaveLength(2);
    expect(sim.enemies.every(e => e.small && e.radius === 11 && e.maxHp === 42)).toBe(true);
    fire(sim, { damage: 100, onHit: "explode", explosionDamage: 60 }); expect(sim.enemies).toHaveLength(0); expect(sim.stats.kills).toBe(3);
    const full = setup("slime");
    for (let i = 0; i < 23; i++) full.sim.spawnEnemy("imp", { x: 300 + i % 8 * 55, y: 390 + Math.floor(i / 8) * 60 });
    expect(full.sim.enemies).toHaveLength(24); fire(full.sim, { damage: 100 }); fire(full.sim, { damage: 100 });
    expect(full.sim.enemies).toHaveLength(24); expect(full.sim.enemies.filter(e => e.small)).toHaveLength(1);
  });
});

describe("wave scheduling and spawn settings", () => {
  it("schedules immediate and interval waves; stop, one-wave mode, clear, and reset stop spawning", () => {
    const sim = new Simulation(); expect(sim.startWaves({ count: 2, interval: 2, mix: ["golem"], frozen: true })).toBe(true);
    expect(sim.wave.number).toBe(1); expect(sim.enemies).toHaveLength(2); run(sim, 2 - 1 / 120); expect(sim.wave.number).toBe(1);
    sim.advance(1 / 120); expect(sim.wave.number).toBe(2); expect(sim.enemies).toHaveLength(4);
    sim.stopWaves(); run(sim, 3); expect(sim.wave.number).toBe(2);
    sim.clearEnemies(); expect(sim.enemies).toEqual([]); expect(sim.wave.running).toBe(false);
    sim.startWaves({ count: 1, keepSpawning: false }); run(sim, 10); expect(sim.wave.running).toBe(false); expect(sim.wave.number).toBe(3);
    sim.reset(); expect(sim.enemies).toEqual([]); expect(sim.wave.number).toBe(0); expect(sim.stats.kills).toBe(0);
  });
  it("turning off Keep spawning stops future waves immediately; edits do not auto-start waves", () => {
    const sim = new Simulation(); sim.startWaves({ count: 1, interval: 2 });
    sim.configureEnemies({ keepSpawning: false }); run(sim, 4); expect(sim.wave.number).toBe(1); expect(sim.wave.running).toBe(false);
    sim.configureEnemies({ keepSpawning: true }); run(sim, 4); expect(sim.wave.number).toBe(1);
  });
  it.each([0, 13, NaN, Infinity])("rejects count %s, runtime and schema", count => {
    expect(SpawnSettingsSchema.safeParse({ count }).success).toBe(false); expect(new Simulation().startWaves({ count })).toBe(false);
  });
  it("bounds interval, difficulty and mix; scales only HP/speed; defaults stay explicit", () => {
    for (const input of [{ interval: 1 }, { interval: 31 }, { difficulty: 0.4 }, { difficulty: 3.1 }, { mix: [] }, { mix: ["slime", "slime"] }]) {
      expect(SpawnSettingsSchema.safeParse(input).success).toBe(false); expect(new Simulation().configureEnemies(input)).toBe(false);
    }
    expect(SpawnSettingsSchema.parse({})).toEqual(DEFAULT_SPAWN_SETTINGS);
    const sim = new Simulation(); const e = sim.spawnEnemy("golem", "north", 3)!;
    expect(e).toMatchObject({ hp: 1200, speed: 54, radius: 26 });
    sim.startWaves({ count: 12, interval: 2, frozen: true }); run(sim, 12); expect(sim.enemies.length).toBeLessThanOrEqual(24);
  });
});
