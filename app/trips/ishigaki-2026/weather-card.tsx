"use client";

import { useEffect, useState } from "react";

type ForecastDay = {
  date: string;
  weatherCode: number;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationProbability: number | null;
  windSpeedMax: number | null;
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

function number(value: number | null, suffix: string) {
  return value === null ? "—" : `${Math.round(value)}${suffix}`;
}

export default function WeatherCard({ destinationId, destinationName, tripStart }: { destinationId: string; destinationName: string; tripStart: string }) {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/weather?destinationId=${encodeURIComponent(destinationId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { forecast?: ForecastDay[]; updatedAt?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "날씨 정보를 불러오지 못했습니다.");
        setForecast(data.forecast || []);
        setUpdatedAt(data.updatedAt || "");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "날씨 정보를 불러오지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [destinationId]);

  const firstDate = forecast[0]?.date || "";
  const lastDate = forecast.at(-1)?.date || "";
  const isOutsideForecast = Boolean(tripStart && firstDate && lastDate && (tripStart < firstDate || tripStart > lastDate));

  return (
    <section className="weather-panel section-shell" aria-labelledby="weather-title">
      <div className="weather-heading">
        <div><p className="eyebrow dark">7-DAY WEATHER</p><h2 id="weather-title">{destinationName}의 바다 날씨</h2></div>
        <p>{updatedAt ? `최신 예보 · ${new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(updatedAt))}` : "최신 예보를 확인하고 있습니다."}<br />1시간 간격으로 자동 갱신됩니다.</p>
      </div>

      {loading ? <div className="weather-state"><span className="weather-loader" />최신 7일 예보를 불러오는 중…</div>
        : error ? <div className="weather-state is-error">{error}</div>
        : isOutsideForecast ? <div className="weather-state is-future"><span>◷</span><div><strong>여행 날짜의 예보는 아직 제공되지 않습니다.</strong><p>여행일이 가까워지면 이곳에 최신 7일 예보가 자동으로 표시됩니다.</p></div></div>
        : forecast.length === 0 ? <div className="weather-state">표시할 예보가 없습니다.</div>
        : <div className="weather-days">
          {forecast.map((day) => {
            const meta = weatherMeta(day.weatherCode);
            const date = new Date(`${day.date}T00:00:00`);
            return <article className="weather-day" key={day.date}>
              <div className="weather-date"><strong>{new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date)}</strong><span>{new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date)}</span></div>
              <div className="weather-icon" role="img" aria-label={meta.label}>{meta.icon}<small>{meta.label}</small></div>
              <div className="weather-temperature"><strong>{number(day.temperatureMax, "°")}</strong><span>{number(day.temperatureMin, "°")}</span></div>
              <dl><div><dt>강수</dt><dd>{number(day.precipitationProbability, "%")}</dd></div><div><dt>풍속</dt><dd>{number(day.windSpeedMax, " km/h")}</dd></div></dl>
            </article>;
          })}
        </div>}
      <p className="weather-credit">Weather data by Open-Meteo</p>
    </section>
  );
}
