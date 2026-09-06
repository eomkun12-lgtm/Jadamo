const googleHosts = new Set(["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl"]);

export function validCoordinates(latitude: unknown, longitude: unknown) {
  return typeof latitude === "number" && typeof longitude === "number" &&
    Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && googleHosts.has(url.hostname) &&
      (url.hostname === "maps.app.goo.gl" || url.hostname === "maps.google.com" || /^\/maps(?:\/|$)/.test(url.pathname));
  } catch { return false; }
}

export function googleMapsCoordinates(value: string) {
  if (!isGoogleMapsUrl(value)) return null;
  const url = new URL(value);
  // Directions contain multiple endpoints; the viewport is not a place coordinate.
  if (url.pathname.includes("/dir") || url.searchParams.has("destination")) return null;
  const match = url.href.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/)
    || (url.searchParams.get("query") || url.searchParams.get("q"))?.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]), longitude = Number(match[2]);
  return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
}

export type PlaceCandidate = { name: string; address: string; latitude: number; longitude: number };

export async function expandGoogleMapsUrl(value: string, request: typeof fetch = fetch) {
  let url = value;
  const signal = AbortSignal.timeout(8000);
  for (let hop = 0; hop <= 5; hop++) {
    if (!isGoogleMapsUrl(url)) throw new Error("Google Maps 공유 링크를 입력해 주세요.");
    if (!['maps.app.goo.gl', 'goo.gl'].includes(new URL(url).hostname)) return url;
    const response = await request(url, { redirect: "manual", signal });
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new Error("링크를 열지 못했습니다.");
      url = new URL(next, url).href;
    } else {
      if (!response.ok) throw new Error("링크를 열지 못했습니다.");
      return url;
    }
  }
  throw new Error("링크의 이동 횟수가 너무 많습니다.");
}

export async function resolveGoogleMapsLink(value: string, request: typeof fetch = fetch) {
  const url = new URL(await expandGoogleMapsUrl(value, request));
  const coordinates = googleMapsCoordinates(url.href);
  const address = url.searchParams.get("q") || url.searchParams.get("query") || "";
  // ftid is retained in the original URL, not treated as an official Place ID.
  const name = decodeURIComponent(url.pathname.match(/\/place\/([^/]+)/)?.[1]?.replaceAll('+', ' ') || "");
  return { coordinates, address, name, url: url.href };
}

export function savedCoordinates(payload: { latitude?: unknown; longitude?: unknown }) {
  const { latitude, longitude } = payload;
  if (latitude == null && longitude == null) return null;
  if (!validCoordinates(latitude, longitude)) throw new Error("위치 좌표를 다시 확인해 주세요.");
  return { latitude: latitude as number, longitude: longitude as number };
}
