import { describe, expect, it } from "vitest";
import { DEFAULT_SPAWN_SETTINGS } from "../lib/settings";
import { CASTER, SURVIVAL, Simulation, TICK } from "../lib/simulation";

const run = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds * 120; i++) sim.advance(TICK); };

describe("survival mode", () => {
  it("starts wave 1 with full lives and grows count and difficulty per wave", () => {
    const sim = new Simulation("open-hall"); sim.configureEnemies({ ...DEFAULT_SPAWN_SETTINGS, mix: ["golem"], keepSpawning: false });
    sim.startSurvival();
    expect(sim.survival).toEqual({ active: true, lives: SURVIVAL.lives, over: false });
    expect(sim.wave.number).toBe(1); expect(sim.enemies).toHaveLength(SURVIVAL.baseCount);
    run(sim, SURVIVAL.interval + 0.05);
    expect(sim.wave.number).toBe(2); // keepSpawning: false does not stop a survival run
    const wave2 = sim.enemies.slice(SURVIVAL.baseCount);
    expect(wave2.length).toBe(SURVIVAL.baseCount + SURVIVAL.countPerWave);
    expect(wave2[0].difficulty).toBeCloseTo(1 + SURVIVAL.difficultyPerWave, 10);
  });
  it("costs a life per caster touch and ends the run at zero lives", () => {
    const sim = new Simulation("open-hall"); sim.configureEnemies({ ...DEFAULT_SPAWN_SETTINGS, mix: ["imp"] });
    sim.startSurvival(); sim.clearEnemies(); sim.startSurvival();
    sim.survival.lives = 2;
    sim.spawnEnemy("imp", { x: CASTER.x + 40, y: CASTER.y });
    run(sim, 3);
    expect(sim.survival).toMatchObject({ active: false, lives: 0, over: true });
    expect(sim.wave.running).toBe(false);
    const touches = sim.stats.casterHits; run(sim, 3);
    expect(sim.survival.lives).toBe(0); expect(sim.stats.casterHits).toBeGreaterThan(touches); // sandbox continues after the run
  });
  it("normal waves never touch lives, and reset clears the run", () => {
    const sim = new Simulation("open-hall"); sim.startWaves();
    sim.spawnEnemy("imp", { x: CASTER.x + 40, y: CASTER.y }); run(sim, 2);
    expect(sim.stats.casterHits).toBeGreaterThan(0); expect(sim.survival).toEqual({ active: false, lives: 0, over: false });
    sim.startSurvival(); sim.reset(); expect(sim.survival).toEqual({ active: false, lives: 0, over: false });
  });
});
