"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ForecastDay = {
  date: string;
  weatherCode: number;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationProbability: number | null;
  precipitationSum: number | null;
  windSpeedMax: number | null;
  visibilityKm: number | null;
  waveHeightMax: number | null;
  waterTemperature: number | null;
};

type CurrentWeather = {
  time: string;
  weatherCode: number;
  temperature: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  visibilityKm: number | null;
  waveHeight: number | null;
  waterTemperature: number | null;
  tide: { type: "high" | "low"; time: string; height: number } | null;
};

type WeatherResponse = {
  current?: CurrentWeather;
  forecast?: ForecastDay[];
  updatedAt?: string;
  frozen?: boolean;
  frozenDate?: string | null;
  error?: string;
};

type DirectWeatherPayload = {
  timezone?: string;
  current?: {
    time?: string;
    weather_code?: number;
    temperature_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    visibility?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
  hourly?: { time?: string[]; visibility?: number[] };
};

type DirectMarinePayload = {
  hourly?: {
    time?: string[];
    wave_height?: number[];
    sea_surface_temperature?: number[];
    sea_level_height_msl?: number[];
  };
};

function weatherMeta(code: number) {
  if (code === 0) return { icon: "☀️", label: "맑음" };
  if (code <= 2) return { icon: "🌤️", label: "구름 조금" };
  if (code === 3) return { icon: "☁️", label: "흐림" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "안개" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "이슬비" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "비" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", label: "눈" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "소나기" };
  if (code >= 85 && code <= 86) return { icon: "🌨️", label: "눈 소나기" };
  if (code >= 95) return { icon: "⛈️", label: "뇌우" };
  return { icon: "🌤️", label: "날씨" };
}

function decimal(value: number | null | undefined, suffix: string, digits = 1) {
  return typeof value === "number" ? `${value.toFixed(digits)}${suffix}` : "—";
}

function shortDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(`${value}T00:00:00`)).replace(/\. /g, "-").replace(".", "");
}

function updateLabel(value: string, frozen: boolean) {
  if (!value) return "날씨 정보를 확인하고 있습니다.";
  if (frozen) return `${shortDate(value.slice(0, 10))} 여행 종료일 기록`;
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function divingCondition(current: CurrentWeather | null) {
  if (!current) return { label: "확인 중", tone: "normal" };
  const wave = current.waveHeight ?? 0;
  const wind = current.windSpeed ?? 0;
  if (wave <= 0.5 && wind <= 5) return { label: "훌륭", tone: "great" };
  if (wave <= 1 && wind <= 8) return { label: "좋음", tone: "good" };
  return { label: "주의", tone: "caution" };
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function valuesForDate(times: string[], values: Array<number | null | undefined>, date: string) {
  return values.filter((value, index) => times[index]?.slice(0, 10) === date && typeof value === "number") as number[];
}

function nearestIndex(times: string[], target: string) {
  if (!times.length) return -1;
  const targetTime = new Date(target).getTime();
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const nextDistance = Math.abs(new Date(time).getTime() - targetTime);
    if (nextDistance < distance) {
      best = index;
      distance = nextDistance;
    }
  });
  return best;
}

function nearestAvailableIndex(
  times: string[],
  values: Array<number | null | undefined>,
  target: string,
) {
  const targetTime = new Date(target).getTime();
  let best = -1;
  let distance = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const value = values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const nextDistance = Math.abs(new Date(time).getTime() - targetTime);
    if (nextDistance < distance) {
      best = index;
      distance = nextDistance;
    }
  });
  return best;
}

