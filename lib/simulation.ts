import { LIMITS, RecipeSchema, type Recipe } from "./recipe";
import { DEFAULT_SPAWN_SETTINGS, ENEMY_RULES, ENEMY_STATS, EnemyStatsSchema, EnemyTypeSchema, LayoutSchema, SimulationSeedSchema, SpawnSettingsSchema, type EnemyType, type Layout, type SpawnSettings } from "./settings";

export type Point = { x: number; y: number };
export const ROOM = { width: 800, height: 600 };
export const CASTER = { x: 95, y: 285 };
export const INITIAL_AIM = { x: 775, y: 565 };
export type Obstacle = Point & { id: string; halfWidth: number; halfHeight: number; height: number; kind: "pillar" | "crate" | "cauldron" };
const PROPS: readonly Obstacle[] = [
  { id: "crates", kind: "crate", x: 735, y: 65, halfWidth: 27, halfHeight: 27, height: 48 },
  { id: "cauldron", kind: "cauldron", x: 65, y: 65, halfWidth: 28, halfHeight: 28, height: 42 },
];
const PILLARS: readonly Obstacle[] = [
  { id: "west-pillar", kind: "pillar", x: 340, y: 245, halfWidth: 24, halfHeight: 24, height: 115 },
  { id: "east-pillar", kind: "pillar", x: 550, y: 380, halfWidth: 24, halfHeight: 24, height: 115 },
];
export function obstaclesFor(layout: Layout): readonly Obstacle[] { return layout === "workshop" ? [...PROPS, ...PILLARS] : PROPS; }
export function inside(p: Point) { return p.x >= 0 && p.x <= ROOM.width && p.y >= 0 && p.y <= ROOM.height; }
export type Status = { remaining: number; nextTick: number; damage: number; color: string };
export type Target = Point & { id: number; radius: number; hp: number; statuses?: Partial<Record<"burn" | "chill" | "poison" | "weaken" | "stagger", Status>> };
export type Enemy = Target & { type: EnemyType; maxHp: number; speed: number; small: boolean; difficulty: number;
  age: number; phase: number; phased: boolean; touchIn: number; moving: boolean; path: Point[]; boss?: BossState };
export type BossState = { phase: 1 | 2 | 3; nextAction: number; shield: number };
/** Hostile orb: charges in place for `armIn` seconds (the telegraph), then flies at the caster. Player spells can break it. */
export type BossOrb = Point & { id: number; vx: number; vy: number; radius: number; armIn: number; life: number };
/** Survival: waves keep coming and grow; each caster touch costs a life. */
export const SURVIVAL = { lives: 10, baseCount: 3, countPerWave: 1, difficultyPerWave: 0.15, interval: 10 } as const;
/** Archmage Construct: phase 1 summons skeletons, phase 2 throws orbs, phase 3 adds a spinning shield arc. */
export const BOSS = { hp: 600, speed: 14, summonEvery: 7, summonCount: 2, orbEvery: { 2: 3.2, 3: 2.2 }, telegraph: 1,
  orbSpeed: 130, orbRadius: 10, orbLife: 8, maxOrbs: 8, shieldHalf: Math.PI / 3, shieldSpin: 0.9 } as const;
export const DOORS = { north: { x: 400, y: 32 }, east: { x: 768, y: 300 }, south: { x: 400, y: 568 }, west: { x: 32, y: 300 } } as const;
export type Projectile = Point & {
  id: number; vx: number; vy: number; radius: number; damage: number; life: number;
  color: string; response: Recipe["mechanics"]["wallResponse"]; bounces: number; splitCount: number; child: boolean;
  kind: Recipe["kind"]; mechanics: Recipe["mechanics"]; hitTargets: Set<number>; castHits: Set<number>;
  pierces: number; headingX: number; headingY: number; speed: number; age: number;
  chainBudget: { remaining: number; conducted?: boolean }; killBudget: { remaining: number };
  appearance: Recipe["appearance"]; aim: Point; distance: number; returning: boolean; targetId?: number; zoneCreated: boolean;
  start: Point; landingDistance: number;

};
export type Impact = Point & { kind: "wall" | "split" | "target" | "dot" | "chain" | "explosion" | "cast" | "spawn" | "death" | "caster" | "landing";
  color: string; element: Recipe["mechanics"]["element"]; damage?: number; targetId?: number; reaction?: Reaction; from?: Point; radius?: number; explosion?: boolean; appearance?: Recipe["appearance"] };
