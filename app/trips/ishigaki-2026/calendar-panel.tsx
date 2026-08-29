"use client";

import { useState } from "react";

export default function TripCalendarPanel({ tripId }: { tripId: string }) {
  const [message, setMessage] = useState("");

  function addCalendar() {
    const feedUrl = new URL(`/api/calendar/trips/${tripId}/feed.ics`, window.location.origin).toString();
    window.open("https://calendar.google.com/calendar/u/0/r/settings/addbyurl", "_blank", "noopener,noreferrer");
    void navigator.clipboard.writeText(feedUrl)
      .then(() => setMessage("구독 URL을 복사했습니다. 열린 Google Calendar 화면에 붙여넣어 주세요."))
      .catch(() => setMessage(`아래 주소를 복사해 Google Calendar의 'URL로 추가'에 붙여넣으세요. ${feedUrl}`));
  }

  return (
    <section className="trip-calendar-panel" aria-labelledby={`calendar-title-${tripId}`}>
      <div className="trip-calendar-head">
        <div className="trip-calendar-icon" aria-hidden="true">31</div>
        <div><span>SUBSCRIBE</span><h3 id={`calendar-title-${tripId}`}>Google Calendar</h3><p>관리자 승인 없이 이 여행 일정을 읽기 전용으로 추가할 수 있어요.</p></div>
        <span className="trip-calendar-status is-ready">자동 갱신</span>
      </div>
      <div className="trip-calendar-actions">
        <button className="trip-calendar-primary" onClick={addCalendar}>＋ Google Calendar에 추가</button>
        <ol><li>버튼을 누르면 구독 URL이 복사됩니다.</li><li>열린 Google Calendar의 URL 입력란에 붙여넣습니다.</li><li>캘린더 추가를 누르면 완료됩니다.</li></ol>
      </div>
      {message && <p className="trip-calendar-message" role="status">{message}</p>}
    </section>
  );
}
