import { z } from "zod";

export const LIMITS = { active: 64, saved: 20, enemies: 24 } as const;
export const SPEEDS = { slow: 90, normal: 220, fast: 440 } as const;
export const ELEMENT_COLORS = { arcane: "#b998ff", fire: "#ffac76", frost: "#90c8ff", lightning: "#ffe680", poison: "#9cde79", wind: "#b5fff1", earth: "#d1a16b", shadow: "#b673ff", holy: "#fff3b0" } as const;
export const STYLE_DEFAULTS = { orb: { size: 14, speed: 220 }, bolt: { size: 10, speed: 440 }, shard: { size: 8, speed: 280 }, wisp: { size: 12, speed: 180 } } as const;
const V2MechanicsSchema = z.strictObject({
  element: z.enum(["arcane", "fire", "frost", "lightning", "poison"]).default("arcane"),
  onHit: z.enum(["consume", "pierce", "explode"]).default("consume"),
  size: z.number().min(6).max(22).optional(),
  speed: z.number().min(40).max(640).optional(),
  damage: z.number().int().min(1).max(100).default(25),
  lifetime: z.number().min(1).max(12).default(6),
  wallResponse: z.enum(["disappear", "bounce", "split"]).default("disappear"),
  bounceLimit: z.number().int().min(0).max(6).default(3),
  splitCount: z.number().int().min(2).max(5).default(3),
  burnDamage: z.number().int().min(1).max(12).default(4),
  burnDuration: z.number().min(1).max(5).default(3),
  poisonDamage: z.number().int().min(1).max(8).default(3),
  poisonDuration: z.number().min(3).max(10).default(6),
  chillDuration: z.number().min(1).max(5).default(3),
  frostBonus: z.number().int().min(1).max(30).default(10),
  chainCount: z.number().int().min(1).max(4).default(2),
  chainRange: z.number().min(40).max(240).default(180),
  pierceCount: z.number().int().min(1).max(5).default(3),
  explosionRadius: z.number().min(20).max(140).default(75),
  explosionDamage: z.number().int().min(1).max(60).default(25),
});
const MechanicsSchema = V2MechanicsSchema.extend({
  element: z.enum(["arcane", "fire", "frost", "lightning", "poison", "wind", "earth", "shadow", "holy"]).default("arcane"),
  knockback: z.number().min(0).max(100).default(45),
  earthBonus: z.number().int().min(1).max(40).default(20),
  staggerDuration: z.number().min(0.1).max(1).default(0.35),
  weaken: z.number().min(0).max(1).default(0.25),
  weakenDuration: z.number().min(1).max(6).default(3),
  holyBonus: z.number().int().min(1).max(60).default(25),
  pattern: z.enum(["single", "burst", "fan", "ring"]).default("single"),
  burstCount: z.number().int().min(2).max(5).default(3),
  burstInterval: z.number().min(0.08).max(1).default(0.15),
  fanCount: z.number().int().min(2).max(7).default(5),
  fanAngle: z.number().min(10).max(160).default(60),
  ringCount: z.number().int().min(6).max(16).default(10),
  flight: z.enum(["straight", "arc", "homing", "spiral", "boomerang"]).default("straight"),
  turnRate: z.number().min(15).max(360).default(120),
  maxRange: z.number().min(60).max(700).default(350),
  spiralRadius: z.number().min(0).max(40).default(18),
  spiralRate: z.number().min(0.5).max(12).default(6),
  acceleration: z.number().min(-200).max(400).default(0),
  sizeGrowth: z.number().min(-2).max(4).default(0),
  gravityRadius: z.number().min(20).max(180).default(90),
  gravityPull: z.number().min(0).max(120).default(0),
  chainOnKill: z.boolean().default(false),
  killChainCount: z.number().int().min(1).max(4).default(2),
  killChainRange: z.number().min(40).max(240).default(180),
  killChainDamage: z.number().int().min(1).max(50).default(15),
  zone: z.enum(["none", "fire", "frost", "poison"]).default("none"),
  zoneRadius: z.number().min(20).max(140).default(60),
  zoneDuration: z.number().min(0.5).max(8).default(3),
  zoneDamage: z.number().int().min(1).max(15).default(4),
  explosionFalloff: z.enum(["flat", "linear"]).default("flat"),
});
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const AppearanceSchema = z.strictObject({
  color: ColorSchema.default("#b998ff"), secondaryColor: ColorSchema.default("#eee0ff"),
  glow: z.number().min(0).max(4).default(1),
  trailLength: z.number().min(0).max(2).default(0.55),
  particleDensity: z.number().min(0).max(2).default(1),
  lightIntensity: z.number().min(0).max(2).default(1),
  meshDetail: z.enum(["low", "medium", "high"]).default("medium"),
});
const V2RecipeSchema = z.strictObject({
  version: z.literal(2), kind: z.enum(["orb", "bolt", "shard", "wisp"]).default("orb"),
  appearance: z.strictObject({ color: ColorSchema.default("#b998ff") }).prefault({}),
  mechanics: V2MechanicsSchema.prefault({}),
});
export const RecipeSchema = z.strictObject({
  version: z.literal(3).default(3),
  kind: z.enum(["orb", "bolt", "shard", "wisp"]).default("orb"),
  appearance: AppearanceSchema.prefault({}),
  mechanics: MechanicsSchema.prefault({}),
}).transform(recipe => ({ ...recipe, mechanics: { ...recipe.mechanics,
  size: recipe.mechanics.size ?? STYLE_DEFAULTS[recipe.kind].size,
  speed: recipe.mechanics.speed ?? STYLE_DEFAULTS[recipe.kind].speed,
} }));
export type Recipe = z.infer<typeof RecipeSchema>;
const LegacyRecipeSchema = z.strictObject({
  version: z.literal(1), kind: z.literal("orb").default("orb"),
  appearance: z.strictObject({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#b998ff") }).prefault({}),
  mechanics: V2MechanicsSchema.pick({ size: true, speed: true, damage: true, lifetime: true, wallResponse: true, bounceLimit: true, splitCount: true }).prefault({}),
});
export function migrateRecipe(input: unknown): Recipe {
  const version = typeof input === "object" && input !== null && "version" in input ? input.version : undefined;
  const old = version === 1 ? LegacyRecipeSchema.parse(input) : version === 2 ? V2RecipeSchema.parse(input) : null;
  return RecipeSchema.parse(old ? { ...old, version: 3 } : input);
}
export const DEFAULT_RECIPE = RecipeSchema.parse({});
export const EXAMPLE_RECIPE = RecipeSchema.parse({ mechanics: { speed: SPEEDS.slow, lifetime: 10, wallResponse: "split" } });
export const EXAMPLES = [
  { name: "Ember split orb", recipe: RecipeSchema.parse({ appearance: { color: ELEMENT_COLORS.fire }, mechanics: { element: "fire", speed: 90, lifetime: 10, wallResponse: "split" } }) },
  { name: "Chain lightning bolt", recipe: RecipeSchema.parse({ kind: "bolt", appearance: { color: ELEMENT_COLORS.lightning }, mechanics: { element: "lightning", chainCount: 2 } }) },
  { name: "Frost shard pierce", recipe: RecipeSchema.parse({ kind: "shard", appearance: { color: ELEMENT_COLORS.frost }, mechanics: { element: "frost", onHit: "pierce" } }) },
  { name: "Poison wisp", recipe: RecipeSchema.parse({ kind: "wisp", appearance: { color: ELEMENT_COLORS.poison }, mechanics: { element: "poison" } }) },
  { name: "Homing frost swarm", recipe: RecipeSchema.parse({ appearance: { color: ELEMENT_COLORS.frost }, mechanics: { element: "frost", pattern: "burst", burstCount: 5, flight: "homing", turnRate: 180 } }) },
  { name: "Meteor arc", recipe: RecipeSchema.parse({ appearance: { color: ELEMENT_COLORS.earth }, mechanics: { element: "earth", flight: "arc", speed: 300, onHit: "explode", explosionFalloff: "linear", zone: "fire" } }) },
  { name: "Shadow ring", recipe: RecipeSchema.parse({ appearance: { color: ELEMENT_COLORS.shadow }, mechanics: { element: "shadow", pattern: "ring", flight: "spiral", gravityPull: 40 } }) },
  { name: "Boomerang wind blade", recipe: RecipeSchema.parse({ kind: "shard", appearance: { color: ELEMENT_COLORS.wind }, mechanics: { element: "wind", flight: "boomerang", onHit: "pierce", maxRange: 300 } }) },
  { name: "Holy fan", recipe: RecipeSchema.parse({ appearance: { color: ELEMENT_COLORS.holy }, mechanics: { element: "holy", pattern: "fan", chainOnKill: true } }) },
] as const;
export const GenerationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok"), recipe: RecipeSchema, explanation: z.string().min(1).max(600) }),
  z.strictObject({ status: z.literal("unsupported"), explanation: z.string().min(1).max(600) }),
]);
export const GenerationRequestSchema = z.strictObject({ description: z.string().trim().min(3).max(1000), currentRecipe: RecipeSchema });
