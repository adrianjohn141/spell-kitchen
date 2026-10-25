import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RECIPE } from "../lib/recipe";
import { generateRecipe, providerConfigured, SYSTEM_PROMPT } from "../lib/llm";
import { GET, POST } from "../app/api/generate/route";

const fetchMock = vi.fn<typeof fetch>();
function modelResponse(content: unknown) { return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })); }
function request(body: unknown) { return new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); vi.stubEnv("SPELL_LLM_BASE_URL", "http://127.0.0.1:1234/v1"); vi.stubEnv("SPELL_LLM_MODEL", "local-model"); vi.stubEnv("SPELL_LLM_API_KEY", "secret-test-key"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("OpenAI-compatible server adapter", () => {
  it("describes enemy mechanics but rejects enemy controls as recipe fields", async () => {
    for (const term of ["Slime: 120 HP", "Skeleton: 70 HP", "Imp: 30 HP", "Golem: 400 HP", "Wraith: 60 HP", "50% speed", "Living enemy cap=24", "count 1..12 default 4", "difficulty multiplier 0.5..3 default 1", "it never spawns", "Enemy-control requests are unsupported"]) expect(SYSTEM_PROMPT).toContain(term);
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: { enemies: [{ type: "slime" }] }, explanation: "Spawn slime" }));
    await expect(generateRecipe("Spawn slime", DEFAULT_RECIPE)).rejects.toMatchObject({ status: 502 });
  });
  it("validates v3 lightning output and supplies the complete new mechanic contract", async () => {
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: { version: 3, kind: "bolt", mechanics: { element: "lightning", chainCount: 2 } }, explanation: "Fast chain bolt." }));
    const result = await generateRecipe("A fast lightning bolt that chains to two targets", DEFAULT_RECIPE);
    expect(result).toMatchObject({ status: "ok", recipe: { version: 3, kind: "bolt", mechanics: { element: "lightning", speed: 440, chainCount: 2, onHit: "consume" } } });
    for (const term of ["arcane", "fire", "frost", "lightning", "poison", "orb", "bolt", "shard", "wisp", "consume", "pierce", "explode", "burnDamage", "poisonDuration", "chillDuration", "frostBonus", "chainRange", "explosionRadius", "teleportation", "summoning", "homing", "healing", "beams", '"additionalProperties":false']) {
      expect(SYSTEM_PROMPT).toContain(term);
    }
  });
  it("accepts full v3 model output and rejects new out-of-bounds values", async () => {
    const mechanics = { element: "shadow", pattern: "ring", ringCount: 16, flight: "homing", turnRate: 120, acceleration: 400, sizeGrowth: 4,
      gravityPull: 120, chainOnKill: true, killChainCount: 4, zone: "frost", zoneDuration: 8, explosionFalloff: "linear" };
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: { version: 3, mechanics, appearance: { secondaryColor: "#abcdef", glow: 4, meshDetail: "high" } }, explanation: "Homing shadow ring." }));
    expect(await generateRecipe("Homing shadow ring", DEFAULT_RECIPE)).toMatchObject({ status: "ok", recipe: { version: 3, mechanics } });
    for (const invalid of [{ turnRate: 361 }, { burstCount: 6 }, { gravityPull: 121 }, { zoneDuration: 9 }, { acceleration: -201 }]) {
      fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: { mechanics: invalid }, explanation: "Invalid." }));
      await expect(generateRecipe("Spell", DEFAULT_RECIPE)).rejects.toMatchObject({ status: 502 });
    }
    const unsupported = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("Unsupported:"));
    expect(unsupported.split("For supported requests")[0]).not.toContain("homing");
    for (const term of ["wind", "earth", "shadow", "holy", "burstInterval", "fanAngle", "ringCount", "turnRate", "spiralRadius", "maxRange", "acceleration", "sizeGrowth", "gravityPull", "killChainCount", "zoneDamage", "explosionFalloff", "secondaryColor", "trailLength", "particleDensity", "meshDetail"]) expect(SYSTEM_PROMPT).toContain(term);
  });
  it("calls the real adapter boundary with schema, presets, current recipe and server-only credentials", async () => {
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: { mechanics: { speed: 90 } }, explanation: "Slow orb." }));
    const result = await generateRecipe("Make it slow", DEFAULT_RECIPE);
    expect(result.status).toBe("ok"); if (result.status === "ok") expect(result.recipe.mechanics.speed).toBe(90);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer secret-test-key" });
    const body = JSON.parse(String(options?.body));
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT); expect(body.messages[1].content).toContain('"currentRecipe"');
    expect(SYSTEM_PROMPT).toContain('"slow":90'); expect(SYSTEM_PROMPT).toContain("Unsupported");
  });
  it("uses the api-key header and completion token limit for Azure OpenAI / Foundry", async () => {
    vi.stubEnv("SPELL_LLM_BASE_URL", "https://my-resource.openai.azure.com/openai/v1/");
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: {}, explanation: "Orb." }));
    await generateRecipe("Orb", DEFAULT_RECIPE);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://my-resource.openai.azure.com/openai/v1/chat/completions");
    expect(options?.headers).toMatchObject({ "api-key": "secret-test-key" });
    expect(options?.headers).not.toHaveProperty("Authorization");
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({ model: "local-model", max_completion_tokens: 4000 });
    expect(body).not.toHaveProperty("temperature"); expect(body).not.toHaveProperty("max_tokens"); expect(body).not.toHaveProperty("reasoning_effort");
  });
  it("adds the Azure api-version query and reasoning effort when configured", async () => {
    vi.stubEnv("SPELL_LLM_BASE_URL", "https://my-resource.openai.azure.com/openai/deployments/my-deployment");
    vi.stubEnv("SPELL_LLM_API_VERSION", "2025-04-01-preview"); vi.stubEnv("SPELL_LLM_REASONING_EFFORT", "low");
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe: {}, explanation: "Orb." }));
    await generateRecipe("Orb", DEFAULT_RECIPE);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://my-resource.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2025-04-01-preview");
    expect(JSON.parse(String(options?.body))).toMatchObject({ reasoning_effort: "low" });
  });
  it("reports missing configuration without making a provider call", async () => {
    vi.stubEnv("SPELL_LLM_MODEL", ""); expect(providerConfigured()).toBe(false);
    await expect(generateRecipe("Orb", DEFAULT_RECIPE)).rejects.toMatchObject({ status: 503 }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves unsupported explanations without creating an executable spell", async () => {
    fetchMock.mockResolvedValue(modelResponse({ status: "unsupported", explanation: "Reversing time is unsupported. Try bouncing." }));
    const response = await POST(request({ description: "Reverse time", currentRecipe: DEFAULT_RECIPE }));
    expect(response.status).toBe(422); expect(await response.json()).not.toHaveProperty("recipe");
  });
  it.each([{ mechanics: { speed: 9999 } }, { kind: "beam" }, { mechanics: { reverseTime: true } }, { appearance: { color: "url(secret)" } }, { mechanics: { chainCount: 99 } }, { mechanics: { explosionRadius: 9999 } }, { mechanics: { poisonDamage: 999 } }])("rejects invalid provider recipes %j", async recipe => {
    fetchMock.mockResolvedValue(modelResponse({ status: "ok", recipe, explanation: "Here" }));
    await expect(generateRecipe("Test orb", DEFAULT_RECIPE)).rejects.toMatchObject({ status: 502 });
  });
  it("handles malformed output, HTTP errors, network failures, and timeouts without leaking provider text", async () => {
    for (const value of [new Response("bad-json"), modelResponse("not-an-envelope"), new Response("secret-test-key", { status: 401 })]) {
      fetchMock.mockResolvedValue(value);
      await expect(generateRecipe("Orb", DEFAULT_RECIPE)).rejects.not.toThrow("secret-test-key");
    }
    fetchMock.mockRejectedValue(new Error("private endpoint secret-test-key"));
    await expect(generateRecipe("Orb", DEFAULT_RECIPE)).rejects.toThrow("unreachable or timed out");
  });
  it("exposes configuration status without exposing keys or URLs", async () => {
    const status = await GET().json(); expect(status).toEqual({ configured: true });
  });
  it("validates route input before contacting the provider", async () => {
    for (const body of [{ description: "a", currentRecipe: DEFAULT_RECIPE }, { description: "An orb", currentRecipe: { mechanics: { damage: 999 } } }, { description: "x".repeat(1001), currentRecipe: DEFAULT_RECIPE }]) expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request({ description: "x".repeat(9000) }))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