function findNextTide(hourly: DirectMarinePayload["hourly"], target: string) {
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

function historyStart(start: string, end: string) {
  const date = new Date(`${end}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  const sevenDayStart = date.toISOString().slice(0, 10);
  return start && start > sevenDayStart ? start : sevenDayStart;
}

async function loadWeatherDirect({
  destinationName,
  latitude,
  longitude,
  tripStart,
  tripEnd,
}: {
  destinationName: string;
  latitude: number;
  longitude: number;
  tripStart: string;
  tripEnd: string;
}): Promise<WeatherResponse> {
  const name = destinationName.toLocaleLowerCase();
  const coordinates = name.includes("anilao") || name.includes("아닐라오")
    ? { latitude: 13.7567, longitude: 120.9264 }
    : { latitude, longitude };
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const frozen = Boolean(tripEnd && tripEnd < today);
  const start = frozen ? historyStart(tripStart, tripEnd) : "";
  const end = frozen ? tripEnd : "";
  const weatherUrl = new URL(frozen ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(coordinates.latitude));
  weatherUrl.searchParams.set("longitude", String(coordinates.longitude));
  weatherUrl.searchParams.set("daily", frozen
    ? "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"
    : "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max");
  weatherUrl.searchParams.set("hourly", "visibility");
  weatherUrl.searchParams.set("timezone", "auto");
  weatherUrl.searchParams.set("temperature_unit", "celsius");
  weatherUrl.searchParams.set("wind_speed_unit", "ms");
  if (frozen) {
    weatherUrl.searchParams.set("start_date", start);
    weatherUrl.searchParams.set("end_date", end);
  } else {
    weatherUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,precipitation,visibility");
    weatherUrl.searchParams.set("forecast_days", "7");
  }

  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude", String(coordinates.latitude));
  marineUrl.searchParams.set("longitude", String(coordinates.longitude));
  marineUrl.searchParams.set("hourly", "wave_height,sea_surface_temperature,sea_level_height_msl");
  marineUrl.searchParams.set("timezone", "auto");
  if (frozen) {
    marineUrl.searchParams.set("start_date", start);
    marineUrl.searchParams.set("end_date", end);
  } else {
    marineUrl.searchParams.set("forecast_days", "7");
  }

  const [weatherResponse, marineResponse] = await Promise.all([
    fetch(weatherUrl, { cache: frozen ? "force-cache" : "no-store" }),
    fetch(marineUrl, { cache: frozen ? "force-cache" : "no-store" }).catch(() => null),
  ]);
  if (!weatherResponse.ok) throw new Error("날씨 정보를 불러오지 못했습니다.");
  const weather = (await weatherResponse.json()) as DirectWeatherPayload;
  const marine = marineResponse?.ok ? ((await marineResponse.json()) as DirectMarinePayload) : null;
  const dates = weather.daily?.time || [];
  const weatherTimes = weather.hourly?.time || [];
  const visibilityValues = weather.hourly?.visibility || [];
  const marineTimes = marine?.hourly?.time || [];
  const waves = marine?.hourly?.wave_height || [];
  const waterTemperatures = marine?.hourly?.sea_surface_temperature || [];
  const forecast = dates.map((date, index) => {
    const visibility = average(valuesForDate(weatherTimes, visibilityValues, date));
    const dayWaves = valuesForDate(marineTimes, waves, date);
    return {
      date,
      weatherCode: weather.daily?.weather_code?.[index] ?? 0,
      temperatureMax: weather.daily?.temperature_2m_max?.[index] ?? null,
      temperatureMin: weather.daily?.temperature_2m_min?.[index] ?? null,
      precipitationProbability: weather.daily?.precipitation_probability_max?.[index] ?? null,
      precipitationSum: weather.daily?.precipitation_sum?.[index] ?? null,
      windSpeedMax: weather.daily?.wind_speed_10m_max?.[index] ?? null,
      visibilityKm: visibility === null ? null : visibility / 1000,
      waveHeightMax: dayWaves.length ? Math.max(...dayWaves) : null,
      waterTemperature: average(valuesForDate(marineTimes, waterTemperatures, date)),
    };
  });
  const target = frozen ? `${tripEnd}T12:00:00` : weather.current?.time || new Date().toISOString();
  const marineIndex = nearestIndex(marineTimes, target);
  const waterTemperatureIndex = nearestAvailableIndex(marineTimes, waterTemperatures, target);
  const finalDay = forecast.at(-1);
  const current: CurrentWeather = frozen
    ? {
        time: `${tripEnd}T23:59:59+09:00`,
        weatherCode: finalDay?.weatherCode ?? 0,
        temperature: average([finalDay?.temperatureMax, finalDay?.temperatureMin]),
        windSpeed: finalDay?.windSpeedMax ?? null,
        precipitation: finalDay?.precipitationSum ?? null,
        visibilityKm: finalDay?.visibilityKm ?? null,
        waveHeight: finalDay?.waveHeightMax ?? null,
        waterTemperature: finalDay?.waterTemperature ?? null,
        tide: findNextTide(marine?.hourly, target),
      }
    : {
        time: weather.current?.time || new Date().toISOString(),
        weatherCode: weather.current?.weather_code ?? 0,
        temperature: weather.current?.temperature_2m ?? null,
        windSpeed: weather.current?.wind_speed_10m ?? null,
        precipitation: weather.current?.precipitation ?? null,
        visibilityKm: typeof weather.current?.visibility === "number" ? weather.current.visibility / 1000 : null,
        waveHeight: marineIndex >= 0 ? waves[marineIndex] ?? null : null,
        waterTemperature: waterTemperatureIndex >= 0 ? waterTemperatures[waterTemperatureIndex] ?? null : null,
        tide: findNextTide(marine?.hourly, target),
      };
  return { current, forecast, frozen, frozenDate: frozen ? tripEnd : null, updatedAt: frozen ? `${tripEnd}T23:59:59+09:00` : new Date().toISOString() };
}

export default function WeatherCard({
  destinationId,
  destinationName,
  tripStart,
  tripEnd,
  latitude,
  longitude,
}: {
  destinationId: string;
  destinationName: string;
  tripStart: string;
  tripEnd: string;
  latitude: number;
  longitude: number;
}) {
  const [activeView, setActiveView] = useState<"current" | "forecast">("current");
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [frozen, setFrozen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadWeather = useCallback(async (signal?: AbortSignal, manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");
    const params = new URLSearchParams({ destinationId, tripStart, tripEnd });
    try {
      const response = await fetch(`/api/weather?${params.toString()}`, { signal });
      const serverData = (await response.json()) as WeatherResponse;
      const needsDirectData = !response.ok
        || !serverData.current
        || (serverData.current.waveHeight === null && !(serverData.forecast || []).some((day) => day.waveHeightMax !== null))
        || (serverData.current.waterTemperature === null && !(serverData.forecast || []).some((day) => day.waterTemperature !== null));
      const data = needsDirectData
        ? await loadWeatherDirect({ destinationName, latitude, longitude, tripStart, tripEnd })
        : serverData;
      setCurrent(data.current || null);
      setForecast(data.forecast || []);
      setUpdatedAt(data.updatedAt || "");
      setFrozen(Boolean(data.frozen));
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "날씨 정보를 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [destinationId, destinationName, latitude, longitude, tripEnd, tripStart]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => void loadWeather(controller.signal), 0);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
    };
  }, [loadWeather]);

  useEffect(() => {
    if (frozen || loading || error) return;
    const interval = window.setInterval(() => void loadWeather(undefined, true), 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [error, frozen, loadWeather, loading]);

  const meta = weatherMeta(current?.weatherCode ?? 0);
  const condition = useMemo(() => divingCondition(current), [current]);
  const tideLabel = current?.tide
    ? `다음 ${current.tide.type === "high" ? "만조" : "간조"} ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(current.tide.time))}`
    : "조석 정보 없음";

  return (
    <section className="weather-panel section-shell" aria-labelledby="weather-title">
      <div className="weather-heading">
        <div><p className="eyebrow dark">OCEAN WEATHER</p><h2 id="weather-title">{destinationName} 날씨 정보</h2></div>
        <p>{frozen ? "완료된 여행은 종료일 기록으로 고정됩니다." : "현재 조건과 앞으로 7일의 바다 날씨를 확인하세요."}</p>
      </div>

      <div className="weather-card-shell">
        <div className="weather-toolbar">
          <div className="weather-tabs" role="tablist" aria-label="날씨 보기">
            <button type="button" role="tab" aria-selected={activeView === "current"} className={activeView === "current" ? "is-active" : ""} onClick={() => setActiveView("current")}>{frozen ? "여행 마지막 날" : "현재"}</button>
            <button type="button" role="tab" aria-selected={activeView === "forecast"} className={activeView === "forecast" ? "is-active" : ""} onClick={() => setActiveView("forecast")}>{frozen ? "여행 기록" : "7일 예보"}</button>
          </div>
          <div className="weather-updated">
            <span>{updateLabel(updatedAt, frozen)}</span>
            {!frozen && <button type="button" onClick={() => void loadWeather(undefined, true)} disabled={refreshing} aria-label="날씨 새로고침">{refreshing ? "…" : "↻"}</button>}
          </div>
        </div>

        {loading ? <div className="weather-state"><span className="weather-loader" />날씨 정보를 불러오는 중…</div>
          : error ? <div className="weather-state is-error">{error}</div>
          : activeView === "current" && current ? (
            <div className="weather-current" role="tabpanel">
              <article className="weather-current-item weather-condition">
                <span>☂️ 다이빙지수</span>
                <strong className={`is-${condition.tone}`}>{condition.label}</strong>
                <small>{meta.icon} {meta.label}</small>
              </article>
              <article className="weather-current-item"><span>💨 바람</span><strong>{decimal(current.windSpeed, "m/s")}</strong></article>
              <article className="weather-current-item"><span>🌡️ 기온</span><strong>{decimal(current.temperature, "°C")}</strong></article>
              <article className="weather-current-item"><span>🌊 파고</span><strong>{decimal(current.waveHeight, "m")}</strong></article>
              <article className="weather-current-item weather-wide"><span>🌙 조석</span><strong>{tideLabel}</strong>{current.tide && <small>{decimal(current.tide.height, "m", 2)}</small>}</article>
              <article className="weather-current-item"><span>💧 강수</span><strong>{decimal(current.precipitation, "mm")}</strong></article>
              <article className="weather-current-item"><span>👁️ 시야</span><strong>{decimal(current.visibilityKm, "km")}</strong></article>
              <article className="weather-current-item weather-wide"><span>🌊 해수면 수온</span><strong>{decimal(current.waterTemperature, "°C")}</strong></article>
            </div>
          ) : forecast.length ? (
            <div className="weather-forecast-wrap" role="tabpanel">
              <table className="weather-forecast-table">
                <thead><tr><th>날짜</th><th>요일</th><th>날씨</th><th>시야</th><th>파고</th><th>수온</th><th>강수</th></tr></thead>
                <tbody>{forecast.map((day) => {
                  const dayMeta = weatherMeta(day.weatherCode);
                  const date = new Date(`${day.date}T00:00:00`);
                  return <tr key={day.date}>
                    <td>{shortDate(day.date)}</td>
                    <td>{new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date)}</td>
                    <td><span className="weather-table-condition">{dayMeta.icon}<b>{dayMeta.label}</b></span></td>
                    <td>{decimal(day.visibilityKm, "km")}</td>
                    <td>{decimal(day.waveHeightMax, "m")}</td>
                    <td>{decimal(day.waterTemperature, "°")}</td>
                    <td>{day.precipitationProbability !== null ? decimal(day.precipitationProbability, "%", 0) : decimal(day.precipitationSum, "mm")}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <div className="weather-state">표시할 날씨 정보가 없습니다.</div>}
      </div>
      <p className="weather-credit">Weather & marine data by Open-Meteo · {frozen ? "여행 종료일 기준 고정" : "1시간 간격 자동 갱신"}</p>
    </section>
  );
}
