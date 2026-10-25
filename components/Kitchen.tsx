"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ELEMENT_COLORS, EXAMPLES, EXAMPLE_RECIPE, GenerationSchema, LIMITS, RecipeSchema, SPEEDS, STYLE_DEFAULTS, type Recipe } from "../lib/recipe";
import { STORAGE_KEY, readSpells, writeSpells, type SavedSpell } from "../lib/storage";
import { DEFAULT_SETTINGS, DEFAULT_SPAWN_SETTINGS, SETTINGS_KEY, SPAWN_SETTINGS_KEY, SettingsSchema, SpawnSettingsSchema, readSettings, readSpawnSettings, writeSettings, writeSpawnSettings, type Settings, type SpawnSettings } from "../lib/settings";
import type { ArenaControls, Backend, Snapshot } from "./Arena";
import EnemiesPanel from "./EnemiesPanel";
import { REACTIONS, type Reaction } from "../lib/simulation";
import { EMPTY_HOTBAR, HOTBAR_KEY, pruneHotbar, readHotbar, writeHotbar, type Hotbar } from "../lib/hotbar";
import { parseRecipeJson, recipeFromHash, recipeToHash, recipeToJson, SHARE_PREFIX } from "../lib/share";

const Arena = dynamic(() => import("./Arena"), { ssr: false, loading: () => <div className="arena-loading">Lighting the candles<span>Opening your spell lab…</span></div> });
const COLORS = [{ name: "Amethyst", value: "#b998ff" }, { name: "Sea glass", value: "#79d9bf" }, { name: "Ember", value: "#ffac76" }, { name: "Rose", value: "#f28ab4" }, { name: "Frost", value: "#90c8ff" }];
const INITIAL_SNAPSHOT: Snapshot = { active: 0, casts: 0, wallHits: 0, splits: 0, targetHits: 0, health: [100, 100, 100], message: "Aim at the floor. Make a little magic.", enemies: 0, wave: 0, wavesRunning: false, kills: 0, casterHits: 0, placing: false, combat: { damage: {}, hits: 0, peakActive: 0, dps: 0, reactions: {} }, boss: null, survival: { active: false, lives: 0, over: false } };
const SURVIVAL_KEY = "spell-kitchen.survival.v1";
const TIME_SCALES = [0.25, 0.5, 1, 2] as const;
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
function Icon({ name, size = 18 }: { name: "spark" | "wand" | "reset" | "book" | "arrow" | "plus" | "trash" | "flask" | "close"; size?: number }) {
  const paths = {
    close: "M6 6l12 12M18 6 6 18",
    spark: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z",
    wand: "m4 20 12-12m-2-2 4 4M5 3v4M3 5h4m12 10v4m-2-2h4M17 2l.7 2.3L20 5l-2.3.7L17 8l-.7-2.3L14 5l2.3-.7L17 2Z",
    reset: "M3 11a9 9 0 1 1 2.6 7M3 4v7h7",
    book: "M4 3h6a3 3 0 0 1 3 3v15a4 4 0 0 0-4-3H3V3h1Zm9 3a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 3",
    arrow: "M4 12h15m-5-5 5 5-5 5",
    plus: "M12 5v14M5 12h14",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    flask: "M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Slider({ label, value, min, max, step = 1, unit, hint, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; hint?: string; onChange: (value: number) => void }) {
  return <label className="slider-field"><span className="field-label">{label}<span className="field-value">{value}<small>{unit}</small></span></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    {hint ? <span className="field-hint">{hint}</span> : null}</label>;
}

export default function Kitchen() {
  const [recipe, setRecipe] = useState<Recipe>(EXAMPLE_RECIPE);
  const [name, setName] = useState("Amethyst bloom");
  const [example, setExample] = useState(true);
  const [description, setDescription] = useState("A slow purple orb that splits into three smaller orbs when it hits a wall.");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string; error?: boolean }[]>([]);
  const launcher = useRef<HTMLButtonElement>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const chatLog = useRef<HTMLDivElement>(null);
  const lastPrompt = useRef("");
  const say = (role: "user" | "ai", text: string, error = false) => setMessages(list => [...list, { role, text, error }].slice(-30));
  const reply = (error: boolean, text: string) => say("ai", text, error);
  function closeChat() { setChatOpen(false); launcher.current?.focus(); }
  useEffect(() => { if (chatOpen) chatInput.current?.focus(); }, [chatOpen]);
  useEffect(() => { chatLog.current?.scrollTo?.({ top: chatLog.current.scrollHeight }); }, [messages, busy, chatOpen]);
  const [saved, setSaved] = useState<SavedSpell[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [enemyControls, setEnemyControls] = useState<ArenaControls | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [spawnSettings, setSpawnSettings] = useState<SpawnSettings>(DEFAULT_SPAWN_SETTINGS);
  const [spawnNotice, setSpawnNotice] = useState("");
  const [backend, setBackend] = useState<Backend | null>(null);
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState<number>(1);
  const [hotbar, setHotbar] = useState<Hotbar>(EMPTY_HOTBAR);
  const [shareText, setShareText] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const arena = useRef<ArenaControls | null>(null);
  const generation = useRef({ id: 0, controller: null as AbortController | null });
  const onReady = useCallback((controls: ArenaControls | null) => { arena.current = controls; setReady(Boolean(controls)); setEnemyControls(controls); }, []);
  const [bestWave, setBestWave] = useState(0);
  const onSnapshot = useCallback((state: Snapshot) => {
    setSnapshot(state);
    if (state.survival.active) setBestWave(best => {
      if (state.wave <= best) return best;
      try { localStorage.setItem(SURVIVAL_KEY, String(state.wave)); } catch { /* best wave stays for this visit */ }
      return state.wave;
    });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const pendingGeneration = generation.current;
    fetch("/api/generate", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(data => setConfigured(data.configured === true)).catch(() => { if (!controller.signal.aborted) setConfigured(false); });
    queueMicrotask(() => {
      try { setSettings(readSettings(localStorage.getItem(SETTINGS_KEY))); }
      catch { setSettingsNotice("Graphics settings could not be read. Using defaults; saved spells are safe."); }
      try { const best = Number(localStorage.getItem(SURVIVAL_KEY)); if (Number.isInteger(best) && best > 0 && best < 10_000) setBestWave(best); } catch { /* no best wave yet */ }
      try { setSpawnSettings(readSpawnSettings(localStorage.getItem(SPAWN_SETTINGS_KEY))); }
      catch { setSpawnNotice("Enemy settings could not be read. Using defaults; saved spells are safe."); }
      try {
        const spells = readSpells(localStorage.getItem(STORAGE_KEY)); setSaved(spells); setStorageReady(true);
        setHotbar(readHotbar(localStorage.getItem(HOTBAR_KEY), spells.map(spell => spell.id)));
      }
      catch { setStorageNotice("Saved spells could not be read. Invalid data was not loaded; your editor is still playable."); }
      try {
        const shared = recipeFromHash(window.location.hash);
        if (shared) { setRecipe(shared); setName("Shared spell"); setExample(false); setShareNotice("Loaded a shared spell from the link. Save it to keep it."); }
      } catch (error) { setShareNotice(error instanceof Error ? error.message : "Shared spell link is invalid."); }
      if (window.location.hash.startsWith(SHARE_PREFIX)) history.replaceState(null, "", window.location.pathname + window.location.search);
    });
    return () => { controller.abort(); pendingGeneration.controller?.abort(); };
  }, []);
  function changeTime(nextPaused: boolean, scale: number) { setPaused(nextPaused); setTimeScale(scale); arena.current?.setTime(nextPaused, scale); }
  function changeHotbar(next: Hotbar) {
    setHotbar(next);
    try { writeHotbar(localStorage, next); } catch { setStorageNotice("Hotbar applies for this visit but could not be saved."); }
  }
  // Refs keep the window key listener stable while always reading current state.
  const activateSlot = useRef<(index: number) => void>(() => {});
  const togglePause = useRef<() => void>(() => {});
  useEffect(() => {
    activateSlot.current = index => {
      const spell = saved.find(item => item.id === hotbar[index]);
      if (spell) load(spell); else setStorageNotice(`Hotbar slot ${index + 1} is empty. Load a saved spell, then press Set.`);
    };
    togglePause.current = () => changeTime(!paused, timeScale);
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (/^[1-4]$/.test(event.key)) { event.preventDefault(); activateSlot.current(Number(event.key) - 1); }
      else if (event.key === "p" || event.key === "P") { event.preventDefault(); togglePause.current(); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  async function copyText(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setShareNotice(done); }
    catch { setShareText(text); setShareNotice("Clipboard is unavailable. The text is in the box below; copy it from there."); }
  }
  function downloadRecipe() {
    const url = URL.createObjectURL(new Blob([recipeToJson(recipe)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${(name.trim() || "spell").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); setShareNotice("Recipe downloaded as JSON.");
  }
  function importRecipe() {
    const text = shareText.trim(), hashAt = text.indexOf(SHARE_PREFIX);
    try {
      const imported = hashAt >= 0 ? recipeFromHash(text.slice(hashAt)) : parseRecipeJson(text);
      if (imported && applyRecipe(imported)) { setName("Imported spell"); setExample(false); setSelectedId(null); setShareNotice("Recipe imported. Inspect it, then cast."); }
    } catch (error) { setShareNotice(error instanceof Error ? error.message : "Could not import that recipe."); }
  }
  function changeSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
    const valid = SettingsSchema.safeParse({ ...settings, [key]: value });
    if (!valid.success) return;
    const next = valid.data;
    try { setSettings(writeSettings(localStorage, next)); setSettingsNotice(""); }
    catch { setSettings(next); setSettingsNotice("Settings apply for this visit but could not be saved."); }
  }
  function changeSpawnSettings(input: SpawnSettings) {
    const parsed = SpawnSettingsSchema.safeParse(input);
    if (!parsed.success) { setSpawnNotice("Use 1–12 enemies, a 2–30 second interval, and difficulty 0.5–3."); return; }
    try { setSpawnSettings(writeSpawnSettings(localStorage, parsed.data)); setSpawnNotice(""); }
    catch { setSpawnSettings(parsed.data); setSpawnNotice("Enemy settings apply for this visit but could not be saved."); }
  }
  function cancelGeneration() {
    generation.current.controller?.abort(); generation.current.id++; setBusy(false);
  }
  function applyRecipe(input: unknown) {
    const valid = RecipeSchema.safeParse(input);
    if (!valid.success) { reply(true, "Recipe is invalid. Your current spell is unchanged."); return false; }
    cancelGeneration(); setRecipe(valid.data); return true;
  }
  function changeMechanic<K extends keyof Recipe["mechanics"]>(key: K, value: Recipe["mechanics"][K]) {
    if (applyRecipe({ ...recipe, mechanics: { ...recipe.mechanics, [key]: value } })) setExample(false);
  }
  function changeAppearance<K extends keyof Recipe["appearance"]>(key: K, value: Recipe["appearance"][K]) {
    if (applyRecipe({ ...recipe, appearance: { ...recipe.appearance, [key]: value } })) setExample(false);
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    // The input clears on send, so "Generate again" with an empty box retries the last prompt.
    const text = description.trim() || (busy ? lastPrompt.current : "");
    if (text.length < 3) return;
    cancelGeneration();
    lastPrompt.current = text; setDescription("");
    const id = generation.current.id;
    const controller = new AbortController(); generation.current.controller = controller;
    setBusy(true); say("user", text);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text, currentRecipe: recipe }), signal: controller.signal });
      const data = await response.json();
      if (id !== generation.current.id || controller.signal.aborted) return;
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Generation failed.");
      const parsed = GenerationSchema.safeParse(data);
      if (!parsed.success) throw new Error("The model returned an invalid recipe. Your recipe is unchanged.");
      if (parsed.data.status === "unsupported") { reply(true, parsed.data.explanation); return; }
      if (!response.ok) throw new Error("Generation failed. Your recipe is unchanged.");
      setRecipe(parsed.data.recipe); setExample(false); setSelectedId(null);
      reply(false, parsed.data.explanation);
    } catch (error) {
      if (id === generation.current.id && !controller.signal.aborted) reply(true, error instanceof Error ? error.message : "Generation failed. Your recipe is unchanged.");
    } finally { if (id === generation.current.id) setBusy(false); }
  }
  function persist(next: SavedSpell[], message: string) {
    if (!storageReady) { setStorageNotice("Existing saved spells could not be read. Saving is blocked to preserve them; reload after restoring browser storage."); return false; }
    try { writeSpells(localStorage, next); setSaved(next); setStorageNotice(message); return true; }
    catch { setStorageNotice("Could not save to this browser. Storage may be full or blocked; your recipe is still in the editor."); return false; }
  }
  function save(update = false) {
    if (!name.trim()) { setStorageNotice("Give your spell a name before saving."); return; }
    const spell = { id: update && selectedId ? selectedId : crypto.randomUUID(), name: name.trim(), recipe: RecipeSchema.parse(recipe) };
    const next = update ? saved.map(item => item.id === spell.id ? spell : item) : [...saved, spell];
    if (next.length > LIMITS.saved) { setStorageNotice("Your shelf holds 20 spells. Update or delete one to make room."); return; }
    if (persist(next, `“${spell.name}” saved in this browser.`)) setSelectedId(spell.id);
  }
  function load(spell: SavedSpell) {
    if (applyRecipe(spell.recipe)) { setName(spell.name); setSelectedId(spell.id); setExample(false); setStorageNotice(`“${spell.name}” loaded. Ready to cast.`); }
  }
  const m = recipe.mechanics;
  const speedLabel = m.speed <= SPEEDS.slow ? "Slow" : m.speed >= SPEEDS.fast ? "Fast" : "Steady";
  return <main className="shell">
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Spell Kitchen home"><span className="brand-mark"><Icon name="flask" size={25} /><i /></span><span>Spell Kitchen<small>A LITTLE ROOM FOR WILD IDEAS</small></span></Link>
      <div className="header-note"><span className="status-dot" />Your very own magic practice<span className="edition">LAB NO. 001</span></div>
    </header>
    <div className="intro"><div><span className="eyebrow">THE EXPERIMENTAL WORKSHOP</span><h1>What will you <em>conjure?</em></h1><p>A pinch of imagination. A little tinkering. See what happens.</p></div><div className="intro-note"><Icon name="spark" size={27} /><span>No mana limits.<br /><strong>Only possibilities.</strong></span></div></div>
    <div className="workspace">
      <section className="lab-column" aria-labelledby="lab-title">
        <div className="lab-panel">
          <div className="panel-heading"><div><span className="tiny-square" /><h2 id="lab-title">The spell lab</h2><span className="backend-badge" aria-live="polite">{backend ?? "Starting 3D"}</span></div><button className="text-button" onClick={() => arena.current?.reset()} disabled={!ready}><Icon name="reset" size={15} />Reset lab</button></div>
          <div className="time-controls" role="group" aria-label="Simulation time">
            <button type="button" className="text-button" aria-pressed={paused} disabled={!ready} onClick={() => changeTime(!paused, timeScale)}>{paused ? "Resume" : "Pause"}<kbd>P</kbd></button>
            <button type="button" className="text-button" disabled={!ready || !paused} onClick={() => arena.current?.step()}>Step</button>
            <label className="time-scale">Time scale<select value={timeScale} disabled={!ready} onChange={event => changeTime(paused, Number(event.target.value))}>{TIME_SCALES.map(scale => <option key={scale} value={scale}>{scale}x</option>)}</select></label>
            {paused ? <span className="paused-badge" role="status">PAUSED</span> : null}
          </div>
          <details className="graphics-settings"><summary>Graphics & arena</summary><div className="graphics-fields">
            <label className="select-field">Quality<select value={settings.quality} onChange={event => changeSettings("quality", event.target.value as Settings["quality"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="select-field">Lighting preset<select value={settings.lighting} onChange={event => changeSettings("lighting", event.target.value as Settings["lighting"])}><option value="dusk">Dusk workshop</option><option value="torchlit">Torchlit</option><option value="moonlight">Moonlight</option><option value="arcane">Arcane</option></select></label>
            <label className="select-field">Arena layout<select value={settings.layout} onChange={event => changeSettings("layout", event.target.value as Settings["layout"])}><option value="workshop">Workshop</option><option value="open-hall">Open hall</option></select></label>
            <label className="select-field">Robe color<select value={settings.robe} onChange={event => changeSettings("robe", event.target.value as Settings["robe"])}><option value="violet">Violet</option><option value="crimson">Crimson</option><option value="emerald">Emerald</option><option value="midnight">Midnight</option><option value="ivory">Ivory</option></select></label>
            <label className="select-field">Hat<select value={settings.hat} onChange={event => changeSettings("hat", event.target.value as Settings["hat"])}><option value="pointed">Pointed</option><option value="wide">Wide brim</option><option value="hood">Hood</option><option value="crown">Crown</option><option value="none">None</option></select></label>
          </div><p>Changing layout resets the lab. Graphics never change your recipe. Reduced motion disables bloom and decorative motion.</p>{settingsNotice ? <p role="status">{settingsNotice}</p> : null}</details>
          <div className="arena-wrap"><div className="arena-topline"><span><i />{settings.layout === "workshop" ? "WORKSHOP" : "OPEN HALL"} · {settings.lighting.toUpperCase()}</span><span>{snapshot.enemies} ENEMIES · 3 TARGETS</span></div>{snapshot.boss ? <div className="boss-bar" role="status"><span>ARCHMAGE CONSTRUCT · PHASE {snapshot.boss.phase}</span><progress aria-label="Boss health" max={snapshot.boss.maxHp} value={snapshot.boss.hp} /><span>{snapshot.boss.hp} / {snapshot.boss.maxHp}</span></div> : null}<Arena recipe={recipe} settings={settings} spawnSettings={spawnSettings} onBackend={setBackend} onReady={onReady} onSnapshot={onSnapshot} /><div className="arena-hint"><span className="mouse-glyph" />{snapshot.placing ? "PLACE ENEMY · Tap floor or press Enter · Escape cancels" : "Tap the floor to aim & cast"}<span className="hint-divider">/</span><kbd>↑ ↓ ← →</kbd> aim <kbd>Space</kbd> cast when focused</div></div>
          <div className="lab-status"><span><i className={snapshot.active ? "active-dot" : "idle-dot"} />{snapshot.message}</span><span><b data-testid="active-count">{snapshot.active}</b> / 64 active</span></div>
          <div className="cast-bar"><div className="cast-summary"><span className="orb-mini" style={{ "--orb-color": recipe.appearance.color } as React.CSSProperties} /><div><strong>{name || "Untitled spell"}</strong><span>{speedLabel} {m.element} {recipe.kind}<span>·</span>{m.onHit}<span>·</span>{m.damage} damage</span></div></div><button className="cast-button" onClick={() => arena.current?.cast()} disabled={!ready}><Icon name="wand" />Cast spell<Icon name="arrow" size={17} /></button></div>
          <div className="hotbar" role="group" aria-label="Spell hotbar">{hotbar.map((id, index) => {
            const spell = saved.find(item => item.id === id);
            return <div key={index} className={`hotbar-slot ${spell ? "" : "empty"} ${spell && spell.id === selectedId ? "selected" : ""}`}>
              <button type="button" className="hotbar-load" disabled={!spell} aria-label={spell ? `Hotbar ${index + 1}: load ${spell.name}` : `Hotbar ${index + 1}: empty`} onClick={() => activateSlot.current(index)}><kbd>{index + 1}</kbd>{spell ? <><span className="orb-mini" style={{ "--orb-color": spell.recipe.appearance.color } as React.CSSProperties} /><span>{spell.name}</span></> : <span>Empty</span>}</button>
              <button type="button" className="hotbar-set" disabled={!selectedId} title="Put the loaded saved spell in this slot" aria-label={`Set hotbar ${index + 1} to the loaded saved spell`} onClick={() => { const next = [...hotbar] as Hotbar; next[index] = selectedId; changeHotbar(next); }}>Set</button>
              {spell ? <button type="button" className="hotbar-clear" aria-label={`Clear hotbar ${index + 1}`} onClick={() => { const next = [...hotbar] as Hotbar; next[index] = null; changeHotbar(next); }}><Icon name="close" size={12} /></button> : null}
            </div>;
          })}</div>
          <details className="combat-stats"><summary>Combat stats <span>{snapshot.combat.dps} DPS</span></summary>
            <dl><div><dt>Total damage</dt><dd>{Object.values(snapshot.combat.damage).reduce((sum, value) => sum + (value ?? 0), 0)}</dd></div><div><dt>Hits</dt><dd>{snapshot.combat.hits}</dd></div><div><dt>DPS (5 s)</dt><dd>{snapshot.combat.dps}</dd></div><div><dt>Peak projectiles</dt><dd>{snapshot.combat.peakActive}</dd></div><div><dt>Casts</dt><dd>{snapshot.casts}</dd></div><div><dt>Kills</dt><dd>{snapshot.kills}</dd></div></dl>
            {Object.keys(snapshot.combat.damage).length ? <ul className="element-damage">{Object.entries(snapshot.combat.damage).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([element, value]) => <li key={element}><span className="orb-mini" style={{ "--orb-color": ELEMENT_COLORS[element as keyof typeof ELEMENT_COLORS] } as React.CSSProperties} />{element}<b>{value}</b></li>)}</ul> : <p>Cast at targets or enemies to see damage by element. Reset clears stats.</p>}
            {Object.keys(snapshot.combat.reactions).length ? <ul className="element-damage reactions">{Object.entries(snapshot.combat.reactions).map(([reaction, count]) => <li key={reaction}>{REACTIONS[reaction as Reaction].label}<b>×{count}</b></li>)}</ul> : <p>Reactions: hit a chilled target with fire (Steam) or lightning (Shatter), a poisoned one with fire (Toxic flare) or lightning (Conduct), or a weakened one with holy (Eclipse).</p>}
          </details>
        </div>
        <EnemiesPanel settings={spawnSettings} onChange={changeSpawnSettings} controls={enemyControls} snapshot={snapshot} notice={spawnNotice} bestWave={bestWave} />
      </section>
      <aside className="recipe-panel" aria-labelledby="recipe-title"><div className="section-label"><span className="step-number">02</span><h2 id="recipe-title">The recipe</h2><Icon name="flask" size={18} /></div><p className="panel-subtitle">A few ingredients. A spell of your own.</p>
        <div className="recipe-identity"><span className={`orb-preview style-${recipe.kind}`} style={{ "--orb-color": recipe.appearance.color } as React.CSSProperties}><i /><b /><span /></span><div><span className="recipe-type">{m.element.toUpperCase()} {recipe.kind.toUpperCase()}</span><strong>{name || "Untitled spell"}</strong><span className="example-label">{example ? "Example recipe · ready to try" : "Your recipe · ready to cast"}</span></div></div>
        <label className="select-field">Example recipes<select value="" onChange={event => {
          const choice = EXAMPLES[Number(event.target.value)];
          if (choice && applyRecipe(choice.recipe)) { setName(choice.name); setExample(true); setSelectedId(null); }
        }}><option value="" disabled>Choose an example</option>{EXAMPLES.map((item, i) => <option key={item.name} value={i}>Example: {item.name}</option>)}</select></label>
<details className="mechanic-group" open><summary>Core</summary><div className="recipe-section-fields">        <fieldset className="mechanic-group"><legend>Style</legend><label className="select-field"><span className="sr-only">Style</span><select value={recipe.kind} onChange={event => {
          const kind = event.target.value as Recipe["kind"];
          if (applyRecipe({ ...recipe, kind, mechanics: { ...m, ...STYLE_DEFAULTS[kind] } })) setExample(false);
        }}>{Object.keys(STYLE_DEFAULTS).map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label><p className="field-hint">Style resets size and speed to its preset. Wisp drifts gently; collisions stay circular.</p></fieldset>
        <div className="sliders"><Slider label="Size" value={m.size} min={6} max={22} unit="u radius" onChange={value => changeMechanic("size", value)} /><Slider label="Speed" value={m.speed} min={40} max={640} step={10} unit="u/s" hint="Slow 90 · normal 220 · fast 440" onChange={value => changeMechanic("speed", value)} /><div className="slider-pair"><Slider label="Damage" value={m.damage} min={1} max={100} unit="HP" onChange={value => changeMechanic("damage", value)} /><Slider label="Lifetime" value={m.lifetime} min={1} max={12} step={0.5} unit="sec" onChange={value => changeMechanic("lifetime", value)} /></div></div>
</div></details>
<details className="mechanic-group" open><summary>Element</summary><div className="recipe-section-fields">        <fieldset className="mechanic-group"><legend>Element</legend><label className="select-field"><span className="sr-only">Element</span><select value={m.element} onChange={event => {
          const element = event.target.value as Recipe["mechanics"]["element"];
          if (applyRecipe({ ...recipe, appearance: { ...recipe.appearance, color: ELEMENT_COLORS[element] }, mechanics: { ...m, element } })) setExample(false);
        }}>{Object.keys(ELEMENT_COLORS).map(element => <option key={element} value={element}>{element}</option>)}</select></label>
          <p className="field-hint">Element changes gameplay. Suggested color stays editable below.</p>
          {m.element === "fire" ? <><Slider label="Burn damage" value={m.burnDamage} min={1} max={12} unit="HP / 0.5s" onChange={value => changeMechanic("burnDamage", value)} /><Slider label="Burn duration" value={m.burnDuration} min={1} max={5} step={0.5} unit="sec" onChange={value => changeMechanic("burnDuration", value)} /></> : null}
          {m.element === "poison" ? <><Slider label="Poison damage" value={m.poisonDamage} min={1} max={8} unit="HP / sec" onChange={value => changeMechanic("poisonDamage", value)} /><Slider label="Poison duration" value={m.poisonDuration} min={3} max={10} step={0.5} unit="sec" onChange={value => changeMechanic("poisonDuration", value)} /></> : null}
          {m.element === "frost" ? <><Slider label="Chill duration" value={m.chillDuration} min={1} max={5} step={0.5} unit="sec" onChange={value => changeMechanic("chillDuration", value)} /><Slider label="Chilled hit bonus" value={m.frostBonus} min={1} max={30} unit="HP" onChange={value => changeMechanic("frostBonus", value)} /></> : null}
          {m.element === "lightning" ? <><Slider label="Chain count" value={m.chainCount} min={1} max={4} unit="extra targets" onChange={value => changeMechanic("chainCount", value)} /><Slider label="Chain range" value={m.chainRange} min={40} max={240} unit="units" onChange={value => changeMechanic("chainRange", value)} /><p className="field-hint">Nearest living target; 60% damage per hop. Shared cast limit, no repeat hits.</p></> : null}
        </fieldset>
{m.element === "wind" ? <><Slider label="Wind knockback" value={m.knockback} min={0} max={100} step={1} unit="u / hit" onChange={value => changeMechanic("knockback", value)} /></> : null}{m.element === "earth" ? <><Slider label="Earth impact bonus" value={m.earthBonus} min={1} max={40} step={1} unit="HP" onChange={value => changeMechanic("earthBonus", value)} /><Slider label="Stagger stun" value={m.staggerDuration} min={0.1} max={1} step={0.05} unit="sec" onChange={value => changeMechanic("staggerDuration", value)} /><p className="field-hint">Earth travels at 65% base speed (minimum 40 u/s). Stagger pauses enemy movement and touching.</p></> : null}{m.element === "shadow" ? <><Slider label="Weaken bonus" value={m.weaken} min={0} max={1} step={0.05} unit="damage multiplier added" onChange={value => changeMechanic("weaken", value)} /><Slider label="Weaken duration" value={m.weakenDuration} min={1} max={6} step={0.5} unit="sec" onChange={value => changeMechanic("weakenDuration", value)} /></> : null}{m.element === "holy" ? <><Slider label="Undead bonus" value={m.holyBonus} min={1} max={60} step={1} unit="HP vs skeleton / wraith" onChange={value => changeMechanic("holyBonus", value)} /></> : null}</div></details>
<details className="mechanic-group" open><summary>Casting</summary><div className="recipe-section-fields"><label className="select-field">Casting pattern<select value={m.pattern} onChange={event => changeMechanic("pattern", event.target.value as Recipe["mechanics"]["pattern"]) }>{["single", "burst", "fan", "ring"].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>{m.pattern === "burst" ? <><Slider label="Burst shots" value={m.burstCount} min={2} max={5} step={1} unit="shots" onChange={value => changeMechanic("burstCount", value)} /><Slider label="Burst interval" value={m.burstInterval} min={0.08} max={1} step={0.01} unit="sec" onChange={value => changeMechanic("burstInterval", value)} /></> : null}{m.pattern === "fan" ? <><Slider label="Fan projectiles" value={m.fanCount} min={2} max={7} step={1} unit="projectiles" onChange={value => changeMechanic("fanCount", value)} /><Slider label="Fan arc" value={m.fanAngle} min={10} max={160} step={1} unit="degrees" onChange={value => changeMechanic("fanAngle", value)} /></> : null}{m.pattern === "ring" ? <><Slider label="Ring projectiles" value={m.ringCount} min={6} max={16} step={1} unit="projectiles" onChange={value => changeMechanic("ringCount", value)} /></> : null}<p className="field-hint">64 active or scheduled projectiles maximum. Excess shots are refused.</p></div></details>
<details className="mechanic-group" open><summary>Flight</summary><div className="recipe-section-fields"><label className="select-field">Flight path<select value={m.flight} onChange={event => changeMechanic("flight", event.target.value as Recipe["mechanics"]["flight"]) }>{["straight", "arc", "homing", "spiral", "boomerang"].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>{m.flight === "homing" ? <><Slider label="Homing turn rate" value={m.turnRate} min={15} max={360} step={5} unit="degrees/s" onChange={value => changeMechanic("turnRate", value)} /></> : null}{m.flight === "spiral" ? <><Slider label="Spiral width" value={m.spiralRadius} min={0} max={40} step={1} unit="u" onChange={value => changeMechanic("spiralRadius", value)} /><Slider label="Spiral rate" value={m.spiralRate} min={0.5} max={12} step={0.5} unit="radians/s" onChange={value => changeMechanic("spiralRate", value)} /></> : null}{m.flight === "boomerang" ? <><Slider label="Return range" value={m.maxRange} min={60} max={700} step={1} unit="u" onChange={value => changeMechanic("maxRange", value)} /><p className="field-hint">Returns at range or first wall. Choose Pierce to continue after a hit. Lifetime still applies.</p></> : null}{m.flight === "arc" ? <><p className="field-hint">Hits on landing at aim point. Walls and props block the lob; targets do not block flight. Lifetime can expire before landing.</p></> : null}<Slider label="Acceleration" value={m.acceleration} min={-200} max={400} step={10} unit="u/s^2" onChange={value => changeMechanic("acceleration", value)} /><Slider label="Size growth" value={m.sizeGrowth} min={-2} max={4} step={0.25} unit="u radius/s" onChange={value => changeMechanic("sizeGrowth", value)} /><Slider label="Gravity well pull" value={m.gravityPull} min={0} max={120} step={5} unit="u/s" onChange={value => changeMechanic("gravityPull", value)} />{m.gravityPull > 0 ? <><Slider label="Gravity well radius" value={m.gravityRadius} min={20} max={180} step={1} unit="u" onChange={value => changeMechanic("gravityRadius", value)} /></> : null}<p className="field-hint">Speed stays 40-640 u/s; radius stays 3-44 u. Combined wells pull each enemy at most 120 u/s.</p></div></details>
<details className="mechanic-group" open><summary>Impact</summary><div className="recipe-section-fields">        <fieldset className="mechanic-group"><legend>On hit</legend><label className="select-field"><span className="sr-only">On hit</span><select value={m.onHit} onChange={event => changeMechanic("onHit", event.target.value as Recipe["mechanics"]["onHit"])}>{["consume", "pierce", "explode"].map(hit => <option key={hit} value={hit}>{hit}</option>)}</select></label>
          {m.onHit === "pierce" ? <Slider label="Pierce count" value={m.pierceCount} min={1} max={5} unit="targets total" hint="Each target takes damage once, even after a bounce." onChange={value => changeMechanic("pierceCount", value)} /> : null}
          {m.onHit === "explode" ? <><Slider label="Explosion radius" value={m.explosionRadius} min={20} max={140} unit="units" onChange={value => changeMechanic("explosionRadius", value)} /><Slider label="Explosion damage" value={m.explosionDamage} min={1} max={60} unit="HP splash" onChange={value => changeMechanic("explosionDamage", value)} /><p className="field-hint">Direct target takes hit damage once. Nearby target centers take splash. Also explodes on disappear walls.</p></> : null}
        </fieldset>
{m.onHit === "explode" ? <><label className="select-field">Explosion falloff<select value={m.explosionFalloff} onChange={event => changeMechanic("explosionFalloff", event.target.value as Recipe["mechanics"]["explosionFalloff"]) }>{["flat", "linear"].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label></> : null}<label className="recipe-toggle"><input type="checkbox" checked={m.chainOnKill} onChange={e => changeMechanic("chainOnKill", e.target.checked)} />Chain on kill</label>{m.chainOnKill ? <><Slider label="Kill child budget" value={m.killChainCount} min={1} max={4} step={1} unit="orbs / cast" onChange={value => changeMechanic("killChainCount", value)} /><Slider label="Kill chain range" value={m.killChainRange} min={40} max={240} step={1} unit="u" onChange={value => changeMechanic("killChainRange", value)} /><Slider label="Kill child damage" value={m.killChainDamage} min={1} max={50} step={1} unit="HP" onChange={value => changeMechanic("killChainDamage", value)} /><p className="field-hint">Direct, chain and explosion kills spawn a small orb toward a nearby living target. Children cannot create children.</p></> : null}<label className="select-field">Lingering zone<select value={m.zone} onChange={event => changeMechanic("zone", event.target.value as Recipe["mechanics"]["zone"]) }>{["none", "fire", "frost", "poison"].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>{m.zone !== "none" ? <><Slider label="Zone radius" value={m.zoneRadius} min={20} max={140} step={1} unit="u" onChange={value => changeMechanic("zoneRadius", value)} /><Slider label="Zone duration" value={m.zoneDuration} min={0.5} max={8} step={0.5} unit="sec" onChange={value => changeMechanic("zoneDuration", value)} /><Slider label="Zone tick damage" value={m.zoneDamage} min={1} max={15} step={1} unit="HP / 0.5s" onChange={value => changeMechanic("zoneDamage", value)} /><p className="field-hint">One zone per projectile on first impact or expiry. Frost fields also chill. Maximum 64 zones.</p></> : null}</div></details>
<details className="mechanic-group" open><summary>Wall</summary><div className="recipe-section-fields">{m.flight === "arc" ? <p className="field-hint">Arc flight impacts solid walls and props immediately. Wall bounce and split apply to other flight paths.</p> : <>        <fieldset className="wall-field"><legend>Wall response</legend><div className="response-options">{(["disappear", "bounce", "split"] as const).map(response => <button key={response} type="button" aria-pressed={m.wallResponse === response} onClick={() => changeMechanic("wallResponse", response)}><span aria-hidden="true">{response === "disappear" ? "○" : response === "bounce" ? "↶" : "⋔"}</span>{response[0].toUpperCase() + response.slice(1)}</button>)}</div></fieldset>
        <div className="response-detail">{m.wallResponse === "split" ? <><label htmlFor="split-count">Smaller projectiles <select id="split-count" value={m.splitCount} onChange={event => changeMechanic("splitCount", Number(event.target.value))}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} projectiles</option>)}</select></label><p>Fan back into the room. Smaller, gentler, and no further splits.</p></> : m.wallResponse === "bounce" ? <><label htmlFor="bounce-limit">Bounce limit<select id="bounce-limit" value={m.bounceLimit} onChange={event => changeMechanic("bounceLimit", Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} bounces</option>)}</select></label><p>Reflect off the walls, then fade when the limit is reached.</p></> : <p>A brief encounter. The spell fades on its first wall contact.</p>}</div>
</>}</div></details>
<details className="mechanic-group" open><summary>Visuals</summary><div className="recipe-section-fields">        <fieldset className="color-field"><legend>Color <span>Purely cosmetic</span></legend><div className="swatches">{COLORS.map(color => <button key={color.value} type="button" title={color.name} aria-label={`${color.name} color`} aria-pressed={recipe.appearance.color === color.value} className="swatch" style={{ "--swatch": color.value } as React.CSSProperties} onClick={() => { if (applyRecipe({ ...recipe, appearance: { ...recipe.appearance, color: color.value } })) setExample(false); }}><span />{recipe.appearance.color === color.value ? <span className="swatch-check">✓</span> : null}</button>)}<label className="custom-color" title="Custom spell color"><Icon name="plus" size={17} /><input aria-label="Custom spell color" type="color" value={recipe.appearance.color} onChange={event => { if (applyRecipe({ ...recipe, appearance: { ...recipe.appearance, color: event.target.value } })) setExample(false); }} /></label></div></fieldset>
<label className="select-field">Secondary color<input type="color" value={recipe.appearance.secondaryColor} onChange={event => changeAppearance("secondaryColor", event.target.value)} /></label><Slider label="Glow intensity" value={recipe.appearance.glow} min={0} max={4} step={0.05} unit="multiplier" onChange={value => changeAppearance("glow", value)} /><Slider label="Trail length" value={recipe.appearance.trailLength} min={0} max={2} step={0.05} unit="sec" onChange={value => changeAppearance("trailLength", value)} /><Slider label="Particle density" value={recipe.appearance.particleDensity} min={0} max={2} step={0.05} unit="multiplier" onChange={value => changeAppearance("particleDensity", value)} /><Slider label="Light intensity" value={recipe.appearance.lightIntensity} min={0} max={2} step={0.05} unit="multiplier" onChange={value => changeAppearance("lightIntensity", value)} /><label className="select-field">Mesh detail<select value={recipe.appearance.meshDetail} onChange={event => changeAppearance("meshDetail", event.target.value as Recipe["appearance"]["meshDetail"])}>{["low", "medium", "high"].map(value => <option key={value}>{value}</option>)}</select></label></div></details>
        <div className="save-section"><label htmlFor="spell-name">Name your spell</label><input id="spell-name" type="text" maxLength={40} value={name} onChange={event => setName(event.target.value)} /><div className="save-actions"><button className="save-button" onClick={() => save()}><Icon name="book" size={16} />{selectedId ? "Save a copy" : "Save recipe"}<Icon name="plus" size={16} /></button>{selectedId ? <button className="text-button" onClick={() => save(true)}>Update saved</button> : null}</div><span className="local-note">Yours to keep, in this browser.</span></div>
        <details className="share-section"><summary>Share or import</summary>
          <div className="share-actions"><button type="button" className="text-button" onClick={() => copyText(recipeToJson(recipe), "Recipe JSON copied.")}>Copy JSON</button><button type="button" className="text-button" onClick={() => copyText(window.location.origin + window.location.pathname + recipeToHash(recipe), "Share link copied.")}>Copy link</button><button type="button" className="text-button" onClick={downloadRecipe}>Download .json</button></div>
          <label htmlFor="share-text">Paste recipe JSON or a share link</label><textarea id="share-text" value={shareText} maxLength={16000} onChange={event => setShareText(event.target.value)} placeholder="Recipe JSON, or a link ending in #spell=…" />
          <button type="button" className="save-button" disabled={!shareText.trim()} onClick={importRecipe}>Import recipe</button>
          {shareNotice ? <p className="share-notice" role="status">{shareNotice}</p> : null}
        </details>
        <details className="recipe-data"><summary>Inspect recipe data</summary><pre>{JSON.stringify(recipe, null, 2)}</pre></details>
      </aside>
    </div>
    <section className="library" aria-labelledby="library-title"><div className="library-heading"><div><Icon name="book" size={19} /><h2 id="library-title">Your spell shelf</h2><span>{saved.length} / 20</span></div><button className="text-button" onClick={() => { if (applyRecipe(EXAMPLE_RECIPE)) { setName("Amethyst bloom"); setExample(true); setSelectedId(null); } }}>Load split example<Icon name="arrow" size={15} /></button></div>
      {saved.length ? <div className="saved-list">{saved.map(spell => <div className={`saved-spell ${selectedId === spell.id ? "selected" : ""}`} key={spell.id}><button className="load-spell" aria-label={`Load ${spell.name}`} onClick={() => load(spell)}><span className="orb-mini" style={{ "--orb-color": spell.recipe.appearance.color } as React.CSSProperties} /><span><strong>{spell.name}</strong><small>{spell.recipe.mechanics.wallResponse} · {spell.recipe.mechanics.damage} damage</small></span></button><button className="delete-spell" aria-label={`Delete ${spell.name}`} onClick={() => {
        const next = saved.filter(item => item.id !== spell.id);
        if (!persist(next, `“${spell.name}” removed from your shelf.`)) return;
        if (selectedId === spell.id) setSelectedId(null);
        if (hotbar.includes(spell.id)) changeHotbar(pruneHotbar(hotbar, next.map(item => item.id)));
      }}><Icon name="trash" size={16} /></button></div>)}</div> : <div className="empty-shelf"><Icon name="flask" size={22} /><p>A good experiment deserves a name.<span>Save a recipe above and it will be waiting here next time.</span></p></div>}
      <p className="storage-notice" role="status">{storageNotice}</p>
    </section>
    <footer className="site-footer"><span>Made for the joy of <em>“what if?”</em></span><span>DESCRIBE <i /> TINKER <i /> CAST <Icon name="spark" size={12} /></span></footer>
    <output className="sr-only" data-testid="simulation-state" aria-live="off">{JSON.stringify(snapshot)}</output>
    {chatOpen ? <section id="spell-chat" className="chat-window" role="dialog" aria-labelledby="describe-title" onKeyDown={event => { if (event.key === "Escape") closeChat(); }}>
      <div className="chat-header"><span className="chat-avatar"><Icon name="spark" size={16} /></span><div><h2 id="describe-title">Spell assistant</h2><small>Describe a spell or ask for a revision</small></div><span className={`ai-badge ${configured ? "configured" : ""}`}>{configured === null ? "CHECKING AI" : configured ? "AI CONFIGURED" : "MANUAL MODE"}</span><button type="button" className="chat-close" aria-label="Close spell assistant" onClick={closeChat}><Icon name="close" size={16} /></button></div>
      <div className="chat-log" ref={chatLog} role="log" aria-live="polite">
        <p className={`chat-msg ai ${configured === false ? "error" : ""}`}>{configured === false ? "AI needs setup. Connect a model in .env.local; the manual editor is fully playable." : "Describe an idea. I write the recipe, you inspect it, then make it fly. Try elements, piercing, explosions, or splitting."}</p>
        {messages.map((message, i) => <p key={i} className={`chat-msg ${message.role} ${message.error ? "error" : ""}`}>{message.text}</p>)}
        {busy ? <p className="chat-msg ai pending">Interpreting your spell… Manual controls stay ready.</p> : null}
      </div>
      <form className="chat-form" onSubmit={generate}><label htmlFor="description" className="sr-only">Describe your spell or ask for a revision</label><textarea id="description" ref={chatInput} maxLength={1000} minLength={3} value={description} onChange={event => { cancelGeneration(); setDescription(event.target.value); }} onKeyDown={event => {
        // Enter sends, Shift+Enter adds a line, like most chat inputs.
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (configured === true) event.currentTarget.form?.requestSubmit(); }
      }} placeholder="A fast lightning bolt that chains to two targets…" />
        <div className="chat-actions"><small>Enter to send · Shift+Enter for a new line</small><div>{busy ? <button className="text-button" type="button" onClick={() => { cancelGeneration(); reply(false, "Generation cancelled. Your recipe is unchanged."); }}>Cancel</button> : null}<button className="generate-button" type="submit" disabled={configured !== true} aria-busy={busy}><Icon name="spark" size={16} />{busy ? "Generate again" : "Generate recipe"}</button></div></div>
      </form>
    </section> : null}
    <button ref={launcher} type="button" className={`chat-launcher ${configured ? "configured" : ""}`} aria-label={chatOpen ? "Close spell assistant" : "Open spell assistant"} aria-expanded={chatOpen} aria-controls="spell-chat" title="Spell assistant" onClick={() => chatOpen ? closeChat() : setChatOpen(true)}><Icon name={chatOpen ? "close" : "spark"} size={24} />{busy ? <i className="chat-busy" aria-hidden="true" /> : null}</button>
  </main>;
}
