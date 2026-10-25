"use client";

import { useEffect, useRef, useState } from "react";
import type { Recipe } from "../lib/recipe";
import type { Settings, SpawnSettings } from "../lib/settings";
import { createArena } from "./arena-scene";
import type { AssetProgress } from "./arena-assets";
import type { CombatStats } from "../lib/simulation";

export type ArenaControls = { cast: () => void; reset: () => void; nudge: (x: number, y: number) => void;
  spawn: () => void; place: (enabled: boolean) => void; placeAtAim: () => void; startWaves: () => void; stopWaves: () => void; clearEnemies: () => void; spawnBoss: () => void; startSurvival: () => void;
  setTime: (paused: boolean, scale: number) => void; step: () => void };
export type Snapshot = { active: number; casts: number; wallHits: number; splits: number; targetHits: number; health: number[]; message: string;
  enemies: number; wave: number; wavesRunning: boolean; kills: number; casterHits: number; placing: boolean; combat: CombatStats;
  boss: { hp: number; maxHp: number; phase: number } | null; survival: { active: boolean; lives: number; over: boolean } };
export type Backend = "WebGPU" | "WebGL fallback";
export type FrameMetrics = { frameMs: number; p95Ms: number; cpuMs: number; drawCalls: number; triangles: number; projectiles: number; enemies: number };
type Props = { recipe: Recipe; settings: Settings; spawnSettings: SpawnSettings; onBackend: (backend: Backend) => void; onReady: (controls: ArenaControls | null) => void; onSnapshot: (snapshot: Snapshot) => void };

export default function Arena({ recipe, settings, spawnSettings, onBackend, onReady, onSnapshot }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ recipe, settings, spawnSettings });
  const controls = useRef<ArenaControls | null>(null);
  const [failed, setFailed] = useState(false);
  const [assets, setAssets] = useState<AssetProgress | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
  const diagnosticState = useRef(false);
  useEffect(() => { latest.current = { recipe, settings, spawnSettings }; diagnosticState.current = diagnostics; }, [recipe, settings, spawnSettings, diagnostics]);
  useEffect(() => {
    if (!host.current) return;
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    const fail = () => { if (!abort.signal.aborted) { setFailed(true); controls.current = null; onReady(null); } };
    createArena(host.current, () => ({ ...latest.current, diagnostics: diagnosticState.current }), onSnapshot, onBackend, abort.signal, fail,
      progress => { if (!abort.signal.aborted) setAssets(progress); },
      sample => { if (!abort.signal.aborted) setMetrics(sample); }).then(arena => {
      if (!arena) return;
      dispose = arena.dispose;
      if (abort.signal.aborted) { dispose(); return; }
      controls.current = arena.controls; onReady(arena.controls);
    }).catch(fail);
    return () => { abort.abort(); dispose?.(); controls.current = null; onReady(null); };
  }, [onReady, onSnapshot, onBackend]);
  return <div ref={host} className="arena-canvas" role="application" aria-label="Spell lab. Tap the floor to aim and cast. Arrow keys aim; Space casts. In Place mode, Enter places an enemy and Escape cancels."
    tabIndex={0} onKeyDown={event => {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === "Space") { event.preventDefault(); if (!event.repeat) controls.current?.cast(); }
      else if (event.key === "Enter") { event.preventDefault(); if (!event.repeat) controls.current?.placeAtAim(); }
      else if (event.key === "Escape") controls.current?.place(false);
      else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        controls.current?.nudge(event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0, event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0);
      }
    }}>
    {!failed && (!assets?.done || assets.failed > 0) ? <p className="asset-status" role="status">{!assets?.done
      ? `Loading workshop assets${assets ? ` · ${assets.loaded}/${assets.total}` : "…"}. Procedural arena stays playable.`
      : `${assets.failed} asset load${assets.failed === 1 ? "" : "s"} failed. Procedural fallback active.`}</p> : null}
    {process.env.NODE_ENV === "development" ? <div className="arena-diagnostics">
      <button type="button" aria-pressed={diagnostics} onClick={() => setDiagnostics(value => !value)}>Diagnostics</button>
      {diagnostics ? <output aria-live="off">{metrics ? `${metrics.frameMs.toFixed(1)} ms avg · ${metrics.p95Ms.toFixed(1)} ms p95 · ${(1000 / metrics.frameMs).toFixed(0)} FPS\nCPU submit ${metrics.cpuMs.toFixed(1)} ms · ${metrics.drawCalls} draws · ${metrics.triangles} triangles\n${metrics.projectiles}/64 projectiles · ${metrics.enemies}/24 enemies` : "Sampling frames…"}</output> : null}
    </div> : null}
    {failed ? <p role="alert">The 3D arena could not start. Use a browser with WebGPU or WebGL2 support, then reload.</p> : null}</div>;
}
