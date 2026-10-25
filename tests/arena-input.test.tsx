// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Arena, { type ArenaControls } from "../components/Arena";
import { DEFAULT_RECIPE } from "../lib/recipe";
import { DEFAULT_SETTINGS, DEFAULT_SPAWN_SETTINGS } from "../lib/settings";
import { createArena } from "../components/arena-scene";

const { controls, dispose } = vi.hoisted(() => ({ controls: { cast: vi.fn(), reset: vi.fn(), nudge: vi.fn(), spawn: vi.fn(), place: vi.fn(), placeAtAim: vi.fn(), startWaves: vi.fn(), stopWaves: vi.fn(), clearEnemies: vi.fn(), spawnBoss: vi.fn(), startSurvival: vi.fn(), setTime: vi.fn(), step: vi.fn() }, dispose: vi.fn() }));
vi.mock("../components/arena-scene", () => ({ createArena: vi.fn(async () => ({ controls, dispose })) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("supports focused placement, arrows, casting, repeat prevention, cancellation, and disposal", async () => {
  const ready = vi.fn<(controls: ArenaControls | null) => void>();
  const view = render(<Arena recipe={DEFAULT_RECIPE} settings={DEFAULT_SETTINGS} spawnSettings={DEFAULT_SPAWN_SETTINGS} onReady={ready} onSnapshot={vi.fn()} onBackend={vi.fn()} />);
  await waitFor(() => expect(ready).toHaveBeenCalledWith(controls));
  const arena = screen.getByRole("application"); arena.focus();
  fireEvent.keyDown(arena, { key: "ArrowLeft" }); expect(controls.nudge).toHaveBeenCalledWith(-20, 0);
  fireEvent.keyDown(arena, { key: "Enter" }); expect(controls.placeAtAim).toHaveBeenCalledOnce();
  fireEvent.keyDown(arena, { key: "Enter", repeat: true }); expect(controls.placeAtAim).toHaveBeenCalledOnce();
  fireEvent.keyDown(arena, { key: "Escape" }); expect(controls.place).toHaveBeenCalledWith(false);
  fireEvent.keyDown(arena, { key: " ", code: "Space" }); expect(controls.cast).toHaveBeenCalledOnce();
  fireEvent.keyDown(arena, { key: "Enter", ctrlKey: true }); expect(controls.placeAtAim).toHaveBeenCalledOnce();
  const field = document.createElement("input"); arena.appendChild(field); fireEvent.keyDown(field, { key: "Enter" }); expect(controls.placeAtAim).toHaveBeenCalledOnce();
  field.remove(); view.unmount(); expect(dispose).toHaveBeenCalledOnce(); expect(ready).toHaveBeenLastCalledWith(null);
});

it("announces asset progress and fallback without blocking keyboard play", async () => {
  vi.mocked(createArena).mockImplementationOnce(async (_host, _latest, _snapshot, _backend, _signal, _fail, progress) => {
    progress?.({ loaded: 3, total: 15, failed: 0, done: false }); return { controls, dispose };
  });
  render(<Arena recipe={DEFAULT_RECIPE} settings={DEFAULT_SETTINGS} spawnSettings={DEFAULT_SPAWN_SETTINGS} onReady={vi.fn()} onSnapshot={vi.fn()} onBackend={vi.fn()} />);
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Loading workshop assets · 3/15. Procedural arena stays playable.");
  fireEvent.keyDown(screen.getByRole("application"), { key: " ", code: "Space" }); expect(controls.cast).toHaveBeenCalledOnce();
});

it.each([0, 2])("settles asset state with %i failed loads and hides development diagnostics in production", async failed => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(createArena).mockImplementationOnce(async (_host, _latest, _snapshot, _backend, _signal, _fail, progress) => {
    progress?.({ loaded: 15, total: 15, failed, done: true }); return { controls, dispose };
  });
  try {
    render(<Arena recipe={DEFAULT_RECIPE} settings={DEFAULT_SETTINGS} spawnSettings={DEFAULT_SPAWN_SETTINGS} onReady={vi.fn()} onSnapshot={vi.fn()} onBackend={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/Loading workshop assets/)).toBeNull());
    expect(screen.queryByRole("button", { name: "Diagnostics" })).toBeNull();
    if (failed) expect(screen.getByRole("status").textContent).toContain("2 asset loads failed. Procedural fallback active.");
    else expect(screen.queryByRole("status")).toBeNull();
  } finally { vi.unstubAllEnvs(); }
});

it("toggles labeled frame diagnostics in development without triggering gameplay keys", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.mocked(createArena).mockImplementationOnce(async (_host, _latest, _snapshot, _backend, _signal, _fail, progress, metrics) => {
    progress?.({ loaded: 15, total: 15, failed: 0, done: true });
    metrics?.({ frameMs: 16.7, p95Ms: 18, cpuMs: 4, drawCalls: 120, triangles: 9000, projectiles: 64, enemies: 24 });
    return { controls, dispose };
  });
  try {
    render(<Arena recipe={DEFAULT_RECIPE} settings={DEFAULT_SETTINGS} spawnSettings={DEFAULT_SPAWN_SETTINGS} onReady={vi.fn()} onSnapshot={vi.fn()} onBackend={vi.fn()} />);
    const toggle = await screen.findByRole("button", { name: "Diagnostics" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle); expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/16.7 ms avg/).textContent).toContain("64/64 projectiles · 24/24 enemies");
    fireEvent.keyDown(toggle, { code: "Space", key: " " }); expect(controls.cast).not.toHaveBeenCalled();
    fireEvent.click(toggle); expect(screen.queryByText(/16.7 ms avg/)).toBeNull();
  } finally { vi.unstubAllEnvs(); }
});
