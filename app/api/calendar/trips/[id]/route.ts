import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { calendarAccessRequests, calendarConnections, destinations, tripCalendars } from "../../../../../db/schema";
import { isSiteAdmin, requireSiteAdminResponse } from "../../../../admin-auth";
import { ensureTripCalendar, googleRequest, syncAllTripItems } from "../../../../../lib/google-calendar";

type Context = { params: Promise<{ id: string }> };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const [destination] = await getDb().select({ id: destinations.id, name: destinations.name }).from(destinations).where(eq(destinations.id, id)).limit(1);
  if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });
  const admin = await isSiteAdmin();
  const [connection] = await getDb().select().from(calendarConnections).where(eq(calendarConnections.id, "google")).limit(1);
  const [calendar] = await getDb().select().from(tripCalendars).where(eq(tripCalendars.destinationId, id)).limit(1);
  const requests = admin ? await getDb().select().from(calendarAccessRequests).where(eq(calendarAccessRequests.destinationId, id)).orderBy(desc(calendarAccessRequests.createdAt)) : [];
  return Response.json({
    isAdmin: admin,
    configured: admin ? Boolean(connection?.clientId) : undefined,
    connected: admin ? Boolean(connection?.refreshTokenCipher) : undefined,
    calendarReady: Boolean(calendar),
    calendarName: calendar?.googleCalendarName || "",
    requests,
  });
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const payload = await request.json() as { action?: string; email?: string; requestId?: string };
  const action = clean(payload.action, 40);
  const [destination] = await getDb().select({ id: destinations.id }).from(destinations).where(eq(destinations.id, id)).limit(1);
  if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });

  if (action === "request-access") {
    const email = clean(payload.email, 180).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Google 계정 이메일을 확인해 주세요." }, { status: 400 });
    const [existing] = await getDb().select().from(calendarAccessRequests).where(and(eq(calendarAccessRequests.destinationId, id), eq(calendarAccessRequests.email, email))).limit(1);
    if (existing?.status === "approved") return Response.json({ message: "이미 읽기 전용 권한이 승인된 계정입니다." });
    if (existing) {
      await getDb().update(calendarAccessRequests).set({ status: "pending", updatedAt: new Date().toISOString() }).where(eq(calendarAccessRequests.id, existing.id));
    } else {
      await getDb().insert(calendarAccessRequests).values({ id: crypto.randomUUID(), destinationId: id, email });
    }
    return Response.json({ message: "캘린더 추가 요청을 보냈습니다. 관리자 승인 후 Google Calendar에 표시됩니다." });
  }

  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;

  if (action === "create-calendar" || action === "sync") {
    const result = await syncAllTripItems(id);
    return Response.json({ message: `${result.synced}개 일정을 동기화했습니다.${result.skipped ? ` 날짜 미정 ${result.skipped}개는 제외했습니다.` : ""}` });
  }

  const requestId = clean(payload.requestId, 80);
  if (!requestId) return Response.json({ error: "처리할 요청을 선택해 주세요." }, { status: 400 });
  const [accessRequest] = await getDb().select().from(calendarAccessRequests).where(and(eq(calendarAccessRequests.id, requestId), eq(calendarAccessRequests.destinationId, id))).limit(1);
  if (!accessRequest) return Response.json({ error: "요청을 찾지 못했습니다." }, { status: 404 });

  if (action === "approve") {
    const calendar = await ensureTripCalendar(id);
    const rule = await googleRequest(`/calendars/${encodeURIComponent(calendar.googleCalendarId)}/acl?sendNotifications=true`, {
      method: "POST",
      body: JSON.stringify({ role: "reader", scope: { type: "user", value: accessRequest.email } }),
    }) as { id?: string };
    await getDb().update(calendarAccessRequests).set({ status: "approved", googleAclRuleId: rule.id || null, updatedAt: new Date().toISOString() }).where(eq(calendarAccessRequests.id, requestId));
    return Response.json({ message: `${accessRequest.email}에 읽기 전용 권한을 부여했습니다.` });
  }

  if (action === "reject") {
    await getDb().update(calendarAccessRequests).set({ status: "rejected", updatedAt: new Date().toISOString() }).where(eq(calendarAccessRequests.id, requestId));
    return Response.json({ message: "요청을 거절했습니다." });
  }
  return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
