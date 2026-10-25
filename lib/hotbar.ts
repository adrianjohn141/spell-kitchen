import { z } from "zod";

export const HOTBAR_KEY = "spell-kitchen.hotbar.v1";
export const HOTBAR_SIZE = 4;
export const HotbarSchema = z.array(z.string().min(1).max(80).nullable()).length(HOTBAR_SIZE);
export type Hotbar = z.infer<typeof HotbarSchema>;
export const EMPTY_HOTBAR: Hotbar = [null, null, null, null];

/** Slots reference saved spell IDs; any ID no longer on the shelf is cleared. */
export function pruneHotbar(slots: Hotbar, savedIds: readonly string[]): Hotbar {
  const ids = new Set(savedIds);
  return slots.map(id => id && ids.has(id) ? id : null);
}
export function readHotbar(raw: string | null, savedIds: readonly string[]): Hotbar {
  if (raw === null) return EMPTY_HOTBAR;
  const parsed = HotbarSchema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  return parsed.success ? pruneHotbar(parsed.data, savedIds) : EMPTY_HOTBAR;
}
export function writeHotbar(storage: Pick<Storage, "setItem">, slots: Hotbar) {
  storage.setItem(HOTBAR_KEY, JSON.stringify(HotbarSchema.parse(slots)));
}
