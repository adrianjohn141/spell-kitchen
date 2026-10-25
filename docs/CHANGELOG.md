## 2026-10-26 - Public GitHub Repository Setup - Claude Opus 5.5 Agents

### Added
- Added an MIT license, a GitHub Actions CI workflow (typecheck, lint, test, build on Node 24), Dependabot for npm and Actions, a security policy, a contributing guide, a pull request template and a bug report template (`LICENSE`, `.github/`, `SECURITY.md`, `CONTRIBUTING.md`).
- Added `.gitattributes` for line-ending normalization and binary assets, and git-ignored local `.claude/` tooling (`.gitattributes`, `.gitignore`).
- Added CI and license badges plus a License section to the README (`README.md`).

## 2026-10-26 - Survival Mode - Claude Opus 5.5 Agents

### Added
- Added Survival mode (Start survival in the Enemies panel). It clears the room and runs endless waves every 10 seconds. Each wave adds one enemy (up to 12) and 0.15 difficulty (up to 3). The caster has 10 lives; each enemy touch or boss orb costs one, and the run ends at zero. The best wave reached is saved at `spell-kitchen.survival.v1` (`lib/simulation.ts`, `components/arena-scene.ts`, `components/Arena.tsx`, `components/EnemiesPanel.tsx`, `components/Kitchen.tsx`).
- Added deterministic survival tests and a best-wave UI test (`tests/survival.test.ts`, `tests/kitchen.test.tsx`, `tests/arena-input.test.tsx`).

## 2026-10-26 - Calmer Hit Feedback - Claude Opus 5.5 Agents

### Removed
- Removed the strobing hit effects that were uncomfortable to look at: camera shake on explosions, the two bright point-light flashes on explosions and holy hits, and the fast wobble on hit targets and enemies (`components/arena-scene.ts`, `README.md`).

### Changed
- Hits now show a soft tint instead of a white flash. Damage numbers, particles, explosion rings and status markers are unchanged (`components/arena-scene.ts`).

## 2026-10-26 - Remove Post-Processing Options - Claude Opus 5.5 Agents

### Removed
- Removed the color grade, vignette, explosion chromatic aberration and film grain options at the user's request, because they were uncomfortable to look at. The render pipeline is back to bloom only (`components/arena-scene.ts`, `components/Kitchen.tsx`, `lib/settings.ts`, `app/globals.css`, `README.md`).

### Changed
- Settings saved while those options existed still load; their keys are dropped on read (`lib/settings.ts`, `tests/arena.test.ts`, `tests/kitchen.test.tsx`).

## 2026-10-26 - Caster Customization - Claude Opus 5.5 Agents

### Added
- Added cosmetic caster settings: robe color (Violet, Crimson, Emerald, Midnight, Ivory) and hat (Pointed, Wide brim, Hood, Crown, None), plus a gentle idle bob that reduced motion turns off. They are stored with the graphics settings and never touch recipes or gameplay (`lib/settings.ts`, `components/arena-scene.ts`, `components/Kitchen.tsx`, `tests/arena.test.ts`, `tests/kitchen.test.tsx`).

## 2026-10-26 - Post-Processing Options - Claude Opus 5.5 Agents

### Added
- Added Graphics & arena options for a color grade (Natural, Warm, Cool, Noir, Vivid), a vignette, a short chromatic aberration pulse on explosions, and animated film grain. They are built on the existing TSL `RenderPipeline`. Grade and vignette are live uniforms; bloom, aberration and grain rebuild the node graph only when toggled. Any pipeline failure falls back to direct rendering (`lib/settings.ts`, `components/arena-scene.ts`, `components/Kitchen.tsx`, `app/globals.css`).
- Older saved settings gain the new defaults automatically, and tests cover validation and persistence (`tests/arena.test.ts`, `tests/kitchen.test.tsx`).

### Changed
- Low quality skips post-processing entirely. Reduced motion turns off bloom, aberration and grain but keeps grade and vignette.

## 2026-10-26 - Element Reactions and Archmage Construct Boss - Claude Opus 5.5 Agents

