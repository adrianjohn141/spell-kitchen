# Spell Kitchen phase D implementation report

Date: October 26, 2026. Workspace: `C:\Users\adria\Documents\SpellKitchen`.

## Delivered

The existing Next.js App Router, TypeScript, Zod, Vitest and three.js r186 architecture remains in place. No dependency was added. This workspace has no Git repository/branch metadata.

- Bundled 16 CC0 files, totaling **6,539,960 bytes (6.54 MB decimal / 6.24 MiB)**. Poly Haven supplies Stone Tiles 02, Brick Wall 001 and Wood Planks albedo/OpenGL normal/roughness JPEG maps plus Studio Small 09 HDR lighting. Every texture and the HDR are at most 1k. Kenney Mini Dungeon 2.0 supplies five GLBs (column, chest, pot, potion, banner) and their shared atlas. Every file has source URL, author, CC0 license and local path in `docs/ASSETS.md`.
- Downloads used only the permitted official Poly Haven API/download domains and Kenney. Poly Haven files matched API MD5 hashes. Kenney's official archive was inspected for executable/script file extensions; only selected GLBs and their PNG atlas were extracted. No ZIP, audio, scripts or executables are bundled under `public/assets/`.
- `components/arena-assets.ts` uses the installed `TextureLoader`, `GLTFLoader` and `HDRLoader`. Each of 15 logical loads settles independently with a 12-second deadline. Failed maps/models/HDR retain procedural visuals; GLBs missing their atlas also fall back. Late loads are disposed without attachment after timeout/unmount. Supported requests are aborted during disposal. TextureLoader owns PNG decoding, avoiding unmanaged ImageBitmaps from the GLB atlas.
- `components/arena-scene.ts` applies sRGB albedo and linear normal/roughness maps, replaces loaded floor tiles with one tiled plane, and hides obsolete procedural masonry detail after wall texture success. Presets use neutral HDR reflections at subtle intensities: Dusk 0.30, Torchlit 0.16, Moonlight 0.28 and Arcane 0.20. Moonlight rotates the environment 90 degrees. Direct preset lights retain their color mood.
- Models fit the existing simulation obstacle dimensions. The crate is shown as a closed chest on an 8-unit wood-PBR base, retaining its original total height and footprint; the cauldron pot retains a matching rectangular stone plinth. Shelf bottles and banners use the authored models. Models do not animate. Enemies retain phase B silhouettes because the selected kit has no matching enemy types. Their shared merged body/eye geometry reduces each silhouette to two draws. Projectile cores and satellite effects do not cast shadows.
- Low disables moon shadows, uses one candle light, caps projectile detail to Low and hides satellite ribbons/rocks/smoke/rays. It retains essential movement, core silhouettes, glow, HP/status feedback and bounded particles. Medium/High keep existing bounded shadows, lighting and bloom. Loaded assets share resources across visual clones.
- `components/Arena.tsx` announces loading progress and fallback while the procedural room remains playable. A development-only Diagnostics toggle reports average frame interval, p95 over up to 120 samples, approximate FPS, CPU submission time, draw calls, triangles and actual projectile/enemy counts. Samples publish at most twice per second. Production omits the toggle. Timing measures scheduling/submission, not GPU execution.
- `app/globals.css` strengthens visible focus, keeps arena focus inside its clipped boundary, enlarges color and chat-close touch targets, wraps controls/status text, and adds scroll and safe-area clearance. The floating assistant, editor, shelf and keyboard controls remain in place. Static assets add no motion; existing reduced-motion behavior remains active.
- `lib/recipe.ts`, `lib/storage.ts`, `lib/settings.ts` and `lib/simulation.ts` are unchanged. Recipe v3, strict historical migrations, original shelf key, numeric limits, seeded simulation, collision ownership and determinism remain unchanged. No new numeric gameplay mechanic was introduced. `lib/llm.ts` explicitly describes assets and diagnostics as presentation only and rejects recipe-controlled scenery changes while retaining all existing mechanics/defaults/bounds and unsupported rules.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npm test`: 269 tests passed across 11 files.
- `npm run build`: passed, including TypeScript, page prerendering and generation route.

Focused tests cover bidirectional manifest coverage, duplicate entries, approved source hosts, authors/licenses, file formats, nonempty files, total size, JPEG/PNG/HDR resolution, every PBR file, and local GLB texture references. Actual GLBs are parsed with the installed GLTFLoader; only browser image decoding is mocked. Tests fit the actual geometry to shared obstacle dimensions and verify the source is unchanged. Loader tests mock external loader boundaries and exercise correct color spaces, independent texture/model/HDR failure, missing atlas, timeout, unmount, late result disposal and idempotent cleanup. UI tests verify loading/fallback notices, keyboard play during loading, development diagnostics, production omission and keyboard isolation. Existing recipe migrations, storage, simulation, mechanics, enemy, provider and editor tests remain green.

After a successful production build, `npm run start` served the home page with HTTP 200. All **16 asset URLs returned HTTP 200 with bytes identical to the bundled files**. Production HTML omitted Diagnostics.

Two real `POST http://localhost:3000/api/generate` calls used the configured provider without reading or changing any configuration/secret file. Responses passed the real `GenerationSchema`:

- HTTP 200: recipe v3, frost bolt, homing flight, 180 degrees/second turn rate, 35 damage. Explicitly requested mechanic fields were checked.
- HTTP 422: replacing arena walls with clouds and changing floor textures through a recipe returned a validated unsupported explanation.

A Node CPU benchmark used the real transpiled simulation, seed 123 and Workshop geometry. After a warmup, 600 frames advanced 10 seconds at 60 Hz, replenishing through the normal cast method to **64 projectiles before every frame** with **24 frozen golems throughout**. Recipe: radius 6, speed 40, damage 1, lifetime 12, pierce budget 5, bounce limit 6. Measured mean advance time was **0.0843 ms**, p95 **0.1234 ms**, max **0.6438 ms**. A repeated run produced identical simulation state. This is one CPU workload on this host, excludes rendering, and does not prove all spell combinations or GPU smoothness.

## Verification limits and assumptions

Automatic approval review rejected observing the localhost browser tab: "The user declined permission for this action." No alternate browser, raw CDP, indirect browser command or policy workaround was attempted. Actual WebGPU/WebGL asset decoding/shader compilation, appearance, sustained GPU performance with 64 projectiles and 24 enemies, weak-laptop/phone performance, rendered mobile overflow, screen-reader behavior, touch/focus order, zoom and live reduced-motion switching remain **unverified**. DOM tests and CPU camera/geometry tests are not GPU or device proof. High-quality smoothness and Low-quality device suitability remain acceptance checks requiring browser access.

The neutral studio HDR intentionally remains subtle; preset direct light supplies mood. The Kenney chest stands in for the existing crate, while model bounds and the pot's rectangular plinth preserve existing rectangular collisions. No enemy model or gameplay schema change was appropriate for this asset pack. No sound, deployment, publication, commit or provider reconfiguration was performed.

No env or secret file was read, printed, searched, copied or edited. Next.js build/start loaded configured settings internally. The final build was started again and its home page and all 16 asset files passed the same HTTP checks. The task-started servers were terminated and their command sessions exited. Ctrl+C did not terminate the first server; it was subsequently stopped by its observed process ID. `Get-NetTCPConnection` returned no inventory even while a server was listening, so it was not used as final evidence. Final `netstat -ano -p tcp` inspection confirmed **no TCP listener on port 3000**. No task-started server remains running.
