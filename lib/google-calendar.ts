import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { calendarConnections, destinations, tripCalendars, tripItems } from "../db/schema";

type RuntimeEnv = { GOOGLE_TOKEN_ENCRYPTION_KEY?: string };

function runtimeEnv() {
  return (globalThis as typeof globalThis & { __ISHIGAKI_ENV__?: RuntimeEnv }).__ISHIGAKI_ENV__;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = runtimeEnv()?.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Google Calendar encryption key is not configured");
  return crypto.subtle.importKey("raw", base64ToBytes(encoded), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Stored Calendar credential is invalid");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(encrypted));
  return new TextDecoder().decode(plain);
}

async function connection() {
  const [row] = await getDb().select().from(calendarConnections).where(eq(calendarConnections.id, "google")).limit(1);
  if (!row?.refreshTokenCipher) throw new Error("Google Calendar account is not connected");
  return row;
}

async function accessToken() {
  const row = await connection();
  const expiresAt = row.accessTokenExpiresAt ? Date.parse(row.accessTokenExpiresAt) : 0;
  if (row.accessTokenCipher && expiresAt > Date.now() + 60_000) return decryptSecret(row.accessTokenCipher);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: row.clientId,
      client_secret: await decryptSecret(row.clientSecretCipher),
      refresh_token: await decryptSecret(row.refreshTokenCipher),
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Google access token refresh failed");
  await getDb().update(calendarConnections).set({
    accessTokenCipher: await encryptSecret(data.access_token),
    accessTokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(calendarConnections.id, "google"));
  return data.access_token;
}

function googleErrorMessage(status: number, body: string, data: Record<string, unknown> | null) {
  const googleError = data?.error as { message?: string; errors?: Array<{ reason?: string }> } | undefined;
  const reason = googleError?.errors?.[0]?.reason || "";
  if (status === 403 && (reason === "accessNotConfigured" || body.includes("has not been used in project") || body.includes("is disabled"))) {
    return "Google Cloud에서 Google Calendar API가 아직 활성화되지 않았습니다. API를 사용 설정한 뒤 1~2분 후 다시 시도해 주세요.";
  }
  if (status === 401) return "Google Calendar 연결이 만료되었습니다. 관리자 화면에서 Google 계정을 다시 연결해 주세요.";
  if (status === 403) return "Google Calendar 권한이 부족합니다. Google 계정을 다시 연결하고 캘린더 권한을 허용해 주세요.";
  if (status === 429) return "Google Calendar 요청이 잠시 많습니다. 잠시 후 다시 시도해 주세요.";
  return googleError?.message || (body.trim() ? `Google Calendar 오류: ${body.trim().slice(0, 180)}` : `Google Calendar가 빈 응답을 반환했습니다. (HTTP ${status})`);
}

export async function googleRequest(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const url = `https://www.googleapis.com/calendar/v3${path}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    if (response.status === 204) return null;

    const body = await response.text();
    let data: Record<string, unknown> | null = null;
    if (body.trim()) {
      try { data = JSON.parse(body) as Record<string, unknown>; } catch { data = null; }
    }

    const retryable = response.status === 429 || response.status >= 500 || (!body.trim() && !response.ok);
    if (retryable && attempt === 0) continue;
    if (!response.ok || !data) throw new Error(googleErrorMessage(response.status, body, data));
    return data;
  }
  throw new Error("Google Calendar 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function addOneDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function eventBody(item: typeof tripItems.$inferSelect) {
  const common = {
    summary: item.title,
    location: item.location || undefined,
    description: [item.note, "JADAMO OCEAN Trip에서 자동 동기화된 일정입니다."].filter(Boolean).join("\n\n"),
    extendedProperties: { private: { jadamoTripItemId: item.id, jadamoDestinationId: item.destinationId } },
  };
  if (item.time) {
    const start = new Date(`${item.date}T${item.time}:00+09:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { ...common, start: { dateTime: start.toISOString(), timeZone: "Asia/Seoul" }, end: { dateTime: end.toISOString(), timeZone: "Asia/Seoul" } };
  }
  return { ...common, start: { date: item.date }, end: { date: addOneDay(item.date) } };
}

export async function syncTripItem(item: typeof tripItems.$inferSelect) {
  const [calendar] = await getDb().select().from(tripCalendars).where(eq(tripCalendars.destinationId, item.destinationId)).limit(1);
  if (!calendar) return { synced: false, reason: "calendar-not-created" };
  if (!item.date) {
    if (item.googleEventId) {
      await googleRequest(`/calendars/${encodeURIComponent(calendar.googleCalendarId)}/events/${encodeURIComponent(item.googleEventId)}`, { method: "DELETE" });
      await getDb().update(tripItems).set({ googleEventId: null }).where(eq(tripItems.id, item.id));
    }
    return { synced: false, reason: "date-missing" };
  }

  const path = `/calendars/${encodeURIComponent(calendar.googleCalendarId)}/events${item.googleEventId ? `/${encodeURIComponent(item.googleEventId)}` : ""}`;
  const data = await googleRequest(path, { method: item.googleEventId ? "PUT" : "POST", body: JSON.stringify(eventBody(item)) }) as { id?: string };
  if (!item.googleEventId && data.id) {
    await getDb().update(tripItems).set({ googleEventId: data.id }).where(eq(tripItems.id, item.id));
  }
  return { synced: true };
}

export async function deleteTripItemEvent(item: typeof tripItems.$inferSelect) {
  if (!item.googleEventId) return;
  const [calendar] = await getDb().select().from(tripCalendars).where(eq(tripCalendars.destinationId, item.destinationId)).limit(1);
  if (!calendar) return;
  await googleRequest(`/calendars/${encodeURIComponent(calendar.googleCalendarId)}/events/${encodeURIComponent(item.googleEventId)}`, { method: "DELETE" });
}

export async function ensureTripCalendar(destinationId: string) {
  const [existing] = await getDb().select().from(tripCalendars).where(eq(tripCalendars.destinationId, destinationId)).limit(1);
  if (existing) return existing;
  const [destination] = await getDb().select().from(destinations).where(eq(destinations.id, destinationId)).limit(1);
  if (!destination) throw new Error("Trip not found");
  const name = `JADAMO · ${destination.year} ${destination.month} ${destination.name}`;
  const created = await googleRequest("/calendars", { method: "POST", body: JSON.stringify({ summary: name, timeZone: "Asia/Seoul" }) }) as { id?: string; summary?: string };
  if (!created.id) throw new Error("Google Calendar was not created");
  const [calendar] = await getDb().insert(tripCalendars).values({ destinationId, googleCalendarId: created.id, googleCalendarName: created.summary || name }).returning();
  return calendar;
}

export async function syncAllTripItems(destinationId: string) {
  await ensureTripCalendar(destinationId);
  const items = await getDb().select().from(tripItems).where(eq(tripItems.destinationId, destinationId));
  let synced = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const item of items) {
    try {
      const result = await syncTripItem(item);
      if (result.synced) synced += 1;
      else skipped += 1;
    } catch (error) {
      failures.push(`${item.title}: ${error instanceof Error ? error.message : "동기화 실패"}`);
    }
  }
  return { synced, skipped, failures };
}

export async function findTripItem(destinationId: string, itemId: string) {
  const [item] = await getDb().select().from(tripItems).where(and(eq(tripItems.destinationId, destinationId), eq(tripItems.id, itemId))).limit(1);
  return item;
}
