import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appendixFiles } from "../../../../../db/schema";
import { getAppendixBucket } from "../../../../../db/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [row] = await getDb().select().from(appendixFiles).where(eq(appendixFiles.id, id)).limit(1);
  if (!row) return Response.json({ error: "자료를 찾지 못했습니다." }, { status: 404 });
  const object = await getAppendixBucket().get(row.r2Key);
  if (!object) return Response.json({ error: "파일을 찾지 못했습니다." }, { status: 404 });
  const filename = row.originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-90) || "reference-file";
  const encodedFilename = encodeURIComponent(row.originalName.replace(/[\r\n]/g, ""));
  return new Response(object.body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.sizeBytes),
      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "public, max-age=3600",
      "ETag": object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
