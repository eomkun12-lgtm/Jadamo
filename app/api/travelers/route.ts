import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations, travelers } from "../../../db/schema";
import { isSiteAdmin, requireSiteAdminResponse } from "../../admin-auth";

type Payload = {
  id?: string;
  resetPinForId?: string;
  travelerIds?: string[];
  destinationId?: string;
  name?: string;
  gender?: string;
  flightStatus?: string;
  flightNote?: string;
  hotelStatus?: string;
  hotelNote?: string;
  diveDays?: string[];
  certification?: string;
  gearRental?: string;
  note?: string;
  pin?: string;
};

const allowedFlight = new Set(["confirmed", "pending", "separate"]);
const allowedHotel = new Set(["vessel", "shared", "other", "pending"]);
const allowedGear = new Set(["none", "some", "full"]);
const allowedGender = new Set(["male", "female", "unspecified"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalize(payload: Payload) {
  const name = clean(payload.name, 20);
  const gender = allowedGender.has(payload.gender || "") ? payload.gender! : "unspecified";
  const flightStatus = allowedFlight.has(payload.flightStatus || "") ? payload.flightStatus! : "pending";
  const hotelStatus = allowedHotel.has(payload.hotelStatus || "") ? payload.hotelStatus! : "pending";
  const gearRental = allowedGear.has(payload.gearRental || "") ? payload.gearRental! : "none";
  const diveDays = Array.isArray(payload.diveDays)
    ? [...new Set(payload.diveDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) || /^\d{1,2}\/\d{1,2}$/.test(day)))].slice(0, 20)
    : [];
  return {
    name,
    gender,
    flightStatus,
    flightNote: clean(payload.flightNote, 80),
    hotelStatus,
    hotelNote: clean(payload.hotelNote, 60),
    diveDays: JSON.stringify(diveDays),
    certification: clean(payload.certification, 30) || "미정",
    gearRental,
    note: clean(payload.note, 160),
  };
}

