"use client";

import { useEffect, useState } from "react";
import { bookingLabels, tripToday, type BookingStatus } from "../../../lib/trip-today";
import { isGoogleMapsUrl } from "../../../lib/google-maps";

type Item = { date: string; time: string; title: string; location: string; mapUrl?: string; bookingStatus?: BookingStatus; bookingOwner?: string };

export default function TodayCard({ items, countryCode }: { items: Item[]; countryCode: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const zone = ({ kr: "Asia/Seoul", jp: "Asia/Tokyo", ph: "Asia/Manila", pw: "Pacific/Palau" } as Record<string, string>)[countryCode.toLowerCase()];
  if (!now) return null;
  const { state, days, next } = tripToday(items, now, zone || "Asia/Seoul");
  const needsBooking = items.filter(item => item.bookingStatus === "required").length;
  return <section className="trip-today" aria-labelledby="trip-today-title">
    <div className="trip-today-heading"><span>TODAY’S JOURNEY</span><h2 id="trip-today-title">{state === "before" ? `여행까지 D-${days}` : state === "after" ? "함께한 여행을 돌아봐요" : "오늘의 여행"}</h2><small>{zone ? "여행지 현지 시간 기준" : "한국 시간 기준"}</small></div>
    <div className="trip-today-next">
      {next ? <><p>{state === "before" ? "첫 일정" : "다음 일정"} · {next.date.replaceAll("-", ".")} · {next.time || "시간 미정"}</p><h3>{next.title}</h3><p>{next.location || "장소 미정"}</p><span className={`booking-badge booking-${next.bookingStatus || "unknown"}`}>{bookingLabels[next.bookingStatus || "unknown"]}</span>{next.bookingOwner && <span className="booking-owner">담당 {next.bookingOwner}</span>}</> : <p>{state === "undated" ? "일정 날짜가 정해지면 첫 일정을 안내해 드려요." : state === "after" ? "전체 일정에서 여행 기록을 다시 확인하세요." : "오늘 남은 예정 일정이 없습니다. 시간 미정 일정도 확인해 주세요."}</p>}
      {needsBooking > 0 && <p>출발 전 확인 · 예약이 필요한 일정 {needsBooking}개</p>}
    </div>
    <div className="trip-today-links">{next && (next.mapUrl || next.location) && <a target="_blank" rel="noreferrer" href={isGoogleMapsUrl(next.mapUrl || "") ? next.mapUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.location)}`}>장소·길찾기 ↗</a>}<a href="#journey">전체 일정 보기 ↓</a></div>
  </section>;
}
