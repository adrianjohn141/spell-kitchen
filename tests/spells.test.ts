import { describe, expect, it } from "vitest";
import { RecipeSchema, type Recipe } from "../lib/recipe";
import { CASTER, ROOM, Simulation, type Target } from "../lib/simulation";

const target = (id: number, x = 175, y = CASTER.y, hp = 100): Target => ({ id, x, y, hp, radius: 8 });
function setup(mechanics: Partial<Recipe["mechanics"]> = {}, kind: Recipe["kind"] = "orb", targets = [target(1)]) {
  const sim = new Simulation("open-hall"); sim.targets = targets;
  const recipe = RecipeSchema.parse({ kind, mechanics: { size: 6, speed: 400, damage: 10, lifetime: 12, ...mechanics } });
  return { sim, recipe, cast: () => sim.cast(recipe, { x: ROOM.width, y: CASTER.y }) };
}
function run(sim: Simulation, seconds: number) { for (let i = 0; i < Math.round(seconds * 120); i++) sim.advance(1 / 120); }
function hit(sim: Simulation) {
  const before = sim.stats.targetHits;
  for (let i = 0; i < 120 && sim.stats.targetHits === before; i++) sim.advance(1 / 120);
  expect(sim.stats.targetHits).toBeGreaterThan(before);
}

describe("element gameplay", () => {
  it("arcane deals direct damage without applying status", () => {
    const { sim, cast } = setup(); cast(); hit(sim); run(sim, 8);
    expect(sim.targets[0].hp).toBe(90); expect(sim.targets[0].statuses).toEqual({});
  });
  it.each(["fire", "poison"] as const)("%s ticks at its own cadence and expires", element => {
    const { sim, cast } = setup({ element }); cast(); hit(sim); sim.drainEvents();
    const interval = element === "fire" ? 0.5 : 1, duration = element === "fire" ? 3 : 6, damage = element === "fire" ? 4 : 3;
    run(sim, interval - 1 / 120); expect(sim.targets[0].hp).toBe(90);
    run(sim, 1 / 120); expect(sim.targets[0].hp).toBe(90 - damage);
    run(sim, duration - interval);
    expect(sim.targets[0].hp).toBe(90 - duration / interval * damage);
    expect(sim.targets[0].statuses).toEqual({});
    const ticks = sim.drainEvents().filter(e => e.kind === "dot");
    expect(ticks).toHaveLength(duration / interval); expect(ticks.every(e => e.damage === damage && e.element === element)).toBe(true);
    run(sim, 3); expect(sim.drainEvents()).toEqual([]);
  });
  it.each(["fire", "poison"] as const)("%s refreshes one status without stacking or postponing its tick", element => {
    const { sim, cast } = setup({ element }); cast(); hit(sim); run(sim, 0.25); cast(); hit(sim);
    const status = sim.targets[0].statuses![element === "fire" ? "burn" : "poison"]!;
    expect(Object.keys(sim.targets[0].statuses!)).toHaveLength(1);
    expect(status.remaining).toBe(element === "fire" ? 3 : 6);
    expect(status.damage).toBe(element === "fire" ? 4 : 3);
    expect(status.nextTick).toBeLessThan(element === "fire" ? 0.5 : 1);
    sim.drainEvents(); run(sim, 0.5);
    expect(sim.drainEvents().filter(e => e.kind === "dot").every(e => e.damage === (element === "fire" ? 4 : 3))).toBe(true);
  });
  it("frost adds bounded damage only while chill remains active", () => {
    const { sim, cast } = setup({ element: "frost", chillDuration: 1, frostBonus: 30 });
    cast(); hit(sim); expect(sim.targets[0].hp).toBe(90);
    cast(); hit(sim); expect(sim.targets[0].hp).toBe(50);
    expect(sim.targets[0].statuses!.chill!.remaining).toBe(1);
    run(sim, 1); expect(sim.targets[0].statuses!.chill).toBeUndefined();
    cast(); hit(sim); expect(sim.targets[0].hp).toBe(40);
  });
  it("burn and poison coexist; death and reset clear every status", () => {
    const { sim, cast } = setup({ element: "fire" }); cast(); hit(sim);
    sim.cast(RecipeSchema.parse({ kind: "bolt", mechanics: { element: "poison", damage: 1 } }), sim.targets[0]); hit(sim);
    expect(Object.keys(sim.targets[0].statuses!)).toEqual(["burn", "poison"]);
    sim.targets[0].hp = 1; run(sim, 1);
    expect(sim.targets[0].hp).toBe(0); expect(sim.targets[0].statuses).toEqual({});
    sim.reset(); expect(sim.targets.every(t => !t.statuses || !Object.keys(t.statuses).length)).toBe(true);
    expect(sim.events).toEqual([]); expect(sim.projectiles).toEqual([]);
  });
});

