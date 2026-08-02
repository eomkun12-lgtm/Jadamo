import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, travelers, tripItems } from "../../../db/schema";
import { normalizeMonth } from "../../../lib/month";
import { isSiteAdmin, requireSiteAdminResponse } from "../../admin-auth";

type Payload = {
  id?: string;
  country?: string;
  name?: string;
  month?: string;
  year?: string;
  latitude?: unknown;
  longitude?: unknown;
};

type GeocodeResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: { country?: string; country_code?: string };
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function manualCoordinates(payload: Payload) {
  const latitude = typeof payload.latitude === "number" ? payload.latitude : Number(String(payload.latitude ?? "").trim());
  const longitude = typeof payload.longitude === "number" ? payload.longitude : Number(String(payload.longitude ?? "").trim());
  const latitudeProvided = String(payload.latitude ?? "").trim() !== "";
  const longitudeProvided = String(payload.longitude ?? "").trim() !== "";
  if (!latitudeProvided && !longitudeProvided) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error("INVALID_COORDINATES");
  return { latitude, longitude };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table"))
    return Response.json(
      { error: "목적지 저장 공간을 준비하는 중입니다." },
      { status: 503 },
    );
  return Response.json(
    { error: "목적지를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 500 },
  );
}

async function geocodeDestination(name: string, country: string) {
  const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodeUrl.searchParams.set("q", `${name}, ${country}`);
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("addressdetails", "1");
  geocodeUrl.searchParams.set("limit", "1");
  const geocodeResponse = await fetch(geocodeUrl, {
    headers: {
      "Accept-Language": "ko,en;q=0.8",
      Referer: "https://ishigaki-escape-2026.eomkun12.chatgpt.site/",
      "User-Agent": "JadamoOceanTrip/1.0",
    },
  });
  if (!geocodeResponse.ok) throw new Error("GEOCODE_UNAVAILABLE");
  const [match] = (await geocodeResponse.json()) as GeocodeResult[];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!match || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    return null;
  return {
    latitude,
    longitude,
    countryCode: clean(match.address?.country_code, 2).toLowerCase(),
    region: clean(match.display_name, 120) || `${name}, ${country}`,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const [rows, datedItems] = await Promise.all([
      db
        .select()
        .from(destinations)
        .orderBy(asc(destinations.createdAt))
        .limit(50),
      db
        .select({
          destinationId: tripItems.destinationId,
          date: tripItems.date,
        })
        .from(tripItems)
        .limit(1000),
    ]);
    const dateRanges = new Map<string, string[]>();
    datedItems.forEach((item) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return;
      dateRanges.set(item.destinationId, [
        ...(dateRanges.get(item.destinationId) || []),
        item.date,
      ]);
    });
    const enriched = rows.map((row) => {
      const dates = (dateRanges.get(row.id) || []).sort();
      return { ...row, startDate: dates[0] || "", endDate: dates.at(-1) || "" };
    });
    return Response.json({
      destinations: enriched,
      isAdmin: await isSiteAdmin(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    const country = clean(payload.country, 40);
    const name = clean(payload.name, 40);
    const month = normalizeMonth(payload.month);
    const year = clean(payload.year, 4) || "2026";
    const coordinates = manualCoordinates(payload);
    if (!country)
      return Response.json({ error: "나라를 입력해 주세요." }, { status: 400 });
    if (!name)
      return Response.json(
        { error: "목적지 이름을 입력해 주세요." },
        { status: 400 },
      );
    if (!month)
      return Response.json(
        { error: "월은 1부터 12까지 숫자로 입력해 주세요." },
        { status: 400 },
      );
    if (!/^\d{4}$/.test(year))
      return Response.json(
        { error: "연도는 네 자리 숫자로 입력해 주세요." },
        { status: 400 },
      );

    const geocode = await geocodeDestination(name, country);
    if (!geocode) {
      return Response.json(
        {
          error:
            "나라와 목적지를 찾지 못했습니다. 표기를 조금 더 구체적으로 입력해 주세요.",
        },
        { status: 400 },
      );
    }
    const [row] = await getDb()
      .insert(destinations)
      .values({
        id: crypto.randomUUID(),
        name,
        country,
        month,
        year,
        ...geocode,
        ...coordinates,
      })
      .returning();
    return Response.json({ destination: row }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_COORDINATES")
      return Response.json({ error: "위도는 -90~90, 경도는 -180~180 범위로 입력해 주세요." }, { status: 400 });
    if (error instanceof Error && error.message === "GEOCODE_UNAVAILABLE") {
      return Response.json(
        {
          error:
            "위치 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 502 },
      );
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    const id = clean(payload.id, 80);
    const country = clean(payload.country, 40);
    const name = clean(payload.name, 40);
    const month = normalizeMonth(payload.month);
    const year = clean(payload.year, 4);
    const coordinates = manualCoordinates(payload);
    if (!id || id === "ishigaki-2026")
      return Response.json(
        { error: "이 여행지는 이 화면에서 수정할 수 없습니다." },
        { status: 400 },
      );
    if (!country || !name)
      return Response.json(
        { error: "나라와 목적지 이름을 입력해 주세요." },
        { status: 400 },
      );
    if (!month)
      return Response.json(
        { error: "월은 1부터 12까지 숫자로 입력해 주세요." },
        { status: 400 },
      );
    if (!/^\d{4}$/.test(year))
      return Response.json(
        { error: "연도는 네 자리 숫자로 입력해 주세요." },
        { status: 400 },
      );

    const geocode = await geocodeDestination(name, country);
    if (!geocode)
      return Response.json(
        {
          error:
            "나라와 목적지를 찾지 못했습니다. 표기를 조금 더 구체적으로 입력해 주세요.",
        },
        { status: 400 },
      );

    const [row] = await getDb()
      .update(destinations)
      .set({ name, country, month, year, ...geocode, ...coordinates })
      .where(eq(destinations.id, id))
      .returning();
    if (!row)
      return Response.json(
        { error: "수정할 여행지를 찾지 못했습니다." },
        { status: 404 },
      );
    return Response.json({ destination: row });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_COORDINATES")
      return Response.json({ error: "위도는 -90~90, 경도는 -180~180 범위로 입력해 주세요." }, { status: 400 });
    if (error instanceof Error && error.message === "GEOCODE_UNAVAILABLE") {
      return Response.json(
        {
          error:
            "위치 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 502 },
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = (await request.json()) as Payload;
    const id = clean(payload.id, 80);
    if (!id || id === "ishigaki-2026")
      return Response.json(
        { error: "이시가키 기본 여행은 삭제할 수 없습니다." },
        { status: 400 },
      );
    await getDb().delete(travelers).where(eq(travelers.destinationId, id));
    const deleted = await getDb()
      .delete(destinations)
      .where(eq(destinations.id, id))
      .returning({ id: destinations.id });
    if (!deleted.length)
      return Response.json(
        { error: "삭제할 여행지를 찾지 못했습니다." },
        { status: 404 },
      );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
