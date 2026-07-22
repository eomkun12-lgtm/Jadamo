import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, diveLogs } from "../../../db/schema";
import { isSiteAdmin, requireSiteAdminResponse } from "../../admin-auth";

type Payload = {
  id?: string;
  destinationId?: string;
  logIds?: string[];
  date?: string;
  startTime?: string;
  diveNumber?: number;
  pointName?: string;
  latitude?: number | null;
  longitude?: number | null;
  maxDepth?: number | null;
  durationMinutes?: number | null;
  waterTemperature?: number | null;
  visibility?: number | null;
  entryType?: string;
  currentStrength?: string;
  buddies?: string;
  creatures?: string;
  note?: string;
  photoUrls?: string[];
};
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const number = (value: unknown) =>
  value === "" ||
  value === null ||
  value === undefined ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
function output(row: typeof diveLogs.$inferSelect) {
  let photoUrls: string[] = [];
  try {
    photoUrls = JSON.parse(row.photoUrls) as string[];
  } catch {}
  return { ...row, photoUrls };
}
async function values(payload: Payload) {
  const destinationId = clean(payload.destinationId, 80);
  const pointName = clean(payload.pointName, 80);
  const date = clean(payload.date, 10);
  if (!destinationId || !pointName || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("날짜와 포인트 이름을 입력해 주세요.");
  const [destination] = await getDb()
    .select({ id: destinations.id })
    .from(destinations)
    .where(eq(destinations.id, destinationId))
    .limit(1);
  if (!destination) throw new Error("여행지를 찾지 못했습니다.");
  const photoUrls = (payload.photoUrls || [])
    .map((url) => clean(url, 500))
    .filter((url) => /^https?:\/\//.test(url))
    .slice(0, 8);
  return {
    destinationId,
    date,
    startTime: /^\d{2}:\d{2}/.test(clean(payload.startTime, 8))
      ? clean(payload.startTime, 8).slice(0, 5)
      : "",
    pointName,
    diveNumber: Math.max(1, Math.min(9999, Number(payload.diveNumber) || 1)),
    latitude: number(payload.latitude),
    longitude: number(payload.longitude),
    maxDepth: number(payload.maxDepth),
    durationMinutes: number(payload.durationMinutes),
    waterTemperature: number(payload.waterTemperature),
    visibility: number(payload.visibility),
    entryType: clean(payload.entryType, 20) || "boat",
    currentStrength: clean(payload.currentStrength, 20) || "calm",
    buddies: clean(payload.buddies, 160),
    creatures: clean(payload.creatures, 300),
    note: clean(payload.note, 800),
    photoUrls: JSON.stringify(photoUrls),
  };
}
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "다이브 로그를 처리하지 못했습니다.",
    },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  try {
    const destinationId = clean(
      new URL(request.url).searchParams.get("destinationId"),
      80,
    );
    const rows = await getDb()
      .select()
      .from(diveLogs)
      .where(eq(diveLogs.destinationId, destinationId))
      .orderBy(
        asc(diveLogs.sortOrder),
        asc(diveLogs.date),
        asc(diveLogs.diveNumber),
      )
      .limit(200);
    return Response.json({
      logs: rows.map(output),
      isAdmin: await isSiteAdmin(),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    const destinationId = clean(payload.destinationId, 80);
    const [last] = await getDb()
      .select({ sortOrder: diveLogs.sortOrder })
      .from(diveLogs)
      .where(eq(diveLogs.destinationId, destinationId))
      .orderBy(desc(diveLogs.sortOrder))
      .limit(1);
    const [row] = await getDb()
      .insert(diveLogs)
      .values({
        id: crypto.randomUUID(),
        ...(await values(payload)),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      })
      .returning();
    return Response.json({ log: output(row) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    const id = clean(payload.id, 80);
    const destinationId = clean(payload.destinationId, 80);
    const [row] = await getDb()
      .update(diveLogs)
      .set({ ...(await values(payload)), updatedAt: new Date().toISOString() })
      .where(
        and(eq(diveLogs.id, id), eq(diveLogs.destinationId, destinationId)),
      )
      .returning();
    if (!row)
      return Response.json(
        { error: "로그를 찾지 못했습니다." },
        { status: 404 },
      );
    return Response.json({ log: output(row) });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    const destinationId = clean(payload.destinationId, 80);
    const ids = Array.isArray(payload.logIds)
      ? payload.logIds.map((id) => clean(id, 80))
      : [];
    const existing = await getDb()
      .select({ id: diveLogs.id })
      .from(diveLogs)
      .where(eq(diveLogs.destinationId, destinationId));
    if (
      ids.length !== existing.length ||
      new Set(ids).size !== ids.length ||
      existing.some((row) => !ids.includes(row.id))
    )
      return Response.json(
        { error: "로그 순서가 올바르지 않습니다." },
        { status: 400 },
      );
    await Promise.all(
      ids.map((id, sortOrder) =>
        getDb()
          .update(diveLogs)
          .set({ sortOrder })
          .where(
            and(eq(diveLogs.id, id), eq(diveLogs.destinationId, destinationId)),
          ),
      ),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    await getDb()
      .delete(diveLogs)
      .where(
        and(
          eq(diveLogs.id, clean(payload.id, 80)),
          eq(diveLogs.destinationId, clean(payload.destinationId, 80)),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