### Added
- Added five element reactions: a hit of one element on a target already holding another element's status triggers Steam burst (fire+chill or frost+burn: splash and a short stagger), Toxic flare (fire+poison: spreads poison), Shatter (lightning+chill: +20 damage), Conduct (lightning+poison: one extra chain jump per cast) or Eclipse (holy+weaken: +35 damage). Reactions are counted in combat stats and announced in the arena (`lib/simulation.ts`, `components/arena-scene.ts`, `components/Kitchen.tsx`, `lib/llm.ts`).
- Added the Archmage Construct boss (one at a time, Summon boss in the Enemies panel). Phase 1 summons skeletons, phase 2 (below 66% HP) throws telegraphed orbs that player spells can break, and phase 3 (below 33% HP) adds a spinning shield arc that blocks direct hits from one side. It has a large health bar over the arena, a scaled golem body, a 3D shield wall and glowing orbs (`lib/simulation.ts`, `components/arena-scene.ts`, `components/Arena.tsx`, `components/EnemiesPanel.tsx`, `components/Kitchen.tsx`, `app/globals.css`).
- Added deterministic tests for reactions and every boss phase, orb interception, shield sides and cleanup (`tests/reactions.test.ts`, `tests/boss.test.ts`, `tests/kitchen.test.tsx`, `tests/arena-input.test.tsx`).

## 2026-10-26 - Sandbox Tools, Hotbar, Sharing and Combat Stats - Claude Opus 5.5 Agents

### Added
- Added pause/resume (button or P), a single fixed-tick step while paused, and a 0.25x/0.5x/1x/2x time scale. The fixed-step simulation only receives scaled game time, so results stay deterministic (`components/arena-scene.ts`, `components/Arena.tsx`, `components/Kitchen.tsx`, `lib/simulation.ts`).
- Added combat stats: damage per element, hits, 5-second DPS, and peak active projectiles, tracked in the simulation and cleared on reset (`lib/simulation.ts`, `components/Kitchen.tsx`).
- Added a four-slot spell hotbar that references saved spells, loads them with keys 1-4, persists in localStorage, and clears slots whose spell is deleted (`lib/hotbar.ts`, `components/Kitchen.tsx`).
- Added recipe sharing: copy JSON, copy a `#spell=` link, download a .json file, and import pasted JSON or links. Every import runs migration and full validation, and shared links load on page open (`lib/share.ts`, `components/Kitchen.tsx`).
- Added styles for the new controls (`app/globals.css`) and tests for sharing, hostile input, hotbar persistence, time-scale determinism, stats, and the new UI (`tests/sandbox.test.ts`, `tests/kitchen.test.tsx`, `tests/arena-input.test.tsx`).

## 2026-10-26 - CC0 Workshop Assets and Arena Polish - GPT-6 Agents

### Added
- Bundled 1k Poly Haven stone, brick and wood PBR maps plus a studio HDR environment, and Kenney Mini Dungeon column, chest, pot, potion and banner GLBs with their atlas; documented every file, author, source and CC0 license (`public/assets/polyhaven/`, `public/assets/kenney/mini-dungeon/`, `docs/ASSETS.md`).
- Added independent texture/model/environment loading, a 12-second deadline, procedural fallback, atlas failure detection, collision-sized model fitting and resource cleanup (`components/arena-assets.ts`, `components/arena-scene.ts`, `components/Arena.tsx`).
- Added development-only frame-time diagnostics and focused manifest, resolution, real GLB geometry/bounds, loading/fallback/timeout/disposal and UI tests (`components/Arena.tsx`, `components/arena-scene.ts`, `tests/assets.test.ts`, `tests/asset-loading.test.ts`, `tests/arena-input.test.tsx`).

### Changed
- Replaced loaded floor tiles and procedural masonry detail with textured surfaces, matched environment intensity/rotation to lighting presets, shared merged enemy silhouettes, removed projectile shadow casting, and reduced Low quality shadow/light/mesh costs (`components/arena-scene.ts`).
- Improved visible focus, color/chat touch targets, wrapping, scroll spacing and mobile safe-area clearance (`app/globals.css`).
- Kept recipe v3 and simulation rules unchanged, explicitly excluded asset/diagnostic controls from model recipes, and documented delivery and verification limits (`lib/llm.ts`, `README.md`, `docs/REPORT.md`).

## 2026-10-26 - Expanded Spell Configuration and Stronger Effects - GPT-6 Agents

