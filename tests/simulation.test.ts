import { describe, expect, it } from "vitest";
import { EXAMPLE_RECIPE, LIMITS, RecipeSchema, type Recipe } from "../lib/recipe";
import { CASTER, ROOM, Simulation, type Point } from "../lib/simulation";

function run(sim: Simulation, seconds: number) { for (let i = 0; i < Math.round(seconds * 120); i++) sim.advance(1 / 120); }
function spell(mechanics: Partial<Recipe["mechanics"]>) { return RecipeSchema.parse({ mechanics: { lifetime: 12, speed: 640, ...mechanics } }); }
function emptyRoom() { const sim = new Simulation("open-hall"); sim.targets = []; return sim; }
function untilWall(sim: Simulation) { for (let i = 0; i < 1500 && sim.stats.wallHits === 0; i++) sim.advance(1 / 120); }

describe("continuous orb simulation", () => {
  it("disappears exactly once at the first wall", () => {
    const sim = emptyRoom(); sim.cast(spell({ wallResponse: "disappear" }), { x: ROOM.width, y: CASTER.y });
    run(sim, 2); expect(sim.projectiles).toHaveLength(0); expect(sim.stats.wallHits).toBe(1);
  });
  it.each([0, 1, 3, 6])("obeys bounce limit %i", bounceLimit => {
    const sim = emptyRoom(); sim.cast(spell({ wallResponse: "bounce", bounceLimit }), { x: ROOM.width, y: CASTER.y });
    run(sim, 12); expect(sim.projectiles).toHaveLength(0); expect(sim.stats.wallHits).toBe(bounceLimit + 1);
  });
  it.each([2, 3, 4, 5])("consumes parent and fans %i smaller, nonrecursive children inward", splitCount => {
    const sim = emptyRoom(); sim.cast(spell({ wallResponse: "split", splitCount }), { x: ROOM.width, y: CASTER.y });
    const parent = { ...sim.projectiles[0] }; untilWall(sim);
    expect(sim.projectiles).toHaveLength(splitCount);
    expect(new Set(sim.projectiles.map(p => p.vy)).size).toBe(splitCount);
    for (const child of sim.projectiles) {
      expect(child.id).not.toBe(parent.id); expect(child.child).toBe(true); expect(child.radius).toBeLessThan(parent.radius);
      expect(child.vx).toBeLessThan(0); expect(child.response).toBe("disappear"); expect(child.damage).toBe(15);
      expect(child.life).toBeLessThan(parent.life); expect(child.x).toBeLessThan(ROOM.width - child.radius);
    }
    run(sim, 12); expect(sim.projectiles).toHaveLength(0); expect(sim.stats.splits).toBe(1);
  });
  it.each(["bounce", "split"] as const)("handles simultaneous corner normals for %s", wallResponse => {
    const sim = emptyRoom(); sim.cast(spell({ wallResponse }), { x: ROOM.width - 14, y: ROOM.height - 14 }); untilWall(sim);
    expect(sim.stats.wallHits).toBe(1);
    expect(sim.projectiles.length).toBeGreaterThan(0);
    for (const p of sim.projectiles) { expect(p.vx).toBeLessThan(0); expect(p.vy).toBeLessThan(0); }
    sim.advance(1 / 120); expect(sim.stats.wallHits).toBe(1);
  });
  it("sweeps through small targets at maximum speed without tunneling or repeated damage", () => {
    const sim = emptyRoom(); sim.targets = [{ id: 1, x: CASTER.x + 80, y: CASTER.y, radius: 1, hp: 100 }];
    sim.cast(spell({ size: 6, damage: 27 }), { x: ROOM.width, y: CASTER.y });
    sim.advance(0.25); expect(sim.targets[0].hp).toBe(73); expect(sim.projectiles).toHaveLength(0);
    run(sim, 2); expect(sim.targets[0].hp).toBe(73); expect(sim.stats.targetHits).toBe(1);
  });
  it("uses target collision before a later wall and consumes split orbs on target impact", () => {
    const sim = new Simulation("open-hall"); sim.cast(spell({ wallResponse: "split", damage: 100 }), sim.targets[0]); run(sim, 1);
    expect(sim.targets[0].hp).toBe(0); expect(sim.stats.splits).toBe(0); expect(sim.stats.targetHits).toBe(1);
  });
  it("allows a new shot through a destroyed target", () => {
    const sim = new Simulation("open-hall"); const target = { ...sim.targets[0] };
    sim.cast(spell({ damage: 100 }), target); run(sim, 1); sim.cast(spell({ damage: 100 }), target); run(sim, 1);
    expect(sim.stats.targetHits).toBe(1);
  });
  it("expires without impact and rejects invalid runtime input", () => {
    const sim = emptyRoom(); sim.cast(spell({ speed: 40, lifetime: 1 }), { x: ROOM.width, y: 285 }); run(sim, 1);
    expect(sim.projectiles).toHaveLength(0); expect(sim.stats.wallHits).toBe(0);
    expect(sim.cast({ mechanics: { speed: 10000 } }, { x: 1, y: 1 })).toBe(false);
    expect(sim.cast({}, { x: NaN, y: 1 })).toBe(false);
  });
  it("enforces active capacity during casts and simultaneous splits", () => {
    const sim = emptyRoom();
    for (let i = 0; i < LIMITS.active; i++) expect(sim.cast(spell({ wallResponse: "split", splitCount: 5 }), { x: ROOM.width, y: 285 })).toBe(true);
    expect(sim.cast({}, { x: ROOM.width, y: 285 })).toBe(false);
    untilWall(sim); expect(sim.projectiles.length).toBeLessThanOrEqual(LIMITS.active); expect(sim.projectiles.every(p => p.child)).toBe(true);
  });
  it("reset clears spells, impacts, counters, and restores all three targets", () => {
    const sim = new Simulation("open-hall"); sim.cast(spell({ damage: 25 }), sim.targets[0]); run(sim, 1); sim.cast({}, { x: ROOM.width, y: ROOM.height }); sim.reset();
    expect(sim.projectiles).toEqual([]); expect(sim.events).toEqual([]); expect(sim.targets.map(t => t.hp)).toEqual([100, 100, 100]);
    expect(sim.stats).toEqual({ casts: 0, wallHits: 0, splits: 0, targetHits: 0, kills: 0, casterHits: 0 });
  });
  it("produces the same result across different frame chunking", () => {
    const left = new Simulation("open-hall"), right = new Simulation("open-hall"); const aim: Point = { x: 455, y: 350 };
    left.cast(EXAMPLE_RECIPE, aim); right.cast(EXAMPLE_RECIPE, aim);
    run(left, 5); for (let i = 0; i < 100; i++) right.advance(0.05);
    expect(left.projectiles).toEqual(right.projectiles); expect(left.targets).toEqual(right.targets); expect(left.stats).toEqual(right.stats);
  });
  it("keeps all projectile circles within the visible room throughout all wall responses", () => {
    for (const wallResponse of ["disappear", "bounce", "split"] as const) for (const aim of [{ x: 0, y: 0 }, { x: ROOM.width, y: ROOM.height }, { x: 0, y: ROOM.height }, { x: ROOM.width, y: 0 }]) {
      const sim = emptyRoom(); sim.cast(spell({ wallResponse, size: 22, splitCount: 5 }), aim);
      for (let i = 0; i < 1200; i++) { sim.advance(1 / 120); for (const p of sim.projectiles) {
        expect(p.x).toBeGreaterThanOrEqual(p.radius - 1e-6); expect(p.x).toBeLessThanOrEqual(ROOM.width - p.radius + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(p.radius - 1e-6); expect(p.y).toBeLessThanOrEqual(ROOM.height - p.radius + 1e-6);
      } }
    }
  });
});
