import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations } from "../../../db/schema";

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
  wind_speed_10m_max?: number[];
};

type OpenMeteoResponse = {
  timezone?: string;
  daily?: OpenMeteoDaily;
};

const CACHE_SECONDS = 60 * 60;

export async function GET(request: Request) {
  try {
    const destinationId = new URL(request.url).searchParams.get("destinationId")?.trim().slice(0, 80);
    if (!destinationId) return Response.json({ error: "여행지 정보가 필요합니다." }, { status: 400 });

    const [destination] = await getDb()
      .select({ id: destinations.id, latitude: destinations.latitude, longitude: destinations.longitude })
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(destination.latitude));
    weatherUrl.searchParams.set("longitude", String(destination.longitude));
    weatherUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max");
    weatherUrl.searchParams.set("timezone", "auto");
    weatherUrl.searchParams.set("forecast_days", "7");
    weatherUrl.searchParams.set("temperature_unit", "celsius");
    weatherUrl.searchParams.set("wind_speed_unit", "kmh");

    const response = await fetch(weatherUrl, { next: { revalidate: CACHE_SECONDS } });
    if (!response.ok) return Response.json({ error: "날씨 정보를 불러오지 못했습니다." }, { status: 502 });
    const payload = (await response.json()) as OpenMeteoResponse;
    const daily = payload.daily;
    const dates = daily?.time || [];
    const forecast = dates.map((date, index) => ({
      date,
      weatherCode: daily?.weather_code?.[index] ?? 0,
      temperatureMax: daily?.temperature_2m_max?.[index] ?? null,
      temperatureMin: daily?.temperature_2m_min?.[index] ?? null,
      precipitationProbability: daily?.precipitation_probability_max?.[index] ?? null,
      windSpeedMax: daily?.wind_speed_10m_max?.[index] ?? null,
    }));

    return Response.json(
      { forecast, timezone: payload.timezone || "auto", updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300` } },
    );
  } catch {
    return Response.json({ error: "날씨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
