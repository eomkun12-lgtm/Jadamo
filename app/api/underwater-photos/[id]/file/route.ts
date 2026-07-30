import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { underwaterPhotos } from "../../../../../db/schema";
import { getAppendixBucket } from "../../../../../db/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [row] = await getDb().select().from(underwaterPhotos).where(eq(underwaterPhotos.id, id)).limit(1);
  if (!row) return Response.json({ error: "사진을 찾지 못했습니다." }, { status: 404 });
  const wantsOriginal = new URL(request.url).searchParams.get("variant") === "original";
  const r2Key = !wantsOriginal && row.enhancedR2Key ? row.enhancedR2Key : row.r2Key;
  const object = await getAppendixBucket().get(r2Key);
  if (!object) return Response.json({ error: "사진 파일을 찾지 못했습니다." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": !wantsOriginal && row.enhancedR2Key ? "image/jpeg" : row.contentType,
      "Cache-Control": "public, max-age=3600",
      "ETag": object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
