import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { calendarConnections } from "../../../../db/schema";
import { isSiteAdmin, requireSiteAdminResponse } from "../../../admin-auth";
import { encryptSecret } from "../../../../lib/google-calendar";

const scope = "https://www.googleapis.com/auth/calendar";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const admin = await isSiteAdmin();
  if (!admin) return Response.json({ isAdmin: false });
  const [connection] = await getDb().select().from(calendarConnections).where(eq(calendarConnections.id, "google")).limit(1);
  return Response.json({ isAdmin: true, configured: Boolean(connection?.clientId), connected: Boolean(connection?.refreshTokenCipher), clientId: connection?.clientId || "" });
}

export async function POST(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  const payload = await request.json() as { action?: string; clientId?: string; clientSecret?: string; destinationId?: string };
  const action = clean(payload.action, 30);
  const [existing] = await getDb().select().from(calendarConnections).where(eq(calendarConnections.id, "google")).limit(1);

  if (action === "save") {
    const clientId = clean(payload.clientId, 300);
    const clientSecret = clean(payload.clientSecret, 300);
    if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret) {
      return Response.json({ error: "Google 클라이언트 ID와 보안 비밀을 확인해 주세요." }, { status: 400 });
    }
    await getDb().insert(calendarConnections).values({
      id: "google",
      clientId,
      clientSecretCipher: await encryptSecret(clientSecret),
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: calendarConnections.id,
      set: { clientId, clientSecretCipher: await encryptSecret(clientSecret), accessTokenCipher: null, refreshTokenCipher: null, accessTokenExpiresAt: null, oauthState: null, updatedAt: new Date().toISOString() },
    });
    return Response.json({ ok: true });
  }

  if (action === "connect") {
    if (!existing) return Response.json({ error: "먼저 Google 클라이언트 정보를 저장해 주세요." }, { status: 400 });
    const destinationId = clean(payload.destinationId, 80);
    const state = `${crypto.randomUUID()}:${destinationId}`;
    await getDb().update(calendarConnections).set({ oauthState: state, updatedAt: new Date().toISOString() }).where(eq(calendarConnections.id, "google"));
    const redirectUri = new URL("/api/calendar/google/callback", request.url).toString();
    const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.search = new URLSearchParams({
      client_id: existing.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    return Response.json({ authorizeUrl: authorize.toString() });
  }

  if (action === "disconnect") {
    if (!existing) return Response.json({ ok: true });
    await getDb().update(calendarConnections).set({ accessTokenCipher: null, refreshTokenCipher: null, accessTokenExpiresAt: null, oauthState: null, updatedAt: new Date().toISOString() }).where(eq(calendarConnections.id, "google"));
    return Response.json({ ok: true });
  }

  return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
