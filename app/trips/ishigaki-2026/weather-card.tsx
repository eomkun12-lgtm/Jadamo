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

export default function WeatherCard({
  destinationId,
  destinationName,
  tripStart,
  tripEnd,
}: {
  destinationId: string;
  destinationName: string;
  tripStart: string;
  tripEnd: string;
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
      const data = (await response.json()) as WeatherResponse;
      if (!response.ok) throw new Error(data.error || "날씨 정보를 불러오지 못했습니다.");
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
  }, [destinationId, tripEnd, tripStart]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWeather(controller.signal);
    return () => controller.abort();
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
              <article className="weather-current-item weather-wide"><span>🌡️ 수온</span><strong>{decimal(current.waterTemperature, "°C")}</strong></article>
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
