import { describe, expect, it } from "vitest";
import { RecipeSchema } from "../lib/recipe";
import { DEFAULT_SPAWN_SETTINGS } from "../lib/settings";
import { BOSS, CASTER, Simulation, TICK } from "../lib/simulation";

function setup(frozen = false) {
  const sim = new Simulation("open-hall");
  sim.configureEnemies({ ...DEFAULT_SPAWN_SETTINGS, frozen });
  return sim;
}
const run = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds * 120; i++) sim.advance(TICK); };

describe("Archmage Construct boss", () => {
  it("spawns at most one boss with boss HP", () => {
    const sim = setup(), boss = sim.spawnBoss({ x: 600, y: 300 })!;
    expect(boss.maxHp).toBe(BOSS.hp); expect(boss.boss?.phase).toBe(1);
    expect(sim.spawnBoss({ x: 600, y: 450 })).toBeNull();
    boss.hp = 0; run(sim, TICK);
    expect(sim.spawnBoss({ x: 600, y: 450 })).not.toBeNull();
  });
  it("summons skeletons in phase 1", () => {
    const sim = setup(); sim.spawnBoss({ x: 600, y: 300 });
    run(sim, BOSS.summonEvery + 0.1);
    expect(sim.enemies.filter(e => e.type === "skeleton")).toHaveLength(BOSS.summonCount);
  });
  it("changes phase at 66% and 33% HP and telegraphs orbs before they fly", () => {
    const sim = setup(), boss = sim.spawnBoss({ x: 600, y: 300 })!;
    boss.hp = Math.floor(boss.maxHp * 0.6); run(sim, 0.1);
    expect(boss.boss?.phase).toBe(2);
    run(sim, 1);
    expect(sim.bossOrbs).toHaveLength(1);
    const orb = sim.bossOrbs[0], start = { x: orb.x, y: orb.y };
    expect(orb.vx).toBe(0); // still charging
    run(sim, BOSS.telegraph);
    expect(Math.hypot(orb.x - CASTER.x, orb.y - CASTER.y)).toBeLessThan(Math.hypot(start.x - CASTER.x, start.y - CASTER.y));
    boss.hp = Math.floor(boss.maxHp * 0.3); run(sim, 0.1);
    expect(boss.boss?.phase).toBe(3);
  });
  it("orbs that reach the caster count as caster hits", () => {
    const sim = setup(), boss = sim.spawnBoss({ x: 300, y: 285 })!;
    boss.hp = Math.floor(boss.maxHp * 0.6); boss.speed = 0;
    run(sim, 4);
    expect(sim.stats.casterHits).toBeGreaterThan(0);
  });
  it("player spells break orbs in flight", () => {
    const sim = setup(), boss = sim.spawnBoss({ x: 600, y: 285 })!;
    boss.hp = Math.floor(boss.maxHp * 0.6); boss.speed = 0;
    run(sim, 2.2);
    expect(sim.bossOrbs.length).toBeGreaterThan(0);
    sim.cast(RecipeSchema.parse({ mechanics: { speed: 640, size: 14, lifetime: 2 } }), { x: 600, y: 285 });
    run(sim, 1);
    expect(sim.bossOrbs.filter(o => o.armIn <= 0)).toHaveLength(0);
    expect(sim.stats.casterHits).toBe(0);
  });
  it("phase-3 shield blocks direct hits from its side only", () => {
    const hit = (shield: number) => {
      const sim = setup(true), boss = sim.spawnBoss({ x: 500, y: 285 })!;
      boss.hp = 100; boss.boss = { phase: 3, nextAction: Infinity, shield };
      sim.cast(RecipeSchema.parse({ mechanics: { speed: 640, damage: 40, lifetime: 3 } }), { x: 500, y: 285 });
      run(sim, 1); return 100 - boss.hp;
    };
    expect(hit(Math.PI)).toBe(0); // shield faces the caster (west)
    expect(hit(0)).toBeGreaterThan(0); // shield faces away
  });
  it("is deterministic and clears with enemies", () => {
    const play = () => {
      const sim = setup(); sim.spawnBoss();
      run(sim, 12); return { enemies: sim.enemies.map(e => [e.type, e.x, e.y, e.hp]), orbs: sim.bossOrbs, stats: sim.stats };
    };
    expect(play()).toEqual(play());
    const sim = setup(); sim.spawnBoss(); sim.clearEnemies(); expect(sim.boss).toBeUndefined(); expect(sim.bossOrbs).toEqual([]);
  });
});
