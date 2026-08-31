import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { destinations, tripItems } from "../../../../db/schema";
import { googleMapsCoordinates, isGoogleMapsUrl } from "../../../../lib/google-maps";

type RouteContext = { params: Promise<{ id: string }> };

type ItemPayload = {
  itemId?: string;
  itemIds?: string[];
  category?: string;
  date?: string;
  time?: string;
  title?: string;
  location?: string;
  mapUrl?: string;
  note?: string;
};

const allowedCategories = new Set(["schedule", "flight", "stay", "activity", "food"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function resolveGoogleMapsUrl(value: string) {
  const direct = googleMapsCoordinates(value);
  if (direct) return direct;
  try {
    const response = await fetch(value, { redirect: "follow" });
    return googleMapsCoordinates(response.url);
  } catch {
    return null;
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "여행 상세 저장 공간을 준비하는 중입니다." }, { status: 503 });
  }
  return Response.json({ error: "여행 정보를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const [destination] = await getDb().select().from(destinations).where(eq(destinations.id, id)).limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });

    const items = await getDb()
      .select()
      .from(tripItems)
      .where(eq(tripItems.destinationId, id))
      .orderBy(asc(tripItems.sortOrder), asc(tripItems.date), asc(tripItems.time), asc(tripItems.createdAt));

    return Response.json({ destination, items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as ItemPayload;
    const category = clean(payload.category, 20);
    const title = clean(payload.title, 80);
    const date = clean(payload.date, 10);
    const time = clean(payload.time, 5);
    const location = clean(payload.location, 100);
    const mapUrl = clean(payload.mapUrl, 600);
    const note = clean(payload.note, 300);

    if (!allowedCategories.has(category)) {
      return Response.json({ error: "올바른 일정 종류를 선택해 주세요." }, { status: 400 });
    }
    if (!title) return Response.json({ error: "일정 제목을 입력해 주세요." }, { status: 400 });
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "날짜 형식을 확인해 주세요." }, { status: 400 });
    }
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return Response.json({ error: "시간 형식을 확인해 주세요." }, { status: 400 });
    }
    if (mapUrl && !isGoogleMapsUrl(mapUrl)) return Response.json({ error: "Google Maps 공유 링크를 입력해 주세요." }, { status: 400 });
    const coordinates = mapUrl ? await resolveGoogleMapsUrl(mapUrl) : null;
    if (mapUrl && !coordinates) return Response.json({ error: "Google Maps에서 ‘공유 → 링크 복사’한 주소를 입력해 주세요." }, { status: 400 });

    const [destination] = await getDb().select({ id: destinations.id }).from(destinations).where(eq(destinations.id, id)).limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });

    const [lastItem] = await getDb()
      .select({ sortOrder: tripItems.sortOrder })
      .from(tripItems)
      .where(eq(tripItems.destinationId, id))
      .orderBy(desc(tripItems.sortOrder))
      .limit(1);

    const [item] = await getDb().insert(tripItems).values({
      id: crypto.randomUUID(),
      destinationId: id,
      category,
      date,
      time,
      title,
      location,
      mapUrl,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      note,
      sortOrder: (lastItem?.sortOrder ?? -1) + 1,
    }).returning();

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as ItemPayload;

    if (Array.isArray(payload.itemIds)) {
      const itemIds = payload.itemIds.map((value) => clean(value, 80));
      if (!itemIds.length || itemIds.some((value) => !value) || new Set(itemIds).size !== itemIds.length) {
        return Response.json({ error: "일정 순서를 확인해 주세요." }, { status: 400 });
      }

      const existing = await getDb()
        .select({ id: tripItems.id })
        .from(tripItems)
        .where(eq(tripItems.destinationId, id));
      const existingIds = new Set(existing.map((item) => item.id));
      if (existing.length !== itemIds.length || itemIds.some((itemId) => !existingIds.has(itemId))) {
        return Response.json({ error: "일정 목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
      }

      for (const [sortOrder, itemId] of itemIds.entries()) {
        await getDb()
          .update(tripItems)
          .set({ sortOrder })
          .where(and(eq(tripItems.id, itemId), eq(tripItems.destinationId, id)));
      }
      return Response.json({ ok: true });
    }

    const itemId = clean(payload.itemId, 80);
    const category = clean(payload.category, 20);
    const title = clean(payload.title, 80);
    const date = clean(payload.date, 10);
    const time = clean(payload.time, 5);
    const location = clean(payload.location, 100);
    const mapUrl = clean(payload.mapUrl, 600);
    const note = clean(payload.note, 300);

    if (!itemId) return Response.json({ error: "수정할 일정을 선택해 주세요." }, { status: 400 });
    if (!allowedCategories.has(category)) {
      return Response.json({ error: "올바른 일정 종류를 선택해 주세요." }, { status: 400 });
    }
    if (!title) return Response.json({ error: "일정 제목을 입력해 주세요." }, { status: 400 });
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "날짜 형식을 확인해 주세요." }, { status: 400 });
    }
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return Response.json({ error: "시간 형식을 확인해 주세요." }, { status: 400 });
    }
    if (mapUrl && !isGoogleMapsUrl(mapUrl)) return Response.json({ error: "Google Maps 공유 링크를 입력해 주세요." }, { status: 400 });
    const coordinates = mapUrl ? await resolveGoogleMapsUrl(mapUrl) : null;
    if (mapUrl && !coordinates) return Response.json({ error: "Google Maps에서 ‘공유 → 링크 복사’한 주소를 입력해 주세요." }, { status: 400 });

    const [item] = await getDb()
      .update(tripItems)
      .set({ category, date, time, title, location, mapUrl, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null, note })
      .where(and(eq(tripItems.id, itemId), eq(tripItems.destinationId, id)))
      .returning();

    if (!item) return Response.json({ error: "수정할 일정을 찾지 못했습니다." }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as ItemPayload;
    const itemId = clean(payload.itemId, 80);
    if (!itemId) return Response.json({ error: "삭제할 일정을 선택해 주세요." }, { status: 400 });

    const deleted = await getDb()
      .delete(tripItems)
      .where(and(eq(tripItems.id, itemId), eq(tripItems.destinationId, id)))
      .returning({ id: tripItems.id });

    if (!deleted.length) return Response.json({ error: "일정을 찾지 못했습니다." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
