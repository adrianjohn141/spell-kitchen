// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Kitchen from "../components/Kitchen";
import { DEFAULT_RECIPE, EXAMPLES, EXAMPLE_RECIPE } from "../lib/recipe";
import { DEFAULT_SETTINGS, DEFAULT_SPAWN_SETTINGS, SETTINGS_KEY, SPAWN_SETTINGS_KEY, readSettings, readSpawnSettings } from "../lib/settings";
import { STORAGE_KEY, readSpells } from "../lib/storage";
import type { ArenaControls, Snapshot } from "../components/Arena";

const { cast, reset, spawn, place, startWaves, stopWaves, clearEnemies, spawnBoss, startSurvival, setTime, step } = vi.hoisted(() => ({ spawnBoss: vi.fn(), startSurvival: vi.fn(), cast: vi.fn(), reset: vi.fn(), spawn: vi.fn(), place: vi.fn(), startWaves: vi.fn(), stopWaves: vi.fn(), clearEnemies: vi.fn(), setTime: vi.fn(), step: vi.fn() }));
const snapshotSink = vi.hoisted(() => ({ current: null as null | ((snapshot: Snapshot) => void) }));
// The three.js renderer is the external boundary in these DOM component tests.
// Real collision behavior is tested separately through Simulation.
vi.mock("next/dynamic", () => ({ default: () => function RendererBoundary({ onReady, onBackend, onSnapshot, settings, spawnSettings }: { onReady: (controls: ArenaControls | null) => void; onSnapshot: (snapshot: Snapshot) => void; onBackend: (backend: "WebGL fallback") => void; settings: typeof DEFAULT_SETTINGS; spawnSettings: typeof DEFAULT_SPAWN_SETTINGS }) {
  useEffect(() => { onReady({ cast, reset, nudge: () => {}, spawn, place, placeAtAim: () => {}, startWaves, stopWaves, clearEnemies, spawnBoss, startSurvival, setTime, step }); onBackend("WebGL fallback"); snapshotSink.current = onSnapshot; return () => onReady(null); }, [onReady, onBackend, onSnapshot]);
  return <><div data-testid="renderer-settings">{JSON.stringify(settings)}</div><div data-testid="renderer-enemies">{JSON.stringify(spawnSettings)}</div></>;
} }));
const fetchMock = vi.fn<typeof fetch>();
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
function recipeData() { return JSON.parse(document.querySelector("pre")!.textContent!); }
function openChat() { fireEvent.click(screen.getByRole("button", { name: "Open spell assistant" })); }
async function mounted() { render(<Kitchen />); openChat(); await screen.findByText("AI CONFIGURED"); }
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockImplementation(async () => json({ configured: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("manual editor and local shelf", () => {
  it("groups gameplay controls and only exposes relevant settings", async () => {
    await mounted();
    expect(screen.queryByLabelText("Chain count")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Element" }), { target: { value: "lightning" } });
    fireEvent.change(screen.getByLabelText("Chain count"), { target: { value: "4" } });
    expect(recipeData().mechanics).toMatchObject({ element: "lightning", chainCount: 4 });
    fireEvent.change(screen.getByRole("combobox", { name: "Style" }), { target: { value: "bolt" } });
    expect(recipeData()).toMatchObject({ kind: "bolt", mechanics: { size: 10, speed: 440 } });
    fireEvent.change(screen.getByRole("combobox", { name: "On hit" }), { target: { value: "pierce" } });
    fireEvent.change(screen.getByLabelText("Pierce count"), { target: { value: "5" } });
    expect(screen.queryByLabelText("Explosion radius")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "On hit" }), { target: { value: "explode" } });
    fireEvent.change(screen.getByLabelText("Explosion radius"), { target: { value: "120" } });
    expect(screen.queryByLabelText("Pierce count")).toBeNull();
    expect(recipeData().mechanics).toMatchObject({ onHit: "explode", explosionRadius: 120 });
    for (const [element, control] of [["fire", "Burn damage"], ["frost", "Chilled hit bonus"], ["poison", "Poison duration"]]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Element" }), { target: { value: element } });
      expect(screen.getByLabelText(control)).toBeDefined(); expect(screen.queryByLabelText("Chain count")).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Frost color" }));
    expect(recipeData().mechanics.element).toBe("poison"); // Color remains cosmetic.
  });
  it("edits phase C relevant controls and keeps cosmetics separate", async () => {
    await mounted();
    expect([...document.querySelectorAll("details.mechanic-group > summary")].map(el => el.textContent)).toEqual(["Core", "Element", "Casting", "Flight", "Impact", "Wall", "Visuals"]);
    expect(screen.queryByLabelText("Homing turn rate")).toBeNull();
    fireEvent.change(screen.getByLabelText("Flight path"), { target: { value: "homing" } });
    fireEvent.change(screen.getByLabelText("Homing turn rate"), { target: { value: "270" } });
    fireEvent.change(screen.getByLabelText("Casting pattern"), { target: { value: "fan" } });
    fireEvent.change(screen.getByLabelText("Fan projectiles"), { target: { value: "7" } });
    expect(screen.queryByLabelText("Burst interval")).toBeNull();
    fireEvent.change(screen.getByLabelText("Lingering zone"), { target: { value: "poison" } });
    fireEvent.change(screen.getByLabelText("Zone duration"), { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText("Chain on kill"));
    fireEvent.change(screen.getByLabelText("Kill child budget"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Gravity well pull"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Gravity well radius"), { target: { value: "130" } });
    for (const [element, control] of [["wind", "Wind knockback"], ["earth", "Stagger stun"], ["shadow", "Weaken bonus"], ["holy", "Undead bonus"]]) {
      fireEvent.change(screen.getByLabelText("Element"), { target: { value: element } }); expect(screen.getByLabelText(control)).toBeDefined();
    }
    const mechanics = recipeData().mechanics;
    fireEvent.change(screen.getByLabelText("Secondary color"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("Glow intensity"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Mesh detail"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Element"), { target: { value: "wind" } });
    expect(recipeData().appearance).toMatchObject({ secondaryColor: "#123456", glow: 3, meshDetail: "high" });
    expect(recipeData().mechanics).toEqual({ ...mechanics, element: "wind" });
    expect(recipeData().mechanics).toMatchObject({ flight: "homing", turnRate: 270, pattern: "fan", fanCount: 7, zone: "poison", zoneDuration: 7, chainOnKill: true, killChainCount: 4, gravityPull: 80, gravityRadius: 130 });
    expect(cast).not.toHaveBeenCalled();
  });
  it("loads every labeled example without casting or overwriting the shelf", async () => {
    await mounted();
    for (const [index, { recipe: { kind, mechanics: { element } } }] of EXAMPLES.entries()) {
      fireEvent.change(screen.getByLabelText("Example recipes"), { target: { value: String(index) } });
      expect(recipeData()).toMatchObject({ version: 3, kind, mechanics: { element } });
    }
    expect(cast).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
  it("loads a legacy spell then saves v3 without losing other saved spells", async () => {
    const legacy = { id: "legacy", name: "My old orb", recipe: { version: 1, kind: "orb", mechanics: { damage: 19, speed: 93 }, appearance: { color: "#112233" } } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([legacy, { id: "other", name: "Other", recipe: DEFAULT_RECIPE }]));
    await mounted(); fireEvent.click(await screen.findByRole("button", { name: "Load My old orb" }));
    expect(recipeData()).toMatchObject({ version: 3, kind: "orb", mechanics: { damage: 19, speed: 93, element: "arcane", onHit: "consume" }, appearance: { color: "#112233" } });
    fireEvent.click(screen.getByRole("button", { name: "Update saved" }));
    expect(readSpells(localStorage.getItem(STORAGE_KEY)).map(s => s.id)).toEqual(["legacy", "other"]);
  });
  it("preserves unreadable saved data when another save is attempted", async () => {
    const raw = '[{"id":"valuable","name":"Damaged","recipe":{"version":99}}]';
    localStorage.setItem(STORAGE_KEY, raw); await mounted(); await screen.findByText(/Invalid data was not loaded/);
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await screen.findByText(/Saving is blocked to preserve them/);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it("keeps manual casting and all wall controls usable with AI unconfigured", async () => {
    fetchMock.mockResolvedValue(json({ configured: false })); render(<Kitchen />); openChat();
    await screen.findByText("MANUAL MODE");
    expect((screen.getByRole("button", { name: "Generate recipe" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Bounce" }));
    fireEvent.change(screen.getByLabelText("Bounce limit"), { target: { value: "6" } });
    expect(recipeData().mechanics).toMatchObject({ wallResponse: "bounce", bounceLimit: 6 });
    fireEvent.click(screen.getByRole("button", { name: "Disappear" })); expect(recipeData().mechanics.wallResponse).toBe("disappear");
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    fireEvent.change(screen.getByLabelText("Smaller projectiles"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "440" } });
    fireEvent.click(screen.getByRole("button", { name: "Sea glass color" }));
    expect(recipeData()).toMatchObject({ appearance: { ...DEFAULT_RECIPE.appearance, color: "#79d9bf" }, mechanics: { speed: 440, splitCount: 5 } });
    fireEvent.click(screen.getByRole("button", { name: "Cast spell" })); expect(cast).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Reset lab" })); expect(reset).toHaveBeenCalledOnce();
  });
  it("saves, updates, survives a component remount, loads, and deletes a named recipe", async () => {
    const user = userEvent.setup(); await mounted();
    await user.clear(screen.getByLabelText("Name your spell")); await user.type(screen.getByLabelText("Name your spell"), "Shelf proof");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(readSpells(localStorage.getItem(STORAGE_KEY))[0].name).toBe("Shelf proof");
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "440" } });
    await user.click(screen.getByRole("button", { name: "Update saved" }));
    expect(readSpells(localStorage.getItem(STORAGE_KEY))[0].recipe.mechanics.speed).toBe(440);
    cleanup(); await mounted();
    await user.click(await screen.findByRole("button", { name: "Load Shelf proof" }));
    expect(recipeData().mechanics.speed).toBe(440);
    await user.click(screen.getByRole("button", { name: "Delete Shelf proof" }));
    expect(readSpells(localStorage.getItem(STORAGE_KEY))).toEqual([]);
  });
  it("rejects a corrupted saved recipe without changing the playable recipe", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "evil", name: "Invalid", recipe: { mechanics: { speed: 99999 } } }]));
    await mounted(); await screen.findByText(/Invalid data was not loaded/);
    expect(recipeData()).toEqual(EXAMPLE_RECIPE); expect(screen.queryByRole("button", { name: "Delete Invalid" })).toBeNull();
  });
  it("reports blocked storage without displaying a falsely saved spell", async () => {
    await mounted(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await screen.findByText(/Could not save to this browser/); expect(screen.queryByRole("button", { name: "Delete Amethyst bloom" })).toBeNull();
  });
});

describe("generation pipeline and races", () => {
  it("opens the assistant from the floating launcher, sends on Enter, and closes on Escape", async () => {
    render(<Kitchen />);
    expect(screen.queryByRole("dialog")).toBeNull();
    openChat(); await screen.findByText("AI CONFIGURED");
    const input = screen.getByLabelText("Describe your spell or ask for a revision");
    expect(document.activeElement).toBe(input);
    fetchMock.mockResolvedValueOnce(json({ status: "ok", recipe: DEFAULT_RECIPE, explanation: "A steady purple orb." }));
    fireEvent.keyDown(input, { key: "Enter" });
    expect((input as HTMLTextAreaElement).value).toBe("");
    await screen.findByText("A steady purple orb.");
    expect(screen.getByText("A slow purple orb that splits into three smaller orbs when it hits a wall.", { selector: ".chat-msg" }).className).toContain("user");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open spell assistant" }));
  });
  it("shows loading, applies validated API output, and leaves casting explicit", async () => {
    await mounted(); const pending = deferred(); fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));
    expect(screen.getByRole("button", { name: "Generate again" }).getAttribute("aria-busy")).toBe("true");
    expect(recipeData()).toEqual(EXAMPLE_RECIPE);
    pending.resolve(json({ status: "ok", recipe: DEFAULT_RECIPE, explanation: "A steady purple orb." }));
    await screen.findByText("A steady purple orb."); expect(recipeData()).toEqual(DEFAULT_RECIPE); expect(cast).not.toHaveBeenCalled();
    const options = fetchMock.mock.calls[1][1]; expect(JSON.parse(String(options?.body))).toMatchObject({ currentRecipe: EXAMPLE_RECIPE });
  });
  it.each([
    [{ status: "unsupported", explanation: "Reversing time is unsupported. Try a bouncing orb." }, 422, "Reversing time is unsupported"],
    [{ status: "ok", recipe: { mechanics: { speed: 99999 } }, explanation: "Oops" }, 200, "invalid recipe"],
    [{ error: "The model is unreachable. Your recipe is unchanged." }, 502, "model is unreachable"],
  ])("preserves the current recipe on unsupported or failed generation", async (body, status, message) => {
    await mounted(); fetchMock.mockResolvedValueOnce(json(body, status));
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));
    await screen.findByText(new RegExp(message)); expect(recipeData()).toEqual(EXAMPLE_RECIPE);
    expect(screen.getByRole("button", { name: "Generate recipe" }).getAttribute("aria-busy")).toBe("false");
  });
  it("rejects a late older response even when its transport ignores abort", async () => {
    await mounted(); const old = deferred(), latest = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate again" }));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).description).toBe(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).description);
    const fresh = { ...DEFAULT_RECIPE, appearance: { ...DEFAULT_RECIPE.appearance, color: "#79d9bf" } };
    latest.resolve(json({ status: "ok", recipe: fresh, explanation: "Latest recipe." })); await screen.findByText("Latest recipe.");
    await act(async () => { old.resolve(json({ status: "ok", recipe: DEFAULT_RECIPE, explanation: "Stale recipe." })); });
    expect(recipeData()).toEqual(fresh); expect(screen.queryByText("Stale recipe.")).toBeNull();
  });
  it("manual edits and loading examples invalidate an in-flight result", async () => {
    await mounted(); const old = deferred(); fetchMock.mockReturnValueOnce(old.promise);
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "440" } });
    await act(async () => { old.resolve(json({ status: "ok", recipe: DEFAULT_RECIPE, explanation: "Stale." })); });
    expect(recipeData().mechanics.speed).toBe(440);
    fireEvent.click(screen.getByRole("button", { name: "Load split example" })); expect(recipeData()).toEqual(EXAMPLE_RECIPE);
  });
  it("cancels loading without losing the current recipe", async () => {
    await mounted(); const pending = deferred(); fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Generate recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Generation cancelled. Your recipe is unchanged.");
    await act(async () => { pending.resolve(json({ status: "ok", recipe: DEFAULT_RECIPE, explanation: "Late" })); });
    expect(recipeData()).toEqual(EXAMPLE_RECIPE);
  });
});