describe("chain lightning", () => {
  it("chooses nearest living targets within range, with reduced damage and bounded hops", () => {
    const targets = [target(1), target(2, 220, 325), target(3, 275, 325), target(4, 180, 290, 0), target(5, 440, 20)];
    const { sim, cast } = setup({ element: "lightning", damage: 30, chainCount: 2, chainRange: 70 }, "bolt", targets);
    cast(); run(sim, 1);
    expect(targets.map(t => t.hp)).toEqual([70, 82, 89, 0, 100]);
    expect(sim.events.filter(e => e.kind === "chain").map(e => e.targetId)).toEqual([2, 3]);
    expect(sim.stats.targetHits).toBe(3);
  });
  it("breaks equal-distance ties by id regardless of array order", () => {
    const { sim, cast } = setup({ element: "lightning", chainCount: 1, chainRange: 80 }, "orb", [target(1), target(9, 215, 315), target(2, 215, 255)]);
    cast(); run(sim, 1);
    expect(sim.events.find(e => e.kind === "chain")?.targetId).toBe(2);
  });
  it("never repeats a target and shares chain budget across pierce hits", () => {
    const targets = Array.from({ length: 5 }, (_, i) => target(i + 1, 175 + i * 50));
    const { sim, cast } = setup({ element: "lightning", onHit: "pierce", pierceCount: 5, chainCount: 1, chainRange: 60 }, "bolt", targets);
    cast(); run(sim, 1);
    const events = sim.events.filter(e => e.targetId);
    expect(events.map(e => e.targetId)).toEqual([1, 2, 3, 4, 5]);
    expect(events.filter(e => e.kind === "chain")).toHaveLength(1);
    expect(targets.map(t => t.hp)).toEqual([90, 94, 90, 90, 90]);
  });
  it("can chain from a killed target, but never selects a dead or out-of-range target", () => {
    const targets = [target(1, 175, CASTER.y, 1), target(2, 180, 300, 0), target(3, 200, 330), target(4, 450, 330)];
    const { sim, cast } = setup({ element: "lightning", chainRange: 60, chainCount: 4 }, "orb", targets);
    cast(); run(sim, 1);
    expect(targets.map(t => t.hp)).toEqual([0, 0, 94, 100]);
  });
  it("shares hit history and the chain budget across split siblings", () => {
    const { sim, cast } = setup({ element: "lightning", wallResponse: "split", chainCount: 2 }, "orb", []);
    cast();
    for (let i = 0; i < 300 && sim.stats.splits === 0; i++) sim.advance(1 / 120);
    expect(sim.projectiles).toHaveLength(3);
    const child = sim.projectiles[0];
    sim.targets = [target(1, child.x, child.y), target(2, child.x - 40, child.y + 50), target(3, child.x - 40, child.y - 50)];
    sim.drainEvents(); run(sim, 0.5);
    const hits = sim.events.filter(e => e.targetId);
    expect(new Set(hits.map(e => e.targetId)).size).toBe(hits.length);
    expect(hits).toHaveLength(3); expect(hits.filter(e => e.kind === "chain")).toHaveLength(2);
  });
});

describe("on-hit behavior", () => {
  it("pierces only its target budget with no repeated hit after bounce", () => {
    const targets = [target(1), target(2, 245), target(3, 315)];
    const { sim, cast } = setup({ onHit: "pierce", pierceCount: 3 }, "shard", targets);
    cast(); run(sim, 1); expect(targets.map(t => t.hp)).toEqual([90, 90, 90]); expect(sim.projectiles).toHaveLength(0);
    const other = setup({ onHit: "pierce", pierceCount: 5, wallResponse: "bounce" }, "orb", [target(1)]);
    other.cast(); run(other.sim, 3); expect(other.sim.targets[0].hp).toBe(90); expect(other.sim.stats.targetHits).toBe(1);
  });
  it("explodes within the radius, applies element, and never double damages the direct target", () => {
    // Impact center is (161,285): target 2 is exactly 50 away; target 3 is just outside.
    const targets = [target(1), target(2, 161, 335), target(3, 161, 335.01)];
    const { sim, cast } = setup({ element: "fire", onHit: "explode", explosionRadius: 50, explosionDamage: 23 }, "orb", targets);
    cast(); hit(sim);
    expect(targets.map(t => t.hp)).toEqual([90, 77, 100]);
    expect(targets[1].statuses!.burn).toBeDefined(); expect(targets[2].statuses).toBeUndefined();
    expect(sim.events.filter(e => e.kind === "explosion")).toHaveLength(1); expect(sim.projectiles).toHaveLength(0);
  });
  it.each(["disappear", "bounce", "split"] as const)("only explodes on disappear walls (%s)", wallResponse => {
    const { sim, cast } = setup({ onHit: "explode", wallResponse, explosionRadius: 60 }, "orb", [target(1, ROOM.width - 15, CASTER.y + 45)]);
    cast(); run(sim, 2);
    expect(sim.events.filter(e => e.kind === "explosion")).toHaveLength(wallResponse === "disappear" ? 1 : 0);
    expect(sim.targets[0].hp).toBe(wallResponse === "disappear" ? 75 : 100);
  });
  it("split children retain element, consume on hits, and cannot split again", () => {
    const { sim, cast } = setup({ element: "poison", wallResponse: "split", onHit: "explode" }, "shard", []);
    cast(); run(sim, 2);
    expect(sim.projectiles).toHaveLength(3);
    for (const p of sim.projectiles) {
      expect(p.child).toBe(true); expect(p.kind).toBe("shard"); expect(p.mechanics.element).toBe("poison");
      expect(p.mechanics.onHit).toBe("consume"); expect(p.response).toBe("disappear");
    }
    const child = sim.projectiles[0]; sim.targets = [target(9, child.x, child.y)];
    run(sim, 1 / 120); expect(sim.targets[0].statuses!.poison).toBeDefined();
    expect(sim.projectiles.some(p => p.id === child.id)).toBe(false);
    run(sim, 12); expect(sim.projectiles).toHaveLength(0); expect(sim.stats.splits).toBe(1);
    expect(sim.events.filter(e => e.kind === "explosion")).toHaveLength(0);
  });
});

