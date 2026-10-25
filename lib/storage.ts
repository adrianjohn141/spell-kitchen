import { z } from "zod";
import { LIMITS, RecipeSchema, migrateRecipe } from "./recipe";

export const STORAGE_KEY = "spell-kitchen.recipes.v1";
export const SavedSpellSchema = z.strictObject({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(40), recipe: RecipeSchema });
const SavedListSchema = z.array(SavedSpellSchema).max(LIMITS.saved).refine(items => new Set(items.map(item => item.id)).size === items.length);
export type SavedSpell = z.infer<typeof SavedSpellSchema>;
export function readSpells(raw: string | null): SavedSpell[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  // Preserve the existing key and every saved id/name. Validate the whole list before exposing it.
  return SavedListSchema.parse(Array.isArray(data) ? data.map(item => item && typeof item === "object" && "recipe" in item
    ? { ...item, recipe: migrateRecipe(item.recipe) } : item) : data);
}
export function writeSpells(storage: Pick<Storage, "setItem">, spells: SavedSpell[]) {
  const valid = SavedListSchema.parse(spells);
  storage.setItem(STORAGE_KEY, JSON.stringify(valid));
}
