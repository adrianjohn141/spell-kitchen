import * as T from "three/webgpu";
import { pass, uniform, uv, normalView } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ELEMENT_COLORS, LIMITS, type Recipe } from "../lib/recipe";
import { ENEMY_STATS, EnemyTypeSchema, QUALITY, ROBES, SettingsSchema, type Settings, type SpawnSettings } from "../lib/settings";
import { BOSS, CASTER, DOORS, INITIAL_AIM, REACTIONS, Simulation, TICK, type Impact } from "../lib/simulation";
import { fitCamera, floorAim } from "./arena-view";
import { fitModel, loadArenaAssets, type AssetProgress } from "./arena-assets";
import type { ArenaControls, Backend, Snapshot, FrameMetrics } from "./Arena";

const PRESETS = {
  dusk: { sky: 0xaaa0dc, ground: 0x352539, ambient: 1.2, moon: 0xa7bbff, key: 2.5, torch: 0xffbb70, power: 14000, background: 0x201f29 },
  torchlit: { sky: 0x997255, ground: 0x25181a, ambient: 0.7, moon: 0xffd2a0, key: 1.1, torch: 0xff963d, power: 24000, background: 0x231b21 },
  moonlight: { sky: 0x90aee8, ground: 0x182438, ambient: 0.8, moon: 0xb6d9ff, key: 3.5, torch: 0xb9b8ff, power: 6500, background: 0x171f32 },
  arcane: { sky: 0xc58aff, ground: 0x282139, ambient: 1, moon: 0xd9b0ff, key: 2, torch: 0xa890ff, power: 20000, background: 0x21172f },
} as const;
const ELEMENTS = ["arcane", "fire", "frost", "lightning", "poison", "wind", "earth", "shadow", "holy"] as const;

function label(width = 256, height = 96) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d")!;
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(100, 100 * height / width, 1);
  return { sprite, canvas, context, texture };
}

