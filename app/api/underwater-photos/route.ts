import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, underwaterPhotos } from "../../../db/schema";
import { getAppendixBucket } from "../../../db/storage";
import { isSiteAdmin, requireSiteAdminResponse } from "../../admin-auth";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS_PER_TRIP = 120;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_CATEGORIES = new Set(["creature", "ocean"]);

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-100) || "underwater-photo";
}

function output(row: typeof underwaterPhotos.$inferSelect) {
  return {
    id: row.id,
    destinationId: row.destinationId,
    category: row.category,
    caption: row.caption,
    originalName: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    imageUrl: `/api/underwater-photos/${encodeURIComponent(row.id)}/file`,
    originalImageUrl: `/api/underwater-photos/${encodeURIComponent(row.id)}/file?variant=original`,
    isAiEnhanced: Boolean(row.enhancedR2Key),
    enhancementStatus: row.enhancementStatus,
    isRepresentative: Boolean(row.isRepresentative),
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "수중 사진을 처리하지 못했습니다.";
  if (message.includes("no such table")) return Response.json({ error: "수중 기록 저장 공간을 준비하는 중입니다." }, { status: 503 });
  if (message.includes("R2 binding")) return Response.json({ error: "사진 저장 공간을 준비하는 중입니다." }, { status: 503 });
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const destinationId = clean(new URL(request.url).searchParams.get("destinationId"), 80);
    if (!destinationId) return Response.json({ error: "여행지를 선택해 주세요." }, { status: 400 });
    const rows = await getDb().select().from(underwaterPhotos)
      .where(eq(underwaterPhotos.destinationId, destinationId))
      .orderBy(asc(underwaterPhotos.createdAt))
      .limit(MAX_PHOTOS_PER_TRIP);
    return Response.json({ photos: rows.map(output), isAdmin: await isSiteAdmin() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let uploadedKey = "";
  try {
    const form = await request.formData();
    const destinationId = clean(form.get("destinationId"), 80);
    const category = clean(form.get("category"), 20);
    const caption = clean(form.get("caption"), 120);
    const honeypot = clean(form.get("website"), 100);
    const file = form.get("file");
    if (honeypot) return Response.json({ ok: true }, { status: 201 });
    if (!destinationId || !ALLOWED_CATEGORIES.has(category)) return Response.json({ error: "사진 종류를 선택해 주세요." }, { status: 400 });
    if (!(file instanceof File) || !file.size) return Response.json({ error: "업로드할 사진을 선택해 주세요." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "JPG, PNG 또는 WEBP 사진만 올릴 수 있습니다." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return Response.json({ error: "사진은 15MB 이하여야 합니다." }, { status: 400 });

    const db = getDb();
    const [destination] = await db.select({ id: destinations.id }).from(destinations).where(eq(destinations.id, destinationId)).limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });
    const existing = await db.select({ id: underwaterPhotos.id }).from(underwaterPhotos)
      .where(eq(underwaterPhotos.destinationId, destinationId)).limit(MAX_PHOTOS_PER_TRIP);
    if (existing.length >= MAX_PHOTOS_PER_TRIP) return Response.json({ error: "여행별 수중 사진은 최대 120장까지 등록할 수 있습니다." }, { status: 409 });

    const id = crypto.randomUUID();
    const originalName = clean(file.name, 120) || "underwater-photo";
    uploadedKey = `underwater/${destinationId}/${category}/${id}/${safeFilename(originalName)}`;
    await getAppendixBucket().put(uploadedKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { destinationId, underwaterPhotoId: id, category },
    });
    const [row] = await db.insert(underwaterPhotos).values({
      id,
      destinationId,
      category,
      caption,
      originalName,
      contentType: file.type,
      sizeBytes: file.size,
      r2Key: uploadedKey,
      enhancementStatus: "complete",
    }).returning();
    return Response.json({ photo: output(row) }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await getAppendixBucket().delete(uploadedKey).catch(() => undefined);
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const id = clean((await request.json() as { id?: string }).id, 80);
    const [row] = await getDb().select().from(underwaterPhotos).where(eq(underwaterPhotos.id, id)).limit(1);
    if (!row) return Response.json({ error: "삭제할 사진을 찾지 못했습니다." }, { status: 404 });
    await getAppendixBucket().delete(row.r2Key);
    if (row.enhancedR2Key) await getAppendixBucket().delete(row.enhancedR2Key);
    await getDb().delete(underwaterPhotos).where(eq(underwaterPhotos.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const id = clean((await request.json() as { id?: string }).id, 80);
    const db = getDb();
    const [photo] = await db.select().from(underwaterPhotos).where(eq(underwaterPhotos.id, id)).limit(1);
    if (!photo) return Response.json({ error: "사진을 찾지 못했습니다." }, { status: 404 });
    await db.update(underwaterPhotos).set({ isRepresentative: 0 }).where(eq(underwaterPhotos.destinationId, photo.destinationId));
    await db.update(underwaterPhotos).set({ isRepresentative: 1 }).where(eq(underwaterPhotos.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
