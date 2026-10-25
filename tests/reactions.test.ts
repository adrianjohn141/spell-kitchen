import { describe, expect, it } from "vitest";
import { RecipeSchema, type Recipe } from "../lib/recipe";
import { DEFAULT_SPAWN_SETTINGS } from "../lib/settings";
import { REACTIONS, Simulation, TICK, reactionFor, type Status, type Target } from "../lib/simulation";

const status = (damage = 0): Status => ({ remaining: 3, damage, color: "#ffffff", nextTick: Infinity });
function spell(mechanics: Partial<Recipe["mechanics"]>) { return RecipeSchema.parse({ mechanics: { speed: 640, lifetime: 12, ...mechanics } }); }
function setup() {
  const sim = new Simulation("open-hall");
  sim.configureEnemies({ ...DEFAULT_SPAWN_SETTINGS, frozen: true });
  return sim;
}
function castUntilHit(sim: Simulation, recipe: Recipe, target: Target) {
  sim.cast(recipe, { x: target.x, y: target.y });
  for (let i = 0; i < 600 && sim.projectiles.length + sim.scheduledShots > 0; i++) sim.advance(TICK);
}

describe("element reactions", () => {
  it("maps element and existing status to a reaction", () => {
    expect(reactionFor("fire", { chill: status() })).toBe("steam");
    expect(reactionFor("frost", { burn: status() })).toBe("steam");
    expect(reactionFor("fire", { poison: status() })).toBe("toxic");
    expect(reactionFor("lightning", { chill: status() })).toBe("shatter");
    expect(reactionFor("lightning", { poison: status() })).toBe("conduct");
    expect(reactionFor("holy", { weaken: status() })).toBe("eclipse");
    expect(reactionFor("fire", {})).toBeNull(); expect(reactionFor("arcane", { chill: status() })).toBeNull(); expect(reactionFor("fire", undefined)).toBeNull();
  });
  it("Shatter adds bonus damage and consumes the chill", () => {
    const sim = setup(), target = sim.targets[0]; target.statuses = { chill: status() };
    castUntilHit(sim, spell({ element: "lightning", damage: 25 }), target);
    expect(sim.combat.reactions).toEqual({ shatter: 1 });
    expect(target.hp).toBe(100 - 25 - REACTIONS.shatter.bonus);
    expect(target.statuses?.chill).toBeUndefined();
  });
  it("Eclipse adds bonus damage and removes weaken", () => {
    const sim = setup(), target = sim.targets[0]; target.statuses = { weaken: { ...status(0.25) } };
    castUntilHit(sim, spell({ element: "holy", damage: 10 }), target);
    expect(sim.combat.reactions.eclipse).toBe(1);
    expect(target.hp).toBe(100 - Math.round((10 + REACTIONS.eclipse.bonus) * 1.25));
    expect(target.statuses?.weaken).toBeUndefined();
  });
  it("Steam damages and blinds nearby enemies, and removes chill without applying burn", () => {
    const sim = setup(), target = sim.targets[0]; target.statuses = { chill: status() };
    const near = sim.spawnEnemy("golem", { x: target.x + 50, y: target.y + 10 })!;
    const far = sim.spawnEnemy("golem", { x: target.x + 200, y: target.y + 60 })!;
    castUntilHit(sim, spell({ element: "fire", damage: 10 }), target);
    expect(sim.combat.reactions.steam).toBe(1);
    expect(target.statuses?.chill).toBeUndefined(); expect(target.statuses?.burn).toBeUndefined();
    expect(near.hp).toBeLessThan(near.maxHp); expect(near.statuses?.stagger).toBeDefined();
    expect(far.hp).toBe(far.maxHp);
  });
  it("Toxic flare spreads the target's poison to nearby enemies", () => {
    const sim = setup(), target = sim.targets[0]; target.statuses = { poison: { remaining: 5, damage: 3, color: "#9cde79", nextTick: 1 } };
    const near = sim.spawnEnemy("golem", { x: target.x + 50, y: target.y + 10 })!;
    castUntilHit(sim, spell({ element: "fire", damage: 10 }), target);
    expect(sim.combat.reactions.toxic).toBe(1);
    expect(near.statuses?.poison?.damage).toBe(3);
    expect(target.statuses?.burn).toBeDefined();
  });
  it("Conduct grants exactly one extra chain jump per cast", () => {
    const hits = (poisoned: boolean) => {
      const sim = setup(), target = sim.targets[0];
      if (poisoned) target.statuses = { poison: { remaining: 5, damage: 1, color: "#9cde79", nextTick: 5 } };
      const enemies = [sim.spawnEnemy("golem", { x: target.x + 60, y: target.y + 40 })!, sim.spawnEnemy("golem", { x: target.x + 130, y: target.y + 80 })!];
      castUntilHit(sim, spell({ element: "lightning", chainCount: 1, chainRange: 120, damage: 20 }), target);
      return enemies.filter(e => e.hp < e.maxHp).length;
    };
    expect(hits(false)).toBe(1);
    expect(hits(true)).toBe(2);
  });
  it("stays deterministic and resets reaction counts", () => {
    const run = () => {
      const sim = setup(), target = sim.targets[0]; target.statuses = { chill: status() };
      sim.spawnEnemy("golem", { x: target.x + 50, y: target.y + 10 });
      castUntilHit(sim, spell({ element: "fire" }), target);
      return { hp: [...sim.targets, ...sim.enemies].map(t => t.hp), combat: sim.combat };
    };
    expect(run()).toEqual(run());
    const sim = setup(); sim.combat.reactions.steam = 3; sim.reset(); expect(sim.combat.reactions).toEqual({});
  });
});
