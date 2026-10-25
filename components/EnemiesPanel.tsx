"use client";

import { EnemyTypeSchema, type SpawnSettings } from "../lib/settings";
import type { ArenaControls, Snapshot } from "./Arena";

export default function EnemiesPanel({ settings, onChange, controls, snapshot, notice, bestWave = 0 }: {
  settings: SpawnSettings; onChange: (next: SpawnSettings) => void; controls: ArenaControls | null; snapshot: Snapshot; notice: string; bestWave?: number;
}) {
  const { survival } = snapshot;
  const change = <K extends keyof SpawnSettings>(key: K, value: SpawnSettings[K]) => onChange({ ...settings, [key]: value });
  return <details className="enemies-panel" open>
    <summary>Enemies <span>{snapshot.enemies} / 24 alive</span></summary>
    <div className="enemy-fields">
      <label className="select-field">Enemy type<select value={settings.type} onChange={e => change("type", e.target.value as SpawnSettings["type"])}>{EnemyTypeSchema.options.map(type => <option key={type}>{type}</option>)}</select></label>
      <label className="select-field">Spawn door<select value={settings.door} onChange={e => change("door", e.target.value as SpawnSettings["door"])}>{["north", "east", "south", "west"].map(door => <option key={door}>{door}</option>)}</select></label>
    </div>
    <div className="enemy-actions">
      <button type="button" disabled={!controls || snapshot.enemies >= 24} onClick={() => controls?.spawn()}>Spawn one</button>
      <button type="button" disabled={!controls} aria-pressed={snapshot.placing} onClick={() => controls?.place(!snapshot.placing)}>{snapshot.placing ? "Cancel placement" : "Place"}</button>
    </div>
    <p>Place: tap the floor, or focus the arena, aim with arrows and press Enter. Escape cancels. Blocked positions stay in Place mode.</p>
    <fieldset className="enemy-mix"><legend>Wave type mix</legend>{EnemyTypeSchema.options.map(type => <label key={type}><input type="checkbox" checked={settings.mix.includes(type)} disabled={settings.mix.length === 1 && settings.mix.includes(type)} onChange={e => change("mix", e.target.checked ? [...settings.mix, type] : settings.mix.filter(item => item !== type))} />{type}</label>)}</fieldset>
    <div className="enemy-fields">
      <label className="select-field">Count per wave<input type="number" min={1} max={12} step={1} value={settings.count} onChange={e => change("count", Number(e.target.value))} /></label>
      <label className="select-field">Wave interval (seconds)<input type="number" min={2} max={30} step={0.5} value={settings.interval} onChange={e => change("interval", Number(e.target.value))} /></label>
      <label className="select-field">Difficulty (HP and speed)<input type="number" min={0.5} max={3} step={0.25} value={settings.difficulty} onChange={e => change("difficulty", Number(e.target.value))} /></label>
    </div>
    <div className="enemy-toggles">
      <label><input type="checkbox" checked={settings.frozen} onChange={e => change("frozen", e.target.checked)} />Enemies frozen</label>
      <label><input type="checkbox" checked={settings.keepSpawning} onChange={e => change("keepSpawning", e.target.checked)} />Enemies keep spawning</label>
    </div>
    <div className="enemy-actions">
      <button type="button" disabled={!controls} onClick={() => snapshot.wavesRunning ? controls?.stopWaves() : controls?.startWaves()}>{snapshot.wavesRunning ? "Stop waves" : "Start waves"}</button>
      <button type="button" disabled={!controls} onClick={() => controls?.clearEnemies()}>Clear enemies</button>
      <button type="button" disabled={!controls || !!snapshot.boss} onClick={() => controls?.spawnBoss()}>Summon boss</button>
      <button type="button" disabled={!controls} onClick={() => controls?.startSurvival()}>{survival.active ? "Restart survival" : "Start survival"}</button>
    </div>
    <p className="enemy-counters" role="status">{survival.active ? `Survival · wave ${snapshot.wave} · ${survival.lives} lives left` : survival.over ? `Survival over · reached wave ${snapshot.wave}` : "Survival: not running"} · best wave {bestWave}</p>
    <p className="enemy-counters">Wave {snapshot.wave} · {snapshot.enemies} remaining · {snapshot.kills} kills · {snapshot.casterHits} caster touches</p>
    <p>Boss: the Archmage Construct enters from the east door. Phase 1 summons skeletons, phase 2 throws orbs your spells can shoot down, phase 3 adds a spinning shield that blocks direct hits from one side.</p>
    <p>Survival clears the room and starts endless waves. Each wave adds one enemy and 0.15 difficulty, every 10 seconds. You have 10 lives; each caster touch or boss orb costs one. Stop waves or Clear ends the run.</p>
    <p>First wave starts immediately; later waves follow the interval while Keep spawning is on. Clear stops waves. Reset lab also resets counters.</p>
    {notice ? <p role="status">{notice}</p> : null}
  </details>;
}
