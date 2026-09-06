import { requireSiteAdminResponse } from "../../../admin-auth";
import { isGoogleMapsUrl, resolveGoogleMapsLink, validCoordinates, type PlaceCandidate } from "../../../../lib/google-maps";

// ponytail: per-worker throttle for this admin-only lookup; use a shared limiter if multiple admins search concurrently across workers.
let nextSearch = 0;
const cache = new Map<string, { expires: number; candidates: PlaceCandidate[] }>();

export async function POST(request: Request) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;
  try {
    const payload = await request.json();
    const mapUrl = typeof payload.mapUrl === "string" ? payload.mapUrl.trim() : "";
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    if (mapUrl.length > 600 || query.length > 300 || (mapUrl && !isGoogleMapsUrl(mapUrl))) {
      return Response.json({ error: "Google Maps 공유 링크 또는 장소 주소를 확인해 주세요." }, { status: 400 });
    }
    const place = mapUrl ? await resolveGoogleMapsLink(mapUrl) : null;
    const address = query || place?.address || place?.name || "";
    if (place?.coordinates && !query) {
      return Response.json({ address: place.address, candidates: [{ ...place.coordinates, name: place.name || place.address || "링크의 위치", address: place.address }], source: "link" });
    }
    if (!address) return Response.json({ address, candidates: [] });
    const cached = cache.get(address);
    if (cached && cached.expires > Date.now()) return Response.json({ address, candidates: cached.candidates, source: "OpenStreetMap" });
    const delay = Math.max(0, nextSearch - Date.now());
    if (delay > 5000) return Response.json({ error: "잠시 후 다시 검색해 주세요." }, { status: 429 });
    nextSearch = Date.now() + delay + 1100;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(address)}`, {
      headers: { "User-Agent": "JadamoTrip/1.0 (https://jadamo-trip.eomkun12.chatgpt.site)", "Accept-Language": "ko,ja,en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("search unavailable");
    const rows = await response.json() as { name?: string; display_name: string; lat: string; lon: string }[];
    const candidates = rows.filter(row => row.lat?.trim() && row.lon?.trim()).map(row => ({ name: row.name || row.display_name, address: row.display_name, latitude: Number(row.lat), longitude: Number(row.lon) })).filter(row => validCoordinates(row.latitude, row.longitude));
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(address, { expires: Date.now() + 86400000, candidates });
    return Response.json({ address, candidates, source: "OpenStreetMap" });
  } catch {
    return Response.json({ error: "위치를 찾지 못했어요. 장소명이나 주소를 확인해 주세요. 일정은 그대로 저장할 수 있어요." }, { status: 502 });
  }
}
