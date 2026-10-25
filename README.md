# Spell Kitchen

[![CI](https://github.com/adrianjohn141/spell-kitchen/actions/workflows/ci.yml/badge.svg)](https://github.com/adrianjohn141/spell-kitchen/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, playable spell workshop built with Next.js App Router, TypeScript, three.js (WebGPU with WebGL2 fallback), and Zod. Describe a spell with a connected model, or build one entirely with manual controls. Inspect the recipe, cast, experiment, and keep your favorite recipes on a local spell shelf.

## Run

Use Node.js 22.12+ or Node.js 24. Development and verification used Node.js 24.15.0 and npm 11.12.1.

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. Stop the server with Ctrl+C. For a production build:

```powershell
npm run build
npm start
```

No model, API key, database, or account is required for manual play. `.npmrc` places npm's cache in the ignored workspace-local `.npm-cache` directory, so installation works in a workspace-restricted environment.

## Play

1. The initial **Amethyst bloom** is explicitly labeled an example: a slow purple orb that splits into three smaller orbs on a wall. Click **Cast spell** without moving the aim to send it toward the open right wall.
2. Move the pointer across the floor to aim; click or tap the floor to aim and cast together. The crosshair represents a point on the floor, and the orb floats above it.
3. For keyboard play, focus the arena with Tab. Arrow keys move the aim in screen directions; Space casts. Shortcuts only operate inside the focused arena, so typing in the description or spell name does not cast.
4. Choose an **Element**, **Style**, **On hit**, and **Wall response**. Only relevant settings appear. Changing element suggests a color; changing style applies its size/speed preset. Color remains freely editable and cosmetic. Changes apply to the next cast; active spells keep their cast recipe.
5. Targets begin with 100 HP. Direct hits, chains, splash, and status ticks update health and show damage numbers. Burn, chill, and poison have visible icons, tints, and labels. **Reset lab** clears projectiles, enemies, waves, statuses, effects, and counters and restores all targets. Spawn preferences stay saved; waves never start automatically on reload or reset.
6. Name a recipe and **Save recipe**. Loading a saved recipe exposes **Update saved** and **Save a copy**. The trash button deletes that saved spell. The shelf holds 20 recipes in this browser's localStorage; it is not a cloud account.
7. With AI configured, describe a new spell or revise the current recipe and click **Generate recipe**. Generation never casts automatically. Inspect the resulting editor first. You can cancel or generate again; manual edits invalidate pending results.

Select **Example: Ember split orb**, **Example: Chain lightning bolt**, **Example: Frost shard pierce**, or **Example: Poison wisp** in the editor to inspect and cast a labeled preset. The original Amethyst bloom split example remains available on the shelf toolbar. Loading an example does not overwrite saved spells or cast automatically.

The mobile layout stacks the arena, description, editor, and shelf. Element trails (embers, frost sparkles, lightning arcs, poison drips, arcane runes), impact particles, staff flash, floor glows, damage numbers, a soft hit tint, and status markers make hits readable. There is no camera shake or hit strobe. `prefers-reduced-motion` suppresses trails, particles, shake, spin, flicker, and wobble, and bloom, including when the preference changes during play; essential projectile movement and static hit/status indicators remain. Google Fonts supplies Instrument Serif and DM Sans when reachable, with local serif and sans-serif fallbacks.

## Connect a model

The replaceable adapter in [`lib/llm.ts`](lib/llm.ts) uses an OpenAI-compatible `POST /chat/completions` endpoint. Requests use JSON object mode, temperature 0, a 2,000-token output budget, and a 90-second timeout. The selected model must support chat completions and JSON object output.

```powershell
Copy-Item .env.example .env.local
```

Uncomment and fill in one provider configuration, then restart Next.js. The base URL includes `/v1`; the adapter appends `/chat/completions`.

### Ollama

Start Ollama, ensure an installed model is available, and obtain its name with `ollama list`. Model installation and model selection are your choice; the application does not download models.

```dotenv
SPELL_LLM_BASE_URL=http://localhost:11434/v1
SPELL_LLM_MODEL=your-installed-model-name
```

Inspect available models with `Invoke-RestMethod http://localhost:11434/api/tags`. Ollama documents its [OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility).

### LM Studio

Load a chat model in LM Studio and start its local server. Read the model ID from `Invoke-RestMethod http://localhost:1234/v1/models`, then configure:

```dotenv
SPELL_LLM_BASE_URL=http://localhost:1234/v1
SPELL_LLM_MODEL=your-loaded-model-id
```

See LM Studio's [OpenAI-compatible endpoints](https://lmstudio.ai/docs/developer/openai-compat).

### Azure OpenAI / Azure AI Foundry

Deploy a chat model that supports JSON object output (for example `gpt-4.1-mini`) in your Azure OpenAI or Foundry resource. Copy the endpoint and key from the resource's Keys and Endpoint page, then configure:

```dotenv
SPELL_LLM_BASE_URL=https://your-resource.openai.azure.com/openai/v1
SPELL_LLM_MODEL=your-deployment-name
SPELL_LLM_API_KEY=your-azure-key
```

Foundry endpoints on `*.services.ai.azure.com` or `*.cognitiveservices.azure.com` also work with the `/openai/v1` path. The adapter uses Azure's v1 API, so no `api-version` is needed. For Azure hosts it sends the key in the `api-key` header and uses `max_completion_tokens: 4000` without `temperature`, because reasoning deployments reject both `temperature` and `max_tokens`. To use the older deployments URL format instead, set the base URL to `https://your-resource.openai.azure.com/openai/deployments/your-deployment-name` and set `SPELL_LLM_API_VERSION` (for example `2025-04-01-preview`). When it is set, the adapter appends `?api-version=...` to the request URL for any provider. Leave it unset with `/openai/v1` URLs: Azure rejects dated versions there with HTTP 400 `API version not supported`.

`SPELL_LLM_REASONING_EFFORT` is optional for any provider. When it is set, the adapter sends it as `reasoning_effort` (for example `minimal`, `low`, `medium` or `high`). Use it only with reasoning models; other models may reject the field. `low` keeps generation fast, because recipes need little reasoning.

For another compatible provider, set its base URL and model. Set `SPELL_LLM_API_KEY` if it requires authentication. These variables are read only in the server adapter; do not prefix them with `NEXT_PUBLIC_`. `.env.local` is ignored.

`GET /api/generate` exposes only `{ "configured": true/false }`, which indicates environment configuration, not a successful provider connection. `POST /api/generate` receives `{ "description": "...", "currentRecipe": {...} }`. It returns a validated `{ "status": "ok", "recipe": {...}, "explanation": "..." }`, an unsupported explanation with HTTP 422, a configuration error with HTTP 503, or a provider/output error with HTTP 502. Invalid request data returns HTTP 400. Provider credentials and raw provider error bodies are not returned to the browser.

The model receives the supported mechanics, full recipe schema, bounds, defaults, preset meanings, current recipe, and explicit instructions to explain unsupported requests. Time reversal and other unsupported mechanics cannot be executed by the engine. Invalid or failed generation preserves the current recipe. There is no keyword-based fallback presented as AI generation.

## Recipe contract

The strict schema in [`lib/recipe.ts`](lib/recipe.ts) is shared by editor, model responses, local storage, and the simulation's cast boundary. Unknown fields, unsupported mechanics, and values outside these limits are rejected. Omitted properties receive the same defaults everywhere.

```json
{
  "version": 3,
  "kind": "orb",
  "appearance": { "color": "#b998ff", "secondaryColor": "#eee0ff", "glow": 1, "trailLength": 0.55, "particleDensity": 1, "lightIntensity": 1, "meshDetail": "medium" },
  "mechanics": {
    "element": "arcane", "onHit": "consume",
    "size": 14, "speed": 220, "damage": 25, "lifetime": 6,
    "wallResponse": "disappear", "bounceLimit": 3, "splitCount": 3,
    "burnDamage": 4, "burnDuration": 3,
    "poisonDamage": 3, "poisonDuration": 6,
    "chillDuration": 3, "frostBonus": 10,
    "chainCount": 2, "chainRange": 180,
    "pierceCount": 3, "explosionRadius": 75, "explosionDamage": 25,
    "knockback": 45, "earthBonus": 20, "staggerDuration": 0.35,
    "weaken": 0.25, "weakenDuration": 3, "holyBonus": 25,
    "pattern": "single", "burstCount": 3, "burstInterval": 0.15,
    "fanCount": 5, "fanAngle": 60, "ringCount": 10,
    "flight": "straight", "turnRate": 120, "maxRange": 350,
    "spiralRadius": 18, "spiralRate": 6,
    "acceleration": 0, "sizeGrowth": 0, "gravityPull": 0, "gravityRadius": 90,
    "chainOnKill": false, "killChainCount": 2, "killChainRange": 180, "killChainDamage": 15,
    "zone": "none", "zoneRadius": 60, "zoneDuration": 3, "zoneDamage": 4,
    "explosionFalloff": "flat"
  }
}
```

| Property | Allowed values | Default / meaning |
| --- | --- | --- |
| `version` | `3` | Saved v1/v2 recipes migrate on load |
| `kind` (Style) | `orb`, `bolt`, `shard`, `wisp` | `orb`; all use circular world collisions |
| `appearance.color` | Six-digit hex | `#b998ff`; cosmetic, stored explicitly |
| `element` | `arcane`, `fire`, `frost`, `lightning`, `poison`, `wind`, `earth`, `shadow`, `holy` | `arcane` |
| `size` | 6-22 world units | Orb 14, bolt 10, shard 8, wisp 12; circle radius |
| `speed` | 40-640 units/second | Orb 220, bolt 440, shard 280, wisp 180; slow 90, normal 220, fast 440 |
| `damage` | Integer 1-100 HP | 25; direct hit damage |
| `lifetime` | 1-12 seconds | 6 |
| `onHit` | `consume`, `pierce`, `explode` | `consume` |
| `wallResponse` | `disappear`, `bounce`, `split` | `disappear` |
| `bounceLimit` | Integer 0-6 | 3 reflections, then disappear on the next wall |
| `splitCount` | Integer 2-5 | 3 |
| `burnDamage` / `burnDuration` | Integer 1-12 HP / 1-5 seconds | 4 HP every 0.5 seconds for 3 seconds |
| `poisonDamage` / `poisonDuration` | Integer 1-8 HP / 3-10 seconds | 3 HP every second for 6 seconds |
| `chillDuration` / `frostBonus` | 1-5 seconds / integer 1-30 HP | 3 seconds / 10 extra HP damage on an already-chilled target |
| `chainCount` / `chainRange` | Integer 1-4 extra targets / 40-240 units | 2 / 180; nearest living target at each hop |
| `pierceCount` | Integer 1-5 total direct targets | 3; consumed after reaching this count |
| `explosionRadius` / `explosionDamage` | 20-140 units / integer 1-60 HP | 75 / 25; checks target centers from impact point |
| Active projectiles / saved recipes | Maximum 64 / 20 | Active plus scheduled cap; refuse excess casts/shots and drop excess children |

Style defaults apply when size/speed are omitted. Explicit values override them. Selecting a style in the editor deliberately resets size and speed to that style's preset; sliders remain editable. Bolt aligns with velocity, shard rotates smoothly, and wisp follows a deterministic sideways sine offset with amplitude 8 units and angular frequency 6 radians/second. These drift segments use the same swept collision handling as other styles.

Arcane applies no status. Fire and poison each maintain one timed status per target; another hit refreshes duration and replaces its bounded damage without stacking or resetting the pending tick. Burn and poison can coexist. Frost applies chill, and a frost hit during chill adds `frostBonus` once, then refreshes chill. Chill also halves enemy movement speed while active; training targets remain stationary. Death and reset clear statuses.

Lightning chains at 60% damage per hop, rounded with a minimum of 1 HP. Each hop chooses the nearest other living target within range, breaking equal-distance ties by target ID. The cast shares its chain budget and hit history across pierce hits and split children: no target can be hit twice by the same lightning cast. A killed initial target can still be the chain's origin.

Consume removes the projectile at target contact. Pierce continues until its total direct target budget is reached; it remembers targets even after a wall bounce. Explode removes the projectile, deals direct damage to the contact target once, and deals splash damage to other living target centers inside or exactly on the radius. Splash applies the element, but never damages the direct target or another previously hit target again. Explosion also occurs on `disappear` walls, not on bounce/split walls or expiry. A lightning explosion resolves its bounded chain before splash and excludes every target already hit by that cast.

Split consumes the parent. Children fan inward with 58% radius (minimum 3), 60% rounded damage (minimum 1), the same element/style/speed, and remaining lifetime. Children always use straight flight, `consume` and `disappear`: they cannot pierce, explode, bounce, or split again. Internal child radii can be smaller than the editor's parent minimum.

The shelf keeps the existing `spell-kitchen.recipes.v1` localStorage key so old spells remain discoverable. Loading validates each v1/v2 recipe, adds v3 defaults (`arcane`, `orb`, `consume`, `single`, `straight`, no zone or modifiers), then validates the migrated recipe and full shelf. IDs, names, colors, order, and existing mechanics survive. A later save writes v3; loading alone does not rewrite storage. Unreadable/corrupt data stays untouched and saving is blocked until a successful reload, preventing an empty shelf from overwriting existing data.

Time reversal, healing, teleportation, beams, summoning, moving training targets, enemy-control recipe fields, recursive splits, and unbounded mechanics remain unsupported. Generation must explain unsupported requests and all model output passes the full schema.

## Phase C configuration

The editor groups settings into native, keyboard-accessible **Core, Element, Casting, Flight, Impact, Wall, and Visuals** disclosures. Only relevant element, pattern, path, hit, zone, gravity-radius and kill-child controls appear. Disclosures start open and can be collapsed independently. Every numeric control shows its unit. Recipes remain independent of spawn and graphics settings.

| Mechanic | Limits and defaults | Behavior |
| --- | --- | --- |
| Wind `knockback` | 0..100 u/hit; 45 | Pushes surviving enemies away from caster; collision-safe, shortened at walls/props |
| Earth `earthBonus`, `staggerDuration` | Integer 1..40 HP; 20. 0.1..1 s; 0.35 | Starts at 65% configured speed (minimum 40 u/s); adds impact damage and briefly stops movement/touches |
| Shadow `weaken`, `weakenDuration` | 0..1 added multiplier; 0.25. 1..6 s; 3 | Refreshes one vulnerability; subsequent damage from every source gains 25% by default, rounded |
| Holy `holyBonus` | Integer 1..60 HP; 25 | Bonus against solid wraiths and skeletons; bright cosmetic flash |
| `pattern` | single (default), burst, fan, ring | Every cast shares lightning history/budget and kill-child budget |
| `burstCount`, `burstInterval` | Integer 2..5; 3. 0.08..1 s; 0.15 | One shot immediately, remaining shots scheduled in sequence |
| `fanCount`, `fanAngle` | Integer 2..7; 5. 10..160 degrees; 60 degrees | Simultaneous projectiles centered on aim |
| `ringCount` | Integer 6..16; 10 | Simultaneous evenly spaced directions, starting toward aim |
| `flight` | straight (default), arc, homing, spiral, boomerang | Fixed-tick simulation determines every position/contact |
| `turnRate` | 15..360 degrees/s; 120 | Homing turns toward nearest living solid enemy/target not already hit; ID breaks ties; original aim if none |
| `spiralRadius`, `spiralRate` | 0..40 u; 18. 0.5..12 rad/s; 6 | Looping forward path; swept segments and bounded velocity |
| `maxRange` | 60..700 u; 350 | Boomerang reverses toward caster at range or first wall; disappears on return |
| `acceleration` | -200..400 u/s^2; 0 | Base speed clamps to 40..640 u/s |
| `sizeGrowth` | -2..4 radius u/s; 0 | Runtime radius clamps to 3..44 u; expansion cannot enter walls/props |
| `gravityPull`, `gravityRadius` | 0..120 u/s; 0 (off). 20..180 u; 90 | Pulls nearby solid enemies; combined wells cap displacement at 120 u/s per enemy |
| `chainOnKill` | Boolean; false | A direct, lightning-chain or splash kill spawns one small orb toward a nearby living target |
| `killChainCount`, `killChainRange`, `killChainDamage` | Integer 1..4/cast; 2. 40..240 u; 180. Integer 1..50 HP; 15 | Shared child budget; no spawn without target or free slot; children cannot create children |
| `zone` | none (default), fire, frost, poison | One fire patch, frost field or poison cloud at first direct impact, landing, terminal wall impact, or expiry |
| `zoneRadius`, `zoneDuration`, `zoneDamage` | 20..140 u; 60. 0.5..8 s; 3. Integer 1..15 HP/tick; 4 | Every 0.5 s, first tick after 0.5 s, final boundary tick included; maximum 64 zones |
| `explosionFalloff` | flat (default), linear | Linear splash decreases to zero at radius; positive hits still receive element bonuses |

Arc flight ignores targets while airborne and lands at the aim point, resolving one overlapping direct target and selected chain/explosion/zone. Its parabola is cosmetic. Solid walls/props terminate the lob immediately with selected impact effects regardless of Wall settings; arc never jumps over props. Fan/ring arcs rotate and room-clamp their landing points. Expiry before landing creates only its selected zone. Arc cannot pierce through targets after landing. Boomerang still consumes on hit unless **Pierce** is selected; it retains hit history on return and always obeys lifetime. Wisp drift applies only to straight flight. Homing steering is bounded; physical wall bounces still reflect velocity normally.

Wind and gravity use collision-checked, deterministically shortened displacements. Training targets remain fixed. Freeze stops voluntary enemy movement and touching; forced wind/gravity movement still applies. Earth stagger and shadow weaken refresh rather than stack. Weaken applies to subsequent direct hits, chains, splash, burns, poison and zone ticks, including other spells; it does not increase the first applying shadow hit. Golem resistance and wraith phase immunity still apply. Zones tick by center distance, can overlap, do not apply burn/poison statuses, and frost fields refresh 0.6 s chill. Status and zone kills do not spawn kill children.

Kill children use straight flight, consume/disappear, 58% radius (minimum 3), configured child damage, parent speed/element/cosmetics, and at most three seconds lifetime. They cannot create zones or further children. Wall-split children retain their selected zone and use straight flight, consume/disappear; they cannot create kill children. Burst reservations count toward the same **64 active-or-scheduled projectile cap**; excess pattern shots and children are refused. Reset/layout changes clear pending shots and zones as well as projectiles/statuses/enemies. Saved recipes preserve IDs, names, order, colors and all prior mechanics; migrations validate historical input, then apply and validate v3 defaults. Loading never rewrites storage.

All visual knobs live in `appearance`, separate from gameplay:

| Cosmetic | Bounds | Default |
| --- | --- | --- |
| `color`, `secondaryColor` | Six-digit hex core/accent colors | `#b998ff`, `#eee0ff` |
| `glow` | 0..4 multiplier | 1 |
| `trailLength` | 0..2 s | 0.55 |
| `particleDensity` | 0..2 multiplier | 1 |
| `lightIntensity` | 0..2 multiplier | 1 |
| `meshDetail` | low, medium, high | medium |

Wind uses swirl ribbons; earth uses rock chunks/dust; shadow uses smoky shells with a shader rim; holy uses flare rays and hit sparks. Arc uses a visual parabola, homing adds target reticles, spiral uses orbit ribbons, and boomerang uses blade rings. Lingering zones use animated TSL ground decals with distinct fire/frost/poison patterns. All pools remain bounded. Graphics quality caps particle/light slots; reduced motion freezes shader/ribbon/smoke/ray animation and removes trails/particles/flashes while preserving static effects and essential projectile movement. Cosmetic values never change collisions, damage, statuses or RNG.

New labeled presets: **Example: Homing frost swarm**, **Example: Meteor arc**, **Example: Shadow ring**, **Example: Boomerang wind blade**, and **Example: Holy fan**. Earlier examples remain available. Unsupported time manipulation, healing, teleportation, beams, summoning, enemy-control recipe fields, recursive splits and unbounded mechanics still return explanations; homing is now supported. The model receives the full v3 schema and every new bound/default. Generated output must pass full validation before the editor can apply it.

## Enemies and waves

Open the **Enemies** panel below the arena. Choose a type and North/East/South/West door, then **Spawn one**. **Place** focuses the arena: tap a valid floor point, or aim with arrow keys and press Enter. Escape cancels. A green/red ring previews placement clearance; invalid placement stays armed and never casts a spell. Placement rejects walls, solid props, the caster, overlapping enemies, and a full room. Door spawns use bounded seeded offsets along the chosen edge, with a portal flash.

| Enemy | Base HP | Speed (units/second) | Circle radius | Behavior |
| --- | --- | --- | --- | --- |
| Slime | 120 | 32 | 22 | Slow; dies into two small slimes when space and the cap permit |
| Skeleton | 70 | 62 | 15 | Walks to the caster, then stops at melee range |
| Imp | 30 | 110 | 12 | Fast, fragile, seeded zig-zag; sideways factor 0.65 at 6 radians/second |
| Golem | 400 | 18 | 26 | Very slow; halves non-explosion damage, rounded with a minimum of 1 HP |
| Wraith | 60 | 52 | 17 | Alternates one solid second and one phased second from spawn |

Small slimes have 35% of their parent's maximum HP, rounded, half its radius, and the same speed. They never split again. Living enemies, including children, are capped at **24**. Excess children are refused; a kill at the cap can produce one child instead of two. Spawned HP is validated within 10..1500, speed within 5..360, and radius within 9..26. Base difficulty is 1; difficulty **0.5..3** scales HP and speed for new spawns only. Existing enemies keep their stats.

All spell elements and hit behaviors apply to enemies through the same simulation code as targets. Fire/poison refresh without stacking; chill halves speed and retains the frost hit bonus. Lightning can chain between targets and enemies, using shared unique IDs and the existing cast budget. Pierce remembers enemy hits. Explosion splash bypasses golem resistance; the direct impact still uses normal direct-hit damage and is never double-counted. Golem resistance also applies to chains and status ticks. Phased wraiths are translucent and labeled PHASE: projectiles pass through, chains/splash skip them, and no damage or new status applies. Existing status clocks continue during phase; skipped damage does not accumulate.

Enemies navigate a deterministic visibility graph around conservative, radius-expanded solid props. Every movement segment is checked against the room and obstacles, including imp zig-zags; no enemy can cross a wall or pillar. Enemies stop within their radius plus 18 units of the caster. Each touching enemy counts a **caster touch** at most once per second, with a visible robe flash. Sandbox play has no game-over. Enemies may crowd each other while moving; their navigation colliders block walls and props, not other enemies.

Choose a **Wave type mix** (one to five unique types), **Count per wave** (integer 1..12, default 4), **Wave interval** (2..30 seconds, default 8), and **Difficulty** (0.5..3, default 1). **Start waves** spawns the first wave immediately. With **Enemies keep spawning** enabled (default), later waves follow the interval even if earlier enemies remain; the global living cap still applies. Turning it off stops future waves immediately. With it already off, Start waves creates one wave. Interval edits apply after the currently scheduled wave. The panel shows wave number, total living enemies remaining, kills (including small slimes), and caster touches.

**Enemies frozen** (default off) creates training dummies: movement and touching stop while damage, status clocks, and wraith phasing continue. **Stop waves** preserves current enemies. **Clear enemies** removes enemies and stops waves; counters remain until **Reset lab**. Reset and layout changes clear enemies, waves, placement, kills, and touch counters. Changing graphics never changes gameplay.

Spawn preferences use a strict Zod schema and their own `spell-kitchen.enemies.v1` localStorage key, separate from graphics and all recipes. Defaults are Slime/East door, Slime+Skeleton+Imp mix, four enemies every eight seconds, difficulty 1, unfrozen, repeat enabled. Reload restores preferences only. Invalid data falls back with a notice; blocked writes preserve session play and never modify the shelf.

Primitive enemy silhouettes include slime lobes, skeleton ribs, imp horns/wings, golem blocks, and a floating wraith cloak. Bodies cast shadows; emissive eyes, pooled camera-facing HP/status sprites, a soft hit tint, status tints, damage numbers, shrinking death particles, and door portal effects make combat readable. Enemy views use 24 fixed slots, alongside the existing bounded particle/number/ring pools. Reduced motion suppresses idle/walk deformation, bobbing, recoil, portal rotation, and particles while preserving movement, HP/status text, phasing, and static hit feedback.

Recipes remain **spell-only v3**. The assistant knows enemy rules and can generate spells that hit them, but requests to spawn/control enemies or waves return an unsupported explanation. No enemy fields are accepted by the strict recipe schema. Existing v1/v2 shelf data still migrates and validates through the original storage path.

## 3D arena and graphics

The lab uses three.js `WebGPURenderer`, loaded only on the client through `next/dynamic` with `ssr: false`. It initializes WebGPU when available and automatically falls back to WebGL2. The lab header shows **WebGPU** or **WebGL fallback** from the initialized backend, rather than guessing from browser capability. A browser with neither backend shows an error and disables casting. The camera is fixed at a classic isometric angle with orthographic projection and no camera controls. ResizeObserver fits the complete room and raised walls inside the available canvas on desktop and mobile.

Open **Graphics & arena** beneath the lab header. Settings are strictly validated with Zod and stored separately at `spell-kitchen.settings.v1`; they never modify a recipe or the saved-spell shelf. Invalid settings use defaults with a notice. If storage is blocked, changes still apply for the current visit with a notice.

| Quality | Shadow map | Projectile point lights | Bloom | Particle pool | Pixel ratio cap |
| --- | --- | --- | --- | --- | --- |
| Low | Off | 2 | Off | 96 | 1 |
| Medium (default) | 1024 x 1024 | 4 | On when supported | 256 | 1.5 |
| High | 2048 x 2048 | 8 | On when supported | 512 | 2 |

These are fixed profiles selected through an enum; users and model output cannot supply unbounded numeric graphics values. Parents and larger projectiles receive priority for the bounded light slots; every projectile also has an emissive material and floor glow. Three fixed candle lights, and one temporary staff light are separate from the projectile cap. Medium and High directional moonlight cast soft PCF shadows. Low disables shadow rendering, uses only one candle point light, caps projectile mesh detail to Low, and omits satellite meshes (ribbons, rock satellites, smoke and holy rays), retaining core silhouettes, floor glows, status feedback and bounded particles. PBR floor tiles, raised masonry, caster, targets, and geometry props cast or receive shadows. Candle intensity uses bounded deterministic sine flicker.

Lighting presets are **Dusk workshop** (default), **Torchlit**, **Moonlight**, and **Arcane**. These change ambient, moonlight, candle light, background colors and subtle HDR environment intensity/rotation without changing gameplay. Bloom uses the WebGPU-compatible `RenderPipeline` and TSL `bloom` node in three.js r186; unsupported bloom falls back to direct rendering. Low quality and `prefers-reduced-motion` disable bloom. Reduced motion also removes particles, flicker, spin, and wobble immediately; essential projectile movement, hit feedback, HP, status markers, and brief chain/ring indicators remain.


**Caster:** pick a **Robe color** and a **Hat** (Pointed, Wide brim, Hood, Crown or None). The caster idles with a small bob unless reduced motion is on. These are cosmetic only.

The room is **800 x 600 world units**. **Workshop** (default) contains two solid rectangular pillars. **Open hall** removes those pillars. Both retain a peripheral crate (shown as a closed chest) and cauldron, each with a matching rectangular floor collision footprint. Shelves, bottles, candles, and banners hang on the raised walls; the caster platform is a shallow floor feature. Changing layout resets active projectiles, targets, enemies, waves, effects, and counters. Changing quality or lighting preserves the active simulation.

Simulation coordinates remain flat `(x, y)`. Rendering maps them to `(x, visualHeight, z=y)`; projectile height is cosmetic. Pointer/touch aiming raycasts onto the floor plane, converts back to world coordinates, and ignores points outside the room. Arrow keys move aim in screen directions; Space casts only while the arena itself has focus. Typing or using selects does not trigger gameplay shortcuts. Touch scrolling remains enabled.

## CC0 workshop assets and diagnostics

The app bundles **16 files / 6,539,960 bytes (6.54 MB decimal)** under `public/assets/`, without runtime requests to asset providers. [Asset credits and complete file manifest](docs/ASSETS.md) list each source URL, author, CC0 license and local path. Sources are only Poly Haven and Kenney. No sounds, executables or archives ship with the app.

Poly Haven supplies Stone Tiles 02 for the floor, Brick Wall 001 for masonry, Wood Planks for shelves, the chest base and procedural crates, and Studio Small 09 for subtle environment reflections. Each surface has 1k albedo, OpenGL normal and roughness JPEG maps. Albedo is sRGB; normal/roughness maps are linear data. The 1k HDR environment stays separate from the preset background. Environment intensity is 0.30 at Dusk, 0.16 Torchlit, 0.28 Moonlight and 0.20 Arcane; Moonlight rotates reflections by 90 degrees. Preset direct lighting supplies the color mood.

Kenney Mini Dungeon 2.0 supplies columns, a closed chest, a pot, shelf potions and wall banners, using its shared PNG atlas. Models are fitted to the existing pillar/crate/cauldron bounds, never used to calculate gameplay collisions. The chest rests on an 8-unit wooden base; the combined visual retains the original crate height and footprint. The pot retains a rectangular stone plinth matching its collider. Models have no decorative animation. Enemy silhouettes remain procedural because this kit has no matching slime, skeleton, imp, golem or wraith. Each enemy now shares merged body and eye geometry for two silhouette draws per enemy. Projectiles and their satellites no longer cast shadows.

The arena shows **Loading workshop assets** while the procedural room remains playable. `TextureLoader`, `GLTFLoader` and the installed three.js r186 `HDRLoader` load local files. Individual failures (including a missing model atlas) retain procedural materials/props. Each logical load has a 12-second deadline; late results are disposed without attachment. A status message reports fallback failures. Unmount/failure stops rendering, aborts supported requests, and disposes loaded textures, model materials and geometry; late image loads are also disposed.

A **Diagnostics** toggle appears inside the arena only with `npm run dev`. It reports average frame interval, p95 interval over the latest 120 samples, approximate FPS, CPU submission time, draw calls, triangles, and actual projectile/enemy counts. Samples publish twice per second and stop when disabled. Intervals include browser scheduling and display cadence; CPU submission time is not GPU execution time. Production builds omit the toggle. For a load check, select High, freeze and place 24 enemies, then cast repeatedly toward an open wall until the readout reaches 64 projectiles. Compare Low on the same scene. The CPU benchmark in [the implementation report](docs/REPORT.md) does not establish a GPU frame-rate guarantee.

Focus indicators, 44px color controls/chat close buttons, safe-area spacing, wrapping status text and a mobile editor remain keyboard accessible. Reduced motion retains static imported assets and freezes existing decorative animation; loading feedback has no animation.

## Sandbox tools

- **Time:** Pause or resume with the button or **P**. While paused, **Step** advances one fixed 1/120 s tick. **Time scale** feeds the fixed-step simulation 0.25x, 0.5x, 1x, or 2x game time per frame, so the same casts produce the same results at any speed.
- **Hotbar:** Load a saved spell, then press **Set** on one of the four slots. Keys **1-4** load that slot's spell into the editor. Shortcuts are ignored while typing. Slots persist in `spell-kitchen.hotbar.v1` and clear automatically when their spell is deleted.
- **Combat stats:** Damage per element, hits, DPS over the last 5 seconds, peak active projectiles, casts, and kills. Reset clears them.
- **Share or import:** Copy the recipe as JSON, copy a link ending in `#spell=<base64url>`, or download a .json file. Paste JSON (a recipe or a saved-spell object) or a share link to import. Every import is migrated and fully validated, and invalid data never replaces the current recipe. Opening a share link loads the spell and removes the hash from the address bar.

## Element reactions

A hit reacts with a status the target already has. The reaction uses the status before the hit, and a reaction that consumes the status does not apply the new one.

| Hit | Existing status | Reaction | Effect |
|-----|-----------------|----------|--------|
| Fire | Chill | Steam burst | Removes burn and chill, 12 splash in 70 px, staggers nearby enemies 0.6 s |
| Frost | Burn | Steam burst | Same as above |
| Fire | Poison | Toxic flare | 10 splash in 80 px and copies the poison to nearby enemies |
| Lightning | Chill | Shatter | +20 damage, removes chill |
| Lightning | Poison | Conduct | One extra chain jump (once per cast) |
| Holy | Weaken | Eclipse | +35 damage before weaken scaling, removes weaken |

## Survival mode

Press **Start survival** in the Enemies panel. The room is cleared and endless waves begin, one every 10 seconds, using your wave type mix. Each wave adds one enemy (up to 12) and 0.15 difficulty on top of your difficulty setting (up to 3). You have 10 lives; each enemy touch or boss orb costs one. At zero lives the run ends, waves stop, and the sandbox stays playable. **Stop waves** or **Clear enemies** also end the run. The best wave reached is saved in `spell-kitchen.survival.v1`.

## Boss: Archmage Construct

Press **Summon boss** in the Enemies panel. Only one boss can be alive. It enters from the east door with 600 x difficulty HP and takes half damage from direct hits, like a golem.

- **Phase 1 (above 66% HP):** summons two skeletons every 7 s.
- **Phase 2 (66% to 33%):** charges an orb for 1 s, then throws it at the caster every 3.2 s. Any of your projectiles touching an orb breaks it. An orb that reaches you counts as a caster touch.
- **Phase 3 (below 33%):** throws orbs every 2.2 s and spins a shield arc. Direct hits that arrive from inside the arc are blocked. Chains, explosions, reactions and zones still land.

Frozen enemies also freeze the boss and its orbs. Clear enemies and Reset remove the boss.

## Architecture and simulation

- [`components/Kitchen.tsx`](components/Kitchen.tsx): recipe editor, floating assistant, generation lifecycle, local shelf, graphics controls, and backend badge. The arena loads through `next/dynamic` with `ssr: false`.
- [`components/Arena.tsx`](components/Arena.tsx): client lifecycle, failure UI, keyboard input, and renderer boundary used by DOM tests.
- [`components/arena-assets.ts`](components/arena-assets.ts): local CC0 texture/HDR/GLB loading, independent fallback, bounded loading timeout, cleanup, and model fitting to existing simulation dimensions.
- [`components/arena-scene.ts`](components/arena-scene.ts): asset-backed three.js room with procedural fallbacks, PBR materials, lights/shadows, bloom, pointer input, and pooled visual effects. Tiles and particles are instanced; projectile meshes, lights, rings, chain lines, and damage sprites are pooled. Effect capacities are 512 particles, 16 rings, 24 arcs, and 24 damage numbers. Hot visual transforms reuse scratch objects; HP textures update on state changes and React snapshots publish at most ten times per second. Cleanup stops the animation loop, removes listeners/ResizeObserver, and disposes GPU resources.
- [`components/arena-view.ts`](components/arena-view.ts): orthographic room fitting and floor raycasts, with CPU tests at desktop, tablet, phone, and short-landscape sizes.
- [`lib/simulation.ts`](lib/simulation.ts): rendering-independent 800 x 600 world, fixed 120 Hz ticks, deterministic layout input, shared floor obstacle definitions, swept circle/target intersections, and exact swept circle/rectangle collisions against offset faces and rounded corners. Obstacles use existing wall responses: disappear, bounded bounce, or nonrecursive split; disappear contacts also trigger `onHit=explode`. A nearby target or obstacle wins by earliest contact. Rendering never decides collisions or damage.
- [`lib/settings.ts`](lib/settings.ts): strict graphics/layout and spawn schemas, validated enemy stats/rules, bounded unsigned simulation seed, fixed quality profiles, and separate graphics/enemy storage operations. [`components/EnemiesPanel.tsx`](components/EnemiesPanel.tsx) presents spawn and wave controls; gameplay stays in the simulation.
- [`lib/recipe.ts`](lib/recipe.ts), [`lib/storage.ts`](lib/storage.ts): recipe v3 contract and strict v1/v2 migrations. IDs, names, order, and mechanics remain preserved; failed shelf reads block overwrite. Phase C adds the bounded mechanics and cosmetics described above.
- [`app/api/generate/route.ts`](app/api/generate/route.ts), [`lib/llm.ts`](lib/llm.ts): server route and replaceable provider boundary. The prompt describes the expanded room and obstacle rules, keeps all numeric recipe limits/defaults and unsupported requests, and explicitly excludes rendering/settings fields from recipes. Every generated recipe passes full validation.

The simulation uses a seeded 32-bit LCG (default seed 1, allowed integer 0..4294967295) for spawn offsets, wave composition/doors, and imp phase. It has no `Math.random`, wall-clock reads, rendering imports, or model logic. Identical seed, layout, recipes, inputs, and elapsed game time produce identical results across frame chunking. Reset restores the original seed. A suspended tab catches up at most 0.25 seconds per advance. Presentation uses its own bounded frame delta and deterministic sine effects.

Implementation references: [three.js WebGPU renderer and fallback](https://threejs.org/docs/pages/WebGPURenderer.html), [three.js bloom pipeline](https://threejs.org/docs/pages/BloomNode.html), [Next.js client-only dynamic imports](https://nextjs.org/docs/app/guides/lazy-loading), and [Zod strict schemas and defaults](https://zod.dev/api).

## Verification

```powershell
npm run build
npm run typecheck
npm run lint
npm test
```

The suite exercises the actual simulation, schema, storage, server adapter, and editor. Provider HTTP calls are mocked only at the external fetch boundary. DOM component tests mock only the three.js arena boundary; they are not GPU/browser tests. See [`docs/REPORT.md`](docs/REPORT.md) for results, provider availability, and the browser verification limitation.

## License

Code is [MIT](LICENSE). Bundled art in `public/assets/` is CC0; see [docs/ASSETS.md](docs/ASSETS.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
