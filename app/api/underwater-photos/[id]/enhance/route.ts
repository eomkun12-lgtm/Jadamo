type RouteContext = { params: Promise<{ id: string }> };

// Kept briefly for visitors with an older, cached upload screen. Photo tone
// correction now happens in the browser before upload, so no server AI call is
// needed here.
export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return Response.json({ ok: true, id, status: "complete", mode: "local" });
}