export type Zone = Point & { id: number; element: "fire" | "frost" | "poison"; radius: number; remaining: number; nextTick: number; damage: number; color: string };
type PendingShot = { at: number; projectile: Projectile };
type Collision = { time: number; nx: number; ny: number; target?: Target };
const EPS = 0.001;
export const TICK = 1 / 120;
const DPS_WINDOW = 5;
export type CombatStats = { damage: Partial<Record<Recipe["mechanics"]["element"], number>>; hits: number; peakActive: number; dps: number; reactions: Partial<Record<Reaction, number>> };
type StatusKey = "burn" | "chill" | "poison" | "weaken" | "stagger";
/** Element reactions: a hit of one element on a target already holding another element's status. */
export const REACTIONS = {
  steam: { label: "Steam burst", color: "#e8f4ff", bonus: 0, radius: 70, splash: 12, removes: ["burn", "chill"], consumes: true },
  toxic: { label: "Toxic flare", color: "#c4ff7a", bonus: 0, radius: 80, splash: 10, removes: [], consumes: false },
  shatter: { label: "Shatter", color: "#bfe4ff", bonus: 20, radius: 0, splash: 0, removes: ["chill"], consumes: true },
  conduct: { label: "Conduct", color: "#fff38a", bonus: 0, radius: 0, splash: 0, removes: [], consumes: false },
  eclipse: { label: "Eclipse", color: "#fff0d0", bonus: 35, radius: 0, splash: 0, removes: ["weaken"], consumes: true },
} as const satisfies Record<string, { label: string; color: string; bonus: number; radius: number; splash: number; removes: readonly StatusKey[]; consumes: boolean }>;
export type Reaction = keyof typeof REACTIONS;
const STEAM_BLIND = 0.6;
export function reactionFor(element: Recipe["mechanics"]["element"], statuses: Target["statuses"]): Reaction | null {
  if (!statuses) return null;
  if ((element === "fire" && statuses.chill) || (element === "frost" && statuses.burn)) return "steam";
  if (element === "fire" && statuses.poison) return "toxic";
  if (element === "lightning" && statuses.chill) return "shatter";
  if (element === "lightning" && statuses.poison) return "conduct";
  if (element === "holy" && statuses.weaken) return "eclipse";
  return null;
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/** Phase-3 boss blocks direct hits arriving inside its shield arc; chains, splash and zones still land. */
function shielded(target: Target, from: Point) {
  const s = "boss" in target ? (target as Enemy).boss : undefined;
  if (s?.phase !== 3) return false;
  const delta = Math.atan2(from.y - target.y, from.x - target.x) - s.shield;
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= BOSS.shieldHalf;
}
function hittable(target: Target) { return target.hp > 0 && !("phased" in target && target.phased); }

/** Conservative swept-circle clearance for navigation, including room edges. */
function clearSegment(a: Point, b: Point, radius: number, obstacles: readonly Obstacle[]) {
  if (![a, b].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= radius && p.x <= ROOM.width - radius && p.y >= radius && p.y <= ROOM.height - radius)) return false;
  for (const o of obstacles) {
    let enter = 0, leave = 1;
    for (const [start, delta, low, high] of [
      [a.x, b.x - a.x, o.x - o.halfWidth - radius, o.x + o.halfWidth + radius],
      [a.y, b.y - a.y, o.y - o.halfHeight - radius, o.y + o.halfHeight + radius],
    ]) {
      if (Math.abs(delta) < 1e-9) { if (start < low || start > high) { enter = 2; break; } }
      else { const t1 = (low - start) / delta, t2 = (high - start) / delta; enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2)); }
    }
    if (enter <= leave) return false;
  }
  return true;
}

/** At most 18 nodes: caster, start, and four clearance corners per solid prop. */
function route(start: Point, radius: number, obstacles: readonly Obstacle[]): Point[] {
  const nodes: Point[] = [start, CASTER];
  for (const o of obstacles) for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    const p = { x: o.x + dx * (o.halfWidth + radius + 2), y: o.y + dy * (o.halfHeight + radius + 2) };
    if (clearSegment(p, p, radius, obstacles)) nodes.push(p);
  }
  const distance = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>(); distance[0] = 0;
  while (visited.size < nodes.length) {
    let index = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (index < 0 || distance[i] < distance[index])) index = i;
    if (index < 0 || distance[index] === Infinity) return [];
    if (index === 1) {
      const path: Point[] = [];
      for (let i = 1; i > 0; i = previous[i]) path.unshift({ ...nodes[i] });
      return path;
    }
    visited.add(index);
    for (let i = 0; i < nodes.length; i++) {
      const next = distance[index] + Math.hypot(nodes[i].x - nodes[index].x, nodes[i].y - nodes[index].y);
      if (!visited.has(i) && next < distance[i] && clearSegment(nodes[index], nodes[i], radius, obstacles)) { distance[i] = next; previous[i] = index; }
    }
  }
  return [];
}

