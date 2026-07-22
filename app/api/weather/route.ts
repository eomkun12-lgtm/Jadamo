import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { destinations } from "../../../db/schema";

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  wind_speed_10m_max?: number[];
};

type OpenMeteoCurrent = {
  time?: string;
  weather_code?: number;
  temperature_2m?: number;
  precipitation?: number;
  wind_speed_10m?: number;
  visibility?: number;
};

type OpenMeteoHourly = {
  time?: string[];
  visibility?: number[];
};

type OpenMeteoResponse = {
  timezone?: string;
  current?: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
  hourly?: OpenMeteoHourly;
};

type MarineHourly = {
  time?: string[];
  wave_height?: number[];
  sea_surface_temperature?: number[];
  sea_level_height_msl?: number[];
};

type MarineResponse = {
  hourly?: MarineHourly;
};

const CACHE_SECONDS = 60 * 60;
const FROZEN_CACHE_SECONDS = 60 * 60 * 24 * 365;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function seoulDate() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function clampHistoryStart(start: string, end: string) {
  const last = new Date(`${end}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 6);
  const sevenDayStart = last.toISOString().slice(0, 10);
  return start && start > sevenDayStart ? start : sevenDayStart;
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function nearestIndex(times: string[], target: string) {
  if (!times.length) return -1;
  const targetTime = new Date(target).getTime();
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const distance = Math.abs(new Date(time).getTime() - targetTime);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function dailyValues(times: string[], values: Array<number | null | undefined>, date: string) {
  return values.filter((value, index) => times[index]?.slice(0, 10) === date && typeof value === "number") as number[];
}

function nextTide(hourly: MarineHourly | undefined, target: string) {
  const times = hourly?.time || [];
  const levels = hourly?.sea_level_height_msl || [];
  const targetTime = new Date(target).getTime();
  for (let index = 1; index < levels.length - 1; index += 1) {
    if (new Date(times[index]).getTime() < targetTime) continue;
    const previous = levels[index - 1];
    const current = levels[index];
    const following = levels[index + 1];
    if (![previous, current, following].every((value) => typeof value === "number")) continue;
    if (current >= previous && current > following) return { type: "high" as const, time: times[index], height: current };
    if (current <= previous && current < following) return { type: "low" as const, time: times[index], height: current };
  }
  return null;
}

async function fetchMarine(latitude: number, longitude: number, frozen: boolean, start: string, end: string) {
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude", String(latitude));
  marineUrl.searchParams.set("longitude", String(longitude));
  marineUrl.searchParams.set("hourly", "wave_height,sea_surface_temperature,sea_level_height_msl");
  marineUrl.searchParams.set("timezone", "auto");
  if (frozen) {
    marineUrl.searchParams.set("start_date", start);
    marineUrl.searchParams.set("end_date", end);
  } else {
    marineUrl.searchParams.set("forecast_days", "7");
  }
  try {
    const response = await fetch(marineUrl);
    return response.ok ? ((await response.json()) as MarineResponse) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const destinationId = params.get("destinationId")?.trim().slice(0, 80);
    const tripStart = params.get("tripStart")?.trim() || "";
    const tripEnd = params.get("tripEnd")?.trim() || "";
    if (!destinationId) return Response.json({ error: "여행지 정보가 필요합니다." }, { status: 400 });
    if ((tripStart && !ISO_DATE.test(tripStart)) || (tripEnd && !ISO_DATE.test(tripEnd))) {
      return Response.json({ error: "여행 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const [destination] = await getDb()
      .select({ id: destinations.id, name: destinations.name, latitude: destinations.latitude, longitude: destinations.longitude })
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1);
    if (!destination) return Response.json({ error: "여행지를 찾지 못했습니다." }, { status: 404 });

    const normalizedName = destination.name.toLocaleLowerCase();
    const weatherCoordinates = normalizedName.includes("anilao") || normalizedName.includes("아닐라오")
      ? { latitude: 13.7567, longitude: 120.9264 }
      : { latitude: destination.latitude, longitude: destination.longitude };
    const frozen = Boolean(tripEnd && tripEnd < seoulDate());
    const historyEnd = frozen ? tripEnd : "";
    const historyStart = frozen ? clampHistoryStart(tripStart, tripEnd) : "";
    const weatherUrl = new URL(frozen ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(weatherCoordinates.latitude));
    weatherUrl.searchParams.set("longitude", String(weatherCoordinates.longitude));
    weatherUrl.searchParams.set("daily", frozen
      ? "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"
      : "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max");
    weatherUrl.searchParams.set("hourly", "visibility");
    weatherUrl.searchParams.set("timezone", "auto");
    weatherUrl.searchParams.set("temperature_unit", "celsius");
    weatherUrl.searchParams.set("wind_speed_unit", "ms");
    if (frozen) {
      weatherUrl.searchParams.set("start_date", historyStart);
      weatherUrl.searchParams.set("end_date", historyEnd);
    } else {
      weatherUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,precipitation,visibility");
      weatherUrl.searchParams.set("forecast_days", "7");
    }

    const revalidate = frozen ? FROZEN_CACHE_SECONDS : CACHE_SECONDS;
    const [weatherResponse, marine] = await Promise.all([
      fetch(weatherUrl),
      fetchMarine(weatherCoordinates.latitude, weatherCoordinates.longitude, frozen, historyStart, historyEnd),
    ]);
    if (!weatherResponse.ok) return Response.json({ error: "날씨 정보를 불러오지 못했습니다." }, { status: 502 });

    const payload = (await weatherResponse.json()) as OpenMeteoResponse;
    const daily = payload.daily;
    const dates = daily?.time || [];
    const weatherHourlyTimes = payload.hourly?.time || [];
    const weatherHourlyVisibility = payload.hourly?.visibility || [];
    const marineTimes = marine?.hourly?.time || [];
    const marineWaves = marine?.hourly?.wave_height || [];
    const marineTemperatures = marine?.hourly?.sea_surface_temperature || [];
    const forecast = dates.map((date, index) => ({
      date,
      weatherCode: daily?.weather_code?.[index] ?? 0,
      temperatureMax: daily?.temperature_2m_max?.[index] ?? null,
      temperatureMin: daily?.temperature_2m_min?.[index] ?? null,
      precipitationProbability: daily?.precipitation_probability_max?.[index] ?? null,
      precipitationSum: daily?.precipitation_sum?.[index] ?? null,
      windSpeedMax: daily?.wind_speed_10m_max?.[index] ?? null,
      visibilityKm: average(dailyValues(weatherHourlyTimes, weatherHourlyVisibility, date)) === null
        ? null
        : (average(dailyValues(weatherHourlyTimes, weatherHourlyVisibility, date)) as number) / 1000,
      waveHeightMax: dailyValues(marineTimes, marineWaves, date).length
        ? Math.max(...dailyValues(marineTimes, marineWaves, date))
        : null,
      waterTemperature: average(dailyValues(marineTimes, marineTemperatures, date)),
    }));

    const currentTarget = frozen
      ? `${historyEnd}T12:00:00`
      : payload.current?.time || new Date().toISOString();
    const marineIndex = nearestIndex(marineTimes, currentTarget);
    const finalDay = forecast.at(-1);
    const current = frozen
      ? {
          time: `${historyEnd}T23:59:59+09:00`,
          weatherCode: finalDay?.weatherCode ?? 0,
          temperature: average([finalDay?.temperatureMax, finalDay?.temperatureMin]),
          windSpeed: finalDay?.windSpeedMax ?? null,
          precipitation: finalDay?.precipitationSum ?? null,
          visibilityKm: finalDay?.visibilityKm ?? null,
          waveHeight: finalDay?.waveHeightMax ?? null,
          waterTemperature: finalDay?.waterTemperature ?? null,
          tide: nextTide(marine?.hourly, currentTarget),
        }
      : {
          time: payload.current?.time || new Date().toISOString(),
          weatherCode: payload.current?.weather_code ?? 0,
          temperature: payload.current?.temperature_2m ?? null,
          windSpeed: payload.current?.wind_speed_10m ?? null,
          precipitation: payload.current?.precipitation ?? null,
          visibilityKm: typeof payload.current?.visibility === "number" ? payload.current.visibility / 1000 : null,
          waveHeight: marineIndex >= 0 ? marineWaves[marineIndex] ?? null : null,
          waterTemperature: marineIndex >= 0 ? marineTemperatures[marineIndex] ?? null : null,
          tide: nextTide(marine?.hourly, currentTarget),
        };

    const updatedAt = frozen ? `${historyEnd}T23:59:59+09:00` : new Date().toISOString();
    return Response.json(
      { current, forecast, timezone: payload.timezone || "auto", updatedAt, frozen, frozenDate: frozen ? historyEnd : null },
      { headers: { "Cache-Control": `public, max-age=${revalidate}, s-maxage=${revalidate}${frozen ? ", immutable" : ", stale-while-revalidate=300"}` } },
    );
  } catch {
    return Response.json({ error: "날씨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
