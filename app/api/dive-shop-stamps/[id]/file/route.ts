import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { diveShopStamps } from "../../../../../db/schema";
import { getAppendixBucket } from "../../../../../db/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [row] = await getDb().select().from(diveShopStamps).where(eq(diveShopStamps.id, id)).limit(1);
  if (!row) return Response.json({ error: "도장을 찾지 못했습니다." }, { status: 404 });
  const object = await getAppendixBucket().get(row.r2Key);
  if (!object) return Response.json({ error: "사진을 찾지 못했습니다." }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": row.contentType, "Content-Length": String(row.sizeBytes), "Cache-Control": "public, max-age=3600", "ETag": object.httpEtag, "X-Content-Type-Options": "nosniff" } });
}
