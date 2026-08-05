import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { calendarConnections } from "../../../../../db/schema";
import { isSiteAdmin } from "../../../../admin-auth";
import { decryptSecret, encryptSecret } from "../../../../../lib/google-calendar";

function resultRedirect(request: Request, status: "connected" | "error", message?: string, destinationId?: string) {
  const safeDestination = destinationId && /^[a-zA-Z0-9-]+$/.test(destinationId) ? destinationId : "";
  const url = new URL(safeDestination ? `/trips/${safeDestination}` : "/", request.url);
  url.searchParams.set("calendar", status);
  if (message) url.searchParams.set("message", message.slice(0, 120));
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  if (!(await isSiteAdmin())) return resultRedirect(request, "error", "관리자 계정으로 로그인해 주세요.");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const destinationId = state?.split(":")[1] || "";
  const [connection] = await getDb().select().from(calendarConnections).where(eq(calendarConnections.id, "google")).limit(1);
  if (!code || !state || !connection || state !== connection.oauthState) return resultRedirect(request, "error", "Google 연결 요청이 만료되었거나 올바르지 않습니다.", destinationId);

  const redirectUri = new URL("/api/calendar/google/callback", request.url).toString();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: connection.clientId,
      client_secret: await decryptSecret(connection.clientSecretCipher),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token || !data.refresh_token) return resultRedirect(request, "error", data.error_description || "Google 계정 연결에 실패했습니다.", destinationId);

  await getDb().update(calendarConnections).set({
    accessTokenCipher: await encryptSecret(data.access_token),
    refreshTokenCipher: await encryptSecret(data.refresh_token),
    accessTokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    oauthState: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(calendarConnections.id, "google"));
  return resultRedirect(request, "connected", undefined, destinationId);
}