/** Rendering and input only. Simulation owns every hit, HP change, and wall response. */
export async function createArena(container: HTMLElement, latest: () => { recipe: Recipe; settings: Settings; spawnSettings: SpawnSettings; diagnostics?: boolean }, onSnapshot: (s: Snapshot) => void, onBackend: (backend: Backend) => void, signal: AbortSignal, onFailure: () => void, onAssets: (p: AssetProgress) => void = () => {}, onMetrics: (m: FrameMetrics) => void = () => {}) {
  const renderer = new T.WebGPURenderer({ antialias: true, alpha: false });
  try { await renderer.init(); } catch (error) { await renderer.dispose(); throw error; }
  if (signal.aborted) { await renderer.dispose(); return; }
  onBackend((renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL fallback");
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute("aria-hidden", "true"); container.appendChild(renderer.domElement);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-600, 600, 450, -450, 1, 4000);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)"); let reduced = motion.matches;
  let settings = SettingsSchema.parse(latest().settings), sim = new Simulation(settings.layout);
  let spawnSettings = latest().spawnSettings, placing = false, casterFlash = 0;
  sim.configureEnemies(spawnSettings);
  let aim = { ...INITIAL_AIM }, message = "Aim at the floor. Make a little magic.", lastSnapshot = "";
  let elapsed = 0, castFlash = 0, previous = performance.now(), snapshotAt = 0;
  // Sandbox time controls only change how much game time the fixed-step simulation receives.
  let paused = false, timeScale = 1;
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
  const geometry = <G extends T.BufferGeometry>(g: G): G => { geometries.add(g); return g; };
  const material = <M extends T.Material>(m: M): M => { materials.add(m); return m; };
  const standard = (color: T.ColorRepresentation, metalness = 0, roughness = 0.8) => material(new T.MeshStandardMaterial({ color, metalness, roughness }));
  const stone = standard(0x655866), trim = standard(0x97808d), wood = standard(0x76513e), brass = standard(0xa48652, 0.7, 0.32);
  const cube = geometry(new T.BoxGeometry(1, 1, 1)), sphere = geometry(new T.SphereGeometry(1, 16, 12));
  const cylinder = geometry(new T.CylinderGeometry(1, 1, 1, 20)), cone = geometry(new T.ConeGeometry(1, 1, 16)), ringGeometry = geometry(new T.RingGeometry(0.94, 1, 48));
  function mesh(g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: T.Object3D = scene) {
    const object = new T.Mesh(g, m); object.position.set(x, y, z); object.scale.set(sx, sy, sz);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, m = stone, parent: T.Object3D = scene) { return mesh(cube, m, x, y, z, sx, sy, sz, parent); }
  function disc(x: number, z: number, radius: number, color: T.ColorRepresentation, opacity = 0.45) {
    const m = material(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
    const object = new T.Mesh(ringGeometry, m); object.position.set(x, 0.8, z); object.scale.setScalar(radius); object.rotation.x = -Math.PI / 2; scene.add(object); return object;
  }
  box(400, -12, 300, 824, 24, 624, standard(0x302934));
  const floorMaterial = standard(0xffffff, 0.05, 0.86);
  const tiles = new T.InstancedMesh(cube, floorMaterial, 300);
  const dummy = new T.Object3D(), color = new T.Color();
  for (let x = 0, i = 0; x < 20; x++) for (let z = 0; z < 15; z++, i++) {
    dummy.position.set(x * 40 + 20, -1.5, z * 40 + 20); dummy.scale.set(38.7, 3, 38.7); dummy.updateMatrix();
    tiles.setMatrixAt(i, dummy.matrix); tiles.setColorAt(i, color.setHex((x + z) % 2 ? 0x4c444f : 0x574c59));
  }
  tiles.receiveShadow = true; scene.add(tiles);
  const floor = mesh(geometry(new T.PlaneGeometry(800, 600)), floorMaterial, 400, 0.05, 300, 1, 1, 1);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false; floor.visible = false;
  box(400, 62, -9, 824, 124, 18); box(-9, 62, 300, 18, 124, 600);
  box(400, 126, -9, 836, 8, 24, trim); box(-9, 126, 300, 24, 8, 620, trim);
  box(400, 7, 607, 824, 14, 14, trim); box(807, 7, 300, 14, 14, 600, trim);
  const masonry = new T.Group(); scene.add(masonry);
  for (let y = 25; y < 124; y += 25) {
    box(400, y, 0.5, 800, 1, 1, trim, masonry); box(0.5, y, 300, 1, 1, 600, trim, masonry);
    for (let x = 30 + (y % 50 ? 40 : 0); x < 800; x += 80) box(x, y - 12, 0.5, 1, 24, 1, trim, masonry);
    for (let z = 30 + (y % 50 ? 40 : 0); z < 600; z += 80) box(0.5, y - 12, z, 1, 24, 1, trim, masonry);
  }
  // Wall decorations hang above the floor; solid floor props come from sim.obstacles.
  const bottles = new T.Group(), banners = new T.Group(); scene.add(bottles, banners);
  for (const shelfZ of [160, 350]) {
    box(10, 60, shelfZ, 24, 5, 142, wood);
    for (let i = 0; i < 5; i++) {
      const potion = standard([0x9072b4, 0x6fbbad, 0xa5bb71, 0xb76d8d, 0xbd994f][i], 0.2, 0.22);
      mesh(sphere, potion, 10, 72, shelfZ - 52 + i * 26, 7, 10 + i % 2 * 3, 7, bottles);
      mesh(cylinder, brass, 10, 83 + i % 2 * 3, shelfZ - 52 + i * 26, 3, 6, 3, bottles);
    }
  }
  for (const x of [265, 630]) {
    box(x, 80, 1.1, 48, 68, 2, standard(0x63426e), banners); box(x, 116, 3, 60, 4, 5, brass, banners);
    mesh(cone, brass, x, 79, 2.8, 10, 25, 0.5, banners);
  }
  const props = new T.Group(); scene.add(props);
  const pillarCore = standard(0x80717d), iron = standard(0x262d36, 0.7, 0.4);
  const cauldronGlow = standard(0x6cbd88, 0.1, 0.25); cauldronGlow.emissive.set(0x41935d); cauldronGlow.emissiveIntensity = 1.7;
  const assets = loadArenaAssets(onAssets);
  function buildProps() {
    props.clear();
    for (const p of sim.obstacles) {
      const model = assets.models.get(p.kind === "pillar" ? "column" : p.kind === "crate" ? "chest" : "pot");
      if (model) {
        const base = p.kind === "crate" ? 8 : 0;
        const object = fitModel(model, p.halfWidth * 2, p.height - base, p.halfHeight * 2);
        object.position.set(p.x, base, p.y); props.add(object);
        if (base) box(p.x, base / 2, p.y, p.halfWidth * 2, base, p.halfHeight * 2, wood, props);
        if (p.kind === "cauldron") {
          box(p.x, 3, p.y, p.halfWidth * 2, 6, p.halfHeight * 2, stone, props);
          mesh(cylinder, cauldronGlow, p.x, p.height - 3, p.y, 19, 1, 19, props);
        }
        continue;
      }
      if (p.kind === "pillar") {
        box(p.x, p.height / 2, p.y, p.halfWidth * 2, p.height, p.halfHeight * 2, stone, props);
        box(p.x, 8, p.y, 48, 16, 48, trim, props); box(p.x, 108, p.y, 48, 14, 48, trim, props);
        box(p.x, 60, p.y, 43, 90, 43, pillarCore, props);
      } else if (p.kind === "crate") {
        box(p.x, 24, p.y, 54, 48, 54, wood, props);
        for (const offset of [-21, 21]) { box(p.x + offset, 24, p.y, 5, 48, 54, brass, props); box(p.x, 24, p.y + offset, 54, 48, 5, brass, props); }
      } else {
        box(p.x, 3, p.y, 56, 6, 56, stone, props);
        mesh(sphere, iron, p.x, 22, p.y, 27, 20, 27, props);
        mesh(cylinder, brass, p.x, 39, p.y, 26, 5, 26, props);
        mesh(cylinder, cauldronGlow, p.x, 42, p.y, 23, 1, 23, props);
      }
    }
  }
  buildProps();
  void assets.ready.then(() => {
    if (stopped || signal.aborted) return;
    for (const [surface, target] of [["floor", floorMaterial], ["wall", stone], ["wood", wood]] as const) {
      Object.assign(target, assets.maps[surface]);
      if (assets.maps[surface].map) target.color.set(0xffffff);
      target.needsUpdate = true;
    }
    floor.visible = Boolean(assets.maps.floor.map); tiles.visible = !floor.visible;
    masonry.visible = !assets.maps.wall.map;
    scene.environment = assets.environment ?? null;
    buildProps();
    const potion = assets.models.get("potion"), banner = assets.models.get("banner");
    if (potion) {
      bottles.clear();
      for (const z of [160, 350]) for (let i = 0; i < 5; i++) {
        const object = fitModel(potion, 14, 25 + i % 2 * 4, 14); object.position.set(10, 63, z - 52 + i * 26); bottles.add(object);
      }
    }
    if (banner) {
      banners.clear();
      for (const x of [265, 630]) { const object = fitModel(banner, 60, 72, 8); object.position.set(x, 46, 5); banners.add(object); }
    }
  });
  mesh(cylinder, standard(0x645173, 0.15), CASTER.x, 2, CASTER.y, 51, 4, 51);
  disc(CASTER.x, CASTER.y, 58, 0xc6a1f0); disc(CASTER.x, CASTER.y, 49, 0xc6a1f0);
  // The caster group sits at the origin so its children keep world positions; only the idle bob moves it.
  const casterRoot = new T.Group(); scene.add(casterRoot);
  const robe = standard(ROBES.violet), skin = standard(0xe0bfa0), gold = standard(0xd9b25c, 0.8, 0.3);
  mesh(cone, robe, CASTER.x, 24, CASTER.y, 20, 42, 20, casterRoot); mesh(sphere, skin, CASTER.x, 49, CASTER.y, 9, 10, 9, casterRoot);
  const hats = { pointed: new T.Group(), wide: new T.Group(), hood: new T.Group(), crown: new T.Group(), none: new T.Group() };
  for (const hat of Object.values(hats)) casterRoot.add(hat);
  mesh(cylinder, robe, CASTER.x, 57, CASTER.y, 24, 3, 24, hats.pointed); mesh(cone, robe, CASTER.x, 74, CASTER.y, 16, 34, 16, hats.pointed);
  mesh(cylinder, robe, CASTER.x, 56, CASTER.y, 36, 2.5, 36, hats.wide); mesh(cone, robe, CASTER.x, 68, CASTER.y, 13, 24, 13, hats.wide);
  mesh(sphere, robe, CASTER.x, 52, CASTER.y, 11.5, 12, 11.5, hats.hood); mesh(cone, robe, CASTER.x, 64, CASTER.y, 6, 10, 6, hats.hood);
  mesh(cylinder, gold, CASTER.x, 59, CASTER.y, 9.5, 6, 9.5, hats.crown);
  for (let i = 0; i < 5; i++) mesh(cone, gold, CASTER.x + Math.cos(i * 1.257) * 8, 65, CASTER.y + Math.sin(i * 1.257) * 8, 2.4, 6, 2.4, hats.crown);
  mesh(cylinder, wood, CASTER.x + 26, 34, CASTER.y, 2.5, 64, 2.5, casterRoot);
  const staffMat = standard(0xb998ff, 0.1, 0.15); staffMat.emissive.set(0xb998ff); staffMat.emissiveIntensity = 2;
  const staff = mesh(sphere, staffMat, CASTER.x + 26, 70, CASTER.y, 7, 7, 7, casterRoot);
  const staffLight = new T.PointLight(0xb998ff, 0, 145, 2); staffLight.position.copy(staff.position); scene.add(staffLight);
  const hemisphere = new T.HemisphereLight(); scene.add(hemisphere);
  const moon = new T.DirectionalLight(); moon.position.set(200, 650, -180); moon.target.position.set(400, 0, 300);
  moon.castShadow = true; moon.shadow.camera.left = -740; moon.shadow.camera.right = 740;
  moon.shadow.camera.top = 700; moon.shadow.camera.bottom = -700; moon.shadow.camera.far = 1800;
  moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.8; scene.add(moon, moon.target);
  const wax = standard(0xead7aa), flameMat = standard(0xffd99a); flameMat.emissive.set(0xffc06a); flameMat.emissiveIntensity = 3;
  const candles = [new T.Vector3(120, 87, 5), new T.Vector3(460, 87, 5), new T.Vector3(5, 87, 505)].map(position => {
    mesh(cylinder, brass, position.x, 58, position.z, 7, 4, 7); mesh(cylinder, wax, position.x, 70, position.z, 4, 22, 4);
    const flame = mesh(sphere, flameMat, position.x, position.y, position.z, 4, 8, 4); flame.castShadow = false;
    const light = new T.PointLight(0xffbb70, 14000, 360, 2); light.position.copy(position); scene.add(light); return { light, flame };
  });
  const projectileLights = Array.from({ length: 8 }, () => { const light = new T.PointLight(0xffffff, 0, 155, 2); scene.add(light); return light; });
  const aimRing = disc(aim.x, aim.y, 16, 0xd9b8ff, 0.9);
  const portals = Object.entries(DOORS).map(([door, point]) => {
    const m = standard(0x392450, 0.3, 0.4); m.emissive.set(0x8f5cda); m.emissiveIntensity = 0.6;
    const arch = mesh(geometry(new T.TorusGeometry(27, 4, 8, 32, Math.PI)), m, point.x, 2, point.y, 1, 1.5, 1);
    arch.rotation.y = door === "east" || door === "west" ? Math.PI / 2 : 0;
    const glow = disc(point.x, point.y, 31, 0xb998ff, 0.35);
    return { arch, glow, m, flash: 0 };
  });
  const aimLineGeometry = geometry(new T.BufferGeometry()), aimVertices = new Float32Array(6);
  aimLineGeometry.setAttribute("position", new T.BufferAttribute(aimVertices, 3));
  const aimLine = new T.Line(aimLineGeometry, material(new T.LineBasicMaterial({ color: 0xba9fe1, transparent: true, opacity: 0.25 }))); aimLine.frustumCulled = false; scene.add(aimLine);
  const targetViews = sim.targets.map(target => {
    const group = new T.Group(); group.position.set(target.x, 0, target.y); scene.add(group); const m = standard(0xc29b70);
    mesh(cylinder, wood, 0, 24, 0, 5, 48, 5, group); mesh(sphere, m, 0, 39, 0, 21, 28, 12, group);
    mesh(sphere, standard(0x795d64), 0, 39, 10, 11, 16, 3, group); mesh(sphere, brass, 0, 39, 13, 4, 6, 2, group);
    const health = label(); textures.add(health.texture); materials.add(health.sprite.material);
    health.sprite.position.set(target.x, 89, target.y); scene.add(health.sprite);
    const markers = [0xffac76, 0x90c8ff, 0x9cde79].map((c, i) => {
      const marker = mesh(geometry(new T.OctahedronGeometry(4)), standard(c), (i - 1) * 12, 72, 0, 1, 1, 1, group); marker.visible = false; return marker;
    });
    return { group, m, health, markers, flash: 0, key: -1 };
  });
  const enemyColors = { slime: 0x7ebc73, skeleton: 0xcfc3aa, imp: 0xd37468, golem: 0x8a929f, wraith: 0x9d8ec5 };
  const eyeMat = standard(0xffe6a0, 0.1, 0.2); eyeMat.emissive.set(0xffc85c); eyeMat.emissiveIntensity = 3;
  const enemyGeometry = new Map<string, { body: T.BufferGeometry; eyes: T.BufferGeometry }>();
  const enemyViews = Array.from({ length: LIMITS.enemies }, () => {
    const root = new T.Group(); scene.add(root); root.visible = false;
    const body = standard(0xffffff, 0.1, 0.6); body.transparent = true;
    const shapes = EnemyTypeSchema.options.map(type => {
      const group = new T.Group(); root.add(group);
      const cached = enemyGeometry.get(type);
      if (cached) {
        mesh(cached.body, body, 0, 0, 0, 1, 1, 1, group); mesh(cached.eyes, eyeMat, 0, 0, 0, 1, 1, 1, group); return group;
      }
      if (type === "slime") {
        mesh(sphere, body, 0, 15, 0, 22, 18, 22, group);
        mesh(sphere, body, -12, 5, 9, 12, 5, 12, group); mesh(sphere, body, 12, 5, 9, 12, 5, 12, group);
      } else if (type === "skeleton") {
        mesh(sphere, body, 0, 47, 0, 10, 11, 9, group);
        box(0, 28, 0, 4, 23, 5, body, group);
        for (const y of [24, 30, 36]) box(0, y, 0, 20, 3, 8, body, group);
        for (const side of [-1, 1]) { box(side * 8, 10, 0, 4, 20, 4, body, group); box(side * 15, 28, 0, 4, 22, 4, body, group); }
      } else if (type === "imp") {
        mesh(sphere, body, 0, 21, 0, 10, 15, 9, group); mesh(sphere, body, 0, 38, 0, 10, 9, 8, group);
        for (const side of [-1, 1]) {
          mesh(cone, body, side * 7, 48, 0, 3, 12, 3, group);
          const wing = mesh(cone, body, side * 17, 25, -2, 9, 22, 2, group); wing.rotation.z = side * -0.9;
          box(side * 6, 7, 0, 4, 14, 4, body, group);
        }
      } else if (type === "golem") {
        box(0, 33, 0, 36, 36, 28, body, group); box(0, 61, 0, 26, 22, 25, body, group);
        for (const side of [-1, 1]) { box(side * 27, 31, 0, 14, 32, 18, body, group); box(side * 12, 10, 0, 17, 20, 22, body, group); }
      } else {
        mesh(cone, body, 0, 26, 0, 17, 44, 17, group); mesh(sphere, body, 0, 47, 0, 13, 15, 12, group);
        for (const side of [-1, 1]) mesh(cone, body, side * 20, 24, 0, 5, 30, 5, group);
      }
      const eyeY = type === "slime" ? 23 : type === "golem" ? 63 : type === "imp" ? 40 : 49;
      const eyeZ = type === "slime" ? 18 : type === "golem" ? 13 : 8;
      for (const side of [-1, 1]) mesh(sphere, eyeMat, side * 4, eyeY, eyeZ, 2.4, 2.2, 2, group);
      // Two reusable draws per silhouette instead of separate draws for every rib/limb/eye.
      const merged = [body, eyeMat].map(m => {
        const pieces = group.children.filter(child => child instanceof T.Mesh && child.material === m).map(child => {
          const part = child as T.Mesh; part.updateMatrix(); return part.geometry.clone().applyMatrix4(part.matrix);
        });
        const result = geometry(mergeGeometries(pieces)!); for (const piece of pieces) piece.dispose(); return result;
      });
      group.clear(); mesh(merged[0], body, 0, 0, 0, 1, 1, 1, group); mesh(merged[1], eyeMat, 0, 0, 0, 1, 1, 1, group);
      enemyGeometry.set(type, { body: merged[0], eyes: merged[1] });
      return group;
    });
    const health = label(); textures.add(health.texture); materials.add(health.sprite.material); scene.add(health.sprite); health.sprite.visible = false;
    return { root, body, shapes, health, id: 0, flash: 0, key: "" };
  });
  // Boss extras are read straight from the simulation every frame, so reset/clear need no bookkeeping.
  const shieldMat = material(new T.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x6cc8ff, emissiveIntensity: 1.6, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }));
  const bossShield = mesh(geometry(new T.CylinderGeometry(58, 58, 90, 24, 1, true, Math.PI / 2 - BOSS.shieldHalf, BOSS.shieldHalf * 2)), shieldMat, 0, 45, 0, 1, 1, 1);
  bossShield.visible = false;
  const orbMat = material(new T.MeshStandardMaterial({ color: 0xff5ad1, emissive: 0xff5ad1, emissiveIntensity: 3 }));
  const bossOrbViews = Array.from({ length: BOSS.maxOrbs }, () => { const orb = mesh(sphere, orbMat, 0, 0, 0, 1, 1, 1); orb.visible = false; return orb; });
  const projectileGeometry = [sphere, geometry(new T.ConeGeometry(1, 2, 8)), geometry(new T.OctahedronGeometry(1)), sphere];
  const detailGeometry = {
    low: [geometry(new T.IcosahedronGeometry(1, 0)), geometry(new T.ConeGeometry(1, 2, 4)), geometry(new T.TetrahedronGeometry(1)), geometry(new T.IcosahedronGeometry(1, 0))],
    medium: projectileGeometry,
    high: [geometry(new T.SphereGeometry(1, 32, 24)), geometry(new T.ConeGeometry(1, 2, 24)), geometry(new T.IcosahedronGeometry(1, 1)), geometry(new T.SphereGeometry(1, 32, 24))],
  };
  const ribbonShape = geometry(new T.TorusGeometry(1, 0.065, 4, 28, Math.PI * 1.65));
  const rockShape = geometry(new T.DodecahedronGeometry(1, 0));
  const rayShape = geometry(new T.PlaneGeometry(1, 1));
  const reticleShape = geometry(new T.RingGeometry(0.8, 1, 4));
  const projectileViews = Array.from({ length: LIMITS.active }, () => {
    const m = standard(0xffffff, 0.25, 0.22); m.emissiveIntensity = 2.8;
    const object = mesh(sphere, m, 0, 0, 0, 1, 1, 1); object.visible = false;
    object.castShadow = false;
    const glow = disc(0, 0, 1, 0xffffff, 0.22); glow.visible = false;
    const effects = new T.Group(); scene.add(effects);
    const accent = material(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    const ribbons = Array.from({ length: 3 }, () => mesh(ribbonShape, accent, 0, 0, 0, 1, 1, 1, effects));
    const rockMat = standard(0x8e6b45, 0.05, 1);
    const rocks = Array.from({ length: 5 }, () => mesh(rockShape, rockMat, 0, 0, 0, 1, 1, 1, effects));
    const smokeMat = material(new T.MeshBasicNodeMaterial({ color: 0x22132f, transparent: true, depthWrite: false }));
    const rimColor = uniform(new T.Color(0xb673ff));
    smokeMat.colorNode = rimColor.mul(normalView.z.abs().oneMinus().pow(2).mul(1.5).add(0.08));
    smokeMat.opacityNode = normalView.z.abs().mul(0.3).add(0.35);
    const smoke = Array.from({ length: 3 }, () => mesh(sphere, smokeMat, 0, 0, 0, 1, 1, 1, effects));
    const rays = Array.from({ length: 6 }, () => mesh(rayShape, accent, 0, 0, 0, 1, 1, 1, effects));
    const reticle = new T.Mesh(reticleShape, accent); reticle.rotation.x = -Math.PI / 2; scene.add(reticle);
    effects.traverse(child => { child.castShadow = false; });
    return { object, m, glow, effects, accent, ribbons, rocks, smoke, rimColor, rays, reticle };
  });
  // Ground decals read simulation zones only. This clock freezes all shader motion on reduced motion.
  const shaderClock = uniform(0), decalShape = geometry(new T.PlaneGeometry(2, 2));
  const zoneMaterials = Object.fromEntries((["fire", "frost", "poison"] as const).map(element => {
    const m = material(new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    const coord = uv().sub(0.5).mul(2), radius = coord.length();
    const wave = element === "fire" ? coord.x.mul(15).add(coord.y.mul(19)).sub(shaderClock.mul(5)).sin()
      : element === "frost" ? radius.mul(28).sub(shaderClock).sin().mul(coord.x.mul(18).sin())
      : coord.x.mul(9).add(shaderClock).sin().mul(coord.y.mul(13).sub(shaderClock.mul(2)).sin());
    m.color.set(ELEMENT_COLORS[element]);
    m.opacityNode = radius.smoothstep(0.65, 1).oneMinus().mul(wave.mul(0.2).add(0.45));
    return [element, m];
  })) as Record<"fire" | "frost" | "poison", T.MeshBasicNodeMaterial>;
  const zoneViews = Array.from({ length: 64 }, () => {
    const object = new T.Mesh(decalShape, zoneMaterials.fire); object.rotation.x = -Math.PI / 2; object.visible = false; scene.add(object); return object;
  });
  // Fixed particle pool and one instanced draw per element. Effect transforms reuse scratch objects.
  const particles = Array.from({ length: 512 }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 0, size: 1, element: "arcane" as Recipe["mechanics"]["element"], color: new T.Color() }));
  const boltShape = new T.Shape().moveTo(0.2, 1.5).lineTo(-0.9, -0.1).lineTo(-0.1, -0.1).lineTo(-0.4, -1.5).lineTo(0.9, 0.3).lineTo(0.15, 0.3).closePath();
  const particleShapes = { arcane: geometry(new T.TorusGeometry(1, 0.18, 4, 12)), fire: cone, frost: geometry(new T.OctahedronGeometry(1)), lightning: geometry(new T.ExtrudeGeometry(boltShape, { depth: 0.2, bevelEnabled: false })), poison: sphere, wind: ringGeometry, earth: cube, shadow: sphere, holy: cone };
  const particleMaterial = material(new T.MeshBasicMaterial({ color: 0xffffff }));
  function particlePool(shape: T.BufferGeometry) {
    const object = new T.InstancedMesh(shape, particleMaterial, 512);
    object.instanceMatrix.setUsage(T.DynamicDrawUsage); object.frustumCulled = false; object.count = 0; scene.add(object);
    return object;
  }
  const particleMeshes = { arcane: particlePool(particleShapes.arcane), fire: particlePool(particleShapes.fire), frost: particlePool(particleShapes.frost), lightning: particlePool(particleShapes.lightning), poison: particlePool(particleShapes.poison), wind: particlePool(particleShapes.wind), earth: particlePool(particleShapes.earth), shadow: particlePool(particleShapes.shadow), holy: particlePool(particleShapes.holy) };
  let particleCursor = 0, trailClock = 0;
  function particle(x: number, y: number, z: number, element: Recipe["mechanics"]["element"], angle: number, speed: number, size: number, lifetime = 0.55, tint?: string) {
    if (reduced || lifetime <= 0) return;
    const p = particles[particleCursor++ % QUALITY[settings.quality].particles];
    p.x = x; p.y = y; p.z = z; p.vx = Math.cos(angle) * speed; p.vz = Math.sin(angle) * speed;
    p.vy = element === "fire" ? 28 : element === "poison" ? -24 : 5;
    p.age = 0; p.life = lifetime; p.size = size; p.element = element; p.color.set(tint ?? ELEMENT_COLORS[element]);
    if (element === "shadow") p.vy = 18;
    if (element === "earth") { p.vy = -10; p.color.set(tint ?? "#ac9275"); }
  }
  const rings = Array.from({ length: 16 }, () => { const object = disc(0, 0, 1, 0xffffff); object.visible = false; return { object, age: 1, radius: 1 }; });
  const arcs = Array.from({ length: 24 }, () => {
    const g = geometry(new T.BufferGeometry()); g.setAttribute("position", new T.BufferAttribute(new Float32Array(9 * 3), 3));
    const m = material(new T.LineBasicMaterial({ color: 0xffe680, transparent: true })); const object = new T.Line(g, m); object.visible = false; object.frustumCulled = false; scene.add(object); return { object, age: 1 };
  });
  const numbers = Array.from({ length: 24 }, () => { const item = label(128, 64); textures.add(item.texture); materials.add(item.sprite.material); scene.add(item.sprite); item.sprite.visible = false; item.sprite.scale.set(48, 24, 1); return { ...item, age: 1 }; });
  let ringCursor = 0, arcCursor = 0, numberCursor = 0;
  function impact(event: Impact) {
    if (event.kind === "cast") { castFlash = 0.22; staffMat.emissive.set(event.color); staffLight.color.set(event.color); return; }
    if (event.kind === "caster") { casterFlash = 0.3; message = "Caster touched · sandbox continues"; return; }
    if (event.kind === "spawn") {
      for (const portal of portals) if (Math.hypot(portal.arch.position.x - event.x, portal.arch.position.z - event.y) < 140) portal.flash = 0.7;
      const ring = rings[ringCursor++ % rings.length]; ring.age = 0; ring.radius = 30; ring.object.position.set(event.x, 1, event.y); ring.object.material.color.set(0xb998ff);
      for (let i = 0; i < 8; i++) particle(event.x, 3, event.y, "arcane", i * Math.PI / 4, 25, 3);
      return;
    }
    if (event.kind === "death") {
      for (let i = 0; i < 16; i++) particle(event.x, 8 + i * 3, event.y, "arcane", i * 2.4, 25 + i * 3, 5);
      message = "Enemy defeated"; return;
    }
    message = event.targetId ? `${event.targetId > 0 ? `Target ${event.targetId}` : "Enemy"} · ${event.element} · ${event.damage} damage` : event.kind === "landing" ? "Spell landed" : event.kind === "split" ? "Wall contact · parent split into smaller spells" : event.kind === "explosion" ? "Area explosion" : "Wall contact · ward struck";
    if (event.reaction) {
      message = `${REACTIONS[event.reaction].label}! · ${message}`;
      if (!event.targetId && !reduced) for (let i = 0; i < 14; i++) particle(event.x, 22, event.y, event.element, i * Math.PI / 7, 95, 5);
    }
    if (event.targetId) {
      const view = event.targetId > 0 ? targetViews[event.targetId - 1] : enemyViews.find(v => v.id === event.targetId);
      if (view) view.flash = 0.2;
      const n = numbers[numberCursor++ % numbers.length]; n.age = 0; n.sprite.position.set(event.x, 86, event.y); n.sprite.visible = true;
      const ctx = n.context; ctx.clearRect(0, 0, 128, 64); ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = "#16121e"; ctx.strokeText(`−${event.damage}`, 64, 32); ctx.fillStyle = event.color; ctx.fillText(`−${event.damage}`, 64, 32); n.texture.needsUpdate = true;
    }
    if (event.element === "holy" && event.targetId && !reduced) {
      for (let i = 0; i < 12; i++) particle(event.x, 26, event.y, "holy", i * Math.PI / 6, 80, 4);
    }
    if (event.kind === "explosion") {
      const ring = rings[ringCursor++ % rings.length]; ring.age = 0; ring.radius = event.radius ?? 75;
      ring.object.position.set(event.x, 1.2, event.y); ring.object.material.color.set(event.color); ring.object.visible = true;
    }
    if (event.kind === "chain" && event.from) {
      const arc = arcs[arcCursor++ % arcs.length]; arc.age = 0; arc.object.visible = true; const positions = arc.object.geometry.attributes.position;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, jag = reduced || i === 0 || i === 8 ? 0 : (i % 2 ? 7 : -7);
        positions.setXYZ(i, event.from.x + (event.x - event.from.x) * t, 35 + jag, event.from.y + (event.y - event.from.y) * t);
      }
      positions.needsUpdate = true;
    }
    if (event.kind !== "dot") for (let i = 0; i < Math.ceil((settings.quality === "low" ? 4 : 10) * (event.appearance?.particleDensity ?? 1)); i++) particle(event.x, 24, event.y, event.element, i * 2.4, 30 + i % 3 * 15, 3);
  }
  let pipeline: T.RenderPipeline | undefined, bloomPass: ReturnType<typeof bloom> | undefined, scenePass: ReturnType<typeof pass> | undefined, bloomFailed = false;
  function disposeBloom() { pipeline?.dispose(); bloomPass?.dispose(); scenePass?.dispose(); pipeline = undefined; bloomPass = undefined; scenePass = undefined; }
  function configureBloom() {
    if (!QUALITY[settings.quality].bloom || reduced || bloomFailed) { disposeBloom(); return; }
    if (pipeline) return;
    try {
      pipeline = new T.RenderPipeline(renderer); scenePass = pass(scene, camera); const output = scenePass.getTextureNode("output");
      bloomPass = bloom(output, 0.35, 0.35, 1.2); bloomPass.setResolutionScale(0.5); pipeline.outputNode = output.add(bloomPass);
    } catch { bloomFailed = true; disposeBloom(); }
  }
  function resize() {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[settings.quality].pixelRatio)); renderer.setSize(width, height, false); fitCamera(camera, width, height);
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  function clearEffects() {
    castFlash = 0; casterFlash = 0; for (const p of particles) p.life = 0;
    for (const r of rings) { r.age = 1; r.object.visible = false; } for (const a of arcs) { a.age = 1; a.object.visible = false; }
    for (const n of numbers) { n.age = 1; n.sprite.visible = false; }
    for (const t of targetViews) t.flash = 0;
    for (const view of enemyViews) { view.id = 0; view.flash = 0; view.root.visible = view.health.sprite.visible = false; }
    for (const portal of portals) portal.flash = 0;
  }
  function applySettings(next: Settings) {
    const quality = QUALITY[next.quality], preset = PRESETS[next.lighting];
    if (settings.layout !== next.layout) { sim = new Simulation(next.layout); sim.configureEnemies(latest().spawnSettings); placing = false; buildProps(); clearEffects(); message = "New layout · fresh targets"; }
    settings = next; scene.background = new T.Color(preset.background);
    // Subtle neutral studio reflections; each preset supplies its own colored direct light.
    scene.environmentIntensity = next.lighting === "torchlit" ? 0.16 : next.lighting === "moonlight" ? 0.28 : next.lighting === "arcane" ? 0.2 : 0.3;
    scene.environmentRotation.y = next.lighting === "moonlight" ? Math.PI / 2 : 0;
    moon.castShadow = next.quality !== "low";
    hemisphere.color.set(preset.sky); hemisphere.groundColor.set(preset.ground); hemisphere.intensity = preset.ambient; moon.color.set(preset.moon); moon.intensity = preset.key;
    if (moon.shadow.mapSize.x !== quality.shadowSize) { moon.shadow.mapSize.setScalar(quality.shadowSize); moon.shadow.needsUpdate = true; }
    for (const candle of candles) candle.light.color.set(preset.torch);
    robe.color.set(ROBES[next.robe]); for (const [name, hat] of Object.entries(hats)) hat.visible = name === next.hat;
    resize(); configureBloom();
  }
  const controls: ArenaControls = {
    cast: () => { message = sim.cast(latest().recipe, aim) ? "Spell cast · follow the glow" : "The room is full. Wait for a spell to fade."; },
    reset: () => { sim.reset(); placing = false; clearEffects(); message = "Fresh targets. A clean slate."; },
    spawn: () => { sim.configureEnemies(latest().spawnSettings); message = sim.spawnEnemy(latest().spawnSettings.type) ? "Enemy spawned at the door" : "Spawn blocked or enemy cap reached"; },
    place: enabled => { placing = enabled; message = enabled ? "Place enemy · tap floor or aim with arrows and press Enter" : "Placement cancelled"; if (enabled) container.focus({ preventScroll: true }); },
    placeAtAim: () => {
      if (!placing) return;
      sim.configureEnemies(latest().spawnSettings);
      if (sim.spawnEnemy(latest().spawnSettings.type, aim)) { placing = false; message = "Enemy placed"; }
      else message = "Cannot place here · avoid walls, props, caster, and other enemies";
    },
    startWaves: () => { sim.startWaves(latest().spawnSettings); message = "Wave started"; },
    stopWaves: () => { sim.stopWaves(); message = "Waves stopped"; },
    spawnBoss: () => { sim.configureEnemies(latest().spawnSettings); message = sim.spawnBoss() ? "The Archmage Construct awakens" : "Boss already active, or the east door is blocked"; },
    startSurvival: () => { sim.configureEnemies(latest().spawnSettings); sim.startSurvival(); placing = false; message = "Survival · hold out as long as you can"; },
    clearEnemies: () => { sim.clearEnemies(); placing = false; clearEffects(); message = "Enemies cleared · waves stopped"; },
    setTime: (nextPaused, scale) => { paused = nextPaused; timeScale = [0.25, 0.5, 1, 2].includes(scale) ? scale : 1; message = paused ? "Paused · step or resume" : `Time ${timeScale}x`; },
    step: () => { if (paused) sim.advance(TICK); },
    nudge: (x, y) => {
      const floor = new T.Vector3(aim.x, 0, aim.y).project(camera);
      const next = floorAim(camera, floor.x + x / container.clientWidth * 2, floor.y - y / container.clientHeight * 2); if (next) aim = next;
    },
  };
  function pointer(event: PointerEvent, cast = false) {
    if (cast && event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const next = floorAim(camera, (event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    if (next) { aim = next; if (cast) { if (placing) controls.placeAtAim(); else controls.cast(); container.focus({ preventScroll: true }); } }
  }
  const move = (e: PointerEvent) => pointer(e), down = (e: PointerEvent) => pointer(e, true);
  renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerdown", down);
  function onMotion() { reduced = motion.matches; if (reduced) clearEffects(); configureBloom(); }
  motion.addEventListener("change", onMotion); applySettings(settings);
  const important = new Int32Array(8), scores = new Float32Array(8); let importantCount = 0, stopped = false;
  const frameTimes: number[] = []; let metricAt = 0;
  function frame(now: number) {
    if (stopped) return;
    const frameStart = performance.now(), frameMs = now - previous;
    const dt = Math.min(Math.max(0, (now - previous) / 1000), 0.05); previous = now; elapsed += dt;
    const next = latest().settings;
    if ((Object.keys(next) as (keyof Settings)[]).some(key => next[key] !== settings[key])) applySettings(SettingsSchema.parse(next));
    if (spawnSettings !== latest().spawnSettings) { spawnSettings = latest().spawnSettings; sim.configureEnemies(spawnSettings); }
    if (!paused) sim.advance(dt * timeScale);
    for (const view of enemyViews) if (!sim.enemies.some(e => e.id === view.id)) { view.id = 0; view.root.visible = view.health.sprite.visible = false; }
    for (const e of sim.enemies) if (!enemyViews.some(v => v.id === e.id)) {
      const view = enemyViews.find(v => v.id === 0)!; view.id = e.id; view.flash = 0; view.key = "";
    }
    for (const event of sim.events) impact(event); sim.events.length = 0;
    const quality = QUALITY[settings.quality], preset = PRESETS[settings.lighting];
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i], flicker = reduced ? 1 : 1 + Math.sin(elapsed * 4 + i * 2) * 0.05 + Math.sin(elapsed * 7 + i) * 0.025;
      candle.light.intensity = settings.quality === "low" && i > 0 ? 0 : preset.power * flicker; candle.flame.scale.y = 8 * flicker;
    }
    casterRoot.position.y = reduced ? 0 : Math.sin(elapsed * 2) * 1.2;
    castFlash = Math.max(0, castFlash - dt); staffLight.intensity = castFlash / 0.22 * 14000; staff.scale.setScalar(7 + (reduced ? 0 : castFlash * 24));
    casterFlash = Math.max(0, casterFlash - dt); robe.emissive.set(0xff7444); robe.emissiveIntensity = casterFlash > 0 ? 1.4 : 0;
    for (const portal of portals) {
      portal.flash = Math.max(0, portal.flash - dt); portal.m.emissiveIntensity = 0.6 + portal.flash * 3;
      portal.glow.material.opacity = 0.25 + portal.flash * 0.5;
      portal.glow.rotation.z = reduced ? 0 : elapsed * 0.4;
    }
    aimRing.position.set(aim.x, 0.9, aim.y);
    aimRing.material.color.set(placing ? sim.canPlace(aim, ENEMY_STATS[spawnSettings.type].radius) ? 0x9cde79 : 0xff7868 : 0xd9b8ff);
    aimRing.scale.setScalar(placing ? ENEMY_STATS[spawnSettings.type].radius : 16);
    aimVertices[0] = CASTER.x; aimVertices[1] = 1; aimVertices[2] = CASTER.y; aimVertices[3] = aim.x; aimVertices[4] = 1; aimVertices[5] = aim.y; aimLineGeometry.attributes.position.needsUpdate = true;
    shaderClock.value = reduced ? 0 : elapsed;
    for (let i = 0; i < zoneViews.length; i++) {
      const object = zoneViews[i], zone = sim.zones[i]; object.visible = Boolean(zone);
      if (zone) { object.material = zoneMaterials[zone.element]; object.position.set(zone.x, 1.1, zone.y); object.scale.setScalar(zone.radius); }
    }
    trailClock += dt; const trail = trailClock >= (settings.quality === "low" ? 0.08 : 0.035); if (trail) trailClock = 0;
    for (let i = 0; i < projectileViews.length; i++) {
      const view = projectileViews[i], p = sim.projectiles[i]; view.object.visible = view.glow.visible = Boolean(p);
      view.effects.visible = Boolean(p) && settings.quality !== "low"; view.reticle.visible = false; if (!p) continue;
      const kindIndex = p.kind === "bolt" ? 1 : p.kind === "shard" ? 2 : p.kind === "wisp" ? 3 : 0;
      view.object.geometry = p.mechanics.element === "earth" ? rockShape : detailGeometry[settings.quality === "low" ? "low" : p.appearance.meshDetail][kindIndex]; view.m.color.set(p.color); view.m.emissive.set(p.color);
      const progress = p.landingDistance > 0 ? Math.min(1, p.distance / p.landingDistance) : 1;
      const height = p.mechanics.flight === "arc" ? 21 + 110 * 4 * progress * (1 - progress) : 21;
      view.object.position.set(p.x, height, p.y); view.object.rotation.set(0, 0, 0);
      const pulse = p.kind === "wisp" && !reduced ? 1 + Math.sin(elapsed * 8 + p.id) * 0.1 : 1; view.object.scale.setScalar(p.radius * pulse);
      if (p.kind === "bolt") { view.object.rotation.set(Math.PI / 2, 0, -Math.atan2(p.vx, p.vy)); view.object.scale.set(p.radius * 0.55, p.radius * 1.8, p.radius * 0.55); }
      else if (p.kind === "shard" && !reduced) view.object.rotation.set(p.age, p.age * 2, p.age);
      view.m.emissiveIntensity = p.appearance.glow * (p.mechanics.element === "holy" ? 4 : 2.8);
      view.glow.material.opacity = 0.22 * Math.min(2, p.appearance.glow);
      view.effects.position.set(p.x, height, p.y); view.effects.scale.setScalar(p.radius);
      view.accent.color.set(p.appearance.secondaryColor); view.accent.opacity = Math.min(0.9, 0.4 * p.appearance.glow);
      view.rimColor.value.set(p.appearance.secondaryColor).lerp(color.set(ELEMENT_COLORS.shadow), 0.65);
      const motionTime = reduced ? 0 : p.age;
      const flight = p.mechanics.flight, element = p.mechanics.element;
      for (let j = 0; j < view.ribbons.length; j++) {
        const ribbon = view.ribbons[j]; ribbon.visible = element === "wind" || flight === "spiral" || flight === "boomerang";
        ribbon.scale.setScalar(1.3 + j * 0.35);
        ribbon.rotation.set(j * 0.8 + (flight === "boomerang" ? Math.PI / 2 : 0), motionTime * (flight === "spiral" ? 6 : 3) + j, j * 0.7);
      }
      for (let j = 0; j < view.rocks.length; j++) {
        const rock = view.rocks[j]; rock.visible = element === "earth";
        const angle = j * Math.PI * 2 / 5 + motionTime;
        rock.position.set(Math.cos(angle) * 1.1, Math.sin(angle * 2) * 0.3, Math.sin(angle) * 1.1);
        rock.scale.setScalar(0.3 + j % 2 * 0.15); rock.rotation.set(motionTime + j, j, motionTime);
      }
      for (let j = 0; j < view.smoke.length; j++) {
        const smoke = view.smoke[j]; smoke.visible = element === "shadow";
        smoke.position.set(Math.sin(motionTime * 2 + j * 2) * 0.45, j * 0.3, Math.cos(motionTime * 2 + j * 2) * 0.45);
        smoke.scale.setScalar(1.1 + j * 0.2);
      }
      for (let j = 0; j < view.rays.length; j++) {
        const ray = view.rays[j]; ray.visible = element === "holy";
        ray.quaternion.copy(camera.quaternion); ray.rotateZ(j * Math.PI / 3 + motionTime * 0.4);
        ray.scale.set(0.18, 5 + j % 2 * 2, 1);
      }
      if (flight === "homing") {
        const target = [...sim.targets, ...sim.enemies].find(t => t.id === p.targetId);
        if (target) { view.reticle.visible = true; view.reticle.position.set(target.x, 1.5, target.y); view.reticle.scale.setScalar(target.radius + 9); view.reticle.rotation.z = motionTime; }
      }
      view.glow.position.set(p.x, 0.9, p.y); view.glow.scale.setScalar(p.radius * 1.8); view.glow.material.color.set(ELEMENT_COLORS[p.mechanics.element]);
      if (trail && p.appearance.trailLength > 0) {
        const count = Math.min(4, Math.floor(p.appearance.particleDensity * 2));
        for (let j = 0; j < count; j++) particle(p.x, height, p.y, p.mechanics.element, p.id + p.age + j * 2, element === "wind" ? 20 : 4,
          element === "shadow" ? 6 : p.kind === "wisp" ? 4.5 : 3, p.appearance.trailLength, j % 2 ? p.color : p.appearance.secondaryColor);
      }
    }
    // Prefer parents, then larger spells. Eight insertion slots avoid per-frame sorting/allocation.
    importantCount = 0;
    for (let i = 0; i < sim.projectiles.length; i++) {
      const p = sim.projectiles[i], score = p.radius + (p.child ? 0 : 30); let slot = importantCount;
      while (slot > 0 && scores[slot - 1] < score) slot--;
      if (slot >= quality.lights) continue;
      for (let j = Math.min(importantCount, quality.lights - 1); j > slot; j--) { important[j] = important[j - 1]; scores[j] = scores[j - 1]; }
      important[slot] = i; scores[slot] = score; importantCount = Math.min(quality.lights, importantCount + 1);
    }
    for (let i = 0; i < projectileLights.length; i++) {
      const light = projectileLights[i], p = i < importantCount ? sim.projectiles[important[i]] : undefined; light.intensity = p ? 9500 * p.appearance.lightIntensity : 0;
      if (p) { light.position.set(p.x, 32, p.y); light.color.set(ELEMENT_COLORS[p.mechanics.element]); }
    }
    for (let i = 0; i < targetViews.length; i++) {
      const t = sim.targets[i], view = targetViews[i], statuses = t.statuses; view.flash = Math.max(0, view.flash - dt);
view.group.scale.y = t.hp > 0 ? 1 : 0.18;
      view.m.color.set(view.flash > 0 ? 0xd9b48a : statuses?.chill ? 0x90c8ff : statuses?.burn ? 0xffac76 : statuses?.poison ? 0x9cde79 : statuses?.weaken ? 0xb673ff : statuses?.stagger ? 0xd1a16b : 0xc29b70);
      view.markers[0].visible = Boolean(statuses?.burn); view.markers[1].visible = Boolean(statuses?.chill); view.markers[2].visible = Boolean(statuses?.poison);
      const key = t.hp * 32 + (statuses?.burn ? 1 : 0) + (statuses?.chill ? 2 : 0) + (statuses?.poison ? 4 : 0) + (statuses?.weaken ? 8 : 0) + (statuses?.stagger ? 16 : 0);
      if (key !== view.key) {
        view.key = key; const ctx = view.health.context; ctx.clearRect(0, 0, 256, 96);
        ctx.fillStyle = "#17121fdd"; ctx.fillRect(18, 24, 220, 18); ctx.fillStyle = t.hp ? "#d8b78b" : "#705d6b"; ctx.fillRect(20, 26, 216 * t.hp / 100, 14);
        ctx.font = "22px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#f0ddfc"; ctx.fillText(`${i + 1} · ${t.hp} HP`, 128, 20);
        ctx.font = "18px sans-serif"; ctx.fillText(`${statuses?.burn ? "BURN " : ""}${statuses?.chill ? "CHILL " : ""}${statuses?.poison ? "POISON " : ""}${statuses?.weaken ? "WEAKEN " : ""}${statuses?.stagger ? "STAGGER" : ""}`, 128, 69); view.health.texture.needsUpdate = true;
      }
    }
    for (const view of enemyViews) {
      const e = sim.enemies.find(enemy => enemy.id === view.id); if (!e) continue;
      view.root.visible = view.health.sprite.visible = true; view.flash = Math.max(0, view.flash - dt);
      const idle = reduced || spawnSettings.frozen ? 0 : Math.sin(e.age * (e.moving ? 12 : 3) + e.phase);
      const scale = e.small ? 0.5 : e.boss ? 1.8 : 1;
      view.root.position.set(e.x, reduced || spawnSettings.frozen ? 0 : (e.type === "wraith" ? 9 + idle * 5 : Math.abs(idle) * (e.moving ? 3 : 0.5)), e.y);
      view.root.scale.set(scale * (1 + idle * 0.035), scale * (1 - idle * 0.05), scale * (1 + idle * 0.035));
      view.root.rotation.set(0, Math.atan2(CASTER.x - e.x, CASTER.y - e.y), 0);
      view.shapes.forEach((group, index) => { group.visible = EnemyTypeSchema.options[index] === e.type; });
      view.body.color.set(e.statuses?.chill ? 0x90c8ff : e.statuses?.burn ? 0xffac76 : e.statuses?.poison ? 0x9cde79 : e.statuses?.weaken ? 0xb673ff : e.statuses?.stagger ? 0xd1a16b : e.boss ? (e.boss.phase === 3 ? 0xc44fa8 : 0x7a4fb0) : enemyColors[e.type]);
      view.body.emissive.copy(view.body.color); view.body.emissiveIntensity = view.flash > 0 ? 0.25 : e.boss ? 0.35 : 0.08;
      view.body.opacity = e.phased ? 0.24 : e.type === "wraith" ? 0.72 : 1; view.body.depthWrite = !e.phased;
      view.health.sprite.position.set(e.x, e.small ? 52 : e.boss ? 160 : e.type === "golem" ? 96 : 83, e.y);
      const status = `${e.phased ? "PHASE " : ""}${e.statuses?.burn ? "BURN " : ""}${e.statuses?.chill ? "CHILL " : ""}${e.statuses?.poison ? "POISON " : ""}${e.statuses?.weaken ? "WEAKEN " : ""}${e.statuses?.stagger ? "STAGGER" : ""}`;
      const key = `${e.hp}:${status}:${e.boss?.phase ?? 0}`;
      if (key !== view.key) {
        view.key = key; const ctx = view.health.context; ctx.clearRect(0, 0, 256, 96);
        ctx.fillStyle = "#17121fdd"; ctx.fillRect(18, 28, 220, 18); ctx.fillStyle = e.phased ? "#a8a0c4" : "#9cde79"; ctx.fillRect(20, 30, 216 * e.hp / e.maxHp, 14);
        ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#f0ddfc"; ctx.fillText(e.boss ? `Construct · phase ${e.boss.phase}` : `${e.small ? "small " : ""}${e.type} · ${e.hp} HP`, 128, 23);
        ctx.font = "18px sans-serif"; ctx.fillText(status, 128, 70); view.health.texture.needsUpdate = true;
      }
    }
    const boss = sim.boss;
    bossShield.visible = boss?.boss?.phase === 3;
    if (boss?.boss) { bossShield.position.set(boss.x, 45, boss.y); bossShield.rotation.y = -boss.boss.shield; shieldMat.opacity = reduced ? 0.45 : 0.38 + Math.sin(elapsed * 6) * 0.08; }
    bossOrbViews.forEach((view, i) => {
      const orb = sim.bossOrbs[i]; view.visible = !!orb; if (!orb) return;
      // Charging orbs swell and pulse at the boss (the telegraph), then fly at chest height.
      const charge = orb.armIn > 0 ? 1 - orb.armIn / BOSS.telegraph : 1, pulse = reduced || orb.armIn <= 0 ? 1 : 1 + Math.sin(elapsed * 30) * 0.15;
      view.position.set(orb.x, 46, orb.y); view.scale.setScalar(orb.radius * Math.max(0.2, charge) * pulse);
    });
    for (const element of ELEMENTS) particleMeshes[element].count = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]; p.age += dt; if (reduced || i >= quality.particles || p.age >= p.life) continue;
      const fade = 1 - p.age / p.life; dummy.position.set(p.x + p.vx * p.age, Math.max(1, p.y + p.vy * p.age), p.z + p.vz * p.age);
      dummy.rotation.set(p.element === "frost" ? p.age * 5 : p.element === "arcane" ? 0.6 : 0, p.age * 2, p.element === "lightning" ? 0.8 : 0);
      dummy.scale.set(p.size * fade, p.size * fade * (p.element === "fire" || p.element === "poison" ? 2.2 : 1), p.size * fade);
      const particleMesh = particleMeshes[p.element];
      dummy.updateMatrix(); particleMesh.setMatrixAt(particleMesh.count, dummy.matrix); particleMesh.setColorAt(particleMesh.count, p.color); particleMesh.count++;
    }
    for (const element of ELEMENTS) {
      const particleMesh = particleMeshes[element]; particleMesh.instanceMatrix.needsUpdate = true; if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
    }
    for (const r of rings) { r.age += dt; r.object.visible = r.age < 0.45; if (r.object.visible) { r.object.scale.setScalar(r.radius * (reduced ? 1 : Math.min(1, r.age / 0.12))); r.object.material.opacity = 1 - r.age / 0.45; } }
    for (const a of arcs) { a.age += dt; a.object.visible = a.age < 0.22; a.object.material.opacity = Math.max(0, 1 - a.age / 0.22); }
    for (const n of numbers) { n.age += dt; n.sprite.visible = n.age < 0.85; if (n.sprite.visible) { n.sprite.position.y = 86 + (reduced ? 0 : n.age * 28); n.sprite.material.opacity = 1 - n.age / 0.85; } }
    renderer.info.reset();
    try {
      if (pipeline) {
        try { pipeline.render(); }
        catch {
          bloomFailed = true; disposeBloom();
          // A failed post-process can leave its render target and color transform active.
          renderer.setRenderTarget(null); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputColorSpace = T.SRGBColorSpace;
          renderer.render(scene, camera);
        }
      } else renderer.render(scene, camera);
    } catch { dispose(); onFailure(); return; }
    if (process.env.NODE_ENV === "development" && latest().diagnostics) {
      if (frameMs > 0 && frameMs < 1000) frameTimes.push(frameMs);
      if (frameTimes.length > 120) frameTimes.shift();
      if (now >= metricAt && frameTimes.length) {
        metricAt = now + 500; const sorted = [...frameTimes].sort((a, b) => a - b);
        onMetrics({ frameMs: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
          cpuMs: performance.now() - frameStart, drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles,
          projectiles: sim.projectiles.length, enemies: sim.enemies.length });
      }
    } else { frameTimes.length = 0; metricAt = 0; }
    if (elapsed >= snapshotAt) {
      snapshotAt = elapsed + 0.1; const snapshot: Snapshot = { active: sim.projectiles.length, ...sim.stats, health: sim.targets.map(t => t.hp), message,
        enemies: sim.enemies.length, wave: sim.wave.number, wavesRunning: sim.wave.running, placing,
        survival: { ...sim.survival },
        boss: sim.boss?.boss ? { hp: sim.boss.hp, maxHp: sim.boss.maxHp, phase: sim.boss.boss.phase } : null,
        combat: { ...sim.combat, damage: { ...sim.combat.damage }, reactions: { ...sim.combat.reactions }, dps: Math.round(sim.combat.dps * 10) / 10 } };
      const serialized = JSON.stringify(snapshot); if (serialized !== lastSnapshot) { lastSnapshot = serialized; onSnapshot(snapshot); }
    }
  }
  function dispose() {
    if (stopped) return; stopped = true; renderer.setAnimationLoop(null); observer.disconnect(); motion.removeEventListener("change", onMotion);
    scene.environment = null; assets.dispose();
    renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerdown", down);
    disposeBloom(); moon.shadow.map?.dispose(); tiles.dispose(); for (const element of ELEMENTS) particleMeshes[element].dispose();
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    void renderer.dispose(); renderer.domElement.remove();
  }
  renderer.setAnimationLoop(frame);
  return { controls, dispose };
}
