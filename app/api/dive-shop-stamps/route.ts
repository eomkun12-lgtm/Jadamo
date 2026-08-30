import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, diveShopStamps } from "../../../db/schema";
import { getAppendixBucket } from "../../../db/storage";
import { isSiteAdmin, requireSiteAdminResponse } from "../../admin-auth";

const MAX_FILE_BYTES = 2_700_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const output = (row: typeof diveShopStamps.$inferSelect) => ({ id: row.id, destinationId: row.destinationId, shopName: row.shopName, visitedAt: row.visitedAt, imageUrl: `/api/dive-shop-stamps/${encodeURIComponent(row.id)}/file` });

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "숍 스탬프를 처리하지 못했습니다.";
  if (message.includes("no such table")) return Response.json({ error: "스탬프 저장 공간을 준비하는 중입니다." }, { status: 503 });
  if (message.includes("R2 binding")) return Response.json({ error: "사진 저장 공간을 준비하는 중입니다." }, { status: 503 });
  return Response.json({ error: message }, { status: 400 });
}

export async function GET() {
  try {
    const rows = await getDb().select().from(diveShopStamps).orderBy(desc(diveShopStamps.visitedAt)).limit(100);
    return Response.json({ stamps: rows.map(output), isAdmin: await isSiteAdmin() });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  let uploadedKey = "";
  try {
    const form = await request.formData();
    const destinationId = clean(form.get("destinationId"), 80);
    const shopName = clean(form.get("shopName"), 80);
    const visitedAt = clean(form.get("visitedAt"), 10);
    const file = form.get("file");
    if (!destinationId || !shopName || !/^\d{4}-\d{2}-\d{2}$/.test(visitedAt)) return Response.json({ error: "여행, 숍 이름과 방문일을 입력해 주세요." }, { status: 400 });
    if (!(file instanceof File) || !file.size) return Response.json({ error: "도장 사진을 선택해 주세요." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "JPG, PNG 또는 WEBP 사진만 올릴 수 있습니다." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return Response.json({ error: "사진은 2.5MB 이하여야 합니다." }, { status: 400 });

    const db = getDb();
    const [destination] = await db.select({ id: destinations.id }).from(destinations).where(eq(destinations.id, destinationId)).limit(1);
    if (!destination) return Response.json({ error: "여행을 찾지 못했습니다." }, { status: 404 });
    const id = crypto.randomUUID();
    const originalName = clean(file.name, 120) || "dive-shop-stamp";
    uploadedKey = `dive-shop-stamps/${destinationId}/${id}`;
    await getAppendixBucket().put(uploadedKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { destinationId, stampId: id } });
    const [row] = await db.insert(diveShopStamps).values({ id, destinationId, shopName, visitedAt, originalName, contentType: file.type, sizeBytes: file.size, r2Key: uploadedKey }).returning();
    return Response.json({ stamp: output(row) }, { status: 201 });
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
    const [row] = await getDb().select().from(diveShopStamps).where(eq(diveShopStamps.id, id)).limit(1);
    if (!row) return Response.json({ error: "삭제할 도장을 찾지 못했습니다." }, { status: 404 });
    await getAppendixBucket().delete(row.r2Key);
    await getDb().delete(diveShopStamps).where(eq(diveShopStamps.id, id));
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
