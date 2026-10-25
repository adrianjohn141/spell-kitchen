import { z } from "zod";

export const LayoutSchema = z.enum(["workshop", "open-hall"]);
export const SettingsSchema = z.strictObject({
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  lighting: z.enum(["dusk", "torchlit", "moonlight", "arcane"]).default("dusk"),
  layout: LayoutSchema.default("workshop"),
  robe: z.enum(["violet", "crimson", "emerald", "midnight", "ivory"]).default("violet"),
  hat: z.enum(["pointed", "wide", "hood", "crown", "none"]).default("pointed"),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export const DEFAULT_SETTINGS = SettingsSchema.parse({});
export const SETTINGS_KEY = "spell-kitchen.settings.v1";
export const QUALITY = {
  low: { shadowSize: 512, lights: 2, bloom: false, particles: 96, pixelRatio: 1 },
  medium: { shadowSize: 1024, lights: 4, bloom: true, particles: 256, pixelRatio: 1.5 },
  high: { shadowSize: 2048, lights: 8, bloom: true, particles: 512, pixelRatio: 2 },
} as const;
/** Cosmetic caster robe colors. */
export const ROBES = { violet: 0x9170bc, crimson: 0xa8384a, emerald: 0x3f8f6a, midnight: 0x2f3a6e, ivory: 0xd9d0bf } as const;
export function readSettings(raw: string | null): Settings {
  const data = raw === null ? {} : JSON.parse(raw);
  // Post effects were removed; drop their keys so settings saved while they existed still load.
  if (data && typeof data === "object") for (const key of ["grade", "vignette", "aberration", "grain"]) delete data[key];
  return SettingsSchema.parse(data);
}
export function writeSettings(storage: Pick<Storage, "setItem">, input: unknown): Settings {
  const settings = SettingsSchema.parse(input);
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export const EnemyTypeSchema = z.enum(["slime", "skeleton", "imp", "golem", "wraith"]);
export const SimulationSeedSchema = z.number().int().min(0).max(0xffffffff);
export type EnemyType = z.infer<typeof EnemyTypeSchema>;
export const SpawnSettingsSchema = z.strictObject({
  type: EnemyTypeSchema.default("slime"),
  door: z.enum(["north", "east", "south", "west"]).default("east"),
  mix: z.array(EnemyTypeSchema).min(1).max(5).refine(types => new Set(types).size === types.length).default(["slime", "skeleton", "imp"]),
  count: z.number().int().min(1).max(12).default(4),
  interval: z.number().min(2).max(30).default(8),
  difficulty: z.number().min(0.5).max(3).default(1),
  frozen: z.boolean().default(false),
  keepSpawning: z.boolean().default(true),
});
export type SpawnSettings = z.infer<typeof SpawnSettingsSchema>;
export const DEFAULT_SPAWN_SETTINGS = SpawnSettingsSchema.parse({});
export const SPAWN_SETTINGS_KEY = "spell-kitchen.enemies.v1";
export function readSpawnSettings(raw: string | null): SpawnSettings {
  return SpawnSettingsSchema.parse(raw === null ? {} : JSON.parse(raw));
}
export function writeSpawnSettings(storage: Pick<Storage, "setItem">, input: unknown): SpawnSettings {
  const settings = SpawnSettingsSchema.parse(input);
  storage.setItem(SPAWN_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

// Fixed world rules are validated too; difficulty can only scale HP and speed within these bounds.
export const EnemyStatsSchema = z.strictObject({
  hp: z.number().min(10).max(1500), speed: z.number().min(5).max(360), radius: z.number().min(9).max(26),
});
export const ENEMY_STATS = {
  slime: EnemyStatsSchema.parse({ hp: 120, speed: 32, radius: 22 }),
  skeleton: EnemyStatsSchema.parse({ hp: 70, speed: 62, radius: 15 }),
  imp: EnemyStatsSchema.parse({ hp: 30, speed: 110, radius: 12 }),
  golem: EnemyStatsSchema.parse({ hp: 400, speed: 18, radius: 26 }),
  wraith: EnemyStatsSchema.parse({ hp: 60, speed: 52, radius: 17 }),
} as const;
export const ENEMY_RULES = z.strictObject({
  chillSpeed: z.number().min(0.1).max(1), resistance: z.number().min(0.1).max(1),
  phaseSeconds: z.number().min(0.5).max(2), touchInterval: z.number().min(0.5).max(3), meleeRange: z.number().min(10).max(30),
  splitCount: z.number().int().min(2).max(2), childHp: z.number().min(0.1).max(0.5), childRadius: z.number().min(0.4).max(0.6),
  zigzagSpeed: z.number().min(0).max(1), zigzagFrequency: z.number().min(1).max(10),
}).parse({ chillSpeed: 0.5, resistance: 0.5, phaseSeconds: 1, touchInterval: 1, meleeRange: 18,
  splitCount: 2, childHp: 0.35, childRadius: 0.5, zigzagSpeed: 0.65, zigzagFrequency: 6 });