describe("enemy controls and isolated storage", () => {
  it("loads and persists spawn controls without rewriting any saved spell or recipe", async () => {
    localStorage.setItem(SPAWN_SETTINGS_KEY, JSON.stringify({ type: "wraith", count: 7, frozen: true }));
    const shelf = JSON.stringify([{ id: "old", name: "Old spell", recipe: { version: 1 } }]); localStorage.setItem(STORAGE_KEY, shelf);
    await mounted();
    expect((screen.getByLabelText("Enemy type") as HTMLSelectElement).value).toBe("wraith");
    fireEvent.change(screen.getByLabelText("Spawn door"), { target: { value: "north" } });
    fireEvent.change(screen.getByLabelText("Count per wave"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Wave interval (seconds)"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Difficulty (HP and speed)"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Enemies keep spawning"));
    expect(readSpawnSettings(localStorage.getItem(SPAWN_SETTINGS_KEY))).toMatchObject({ type: "wraith", door: "north", count: 12, interval: 2, difficulty: 3, frozen: true, keepSpawning: false });
    expect(JSON.parse(screen.getByTestId("renderer-enemies").textContent!)).toEqual(readSpawnSettings(localStorage.getItem(SPAWN_SETTINGS_KEY)));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(shelf); expect(recipeData()).toEqual(EXAMPLE_RECIPE);
    cleanup(); await mounted(); expect((screen.getByLabelText("Count per wave") as HTMLInputElement).value).toBe("12");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(shelf);
  });
  it("offers keyboard buttons for spawning, placement, waves and clear", async () => {
    const user = userEvent.setup(); await mounted();
    for (const [name, action] of [["Spawn one", spawn], ["Place", place], ["Start waves", startWaves], ["Clear enemies", clearEnemies], ["Summon boss", spawnBoss], ["Start survival", startSurvival]] as const) {
      screen.getByRole("button", { name }).focus(); await user.keyboard("{Enter}"); expect(action).toHaveBeenCalledOnce();
    }
    expect(place).toHaveBeenCalledWith(true); expect(cast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("slime")); fireEvent.click(screen.getByLabelText("skeleton"));
    expect((screen.getByLabelText("imp") as HTMLInputElement).disabled).toBe(true);
  });
  it("rejects invalid values and isolates corrupt data and blocked writes", async () => {
    localStorage.setItem(SPAWN_SETTINGS_KEY, '{"count":99}'); await mounted();
    expect(screen.getByText(/Enemy settings could not be read/)).toBeDefined();
    expect(JSON.parse(screen.getByTestId("renderer-enemies").textContent!)).toEqual(DEFAULT_SPAWN_SETTINGS);
    fireEvent.change(screen.getByLabelText("Count per wave"), { target: { value: "13" } });
    expect(screen.getByText(/Use 1–12 enemies/)).toBeDefined(); expect(localStorage.getItem(SPAWN_SETTINGS_KEY)).toBe('{"count":99}');
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.change(screen.getByLabelText("Enemy type"), { target: { value: "golem" } });
    expect(screen.getByText(/Enemy settings apply for this visit/)).toBeDefined();
    expect(JSON.parse(screen.getByTestId("renderer-enemies").textContent!).type).toBe("golem"); expect(recipeData()).toEqual(EXAMPLE_RECIPE);
  });
});

describe("graphics and layout controls", () => {
  it("loads settings and persists graphics without rewriting recipes", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "high", lighting: "moonlight", layout: "open-hall" }));
    const shelf = JSON.stringify([{ id: "legacy", name: "Legacy", recipe: { version: 1 } }]);
    localStorage.setItem(STORAGE_KEY, shelf);
    await mounted();
    expect(screen.getByText("WebGL fallback")).toBeDefined();
    fireEvent.click(screen.getByText("Graphics & arena"));
    expect((screen.getByLabelText("Quality") as HTMLSelectElement).value).toBe("high");
    fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "low" } });
    fireEvent.change(screen.getByLabelText("Lighting preset"), { target: { value: "arcane" } });
    fireEvent.change(screen.getByLabelText("Arena layout"), { target: { value: "workshop" } });
    fireEvent.change(screen.getByLabelText("Hat"), { target: { value: "crown" } }); fireEvent.change(screen.getByLabelText("Robe color"), { target: { value: "emerald" } });
    expect(readSettings(localStorage.getItem(SETTINGS_KEY))).toEqual({ ...DEFAULT_SETTINGS, quality: "low", lighting: "arcane", layout: "workshop", hat: "crown", robe: "emerald" });
    expect(JSON.parse(screen.getByTestId("renderer-settings").textContent!)).toEqual(readSettings(localStorage.getItem(SETTINGS_KEY)));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(shelf);
    expect(recipeData()).toEqual(EXAMPLE_RECIPE);
  });
  it("isolates corrupt settings and blocked writes from the saved shelf", async () => {
    localStorage.setItem(SETTINGS_KEY, '{"quality":"ultra"}');
    await mounted(); expect(screen.getByText(/Graphics settings could not be read/)).toBeDefined();
    expect(JSON.parse(screen.getByTestId("renderer-settings").textContent!)).toEqual(DEFAULT_SETTINGS);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "high" } });
    expect(screen.getByText(/Settings apply for this visit/)).toBeDefined();
    expect(JSON.parse(screen.getByTestId("renderer-settings").textContent!).quality).toBe("high");
  });
});