async function hashPin(pin: string) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicTraveler(row: typeof travelers.$inferSelect) {
  let diveDays: string[] = [];
  try { diveDays = JSON.parse(row.diveDays) as string[]; } catch { diveDays = []; }
  return {
    id: row.id,
    destinationId: row.destinationId,
    name: row.name,
    gender: row.gender,
    flightStatus: row.flightStatus,
    flightNote: row.flightNote,
    hotelStatus: row.hotelStatus,
    hotelNote: row.hotelNote,
    diveDays,
    certification: row.certification,
    gearRental: row.gearRental,
    note: row.note,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json({ error: "공동 저장 공간을 준비하는 중입니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
  return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const destinationId = clean(new URL(request.url).searchParams.get("destinationId"), 80) || "ishigaki-2026";
    const db = getDb();
    const rows = await db.select().from(travelers).where(eq(travelers.destinationId, destinationId)).orderBy(asc(travelers.sortOrder), asc(travelers.createdAt)).limit(100);
    const previousTravelers = await db
      .select({
        id: travelers.id,
        name: travelers.name,
        certification: travelers.certification,
        destinationName: destinations.name,
      })
      .from(travelers)
      .innerJoin(destinations, eq(travelers.destinationId, destinations.id))
      .where(ne(travelers.destinationId, destinationId))
      .orderBy(desc(travelers.createdAt))
      .limit(200);
    // The query is newest-first, so keeping the first occurrence gives each
    // traveler a single, most recently saved set of reusable details.
    const seenTravelerNames = new Set<string>();
    const latestPreviousTravelers = previousTravelers.filter((traveler) => {
      const normalizedName = traveler.name.trim().toLocaleLowerCase();
      if (seenTravelerNames.has(normalizedName)) return false;
      seenTravelerNames.add(normalizedName);
      return true;
    });
    return Response.json({
      travelers: rows.map(publicTraveler),
      previousTravelers: latestPreviousTravelers,
      isAdmin: await isSiteAdmin(),
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const values = normalize(payload);
    const destinationId = clean(payload.destinationId, 80) || "ishigaki-2026";
    const pin = clean(payload.pin, 4);
    if (!values.name) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    if (values.gender === "unspecified") return Response.json({ error: "성별을 선택해 주세요." }, { status: 400 });
    if (!/^\d{4}$/.test(pin)) return Response.json({ error: "수정용 PIN은 숫자 4자리여야 합니다." }, { status: 400 });
    const db = getDb();
    const [destination] = await db.select({ id: destinations.id }).from(destinations).where(eq(destinations.id, destinationId)).limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });
    const [lastTraveler] = await db.select({ sortOrder: travelers.sortOrder }).from(travelers).where(eq(travelers.destinationId, destinationId)).orderBy(desc(travelers.sortOrder)).limit(1);
    const [row] = await db.insert(travelers).values({ id: crypto.randomUUID(), destinationId, ...values, sortOrder: (lastTraveler?.sortOrder ?? -1) + 1, editPinHash: await hashPin(pin) }).returning();
    return Response.json({ traveler: publicTraveler(row) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const id = clean(payload.id, 64);
    const destinationId = clean(payload.destinationId, 80) || "ishigaki-2026";
    const pin = clean(payload.pin, 4);
    const admin = await isSiteAdmin();
    if (!id) return Response.json({ error: "참가자 정보를 확인해 주세요." }, { status: 400 });
    if (!admin && !/^\d{4}$/.test(pin)) return Response.json({ error: "수정용 PIN을 확인해 주세요." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(travelers).where(and(eq(travelers.id, id), eq(travelers.destinationId, destinationId))).limit(1);
    if (!existing) return Response.json({ error: "참가자를 찾지 못했습니다." }, { status: 404 });
    if (!admin && existing.editPinHash !== await hashPin(pin)) return Response.json({ error: "PIN이 맞지 않습니다." }, { status: 403 });
    const values = normalize(payload);
    if (!values.name) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    if (values.gender === "unspecified") return Response.json({ error: "성별을 선택해 주세요." }, { status: 400 });
    const [row] = await db.update(travelers).set({ ...values, updatedAt: new Date().toISOString() }).where(and(eq(travelers.id, id), eq(travelers.destinationId, destinationId))).returning();
    return Response.json({ traveler: publicTraveler(row) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const destinationId = clean(payload.destinationId, 80) || "ishigaki-2026";
    const resetPinForId = clean(payload.resetPinForId, 64);
    if (resetPinForId) {
      const forbidden = await requireSiteAdminResponse();
      if (forbidden) return forbidden;
      const pin = clean(payload.pin, 4);
      if (!/^\d{4}$/.test(pin)) {
        return Response.json(
          { error: "새 PIN은 숫자 4자리여야 합니다." },
          { status: 400 },
        );
      }
      const [row] = await getDb()
        .update(travelers)
        .set({ editPinHash: await hashPin(pin), updatedAt: new Date().toISOString() })
        .where(and(eq(travelers.id, resetPinForId), eq(travelers.destinationId, destinationId)))
        .returning({ id: travelers.id });
      if (!row) {
        return Response.json(
          { error: "참가자를 찾지 못했습니다." },
          { status: 404 },
        );
      }
      return Response.json({ ok: true });
    }
    if (!Array.isArray(payload.travelerIds)) return Response.json({ error: "참가자 순서를 확인해 주세요." }, { status: 400 });
    const travelerIds = payload.travelerIds.map((value) => clean(value, 64));
    if (!travelerIds.length || travelerIds.some((value) => !value) || new Set(travelerIds).size !== travelerIds.length) {
      return Response.json({ error: "참가자 순서를 확인해 주세요." }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.select({ id: travelers.id }).from(travelers).where(eq(travelers.destinationId, destinationId));
    const existingIds = new Set(existing.map((item) => item.id));
    if (existing.length !== travelerIds.length || travelerIds.some((id) => !existingIds.has(id))) {
      return Response.json({ error: "참가자 목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    }

    for (const [sortOrder, id] of travelerIds.entries()) {
      await db.update(travelers).set({ sortOrder }).where(and(eq(travelers.id, id), eq(travelers.destinationId, destinationId)));
    }
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const id = clean(payload.id, 64);
    const destinationId = clean(payload.destinationId, 80) || "ishigaki-2026";
    const pin = clean(payload.pin, 4);
    const admin = await isSiteAdmin();
    if (!id) return Response.json({ error: "참가자 정보를 확인해 주세요." }, { status: 400 });
    if (!admin && !/^\d{4}$/.test(pin)) return Response.json({ error: "수정용 PIN을 확인해 주세요." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(travelers).where(and(eq(travelers.id, id), eq(travelers.destinationId, destinationId))).limit(1);
    if (!existing) return Response.json({ error: "참가자를 찾지 못했습니다." }, { status: 404 });
    if (!admin && existing.editPinHash !== await hashPin(pin)) return Response.json({ error: "PIN이 맞지 않습니다." }, { status: 403 });
    await db.delete(travelers).where(and(eq(travelers.id, id), eq(travelers.destinationId, destinationId)));
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