### Added
- Added bounded wind, earth, shadow and holy elements; single/burst/fan/ring casting; straight/arc/homing/spiral/boomerang flight; acceleration, growth, collision-safe gravity wells, nonrecursive kill children, ticking zones and explosion falloff (`lib/recipe.ts`, `lib/simulation.ts`).
- Added seven native collapsible editor sections with relevant labeled controls and units, separate cosmetic settings, and five labeled examples (`components/Kitchen.tsx`, `app/globals.css`, `lib/recipe.ts`).
- Added wind ribbons, rock chunks and dust, shadow smoke with a TSL rim, holy rays/flashes, flight-specific effects, homing reticles, configurable cosmetic pools, and animated TSL zone decals with reduced-motion handling (`components/arena-scene.ts`).
- Added focused schema/runtime bounds, historical migrations, casting capacity/timing, element effects, flight determinism/steering/landing/return, modifiers, children, zone ticks/falloff, model-output and editor regression tests (`tests/phase-c.test.ts`, `tests/recipe.test.ts`, `tests/llm.test.ts`, `tests/kitchen.test.tsx`).

### Changed
- Bumped recipes to v3 with strict v1/v2 migrations while preserving the original shelf key and saved IDs, names, colors, mechanics and order (`lib/recipe.ts`, `tests/phase-c.test.ts`, `tests/recipe.test.ts`).
- Documented every new mechanic, bound, default, cosmetic and supported homing behavior in the model contract; retained unsupported-request rules and full validation, and increased non-Azure completion budget to 2,000 tokens (`lib/llm.ts`).
- Updated gameplay, controls, persistence and verification documentation (`README.md`, `docs/REPORT.md`).

## 2026-10-26 - Enemies, Placement, and Deterministic Waves - GPT-6 Agents

### Added
- Added five enemy types, bounded nonrecursive slime children, wraith phase immunity, golem resistance, shared elemental hits/statuses/chains/splash, chill movement slowing, caster touch counters, and a 24-living-enemy cap (`lib/simulation.ts`, `lib/recipe.ts`, `lib/settings.ts`).
- Added seeded spawn selection, deterministic obstacle navigation, collision-safe floor placement, bounded wave scheduling, freeze/repeat/clear controls, and separately validated local spawn preferences (`lib/simulation.ts`, `lib/settings.ts`, `components/EnemiesPanel.tsx`, `components/Kitchen.tsx`, `components/Arena.tsx`, `app/globals.css`).
- Added pooled primitive enemy silhouettes, emissive eyes, door portals, hit/status/recoil feedback, damage numbers, death particles, camera-facing health bars, and live reduced-motion handling (`components/arena-scene.ts`).
- Added focused enemy movement/collision/status/limit/wave, spawn persistence/isolation, model-contract, and keyboard input tests (`tests/enemies.test.ts`, `tests/kitchen.test.tsx`, `tests/llm.test.ts`, `tests/arena-input.test.tsx`, `tests/simulation.test.ts`).

### Changed
- Kept recipe v2 and legacy saved-spell migration unchanged while documenting enemy mechanics and forbidding model-controlled enemy spawns or waves (`lib/llm.ts`, `README.md`, `docs/REPORT.md`).

## 2026-10-26 - WebGPU Arena and Expanded Workshop - GPT-6 Agents

### Added
- Added a client-only three.js WebGPU renderer with automatic WebGL2 fallback, an actual-backend badge, a responsive fixed orthographic camera, PBR geometry, soft moonlight shadows, candle and bounded projectile lights, and optional TSL bloom (`components/Arena.tsx`, `components/arena-scene.ts`, `components/arena-view.ts`, `components/Kitchen.tsx`, `package.json`, `package-lock.json`).
- Added validated, separately persisted Low/Medium/High graphics, four lighting presets, and Workshop/Open hall layout controls (`lib/settings.ts`, `components/Kitchen.tsx`, `app/globals.css`).
- Added exact swept pillar and floor-prop collisions, shared obstacle geometry, and focused tests for fast shots, rounded corners, all wall responses, layout determinism, initial example behavior, camera fitting, model instructions, and settings isolation (`lib/simulation.ts`, `tests/arena.test.ts`, `tests/simulation.test.ts`, `tests/spells.test.ts`, `tests/kitchen.test.tsx`).

### Changed
- Expanded the flat simulation to 800 x 600 world units, repositioned training targets, and preserved the recipe v2 schema, legacy migration, deterministic mechanics, and projectile limits (`lib/simulation.ts`).
- Ported trails, impacts, chain arcs, explosion rings/flashes/shake, staff flashes, floor glows, status markers, target feedback, and damage numbers into bounded three.js pools with live reduced-motion handling (`components/arena-scene.ts`).
- Updated model instructions, renderer/settings/layout documentation, and verification evidence (`lib/llm.ts`, `README.md`, `docs/REPORT.md`).