describe("deterministic styles and runtime limits", () => {
  it("wisp follows a bounded sideways sine path with identical results across frame chunks", () => {
    const a = setup({}, "wisp", []), b = setup({}, "wisp", []); a.cast(); b.cast();
    run(a.sim, 0.5); b.sim.advance(0.25); b.sim.advance(0.25);
    expect(a.sim.projectiles).toEqual(b.sim.projectiles);
    expect(a.sim.projectiles[0].x).toBeCloseTo(CASTER.x + 200, 8);
    expect(a.sim.projectiles[0].y).toBeCloseTo(CASTER.y + 8 * Math.sin(3), 8);
  });
  it("sweeps drifting wisps through tiny targets without tunneling", () => {
    const { sim, cast } = setup({ size: 6, speed: 640 }, "wisp", [{ ...target(1, 175, CASTER.y + 8 * Math.sin(0.125 * 6)), radius: 1 }]);
    cast(); sim.advance(0.25); expect(sim.targets[0].hp).toBe(90); expect(sim.stats.targetHits).toBe(1);
  });
  it("keeps wisp circles in the room through drift, corner bounce and split", () => {
    for (const wallResponse of ["disappear", "bounce", "split"] as const) for (const aim of [{ x: 0, y: 0 }, { x: ROOM.width, y: ROOM.height }, { x: ROOM.width, y: 0 }, { x: 0, y: ROOM.height }]) {
      const { sim, recipe } = setup({ wallResponse, speed: 640, size: 22 }, "wisp", []);
      sim.cast(recipe, aim);
      for (let i = 0; i < 1440; i++) {
        sim.advance(1 / 120);
        for (const p of sim.projectiles) {
          expect(p.x).toBeGreaterThanOrEqual(p.radius - 1e-6); expect(p.x).toBeLessThanOrEqual(ROOM.width - p.radius + 1e-6);
          expect(p.y).toBeGreaterThanOrEqual(p.radius - 1e-6); expect(p.y).toBeLessThanOrEqual(ROOM.height - p.radius + 1e-6);
        }
      }
    }
  });
  it("rejects out-of-bounds effects at the real cast boundary", () => {
    const sim = new Simulation("open-hall");
    for (const mechanics of [{ burnDamage: 13 }, { poisonDuration: 11 }, { frostBonus: 31 }, { chainCount: 5 }, { chainRange: 241 }, { pierceCount: 6 }, { explosionRadius: 141 }, { explosionDamage: 61 }]) {
      expect(sim.cast({ mechanics }, { x: ROOM.width, y: 285 })).toBe(false);
    }
    expect(sim.projectiles).toEqual([]);
  });
  it("combines statuses, splits and drift deterministically including events", () => {
    const a = setup({ element: "fire", wallResponse: "split", onHit: "pierce" }, "wisp");
    const b = setup({ element: "fire", wallResponse: "split", onHit: "pierce" }, "wisp");
    a.cast(); b.cast(); run(a.sim, 5); for (let i = 0; i < 100; i++) b.sim.advance(0.05);
    expect(a.sim.targets).toEqual(b.sim.targets); expect(a.sim.projectiles).toEqual(b.sim.projectiles);
    expect(a.sim.events).toEqual(b.sim.events); expect(a.sim.stats).toEqual(b.sim.stats);
  });
});
