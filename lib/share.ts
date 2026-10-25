import { z } from "zod";
import { migrateRecipe, type Recipe } from "./recipe";

export const SHARE_PREFIX = "#spell=";
const MAX_SHARE_CHARS = 16_000;

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("bad encoding");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

/** Untrusted text from a paste, file, or URL becomes a recipe only through migration and full validation. */
export function parseRecipeJson(text: string): Recipe {
  if (text.length > MAX_SHARE_CHARS) throw new Error("Recipe data is too large.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("That is not valid JSON."); }
  // Accept a bare recipe or a saved-spell shaped object.
  const candidate = data && typeof data === "object" && "recipe" in data ? (data as { recipe: unknown }).recipe : data;
  try { return migrateRecipe(candidate); }
  catch (error) {
    const issue = error instanceof z.ZodError ? error.issues[0] : undefined;
    throw new Error(issue ? `Invalid recipe at ${issue.path.join(".") || "root"}: ${issue.message}` : "Invalid recipe data.");
  }
}
export function recipeToJson(recipe: Recipe) { return JSON.stringify(recipe, null, 2); }
export function recipeToHash(recipe: Recipe) { return SHARE_PREFIX + toBase64Url(JSON.stringify(recipe)); }
export function recipeFromHash(hash: string): Recipe | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  const encoded = hash.slice(SHARE_PREFIX.length);
  if (encoded.length > MAX_SHARE_CHARS) throw new Error("Shared spell link is too long.");
  let text: string;
  try { text = fromBase64Url(encoded); } catch { throw new Error("Shared spell link is damaged."); }
  return parseRecipeJson(text);
}