### Removed
- Removed Phaser presentation, its projection utilities, and its dependency after replacing the arena boundary (`components/Arena.tsx`, `lib/simulation.ts`, `package.json`, `package-lock.json`).

## 2026-10-26 - Floating Spell Assistant and Scrollable Recipe Panel - Claude Opus 5.5 Agents

### Added
- Added a floating circular launcher (bottom right) that opens a chat-style spell assistant with message history, a loading bubble, Enter-to-send, Escape-to-close, and focus return to the launcher (`components/Kitchen.tsx`, `app/globals.css`).
- The assistant input clears after sending; "Generate again" with an empty input retries the last prompt (`components/Kitchen.tsx`).
- Added a launcher, Enter-to-send, and Escape-to-close test; existing generation tests open the assistant first (`tests/kitchen.test.tsx`).

### Changed
- Moved description input, Generate/Cancel, AI status badge, and generation messages from the inline description panel into the assistant; the generation pipeline is unchanged (`components/Kitchen.tsx`).
- Made the recipe panel sticky with its own scroll on desktop and tablet; it stays in normal page flow on small screens (`app/globals.css`).

### Removed
- Removed the inline description panel and its styles (`components/Kitchen.tsx`, `app/globals.css`).

## 2026-10-26 - Elemental Spell System and Effects - GPT-6 Agents

### Added
- Added recipe v2 elements, styles, bounded status and hit settings, style defaults, and four labeled example recipes (`lib/recipe.ts`).
- Added deterministic burn, poison, chill vulnerability, nearest-target lightning chains, pierce hit budgets, area explosions, and swept wisp drift; split children retain their element and consume on hit (`lib/simulation.ts`).
- Added element trails and impacts, chain arcs, explosion floor rings and restrained shake, damage numbers, status markers, staff flash, floor glows, and reduced-motion handling (`components/Arena.tsx`).
- Added grouped, labeled mechanic controls with relevant sub-controls and selectable examples (`components/Kitchen.tsx`, `app/globals.css`).
- Added focused mechanics, determinism, migration, bounds, provider, editor, and saved-data preservation tests (`tests/spells.test.ts`, `tests/recipe.test.ts`, `tests/llm.test.ts`, `tests/kitchen.test.tsx`).

### Changed
- Migrated saved v1 recipes through validation while preserving the original storage key, names, IDs, colors, mechanics, and order; blocked writes after unreadable shelf data (`lib/storage.ts`, `components/Kitchen.tsx`).
- Expanded model instructions with every mechanic, limit, default, preset, and unsupported action; kept full output validation and existing provider configuration (`lib/llm.ts`).
- Documented mechanics, migration, limits, examples, live generation evidence, and remaining browser verification limits (`README.md`, `docs/REPORT.md`).

## 2026-10-26 - Azure OpenAI / Foundry Provider Support - Claude Opus 5.5 Agents

### Added
- Added Azure OpenAI and Azure AI Foundry v1 API support: Azure hosts receive the key in the `api-key` header and use `max_completion_tokens` instead of `temperature`/`max_tokens` (`lib/llm.ts`).
- Added optional `SPELL_LLM_API_VERSION` (appended as the `api-version` query, enabling Azure deployments URLs) and `SPELL_LLM_REASONING_EFFORT` (sent as `reasoning_effort`) settings (`lib/llm.ts`).
- Added Azure adapter tests and Azure setup documentation (`tests/llm.test.ts`, `README.md`, `.env.example`).

## 2026-10-26 - Playable Spell Kitchen - GPT-6 Agents

### Added
- Created a Next.js App Router application with TypeScript, Phaser, Zod, and Vitest (`package.json`, `app/layout.tsx`, `app/page.tsx`, `vitest.config.ts`).
- Added a fixed isometric workshop, continuous projectile collisions, bounded wall responses, target damage, and reset controls (`components/Arena.tsx`, `lib/simulation.ts`).
- Added a validated recipe editor, local saved spells, and an OpenAI-compatible server-side generation proxy (`components/Kitchen.tsx`, `lib/recipe.ts`, `lib/storage.ts`, `lib/llm.ts`, `app/api/generate/route.ts`).
- Documented setup, recipe limits, model configuration, and verification evidence, with simulation, schema, provider, and editor tests (`README.md`, `.env.example`, `docs/REPORT.md`, `tests/simulation.test.ts`, `tests/recipe.test.ts`, `tests/llm.test.ts`, `tests/kitchen.test.tsx`).