function collision(p: Projectile, duration: number, targets: Target[], obstacles: readonly Obstacle[]): Collision | undefined {
  let best: Collision | undefined;
  const consider = (time: number, nx: number, ny: number, target?: Target) => {
    if (time < -1e-9 || time > duration + 1e-9) return;
    time = Math.max(0, time);
    if (!best || time < best.time - 1e-9) best = { time, nx, ny, target };
    else if (!target && !best.target && Math.abs(time - best.time) < 1e-9) { best.nx += nx; best.ny += ny; }
  };
  if (p.vx < 0) consider((p.radius - p.x) / p.vx, 1, 0);
  if (p.vx > 0) consider((ROOM.width - p.radius - p.x) / p.vx, -1, 0);
  if (p.vy < 0) consider((p.radius - p.y) / p.vy, 0, 1);
  if (p.vy > 0) consider((ROOM.height - p.radius - p.y) / p.vy, 0, -1);
  for (const box of obstacles) {
    const left = box.x - box.halfWidth, right = box.x + box.halfWidth;
    const top = box.y - box.halfHeight, bottom = box.y + box.halfHeight;
    // Sweep against the rounded rectangle: offset faces and four circular corners.
    // This is the exact Minkowski sum, so near-corner shots do not hit an expanded AABB.
    if (p.vx > 0) { const t = (left - p.radius - p.x) / p.vx, y = p.y + p.vy * t; if (y >= top && y <= bottom) consider(t, -1, 0); }
    if (p.vx < 0) { const t = (right + p.radius - p.x) / p.vx, y = p.y + p.vy * t; if (y >= top && y <= bottom) consider(t, 1, 0); }
    if (p.vy > 0) { const t = (top - p.radius - p.y) / p.vy, x = p.x + p.vx * t; if (x >= left && x <= right) consider(t, 0, -1); }
    if (p.vy < 0) { const t = (bottom + p.radius - p.y) / p.vy, x = p.x + p.vx * t; if (x >= left && x <= right) consider(t, 0, 1); }
    for (let corner = 0; corner < 4; corner++) {
      const cx = corner & 1 ? right : left, cy = corner & 2 ? bottom : top;
      const dx = p.x - cx, dy = p.y - cy, a = p.vx ** 2 + p.vy ** 2;
      const b = 2 * (dx * p.vx + dy * p.vy), c = dx ** 2 + dy ** 2 - p.radius ** 2;
      const disc = b * b - 4 * a * c;
      if (a <= 0 || disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const nx = (dx + p.vx * t) / p.radius, ny = (dy + p.vy * t) / p.radius;
      if ((cx === left ? nx <= 0 : nx >= 0) && (cy === top ? ny <= 0 : ny >= 0) && p.vx * nx + p.vy * ny < -1e-9) consider(t, nx, ny);
    }
  }
  for (const target of targets) {
    if (!hittable(target) || p.hitTargets.has(target.id) || (p.mechanics.element === "lightning" && p.castHits.has(target.id))) continue;
    const dx = p.x - target.x, dy = p.y - target.y, radius = target.radius + p.radius;
    const a = p.vx ** 2 + p.vy ** 2, b = 2 * (dx * p.vx + dy * p.vy), c = dx ** 2 + dy ** 2 - radius ** 2;
    const discriminant = b * b - 4 * a * c;
    if (c <= 0) consider(0, 0, 0, target);
    else if (a > 0 && discriminant >= 0) consider((-b - Math.sqrt(discriminant)) / (2 * a), 0, 0, target);
  }
  return best;
}

/** Fixed ticks and swept circle collisions keep the simulation independent of rendering. */
export class Simulation {
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  bossOrbs: BossOrb[] = [];
  private pending: PendingShot[] = [];
  private children: Projectile[] = [];
  targets: Target[] = [];
  enemies: Enemy[] = [];
  events: Impact[] = [];
  stats = { casts: 0, wallHits: 0, splits: 0, targetHits: 0, kills: 0, casterHits: 0 };
  spawnSettings: SpawnSettings = DEFAULT_SPAWN_SETTINGS;
  wave = { running: false, number: 0, nextAt: 0 };
  survival = { active: false, lives: 0, over: false };
  time = 0;
  combat: CombatStats = { damage: {}, hits: 0, peakActive: 0, dps: 0, reactions: {} };
  private recentDamage: { at: number; amount: number }[] = [];
  private enemyId = -1;
  private randomState = 1;
  private nextId = 1;
  private accumulator = 0;
  readonly layout: Layout;
  readonly obstacles: readonly Obstacle[];
  constructor(layout: unknown = "workshop", readonly seed = 1) {
    SimulationSeedSchema.parse(seed);
    this.layout = LayoutSchema.parse(layout);
    this.obstacles = obstaclesFor(this.layout);
    this.reset();
  }
  reset() {
    this.projectiles = []; this.zones = []; this.pending = []; this.children = []; this.bossOrbs = [];
    this.targets = [{ id: 1, x: 175, y: 105, radius: 21, hp: 100 }, { id: 2, x: 520, y: 145, radius: 21, hp: 100 }, { id: 3, x: 680, y: 470, radius: 21, hp: 100 }];
    this.events = [];
    this.stats = { casts: 0, wallHits: 0, splits: 0, targetHits: 0, kills: 0, casterHits: 0 };
    this.enemies = []; this.wave = { running: false, number: 0, nextAt: 0 }; this.time = 0; this.survival = { active: false, lives: 0, over: false };
    this.combat = { damage: {}, hits: 0, peakActive: 0, dps: 0, reactions: {} }; this.recentDamage = [];
    this.enemyId = -1; this.randomState = this.seed;
    this.nextId = 1;
    this.accumulator = 0;
  }
  private random() { this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0; return this.randomState / 0x100000000; }
  configureEnemies(input: unknown) {
    const parsed = SpawnSettingsSchema.safeParse(input);
    if (!parsed.success) return false;
    this.spawnSettings = parsed.data;
    if (this.wave.running && !parsed.data.keepSpawning && !this.survival.active) this.stopWaves();
    return true;
  }
  canPlace(point: Point, radius: number) {
    return Number.isFinite(radius) && radius >= 9 && radius <= 26 && clearSegment(point, point, radius, this.obstacles)
      && Math.hypot(point.x - CASTER.x, point.y - CASTER.y) >= radius + ENEMY_RULES.meleeRange
      && this.enemies.every(e => e.hp <= 0 || Math.hypot(e.x - point.x, e.y - point.y) >= e.radius + radius);
  }
  spawnEnemy(type: unknown, location: Point | keyof typeof DOORS = this.spawnSettings.door, difficulty = this.spawnSettings.difficulty): Enemy | null {
    const parsed = EnemyTypeSchema.safeParse(type), settings = SpawnSettingsSchema.safeParse({ ...this.spawnSettings, difficulty });
    if (!parsed.success || !settings.success || this.enemies.filter(e => e.hp > 0).length >= LIMITS.enemies) return null;
    const stats = ENEMY_STATS[parsed.data];
    let point: Point;
    if (typeof location === "string") {
      if (!(location in DOORS)) return null;
      const door = DOORS[location]; point = { ...door };
      let found = false;
      for (let i = 0; i < 16; i++) {
        const offset = (this.random() - 0.5) * 240;
        point = location === "north" || location === "south" ? { x: door.x + offset, y: door.y } : { x: door.x, y: door.y + offset };
        if (this.canPlace(point, stats.radius)) { found = true; break; }
      }
      if (!found) return null;
    } else { point = location; if (!point || !this.canPlace(point, stats.radius)) return null; }
    return this.addEnemy(parsed.data, point, difficulty, false);
  }
  private addEnemy(type: EnemyType, point: Point, difficulty: number, small: boolean): Enemy | null {
    if (this.enemies.filter(e => e.hp > 0).length >= LIMITS.enemies) return null;
    const base = ENEMY_STATS[type], stats = EnemyStatsSchema.parse({ hp: Math.round(Math.round(base.hp * difficulty) * (small ? ENEMY_RULES.childHp : 1)),
      speed: base.speed * difficulty, radius: base.radius * (small ? ENEMY_RULES.childRadius : 1) });
    const enemy: Enemy = { ...point, ...stats, id: this.enemyId--, type, maxHp: stats.hp, small, difficulty,
      age: 0, phase: this.random() * Math.PI * 2, phased: false, touchIn: 0, moving: false, path: route(point, stats.radius, this.obstacles) };
    this.enemies.push(enemy); this.emit({ ...point, kind: "spawn", color: "#b998ff", element: "arcane" }); return enemy;
  }
  startWaves(input: unknown = this.spawnSettings) {
    if (!this.configureEnemies(input)) return false;
    this.wave.running = true; this.wave.nextAt = this.time; this.spawnWave(); return true;
  }
  stopWaves() { this.wave.running = false; this.survival.active = false; }
  clearEnemies() { this.enemies = []; this.bossOrbs = []; this.stopWaves(); }
  /** Clears enemies and starts wave 1 of a survival run with full lives; spawn settings still pick the type mix. */
  startSurvival() {
    this.clearEnemies(); this.wave.number = 0;
    this.survival = { active: true, lives: SURVIVAL.lives, over: false };
    this.wave.running = true; this.spawnWave();
  }
  private touchCaster(color: string) {
    this.stats.casterHits++; this.emit({ ...CASTER, kind: "caster", color, element: "arcane" });
    if (!this.survival.active) return;
    this.survival.lives--;
    if (this.survival.lives <= 0) { this.survival.lives = 0; this.survival.over = true; this.stopWaves(); }
  }
  get boss() { return this.enemies.find(e => e.boss && e.hp > 0); }
  /** At most one boss; it reuses golem movement, resistance and collision with boss-sized HP. */
  spawnBoss(location: Point | keyof typeof DOORS = "east", difficulty = this.spawnSettings.difficulty): Enemy | null {
    if (this.boss) return null;
    const enemy = this.spawnEnemy("golem", location, difficulty); if (!enemy) return null;
    enemy.hp = enemy.maxHp = Math.round(BOSS.hp * difficulty); enemy.speed = BOSS.speed * difficulty;
    enemy.boss = { phase: 1, nextAction: this.time + BOSS.summonEvery, shield: 0 };
    return enemy;
  }
  private bossTick(dt: number) {
    const b = this.boss;
    if (b?.boss && !this.spawnSettings.frozen) {
      const s = b.boss, phase = b.hp > b.maxHp * 2 / 3 ? 1 : b.hp > b.maxHp / 3 ? 2 : 3;
      if (phase !== s.phase) { s.phase = phase; s.nextAction = this.time + 1; this.emit({ ...b, kind: "explosion", color: "#ff5ad1", element: "arcane", radius: 70 }); }
      if (phase === 3) s.shield = (s.shield + BOSS.shieldSpin * dt) % (Math.PI * 2);
      if (this.time + 1e-9 >= s.nextAction) {
        if (phase === 1) for (let i = 0, placed = 0; i < 16 && placed < BOSS.summonCount; i++) {
          const angle = i * Math.PI / 8, point = { x: b.x + Math.cos(angle) * (b.radius + 22), y: b.y + Math.sin(angle) * (b.radius + 22) };
          if (this.canPlace(point, ENEMY_STATS.skeleton.radius) && this.addEnemy("skeleton", point, b.difficulty, false)) placed++;
        } else if (this.bossOrbs.length < BOSS.maxOrbs) {
          const angle = Math.atan2(CASTER.y - b.y, CASTER.x - b.x), reach = b.radius + BOSS.orbRadius + 4;
          this.bossOrbs.push({ id: this.nextId++, x: b.x + Math.cos(angle) * reach, y: b.y + Math.sin(angle) * reach, vx: 0, vy: 0, radius: BOSS.orbRadius, armIn: BOSS.telegraph, life: BOSS.orbLife });
        }
        s.nextAction = this.time + (phase === 1 ? BOSS.summonEvery : BOSS.orbEvery[phase]);
      }
    }
    if (this.spawnSettings.frozen) return;
    for (const o of this.bossOrbs) {
      if (o.armIn > 0) {
        o.armIn -= dt; if (o.armIn > 1e-9) continue;
        const angle = Math.atan2(CASTER.y - o.y, CASTER.x - o.x); o.vx = Math.cos(angle) * BOSS.orbSpeed; o.vy = Math.sin(angle) * BOSS.orbSpeed;
      }
      o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
      if (Math.hypot(o.x - CASTER.x, o.y - CASTER.y) <= o.radius + ENEMY_RULES.meleeRange) {
        o.life = 0; this.touchCaster("#ff5ad1");
      }
    }
  }
  /** Any live player projectile touching an orb breaks it; the projectile keeps flying. */
  private breakOrbs() {
    for (const o of this.bossOrbs) if (o.life > 0 && this.projectiles.some(p => Math.hypot(p.x - o.x, p.y - o.y) <= p.radius + o.radius)) {
      o.life = 0; this.emit({ ...o, kind: "explosion", color: "#ff5ad1", element: "arcane", radius: 26 });
    }
    this.bossOrbs = this.bossOrbs.filter(o => o.life > 1e-9);
  }
  private spawnWave() {
    this.wave.number++;
    const s = this.spawnSettings, doors = Object.keys(DOORS) as (keyof typeof DOORS)[];
    const survival = this.survival.active, n = this.wave.number - 1;
    const count = survival ? Math.min(12, SURVIVAL.baseCount + n * SURVIVAL.countPerWave) : s.count;
    const difficulty = survival ? Math.min(3, s.difficulty + n * SURVIVAL.difficultyPerWave) : s.difficulty;
    for (let i = 0; i < count; i++) this.spawnEnemy(s.mix[Math.floor(this.random() * s.mix.length)], doors[Math.floor(this.random() * doors.length)], difficulty);
    this.wave.nextAt = this.time + (survival ? SURVIVAL.interval : s.interval);
    if (!s.keepSpawning && !survival) this.stopWaves();
  }
  private moveEnemies(dt: number) {
    for (const e of this.enemies) {
      e.age += dt; e.phased = e.type === "wraith" && Math.floor((e.age + 1e-9) / ENEMY_RULES.phaseSeconds) % 2 === 1;
      e.moving = false; e.touchIn = Math.max(0, e.touchIn - dt);
      if (e.hp <= 0 || this.spawnSettings.frozen || e.statuses?.stagger) continue;
      if (Math.hypot(e.x - CASTER.x, e.y - CASTER.y) <= e.radius + ENEMY_RULES.meleeRange + EPS) {
        if (e.touchIn <= 1e-9) { e.touchIn = ENEMY_RULES.touchInterval; this.touchCaster("#ffac76"); }
        continue;
      }
      const goal = e.path[0]; if (!goal) { e.path = route(e, e.radius, this.obstacles); continue; }
      const dx = goal.x - e.x, dy = goal.y - e.y, distance = Math.hypot(dx, dy);
      const step = Math.min(distance, e.speed * (e.statuses?.chill ? ENEMY_RULES.chillSpeed : 1) * dt);
      const zigzag = e.type === "imp" && distance > step ? Math.sin(e.age * ENEMY_RULES.zigzagFrequency + e.phase) * ENEMY_RULES.zigzagSpeed * step : 0;
      let next = { x: e.x + dx / distance * step - dy / distance * zigzag, y: e.y + dy / distance * step + dx / distance * zigzag };
      if (!clearSegment(e, next, e.radius, this.obstacles)) next = { x: e.x + dx / distance * step, y: e.y + dy / distance * step };
      if (clearSegment(e, next, e.radius, this.obstacles)) { e.x = next.x; e.y = next.y; e.moving = true; if (distance <= step + EPS) e.path.shift(); }
      else e.path = route(e, e.radius, this.obstacles);
    }
  }
  private removeDeadEnemies() {
    const dead = this.enemies.filter(e => e.hp <= 0); this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const e of dead) {
      this.stats.kills++; this.emit({ ...e, kind: "death", color: "#b998ff", element: "arcane" });
      if (e.type !== "slime" || e.small) continue;
      for (let i = 0; i < ENEMY_RULES.splitCount; i++) {
        const radius = e.radius * ENEMY_RULES.childRadius;
        for (let attempt = 0; attempt < 16; attempt++) {
          const angle = (i * 8 + attempt) * Math.PI / 8, point = { x: e.x + Math.cos(angle) * (radius + 2), y: e.y + Math.sin(angle) * (radius + 2) };
          if (this.canPlace(point, radius)) { this.addEnemy("slime", point, e.difficulty, true); break; }
        }
      }
    }
  }
  get scheduledShots() { return this.pending.length; }
  private nearest(point: Point, range = Infinity, exclude?: Set<number>) {
    return [...this.targets, ...this.enemies].filter(t => hittable(t) && !exclude?.has(t.id) && Math.hypot(t.x - point.x, t.y - point.y) <= range)
      .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y) || a.id - b.id)[0];
  }
  private projectile(recipe: Recipe, aim: Point, angle: number, castHits: Set<number>, chainBudget: { remaining: number; conducted?: boolean }, killBudget: { remaining: number }): Projectile {
    const m = recipe.mechanics, speed = clamp(m.speed * (m.element === "earth" ? 0.65 : 1), 40, 640);
    return { ...CASTER, id: this.nextId++, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: m.size,
      damage: m.damage, life: m.lifetime, color: recipe.appearance.color, response: m.wallResponse, bounces: m.bounceLimit, splitCount: m.splitCount, child: false,
      kind: recipe.kind, mechanics: m, hitTargets: new Set(), castHits, pierces: m.pierceCount,
      headingX: Math.cos(angle), headingY: Math.sin(angle), speed, age: 0, chainBudget, killBudget,
      appearance: recipe.appearance, aim: { ...aim }, distance: 0, returning: false, zoneCreated: false,
      start: { ...CASTER }, landingDistance: Math.hypot(aim.x - CASTER.x, aim.y - CASTER.y) };
  }
  cast(input: unknown, aim: Point): boolean {
    const parsed = RecipeSchema.safeParse(input);
    if (!parsed.success || !Number.isFinite(aim.x) || !Number.isFinite(aim.y) || this.projectiles.length + this.pending.length >= LIMITS.active) return false;
    const recipe = parsed.data, m = recipe.mechanics;
    aim = { x: clamp(aim.x, m.size, ROOM.width - m.size), y: clamp(aim.y, m.size, ROOM.height - m.size) };
    const angle = Math.atan2(aim.y - CASTER.y, aim.x - CASTER.x), distance = Math.hypot(aim.x - CASTER.x, aim.y - CASTER.y);
    const count = m.pattern === "burst" ? m.burstCount : m.pattern === "fan" ? m.fanCount : m.pattern === "ring" ? m.ringCount : 1;
    const castHits = new Set<number>(), chainBudget = { remaining: m.chainCount }, killBudget = { remaining: m.killChainCount };
    const available = LIMITS.active - this.projectiles.length - this.pending.length;
    for (let i = 0; i < Math.min(count, available); i++) {
      const heading = angle + (m.pattern === "fan" ? (i / (count - 1) - 0.5) * m.fanAngle * Math.PI / 180 : m.pattern === "ring" ? i * Math.PI * 2 / count : 0);
      const landing = { x: clamp(CASTER.x + Math.cos(heading) * distance, m.size, ROOM.width - m.size), y: clamp(CASTER.y + Math.sin(heading) * distance, m.size, ROOM.height - m.size) };
      const p = this.projectile(recipe, landing, m.flight === "arc" ? Math.atan2(landing.y - CASTER.y, landing.x - CASTER.x) : heading, castHits, chainBudget, killBudget);
      if (m.pattern === "burst" && i > 0) this.pending.push({ at: this.time + i * m.burstInterval, projectile: p });
      else this.projectiles.push(p);
    }
    this.emit({ ...CASTER, kind: "cast", color: recipe.appearance.color, element: m.element });
    this.stats.casts++; return true;
  }
  private displace(enemy: Enemy, dx: number, dy: number) {
    // Shorten blocked pushes deterministically rather than teleporting through props.
    for (let scale = 1; scale >= 1 / 128; scale /= 2) {
      const next = { x: enemy.x + dx * scale, y: enemy.y + dy * scale };
      if (clearSegment(enemy, next, enemy.radius, this.obstacles)) {
        enemy.x = next.x; enemy.y = next.y; enemy.path = route(enemy, enemy.radius, this.obstacles); return;
      }
    }
  }
  private zone(p: Projectile) {
    if (p.zoneCreated || p.mechanics.zone === "none" || this.zones.length >= 64) return;
    p.zoneCreated = true;
    this.zones.push({ x: p.x, y: p.y, id: this.nextId++, element: p.mechanics.zone, radius: p.mechanics.zoneRadius,
      remaining: p.mechanics.zoneDuration, nextTick: 0.5, damage: p.mechanics.zoneDamage, color: p.color });
  }
  private killChild(p: Projectile, target: Target) {
    if (!p.mechanics.chainOnKill || p.child || p.killBudget.remaining <= 0 || this.projectiles.length + this.pending.length + this.children.length >= LIMITS.active) return;
    const next = this.nearest(target, p.mechanics.killChainRange, p.hitTargets); if (!next) return;
    p.killBudget.remaining--;
    const angle = Math.atan2(next.y - target.y, next.x - target.x), radius = Math.max(3, p.radius * 0.58);
    this.children.push({ ...p, id: this.nextId++, x: clamp(target.x, radius, ROOM.width - radius), y: clamp(target.y, radius, ROOM.height - radius),
      kind: "orb", radius, damage: p.mechanics.killChainDamage, vx: Math.cos(angle) * p.speed, vy: Math.sin(angle) * p.speed,
      headingX: Math.cos(angle), headingY: Math.sin(angle), age: 0, distance: 0, life: Math.min(3, p.mechanics.lifetime), child: true,
      returning: false, response: "disappear", hitTargets: new Set(p.hitTargets), zoneCreated: true,
      mechanics: { ...p.mechanics, flight: "straight", onHit: "consume", chainOnKill: false, zone: "none" } });
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Limit catch-up after a suspended tab; game time pauses rather than jumping.
    this.accumulator += Math.min(seconds, 0.25);
    while (this.accumulator + 1e-10 >= TICK) { this.tick(TICK); this.accumulator -= TICK; }
    while (this.recentDamage.length && this.recentDamage[0].at < this.time - DPS_WINDOW) this.recentDamage.shift();
    this.combat.dps = this.recentDamage.reduce((sum, item) => sum + item.amount, 0) / DPS_WINDOW;
    this.combat.peakActive = Math.max(this.combat.peakActive, this.projectiles.length);
  }
  private tick(dt: number) {
    this.time += dt;
    if (this.wave.running && this.time + 1e-9 >= this.wave.nextAt) this.spawnWave();
    this.moveEnemies(dt);
    this.bossTick(dt);
    const combatants = [...this.targets, ...this.enemies];
    for (const target of combatants) for (const key of ["burn", "chill", "poison", "weaken", "stagger"] as const) {
      const status = target.statuses?.[key];
      if (!status) continue;
      if (target.hp <= 0) { delete target.statuses![key]; continue; }
      status.remaining -= dt;
      status.nextTick -= dt;
      if ((key === "burn" || key === "poison") && status.nextTick <= 1e-9) {
        this.damage(target, status.damage, { ...target, kind: "dot", color: status.color, element: key === "burn" ? "fire" : "poison" });
        status.nextTick += key === "burn" ? 0.5 : 1;
      }
      if (status.remaining <= 1e-9) delete target.statuses![key];
    }
    for (const zone of this.zones) {
      zone.remaining -= dt; zone.nextTick -= dt;
      if (zone.nextTick <= 1e-9) {
        zone.nextTick += 0.5;
        for (const t of combatants) if (hittable(t) && Math.hypot(t.x - zone.x, t.y - zone.y) <= zone.radius) {
          this.damage(t, zone.damage, { ...t, kind: "dot", color: zone.color, element: zone.element });
          if (zone.element === "frost" && t.hp > 0) (t.statuses ??= {}).chill = { remaining: 0.6, nextTick: Infinity, damage: 0, color: zone.color };
        }
      }
    }
    this.zones = this.zones.filter(z => z.remaining > 1e-9);
    const due = this.pending.filter(s => s.at <= this.time + 1e-9);
    this.pending = this.pending.filter(s => s.at > this.time + 1e-9);
    this.projectiles.push(...due.map(s => s.projectile));
    const survivors: Projectile[] = []; this.children = [];
    const pullUsed = new Map<number, number>();
    for (const p of this.projectiles) {
      const m = p.mechanics;
      p.speed = clamp(p.speed + m.acceleration * dt, 40, 640);
      const radius = clamp(p.radius + m.sizeGrowth * dt, 3, 44);
      if (clearSegment(p, p, radius, this.obstacles)) p.radius = radius;
      if (m.flight === "homing" || (m.flight === "boomerang" && p.returning)) {
        const target = m.flight === "homing" ? this.nearest(p, Infinity, m.element === "lightning" ? p.castHits : p.hitTargets) : undefined;
        p.targetId = target?.id;
        const goal = m.flight === "boomerang" ? CASTER : target ?? p.aim;
        const current = Math.atan2(p.headingY, p.headingX), desired = Math.atan2(goal.y - p.y, goal.x - p.x);
        const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
        const turn = m.flight === "homing" ? m.turnRate * Math.PI / 180 * dt : Math.PI;
        const angle = current + clamp(delta, -turn, turn); p.headingX = Math.cos(angle); p.headingY = Math.sin(angle);
      }
      const driftRadius = m.flight === "spiral" ? m.spiralRadius : p.kind === "wisp" && m.flight === "straight" ? 8 : 0;
      const rate = m.flight === "spiral" ? m.spiralRate : 6;
      const lateral = driftRadius * (Math.sin((p.age + dt) * rate) - Math.sin(p.age * rate)) / dt;
      const longitudinal = m.flight === "spiral" ? driftRadius * (Math.cos((p.age + dt) * rate) - Math.cos(p.age * rate)) / dt : 0;
      if (driftRadius > 0 || m.flight === "homing" || m.flight === "boomerang" || m.acceleration !== 0) {
        p.vx = p.headingX * (p.speed + longitudinal) - p.headingY * lateral;
        p.vy = p.headingY * (p.speed + longitudinal) + p.headingX * lateral;
      }
      if (m.flight === "spiral") {
        const velocity = Math.hypot(p.vx, p.vy), bounded = clamp(velocity, 40, 640);
        if (velocity > 0) { p.vx *= bounded / velocity; p.vy *= bounded / velocity; }
      }
      for (const enemy of this.enemies) if (hittable(enemy) && m.gravityPull > 0) {
        const distance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
        const step = Math.min(m.gravityPull * dt, 120 * dt - (pullUsed.get(enemy.id) ?? 0), distance);
        if (distance > 0 && distance <= m.gravityRadius && step > 0) {
          this.displace(enemy, (p.x - enemy.x) / distance * step, (p.y - enemy.y) / distance * step);
          pullUsed.set(enemy.id, (pullUsed.get(enemy.id) ?? 0) + step);
        }
      }
      p.age += dt;
      let remaining = Math.min(dt, p.life), alive = p.life > 0;
      p.life -= dt;
      if (m.flight === "arc") remaining = Math.min(remaining, Math.max(0, p.landingDistance - p.distance) / p.speed);
      if (m.flight === "boomerang") remaining = Math.min(remaining, p.returning ? Math.hypot(p.x - CASTER.x, p.y - CASTER.y) / p.speed : Math.max(0, m.maxRange - p.distance) / p.speed);
      for (let impacts = 0; alive && remaining > 1e-9 && impacts < 8; impacts++) {
        const hit = collision(p, remaining, m.flight === "arc" ? [] : combatants, this.obstacles);
        const travel = hit ? hit.time : remaining;
        p.x += p.vx * travel; p.y += p.vy * travel; p.distance += p.speed * travel; remaining -= travel;
        if (!hit) break;
        if (hit.target) {
          this.hit(p, hit.target, p.damage);
          this.zone(p);
          if (p.mechanics.element === "lightning") this.chain(p, hit.target);
          if (p.mechanics.onHit === "explode") this.explode(p);
          alive = p.mechanics.onHit === "pierce" && --p.pierces > 0;
          continue;
        }
        if (m.flight === "arc") {
          this.stats.wallHits++; this.emit({ ...p, kind: "wall", element: m.element });
          if (m.onHit === "explode") this.explode(p);
          this.zone(p); alive = false; break;
        }
        if (m.flight === "boomerang" && !p.returning) {
          this.stats.wallHits++; this.emit({ ...p, kind: "wall", element: m.element });
          p.returning = true; p.headingX = -p.headingX; p.headingY = -p.headingY; break;
        }
        this.stats.wallHits++;
        this.emit({ ...p, kind: p.response === "split" && !p.child ? "split" : "wall", element: p.mechanics.element });
        const roomCorner = Math.abs(hit.nx) === 1 && Math.abs(hit.ny) === 1;
        const length = Math.hypot(hit.nx, hit.ny);
        hit.nx /= length; hit.ny /= length;
        const dot = p.vx * hit.nx + p.vy * hit.ny;
        const vx = roomCorner ? -p.vx : p.vx - 2 * dot * hit.nx, vy = roomCorner ? -p.vy : p.vy - 2 * dot * hit.ny;
        if (p.response === "bounce" && !p.child && p.bounces > 0) {
          p.vx = vx; p.vy = vy; p.bounces--;
          const headingDot = p.headingX * hit.nx + p.headingY * hit.ny;
          p.headingX = roomCorner ? -p.headingX : p.headingX - 2 * headingDot * hit.nx;
          p.headingY = roomCorner ? -p.headingY : p.headingY - 2 * headingDot * hit.ny;
          p.x += hit.nx * EPS; p.y += hit.ny * EPS;
        } else {
          alive = false;
          this.zone(p);
          if (p.response === "disappear" && p.mechanics.onHit === "explode") this.explode(p);
          if (p.response === "split" && !p.child) {
            this.stats.splits++;
            const angle = Math.atan2(vy, vx), speed = p.speed;
            for (let i = 0; i < p.splitCount; i++) {
              const fan = angle + (i / (p.splitCount - 1) - 0.5) * 1.25;
              let dx = Math.cos(fan), dy = Math.sin(fan);
              const inward = dx * hit.nx + dy * hit.ny;
              if (inward < 0) { dx -= 2 * inward * hit.nx; dy -= 2 * inward * hit.ny; }
              if (roomCorner) { dx = Math.abs(dx) * Math.sign(hit.nx); dy = Math.abs(dy) * Math.sign(hit.ny); }
              const radius = Math.max(3, p.radius * 0.58);
              this.children.push({ ...p, id: this.nextId++, x: clamp(p.x + hit.nx * EPS, radius + EPS, ROOM.width - radius - EPS),
                y: clamp(p.y + hit.ny * EPS, radius + EPS, ROOM.height - radius - EPS), vx: dx * speed, vy: dy * speed,
                radius, damage: Math.max(1, Math.round(p.damage * 0.6)), life: Math.max(0, p.life), response: "disappear", bounces: 0, child: true,
                mechanics: { ...p.mechanics, onHit: "consume", wallResponse: "disappear", flight: "straight", chainOnKill: false }, zoneCreated: false, hitTargets: new Set(p.hitTargets),
                headingX: dx, headingY: dy, age: 0 });
            }
          }
        }
      }
      if (alive && m.flight === "arc" && p.distance + 1e-7 >= p.landingDistance) {
        p.x = p.aim.x; p.y = p.aim.y;
        const target = combatants.find(t => hittable(t) && Math.hypot(t.x - p.x, t.y - p.y) <= t.radius + p.radius);
        if (target) { this.hit(p, target, p.damage); if (m.element === "lightning") this.chain(p, target); }
        if (m.onHit === "explode") this.explode(p);
        this.emit({ ...p, kind: "landing", element: m.element }); this.zone(p); alive = false;
      }
      if (alive && m.flight === "boomerang") {
        if (p.returning && Math.hypot(p.x - CASTER.x, p.y - CASTER.y) < EPS) { this.zone(p); alive = false; }
        else if (!p.returning && p.distance + 1e-7 >= m.maxRange) p.returning = true;
      }
      if (p.life <= 1e-9) this.zone(p);
      if (alive && p.life > 1e-9) survivors.push(p);
    }
    this.projectiles = [...survivors, ...this.children.filter(p => p.life > 0)].slice(0, LIMITS.active - this.pending.length);
    this.breakOrbs();
    this.removeDeadEnemies();
  }
  private damage(target: Target, amount: number, event: Impact) {
    if (!hittable(target)) return;
    if ("type" in target && target.type === "golem" && !event.explosion) amount = Math.max(1, Math.round(amount * ENEMY_RULES.resistance));
    amount = Math.max(0, Math.round(amount * (1 + (target.statuses?.weaken?.damage ?? 0))));
    const damage = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    if (damage > 0) {
      this.combat.damage[event.element] = (this.combat.damage[event.element] ?? 0) + damage; this.combat.hits++;
      this.recentDamage.push({ at: this.time, amount: damage });
    }
    if (target.hp === 0) target.statuses = {};
    this.emit({ ...event, damage, targetId: target.id });
  }
  private hit(p: Projectile, target: Target, amount: number, from?: Point, explosion = false) {
    if (!hittable(target) || p.hitTargets.has(target.id) || (p.mechanics.element === "lightning" && p.castHits.has(target.id))) return;
    p.hitTargets.add(target.id); p.castHits.add(target.id);
    if (!from && !explosion && shielded(target, p)) { this.emit({ ...p, kind: "wall", color: "#9fd8ff", element: p.mechanics.element }); return; }
    const m = p.mechanics, statuses = target.statuses ??= {};
    const bonus = (m.element === "frost" && statuses.chill ? m.frostBonus : 0)
      + (m.element === "earth" ? m.earthBonus : 0)
      + (m.element === "holy" && "type" in target && (target.type === "skeleton" || target.type === "wraith") ? m.holyBonus : 0);
    const reaction = reactionFor(m.element, statuses);
    this.stats.targetHits++;
    this.damage(target, amount + bonus + (reaction ? REACTIONS[reaction].bonus : 0), { ...target, kind: from ? "chain" : "target", color: p.color, element: m.element, from, explosion, appearance: p.appearance });
    if (reaction) this.react(reaction, p, target);
    if (target.hp <= 0) { this.killChild(p, target); return; }
    if (reaction && REACTIONS[reaction].consumes) return;
    const refresh = (key: "burn" | "chill" | "poison" | "weaken" | "stagger", duration: number, damage: number, interval: number) => {
      statuses[key] = { remaining: duration, damage, color: p.color, nextTick: statuses[key]?.nextTick ?? interval };
    };
    if (m.element === "earth") refresh("stagger", m.staggerDuration, 0, Infinity);
    if (m.element === "shadow") refresh("weaken", m.weakenDuration, m.weaken, Infinity);
    if (m.element === "wind" && "type" in target) {
      const enemy = target as Enemy, distance = Math.hypot(enemy.x - CASTER.x, enemy.y - CASTER.y) || 1;
      this.displace(enemy, (enemy.x - CASTER.x) / distance * m.knockback, (enemy.y - CASTER.y) / distance * m.knockback);
    }
    if (m.element === "fire") refresh("burn", m.burnDuration, m.burnDamage, 0.5);
    if (m.element === "poison") refresh("poison", m.poisonDuration, m.poisonDamage, 1);
    if (m.element === "frost") refresh("chill", m.chillDuration, 0, Infinity);
  }
  private react(reaction: Reaction, p: Projectile, target: Target) {
    const rule = REACTIONS[reaction], statuses = target.statuses ?? {};
    this.combat.reactions[reaction] = (this.combat.reactions[reaction] ?? 0) + 1;
    for (const key of rule.removes) delete statuses[key];
    if (reaction === "conduct" && !p.chainBudget.conducted) { p.chainBudget.conducted = true; p.chainBudget.remaining++; }
    if (!rule.radius) { this.emit({ ...target, kind: "explosion", color: rule.color, element: p.mechanics.element, radius: 30, explosion: true, reaction }); return; }
    this.emit({ ...target, kind: "explosion", color: rule.color, element: p.mechanics.element, radius: rule.radius, explosion: true, reaction });
    const poison = target.statuses?.poison;
    for (const other of [...this.targets, ...this.enemies]) {
      if (other === target || !hittable(other) || Math.hypot(other.x - target.x, other.y - target.y) > rule.radius) continue;
      this.damage(other, rule.splash, { ...other, kind: "explosion", color: rule.color, element: p.mechanics.element, explosion: true, reaction });
      if (other.hp <= 0) continue;
      const s = other.statuses ??= {};
      if (reaction === "steam" && "type" in other) s.stagger = { remaining: STEAM_BLIND, damage: 0, color: rule.color, nextTick: Infinity };
      if (reaction === "toxic" && poison) s.poison = { ...poison };
    }
  }
  private chain(p: Projectile, initial: Target) {
    let source = initial;
    for (let hop = 1; p.chainBudget.remaining > 0; hop++) {
      const candidates = [...this.targets, ...this.enemies].filter(t => hittable(t) && !p.castHits.has(t.id)
        && Math.hypot(t.x - source.x, t.y - source.y) <= p.mechanics.chainRange);
      candidates.sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y) || a.id - b.id);
      if (!candidates.length) break;
      const next = candidates[0];
      p.chainBudget.remaining--;
      this.hit(p, next, Math.max(1, Math.round(p.damage * 0.6 ** hop)), { x: source.x, y: source.y });
      source = next;
    }
  }
  private explode(p: Projectile) {
    this.emit({ ...p, kind: "explosion", element: p.mechanics.element, radius: p.mechanics.explosionRadius });
    for (const target of [...this.targets, ...this.enemies]) if (Math.hypot(target.x - p.x, target.y - p.y) <= p.mechanics.explosionRadius) {
      const factor = p.mechanics.explosionFalloff === "linear" ? Math.max(0, 1 - Math.hypot(target.x - p.x, target.y - p.y) / p.mechanics.explosionRadius) : 1;
      if (factor > 0) this.hit(p, target, p.mechanics.explosionDamage * factor, undefined, true);
    }
  }
  private emit(event: Impact) { if (this.events.length < 128) this.events.push(event); }
  drainEvents() { const events = this.events; this.events = []; return events; }
}
