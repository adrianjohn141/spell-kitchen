import { GenerationRequestSchema } from "../../../lib/recipe";
import { generateRecipe, providerConfigured, ProviderError } from "../../../lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ configured: providerConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 8000) return Response.json({ error: "Description is too long." }, { status: 413 });
    const parsed = GenerationRequestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return Response.json({ error: "Enter a description of 3–1000 characters and a valid current recipe." }, { status: 400 });
    const result = await generateRecipe(parsed.data.description, parsed.data.currentRecipe);
    return Response.json(result, { status: result.status === "unsupported" ? 422 : 200 });
  } catch (error) {
    if (error instanceof ProviderError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "The request could not be read. Your recipe is unchanged." }, { status: 400 });
  }
}
