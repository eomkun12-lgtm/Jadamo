import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appendixFiles, destinations } from "../../../db/schema";
import { getAppendixBucket } from "../../../db/storage";
import { isSiteAdmin, requireSiteAdminResponse } from "../../admin-auth";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_TRIP = 50;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-100) || "reference-file";
}

function publicFile(row: typeof appendixFiles.$inferSelect) {
  return {
    id: row.id,
    destinationId: row.destinationId,
    title: row.title,
    description: row.description,
    contributor: row.contributor,
    originalName: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    fileUrl: `/api/appendix/${encodeURIComponent(row.id)}/file`,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "참고 자료를 처리하지 못했습니다.";
  if (message.includes("no such table")) {
    return Response.json({ error: "참고 자료 저장 공간을 준비하는 중입니다." }, { status: 503 });
  }
  if (message.includes("R2 binding")) {
    return Response.json({ error: "파일 저장 공간을 준비하는 중입니다." }, { status: 503 });
  }
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const destinationId = clean(new URL(request.url).searchParams.get("destinationId"), 80);
    if (!destinationId) return Response.json({ error: "여행지를 선택해 주세요." }, { status: 400 });
    const rows = await getDb()
      .select()
      .from(appendixFiles)
      .where(eq(appendixFiles.destinationId, destinationId))
      .orderBy(asc(appendixFiles.sortOrder), desc(appendixFiles.createdAt))
      .limit(MAX_FILES_PER_TRIP);
    return Response.json({ files: rows.map(publicFile), isAdmin: await isSiteAdmin() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let uploadedKey = "";
  try {
    const form = await request.formData();
    const destinationId = clean(form.get("destinationId"), 80);
    const title = clean(form.get("title"), 80);
    const description = clean(form.get("description"), 300);
    const contributor = clean(form.get("contributor"), 30);
    const honeypot = clean(form.get("website"), 100);
    const file = form.get("file");
    if (honeypot) return Response.json({ ok: true }, { status: 201 });
    if (!destinationId || !title) {
      return Response.json({ error: "여행지와 자료 제목을 입력해 주세요." }, { status: 400 });
    }
    if (!(file instanceof File) || !file.size) {
      return Response.json({ error: "업로드할 파일을 선택해 주세요." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: "JPG, PNG, WEBP 또는 PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }

    const db = getDb();
    const [destination] = await db.select({ id: destinations.id }).from(destinations).where(eq(destinations.id, destinationId)).limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });
    const existing = await db.select({ id: appendixFiles.id }).from(appendixFiles).where(eq(appendixFiles.destinationId, destinationId)).limit(MAX_FILES_PER_TRIP);
    if (existing.length >= MAX_FILES_PER_TRIP) {
      return Response.json({ error: "여행당 참고 자료는 최대 50개까지 등록할 수 있습니다." }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const originalName = clean(file.name, 120) || "reference-file";
    uploadedKey = `appendix/${destinationId}/${id}/${safeFilename(originalName)}`;
    await getAppendixBucket().put(uploadedKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { destinationId, appendixId: id },
    });
    const [row] = await db.insert(appendixFiles).values({
      id,
      destinationId,
      title,
      description,
      contributor,
      originalName,
      contentType: file.type,
      sizeBytes: file.size,
      r2Key: uploadedKey,
      sortOrder: existing.length,
    }).returning();
    return Response.json({ file: publicFile(row) }, { status: 201 });
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
    const [row] = await getDb().select().from(appendixFiles).where(eq(appendixFiles.id, id)).limit(1);
    if (!row) return Response.json({ error: "삭제할 자료를 찾지 못했습니다." }, { status: 404 });
    await getAppendixBucket().delete(row.r2Key);
    await getDb().delete(appendixFiles).where(eq(appendixFiles.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
