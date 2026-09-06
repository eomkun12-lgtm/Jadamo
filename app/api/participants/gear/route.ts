import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { participantGear, travelers } from "../../../../db/schema";
import { isSiteAdmin } from "../../../admin-auth";
import { validateGear } from "../../../../lib/participant-gear";

const normalizeName = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase("ko-KR") : "";

export async function GET(request: Request) {
  const name = normalizeName(new URL(request.url).searchParams.get("name"));
  if (!name || name.length > 20) return Response.json({ error: "참석자를 확인해 주세요." }, { status: 400 });
  try {
    const [row] = await getDb().select().from(participantGear).where(eq(participantGear.name, name)).limit(1);
    return Response.json({ gear: row ? JSON.parse(row.gear) : {} });
  } catch {
    return Response.json({ error: "장비 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!(await isSiteAdmin())) return Response.json({ error: "관리자 로그인 후 수정할 수 있습니다." }, { status: 403 });
  let name: string;
  let gear: string;
  try {
    const payload = await request.json();
    name = normalizeName(payload.name);
    if (!name || name.length > 20) throw new Error("참석자를 확인해 주세요.");
    gear = JSON.stringify(validateGear(payload.gear));
  } catch {
    return Response.json({ error: "모델명(100자 이하)과 HTTPS 사진 주소를 확인해 주세요." }, { status: 400 });
  }
  try {
    const db = getDb();
    const people = await db.select({ name: travelers.name }).from(travelers).limit(1000);
    if (!people.some((person) => normalizeName(person.name) === name)) return Response.json({ error: "참석자를 찾을 수 없습니다." }, { status: 404 });
    await db.insert(participantGear).values({ name, gear }).onConflictDoUpdate({ target: participantGear.name, set: { gear } });
    return Response.json({ gear: JSON.parse(gear) });
  } catch {
    return Response.json({ error: "저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