describe("sandbox tools", () => {
  it("pauses with P or the button, steps only while paused, and ignores shortcuts while typing", async () => {
    await mounted();
    fireEvent.keyDown(window, { key: "p" }); expect(setTime).toHaveBeenLastCalledWith(true, 1);
    fireEvent.click(screen.getByRole("button", { name: "Step" })); expect(step).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Time scale"), { target: { value: "0.25" } }); expect(setTime).toHaveBeenLastCalledWith(true, 0.25);
    fireEvent.click(screen.getByRole("button", { name: /Resume/ })); expect(setTime).toHaveBeenLastCalledWith(false, 0.25);
    expect((screen.getByRole("button", { name: "Step" }) as HTMLButtonElement).disabled).toBe(true);
    const calls = setTime.mock.calls.length;
    fireEvent.keyDown(screen.getByLabelText("Name your spell"), { key: "p" }); expect(setTime.mock.calls.length).toBe(calls);
  });
  it("assigns a saved spell to a hotbar slot, loads it with its number key, and clears it when deleted", async () => {
    await mounted();
    fireEvent.change(screen.getByLabelText("Name your spell"), { target: { value: "Hot one" } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Set hotbar 2 to the loaded saved spell" }));
    expect(JSON.parse(localStorage.getItem("spell-kitchen.hotbar.v1")!)[1]).toBe(readSpells(localStorage.getItem(STORAGE_KEY))[0].id);
    fireEvent.click(screen.getByRole("button", { name: "Load split example" }));
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "440" } });
    fireEvent.keyDown(window, { key: "2" });
    expect(recipeData()).toEqual(EXAMPLE_RECIPE);
    expect(screen.getByRole("button", { name: "Hotbar 2: load Hot one" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Delete Hot one" }));
    expect(screen.getByRole("button", { name: "Hotbar 2: empty" })).toBeDefined();
    expect(JSON.parse(localStorage.getItem("spell-kitchen.hotbar.v1")!)).toEqual([null, null, null, null]);
  });
  it("imports pasted JSON through validation and rejects invalid data without changing the recipe", async () => {
    await mounted();
    fireEvent.change(screen.getByLabelText("Paste recipe JSON or a share link"), { target: { value: JSON.stringify({ mechanics: { speed: 99999 } }) } });
    fireEvent.click(screen.getByRole("button", { name: "Import recipe" }));
    expect(screen.getByText(/Invalid recipe at mechanics.speed/)).toBeDefined(); expect(recipeData()).toEqual(EXAMPLE_RECIPE);
    fireEvent.change(screen.getByLabelText("Paste recipe JSON or a share link"), { target: { value: JSON.stringify(DEFAULT_RECIPE) } });
    fireEvent.click(screen.getByRole("button", { name: "Import recipe" }));
    expect(recipeData()).toEqual(DEFAULT_RECIPE); expect(screen.getByText("Recipe imported. Inspect it, then cast.")).toBeDefined();
  });
describe("survival best wave", () => {
  it("saves the best survival wave and shows it after reload", async () => {
    const base: Snapshot = { active: 0, casts: 0, wallHits: 0, splits: 0, targetHits: 0, health: [100, 100, 100], message: "", enemies: 3, wave: 4, wavesRunning: true, kills: 0, casterHits: 0, placing: false,
      combat: { damage: {}, hits: 0, peakActive: 0, dps: 0, reactions: {} }, boss: null, survival: { active: true, lives: 7, over: false } };
    await mounted();
    act(() => snapshotSink.current!(base));
    expect(screen.getByText(/Survival · wave 4 · 7 lives left · best wave 4/)).toBeDefined();
    act(() => snapshotSink.current!({ ...base, wave: 2, wavesRunning: false, survival: { active: false, lives: 0, over: true } }));
    expect(screen.getByText(/Survival over · reached wave 2 · best wave 4/)).toBeDefined();
    expect(localStorage.getItem("spell-kitchen.survival.v1")).toBe("4");
  });
});
});
