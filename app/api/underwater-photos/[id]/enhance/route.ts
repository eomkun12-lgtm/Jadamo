import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { underwaterPhotos } from "../../../../../db/schema";
import { getAppendixBucket } from "../../../../../db/storage";

type RouteContext = { params: Promise<{ id: string }> };

const prompt = "Enhance this real underwater photograph for a natural dive log. Correct the blue-green color cast, gently recover warm tones, reduce underwater haze and backscatter, and improve local contrast and clarity. Keep the exact same subject, composition, crop, scale, animal identity, diver identity, equipment, and scene. Do not add, remove, invent, or stylize anything. No text, watermark, frame, or collage.";

function apiKey() {
  const runtime = globalThis as typeof globalThis & { __ISHIGAKI_ENV__?: { OPENAI_API_KEY?: string } };
  return runtime.__ISHIGAKI_ENV__?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

function decode(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const [photo] = await db.select().from(underwaterPhotos).where(eq(underwaterPhotos.id, id)).limit(1);
  if (!photo) return Response.json({ error: "사진을 찾지 못했습니다." }, { status: 404 });
  if (photo.enhancementStatus === "complete") return Response.json({ ok: true, status: "complete" });
  if (photo.enhancementStatus === "processing") return Response.json({ ok: true, status: "processing" }, { status: 202 });

  await db.update(underwaterPhotos).set({ enhancementStatus: "processing" }).where(eq(underwaterPhotos.id, id));
  let enhancedKey = "";
  try {
    const key = apiKey();
    if (!key) throw new Error("AI 사진 보정 설정이 아직 준비되지 않았습니다.");
    const source = await getAppendixBucket().get(photo.r2Key);
    if (!source) throw new Error("원본 사진 파일을 찾지 못했습니다.");
    const sourceFile = new File([await source.arrayBuffer()], photo.originalName, { type: photo.contentType });
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("image[]", sourceFile, sourceFile.name);
    form.append("prompt", prompt);
    form.append("quality", "low");
    form.append("output_format", "jpeg");
    form.append("output_compression", "85");
    const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const result = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
    const image = result.data?.[0]?.b64_json;
    if (!response.ok || !image) throw new Error(result.error?.message || "AI 사진 보정에 실패했습니다.");
    enhancedKey = `underwater/${photo.destinationId}/${photo.category}/${photo.id}/ai-enhanced.jpg`;
    await getAppendixBucket().put(enhancedKey, decode(image), { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { underwaterPhotoId: id, variant: "ai-enhanced" } });
    await db.update(underwaterPhotos).set({ enhancedR2Key: enhancedKey, enhancementStatus: "complete" }).where(eq(underwaterPhotos.id, id));
    return Response.json({ ok: true, status: "complete" });
  } catch (error) {
    if (enhancedKey) await getAppendixBucket().delete(enhancedKey).catch(() => undefined);
    await db.update(underwaterPhotos).set({ enhancementStatus: "failed" }).where(eq(underwaterPhotos.id, id));
    return Response.json({ error: error instanceof Error ? error.message : "AI 사진 보정에 실패했습니다." }, { status: 400 });
  }
}
